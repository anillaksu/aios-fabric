/**
 * @file aios_randtest.cpp
 * @brief Implementation of the compact NIST SP 800-22 subset battery.
 *
 * Tests: (1) Monobit Frequency, (2) Runs, (3) Frequency within a Block,
 * (4) Longest Run of Ones in a Block, (5) byte-value chi-square uniformity
 * (practical, not NIST-canonical), (6) draw non-repetition / stuck-output.
 */

#include "aios_randtest.h"
#include <math.h>
#include <string.h>
#include <stdlib.h>

// ---------------------------------------------------------------------------
// Regularized upper incomplete gamma Q(a,x)  (Numerical Recipes, single file)
// ---------------------------------------------------------------------------
static double rt_gammln(double xx) {
    static const double cof[6] = {
        76.18009172947146, -86.50532032941677, 24.01409824083091,
        -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5
    };
    double x = xx, y = xx;
    double tmp = x + 5.5;
    tmp -= (x + 0.5) * log(tmp);
    double ser = 1.000000000190015;
    for (int j = 0; j < 6; ++j) { y += 1.0; ser += cof[j] / y; }
    return -tmp + log(2.5066282746310005 * ser / x);
}

static double rt_gser(double a, double x) {
    double gln = rt_gammln(a);
    if (x <= 0.0) return 0.0;
    double ap = a, sum = 1.0 / a, del = sum;
    for (int n = 0; n < 300; ++n) {
        ap += 1.0;
        del *= x / ap;
        sum += del;
        if (fabs(del) < fabs(sum) * 1e-13) break;
    }
    return sum * exp(-x + a * log(x) - gln);          // P(a,x)
}

static double rt_gcf(double a, double x) {
    double gln = rt_gammln(a);
    double b = x + 1.0 - a;
    double c = 1e30;
    double d = 1.0 / b;
    double h = d;
    for (int i = 1; i <= 300; ++i) {
        double an = -1.0 * i * (i - a);
        b += 2.0;
        d = an * d + b; if (fabs(d) < 1e-30) d = 1e-30;
        c = b + an / c;  if (fabs(c) < 1e-30) c = 1e-30;
        d = 1.0 / d;
        double del = d * c;
        h *= del;
        if (fabs(del - 1.0) < 1e-13) break;
    }
    return exp(-x + a * log(x) - gln) * h;            // Q(a,x)
}

// Q(a,x) = upper regularized incomplete gamma == NIST igamc(a,x)
static double rt_igamc(double a, double x) {
    if (x < 0.0 || a <= 0.0) return 1.0;
    if (x < a + 1.0) return 1.0 - rt_gser(a, x);
    return rt_gcf(a, x);
}

static inline int rt_bit(const uint8_t* d, uint32_t i) {
    return (d[i >> 3] >> (7 - (i & 7))) & 1;
}

// Standard normal CDF via erfc.
static double rt_ncdf(double x) {
    return 0.5 * erfc(-x / sqrt(2.0));
}

// Overlapping (cyclic) m-bit pattern histogram: counts[0 .. 2^m - 1].
static void rt_pattern_counts(const uint8_t* d, uint32_t n, int m, uint32_t* counts) {
    uint32_t nb = 1u << m;
    for (uint32_t i = 0; i < nb; ++i) counts[i] = 0;
    for (uint32_t i = 0; i < n; ++i) {
        uint32_t idx = 0;
        for (int j = 0; j < m; ++j)
            idx = (idx << 1) | (uint32_t)rt_bit(d, (i + j) % n);
        counts[idx]++;
    }
}

// psi^2_m for the Serial test.
static double rt_psi2(const uint8_t* d, uint32_t n, int m, uint32_t* scratch) {
    if (m <= 0) return 0.0;
    rt_pattern_counts(d, n, m, scratch);
    uint32_t nb = 1u << m;
    double s = 0.0;
    for (uint32_t i = 0; i < nb; ++i) s += (double)scratch[i] * (double)scratch[i];
    return (s * (double)nb) / (double)n - (double)n;
}

// ---------------------------------------------------------------------------
// Battery
// ---------------------------------------------------------------------------
int aios_randtest_run(const uint8_t* data, uint32_t nbytes,
                      AiosRandTestResult* out, int* count) {
    const uint32_t n = nbytes * 8u;
    int k = 0;
    int failed = 0;

    // --- (1) Monobit Frequency (NIST 2.1) ---------------------------------
    {
        long ones = 0;
        for (uint32_t i = 0; i < n; ++i) ones += rt_bit(data, i);
        double s = (double)(2 * ones - (long)n);
        double s_obs = fabs(s) / sqrt((double)n);
        double p = erfc(s_obs / sqrt(2.0));
        out[k].name = "Monobit Frequency";
        out[k].statistic = s_obs;
        out[k].p_value = p;
        out[k].applicable = true;
        out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
        if (!out[k].pass) failed++;
        k++;
    }

    // --- (2) Runs (NIST 2.3) --------------------------------------------
    {
        long ones = 0;
        for (uint32_t i = 0; i < n; ++i) ones += rt_bit(data, i);
        double pi = (double)ones / (double)n;
        bool prereq = fabs(pi - 0.5) < (2.0 / sqrt((double)n));
        double p = 0.0, vn = 0.0;
        if (prereq) {
            long v = 1;
            for (uint32_t i = 0; i < n - 1; ++i)
                if (rt_bit(data, i) != rt_bit(data, i + 1)) v++;
            vn = (double)v;
            double num = fabs(vn - 2.0 * n * pi * (1.0 - pi));
            double den = 2.0 * sqrt(2.0 * (double)n) * pi * (1.0 - pi);
            p = erfc(num / den);
        }
        out[k].name = "Runs";
        out[k].statistic = vn;
        out[k].p_value = p;
        out[k].applicable = prereq;
        out[k].pass = prereq ? (p >= AIOS_RANDTEST_ALPHA) : false;
        if (out[k].applicable && !out[k].pass) failed++;
        k++;
    }

    // --- (3) Frequency within a Block (NIST 2.2), M = 128 ----------------
    {
        const uint32_t M = 128;
        const uint32_t N = n / M;
        double chi2 = 0.0;
        for (uint32_t b = 0; b < N; ++b) {
            uint32_t ones = 0;
            for (uint32_t i = 0; i < M; ++i) ones += rt_bit(data, b * M + i);
            double piB = (double)ones / (double)M - 0.5;
            chi2 += piB * piB;
        }
        chi2 *= 4.0 * (double)M;
        double p = rt_igamc((double)N / 2.0, chi2 / 2.0);
        out[k].name = "Block Frequency M=128";
        out[k].statistic = chi2;
        out[k].p_value = p;
        out[k].applicable = (N >= 1);
        out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
        if (!out[k].pass) failed++;
        k++;
    }

    // --- (4) Longest Run of Ones in a Block (NIST 2.4), M = 128 ----------
    {
        const uint32_t M = 128;
        const uint32_t N = n / M;
        // categories for M=128: <=4, 5, 6, 7, 8, >=9
        static const double piK[6] = {
            0.1174035788, 0.242955959, 0.249363483,
            0.17517706,  0.102701071, 0.112466443
        };
        long v[6] = {0, 0, 0, 0, 0, 0};
        for (uint32_t b = 0; b < N; ++b) {
            uint32_t run = 0, best = 0;
            for (uint32_t i = 0; i < M; ++i) {
                if (rt_bit(data, b * M + i)) { run++; if (run > best) best = run; }
                else run = 0;
            }
            int idx;
            if (best <= 4) idx = 0;
            else if (best == 5) idx = 1;
            else if (best == 6) idx = 2;
            else if (best == 7) idx = 3;
            else if (best == 8) idx = 4;
            else idx = 5;
            v[idx]++;
        }
        double chi2 = 0.0;
        for (int i = 0; i < 6; ++i) {
            double e = (double)N * piK[i];
            double diff = (double)v[i] - e;
            chi2 += diff * diff / e;
        }
        double p = rt_igamc(5.0 / 2.0, chi2 / 2.0);   // K = 5 df
        out[k].name = "Longest Run of Ones M=128";
        out[k].statistic = chi2;
        out[k].p_value = p;
        out[k].applicable = (N >= 1);
        out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
        if (!out[k].pass) failed++;
        k++;
    }

    // --- (5) Byte-value chi-square uniformity (practical) ---------------
    {
        uint32_t hist[256];
        memset(hist, 0, sizeof(hist));
        for (uint32_t i = 0; i < nbytes; ++i) hist[data[i]]++;
        double e = (double)nbytes / 256.0;
        double chi2 = 0.0;
        for (int i = 0; i < 256; ++i) {
            double diff = (double)hist[i] - e;
            chi2 += diff * diff / e;
        }
        double p = rt_igamc(255.0 / 2.0, chi2 / 2.0);
        out[k].name = "Byte chi-square (256 bins)";
        out[k].statistic = chi2;
        out[k].p_value = p;
        out[k].applicable = (nbytes >= 2048);   // >= 8 expected counts / bin
        out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
        if (out[k].applicable && !out[k].pass) failed++;
        k++;
    }

    // --- (6) Draw non-repetition / stuck-output ------------------------
    {
        const uint32_t DRAW = 16;
        uint32_t draws = nbytes / DRAW;
        bool repeat = false, stuck0 = true, stuckF = true;
        for (uint32_t i = 0; i < nbytes; ++i) {
            if (data[i] != 0x00) stuck0 = false;
            if (data[i] != 0xFF) stuckF = false;
        }
        for (uint32_t a = 0; a < draws && !repeat; ++a)
            for (uint32_t b = a + 1; b < draws; ++b)
                if (memcmp(&data[a * DRAW], &data[b * DRAW], DRAW) == 0) { repeat = true; break; }
        bool ok = !repeat && !stuck0 && !stuckF;
        out[k].name = "Draw non-repetition / not-stuck";
        out[k].statistic = (double)draws;
        out[k].p_value = ok ? 1.0 : 0.0;
        out[k].applicable = (draws >= 2);
        out[k].pass = ok;
        if (out[k].applicable && !out[k].pass) failed++;
        k++;
    }

    // --- (7,8) Cumulative Sums, forward and backward (NIST 2.13) --------
    {
        for (int mode = 0; mode < 2; ++mode) {
            long s = 0, z = 0;
            for (uint32_t i = 0; i < n; ++i) {
                uint32_t bi = (mode == 0) ? i : (n - 1 - i);
                s += rt_bit(data, bi) ? 1 : -1;
                if (labs(s) > z) z = labs(s);
            }
            if (z < 1) {   // degenerate walk -- not testable
                out[k].name = (mode == 0) ? "Cumulative Sums (fwd)" : "Cumulative Sums (bwd)";
                out[k].statistic = 0.0; out[k].p_value = 0.0;
                out[k].applicable = false; out[k].pass = false; k++;
                continue;
            }
            double zz = (double)z;
            double sq = sqrt((double)n);
            double sum1 = 0.0, sum2 = 0.0;
            long kmin = (long)floor((-(double)n / zz + 1.0) / 4.0);
            long kmax = (long)floor(((double)n / zz - 1.0) / 4.0);
            for (long kk = kmin; kk <= kmax; ++kk)
                sum1 += rt_ncdf(((4 * kk + 1) * zz) / sq) - rt_ncdf(((4 * kk - 1) * zz) / sq);
            long kmin2 = (long)floor((-(double)n / zz - 3.0) / 4.0);
            for (long kk = kmin2; kk <= kmax; ++kk)
                sum2 += rt_ncdf(((4 * kk + 3) * zz) / sq) - rt_ncdf(((4 * kk + 1) * zz) / sq);
            double p = 1.0 - sum1 + sum2;
            if (p < 0.0) p = 0.0; if (p > 1.0) p = 1.0;
            out[k].name = (mode == 0) ? "Cumulative Sums (fwd)" : "Cumulative Sums (bwd)";
            out[k].statistic = zz;
            out[k].p_value = p;
            out[k].applicable = true;
            out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
            if (!out[k].pass) failed++;
            k++;
        }
    }

    // --- (9,10) Serial test, m = 3 (NIST 2.11) -------------------------
    {
        uint32_t scratch[16];
        double psi3 = rt_psi2(data, n, 3, scratch);
        double psi2 = rt_psi2(data, n, 2, scratch);
        double psi1 = rt_psi2(data, n, 1, scratch);
        double d1 = psi3 - psi2;
        double d2 = psi3 - 2.0 * psi2 + psi1;
        double p1 = rt_igamc(2.0, d1 / 2.0);   // 2^{m-2} = 2
        double p2 = rt_igamc(1.0, d2 / 2.0);   // 2^{m-3} = 1
        out[k].name = "Serial m=3 (nabla psi2)";
        out[k].statistic = d1; out[k].p_value = p1; out[k].applicable = true;
        out[k].pass = (p1 >= AIOS_RANDTEST_ALPHA); if (!out[k].pass) failed++; k++;
        out[k].name = "Serial m=3 (nabla^2 psi2)";
        out[k].statistic = d2; out[k].p_value = p2; out[k].applicable = true;
        out[k].pass = (p2 >= AIOS_RANDTEST_ALPHA); if (!out[k].pass) failed++; k++;
    }

    // --- (11) Approximate Entropy, m = 2 (NIST 2.12) ------------------
    {
        uint32_t scratch[16];
        double phi[2];
        for (int mm = 2; mm <= 3; ++mm) {
            rt_pattern_counts(data, n, mm, scratch);
            uint32_t nb = 1u << mm;
            double sum = 0.0;
            for (uint32_t i = 0; i < nb; ++i) {
                if (scratch[i] == 0) continue;
                double c = (double)scratch[i] / (double)n;
                sum += c * log(c);
            }
            phi[mm - 2] = sum;
        }
        double apen = phi[0] - phi[1];
        double chi2 = 2.0 * (double)n * (log(2.0) - apen);
        double p = rt_igamc(2.0, chi2 / 2.0);   // 2^{m-1} = 2
        out[k].name = "Approximate Entropy m=2";
        out[k].statistic = apen * 1000.0;       // scaled for the integer printer
        out[k].p_value = p;
        out[k].applicable = true;
        out[k].pass = (p >= AIOS_RANDTEST_ALPHA);
        if (!out[k].pass) failed++;
        k++;
    }

    *count = k;
    return failed;
}
