/**
 * @file matrix_monitor.cpp
 * @brief Implementation of AIOS 12x8 Charlieplexed LED Matrix Runtime Monitor
 */

#include "matrix_monitor.hpp"
#include <string.h>

#ifdef __cplusplus
extern "C" {
#endif

// Static Framebuffer allocated in BSS (Zero Heap)
static AiosMatrixFramebuffer s_framebuffer;
static bool s_mock_hw = false;

// 11 Charlieplexing pins mapping on Arduino Uno R4 WiFi (RA4M1 Port & Bit)
// Ports: 0 = Port0, 2 = Port2
typedef struct {
    uint8_t port;
    uint8_t pin;
} Ra4m1PinDef;

static const Ra4m1PinDef s_matrix_pins[CHARLIE_PINS_COUNT] = {
    {0, 3},  // Pin 0: P003
    {0, 4},  // Pin 1: P004
    {0, 11}, // Pin 2: P011
    {0, 12}, // Pin 3: P012
    {0, 13}, // Pin 4: P013
    {0, 15}, // Pin 5: P015
    {2, 4},  // Pin 6: P204
    {2, 5},  // Pin 7: P205
    {2, 6},  // Pin 8: P206
    {2, 12}, // Pin 9: P212
    {2, 13}  // Pin 10: P213
};

// Charlieplexing Pair for each of the 96 LEDs: [row][col] -> {anode_pin, cathode_pin}
typedef struct {
    uint8_t anode;
    uint8_t cathode;
} LedPair;

// Precomputed canonical Charlieplexing wiring map for 96 LEDs
// Ensures no collision (anode != cathode) and evenly spreads across 11 phases
static LedPair s_charlie_map[MATRIX_ROWS][MATRIX_COLS];
static bool s_map_initialized = false;

static void init_charlie_map(void) {
    if (s_map_initialized) return;
    uint8_t a = 0;
    uint8_t c = 1;
    for (uint8_t r = 0; r < MATRIX_ROWS; ++r) {
        for (uint8_t col = 0; col < MATRIX_COLS; ++col) {
            if (a == c) {
                c = (c + 1) % CHARLIE_PINS_COUNT;
            }
            s_charlie_map[r][col].anode = a;
            s_charlie_map[r][col].cathode = c;

            c++;
            if (c >= CHARLIE_PINS_COUNT) {
                a = (a + 1) % CHARLIE_PINS_COUNT;
                c = 0;
            }
        }
    }
    s_map_initialized = true;
}

// ----------------------------------------------------------------------------
// 1. INITIALIZATION & FRAMEBUFFER ACCESS
// ----------------------------------------------------------------------------

void aios_matrix_init(bool mock_hw) {
    s_mock_hw = mock_hw;
    memset(&s_framebuffer, 0, sizeof(AiosMatrixFramebuffer));
    init_charlie_map();

    if (!mock_hw) {
        // Set all 11 matrix pins initially to INPUT (High-Z)
        for (uint8_t i = 0; i < CHARLIE_PINS_COUNT; ++i) {
            uint32_t port_base = (s_matrix_pins[i].port == 0) ? RA4M1_PORT0_BASE : RA4M1_PORT2_BASE;
            uint16_t bit = (1U << s_matrix_pins[i].pin);
            // Clear PDR bit -> Input (Tri-state)
            RA4M1_REG16(port_base, RA4M1_PDR_OFFSET) &= ~bit;
        }
    }
}

AiosMatrixFramebuffer* aios_matrix_get_framebuffer(void) {
    return &s_framebuffer;
}

void aios_matrix_clear(void) {
    for (uint8_t r = 0; r < MATRIX_ROWS; ++r) {
        s_framebuffer.row_bits[r] = 0;
    }
}

void aios_matrix_set_pixel(uint8_t x, uint8_t y, bool on) {
    if (x >= MATRIX_COLS || y >= MATRIX_ROWS) return;
    if (on) {
        s_framebuffer.row_bits[y] |= (1U << x);
    } else {
        s_framebuffer.row_bits[y] &= ~(1U << x);
    }
}

// ----------------------------------------------------------------------------
// 2. STATE ID & CONCURRENCY HEATMAP PROJECTION
// ----------------------------------------------------------------------------

void aios_matrix_update_state(uint64_t state_id, const AiosConcurrencySnapshot* concurrency) {
    // If fault strobe is actively latching the hardware, do not overwrite with normal pattern
    if (s_framebuffer.fault_strobe_active) return;

    // Rows 0..3: Top half represents 48-bit projection of 64-bit Quantum State ID
    s_framebuffer.row_bits[0] = (uint16_t)((state_id >> 36) & 0x0FFFU);
    s_framebuffer.row_bits[1] = (uint16_t)((state_id >> 24) & 0x0FFFU);
    s_framebuffer.row_bits[2] = (uint16_t)((state_id >> 12) & 0x0FFFU);
    s_framebuffer.row_bits[3] = (uint16_t)((state_id >>  0) & 0x0FFFU);

    // Rows 4..7: Bottom half represents 4 Parallel Concurrency Slots
    if (concurrency) {
        for (uint8_t slot = 0; slot < 4; ++slot) {
            uint8_t density = concurrency->slot_density[slot];
            if (density > 12) density = 12;
            
            // Linear bar graph: 0..density LEDs lit
            uint16_t bar_mask = (density == 0) ? 0x0000U : 
                                (density >= 12) ? 0x0FFFU : 
                                (uint16_t)((1U << density) - 1U);
            
            s_framebuffer.row_bits[4 + slot] = bar_mask;
        }
    }
}

void aios_matrix_enforce_hardware_fault(uint8_t fault_code) {
    s_framebuffer.fault_strobe_active = true;
    (void)fault_code;

    // Hardcoded high-contrast hazard checkerboard to signal unrecoverable fault/deadlock
    s_framebuffer.row_bits[0] = 0x0AAAU;
    s_framebuffer.row_bits[1] = 0x0555U;
    s_framebuffer.row_bits[2] = 0x0AAAU;
    s_framebuffer.row_bits[3] = 0x0555U;
    s_framebuffer.row_bits[4] = 0x0AAAU;
    s_framebuffer.row_bits[5] = 0x0555U;
    s_framebuffer.row_bits[6] = 0x0AAAU;
    s_framebuffer.row_bits[7] = 0x0555U;
}

// ----------------------------------------------------------------------------
// 3. ZERO-LATENCY TIMER ISR CHARLIEPLEXING ENGINE
// ----------------------------------------------------------------------------

void aios_matrix_timer_isr(void) {
    s_framebuffer.isr_tick_counter++;

    // Fault strobe blinker: invert hazard mask every 512 ISR ticks
    if (s_framebuffer.fault_strobe_active && ((s_framebuffer.isr_tick_counter & 0x01FFU) == 0U)) {
        for (uint8_t r = 0; r < MATRIX_ROWS; ++r) {
            s_framebuffer.row_bits[r] ^= 0x0FFFU;
        }
    }

    uint8_t curr_anode = s_framebuffer.active_phase;

    // Calculate active cathodes for curr_anode across all 96 LEDs in O(96) static branchless lookups
    uint16_t cathode_mask = 0; // Bit k = 1 means pin k must be driven LOW

    for (uint8_t r = 0; r < MATRIX_ROWS; ++r) {
        uint16_t row_val = s_framebuffer.row_bits[r];
        if (row_val == 0) continue; // Early prune empty rows

        for (uint8_t c = 0; c < MATRIX_COLS; ++c) {
            if (row_val & (1U << c)) {
                if (s_charlie_map[r][c].anode == curr_anode) {
                    cathode_mask |= (1U << s_charlie_map[r][c].cathode);
                }
            }
        }
    }

    if (!s_mock_hw) {
        // Step 1: Tri-state ALL 11 pins to INPUT (High-Z) to eliminate ghosting
        for (uint8_t i = 0; i < CHARLIE_PINS_COUNT; ++i) {
            uint32_t port_base = (s_matrix_pins[i].port == 0) ? RA4M1_PORT0_BASE : RA4M1_PORT2_BASE;
            uint16_t bit = (1U << s_matrix_pins[i].pin);
            RA4M1_REG16(port_base, RA4M1_PDR_OFFSET) &= ~bit;
        }

        // Step 2: If there are active cathodes for this anode, configure them
        if (cathode_mask != 0) {
            // Configure Cathodes: OUTPUT LOW
            for (uint8_t i = 0; i < CHARLIE_PINS_COUNT; ++i) {
                if (cathode_mask & (1U << i)) {
                    uint32_t port_base = (s_matrix_pins[i].port == 0) ? RA4M1_PORT0_BASE : RA4M1_PORT2_BASE;
                    uint16_t bit = (1U << s_matrix_pins[i].pin);
                    // Output Data = 0 (LOW)
                    RA4M1_REG16(port_base, RA4M1_PODR_OFFSET) &= ~bit;
                    // Direction = 1 (Output)
                    RA4M1_REG16(port_base, RA4M1_PDR_OFFSET) |= bit;
                }
            }

            // Configure Anode: OUTPUT HIGH
            uint32_t anode_port = (s_matrix_pins[curr_anode].port == 0) ? RA4M1_PORT0_BASE : RA4M1_PORT2_BASE;
            uint16_t anode_bit = (1U << s_matrix_pins[curr_anode].pin);
            // Output Data = 1 (HIGH)
            RA4M1_REG16(anode_port, RA4M1_PODR_OFFSET) |= anode_bit;
            // Direction = 1 (Output)
            RA4M1_REG16(anode_port, RA4M1_PDR_OFFSET) |= anode_bit;
        }
    }

    // Step 3: Advance to next Charlieplexing phase (0..10)
    s_framebuffer.active_phase = (curr_anode + 1U) % CHARLIE_PINS_COUNT;
}

#ifdef __cplusplus
}
#endif
