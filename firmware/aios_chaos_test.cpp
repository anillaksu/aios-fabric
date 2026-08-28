/**
 * @file aios_chaos_test.cpp
 * @brief Chaos-engineering extension of the adversarial mutation suite.
 *
 * Where aios_mutation_test.cpp fires 6 hand-picked mutants, this suite tries to
 * *break* the kernel and the ESP32-S3 bridge with high-volume, pseudo-randomly
 * generated abuse -- dirty data, malformed frames, replay, and randomised
 * ingest/forward interleaving ("timing chaos"). All randomness comes from the
 * deterministic AIOS hash-DRBG seeded with a fixed constant, so every run --
 * developer laptop or HIL CI -- reproduces the identical attack stream.
 *
 * MUT-07  Truncated wire frame
 * MUT-08  Oversized / overlong payload_len claim
 * MUT-09  Replayed frame is not silently absorbed
 * MUT-10  Byte-level fuzzing burst vs CRC-16 (kill-rate)
 * MUT-11  Random-blob JSON parser fuzzing (immunity)
 * MUT-12  Randomised ingest/forward interleaving -- no deadlock, no corruption
 * MUT-13  Locked-slot fuzzing -- isolation never violated
 */

#include "ra4m1_kernel.hpp"
#include "esp32s3_bridge.hpp"

static Esp32BridgeState s_chaos_bridge;

#include <stdio.h>
#include <string.h>
#include <stdlib.h>

typedef struct {
    const char* name;
    const char* detail;
    bool        killed;
} ChaosRecord;

static ChaosRecord s_rec[8];
static uint32_t s_killed = 0;
static AiosPrng s_prng;

static void chaos_prng_init(void) {
    static AiosKernelStorage k;
    aios_kernel_init(&k, true);                 // deterministic mock root
    aios_prng_seed(&s_prng, &k, 0xC4A05DEADBEEF01ULL, 0x5EED1234ABCD9999ULL);
}

static uint32_t rnd(uint32_t bound) {
    return (uint32_t)(aios_prng_next64(&s_prng) % (bound ? bound : 1u));
}

// ---------------------------------------------------------------------------
// MUT-07  Truncated wire frame
// ---------------------------------------------------------------------------
static void chaos_truncated_frame(void) {
    AiosWireFrame f;
    memset(&f, 0, sizeof(f));
    f.sync_magic = AIOS_WIRE_MAGIC;
    f.msg_type = MSG_TYPE_MCP_TOOL_CALL;
    f.agent_id = AGENT_ID_HERMES;
    f.rpc_id = 0x1111;
    f.method_hash = 0xABCDEF;
    f.contract_hash = 0x1234567890ABCDEFULL;
    f.payload_len = 200;
    f.crc16 = aios_calc_crc16(&f, sizeof(AiosWireFrame) - sizeof(uint16_t));

    bool all_caught = true;
    // Every prefix shorter than the CRC-covered region must fail verification.
    for (size_t cut = 1; cut < sizeof(AiosWireFrame) - sizeof(uint16_t); ++cut) {
        uint16_t partial = aios_calc_crc16(&f, cut);
        if (partial == f.crc16) { all_caught = false; break; }
    }
    s_rec[0].name = "MUT-07: Truncated wire frame";
    s_rec[0].detail = "Every short prefix -> CRC-16 mismatch";
    s_rec[0].killed = all_caught;
    if (all_caught) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-08  Oversized / overlong payload_len
// ---------------------------------------------------------------------------
static void chaos_oversized_len(void) {
    Esp32BridgeState* br = &s_chaos_bridge;
    esp32s3_bridge_init(br);

    static uint8_t junk[1024];
    aios_prng_fill(&s_prng, junk, sizeof(junk));

    bool all_rejected = true;
    for (int i = 0; i < 64; ++i) {
        uint16_t bogus = (uint16_t)(2049 + rnd(60000));   // always > hard cap
        bool ok = esp32s3_bridge_ingest_l4(br, junk, bogus);
        if (ok) { all_rejected = false; break; }
    }
    bool intact = (br->head == br->tail) && (br->total_packets_ingested == 0);

    s_rec[1].name = "MUT-08: Oversized payload_len claim";
    s_rec[1].detail = "len > 2048 -> ingest refused, ring buffer untouched";
    s_rec[1].killed = all_rejected && intact;
    if (s_rec[1].killed) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-09  Replayed frame not silently absorbed
// ---------------------------------------------------------------------------
static void chaos_replay(void) {
    static AiosKernelStorage k;
    aios_kernel_init(&k, true);
    const uint64_t contract = 0xCAFEF00D12345678ULL;

    uint64_t s1 = aios_quantum_transition(&k, AGENT_ID_PC_CODER, contract);
    uint32_t tick1 = k.agents[AGENT_ID_PC_CODER].transition_tick;
    uint64_t s2 = aios_quantum_transition(&k, AGENT_ID_PC_CODER, contract);  // replay
    uint32_t tick2 = k.agents[AGENT_ID_PC_CODER].transition_tick;

    // A replay must visibly advance state (tick + value) -- no exploitable
    // idempotency, no fixed point an attacker can pin the agent to.
    bool detected = (tick2 == tick1 + 1) && (s2 != s1) && (k.total_transitions == 2);

    s_rec[2].name = "MUT-09: Replayed frame";
    s_rec[2].detail = "State + transition_tick advance on every replay (no silent absorb)";
    s_rec[2].killed = detected;
    if (detected) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-10  Byte-level fuzzing burst vs CRC-16
// ---------------------------------------------------------------------------
static void chaos_fuzz_crc(void) {
    const size_t COV = sizeof(AiosWireFrame) - sizeof(uint16_t);

    // Part A: every single-bit flip in the covered region -- CRC-16-CCITT
    // guarantees 100% detection of single-bit (and <=16-bit burst) errors.
    int sb_total = 0, sb_caught = 0;
    for (int r = 0; r < 2000; ++r) {
        AiosWireFrame f;
        aios_prng_fill(&s_prng, &f, sizeof(f));
        f.sync_magic = AIOS_WIRE_MAGIC;
        f.crc16 = aios_calc_crc16(&f, COV);
        uint32_t pos = rnd(COV);
        ((uint8_t*)&f)[pos] ^= (uint8_t)(1u << rnd(8));
        sb_total++;
        if (aios_calc_crc16(&f, COV) != f.crc16) sb_caught++;
    }

    // Part B: dirty-data burst -- 1..8 random byte-wide mutations. Expected
    // escape rate ~2^-16; assert detection >= 99.9%.
    int mb_total = 0, mb_caught = 0;
    for (int r = 0; r < 6000; ++r) {
        AiosWireFrame f;
        aios_prng_fill(&s_prng, &f, sizeof(f));
        f.sync_magic = AIOS_WIRE_MAGIC;
        f.crc16 = aios_calc_crc16(&f, COV);
        uint8_t before[sizeof(AiosWireFrame)];
        memcpy(before, &f, COV);
        int flips = 1 + (int)rnd(8);
        for (int i = 0; i < flips; ++i)
            ((uint8_t*)&f)[rnd(COV)] ^= (uint8_t)(1u + rnd(255));
        if (memcmp(before, &f, COV) == 0) continue;
        mb_total++;
        if (aios_calc_crc16(&f, COV) != f.crc16) mb_caught++;
    }

    bool sb_ok = (sb_total > 0) && (sb_caught == sb_total);
    bool mb_ok = (mb_total > 0) && ((double)mb_caught / mb_total >= 0.999);

    s_rec[3].name = "MUT-10: Byte fuzzing burst vs CRC-16";
    static char d[80];
    snprintf(d, sizeof(d), "single-bit %d/%d (100%%), dirty-burst %d/%d (>=99.9%%)",
             sb_caught, sb_total, mb_caught, mb_total);
    s_rec[3].detail = d;
    s_rec[3].killed = sb_ok && mb_ok;
    if (s_rec[3].killed) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-11  Random-blob JSON parser fuzzing
// ---------------------------------------------------------------------------
static void chaos_json_fuzz(void) {
    const int ROUNDS = 2000;
    bool immune = true;

    for (int r = 0; r < ROUNDS && immune; ++r) {
        char blob[300];
        uint16_t len = (uint16_t)(1 + rnd(sizeof(blob) - 1));
        aios_prng_fill(&s_prng, blob, len);
        // Bias some bytes toward JSON structure to stress the FSM harder.
        for (uint16_t i = 0; i < len; i += 1 + rnd(6)) {
            const char sp[] = "{}[]\":,";
            blob[i] = sp[rnd(sizeof(sp) - 1)];
        }
        AiosTokenTable t;
        (void)aios_scan_json_tokens(blob, len, &t);
        if (t.token_count > AIOS_MAX_TOKENS) immune = false;
        if (t.payload_len != len) immune = false;
    }
    s_rec[4].name = "MUT-11: Random-blob JSON fuzzing";
    s_rec[4].detail = "2000 blobs: token_count always <= AIOS_MAX_TOKENS, no OOB";
    s_rec[4].killed = immune;
    if (immune) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-12  Randomised ingest/forward interleaving (timing chaos)
// ---------------------------------------------------------------------------
static void chaos_interleave(void) {
    Esp32BridgeState* br = &s_chaos_bridge;
    esp32s3_bridge_init(br);
    static uint8_t pkt[1200];

    bool corruption = false, deadlock = false, saw_backpressure = false, recovered = false;
    const int ROUNDS = 4000;

    for (int r = 0; r < ROUNDS; ++r) {
        // Random action mix.
        if (rnd(2) == 0) {
            uint16_t len = (uint16_t)(16 + rnd(1024));
            aios_prng_fill(&s_prng, pkt, len);
            // valid JSON-RPC-ish header so process_and_forward has something to chew
            memcpy(pkt, "{\"jsonrpc\":\"2.0\",\"method\":\"a\",\"id\":1}", 36 < len ? 36 : len);
            bool ok = esp32s3_bridge_ingest_l4(br, pkt, len);
            if (!ok && br->backpressure_active) saw_backpressure = true;
        } else {
            AiosWireFrame out;
            if (esp32s3_bridge_process_and_forward(br, &out)) {
                if (out.sync_magic != AIOS_WIRE_MAGIC) corruption = true;
                uint16_t c = aios_calc_crc16(&out, sizeof(AiosWireFrame) - sizeof(uint16_t));
                if (c != out.crc16) corruption = true;
            }
        }
        // Ring pointers must always stay in bounds.
        if (br->head >= ESP32S3_RING_BUFFER_SIZE || br->tail >= ESP32S3_RING_BUFFER_SIZE) {
            corruption = true;
        }
        if (saw_backpressure && !br->backpressure_active) recovered = true;
    }
    // Drain fully -- must terminate (no deadlock).
    int guard = 0;
    AiosWireFrame tmp;
    while (esp32s3_bridge_process_and_forward(br, &tmp)) {
        if (++guard > 200000) { deadlock = true; break; }
    }
    // After draining, a normal small ingest must lift backpressure (fail-open recovery).
    uint8_t small[40];
    memcpy(small, "{\"jsonrpc\":\"2.0\",\"method\":\"x\",\"id\":9}", 36);
    esp32s3_bridge_ingest_l4(br, small, 36);
    if (!br->backpressure_active) recovered = true;

    bool ok = !corruption && !deadlock && saw_backpressure && recovered;
    s_rec[5].name = "MUT-12: Randomised ingest/forward chaos";
    static char d[72];
    snprintf(d, sizeof(d), "4000 rounds: corruption=%d deadlock=%d bp+recovery=%d",
             corruption, deadlock, (saw_backpressure && recovered));
    s_rec[5].detail = d;
    s_rec[5].killed = ok;
    if (ok) s_killed++;
}

// ---------------------------------------------------------------------------
// MUT-13  Locked-slot fuzzing -- isolation never violated
// ---------------------------------------------------------------------------
static void chaos_locked_slot_fuzz(void) {
    static AiosKernelStorage k;
    aios_kernel_init(&k, true);

    // Lock a random subset of slots and snapshot their state.
    uint64_t locked_state[AIOS_MAX_AGENTS];
    bool locked[AIOS_MAX_AGENTS];
    for (uint8_t i = 0; i < AIOS_MAX_AGENTS; ++i) {
        locked[i] = (rnd(2) == 0);
        if (locked[i]) k.agents[i].flags |= STATE_FLAG_LOCKED;
        locked_state[i] = k.agents[i].quantum_state;
    }

    uint32_t attempts_on_locked = 0;
    for (int r = 0; r < 5000; ++r) {
        uint8_t a = (uint8_t)rnd(AIOS_MAX_AGENTS);
        uint64_t contract = aios_prng_next64(&s_prng);
        if (locked[a]) attempts_on_locked++;
        aios_quantum_transition(&k, a, contract);
    }

    bool isolation_held = true;
    for (uint8_t i = 0; i < AIOS_MAX_AGENTS; ++i)
        if (locked[i] && k.agents[i].quantum_state != locked_state[i])
            isolation_held = false;

    bool faults_ok = (k.fault_count == attempts_on_locked);

    s_rec[6].name = "MUT-13: Locked-slot fuzzing";
    static char d[64];
    snprintf(d, sizeof(d), "5000 hits, %lu on locked -> 0 mutations, fault_count match",
             (unsigned long)attempts_on_locked);
    s_rec[6].detail = d;
    s_rec[6].killed = isolation_held && faults_ok;
    if (s_rec[6].killed) s_killed++;
}

// ---------------------------------------------------------------------------
#ifdef AIOS_EMBED_SUITE
int aios_run_chaos_suite(void) {
#else
int main(void) {
#endif
    printf("====================================================================\n");
    printf("  AIOS CHAOS-ENGINEERING SUITE  (deterministic DRBG-driven abuse)\n");
    printf("====================================================================\n\n");

    chaos_prng_init();
    s_killed = 0;

    // This suite deliberately triggers thousands of expected faults; silence the
    // isolated diagnostic stream so the proof log stays readable.
    aios_stderr_set_enabled(false);

    chaos_truncated_frame();
    chaos_oversized_len();
    chaos_replay();
    chaos_fuzz_crc();
    chaos_json_fuzz();
    chaos_interleave();
    chaos_locked_slot_fuzz();

    aios_stderr_set_enabled(true);

    for (int i = 0; i < 7; ++i) {
        printf("[%s] %s\n", s_rec[i].killed ? "KILLED" : "SURVIVED", s_rec[i].name);
        printf("  %s\n", s_rec[i].detail);
    }

    double rate = ((double)s_killed / 7.0) * 100.0;
    printf("\n====================================================================\n");
    printf("  CHAOS KILL RATE: %.1f%% (%lu / 7 KILLED, %lu SURVIVED)\n",
           rate, (unsigned long)s_killed, (unsigned long)(7 - s_killed));
    printf("====================================================================\n");

    return (s_killed == 7) ? 0 : 1;
}
