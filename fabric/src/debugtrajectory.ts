// Ham prompt/yanit kaydi ac-kapa anahtari (2026-08-18, owner istegi).
//
// Owner: "ham prompt/yanit tutmak istiyorum ama istedigimde ac-kapa
// yapabilecegim bir sigortasi olmali." appicons.ts:NET_FLAG ile AYNI
// desen (dosya varligi = acik) - K10, yeni bir mekanizma icat edilmedi.
//
// KRITIK FARK: appicons.network bir CAPABILITY olarak da disa acik
// (risk:safe, model kendi karariyla acabilir - dusuk riskli). Bu anahtar
// KASITLI OLARAK capabilityMap'e HIC GIRMIYOR - yalnizca /debug-trajectory
// HTTP ucundan (insan arayuzu, Control Center) degistirilebilir. Gercek
// kullanicinin telefonundaki mesajlari/aramalari diske yazan bir anahtari
// LLM/A2A/MCP'nin kendi kendine acabilmesi kabul edilemez bir gizlilik
// riski - bu W1'in "onay katmanina ajan dokunmaz" ilkesinin bir uzantisi.

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { logErr } from "./log.ts";

const HOME = process.env.HOME ?? "/data/data/com.termux/files/home";
mkdirSync(`${HOME}/.cache`, { recursive: true });
const FLAG = `${HOME}/.cache/aios-debug-trajectory`;

export const isDebugTrajectoryEnabled = () => existsSync(FLAG);

export function setDebugTrajectory(on: boolean) {
  try {
    if (on) writeFileSync(FLAG, "1");
    else if (existsSync(FLAG)) unlinkSync(FLAG);
  } catch (err) { logErr("setDebugTrajectory", err); }
}
