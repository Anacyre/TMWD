#pragma once

/*  EqualizerXCore — TMSS Equalizer X 2.0 native DSP core.

    Seven serial nodes, RBJ biquads in transposed direct form II, stacked
    Butterworth cut sections (plus a first-order section for odd orders), optional
    1x/2x/4x oversampling of the whole cascade, RMS auto-gain and a magnitude query
    for the editor curve.

    Parameter names, ranges and defaults follow docs/x-series-2.0.md section 2.1.
    No JUCE dependency: plain float* interfaces, usable outside an AudioProcessor.
*/

#include "XCommon.h"
#include <atomic>

static constexpr int equalizerXNumNodes = 7;
static constexpr int equalizerXMaxBiquads = 4;      // 48 dB/oct == 8th order

enum class EqShape : int
{
    lowCut = 0,
    lowShelf,
    bell,
    notch,
    highShelf,
    highCut,
    bandPass
};

struct EqualizerNodeParams
{
    float freq = 1000.0f;               // eq.node{i}.frequency   20 … 20000 Hz (log)
    float gain = 0.0f;                  // eq.node{i}.gain        -18 … 18 dB
    float q = 0.9f;                     // eq.node{i}.q           0.2 … 12 (log)
    int slope = 12;                     // eq.node{i}.slope       6,12,18,24,30,36,48 dB/oct
    EqShape shape = EqShape::bell;      // eq.node{i}.shape
    bool enabled = true;                // eq.node{i}.enabled
    bool solo = false;                  // eq.node{i}.solo
};

struct EqualizerXParams
{
    EqualizerNodeParams nodes[equalizerXNumNodes];
    float outputGainDb = 0.0f;          // eq.outputGain   -24 … 24 dB
    bool autoGain = false;              // eq.autoGain     RMS match, +/-12 dB clamp
    int oversampling = 1;               // eq.oversampling 1, 2 or 4
};

class EqualizerXCore
{
public:
    static constexpr int numNodes = equalizerXNumNodes;
    static constexpr int maxBiquads = equalizerXMaxBiquads;
    static constexpr float freqMin = 20.0f;
    static constexpr float freqMax = 20000.0f;
    static constexpr float nodeGainMin = -18.0f;
    static constexpr float nodeGainMax = 18.0f;
    static constexpr float qMin = 0.2f;
    static constexpr float qMax = 12.0f;
    static constexpr float outputGainMinDb = -24.0f;
    static constexpr float outputGainMaxDb = 24.0f;
    static constexpr float autoGainClampDb = 12.0f;
    static constexpr float paramSmoothSec = 0.020f;     // freq / gain / Q
    static constexpr float shapeFadeSec = 0.010f;       // shape or slope change
    static constexpr float outputSmoothSec = 0.012f;
    static constexpr float rmsWindowSec = 0.080f;

    EqualizerXCore() = default;

    void prepare (double sampleRate, int maxBlockSize);
    void reset() noexcept;
    void setParams (const EqualizerXParams& p) noexcept;
    void process (float* left, float* right, int numSamples) noexcept;

    int getLatencySamples() const noexcept { return oversampler.getLatencySamples(); }

    /** Exact cascade magnitude in dB at freqHz, including outputGainDb but not
        auto-gain. Enabled nodes only; solo is ignored. Evaluated at the active
        (oversampled) design rate, so it tracks the oversampling setting.
        Allocation-free and lock-free, but does trig per node — call it from the UI. */
    float magnitudeDb (float freqHz) const noexcept;

    float getInputRmsDb() const noexcept { return inputRmsDb.load (std::memory_order_relaxed); }
    float getOutputRmsDb() const noexcept { return outputRmsDb.load (std::memory_order_relaxed); }
    float getOutputPeakDb() const noexcept { return outputPeakDb.load (std::memory_order_relaxed); }
    float getAutoGainDb() const noexcept { return autoGainDb.load (std::memory_order_relaxed); }

    /** Butterworth section count for a slope in dB/oct (1 == 6 dB/oct). */
    static int cutOrderForSlope (int slopeDbPerOct) noexcept;

    /** Q of the k-th biquad of an nth-order Butterworth cascade. */
    static double butterworthSectionQ (int order, int sectionIndex) noexcept;

private:
    static constexpr int chunkSize = 256;

    struct Recipe
    {
        xs::Biquad bq[maxBiquads];
        xs::FirstOrderFilter fo;
        int numBiquads = 0;
        bool hasFirstOrder = false;
    };

    struct Chain
    {
        xs::Biquad bq[maxBiquads][2];
        xs::FirstOrderFilter fo[2];
        int numBiquads = 0;
        bool hasFirstOrder = false;

        void reset() noexcept;
        void flush() noexcept;
        void applyRecipe (const Recipe& r) noexcept;
        void processStereo (float& l, float& r) noexcept;
    };

    struct Node
    {
        Chain chain[2];
        xs::SmoothedParam freq, gain, q;
        int active = 0;
        float fade = 1.0f;              // topology crossfade, 0 = old chain, 1 = new chain
        bool fading = false;
        float level = 1.0f;             // bypass / solo ramp
        float levelTarget = 1.0f;
        bool enabled = true;
        bool solo = false;
        bool designed = false;
        bool cleared = false;
        EqShape shape = EqShape::bell;
        EqShape targetShape = EqShape::bell;
        int slope = 12;
        int targetSlope = 12;
    };

    static void designRecipe (EqShape shape, double freq, double gainDb, double q,
                              int slope, double sampleRate, Recipe& out) noexcept;
    static double recipeMagnitudeSquared (const Recipe& r, double omega) noexcept;
    static void processNode (Node& nd, float& l, float& r,
                             float fadeInc, float levelInc) noexcept;

    void updateRate() noexcept;
    void updateCoefficients (int numSamples) noexcept;
    void runCascade (float* left, float* right, int numSamples) noexcept;
    void processChunk (float* left, float* right, int numSamples) noexcept;

    double sampleRate = 48000.0;
    double activeRate = 48000.0;
    int maxBlock = 512;
    int factor = 1;
    float topoFadeInc = 1.0f;
    float levelInc = 1.0f;

    Node nodes[numNodes];

    xs::SmoothedParam outputGain;        // linear
    float outputGainDbTarget = 0.0f;
    xs::Oversampler oversampler;
    Recipe scratch;

    float inputMeanSquare = 1.0e-12f;
    float outputMeanSquare = 1.0e-12f;
    float autoGainDbZ = 0.0f;
    bool autoGainOn = false;
    xs::PeakHold outputPeak;

    std::atomic<float> inputRmsDb { -120.0f };
    std::atomic<float> outputRmsDb { -120.0f };
    std::atomic<float> outputPeakDb { -120.0f };
    std::atomic<float> autoGainDb { 0.0f };
};
