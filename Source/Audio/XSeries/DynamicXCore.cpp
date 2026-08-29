#include "DynamicXCore.h"

#include <cmath>
#include <cstring>

namespace tmss
{

namespace
{
    constexpr float kMinDb = -120.0f;
    constexpr float kGrMinDb = -60.0f;
    constexpr float kAutoGainFactor = 0.65f;

    inline float blockCoeff (float seconds, double sr, int n) noexcept
    {
        const double t = (double) xs::xmax (1.0e-5f, seconds) * sr;
        return t > 1.0e-4 ? (float) std::exp (-(double) xs::xmax (1, n) / t) : 0.0f;
    }

    inline float envCoeff (float seconds, double sr) noexcept
    {
        const double t = (double) xs::xmax (1.0e-5f, seconds) * sr;
        return t > 1.0e-4 ? (float) std::exp (-1.0 / t) : 0.0f;
    }

    inline int nextPow2 (int v) noexcept
    {
        int p = 1;
        while (p < v) p <<= 1;
        return p;
    }
}

float DynamicXCore::computeGainDb (float inputDb, float threshold, float ratio, float kneeDb) noexcept
{
    const float r = xs::xmax (1.0f, ratio);

    if (kneeDb <= 0.001f)
    {
        if (!(inputDb > threshold))
            return 0.0f;
        const float outDb = threshold + (inputDb - threshold) / r;
        return xs::xclamp (outDb - inputDb, kGrMinDb, 0.0f);
    }

    const float kneeHalf = kneeDb * 0.5f;
    const float lower = threshold - kneeHalf;

    if (inputDb <= lower)
        return 0.0f;

    if (inputDb >= threshold + kneeHalf)
    {
        const float outDb = threshold + (inputDb - threshold) / r;
        return xs::xclamp (outDb - inputDb, kGrMinDb, 0.0f);
    }

    const float x = inputDb - lower;
    const float slope = 1.0f - 1.0f / r;
    const float gr = -slope * x * x / (2.0f * kneeDb);
    return xs::xclamp (gr, kGrMinDb, 0.0f);
}

float DynamicXCore::getBandGr (int band) const noexcept
{
    if (band < 0 || band > 2)
        return 0.0f;
    return grBands[band];
}

void DynamicXCore::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = newSampleRate > 1000.0 ? newSampleRate : 48000.0;
    maxBlock = xs::xmax (1, maxBlockSize);

    const int maxLook = (int) std::ceil (0.01 * sampleRate) + 4;
    const int cap = nextPow2 (xs::xmax (64, maxLook + maxBlock));
    delayL.assign ((size_t) cap, 0.0f);
    delayR.assign ((size_t) cap, 0.0f);
    delayMask = cap - 1;
    delayWrite = 0;

    for (int b = 0; b < 3; ++b)
    {
        bandBufL[b].resize ((size_t) maxBlock);
        bandBufR[b].resize ((size_t) maxBlock);
    }

    fullBufL.resize ((size_t) maxBlock);
    fullBufR.resize ((size_t) maxBlock);
    tmpL.resize ((size_t) maxBlock);
    tmpR.resize ((size_t) maxBlock);

    inPeak.prepare (sampleRate, 0.14);
    outPeak.prepare (sampleRate, 0.14);

    const double sr = sampleRate;
    threshold.setTimeConstant (0.018, sr);
    ratio.setTimeConstant (0.018, sr);
    knee.setTimeConstant (0.018, sr);
    attack.setTimeConstant (0.018, sr);
    release.setTimeConstant (0.018, sr);
    makeup.setTimeConstant (0.015, sr);
    mix.setTimeConstant (0.012, sr);
    split.setTimeConstant (0.012, sr);
    xo1.setTimeConstant (0.018, sr);
    xo2.setTimeConstant (0.018, sr);

    for (int b = 0; b < 3; ++b)
    {
        bandTh[b].setTimeConstant (0.018, sr);
        bandRatio[b].setTimeConstant (0.018, sr);
        bandMakeup[b].setTimeConstant (0.015, sr);
    }

    setParams (params);
    reset();
}

void DynamicXCore::reset() noexcept
{
    fullEnv = {};
    for (auto& e : bandEnv)
        e = {};

    xoLow.reset();
    xoHigh.reset();
    xo1Used = xo2Used = -1.0f;

    std::fill (delayL.begin(), delayL.end(), 0.0f);
    std::fill (delayR.begin(), delayR.end(), 0.0f);
    delayWrite = 0;

    autoRelTime = 0.12f;
    prevEnvDb = kMinDb;
    avgGrDb = 0.0f;
    autoMakeupDb = 0.0f;
    makeupLin = 1.0f;
    appliedGainDb = 0.0f;
    splitZ = wasSplit = 0.0f;
    rmsInLin = rmsOutLin = 0.0f;

    threshold.snap();
    ratio.snap();
    knee.snap();
    attack.snap();
    release.snap();
    makeup.snap();
    mix.snap();
    split.snap();
    xo1.snap();
    xo2.snap();

    for (int b = 0; b < 3; ++b)
    {
        bandTh[b].snap();
        bandRatio[b].snap();
        bandMakeup[b].snap();
        grBands[b] = 0.0f;
    }

    inPeak.reset();
    outPeak.reset();

    grDb.store (0.0f, std::memory_order_relaxed);
    inPeakDb.store (kMinDb, std::memory_order_relaxed);
    outPeakDb.store (kMinDb, std::memory_order_relaxed);
    inRmsDb.store (kMinDb, std::memory_order_relaxed);
    outRmsDb.store (kMinDb, std::memory_order_relaxed);
}

void DynamicXCore::setParams (const DynamicXParams& next) noexcept
{
    params = next;
    params.threshold = xs::xclamp (next.threshold, -48.0f, 0.0f);
    params.ratio = xs::xclamp (next.ratio, 1.0f, 20.0f);
    params.kneeDb = xs::xclamp (next.kneeDb, 0.0f, 24.0f);
    params.attack = xs::xclamp (next.attack, 0.0002f, 0.2f);
    params.release = xs::xclamp (next.release, 0.02f, 1.5f);
    params.lookaheadMs = xs::xclamp (next.lookaheadMs, 0.0f, 10.0f);
    params.rmsMs = xs::xclamp (next.rmsMs, 1.0f, 100.0f);
    params.mix = xs::xclamp (next.mix, 0.0f, 1.0f);
    params.makeupDb = xs::xclamp (next.makeupDb, -12.0f, 24.0f);

    float x1 = xs::xclamp (next.xo1, 40.0f, 800.0f);
    float x2 = xs::xclamp (next.xo2, 800.0f, 12000.0f);
    if (x2 < x1 + 80.0f) x2 = xs::xmin (12000.0f, x1 + 80.0f);
    params.xo1 = x1;
    params.xo2 = x2;

    threshold.setTarget (params.threshold);
    ratio.setTarget (params.ratio);
    knee.setTarget (params.kneeDb);
    attack.setTarget (params.attack);
    release.setTarget (params.release);
    makeup.setTarget (params.makeupDb);
    mix.setTarget (params.mix);
    split.setTarget (params.splitBands ? 1.0f : 0.0f);
    xo1.setTarget (params.xo1);
    xo2.setTarget (params.xo2);

    for (int b = 0; b < 3; ++b)
    {
        const auto& src = next.bands[b];
        params.bands[b].enabled = src.enabled;
        params.bands[b].solo = src.solo;
        params.bands[b].threshold = xs::xclamp (src.threshold, -48.0f, 0.0f);
        params.bands[b].ratio = xs::xclamp (src.ratio, 1.0f, 20.0f);
        params.bands[b].makeupDb = xs::xclamp (src.makeupDb, -12.0f, 24.0f);
        bandTh[b].setTarget (params.bands[b].threshold);
        bandRatio[b].setTarget (params.bands[b].ratio);
        bandMakeup[b].setTarget (params.bands[b].makeupDb);
    }

    const int want = (int) std::lround (params.lookaheadMs * 0.001 * sampleRate);
    lookaheadSamples = xs::xclamp (want, 0, (int) delayL.size() - maxBlock - 2);
}

void DynamicXCore::setCrossovers (float f1, float f2) noexcept
{
    xoLow.setCrossover ((double) f1, sampleRate);
    xoHigh.setCrossover ((double) f2, sampleRate);
    xo1Used = f1;
    xo2Used = f2;
}

float DynamicXCore::measureLinkedPeak (float l, float r, bool dual) const noexcept
{
    const float aL = std::abs (l);
    const float aR = dual ? std::abs (r) : aL;
    return xs::xmax (aL, aR);
}

float DynamicXCore::measureLinkedLevelDb (float l, float r, bool dual, EnvState& st) noexcept
{
    if (params.detector == DynamicXDetector::Rms)
    {
        const float ms = dual ? (l * l + r * r) * 0.5f : l * l;
        const float tau = params.rmsMs * 0.001f;
        const float a = 1.0f - envCoeff (tau, sampleRate);
        st.rmsMeanSquare += (ms - st.rmsMeanSquare) * a;
        xs::flushDenormal (st.rmsMeanSquare);
        return xs::gainToDb (std::sqrt (st.rmsMeanSquare + 1.0e-12f));
    }

    const float pk = measureLinkedPeak (l, r, dual);
    return xs::gainToDb (pk);
}

float DynamicXCore::tickGain (EnvState& env, float attackCoeff, float releaseCoeff) noexcept
{
    const float a = env.targetDb < env.gainDb ? attackCoeff : releaseCoeff;
    env.gainDb = a * env.gainDb + (1.0f - a) * env.targetDb;
    env.gainDb = xs::xclamp (env.gainDb, kGrMinDb, 0.0f);
    return xs::fastDbToGain (env.gainDb);
}

void DynamicXCore::processFullPath (float* left, float* right, int numSamples, bool dual,
                                    float th, float ratioVal, float kneeVal) noexcept
{
    const float atkC = envCoeff (attack.getCurrent(), sampleRate);
    const float relC = envCoeff (params.autoRelease ? autoRelTime : release.getCurrent(), sampleRate);

    for (int i = 0; i < numSamples; ++i)
    {
        const float detDb = measureLinkedLevelDb (left[i], right[i], dual, fullEnv);
        fullEnv.envDb = detDb;
        fullEnv.targetDb = computeGainDb (detDb, th, ratioVal, kneeVal);
        const float g = tickGain (fullEnv, atkC, relC);
        left[i] *= g;
        if (dual) right[i] *= g;
    }

    appliedGainDb = fullEnv.gainDb;
    grBands[0] = grBands[1] = grBands[2] = 0.0f;
}

void DynamicXCore::processSplitPath (float* left, float* right, int numSamples, bool dual) noexcept
{
    const float f1 = xo1.getCurrent();
    const float f2 = xo2.getCurrent();

    if (std::abs (f1 - xo1Used) > 0.25f || std::abs (f2 - xo2Used) > 0.25f)
        setCrossovers (f1, f2);

    bool anySolo = false;
    for (int b = 0; b < 3; ++b)
        if (params.bands[b].enabled && params.bands[b].solo)
            anySolo = true;

    float sumSq[3] = { 0.0f, 0.0f, 0.0f };

    for (int i = 0; i < numSamples; ++i)
    {
        float xL = left[i];
        float xR = dual ? right[i] : xL;

        float lowL = 0.0f, highL = 0.0f, lowOnly = 0.0f;
        xoLow.process (xL, lowOnly, highL);
        float midL = 0.0f, highOnly = 0.0f;
        xoHigh.process (highL, midL, highOnly);

        bandBufL[0][(size_t) i] = lowOnly;
        bandBufL[1][(size_t) i] = midL;
        bandBufL[2][(size_t) i] = highOnly;
        sumSq[0] += lowOnly * lowOnly;
        sumSq[1] += midL * midL;
        sumSq[2] += highOnly * highOnly;

        if (dual)
        {
            float lowR = 0.0f, highR = 0.0f, lowOnlyR = 0.0f;
            xoLow.process (xR, lowOnlyR, highR);
            float midR = 0.0f, highOnlyR = 0.0f;
            xoHigh.process (highR, midR, highOnlyR);
            bandBufR[0][(size_t) i] = lowOnlyR;
            bandBufR[1][(size_t) i] = midR;
            bandBufR[2][(size_t) i] = highOnlyR;
            sumSq[0] += lowOnlyR * lowOnlyR;
            sumSq[1] += midR * midR;
            sumSq[2] += highOnlyR * highOnlyR;
        }
        else
        {
            bandBufR[0][(size_t) i] = bandBufL[0][(size_t) i];
            bandBufR[1][(size_t) i] = bandBufL[1][(size_t) i];
            bandBufR[2][(size_t) i] = bandBufL[2][(size_t) i];
        }
    }

    const float atkC = envCoeff (attack.getCurrent(), sampleRate);
    const float relC = envCoeff (params.autoRelease ? autoRelTime : release.getCurrent(), sampleRate);
    const float ch = dual ? 2.0f : 1.0f;

    for (int b = 0; b < 3; ++b)
    {
        const float rms = std::sqrt (sumSq[b] / ((float) numSamples * ch) + 1.0e-20f);
        const float levelDb = xs::gainToDb (rms);
        auto& env = bandEnv[b];
        env.envDb = levelDb;
        const bool enabled = params.bands[b].enabled;
        const float th = bandTh[b].getCurrent();
        const float r = bandRatio[b].getCurrent();
        env.targetDb = enabled ? computeGainDb (levelDb, th, r, knee.getCurrent()) : 0.0f;
    }

    for (int i = 0; i < numSamples; ++i)
    {
        float oL = 0.0f, oR = 0.0f;
        for (int b = 0; b < 3; ++b)
        {
            if (anySolo && ! (params.bands[b].enabled && params.bands[b].solo))
                continue;
            const float g = tickGain (bandEnv[b], atkC, relC);
            const float mk = xs::fastDbToGain (bandMakeup[b].getCurrent());
            oL += bandBufL[b][(size_t) i] * g * mk;
            if (dual) oR += bandBufR[b][(size_t) i] * g * mk;
        }
        left[i] = oL;
        if (dual) right[i] = oR;
    }

    float wGr = 0.0f, wSum = 0.0f;
    for (int b = 0; b < 3; ++b)
    {
        const float w = std::sqrt (sumSq[b] / ((float) numSamples * ch) + 1.0e-20f);
        wSum += w;
        wGr += bandEnv[b].gainDb * w;
        grBands[b] = xs::xclamp (-bandEnv[b].gainDb / 24.0f, 0.0f, 1.0f);
    }

    appliedGainDb = wSum > 1.0e-12f ? wGr / wSum : 0.0f;
}

void DynamicXCore::process (float* left, float* right, int numSamples) noexcept
{
    if (left == nullptr || numSamples < 1 || delayL.empty())
        return;

    if (right == nullptr)
        right = left;

    const bool dual = right != left;

    threshold.nextBlock (numSamples);
    ratio.nextBlock (numSamples);
    knee.nextBlock (numSamples);
    attack.nextBlock (numSamples);
    release.nextBlock (numSamples);
    makeup.nextBlock (numSamples);
    mix.nextBlock (numSamples);
    split.nextBlock (numSamples);
    xo1.nextBlock (numSamples);
    xo2.nextBlock (numSamples);

    for (int b = 0; b < 3; ++b)
    {
        bandTh[b].nextBlock (numSamples);
        bandRatio[b].nextBlock (numSamples);
        bandMakeup[b].nextBlock (numSamples);
    }

    splitZ = split.getCurrent();

    if (splitZ > 0.02f && wasSplit <= 0.02f)
    {
        for (int b = 0; b < 3; ++b)
        {
            bandEnv[b].gainDb = fullEnv.gainDb;
            bandEnv[b].envDb = fullEnv.envDb;
            bandEnv[b].targetDb = fullEnv.targetDb;
        }
    }
    else if (splitZ < 0.98f && wasSplit >= 0.98f)
    {
        fullEnv.gainDb = appliedGainDb;
        fullEnv.envDb = bandEnv[1].envDb;
    }

    wasSplit = splitZ;

    const float th = threshold.getCurrent();
    const float r = ratio.getCurrent();
    const float kn = knee.getCurrent();
    const float mixAmt = mix.getCurrent();

    const int n = xs::xmin (numSamples, maxBlock);

    for (int i = 0; i < n; ++i)
    {
        tmpL[(size_t) i] = left[i];
        tmpR[(size_t) i] = dual ? right[i] : left[i];
    }

    const float envDbForAuto = splitZ > 0.5f ? bandEnv[1].envDb : fullEnv.envDb;
    {
        const float gr = appliedGainDb < 0.0f ? -appliedGainDb : 0.0f;
        const float move = envDbForAuto - prevEnvDb;
        prevEnvDb = envDbForAuto;
        const float grN = gr / 18.0f;
        const float grF = 0.65f + 1.05f * xs::xclamp (grN, 0.0f, 1.0f);
        float mvF = 1.0f;
        if (move < -0.2f) mvF = 0.62f;
        else if (move > 0.2f) mvF = 1.18f;
        const float levelF = envDbForAuto > -12.0f ? 1.12f : (envDbForAuto < -36.0f ? 0.88f : 1.0f);
        float t = 0.1f * grF * mvF * levelF;
        t = xs::xclamp (t, 0.035f, 0.65f);
        const float a = 1.0f - blockCoeff (0.08f, sampleRate, n);
        autoRelTime += (t - autoRelTime) * a;
    }

    {
        const float aAvg = 1.0f - blockCoeff (0.85f, sampleRate, n);
        avgGrDb += (appliedGainDb - avgGrDb) * aAvg;
        float target = -avgGrDb * kAutoGainFactor;
        target = xs::xclamp (target, 0.0f, 12.0f);
        const float aMk = 1.0f - blockCoeff (0.28f, sampleRate, n);
        autoMakeupDb += (target - autoMakeupDb) * aMk;
    }

    float mkDb = makeup.getCurrent() + autoMakeupDb * (params.autoGain ? 1.0f : 0.0f);
    mkDb = xs::xclamp (mkDb, -12.0f, 24.0f);
    const float mkTgt = xs::fastDbToGain (mkDb);
    const float aMkLin = 1.0f - blockCoeff (0.015f, sampleRate, n);
    makeupLin += (mkTgt - makeupLin) * aMkLin;
    makeupLin = xs::xclamp (makeupLin, 0.063f, 15.85f);

    float peakIn = 0.0f, peakOut = 0.0f;
    double inSum = 0.0, outSum = 0.0;

    const float atkC = envCoeff (attack.getCurrent(), sampleRate);
    const float relC = envCoeff (params.autoRelease ? autoRelTime : release.getCurrent(), sampleRate);

    if (splitZ < 0.001f)
    {
        for (int i = 0; i < n; ++i)
        {
            const float inL = tmpL[(size_t) i];
            const float inR = tmpR[(size_t) i];
            const float detDb = measureLinkedLevelDb (inL, inR, dual, fullEnv);
            fullEnv.envDb = detDb;
            fullEnv.targetDb = computeGainDb (detDb, th, r, kn);
            const float g = tickGain (fullEnv, atkC, relC);
            left[i] = inL * g;
            if (dual) right[i] = inR * g;
        }
        appliedGainDb = fullEnv.gainDb;
        grBands[0] = grBands[1] = grBands[2] = 0.0f;
    }
    else if (splitZ > 0.999f)
    {
        processSplitPath (left, right, n, dual);
    }
    else
    {
        for (int i = 0; i < n; ++i)
        {
            fullBufL[(size_t) i] = tmpL[(size_t) i];
            fullBufR[(size_t) i] = tmpR[(size_t) i];
        }
        processFullPath (left, right, n, dual, th, r, kn);
        for (int i = 0; i < n; ++i)
        {
            bandBufL[0][(size_t) i] = left[i];
            if (dual) bandBufR[0][(size_t) i] = right[i];
            left[i] = fullBufL[(size_t) i];
            if (dual) right[i] = fullBufR[(size_t) i];
        }
        const float savedGr = appliedGainDb;
        processSplitPath (left, right, n, dual);
        appliedGainDb = savedGr + (appliedGainDb - savedGr) * splitZ;
        const float dry = 1.0f - splitZ;
        for (int i = 0; i < n; ++i)
        {
            left[i] = bandBufL[0][(size_t) i] * dry + left[i] * splitZ;
            if (dual) right[i] = bandBufR[0][(size_t) i] * dry + right[i] * splitZ;
        }
    }

    for (int i = 0; i < n; ++i)
    {
        const float dryL = tmpL[(size_t) i];
        const float dryR = tmpR[(size_t) i];

        float wetL = left[i] * makeupLin;
        float wetR = dual ? right[i] * makeupLin : wetL;

        float outL = dryL + (wetL - dryL) * mixAmt;
        float outR = dual ? dryR + (wetR - dryR) * mixAmt : outL;

        if (lookaheadSamples > 0)
        {
            delayL[(size_t) delayWrite] = outL;
            delayR[(size_t) delayWrite] = outR;
            const int readIdx = (delayWrite - lookaheadSamples) & delayMask;
            delayWrite = (delayWrite + 1) & delayMask;
            outL = delayL[(size_t) readIdx];
            outR = delayR[(size_t) readIdx];
        }

        left[i] = xs::finiteOrZero (outL);
        if (dual) right[i] = xs::finiteOrZero (outR);

        peakIn = xs::xmax (peakIn, xs::xmax (std::abs (dryL), std::abs (dryR)));
        peakOut = xs::xmax (peakOut, xs::xmax (std::abs (outL), std::abs (outR)));
        inSum += (double) dryL * dryL + (double) dryR * dryR;
        outSum += (double) outL * outL + (double) outR * outR;
    }

    const float ch = dual ? 2.0f : 1.0f;
    const float inRms = (float) std::sqrt (inSum / ((double) n * ch) + 1.0e-20);
    const float outRms = (float) std::sqrt (outSum / ((double) n * ch) + 1.0e-20);
    const float rmsA = 1.0f - blockCoeff (0.07f, sampleRate, n);
    rmsInLin += (inRms - rmsInLin) * rmsA;
    rmsOutLin += (outRms - rmsOutLin) * rmsA;

    inPeak.processBlock (peakIn, n);
    outPeak.processBlock (peakOut, n);

    grDb.store (appliedGainDb, std::memory_order_relaxed);
    inPeakDb.store (xs::gainToDb (inPeak.get()), std::memory_order_relaxed);
    outPeakDb.store (xs::gainToDb (outPeak.get()), std::memory_order_relaxed);
    inRmsDb.store (xs::gainToDb (rmsInLin), std::memory_order_relaxed);
    outRmsDb.store (xs::gainToDb (rmsOutLin), std::memory_order_relaxed);
}

} // namespace tmss
