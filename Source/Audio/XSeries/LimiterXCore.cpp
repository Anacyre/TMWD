#include "LimiterXCore.h"

#include <algorithm>
#include <chrono>
#include <cmath>

namespace tmss
{

namespace
{
    constexpr float kMinGain = 1.0e-6f;
    constexpr float kLog10Over20 = 0.11512925464970229f; // ln(10) / 20

    inline float flushDenormal (float x) noexcept
    {
        return (std::abs (x) < 1.0e-15f) ? 0.0f : x;
    }

    inline float clampf (float v, float lo, float hi) noexcept
    {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    inline int nextPowerOfTwo (int v) noexcept
    {
        int p = 1;
        while (p < v)
            p <<= 1;
        return p;
    }

    /** One-pole coefficient reaching 1 - 1/e of the target in `seconds`. */
    inline float onePole (float seconds, double sampleRate) noexcept
    {
        if (seconds <= 0.0f)
            return 1.0f;
        return 1.0f - std::exp (static_cast<float> (-1.0 / (seconds * sampleRate)));
    }

    /** Zeroth-order modified Bessel function, for the Kaiser window. */
    double besselI0 (double x)
    {
        double sum = 1.0, term = 1.0;
        const double halfSquared = 0.25 * x * x;
        for (int k = 1; k < 40; ++k)
        {
            term *= halfSquared / (static_cast<double> (k) * static_cast<double> (k));
            sum += term;
            if (term < 1.0e-16 * sum)
                break;
        }
        return sum;
    }
}

// ── PeakUpsampler ────────────────────────────────────────────────────────────

void PeakUpsampler::prepare (int requestedFactor)
{
    factor = (requestedFactor >= 4) ? 4 : (requestedFactor >= 2 ? 2 : 1);
    reset();

    for (auto& phase : phases)
        phase.fill (0.0f);

    if (factor <= 1)
    {
        phases[0][tapsPerPhase / 2] = 1.0f;
        return;
    }

    // Kaiser-windowed sinc prototype at the oversampled rate, split into polyphase branches.
    // beta 8.6 gives roughly -80 dB stopband, which is well below the 0.05 dB accuracy the
    // true-peak readout needs.
    const int protoLength = tapsPerPhase * factor;
    const double beta = 8.6;
    const double denom = besselI0 (beta);
    const double centre = 0.5 * (protoLength - 1);
    const double cutoff = 1.0 / static_cast<double> (factor);

    std::vector<double> proto (static_cast<std::size_t> (protoLength));
    double sum = 0.0;
    for (int n = 0; n < protoLength; ++n)
    {
        const double t = n - centre;
        const double sinc = (std::abs (t) < 1.0e-9)
            ? cutoff
            : std::sin (3.14159265358979323846 * cutoff * t) / (3.14159265358979323846 * t);
        const double r = 2.0 * n / static_cast<double> (protoLength - 1) - 1.0;
        const double window = besselI0 (beta * std::sqrt (std::max (0.0, 1.0 - r * r))) / denom;
        proto[static_cast<std::size_t> (n)] = sinc * window;
        sum += proto[static_cast<std::size_t> (n)];
    }

    // Normalise so a DC input reproduces its own level in every phase.
    const double scale = (sum != 0.0) ? (static_cast<double> (factor) / sum) : 1.0;
    for (int n = 0; n < protoLength; ++n)
    {
        const int phase = n % factor;
        const int tap = n / factor;
        phases[static_cast<std::size_t> (phase)][static_cast<std::size_t> (tap)]
            = static_cast<float> (proto[static_cast<std::size_t> (n)] * scale);
    }
}

void PeakUpsampler::reset() noexcept
{
    history.fill (0.0f);
    writeIndex = 0;
}

float PeakUpsampler::process (float x) noexcept
{
    // The history is stored twice so each phase reads a contiguous window without wrapping.
    history[static_cast<std::size_t> (writeIndex)] = x;
    history[static_cast<std::size_t> (writeIndex + tapsPerPhase)] = x;
    writeIndex = (writeIndex + 1) % tapsPerPhase;

    if (factor <= 1)
        return std::abs (x);

    const float* window = history.data() + writeIndex;
    float peak = std::abs (x);
    for (int p = 0; p < factor; ++p)
    {
        const auto& taps = phases[static_cast<std::size_t> (p)];
        float acc = 0.0f;
        for (int t = 0; t < tapsPerPhase; ++t)
            acc += taps[static_cast<std::size_t> (t)] * window[tapsPerPhase - 1 - t];
        peak = std::max (peak, std::abs (acc));
    }
    return peak;
}

// ── LimiterXCore ─────────────────────────────────────────────────────────────

float LimiterXCore::dbToGain (float db) noexcept
{
    return std::exp (db * kLog10Over20);
}

float LimiterXCore::gainToDb (float gain) noexcept
{
    return 20.0f * std::log10 (std::max (kMinGain, gain));
}

void LimiterXCore::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = (newSampleRate > 0.0) ? newSampleRate : 48000.0;
    maxBlock = std::max (1, maxBlockSize);

    const int maxLookahead = static_cast<int> (std::ceil (lookaheadMaxMs * 0.001 * sampleRate)) + 4;
    const int capacity = nextPowerOfTwo (std::max (64, maxLookahead + maxBlock));

    delayL.assign (static_cast<std::size_t> (capacity), 0.0f);
    delayR.assign (static_cast<std::size_t> (capacity), 0.0f);
    delayMask = capacity - 1;

    minValues.assign (static_cast<std::size_t> (maxLookahead + 2), 1.0f);
    minAges.assign (static_cast<std::size_t> (maxLookahead + 2), 0LL);

    upL.prepare (params.truePeak ? params.oversampling : 1);
    upR.prepare (params.truePeak ? params.oversampling : 1);

    setParams (params);
    reset();
}

void LimiterXCore::reset() noexcept
{
    std::fill (delayL.begin(), delayL.end(), 0.0f);
    std::fill (delayR.begin(), delayR.end(), 0.0f);
    delayWrite = 0;

    minHead = minTail = minCount = 0;
    sampleCounter = 0;

    envGain = 1.0f;
    smoothedGain = 1.0f;
    inputGain = inputGainTarget;

    upL.reset();
    upR.reset();

    grDb.store (0.0f, std::memory_order_relaxed);
    inDb.store (-120.0f, std::memory_order_relaxed);
    outDb.store (-120.0f, std::memory_order_relaxed);
    tpDb.store (-120.0f, std::memory_order_relaxed);
    inLin.store (0.0f, std::memory_order_relaxed);
    outLin.store (0.0f, std::memory_order_relaxed);
}

void LimiterXCore::setLookahead (int samples) noexcept
{
    const int capacity = static_cast<int> (minValues.size()) - 2;
    samples = std::max (0, std::min (samples, capacity));
    if (samples == lookaheadSamples)
        return;

    lookaheadSamples = samples;
    minHead = minTail = minCount = 0;

    // The gain must reach its target within the lookahead window; with no lookahead fall back
    // to a short fixed ramp that keeps the limiter clean without pumping.
    const float attackSec = (samples > 0)
        ? static_cast<float> (samples) / static_cast<float> (sampleRate)
        : 0.00005f;
    attackCoeff = onePole (attackSec * 0.35f, sampleRate);
    gainSmoothCoeff = std::min (1.0f, attackCoeff * 3.0f);
}

void LimiterXCore::setParams (const LimiterXParams& next) noexcept
{
    const int factor = (next.oversampling >= 4) ? 4 : (next.oversampling >= 2 ? 2 : 1);
    const int wanted = next.truePeak ? factor : 1;
    if (wanted != upL.getFactor())
    {
        upL.prepare (wanted);
        upR.prepare (wanted);
    }

    params = next;
    params.oversampling = factor;

    inputGainTarget = dbToGain (clampf (next.gainDb, gainMinDb, gainMaxDb));
    ceilingLin = dbToGain (clampf (next.ceilingDb, ceilingMinDb, ceilingMaxDb));
    releaseCoeff = onePole (clampf (next.releaseMs, releaseMinMs, releaseMaxMs) * 0.001f, sampleRate);

    if (! delayL.empty())
        setLookahead (static_cast<int> (std::lround (clampf (next.lookaheadMs, 0.0f, lookaheadMaxMs)
                                                    * 0.001f * static_cast<float> (sampleRate))));
}

float LimiterXCore::slidingMinimum (float requiredGain) noexcept
{
    if (lookaheadSamples <= 0)
        return requiredGain;

    const int capacity = static_cast<int> (minValues.size());

    // Drop everything no smaller than the incoming value: it can never be the window minimum
    // again. This keeps the deque monotonically increasing from head to tail.
    while (minCount > 0)
    {
        const int last = (minTail - 1 + capacity) % capacity;
        if (minValues[static_cast<std::size_t> (last)] < requiredGain)
            break;
        minTail = last;
        --minCount;
    }

    minValues[static_cast<std::size_t> (minTail)] = requiredGain;
    minAges[static_cast<std::size_t> (minTail)] = sampleCounter;
    minTail = (minTail + 1) % capacity;
    ++minCount;

    const long long oldestKept = sampleCounter - lookaheadSamples;
    while (minCount > 0 && minAges[static_cast<std::size_t> (minHead)] < oldestKept)
    {
        minHead = (minHead + 1) % capacity;
        --minCount;
    }

    return minCount > 0 ? minValues[static_cast<std::size_t> (minHead)] : requiredGain;
}

void LimiterXCore::process (float* left, float* right, int numSamples) noexcept
{
    if (delayL.empty() || numSamples <= 0)
        return;

    const float gainStep = onePole (0.008f, sampleRate);
    float peakIn = 0.0f, peakOut = 0.0f, peakTrue = 0.0f, maxReduction = 0.0f;

    for (int n = 0; n < numSamples; ++n)
    {
        inputGain += (inputGainTarget - inputGain) * gainStep;

        const float rawL = left[n];
        const float rawR = right[n];
        const float inL = rawL * inputGain;
        const float inR = rawR * inputGain;

        peakIn = std::max (peakIn, std::max (std::abs (inL), std::abs (inR)));

        // Detector runs on the undelayed signal so the ramp completes before the peak lands.
        const float detected = std::max (upL.process (inL), upR.process (inR));
        peakTrue = std::max (peakTrue, detected);

        const float required = (detected > ceilingLin)
            ? std::max (kMinGain, ceilingLin / detected)
            : 1.0f;
        const float windowed = slidingMinimum (required);

        if (windowed < envGain)
            envGain += (windowed - envGain) * attackCoeff;
        else
            envGain += (windowed - envGain) * releaseCoeff;
        envGain = flushDenormal (std::min (1.0f, envGain));

        smoothedGain += (envGain - smoothedGain) * gainSmoothCoeff;
        smoothedGain = clampf (flushDenormal (smoothedGain), kMinGain, 1.0f);

        delayL[static_cast<std::size_t> (delayWrite)] = inL;
        delayR[static_cast<std::size_t> (delayWrite)] = inR;
        const int readIndex = (delayWrite - lookaheadSamples) & delayMask;
        delayWrite = (delayWrite + 1) & delayMask;

        float outL = delayL[static_cast<std::size_t> (readIndex)] * smoothedGain;
        float outR = delayR[static_cast<std::size_t> (readIndex)] * smoothedGain;

        // Final safety clip: the sliding minimum guarantees the ceiling for band-limited
        // material, but a discontinuous edit or a NaN upstream must not escape.
        outL = clampf (outL, -ceilingLin, ceilingLin);
        outR = clampf (outR, -ceilingLin, ceilingLin);
        if (! (outL == outL)) outL = 0.0f;
        if (! (outR == outR)) outR = 0.0f;

        left[n] = outL;
        right[n] = outR;

        peakOut = std::max (peakOut, std::max (std::abs (outL), std::abs (outR)));
        maxReduction = std::max (maxReduction, 1.0f - smoothedGain);

        ++sampleCounter;
    }

    inLin.store (peakIn, std::memory_order_relaxed);
    outLin.store (peakOut, std::memory_order_relaxed);
    inDb.store (gainToDb (peakIn), std::memory_order_relaxed);
    outDb.store (gainToDb (peakOut), std::memory_order_relaxed);
    tpDb.store (gainToDb (peakTrue), std::memory_order_relaxed);
    grDb.store (gainToDb (1.0f - maxReduction), std::memory_order_relaxed);
}

double LimiterXCore::benchmarkNsPerSample (double sampleRate, int frames, const LimiterXParams& params)
{
    LimiterXCore core;
    core.prepare (sampleRate, 512);
    core.setParams (params);

    std::vector<float> l (512), r (512);
    for (int i = 0; i < 512; ++i)
    {
        const float t = static_cast<float> (i) / 512.0f;
        l[static_cast<std::size_t> (i)] = 1.4f * std::sin (t * 37.0f);
        r[static_cast<std::size_t> (i)] = 1.4f * std::sin (t * 41.0f);
    }

    const auto start = std::chrono::steady_clock::now();
    int done = 0;
    while (done < frames)
    {
        core.process (l.data(), r.data(), 512);
        done += 512;
    }
    const auto elapsed = std::chrono::steady_clock::now() - start;
    const double ns = std::chrono::duration<double, std::nano> (elapsed).count();
    return ns / std::max (1, done);
}

} // namespace tmss
