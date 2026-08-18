/* Runtime sagligi bir capability degildir: yerel AIOS servislerinin anlik,
   salt-okunur operasyon projeksiyonudur. UI burada execution yapmaz. */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type RuntimeStatus = "online" | "down";
export type RuntimeService = {
  id: "fabric" | "llm_bridge" | "hermes_gateway" | "watchdog";
  label: string;
  status: RuntimeStatus;
  detail: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<{ ok: boolean; status: number }>;
type ProcessCheck = (pattern: string) => Promise<boolean>;

async function httpOnline(url: string, fetcher: FetchLike): Promise<{ online: boolean; detail: string }> {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(1500) });
    return response.ok
      ? { online: true, detail: `HTTP ${response.status}` }
      : { online: false, detail: `HTTP ${response.status}` };
  } catch {
    // Bu sessiz hata degildir: UI'ya acik DOWN durumu olarak tasinir.
    return { online: false, detail: "yanit yok" };
  }
}

async function processOnline(pattern: string): Promise<boolean> {
  try {
    await execFileAsync("pgrep", ["-f", pattern], { timeout: 1500 });
    return true;
  } catch {
    // pgrep exit 1 = process yok; bu da UI'ya DOWN olarak gorunur.
    return false;
  }
}

/** B-9'un yerine gecmez: bu bir anlik, istemciye gorunen runtime olcumudur. */
export async function readRuntimeStatus(options: {
  fetcher?: FetchLike;
  processCheck?: ProcessCheck;
  home?: string;
} = {}): Promise<{ observedAt: string; services: RuntimeService[] }> {
  const fetcher = options.fetcher ?? (fetch as FetchLike);
  const checkProcess = options.processCheck ?? processOnline;
  const home = options.home ?? process.env.HOME ?? "/data/data/com.termux/files/home";
  const [llm, gateway, watchdog] = await Promise.all([
    httpOnline("http://127.0.0.1:9201/health", fetcher),
    httpOnline("http://127.0.0.1:8642/health", fetcher),
    checkProcess(`^bash ${home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/watchdog\\.sh$`),
  ]);

  return {
    observedAt: new Date().toISOString(),
    services: [
      { id: "fabric", label: "Fabric", status: "online", detail: "bu yanıtı veren AIOS runtime" },
      { id: "llm_bridge", label: "LLM bridge", status: llm.online ? "online" : "down", detail: llm.detail },
      { id: "hermes_gateway", label: "Hermes gateway", status: gateway.online ? "online" : "down", detail: gateway.detail },
      { id: "watchdog", label: "Watchdog", status: watchdog ? "online" : "down", detail: watchdog ? "process bulundu" : "process bulunamadı" },
    ],
  };
}
