/**
 * @file aios_bridge_e2e.h
 * @brief RA4M1 <-> ESP32-S3 wire-bridge end-to-end test harness (proof-only).
 *
 * Transport-agnostic: the same 8 tests run over a physical RA4M1 UART link
 * (Serial1, external D0<->D1 loopback) when one is present, otherwise over a
 * faithful in-memory byte transport. Each test is driven by a deterministic
 * hash-DRBG seed and reports an AiosWireError class, so a 100% result maps 1:1
 * to the real S3 link once that firmware exists.
 */
#ifndef AIOS_BRIDGE_E2E_H
#define AIOS_BRIDGE_E2E_H

#include <stdint.h>
#include <stdbool.h>
#include "ra4m1_kernel.hpp"
#include "esp32s3_bridge.hpp"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
    AIOS_LINK_MODELED = 0,   // in-memory UART-semantics transport
    AIOS_LINK_SERIAL1 = 1,   // physical RA4M1 SCI (D0/D1) external loopback
    AIOS_LINK_S3_UART = 2    // physical RA4M1 SCI (D0/D1) <-> ESP32-S3 running
                             // AIOS_S3_Bridge.ino (S3 replies status byte + echo)
} AiosBridgeLinkMode;

typedef struct {
    const char*  name;
    uint64_t     seed;
    bool         passed;
    uint32_t     error_code;    // AiosWireError the RA4M1 harness observed (0 = OK)
    uint32_t     expected_code; // primary AiosWireError the test asserts
    uint32_t     expected_alt;  // second valid AiosWireError (0xFF = none); e.g. T2
    uint32_t     detail;        // test-specific number (retries, bytes/s, us, ...)
    uint32_t     link_status;   // status byte reported by the S3 peer (0xFF = N/A)
    uint32_t     transport;     // AiosBridgeLinkMode the run used
} BridgeTestResult;

#define AIOS_BRIDGE_E2E_TESTS   (9)   // T0..T7 + T8 (golden-vector cross-validation)
#define AIOS_GOLDEN_VECTORS     (8)

// One frame-class golden vector: fixed bytes + the human-asserted verdict. The
// expected verdict is a hardcoded constant here (and in tools/gen_golden_vectors.py
// / tools/golden_vectors.txt) -- an INDEPENDENT reference, so if both
// aios_wire_verify() and the S3 wire_verify share a bug the golden truth still
// catches it.
typedef struct {
    const char*   name;
    uint8_t       bytes[32];
    uint16_t      len;          // 32, or 31 for the truncated class
    uint32_t      expected;     // AiosWireError
    bool          stateful;     // replay: only meaningful over a link with a guard
} AiosGoldenVector;

/** @brief Fill `out` with the 8 golden vectors (deterministic, no RNG). */
void aios_golden_vectors(AiosGoldenVector out[AIOS_GOLDEN_VECTORS]);

/**
 * @brief Probe whether a physical Serial1 loopback is wired (D0<->D1 jumper).
 * @return true if a byte written to Serial1 echoes back within a few ms.
 */
bool aios_bridge_probe_serial1(void);

/**
 * @brief Probe for an ESP32-S3 running AIOS_S3_Bridge.ino on Serial1: send one
 * STATUS_PROBE frame, expect a status byte (0) followed by the 32-byte echo.
 * @return true if the S3 answered the protocol.
 */
bool aios_bridge_probe_s3(void);

// Performance profile (physical S3 runs must report percentiles, not one mean).
typedef struct {
    uint32_t frames;
    uint32_t errors;
    uint32_t throughput_bytes_s;
    uint32_t lat_avg_us;
    uint32_t lat_p50_us;
    uint32_t lat_p95_us;
    uint32_t lat_p99_us;
    uint32_t lat_max_us;
} AiosBridgePerf;

/**
 * @brief Run the E2E suite (9 tests + perf) over the chosen link.
 * @param mode      AIOS_LINK_MODELED / AIOS_LINK_SERIAL1 / AIOS_LINK_S3_UART.
 * @param base_seed DRBG base seed (each test derives its own).
 * @param out       Caller array, AIOS_BRIDGE_E2E_TESTS entries.
 * @param perf      Out: throughput + latency percentiles (zeroed in smoke mode).
 * @return number of FAILED tests (0 == full pass).
 */
int aios_bridge_e2e_run(AiosBridgeLinkMode mode, uint64_t base_seed,
                        BridgeTestResult* out, AiosBridgePerf* perf);

#ifdef __cplusplus
}
#endif

#endif /* AIOS_BRIDGE_E2E_H */
