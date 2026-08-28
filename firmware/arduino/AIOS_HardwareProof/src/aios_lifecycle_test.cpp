/**
 * @file aios_lifecycle_test.cpp
 * @brief On-device proof suite for the crypto key lifecycle (§6) and the
 *        firmware lifecycle (§7).  Deterministic, zero-heap.
 *
 * KEY LIFECYCLE
 *   KL-01  Initial seed generation is deterministic for fixed inputs
 *   KL-02  Seal binds to silicon UID  (flash-dump / device-transplant fails)
 *   KL-03  Key derivation reproducible after a "reset" (re-derive from blob)
 *   KL-04  DRBG re-derived from seed: deterministic, and advances after reseed
 *   KL-05  Label / epoch domain separation
 *   KL-06  Rotation invalidates keys minted for an earlier epoch (STALE)
 *   KL-07  Rotation is monotonic (downgrade rejected)
 *   KL-08  Epoch too far ahead of the floor is rejected (FUTURE)
 *   KL-09  production_lock blocks raw export, derive still works
 *   KL-10  Factory reset zeroizes the seed -> NOT_PROVISIONED
 *
 * FIRMWARE LIFECYCLE
 *   FW-01  Version negotiation: in-range OK, below/above -> INCOMPAT
 *   FW-02  Valid authenticated image stages, pending set
 *   FW-03  One flipped image byte -> CRC/SIG fail, state unchanged
 *   FW-04  Manifest field tampered w/ stale MAC -> SIG fail
 *   FW-05  Wrong update key -> SIG fail
 *   FW-06  Downgrade (version <= floor) -> DOWNGRADE
 *   FW-07  Replayed update nonce -> NONCE on the 2nd stage
 *   FW-08  Truncated / half-written body -> CRC, no pending
 *   FW-09  Commit w/ health OK: active switches, floor bumps
 *   FW-10  Commit w/ health BAD: rollback, active unchanged
 *   FW-11  Power-loss before commit: resume validates pending, re-commit works
 *   FW-12  Boot-loop: exceed max attempts w/ pending -> auto rollback
 */

#include "ra4m1_kernel.hpp"
#include "aios_key_lifecycle.hpp"
#include "aios_fw_lifecycle.hpp"

#include <stdio.h>
#include <string.h>

/* Deterministic stand-ins for real silicon values (mock root of truth). */
#define TEST_UID_LO   (0x35130A2536313231ULL)
#define TEST_UID_HI   (0xB43F33334B572F26ULL)
#define TEST_UID2_LO  (0x0000000000000001ULL)  /* a "different" device */
#define TEST_UID2_HI  (0x0000000000000002ULL)
#define TEST_TRNG_LO  (0xC0FFEE1234567890ULL)
#define TEST_TRNG_HI  (0x9876543210ABCDEFULL)
#define TEST_UPD_KEY  (0x5150C0DE5150C0DEULL)

typedef struct { const char* id; const char* name; bool pass; long detail; } LcRec;
static LcRec s_lc[24];
static int   s_lc_n = 0;

static void lc_add(const char* id, const char* name, bool pass, long detail) {
    if (s_lc_n < (int)(sizeof(s_lc) / sizeof(s_lc[0]))) {
        s_lc[s_lc_n].id = id; s_lc[s_lc_n].name = name;
        s_lc[s_lc_n].pass = pass; s_lc[s_lc_n].detail = detail;
        s_lc_n++;
    }
}

/* ---------------------------------------------------------------- key lifecycle */
static void run_key_lifecycle(void) {
    AiosMasterSeed a, b;
    aios_seed_generate(&a, TEST_UID_LO, TEST_UID_HI, TEST_TRNG_LO, TEST_TRNG_HI);
    aios_seed_generate(&b, TEST_UID_LO, TEST_UID_HI, TEST_TRNG_LO, TEST_TRNG_HI);
    lc_add("KL-01", "seed generation deterministic",
           a.seed_lo == b.seed_lo && a.seed_hi == b.seed_hi && a.seal == b.seal, 0);

    bool same_ok  = (aios_seed_verify(&a, TEST_UID_LO, TEST_UID_HI) == AIOS_KEY_OK);
    bool other_no = (aios_seed_verify(&a, TEST_UID2_LO, TEST_UID2_HI) == AIOS_KEY_ERR_UNSEALED);
    lc_add("KL-02", "seal binds to silicon UID (transplant fails)", same_ok && other_no, 0);

    AiosDerivedKey k1, k2;
    AiosKeyStatus d1 = aios_key_derive(&a, TEST_UID_LO, TEST_UID_HI, "bridge-mac", 1, &k1);
    /* simulate reset: reconstruct the record from its stored fields only */
    AiosMasterSeed restored = a;
    AiosKeyStatus d2 = aios_key_derive(&restored, TEST_UID_LO, TEST_UID_HI, "bridge-mac", 1, &k2);
    lc_add("KL-03", "key derivation reproducible after reset",
           d1 == AIOS_KEY_OK && d2 == AIOS_KEY_OK &&
           k1.key_lo == k2.key_lo && k1.key_hi == k2.key_hi, 0);

    AiosPrng p1, p2, p3;
    aios_drbg_from_seed(&a, TEST_UID_LO, TEST_UID_HI, &p1);
    aios_drbg_from_seed(&restored, TEST_UID_LO, TEST_UID_HI, &p2);
    uint64_t s1 = aios_prng_next64(&p1), s2 = aios_prng_next64(&p2);
    AiosMasterSeed reseeded = a;
    aios_seed_reseed(&reseeded, TEST_UID_LO, TEST_UID_HI, 0xAAAA5555AAAA5555ULL, 0x1111222233334444ULL);
    aios_drbg_from_seed(&reseeded, TEST_UID_LO, TEST_UID_HI, &p3);
    uint64_t s3 = aios_prng_next64(&p3);
    lc_add("KL-04", "DRBG re-derive deterministic, advances after reseed",
           s1 == s2 && s3 != s1 && reseeded.reseed_counter == 1, 0);

    AiosDerivedKey ka, kb, kc;
    aios_key_derive(&a, TEST_UID_LO, TEST_UID_HI, "label-A", 1, &ka);
    aios_key_derive(&a, TEST_UID_LO, TEST_UID_HI, "label-B", 1, &kb);
    aios_key_derive(&a, TEST_UID_LO, TEST_UID_HI, "label-A", 2, &kc);
    bool distinct = (ka.key_lo != kb.key_lo) && (ka.key_lo != kc.key_lo) &&
                    (kb.key_lo != kc.key_lo);
    lc_add("KL-05", "label / epoch domain separation", distinct, 0);

    AiosMasterSeed rot = a;
    AiosDerivedKey old_key;
    aios_key_derive(&rot, TEST_UID_LO, TEST_UID_HI, "sess", 1, &old_key);
    AiosKeyStatus r = aios_key_rotate(&rot, 3);
    AiosKeyStatus vold = aios_key_verify(&rot, TEST_UID_LO, TEST_UID_HI, &old_key, "sess");
    AiosDerivedKey new_key;
    AiosKeyStatus dnew = aios_key_derive(&rot, TEST_UID_LO, TEST_UID_HI, "sess", 3, &new_key);
    lc_add("KL-06", "rotation invalidates earlier-epoch keys",
           r == AIOS_KEY_OK && vold == AIOS_KEY_ERR_EPOCH_STALE && dnew == AIOS_KEY_OK, 0);

    AiosKeyStatus downgrade = aios_key_rotate(&rot, 2);   /* < current floor 3 */
    lc_add("KL-07", "rotation is monotonic (downgrade rejected)",
           downgrade == AIOS_KEY_ERR_EPOCH_STALE && rot.epoch_floor == 3, 0);

    AiosDerivedKey future;
    AiosKeyStatus fut = aios_key_derive(&a, TEST_UID_LO, TEST_UID_HI, "x",
                                        1 + AIOS_KEY_EPOCH_LOOKAHEAD + 1, &future);
    lc_add("KL-08", "epoch far ahead of floor rejected", fut == AIOS_KEY_ERR_EPOCH_FUTURE, 0);

    AiosMasterSeed locked;
    aios_seed_generate(&locked, TEST_UID_LO, TEST_UID_HI, TEST_TRNG_LO, TEST_TRNG_HI);
    locked.production_lock = 1;   /* seal covers seed+uid+counter, not this flag */
    AiosDerivedKey lk;
    AiosKeyStatus dl = aios_key_derive(&locked, TEST_UID_LO, TEST_UID_HI, "p", 1, &lk);
    uint8_t raw[32];
    AiosKeyStatus ex = aios_key_export_raw(&locked, &lk, raw);
    lc_add("KL-09", "production_lock blocks raw export, derive still works",
           dl == AIOS_KEY_OK && ex == AIOS_KEY_ERR_LOCKED, 0);

    AiosMasterSeed fr = a;
    aios_seed_factory_reset(&fr);
    AiosDerivedKey fk;
    AiosKeyStatus df = aios_key_derive(&fr, TEST_UID_LO, TEST_UID_HI, "p", 1, &fk);
    bool wiped = (fr.seed_lo == 0 && fr.seed_hi == 0 && fr.provisioned == 0);
    lc_add("KL-10", "factory reset zeroizes seed -> NOT_PROVISIONED",
           wiped && df == AIOS_KEY_ERR_NOT_PROV, 0);
}

/* ------------------------------------------------------------ firmware lifecycle */
static void fill_image(uint8_t* img, uint32_t len, uint8_t tag) {
    for (uint32_t i = 0; i < len; i++) img[i] = (uint8_t)(tag + (i * 31u + 7u));
}

static void run_fw_lifecycle(void) {
    static uint8_t img[512];
    AiosFwState st;
    aios_fw_init(&st, /*factory_version*/ 10, /*min_compat*/ 8, /*max_compat*/ 12, TEST_UPD_KEY);

    bool neg_ok  = aios_fw_negotiate(&st, 10) == AIOS_FW_OK;
    bool neg_lo  = aios_fw_negotiate(&st, 7)  == AIOS_FW_ERR_INCOMPAT;
    bool neg_hi  = aios_fw_negotiate(&st, 13) == AIOS_FW_ERR_INCOMPAT;
    lc_add("FW-01", "version negotiation range", neg_ok && neg_lo && neg_hi, 0);

    /* Build a legit v11 image from the "provisioning server". */
    fill_image(img, 256, 0x11);
    AiosFwManifest m;
    memset(&m, 0, sizeof(m));
    m.version = 11; m.min_compat = 9; m.max_compat = 14; m.update_nonce = 0xA1A1A1A1ULL;
    aios_fw_manifest_seal(&m, img, 256, TEST_UPD_KEY);

    AiosFwStatus stg = aios_fw_stage(&st, &m, img, 256);
    lc_add("FW-02", "valid authenticated image stages",
           stg == AIOS_FW_OK && st.pending == (st.active ^ 1), 0);

    /* FW-03: flip one image byte, keep the same (now stale) manifest. */
    {
        AiosFwState s2 = st;
        s2.pending = 0xFF;
        uint8_t bad[256]; memcpy(bad, img, 256); bad[123] ^= 0x40;
        AiosFwStatus r = aios_fw_stage(&s2, &m, bad, 256);
        lc_add("FW-03", "one flipped image byte rejected, state unchanged",
               (r == AIOS_FW_ERR_SIG || r == AIOS_FW_ERR_CRC) && s2.pending == 0xFF, (long)r);
    }
    /* FW-04: tamper a manifest field but keep the old MAC. */
    {
        AiosFwState s2 = st; s2.pending = 0xFF;
        AiosFwManifest mm = m; mm.version = 99;
        AiosFwStatus r = aios_fw_stage(&s2, &mm, img, 256);
        lc_add("FW-04", "manifest tamper w/ stale MAC -> SIG", r == AIOS_FW_ERR_SIG, (long)r);
    }
    /* FW-05: correct image + manifest, wrong device update key. */
    {
        AiosFwState s2 = st; s2.pending = 0xFF; s2.update_key = 0xDEADBEEFDEADBEEFULL;
        AiosFwStatus r = aios_fw_stage(&s2, &m, img, 256);
        lc_add("FW-05", "wrong update key -> SIG", r == AIOS_FW_ERR_SIG, (long)r);
    }
    /* FW-06: downgrade below the floor (floor is 10). */
    {
        AiosFwState s2 = st; s2.pending = 0xFF;
        uint8_t di[64]; fill_image(di, 64, 0x09);
        AiosFwManifest dm; memset(&dm, 0, sizeof(dm));
        dm.version = 9; dm.min_compat = 8; dm.max_compat = 12; dm.update_nonce = 0xBEEF01ULL;
        aios_fw_manifest_seal(&dm, di, 64, TEST_UPD_KEY);
        AiosFwStatus r = aios_fw_stage(&s2, &dm, di, 64);
        lc_add("FW-06", "downgrade (version <= floor) -> DOWNGRADE",
               r == AIOS_FW_ERR_DOWNGRADE, (long)r);
    }
    /* FW-07: replay the exact same update package (same nonce). */
    {
        AiosFwState s2 = st;  /* st already consumed nonce 0xA1A1A1A1 in FW-02 */
        AiosFwStatus r = aios_fw_stage(&s2, &m, img, 256);
        lc_add("FW-07", "replayed update nonce -> NONCE", r == AIOS_FW_ERR_NONCE, (long)r);
    }
    /* FW-08: truncated body (declared 256, delivered 200). */
    {
        AiosFwState s2 = st; s2.pending = 0xFF;
        AiosFwStatus r = aios_fw_stage(&s2, &m, img, 200);
        lc_add("FW-08", "truncated / half-written body -> CRC, no pending",
               r == AIOS_FW_ERR_CRC && s2.pending == 0xFF, (long)r);
    }
    /* FW-09: healthy commit. */
    {
        AiosFwState s2 = st;
        uint8_t prev_active = s2.active;
        AiosFwStatus r = aios_fw_commit(&s2, /*health_ok*/ true);
        lc_add("FW-09", "healthy commit: active switches, floor bumps",
               r == AIOS_FW_OK && s2.active == (prev_active ^ 1) &&
               s2.version_floor == 11 && s2.pending == 0xFF, 0);
    }
    /* FW-10: failed health check -> rollback. */
    {
        AiosFwState s2 = st;
        uint8_t prev_active = s2.active;
        AiosFwStatus r = aios_fw_commit(&s2, /*health_ok*/ false);
        lc_add("FW-10", "failed health check -> rollback, active unchanged",
               r == AIOS_FW_ERR_HEALTH && s2.active == prev_active &&
               s2.pending == 0xFF && s2.version_floor == 10, 0);
    }
    /* FW-11: power loss before commit -> resume re-validates and re-commits. */
    {
        AiosFwState s2 = st;   /* pending still set, power dropped */
        AiosFwStatus boot = aios_fw_boot_begin(&s2);
        AiosFwStatus res  = aios_fw_resume(&s2, img, 256);
        AiosFwStatus cm   = aios_fw_commit(&s2, true);
        lc_add("FW-11", "power-loss: resume validates pending, re-commit works",
               boot == AIOS_FW_OK && res == AIOS_FW_OK && cm == AIOS_FW_OK &&
               s2.version_floor == 11, 0);
    }
    /* FW-12: boot-loop -> auto rollback after MAX_BOOT_ATTEMPTS. */
    {
        AiosFwState s2 = st;   /* pending set */
        AiosFwStatus last = AIOS_FW_OK;
        for (uint32_t i = 0; i < AIOS_FW_MAX_BOOT_ATTEMPTS + 1; i++)
            last = aios_fw_boot_begin(&s2);
        lc_add("FW-12", "boot-loop -> auto rollback (pending discarded)",
               last == AIOS_FW_ERR_HEALTH && s2.pending == 0xFF, 0);
    }
}

/* ------------------------------------------------------------------------- entry */
#ifdef AIOS_EMBED_SUITE
int aios_run_lifecycle_suite(void) {
#else
int main(void) {
#endif
    printf("====================================================================\n");
    printf("  AIOS LIFECYCLE SUITE  --  key lifecycle (sec 6) + firmware lifecycle (sec 7)\n");
    printf("====================================================================\n\n");

    s_lc_n = 0;
    run_key_lifecycle();
    run_fw_lifecycle();

    int key_fail = 0, fw_fail = 0;
    for (int i = 0; i < s_lc_n; i++) {
        printf("LIFECYCLE %s %-52s pass=%d detail=%ld\n",
               s_lc[i].id, s_lc[i].name, s_lc[i].pass ? 1 : 0, s_lc[i].detail);
        if (!s_lc[i].pass) {
            if (s_lc[i].id[0] == 'K') key_fail++; else fw_fail++;
        }
    }
    printf("\nAIOS_KEY_LIFECYCLE_SUITE=%s  (%d checks, %d fail)\n",
           key_fail == 0 ? "PASS" : "FAIL", 10, key_fail);
    printf("AIOS_FW_LIFECYCLE_SUITE=%s  (%d checks, %d fail)\n",
           fw_fail == 0 ? "PASS" : "FAIL", 12, fw_fail);
    printf("====================================================================\n");

    return (key_fail + fw_fail == 0) ? 0 : (key_fail + fw_fail);
}
