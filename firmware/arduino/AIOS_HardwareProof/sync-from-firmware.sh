#!/usr/bin/env bash
# =============================================================================
# The sketch's src/ copies of the canonical firmware modules ARE committed and
# are authoritative for the build -- a fresh `git clone` + `arduino-cli compile`
# works with no setup step. This script keeps them in lock-step with the
# canonical sources at firmware/*.
#
#   (no args)   copy firmware/* -> src/   (developer convenience after edits)
#   --check     diff only; exit 1 on drift (CI / aios-verify.sh use this)
# =============================================================================
set -e
cd "$(dirname "$0")"

FILES="ra4m1_kernel.hpp ra4m1_kernel.cpp esp32s3_bridge.hpp esp32s3_bridge.cpp \
matrix_monitor.hpp matrix_monitor.cpp aios_quantum_kernel_test.cpp \
aios_mutation_test.cpp aios_chaos_test.cpp"

if [ "${1:-}" = "--check" ]; then
  drift=0
  for f in $FILES; do
    if ! diff -q "../../$f" "src/$f" >/dev/null 2>&1; then
      echo "DRIFT: src/$f != firmware/$f"; diff "../../$f" "src/$f" | head -8; drift=1
    fi
  done
  [ "$drift" = 0 ] && echo "src/ is in sync with canonical firmware sources" || {
    echo "run: bash $(basename "$0")   (then commit src/)"; exit 1; }
  exit 0
fi

for f in $FILES; do cp "../../$f" "src/$f"; done
echo "src/ synced from canonical firmware sources"
