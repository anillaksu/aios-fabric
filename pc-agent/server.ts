// PC tarafinda calisan minimal A2A peer - telefondaki Fabric daemon'inin
// (~/fabric) "uzak peer'a delege et" akisini GERCEKTEN test etmek icin.
//
// DURUST OLALIM: bu, Claude Code'un kendisi degil - PC'de calisan, gercek
// bir kac "capability"si olan (system.info, fs.list) ve serbest metin
// gorevlerde bunu acikca soyleyen kucuk bir stub A2A agent'i. Amac: telefon
// -> Tailscale -> PC -> telefon round-trip'inin GERCEKTEN calistigini
// kanitlamak. Ileride buraya gercek bir PC coding-agent koseli (orn. yerel
// bir CLI agent'a koprü) baglanabilir - protokol (Agent Card, task
// lifecycle) ayni kalir, sadece execute() fonksiyonu degisir.
//
// Calistirma: node --experimental-strip-types server.ts
// Varsayilan port: 9310

import { createServer } from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { hostname, uptime, platform, cpus, totalmem, freemem } from "node:os";
import { readdirSync, statSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { SKILLS, SAFE_ROOT as SKILL_ROOT, resolveSkill } from "./skills.ts";

const PORT = Number(process.env.PC_AGENT_PORT ?? 9310);
const SELF_URL = process.env.PC_AGENT_SELF_URL ?? `http://100.109.236.30:${PORT}`;
const SAFE_ROOT = resolve(process.env.PC_AGENT_SAFE_ROOT ?? process.cwd());

// ─── GELEN ISTEK KIMLIK DOGRULAMASI (2026-08-17, W1.5) ───
// Bu ajan TAM bir kabuk erisimi sunuyor (shell.run, fs.read...). Tailscale
// agindaki HERKES token olmadan bunu cagirabiliyordu. Env verilmemisse
// yeni bir token URETILIR ve diske yazilir (fail-closed varsayilan).
const TOKEN_PATH = join(SAFE_ROOT, ".pc-agent-token");
function loadOrCreateToken(): string {
  if (process.env.PC_AGENT_TOKEN) return process.env.PC_AGENT_TOKEN;
  try {
    if (existsSync(TOKEN_PATH)) return readFileSync(TOKEN_PATH, "utf8").trim();
  } catch { /* devam, yeniden uret */ }
  const token = randomBytes(24).toString("hex");
  try { writeFileSync(TOKEN_PATH, token, "utf8"); } catch { /* diske yazilamadi - yine de bellekte gecerli */ }
  return token;
}
const TOKEN = loadOrCreateToken();
console.log(`[pc-agent] gelen istek tokeni: ${TOKEN_PATH} (telefondaki peer'a bu degeri ekle)`);

function requireAuth(req: import("node:http").IncomingMessage): boolean {
  const header = req.headers["authorization"];
  const value = Array.isArray(header) ? header[0] : header;
  return value === `Bearer ${TOKEN}`;
}

type TaskState = "submitted" | "working" | "completed" | "failed";
interface Message { role: "user" | "agent"; parts: { type: "text"; text: string }[]; }
interface Task {
  id: string;
  contextId: string;
  state: TaskState;
  history: Message[];
  createdAt: number;
  updatedAt: number;
  error?: string;
}

const tasks = new Map<string, Task>();

function agentCard() {
  return {
    name: "PC Agent",
    description:
      "Windows PC uzerinde calisan A2A arac ajani. DIL MODELI YOKTUR - dusunmez, " +
      "arac calistirir. Cagiran taraf (telefondaki Hermes) dusunur ve buraya somut " +
      "is delege eder. Bicim:  skill: <ad> | <arg>. " +
      `Calisma kokü: ${SKILL_ROOT} (disina cikilamaz).`,
    url: SELF_URL,
    version: "0.3.0",
    protocolVersion: "1.0",
    // v1.0 kesif alani: karsi taraf RPC adresini BURADAN cozer, tahmin etmez.
    supportedInterfaces: [{ transport: "JSONRPC", url: SELF_URL }],
    capabilities: { streaming: false, pushNotifications: false },
    skills: Object.entries(SKILLS).map(([id, s]) => ({
      id,
      name: id,
      description: s.description,
    })),
  };
}

function detectSkill(text: string): "system.info" | "fs.list" | "echo" {
  const t = text.toLowerCase();
  if (t.includes("system") || t.includes("sistem") || t.includes("cpu") || t.includes("bellek")) return "system.info";
  if (t.includes("dosya") || t.includes("dizin") || t.includes("list") || t.includes("fs.")) return "fs.list";
  return "echo";
}

function execSkill(skill: string, text: string): string {
  if (skill === "system.info") {
    const mb = (n: number) => Math.round(n / 1024 / 1024);
    return JSON.stringify(
      {
        hostname: hostname(),
        platform: platform(),
        uptimeSec: Math.round(uptime()),
        cpuCount: cpus().length,
        cpuModel: cpus()[0]?.model,
        totalMemMB: mb(totalmem()),
        freeMemMB: mb(freemem()),
      },
      null,
      2,
    );
  }
  if (skill === "fs.list") {
    try {
      const entries = readdirSync(SAFE_ROOT).slice(0, 50).map((name) => {
        const full = join(SAFE_ROOT, name);
        const st = statSync(full);
        return `${st.isDirectory() ? "[D]" : "[F]"} ${name}`;
      });
      return entries.join("\n") || "(bos dizin)";
    } catch (err) {
      return `HATA: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return (
    `[PC Test Peer - stub yanit] Bu peer'in arkasinda bir dil modeli YOK, sadece round-trip'i ` +
    `kanitlamak icin echo yapiyor. Gonderdiginiz metin: "${text}"`
  );
}

// CORS kaldirildi (W1.5) - bu ajanin cagiranlari tarayici degil, sunucudan
// sunucuya Node fetch; CORS zaten bir koruma saglamiyordu.
function json(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * A2A v1.0 JSON-RPC girisi.
 *
 * ═══ 2026-08-17 ═══
 * Bu ajan once BIZE OZEL bir REST bicimi konusuyordu (POST /a2a/tasks).
 * Calisiyordu ama yalnizca kendi istemcimizle; standart bir A2A ajani
 * (Hermes, LangChain, CrewAI, Google ADK) onu tanimaz. Coklu platform ancak
 * standartla mumkun - o yuzden asil uc artik JSON-RPC. Eski REST ucu
 * geriye donuk uyum icin duruyor ama YENI entegrasyonlar bunu kullanmali.
 */
async function handleJsonRpc(body: string): Promise<unknown> {
  let req: {
    id?: unknown; method?: string;
    params?: { message?: { parts?: { text?: string }[]; contextId?: string } };
  };
  try {
    req = JSON.parse(body || "{}");
  } catch {
    return { jsonrpc: "2.0", id: null, error: { code: -32700, message: "gecersiz JSON" } };
  }
  const id = req.id ?? null;
  const method = String(req.method ?? "");
  if (!/^(SendMessage|message\/send)$/i.test(method)) {
    return { jsonrpc: "2.0", id, error: { code: -32601, message: `desteklenmeyen metot: ${method}` } };
  }
  const text = (req.params?.message?.parts ?? [])
    .map((p) => p?.text ?? "").filter(Boolean).join("\n").trim();
  if (!text) {
    return { jsonrpc: "2.0", id, error: { code: -32602, message: "metin parcasi yok" } };
  }

  const { skill, arg } = resolveSkill(text);
  let reply: string;
  let ok = true;
  if (!skill) {
    const list = Object.entries(SKILLS).map(([k, v]) => `  skill: ${k}  — ${v.description}`).join("\n");
    reply = "Bu ajanin arkasinda dil modeli YOK; arac calistirir.\n" +
            "Acik bicim:  skill: <ad> | <arg>\n\nMevcut yetenekler:\n" + list;
  } else {
    console.log(`[pc-agent] rpc skill=${skill} arg=${arg.slice(0, 80)}`);
    const r = await SKILLS[skill].run(arg);
    ok = r.ok;
    reply = `[${skill}] ${r.ok ? "OK" : "HATA"}\n${r.output}`;
  }

  const taskId = randomUUID();
  const ctx = req.params?.message?.contextId ?? randomUUID();
  return {
    jsonrpc: "2.0", id,
    result: {
      task: {
        id: taskId,
        contextId: ctx,
        status: {
          state: ok ? "completed" : "failed",
          message: { role: "agent", parts: [{ text: reply, mediaType: "text/plain" }], messageId: taskId },
        },
        artifacts: [{ parts: [{ text: reply, mediaType: "text/plain" }] }],
      },
    },
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", SELF_URL);

  // Standart A2A: Agent Card'daki `url`e JSON-RPC POST gelir (kok yol).
  // W1.5: bu ajan kabuk erisimi sunuyor - token zorunlu.
  if (url.pathname === "/" && req.method === "POST") {
    if (!requireAuth(req)) {
      json(res, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "gecersiz veya eksik Bearer token" } });
      return;
    }
    json(res, 200, await handleJsonRpc(await readBody(req)));
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204, {});
    res.end();
    return;
  }

  if (url.pathname === "/" && req.method === "GET") {
    json(res, 200, { ok: true, ...agentCard() });
    return;
  }

  if (url.pathname === "/.well-known/agent.json" && req.method === "GET") {
    json(res, 200, agentCard());
    return;
  }

  if (url.pathname === "/a2a/tasks" && req.method === "POST") {
    if (!requireAuth(req)) {
      json(res, 401, { error: "gecersiz veya eksik Bearer token" });
      return;
    }
    const body = await readBody(req);
    const { text, contextId } = JSON.parse(body || "{}") as { text?: string; contextId?: string };
    if (!text) {
      json(res, 400, { error: "text gerekli" });
      return;
    }
    const task: Task = {
      id: randomUUID(),
      contextId: contextId ?? randomUUID(),
      state: "submitted",
      history: [{ role: "user", parts: [{ type: "text", text }] }],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    tasks.set(task.id, task);
    json(res, 202, task);

    // Arka planda "calistir" (gercek is olsa async/agent cagrisi olurdu -
    // burada bilerek kucuk bir gecikme birakildi ki UI'da submitted->working
    // gecisini gormek mumkun olsun).
    setTimeout(() => {
      task.state = "working";
      task.updatedAt = Date.now();
      // GERCEK yetenek yurutmesi (2026-08-17). Onceden burada echo stub'i vardi.
      void (async () => {
        try {
          const { skill, arg } = resolveSkill(text);
          if (!skill) {
            // Tahmin etmek yerine NE YAPILABILECEGINI soyle. Eski surum
            // sessizce echo doneyordu; cagiran taraf yeteneksiz oldugunu
            // anlamiyordu.
            const list = Object.entries(SKILLS)
              .map(([k, v]) => `  skill: ${k}  — ${v.description}`)
              .join("\n");
            task.history.push({ role: "agent", parts: [{ type: "text", text:
              "Bu ajanin arkasinda dil modeli YOK; arac calistirir.\n" +
              "Acik bicim kullan:  skill: <ad> | <arg>\n\nMevcut yetenekler:\n" + list }] });
            task.state = "completed";
          } else {
            console.log(`[pc-agent] skill=${skill} arg=${arg.slice(0, 80)}`);
            const r = await SKILLS[skill].run(arg);
            task.history.push({ role: "agent", parts: [{ type: "text",
              text: `[${skill}] ${r.ok ? "OK" : "HATA"}\n${r.output}` }] });
            task.state = r.ok ? "completed" : "failed";
            if (!r.ok) task.error = r.output.slice(0, 200);
          }
        } catch (err) {
          task.state = "failed";
          task.error = err instanceof Error ? err.message : String(err);
        }
        task.updatedAt = Date.now();
      })();
    }, 200);
    return;
  }

  const m = url.pathname.match(/^\/a2a\/tasks\/([a-f0-9-]+)$/);
  if (m && req.method === "GET") {
    const task = tasks.get(m[1]);
    if (!task) {
      json(res, 404, { error: "task bulunamadi" });
      return;
    }
    json(res, 200, task);
    return;
  }

  json(res, 404, { error: "bulunamadi" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[pc-agent] dinliyor: ${SELF_URL}`);
  console.log(`[pc-agent] Agent Card: ${SELF_URL}/.well-known/agent.json`);
  console.log(`[pc-agent] safe root (fs.list): ${SAFE_ROOT}`);
  console.log(`[pc-agent] Telefondaki Fabric UI'de "peer ekle": name=pc-agent url=${SELF_URL}`);
});
