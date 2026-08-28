#pragma once

#include <JuceHeader.h>
#include <atomic>
#include <cmath>

/** Limiter X — stereo-linked peak limiter. Parameter semantics match the Web DSP.
    Threshold is internal (−0.1 dBFS). User parameters: gainDb, releaseMs.

    Peak-detect fallback (deterministic, not a user control):
      X4 cubic interpolation (default) → X2 → sample-peak.
    X-series insert audio for the remote mix runs in the browser AudioWorklet.
    This core is the native algorithm + local/offline processing.
*/
class LimiterXProcessor
{
public:
    enum class PeakMode : int
    {
        sample = 0,
        x2 = 1,
        x4 = 2
    };

    static constexpr float thresholdDb = -0.1f;
    static constexpr float gainMinDb = -12.0f;
    static constexpr float gainMaxDb = 18.0f;
    static constexpr float gainDefaultDb = 0.0f;
    static constexpr float releaseMinMs = 10.0f;
    static constexpr float releaseMaxMs = 1000.0f;
    static constexpr float releaseDefaultMs = 100.0f;
    static constexpr float gainSmoothSec = 0.008f;
    static constexpr float eps = 1.0e-12f;

    LimiterXProcessor() = default;

    void prepare (double sampleRate) noexcept;
    void reset() noexcept;
    void setPeakMode (PeakMode mode) noexcept { peakMode = mode; }

    /** Real-time safe. No allocation, no locks, no logging. */
    void process (float* left, float* right, int numSamples,
                  float gainDb, float releaseMs) noexcept;

    float getGainReductionDb() const noexcept { return gainReductionDb.load (std::memory_order_relaxed); }
    float getInputPeakDb() const noexcept { return inputPeakDb.load (std::memory_order_relaxed); }
    float getOutputPeakDb() const noexcept { return outputPeakDb.load (std::memory_order_relaxed); }
    float getInputPeak() const noexcept { return inputPeakLin.load (std::memory_order_relaxed); }
    float getOutputPeak() const noexcept { return outputPeakLin.load (std::memory_order_relaxed); }

    static float dbToLin (float db) noexcept;
    static float linToDb (float lin) noexcept;
    static float ceilingLin() noexcept { return dbToLin (thresholdDb); }
    static float targetGainReductionDb (float peakDb) noexcept;
    static float releaseCoeff (float releaseMs, double sampleRate) noexcept;
    static double benchmarkNsPerSample (int sampleRate, int frames, PeakMode mode = PeakMode::x4);

private:
    static float hermite (float x0, float x1, float x2, float x3, float t) noexcept;
    static float flush (float x) noexcept;
    float detectPeak (float xL, float xR) const noexcept;

    double sampleRate = 48000.0;
    PeakMode peakMode { PeakMode::x4 };
    float ceiling = 0.9885530947f;
    float gainDbZ = 0.0f;
    float gainLin = 1.0f;
    float releaseMsZ = 100.0f;
    float alpha = 0.0f;
    float gainSmooth = 0.0f;
    float env = 1.0f;
    float prev2L = 0.0f, prev1L = 0.0f;
    float prev2R = 0.0f, prev1R = 0.0f;
    float peakInZ = 0.0f;
    float peakOutZ = 0.0f;

    std::atomic<float> gainReductionDb { 0.0f };
    std::atomic<float> inputPeakDb { -120.0f };
    std::atomic<float> outputPeakDb { -120.0f };
    std::atomic<float> inputPeakLin { 0.0f };
    std::atomic<float> outputPeakLin { 0.0f };
};
