/**
 * @file esp32s3_bridge.cpp
 * @brief Implementation of ESP32-S3 MCP/A2A Wireless Coprocessor Bridge
 */

#include "esp32s3_bridge.hpp"
#include "ra4m1_kernel.hpp"
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

// CRC16-CCITT Lookup Table (PROGMEM / Flash resident, Zero Heap)
static const uint16_t s_crc16_table[256] = {
    0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50A5, 0x60C6, 0x70E7,
    0x8108, 0x9129, 0xA14A, 0xB16B, 0xC18C, 0xD1AD, 0xE1CE, 0xF1EF,
    0x1231, 0x0210, 0x3273, 0x2252, 0x52B5, 0x4294, 0x72F7, 0x62D6,
    0x9339, 0x8318, 0xB37B, 0xA35A, 0xD3BD, 0xC39C, 0xF3FF, 0xE3DE,
    0x2462, 0x3443, 0x0420, 0x1401, 0x64E6, 0x74C7, 0x44A4, 0x5485,
    0xA56A, 0xB54B, 0x8528, 0x9509, 0xE5EE, 0xF5CF, 0xC5AC, 0xD58D,
    0x3653, 0x2672, 0x1611, 0x0630, 0x76D7, 0x66F6, 0x5695, 0x46B4,
    0xB75B, 0xA77A, 0x9719, 0x8738, 0xF7DF, 0xE7FE, 0xD79D, 0xC7BC,
    0x48C4, 0x58E5, 0x6886, 0x78A7, 0x0840, 0x1861, 0x2802, 0x3823,
    0xC9CC, 0xD9ED, 0xE98E, 0xF9AF, 0x8948, 0x9969, 0xA90A, 0xB92B,
    0x5AF5, 0x4AD4, 0x7AB7, 0x6A96, 0x1A71, 0x0A50, 0x3A33, 0x2A12,
    0xDBFD, 0xCBDC, 0xFBBF, 0xEB9E, 0x9B79, 0x8B58, 0xBB3B, 0xAB1A,
    0x6CA6, 0x7C87, 0x4CE4, 0x5CC5, 0x2C22, 0x3C03, 0x0C60, 0x1C41,
    0xEDAE, 0xFD8F, 0xCDEC, 0xDDCD, 0xAD2A, 0xBD0B, 0x8D68, 0x9D49,
    0x7E97, 0x6EB6, 0x5ED5, 0x4EF4, 0x3E13, 0x2E32, 0x1E51, 0x0E70,
    0xFF9F, 0xEFBE, 0xDFDD, 0xCFFC, 0xBF1B, 0xAF3A, 0x9F59, 0x8F78,
    0x9188, 0x81A9, 0xB1CA, 0xA1EB, 0xD10C, 0xC12D, 0xF14E, 0xE16F,
    0x1080, 0x00A1, 0x30C2, 0x20E3, 0x5004, 0x4025, 0x7046, 0x6067,
    0x83B9, 0x9398, 0xA3FB, 0xB3DA, 0xC33D, 0xD31C, 0xE37F, 0xF35E,
    0x02B1, 0x1290, 0x22F3, 0x32D2, 0x4235, 0x5214, 0x6277, 0x7256,
    0xB5EA, 0xA5CB, 0x95A8, 0x8589, 0xF56E, 0xE54F, 0xD52C, 0xC50D,
    0x34E2, 0x24C3, 0x14A0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
    0xA7DB, 0xB7FA, 0x8799, 0x97B8, 0xE75F, 0xF77E, 0xC71D, 0xD73C,
    0x26D3, 0x36F2, 0x0691, 0x16B0, 0x6657, 0x7676, 0x4615, 0x5634,
    0xD94C, 0xC96D, 0xF90E, 0xE92F, 0x99C8, 0x89E9, 0xB98A, 0xA9AB,
    0x5844, 0x4865, 0x7806, 0x6827, 0x18C0, 0x08E1, 0x3882, 0x28A3,
    0xCB7D, 0xDB5C, 0xEB3F, 0xFB1E, 0x8BF9, 0x9BD8, 0xABBB, 0xBB9A,
    0x4A75, 0x5A54, 0x6A37, 0x7A16, 0x0AF1, 0x1AD0, 0x2AB3, 0x3A92,
    0xFD2E, 0xED0F, 0xDD6C, 0xCD4D, 0xBDAA, 0xAD8B, 0x9DE8, 0x8DC9,
    0x7C26, 0x6C07, 0x5C64, 0x4C45, 0x3CA2, 0x2C83, 0x1CE0, 0x0CC1,
    0xEF1F, 0xFF3E, 0xCF5D, 0xDF7C, 0xAF9B, 0xBFBA, 0x8FD9, 0x9FF8,
    0x6E17, 0x7E36, 0x4E55, 0x5E74, 0x2E93, 0x3EB2, 0x0ED1, 0x1EF0
};

uint16_t aios_calc_crc16(const void* data, size_t len) {
    const uint8_t* p = (const uint8_t*)data;
    uint16_t crc = 0xFFFFU;
    while (len--) {
        crc = (crc << 8) ^ s_crc16_table[((crc >> 8) ^ *p++) & 0xFF];
    }
    return crc;
}

// ----------------------------------------------------------------------------
// 1. INITIALIZATION
// ----------------------------------------------------------------------------

void esp32s3_bridge_init(Esp32BridgeState* state) {
    if (!state) return;
    memset(state, 0, sizeof(Esp32BridgeState));
    state->head = 0;
    state->tail = 0;
    state->backpressure_active = false;
}

// ----------------------------------------------------------------------------
// 2. SIMD / VECTOR PIPELINED HASHING (1.49 CYCLES / BYTE TARGET)
// ----------------------------------------------------------------------------

uint64_t esp32s3_simd_hash64(const void* data, size_t len, uint64_t seed) {
    const uint8_t* ptr = (const uint8_t*)data;
    uint64_t v0 = seed ^ 0x736f6d6570736575ULL;
    uint64_t v1 = seed ^ 0x646f72616e646f6dULL;
    uint64_t v2 = seed ^ 0x6c7967656e657261ULL;
    uint64_t v3 = seed ^ 0x7465646279746573ULL;

    // Vector pipeline: unroll 16-byte steps (4x 32-bit SIMD registers)
    while (len >= 16) {
        uint32_t w0 = ((const uint32_t*)ptr)[0];
        uint32_t w1 = ((const uint32_t*)ptr)[1];
        uint32_t w2 = ((const uint32_t*)ptr)[2];
        uint32_t w3 = ((const uint32_t*)ptr)[3];

        v0 += (uint64_t)w0 * 0x5BD1E995ULL;
        v1 += (uint64_t)w1 * 0x5BD1E995ULL;
        v2 += (uint64_t)w2 * 0x5BD1E995ULL;
        v3 += (uint64_t)w3 * 0x5BD1E995ULL;

        v0 ^= (v0 >> 31);
        v1 ^= (v1 >> 31);
        v2 ^= (v2 >> 31);
        v3 ^= (v3 >> 31);

        ptr += 16;
        len -= 16;
    }

    // Combine 4 vector lanes into single 64-bit result
    uint64_t combined = v0 ^ (v1 << 16) ^ (v2 << 32) ^ (v3 << 48);

    // Drain remainder with fast byte mixing
    if (len > 0) {
        combined = aios_fast_hash64(ptr, len, combined);
    }

    return combined;
}

// ----------------------------------------------------------------------------
// 3. NON-BLOCKING L4 PACKET INGESTION & BUFFER STALL EVASION
// ----------------------------------------------------------------------------

bool esp32s3_bridge_ingest_l4(Esp32BridgeState* state, const uint8_t* raw_data, uint16_t len) {
    if (!state || !raw_data || len == 0 || len > 2048) return false;

    uint32_t h = state->head;
    uint32_t t = state->tail;
    uint32_t used = (h >= t) ? (h - t) : (ESP32S3_RING_BUFFER_SIZE - (t - h));
    uint32_t needed = len + 2U; // 2-byte prefix length

    // Deadlock / Pipe Buffer Stall Evasion Rule:
    // If buffer fill exceeds high watermark threshold, DROP & ASSERT BACKPRESSURE.
    if ((used + needed) >= ESP32S3_STALL_WATERMARK) {
        state->backpressure_active = true;
        state->pipe_stall_events_evaded++;
        aios_stderr_write("[BRIDGE_DEADLOCK_PREVENTED] L4_RING_BUFFER_STALL_WATERMARK_TRIPPED used=");
        aios_stderr_write_hex64(used);
        aios_stderr_write("\n");
        return false;
    }

    // Write 2-byte length header
    state->ring_buffer[h] = (uint8_t)(len & 0xFFU);
    h = (h + 1U) & ESP32S3_RING_BUFFER_MASK;
    state->ring_buffer[h] = (uint8_t)((len >> 8) & 0xFFU);
    h = (h + 1U) & ESP32S3_RING_BUFFER_MASK;

    // Fast copy payload into circular ring buffer
    for (uint16_t i = 0; i < len; ++i) {
        state->ring_buffer[h] = raw_data[i];
        h = (h + 1U) & ESP32S3_RING_BUFFER_MASK;
    }

    // Atomic update of head pointer
    state->head = h;
    state->total_packets_ingested++;

    // Deassert backpressure if buffer drained below 50%
    if (used < (ESP32S3_RING_BUFFER_SIZE / 2U)) {
        state->backpressure_active = false;
    }

    return true;
}

// ----------------------------------------------------------------------------
// 4. NON-BLOCKING JSON-RPC PACKET PROCESSOR & WIRE FORWARDER
// ----------------------------------------------------------------------------

bool esp32s3_bridge_process_and_forward(Esp32BridgeState* state, AiosWireFrame* out_frame) {
    if (!state || !out_frame) return false;

    uint32_t h = state->head;
    uint32_t t = state->tail;

    // Queue empty
    if (h == t) return false;

    // Read 2-byte length
    uint8_t l_low = state->ring_buffer[t];
    t = (t + 1U) & ESP32S3_RING_BUFFER_MASK;
    uint8_t l_high = state->ring_buffer[t];
    t = (t + 1U) & ESP32S3_RING_BUFFER_MASK;
    uint16_t pkt_len = (uint16_t)l_low | ((uint16_t)l_high << 8);

    // Temporary linear buffer on stack for JSON-RPC parsing (Zero heap)
    char parse_buf[512];
    uint16_t copy_len = (pkt_len < sizeof(parse_buf)) ? pkt_len : sizeof(parse_buf);

    for (uint16_t i = 0; i < pkt_len; ++i) {
        uint8_t byte = state->ring_buffer[t];
        if (i < copy_len) {
            parse_buf[i] = (char)byte;
        }
        t = (t + 1U) & ESP32S3_RING_BUFFER_MASK;
    }

    // Compute SIMD hash of the full payload
    uint64_t contract_hash = esp32s3_simd_hash64(parse_buf, copy_len, 0x9E3779B97F4A7C15ULL);

    // Fast Token Scanner on stack
    AiosTokenTable table;
    aios_scan_json_tokens(parse_buf, copy_len, &table);

    // Extract JSON-RPC method hash and ID
    uint64_t method_hash = 0ULL;
    uint64_t rpc_id = 0ULL;
    uint8_t agent_id = AGENT_ID_HERMES;
    uint8_t msg_type = MSG_TYPE_MCP_TOOL_CALL;

    // Look for method key hash ("method" -> precomputed hash)
    uint64_t hash_method_key = aios_fast_hash64("method", 6, 0xCBF29CE484222325ULL);
    const AiosTokenOffset* tok_method = aios_find_token(&table, hash_method_key);
    if (tok_method && tok_method->val_len > 0) {
        method_hash = aios_fast_hash64(&parse_buf[tok_method->val_offset], tok_method->val_len, 0);
        // Check if A2A or MCP
        if (tok_method->val_len >= 3 && parse_buf[tok_method->val_offset] == 'a' && 
            parse_buf[tok_method->val_offset+1] == '2' && parse_buf[tok_method->val_offset+2] == 'a') {
            msg_type = MSG_TYPE_A2A_MESSAGE;
            agent_id = AGENT_ID_PC_CODER;
        }
    }

    // Look for id key ("id")
    uint64_t hash_id_key = aios_fast_hash64("id", 2, 0xCBF29CE484222325ULL);
    const AiosTokenOffset* tok_id = aios_find_token(&table, hash_id_key);
    if (tok_id && tok_id->val_len > 0) {
        // Parse simple integer or hash of id
        rpc_id = aios_fast_hash64(&parse_buf[tok_id->val_offset], tok_id->val_len, 0);
    }

    // Assemble 32-byte compact wire frame
    out_frame->sync_magic    = AIOS_WIRE_MAGIC;
    out_frame->msg_type      = msg_type;
    out_frame->agent_id      = agent_id;
    out_frame->rpc_id        = rpc_id;
    out_frame->method_hash   = method_hash;
    out_frame->contract_hash = contract_hash;
    out_frame->payload_len   = pkt_len;
    out_frame->crc16         = aios_calc_crc16(out_frame, sizeof(AiosWireFrame) - sizeof(uint16_t));

    // Commit ring buffer read
    state->tail = t;
    state->total_frames_forwarded++;

    return true;
}

#ifdef __cplusplus
}
#endif
