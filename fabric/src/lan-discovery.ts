// A2A peer keşfi - yerel ağda başka Fabric/A2A ajanlarını (agent-card.json
// yayınlayan) elle IP girmeden bulur.
//
// 2026-08-24: `a2a.peer.add` zaten var ama tamamen ELLE - kullanıcı/model
// karşı cihazın IP:port'unu bilmek zorunda. Bu modül salt-okunur bir tarama
// sağlar (candidateIPs + probeAgentCard), sonucu `a2a.peer.discover`
// capability'sine (bkz. capabilities.ts) taşır. Bulunan bir peer OTOMATİK
// eklenmez - kullanıcı/model sonucu görüp isterse `a2a.peer.add` çağırır
// (a2a.peer.add zaten risk:"ask" ile insan onayı gerektiriyor, bu akış
// bozulmuyor).
//
// GÜVENLİK SINIRI: sadece /24 veya daha dar (en fazla 254 host) alt ağlar
// taranır. Daha geniş bir prefix (ör. /16) yanlışlıkla verilirse BOŞ dizi
// döner - agresif/istenmeyen geniş taramayı önler. Bu sınırın YOKLUĞUNDA
// (ayrı bir projede, checkpoint-7-agent-discovery'de) bitwise `&`'nin 32-bit
// İŞARETLİ sonuç döndürmesi yüzünden (üst biti set IP'lerde, ör. 192.168.x.x
// - yani TÜM yaygın özel ağ aralıklarında) `network` negatif çıkıp döngü
// milyarlarca kez dönerek 4GB+ heap tüketip çökmüştü; buradaki `>>> 0`
// KASITLI ve ZORUNLU (aşağıya bakın).

import { networkInterfaces } from "node:os";
import { logErr } from "./log.ts";
import type { AgentCard } from "./types.ts";

export interface LocalNetwork { address: string; prefixLength: number; }

export function listLocalNetworks(): LocalNetwork[] {
  const out: LocalNetwork[] = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal || addr.family !== "IPv4") continue;
      out.push({ address: addr.address, prefixLength: cidrFromNetmask(addr.netmask) });
    }
  }
  return out;
}

function cidrFromNetmask(netmask: string): number {
  return netmask.split(".").reduce((bits, octet) => bits + Number(octet).toString(2).split("1").length - 1, 0);
}

function ipToInt(ip: string): number {
  const [a, b, c, d] = ip.split(".").map(Number);
  return ((a! << 24) | (b! << 16) | (c! << 8) | d!) >>> 0;
}
function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function candidateIPs(localIp: string, prefixLength: number): string[] {
  if (prefixLength < 24 || prefixLength > 30) return [];
  const hostBits = 32 - prefixLength;
  const mask = hostBits === 0 ? 0xffffffff : (0xffffffff << hostBits) >>> 0;
  // `>>> 0` BURADA ZORUNLU (yukarıdaki dosya başı notuna bakın): üst biti
  // set IP'lerde bu olmadan `network` negatif çıkar, döngü bilgisayarı
  // çökertir.
  const network = (ipToInt(localIp) & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const result: string[] = [];
  for (let i = network + 1; i < broadcast; i++) {
    const candidate = intToIp(i);
    if (candidate !== localIp) result.push(candidate);
  }
  return result;
}

export interface DiscoveredAgent { host: string; port: number; card: AgentCard; }

export async function probeAgentCard(host: string, port: number, timeoutMs = 800): Promise<DiscoveredAgent | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(`http://${host}:${port}/.well-known/agent-card.json`, { signal: ctrl.signal });
    if (!resp.ok) return undefined;
    const card = (await resp.json()) as AgentCard;
    return { host, port, card };
  } catch (err) {
    // Beklenen/normal yol: cogu aday IP'de kimse dinlemiyor. Sadece
    // AbortError/ECONNREFUSED disinda bir sey olursa (beklenmeyen) logla.
    if (!(err instanceof Error) || err.name !== "AbortError") logErr("lan-discovery:probe", err);
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

async function runWithConcurrencyLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** Tüm yerel ağ arayüzlerindeki (Wi-Fi/hotspot/Tailscale) `/24` alt ağları
 * `port` üzerinden agent-card.json için tarar. */
export async function discoverLanAgents(port: number, opts: { timeoutMs?: number; concurrency?: number } = {}): Promise<DiscoveredAgent[]> {
  const networks = listLocalNetworks();
  const found: DiscoveredAgent[] = [];
  for (const net of networks) {
    const candidates = candidateIPs(net.address, net.prefixLength);
    const results = await runWithConcurrencyLimit(candidates, opts.concurrency ?? 32, (host) => probeAgentCard(host, port, opts.timeoutMs ?? 800));
    for (const r of results) if (r) found.push(r);
  }
  return found;
}
