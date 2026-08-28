#!/usr/bin/env bash
# =============================================================================
# aios-verify.sh -- Hardware-in-the-Loop proof runner for the AIOS kernel.
#
# Syncs the sketch from canonical firmware, builds it, flashes a physically
# attached Arduino UNO R4 WiFi (real Renesas RA4M1 + ESP32-S3), captures the
# on-silicon serial report and asserts AIOS_HARDWARE_PROOF_VERDICT=PASS.
#
# Exit 0  -> real hardware passed all 4 phases
# Exit 1  -> build / flash / capture failure or VERDICT != PASS
#
# Usage:  ./aios-verify.sh [--port COM4] [--fqbn arduino:renesas_uno:unor4wifi]
#                          [--out artifacts/hil]
# Env:    AIOS_HIL_PORT, AIOS_HIL_FQBN can substitute for the flags.
# Requires: arduino-cli (+ arduino:renesas_uno core), PowerShell (Windows runner)
#           or python3 with pyserial (Linux/macOS runner).
# =============================================================================
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SKETCH="$HERE/AIOS_HardwareProof"
PORT="${AIOS_HIL_PORT:-COM4}"
FQBN="${AIOS_HIL_FQBN:-arduino:renesas_uno:unor4wifi}"
OUT="$HERE/artifacts/hil"
DEFS="-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=4096"

DUMP_TRNG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    --fqbn) FQBN="$2"; shift 2;;
    --out)  OUT="$2";  shift 2;;
    --dump-trng) DUMP_TRNG="${2:-1250000}"; shift 2 2>/dev/null || { DUMP_TRNG=1250000; shift; };;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

# ---- --dump-trng: flash the dump sketch, capture raw TRNG for off-device STS --
if [ -n "$DUMP_TRNG" ]; then
  mkdir -p "$OUT"
  echo "== dump-trng: $DUMP_TRNG bytes of SCE5 TRNG for off-device NIST STS / dieharder =="
  arduino-cli compile -b "$FQBN" -e --warnings none \
    --build-property "compiler.cpp.extra_flags=-DAIOS_TRNG_DUMP_BYTES=${DUMP_TRNG}UL" \
    "$HERE/AIOS_TrngDump" || exit 1
  DB="$HERE/AIOS_TrngDump/build/$(echo "$FQBN" | tr ':' '.')"
  arduino-cli upload -b "$FQBN" -p "$PORT" --input-dir "$DB" "$HERE/AIOS_TrngDump" || exit 1
  HEX="$OUT/trng_dump.hex"; BIN="$OUT/trng_dump.bin"
  secs=$(( DUMP_TRNG / 4000 + 30 ))
  PORT="$PORT" HEX="$HEX" SECS="$secs" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
    $p = New-Object System.IO.Ports.SerialPort($env:PORT,115200,"None",8,"One")
    $p.ReadTimeout = 4000; $p.DtrEnable = $true
    for ($i=0;$i -lt 10;$i++){ try { $p.Open(); break } catch { Start-Sleep -m 500 } }
    $sw = [System.IO.StreamWriter]::new($env:HEX)
    $deadline = (Get-Date).AddSeconds([int]$env:SECS)
    $started = $false
    while ((Get-Date) -lt $deadline) {
      try { $line = $p.ReadLine() } catch { continue }
      if ($line -match "AIOS_TRNG_DUMP_END") { break }
      if ($started) { $sw.Write(($line -replace "[^0-9a-f]","")) }
      if ($line -match "AIOS_TRNG_DUMP_BEGIN") { $started = $true }
    }
    $sw.Close(); $p.Close()
  '
  python3 - "$HEX" "$BIN" <<'PY' 2>/dev/null || xxd -r -p "$HEX" > "$BIN"
import sys
h = open(sys.argv[1]).read().strip()
open(sys.argv[2], "wb").write(bytes.fromhex(h[:len(h)//2*2]))
PY
  echo "wrote $(wc -c < "$BIN") bytes -> $BIN"
  echo "next:  dieharder -a -g 201 -f $BIN     |     assess -f $BIN   (NIST STS)"
  exit 0
fi
mkdir -p "$OUT"
LOG="$OUT/hardware_proof_serial.log"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

echo "== [1/4] sync sketch from canonical firmware =="
bash "$SKETCH/sync-from-firmware.sh" || { echo "sync failed"; exit 1; }

echo "== [2/4] compile ($FQBN) =="
arduino-cli compile -b "$FQBN" -e --warnings none \
  --build-property "compiler.cpp.extra_flags=$DEFS" \
  --build-property "compiler.c.extra_flags=$DEFS" \
  "$SKETCH" || { echo "compile failed"; exit 1; }

BUILD="$SKETCH/build/$(echo "$FQBN" | tr ':' '.')"
cp "$BUILD"/AIOS_HardwareProof.ino.{bin,hex,map} "$OUT/" 2>/dev/null || true

echo "== [3/4] flash $PORT =="
arduino-cli upload -b "$FQBN" -p "$PORT" --input-dir "$BUILD" "$SKETCH" \
  || { echo "flash failed"; exit 1; }

echo "== [4/4] capture on-silicon serial report =="
if command -v powershell.exe >/dev/null 2>&1; then
  PORT="$PORT" LOG="$LOG" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
    $p = New-Object System.IO.Ports.SerialPort($env:PORT,115200,"None",8,"One")
    $p.ReadTimeout = 1500; $p.DtrEnable = $true; $p.RtsEnable = $true
    for ($i=0;$i -lt 10;$i++){ try { $p.Open(); break } catch { Start-Sleep -m 500 } }
    $sb = New-Object System.Text.StringBuilder
    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
      try { $c=$p.ReadExisting(); if($c){[void]$sb.Append($c)} else {Start-Sleep -m 80} } catch {}
      if ($sb.ToString().Contains("END OF PROOF")) { Start-Sleep -m 300; try {[void]$sb.Append($p.ReadExisting())} catch {}; break }
    }
    $p.Close()
    ($sb.ToString() -replace "`r","" -replace "\[STDERR\] ","") | Set-Content -Path $env:LOG -Encoding UTF8
  '
elif command -v python3 >/dev/null 2>&1; then
  AIOS_PORT="$PORT" AIOS_LOG="$LOG" python3 - <<'PY'
import os, time, serial
p = serial.Serial(os.environ["AIOS_PORT"], 115200, timeout=1.5)
p.setDTR(True); p.setRTS(True)
buf = b""; end = time.time() + 45
while time.time() < end:
    buf += p.read(4096)
    if b"END OF PROOF" in buf: time.sleep(0.3); buf += p.read(8192); break
p.close()
open(os.environ["AIOS_LOG"], "w", encoding="utf-8").write(
    buf.decode("utf-8", "replace").replace("\r", "").replace("[STDERR] ", ""))
PY
else
  echo "no serial capture tool (need powershell.exe or python3+pyserial)"; exit 1
fi

cp "$LOG" "$OUT/hardware_proof_serial_${STAMP}.log" 2>/dev/null || true

echo "-------------------------------------------------------------"
grep -E "PHASE [0-9] /|rc=|AIOS_HARDWARE_PROOF_VERDICT|\[PASS\]|\[FAIL\]|\[OK\]|\[KILLED\]" "$LOG" || true
echo "-------------------------------------------------------------"

if grep -q "AIOS_HARDWARE_PROOF_VERDICT=PASS" "$LOG"; then
  echo "HIL PROOF: PASS  (log: $LOG)"
  exit 0
fi
echo "HIL PROOF: FAIL  (log: $LOG)"
exit 1
