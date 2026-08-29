#pragma once

/*  XCommon.h — shared real-time DSP building blocks for the TMSS X Series 2.0 cores.

    Pure C++17 + standard library. Deliberately free of JUCE so the cores can be
    compiled and unit-tested standalone (see XSeriesSelfTest.cpp). Small local
    equivalents of juce::jlimit / jmax are provided instead of pulling in JuceHeader.

    Every class follows the same contract:
      - prepare()  may allocate.
      - reset() / setters / process() are allocation-free, lock-free and noexcept.
*/

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <vector>

namespace xs
{

//==============================================================================
// Scalar helpers
//==============================================================================

template <typename T>
constexpr T xmin (T a, T b) noexcept { return a < b ? a : b; }

template <typename T>
constexpr T xmax (T a, T b) noexcept { return a > b ? a : b; }

template <typename T>
constexpr T xclamp (T v, T lo, T hi) noexcept { return v < lo ? lo : (v > hi ? hi : v); }

constexpr double pi = 3.14159265358979323846;
constexpr double twoPi = 6.28318530717958647692;

/** Zero anything whose magnitude has collapsed towards denormal territory. */
inline void flushDenormal (float& x) noexcept
{
    if (x > -1.0e-15f && x < 1.0e-15f)
        x = 0.0f;
}

inline void flushDenormal (double& x) noexcept
{
    if (x > -1.0e-15 && x < 1.0e-15)
        x = 0.0;
}

inline float finiteOrZero (float x) noexcept
{
    return (x == x && x < 3.4e38f && x > -3.4e38f) ? x : 0.0f;
}

inline bool isFinite (float x) noexcept
{
    return x == x && x < 3.4e38f && x > -3.4e38f;
}

inline float dbToGain (float db) noexcept
{
    return std::pow (10.0f, xclamp (db, -240.0f, 96.0f) * 0.05f);
}

inline float gainToDb (float gain) noexcept
{
    return 20.0f * std::log10 (xmax (1.0e-12f, gain));
}

/** Branch-free-ish 2^x. Relative error < 2e-4 (≈0.0015 dB) for |x| < 30. */
inline float fastExp2 (float x) noexcept
{
    x = xclamp (x, -126.0f, 126.0f);
    const float xi = std::floor (x);
    const float f = x - xi;

    // Taylor series of exp(f * ln2) truncated after f^5.
    const float p = 1.0f + f * (0.6931472f + f * (0.2402265f + f * (0.0555041f
                        + f * (0.0096181f + f * 0.0013333f))));

    union { float f; std::uint32_t i; } u;
    u.i = (std::uint32_t) (((int) xi + 127) << 23);
    return p * u.f;
}

/** Fast dB→linear. Accurate to about 0.002 dB; safe for per-sample use. */
inline float fastDbToGain (float db) noexcept
{
    return fastExp2 (xclamp (db, -240.0f, 96.0f) * 0.16609640f);
}

/** Fast linear→dB.

    Exponent is taken from the float bit pattern; the mantissa is folded into
    [1/sqrt2, sqrt2] and log2 evaluated through the atanh series
    log2(m) = 2/ln2 * atanh((m-1)/(m+1)), truncated after s^5. Worst-case error
    over gains of -60…+12 dB is well under 0.001 dB (measured by the self-test).
*/
inline float fastGainToDb (float gain) noexcept
{
    if (! (gain > 1.0e-9f))
        return -180.0f;

    union { float f; std::uint32_t i; } u;
    u.f = gain;
    int e = (int) ((u.i >> 23) & 0xffu) - 127;
    u.i = (u.i & 0x007fffffu) | 0x3f800000u;
    float m = u.f;

    if (m > 1.41421356f)
    {
        m *= 0.5f;
        ++e;
    }

    const float s = (m - 1.0f) / (m + 1.0f);
    const float s2 = s * s;
    const float atanhS = s * (1.0f + s2 * (0.33333333f + s2 * 0.2f));
    return 6.02059991f * ((float) e + 2.88539008f * atanhS);
}

//==============================================================================
// SmoothedParam — one-pole parameter smoother
//==============================================================================

class SmoothedParam
{
public:
    void setTimeConstant (double seconds, double sampleRate) noexcept
    {
        const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
        tauSamples = seconds > 0.0 ? seconds * sr : 0.0;
        coeff = tauSamples > 1.0e-3 ? (float) (1.0 - std::exp (-1.0 / tauSamples)) : 1.0f;
    }

    void setTarget (float newTarget) noexcept { target = newTarget; }
    float getTarget() const noexcept { return target; }
    float getCurrent() const noexcept { return current; }

    /** Jump straight to the pending target (use after prepare / on topology change). */
    void snap() noexcept { current = target; }

    void snap (float value) noexcept { target = value; current = value; }

    float next() noexcept
    {
        current += (target - current) * coeff;
        flushDenormal (current);
        return current;
    }

    /** Advance by a whole block in one step; equivalent to numSamples calls to next(). */
    float nextBlock (int numSamples) noexcept
    {
        current += (target - current) * blockCoeff (numSamples);
        flushDenormal (current);
        return current;
    }

    float blockCoeff (int numSamples) const noexcept
    {
        if (tauSamples <= 1.0e-3 || numSamples < 1)
            return 1.0f;

        return (float) (1.0 - std::exp (-(double) numSamples / tauSamples));
    }

    /** True when the smoother has converged closely enough to skip coefficient work. */
    bool settled (float tolerance = 1.0e-5f) const noexcept
    {
        const float d = target - current;
        const float a = d < 0.0f ? -d : d;
        const float t = target < 0.0f ? -target : target;
        return a <= tolerance * (1.0f + t);
    }

private:
    float target = 0.0f;
    float current = 0.0f;
    float coeff = 1.0f;
    double tauSamples = 0.0;
};

//==============================================================================
// Biquad — RBJ cookbook designs, transposed direct form II
//==============================================================================

class Biquad
{
public:
    static constexpr double butterworthQ = 0.70710678118654752;

    void setIdentity() noexcept
    {
        b0 = 1.0f; b1 = 0.0f; b2 = 0.0f; a1 = 0.0f; a2 = 0.0f;
    }

    void copyCoefficientsFrom (const Biquad& other) noexcept
    {
        b0 = other.b0; b1 = other.b1; b2 = other.b2; a1 = other.a1; a2 = other.a2;
    }

    void reset() noexcept { z1 = 0.0f; z2 = 0.0f; }

    void flush() noexcept
    {
        flushDenormal (z1);
        flushDenormal (z2);
    }

    /** Transposed direct form II: one multiply-accumulate chain, good numerics in float. */
    float process (float x) noexcept
    {
        const float y = b0 * x + z1;
        z1 = b1 * x - a1 * y + z2;
        z2 = b2 * x - a2 * y;

        if (! isFinite (y))
        {
            z1 = 0.0f;
            z2 = 0.0f;
            return 0.0f;
        }

        return y;
    }

    void bell (double freq, double q, double gainDb, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        const double A = std::pow (10.0, gainDb / 40.0);
        store (1.0 + alpha * A, -2.0 * cw, 1.0 - alpha * A,
               1.0 + alpha / A, -2.0 * cw, 1.0 - alpha / A);
    }

    void lowShelf (double freq, double q, double gainDb, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        const double A = std::pow (10.0, gainDb / 40.0);
        const double t = 2.0 * std::sqrt (A) * alpha;
        store (A * ((A + 1.0) - (A - 1.0) * cw + t),
               2.0 * A * ((A - 1.0) - (A + 1.0) * cw),
               A * ((A + 1.0) - (A - 1.0) * cw - t),
               (A + 1.0) + (A - 1.0) * cw + t,
               -2.0 * ((A - 1.0) + (A + 1.0) * cw),
               (A + 1.0) + (A - 1.0) * cw - t);
    }

    void highShelf (double freq, double q, double gainDb, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        const double A = std::pow (10.0, gainDb / 40.0);
        const double t = 2.0 * std::sqrt (A) * alpha;
        store (A * ((A + 1.0) + (A - 1.0) * cw + t),
               -2.0 * A * ((A - 1.0) + (A + 1.0) * cw),
               A * ((A + 1.0) + (A - 1.0) * cw - t),
               (A + 1.0) - (A - 1.0) * cw + t,
               2.0 * ((A - 1.0) - (A + 1.0) * cw),
               (A + 1.0) - (A - 1.0) * cw - t);
    }

    void notch (double freq, double q, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        store (1.0, -2.0 * cw, 1.0, 1.0 + alpha, -2.0 * cw, 1.0 - alpha);
    }

    void bandPass (double freq, double q, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        store (alpha, 0.0, -alpha, 1.0 + alpha, -2.0 * cw, 1.0 - alpha);
    }

    void lowPass (double freq, double q, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        store ((1.0 - cw) * 0.5, 1.0 - cw, (1.0 - cw) * 0.5,
               1.0 + alpha, -2.0 * cw, 1.0 - alpha);
    }

    void highPass (double freq, double q, double sampleRate) noexcept
    {
        double cw, sw, alpha;
        if (! prologue (freq, q, sampleRate, cw, sw, alpha)) return;

        store ((1.0 + cw) * 0.5, -(1.0 + cw), (1.0 + cw) * 0.5,
               1.0 + alpha, -2.0 * cw, 1.0 - alpha);
    }

    /** Shelf design driven by a dB/oct slope instead of Q (RBJ "S" parameter). */
    void shelfBySlope (double freq, double slopeDbPerOct, double gainDb,
                       double sampleRate, bool high) noexcept
    {
        const double sr = sampleRate > 1000.0 ? sampleRate : 48000.0;
        const double f = xclamp (freq, 10.0, sr * 0.49);
        const double w0 = twoPi * f / sr;
        const double sw = std::sin (w0);
        const double A = std::pow (10.0, gainDb / 40.0);
        const double S = xclamp (slopeDbPerOct / 12.0, 0.25, 1.0);
        const double alpha = sw * 0.5 * std::sqrt ((A + 1.0 / A) * (1.0 / S - 1.0) + 2.0);
        const double q = alpha > 1.0e-12 ? sw / (2.0 * alpha) : butterworthQ;

        if (high) highShelf (f, q, gainDb, sr);
        else      lowShelf  (f, q, gainDb, sr);
    }

    double magnitudeSquared (double omega) const noexcept
    {
        const double c1 = std::cos (omega), s1 = std::sin (omega);
        const double c2 = std::cos (2.0 * omega), s2 = std::sin (2.0 * omega);
        const double br = (double) b0 + (double) b1 * c1 + (double) b2 * c2;
        const double bi = -((double) b1 * s1 + (double) b2 * s2);
        const double ar = 1.0 + (double) a1 * c1 + (double) a2 * c2;
        const double ai = -((double) a1 * s1 + (double) a2 * s2);
        const double den = ar * ar + ai * ai;
        return den < 1.0e-30 ? 1.0 : (br * br + bi * bi) / den;
    }

private:
    bool prologue (double freq, double q, double sampleRate,
                   double& cw, double& sw, double& alpha) noexcept
    {
        const double sr = sampleRate > 1000.0 ? sampleRate : 48000.0;
        const double f = xclamp (freq, 5.0, sr * 0.49);
        const double w0 = twoPi * f / sr;
        cw = std::cos (w0);
        sw = std::sin (w0);
        const double qq = xclamp (q, 0.05, 60.0);
        alpha = sw / (2.0 * qq);
        return true;
    }

    void store (double nb0, double nb1, double nb2, double na0, double na1, double na2) noexcept
    {
        if (na0 == 0.0 || na0 != na0)
        {
            setIdentity();
            return;
        }

        const double inv = 1.0 / na0;
        b0 = (float) (nb0 * inv);
        b1 = (float) (nb1 * inv);
        b2 = (float) (nb2 * inv);
        a1 = (float) (na1 * inv);
        a2 = (float) (na2 * inv);

        if (! (isFinite (b0) && isFinite (b1) && isFinite (b2) && isFinite (a1) && isFinite (a2)))
            setIdentity();
    }

    float b0 = 1.0f, b1 = 0.0f, b2 = 0.0f, a1 = 0.0f, a2 = 0.0f;
    float z1 = 0.0f, z2 = 0.0f;
};

//==============================================================================
// FirstOrderFilter — bilinear one-pole, used for odd cut orders and loop damping
//==============================================================================

class FirstOrderFilter
{
public:
    void setIdentity() noexcept { b0 = 1.0f; b1 = 0.0f; a1 = 0.0f; }

    void setLowPass (double freq, double sampleRate) noexcept { design (freq, sampleRate, false); }
    void setHighPass (double freq, double sampleRate) noexcept { design (freq, sampleRate, true); }

    void copyCoefficientsFrom (const FirstOrderFilter& o) noexcept
    {
        b0 = o.b0; b1 = o.b1; a1 = o.a1;
    }

    void reset() noexcept { z1 = 0.0f; }
    void flush() noexcept { flushDenormal (z1); }

    float process (float x) noexcept
    {
        const float y = b0 * x + z1;
        z1 = b1 * x - a1 * y;

        if (! isFinite (y))
        {
            z1 = 0.0f;
            return 0.0f;
        }

        return y;
    }

    double magnitudeSquared (double omega) const noexcept
    {
        const double c1 = std::cos (omega), s1 = std::sin (omega);
        const double br = (double) b0 + (double) b1 * c1;
        const double bi = -(double) b1 * s1;
        const double ar = 1.0 + (double) a1 * c1;
        const double ai = -(double) a1 * s1;
        const double den = ar * ar + ai * ai;
        return den < 1.0e-30 ? 1.0 : (br * br + bi * bi) / den;
    }

private:
    void design (double freq, double sampleRate, bool high) noexcept
    {
        const double sr = sampleRate > 1000.0 ? sampleRate : 48000.0;
        const double f = xclamp (freq, 5.0, sr * 0.49);
        const double g = std::tan (pi * f / sr);
        const double a = 1.0 / (1.0 + g);

        if (high)
        {
            b0 = (float) a;
            b1 = (float) -a;
        }
        else
        {
            b0 = (float) (g * a);
            b1 = (float) (g * a);
        }

        a1 = (float) ((g - 1.0) * a);

        if (! (isFinite (b0) && isFinite (b1) && isFinite (a1)))
            setIdentity();
    }

    float b0 = 1.0f, b1 = 0.0f, a1 = 0.0f;
    float z1 = 0.0f;
};

//==============================================================================
// LinkwitzRiley4 — 4th-order crossover; LP + HP sum to an allpass (flat magnitude)
//==============================================================================

class LinkwitzRiley4
{
public:
    void setCrossover (double freq, double sampleRate) noexcept
    {
        lp[0].lowPass (freq, Biquad::butterworthQ, sampleRate);
        lp[1].copyCoefficientsFrom (lp[0]);
        hp[0].highPass (freq, Biquad::butterworthQ, sampleRate);
        hp[1].copyCoefficientsFrom (hp[0]);
    }

    void reset() noexcept
    {
        lp[0].reset(); lp[1].reset();
        hp[0].reset(); hp[1].reset();
    }

    void flush() noexcept
    {
        lp[0].flush(); lp[1].flush();
        hp[0].flush(); hp[1].flush();
    }

    void process (float input, float& low, float& high) noexcept
    {
        low  = lp[1].process (lp[0].process (input));
        high = hp[1].process (hp[0].process (input));
    }

    /** Magnitude of the low branch, squared. */
    double lowMagnitudeSquared (double omega) const noexcept
    {
        const double m = lp[0].magnitudeSquared (omega);
        return m * m;
    }

    double highMagnitudeSquared (double omega) const noexcept
    {
        const double m = hp[0].magnitudeSquared (omega);
        return m * m;
    }

private:
    Biquad lp[2];
    Biquad hp[2];
};

//==============================================================================
// DelayLine — power-of-two float line with integer, linear and cubic reads
//==============================================================================

class DelayLine
{
public:
    /** Allocating. maxDelaySamples is rounded up to a power of two with headroom. */
    void prepare (int maxDelaySamples)
    {
        int size = 8;
        const int wanted = xmax (8, maxDelaySamples + 8);
        while (size < wanted)
            size <<= 1;

        buffer.assign ((size_t) size, 0.0f);
        mask = size - 1;
        writeIndex = 0;
    }

    void reset() noexcept
    {
        if (! buffer.empty())
            std::memset (buffer.data(), 0, buffer.size() * sizeof (float));

        writeIndex = 0;
    }

    int getSize() const noexcept { return (int) buffer.size(); }
    int getMaxDelay() const noexcept { return (int) buffer.size() - 4; }

    void write (float x) noexcept
    {
        buffer[(size_t) writeIndex] = x;
        writeIndex = (writeIndex + 1) & mask;
    }

    /** Integer read; delay 1 == the sample written most recently. */
    float read (int delaySamples) const noexcept
    {
        const int d = xclamp (delaySamples, 1, mask - 2);
        return buffer[(size_t) ((writeIndex - d) & mask)];
    }

    float readLinear (float delaySamples) const noexcept
    {
        const float d = xclamp (delaySamples, 1.0f, (float) (mask - 2));
        const int i = (int) d;
        const float f = d - (float) i;
        const int r0 = (writeIndex - i) & mask;
        const int r1 = (r0 - 1) & mask;
        const float s0 = buffer[(size_t) r0];
        const float s1 = buffer[(size_t) r1];
        return s0 + f * (s1 - s0);
    }

    /** 4-point Catmull-Rom read; useful where modulation depth is large. */
    float readCubic (float delaySamples) const noexcept
    {
        const float d = xclamp (delaySamples, 2.0f, (float) (mask - 3));
        const int i = (int) d;
        const float f = d - (float) i;
        const int r1 = (writeIndex - i) & mask;
        const int r0 = (r1 + 1) & mask;
        const int r2 = (r1 - 1) & mask;
        const int r3 = (r1 - 2) & mask;
        const float x0 = buffer[(size_t) r0];
        const float x1 = buffer[(size_t) r1];
        const float x2 = buffer[(size_t) r2];
        const float x3 = buffer[(size_t) r3];
        const float c1 = 0.5f * (x2 - x0);
        const float c2 = x0 - 2.5f * x1 + 2.0f * x2 - 0.5f * x3;
        const float c3 = 0.5f * (x3 - x0) + 1.5f * (x1 - x2);
        return ((c3 * f + c2) * f + c1) * f + x1;
    }

private:
    std::vector<float> buffer;
    int mask = 0;
    int writeIndex = 0;
};

//==============================================================================
// PeakHold — metering envelope with instant attack and exponential release
//==============================================================================

class PeakHold
{
public:
    void prepare (double sampleRate, double releaseSeconds = 0.14) noexcept
    {
        const double sr = sampleRate > 1.0 ? sampleRate : 48000.0;
        tauSamples = xmax (1.0, releaseSeconds * sr);
        value = 0.0f;
    }

    void reset() noexcept { value = 0.0f; }

    float process (float x) noexcept
    {
        const float a = x < 0.0f ? -x : x;

        if (a > value)
            value = a;
        else
        {
            value *= (float) std::exp (-1.0 / tauSamples);
            flushDenormal (value);
        }

        return value;
    }

    /** Block-rate variant: feed the block peak plus the block length. */
    float processBlock (float blockPeak, int numSamples) noexcept
    {
        const float decay = (float) std::exp (-(double) xmax (1, numSamples) / tauSamples);
        value *= decay;
        flushDenormal (value);

        if (blockPeak > value)
            value = blockPeak;

        return value;
    }

    float get() const noexcept { return value; }

private:
    double tauSamples = 6720.0;
    float value = 0.0f;
};

//==============================================================================
// Oversampler — polyphase half-band up/down sampling for factors 1, 2 and 4
//==============================================================================

/*  Kaiser-windowed half-band FIR, 95 taps, beta = 12.

    Measured (double precision, see XSeriesSelfTest "oversampler FIR" check):
      passband ripple  0.000011 dB  up to 0.2083 * fs_os  (20 kHz at 48 kHz base rate)
      stopband        -117.98 dB    from 0.2917 * fs_os   (28 kHz at 48 kHz base rate)

    Half-band structure: the centre tap is exactly 0.5 and every tap at an even
    distance from the centre is exactly zero, so one polyphase branch degenerates
    to a pure delay and the other needs only 24 multiplies (95-tap symmetry).

    Group delay is 47 samples at the oversampled rate. Latency in base-rate samples:
      1x : 0
      2x : 47/2 (up) + 47/2 (down)                                       = 47
      4x : 47/2 + 47/4 (up) + 47/4 + 47/2 (down) + 2 samples at 4x       = 71
    The 2-sample trim at the 4x rate exists purely to make the 4x total an integer
    number of base-rate samples, so getLatencySamples() is exact for every factor.
*/

/** 95-tap Kaiser(beta=12) half-band prototype. Taps at even distance from the
    centre are exactly zero; the centre tap is exactly 0.5. */
inline constexpr float halfBandFir[95] =
{
    -3.574107189e-07f, +0.000000000e+00f, +2.670664130e-06f, +0.000000000e+00f,
    -9.262587130e-06f, +0.000000000e+00f, +2.439780924e-05f, +0.000000000e+00f,
    -5.488629799e-05f, +0.000000000e+00f, +1.109175715e-04f, +0.000000000e+00f,
    -2.069541291e-04f, +0.000000000e+00f, +3.626397142e-04f, +0.000000000e+00f,
    -6.036864654e-04f, +0.000000000e+00f, +9.627339459e-04f, +0.000000000e+00f,
    -1.480232086e-03f, +0.000000000e+00f, +2.205504317e-03f, +0.000000000e+00f,
    -3.198324051e-03f, +0.000000000e+00f, +4.531643099e-03f, +0.000000000e+00f,
    -6.296667386e-03f, +0.000000000e+00f, +8.612570121e-03f, +0.000000000e+00f,
    -1.164548069e-02f, +0.000000000e+00f, +1.564692507e-02f, +0.000000000e+00f,
    -2.103644127e-02f, +0.000000000e+00f, +2.859671206e-02f, +0.000000000e+00f,
    -4.000536504e-02f, +0.000000000e+00f, +5.964442345e-02f, +0.000000000e+00f,
    -1.036465375e-01f, +0.000000000e+00f, +3.174830571e-01f, +5.000000000e-01f,
    +3.174830571e-01f, +0.000000000e+00f, -1.036465375e-01f, +0.000000000e+00f,
    +5.964442345e-02f, +0.000000000e+00f, -4.000536504e-02f, +0.000000000e+00f,
    +2.859671206e-02f, +0.000000000e+00f, -2.103644127e-02f, +0.000000000e+00f,
    +1.564692507e-02f, +0.000000000e+00f, -1.164548069e-02f, +0.000000000e+00f,
    +8.612570121e-03f, +0.000000000e+00f, -6.296667386e-03f, +0.000000000e+00f,
    +4.531643099e-03f, +0.000000000e+00f, -3.198324051e-03f, +0.000000000e+00f,
    +2.205504317e-03f, +0.000000000e+00f, -1.480232086e-03f, +0.000000000e+00f,
    +9.627339459e-04f, +0.000000000e+00f, -6.036864654e-04f, +0.000000000e+00f,
    +3.626397142e-04f, +0.000000000e+00f, -2.069541291e-04f, +0.000000000e+00f,
    +1.109175715e-04f, +0.000000000e+00f, -5.488629799e-05f, +0.000000000e+00f,
    +2.439780924e-05f, +0.000000000e+00f, -9.262587130e-06f, +0.000000000e+00f,
    +2.670664130e-06f, +0.000000000e+00f, -3.574107189e-07f
};

/** The 24 unique non-zero taps: halfBandFolded[p] == halfBandFir[2p] == halfBandFir[2(47-p)]. */
inline constexpr float halfBandFolded[24] =
{
    -3.574107189e-07f, +2.670664130e-06f, -9.262587130e-06f, +2.439780924e-05f,
    -5.488629799e-05f, +1.109175715e-04f, -2.069541291e-04f, +3.626397142e-04f,
    -6.036864654e-04f, +9.627339459e-04f, -1.480232086e-03f, +2.205504317e-03f,
    -3.198324051e-03f, +4.531643099e-03f, -6.296667386e-03f, +8.612570121e-03f,
    -1.164548069e-02f, +1.564692507e-02f, -2.103644127e-02f, +2.859671206e-02f,
    -4.000536504e-02f, +5.964442345e-02f, -1.036465375e-01f, +3.174830571e-01f
};

class Oversampler
{
public:
    static constexpr int firLength = 95;
    static constexpr int firDelay = 47;         // (firLength - 1) / 2
    static constexpr int numFoldedTaps = 24;    // unique non-zero taps
    static constexpr float centreTap = 0.5f;
    static constexpr float stopbandAttenuationDb = -117.98f;
    static constexpr float passbandRippleDb = 0.000011f;

    static const float* getFirCoefficients() noexcept { return halfBandFir; }
    static const float* getFoldedCoefficients() noexcept { return halfBandFolded; }

    /** Allocating. maxFactorIn is clamped to 1, 2 or 4. */
    void prepare (int maxFactorIn, int maxBlockSizeIn)
    {
        maxFactor = maxFactorIn >= 4 ? 4 : (maxFactorIn >= 2 ? 2 : 1);
        maxBlockSize = xmax (1, maxBlockSizeIn);
        factor = xmin (factor, maxFactor);

        for (int ch = 0; ch < 2; ++ch)
        {
            if (maxFactor >= 2)
            {
                upA[ch].resize (firDelay, maxBlockSize);
                dnA[ch].resize (2 * firDelay, 2 * maxBlockSize);
            }

            if (maxFactor >= 4)
            {
                upB[ch].resize (firDelay, 2 * maxBlockSize);
                dnB[ch].resize (2 * firDelay, 4 * maxBlockSize);
            }
        }

        updatePointers();
        reset();
    }

    void setFactor (int newFactor) noexcept
    {
        const int f = newFactor >= 4 ? 4 : (newFactor >= 2 ? 2 : 1);
        const int clamped = xmin (f, maxFactor);

        if (clamped == factor)
            return;

        factor = clamped;
        updatePointers();
        reset();
    }

    int getFactor() const noexcept { return factor; }
    int getMaxUpSamples() const noexcept { return maxBlockSize * factor; }

    int getLatencySamples() const noexcept
    {
        return factor >= 4 ? 71 : (factor >= 2 ? 47 : 0);
    }

    void reset() noexcept
    {
        for (int ch = 0; ch < 2; ++ch)
        {
            upA[ch].clear();
            upB[ch].clear();
            dnB[ch].clear();
            dnA[ch].clear();
            quadTrim[ch][0] = 0.0f;
            quadTrim[ch][1] = 0.0f;
        }
    }

    /** Up-samples into the internal buffers. Returns the oversampled frame count. */
    int processUp (const float* left, const float* right, int numSamples) noexcept
    {
        if (factor <= 1)
            return numSamples;

        const int n = xclamp (numSamples, 0, maxBlockSize);

        for (int ch = 0; ch < 2; ++ch)
        {
            const float* src = ch == 0 ? left : right;
            float* dst = upA[ch].in();

            if (src != nullptr)
                std::memcpy (dst, src, (size_t) n * sizeof (float));
            else
                std::memset (dst, 0, (size_t) n * sizeof (float));

            if (factor == 2)
            {
                upsample2 (upA[ch], n, dnA[ch].in());
            }
            else
            {
                upsample2 (upA[ch], n, upB[ch].in());
                upsample2 (upB[ch], 2 * n, dnB[ch].in());
                trimQuad (dnB[ch].in(), 4 * n, quadTrim[ch]);
            }
        }

        return n * factor;
    }

    float* upLeft() noexcept { return upL; }
    float* upRight() noexcept { return upR; }

    /** Down-samples the (possibly modified) internal buffers back into left/right. */
    void processDown (float* left, float* right, int numSamples) noexcept
    {
        if (factor <= 1)
            return;

        const int n = xclamp (numSamples, 0, maxBlockSize);

        for (int ch = 0; ch < 2; ++ch)
        {
            float* dst = ch == 0 ? left : right;

            if (factor == 4)
                downsample2 (dnB[ch], 2 * n, dnA[ch].in());

            if (dst != nullptr)
            {
                downsample2 (dnA[ch], n, dst);
            }
            else
            {
                downsample2 (dnA[ch], n, upA[ch].in());   // keep the state advancing
            }
        }
    }

    /** Callback form: fn(float* l, float* r, int n) runs at the oversampled rate. */
    template <typename Fn>
    void processBlock (float* left, float* right, int numSamples, Fn&& fn) noexcept
    {
        if (factor <= 1 || maxBlockSize <= 0)
        {
            fn (left, right, numSamples);
            return;
        }

        const int nUp = processUp (left, right, numSamples);
        fn (upL, upR, nUp);
        processDown (left, right, numSamples);
    }

private:
    struct Stage
    {
        std::vector<float> work;    // [ history | current input ]
        int history = 0;

        void resize (int historySamples, int maxInput)
        {
            history = historySamples;
            work.assign ((size_t) (historySamples + xmax (1, maxInput)), 0.0f);
        }

        void clear() noexcept
        {
            if (! work.empty())
                std::memset (work.data(), 0, work.size() * sizeof (float));
        }

        float* in() noexcept { return work.empty() ? nullptr : work.data() + history; }
    };

    void updatePointers() noexcept
    {
        if (factor >= 4)
        {
            upL = dnB[0].in();
            upR = dnB[1].in();
        }
        else if (factor == 2)
        {
            upL = dnA[0].in();
            upR = dnA[1].in();
        }
        else
        {
            upL = nullptr;
            upR = nullptr;
        }
    }

    /** Polyphase 2x interpolation. Branch 0 folds 24 taps, branch 1 is a pure delay. */
    static void upsample2 (Stage& s, int numIn, float* out) noexcept
    {
        if (out == nullptr || s.work.empty())
            return;

        float* b = s.work.data();

        for (int k = 0; k < numIn; ++k)
        {
            const float* c = b + firDelay + k;
            float acc = 0.0f;

            for (int p = 0; p < numFoldedTaps; ++p)
                acc += halfBandFolded[p] * (c[-p] + c[p - firDelay]);

            out[2 * k] = 2.0f * acc;
            out[2 * k + 1] = c[-(firDelay / 2)];
        }

        std::memmove (b, b + numIn, (size_t) firDelay * sizeof (float));
    }

    /** Polyphase 2x decimation: 24 folded taps plus the exact 0.5 centre tap. */
    static void downsample2 (Stage& s, int numOut, float* out) noexcept
    {
        if (out == nullptr || s.work.empty())
            return;

        float* b = s.work.data();
        constexpr int hist = 2 * firDelay;

        for (int k = 0; k < numOut; ++k)
        {
            const float* c = b + hist + 2 * k;
            float acc = centreTap * c[-firDelay];

            for (int p = 0; p < numFoldedTaps; ++p)
                acc += halfBandFolded[p] * (c[-2 * p] + c[2 * p - hist]);

            out[k] = acc;
        }

        std::memmove (b, b + 2 * numOut, (size_t) hist * sizeof (float));
    }

    /** Two-sample delay at the 4x rate so the 4x total latency lands on an integer. */
    static void trimQuad (float* buf, int n, float* state) noexcept
    {
        if (buf == nullptr || n <= 0)
            return;

        if (n == 1)
        {
            const float x0 = buf[0];
            buf[0] = state[0];
            state[0] = state[1];
            state[1] = x0;
            return;
        }

        const float carry0 = buf[n - 2];
        const float carry1 = buf[n - 1];

        for (int i = n - 1; i >= 2; --i)
            buf[i] = buf[i - 2];

        buf[0] = state[0];
        buf[1] = state[1];
        state[0] = carry0;
        state[1] = carry1;
    }

    int factor = 1;
    int maxFactor = 1;
    int maxBlockSize = 0;

    Stage upA[2], upB[2], dnB[2], dnA[2];
    float quadTrim[2][2] = { { 0.0f, 0.0f }, { 0.0f, 0.0f } };
    float* upL = nullptr;
    float* upR = nullptr;
};

} // namespace xs
