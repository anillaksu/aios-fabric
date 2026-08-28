#!/usr/bin/env bash
# Regenerate src/ from the canonical firmware sources (../../*). Run after editing them.
set -e
cd "$(dirname "$0")"
cp ../../ra4m1_kernel.hpp ../../ra4m1_kernel.cpp \
   ../../esp32s3_bridge.hpp ../../esp32s3_bridge.cpp \
   ../../matrix_monitor.hpp ../../matrix_monitor.cpp \
   ../../aios_quantum_kernel_test.cpp ../../aios_mutation_test.cpp \
   ../../aios_chaos_test.cpp \
   src/
echo "src/ synced from canonical firmware sources"
