import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

test("Connectivity Bridge runit sshd supervisorunu ister ve dinleyici dogrulamadan basari yazmaz", () => {
  // Kaynak depoda köprü üst scripts/ dizinindedir; Termux dağıtımında aynı
  // adapter Widget'ın çalıştırdığı ~/.shortcuts yolundadır. Test ikisini de
  // açıkça tanır, platformun yol düzenini ortak çekirdek varsayımı yapmaz.
  const candidates = [
    fileURLToPath(new URL("../../scripts/aios-connectivity-bridge.sh", import.meta.url)),
    join(homedir(), ".shortcuts", "aios-connectivity-bridge.sh"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  assert.ok(path, "Connectivity Bridge source veya deployed Widget adapter bulunamadı");
  const script = readFileSync(path, "utf8");
  assert.match(script, /sv up "\$service"/);
  assert.match(script, /while \[ "\$attempt" -lt 8 \]/);
  assert.match(script, /sshd baslatma sonrasi 8022 dinleyicisi yok/);
  assert.match(script, /nc -z -w 1 127\.0\.0\.1 8022/);
  assert.match(script, /netstat -ltn/);
});
