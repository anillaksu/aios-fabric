/**
 * @file aios_key_lifecycle.hpp
 * @brief AIOS crypto / key lifecycle primitives (RELEASE_CHECKLIST §6).
 *
 * Zero-heap, deterministic. Covers: initial seed generation from a live TRNG
 * sample, seed storage/reproduction sealed to the silicon identity, DRBG state
 * re-derivation after a reset, labelled key derivation + provisioning, monotonic
 * key rotation (epoch floor), stale/invalid key rejection, a flash-dump /
 * device-transplant detection seal, and a production lock that disables raw key
 * export + debug derivation paths.
 *
 * HONEST SCOPE: the authenticator here is a symmetric MAC built on
 * aios_fast_hash64 (HMAC-like), NOT asymmetric code signing / secure boot. It
 * is sufficient for a controlled lab pilot where the provisioning channel is
 * trusted; an asymmetric signing chain + hardware secure boot remains a
 * production requirement and is out of scope for this module.
 */
#ifndef AIOS_KEY_LIFECYCLE_HPP
#define AIOS_KEY_LIFECYCLE_HPP

#include <stdint.h>
#include <stdbool.h>
#include "ra4m1_kernel.hpp"

#ifdef __cplusplus
extern "C" {
#endif

#define AIOS_KEY_LABEL_MAX        (16U)
#define AIOS_KEY_EPOCH_LOOKAHEAD  (4U)   /* accept at most floor+N as "not yet rotated to" */

typedef enum {
    AIOS_KEY_OK               = 0,
    AIOS_KEY_ERR_UNSEALED     = 1,  /* seal does not bind to this silicon UID */
    AIOS_KEY_ERR_EPOCH_STALE  = 2,  /* key epoch below the current rotation floor */
    AIOS_KEY_ERR_EPOCH_FUTURE = 3,  /* key epoch implausibly far ahead of floor */
    AIOS_KEY_ERR_LOCKED       = 4,  /* raw export / debug derive blocked in production */
    AIOS_KEY_ERR_NOT_PROV     = 5,  /* master seed not provisioned (or factory-reset) */
    AIOS_KEY_ERR_MISMATCH     = 6,  /* derived key does not match the recorded value */
    AIOS_KEY_ERR_ARG          = 7
} AiosKeyStatus;

/** Master seed record: the blob that would live in protected flash. */
typedef struct {
    uint64_t seed_lo;
    uint64_t seed_hi;
    uint64_t seal;            /* MAC over (seed, uid, reseed_counter) */
    uint32_t reseed_counter;  /* bumped on every reseed; folded into derivation */
    uint32_t epoch_floor;     /* monotonic; keys below this epoch are rejected */
    uint8_t  provisioned;     /* 0 = none / factory-reset, 1 = live */
    uint8_t  production_lock; /* 1 = no raw key export, no debug derive */
    uint8_t  _pad[2];
} AiosMasterSeed;

/** A derived, labelled key handle. */
typedef struct {
    uint64_t key_lo;
    uint64_t key_hi;
    uint32_t epoch;
    uint16_t label_tag;   /* 16-bit digest of the label, for cheap identification */
    uint8_t  valid;
    uint8_t  _pad;
} AiosDerivedKey;

/**
 * Initial seed generation. Mixes a fresh hardware TRNG sample with the silicon
 * UID, seals the result to that UID, and marks the record provisioned.
 * Deterministic for fixed inputs (so it is testable / reproducible).
 */
void aios_seed_generate(AiosMasterSeed* s,
                        uint64_t uid_lo, uint64_t uid_hi,
                        uint64_t trng_lo, uint64_t trng_hi);

/**
 * Seed storage / reproduction check: verifies the seal still binds this blob to
 * this silicon. Returns AIOS_KEY_ERR_UNSEALED if the blob was produced on (or
 * for) a different device -- the flash-dump / device-transplant scenario.
 */
AiosKeyStatus aios_seed_verify(const AiosMasterSeed* s,
                               uint64_t uid_lo, uint64_t uid_hi);

/**
 * Reseed: fold a new TRNG sample into the master seed, bump the reseed counter,
 * re-seal. Existing derived keys stay valid (derivation is epoch-scoped, not
 * reseed-scoped) but the DRBG stream re-derived after this call advances.
 */
AiosKeyStatus aios_seed_reseed(AiosMasterSeed* s,
                               uint64_t uid_lo, uint64_t uid_hi,
                               uint64_t trng_lo, uint64_t trng_hi);

/**
 * DRBG state after reset: deterministically re-derive a DRBG instance from the
 * stored seed + reseed_counter. Two calls with the same record yield the same
 * stream (recoverable); after aios_seed_reseed the stream is different (not a
 * replay of the pre-reset stream).
 */
AiosKeyStatus aios_drbg_from_seed(const AiosMasterSeed* s,
                                  uint64_t uid_lo, uint64_t uid_hi,
                                  AiosPrng* out);

/**
 * Key generation + provisioning: derive a labelled key for a given epoch.
 * Rejects epoch < epoch_floor (STALE) and epoch > epoch_floor+LOOKAHEAD
 * (FUTURE). Deterministic: same (seed, uid, label, epoch) -> same key.
 */
AiosKeyStatus aios_key_derive(const AiosMasterSeed* s,
                              uint64_t uid_lo, uint64_t uid_hi,
                              const char* label, uint32_t epoch,
                              AiosDerivedKey* out);

/**
 * Monotonic key rotation: raise the epoch floor. Rejects new_epoch <= current
 * floor (downgrade / replay). After rotation, keys minted for an earlier epoch
 * fail aios_key_verify with AIOS_KEY_ERR_EPOCH_STALE.
 */
AiosKeyStatus aios_key_rotate(AiosMasterSeed* s, uint32_t new_epoch);

/**
 * Stale / invalid key behaviour: recompute the key for (label, k->epoch) and
 * compare, and check k->epoch >= epoch_floor. Any drift -> non-OK.
 */
AiosKeyStatus aios_key_verify(const AiosMasterSeed* s,
                              uint64_t uid_lo, uint64_t uid_hi,
                              const AiosDerivedKey* k, const char* label);

/**
 * Raw key material export. Blocked (AIOS_KEY_ERR_LOCKED) when production_lock is
 * set -- the "debug interfaces disabled in production mode" requirement.
 */
AiosKeyStatus aios_key_export_raw(const AiosMasterSeed* s, const AiosDerivedKey* k,
                                  uint8_t out32[32]);

/** Factory reset: zeroize the seed and mark it unprovisioned. */
void aios_seed_factory_reset(AiosMasterSeed* s);

#ifdef __cplusplus
}
#endif
#endif /* AIOS_KEY_LIFECYCLE_HPP */
