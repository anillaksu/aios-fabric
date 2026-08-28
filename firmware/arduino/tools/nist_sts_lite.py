#!/usr/bin/env python3
"""
nist_sts_lite.py -- off-device statistical battery for the AIOS SCE5 TRNG dump.

Not the official NIST STS reference tool: this is an independent re-implementation
of a subset of SP 800-22 (plus the DFT spectral test when numpy is available),
used to cross-check the on-device battery in AIOS_HardwareProof PHASE 4/5.
A stream passes a test when its p-value >= 0.01.

Usage:  python nist_sts_lite.py <trng_dump.bin>
"""
import sys, math, hashlib

try:
    import numpy as _np
    HAVE_NUMPY = True
except Exception:
    HAVE_NUMPY = False

ALPHA = 0.01


def igamc(a, x):
    """Regularized upper incomplete gamma Q(a,x) (Numerical Recipes)."""
    if x < 0 or a <= 0:
        return 1.0
    gln = math.lgamma(a)
    if x < a + 1.0:
        ap, s, d = a, 1.0 / a, 1.0 / a
        for _ in range(1000):
            ap += 1.0
            d *= x / ap
            s += d
            if abs(d) < abs(s) * 1e-15:
                break
        return 1.0 - s * math.exp(-x + a * math.log(x) - gln)
    b, c = x + 1.0 - a, 1e300
    dd = 1.0 / b
    h = dd
    for i in range(1, 1000):
        an = -i * (i - a)
        b += 2.0
        dd = an * dd + b
        if abs(dd) < 1e-300:
            dd = 1e-300
        c = b + an / c
        if abs(c) < 1e-300:
            c = 1e-300
        dd = 1.0 / dd
        de = dd * c
        h *= de
        if abs(de - 1.0) < 1e-15:
            break
    return math.exp(-x + a * math.log(x) - gln) * h


def erfc(x):
    return math.erfc(x)


def ncdf(x):
    return 0.5 * math.erfc(-x / math.sqrt(2.0))


def bits_of(data):
    for byte in data:
        for k in range(7, -1, -1):
            yield (byte >> k) & 1


def monobit(bits):
    n = len(bits)
    s = 2 * sum(bits) - n
    p = erfc(abs(s) / math.sqrt(n) / math.sqrt(2.0))
    return "Monobit Frequency", p


def block_frequency(bits, M=128):
    n = len(bits)
    N = n // M
    chi = 0.0
    for i in range(N):
        blk = bits[i * M:(i + 1) * M]
        pi = sum(blk) / M - 0.5
        chi += pi * pi
    chi *= 4.0 * M
    return f"Block Frequency M={M}", igamc(N / 2.0, chi / 2.0)


def runs(bits):
    n = len(bits)
    pi = sum(bits) / n
    if abs(pi - 0.5) >= 2.0 / math.sqrt(n):
        return "Runs", 0.0
    v = 1 + sum(1 for i in range(n - 1) if bits[i] != bits[i + 1])
    num = abs(v - 2.0 * n * pi * (1 - pi))
    den = 2.0 * math.sqrt(2.0 * n) * pi * (1 - pi)
    return "Runs", erfc(num / den)


def longest_run(bits, M=128):
    n = len(bits)
    N = n // M
    piK = [0.1174035788, 0.242955959, 0.249363483, 0.17517706, 0.102701071, 0.112466443]
    v = [0] * 6
    for i in range(N):
        blk = bits[i * M:(i + 1) * M]
        best = run = 0
        for b in blk:
            if b:
                run += 1
                best = max(best, run)
            else:
                run = 0
        idx = 0 if best <= 4 else 5 if best >= 9 else best - 4
        v[idx] += 1
    chi = sum((v[i] - N * piK[i]) ** 2 / (N * piK[i]) for i in range(6))
    return f"Longest Run of Ones M={M}", igamc(5 / 2.0, chi / 2.0)


def cusum(bits, mode=0):
    n = len(bits)
    s = z = 0
    seq = bits if mode == 0 else bits[::-1]
    for b in seq:
        s += 1 if b else -1
        z = max(z, abs(s))
    if z == 0:
        return f"Cumulative Sums ({'fwd' if mode==0 else 'bwd'})", 0.0
    sq = math.sqrt(n)
    s1 = sum(ncdf(((4 * k + 1) * z) / sq) - ncdf(((4 * k - 1) * z) / sq)
             for k in range(int((-n / z + 1) / 4), int((n / z - 1) / 4) + 1))
    s2 = sum(ncdf(((4 * k + 3) * z) / sq) - ncdf(((4 * k + 1) * z) / sq)
             for k in range(int((-n / z - 3) / 4), int((n / z - 1) / 4) + 1))
    p = 1.0 - s1 + s2
    return f"Cumulative Sums ({'fwd' if mode==0 else 'bwd'})", min(1.0, max(0.0, p))


def _psi2(bits, m):
    if m <= 0:
        return 0.0
    n = len(bits)
    counts = [0] * (1 << m)
    for i in range(n):
        idx = 0
        for j in range(m):
            idx = (idx << 1) | bits[(i + j) % n]
        counts[idx] += 1
    return sum(c * c for c in counts) * (1 << m) / n - n


def serial(bits, m=3):
    p3, p2, p1 = _psi2(bits, m), _psi2(bits, m - 1), _psi2(bits, m - 2)
    d1, d2 = p3 - p2, p3 - 2 * p2 + p1
    return [("Serial m=3 (nabla)", igamc(2.0, d1 / 2.0)),
            ("Serial m=3 (nabla^2)", igamc(1.0, d2 / 2.0))]


def approx_entropy(bits, m=2):
    n = len(bits)
    phi = []
    for mm in (m, m + 1):
        counts = [0] * (1 << mm)
        for i in range(n):
            idx = 0
            for j in range(mm):
                idx = (idx << 1) | bits[(i + j) % n]
            counts[idx] += 1
        s = sum((c / n) * math.log(c / n) for c in counts if c)
        phi.append(s)
    apen = phi[0] - phi[1]
    chi = 2.0 * n * (math.log(2.0) - apen)
    return "Approximate Entropy m=2", igamc(2.0 ** (m - 1), chi / 2.0)


def dft_spectral(bits):
    if not HAVE_NUMPY:
        return "DFT Spectral (numpy absent)", None
    n = len(bits)
    x = _np.array([1 if b else -1 for b in bits], dtype=float)
    m = _np.abs(_np.fft.fft(x))[: n // 2]
    T = math.sqrt(math.log(1.0 / 0.05) * n)
    N0 = 0.95 * n / 2.0
    N1 = float((m < T).sum())
    d = (N1 - N0) / math.sqrt(n * 0.95 * 0.05 / 4.0)
    return "DFT Spectral", erfc(abs(d) / math.sqrt(2.0))


def byte_chi_square(data):
    hist = [0] * 256
    for b in data:
        hist[b] += 1
    e = len(data) / 256.0
    chi = sum((h - e) ** 2 / e for h in hist)
    return "Byte chi-square (256 bins)", igamc(255 / 2.0, chi / 2.0)


def main():
    path = sys.argv[1]
    data = open(path, "rb").read()
    bits = list(bits_of(data))
    print(f"input      : {path}")
    print(f"bytes      : {len(data)}   bits: {len(bits)}")
    print(f"sha256     : {hashlib.sha256(data).hexdigest()}")
    print(f"numpy      : {'yes' if HAVE_NUMPY else 'no (DFT spectral skipped)'}")
    print(f"alpha      : {ALPHA}")
    print("-" * 64)

    results = [monobit(bits), block_frequency(bits), runs(bits),
               longest_run(bits), cusum(bits, 0), cusum(bits, 1)]
    results += serial(bits)
    results.append(approx_entropy(bits))
    results.append(byte_chi_square(data))
    results.append(dft_spectral(bits))

    npass = nrun = 0
    for name, p in results:
        if p is None:
            print(f"  [SKIP] {name}")
            continue
        nrun += 1
        ok = p >= ALPHA
        npass += ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {name:<32} p = {p:.6f}")
    print("-" * 64)
    print(f"RESULT: {npass}/{nrun} tests pass (p >= {ALPHA})")
    sys.exit(0 if npass == nrun else 1)


if __name__ == "__main__":
    main()
