/**
 * AIOS_HardwareProof.ino
 * -----------------------------------------------------------------------------
 * On-silicon verification harness for the AIOS High-Determinism Quantum State
 * Machine Kernel, executed on the REAL Renesas RA4M1 (R7FA4M1AB3CFM) of an
 * Arduino UNO R4 WiFi -- the RA4M1 + ESP32-S3 heterogeneous target named in the
 * project README and CANONICAL_VERIFICATION_REPORT.json.
 *
 * PHASE 1  aios_run_verification_suite()  -- 5 canonical checks   (mock HW root)
 * PHASE 2  aios_run_mutation_suite()      -- 6 adversarial kills   (mock HW root)
 * PHASE 3  test_real_hw_root_of_truth()   -- TEST-02 + MUT-03 re-proven against
 *          the GENUINE factory 128-bit Unique ID (FSP R_BSP_UniqueIdGet()).
 * PHASE 4  test_hw_trng()                 -- RA4M1 SCE5 hardware TRNG integrated
 *          into the Root of Truth + NIST SP 800-22 subset (11 tests) run
 *          on-device over 16384 live TRNG bits.
 * PHASE 5  test_csprng()                  -- deterministic hash-DRBG seeded from
 *          the TRNG: determinism, seed sensitivity, backtracking resistance,
 *          device binding, and the NIST subset on its output.
 * PHASE 6  aios_run_chaos_suite()         -- DRBG-driven high-volume abuse:
 *          MUT-07..13 (truncation, oversize, replay, fuzz bursts, timing chaos,
 *          locked-slot fuzzing).
 * PHASE 7  test_bridge_e2e()              -- RA4M1<->ESP32-S3 wire-bridge E2E:
 *          framing/CRC, truncation, oversize, in-transit corruption, timeout+
 *          retry, replay rejection, fault-storm recovery, throughput/latency --
 *          over a physical RA4M1 SCI loopback if present, else a modeled link.
 *
 * Emits a RELEASE GATES block and AIOS_HARDWARE_PROOF_VERDICT (PASS if every
 * gate ran and passed; CONDITIONAL_PASS while AIOS_ESP32S3_BRIDGE_E2E is still
 * PENDING -- i.e. bridge firmware not yet running on real S3 silicon).
 *
 * Build flags (via --build-property; build_opt.h is advisory for this core):
 *   -DAIOS_ARDUINO_PROOF  -DAIOS_EMBED_SUITE  -DESP32S3_RING_BUFFER_SIZE=1024
 * -----------------------------------------------------------------------------
 */

#include <Arduino.h>       // -> bsp_api.h : R_BSP_UniqueIdGet(), bsp_unique_id_t
#include <stdio.h>
#include <string.h>

#include "src/ra4m1_kernel.hpp"
#include "src/aios_randtest.h"
#include "src/aios_bridge_e2e.h"

int aios_run_verification_suite(void);
int aios_run_mutation_suite(void);
int aios_run_chaos_suite(void);

// Renesas SCE5 hardware TRNG (same primitive the Arduino core uses for random())
extern "C" {
  fsp_err_t HW_SCE_McuSpecificInit(void);
  fsp_err_t HW_SCE_RNG_Read(uint32_t * out4);
}

// --- Retarget C stdio (printf / fprintf(stderr,...)) onto USB-CDC Serial ------
extern "C" int _write(int file, char *ptr, int len) {
  if (ptr == nullptr || len <= 0) return 0;
  static bool at_line_start = true;
  const bool is_err = (file == 2);
  for (int i = 0; i < len; ++i) {
    if (at_line_start && is_err) Serial.print(F("[STDERR] "));
    char c = ptr[i];
    Serial.write((uint8_t)c);
    at_line_start = (c == '\n');
  }
  return len;
}

static void banner(const char *msg) {
  Serial.println();
  Serial.println(F("################################################################"));
  Serial.print(F("#  ")); Serial.println(msg);
  Serial.println(F("################################################################"));
  Serial.println();
}

static int popcount64(uint64_t v) { int n = 0; while (v) { v &= (v - 1); ++n; } return n; }

static void print_p(const char *label, double stat, double p, bool applicable, bool pass) {
  char b[112];
  if (!applicable) {
    snprintf(b, sizeof(b), "  [n/a ] %-30s (prerequisite not met)", label);
  } else {
    // print p with 6 decimals via integer math (newlib-nano %f is unreliable)
    long pm = (long)(p * 1000000.0 + 0.5);
    if (pm > 1000000) pm = 1000000;
    long sm = (long)(stat * 1000.0 + 0.5);
    snprintf(b, sizeof(b), "  [%s] %-30s stat=%ld.%03ld  p=%ld.%06ld",
             pass ? "PASS" : "FAIL", label, sm / 1000, sm % 1000, pm / 1000000, pm % 1000000);
  }
  Serial.println(b);
}

// -----------------------------------------------------------------------------
static uint64_t g_uid_lo = 0, g_uid_hi = 0;

static void read_real_hw_uid(uint32_t w[4]) {
  const bsp_unique_id_t *uid = R_BSP_UniqueIdGet();
  for (int i = 0; i < 4; ++i) w[i] = uid->unique_id_words[i];
  g_uid_lo = ((uint64_t)w[1] << 32) | (uint64_t)w[0];
  g_uid_hi = ((uint64_t)w[3] << 32) | (uint64_t)w[2];
}

// One 128-bit hardware TRNG draw -> (lo, hi). Returns false on SCE error.
static bool trng_draw(uint64_t *lo, uint64_t *hi) {
  static bool inited = false;
  if (!inited) {
    if (HW_SCE_McuSpecificInit() != FSP_SUCCESS) return false;
    inited = true;
  }
  uint32_t v[4];
  if (HW_SCE_RNG_Read(v) != FSP_SUCCESS) return false;
  *lo = ((uint64_t)v[1] << 32) | (uint64_t)v[0];
  *hi = ((uint64_t)v[3] << 32) | (uint64_t)v[2];
  return true;
}

// =============================================================================
// PHASE 3 -- Hardware Root of Truth on the REAL silicon identity
// =============================================================================
static int g_fail = 0;
#define CHK(cond, label)                                               \
  do { bool _ok = (cond);                                              \
       Serial.print(_ok ? F("  [OK]   ") : F("  [FAIL] "));            \
       Serial.println(F(label));                                       \
       if (!_ok) g_fail++; } while (0)

static int test_real_hw_root_of_truth(void) {
  g_fail = 0;
  uint32_t w[4];
  read_real_hw_uid(w);

  char b[100];
  snprintf(b, sizeof(b), "  FSP R_BSP_UniqueIdGet(): %08lX %08lX %08lX %08lX",
           (unsigned long)w[0], (unsigned long)w[1], (unsigned long)w[2], (unsigned long)w[3]);
  Serial.println(b);

  CHK((g_uid_lo | g_uid_hi) != 0ULL, "Factory Unique ID is non-zero (real silicon identity)");

  static AiosKernelStorage kA, kB;
  aios_kernel_init_with_uid(&kA, g_uid_lo, g_uid_hi);
  aios_kernel_init_with_uid(&kB, g_uid_lo, g_uid_hi);
  CHK(kA.root_of_truth.baseline_constant == kB.root_of_truth.baseline_constant,
      "Identical real UID -> identical baseline (Variance = 0)");
  CHK(kA.root_of_truth.baseline_constant != 0ULL, "Real-UID baseline is non-zero");

  const uint64_t mock_baseline =
      0x41494F535F524134ULL ^ 0x4D315F554E495131ULL ^ 0xA5A55A5AA5A55A5AULL;
  CHK(kA.root_of_truth.baseline_constant != mock_baseline, "Real-UID baseline != mock/CI baseline");

  const uint64_t contract = 0xFEEDBEEFCAFE0001ULL;
  uint64_t sA = aios_quantum_transition(&kA, AGENT_ID_HERMES, contract);
  uint64_t sB = aios_quantum_transition(&kB, AGENT_ID_HERMES, contract);
  CHK(sA == sB, "Identical transition on real root -> identical state (Variance = 0)");
  CHK(sA != contract, "Quantum transition performs non-linear mixing");

  static AiosKernelStorage kForge;
  aios_kernel_init_with_uid(&kForge, g_uid_lo, g_uid_hi);
  uint64_t sForge = aios_quantum_transition(&kForge, AGENT_ID_HERMES, contract ^ 1ULL);
  int hd = popcount64(sA ^ sForge);
  snprintf(b, sizeof(b), "  1-bit contract forgery -> Hamming distance = %d bits (need >= 20)", hd);
  Serial.println(b);
  CHK(hd >= 20, "MUT-03 on real root: forged contract diverges via avalanche");

  static AiosKernelStorage kOther;
  aios_kernel_init_with_uid(&kOther, g_uid_lo ^ 0xA5A5A5A5A5A5A5A5ULL, g_uid_hi ^ 0x5A5A5A5A5A5A5A5AULL);
  CHK(aios_quantum_transition(&kOther, AGENT_ID_HERMES, contract) != sA,
      "Different device identity -> different quantum state for same input");

  return (g_fail == 0) ? 0 : 1;
}

// =============================================================================
// PHASE 4 -- SCE5 hardware TRNG: Root-of-Truth fusion + NIST SP 800-22 subset
// =============================================================================
static uint8_t g_trng_buf[2048];   // 16384 live TRNG bits
static AiosRandTestResult g_rt[AIOS_RANDTEST_MAX];

static int test_hw_trng(void) {
  g_fail = 0;

  // 4a. Collect 4096 bytes = 256 draws of 128 bits straight from the SCE5 TRNG.
  uint32_t got = 0;
  uint64_t first_lo = 0, first_hi = 0, second_lo = 0, second_hi = 0;
  bool draw_ok = true;
  for (uint32_t off = 0; off < sizeof(g_trng_buf) && draw_ok; off += 16) {
    uint64_t lo, hi;
    draw_ok = trng_draw(&lo, &hi);
    if (!draw_ok) break;
    memcpy(&g_trng_buf[off + 0], &lo, 8);
    memcpy(&g_trng_buf[off + 8], &hi, 8);
    if (off == 0)  { first_lo = lo;  first_hi = hi; }
    if (off == 16) { second_lo = lo; second_hi = hi; }
    got = off + 16;
  }
  char b[100];
  snprintf(b, sizeof(b), "  SCE5 TRNG collected %lu bytes (%lu bits)", (unsigned long)got, (unsigned long)got * 8);
  Serial.println(b);
  snprintf(b, sizeof(b), "  draw[0]=%08lX%08lX%08lX%08lX",
           (unsigned long)(first_hi >> 32), (unsigned long)first_hi,
           (unsigned long)(first_lo >> 32), (unsigned long)first_lo);
  Serial.println(b);
  CHK(draw_ok && got == sizeof(g_trng_buf), "SCE5 hardware TRNG readable (HW_SCE_RNG_Read)");
  CHK(!(first_lo == second_lo && first_hi == second_hi), "Consecutive TRNG draws differ");

  // 4b. NIST SP 800-22 subset battery, on-device.
  Serial.println(F("  --- NIST SP 800-22 subset (alpha = 0.01, on-silicon) ---"));
  int cnt = 0;
  int failed = aios_randtest_run(g_trng_buf, sizeof(g_trng_buf), g_rt, &cnt);
  for (int i = 0; i < cnt; ++i)
    print_p(g_rt[i].name, g_rt[i].statistic, g_rt[i].p_value, g_rt[i].applicable, g_rt[i].pass);
  {
    char bb[64];
    snprintf(bb, sizeof(bb), "  (%d NIST SP 800-22 subset tests executed on-silicon)", cnt);
    Serial.println(bb);
  }
  CHK(failed == 0, "NIST subset batch verdict OK (multiple-comparison aware)");

  // 4c. Fuse the live entropy into the Hardware Root of Truth.
  uint64_t e1_lo, e1_hi, e2_lo, e2_hi;
  bool e_ok = trng_draw(&e1_lo, &e1_hi) && trng_draw(&e2_lo, &e2_hi);
  CHK(e_ok, "Fetched two independent entropy samples for Root-of-Truth fusion");

  static AiosKernelStorage kNoEnt, kEnt1, kEnt1b, kEnt2;
  aios_kernel_init_with_uid(&kNoEnt, g_uid_lo, g_uid_hi);
  aios_kernel_init_hw(&kEnt1,  g_uid_lo, g_uid_hi, 0ULL, 0ULL);
  CHK(kEnt1.root_of_truth.baseline_constant == kNoEnt.root_of_truth.baseline_constant,
      "init_hw(entropy=0) is bit-identical to init_with_uid (invariant)");

  aios_kernel_init_hw(&kEnt1,  g_uid_lo, g_uid_hi, e1_lo, e1_hi);
  aios_kernel_init_hw(&kEnt1b, g_uid_lo, g_uid_hi, e1_lo, e1_hi);
  aios_kernel_init_hw(&kEnt2,  g_uid_lo, g_uid_hi, e2_lo, e2_hi);
  CHK(kEnt1.root_of_truth.baseline_constant != kNoEnt.root_of_truth.baseline_constant,
      "Live entropy actually changes the baseline (per-boot unpredictability)");
  CHK(kEnt1.root_of_truth.baseline_constant != kEnt2.root_of_truth.baseline_constant,
      "Different entropy samples -> different baseline");
  CHK(kEnt1.root_of_truth.baseline_constant == kEnt1b.root_of_truth.baseline_constant,
      "Same (uid, entropy) -> same baseline: transition fn stays Variance = 0 for a fixed root");

  const uint64_t c = 0x0123456789ABCDEFULL;
  uint64_t t1  = aios_quantum_transition(&kEnt1,  AGENT_ID_FABRIC_ORCH, c);
  uint64_t t1b = aios_quantum_transition(&kEnt1b, AGENT_ID_FABRIC_ORCH, c);
  uint64_t t2  = aios_quantum_transition(&kEnt2,  AGENT_ID_FABRIC_ORCH, c);
  CHK(t1 == t1b, "Fixed entropy-seeded root -> deterministic state transition");
  CHK(t1 != t2,  "Entropy-seeded roots produce independent state spaces");

  return (g_fail == 0) ? 0 : 1;
}

// =============================================================================
// PHASE 5 -- Deterministic hash-DRBG (CSPRNG) seeded from the SCE5 TRNG
// =============================================================================
static int test_csprng(void) {
  g_fail = 0;

  static AiosKernelStorage kr;
  aios_kernel_init_with_uid(&kr, g_uid_lo, g_uid_hi);

  uint64_t s_lo = 0, s_hi = 0;
  bool s_ok = trng_draw(&s_lo, &s_hi);
  CHK(s_ok, "Fetched a TRNG seed for the DRBG");

  // Determinism: same (root, seed) -> identical stream.
  AiosPrng a, b;
  aios_prng_seed(&a, &kr, s_lo, s_hi);
  aios_prng_seed(&b, &kr, s_lo, s_hi);
  bool same = true;
  for (int i = 0; i < 64; ++i) if (aios_prng_next64(&a) != aios_prng_next64(&b)) same = false;
  CHK(same, "Same (root, seed) -> bit-identical DRBG stream (Variance = 0)");

  // Different seed -> different stream.
  AiosPrng c;
  aios_prng_seed(&c, &kr, s_lo ^ 1ULL, s_hi);
  aios_prng_seed(&a, &kr, s_lo, s_hi);
  CHK(aios_prng_next64(&a) != aios_prng_next64(&c), "1-bit seed change -> different stream");

  // Backtracking resistance: a captured mid-stream state cannot reproduce
  // earlier output (key folds forward on every draw).
  aios_prng_seed(&a, &kr, s_lo, s_hi);
  uint64_t first = aios_prng_next64(&a);
  for (int i = 0; i < 32; ++i) (void)aios_prng_next64(&a);
  AiosPrng snap = a;                      // attacker captures state here
  bool leaked = false;
  for (int i = 0; i < 64; ++i) if (aios_prng_next64(&snap) == first) leaked = true;
  CHK(!leaked, "Captured mid-stream state does not re-emit earlier blocks");

  // Statistical quality: run the NIST subset on DRBG output.
  aios_prng_seed(&a, &kr, s_lo, s_hi);
  aios_prng_fill(&a, g_trng_buf, sizeof(g_trng_buf));
  int cnt = 0;
  int failed = aios_randtest_run(g_trng_buf, sizeof(g_trng_buf), g_rt, &cnt);
  Serial.println(F("  --- NIST SP 800-22 subset on DRBG output ---"));
  for (int i = 0; i < cnt; ++i)
    print_p(g_rt[i].name, g_rt[i].statistic, g_rt[i].p_value, g_rt[i].applicable, g_rt[i].pass);
  CHK(failed == 0, "DRBG output passes the NIST subset batch verdict");

  // Device binding: same seed on a different identity -> different stream.
  static AiosKernelStorage kr2;
  aios_kernel_init_with_uid(&kr2, g_uid_lo ^ 0xFFFFFFFFFFFFFFFFULL, g_uid_hi);
  AiosPrng d;
  aios_prng_seed(&d, &kr2, s_lo, s_hi);
  aios_prng_seed(&a, &kr, s_lo, s_hi);
  CHK(aios_prng_next64(&a) != aios_prng_next64(&d),
      "Same seed, different device root -> different DRBG stream");

  return (g_fail == 0) ? 0 : 1;
}

// =============================================================================
// PHASE 7 -- RA4M1 <-> ESP32-S3 wire-bridge END-TO-END
// =============================================================================
static BridgeTestResult g_bridge[AIOS_BRIDGE_E2E_TESTS];

static const char* wire_err_name(uint32_t e) {
  switch (e) {
    case AIOS_WIRE_OK: return "OK";
    case AIOS_WIRE_ERR_LENGTH: return "ERR_LENGTH";
    case AIOS_WIRE_ERR_MAGIC: return "ERR_MAGIC";
    case AIOS_WIRE_ERR_AGENT: return "ERR_AGENT";
    case AIOS_WIRE_ERR_MSGTYPE: return "ERR_MSGTYPE";
    case AIOS_WIRE_ERR_LENRANGE: return "ERR_LENRANGE";
    case AIOS_WIRE_ERR_CRC: return "ERR_CRC";
    case AIOS_WIRE_ERR_REPLAY: return "ERR_REPLAY";
    case AIOS_WIRE_ERR_TIMEOUT: return "ERR_TIMEOUT";
    case 0xFE: return "count(0=pass)";
    case 0xFF: return "n/a";
    default: return "ERR_?";
  }
}

static bool g_bridge_on_real_s3 = false;

static int test_bridge_e2e(void) {
  g_fail = 0;

  AiosBridgeLinkMode mode;
  const char* tag;
  g_bridge_on_real_s3 = aios_bridge_probe_s3();
  if (g_bridge_on_real_s3) {
    mode = AIOS_LINK_S3_UART;  tag = "[phys-S3]";
  } else if (aios_bridge_probe_serial1()) {
    mode = AIOS_LINK_SERIAL1;  tag = "[phys-SCI]";
  } else {
    mode = AIOS_LINK_MODELED;  tag = "[link-model]";
  }
  Serial.print(F("  Link: "));
  Serial.println(
      mode == AIOS_LINK_S3_UART ? F("PHYSICAL RA4M1 SCI <-> ESP32-S3 (AIOS_S3_Bridge.ino)")
    : mode == AIOS_LINK_SERIAL1 ? F("PHYSICAL RA4M1 SCI (Serial1, D0<->D1 external loopback)")
    :                             F("MODELED in-memory UART transport (no physical link detected)"));
  Serial.println(F("  SCOPE: proves the 32-byte wire protocol + link layer (framing, CRC,"));
  Serial.println(F("         timeout/retry, replay window, error classification, recovery)."));
  Serial.println(F("  NOT PROVEN HERE: bridge firmware on real ESP32-S3 silicon over a real"));
  Serial.println(F("         R4<->S3 SPI/UART link  ->  gate PHASE7_REAL_S3_SILICON_E2E=PENDING."));
  Serial.print  (F("  All counts / throughput below are qualified ")); Serial.println(tag);

  uint32_t tp = 0, lat = 0;
  int failed = aios_bridge_e2e_run(mode, 0xB19D6E2EULL, g_bridge, &tp, &lat);

  static const char* const link_name[] = { "link-model", "phys-SCI", "phys-S3" };
  for (int i = 0; i < AIOS_BRIDGE_E2E_TESTS; ++i) {
    const BridgeTestResult* r = &g_bridge[i];
    char expc[32];
    if (r->expected_alt != 0xFF)
      snprintf(expc, sizeof(expc), "{%s,%s}", wire_err_name(r->expected_code), wire_err_name(r->expected_alt));
    else
      snprintf(expc, sizeof(expc), "{%s}", wire_err_name(r->expected_code));
    char s3[24] = "";
    if (r->link_status != 0xFF)
      snprintf(s3, sizeof(s3), " s3_status=%s", wire_err_name(r->link_status));
    char b[168];
    snprintf(b, sizeof(b),
      "  %-33s transport=%-10s expected=%-22s observed=%-11s detail=%lu passed=%d%s",
      r->name,
      link_name[r->transport <= 2 ? r->transport : 0],
      expc, wire_err_name(r->error_code),
      (unsigned long)r->detail, r->passed ? 1 : 0, s3);
    Serial.println(b);
  }
  {
    char b[112];
    snprintf(b, sizeof(b), "  %s benchmark: throughput ~ %lu bytes/s   latency ~ %lu us / 32B frame",
             tag, (unsigned long)tp, (unsigned long)lat);
    Serial.println(b);
  }
  CHK(failed == 0, "All 9 bridge tests pass over the wire protocol + link layer");
  return (g_fail == 0) ? 0 : 1;
}

// =============================================================================
void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0) < 8000) { }
  setvbuf(stdout, nullptr, _IONBF, 0);
  setvbuf(stderr, nullptr, _IONBF, 0);
  delay(3500);

  banner("AIOS ON-SILICON HARDWARE PROOF  |  Renesas RA4M1 @ 48 MHz");
  Serial.print(F("Sketch build: ")); Serial.print(F(__DATE__));
  Serial.print(' '); Serial.println(F(__TIME__));
  Serial.print(F("CPU clock (F_CPU): ")); Serial.println((uint32_t)F_CPU);

  banner("PHASE 1 / 7  --  CANONICAL VERIFICATION SUITE (5 checks, mock HW root)");
  unsigned long a0 = micros();
  int vrc = aios_run_verification_suite();
  unsigned long aus = micros() - a0;

  banner("PHASE 2 / 7  --  ADVERSARIAL MUTATION SUITE (6 kills, mock HW root)");
  unsigned long b0 = micros();
  int mrc = aios_run_mutation_suite();
  unsigned long bus = micros() - b0;

  banner("PHASE 3 / 7  --  REAL HARDWARE ROOT OF TRUTH (FSP R_BSP_UniqueIdGet)");
  unsigned long c0 = micros();
  int hrc = test_real_hw_root_of_truth();
  unsigned long cus = micros() - c0;

  banner("PHASE 4 / 7  --  SCE5 HARDWARE TRNG + NIST SP 800-22 SUBSET");
  unsigned long d0 = micros();
  int trc = test_hw_trng();
  unsigned long dus = micros() - d0;

  banner("PHASE 5 / 7  --  DETERMINISTIC HASH-DRBG (CSPRNG) SEEDED FROM TRNG");
  unsigned long e0 = micros();
  int prc = test_csprng();
  unsigned long eus = micros() - e0;

  banner("PHASE 6 / 7  --  CHAOS ENGINEERING (DRBG-driven abuse, MUT-07..13)");
  unsigned long f0 = micros();
  int crc_ = aios_run_chaos_suite();
  unsigned long fus = micros() - f0;

  banner("PHASE 7 / 7  --  RA4M1 <-> ESP32-S3 WIRE-BRIDGE END-TO-END (9 tests)");
  unsigned long g0 = micros();
  int brc = test_bridge_e2e();
  unsigned long gus = micros() - g0;

  banner("HARDWARE PROOF RESULT");
  Serial.print(F("Verification (mock root)     : rc=")); Serial.print(vrc);
  Serial.print(F("  (")); Serial.print(aus); Serial.println(F(" us)"));
  Serial.print(F("Mutation     (mock root)     : rc=")); Serial.print(mrc);
  Serial.print(F("  (")); Serial.print(bus); Serial.println(F(" us)"));
  Serial.print(F("Real HW root of truth        : rc=")); Serial.print(hrc);
  Serial.print(F("  (")); Serial.print(cus); Serial.println(F(" us)"));
  Serial.print(F("SCE5 TRNG + NIST subset      : rc=")); Serial.print(trc);
  Serial.print(F("  (")); Serial.print(dus); Serial.println(F(" us)"));
  Serial.print(F("Hash-DRBG (CSPRNG)           : rc=")); Serial.print(prc);
  Serial.print(F("  (")); Serial.print(eus); Serial.println(F(" us)"));
  Serial.print(F("Chaos engineering            : rc=")); Serial.print(crc_);
  Serial.print(F("  (")); Serial.print(fus); Serial.println(F(" us)"));
  Serial.print(F("Bridge wire+link E2E         : rc=")); Serial.print(brc);
  Serial.print(F("  (")); Serial.print(gus); Serial.println(F(" us)"));

  bool exec_ok = (vrc==0) && (mrc==0) && (hrc==0) && (trc==0) && (prc==0) && (crc_==0) && (brc==0);
  Serial.println();
  Serial.println(F("---- RELEASE GATES ----"));
  Serial.print(F("AIOS_RA4M1_KERNEL_PROOF="));       Serial.println((vrc==0 && mrc==0 && hrc==0) ? F("PASS") : F("FAIL"));
  Serial.print(F("AIOS_TRNG_ON_DEVICE_SUITE="));     Serial.println((trc==0) ? F("PASS") : F("FAIL"));
  Serial.print(F("AIOS_DRBG_PROOF="));               Serial.println((prc==0) ? F("PASS") : F("FAIL"));
  Serial.print(F("AIOS_CHAOS_SUITE="));              Serial.println((crc_==0) ? F("PASS") : F("FAIL"));
  Serial.print(F("PHASE_7_BRIDGE_LINK_E2E="));       Serial.println((brc==0) ? F("PASS") : F("FAIL"));
  Serial.print(F("PHASE_7_REAL_S3_SILICON_E2E="));
  Serial.println(!g_bridge_on_real_s3 ? F("PENDING") : ((brc==0) ? F("PASS") : F("FAIL")));
  Serial.println(F("AIOS_OFFDEVICE_TRNG_BATTERY=SEE_ARTIFACTS(nist_sts_lite)"));
  Serial.println(F("AIOS_FULL_NIST_STS_REFERENCE_TOOL=NOT_RUN"));
  Serial.print(F("AIOS_HARDWARE_PROOF_VERDICT="));
  // Full PASS only when the real-S3 gate also cleared on this run.
  Serial.println(!exec_ok ? F("FAIL")
                : (g_bridge_on_real_s3 ? F("PASS") : F("CONDITIONAL_PASS")));
  Serial.println(F("---- END OF PROOF (harness will heartbeat below) ----"));
}

void loop() {
  static uint32_t n = 0;
  Serial.print(F("[heartbeat] alive tick=")); Serial.println(n++);
  delay(5000);
}
