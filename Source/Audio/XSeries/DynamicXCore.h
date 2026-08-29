#pragma once

#include "XCommon.h"
#include <atomic>
#include <cstddef>
#include <vector>

namespace tmss
{

/** Dynamic X 2.0 — per-sample peak / sliding-RMS detector, soft knee, optional
    lookahead, parallel mix, and LR4 3-band split with per-band gain computers.

    Parameter semantics match docs/x-series-2.0.md section 2.3.
*/
enum class DynamicXDetector : int
{
    Peak = 0,
    Rms = 1
};

struct DynamicXBandParams
{
    bool enabled = true;
    bool solo = false;
    float threshold = -18.0f;       // -48 … 0 dB
    float ratio = 4.0f;             // 1 … 20
    float makeupDb = 0.0f;          // -12 … 24 dB
};

struct DynamicXParams
{
    float threshold = -18.0f;       // dynamic.threshold   -48 … 0 dB
    float ratio = 4.0f;             // dynamic.ratio       1 … 20
    float kneeDb = 6.0f;            // dynamic.knee        0 … 24 dB
    float attack = 0.012f;          // dynamic.attack      0.0002 … 0.2 s
    float release = 0.12f;          // dynamic.release     0.02 … 1.5 s
    float lookaheadMs = 0.0f;       // dynamic.lookahead   0 … 10 ms
    DynamicXDetector detector = DynamicXDetector::Peak;
    float rmsMs = 10.0f;            // dynamic.rmsMs       1 … 100 ms
    float mix = 1.0f;               // dynamic.mix         0 … 1
    float makeupDb = 0.0f;          // dynamic.makeup      -12 … 24 dB
    bool autoGain = false;
    bool autoRelease = false;
    bool splitBands = false;
    float xo1 = 180.0f;             // dynamic.xo1         40 … 800 Hz
    float xo2 = 3500.0f;            // dynamic.xo2         800 … 12000 Hz
    DynamicXBandParams bands[3];
};

class DynamicXCore
{
public:
    void prepare (double sampleRate, int maxBlockSize);
    void reset() noexcept;
    void setParams (const DynamicXParams& next) noexcept;
    void process (float* left, float* right, int numSamples) noexcept;

    int getLatencySamples() const noexcept { return lookaheadSamples; }

    float getGainReductionDb() const noexcept { return grDb.load (std::memory_order_relaxed); }
    float getInputPeakDb() const noexcept { return inPeakDb.load (std::memory_order_relaxed); }
    float getOutputPeakDb() const noexcept { return outPeakDb.load (std::memory_order_relaxed); }
    float getInputRmsDb() const noexcept { return inRmsDb.load (std::memory_order_relaxed); }
    float getOutputRmsDb() const noexcept { return outRmsDb.load (std::memory_order_relaxed); }
    float getBandGr (int band) const noexcept;

    static float computeGainDb (float inputDb, float threshold, float ratio, float kneeDb) noexcept;

private:
    struct EnvState
    {
        float envDb = -120.0f;
        float gainDb = 0.0f;
        float targetDb = 0.0f;
        float rmsMeanSquare = 1.0e-12f;
    };

    float tickGain (EnvState& env, float attackCoeff, float releaseCoeff) noexcept;
    void setCrossovers (float f1, float f2) noexcept;
    void processFullPath (float* left, float* right, int numSamples, bool dual,
                          float th, float ratio, float knee) noexcept;
    void processSplitPath (float* left, float* right, int numSamples, bool dual) noexcept;
    float measureLinkedPeak (float l, float r, bool dual) const noexcept;
    float measureLinkedLevelDb (float l, float r, bool dual, EnvState& st) noexcept;

    double sampleRate = 48000.0;
    int maxBlock = 512;
    int lookaheadSamples = 0;
    int delayMask = 0;
    int delayWrite = 0;

    DynamicXParams params {};
    xs::SmoothedParam threshold, ratio, knee, attack, release, makeup, mix, split;
    xs::SmoothedParam xo1, xo2;
    xs::SmoothedParam bandTh[3], bandRatio[3], bandMakeup[3];

    EnvState fullEnv {};
    EnvState bandEnv[3] {};
    float autoRelTime = 0.12f;
    float prevEnvDb = -120.0f;
    float avgGrDb = 0.0f;
    float autoMakeupDb = 0.0f;
    float makeupLin = 1.0f;
    float appliedGainDb = 0.0f;
    float splitZ = 0.0f;
    float wasSplit = 0.0f;

    xs::LinkwitzRiley4 xoLow {}, xoHigh {};
    float xo1Used = -1.0f;
    float xo2Used = -1.0f;

    std::vector<float> delayL, delayR;
    std::vector<float> bandBufL[3];
    std::vector<float> bandBufR[3];
    std::vector<float> fullBufL, fullBufR;
    std::vector<float> tmpL, tmpR;

    xs::PeakHold inPeak, outPeak;
    float rmsInLin = 0.0f;
    float rmsOutLin = 0.0f;
    float grBands[3] {};

    std::atomic<float> grDb { 0.0f };
    std::atomic<float> inPeakDb { -120.0f };
    std::atomic<float> outPeakDb { -120.0f };
    std::atomic<float> inRmsDb { -120.0f };
    std::atomic<float> outRmsDb { -120.0f };
};

} // namespace tmss
