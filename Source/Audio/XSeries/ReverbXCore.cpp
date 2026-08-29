#include "ReverbXCore.h"

#include <cmath>
#include <cstring>

namespace tmss
{

namespace
{
    constexpr float kMaxPreSec = 0.25f;
    constexpr float kMaxErSec = 0.22f;
    constexpr float kMaxCombSec = 0.12f;
    constexpr float kMaxApSec = 0.06f;
    constexpr float kMinDelaySec = 0.0003f;
    constexpr int kNumCombs = 6;
    constexpr int kNumAp = 3;
    constexpr float kModDepth = 0.006f;
    constexpr float kModSkew = 2.1f;
    constexpr float kSatT = 1.2f;
    constexpr float kSatK = 1.2f;
    constexpr float kDen = 1.0e-30f;

    constexpr float kCombSec[kNumCombs] =
        { 0.02532880f, 0.02691610f, 0.02895692f, 0.03063492f, 0.03226757f, 0.03385488f };
    constexpr float kCombOffSec[kNumCombs] =
        { 0.00029478f, 0.00043084f, 0.00052154f, 0.00065760f, 0.00070295f, 0.00083900f };
    constexpr float kApSec[kNumAp] = { 0.00696145f, 0.00505669f, 0.00369615f };
    constexpr float kApOffSec[kNumAp] = { 0.00024943f, 0.00038549f, 0.00029478f };
    constexpr float kModHz[kNumCombs] = { 0.331f, 0.417f, 0.523f, 0.271f, 0.611f, 0.383f };
    constexpr float kModPhase0[kNumCombs] = { 0.0f, 1.71f, 3.02f, 4.63f, 5.41f, 2.19f };

    inline float softSat (float x) noexcept
    {
        if (x > kSatT)
        {
            const float u = x - kSatT;
            return kSatT + u / (1.0f + u / kSatK);
        }
        if (x < -kSatT)
        {
            const float u = -kSatT - x;
            return -kSatT - u / (1.0f + u / kSatK);
        }
        return x;
    }

    inline float sizeScale (float s) noexcept
    {
        return 0.5f + 1.5f * xs::xclamp (s, 0.0f, 1.0f);
    }

    inline float feedbackGain (float delaySec, float decaySec) noexcept
    {
        const float D = delaySec < 1.0e-6f ? 1.0e-6f : delaySec;
        const float T = decaySec < 0.05f ? 0.05f : decaySec;
        float g = std::pow (10.0f, -3.0f * D / T);
        if (g >= 1.0f) return 0.98f;
        return g > 0.98f ? 0.98f : (g < 0.0f ? 0.0f : g);
    }

    struct VenueDef
    {
        const float* delayRatios;
        int numRatios;
        const float* gainRatios;
        const float* stereoOffsets;
        float preDelay;
        float baseDelay;
        float diffusion;
        float damping;
        float earlyLevel;
        float lateLevel;
        float stereoWidth;
    };

    constexpr float kRatiosSmall[] = { 1.0f, 1.6f, 2.3f, 3.1f, 4.0f, 5.2f };
    constexpr float kGainsSmall[] = { 1.00f, 0.78f, 0.62f, 0.50f, 0.40f, 0.32f };
    constexpr float kOffSmall[] = { 0.012f, -0.016f, 0.021f, -0.018f, 0.025f, -0.022f };

    constexpr float kRatiosStudio[] = { 1.0f, 1.4f, 2.0f, 2.8f, 3.7f };
    constexpr float kGainsStudio[] = { 0.85f, 0.65f, 0.50f, 0.38f, 0.28f };
    constexpr float kOffStudio[] = { 0.014f, -0.018f, 0.016f, -0.022f, 0.020f };

    constexpr float kRatiosChamber[] = { 1.0f, 1.35f, 1.75f, 2.2f, 2.8f, 3.5f, 4.3f, 5.2f };
    constexpr float kGainsChamber[] = { 0.90f, 0.74f, 0.62f, 0.52f, 0.43f, 0.36f, 0.29f, 0.24f };
    constexpr float kOffChamber[] = { 0.010f, -0.014f, 0.018f, -0.012f, 0.022f, -0.020f, 0.016f, -0.024f };

    constexpr float kRatiosHall[] = { 1.0f, 1.8f, 2.9f, 4.2f };
    constexpr float kGainsHall[] = { 0.70f, 0.50f, 0.36f, 0.24f };
    constexpr float kOffHall[] = { 0.030f, -0.038f, 0.042f, -0.035f };

    constexpr float kRatiosConcert[] = { 1.0f, 1.5f, 2.1f, 2.8f, 3.7f, 4.8f };
    constexpr float kGainsConcert[] = { 0.80f, 0.64f, 0.52f, 0.42f, 0.33f, 0.26f };
    constexpr float kOffConcert[] = { 0.028f, -0.034f, 0.040f, -0.030f, 0.036f, -0.042f };

    constexpr float kRatiosCathedral[] = { 1.0f, 1.7f, 2.6f, 3.8f, 5.2f, 6.8f };
    constexpr float kGainsCathedral[] = { 0.55f, 0.44f, 0.35f, 0.28f, 0.22f, 0.17f };
    constexpr float kOffCathedral[] = { 0.035f, -0.040f, 0.048f, -0.038f, 0.044f, -0.050f };

    constexpr float kRatiosStage[] = { 1.0f, 1.45f, 2.15f, 3.0f, 4.1f };
    constexpr float kGainsStage[] = { 0.88f, 0.70f, 0.54f, 0.40f, 0.30f };
    constexpr float kOffStage[] = { 0.045f, -0.050f, 0.055f, -0.042f, 0.060f };

    constexpr float kRatiosOutdoor[] = { 1.0f, 2.2f, 3.8f };
    constexpr float kGainsOutdoor[] = { 0.22f, 0.12f, 0.06f };
    constexpr float kOffOutdoor[] = { 0.060f, -0.080f, 0.070f };

    const VenueDef kVenues[] =
    {
        { kRatiosSmall, 6, kGainsSmall, kOffSmall, 0.006f, 0.008f, 0.35f, 0.55f, 0.72f, 0.55f, 0.45f },
        { kRatiosStudio, 5, kGainsStudio, kOffStudio, 0.010f, 0.011f, 0.42f, 0.40f, 0.48f, 0.62f, 0.50f },
        { kRatiosChamber, 8, kGainsChamber, kOffChamber, 0.016f, 0.013f, 0.55f, 0.38f, 0.55f, 0.70f, 0.55f },
        { kRatiosHall, 4, kGainsHall, kOffHall, 0.024f, 0.018f, 0.68f, 0.32f, 0.32f, 0.85f, 0.72f },
        { kRatiosConcert, 6, kGainsConcert, kOffConcert, 0.032f, 0.022f, 0.72f, 0.28f, 0.42f, 0.82f, 0.70f },
        { kRatiosCathedral, 6, kGainsCathedral, kOffCathedral, 0.048f, 0.038f, 0.88f, 0.62f, 0.28f, 0.95f, 0.65f },
        { kRatiosStage, 5, kGainsStage, kOffStage, 0.018f, 0.016f, 0.58f, 0.30f, 0.68f, 0.60f, 0.88f },
        { kRatiosOutdoor, 3, kGainsOutdoor, kOffOutdoor, 0.035f, 0.028f, 0.18f, 0.12f, 0.18f, 0.06f, 0.90f }
    };
}

float ReverbXCore::dampCoeff (float hz) const noexcept
{
    const float fc = xs::xclamp (hz, 20.0f, (float) (sampleRate * 0.49));
    float a = 1.0f - std::exp (-xs::twoPi * fc / (float) sampleRate);
    return xs::xclamp (a, 0.002f, 1.0f);
}

void ReverbXCore::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = newSampleRate > 8000.0 ? newSampleRate : 48000.0;
    maxBlock = xs::xmax (1, maxBlockSize);

    const int preCap = (int) std::ceil (kMaxPreSec * sampleRate) + 8;
    const int erCap = (int) std::ceil (kMaxErSec * sampleRate) + 8;
    const int combCap = (int) std::ceil (kMaxCombSec * sampleRate) + 8;
    const int apCap = (int) std::ceil (kMaxApSec * sampleRate) + 8;

    preL.prepare (preCap);
    preR.prepare (preCap);
    erL.prepare (erCap);
    erR.prepare (erCap);

    for (int i = 0; i < kNumCombs; ++i)
    {
        combL[i].prepare (combCap);
        combR[i].prepare (combCap);
        modPhase[i] = kModPhase0[i];
        modInc[i] = xs::twoPi * kModHz[i] / (float) sampleRate;
    }

    for (int i = 0; i < kNumAp; ++i)
    {
        apL[i].prepare (apCap);
        apR[i].prepare (apCap);
    }

    scratchL.resize ((size_t) maxBlock);
    scratchR.resize ((size_t) maxBlock);
    taps.resize (8);

    amount.setTimeConstant (0.02, sampleRate);
    reverbLevel.setTimeConstant (0.02, sampleRate);
    width.setTimeConstant (0.02, sampleRate);
    preDelay.setTimeConstant (0.05, sampleRate);
    dampHz.setTimeConstant (0.03, sampleRate);

    setParams (params);
    reset();
}

void ReverbXCore::clearDelays() noexcept
{
    preL.reset();
    preR.reset();
    erL.reset();
    erR.reset();

    for (int i = 0; i < kNumCombs; ++i)
    {
        combL[i].reset();
        combR[i].reset();
        dampZL[i] = 0.0f;
        dampZR[i] = 0.0f;
    }

    for (int i = 0; i < kNumAp; ++i)
    {
        apL[i].reset();
        apR[i].reset();
    }

    dcXL = dcXR = dcYL = dcYR = 0.0f;
}

void ReverbXCore::reset() noexcept
{
    clearDelays();
    sizeZ = sizeT = params.size;
    decayZ = decayT = params.decay;
    muteSamples = 0;
    amount.snap();
    reverbLevel.snap();
    width.snap();
    preDelay.snap();
    dampHz.snap();
    dampA = dampCoeff (dampHz.getCurrent());
    compileNetwork();
    wetPeak.store (0.0f, std::memory_order_relaxed);
}

void ReverbXCore::setParams (const ReverbXParams& next) noexcept
{
    const auto newVenue = next.venue;

    if (venueUsed != newVenue && venueInitialized)
    {
        clearDelays();
        muteSamples = (int) std::lround (0.008 * sampleRate);
    }
    venueInitialized = true;

    params = next;
    params.amount = xs::xclamp (next.amount, amountMin, amountMax);
    params.reverbLevel = xs::xclamp (next.reverbLevel, levelMin, levelMax);
    params.decay = xs::xclamp (next.decay, decayMin, decayMax);
    params.size = xs::xclamp (next.size, sizeMin, sizeMax);
    params.width = xs::xclamp (next.width, widthMin, widthMax);
    params.preDelayMs = xs::xclamp (next.preDelayMs, 0.0f, preDelayMaxMs);
    params.dampingHz = xs::xclamp (next.dampingHz, dampingMinHz, dampingMaxHz);

    amount.setTarget (params.amount);
    reverbLevel.setTarget (params.reverbLevel);
    width.setTarget (params.width);
    preDelay.setTarget (params.preDelayMs * 0.001f * (float) sampleRate);
    dampHz.setTarget (params.dampingHz);

    sizeT = params.size;
    decayT = params.decay;
    venueUsed = params.venue;
}

void ReverbXCore::compileNetwork() noexcept
{
    const int vi = xs::xclamp ((int) venueUsed, 0, 7);
    const VenueDef& ven = kVenues[vi];
    const float s = sizeScale (sizeZ);
    const float sizeGain = 1.0f / std::sqrt (s);
    const float decaySec = xs::xclamp (decayZ, decayMin, decayMax);

    tapCount = ven.numRatios;
    taps.resize ((size_t) tapCount);

    for (int i = 0; i < tapCount; ++i)
    {
        const float delaySec = xs::xclamp (ven.baseDelay * s * ven.delayRatios[i], kMinDelaySec, kMaxErSec);
        const float off = ven.stereoOffsets[i];
        const float g = ven.gainRatios[i] * sizeGain;
        auto& t = taps[(size_t) i];
        t.dL = xs::xclamp (delaySec * (1.0f - off), kMinDelaySec, kMaxErSec) * (float) sampleRate;
        t.dR = xs::xclamp (delaySec * (1.0f + off), kMinDelaySec, kMaxErSec) * (float) sampleRate;
        t.gL = g * (off >= 0.0f ? 1.0f : 0.82f);
        t.gR = g * (off <= 0.0f ? 1.0f : 0.82f);
    }

    for (int i = 0; i < kNumCombs; ++i)
    {
        const float delaySec = xs::xclamp (kCombSec[i] * s, 0.003f, kMaxCombSec);
        const float offSec = kCombOffSec[i] * s;
        const float dRsec = xs::xclamp (delaySec + offSec, 0.003f, kMaxCombSec);
        combDL[i] = delaySec * (float) sampleRate;
        combDR[i] = dRsec * (float) sampleRate;
        combMDL[i] = combDL[i];
        combMDR[i] = combDR[i];
        fb[i] = feedbackGain (delaySec, decaySec);
    }

    for (int i = 0; i < kNumAp; ++i)
    {
        const float delaySec = xs::xclamp (kApSec[i] * s, 0.001f, kMaxApSec);
        const float offSec = kApOffSec[i] * s;
        apDL[i] = delaySec * (float) sampleRate;
        apDR[i] = xs::xclamp (delaySec + offSec, 0.001f, kMaxApSec) * (float) sampleRate;
    }

    apG = xs::xclamp (ven.diffusion * 0.62f, 0.12f, 0.86f);
    earlyLevel = ven.earlyLevel;
    lateLevel = ven.lateLevel;
}

void ReverbXCore::updateModulation (int numSamples) noexcept
{
    for (int c = 0; c < kNumCombs; ++c)
    {
        float p = modPhase[c] + modInc[c] * (float) numSamples;
        const float twoPi = (float) xs::twoPi;
        while (p >= twoPi) p -= twoPi;
        modPhase[c] = p;
        combMDL[c] = combDL[c] * (1.0f + kModDepth * std::sin (p));
        combMDR[c] = combDR[c] * (1.0f + kModDepth * std::sin (p + kModSkew));
    }
}

void ReverbXCore::process (float* left, float* right, int numSamples) noexcept
{
    if (left == nullptr || numSamples < 1)
        return;

    if (right == nullptr)
        right = left;

    float peakWet = 0.0f;

    int done = 0;
    while (done < numSamples)
    {
        const int chunk = xs::xmin (maxBlock, numSamples - done);
        float* wl = scratchL.data();
        float* wr = scratchR.data();

        const float dt = (float) chunk / (float) sampleRate;
        const float aSize = 1.0f - std::exp (-dt / 0.08f);
        const float aDecay = 1.0f - std::exp (-dt / 0.05f);
        sizeZ += (sizeT - sizeZ) * aSize;
        decayZ += (decayT - decayZ) * aDecay;

        preDelay.nextBlock (chunk);
        dampHz.nextBlock (chunk);
        dampA = dampCoeff (dampHz.getCurrent());

        compileNetwork();
        updateModulation (chunk);

        const float preD = preDelay.getCurrent() < 1.0f ? 1.0f : preDelay.getCurrent();
        const float amtStep = amount.blockCoeff (1);

        for (int i = 0; i < chunk; ++i)
        {
            const int j = done + i;
            const float inL = left[j];
            const float inR = right[j];

            preL.write (inL);
            preR.write (inR);
            const float pL = preL.readLinear (preD);
            const float pR = preR.readLinear (preD);

            erL.write (pL);
            erR.write (pR);

            float eL = 0.0f, eR = 0.0f;
            for (int t = 0; t < tapCount; ++t)
            {
                const auto& tap = taps[(size_t) t];
                eL += erL.readLinear (tap.dL) * tap.gL;
                eR += erR.readLinear (tap.dR) * tap.gR;
            }

            float accL = 0.0f, accR = 0.0f;
            for (int c = 0; c < kNumCombs; ++c)
            {
                const float yL = combL[c].readLinear (combMDL[c]);
                const float yR = combR[c].readLinear (combMDR[c]);
                dampZL[c] = dampZL[c] + dampA * (yL - dampZL[c]) + kDen;
                dampZR[c] = dampZR[c] + dampA * (yR - dampZR[c]) + kDen;
                float gL = dampZL[c] * fb[c];
                float gR = dampZR[c] * fb[c];
                if (gL > kSatT || gL < -kSatT) gL = softSat (gL);
                if (gR > kSatT || gR < -kSatT) gR = softSat (gR);
                combL[c].write (pL + gL);
                combR[c].write (pR + gR);
                accL += yL;
                accR += yR;
            }
            accL *= combNorm;
            accR *= combNorm;

            for (int a = 0; a < kNumAp; ++a)
            {
                const float bufL = apL[a].readLinear (apDL[a]);
                const float bufR = apR[a].readLinear (apDR[a]);
                const float oL = -apG * accL + bufL;
                const float oR = -apG * accR + bufR;
                apL[a].write (accL + apG * oL);
                apR[a].write (accR + apG * oR);
                accL = oL;
                accR = oR;
            }

            reverbLevel.next();
            width.next();

            float wL = (eL * earlyLevel + accL * lateLevel) * reverbLevel.getCurrent();
            float wR = (eR * earlyLevel + accR * lateLevel) * reverbLevel.getCurrent();
            const float mid = (wL + wR) * 0.5f;
            const float side = (wL - wR) * 0.5f * width.getCurrent();
            wL = mid + side;
            wR = mid - side;

            float yL = wL - dcXL + 0.995f * dcYL;
            float yR = wR - dcXR + 0.995f * dcYR;
            dcXL = wL;
            dcXR = wR;
            dcYL = yL;
            dcYR = yR;

            if (muteSamples > 0)
            {
                yL = 0.0f;
                yR = 0.0f;
                --muteSamples;
            }

            if (! xs::isFinite (yL) || ! xs::isFinite (yR) || std::abs (yL) > 4.0f || std::abs (yR) > 4.0f)
            {
                yL = 0.0f;
                yR = 0.0f;
                clearDelays();
            }

            wl[i] = yL;
            wr[i] = yR;
            peakWet = xs::xmax (peakWet, xs::xmax (std::abs (yL), std::abs (yR)));
        }

        float amountZ = amount.getCurrent();
        for (int i = 0; i < chunk; ++i)
        {
            amountZ += (params.amount - amountZ) * amtStep;
            const float g = amountZ;
            const int j = done + i;
            left[j] = left[j] + wl[i] * g;
            right[j] = right[j] + wr[i] * g;
        }

        done += chunk;
    }

    wetPeak.store (peakWet, std::memory_order_relaxed);
}

} // namespace tmss
