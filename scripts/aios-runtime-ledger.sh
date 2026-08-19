#!/data/data/com.termux/files/usr/bin/bash
# AIOS Runtime Ledger — süreç süreksizliği için düşük maliyetli kanıt günlüğü.
#
# Bu betik Android'in hangi nedenle süreç öldürdüğünü UYDURMAZ. Onun yerine
# gözlenebilir tanık üretir: pid + /proc start tick + cmdline SHA-256 + ilgili
# kaynak SHA-256. Önceki tanıkla fark varsa started/replaced/missing olayını
# zincir-hashli günlüğe ekler. `observe` yalnız değişiklik yazar.
set -u

AIOS_HOME="${HOME:-/data/data/com.termux/files/home}"
LEDGER="$AIOS_HOME/aios-runtime-ledger.tsv"
STATE="$AIOS_HOME/.aios-runtime-ledger.state"
LOCK="$AIOS_HOME/.aios-runtime-ledger.lock"
MODE="${1:-snapshot}"
REASON="${2:-manual}"

mkdir -p "$AIOS_HOME"
exec 9>"$LOCK"
if ! flock -n 9; then
  printf 'LEDGER_BUSY\n' >&2
  exit 2
fi

hash_text() { printf '%s' "$1" | sha256sum | awk '{print $1}'; }
hash_file() { [ -r "$1" ] && sha256sum "$1" | awk '{print $1}' || printf '%s' '-'; }
now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }

pid_for() {
  case "$1" in
    fabric) pgrep -fo '^node .*src/server\.ts' || true ;;
    llm_bridge) pgrep -fo '^python3 -m uvicorn llm_bridge' || true ;;
    gateway) pgrep -fo 'hermes-agent/venv/bin/hermes gateway run' || true ;;
    watchdog) pgrep -fo "^bash $AIOS_HOME/watchdog\.sh$" || true ;;
    sshd) pgrep -fo 'runsv sshd|/libexec/sshd' || true ;;
  esac
}

source_for() {
  case "$1" in
    fabric) printf '%s' "$AIOS_HOME/fabric/src/server.ts" ;;
    watchdog) printf '%s' "$AIOS_HOME/watchdog.sh" ;;
    *) printf '%s' '' ;;
  esac
}

process_witness() {
  local role="$1" pid cmd start source source_hash cmd_hash
  pid="$(pid_for "$role")"
  if [ -z "$pid" ] || [ ! -r "/proc/$pid/stat" ]; then
    printf '%s\t%s\t%s\t%s\t%s\n' '-' '-' '-' '-' '-'
    return
  fi
  start="$(awk '{print $22}' "/proc/$pid/stat" 2>/dev/null || printf '%s' '?')"
  cmd="$(tr '\000' ' ' < "/proc/$pid/cmdline" 2>/dev/null || printf '%s' '?')"
  cmd_hash="$(hash_text "$cmd")"
  source="$(source_for "$role")"
  source_hash="$(hash_file "$source")"
  printf '%s\t%s\t%s\t%s\t%s\n' "$pid" "$start" "$cmd_hash" "$source_hash" "$(hash_text "$role|$pid|$start|$cmd_hash|$source_hash")"
}

previous_for() {
  [ -r "$STATE" ] || return 0
  awk -F '\t' -v role="$1" '$1 == role { print; exit }' "$STATE"
}

last_hash() {
  [ -r "$LEDGER" ] || { printf '%s' 'GENESIS'; return; }
  awk -F '\t' 'NF >= 11 { value=$11 } END { print value ? value : "GENESIS" }' "$LEDGER"
}

append_event() {
  local role="$1" status="$2" pid="$3" start="$4" cmd_hash="$5" source_hash="$6" witness="$7"
  local timestamp previous event_hash payload
  timestamp="$(now)"
  previous="$(last_hash)"
  payload="$timestamp|$REASON|$role|$status|$pid|$start|$cmd_hash|$source_hash|$witness|$previous"
  event_hash="$(hash_text "$payload")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$timestamp" "$REASON" "$role" "$status" "$pid" "$start" "$cmd_hash" "$source_hash" "$witness" "$previous" "$event_hash" >>"$LEDGER"
  printf '%-11s %-9s pid=%-6s start=%s witness=%s\n' "$role" "$status" "$pid" "$start" "${witness:0:12}"
}

write_state() {
  local tmp="$STATE.tmp.$$" role
  : >"$tmp"
  for role in fabric llm_bridge gateway watchdog sshd; do
    printf '%s\t%s\n' "$role" "$(process_witness "$role")" >>"$tmp"
  done
  mv "$tmp" "$STATE"
}

verify_chain() {
  local line timestamp reason role status pid start cmd source witness previous event payload expected expected_previous="GENESIS" n=0
  [ -r "$LEDGER" ] || { printf 'LEDGER_EMPTY\n'; return 1; }
  while IFS=$'\t' read -r timestamp reason role status pid start cmd source witness previous event; do
    [ -n "$event" ] || continue
    [ "$previous" = "$expected_previous" ] || {
      printf 'LEDGER_CHAIN_BREAK line=%s expected_previous=%s actual_previous=%s\n' "$((n + 1))" "$expected_previous" "$previous" >&2
      return 1
    }
    payload="$timestamp|$reason|$role|$status|$pid|$start|$cmd|$source|$witness|$previous"
    expected="$(hash_text "$payload")"
    [ "$event" = "$expected" ] || { printf 'LEDGER_INVALID line=%s\n' "$((n + 1))" >&2; return 1; }
    expected_previous="$event"
    n=$((n + 1))
  done <"$LEDGER"
  printf 'LEDGER_OK events=%s\n' "$n"
}

case "$MODE" in
  verify) verify_chain; exit $? ;;
  tail) tail -n "${2:-20}" "$LEDGER" 2>/dev/null || true; exit 0 ;;
  observe|snapshot) ;;
  *) printf 'KULLANIM: snapshot [neden] | observe [neden] | verify | tail [n]\n' >&2; exit 64 ;;
esac

for role in fabric llm_bridge gateway watchdog sshd; do
  IFS=$'\t' read -r pid start cmd_hash source_hash witness <<<"$(process_witness "$role")"
  previous="$(previous_for "$role")"
  IFS=$'\t' read -r _ old_pid old_start old_cmd old_source old_witness <<<"$previous"
  status="stable"
  if [ "$pid" = '-' ]; then
    [ -n "$old_pid" ] && [ "$old_pid" != '-' ] && status="missing"
  elif [ -z "$old_pid" ] || [ "$old_pid" = '-' ]; then
    status="started"
  elif [ "$witness" != "$old_witness" ]; then
    status="replaced"
  fi
  if [ "$MODE" = "snapshot" ] || [ "$status" != "stable" ]; then
    append_event "$role" "$status" "$pid" "$start" "$cmd_hash" "$source_hash" "$witness"
  fi
done
write_state
