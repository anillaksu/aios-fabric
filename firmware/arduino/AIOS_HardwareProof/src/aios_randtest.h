/**
 * @file aios_randtest.h
 * @brief Compact on-device statistical randomness battery (NIST SP 800-22 subset).
 *
 * Proof-harness only (not canonical firmware). Runs entirely on the RA4M1 with
 * closed-form p-values (erfc + a small regularized incomplete gamma). A stream
 * passes a test when its p-value >= AIOS_RANDTEST_ALPHA (0.01, the NIST default).
 */
#ifndef AIOS_RANDTEST_H
#define AIOS_RANDTEST_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

#define AIOS_RANDTEST_ALPHA   (0.01)
#define AIOS_RANDTEST_MAX     (14)

typedef struct {
    const char* name;
    double      statistic;
    double      p_value;
    bool        applicable;
    bool        pass;
} AiosRandTestResult;

/**
 * @brief Run the battery over `nbytes` of raw entropy.
 * @param data     Entropy buffer.
 * @param nbytes   Length (>= 512 recommended; 4096 gives 32768 bits).
 * @param out      Caller array, AIOS_RANDTEST_MAX entries.
 * @param count    Out: number of results written.
 * @return Number of FAILED (applicable) tests. 0 == full pass.
 */
int aios_randtest_run(const uint8_t* data, uint32_t nbytes,
                      AiosRandTestResult* out, int* count);

#ifdef __cplusplus
}
#endif

#endif /* AIOS_RANDTEST_H */
