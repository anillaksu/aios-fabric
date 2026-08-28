/**
 * @file ra4m1_kernel.hpp
 * @brief AIOS High-Determinism Quantum State Machine Kernel (Renesas RA4M1)
 * 
 * Hardware Target: Renesas RA4M1 (Cortex-M4 @ 48 MHz, 32 kB SRAM, 256 kB Flash)
 * Engineering Standard: Zero-Friction Computing, Zero Heap (No malloc/free),
 * STDERR Isolation, Hardware Root of Truth (HW_UID + TRNG).
 */

#ifndef AIOS_RA4M1_KERNEL_HPP
#define AIOS_RA4M1_KERNEL_HPP

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// 1. HARDWARE ROOT OF TRUTH REGISTER DEFINITIONS (RENESAS RA4M1)
// ============================================================================

// Factory 128-bit Unique ID.
// NOTE: on the RA4M1 the Unique ID is NOT at a fixed address -- FSP resolves it
// as (*(uint32_t*)0x407FB19C + 0x14). The literal below is only a legacy
// fallback for bring-up; production code must call aios_kernel_init_with_uid()
// with the value from R_BSP_UniqueIdGet(). Overridable at build time.
#ifndef RA4M1_HW_UID_BASE_ADDR
#define RA4M1_HW_UID_BASE_ADDR   (0x01008190UL)
#endif
#define RA4M1_HW_UID_WORD(idx)   (*((volatile const uint32_t*)(RA4M1_HW_UID_BASE_ADDR + ((idx) * 4UL))))

// SCE5 / Cryptographic TRNG Data Register
#define RA4M1_TRNG_BASE_ADDR     (0x400D0000UL)
#define RA4M1_TRNG_DATA_REG      (*((volatile const uint32_t*)(RA4M1_TRNG_BASE_ADDR + 0x00UL)))
#define RA4M1_TRNG_STATUS_REG    (*((volatile const uint32_t*)(RA4M1_TRNG_BASE_ADDR + 0x04UL)))

// Dedicated Hardware UART2 (SCI2) for STDERR Isolation
#define RA4M1_SCI2_BASE_ADDR     (0x40070040UL)
#define RA4M1_SCI2_SMR           (*((volatile uint8_t*)(RA4M1_SCI2_BASE_ADDR + 0x00UL)))
#define RA4M1_SCI2_SCR           (*((volatile uint8_t*)(RA4M1_SCI2_BASE_ADDR + 0x02UL)))
#define RA4M1_SCI2_TDR           (*((volatile uint8_t*)(RA4M1_SCI2_BASE_ADDR + 0x03UL)))
#define RA4M1_SCI2_SSR           (*((volatile uint8_t*)(RA4M1_SCI2_BASE_ADDR + 0x04UL)))
#define RA4M1_SCI2_SSR_TDRE_BIT  (0x80U)

// ============================================================================
// 2. CONSTANTS & COMPILE-TIME CONFIGURATION
// ============================================================================

#define AIOS_MAX_AGENTS          (6U)
#define AIOS_MAX_TOKENS          (16U)
#define AIOS_MAX_PAYLOAD_LEN     (512U)

// 6 Canonical AIOS Agent IDs
#define AGENT_ID_HERMES          (0x00U)
#define AGENT_ID_PC_CODER        (0x01U)
#define AGENT_ID_LOCAL_LLM       (0x02U)
#define AGENT_ID_FABRIC_ORCH     (0x03U)
#define AGENT_ID_ANDROID_NODE    (0x04U)
#define AGENT_ID_MATRIX_MONITOR  (0x05U)

// State Transition Status Flags
#define STATE_FLAG_ACTIVE        (1U << 0)
#define STATE_FLAG_DIRTY         (1U << 1)
#define STATE_FLAG_LOCKED        (1U << 2)
#define STATE_FLAG_ERROR         (1U << 3)

// ============================================================================
// 3. ZERO-HEAP DATA STRUCTURES (eBPF-STYLE STATIC ARRAYS)
// ============================================================================

/**
 * @brief Immutable Hardware Root of Truth baseline snapshot.
 */
typedef struct {
    uint64_t uid_low;
    uint64_t uid_high;
    uint64_t baseline_constant;
} AiosHwRootOfTruth;

/**
 * @brief Token entry for Token/Key-Value Offset Hashing (O(1) lookup).
 */
typedef struct {
    uint64_t key_hash;
    uint16_t val_offset;
    uint16_t val_len;
    uint16_t flags;
} AiosTokenOffset;

/**
 * @brief Token container without dynamic allocations.
 */
typedef struct {
    AiosTokenOffset tokens[AIOS_MAX_TOKENS];
    uint16_t token_count;
    uint16_t payload_len;
} AiosTokenTable;

/**
 * @brief Static State Map entry representing an active agent contract.
 */
typedef struct {
    uint64_t contract_hash;
    uint64_t quantum_state;
    uint32_t transition_tick;
    uint8_t  agent_id;
    uint8_t  flags;
    uint16_t lock_counter;
} AiosAgentStateSlot;

/**
 * @brief Global deterministic state kernel storage.
 */
typedef struct {
    AiosHwRootOfTruth root_of_truth;
    AiosAgentStateSlot agents[AIOS_MAX_AGENTS];
    uint64_t global_quantum_state;
    uint32_t global_epoch;
    uint32_t total_transitions;
    uint32_t fault_count;
} AiosKernelStorage;

// ============================================================================
// 4. KERNEL API FUNCTIONS
// ============================================================================

/**
 * @brief Initialize the RA4M1 Hardware Root of Truth and static storage.
 * @param storage Pointer to static kernel storage (must reside in BSS).
 * @param mock_hw If true (for host unit testing), mock registers are used.
 */
void aios_kernel_init(AiosKernelStorage* storage, bool mock_hw);

/**
 * @brief Initialize the kernel anchoring the Hardware Root of Truth in an
 * externally supplied, REAL 128-bit device identity (e.g. the value returned
 * by Renesas FSP R_BSP_UniqueIdGet() on an RA MCU).
 *
 * This keeps the kernel MCU-agnostic: the platform layer is responsible for
 * fetching the genuine factory Unique ID and passing it in. The derivation is
 * fully deterministic -- identical (uid_low, uid_high) always yields an
 * identical baseline_constant and identical subsequent quantum states
 * (Variance = 0) -- while still binding every transition to real silicon.
 *
 * @param storage      Pointer to static kernel storage (must reside in BSS).
 * @param hw_uid_low   Low 64 bits of the factory 128-bit Unique ID.
 * @param hw_uid_high  High 64 bits of the factory 128-bit Unique ID.
 */
void aios_kernel_init_with_uid(AiosKernelStorage* storage,
                               uint64_t hw_uid_low, uint64_t hw_uid_high);

/**
 * @brief Full Hardware Root of Truth: silicon identity fused with a live
 * hardware entropy sample (e.g. RA4M1 SCE5 TRNG via HW_SCE_RNG_Read()).
 *
 * The identity half keeps the kernel bound to a specific device; the entropy
 * half makes each cold-boot baseline unpredictable, exactly as described in the
 * project spec ("128-bit HW_UID and SCE5 TRNG registers bound to the state
 * transition function as base constant"). State transitions remain strictly
 * deterministic for a *fixed* root (Variance = 0); only the root's per-boot
 * value carries the entropy.
 *
 * Passing entropy_low = entropy_high = 0 is identical to
 * aios_kernel_init_with_uid() (checked invariant).
 *
 * @param storage      Static kernel storage (BSS).
 * @param hw_uid_low   Low 64 bits of the factory 128-bit Unique ID.
 * @param hw_uid_high  High 64 bits of the factory 128-bit Unique ID.
 * @param entropy_low  Low 64 bits of a fresh hardware TRNG sample.
 * @param entropy_high High 64 bits of a fresh hardware TRNG sample.
 */
void aios_kernel_init_hw(AiosKernelStorage* storage,
                         uint64_t hw_uid_low, uint64_t hw_uid_high,
                         uint64_t entropy_low, uint64_t entropy_high);

/**
 * @brief High-speed non-cryptographic 64-bit mixer (1.49 cycles/byte target).
 * Unrolled 4-byte / 8-byte word pipelined hash with Galois-Weyl avalanche.
 */
static inline uint64_t aios_fast_hash64(const void* data, size_t len, uint64_t seed) {
    const uint8_t* p = (const uint8_t*)data;
    uint64_t h = seed ^ (len * 0x9E3779B97F4A7C15ULL);
    
    // Process 8-byte chunks unrolled
    while (len >= 8) {
        uint64_t k = (uint64_t)p[0] | ((uint64_t)p[1] << 8) |
                     ((uint64_t)p[2] << 16) | ((uint64_t)p[3] << 24) |
                     ((uint64_t)p[4] << 32) | ((uint64_t)p[5] << 40) |
                     ((uint64_t)p[6] << 48) | ((uint64_t)p[7] << 56);
        
        k *= 0xC6A4A7935BD1E995ULL;
        k ^= k >> 47;
        k *= 0x5BD1E995ULL;
        
        h ^= k;
        h *= 0xC6A4A7935BD1E995ULL;
        
        p += 8;
        len -= 8;
    }
    
    // Process remaining 4-byte chunk
    if (len >= 4) {
        uint32_t k = (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
                     ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
        h ^= (uint64_t)k * 0x5BD1E995ULL;
        h *= 0xC6A4A7935BD1E995ULL;
        p += 4;
        len -= 4;
    }
    
    // Process remaining trailing bytes
    switch (len) {
        case 3: h ^= ((uint64_t)p[2]) << 16;
        case 2: h ^= ((uint64_t)p[1]) << 8;
        case 1: h ^= ((uint64_t)p[0]);
                h *= 0xC6A4A7935BD1E995ULL;
                break;
        default: break;
    }
    
    // Avalanche mixer
    h ^= h >> 33;
    h *= 0xFF51AFD7ED558CCDULL;
    h ^= h >> 33;
    h *= 0xC4CEB9FE1A85EC53ULL;
    h ^= h >> 33;
    
    return h;
}

/**
 * @brief Zero-allocation Token / Key-Value Offset Hashing scanner.
 * Scans raw JSON-RPC 2.0 buffer in O(N) single-pass without dynamic memory,
 * hashing keys and storing value boundaries.
 */
bool aios_scan_json_tokens(const char* json_str, uint16_t len, AiosTokenTable* table);

/**
 * @brief O(1) lookup of a key by its 64-bit precomputed hash.
 */
const AiosTokenOffset* aios_find_token(const AiosTokenTable* table, uint64_t key_hash);

/**
 * @brief Deterministic Quantum State Transition function:
 * St+1 = f(St, It ^ HW_UID ^ TRNG)
 */
uint64_t aios_quantum_transition(AiosKernelStorage* storage, uint8_t agent_id, uint64_t input_contract_hash);

/**
 * @brief STDERR Hardware UART2 Isolated Logger.
 * Writes diagnostic errors strictly to hardware UART2 registers to avoid
 * corrupting the STDOUT / JSON-RPC stream.
 */
void aios_stderr_write(const char* msg);
void aios_stderr_write_hex64(uint64_t val);

/**
 * @brief Silence / re-enable the isolated diagnostic stream. Intended for
 * high-volume fault-injection tests that would otherwise emit thousands of
 * expected error lines. Default: enabled.
 */
void aios_stderr_set_enabled(bool enabled);

// ============================================================================
// 5. DETERMINISTIC HASH-DRBG  (per-agent CSPRNG, zero heap)
// ============================================================================

/**
 * @brief Counter-mode hash DRBG state (16 bytes, BSS-resident).
 * Reseedable from a live hardware TRNG sample; between reseeds the output is a
 * strictly deterministic function of (key, counter) so a fixed seed replays an
 * identical stream (Variance = 0), while a TRNG reseed makes it unpredictable.
 */
typedef struct {
    uint64_t key;
    uint64_t counter;
} AiosPrng;

/**
 * @brief Seed the DRBG. Mixes the caller-supplied entropy with the kernel's
 * Hardware Root of Truth so two devices never share a stream even on identical
 * seed material. Safe to call with entropy 0 (falls back to root of truth only).
 */
void aios_prng_seed(AiosPrng* prng, const AiosKernelStorage* storage,
                    uint64_t entropy_low, uint64_t entropy_high);

/** @brief Next 64 pseudo-random bits. */
uint64_t aios_prng_next64(AiosPrng* prng);

/** @brief Fill a buffer with pseudo-random bytes. */
void aios_prng_fill(AiosPrng* prng, void* out, uint32_t len);

#ifdef __cplusplus
}
#endif

#endif // AIOS_RA4M1_KERNEL_HPP
