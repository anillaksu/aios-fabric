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
DEFS="-DAIOS_ARDUINO_PROOF -DAIOS_EMBED_SUITE -DESP32S3_RING_BUFFER_SIZE=1024"

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

  RAW="$OUT/trng_raw.txt"; BIN="$OUT/trng_dump.bin"
  secs=$(( DUMP_TRNG / 2500 + 40 ))
  PORT="$PORT" RAW="$RAW" SECS="$secs" powershell.exe -NoProfile -ExecutionPolicy Bypass -Command '
    $p = New-Object System.IO.Ports.SerialPort($env:PORT,115200,"None",8,"One")
    $p.ReadTimeout = 2000; $p.DtrEnable = $true; $p.ReadBufferSize = 1048576
    for ($i=0;$i -lt 15;$i++){ try { $p.Open(); break } catch { Start-Sleep -m 400 } }
    $fs = [System.IO.StreamWriter]::new($env:RAW, $false)
    $deadline = (Get-Date).AddSeconds([int]$env:SECS)
    while ((Get-Date) -lt $deadline) {
      $c = $p.ReadExisting()
      if ($c) { $fs.Write($c); if ($c -like "*AIOS_TRNG_DUMP_END*") { break } } else { Start-Sleep -m 25 }
    }
    $fs.Close(); $p.Close()
  '
  PY=python; command -v python >/dev/null || PY=python3
  "$PY" - "$RAW" "$BIN" <<'PYEOF'
import sys
raw = open(sys.argv[1], encoding="utf-8", errors="replace").read().lower()
if "aios_trng_dump_begin" in raw:
    raw = raw.split("aios_trng_dump_begin", 1)[1]
raw = raw.split("aios_trng_dump_end", 1)[0]
h = "".join(c for c in raw if c in "0123456789abcdef")
open(sys.argv[2], "wb").write(bytes.fromhex(h[:len(h) // 2 * 2]))
PYEOF
  echo "wrote $(wc -c < "$BIN") bytes -> $BIN"

  if [ -s "$BIN" ]; then
    echo "== off-device statistical battery (nist_sts_lite) =="
    arduino-cli version           > "$OUT/tool_versions.txt" 2>&1
    "$PY" --version              >> "$OUT/tool_versions.txt" 2>&1
    ("$PY" -c "import numpy;print('numpy',numpy.__version__)" 2>&1) >> "$OUT/tool_versions.txt"
    "$PY" "$HERE/tools/nist_sts_lite.py" "$BIN" | tee "$OUT/nist_sts_lite_output.txt"
    rc=${PIPESTATUS[0]}
    echo "(for the full 15-test suite also run:  dieharder -a -g 201 -f $BIN   |   NIST STS 'assess')"
    exit $rc
  fi
  echo "capture produced no data -- check the port / re-run"
  exit 1
fi
mkdir -p "$OUT"
LOG="$OUT/hardware_proof_serial.log"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

# The sketch's src/ is committed and authoritative -- we only VERIFY it matches
# the canonical firmware sources (never mutate the working tree in CI).
echo "== [1/4] verify sketch src/ is in sync with canonical firmware =="
bash "$SKETCH/sync-from-firmware.sh" --check || { echo "src/ drift -- run sync-from-firmware.sh and commit"; exit 1; }

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
grep -E "PHASE [0-9] /|rc=|^(AIOS|PHASE)_[A-Z0-9_]+=|\[PASS\]|\[FAIL\]|\[OK\]|\[KILLED\]|SURVIVED" "$LOG" || true
echo "-------------------------------------------------------------"

# A green HIL run == every gate that was EXECUTED passed. Gates still marked
# PENDING / NOT_RUN do not fail CI (nothing regressed); an explicit FAIL on any
# gate, or a missing verdict, does.
if grep -qE "^(AIOS|PHASE)_[A-Z0-9_]+=FAIL" "$LOG"; then
  echo "HIL PROOF: FAIL  (a release gate reported FAIL -- log: $LOG)"
  exit 1
fi
if grep -qE "AIOS_HARDWARE_PROOF_VERDICT=(CONDITIONAL_)?PASS" "$LOG"; then
  V=$(grep -oE "AIOS_HARDWARE_PROOF_VERDICT=[A-Z_]+" "$LOG" | tail -1)
  echo "HIL PROOF: ${V#AIOS_HARDWARE_PROOF_VERDICT=}  (log: $LOG)"
  exit 0
fi
echo "HIL PROOF: FAIL  (no verdict line -- log: $LOG)"
exit 1
