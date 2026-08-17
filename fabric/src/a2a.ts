// A2A (agent-to-agent delegation) katmani.
//
// Not: resmi @a2a-js/sdk paketi npm'de mevcut (dogrulandi) ama cihaz uzerinde
// ek bir bagimliligin build/uyum riskini simdilik almamak icin, protokolun
// SEKLINE sadik (Agent Card, taskId/contextId, submitted/working/completed/
// failed durumlari, message/parts) minimal bir HTTP implementasyonu
// yazildi. Ilerede `@a2a-js/sdk`'ya gecis SADECE bu dosyayi etkiler -
// dispatcher/capabilities/state hicbir sekilde A2A'nin ic detaylarini bilmez.
//
// Ilk peer: Hermes'in kendisi (yerel, varsayilan hedef - "reasoning agent").
// Ikinci peer: PC coding agent (uzak, Tailscale adresiyle, kullanici
// peers.json'a ekler). Ucuncu (gelecekte): offline yerel model agent.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { capabilityMap } from "./capabilities.ts";
import type { Journal } from "./journal.ts";
import type { AgentCard } from "./types.ts";

// W2.2: surum TEK kaynaktan - package.json. Iki taraf da (biz ve karsi peer)
// hangi surumu konustugumuzu Agent Card'dan gorsun; elle senkron tutulan
// iki ayri sabit (kart + package.json) B-1 borcunun sebebiydi.
const PKG_VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
})();

export type A2ATaskState = "submitted" | "working" | "completed" | "failed" | "canceled";

// W2.3: A2A v1.0 tel formati TASK_STATE_*/ROLE_* kullanir; ic modelimiz
// (dispatcher.ts, journal) okunabilirlik icin kucuk harfli kaliyor - yalnizca
// DISARIYA giden/DISARIDAN gelen JSON-RPC govdesinde donusum yapilir.
export function toWireState(s: A2ATaskState): string {
  return "TASK_STATE_" + s.toUpperCase();
}
export function toWireRole(r: "user" | "agent"): string {
  return "ROLE_" + r.toUpperCase();
}
/** Peer'dan gelen durumu normalize eder - hem v1 (TASK_STATE_X) hem eski (x) kabul edilir. */
function fromWireState(s: unknown): A2ATaskState {
  const raw = String(s ?? "completed").replace(/^TASK_STATE_/, "").toLowerCase();
  return (["submitted", "working", "completed", "failed", "canceled"].includes(raw) ? raw : "completed") as A2ATaskState;
}

export interface A2AMessage {
  role: "user" | "agent";
  parts: { type: "text"; text: string }[];
}

export interface A2ATask {
  id: string;
  contextId: string;
  state: A2ATaskState;
  history: A2AMessage[];
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface Peer {
  name: string;
  url: string; // orn http://100.x.x.x:9310  (peer'in Fabric/A2A endpoint kokü)
  description?: string;
  /**
   * Paylasilan sir (2026-08-17, W1.5). Bu peer'a giden her istekte
   * `Authorization: Bearer <token>` olarak gonderilir; peer da bize gelen
   * istekte AYNI degeri bekler (bkz. server.ts requireA2AAuth). Tailscale
   * agi kendi basina kimlik dogrulamasi degil - "tailnet'te olan herkes"
   * ile "bu ozel peer" arasindaki fark bu alan.
   */
  token?: string;
}

const PEERS_FILE = new URL("../peers.json", import.meta.url);

function loadPeers(): Peer[] {
  try {
    if (existsSync(PEERS_FILE)) {
      return JSON.parse(readFileSync(PEERS_FILE, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return [];
}

function savePeers(peers: Peer[]) {
  writeFileSync(PEERS_FILE, JSON.stringify(peers, null, 2), "utf8");
}

const GATEWAY_URL = "http://127.0.0.1:8642/v1/chat/completions";
// W1.8: sabit deger depoda duz metin duruyordu (git gecmisine girmisti).
// Artik env'den okunuyor; env yoksa config.yaml'daki eski varsayilana duser
// (geriye donuk uyum - operator FABRIC_GATEWAY_KEY ile degistirebilir).
const GATEWAY_KEY = process.env.FABRIC_GATEWAY_KEY ?? "local-retro-os-9f2c";

// TIMEOUT ZINCIRI (2026-08-17 W0.3): capability < envelope < UI olmali, yoksa
// kullanici "zaman asimi" gorurken sunucudaki fetch sinirsiz asili kalir (B4).
// Envelope varsayilani 30sn (server.ts), UI varsayilani 35sn (app.js) -
// peer'a giden bu cagri ikisinden de KISA olmak zorunda ki hata gercek
// sebebiyle donsun, sessiz asilma yerine.
const DELEGATE_TIMEOUT_MS = 25000;

/**
 * A2A v1.0 payload'undan metni cikarir.
 *
 * Spec `artifacts`i "nihai cikti", `status.message`i "ara mesaj" sayar ve
 * Hermes'in istemcisi de tam bu sirayi kullaniyor. Biz de ayni sirayi
 * kullanmaliyiz ki iki taraf AYNI seyi "cevap" kabul etsin.
 *
 * Part sekilleri surumler arasi degisti: v1.0 dogrudan `text` uyesi tasir,
 * v0.3 `kind:"text"`, daha eskiler `type:"text"` kullaniyordu. Ucunde de
 * yuk `part.text` icinde - o yuzden testimiz "string bir text uyesi var mi".
 */
function extractA2AText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload ?? "");
  const p = payload as Record<string, unknown>;
  const fromParts = (parts: unknown): string =>
    (Array.isArray(parts) ? parts : [])
      .map((x) => {
        const part = x as { text?: unknown };
        return typeof part?.text === "string" ? part.text : "";
      })
      .filter(Boolean)
      .join("\n");

  for (const art of (p.artifacts as unknown[]) ?? []) {
    const t = fromParts((art as { parts?: unknown })?.parts);
    if (t) return t;
  }
  const status = p.status as { message?: { parts?: unknown } } | undefined;
  if (status?.message) {
    const t = fromParts(status.message.parts);
    if (t) return t;
  }
  if (Array.isArray(p.parts)) {
    const t = fromParts(p.parts);
    if (t) return t;
  }
  // Bizim eski ic bicimimiz (history) - geriye donuk uyum icin
  const hist = p.history as { parts?: unknown }[] | undefined;
  if (hist?.length) {
    const t = fromParts(hist[hist.length - 1]?.parts);
    if (t) return t;
  }
  return "";
}

const A2A_SNAPSHOT_EVENT = "a2a.task.snapshot";

export class A2AHub {
  private tasks = new Map<string, A2ATask>();
  private peers: Peer[] = loadPeers();
  private selfUrl: string;
  private journal: Journal;
  private onStateChange?: (task: A2ATask) => void;

  /**
   * W2.5: A2A gorevleri onceden yalnizca surec belleginde tutuluyordu -
   * sunucu yeniden baslayinca (deploy, crash) tum A2A gecmisi kayboluyordu.
   * Dispatcher'in kendi task'lari icin zaten yaptigi seyi (journal'dan
   * yeniden insa) burada da uyguluyoruz: her durum degisikliginde tam bir
   * "goruntu" (snapshot) journal'a yazilir; baslangicta ayni tip event'ler
   * geri oynatilir, taskId basina EN SON goruntu tutulur.
   */
  constructor(selfUrl: string, journal: Journal, onStateChange?: (task: A2ATask) => void) {
    this.selfUrl = selfUrl;
    this.journal = journal;
    this.onStateChange = onStateChange;
    for (const ev of journal.replayAll()) {
      if (ev.type === A2A_SNAPSHOT_EVENT) {
        this.tasks.set((ev.payload as A2ATask).id, ev.payload as A2ATask);
      }
    }
  }

  private persist(task: A2ATask) {
    this.journal.append({
      type: A2A_SNAPSHOT_EVENT,
      correlationId: task.contextId,
      causationId: null,
      payload: task,
      idempotencyKey: null,
    });
  }

  getAgentCard(): AgentCard {
    // W2.2: skills artik ELLE yazilmis 5 genis kategori degil, capability
    // registry'den TURETILIYOR - ve yalnizca risk:"safe" olanlar. "ask"
    // olanlari (script.run, whatsapp.send...) disariya duyurmak, W1'de
    // kurulan onay zorunlulugunu kesif asamasinda bosa cikarirdi: uzak bir
    // ajan onlari "elimde var" sanip denemeye kalkardi (deneyince zaten
    // W1.9'daki risk kapisina takilir, ama kesif seviyesinde durustluk
    // daha iyi - kart NE YAPABILECEGIMIZI, ONAYSIZ ne calisacagini soylemeli).
    const safeSkills = [...capabilityMap.entries()]
      .filter(([, cap]) => (cap.risk ?? "ask") === "safe")
      .map(([name]) => ({
        id: name,
        name,
        description: `Cihaz capability (risk: safe) - onaysiz calisir`,
      }));

    return {
      // 2026-08-17: kart GERCEKLE ORTUSMUYORDU. "retro-os render" diye bir sey
      // kalmadi, Shizuku ise artik opsiyonel bir katman (ve genelde kapali).
      // Uzak ajan bize NE gonderecegine bu karta bakarak karar veriyor; yanlis
      // kart = yanlis is. PC'deki Hermes tam olarak bu eski metni okuyup
      // telefonu "Shizuku ajani" sanmisti.
      name: "Phone AI-OS Fabric",
      description:
        "Xiaomi 13 Lite / Android 15 uzerinde calisan AI-OS. Arkasinda GERCEK bir model var " +
        "(Hermes gateway -> gpt-5.6-luna): serbest metin gonderebilirsin, dusunur ve yanitlar. " +
        "Ayrica cihaz capability'leri var - `skills` listesi ONAYSIZ calisanlari (risk:safe) " +
        "gosterir; digerleri (script.run, whatsapp.send, a2a.delegate...) onay gerektirir ve " +
        "bu kanaldan dogrudan calistirilamaz.",
      url: this.selfUrl,
      version: PKG_VERSION,
      protocolVersion: "1.0",
      supportedInterfaces: [{ transport: "JSONRPC", url: this.selfUrl }],
      capabilities: { streaming: false, pushNotifications: false },
      skills: safeSkills.length ? safeSkills : [
        { id: "agent.respond", name: "Genel yanit",
          description: "Serbest metin gorev - telefondaki Hermes dusunur ve yanitlar" },
      ],
    };
  }

  listPeers(): Peer[] {
    return this.peers;
  }

  addPeer(peer: Peer) {
    this.peers = this.peers.filter((p) => p.name !== peer.name);
    this.peers.push(peer);
    savePeers(this.peers);
  }

  getTask(id: string): A2ATask | undefined {
    return this.tasks.get(id);
  }

  /** W2.4: tum gorevler (en yeni once) - JSON-RPC ListTasks bunu kullanir. */
  listTasks(): A2ATask[] {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * W2.4: dispatcher.ts'teki cancel()'la AYNI durust sinir - bir capability
   * zaten calisiyorsa (orn. executeLocally icindeki await) onu GERCEKTEN
   * kesemeyiz; iptal, henuz terminal olmayan gorevi "failed" isaretler ve
   * sonucu ISLEMEZ. Kullanici asili bir gorevden kurtulur, yan etki geri
   * alinmaz - ayni not dispatcher.ts:22'de de var.
   */
  cancelTask(id: string): { ok: boolean; error?: string } {
    const task = this.tasks.get(id);
    if (!task) return { ok: false, error: "gorev bulunamadi" };
    if (task.state !== "submitted" && task.state !== "working") {
      return { ok: false, error: `gorev zaten ${task.state}` };
    }
    this.setState(task, "canceled", { error: "kullanici tarafindan iptal edildi" });
    return { ok: true };
  }

  private setState(task: A2ATask, state: A2ATaskState, patch: Partial<A2ATask> = {}) {
    // Iptal edilmis bir gorev GERI degismez - executeLocally'nin gec gelen
    // cap.execute() sonucu "canceled" durumunu ezmesin (bkz. cancelTask notu).
    if (task.state === "canceled" && state !== "canceled") return;
    task.state = state;
    task.updatedAt = Date.now();
    Object.assign(task, patch);
    this.persist(task);
    this.onStateChange?.(task);
  }

  /**
   * Bu Fabric'e gelen (inbound) bir gorevi olusturur ve HEMEN dondurur
   * (submitted). Gercek yurutme arka planda devam eder, durum degisiklikleri
   * onStateChange callback'i (server.ts SSE'ye baglar) ile yayinlanir.
   */
  createInboundTask(text: string, contextId?: string): A2ATask {
    const task: A2ATask = {
      id: randomUUID(),
      contextId: contextId ?? randomUUID(),
      state: "submitted",
      history: [{ role: "user", parts: [{ type: "text", text }] }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    this.persist(task);
    void this.executeLocally(task);
    return task;
  }

  private async executeLocally(task: A2ATask) {
    this.setState(task, "working");

    // ─── UZAK AJAN ICIN GERCEK YURUTME (2026-08-17) ───
    // Gelen her A2A gorevi dogrudan Hermes gateway'ine gidiyordu. Ama Hermes
    // YANIT URETIRKEN capability CALISTIRAMAZ - yalnizca metin/artefakt uretir.
    // Sonuc: PC "pil yuzdesi kac?" diye sordugunda telefon "bilgi bulunamadi"
    // diyordu; uzak ajan cihaza hicbir sey yaptiramiyordu.
    //
    // Cozum, pc-agent'takiyle AYNI simetrik bicim:
    //     capability: <ad> | <json payload>
    // Bu bicim geldiginde capability GERCEKTEN calistirilir. Serbest metin ise
    // eskisi gibi Hermes'e gider (muhakeme icin). Boylece uzak taraf hem
    // "dusun" hem "yap" diyebiliyor ve hangisini istedigi belirsiz kalmiyor.
    const raw = task.history[0]?.parts?.[0]?.text ?? "";
    const capMatch = raw.match(/^\s*capability:\s*([a-z0-9._]+)\s*(?:\|\s*([\s\S]*))?$/i);
    if (capMatch) {
      const name = capMatch[1];
      let payload: Record<string, unknown> | undefined;
      const argText = (capMatch[2] ?? "").trim();
      if (argText) {
        try {
          payload = JSON.parse(argText) as Record<string, unknown>;
        } catch {
          this.setState(task, "failed", { error: `payload gecerli JSON degil: ${argText.slice(0, 80)}` });
          task.history.push({ role: "agent", parts: [{ type: "text",
            text: `HATA: payload gecerli JSON degil. Ornek: capability: volume.set | {"stream":"music","value":5}` }] });
          return;
        }
      }
      const cap = capabilityMap.get(name);
      if (!cap) {
        const names = [...capabilityMap.keys()].join(", ");
        task.history.push({ role: "agent", parts: [{ type: "text",
          text: `Bilinmeyen capability: ${name}\n\nMevcut olanlar:\n${names}` }] });
        this.setState(task, "failed", { error: `bilinmeyen capability: ${name}` });
        return;
      }
      // ─── RISK KAPISI (2026-08-17, W1.5 sirasinda bulundu) ───
      // Bu yol cap.execute()'u DOGRUDAN cagiriyor - dispatcher.dispatch()'i
      // (ve W1.3'teki risk kapisini) TAMAMEN atliyor. Duzeltilmezse gelen bir
      // A2A mesaji "capability: script.run | {...}" ile risk:ask olan HER
      // seyi, dispatcher hic gormeden calistirabilirdi - UI icin kurulan
      // onay zorunlulugu, gelen A2A yolunda hicbir sey ifade etmezdi.
      const risk = cap.risk ?? "ask";
      if (risk === "ask") {
        task.history.push({ role: "agent", parts: [{ type: "text",
          text: `HATA: "${name}" onay gerektirir (risk: ask) - A2A uzerinden dogrudan calistirilamaz.` }] });
        this.setState(task, "failed", { error: `"${name}" onay gerektirir (risk: ask)` });
        return;
      }
      try {
        const r = await cap.execute(payload);
        task.history.push({ role: "agent", parts: [{ type: "text",
          text: `[${name}] ${r.ok ? "OK" : "HATA"}\n${JSON.stringify(r.ok ? r.data : r.error, null, 2)}` }] });
        this.setState(task, r.ok ? "completed" : "failed", r.ok ? {} : { error: String(r.error ?? "") });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        task.history.push({ role: "agent", parts: [{ type: "text", text: `HATA: ${msg}` }] });
        this.setState(task, "failed", { error: msg });
      }
      return;
    }

    try {
      const res = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${GATEWAY_KEY}` },
        body: JSON.stringify({
          model: "hermes-agent",
          messages: [{ role: "user", content: task.history[0].parts[0].text }],
        }),
      });
      if (!res.ok) throw new Error(`gateway ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const reply = data.choices?.[0]?.message?.content ?? "(bos yanit)";
      task.history.push({ role: "agent", parts: [{ type: "text", text: reply }] });
      this.setState(task, "completed");
    } catch (err) {
      this.setState(task, "failed", { error: err instanceof Error ? err.message : String(err) });
    }
  }

  /**
   * Baska bir cihazdaki peer'a gorev delege eder - A2A v1.0 JSON-RPC ile.
   *
   * ═══ 2026-08-17: OZEL BICIM TERK EDILDI ═══
   * Onceki surum `POST {peer}/a2a/tasks` ile `{text, contextId}` gonderiyordu.
   * Bu BIZE OZEL bir bicimdi ve yalnizca kendi yazdigimiz peer'la calisiyordu;
   * standart bir A2A ajani (Hermes, LangChain, CrewAI, Google ADK) bu ucu
   * tanimaz. Protokolun butun degeri tam da bu - "coklu platform ancak
   * standartla olur". Artik giden istek de spec'e uygun:
   *
   *   POST <card.url>   {"jsonrpc":"2.0","method":"SendMessage",
   *                      "params":{"message":{role,parts[],messageId,contextId}}}
   *
   * RPC adresi Agent Card'dan cozulur (v1.0 supportedInterfaces -> yoksa
   * kartin `url`i -> yoksa peer'in taban adresi).
   */
  async delegateToPeer(peerName: string, text: string, contextId?: string): Promise<A2ATask> {
    const peer = this.peers.find((p) => p.name === peerName);
    if (!peer) throw new Error(`peer bulunamadi: ${peerName}`);

    const rpcUrl = await this.resolveRpcUrl(peer);
    const ctx = contextId ?? randomUUID();
    const rpcId = randomUUID();

    let res: Response;
    try {
      res = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(peer.token ? { authorization: `Bearer ${peer.token}` } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: rpcId,
          method: "SendMessage",
          params: {
            message: {
              role: toWireRole("user"),
              parts: [{ text, mediaType: "text/plain" }],
              messageId: randomUUID(),
              contextId: ctx,
            },
          },
        }),
        signal: AbortSignal.timeout(DELEGATE_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new Error(`peer ${peerName} ${DELEGATE_TIMEOUT_MS / 1000}sn icinde yanit vermedi`);
      }
      throw err;
    }
    if (!res.ok) throw new Error(`peer ${peerName} HTTP ${res.status}`);

    const body = (await res.json()) as {
      error?: { message?: string };
      result?: {
        task?: Record<string, unknown>;
        message?: Record<string, unknown>;
      };
    };
    if (body.error) throw new Error(`peer ${peerName}: ${body.error.message ?? "RPC hatasi"}`);

    const payload = body.result?.task ?? body.result?.message ?? {};
    const reply = extractA2AText(payload);
    // W2.3: peer'in durumu v1 (TASK_STATE_X) ya da eski (x) bicimde
    // yazmis olabilir - fromWireState ikisini de kabul eder.
    const remoteState = fromWireState((payload as { status?: { state?: unknown } }).status?.state);

    // Yerel "gölge" kayit - UI ve journal ayni sekilde gorsun.
    const task: A2ATask = {
      id: String((payload as { id?: string }).id ?? rpcId),
      contextId: String((payload as { contextId?: string }).contextId ?? ctx),
      state: remoteState === "failed" ? "failed" : "completed",
      history: [
        { role: "user", parts: [{ type: "text", text }] },
        { role: "agent", parts: [{ type: "text", text: reply }] },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.tasks.set(task.id, task);
    this.persist(task);
    this.onStateChange?.(task);
    return task;
  }

  /**
   * Agent Card'dan JSON-RPC adresini cozer.
   * W2.6: ONCE canonical `agent-card.json` denenir, olmazsa eski `agent.json`
   * aliasina dusulur - istemci taraf da protokolun yeni adini tercih etsin.
   */
  private async resolveRpcUrl(peer: Peer): Promise<string> {
    const base = peer.url.replace(/\/$/, "");
    for (const path of ["/.well-known/agent-card.json", "/.well-known/agent.json"]) {
      try {
        const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) continue;
        const card = (await res.json()) as {
          url?: string;
          supportedInterfaces?: { transport?: string; url?: string }[];
        };
        const iface = card.supportedInterfaces?.find(
          (i) => /jsonrpc/i.test(String(i.transport ?? "")) && i.url,
        );
        if (iface?.url) return iface.url;
        if (card.url) return card.url;
        return base; // kart okundu ama RPC adresi yok - taban adrese dus
      } catch {
        /* bu yol calismadi - digerini dene */
      }
    }
    return base;
  }
}
