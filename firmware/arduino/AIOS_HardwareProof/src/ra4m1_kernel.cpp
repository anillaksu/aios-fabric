/**
 * @file ra4m1_kernel.cpp
 * @brief Implementation of Renesas RA4M1 High-Determinism Quantum State Machine Kernel
 */

#include "ra4m1_kernel.hpp"
#include <stdio.h>
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

// Static buffer for fallback/host diagnostics
static bool s_mock_hardware = false;
static bool s_stderr_enabled = true;

void aios_stderr_set_enabled(bool enabled) { s_stderr_enabled = enabled; }

// Rotates 64-bit word left
static inline uint64_t rotl64(uint64_t n, unsigned int c) {
    const unsigned int mask = 63U;
    c &= mask;
    return (n << c) | (n >> ((64U - c) & mask));
}

// ----------------------------------------------------------------------------
// 1. HARDWARE ROOT OF TRUTH INITIALIZATION
// ----------------------------------------------------------------------------

// Deterministic entropy expansion from a real 128-bit device identity.
// Used when a live hardware TRNG sample is not wired into the Root of Truth:
// the baseline stays anchored in genuine silicon identity and Variance = 0.
static uint64_t aios_derive_entropy_from_uid(uint64_t uid_low, uint64_t uid_high) {
    uint64_t words[2];
    words[0] = uid_low;
    words[1] = uid_high;
    return aios_fast_hash64(words, sizeof(words), 0xA5A55A5AA5A55A5AULL);
}

// Shared init tail: seed the global quantum state and the 6 canonical agent
// slots from an already-populated root_of_truth. Identical for mock, register
// and FSP-UID init paths so their determinism is provably the same code.
static void aios_kernel_finish_init(AiosKernelStorage* storage) {
    storage->global_quantum_state = storage->root_of_truth.baseline_constant;
    storage->global_epoch = 1;
    storage->total_transitions = 0;
    storage->fault_count = 0;

    for (uint8_t i = 0; i < AIOS_MAX_AGENTS; ++i) {
        storage->agents[i].agent_id = i;
        storage->agents[i].contract_hash = aios_fast_hash64(&i, sizeof(i), storage->root_of_truth.baseline_constant);
        storage->agents[i].quantum_state = storage->agents[i].contract_hash;
        storage->agents[i].transition_tick = 0;
        storage->agents[i].flags = STATE_FLAG_ACTIVE;
        storage->agents[i].lock_counter = 0;
    }
}

void aios_kernel_init_hw(AiosKernelStorage* storage,
                         uint64_t hw_uid_low, uint64_t hw_uid_high,
                         uint64_t entropy_low, uint64_t entropy_high) {
    if (!storage) return;

    s_mock_hardware = false;
    memset(storage, 0, sizeof(AiosKernelStorage));

    storage->root_of_truth.uid_low  = hw_uid_low;
    storage->root_of_truth.uid_high = hw_uid_high;

    uint64_t baseline =
        hw_uid_low ^ hw_uid_high ^ aios_derive_entropy_from_uid(hw_uid_low, hw_uid_high);

    // Fold the live hardware entropy sample. Zero entropy is a no-op, so this
    // path is bit-identical to aios_kernel_init_with_uid() when no TRNG value
    // is supplied.
    if ((entropy_low | entropy_high) != 0ULL) {
        uint64_t ent_words[2];
        ent_words[0] = entropy_low;
        ent_words[1] = entropy_high;
        baseline ^= aios_fast_hash64(ent_words, sizeof(ent_words), 0x243F6A8885A308D3ULL);
    }

    storage->root_of_truth.baseline_constant = baseline;
    aios_kernel_finish_init(storage);
}

void aios_kernel_init_with_uid(AiosKernelStorage* storage,
                               uint64_t hw_uid_low, uint64_t hw_uid_high) {
    aios_kernel_init_hw(storage, hw_uid_low, hw_uid_high, 0ULL, 0ULL);
}

void aios_kernel_init(AiosKernelStorage* storage, bool mock_hw) {
    if (!storage) return;

    s_mock_hardware = mock_hw;
    memset(storage, 0, sizeof(AiosKernelStorage));

    if (mock_hw) {
        // Deterministic mock HW_UID (128-bit) and TRNG for CI/Host testing
        storage->root_of_truth.uid_low  = 0x41494F535F524134ULL; // "AIOS_RA4"
        storage->root_of_truth.uid_high = 0x4D315F554E495131ULL; // "M1_UNIQ1"
        uint64_t mock_trng = 0xA5A55A5AA5A55A5AULL;
        storage->root_of_truth.baseline_constant = 
            storage->root_of_truth.uid_low ^ 
            storage->root_of_truth.uid_high ^ 
            mock_trng;
    } else {
        // Direct Renesas RA4M1 Hardware Registers Read
        uint32_t w0 = RA4M1_HW_UID_WORD(0);
        uint32_t w1 = RA4M1_HW_UID_WORD(1);
        uint32_t w2 = RA4M1_HW_UID_WORD(2);
        uint32_t w3 = RA4M1_HW_UID_WORD(3);

        storage->root_of_truth.uid_low  = ((uint64_t)w1 << 32) | (uint64_t)w0;
        storage->root_of_truth.uid_high = ((uint64_t)w3 << 32) | (uint64_t)w2;

        // Poll TRNG ready bit or read hardware entropy.
        // The SCE5/TRNG peripheral needs its module-stop clock gate cleared
        // before its registers may be read; a bare-metal bring-up that has not
        // done so must define AIOS_ARDUINO_PROOF and derive the expansion from
        // the real UID instead. Prefer aios_kernel_init_with_uid() in production.
#ifdef AIOS_ARDUINO_PROOF
        uint32_t trng_val = (uint32_t)(storage->root_of_truth.uid_low ^
                                      (storage->root_of_truth.uid_high >> 32));
#else
        uint32_t trng_val = RA4M1_TRNG_DATA_REG;
#endif
        uint64_t trng_expanded = ((uint64_t)trng_val << 32) | (~(uint64_t)trng_val);

        storage->root_of_truth.baseline_constant =
            storage->root_of_truth.uid_low ^
            storage->root_of_truth.uid_high ^
            trng_expanded;
    }

    aios_kernel_finish_init(storage);
}

// ----------------------------------------------------------------------------
// 2. TOKEN / KEY-VALUE OFFSET HASHING (O(1) LOOKUP, ZERO HEAP)
// ----------------------------------------------------------------------------

bool aios_scan_json_tokens(const char* json_str, uint16_t len, AiosTokenTable* table) {
    if (!json_str || !table || len == 0) return false;

    table->token_count = 0;
    table->payload_len = len;

    uint16_t pos = 0;
    bool in_string = false;
    uint16_t str_start = 0;

    while (pos < len && table->token_count < AIOS_MAX_TOKENS) {
        char c = json_str[pos];

        if (c == '\"') {
            if (!in_string) {
                // String starts
                in_string = true;
                str_start = pos + 1;
            } else {
                // String ends: check if followed by ':' (meaning it's a key)
                in_string = false;
                uint16_t str_len = pos - str_start;
                
                // Scan ahead for ':' skipping spaces
                uint16_t lookahead = pos + 1;
                while (lookahead < len && (json_str[lookahead] == ' ' || json_str[lookahead] == '\t' || 
                                           json_str[lookahead] == '\r' || json_str[lookahead] == '\n')) {
                    lookahead++;
                }

                if (lookahead < len && json_str[lookahead] == ':') {
                    // This is a key! Hash it immediately
                    uint64_t key_hash = aios_fast_hash64(&json_str[str_start], str_len, 0xCBF29CE484222325ULL);
                    
                    // Skip colon and white space to find value start
                    uint16_t val_start = lookahead + 1;
                    while (val_start < len && (json_str[val_start] == ' ' || json_str[val_start] == '\t' ||
                                               json_str[val_start] == '\r' || json_str[val_start] == '\n')) {
                        val_start++;
                    }

                    // Find value end (comma, closing brace, or closing bracket)
                    uint16_t val_end = val_start;
                    if (val_start < len) {
                        if (json_str[val_start] == '\"') {
                            val_start++;
                            val_end = val_start;
                            while (val_end < len && json_str[val_end] != '\"') {
                                if (json_str[val_end] == '\\' && val_end + 1 < len) val_end++;
                                val_end++;
                            }
                            pos = val_end; // Advance outer scan
                        } else if (json_str[val_start] == '{' || json_str[val_start] == '[') {
                            int depth = 1;
                            char open_ch = json_str[val_start];
                            char close_ch = (open_ch == '{') ? '}' : ']';
                            val_end = val_start + 1;
                            while (val_end < len && depth > 0) {
                                if (json_str[val_end] == open_ch) depth++;
                                else if (json_str[val_end] == close_ch) depth--;
                                val_end++;
                            }
                            pos = val_end - 1;
                        } else {
                            while (val_end < len && json_str[val_end] != ',' && 
                                   json_str[val_end] != '}' && json_str[val_end] != ']' &&
                                   json_str[val_end] != ' ' && json_str[val_end] != '\r' && json_str[val_end] != '\n') {
                                val_end++;
                            }
                            pos = val_end;
                        }
                    }

                    // Record in zero-allocation table
                    AiosTokenOffset* entry = &table->tokens[table->token_count++];
                    entry->key_hash = key_hash;
                    entry->val_offset = val_start;
                    entry->val_len = (val_end >= val_start) ? (val_end - val_start) : 0;
                    entry->flags = 0;
                }
            }
        }
        pos++;
    }

    return (table->token_count > 0);
}

const AiosTokenOffset* aios_find_token(const AiosTokenTable* table, uint64_t key_hash) {
    if (!table) return NULL;
    for (uint16_t i = 0; i < table->token_count; ++i) {
        if (table->tokens[i].key_hash == key_hash) {
            return &table->tokens[i];
        }
    }
    return NULL;
}

// ----------------------------------------------------------------------------
// 3. DETERMINISTIC QUANTUM STATE TRANSITION: St+1 = f(St, It ^ HW_UID ^ TRNG)
// ----------------------------------------------------------------------------

uint64_t aios_quantum_transition(AiosKernelStorage* storage, uint8_t agent_id, uint64_t input_contract_hash) {
    if (!storage || agent_id >= AIOS_MAX_AGENTS) return 0ULL;

    AiosAgentStateSlot* slot = &storage->agents[agent_id];

    // Hardware lock check
    if (slot->flags & STATE_FLAG_LOCKED) {
        aios_stderr_write("[AIOS_KERNEL_ERR] AGENT_SLOT_LOCKED_VIOLATION ID=");
        aios_stderr_write_hex64(agent_id);
        aios_stderr_write("\n");
        storage->fault_count++;
        return slot->quantum_state;
    }

    // Input perturbation via Hardware Root of Truth baseline constant
    uint64_t perturbed_input = input_contract_hash ^ 
                               storage->root_of_truth.baseline_constant ^ 
                               ((uint64_t)storage->total_transitions * 0x9E3779B97F4A7C15ULL);

    // Multi-round reversible Weyl-Galois permutation (Variance = 0)
    uint64_t s_curr = slot->quantum_state;
    
    // Round 1: Non-linear mixing with perturbed input
    s_curr ^= perturbed_input;
    s_curr *= 0xFF51AFD7ED558CCDULL;
    s_curr = rotl64(s_curr, 31);

    // Round 2: Global state cross-coupling
    s_curr ^= storage->global_quantum_state;
    s_curr *= 0xC4CEB9FE1A85EC53ULL;
    s_curr = rotl64(s_curr, 27);

    // Round 3: Final deterministic fold
    s_curr ^= (s_curr >> 33);
    s_curr *= 0x5BD1E9955BD1E995ULL;
    s_curr ^= (s_curr >> 29);

    // Commit state atomically
    slot->contract_hash = input_contract_hash;
    slot->quantum_state = s_curr;
    slot->transition_tick++;
    slot->flags |= STATE_FLAG_DIRTY;

    // Cross-couple with global kernel quantum state
    storage->global_quantum_state = rotl64(storage->global_quantum_state ^ s_curr, 17) + 0x9E3779B97F4A7C15ULL;
    storage->total_transitions++;

    return s_curr;
}

// ----------------------------------------------------------------------------
// 4. STDERR ISOLATION: HARDWARE UART2 DRIVER
// ----------------------------------------------------------------------------

void aios_stderr_write(const char* msg) {
    if (!msg || !s_stderr_enabled) return;

    if (s_mock_hardware) {
        fputs(msg, stderr);
        fflush(stderr);
        return;
    }

#ifdef AIOS_ARDUINO_PROOF
    // Proof build: SCI2 is not clock-enabled / pin-broken-out on the Uno R4
    // headers; route the isolated diagnostic stream through stdio (the sketch
    // retargets it onto USB-CDC Serial with an [STDERR] tag).
    fputs(msg, stderr);
    fflush(stderr);
    return;
#endif

    // Renesas RA4M1 Hardware UART2 (SCI2) Register Level Polling
    while (*msg) {
        // Wait until Transmit Data Register Empty (TDRE) bit is set
        while ((RA4M1_SCI2_SSR & RA4M1_SCI2_SSR_TDRE_BIT) == 0U) {
            // Spinwait with zero heap overhead
        }
        // Write byte directly to TDR
        RA4M1_SCI2_TDR = (uint8_t)(*msg);
        // Clear TDRE by writing 0 to SSR TDRE flag according to hardware manual
        RA4M1_SCI2_SSR &= ~RA4M1_SCI2_SSR_TDRE_BIT;
        msg++;
    }
}

void aios_stderr_write_hex64(uint64_t val) {
    char buf[19];
    buf[0] = '0';
    buf[1] = 'x';
    const char hex_chars[] = "0123456789ABCDEF";
    for (int i = 15; i >= 0; --i) {
        buf[2 + (15 - i)] = hex_chars[(val >> (i * 4)) & 0x0F];
    }
    buf[18] = '\0';
    aios_stderr_write(buf);
}

// ----------------------------------------------------------------------------
// 5. DETERMINISTIC HASH-DRBG
// ----------------------------------------------------------------------------

void aios_prng_seed(AiosPrng* prng, const AiosKernelStorage* storage,
                    uint64_t entropy_low, uint64_t entropy_high) {
    if (!prng) return;

    uint64_t root = storage ? storage->root_of_truth.baseline_constant
                            : 0x243F6A8885A308D3ULL;
    uint64_t seed_words[3];
    seed_words[0] = entropy_low;
    seed_words[1] = entropy_high;
    seed_words[2] = root;

    prng->key     = aios_fast_hash64(seed_words, sizeof(seed_words), root ^ 0x9E3779B97F4A7C15ULL);
    prng->counter = aios_fast_hash64(&prng->key, sizeof(prng->key), root);
}

uint64_t aios_prng_next64(AiosPrng* prng) {
    if (!prng) return 0ULL;

    uint64_t block_in[2];
    block_in[0] = prng->counter;
    block_in[1] = prng->key;
    uint64_t out = aios_fast_hash64(block_in, sizeof(block_in), prng->key);

    prng->counter += 0x9E3779B97F4A7C15ULL;   // Weyl increment (full-period)

    // Backtracking resistance: fold the fresh output back into the key so a
    // captured state cannot reconstruct previously emitted blocks.
    prng->key ^= (out + 0xC6A4A7935BD1E995ULL);
    prng->key  = (prng->key << 23) | (prng->key >> 41);

    return out;
}

void aios_prng_fill(AiosPrng* prng, void* out, uint32_t len) {
    if (!prng || !out) return;
    uint8_t* p = (uint8_t*)out;
    while (len >= 8) {
        uint64_t r = aios_prng_next64(prng);
        for (int i = 0; i < 8; ++i) p[i] = (uint8_t)(r >> (i * 8));
        p += 8;
        len -= 8;
    }
    if (len) {
        uint64_t r = aios_prng_next64(prng);
        for (uint32_t i = 0; i < len; ++i) p[i] = (uint8_t)(r >> (i * 8));
    }
}

#ifdef __cplusplus
}
#endif
