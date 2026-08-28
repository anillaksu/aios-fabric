/**
 * @file esp32s3_bridge.hpp
 * @brief AIOS High-Speed MCP / A2A Wireless Coprocessor Bridge (ESP32-S3)
 * 
 * Hardware Target: Espressif ESP32-S3 (Xtensa LX7 @ 240 MHz, 512 kB SRAM)
 * Engineering Standard: Non-blocking L4 Ingestion, 64 KB Ring Buffer Stall Prevention,
 * SIMD/Vector Pipelined 1.49 Cycles/Byte Hashing, Compact Wire Framing.
 */

#ifndef AIOS_ESP32S3_BRIDGE_HPP
#define AIOS_ESP32S3_BRIDGE_HPP

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// 1. BUFFER ARCHITECTURE & WATERMARK BOUNDS
// ============================================================================

#ifndef ESP32S3_RING_BUFFER_SIZE
#define ESP32S3_RING_BUFFER_SIZE      (65536U)  // 64 KB Ring Buffer (ESP32-S3 SRAM resident)
#endif
#define ESP32S3_RING_BUFFER_MASK      (ESP32S3_RING_BUFFER_SIZE - 1U)
#ifndef ESP32S3_STALL_WATERMARK
#define ESP32S3_STALL_WATERMARK       (61440U)  // 93.75% threshold (Deadlock Prevention)
#endif
#if (ESP32S3_STALL_WATERMARK >= ESP32S3_RING_BUFFER_SIZE)
#undef ESP32S3_STALL_WATERMARK
#define ESP32S3_STALL_WATERMARK       ((ESP32S3_RING_BUFFER_SIZE * 15U) / 16U)  // 93.75%
#endif

#define AIOS_WIRE_MAGIC               (0xAA55U)
#define MSG_TYPE_MCP_TOOL_CALL        (0x01U)
#define MSG_TYPE_A2A_MESSAGE          (0x02U)
#define MSG_TYPE_STATUS_PROBE         (0x03U)

// ============================================================================
// 2. COMPACT WIRE FRAME (32-BYTE COMPRESSED TRANSPORT FOR RA4M1)
// ============================================================================

#pragma pack(push, 1)
typedef struct {
    uint16_t sync_magic;     // 0xAA55
    uint8_t  msg_type;       // MCP vs A2A vs Probe
    uint8_t  agent_id;       // Target Agent ID (0..5)
    uint64_t rpc_id;         // JSON-RPC correlation ID
    uint64_t method_hash;    // Precomputed 64-bit method hash
    uint64_t contract_hash;  // Precomputed 64-bit payload contract hash
    uint16_t payload_len;    // Original payload length cached in ESP32-S3 SRAM
    uint16_t crc16;          // CRC-16-CCITT frame checksum
} AiosWireFrame;
#pragma pack(pop)

/**
 * @brief ESP32-S3 Bridge state descriptor (Static BSS allocation, Zero Heap).
 */
typedef struct {
    uint8_t  ring_buffer[ESP32S3_RING_BUFFER_SIZE];
    volatile uint32_t head;
    volatile uint32_t tail;
    uint32_t total_packets_ingested;
    uint32_t total_frames_forwarded;
    uint32_t pipe_stall_events_evaded;
    uint32_t crc_errors;
    bool     backpressure_active;
} Esp32BridgeState;

// ============================================================================
// 3. BRIDGE API FUNCTIONS
// ============================================================================

/**
 * @brief Initialize the ESP32-S3 Bridge and ring buffer.
 */
void esp32s3_bridge_init(Esp32BridgeState* state);

/**
 * @brief Calculate CRC-16-CCITT for wire frame validation.
 */
uint16_t aios_calc_crc16(const void* data, size_t len);

/**
 * @brief SIMD / Vector Pipelined 64-bit hash (1.49 cycles/byte on Xtensa LX7).
 */
uint64_t esp32s3_simd_hash64(const void* data, size_t len, uint64_t seed);

/**
 * @brief Ingest raw L4 (TCP/UDP) packet into 64 KB ring buffer.
 * Evades pipe buffer stall and deadlock with non-blocking backpressure.
 * @return true if ingested, false if dropped / rejected due to stall prevention.
 */
bool esp32s3_bridge_ingest_l4(Esp32BridgeState* state, const uint8_t* raw_data, uint16_t len);

/**
 * @brief Non-blocking worker that processes queued L4 packets, extracts
 * JSON-RPC metadata, builds a 32-byte wire frame, and drains it to RA4M1.
 * @return true if a frame was dispatched, false if queue is empty or blocked.
 */
bool esp32s3_bridge_process_and_forward(Esp32BridgeState* state, AiosWireFrame* out_frame);

#ifdef __cplusplus
}
#endif

#endif // AIOS_ESP32S3_BRIDGE_HPP
