/**
 * @file aios_fw_lifecycle.cpp
 * @brief Implementation of the AIOS firmware lifecycle primitives (§7).
 */
#include "aios_fw_lifecycle.hpp"
#include <string.h>

#define FW_D_CRC  (0x0C0FFEE0C0FFEE00ULL)
#define FW_D_MAC  (0x5164ED5164ED5164ULL)

#define FW_NONE   (0xFFU)

static uint64_t fw_image_crc(const uint8_t* image, uint32_t len) {
    return aios_fast_hash64(image ? image : (const uint8_t*)"", len, FW_D_CRC);
}

static uint64_t fw_auth_mac(const AiosFwManifest* m, const uint8_t* image,
                            uint32_t len, uint64_t key) {
    /* MAC over the header fields that must not move + the image body. */
    uint64_t hdr[6] = {
        ((uint64_t)m->magic) | ((uint64_t)m->version << 32) |
            ((uint64_t)m->min_compat << 48),
        ((uint64_t)m->max_compat) | ((uint64_t)m->image_bytes << 16),
        m->update_nonce,
        m->image_crc,
        key,
        (uint64_t)len
    };
    uint64_t h = aios_fast_hash64(hdr, sizeof(hdr), key ^ FW_D_MAC);
    h ^= aios_fast_hash64(image ? image : (const uint8_t*)"", len,
                          h ^ 0x9E3779B97F4A7C15ULL);
    return h;
}

void aios_fw_init(AiosFwState* st, uint16_t factory_version,
                  uint16_t min_compat, uint16_t max_compat,
                  uint64_t update_key) {
    if (!st) return;
    memset(st, 0, sizeof(*st));
    st->update_key = update_key;
    st->active = 0;
    st->pending = FW_NONE;
    st->version_floor = factory_version;
    st->boot_attempts = 0;
    AiosFwManifest* a = &st->slot[0];
    a->magic = AIOS_FW_MAGIC;
    a->version = factory_version;
    a->min_compat = min_compat;
    a->max_compat = max_compat;
    a->image_bytes = 0;
    a->update_nonce = 0;
    a->image_crc = fw_image_crc((const uint8_t*)"", 0);
    a->auth_mac = fw_auth_mac(a, (const uint8_t*)"", 0, update_key);
}

void aios_fw_manifest_seal(AiosFwManifest* m, const uint8_t* image, uint32_t len,
                           uint64_t update_key) {
    if (!m) return;
    m->magic = AIOS_FW_MAGIC;
    m->image_bytes = (uint16_t)len;
    m->image_crc = fw_image_crc(image, len);
    m->auth_mac = fw_auth_mac(m, image, len, update_key);
}

AiosFwStatus aios_fw_negotiate(const AiosFwState* st, uint16_t peer_version) {
    if (!st) return AIOS_FW_ERR_ARG;
    const AiosFwManifest* a = &st->slot[st->active];
    if (peer_version < a->min_compat || peer_version > a->max_compat)
        return AIOS_FW_ERR_INCOMPAT;
    return AIOS_FW_OK;
}

static bool fw_nonce_seen(const AiosFwState* st, uint64_t nonce) {
    for (uint32_t i = 0; i < AIOS_FW_NONCE_RING; i++)
        if (st->nonce_ring[i] == nonce && nonce != 0) return true;
    return false;
}

AiosFwStatus aios_fw_stage(AiosFwState* st, const AiosFwManifest* m,
                           const uint8_t* image, uint32_t len) {
    if (!st || !m || (!image && len)) return AIOS_FW_ERR_ARG;
    if (len > AIOS_FW_IMAGE_MAX) return AIOS_FW_ERR_ARG;

    if (m->magic != AIOS_FW_MAGIC) return AIOS_FW_ERR_MAGIC;

    /* framing: a delivered body that does not match the declared length is a
     * torn / half-written transfer -- cheaper to reject than a full MAC pass. */
    if (m->image_bytes != (uint16_t)len) return AIOS_FW_ERR_CRC;

    /* signature over (header || body) before trusting any manifest field */
    if (fw_auth_mac(m, image, len, st->update_key) != m->auth_mac)
        return AIOS_FW_ERR_SIG;

    /* keyless body integrity hash (catches corruption the length check missed) */
    if (fw_image_crc(image, len) != m->image_crc) return AIOS_FW_ERR_CRC;

    /* anti-downgrade / rollback attack */
    if (m->version <= st->version_floor) return AIOS_FW_ERR_DOWNGRADE;

    /* replay of a previously consumed update package */
    if (fw_nonce_seen(st, m->update_nonce)) return AIOS_FW_ERR_NONCE;

    uint8_t target = (uint8_t)(st->active ^ 1u);
    st->slot[target] = *m;
    st->pending = target;
    st->nonce_ring[st->nonce_pos] = m->update_nonce;
    st->nonce_pos = (uint8_t)((st->nonce_pos + 1u) % AIOS_FW_NONCE_RING);
    return AIOS_FW_OK;
}

AiosFwStatus aios_fw_commit(AiosFwState* st, bool health_ok) {
    if (!st) return AIOS_FW_ERR_ARG;
    if (st->pending == FW_NONE) return AIOS_FW_ERR_NO_STAGE;

    if (!health_ok) {
        st->pending = FW_NONE;               /* discard, stay on known-good */
        st->boot_attempts = 0;
        return AIOS_FW_ERR_HEALTH;
    }
    uint16_t newv = st->slot[st->pending].version;
    st->active = st->pending;
    st->pending = FW_NONE;
    if (newv > st->version_floor) st->version_floor = newv;
    st->boot_attempts = 0;
    return AIOS_FW_OK;
}

AiosFwStatus aios_fw_boot_begin(AiosFwState* st) {
    if (!st) return AIOS_FW_ERR_ARG;
    if (st->boot_attempts < 0xFF) st->boot_attempts++;
    if (st->pending != FW_NONE && st->boot_attempts > AIOS_FW_MAX_BOOT_ATTEMPTS) {
        st->pending = FW_NONE;               /* boot loop -> auto rollback */
        st->boot_attempts = 0;
        return AIOS_FW_ERR_HEALTH;
    }
    return AIOS_FW_OK;
}

AiosFwStatus aios_fw_resume(AiosFwState* st, const uint8_t* pending_image, uint32_t len) {
    if (!st) return AIOS_FW_ERR_ARG;
    if (st->pending == FW_NONE) return AIOS_FW_ERR_NO_STAGE;
    const AiosFwManifest* m = &st->slot[st->pending];
    bool torn = (m->magic != AIOS_FW_MAGIC) ||
                (m->image_bytes != (uint16_t)len) ||
                (fw_image_crc(pending_image, len) != m->image_crc) ||
                (fw_auth_mac(m, pending_image, len, st->update_key) != m->auth_mac);
    if (torn) {
        st->pending = FW_NONE;
        return AIOS_FW_ERR_CRC;
    }
    return AIOS_FW_OK;
}

void aios_fw_factory_reset(AiosFwState* st) {
    if (!st) return;
    st->active = 0;
    st->pending = FW_NONE;
    st->boot_attempts = 0;
    /* version_floor intentionally preserved (anti-rollback survives reset) */
}

uint16_t aios_fw_active_version(const AiosFwState* st) {
    return st ? st->slot[st->active].version : 0;
}
