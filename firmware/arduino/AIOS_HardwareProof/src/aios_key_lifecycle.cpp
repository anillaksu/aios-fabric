/**
 * @file aios_key_lifecycle.cpp
 * @brief Implementation of the AIOS crypto / key lifecycle primitives (§6).
 */
#include "aios_key_lifecycle.hpp"
#include <string.h>

/* Domain separators -- keep each derivation path independent. */
#define KL_D_SEED   (0xA105EED0A105EED0ULL)
#define KL_D_SEAL   (0x5EA15EA15EA15EA1ULL)
#define KL_D_DRBG   (0xD1B6D1B6D1B6D1B6ULL)
#define KL_D_KEY    (0x6E7C0DE56E7C0DE5ULL)
#define KL_D_LABEL  (0x1AB1E7A61AB1E7A6ULL)

static uint16_t kl_label_tag(const char* label, uint32_t* out_len) {
    uint32_t n = 0;
    if (label) { while (n < AIOS_KEY_LABEL_MAX && label[n] != '\0') n++; }
    if (out_len) *out_len = n;
    uint64_t h = aios_fast_hash64(label ? (const void*)label : (const void*)"", n, KL_D_LABEL);
    return (uint16_t)(h & 0xFFFFu);
}

static uint64_t kl_seal_of(const AiosMasterSeed* s,
                           uint64_t uid_lo, uint64_t uid_hi) {
    uint64_t blk[5] = { s->seed_lo, s->seed_hi, uid_lo, uid_hi,
                        (uint64_t)s->reseed_counter };
    return aios_fast_hash64(blk, sizeof(blk), KL_D_SEAL);
}

void aios_seed_generate(AiosMasterSeed* s,
                        uint64_t uid_lo, uint64_t uid_hi,
                        uint64_t trng_lo, uint64_t trng_hi) {
    if (!s) return;
    uint64_t blk[4] = { uid_lo, uid_hi, trng_lo, trng_hi };
    s->seed_lo = aios_fast_hash64(blk, sizeof(blk), KL_D_SEED);
    blk[0] = ~uid_lo; blk[1] = trng_hi; blk[2] = trng_lo; blk[3] = uid_hi;
    s->seed_hi = aios_fast_hash64(blk, sizeof(blk), KL_D_SEED ^ 0x9E3779B97F4A7C15ULL);
    s->reseed_counter = 0;
    s->epoch_floor = 1;
    s->provisioned = 1;
    s->production_lock = 0;
    s->_pad[0] = s->_pad[1] = 0;
    s->seal = kl_seal_of(s, uid_lo, uid_hi);
}

AiosKeyStatus aios_seed_verify(const AiosMasterSeed* s,
                               uint64_t uid_lo, uint64_t uid_hi) {
    if (!s) return AIOS_KEY_ERR_ARG;
    if (!s->provisioned) return AIOS_KEY_ERR_NOT_PROV;
    return (kl_seal_of(s, uid_lo, uid_hi) == s->seal) ? AIOS_KEY_OK
                                                      : AIOS_KEY_ERR_UNSEALED;
}

AiosKeyStatus aios_seed_reseed(AiosMasterSeed* s,
                               uint64_t uid_lo, uint64_t uid_hi,
                               uint64_t trng_lo, uint64_t trng_hi) {
    AiosKeyStatus st = aios_seed_verify(s, uid_lo, uid_hi);
    if (st != AIOS_KEY_OK) return st;
    uint64_t blk[4] = { s->seed_lo, trng_lo, s->seed_hi, trng_hi };
    s->seed_lo ^= aios_fast_hash64(blk, sizeof(blk), KL_D_SEED + s->reseed_counter);
    blk[0] = trng_hi; blk[1] = s->seed_lo; blk[2] = trng_lo; blk[3] = s->seed_hi;
    s->seed_hi ^= aios_fast_hash64(blk, sizeof(blk), KL_D_SEED - s->reseed_counter);
    s->reseed_counter++;
    s->seal = kl_seal_of(s, uid_lo, uid_hi);
    return AIOS_KEY_OK;
}

AiosKeyStatus aios_drbg_from_seed(const AiosMasterSeed* s,
                                  uint64_t uid_lo, uint64_t uid_hi,
                                  AiosPrng* out) {
    if (!out) return AIOS_KEY_ERR_ARG;
    AiosKeyStatus st = aios_seed_verify(s, uid_lo, uid_hi);
    if (st != AIOS_KEY_OK) return st;
    uint64_t blk[4] = { s->seed_lo, s->seed_hi,
                        (uint64_t)s->reseed_counter, uid_lo ^ uid_hi };
    out->key     = aios_fast_hash64(blk, sizeof(blk), KL_D_DRBG);
    blk[0] = ~s->seed_lo;
    out->counter = aios_fast_hash64(blk, sizeof(blk), KL_D_DRBG ^ 0x5BD1E995ULL);
    return AIOS_KEY_OK;
}

static void kl_derive_raw(const AiosMasterSeed* s,
                          uint64_t uid_lo, uint64_t uid_hi,
                          const char* label, uint32_t epoch,
                          AiosDerivedKey* out) {
    uint32_t nlen = 0;
    uint16_t tag = kl_label_tag(label, &nlen);
    uint64_t lh = aios_fast_hash64(label ? (const void*)label : (const void*)"",
                                   nlen, KL_D_LABEL ^ epoch);
    uint64_t blk[5] = { s->seed_lo, s->seed_hi, lh, (uint64_t)epoch,
                        uid_lo ^ uid_hi };
    out->key_lo = aios_fast_hash64(blk, sizeof(blk), KL_D_KEY);
    blk[0] = ~s->seed_hi; blk[2] = ~lh;
    out->key_hi = aios_fast_hash64(blk, sizeof(blk), KL_D_KEY ^ 0xC6A4A7935BD1E995ULL);
    out->epoch = epoch;
    out->label_tag = tag;
    out->valid = 1;
    out->_pad = 0;
}

AiosKeyStatus aios_key_derive(const AiosMasterSeed* s,
                              uint64_t uid_lo, uint64_t uid_hi,
                              const char* label, uint32_t epoch,
                              AiosDerivedKey* out) {
    if (!out) return AIOS_KEY_ERR_ARG;
    out->valid = 0;
    AiosKeyStatus st = aios_seed_verify(s, uid_lo, uid_hi);
    if (st != AIOS_KEY_OK) return st;
    if (epoch < s->epoch_floor) return AIOS_KEY_ERR_EPOCH_STALE;
    if (epoch > s->epoch_floor + AIOS_KEY_EPOCH_LOOKAHEAD) return AIOS_KEY_ERR_EPOCH_FUTURE;
    kl_derive_raw(s, uid_lo, uid_hi, label, epoch, out);
    return AIOS_KEY_OK;
}

AiosKeyStatus aios_key_rotate(AiosMasterSeed* s, uint32_t new_epoch) {
    if (!s) return AIOS_KEY_ERR_ARG;
    if (!s->provisioned) return AIOS_KEY_ERR_NOT_PROV;
    if (new_epoch <= s->epoch_floor) return AIOS_KEY_ERR_EPOCH_STALE;  /* monotonic only */
    s->epoch_floor = new_epoch;
    return AIOS_KEY_OK;
}

AiosKeyStatus aios_key_verify(const AiosMasterSeed* s,
                              uint64_t uid_lo, uint64_t uid_hi,
                              const AiosDerivedKey* k, const char* label) {
    if (!k || !k->valid) return AIOS_KEY_ERR_ARG;
    AiosKeyStatus st = aios_seed_verify(s, uid_lo, uid_hi);
    if (st != AIOS_KEY_OK) return st;
    if (k->epoch < s->epoch_floor) return AIOS_KEY_ERR_EPOCH_STALE;
    AiosDerivedKey ref;
    kl_derive_raw(s, uid_lo, uid_hi, label, k->epoch, &ref);
    if (ref.key_lo != k->key_lo || ref.key_hi != k->key_hi ||
        ref.label_tag != k->label_tag) {
        return AIOS_KEY_ERR_MISMATCH;
    }
    return AIOS_KEY_OK;
}

AiosKeyStatus aios_key_export_raw(const AiosMasterSeed* s, const AiosDerivedKey* k,
                                  uint8_t out32[32]) {
    if (!s || !k || !out32) return AIOS_KEY_ERR_ARG;
    if (!s->provisioned) return AIOS_KEY_ERR_NOT_PROV;
    if (s->production_lock) return AIOS_KEY_ERR_LOCKED;
    memcpy(out32 + 0,  &k->key_lo, 8);
    memcpy(out32 + 8,  &k->key_hi, 8);
    memcpy(out32 + 16, &s->seed_lo, 8);
    memcpy(out32 + 24, &s->seed_hi, 8);
    return AIOS_KEY_OK;
}

void aios_seed_factory_reset(AiosMasterSeed* s) {
    if (!s) return;
    memset(s, 0, sizeof(*s));
    /* provisioned = 0, epoch_floor = 0: every derive now returns NOT_PROV. */
}
