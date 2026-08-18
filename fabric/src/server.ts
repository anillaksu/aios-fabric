// HTTP giris noktasi. Kural: hicbir route agent/model cagrisini BEKLEMEZ
// (POST /intent ve POST /a2a/tasks hemen doner, sonuc SSE'den gelir).

import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Journal } from "./journal.ts";
import { replayToState, markInterrupted } from "./state.ts";
import { Dispatcher } from "./dispatcher.ts";
import { SseHub } from "./sse.ts";
import { A2AHub, toWireState, toWireRole } from "./a2a.ts";
import { capabilities, capabilityMap, setA2AHub } from "./capabilities.ts";
import { getAppIcon, isNetworkIconsEnabled, setNetworkIcons } from "./appicons.ts";
import { isDebugTrajectoryEnabled, setDebugTrajectory } from "./debugtrajectory.ts";
import { listRules, addRule, removeRule, toggleRule, makeAutomationListener } from "./automations.ts";
import { allKits, kitsOf, addKit, removeKit } from "./kits.ts";
import { createEnvelope, makeEnvelopeRecorder } from "./envelope.ts";
import { UI_HTML } from "./ui.ts";
import { handleMcpRequest, requireMcpAuth, originAllowed } from "./mcp.ts";
import { isReadExposed } from "./read-policy.ts";
import type { Intent } from "./types.ts";
import { logErr } from "./log.ts";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const AIOS_HTML_PATH = PUBLIC_DIR + "aios.html";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
};

/** public/ altindaki statik dosyalari sunar. Yol kacisi (..) engellenir. */
function serveStatic(pathname: string, res: import("node:http").ServerResponse): boolean {
  const rel = pathname.replace(/^\/+/, "");
  if (!rel || rel.includes("..")) return false;
  const full = PUBLIC_DIR + rel;
  if (!full.startsWith(PUBLIC_DIR)) return false;
  let data: Buffer;
  try {
    data = readFileSync(full);
  } catch {
    // BILINCLI istisna (sessiz catch denetimi, 2026-08-18): bu 404'un
    // KENDISI - her favicon/DevTools/bot istegi buraya duser. Loglamak
    // gercek sinyali (dosya sistemi/izin hatasi) gurultuye (rutin 404)
    // gomerdi. Caller zaten uygun HTTP durumunu donuyor - sessiz DEGIL,
    // yalnizca burada degil.
    return false;
  }
  const ext = rel.slice(rel.lastIndexOf("."));
  const headers: Record<string, string> = { "Content-Type": MIME[ext] ?? "application/octet-stream" };
  // Framework7 gibi surumlu varliklar uzun, kabuk dosyalari kisa onbelleklenir
  headers["Cache-Control"] = rel.startsWith("vendor/") ? "public, max-age=604800" : "no-cache";
  res.writeHead(200, headers);
  res.end(data);
  return true;
}

const PORT = Number(process.env.FABRIC_PORT ?? 9300);
const HOME = process.env.HOME ?? "/data/data/com.termux/files/home";
const JOURNAL_PATH = `${HOME}/fabric-journal.db`;
const ARTIFACTS_PATH = `${HOME}/fabric-artifacts.json`;
const APPLICATIONS_PATH = `${HOME}/fabric-applications.json`;
// Agent Card'da disariya duyurulan URL - uzak peer'lar (PC coding agent vb.)
// bize BU adresten geri yazacak, o yuzden 127.0.0.1 degil Tailscale/LAN
// adresi olmali. FABRIC_SELF_URL env ile override edilebilir (baska bir
// cihazda - PC'de - calistirirken).
const SELF_URL = process.env.FABRIC_SELF_URL ?? `http://100.75.177.88:${PORT}`;

// ─── A2A GELEN ISTEK KIMLIK DOGRULAMASI (2026-08-17, W1.5) ───
// Tailscale agi kimlik dogrulamasi DEGIL - "tailnet'te olan herkes" ile
// "guvendigimiz belirli bir peer" arasindaki tek fark bu token. Env
// verilmemisse HER baslangicta yeni bir token URETILIR ve diske yazilir
// (fail-closed: token yoksa varsayilan "acik kapi" degil, "kimse giremez"
// olsun - operator dosyayi okuyup peer'a taniyarak acikca yetki verir).
const A2A_TOKEN_PATH = `${HOME}/fabric/.a2a-token`;
function loadOrCreateA2AToken(): string {
  if (process.env.FABRIC_A2A_TOKEN) return process.env.FABRIC_A2A_TOKEN;
  try {
    if (existsSync(A2A_TOKEN_PATH)) return readFileSync(A2A_TOKEN_PATH, "utf8").trim();
  } catch (err) { logErr("server:a2aTokenLoad", err); /* devam, yeniden uret */ }
  const token = randomBytes(24).toString("hex");
  try { writeFileSync(A2A_TOKEN_PATH, token, "utf8"); } catch (err) { logErr("server:a2aTokenSave", err); }
  return token;
}
const A2A_TOKEN = loadOrCreateA2AToken();
console.log(`[fabric] A2A gelen istek tokeni: ${A2A_TOKEN_PATH} (peer'a ekleyecegin deger)`);

/** POST "/" (A2A JSON-RPC) ve POST /a2a/tasks icin zorunlu Bearer token. */
function requireA2AAuth(req: import("node:http").IncomingMessage): boolean {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${A2A_TOKEN}`;
}

// ---------- baslangic: journal'i oynat, crash recovery uygula ----------
const journal = new Journal(JOURNAL_PATH);
const replayedEvents = journal.replayAll();
let bootState = replayToState(replayedEvents);
const { state: recoveredState, interruptedIds } = markInterrupted(bootState);
bootState = recoveredState;
if (interruptedIds.length > 0) {
  console.log(`[fabric] crash-recovery: ${interruptedIds.length} yarim task "interrupted" olarak isaretlendi`);
}
console.log(`[fabric] journal'dan ${replayedEvents.length} event oynatildi, state yeniden insa edildi`);

const sse = new SseHub();
const dispatcher = new Dispatcher(journal, bootState, sse);

// ---------- Otomasyon motoru (2026-08-16'da eklendi) ----------
// Kurallar journal akisini dinler ve eslesme olunca bir capability calistirir.
// Dongu korumasi automations.ts icinde (automation.* event'leri tetiklemez +
// kural basina cooldown + zincir derinligi kesici).
sse.onEvent(
  makeAutomationListener(
    // origin GECIRILIYOR: otomasyonun tetikledigi is AKTİF sekmesinde
    // "otomasyon kurali tetikledi" diye gorunsun. Denetimde bu eksikti,
    // kural tetikli isler kaynaksiz ("sistem ici") cikiyordu.
    //
    // correlationId "automation-chain:<derinlik>:<uuid>" olarak KASITLI
    // kodlanir - dispatcher bunu task.created/completed/failed'a AYNEN
    // tasir, automations.ts'teki zincir derinligi kesicisi bir sonraki
    // olayda derinligi BURADAN okur (W1.4).
    (type, payload, ruleName, depth) => {
      void dispatcher.dispatch({
        type, payload,
        correlationId: `automation-chain:${depth}:${randomUUID()}`,
        origin: { source: "automation", raw: ruleName, by: "deterministic", envelopeId: "automation" },
      } as never);
    },
    (type, payload) => {
      // Ayni sebeple sabit "automation" degil: her tetiklenme kendi akisi.
      const ev = journal.append({ type, correlationId: "automation:" + randomUUID(), causationId: null, payload, idempotencyKey: null });
      sse.broadcast(ev);
    },
  ),
);
// ─── ASENKRON TAMAMLANMA BILDIRIMI (2026-08-17, W3.2) ───
// `wait:false` ile gonderilen bir is arka planda biter ama kimse onu
// BEKLEMIYORDU - kullanici telefonu kilitleyip actiginda "ne oldu?" sorusuna
// cevap yoktu, AKTİF sekmesini kendisi acip bakmasi gerekiyordu. Bu Set,
// "biten is icin bildirim bekleniyor" taskId'lerini tutar; task.completed/
// task.failed geldiginde bir notification.send tetiklenir ve is Set'ten cikar.
const notifyOnComplete = new Set<string>();
sse.onEvent((event) => {
  if (event.type !== "task.completed" && event.type !== "task.failed") return;
  const taskId = (event.payload as { taskId?: string } | null)?.taskId;
  if (!taskId || !notifyOnComplete.has(taskId)) return;
  notifyOnComplete.delete(taskId);
  const t = dispatcher.getState().tasks[taskId];
  if (!t) return;
  const label = t.goal || t.type;
  const title = t.status === "completed" ? "İş tamamlandı" : "İş başarısız";
  const content = t.status === "failed" && t.error
    ? `${label}: ${String(t.error).slice(0, 160)}`
    : label;
  // Dispatcher uzerinden gonderiliyor (dogrudan capability.execute() degil) -
  // journal'a duser, DevTools'ta gorunur, ve notification.send zaten
  // risk:"notify" oldugu icin W1.3'un onay kapisina takilmaz.
  void dispatcher.dispatch({
    type: "notification.send",
    payload: { title, content },
    origin: { source: "system", raw: "asenkron is tamamlandi bildirimi", by: "deterministic", envelopeId: "async-notify" },
  } as never);
});

// Zarf kaydedicisi: her giris asamasi journal a duser (Intent DevTools bunu okur).
const envelopes = makeEnvelopeRecorder(
  (e) => journal.append(e),
  (e) => sse.broadcast(e),
);

const a2a = new A2AHub(SELF_URL, journal, dispatcher, (task) => {
  // A2A durum degisikligini de FabricEvent akisina yayinla (UI tek yerden izlesin)
  sse.broadcast({
    seq: -1,
    id: task.id,
    ts: Date.now(),
    type: `a2a.task.${task.state}`,
    correlationId: task.contextId,
    causationId: null,
    payload: task,
    idempotencyKey: null,
  });
});
// a2a.delegate capability'si bu hub'i surec ici cagirir (self-fetch degil, bkz. capabilities.ts).
setA2AHub(a2a);

/**
 * Journal'a yazilacak KOPYADA hassas alanlari maskeler.
 * dispatcher.ts'teki redactFields ile ayni kural: orasi task.created'i,
 * burasi zarf olaylarini (intent.understood / intent.dispatched) korur.
 */
function redactFieldsForJournal(
  payload: Record<string, unknown>,
  fields: string[] | undefined,
): Record<string, unknown> {
  if (!fields || !fields.length) return payload;
  const out: Record<string, unknown> = { ...payload };
  for (const f of fields) {
    if (!(f in out)) continue;
    const v = out[f];
    out[f] = typeof v === "string" ? v.length + " karakter"
           : Array.isArray(v) ? v.length + " kayit"
           : v == null ? v : "…";
  }
  return out;
}

// CORS (2026-08-17, W1.5): kaldirildi. UI ayni origin'den yukleniyor (bu
// sunucu HEM sayfayi HEM API'yi ayni portta sunuyor) - tarayicinin ayni-
// kaynak fetch'i CORS baslikina hic ihtiyac duymaz. A2A peer'lari da
// tarayici degil (Node fetch) - CORS zaten yalnizca TARAYICILARIN uydugu
// bir sozlesme, sunucudan sunucuya cagrilari kisitlamaz. Yani wildcard hic
// gercek bir koruma saglamiyordu; kaldirilmasi hicbir mesru kullanimi
// bozmuyor, "*" ile disari acik gorunmeyi bitiriyor.
function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  const data = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(data);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SELF_URL);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {});
    res.end();
    return;
  }

  try {
    // ---------- A2A v1.0 JSON-RPC (2026-08-17) ----------
    // Fabric'in A2A'si ozel bir REST bicimindeydi (POST /a2a/tasks). Calisiyordu,
    // ama YALNIZCA kendi istemcimizle: PC'deki Hermes standart A2A v1.0 konusuyor
    // ve Agent Card'daki `url`e JSON-RPC POST atiyor -> kokte POST karsiligi
    // olmadigi icin HTTP 404 aliyordu.
    //
    // Protokolun butun anlami baska ajanlarla konusabilmek; o yuzden dogru
    // duzeltme istemciyi degil BIZI standarda uydurmak. Bu uc eklendikten sonra
    // Fabric yalnizca Hermes'le degil herhangi bir A2A ajaniyla (LangChain,
    // CrewAI, Google ADK...) konusabilir. Eski REST ucu de duruyor.
    if (url.pathname === "/" && req.method === "POST") {
      // W1.5: bu uc DISARIDAN gelen A2A cagrilarini kabul ediyor - token
      // zorunlu. Tailscale agi burada "kimlik" degil.
      if (!requireA2AAuth(req)) {
        json(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "gecersiz veya eksik Bearer token" } });
        return;
      }
      const body = JSON.parse((await readBody(req)) || "{}") as {
        jsonrpc?: string; id?: unknown; method?: string;
        params?: {
          message?: { parts?: { text?: string }[]; contextId?: string; messageId?: string };
          taskId?: string; id?: string;
        };
      };
      const rpcId = body.id ?? null;
      const method = String(body.method ?? "");

      // W2.4: task lifecycle - onceden yalnizca SendMessage vardi, GetTask/
      // ListTasks/CancelTask -32601 (desteklenmiyor) donuyordu. Bu, "uzun
      // isin yeniden baglanmasi yok" bulgusunun dogrudan sebebiydi.
      const wireTask = (t: ReturnType<typeof a2a.getTask>) => {
        if (!t) return null;
        const last = t.history[t.history.length - 1];
        const reply = last?.parts?.[0]?.text ?? t.error ?? "";
        return {
          id: t.id,
          contextId: t.contextId,
          status: {
            state: toWireState(t.state),
            message: { role: toWireRole("agent"), parts: [{ text: reply, mediaType: "text/plain" }], messageId: t.id },
          },
          artifacts: [{ parts: [{ text: reply, mediaType: "text/plain" }] }],
        };
      };

      if (/^GetTask$/i.test(method)) {
        const t = a2a.getTask(String(body.params?.taskId ?? body.params?.id ?? ""));
        const wire = wireTask(t);
        if (!wire) { json(res, 200, { jsonrpc: "2.0", id: rpcId, error: { code: -32001, message: "gorev bulunamadi" } }); return; }
        json(res, 200, { jsonrpc: "2.0", id: rpcId, result: { task: wire } });
        return;
      }
      if (/^ListTasks$/i.test(method)) {
        json(res, 200, { jsonrpc: "2.0", id: rpcId, result: { tasks: a2a.listTasks().map(wireTask) } });
        return;
      }
      if (/^CancelTask$/i.test(method)) {
        const r = a2a.cancelTask(String(body.params?.taskId ?? body.params?.id ?? ""));
        if (!r.ok) { json(res, 200, { jsonrpc: "2.0", id: rpcId, error: { code: -32002, message: r.error ?? "iptal edilemedi" } }); return; }
        json(res, 200, { jsonrpc: "2.0", id: rpcId, result: { task: wireTask(a2a.getTask(String(body.params?.taskId ?? body.params?.id ?? ""))) } });
        return;
      }
      if (!/^(SendMessage|message\/send)$/i.test(method)) {
        json(res, 200, { jsonrpc: "2.0", id: rpcId, error: { code: -32601, message: `desteklenmeyen metot: ${method}` } });
        return;
      }
      const parts = body.params?.message?.parts ?? [];
      const text = parts.map((p) => p?.text ?? "").filter(Boolean).join("\n").trim();
      if (!text) {
        json(res, 200, { jsonrpc: "2.0", id: rpcId, error: { code: -32602, message: "metin parcasi yok" } });
        return;
      }

      // Ayni yol: gorev Fabric'in A2A hub'ina girer, o da telefonun KENDI
      // Hermes gateway'ine (8642) devreder - yani karsi tarafta gercek model var.
      // B-7: JSON-RPC istegindeki messageId TASINIR - ayni cagiri ikinci kez
      // (istemci retry'i) ayni messageId ile gelirse createInboundTask var
      // olan gorevi doner, capability'yi TEKRAR CALISTIRMAZ.
      const task = a2a.createInboundTask(text, body.params?.message?.contextId, body.params?.message?.messageId);
      const deadline = Date.now() + 170000;   // peer timeout'undan (180s) once bitir
      while (Date.now() < deadline) {
        const cur = a2a.getTask(task.id);
        if (cur && (cur.state === "completed" || cur.state === "failed")) {
          json(res, 200, { jsonrpc: "2.0", id: rpcId, result: { task: wireTask(cur) } });
          return;
        }
        await new Promise((s) => setTimeout(s, 300));
      }
      json(res, 200, { jsonrpc: "2.0", id: rpcId, error: { code: -32000, message: "gorev zaman asimina ugradi" } });
      return;
    }

    // ---------- AI-OS v2 (asil arayuz) ----------
    if (url.pathname === "/" && req.method === "GET") {
      // Her istekte diskten okunur - UI'yi duzenleyip sadece sayfayi
      // yenilemek yeterli, daemon'i yeniden baslatmak gerekmez.
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(readFileSync(AIOS_HTML_PATH, "utf8"));
      return;
    }

    // ---------- Statik varliklar (Framework7, PWA manifest/sw/ikonlar) ----------
    if (req.method === "GET" && /^\/(vendor|icons|css|js)\//.test(url.pathname)) {
      if (serveStatic(url.pathname, res)) return;
    }
    if (req.method === "GET" && (url.pathname === "/manifest.json" || url.pathname === "/sw.js")) {
      if (serveStatic(url.pathname, res)) return;
    }

    // ---------- Artefakt senkronu ----------
    // Artefaktlar tarayici deposunda yasiyordu; ne yedegi vardi ne de
    // sunucudan gorulebiliyordu (hata incelemesi imkansizdi). Istemci her
    // degisiklikte buraya yaziyor: hem yedek, hem gozlemlenebilirlik.
    if (url.pathname === "/artifacts" && req.method === "GET") {
      try {
        json(res, 200, JSON.parse(readFileSync(ARTIFACTS_PATH, "utf8")));
      } catch (err) {
        // M-9: bu artik BIRINCIL kaynak - sessiz [] donusu istemciye "hic
        // artefakt yok" gibi gorunur. Dosya yoksa (ilk kurulum) bu dogru,
        // ama BOZUKSA (parse hatasi) sessiz kalirsa veri kaybi gibi
        // ALGILANIR - loglanmasi sart.
        logErr("server:artifactsRead", err);
        json(res, 200, []);
      }
      return;
    }
    if (url.pathname === "/artifacts" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const list = JSON.parse(body || "[]");
        if (!Array.isArray(list)) throw new Error("dizi bekleniyor");
        writeFileSync(ARTIFACTS_PATH, JSON.stringify(list, null, 1), "utf8");
        json(res, 200, { ok: true, count: list.length });
      } catch (err) {
        json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // ---------- Application launcher senkronu (W6.G) ----------
    // ApplicationEntry artifact'in kopyasi DEGIL: yalnizca kalici launcher
    // identity'si. Ayrı dosya, mevcut /artifacts dizi sözleşmesini bozmaz.
    if (url.pathname === "/applications" && req.method === "GET") {
      try {
        json(res, 200, JSON.parse(readFileSync(APPLICATIONS_PATH, "utf8")));
      } catch (err) {
        logErr("server:applicationsRead", err);
        json(res, 200, []);
      }
      return;
    }
    if (url.pathname === "/applications" && req.method === "POST") {
      const body = await readBody(req);
      try {
        const list = JSON.parse(body || "[]");
        if (!Array.isArray(list)) throw new Error("dizi bekleniyor");
        writeFileSync(APPLICATIONS_PATH, JSON.stringify(list, null, 1), "utf8");
        json(res, 200, { ok: true, count: list.length });
      } catch (err) {
        json(res, 400, { ok: false, error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // ---------- Ikon ayari: ag uzerinden ikon cekme ac/kapa ----------
    // Kullanici bilgilendirilmis onayla actigi icin var; istedigi an kapatabilir.
    if (url.pathname === "/appicon-settings" && req.method === "GET") {
      json(res, 200, { network: isNetworkIconsEnabled() });
      return;
    }
    if (url.pathname === "/appicon-settings" && req.method === "POST") {
      const body = await readBody(req);
      const { network } = JSON.parse(body || "{}") as { network?: boolean };
      setNetworkIcons(network === true);
      json(res, 200, { ok: true, network: isNetworkIconsEnabled() });
      return;
    }

    // ---------- Ham prompt/yanit kaydi ac-kapa (2026-08-18, owner istegi) ----------
    // KASITLI OLARAK bir capability DEGIL - yalnizca bu HTTP ucundan (insan
    // arayuzu, Control Center) degistirilebilir. LLM/A2A/MCP bu anahtara HIC
    // erisemez - gercek kullanici mesajlarini diske yazan bir ayari model
    // kendi karariyla acamaz (bkz. debugtrajectory.ts).
    if (url.pathname === "/debug-trajectory" && req.method === "GET") {
      json(res, 200, { on: isDebugTrajectoryEnabled() });
      return;
    }
    if (url.pathname === "/debug-trajectory" && req.method === "POST") {
      const body = await readBody(req);
      const { on } = JSON.parse(body || "{}") as { on?: boolean };
      setDebugTrajectory(on === true);
      json(res, 200, { ok: true, on: isDebugTrajectoryEnabled() });
      return;
    }

    // ---------- Istemci hatasi bildirimi (2026-08-18, sessiz catch denetimi) ----------
    // Capability DEGIL. Onceden istemcideki cogu catch blogu HICBIR YERE
    // yazmadan hatayi yutuyordu - prompt-cache'in ilk canli testinde
    // TAM BOYLE bir sessiz hata (putCached basarisiz oldu, kimse gormedi)
    // yuzunden "onbellek calismiyor" teshisi konsol erisimi OLMADAN
    // yapilamadi. Artik client-log.js:logClientError() hem console.error
    // hem burayi (journal) kullanir - konsola erisim olmasa bile
    // gorulebilir.
    if (url.pathname === "/client-error" && req.method === "POST") {
      const body = await readBody(req);
      const { context, message } = JSON.parse(body || "{}") as { context?: string; message?: string };
      journal.append({
        type: "client.error",
        correlationId: randomUUID(),
        causationId: null,
        payload: { context: context || "bilinmeyen", message: (message || "").slice(0, 300) },
        idempotencyKey: null,
      });
      json(res, 200, { ok: true });
      return;
    }

    // ---------- W6.L: onbellek isabet olcumu (kabul kriteri: "isabet journal'a dusuyor") ----------
    // Capability DEGIL - dispatcher'i atlamiyor, yalnizca gozlemlenebilirlik
    // icin dogrudan journal'a hafif bir olay yazar. Hash disinda hicbir
    // hassas veri (prompt metni vb.) TASINMAZ.
    if (url.pathname === "/prompt-cache-hit" && req.method === "POST") {
      const body = await readBody(req);
      const { key } = JSON.parse(body || "{}") as { key?: string };
      if (key) {
        journal.append({
          type: "prompt.cache.hit",
          correlationId: key,
          causationId: null,
          payload: { key },
          idempotencyKey: null,
        });
      }
      json(res, 200, { ok: true });
      return;
    }

    // ---------- Gercek uygulama ikonlari (APK'dan cikarilir, onbellekli) ----------
    const iconMatch = url.pathname.match(/^\/appicon\/([a-zA-Z0-9_.]+)$/);
    if (iconMatch && req.method === "GET") {
      const ico = await getAppIcon(iconMatch[1]);
      if (!ico) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end('{"error":"ikon yok"}');
        return;
      }
      res.writeHead(200, { "Content-Type": ico.type, "Cache-Control": "public, max-age=604800" });
      res.end(ico.data);
      return;
    }

    // NOT (2026-08-16): `/screens` ucu ve `src/screens.ts` KALDIRILDI.
    // Ekran kayit defteri istemciye tasinmisti (public/js/screens.js); sunucu
    // surumunu hicbir sey cagirmiyordu (denetlendi: istemcide tek bir /screens
    // fetch'i yok). Iki kayit defterini paralel tutmak, birini guncelleyip
    // otekini unutma riskinden baska bir sey uretmiyordu.

    // ---------- UNIVERSAL INTENT ENVELOPE ----------
    // TEK GIRIS KAPISI. Ses, paylas menusu, Hermes, UI butonu, A2A peer,
    // sensor - hepsi buraya ayni govdeyle gelir:
    //   { source, raw, understood?: { type, payload, by } }
    // `understood` verilmisse dogrudan goreve baglanir; verilmemisse zarf
    // "anlasilmadi" olarak kaydedilir (ve cagiran taraf LLM'e sorabilir).
    // Her asama journal'a duser -> Intent DevTools bunu okur.
    if (url.pathname === "/envelope" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as {
        source?: string; raw?: string; correlationId?: string; wait?: boolean; timeoutMs?: number;
        understood?: { type?: string; payload?: Record<string, unknown>; by?: string };
      };
      const env = createEnvelope({
        source: (body.source as never) ?? "ui",
        raw: body.raw ?? "",
        correlationId: body.correlationId,
      });
      envelopes.received(env);

      const u = body.understood;
      if (!u?.type) {
        envelopes.rejected(env, "anlasilmadi: understood.type verilmedi");
        json(res, 200, { ok: false, envelopeId: env.id, error: "understood.type gerekli" });
        return;
      }
      // Yurutmeye GERCEK payload gider; journal'a (intent.understood /
      // intent.dispatched) hassas alanlari redakte edilmis kopya duser.
      // Denetimin 2. turunda burasi da sizdiriyordu: panoya yazilan parola
      // task.created'in yani sira BU iki olayda da diske gidiyordu.
      const realPayload = u.payload ?? {};
      const cap = capabilityMap.get(u.type);
      env.understood = {
        type: u.type,
        payload: redactFieldsForJournal(realPayload, cap?.sensitiveFields),
        by: (u.by as never) ?? "deterministic",
      };
      envelopes.understood(env);

      if (!capabilityMap.has(u.type)) {
        envelopes.rejected(env, `bilinmeyen capability: ${u.type}`);
        json(res, 200, { ok: false, envelopeId: env.id, error: `bilinmeyen capability: ${u.type}` });
        return;
      }
      const r = await dispatcher.dispatch({
        type: u.type,
        payload: realPayload,   // yurutmeye GERCEK deger gider (journal'daki kopya redakte)
        correlationId: env.correlationId,
        // Gorev karti "HEDEF / NE ANLADI / KIM YAPIYOR" alanlarini buradan doldurur.
        origin: { source: env.source, raw: env.raw, by: env.understood.by, envelopeId: env.id },
      } as Intent);
      env.taskId = r.taskId;
      envelopes.dispatched(env);

      // W3.2: wait:false ile gonderilen is kimse tarafindan BEKLENMIYOR -
      // bitince bildirim gerekir (bkz. notifyOnComplete listener'i yukarida).
      if (body.wait === false) notifyOnComplete.add(r.taskId);

      // `wait` verilirse sonucu BEKLERIZ. Neden gerekli: arayuz bazi
      // eylemlerin ciktisini ANINDA gostermek zorunda (script.run ciktisi,
      // pil yuzdesi...). Bu olmadan UI'nin /read'i dogrudan cagirmasi
      // gerekirdi ve o yol dispatcher'i ATLADIGI icin gorev hic olusmuyor,
      // is AKTİF sekmesinde ve DevTools'ta gorunmuyordu.
      if (body.wait !== false) {
        const deadline = Date.now() + Math.min(Number(body.timeoutMs ?? 30000), 120000);
        while (Date.now() < deadline) {
          const t = dispatcher.getState().tasks[r.taskId];
          if (t && ["completed", "failed", "cancelled", "interrupted"].includes(t.status)) {
            // Hassas ciktilar journal'a REDAKTE yaziliyor (bkz. dispatcher).
            // Arayuze gercek degeri buradan, bellekten veriyoruz: kabuk
            // ciktisi/model yaniti ekranda tam gorunsun ama diske dusmesin.
            const live = dispatcher.getLiveResult(r.taskId);
            json(res, 200, {
              ok: t.status === "completed",
              envelopeId: env.id, taskId: r.taskId,
              data: live !== undefined ? live : t.result,
              error: t.error,
            });
            return;
          }
          await new Promise((s) => setTimeout(s, 40));
        }
        json(res, 200, { ok: false, envelopeId: env.id, taskId: r.taskId, error: "zaman asimi (is arka planda devam ediyor)" });
        return;
      }
      json(res, 200, { ok: true, envelopeId: env.id, taskId: r.taskId, class: r.class });
      return;
    }

    // ---------- KIT DEFTERI ----------
    // Sistemin genisleme yuzeyi: yeni bir belge formati, yeni bir deeplink
    // hedefi ya da yeni bir intent eklemek KOD DEGISIKLIGI GEREKTIRMEZ.
    // Buraya bir nesne POST etmek yeter; capability, prompt ve arayuz onu
    // kendiliginden ogrenir.
    if (url.pathname === "/kits" && req.method === "GET") {
      const kind = url.searchParams.get("kind");
      const list = (kind ? kitsOf(kind as never) : allKits()).map(({ renderer, ...k }) => k);
      json(res, 200, list);
      return;
    }
    if (url.pathname === "/kits" && req.method === "POST") {
      json(res, 200, addKit(JSON.parse((await readBody(req)) || "{}")));
      return;
    }
    if (url.pathname === "/kits/remove" && req.method === "POST") {
      const { kind, id } = JSON.parse((await readBody(req)) || "{}") as { kind?: string; id?: string };
      json(res, 200, kind && id ? removeKit(kind, id) : { ok: false, error: "kind ve id gerekli" });
      return;
    }

    // ---------- Otomasyon kurallari ----------
    if (url.pathname === "/automations" && req.method === "GET") {
      json(res, 200, listRules());
      return;
    }
    if (url.pathname === "/automations" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}");
      // Kural yalnizca GERCEK bir capability'yi cagirabilir.
      if (body?.then?.type && !capabilityMap.has(String(body.then.type))) {
        json(res, 400, { ok: false, error: `bilinmeyen capability: ${body.then.type}` });
        return;
      }
      // W1.4: kural, capability'nin azami riskini asamaz. "ask" zaten
      // dispatcher'da kosulsuz reddediliyor (W1.3) - onu hedefleyen bir
      // kural kurmak, her tetiklenmede sessizce basarisiz olan otomasyon
      // biriktirmekten baska bir sey yapmaz. Erken ve acik reddet.
      const targetCap = body?.then?.type ? capabilityMap.get(String(body.then.type)) : undefined;
      if (targetCap && (targetCap.risk ?? "ask") === "ask") {
        json(res, 400, { ok: false, error: `"${body.then.type}" onay gerektirir (risk: ask) - otomasyon kurali hedefi olamaz` });
        return;
      }
      json(res, 200, addRule(body));
      return;
    }
    if (url.pathname === "/automations/toggle" && req.method === "POST") {
      const { id, enabled } = JSON.parse((await readBody(req)) || "{}") as { id?: string; enabled?: boolean };
      json(res, 200, id ? toggleRule(id, enabled !== false) : { ok: false, error: "id gerekli" });
      return;
    }
    if (url.pathname === "/automations/remove" && req.method === "POST") {
      const { id } = JSON.parse((await readBody(req)) || "{}") as { id?: string };
      json(res, 200, id ? removeRule(id) : { ok: false, error: "id gerekli" });
      return;
    }

    // ---------- Gorev iptal / yeniden dene (2026-08-16'da eklendi) ----------
    // Onceden asili kalmis bir isi durdurmanin YOLU YOKTU; tek care sunucuyu
    // yeniden baslatmakti. Iptalin sinirlari icin dispatcher.ts'teki nota bak.
    if (url.pathname === "/task/cancel" && req.method === "POST") {
      const { taskId } = JSON.parse((await readBody(req)) || "{}") as { taskId?: string };
      if (!taskId) { json(res, 400, { ok: false, error: "taskId gerekli" }); return; }
      json(res, 200, dispatcher.cancel(taskId));
      return;
    }
    if (url.pathname === "/task/undo" && req.method === "POST") {
      const { taskId } = JSON.parse((await readBody(req)) || "{}") as { taskId?: string };
      if (!taskId) { json(res, 400, { ok: false, error: "taskId gerekli" }); return; }
      json(res, 200, await dispatcher.undo(taskId));
      return;
    }
    if (url.pathname === "/task/retry" && req.method === "POST") {
      const { taskId } = JSON.parse((await readBody(req)) || "{}") as { taskId?: string };
      if (!taskId) { json(res, 400, { ok: false, error: "taskId gerekli" }); return; }
      json(res, 200, await dispatcher.retry(taskId));
      return;
    }

    // ---------- Event Journal (2026-08-16'da eklendi) ----------
    // Journal sistemin TEK dogruluk kaynagi ama disaridan okunamiyordu:
    // /events yalnizca CANLI akis veriyordu, yani uygulamayi acmadan once
    // olan hicbir sey gorulemiyordu. Artefakt hatalarini kovalarken
    // (read.failed olaylari) bu eksik acikca hissedildi.
    if (url.pathname === "/journal" && req.method === "GET") {
      const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 500);
      const type = url.searchParams.get("type");
      // since(0) bastan verir; son N tanesini istiyoruz -> hepsini alip kuyruktan kes.
      let events = journal.since(0, 5000);
      if (type) events = events.filter((e) => e.type === type);
      json(res, 200, { events: events.slice(-limit).reverse(), total: events.length });
      return;
    }

    // ---------- Fabric kontrol paneli (debug/gelistirme) ----------
    if (url.pathname === "/panel" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(UI_HTML);
      return;
    }

    // ---------- capability kesfi ----------
    if (url.pathname === "/capabilities" && req.method === "GET") {
      // W6.L: risk seviyesi de dondurulur - onbellek anahtari (prompt-cache.js)
      // buna bagli, risk safe->ask degisince eski onbellek gecersiz sayilmali.
      // Sizinti degil: risk zaten politika meta verisi, dispatch davranisini
      // DEGISTIRMEZ (sunucu tarafi risk kapisi bagimsiz kalir).
      json(res, 200, capabilities.map((c) => ({ name: c.name, class: c.class, risk: c.risk ?? "ask" })));
      return;
    }

    // ---------- B-13: onay yasam dongusu (yalnizca insan tetikler - bkz. dispatcher.ts) ----------
    if (url.pathname === "/approvals" && req.method === "GET") {
      json(res, 200, dispatcher.getState().approvals);
      return;
    }
    if (url.pathname === "/approvals/grant" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { capability?: string; expiresAt?: number };
      if (!body.capability || !capabilityMap.has(body.capability)) {
        json(res, 400, { ok: false, error: "bilinmeyen capability" });
        return;
      }
      dispatcher.grantApproval(body.capability, body.expiresAt);
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/approvals/deny" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { capability?: string };
      if (!body.capability || !capabilityMap.has(body.capability)) {
        json(res, 400, { ok: false, error: "bilinmeyen capability" });
        return;
      }
      dispatcher.denyApproval(body.capability);
      json(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/approvals/revoke" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)) || "{}") as { capability?: string };
      if (!body.capability || !capabilityMap.has(body.capability)) {
        json(res, 400, { ok: false, error: "bilinmeyen capability" });
        return;
      }
      dispatcher.revokeApproval(body.capability);
      json(res, 200, { ok: true });
      return;
    }

    // ---------- MCP: Streamable HTTP (W4, 2026-08-17) ----------
    // Spec: modelcontextprotocol.io/specification/2025-03-26/basic/transports
    // Kapsam karari icin fabric/src/mcp.ts'teki basliktaki notu oku - tam
    // SSE/resumability degil, spec'in izin verdigi TEK-JSON-yanit modu.
    if (url.pathname === "/mcp") {
      // W4.7: DNS rebinding korumasi - spec'in MUST'u.
      if (!originAllowed(req, SELF_URL)) {
        json(res, 403, { error: "Origin izinli degil" });
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        // Sunucu-baslatilan push (GET/SSE) ve istemci-baslatilan oturum
        // sonlandirma (DELETE) desteklenmiyor - spec'in izin verdigi ikinci
        // gecerli yanit: 405.
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "desteklenmiyor - bu sunucu yalnizca tek-JSON-yaniti modunda calisiyor" }));
        return;
      }
      if (req.method === "POST") {
        if (!requireMcpAuth(req)) {
          json(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "gecersiz veya eksik Bearer token" } });
          return;
        }
        const raw = await readBody(req);
        let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> };
        try {
          body = JSON.parse(raw || "{}");
        } catch (err) {
          logErr("server:jsonrpcParse", err);
          json(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "gecersiz JSON" } });
          return;
        }
        const sessionHeader = req.headers["mcp-session-id"];
        const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
        const r = await handleMcpRequest(body, dispatcher, sessionId);
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (r.sessionId) headers["Mcp-Session-Id"] = r.sessionId;
        res.writeHead(r.httpStatus, headers);
        res.end(r.body === null ? "" : JSON.stringify(r.body));
        return;
      }
      json(res, 405, { error: "desteklenmeyen metot" });
      return;
    }

    // ---------- /read: SALT-OKUMA capability, dogrudan await ----------
    // Mimari cizgi: MUTASYONLAR /intent'ten gecer (journal'a yazilir,
    // iyimser projeksiyon, SSE ile reconcile). OKUMALAR buradan gecer -
    // durum degistirmedikleri icin journal'a girmeleri anlamsiz, ve
    // ~200ms'lik bir pil okumasi icin SSE korelasyonu kurmak UI'yi
    // gereksiz karmasiklastirirdi.
    if (url.pathname === "/read" && req.method === "POST") {
      const body = await readBody(req);
      const { intent, payload } = JSON.parse(body || "{}") as {
        intent?: string;
        payload?: Record<string, unknown>;
      };
      if (!intent) {
        json(res, 400, { ok: false, error: "intent gerekli" });
        return;
      }
      // B-13 enforcement: /read dispatcher'a bilerek girmez, bu nedenle
      // capability registry'sindeki HER seyi calistirabilecek genel bir yol
      // OLAMAZ. Yalnizca risk:safe VE acik readOnly damgali capability'ler
      // burada fail-closed kabul edilir.
      if (!isReadExposed(intent)) {
        json(res, 403, { ok: false, error: `"${intent}" /read uzerinden izinli degil` });
        return;
      }
      const cap = capabilityMap.get(intent);
      // isReadExposed() capabilityMap varligini zaten dogrular.
      if (!cap) throw new Error(`read policy capability bulunamadi: ${intent}`);
      const t0 = Date.now();
      const result = await cap.execute(payload);
      const ms = Date.now() - t0;

      // GOZLEM BOSLUGU DUZELTMESI (2026-08-16): okumalar bilerek journal'a
      // yazilmiyor (durum degistirmiyorlar), ama BASARISIZ okumalar durum
      // degeri tasir - kullanicinin gordugu hatalar hicbir yere kaydedilmiyordu.
      // Artik hatalar journal'a duser ve AKTİF sekmesinde gorunur.
      if (!result.ok) {
        try {
          const ev = journal.append({
            type: "read.failed",
            // 2026-08-17 DENETIMI: burada sabit "read" yaziyordu; TUM okuma
            // hatalari ayni correlationId yi paylasinca Intent DevTools
            // hepsini TEK akisa cokertiyordu - yani hata ayiklayici tam da
            // en cok lazim oldugu hata sinifinda kor kaliyordu.
            correlationId: randomUUID(),
            causationId: null,
            payload: { intent, payload: payload ?? null, error: String(result.error ?? "").slice(0, 400), ms },
            idempotencyKey: null,
          });
          sse.broadcast(ev);
          console.warn(`[read.failed] ${intent} (${ms}ms): ${String(result.error ?? "").slice(0, 200)}`);
        } catch (err) { logErr("server:readFailedJournal:" + intent, err); /* istegi bozma, sonucu yine de dondur */ }
      }
      json(res, 200, result);
      return;
    }

    // ---------- state / events (UI'nin projection okudugu yer) ----------
    if (url.pathname === "/state" && req.method === "GET") {
      json(res, 200, dispatcher.getState());
      return;
    }

    if (url.pathname === "/events" && req.method === "GET") {
      sse.add(res);
      return;
    }

    // ---------- intent (REFLEX/THOUGHT/AGENT giris noktasi) ----------
    if (url.pathname === "/intent" && req.method === "POST") {
      const body = await readBody(req);
      const intent = JSON.parse(body || "{}") as Intent;
      if (!intent.type) {
        json(res, 400, { error: "intent.type gerekli" });
        return;
      }
      const result = await dispatcher.dispatch(intent);
      json(res, 202, result); // 202 Accepted - sonuc SSE'den gelecek
      return;
    }

    // ---------- A2A: Agent Card ----------
    // W2.1: canonical yol artik agent-card.json; agent.json geriye donuk
    // uyum icin alias olarak duruyor (AYNI govdeyi doner).
    if ((url.pathname === "/.well-known/agent-card.json" || url.pathname === "/.well-known/agent.json") && req.method === "GET") {
      json(res, 200, a2a.getAgentCard());
      return;
    }

    // ---------- A2A: inbound task olustur (baska bir peer bize delege eder) ----------
    if (url.pathname === "/a2a/tasks" && req.method === "POST") {
      // W1.5: eski REST ucu de disaridan cagrilabiliyordu - ayni token zorunlu.
      if (!requireA2AAuth(req)) {
        json(res, 401, { error: "gecersiz veya eksik Bearer token" });
        return;
      }
      const body = await readBody(req);
      const { text, contextId } = JSON.parse(body || "{}") as { text?: string; contextId?: string };
      if (!text) {
        json(res, 400, { error: "text gerekli" });
        return;
      }
      const task = a2a.createInboundTask(text, contextId);
      json(res, 202, task);
      return;
    }

    // ---------- A2A: task durumu sorgula ----------
    const taskMatch = url.pathname.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
    if (taskMatch && req.method === "GET") {
      const task = a2a.getTask(taskMatch[1]);
      if (!task) {
        json(res, 404, { error: "task bulunamadi" });
        return;
      }
      json(res, 200, task);
      return;
    }

    // ---------- A2A: peer listesi / ekleme ----------
    if (url.pathname === "/a2a/peers" && req.method === "GET") {
      json(res, 200, a2a.listPeers());
      return;
    }
    if (url.pathname === "/a2a/peers" && req.method === "POST") {
      const body = await readBody(req);
      const peer = JSON.parse(body || "{}") as { name?: string; url?: string; description?: string; token?: string };
      if (!peer.name || !peer.url) {
        json(res, 400, { error: "name ve url gerekli" });
        return;
      }
      // W1.5: token da kaydedilebilsin - delegateToPeer bunu Authorization
      // basligina koyar (bkz. a2a.ts).
      a2a.addPeer({ name: peer.name, url: peer.url, description: peer.description, token: peer.token });
      json(res, 200, { ok: true });
      return;
    }

    // ---------- A2A: baska bir peer'a delege et (bu Fabric'in DIŞ cikisi) ----------
    if (url.pathname === "/a2a/delegate" && req.method === "POST") {
      // Eski debug ucu dogrudan delegateToPeer cagiriyordu. B-13 sonrasi
      // ayni insan onayi kuralini tum execution girisleriyle paylasir:
      // grant asla burada yapilmaz, yalnizca dispatcher kontrol eder.
      const body = await readBody(req);
      const { peer, text, contextId } = JSON.parse(body || "{}") as {
        peer?: string;
        text?: string;
        contextId?: string;
      };
      if (!peer || !text) {
        json(res, 400, { error: "peer ve text gerekli" });
        return;
      }
      const task = await dispatcher.dispatch({
        type: "a2a.delegate",
        payload: { peer, text, contextId },
        origin: { source: "ui", raw: "legacy /a2a/delegate", by: "deterministic", envelopeId: "legacy-a2a-delegate" },
      } as Intent);
      json(res, 202, task);
      return;
    }

    json(res, 404, { error: "bulunamadi" });
  } catch (err) {
    console.error("[fabric] handler hatasi:", err);
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[fabric] dinliyor: ${SELF_URL}  (Tailscale uzerinden de erisilebilir)`);
  console.log(`[fabric] journal: ${JOURNAL_PATH}`);
  console.log(`[fabric] capability'ler: ${capabilities.map((c) => c.name).join(", ")}`);
});
