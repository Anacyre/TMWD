#pragma once

#include "XCommon.h"
#include <atomic>
#include <cstddef>
#include <vector>

namespace tmss
{

/** Boost X 2.0 — OTT / expander / chorus / drive with 8 ms mode crossfade,
    LR4 OTT crossovers at 150 / 3500 Hz, polyphase oversampling around
    nonlinear stages, and HPF that keeps lows out of the shaper then sums them
    back. Parameter semantics match docs/x-series-2.0.md section 2.4.
*/
enum class BoostXMode : int
{
    Ott = 0,
    Expander,
    Chorus,
    Drive
};

enum class BoostXCharacter : int
{
    Clean = 0,
    Subtle,
    Air,
    Bright,
    Punch,
    Aggressive,
    Soft,
    Wide,
    Crunch
};

struct BoostXParams
{
    BoostXMode mode = BoostXMode::Ott;
    float amount = 0.35f;           // boost.amount          0 … 1
    float mix = 1.0f;               // boost.mix             0 … 1
    int oversampling = 2;           // boost.oversampling    1, 2 or 4
    float hpfHz = 50.0f;            // boost.hpfHz           0 … 400 Hz
    float outputGainDb = 0.0f;      // boost.outputGain      -12 … 12 dB
    BoostXCharacter character = BoostXCharacter::Clean;
};

class BoostXCore
{
public:
    void prepare (double sampleRate, int maxBlockSize);
    void reset() noexcept;
    void setParams (const BoostXParams& next) noexcept;
    void process (float* left, float* right, int numSamples) noexcept;

    int getLatencySamples() const noexcept;

    float getActivity() const noexcept { return activity.load (std::memory_order_relaxed); }
    float getWidth() const noexcept { return widthMeter.load (std::memory_order_relaxed); }
    float getGrAmount() const noexcept { return grAmount.load (std::memory_order_relaxed); }

private:
    struct OttBand
    {
        float env = 0.0f;
        float det = 0.0f;
        float gainZ = 1.0f;
        float gr = 0.0f;
        float atk = 0.0f;
        float atkUse = 0.0f;
        float rel = 0.0f;
        float downThresh = -8.0f;
        float upThresh = -24.0f;
        float ratioDown = 4.0f;
        float ratioUp = 3.0f;
        float maxUp = 8.0f;
    };

    struct OttState
    {
        xs::LinkwitzRiley4 xo1, xo2;
        OttBand bands[3];
        float ceilZ = 1.0f;
    };

    BoostXMode normalizeMode (BoostXMode m) const noexcept;
    void prepareMode (BoostXMode mode) noexcept;
    void processMode (BoostXMode mode, float* left, float* right, int numSamples) noexcept;
    void processOtt (float* l, float* r, int n, float intensity) noexcept;
    void processExpander (float* l, float* r, int n, float intensity) noexcept;
    void processChorus (float* l, float* r, int n, float intensity) noexcept;
    void processDrive (float* l, float* r, int n, float intensity) noexcept;
    void applyHpfSum (float* l, float* r, int n) noexcept;
    void finishBlock (float* l, float* r, int n) noexcept;

    static float tanhApprox (float x) noexcept;
    static float dcBlock (float x, float& dcX, float& dcY) noexcept;
    void ottFollow (OttBand& band, float xL, float xR) noexcept;
    void applyOttBand (OttBand& band, float xL, float xR, float intensity, float upScale) noexcept;
    static float ottUpScale (const OttBand& band, float maxEnv) noexcept;

    double sampleRate = 48000.0;
    int maxBlock = 512;

    BoostXParams params {};
    xs::SmoothedParam amount, mix, outputGain, hpf;
    xs::Oversampler oversampler;

    BoostXMode modeA = BoostXMode::Ott;
    BoostXMode modeB = BoostXMode::Ott;
    float xfade = 1.0f;
    float xfadeInc = 1.0f;

    OttState ottL {}, ottR {};
    float gainSmooth = 0.0f;
    float ottCeilRel = 0.0f;

    xs::FirstOrderFilter hpfL, hpfR;
    std::vector<float> lowBufL, lowBufR;

    float sideZ1 = 0.0f, sideZ2 = 0.0f;
    float wLowZ = 1.0f, wHighZ = 1.0f;
    xs::FirstOrderFilter splitFilter;
    float splitA = 0.0f;

    xs::DelayLine chorusDL, chorusDR;
    float lfoPhase = 0.0f;

    float dcXL = 0.0f, dcYL = 0.0f, dcXR = 0.0f, dcYR = 0.0f;

    std::vector<float> inL, inR, aL, aR;

    float grMeter = 0.0f;
    float widthZ = 0.0f;
    float activityZ = 0.0f;
    float corrZ = 1.0f;

    std::atomic<float> activity { 0.0f };
    std::atomic<float> widthMeter { 0.0f };
    std::atomic<float> grAmount { 0.0f };
};

} // namespace tmss
