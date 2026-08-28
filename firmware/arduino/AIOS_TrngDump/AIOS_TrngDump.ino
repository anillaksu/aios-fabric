/**
 * AIOS_TrngDump.ino
 * -----------------------------------------------------------------------------
 * Streams raw RA4M1 SCE5 hardware-TRNG bytes over USB-CDC as hex, for OFF-device
 * analysis with the full NIST SP 800-22 STS, dieharder, or ent.
 *
 * Protocol: on boot, prints "AIOS_TRNG_DUMP_BEGIN <nbytes>", then <nbytes>*2
 * lowercase hex chars (no separators), then "\nAIOS_TRNG_DUMP_END".
 * Default 1,250,000 bytes (10 Mbit) -- enough for a full STS run.
 *
 * Host side:  firmware/arduino/aios-verify.sh --dump-trng [nbytes]
 * -----------------------------------------------------------------------------
 */
#include <Arduino.h>

extern "C" {
  fsp_err_t HW_SCE_McuSpecificInit(void);
  fsp_err_t HW_SCE_RNG_Read(uint32_t * out4);
}

#ifndef AIOS_TRNG_DUMP_BYTES
#define AIOS_TRNG_DUMP_BYTES  (1250000UL)
#endif

void setup() {
  Serial.begin(115200);
  unsigned long t0 = millis();
  while (!Serial && (millis() - t0) < 8000) {}
  delay(300);

  if (HW_SCE_McuSpecificInit() != FSP_SUCCESS) {
    Serial.println(F("AIOS_TRNG_DUMP_ERROR SCE init failed"));
    return;
  }

  Serial.print(F("AIOS_TRNG_DUMP_BEGIN "));
  Serial.println((uint32_t)AIOS_TRNG_DUMP_BYTES);

  static const char hex[] = "0123456789abcdef";
  uint32_t remaining = AIOS_TRNG_DUMP_BYTES;
  char line[65];
  while (remaining) {
    uint32_t v[4];
    if (HW_SCE_RNG_Read(v) != FSP_SUCCESS) { Serial.println(F("\nAIOS_TRNG_DUMP_ERROR read")); return; }
    uint8_t* b = (uint8_t*)v;
    uint32_t n = remaining < 16 ? remaining : 16;
    int j = 0;
    for (uint32_t i = 0; i < n; ++i) {
      line[j++] = hex[b[i] >> 4];
      line[j++] = hex[b[i] & 0xF];
    }
    line[j] = 0;
    Serial.println(line);              // 32 hex chars per line -> line-safe capture
    remaining -= n;
  }
  Serial.println(F("AIOS_TRNG_DUMP_END"));
}

void loop() { delay(10000); }
