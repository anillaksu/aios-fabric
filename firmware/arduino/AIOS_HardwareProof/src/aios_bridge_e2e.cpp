/**
 * @file aios_bridge_e2e.cpp
 * @brief Implementation of the RA4M1 <-> ESP32-S3 wire-bridge E2E harness.
 *
 * Debugging discipline (per design note): aios_wire_verify() is a pure function
 * over a byte buffer and is exercised first with no transport, so a parser bug
 * can never be confused with a UART/SPI transfer fault. Only then do the same
 * frames travel over the physical link.
 */

#include <Arduino.h>
#include "aios_bridge_e2e.h"
#include <string.h>

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------
static AiosBridgeLinkMode s_mode = AIOS_LINK_MODELED;
static uint8_t  s_fifo[64];
static uint16_t s_flen = 0;

// S3-mode: the peer prefixes every reply with a 1-byte AiosWireError status.
#define S3_STATUS_NA  0xFFu
static uint8_t s_last_status   = S3_STATUS_NA;
static int     s_status_checks = 0;
static int     s_status_mismatch = 0;

static inline bool link_is_serial(AiosBridgeLinkMode m) {
    return m == AIOS_LINK_SERIAL1 || m == AIOS_LINK_S3_UART;
}

static void link_begin(AiosBridgeLinkMode m) {
    s_mode = m;
    s_flen = 0;
    if (link_is_serial(m)) {
        Serial1.begin(115200);
        delay(5);
        while (Serial1.available()) (void)Serial1.read();
    }
}

static void link_drain(void) {
    s_flen = 0;
    if (link_is_serial(s_mode))
        while (Serial1.available()) (void)Serial1.read();
}

// Faithful transport: whatever bytes the sender puts on the wire arrive as-is.
// (Test-controlled truncation / corruption is applied by the caller *before*
// calling link_send, so both link modes behave identically.)
static void link_send(const uint8_t* b, uint16_t n) {
    if (link_is_serial(s_mode)) {
        Serial1.write(b, n);
        Serial1.flush();
    } else {
        if (n > sizeof(s_fifo)) n = sizeof(s_fifo);
        memcpy(s_fifo, b, n);
        s_flen = n;
    }
}

static uint16_t link_recv(uint8_t* b, uint16_t maxn, uint32_t timeout_us) {
    if (link_is_serial(s_mode)) {
        uint32_t t0 = micros();
        uint16_t got = 0;
        // S3 mode: the S3 replies <status byte>[<32-byte echo>]. Capture the
        // status byte (aios_bridge round_trip cross-checks it against an
        // independent aios_wire_verify of the echo), then return the echo.
        bool take_status = (s_mode == AIOS_LINK_S3_UART);
        if (take_status) s_last_status = S3_STATUS_NA;
        while ((micros() - t0) < timeout_us && got < maxn) {
            if (Serial1.available()) {
                uint8_t c = (uint8_t)Serial1.read();
                if (take_status) { s_last_status = c; take_status = false; continue; }
                b[got++] = c;
            }
        }
        return got;
    }
    if (s_flen == 0) {
        delayMicroseconds(timeout_us > 3000 ? 3000 : timeout_us);
        return 0;
    }
    uint16_t n = (s_flen < maxn) ? s_flen : maxn;
    memcpy(b, s_fifo, n);
    s_flen = 0;
    return n;
}

// ---------------------------------------------------------------------------
// Golden vectors -- deterministic, mirrored by tools/gen_golden_vectors.py.
// Base frame uses fixed field values so C and Python produce identical bytes.
// ---------------------------------------------------------------------------
void aios_golden_vectors(AiosGoldenVector out[AIOS_GOLDEN_VECTORS]) {
    AiosWireFrame base;
    memset(&base, 0, sizeof(base));
    base.sync_magic    = AIOS_WIRE_MAGIC;
    base.msg_type      = MSG_TYPE_MCP_TOOL_CALL;
    base.agent_id      = 3;
    base.rpc_id        = 0x0123456789ABCDEFULL;
    base.method_hash   = 0x1111222233334444ULL;
    base.contract_hash = 0x5555666677778888ULL;
    base.payload_len   = 256;

    // 0 valid
    { AiosWireFrame g = base; aios_wire_seal(&g);
      out[0].name = "valid";     out[0].len = 32; out[0].expected = AIOS_WIRE_OK;         out[0].stateful = false;
      memcpy(out[0].bytes, &g, 32); }

    // 1 truncated (same valid bytes, 31 on the wire)
    out[1].name = "truncated";   out[1].len = 31; out[1].expected = AIOS_WIRE_ERR_LENGTH; out[1].stateful = false;
    memcpy(out[1].bytes, out[0].bytes, 32);

    // 2 bad magic (magic checked before CRC, so CRC over the bad-magic bytes)
    { AiosWireFrame g = base; g.sync_magic = 0x1234;
      g.crc16 = aios_calc_crc16(&g, sizeof(AiosWireFrame) - sizeof(uint16_t));
      out[2].name = "bad_magic"; out[2].len = 32; out[2].expected = AIOS_WIRE_ERR_MAGIC;  out[2].stateful = false;
      memcpy(out[2].bytes, &g, 32); }

    // 3 bad msg type
    { AiosWireFrame g = base; g.msg_type = 0x09; aios_wire_seal(&g);
      out[3].name = "bad_msgtype"; out[3].len = 32; out[3].expected = AIOS_WIRE_ERR_MSGTYPE; out[3].stateful = false;
      memcpy(out[3].bytes, &g, 32); }

    // 4 bad agent
    { AiosWireFrame g = base; g.agent_id = 7; aios_wire_seal(&g);
      out[4].name = "bad_agent"; out[4].len = 32; out[4].expected = AIOS_WIRE_ERR_AGENT; out[4].stateful = false;
      memcpy(out[4].bytes, &g, 32); }

    // 5 length out of range
    { AiosWireFrame g = base; g.payload_len = 50000; aios_wire_seal(&g);
      out[5].name = "len_out_of_range"; out[5].len = 32; out[5].expected = AIOS_WIRE_ERR_LENRANGE; out[5].stateful = false;
      memcpy(out[5].bytes, &g, 32); }

    // 6 bad CRC (valid frame, flip one covered byte, do NOT re-seal)
    { AiosWireFrame g = base; aios_wire_seal(&g);
      uint8_t b[32]; memcpy(b, &g, 32); b[5] ^= 0x01;
      out[6].name = "bad_crc"; out[6].len = 32; out[6].expected = AIOS_WIRE_ERR_CRC; out[6].stateful = false;
      memcpy(out[6].bytes, b, 32); }

    // 7 replay (a second, byte-identical valid frame -- stateful)
    out[7].name = "replay"; out[7].len = 32; out[7].expected = AIOS_WIRE_ERR_REPLAY; out[7].stateful = true;
    memcpy(out[7].bytes, out[0].bytes, 32);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
static void build_valid_frame(AiosPrng* rng, AiosWireFrame* f) {
    aios_prng_fill(rng, f, sizeof(*f));
    f->msg_type = MSG_TYPE_MCP_TOOL_CALL;
    f->agent_id = (uint8_t)(aios_prng_next64(rng) % 6);
    f->payload_len = (uint16_t)(aios_prng_next64(rng) % 2048);
    aios_wire_seal(f);
}

// Send a frame (optionally truncated to `send_len`) and read the reply back.
// In S3 mode also cross-checks the peer's status byte against an independent
// re-verify of the echoed bytes -- any disagreement means the S3 wire_verify
// has drifted from firmware/esp32s3_bridge.cpp and is recorded as a mismatch.
static AiosWireError round_trip(const AiosWireFrame* f, uint16_t send_len,
                                uint32_t timeout_us, uint16_t* got_out) {
    uint8_t rx[64];
    link_drain();
    link_send((const uint8_t*)f, send_len);
    uint16_t got = link_recv(rx, sizeof(rx), timeout_us);
    if (got_out) *got_out = got;

    AiosWireError e = (got == 0) ? AIOS_WIRE_ERR_TIMEOUT : aios_wire_verify(rx, got);

    if (s_mode == AIOS_LINK_S3_UART) {
        s_status_checks++;
        // The check targets the STATELESS wire verdict (length/magic/msgtype/
        // agent/lenrange/crc). REPLAY is stateful (S3 keeps its own window) and
        // TIMEOUT is transport, so those are allowed to differ from our
        // single-frame re-verify of the echo.
        bool agree = (got == 0)
            ? (s_last_status != AIOS_WIRE_OK && s_last_status != S3_STATUS_NA)
            : (s_last_status == (uint8_t)e || s_last_status == AIOS_WIRE_ERR_REPLAY);
        if (!agree) s_status_mismatch++;
    }
    return e;
}

// ---------------------------------------------------------------------------
// Serial1 loopback probe
// ---------------------------------------------------------------------------
bool aios_bridge_probe_serial1(void) {
    Serial1.begin(115200);
    delay(5);
    while (Serial1.available()) (void)Serial1.read();
    const uint8_t probe[4] = { 0x55, 0xAA, 0x5A, 0xA5 };
    Serial1.write(probe, 4);
    Serial1.flush();
    uint32_t t0 = micros();
    uint8_t rx[4]; int n = 0;
    while ((micros() - t0) < 8000 && n < 4)
        if (Serial1.available()) rx[n++] = (uint8_t)Serial1.read();
    return (n == 4) && (memcmp(rx, probe, 4) == 0);
}

bool aios_bridge_probe_s3(void) {
    Serial1.begin(115200);
    delay(5);
    while (Serial1.available()) (void)Serial1.read();

    AiosWireFrame f;
    memset(&f, 0, sizeof(f));
    f.msg_type = MSG_TYPE_STATUS_PROBE;
    f.agent_id = AGENT_ID_MATRIX_MONITOR;
    f.rpc_id = 0xA10501A10501A105ULL;
    aios_wire_seal(&f);

    Serial1.write((const uint8_t*)&f, 32);
    Serial1.flush();

    uint32_t t0 = micros();
    uint8_t rx[40]; int n = 0;
    while ((micros() - t0) < 40000 && n < 33)
        if (Serial1.available()) rx[n++] = (uint8_t)Serial1.read();

    // Expect: status byte 0x00 then the 32-byte echo unchanged.
    return (n == 33) && (rx[0] == AIOS_WIRE_OK) && (memcmp(rx + 1, &f, 32) == 0);
}

// Fill a result row. link_status / transport come from the current run state.
static void set_res(BridgeTestResult* r, const char* name, uint64_t seed, bool passed,
                    uint32_t observed, uint32_t expected, uint32_t expected_alt,
                    uint32_t detail) {
    r->name = name; r->seed = seed; r->passed = passed;
    r->error_code = observed; r->expected_code = expected; r->expected_alt = expected_alt;
    r->detail = detail; r->link_status = s_last_status; r->transport = (uint32_t)s_mode;
}

// ---------------------------------------------------------------------------
// The 9 tests (T0..T7 + T8 golden-vector cross-validation)
// ---------------------------------------------------------------------------
int aios_bridge_e2e_run(AiosBridgeLinkMode mode, uint64_t base_seed,
                        BridgeTestResult* out,
                        uint32_t* tp_bytes_per_s, uint32_t* lat_us_per_frame) {
    static AiosKernelStorage kk;
    aios_kernel_init(&kk, true);
    link_begin(mode);

    AiosReplayGuard guard;
    aios_replay_reset(&guard);
    int failed = 0;
    s_status_checks = 0;
    s_status_mismatch = 0;
    s_last_status = S3_STATUS_NA;
    const uint32_t TO = 30000;   // 30 ms round-trip budget

    // ---- Pre-flight: pure parser check, NO transport --------------------
    {
        AiosPrng rng; aios_prng_seed(&rng, &kk, base_seed, 0x1111);
        AiosWireFrame f; build_valid_frame(&rng, &f);
        bool ok = (aios_wire_verify((uint8_t*)&f, 32) == AIOS_WIRE_OK);
        uint8_t bad[32]; memcpy(bad, &f, 32); bad[7] ^= 0x40;
        ok = ok && (aios_wire_verify(bad, 32) == AIOS_WIRE_ERR_CRC);
        ok = ok && (aios_wire_verify((uint8_t*)&f, 31) == AIOS_WIRE_ERR_LENGTH);
        set_res(&out[0], "T0 parser isolated (no link)", base_seed, ok, ok ? 0u : 99u, AIOS_WIRE_OK, 0xFF, 0);
        if (!ok) failed++;
    }

    // ---- T1  framing + CRC happy path ----------------------------------
    {
        uint64_t seed = base_seed ^ 0xA1;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 1);
        AiosWireFrame f; build_valid_frame(&rng, &f);
        uint16_t got = 0;
        AiosWireError e = round_trip(&f, 32, TO, &got);
        AiosWireError r = (e == AIOS_WIRE_OK) ? aios_replay_admit(&guard, f.rpc_id) : e;
        bool ok = (e == AIOS_WIRE_OK) && (r == AIOS_WIRE_OK) && (got == 32);
        set_res(&out[1], "T1 framing + CRC happy path", seed, ok, (uint32_t)e, AIOS_WIRE_OK, 0xFF, got);
        if (!ok) failed++;
    }

    // ---- T2  truncated frame ---------------------------------------
    // Semantics differ by transport, both mean "truncation rejected":
    //   modeled : 30 bytes arrive atomically -> aios_wire_verify -> ERR_LENGTH
    //   physical: 30 bytes then silence      -> receiver gap timeout -> ERR_TIMEOUT
    {
        uint64_t seed = base_seed ^ 0xB2;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 2);
        AiosWireFrame f; build_valid_frame(&rng, &f);
        uint16_t got = 0;
        AiosWireError e = round_trip(&f, 30, TO, &got);   // drop last 2 bytes
        bool ok = (e == AIOS_WIRE_ERR_LENGTH || e == AIOS_WIRE_ERR_TIMEOUT);
        set_res(&out[2], "T2 truncated frame", seed, ok, (uint32_t)e, AIOS_WIRE_ERR_LENGTH, AIOS_WIRE_ERR_TIMEOUT, got);
        if (!ok) failed++;
    }

    // T3..T5, T7 and the throughput benchmark are skipped in smoke mode so the
    // first physical-S3 bring-up run only exercises framing / timeout / replay
    // (T0..T2, T6) + golden vectors (T8) before any performance number is taken.
#ifdef AIOS_BRIDGE_SMOKE
    {
        static const int skip[] = { 3, 4, 5, 7 };
        for (unsigned s = 0; s < sizeof(skip) / sizeof(skip[0]); ++s)
            set_res(&out[skip[s]], "(skipped: -DAIOS_BRIDGE_SMOKE)", base_seed, true, 0xFF, 0xFF, 0xFF, 0);
    }
    if (tp_bytes_per_s)  *tp_bytes_per_s  = 0;
    if (lat_us_per_frame) *lat_us_per_frame = 0;
#else
    // ---- T3  oversized payload_len ----------------------------------
    {
        uint64_t seed = base_seed ^ 0xC3;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 3);
        AiosWireFrame f; build_valid_frame(&rng, &f);
        f.payload_len = 60000;            // impossible
        aios_wire_seal(&f);               // CRC now covers the bogus length
        AiosWireError e = round_trip(&f, 32, TO, 0);
        bool ok = (e == AIOS_WIRE_ERR_LENRANGE);
        set_res(&out[3], "T3 oversized payload_len", seed, ok, (uint32_t)e, AIOS_WIRE_ERR_LENRANGE, 0xFF, 60000);
        if (!ok) failed++;
    }

    // ---- T4  in-transit byte corruption (200 frames) ---------------
    {
        uint64_t seed = base_seed ^ 0xD4;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 4);
        int rejected = 0, total = 200;
        for (int i = 0; i < total; ++i) {
            AiosWireFrame f; build_valid_frame(&rng, &f);
            uint8_t wire[32]; memcpy(wire, &f, 32);
            int flips = 1 + (int)(aios_prng_next64(&rng) % 3);
            for (int j = 0; j < flips; ++j)
                wire[aios_prng_next64(&rng) % 30] ^= (uint8_t)(1u << (aios_prng_next64(&rng) & 7));
            uint16_t got = 0;
            // route through round_trip so the S3 status byte is cross-checked too
            AiosWireError e = round_trip((const AiosWireFrame*)wire, 32, TO, &got);
            if (e != AIOS_WIRE_OK) rejected++;
        }
        bool ok = (rejected == total);
        set_res(&out[4], "T4 in-transit byte corruption", seed, ok, (uint32_t)(total - rejected), 0xFE, 0xFF, (uint32_t)rejected);
        if (!ok) failed++;
    }

    // ---- T5  timeout + retry (link drops first K attempts) ---------
    {
        uint64_t seed = base_seed ^ 0xE5;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 5);
        AiosWireFrame f; build_valid_frame(&rng, &f);
        const uint32_t K = 3, MAXR = 6;
        uint32_t retries = 0; AiosWireError e = AIOS_WIRE_ERR_TIMEOUT;
        for (uint32_t attempt = 0; attempt <= MAXR; ++attempt) {
            link_drain();
            if (attempt >= K) {
                e = round_trip(&f, 32, TO, 0);               // "link recovers"
            } else {
                uint8_t rx[64];
                e = (link_recv(rx, sizeof(rx), TO) == 0)
                    ? AIOS_WIRE_ERR_TIMEOUT : AIOS_WIRE_ERR_CRC;   // no send -> nothing back
            }
            if (e == AIOS_WIRE_OK) break;
            retries++;
        }
        bool ok = (e == AIOS_WIRE_OK) && (retries == K);
        set_res(&out[5], "T5 timeout + retry", seed, ok, (uint32_t)e, AIOS_WIRE_OK, 0xFF, retries);
        if (!ok) failed++;
    }
#endif  // AIOS_BRIDGE_SMOKE

    // ---- T6  replay rejection  (always -- smoke set) --------------
    {
        uint64_t seed = base_seed ^ 0xF6;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 6);
        AiosReplayGuard g; aios_replay_reset(&g);
        AiosWireFrame f; build_valid_frame(&rng, &f);

        AiosWireError e1 = round_trip(&f, 32, TO, 0);
        AiosWireError a1 = aios_replay_admit(&g, f.rpc_id);      // first: OK
        AiosWireError e2 = round_trip(&f, 32, TO, 0);
        AiosWireError a2 = aios_replay_admit(&g, f.rpc_id);      // replay: REJECT
        AiosWireFrame f3 = f; f3.rpc_id ^= 0x9999; aios_wire_seal(&f3);
        AiosWireError a3 = aios_replay_admit(&g, f3.rpc_id);     // fresh id: OK

        bool ok = (e1 == AIOS_WIRE_OK) && (a1 == AIOS_WIRE_OK) &&
                  (e2 == AIOS_WIRE_OK) && (a2 == AIOS_WIRE_ERR_REPLAY) &&
                  (a3 == AIOS_WIRE_OK);
        set_res(&out[6], "T6 replay rejection", seed, ok, (uint32_t)a2, AIOS_WIRE_ERR_REPLAY, 0xFF, 0);
        if (!ok) failed++;
    }

#ifndef AIOS_BRIDGE_SMOKE
    // ---- T7  recovery after a fault storm -------------------------
    {
        uint64_t seed = base_seed ^ 0x77;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 7);
        AiosReplayGuard g; aios_replay_reset(&g);
        for (int i = 0; i < 100; ++i) {          // 100 garbage frames
            uint8_t junk[32]; aios_prng_fill(&rng, junk, 32);
            (void)round_trip((const AiosWireFrame*)junk, 32, TO, 0);
        }
        int delivered = 0;
        for (int i = 0; i < 10; ++i) {           // 10 clean frames must all pass
            AiosWireFrame f; build_valid_frame(&rng, &f);
            uint16_t got = 0;
            AiosWireError e = round_trip(&f, 32, TO, &got);
            if (e == AIOS_WIRE_OK && aios_replay_admit(&g, f.rpc_id) == AIOS_WIRE_OK) delivered++;
        }
        bool ok = (delivered == 10);
        set_res(&out[7], "T7 recovery after fault storm", seed, ok, (uint32_t)(10 - delivered), 0xFE, 0xFF, (uint32_t)delivered);
        if (!ok) failed++;
    }
#endif  // AIOS_BRIDGE_SMOKE

    // ---- T8  golden-vector cross-validation  (always) -------------
    // 3-way: hardcoded golden truth  vs  RA4M1 aios_wire_verify  vs  S3 status.
    // Each vector's bytes are printed so a host can diff them against the
    // committed tools/golden_vectors.txt (same generator, off-device).
    {
        AiosGoldenVector gv[AIOS_GOLDEN_VECTORS];
        aios_golden_vectors(gv);
        bool s3 = (mode == AIOS_LINK_S3_UART);
        int gv_ra_mismatch = 0, gv_s3_mismatch = 0;
        AiosReplayGuard rg; aios_replay_reset(&rg);

        for (int i = 0; i < AIOS_GOLDEN_VECTORS; ++i) {
            // print the vector so aios-verify.sh can cross-check the committed file
            char line[128];
            int p = snprintf(line, sizeof(line), "  GOLDEN %s len=%u expect=%lu bytes=",
                             gv[i].name, gv[i].len, (unsigned long)gv[i].expected);
            for (int b = 0; b < 32 && p < (int)sizeof(line) - 3; ++b)
                p += snprintf(line + p, sizeof(line) - p, "%02X", gv[i].bytes[b]);
            Serial.println(line);

            // RA4M1 oracle vs golden truth
            AiosWireError ra = gv[i].stateful
                ? aios_replay_admit(&rg, ((const AiosWireFrame*)gv[i].bytes)->rpc_id)
                : aios_wire_verify(gv[i].bytes, gv[i].len);
            if ((uint32_t)ra != gv[i].expected) {
                gv_ra_mismatch++;
                char m[80];
                snprintf(m, sizeof(m), "  GOLDEN MISMATCH %s: RA4M1=%lu expect=%lu",
                         gv[i].name, (unsigned long)ra, (unsigned long)gv[i].expected);
                Serial.println(m);
            }
            // seed the RA4M1 replay guard with the "valid" vector so "replay" trips
            if (i == 0) aios_replay_admit(&rg, ((const AiosWireFrame*)gv[i].bytes)->rpc_id);

            // S3 status vs golden truth (physical link only, non-stateful classes)
            if (s3 && !gv[i].stateful) {
                uint16_t got = 0;
                round_trip((const AiosWireFrame*)gv[i].bytes, gv[i].len, TO, &got);
                if (s_last_status != gv[i].expected) gv_s3_mismatch++;
            }
        }

        bool run_agree = !s3 || (s_status_mismatch == 0 && s_status_checks > 0);
        bool ok = (gv_ra_mismatch == 0) && (gv_s3_mismatch == 0) && run_agree;
        out[8].name = "T8 golden-vector cross-validation";
        out[8].seed = base_seed;
        out[8].expected_code = 0;
        out[8].expected_alt = 0xFF;
        out[8].error_code = (uint32_t)(gv_ra_mismatch * 100 + gv_s3_mismatch);
        out[8].detail = (uint32_t)s_status_checks;     // run-wide status/echo checks
        out[8].link_status = S3_STATUS_NA;
        out[8].transport = (uint32_t)mode;
        out[8].passed = ok;
        if (!ok) failed++;
    }

#ifndef AIOS_BRIDGE_SMOKE
    // ---- Throughput + latency (reuses the link, not a pass/fail row) --
    {
        uint64_t seed = base_seed ^ 0x88;
        AiosPrng rng; aios_prng_seed(&rng, &kk, seed, 8);
        const int N = 200;
        uint32_t t0 = micros();
        int okc = 0;
        for (int i = 0; i < N; ++i) {
            AiosWireFrame f; build_valid_frame(&rng, &f);
            if (round_trip(&f, 32, TO, 0) == AIOS_WIRE_OK) okc++;
        }
        uint32_t us = micros() - t0;
        if (tp_bytes_per_s)  *tp_bytes_per_s  = (uint32_t)(((uint64_t)N * 32u * 1000000u) / (us ? us : 1));
        if (lat_us_per_frame) *lat_us_per_frame = us / (uint32_t)N;
        (void)okc;
    }
#endif  // AIOS_BRIDGE_SMOKE

    return failed;
}
