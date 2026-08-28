/**
 * @file matrix_monitor.hpp
 * @brief AIOS 12x8 Charlieplexed LED Matrix Runtime Monitor & Hardware Enforcement
 * 
 * Hardware Target: Renesas RA4M1 Onboard 12x8 Matrix (Uno R4 WiFi)
 * Engineering Standard: Zero-Latency Timer ISR, Direct Port Register Manipulation,
 * Deterministic State & Concurrency Heatmap Visualization.
 */

#ifndef AIOS_MATRIX_MONITOR_HPP
#define AIOS_MATRIX_MONITOR_HPP

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// 1. RA4M1 PORT REGISTER DEFINITIONS FOR CHARLIEPLEXED MATRIX PINS
// ============================================================================

#define RA4M1_PORT0_BASE          (0x40040000UL)
#define RA4M1_PORT1_BASE          (0x40040020UL)
#define RA4M1_PORT2_BASE          (0x40040040UL)
#define RA4M1_PORT3_BASE          (0x40040060UL)

#define RA4M1_PDR_OFFSET          (0x00U) // Port Direction Register (1=Output, 0=Input)
#define RA4M1_PODR_OFFSET         (0x02U) // Port Output Data Register (1=High, 0=Low)

#define RA4M1_REG16(base, off)    (*((volatile uint16_t*)((uintptr_t)(base) + (uintptr_t)(off))))

#define MATRIX_COLS               (12U)
#define MATRIX_ROWS               (8U)
#define CHARLIE_PINS_COUNT        (11U)

// ============================================================================
// 2. MATRIX FRAMEBUFFER (16 BYTES STATIC BSS, ZERO HEAP)
// ============================================================================

typedef struct {
    // 8 rows x 12 columns (bit 0 to bit 11 in each row uint16_t)
    uint16_t row_bits[MATRIX_ROWS];
    uint8_t  active_phase;
    bool     fault_strobe_active;
    uint32_t isr_tick_counter;
} AiosMatrixFramebuffer;

// Concurrency load descriptor for 4 parallel execution slots
typedef struct {
    uint8_t slot_density[4]; // 0 to 12 intensity per slot
    uint8_t slot_state[4];   // Slot status flags
} AiosConcurrencySnapshot;

// ============================================================================
// 3. MATRIX API & ISR ROUTINES
// ============================================================================

/**
 * @brief Initialize the Charlieplexing matrix pins and zero framebuffer.
 * @param mock_hw If true, port registers are bypassed for host tests.
 */
void aios_matrix_init(bool mock_hw);

/**
 * @brief Get pointer to the static matrix framebuffer.
 */
AiosMatrixFramebuffer* aios_matrix_get_framebuffer(void);

/**
 * @brief Clear all LEDs in the framebuffer.
 */
void aios_matrix_clear(void);

/**
 * @brief Set or clear a specific pixel (x: 0..11, y: 0..7).
 */
void aios_matrix_set_pixel(uint8_t x, uint8_t y, bool on);

/**
 * @brief Update the matrix display with:
 * - Rows 0..3: System State ID (Upper/Lower 48-bit projection of 64-bit state)
 * - Rows 4..7: 4 Concurrency Slots Real-Time Density Heatmap
 */
void aios_matrix_update_state(uint64_t state_id, const AiosConcurrencySnapshot* concurrency);

/**
 * @brief Enforce hardware lock / deadlock strobe on 12x8 matrix.
 */
void aios_matrix_enforce_hardware_fault(uint8_t fault_code);

/**
 * @brief Zero-Latency Timer ISR routine (~1.2 kHz - 2.4 kHz timer interrupt).
 * Directly writes to RA4M1 PDR/PODR port registers to drive Charlieplexed LEDs
 * in deterministic time slices without jitter or branch penalties.
 */
void aios_matrix_timer_isr(void);

#ifdef __cplusplus
}
#endif

#endif // AIOS_MATRIX_MONITOR_HPP
