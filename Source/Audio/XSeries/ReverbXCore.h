#pragma once

#include "XCommon.h"
#include <atomic>
#include <cstddef>
#include <vector>

namespace tmss
{

/** Reverb X 2.0 — early-reflection taps + Schroeder/Moorer late reverb.

    Comb delay times are stored in seconds and resampled at prepare(); slow
    ±0.6 % modulation breaks up metallic coloration. Parameter semantics match
    docs/x-series-2.0.md section 2.2.
*/
enum class ReverbXVenue : int
{
    SmallRoom = 0,
    Studio,
    Chamber,
    Hall,
    ConcertHall,
    Cathedral,
    LargeStage,
    Outdoor
};

struct ReverbXParams
{
    float amount = 0.35f;           // reverb.mix / amount          0 … 1
    float reverbLevel = 0.65f;      // reverb.level                 0 … 1.5
    float decay = 2.2f;             // reverb.decay                 0.15 … 12 s
    float size = 0.62f;             // reverb.size                  0 … 1
    float width = 1.0f;             // reverb.width                 0 … 2
    float preDelayMs = 20.0f;       // reverb.preDelay              0 … 250 ms
    float dampingHz = 6200.0f;      // reverb.damping               500 … 20000 Hz
    ReverbXVenue venue = ReverbXVenue::ConcertHall;
    bool wetProcess = false;        // wet-only FX chain (no extra latency)
};

class ReverbXCore
{
public:
    static constexpr float amountMin = 0.0f;
    static constexpr float amountMax = 1.0f;
    static constexpr float levelMin = 0.0f;
    static constexpr float levelMax = 1.5f;
    static constexpr float decayMin = 0.15f;
    static constexpr float decayMax = 12.0f;
    static constexpr float sizeMin = 0.0f;
    static constexpr float sizeMax = 1.0f;
    static constexpr float widthMin = 0.0f;
    static constexpr float widthMax = 2.0f;
    static constexpr float preDelayMaxMs = 250.0f;
    static constexpr float dampingMinHz = 500.0f;
    static constexpr float dampingMaxHz = 20000.0f;

    void prepare (double sampleRate, int maxBlockSize);
    void reset() noexcept;
    void setParams (const ReverbXParams& next) noexcept;
    void process (float* left, float* right, int numSamples) noexcept;

    /** Pre-delay is part of the wet path, not plugin latency. */
    int getLatencySamples() const noexcept { return 0; }

    float getWetPeak() const noexcept { return wetPeak.load (std::memory_order_relaxed); }

private:
    struct EarlyTap
    {
        float dL = 0.0f;
        float dR = 0.0f;
        float gL = 0.0f;
        float gR = 0.0f;
    };

    void compileNetwork() noexcept;
    void clearDelays() noexcept;
    void updateModulation (int numSamples) noexcept;
    float dampCoeff (float hz) const noexcept;

    double sampleRate = 48000.0;
    int maxBlock = 512;

    ReverbXParams params {};
    ReverbXVenue venueUsed = ReverbXVenue::ConcertHall;
    bool venueInitialized = false;

    xs::DelayLine preL, preR;
    xs::DelayLine erL, erR;
    xs::DelayLine combL[6];
    xs::DelayLine combR[6];
    xs::DelayLine apL[3];
    xs::DelayLine apR[3];

    std::vector<EarlyTap> taps;
    int tapCount = 0;

    float combDL[6] {};
    float combDR[6] {};
    float combMDL[6] {};
    float combMDR[6] {};
    float modPhase[6] {};
    float modInc[6] {};
    float fb[6] {};
    float dampZL[6] {};
    float dampZR[6] {};
    float apDL[3] {};
    float apDR[3] {};

    float apG = 0.5f;
    float earlyLevel = 0.4f;
    float lateLevel = 0.8f;
    float combNorm = 1.0f / 6.0f;

    xs::SmoothedParam amount, reverbLevel, width, preDelay, dampHz;
    float sizeZ = 0.62f;
    float decayZ = 2.2f;
    float sizeT = 0.62f;
    float decayT = 2.2f;
    float dampA = 0.0f;

    float dcXL = 0.0f, dcXR = 0.0f, dcYL = 0.0f, dcYR = 0.0f;
    int muteSamples = 0;

    std::vector<float> scratchL;
    std::vector<float> scratchR;

    std::atomic<float> wetPeak { 0.0f };
};

} // namespace tmss
