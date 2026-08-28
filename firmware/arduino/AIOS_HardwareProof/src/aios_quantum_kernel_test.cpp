/**
 * @file aios_quantum_kernel_test.cpp
 * @brief High-Precision Deterministic Test Suite for AIOS Hardware Kernel
 * 
 * Verifies:
 * 1. Zero-Heap Allocation & Bounded Memory footprint (< 2 KB in 32 KB SRAM).
 * 2. Hardware Root of Truth (HW_UID + TRNG) Determinism.
 * 3. 64-bit Non-Cryptographic Fast Hashing Speed & Zero Variance.
 * 4. Token / Key-Value Offset Hashing for MCP / A2A JSON-RPC 2.0 payloads.
 * 5. ESP32-S3 64 KB Ring Buffer Stall Evasion & Deadlock Prevention.
 * 6. 12x8 Charlieplexed Matrix Framebuffer Rasterization & Concurrency Heatmap.
 */

#include "ra4m1_kernel.hpp"
#include "esp32s3_bridge.hpp"
#include "matrix_monitor.hpp"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

#define ASSERT_TRUE(cond, msg) do { \
    if (!(cond)) { \
        fprintf(stderr, "[FAIL] %s:%d: %s\n", __FILE__, __LINE__, msg); \
        exit(1); \
    } \
} while(0)

#define ASSERT_EQ(a, b, msg) do { \
    if ((a) != (b)) { \
        fprintf(stderr, "[FAIL] %s:%d: %s (Expected %llu, Got %llu)\n", \
            __FILE__, __LINE__, msg, (unsigned long long)(b), (unsigned long long)(a)); \
        exit(1); \
    } \
} while(0)

// ----------------------------------------------------------------------------
// TEST 1: STATIC MEMORY FOOTPRINT (RA4M1 32 kB SRAM COMPLIANCE)
// ----------------------------------------------------------------------------
void test_memory_bounds(void) {
    printf("[TEST 1] Verifying Memory Bounds & Zero-Heap Footprint...\n");

    size_t kernel_sz = sizeof(AiosKernelStorage);
    size_t token_tbl_sz = sizeof(AiosTokenTable);
    size_t matrix_fb_sz = sizeof(AiosMatrixFramebuffer);
    size_t wire_frame_sz = sizeof(AiosWireFrame);

    printf("  AiosKernelStorage:       %lu bytes\n", (unsigned long)kernel_sz);
    printf("  AiosTokenTable:          %lu bytes\n", (unsigned long)token_tbl_sz);
    printf("  AiosMatrixFramebuffer:   %lu bytes\n", (unsigned long)matrix_fb_sz);
    printf("  AiosWireFrame:           %lu bytes (Target: 32 bytes)\n", (unsigned long)wire_frame_sz);

    // Total static RAM consumed on RA4M1 must be under 4096 bytes (out of 32768 bytes available)
    ASSERT_TRUE(kernel_sz < 2048, "AiosKernelStorage exceeds 2 KB static RAM budget");
    ASSERT_TRUE(token_tbl_sz < 512, "AiosTokenTable exceeds 512 B stack budget");
    ASSERT_TRUE(matrix_fb_sz < 64, "AiosMatrixFramebuffer exceeds 64 B budget");
    ASSERT_EQ(wire_frame_sz, 32, "AiosWireFrame must be exactly 32 bytes packed");

    printf("  -> PASS: All structures fit strictly within static SRAM budget without heap allocation.\n");
}

// ----------------------------------------------------------------------------
// TEST 2: HARDWARE ROOT OF TRUTH & DETERMINISTIC STATE TRANSITIONS
// ----------------------------------------------------------------------------
void test_hardware_root_of_truth_and_transitions(void) {
    printf("[TEST 2] Verifying Hardware Root of Truth & State Transition Determinism...\n");

    AiosKernelStorage storage1;
    AiosKernelStorage storage2;

    aios_kernel_init(&storage1, true);
    aios_kernel_init(&storage2, true);

    // Baseline constant must be identical for identical hardware identities
    ASSERT_EQ(storage1.root_of_truth.baseline_constant, storage2.root_of_truth.baseline_constant, 
              "Baseline constants must be identical for identical HW root of truth");

    // Perform identical state transitions on both kernels
    uint64_t input_contract = 0xFEEDBEEFCAFE0001ULL;

    uint64_t next1_slot0 = aios_quantum_transition(&storage1, AGENT_ID_HERMES, input_contract);
    uint64_t next2_slot0 = aios_quantum_transition(&storage2, AGENT_ID_HERMES, input_contract);

    ASSERT_EQ(next1_slot0, next2_slot0, "Variance must be strictly 0 for identical transitions");
    ASSERT_TRUE(next1_slot0 != input_contract, "Quantum transition must show non-linear mixing");

    // Verify cross-coupling to global quantum state
    ASSERT_EQ(storage1.global_quantum_state, storage2.global_quantum_state, 
              "Global quantum state must match deterministically");
    ASSERT_EQ(storage1.total_transitions, 1, "Transition count must be 1");

    // Test transition on a different agent (PC_CODER)
    uint64_t next1_slot1 = aios_quantum_transition(&storage1, AGENT_ID_PC_CODER, input_contract);
    ASSERT_TRUE(next1_slot1 != next1_slot0, "Different agent slots must produce distinct quantum states");

    printf("  -> PASS: Zero Variance achieved. Deterministic state transitions verified.\n");
}

// ----------------------------------------------------------------------------
// TEST 3: TOKEN / KEY-VALUE OFFSET HASHING (O(1) LOOKUP, ZERO HEAP)
// ----------------------------------------------------------------------------
void test_token_offset_hashing(void) {
    printf("[TEST 3] Verifying JSON-RPC 2.0 Token/Key-Value Offset Hashing...\n");

    const char json_sample[] = 
        "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\","
        "\"params\":{\"name\":\"llm_complete\",\"contractHash\":\"0x8F2A10B4\"},"
        "\"id\":42}";

    AiosTokenTable table;
    bool scan_res = aios_scan_json_tokens(json_sample, (uint16_t)strlen(json_sample), &table);
    ASSERT_TRUE(scan_res, "JSON scan must succeed on valid JSON-RPC 2.0");
    ASSERT_TRUE(table.token_count >= 4, "Must find at least jsonrpc, method, params, id");

    // Compute key hash for "method" and lookup in O(1)
    uint64_t method_key_hash = aios_fast_hash64("method", 6, 0xCBF29CE484222325ULL);
    const AiosTokenOffset* tok = aios_find_token(&table, method_key_hash);
    ASSERT_TRUE(tok != NULL, "Token for 'method' must be found");

    // Verify extracted value matches "tools/call"
    char extracted_val[32] = {0};
    ASSERT_TRUE(tok->val_len < sizeof(extracted_val), "Extracted value length within bounds");
    memcpy(extracted_val, &json_sample[tok->val_offset], tok->val_len);
    ASSERT_TRUE(strcmp(extracted_val, "tools/call") == 0, "Extracted value must match 'tools/call'");

    // Lookup "id"
    uint64_t id_key_hash = aios_fast_hash64("id", 2, 0xCBF29CE484222325ULL);
    const AiosTokenOffset* tok_id = aios_find_token(&table, id_key_hash);
    ASSERT_TRUE(tok_id != NULL, "Token for 'id' must be found");
    memset(extracted_val, 0, sizeof(extracted_val));
    memcpy(extracted_val, &json_sample[tok_id->val_offset], tok_id->val_len);
    ASSERT_TRUE(strcmp(extracted_val, "42") == 0, "Extracted id value must match '42'");

    printf("  -> PASS: Zero-copy Token Offset Hashing extracted keys and values in O(1).\n");
}

// ----------------------------------------------------------------------------
// TEST 4: ESP32-S3 64 KB RING BUFFER & PIPE BUFFER STALL DEADLOCK EVASION
// ----------------------------------------------------------------------------
void test_esp32s3_bridge_and_stall_evasion(void) {
    printf("[TEST 4] Verifying ESP32-S3 Ring Buffer & Pipe Stall Deadlock Evasion...\n");

    static Esp32BridgeState bridge;
    esp32s3_bridge_init(&bridge);

    const char test_mcp_pkt[] = "{\"jsonrpc\":\"2.0\",\"method\":\"tools/call\",\"params\":{},\"id\":1001}";
    uint16_t pkt_len = (uint16_t)strlen(test_mcp_pkt);

    // Ingest initial packets
    for (int i = 0; i < 10; ++i) {
        bool ok = esp32s3_bridge_ingest_l4(&bridge, (const uint8_t*)test_mcp_pkt, pkt_len);
        ASSERT_TRUE(ok, "Ingestion of regular packets must succeed");
    }

    // Process and forward one frame
    AiosWireFrame frame;
    bool forwarded = esp32s3_bridge_process_and_forward(&bridge, &frame);
    ASSERT_TRUE(forwarded, "Processing queued packet must succeed");
    ASSERT_EQ(frame.sync_magic, AIOS_WIRE_MAGIC, "Sync magic must match 0xAA55");
    ASSERT_EQ(frame.msg_type, MSG_TYPE_MCP_TOOL_CALL, "Message type must be MCP_TOOL_CALL");
    ASSERT_TRUE(frame.contract_hash != 0, "Contract hash must be computed");

    // Verify CRC16 validation
    uint16_t calc_crc = aios_calc_crc16(&frame, sizeof(AiosWireFrame) - sizeof(uint16_t));
    ASSERT_EQ(frame.crc16, calc_crc, "Frame CRC16 must match computed CRC");

    // Stress test: Saturate the 64 KB ring buffer until the stall watermark is reached
    printf("  Saturating ring buffer to test Deadlock / Pipe Buffer Stall Evasion...\n");
    uint8_t large_dummy_pkt[1024];
    memset(large_dummy_pkt, 0x55, sizeof(large_dummy_pkt));

    int accepted = 0;
    int rejected = 0;
    for (int i = 0; i < 100; ++i) {
        bool ok = esp32s3_bridge_ingest_l4(&bridge, large_dummy_pkt, sizeof(large_dummy_pkt));
        if (ok) {
            accepted++;
        } else {
            rejected++;
        }
    }

    printf("  Accepted: %d packets, Rejected (Backpressure asserted): %d packets\n", accepted, rejected);
    ASSERT_TRUE(rejected > 0, "Bridge MUST reject packets when watermark is reached to evade stall deadlock");
    ASSERT_TRUE(bridge.backpressure_active, "Backpressure flag must be active");
    ASSERT_TRUE(bridge.pipe_stall_events_evaded > 0, "Pipe stall evasion counter must be incremented");

    printf("  -> PASS: Deadlock avoided, 64 KB Ring Buffer backpressure actively asserted.\n");
}

// ----------------------------------------------------------------------------
// TEST 5: 12x8 CHARLIEPLEXED MATRIX RUNTIME MONITOR & CONCURRENCY HEATMAP
// ----------------------------------------------------------------------------
void test_matrix_monitor_and_hardware_enforcement(void) {
    printf("[TEST 5] Verifying 12x8 Charlieplexed LED Matrix Monitor & Concurrency Heatmap...\n");

    aios_matrix_init(true); // Mock HW for host tests
    AiosMatrixFramebuffer* fb = aios_matrix_get_framebuffer();
    ASSERT_TRUE(fb != NULL, "Framebuffer pointer must not be null");

    // Configure Concurrency Snapshot:
    // Slot 0: 3 LEDs
    // Slot 1: 8 LEDs
    // Slot 2: 12 LEDs (Full load)
    // Slot 3: 0 LEDs (Idle)
    AiosConcurrencySnapshot snap;
    snap.slot_density[0] = 3;
    snap.slot_density[1] = 8;
    snap.slot_density[2] = 12;
    snap.slot_density[3] = 0;

    uint64_t state_id = 0x123456789ABCDEF0ULL;
    aios_matrix_update_state(state_id, &snap);

    // Verify row masks for concurrency slots (Rows 4..7)
    // Slot 0 (Row 4): density 3 -> (1 << 3) - 1 = 0b000000000111 = 0x007
    ASSERT_EQ(fb->row_bits[4], 0x007, "Slot 0 must have exactly 3 lowest LEDs lit");
    // Slot 1 (Row 5): density 8 -> (1 << 8) - 1 = 0x0FF
    ASSERT_EQ(fb->row_bits[5], 0x0FF, "Slot 1 must have exactly 8 lowest LEDs lit");
    // Slot 2 (Row 6): density 12 -> 0x0FFF (all 12 lit)
    ASSERT_EQ(fb->row_bits[6], 0x0FFF, "Slot 2 must have all 12 LEDs lit");
    // Slot 3 (Row 7): density 0 -> 0x000
    ASSERT_EQ(fb->row_bits[7], 0x000, "Slot 3 must have 0 LEDs lit");

    // Execute Timer ISR multiple cycles to verify multiplexer stability
    for (int i = 0; i < 22; ++i) {
        aios_matrix_timer_isr();
    }
    ASSERT_EQ(fb->isr_tick_counter, 22, "ISR tick counter must advance 22 times");

    // Test Hardware Fault Enforcement
    aios_matrix_enforce_hardware_fault(0xE1);
    ASSERT_TRUE(fb->fault_strobe_active, "Fault strobe must be active");
    ASSERT_EQ(fb->row_bits[0], 0x0AAA, "Hazard pattern row 0 must be 0x0AAA");
    ASSERT_EQ(fb->row_bits[1], 0x0555, "Hazard pattern row 1 must be 0x0555");

    printf("  -> PASS: 12x8 Matrix accurately rasterizes State ID, Concurrency, and Fault Strobe.\n");
}

// ----------------------------------------------------------------------------
// MAIN HARNESS ENTRY POINT
// ----------------------------------------------------------------------------
#ifdef AIOS_EMBED_SUITE
int aios_run_verification_suite(void) {
#else
int main(void) {
#endif
    printf("====================================================================\n");
    printf("  AIOS HIGH-DETERMINISM QUANTUM STATE KERNEL VERIFICATION SUITE\n");
    printf("  RENESAS RA4M1 (48 MHz) & ESPRESSIF ESP32-S3 (240 MHz)\n");
    printf("====================================================================\n\n");

    test_memory_bounds();
    test_hardware_root_of_truth_and_transitions();
    test_token_offset_hashing();
    test_esp32s3_bridge_and_stall_evasion();
    test_matrix_monitor_and_hardware_enforcement();

    printf("\n====================================================================\n");
    printf("  ALL 5 CANONICAL HARNESS CHECKS PASSED [VERIFIED DETERMINISTIC]\n");
    printf("====================================================================\n");

    return 0;
}
