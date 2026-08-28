#include "LimiterX.h"
#include <vector>

namespace
{
    inline float finiteOrZero (float x) noexcept
    {
        return std::isfinite (x) ? x : 0.0f;
    }
}

float LimiterXProcessor::dbToLin (float db) noexcept
{
    db = juce::jlimit (-120.0f, 60.0f, db);
    return std::pow (10.0f, db / 20.0f);
}

float LimiterXProcessor::linToDb (float lin) noexcept
{
    return 20.0f * std::log10 (juce::jmax (eps, lin));
}

float LimiterXProcessor::targetGainReductionDb (float peakDb) noexcept
{
    if (! (peakDb > thresholdDb))
        return 0.0f;

    return thresholdDb - peakDb;
}

float LimiterXProcessor::releaseCoeff (float releaseMs, double sampleRate) noexcept
{
    const auto seconds = (double) juce::jmax (releaseMinMs, releaseMs) / 1000.0;
    const auto sr = sampleRate > 1.0 ? sampleRate : 48000.0;
    return (float) std::exp (-1.0 / (seconds * sr));
}

float LimiterXProcessor::hermite (float x0, float x1, float x2, float x3, float t) noexcept
{
    const auto c1 = 0.5f * (x2 - x0);
    const auto c2 = x0 - 2.5f * x1 + 2.0f * x2 - 0.5f * x3;
    const auto c3 = 0.5f * (x3 - x0) + 1.5f * (x1 - x2);
    return ((c3 * t + c2) * t + c1) * t + x1;
}

float LimiterXProcessor::flush (float x) noexcept
{
    return (x > -1.0e-18f && x < 1.0e-18f) ? 0.0f : x;
}

void LimiterXProcessor::prepare (double newSampleRate) noexcept
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 48000.0;
    ceiling = dbToLin (thresholdDb);
    gainSmooth = (float) (1.0 - std::exp (-1.0 / (gainSmoothSec * sampleRate)));
    alpha = releaseCoeff (releaseMsZ, sampleRate);
    reset();
}

void LimiterXProcessor::reset() noexcept
{
    env = 1.0f;
    gainLin = dbToLin (gainDbZ);
    prev2L = prev1L = prev2R = prev1R = 0.0f;
    peakInZ = peakOutZ = 0.0f;
    gainReductionDb.store (0.0f, std::memory_order_relaxed);
    inputPeakDb.store (-120.0f, std::memory_order_relaxed);
    outputPeakDb.store (-120.0f, std::memory_order_relaxed);
    inputPeakLin.store (0.0f, std::memory_order_relaxed);
    outputPeakLin.store (0.0f, std::memory_order_relaxed);
}

float LimiterXProcessor::detectPeak (float xL, float xR) const noexcept
{
    auto peak = juce::jmax (std::abs (xL), std::abs (xR));
    const auto mode = (int) peakMode;

    if (mode < 1)
        return peak;

    const int steps = mode >= 2 ? 3 : 1;
    const auto dt = 1.0f / (float) (steps + 1);

    for (int k = 1; k <= steps; ++k)
    {
        const auto t = dt * (float) k;
        const auto iL = hermite (prev2L, prev1L, xL, xL, t);
        const auto iR = hermite (prev2R, prev1R, xR, xR, t);
        peak = juce::jmax (peak, std::abs (iL), std::abs (iR));
    }

    return peak;
}

void LimiterXProcessor::process (float* left, float* right, int numSamples,
                                 float gainDb, float releaseMs) noexcept
{
    if (left == nullptr || numSamples < 1)
        return;

    const bool dual = right != nullptr && right != left;
    const auto n = numSamples;
    const auto sr = sampleRate > 0.0 ? sampleRate : 48000.0;
    const auto aBlk = (float) (1.0 - std::exp (-(double) n / (gainSmoothSec * sr)));
    const auto gainT = juce::jlimit (gainMinDb, gainMaxDb, gainDb);
    const auto relT = juce::jlimit (releaseMinMs, releaseMaxMs, releaseMs);

    gainDbZ += (gainT - gainDbZ) * aBlk;
    releaseMsZ += (relT - releaseMsZ) * aBlk;
    const auto targetLin = dbToLin (gainDbZ);
    alpha = releaseCoeff (releaseMsZ, sr);

    const auto ceil = ceiling;
    const auto aG = gainSmooth;
    const auto relA = alpha;
    const auto oneMinus = 1.0f - relA;
    auto gIn = gainLin;
    auto e = env;
    float peakIn = 0.0f;
    float peakOut = 0.0f;
    auto minEnv = 1.0f;

    for (int i = 0; i < n; ++i)
    {
        gIn += (targetLin - gIn) * aG;
        auto xL = finiteOrZero (left[i] * gIn);
        auto xR = dual ? finiteOrZero (right[i] * gIn) : xL;
        const auto peak = detectPeak (xL, xR);
        peakIn = juce::jmax (peakIn, peak);

        auto target = 1.0f;
        if (peak > ceil)
            target = ceil / peak;

        if (target < e)
            e = target;
        else
            e = relA * e + oneMinus * target;

        e = flush (e);
        e = juce::jlimit (1.0e-6f, 1.0f, e);
        minEnv = juce::jmin (minEnv, e);

        auto yL = xL * e;
        auto yR = xR * e;
        auto outP = juce::jmax (std::abs (yL), std::abs (yR));

        if (outP > ceil)
        {
            const auto s = ceil / outP;
            yL *= s;
            yR *= s;
            e *= s;
            outP = ceil;
        }

        yL = flush (finiteOrZero (yL));
        yR = flush (finiteOrZero (yR));
        left[i] = yL;

        if (dual)
            right[i] = yR;

        peakOut = juce::jmax (peakOut, outP);
        prev2L = prev1L;
        prev1L = xL;
        prev2R = prev1R;
        prev1R = xR;
    }

    env = e;
    gainLin = gIn;
    const auto decay = (float) std::exp (-(double) n / (0.14 * sr));
    peakInZ = juce::jmax (peakInZ * decay, peakIn);
    peakOutZ = juce::jmax (peakOutZ * decay, peakOut);
    const auto grDb = minEnv >= 1.0f ? 0.0f : linToDb (minEnv);
    gainReductionDb.store (grDb, std::memory_order_relaxed);
    inputPeakLin.store (peakInZ, std::memory_order_relaxed);
    outputPeakLin.store (peakOutZ, std::memory_order_relaxed);
    inputPeakDb.store (linToDb (peakInZ), std::memory_order_relaxed);
    outputPeakDb.store (linToDb (peakOutZ), std::memory_order_relaxed);
}

double LimiterXProcessor::benchmarkNsPerSample (int sampleRate, int frames, PeakMode mode)
{
    const int n = juce::jmax (64, frames);
    const int sr = juce::jmax (8000, sampleRate);
    std::vector<float> left ((size_t) n);
    std::vector<float> right ((size_t) n);
    const auto w = juce::MathConstants<float>::twoPi * 1000.0f / (float) sr;
    const auto amp = dbToLin (6.0f);

    for (int i = 0; i < n; ++i)
    {
        const auto s = amp * std::sin (w * (float) i);
        left[(size_t) i] = s;
        right[(size_t) i] = s * 0.7f;
    }

    LimiterXProcessor proc;
    proc.prepare ((double) sr);
    proc.setPeakMode (mode);

    const auto t0 = juce::Time::getMillisecondCounterHiRes();
    proc.process (left.data(), right.data(), n, 6.0f, 100.0f);
    const auto t1 = juce::Time::getMillisecondCounterHiRes();
    return ((t1 - t0) * 1.0e6) / (double) n;
}
