#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <vector>

namespace tmss
{

/** Limiter X 2.0 — stereo-linked brickwall peak limiter.

    Signal flow: input gain -> true-peak detector (optionally oversampled) -> sliding-minimum
    gain over the lookahead window -> release smoothing -> delayed audio * gain -> ceiling clip.

    The detector runs on the undelayed signal while the audio is delayed by the lookahead
    amount, so the gain has already finished ramping down by the time a transient arrives.
    Parameter semantics match docs/x-series-2.0.md section 2.5.
*/
struct LimiterXParams
{
    float gainDb = 0.0f;          // -12 .. 18
    float ceilingDb = -0.1f;      // -3 .. 0
    float releaseMs = 100.0f;     // 10 .. 1000
    float lookaheadMs = 1.5f;     // 0 .. 5
    int   oversampling = 4;       // 1, 2 or 4
    bool  truePeak = true;
};

/** Detection-only polyphase upsampler. Produces `factor` sub-samples per input sample without
    reconstructing a full oversampled signal, which is all a true-peak detector needs. */
class PeakUpsampler
{
public:
    static constexpr int maxFactor = 4;
    static constexpr int tapsPerPhase = 16;

    void prepare (int factor);
    void reset() noexcept;

    /** Returns the largest absolute sub-sample value around `x`. Real-time safe. */
    float process (float x) noexcept;

    int getFactor() const noexcept { return factor; }

private:
    int factor = 1;
    int writeIndex = 0;
    std::array<float, tapsPerPhase * 2> history {};
    std::array<std::array<float, tapsPerPhase>, maxFactor> phases {};
};

class LimiterXCore
{
public:
    static constexpr float gainMinDb = -12.0f;
    static constexpr float gainMaxDb = 18.0f;
    static constexpr float ceilingMinDb = -3.0f;
    static constexpr float ceilingMaxDb = 0.0f;
    static constexpr float releaseMinMs = 10.0f;
    static constexpr float releaseMaxMs = 1000.0f;
    static constexpr float lookaheadMaxMs = 5.0f;

    void prepare (double sampleRate, int maxBlockSize);
    void reset() noexcept;

    /** Real-time safe once prepared: no allocation, no locks, no I/O.
        Changing `oversampling` or `lookaheadMs` only rewrites pre-allocated state. */
    void setParams (const LimiterXParams& next) noexcept;

    /** Real-time safe. `right` may alias `left` for mono operation. */
    void process (float* left, float* right, int numSamples) noexcept;

    int getLatencySamples() const noexcept { return lookaheadSamples; }

    float getGainReductionDb() const noexcept { return grDb.load (std::memory_order_relaxed); }
    float getInputPeakDb() const noexcept { return inDb.load (std::memory_order_relaxed); }
    float getOutputPeakDb() const noexcept { return outDb.load (std::memory_order_relaxed); }
    float getTruePeakDb() const noexcept { return tpDb.load (std::memory_order_relaxed); }
    float getInputPeak() const noexcept { return inLin.load (std::memory_order_relaxed); }
    float getOutputPeak() const noexcept { return outLin.load (std::memory_order_relaxed); }

    static float dbToGain (float db) noexcept;
    static float gainToDb (float gain) noexcept;
    static double benchmarkNsPerSample (double sampleRate, int frames, const LimiterXParams& params);

private:
    void setLookahead (int samples) noexcept;
    float slidingMinimum (float requiredGain) noexcept;

    double sampleRate = 48000.0;
    int maxBlock = 512;

    LimiterXParams params {};
    float inputGain = 1.0f;
    float inputGainTarget = 1.0f;
    float ceilingLin = 0.98855f;
    float releaseCoeff = 0.0f;
    float attackCoeff = 1.0f;
    float gainSmoothCoeff = 1.0f;

    // Audio delay matching the lookahead.
    std::vector<float> delayL, delayR;
    int delayMask = 0;
    int delayWrite = 0;
    int lookaheadSamples = 0;

    // Monotonic deque holding the sliding minimum of the required gain over the lookahead
    // window. `minValues`/`minAges` are a ring; both are sized at prepare().
    std::vector<float> minValues;
    std::vector<long long> minAges;
    int minHead = 0, minTail = 0, minCount = 0;
    long long sampleCounter = 0;

    float envGain = 1.0f;
    float smoothedGain = 1.0f;

    PeakUpsampler upL, upR;

    std::atomic<float> grDb { 0.0f };
    std::atomic<float> inDb { -120.0f };
    std::atomic<float> outDb { -120.0f };
    std::atomic<float> tpDb { -120.0f };
    std::atomic<float> inLin { 0.0f };
    std::atomic<float> outLin { 0.0f };
};

} // namespace tmss
