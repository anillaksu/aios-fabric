#!/usr/bin/env python3
"""
gen_golden_vectors.py -- off-device golden vectors for the bridge wire protocol.

Mirrors aios_golden_vectors() in
firmware/arduino/AIOS_HardwareProof/src/aios_bridge_e2e.cpp: same fixed base
frame, same 8 frame classes, same expected AiosWireError. The `expected` verdict
here is the INDEPENDENT human-asserted truth -- on the device, PHASE 7 / T8
checks aios_wire_verify() (and, over a real link, the ESP32-S3 status byte)
against these, so a bug shared by both implementations is still caught.

Run:  python gen_golden_vectors.py > golden_vectors.txt
"""
import struct

MAGIC = 0xAA55
# AiosWireError
OK, ERR_LENGTH, ERR_MAGIC, ERR_AGENT, ERR_MSGTYPE, ERR_LENRANGE, ERR_CRC, ERR_REPLAY, ERR_TIMEOUT = range(9)


def crc16_ccitt(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def frame(magic=MAGIC, msg_type=1, agent_id=3, rpc_id=0x0123456789ABCDEF,
          method_hash=0x1111222233334444, contract_hash=0x5555666677778888,
          payload_len=256, crc=None) -> bytes:
    body = struct.pack("<HBBQQQH", magic, msg_type, agent_id, rpc_id,
                       method_hash, contract_hash, payload_len)
    if crc is None:
        crc = crc16_ccitt(body)
    return body + struct.pack("<H", crc)


def main():
    base = frame()  # valid sealed frame
    vecs = []

    vecs.append(("valid", base, 32, OK))
    vecs.append(("truncated", base, 31, ERR_LENGTH))          # same bytes, 31 on the wire
    vecs.append(("bad_magic", frame(magic=0x1234), 32, ERR_MAGIC))
    vecs.append(("bad_msgtype", frame(msg_type=0x09), 32, ERR_MSGTYPE))
    vecs.append(("bad_agent", frame(agent_id=7), 32, ERR_AGENT))
    vecs.append(("len_out_of_range", frame(payload_len=50000), 32, ERR_LENRANGE))
    bad = bytearray(base); bad[5] ^= 0x01                     # flip one CRC-covered byte, no re-seal
    vecs.append(("bad_crc", bytes(bad), 32, ERR_CRC))
    vecs.append(("replay", base, 32, ERR_REPLAY))             # stateful: 2nd identical valid

    for name, b, ln, exp in vecs:
        print(f"GOLDEN {name} len={ln} expect={exp} bytes={b[:32].hex().upper()}")


if __name__ == "__main__":
    main()
