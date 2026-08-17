// MCP (Model Context Protocol) - Streamable HTTP sunucusu.
//
// AMAC: Fabric'in capability registry'sini DIS MCP istemcilerine (Claude
// Desktop, herhangi bir MCP host'u) `tools/list`/`tools/call` olarak acar.
// A2A "ajanlar arasi delegasyon", MCP "arac erisimi" - ikisi farkli
// semantik ama AYNI mesaj dili (JSON-RPC 2.0) uzerinden konusuyor
// (docs/STANDARTLAR.md S-4).
//
// SPEC KAYNAGI (2026-08-17'de dogrulandi, uydurulmadi):
// https://modelcontextprotocol.io/specification/2025-03-26/basic/transports
// https://modelcontextprotocol.io/specification/2025-03-26/server/tools
//
// KAPSAM KARARI (bilincli, kucultulmus): tam Streamable HTTP spec'i SSE
// akisi + resumability (Last-Event-ID) de tanimliyor. Biz bunu YAZMADIK -
// tek POST'a tek JSON yaniti donuyoruz (spec'in izin verdigi IKI gecerli
// moddan biri: "server MUST either return text/event-stream ... or
// application/json"). Gerekce: dista actigimiz TEK sey risk:"safe" olan
// capability'ler - tanim geregi hizli, salt-okuma isler. Uzun surebilecek
// hicbir sey MCP'den cagrilamiyor, o yuzden SSE/resumability'nin cozdugu
// problem (uzun suren, koparilabilir bir cagriyi guvenle tamamlamak) burada
// yok. GET /mcp bilerek 405 donuyor (spec'in izin verdigi ikinci gecerli
// yanit) - sunucu-baslatilan push YOK.
//
// W3 ILE TUTARLILIK: baglanti (oturum) koptugunda KAYBEDILEN bir sey yok -
// tools/call zaten dispatcher.dispatch() uzerinden yuruyor (W4.5), yani
// sonuc HTTP yaniti yazilamasa bile journal'a duser. Session yalnizca
// "handshake oldu mu" dogrulamasi; dogruluk kaynagi (W3'teki gibi) journal.

import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { capabilityMap } from "./capabilities.ts";
import { Dispatcher } from "./dispatcher.ts";
import type { Intent } from "./types.ts";

const PROTOCOL_VERSION = "2025-03-26";

const PKG_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

// ─── W4.2/W4.3: TEK politika fonksiyonu - hem tools/list hem tools/call ───
// bunu cagirir. Iki ayri kontrol yazmak, biri guncellenip digeri
// unutulunca (W1.9/W1.10'da tam olarak bu oldu - risk kapisi bir yolda
// var, digerinde yoktu) sessiz bir bypass'a donusur.
//
// MCP_DENYLIST: risk:"safe" olsa bile MCP'ye ACIKCA kapali tutulacak
// capability'ler icin genisleme noktasi (savunma katmani - bugun bos).
const MCP_DENYLIST = new Set<string>();

export function isMcpExposed(name: string): boolean {
  const cap = capabilityMap.get(name);
  if (!cap) return false;
  if (MCP_DENYLIST.has(name)) return false;
  return (cap.risk ?? "ask") === "safe";
}

export function mcpExposedNames(): string[] {
  return [...capabilityMap.keys()].filter(isMcpExposed);
}

// ─── W4.4: Yetkilendirme, risk:safe filtresinden AYRI bir katman ───
// risk:"safe" "bu capability zararsiz" demek - "bu baglantiya guveniyoruz"
// demek DEGIL. Token olmadan HERKES tools/list cekip risk:safe olan her
// seyi calistirabilirdi; Tailscale agi kimlik degil (W1.5'teki ayni ilke).
const MCP_TOKEN_PATH = `${process.env.HOME ?? "/data/data/com.termux/files/home"}/fabric/.mcp-token`;
function loadOrCreateMcpToken(): string {
  if (process.env.FABRIC_MCP_TOKEN) return process.env.FABRIC_MCP_TOKEN;
  try {
    if (existsSync(MCP_TOKEN_PATH)) return readFileSync(MCP_TOKEN_PATH, "utf8").trim();
  } catch { /* devam, yeniden uret */ }
  const token = randomBytes(24).toString("hex");
  try { writeFileSync(MCP_TOKEN_PATH, token, "utf8"); } catch { /* diske yazilamadi - yine de bellekte gecerli */ }
  return token;
}
const MCP_TOKEN = loadOrCreateMcpToken();
console.log(`[fabric] MCP gelen istek tokeni: ${MCP_TOKEN_PATH}`);

export function requireMcpAuth(req: import("node:http").IncomingMessage): boolean {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${MCP_TOKEN}`;
}

// ─── W4.7: Origin dogrulamasi (DNS rebinding korumasi, spec'in MUST'u) ───
// Origin BASLIGI YOKSA (beklenen durum - MCP istemcileri tarayici degil,
// dogrudan HTTP istemcisi) gecer. Origin VARSA (bir tarayici sekmesinden
// geliyor demektir) yalnizca kendi origin'imizle eslesirse kabul edilir.
export function originAllowed(req: import("node:http").IncomingMessage, selfUrl: string): boolean {
  const origin = req.headers["origin"];
  if (!origin) return true;
  try {
    return new URL(String(origin)).origin === new URL(selfUrl).origin;
  } catch {
    return false;
  }
}

// ─── Oturum yonetimi (minimal) ───
// Kalici degil - sunucu yeniden baslarsa TUM oturumlar gecersiz olur ve
// istemci yeniden initialize etmek ZORUNDADIR (spec'in tanimladigi 404
// akisi). Bu bilincli: oturum yalnizca "handshake oldu mu" dogrulamasi,
// dogruluk kaynagi journal (W3 ile ayni felsefe, yukaridaki nota bak).
const sessions = new Set<string>();

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: unknown;
  method?: string;
  params?: Record<string, unknown>;
}
type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: unknown; result: unknown }
  | { jsonrpc: "2.0"; id: unknown; error: { code: number; message: string } };

function rpcError(id: unknown, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}
function rpcResult(id: unknown, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

/** capability.risk'e gore honest bir aciklama uretir - olmayan alanlar uydurulmaz. */
function toolDescriptor(name: string) {
  return {
    name,
    description: `AI-OS cihaz capability'si (risk: safe - salt-okuma/zararsiz, onaysiz calisir).`,
    // Capability tipi alan-bazli bir sema tasimiyor (bkz. types.ts) - sahte
    // bir "properties" listesi uydurmak K8 ilkesini (kanitsiz iddia) cignerdi.
    // Durust, gecerli minimum: serbest bir nesne kabul edildigini soyler.
    inputSchema: { type: "object", additionalProperties: true },
  };
}

export interface McpCallResult {
  httpStatus: number;
  body: unknown;
  sessionId?: string;
}

/**
 * Tek bir JSON-RPC istegini isler. server.ts'teki POST /mcp handler'i bunu
 * cagirir - transport (HTTP baslikari, auth, Origin) ORADA, protokol mantigi
 * BURADA. Boylece bu dosya test edilebilir/tasinabilir kalir.
 */
export async function handleMcpRequest(
  body: JsonRpcRequest,
  dispatcher: Dispatcher,
  sessionIdHeader: string | undefined,
): Promise<McpCallResult> {
  const method = String(body.method ?? "");
  const id = body.id;

  if (method === "initialize") {
    const sessionId = randomUUID();
    sessions.add(sessionId);
    return {
      httpStatus: 200,
      sessionId,
      body: rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "AI-OS Fabric", version: PKG_VERSION },
      }),
    };
  }

  // "initialized" bir BILDIRIMDIR (id yok) - spec: yalnizca yanit/bildirim
  // iceren govdeye 202 Accepted, govdesiz donulur.
  if (method === "notifications/initialized") {
    return { httpStatus: 202, body: null };
  }

  // W4.4: initialize DISINDA her seyde gecerli oturum sart.
  if (!sessionIdHeader) {
    return { httpStatus: 400, body: rpcError(id, -32000, "Mcp-Session-Id basligi gerekli") };
  }
  if (!sessions.has(sessionIdHeader)) {
    // Spec: taninmayan/suresi dolmus oturum -> 404, istemci yeniden initialize eder.
    return { httpStatus: 404, body: rpcError(id, -32001, "oturum bulunamadi - yeniden initialize edin") };
  }

  if (method === "tools/list") {
    return { httpStatus: 200, body: rpcResult(id, { tools: mcpExposedNames().map(toolDescriptor) }) };
  }

  if (method === "tools/call") {
    const name = String(body.params?.name ?? "");
    const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

    // W4.2/W4.3/W4.6: AYNI politika fonksiyonu - risk:"ask" ya da
    // MCP_DENYLIST'teki bir capability burada da, tools/list'te de reddedilir.
    // Spec'e uygun: bilinmeyen/izinsiz tool -> PROTOKOL hatasi (-32602),
    // tool'un KENDI calisma hatasi degil (bkz. asagidaki isError:true ile
    // farki - docs/mcp/tools spec'inin "Unknown tool" ornegiyle ayni bicim).
    if (!isMcpExposed(name)) {
      return { httpStatus: 200, body: rpcError(id, -32602, `Bilinmeyen veya izinsiz tool: ${name}`) };
    }

    // W4.5: dogrudan capability.execute() DEGIL - dispatcher.dispatch()
    // uzerinden. Boylece sonuc journal'a duser (task.created/completed),
    // AKTİF sekmesinde gorunur, ve W1.3'un risk kapisi IKINCI bir savunma
    // katmani olarak burada da calisir (registry drift olsa bile).
    const r = await dispatcher.dispatch({
      type: name,
      payload: args,
      origin: { source: "mcp", raw: `MCP tools/call: ${name}`, by: "deterministic", envelopeId: "mcp:" + randomUUID() },
    } as Intent);

    const deadline = Date.now() + 15000; // risk:safe = tanimi geregi hizli salt-okuma
    while (Date.now() < deadline) {
      const t = dispatcher.getState().tasks[r.taskId];
      if (t && ["completed", "failed", "cancelled", "interrupted"].includes(t.status)) {
        const live = dispatcher.getLiveResult(r.taskId);
        const data = live !== undefined ? live : t.result;
        const isError = t.status !== "completed";
        return {
          httpStatus: 200,
          body: rpcResult(id, {
            content: [{ type: "text", text: isError ? String(t.error ?? "bilinmeyen hata") : JSON.stringify(data) }],
            isError,
          }),
        };
      }
      await new Promise((s) => setTimeout(s, 40));
    }
    return {
      httpStatus: 200,
      body: rpcResult(id, { content: [{ type: "text", text: "zaman asimi (is arka planda journal'a yaziliyor olabilir)" }], isError: true }),
    };
  }

  return { httpStatus: 200, body: rpcError(id, -32601, `desteklenmeyen metot: ${method}`) };
}
