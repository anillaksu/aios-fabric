import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Connectivity Bridge runit sshd supervisorunu ister ve dinleyici dogrulamadan basari yazmaz", () => {
  const script = readFileSync(new URL("../../scripts/aios-connectivity-bridge.sh", import.meta.url), "utf8");
  assert.match(script, /sv up "\$service"/);
  assert.match(script, /while \[ "\$attempt" -lt 8 \]/);
  assert.match(script, /sshd baslatma sonrasi 8022 dinleyicisi yok/);
  assert.match(script, /nc -z -w 1 127\.0\.0\.1 8022/);
  assert.match(script, /netstat -ltn/);
});
