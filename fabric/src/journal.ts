// Append-only SQLite WAL event journal.
// Node 22.5+ yerlesik node:sqlite kullanir - harici bagimlilik yok.
// Journal, Fabric'in TEK gercek kaynagidir (source of truth). Bellek-ici
// state sadece bu journal'in bir izdusumudur (projection) - her zaman
// journal'dan yeniden insa edilebilir (crash recovery).

import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import type { FabricEvent } from "./types.ts";

export class Journal {
  private db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode = WAL;`);
    this.db.exec(`PRAGMA synchronous = NORMAL;`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        correlationId TEXT NOT NULL,
        causationId TEXT,
        payload TEXT NOT NULL,
        idempotencyKey TEXT
      );
    `);
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_events_idempotency
      ON events(idempotencyKey) WHERE idempotencyKey IS NOT NULL;
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_events_correlation ON events(correlationId);`);
  }

  /** Idempotency key daha once kullanildiysa o event'i dondurur, yoksa null. */
  findByIdempotencyKey(key: string): FabricEvent | null {
    const row = this.db
      .prepare(`SELECT * FROM events WHERE idempotencyKey = ? LIMIT 1`)
      .get(key) as Record<string, unknown> | undefined;
    if (!row) return null;
    return this.rowToEvent(row);
  }

  append(event: Omit<FabricEvent, "seq" | "id" | "ts"> & { id?: string; ts?: number }): FabricEvent {
    const id = event.id ?? randomUUID();
    const ts = event.ts ?? Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO events (id, ts, type, correlationId, causationId, payload, idempotencyKey)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      id,
      ts,
      event.type,
      event.correlationId,
      event.causationId ?? null,
      JSON.stringify(event.payload ?? null),
      event.idempotencyKey ?? null,
    );
    return {
      seq: Number(info.lastInsertRowid),
      id,
      ts,
      type: event.type,
      correlationId: event.correlationId,
      causationId: event.causationId ?? null,
      payload: event.payload ?? null,
      idempotencyKey: event.idempotencyKey ?? null,
    };
  }

  /** Baslangicta (crash recovery) tum event'leri sira ile okur. */
  replayAll(): FabricEvent[] {
    const rows = this.db.prepare(`SELECT * FROM events ORDER BY seq ASC`).all() as Record<
      string,
      unknown
    >[];
    return rows.map((r) => this.rowToEvent(r));
  }

  since(seq: number, limit = 200): FabricEvent[] {
    const rows = this.db
      .prepare(`SELECT * FROM events WHERE seq > ? ORDER BY seq ASC LIMIT ?`)
      .all(seq, limit) as Record<string, unknown>[];
    return rows.map((r) => this.rowToEvent(r));
  }

  private rowToEvent(row: Record<string, unknown>): FabricEvent {
    return {
      seq: row.seq as number,
      id: row.id as string,
      ts: row.ts as number,
      type: row.type as string,
      correlationId: row.correlationId as string,
      causationId: (row.causationId as string | null) ?? null,
      payload: JSON.parse(row.payload as string),
      idempotencyKey: (row.idempotencyKey as string | null) ?? null,
    };
  }
}
