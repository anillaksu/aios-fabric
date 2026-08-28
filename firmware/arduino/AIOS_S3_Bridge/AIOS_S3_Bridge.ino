/**
 * AIOS_S3_Bridge.ino  --  ESP32-S3 side of the RA4M1 <-> ESP32-S3 wire bridge.
 * =============================================================================
 * FLASH TARGET: the ESP32-S3 (NOT the RA4M1). On an Arduino UNO R4 WiFi this
 * replaces the stock Espressif network firmware -- do it ONLY in a supervised
 * session with a recovery plan (Arduino "Firmware Updater" restores the stock
 * image). See BRIDGE_S3_E2E_PLAN.md.
 *
 * Board: "ESP32S3 Dev Module" (or the UNO-R4 S3 target once available).
 * Link : UART. Wire RA4M1 Serial1 (D0/D1) <-> S3 UART1 RX/TX at 115200 8N1,
 *        common ground. (SPI variant: see the plan doc.)
 *
 * Protocol (mirrors firmware/esp32s3_bridge.{hpp,cpp} aios_wire_verify):
 *   RA4M1 -> S3 : exactly 32 bytes, little-endian AiosWireFrame
 *   S3 -> RA4M1 : 1 status byte = AiosWireError (0 = OK), then echoes the
 *                 32-byte frame back so the RA4M1 harness round-trips unchanged.
 *
 * Every frame is logged on BOTH sides in the SAME format so a modeled-vs-physical
 * divergence is a one-line diff:
 *   S3 seq=<n> rpc=<hex16> crc_rx=<hex4> crc_calc=<hex4> err=<CODE> t_us=<n>
 * =============================================================================
 */

#include <Arduino.h>

// ---- wire frame (must byte-match firmware/esp32s3_bridge.hpp) ----------------
#pragma pack(push, 1)
struct AiosWireFrame {
  uint16_t sync_magic;
  uint8_t  msg_type;
  uint8_t  agent_id;
  uint64_t rpc_id;
  uint64_t method_hash;
  uint64_t contract_hash;
  uint16_t payload_len;
  uint16_t crc16;
};
#pragma pack(pop)
static_assert(sizeof(AiosWireFrame) == 32, "wire frame must be 32 bytes");

enum AiosWireError : uint8_t {
  AIOS_WIRE_OK = 0, ERR_LENGTH = 1, ERR_MAGIC = 2, ERR_AGENT = 3,
  ERR_MSGTYPE = 4, ERR_LENRANGE = 5, ERR_CRC = 6, ERR_REPLAY = 7, ERR_TIMEOUT = 8
};

static const uint16_t AIOS_WIRE_MAGIC = 0xAA55;
static const uint16_t PAYLOAD_HARD_CAP = 8192;
static const uint8_t  REPLAY_WINDOW = 16;

// ---- CRC-16-CCITT, table-free (matches aios_calc_crc16 semantics) -----------
static uint16_t crc16_ccitt(const uint8_t* p, size_t len) {
  uint16_t crc = 0xFFFF;
  while (len--) {
    crc ^= (uint16_t)(*p++) << 8;
    for (int i = 0; i < 8; ++i)
      crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : (crc << 1);
  }
  return crc;
}

static AiosWireError wire_verify(const uint8_t* buf, uint16_t len) {
  if (len != 32) return ERR_LENGTH;
  AiosWireFrame f; memcpy(&f, buf, 32);
  if (f.sync_magic != AIOS_WIRE_MAGIC) return ERR_MAGIC;
  if (f.msg_type < 1 || f.msg_type > 3) return ERR_MSGTYPE;
  if (f.agent_id > 5) return ERR_AGENT;
  if (f.payload_len > PAYLOAD_HARD_CAP) return ERR_LENRANGE;
  if (crc16_ccitt(buf, 30) != f.crc16) return ERR_CRC;
  return AIOS_WIRE_OK;
}

// ---- bounded replay window -------------------------------------------------
static uint64_t g_seen[REPLAY_WINDOW];
static uint8_t  g_seen_n = 0, g_seen_pos = 0;
static bool replay_admit(uint64_t rpc) {
  for (uint8_t i = 0; i < g_seen_n; ++i) if (g_seen[i] == rpc) return false;
  g_seen[g_seen_pos] = rpc;
  g_seen_pos = (g_seen_pos + 1) % REPLAY_WINDOW;
  if (g_seen_n < REPLAY_WINDOW) g_seen_n++;
  return true;
}

// ---- link ----------------------------------------------------------------
#define LINK  Serial1
static const uint32_t LINK_BAUD = 115200;
static const int PIN_RX = 18;   // adjust to the physical wiring
static const int PIN_TX = 17;

static uint32_t g_seq = 0;

void setup() {
  Serial.begin(115200);                       // USB console: dual-side log
  LINK.begin(LINK_BAUD, SERIAL_8N1, PIN_RX, PIN_TX);
  Serial.println("AIOS_S3_BRIDGE_READY chip_id=" + String((uint32_t)ESP.getEfuseMac(), HEX) +
                 " sdk=" + String(ESP.getSdkVersion()) +
                 " baud=" + String(LINK_BAUD) + " fw=aios-s3-bridge-0.1");
}

void loop() {
  static uint8_t rx[64];
  static uint16_t n = 0;
  static uint32_t t_first = 0;

  while (LINK.available()) {
    if (n == 0) t_first = micros();
    rx[n++] = (uint8_t)LINK.read();
    if (n >= 32) break;
  }
  // frame gap timeout -> treat as short/truncated read
  if (n > 0 && n < 32 && (micros() - t_first) > 20000) {
    report(rx, n, ERR_TIMEOUT, micros() - t_first);
    n = 0;
    return;
  }
  if (n < 32) return;

  uint32_t t_us = micros() - t_first;
  AiosWireError e = wire_verify(rx, 32);
  if (e == AIOS_WIRE_OK) {
    AiosWireFrame f; memcpy(&f, rx, 32);
    if (!replay_admit(f.rpc_id)) e = ERR_REPLAY;
  }
  report(rx, 32, e, t_us);

  LINK.write((uint8_t)e);       // status byte
  LINK.write(rx, 32);           // echo frame (RA4M1 harness round-trips as-is)
  LINK.flush();
  n = 0;
}

static void report(const uint8_t* buf, uint16_t len, AiosWireError e, uint32_t t_us) {
  uint64_t rpc = 0; uint16_t crc_rx = 0, crc_calc = 0;
  if (len >= 32) {
    AiosWireFrame f; memcpy(&f, buf, 32);
    rpc = f.rpc_id; crc_rx = f.crc16; crc_calc = crc16_ccitt(buf, 30);
  }
  char line[128];
  snprintf(line, sizeof(line),
    "S3 seq=%lu len=%u rpc=%08lX%08lX crc_rx=%04X crc_calc=%04X err=%u t_us=%lu",
    (unsigned long)g_seq++, len,
    (unsigned long)(rpc >> 32), (unsigned long)(rpc & 0xFFFFFFFF),
    crc_rx, crc_calc, (unsigned)e, (unsigned long)t_us);
  Serial.println(line);
}
