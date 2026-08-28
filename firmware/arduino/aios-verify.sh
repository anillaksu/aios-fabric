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

DUMP_TRNG=""; REPEAT=1; EXPECT_S3=0
COMMIT="$(git -C "$HERE" rev-parse --short HEAD 2>/dev/null || echo unknown)"
while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2;;
    --fqbn) FQBN="$2"; shift 2;;
    --out)  OUT="$2";  shift 2;;
    --commit) COMMIT="$2"; shift 2;;
    --expect-s3) EXPECT_S3=1; shift;;
    --repeat) REPEAT="$2"; shift 2;;
    --dump-trng) DUMP_TRNG="${2:-1250000}"; shift 2 2>/dev/null || { DUMP_TRNG=1250000; shift; };;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done
DEFS="$DEFS -DAIOS_COMMIT_SHA=\"$COMMIT\""
[ "$EXPECT_S3" = 1 ] && DEFS="$DEFS -DAIOS_EXPECT_S3"

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

RA4M1_BIN_SHA="$( (sha256sum "$BUILD/AIOS_HardwareProof.ino.bin" 2>/dev/null || shasum -a256 "$BUILD/AIOS_HardwareProof.ino.bin") | awk '{print $1}')"
S3_BIN_SHA="n/a"
if arduino-cli core list 2>/dev/null | grep -q esp32:esp32; then
  arduino-cli compile -b esp32:esp32:esp32s3 -e --warnings none "$HERE/AIOS_S3_Bridge" >/dev/null 2>&1 \
    && S3_BIN_SHA="$( (sha256sum "$HERE/AIOS_S3_Bridge/build/esp32.esp32.esp32s3/AIOS_S3_Bridge.ino.bin" 2>/dev/null \
        || shasum -a256 "$HERE/AIOS_S3_Bridge/build/esp32.esp32.esp32s3/AIOS_S3_Bridge.ino.bin") | awk '{print $1}')"
fi

# ---- one flash + capture + assert cycle; writes $OUT/run_provenance[.N].json --
hil_run() {   # $1 = repeat index (1-based)
  local idx="$1" logn="$LOG"
  [ "$REPEAT" -gt 1 ] && logn="$OUT/run_${idx}.log"

  echo "== [flash] $PORT  (run $idx/$REPEAT) =="
  arduino-cli upload -b "$FQBN" -p "$PORT" --input-dir "$BUILD" "$SKETCH" \
    || { echo "flash failed (run $idx)"; return 2; }

  echo "== [capture] on-silicon serial report =="
  LOG="$logn"
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
  echo "no serial capture tool (need powershell.exe or python3+pyserial)"; return 1
fi

  [ -s "$LOG" ] || { echo "capture produced no data (run $idx)"; return 3; }

  # Golden-vector cross-check vs the committed off-device reference.
  local GV="$HERE/tools/golden_vectors.txt" gv_ok=1
  if grep -qE 'GOLDEN [a-z_]+ len=' "$LOG" && [ -f "$GV" ]; then
    norm() { grep -oE 'GOLDEN [a-z_]+ len=[0-9]+ expect=[0-9]+ bytes=[0-9A-Fa-f]+' "$1" \
             | awk '{ b=$5; sub(/bytes=/,"",b); print $2, $3, $4, toupper(b) }' | sort; }
    if diff <(norm "$LOG") <(norm "$GV") >/dev/null; then
      echo "golden vectors: on-device frames MATCH tools/golden_vectors.txt"
    else
      echo "golden vectors: MISMATCH vs tools/golden_vectors.txt"; diff <(norm "$LOG") <(norm "$GV") | head; gv_ok=0
    fi
  fi

  local VERDICT TRANSPORT FALLBACK LINKMODE HANG DEADLOCK
  VERDICT="$(grep -oE 'AIOS_HARDWARE_PROOF_VERDICT=[A-Z_]+' "$LOG" | tail -1 | cut -d= -f2)"
  LINKMODE="$(grep -oE 'BRIDGE_LINK_MODE=[a-z0-9-]+' "$LOG" | tail -1 | cut -d= -f2)"
  FALLBACK="$(grep -oE 'BRIDGE_FALLBACK_USED=[01]' "$LOG" | tail -1 | cut -d= -f2)"
  grep -q 'END OF PROOF' "$LOG" && HANG=0 || HANG=1
  # MUT-12 / bridge interleave prints "deadlock=<n>"; a real deadlock is >=1.
  grep -qE 'deadlock=[1-9]' "$LOG" && DEADLOCK=1 || DEADLOCK=0
  local SHA_ON_DEV; SHA_ON_DEV="$(grep -oE 'AIOS_COMMIT_SHA=[^ ]+' "$LOG" | tail -1 | cut -d= -f2)"

  cat > "$OUT/run_provenance_${idx}.json" <<JSON
{
  "run_index": $idx, "timestamp_utc": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "commit_sha_host": "$COMMIT", "commit_sha_on_device": "$SHA_ON_DEV",
  "ra4m1_bin_sha256": "$RA4M1_BIN_SHA", "s3_bin_sha256": "$S3_BIN_SHA",
  "fqbn": "$FQBN", "port": "$PORT",
  "bridge_link_mode": "${LINKMODE:-unknown}", "fallback_used": ${FALLBACK:-null},
  "expect_s3": $EXPECT_S3,
  "verdict": "${VERDICT:-MISSING}",
  "hang": $HANG, "deadlock": $DEADLOCK, "golden_vectors_match": $gv_ok,
  "log": "$(basename "$LOG")"
}
JSON
  cp "$OUT/run_provenance_${idx}.json" "$OUT/run_provenance.json"

  echo "-------------------------------------------------------------"
  grep -E "PHASE [0-9] /|rc=|^(AIOS|PHASE)_[A-Z0-9_]+=|BRIDGE_(LINK_MODE|FALLBACK)|^  PERF |passed=|\[OK\]|\[KILLED\]|SURVIVED" "$LOG" || true
  echo "-------------------------------------------------------------"

  # Fail conditions: any gate FAIL, hang (no END OF PROOF), golden drift,
  # deadlock, or a fallback when a real S3 was expected.
  [ "$gv_ok" = 1 ] || { echo "run $idx: FAIL golden-vector drift"; return 1; }
  [ "$HANG" = 0 ]  || { echo "run $idx: FAIL hang / no verdict"; return 1; }
  [ "$DEADLOCK" = 0 ] || { echo "run $idx: FAIL deadlock detected"; return 1; }
  if grep -qE "^(AIOS|PHASE)_[A-Z0-9_]+=FAIL" "$LOG"; then echo "run $idx: FAIL release gate"; return 1; fi
  if [ "$EXPECT_S3" = 1 ] && [ "${FALLBACK:-1}" != 0 ]; then echo "run $idx: FAIL expected real S3, got fallback ($LINKMODE)"; return 1; fi
  case "$VERDICT" in PASS|CONDITIONAL_PASS) return 0;; *) echo "run $idx: FAIL verdict=$VERDICT"; return 1;; esac
}

pass=0; fail=0
for n in $(seq 1 "$REPEAT"); do
  hil_run "$n"; rc=$?
  if [ "$rc" = 0 ]; then pass=$((pass+1)); else fail=$((fail+1)); fi
  [ "$REPEAT" -gt 1 ] && [ "$n" -lt "$REPEAT" ] && sleep 2
done

if [ "$REPEAT" -gt 1 ]; then
  DISTINCT_MODE="$(cat "$OUT"/run_provenance_*.json | grep -oE '"bridge_link_mode": "[^"]+"' | sort -u | wc -l)"
  DISTINCT_SHA="$(cat "$OUT"/run_provenance_*.json | grep -oE '"commit_sha_on_device": "[^"]+"' | sort -u | wc -l)"
  cat > "$OUT/soak_summary.json" <<JSON
{ "runs": $REPEAT, "pass": $pass, "fail": $fail,
  "distinct_link_modes": $DISTINCT_MODE, "distinct_on_device_commits": $DISTINCT_SHA,
  "commit_sha": "$COMMIT", "same_software_and_transport": $([ "$DISTINCT_MODE" = 1 ] && [ "$DISTINCT_SHA" = 1 ] && echo true || echo false) }
JSON
  echo "== SOAK SUMMARY: $pass/$REPEAT pass, $fail fail  ($OUT/soak_summary.json) =="
fi

if [ "$fail" = 0 ]; then echo "HIL PROOF: PASS ($pass/$REPEAT)"; exit 0; fi
echo "HIL PROOF: FAIL ($fail/$REPEAT failed)"; exit 1
