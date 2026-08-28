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
    AIOS_LINK_SERIAL1 = 1    // physical RA4M1 SCI (D0/D1) external loopback
} AiosBridgeLinkMode;

typedef struct {
    const char*  name;
    uint64_t     seed;
    bool         passed;
    uint32_t     error_code;    // AiosWireError observed (or 0)
    uint32_t     expected_code; // AiosWireError the test asserts
    uint32_t     detail;        // test-specific number (retries, bytes/s, us, ...)
} BridgeTestResult;

#define AIOS_BRIDGE_E2E_TESTS   (8)

/**
 * @brief Probe whether a physical Serial1 loopback is wired (D0<->D1 jumper).
 * @return true if a byte written to Serial1 echoes back within a few ms.
 */
bool aios_bridge_probe_serial1(void);

/**
 * @brief Run the 8-test E2E suite over the chosen link.
 * @param mode     AIOS_LINK_MODELED or AIOS_LINK_SERIAL1.
 * @param base_seed DRBG base seed (each test derives its own).
 * @param out      Caller array, AIOS_BRIDGE_E2E_TESTS entries.
 * @param tp_bytes_per_s  Out: measured throughput (test 8).
 * @param lat_us_per_frame Out: measured mean round-trip latency (test 8).
 * @return number of FAILED tests (0 == full pass).
 */
int aios_bridge_e2e_run(AiosBridgeLinkMode mode, uint64_t base_seed,
                        BridgeTestResult* out,
                        uint32_t* tp_bytes_per_s, uint32_t* lat_us_per_frame);

#ifdef __cplusplus
}
#endif

#endif /* AIOS_BRIDGE_E2E_H */
