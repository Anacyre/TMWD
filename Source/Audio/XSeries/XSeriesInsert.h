#pragma once

#include <atomic>
#include <memory>

#include "BoostXCore.h"
#include "DynamicXCore.h"
#include "EqualizerXCore.h"
#include "LimiterXCore.h"
#include "ReverbXCore.h"

// Equalizer X sits at global scope; the other four cores live in `tmss`.
using DynamicXCore = tmss::DynamicXCore;
using DynamicXParams = tmss::DynamicXParams;
using DynamicXDetector = tmss::DynamicXDetector;
using BoostXCore = tmss::BoostXCore;
using BoostXParams = tmss::BoostXParams;
using BoostXMode = tmss::BoostXMode;
using BoostXCharacter = tmss::BoostXCharacter;
using LimiterXCore = tmss::LimiterXCore;
using LimiterXParams = tmss::LimiterXParams;
using ReverbXCore = tmss::ReverbXCore;
using ReverbXParams = tmss::ReverbXParams;
using ReverbXVenue = tmss::ReverbXVenue;

/*  One native X-series insert slot.

    Cores are allocated and prepared on the message thread, then published
    through an atomic pointer that is never cleared again, so the audio thread
    can pick one up without a lock and can never observe a half-built core.

    Parameters travel as a flat array of atomic floats. Reading ~40 relaxed
    atomics per block is far cheaper than the audio thread ever needs to care
    about, and it removes the tearing hazard that swapping a parameter struct
    would introduce.
*/
class XSeriesInsert
{
public:
    enum class Kind : int
    {
        none = 0,
        equalizer = 1,
        reverb = 2,
        boost = 3,
        dynamics = 4,
        limiter = 5
    };

    static constexpr int maxValues = 64;
    static constexpr float unset = -1.0e30f;

    /** Flat parameter indices. The browser mixer writes these by name; keeping
        them here means both sides agree on one layout. */
    struct Eq
    {
        static constexpr int perNode = 6;   // freq, gainDb, q, slope, shape, enabled
        static constexpr int nodeBase = 0;
        static constexpr int outputGainDb = 42;
        static constexpr int autoGain = 43;
        static constexpr int oversampling = 44;
    };

    struct Dyn
    {
        static constexpr int threshold = 0;
        static constexpr int ratio = 1;
        static constexpr int kneeDb = 2;
        static constexpr int attackSec = 3;
        static constexpr int releaseSec = 4;
        static constexpr int lookaheadMs = 5;
        static constexpr int detector = 6;
        static constexpr int rmsMs = 7;
        static constexpr int mix = 8;
        static constexpr int makeupDb = 9;
        static constexpr int autoGain = 10;
        static constexpr int autoRelease = 11;
        static constexpr int splitBands = 12;
        static constexpr int xo1 = 13;
        static constexpr int xo2 = 14;
        static constexpr int bandBase = 15;  // 3 bands x (enabled, solo, threshold, ratio, makeupDb)
        static constexpr int perBand = 5;
    };

    struct Boost
    {
        static constexpr int mode = 0;
        static constexpr int amount = 1;
        static constexpr int mix = 2;
        static constexpr int oversampling = 3;
        static constexpr int hpfHz = 4;
        static constexpr int outputGainDb = 5;
        static constexpr int character = 6;
    };

    struct Lim
    {
        static constexpr int gainDb = 0;
        static constexpr int ceilingDb = 1;
        static constexpr int releaseMs = 2;
        static constexpr int lookaheadMs = 3;
        static constexpr int oversampling = 4;
        static constexpr int truePeak = 5;
    };

    struct Rev
    {
        static constexpr int amount = 0;
        static constexpr int level = 1;
        static constexpr int decay = 2;
        static constexpr int size = 3;
        static constexpr int width = 4;
        static constexpr int preDelayMs = 5;
        static constexpr int dampingHz = 6;
        static constexpr int venue = 7;
        static constexpr int wetProcess = 8;
    };

    XSeriesInsert() { clearValues(); }

    //==============================================================================
    // Message thread
    void prepare (double sampleRate, int maxBlockSize);
    void setKind (Kind kind);
    void clearValues();
    void setValue (int index, float value);

    Kind getKind() const noexcept { return (Kind) kindIndex.load (std::memory_order_relaxed); }
    bool isActive() const noexcept { return getKind() != Kind::none; }

    //==============================================================================
    // Audio thread
    void process (float* left, float* right, int numSamples) noexcept;
    void reset() noexcept;

    /** Gain reduction of the last processed block, or 0 for kinds without one. */
    float getGainReductionDb() const noexcept;

private:
    float value (int index, float fallback) const noexcept;
    bool flag (int index, bool fallback) const noexcept;

    void applyEqualizer (float* left, float* right, int numSamples) noexcept;
    void applyDynamics (float* left, float* right, int numSamples) noexcept;
    void applyBoost (float* left, float* right, int numSamples) noexcept;
    void applyLimiter (float* left, float* right, int numSamples) noexcept;
    void applyReverb (float* left, float* right, int numSamples) noexcept;

    std::atomic<int> kindIndex { 0 };
    std::atomic<float> values[maxValues];
    std::atomic<bool> prepared { false };

    double sampleRate = 48000.0;
    int maxBlock = 512;

    std::unique_ptr<EqualizerXCore> eqOwned;
    std::unique_ptr<DynamicXCore> dynOwned;
    std::unique_ptr<BoostXCore> boostOwned;
    std::unique_ptr<LimiterXCore> limiterOwned;
    std::unique_ptr<ReverbXCore> reverbOwned;

    std::atomic<EqualizerXCore*> eq { nullptr };
    std::atomic<DynamicXCore*> dyn { nullptr };
    std::atomic<BoostXCore*> boost { nullptr };
    std::atomic<LimiterXCore*> limiter { nullptr };
    std::atomic<ReverbXCore*> reverb { nullptr };
};
