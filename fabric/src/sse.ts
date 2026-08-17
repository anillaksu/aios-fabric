// Basit SSE (Server-Sent Events) hub. NATS/Redis/Kafka yok - Node'un kendi
// event-emitter'i + acik HTTP response'lar yeterli (spec'in 9. maddesi).

import type { ServerResponse } from "node:http";
import type { FabricEvent } from "./types.ts";

export class SseHub {
  private clients = new Set<ServerResponse>();

  // Sunucu ici dinleyiciler (otomasyon motoru buraya baglanir). broadcast()
  // sistemdeki TUM event'lerin gectigi tek nokta oldugu icin dogru kanca burasi.
  private listeners: ((event: FabricEvent) => void)[] = [];

  onEvent(fn: (event: FabricEvent) => void) {
    this.listeners.push(fn);
  }

  add(res: ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    res.write(`retry: 2000\n\n`);
    this.clients.add(res);
    const keepalive = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        clearInterval(keepalive);
      }
    }, 15000);
    res.on("close", () => {
      clearInterval(keepalive);
      this.clients.delete(res);
    });
  }

  broadcast(event: FabricEvent) {
    // Once yerel dinleyiciler. Bir dinleyicinin patlamasi SSE yayinini
    // engellememeli - arayuz her halukarda guncellenmeli.
    for (const fn of this.listeners) {
      try { fn(event); } catch (err) { console.warn("[sse] dinleyici hatasi:", err); }
    }

    const line = `id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of this.clients) {
      try {
        res.write(line);
      } catch {
        this.clients.delete(res);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}
