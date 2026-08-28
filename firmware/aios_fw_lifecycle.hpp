/**
 * @file aios_fw_lifecycle.hpp
 * @brief AIOS firmware lifecycle primitives (RELEASE_CHECKLIST §7).
 *
 * Zero-heap, deterministic. Covers: firmware version negotiation, incompatible
 * version rejection, authenticated ("signed") update, MAC verification,
 * half-written / power-loss recovery, A/B slot rollback, anti-downgrade
 * (version floor) and single-use update-nonce replay rejection, plus factory
 * reset.
 *
 * HONEST SCOPE: authentication is a symmetric MAC (aios_fast_hash64 keyed with a
 * provisioned update key), NOT asymmetric code signing and NOT hardware secure
 * boot. The A/B "slots" here are in-RAM manifest records that model the flash
 * layout; wiring this to real dual-bank flash + a bootloader is a separate
 * integration step. Good enough for a controlled lab pilot with a trusted
 * provisioning channel; a production OTA path additionally needs asymmetric
 * signatures, a measured/verified boot chain, and rollback-protected fuses.
 */
#ifndef AIOS_FW_LIFECYCLE_HPP
#define AIOS_FW_LIFECYCLE_HPP

#include <stdint.h>
#include <stdbool.h>
#include "ra4m1_kernel.hpp"

#ifdef __cplusplus
extern "C" {
#endif

#define AIOS_FW_MAGIC             (0x41494F53UL)  /* 'AIOS' */
#define AIOS_FW_SLOTS             (2U)            /* A / B */
#define AIOS_FW_NONCE_RING        (8U)            /* consumed update-nonce window */
#define AIOS_FW_MAX_BOOT_ATTEMPTS (3U)            /* boot-loop -> auto rollback */
#define AIOS_FW_IMAGE_MAX         (4096U)         /* test image cap (bytes) */

typedef enum {
    AIOS_FW_OK           = 0,
    AIOS_FW_ERR_MAGIC    = 1,
    AIOS_FW_ERR_INCOMPAT = 2,  /* peer version outside active image compat range */
    AIOS_FW_ERR_DOWNGRADE= 3,  /* image version <= version_floor */
    AIOS_FW_ERR_SIG      = 4,  /* auth MAC mismatch */
    AIOS_FW_ERR_CRC      = 5,  /* staged image body corrupt / truncated */
    AIOS_FW_ERR_NONCE    = 6,  /* update nonce already consumed (replay) */
    AIOS_FW_ERR_NO_STAGE = 7,  /* commit/resume with nothing pending */
    AIOS_FW_ERR_HEALTH   = 8,  /* post-boot health check failed -> rolled back */
    AIOS_FW_ERR_ARG      = 9
} AiosFwStatus;

/** Update manifest -- travels with the image from the build/provisioning side. */
typedef struct {
    uint32_t magic;
    uint16_t version;      /* monotonic firmware version */
    uint16_t min_compat;   /* oldest peer/config version this image supports */
    uint16_t max_compat;   /* newest peer/config version this image supports */
    uint16_t image_bytes;  /* declared image body length */
    uint64_t update_nonce; /* single-use, issued per update */
    uint64_t image_crc;    /* keyless integrity hash over the image body */
    uint64_t auth_mac;     /* keyed MAC over (header || image body) */
} AiosFwManifest;

/** Device-side firmware lifecycle state (models the flash layout). */
typedef struct {
    AiosFwManifest slot[AIOS_FW_SLOTS];
    uint64_t nonce_ring[AIOS_FW_NONCE_RING];
    uint64_t update_key;     /* provisioned authenticated-update key */
    uint16_t version_floor;  /* highest version ever committed -- anti-downgrade */
    uint8_t  active;         /* running slot: 0 or 1 */
    uint8_t  pending;        /* staged slot awaiting commit, 0xFF = none */
    uint8_t  boot_attempts;  /* bumped on boot_begin, cleared on healthy commit */
    uint8_t  nonce_pos;
    uint8_t  _pad[2];
} AiosFwState;

/** Bring up the state with a factory image in slot A. */
void aios_fw_init(AiosFwState* st, uint16_t factory_version,
                  uint16_t min_compat, uint16_t max_compat,
                  uint64_t update_key);

/**
 * Build/provisioning helper: fill image_crc + auth_mac for a manifest so it is a
 * valid update package for `update_key`. (Device never calls this; tests and the
 * build server do.)
 */
void aios_fw_manifest_seal(AiosFwManifest* m, const uint8_t* image, uint32_t len,
                           uint64_t update_key);

/**
 * Version negotiation: is `peer_version` inside the active image's compat range?
 * Returns AIOS_FW_OK or AIOS_FW_ERR_INCOMPAT.
 */
AiosFwStatus aios_fw_negotiate(const AiosFwState* st, uint16_t peer_version);

/**
 * Secure update -- stage an image into the inactive slot. Checks, in order:
 * magic, auth MAC (signature), image CRC (half-write / truncation), version >
 * version_floor (downgrade / rollback attack), nonce not already consumed
 * (replay). On success: writes the inactive slot, sets `pending`, records the
 * nonce. On any failure: state is unchanged.
 */
AiosFwStatus aios_fw_stage(AiosFwState* st, const AiosFwManifest* m,
                           const uint8_t* image, uint32_t len);

/**
 * Commit the staged image after a boot + health check.
 *   health_ok = true  -> active := pending, version_floor := new version,
 *                        boot_attempts := 0, pending cleared.
 *   health_ok = false -> pending discarded, stay on the known-good slot
 *                        (returns AIOS_FW_ERR_HEALTH).
 * If power is lost before this call, `pending` is still set and `active` is
 * unchanged, so the next boot re-runs the commit path (see aios_fw_resume).
 */
AiosFwStatus aios_fw_commit(AiosFwState* st, bool health_ok);

/**
 * Call once at every boot before running the image. Bumps boot_attempts; if it
 * exceeds AIOS_FW_MAX_BOOT_ATTEMPTS while a slot is pending, auto-rolls-back
 * (discards pending) and returns AIOS_FW_ERR_HEALTH.
 */
AiosFwStatus aios_fw_boot_begin(AiosFwState* st);

/**
 * Power-loss recovery: if a slot is pending, re-validate its manifest MAC/CRC
 * against the stored image hash. Valid -> AIOS_FW_OK (caller may re-commit).
 * Invalid/torn -> pending discarded, AIOS_FW_ERR_CRC.
 */
AiosFwStatus aios_fw_resume(AiosFwState* st, const uint8_t* pending_image, uint32_t len);

/** Factory reset: revert to slot A, drop any pending image. The anti-downgrade
 *  version_floor is deliberately KEPT (a reset must not re-open old versions). */
void aios_fw_factory_reset(AiosFwState* st);

/** Convenience: version of the currently active slot. */
uint16_t aios_fw_active_version(const AiosFwState* st);

#ifdef __cplusplus
}
#endif
#endif /* AIOS_FW_LIFECYCLE_HPP */
