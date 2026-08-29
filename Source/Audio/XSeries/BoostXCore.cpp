#include "BoostXCore.h"

#include <cmath>
#include <cstring>

namespace tmss
{

namespace
{
    constexpr float kInvSqrt2 = 0.7071067811865476f;
    constexpr float kOttFreq1 = 150.0f;
    constexpr float kOttFreq2 = 3500.0f;
    constexpr float kModeXfadeSec = 0.008f;

    inline float intensity (float x, float gamma) noexcept
    {
        x = xs::xclamp (x, 0.0f, 1.0f);
        return std::pow (x, gamma);
    }
}

float BoostXCore::tanhApprox (float x) noexcept
{
    if (x > 3.0f) return 1.0f;
    if (x < -3.0f) return -1.0f;
    const float x2 = x * x;
    return x * (27.0f + x2) / (27.0f + 9.0f * x2);
}

float BoostXCore::dcBlock (float x, float& dcX, float& dcY) noexcept
{
    const float y = x - dcX + 0.995f * dcY;
    dcX = x;
    dcY = y;
    return y;
}

BoostXMode BoostXCore::normalizeMode (BoostXMode m) const noexcept
{
    switch (m)
    {
        case BoostXMode::Expander:
        case BoostXMode::Chorus:
        case BoostXMode::Drive:
            return m;
        default:
            return BoostXMode::Ott;
    }
}

void BoostXCore::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = newSampleRate > 1000.0 ? newSampleRate : 48000.0;
    maxBlock = xs::xmax (1, maxBlockSize);

    oversampler.prepare (4, maxBlock);
    oversampler.setFactor (2);

    chorusDL.prepare ((int) std::ceil (0.05 * sampleRate));
    chorusDR.prepare ((int) std::ceil (0.05 * sampleRate));

    inL.resize ((size_t) maxBlock);
    inR.resize ((size_t) maxBlock);
    aL.resize ((size_t) maxBlock);
    aR.resize ((size_t) maxBlock);
    lowBufL.resize ((size_t) maxBlock);
    lowBufR.resize ((size_t) maxBlock);

    ottL.xo1.setCrossover (kOttFreq1, sampleRate);
    ottL.xo2.setCrossover (kOttFreq2, sampleRate);
    ottR.xo1.setCrossover (kOttFreq1, sampleRate);
    ottR.xo2.setCrossover (kOttFreq2, sampleRate);

    auto initBand = [this] (OttBand& b, float atk, float rel, float dTh, float uTh,
                            float rDn, float rUp, float maxUp)
    {
        b.atk = (float) std::exp (-1.0 / xs::xmax (1.0, atk * sampleRate));
        b.atkUse = b.atk;
        b.rel = (float) std::exp (-1.0 / xs::xmax (1.0, rel * sampleRate));
        b.downThresh = dTh;
        b.upThresh = uTh;
        b.ratioDown = rDn;
        b.ratioUp = rUp;
        b.maxUp = maxUp;
    };

    initBand (ottL.bands[0], 0.010f, 0.140f, -8.0f, -24.0f, 4.0f, 3.0f, 8.0f);
    initBand (ottL.bands[1], 0.003f, 0.070f, -12.0f, -32.0f, 8.0f, 4.0f, 12.0f);
    initBand (ottL.bands[2], 0.0008f, 0.035f, -14.0f, -36.0f, 10.0f, 6.0f, 14.0f);
    ottR.bands[0] = ottL.bands[0];
    ottR.bands[1] = ottL.bands[1];
    ottR.bands[2] = ottL.bands[2];

    gainSmooth = 1.0f - (float) std::exp (-1.0 / (0.0008 * sampleRate));
    ottCeilRel = 1.0f - (float) std::exp (-1.0 / (0.06 * sampleRate));
    xfadeInc = 1.0f / (float) (kModeXfadeSec * sampleRate);
    splitA = 1.0f - (float) std::exp (-xs::twoPi * 180.0 / sampleRate);

    amount.setTimeConstant (0.012, sampleRate);
    mix.setTimeConstant (0.012, sampleRate);
    outputGain.setTimeConstant (0.012, sampleRate);
    hpf.setTimeConstant (0.020, sampleRate);

    setParams (params);
    reset();
}

void BoostXCore::reset() noexcept
{
    prepareMode (modeB);
    oversampler.reset();
    hpfL.reset();
    hpfR.reset();
    sideZ1 = sideZ2 = 0.0f;
    wLowZ = 1.0f;
    wHighZ = 1.0f;
    chorusDL.reset();
    chorusDR.reset();
    lfoPhase = 0.0f;
    dcXL = dcYL = dcXR = dcYR = 0.0f;
    xfade = 1.0f;
    grMeter = 0.0f;
    widthZ = activityZ = corrZ = 0.0f;
    amount.snap();
    mix.snap();
    outputGain.snap();
    hpf.snap();
    activity.store (0.0f, std::memory_order_relaxed);
    widthMeter.store (0.0f, std::memory_order_relaxed);
    grAmount.store (0.0f, std::memory_order_relaxed);
}

void BoostXCore::setParams (const BoostXParams& next) noexcept
{
    params = next;
    params.amount = xs::xclamp (next.amount, 0.0f, 1.0f);
    params.mix = xs::xclamp (next.mix, 0.0f, 1.0f);
    params.hpfHz = xs::xclamp (next.hpfHz, 0.0f, 400.0f);
    params.outputGainDb = xs::xclamp (next.outputGainDb, -12.0f, 12.0f);
    params.oversampling = next.oversampling >= 4 ? 4 : (next.oversampling >= 2 ? 2 : 1);

    amount.setTarget (params.amount);
    mix.setTarget (params.mix);
    outputGain.setTarget (xs::fastDbToGain (params.outputGainDb));
    hpf.setTarget (params.hpfHz);

    const int want = (params.mode == BoostXMode::Drive) ? params.oversampling : 1;
    oversampler.setFactor (want);

    const BoostXMode mode = normalizeMode (params.mode);
    if (mode != modeB)
    {
        modeA = modeB;
        modeB = mode;
        xfade = 0.0f;
        prepareMode (mode);
    }
}

int BoostXCore::getLatencySamples() const noexcept
{
    return oversampler.getLatencySamples();
}

void BoostXCore::prepareMode (BoostXMode mode) noexcept
{
    if (mode == BoostXMode::Ott)
    {
        ottL.xo1.reset(); ottL.xo2.reset();
        ottR.xo1.reset(); ottR.xo2.reset();
        ottL.ceilZ = 1.0f;
        ottR.ceilZ = 1.0f;
        for (auto& b : ottL.bands) { b.env = 0.0f; b.det = 0.0f; b.gainZ = 1.0f; b.gr = 0.0f; }
        for (auto& b : ottR.bands) { b.env = 0.0f; b.det = 0.0f; b.gainZ = 1.0f; b.gr = 0.0f; }
    }
    else if (mode == BoostXMode::Expander)
    {
        sideZ1 = sideZ2 = 0.0f;
        wLowZ = 1.0f;
        wHighZ = 1.0f;
    }
    else if (mode == BoostXMode::Drive)
    {
        dcXL = dcYL = dcXR = dcYR = 0.0f;
    }
}

void BoostXCore::applyHpfSum (float* l, float* r, int n) noexcept
{
    const float fc = hpf.getCurrent();
    if (fc <= 1.0f)
    {
        for (int i = 0; i < n; ++i)
        {
            lowBufL[(size_t) i] = 0.0f;
            lowBufR[(size_t) i] = 0.0f;
        }
        return;
    }

    hpfL.setHighPass (fc, sampleRate);
    hpfR.setHighPass (fc, sampleRate);

    for (int i = 0; i < n; ++i)
    {
        const float xL = l[i];
        const float xR = r[i];
        const float hiL = hpfL.process (xL);
        const float hiR = hpfR.process (xR);
        lowBufL[(size_t) i] = xL - hiL;
        lowBufR[(size_t) i] = xR - hiR;
        l[i] = hiL;
        r[i] = hiR;
    }
}

void BoostXCore::ottFollow (OttBand& band, float xL, float xR) noexcept
{
    const float det = std::sqrt (xL * xL + xR * xR) * kInvSqrt2;
    band.det = det;
    const float coeff = det > band.env ? band.atkUse : band.rel;
    band.env = coeff * band.env + (1.0f - coeff) * det;
}

float BoostXCore::ottUpScale (const OttBand& band, float maxEnv) noexcept
{
    const float rel = band.env / (maxEnv + 1.0e-12f);
    if (rel < 0.06f) return 0.0f;
    if (rel < 0.25f) return (rel - 0.06f) / 0.19f;
    return 1.0f;
}

void BoostXCore::applyOttBand (OttBand& band, float xL, float xR, float intensityVal, float upScale) noexcept
{
    const float envDb = xs::fastGainToDb (band.env + 1.0e-8f);
    const float peakDb = xs::fastGainToDb (xs::xmax (band.env, band.det) + 1.0e-8f);
    const float rDown = 1.0f + (band.ratioDown - 1.0f) * intensityVal;
    const float rUp = 1.0f + (band.ratioUp - 1.0f) * intensityVal;
    const float maxUp = band.maxUp * intensityVal;
    float gainDb = 0.0f;

    if (peakDb > band.downThresh)
        gainDb += (1.0f - 1.0f / rDown) * (band.downThresh - peakDb);

    if (envDb < band.upThresh)
    {
        float up = (1.0f - 1.0f / rUp) * (band.upThresh - envDb);
        if (up > maxUp) up = maxUp;
        if (envDb < -72.0f) up = 0.0f;
        else if (envDb < -60.0f) up *= (envDb + 72.0f) / 12.0f;
        gainDb += up * upScale;
    }

    gainDb = xs::xclamp (gainDb, -24.0f, 14.0f);
    gainDb *= 0.4f + 0.6f * intensityVal;
    float g = xs::fastDbToGain (gainDb);
    band.gainZ += (g - band.gainZ) * gainSmooth;
    band.gr = gainDb < 0.0f ? -gainDb : 0.0f;
}

void BoostXCore::processOtt (float* l, float* r, int n, float intensityVal) noexcept
{
    float lowMul = 1.0f, highMul = 1.0f, atkMul = 1.0f, makeupDb = 1.8f * intensityVal;

    switch (params.character)
    {
        case BoostXCharacter::Bright:
            highMul = 1.0f + 0.22f * intensityVal;
            lowMul = 1.0f - 0.06f * intensityVal;
            makeupDb += 0.4f * intensityVal;
            break;
        case BoostXCharacter::Punch:
            atkMul = 0.55f;
            lowMul = 1.0f + 0.1f * intensityVal;
            break;
        case BoostXCharacter::Aggressive:
            highMul = 1.0f + 0.12f * intensityVal;
            lowMul = 1.0f + 0.05f * intensityVal;
            atkMul = 0.7f;
            makeupDb += 0.5f * intensityVal;
            break;
        default:
            break;
    }

    for (int b = 0; b < 3; ++b)
    {
        ottL.bands[b].atkUse = atkMul < 1.0f ? std::pow (ottL.bands[b].atk, 1.0f / atkMul) : ottL.bands[b].atk;
        ottR.bands[b].atkUse = ottL.bands[b].atkUse;
    }

    const float makeup = xs::fastDbToGain (makeupDb);
    const float wet = intensityVal;
    float grSum = 0.0f;

    for (int i = 0; i < n; ++i)
    {
        const float dryL = l[i], dryR = r[i];

        float lowL = 0.0f, restL = 0.0f;
        ottL.xo1.process (dryL, lowL, restL);
        float midL = 0.0f, highL = 0.0f;
        ottL.xo2.process (restL, midL, highL);

        float lowR = 0.0f, restR = 0.0f;
        ottR.xo1.process (dryR, lowR, restR);
        float midR = 0.0f, highR = 0.0f;
        ottR.xo2.process (restR, midR, highR);

        ottFollow (ottL.bands[0], lowL, lowR);
        ottFollow (ottL.bands[1], midL, midR);
        ottFollow (ottL.bands[2], highL, highR);
        ottR.bands[0].env = ottL.bands[0].env;
        ottR.bands[0].det = ottL.bands[0].det;
        ottR.bands[1].env = ottL.bands[1].env;
        ottR.bands[1].det = ottL.bands[1].det;
        ottR.bands[2].env = ottL.bands[2].env;
        ottR.bands[2].det = ottL.bands[2].det;

        const float maxEnv = xs::xmax (ottL.bands[0].env,
                                       xs::xmax (ottL.bands[1].env, ottL.bands[2].env));

        applyOttBand (ottL.bands[0], lowL, lowR, intensityVal, ottUpScale (ottL.bands[0], maxEnv));
        float yL = lowL * ottL.bands[0].gainZ * lowMul;
        float yR = lowR * ottL.bands[0].gainZ * lowMul;
        grSum += ottL.bands[0].gr;

        applyOttBand (ottL.bands[1], midL, midR, intensityVal, ottUpScale (ottL.bands[1], maxEnv));
        yL += midL * ottL.bands[1].gainZ;
        yR += midR * ottL.bands[1].gainZ;
        grSum += ottL.bands[1].gr;

        applyOttBand (ottL.bands[2], highL, highR, intensityVal, ottUpScale (ottL.bands[2], maxEnv));
        yL += highL * ottL.bands[2].gainZ * highMul;
        yR += highR * ottL.bands[2].gainZ * highMul;
        grSum += ottL.bands[2].gr;

        yL *= makeup;
        yR *= makeup;

        const float pk = xs::xmax (std::abs (yL), std::abs (yR));
        if (pk > ottL.ceilZ) ottL.ceilZ = pk;
        else ottL.ceilZ += (pk - ottL.ceilZ) * ottCeilRel;

        const float ceilG = ottL.ceilZ > 1.0f ? 1.0f / ottL.ceilZ : 1.0f;
        yL *= ceilG;
        yR *= ceilG;

        l[i] = dryL + (yL - dryL) * wet;
        r[i] = dryR + (yR - dryR) * wet;
    }

    grMeter = grMeter * 0.8f + 0.2f * (grSum / xs::xmax (1.0f, (float) n * 3.0f) / 18.0f);
}

void BoostXCore::processExpander (float* l, float* r, int n, float intensityVal) noexcept
{
    float kLow = 0.12f, kHigh = 0.88f, wLowMax = 1.22f, wHighMax = 1.82f, splitHz = 180.0f;

    switch (params.character)
    {
        case BoostXCharacter::Subtle: kHigh = 0.42f; wHighMax = 1.4f; kLow = 0.06f; break;
        case BoostXCharacter::Air: splitHz = 320.0f; kHigh = 1.02f; kLow = 0.05f; wHighMax = 1.9f; break;
        default: break;
    }

    const float aT = 1.0f - (float) std::exp (-xs::twoPi * splitHz / sampleRate);
    splitA += (aT - splitA) * 0.04f;

    float wLow = 1.0f + kLow * intensityVal;
    float wHigh = 1.0f + kHigh * intensityVal;
    wLow = xs::xclamp (wLow, 0.92f, wLowMax);
    wHigh = xs::xclamp (wHigh, 1.0f, wHighMax);
    wLowZ += (wLow - wLowZ) * 0.12f;
    wHighZ += (wHigh - wHighZ) * 0.12f;
    wLow = wLowZ;
    wHigh = wHighZ;

    for (int i = 0; i < n; ++i)
    {
        const float M = (l[i] + r[i]) * kInvSqrt2;
        const float S = (l[i] - r[i]) * kInvSqrt2;
        sideZ1 += splitA * (S - sideZ1);
        sideZ2 += splitA * (sideZ1 - sideZ2);
        const float sLow = sideZ2;
        const float sHigh = S - sLow;
        float sBoost = sLow * wLow + sHigh * wHigh;
        const float mPow = M * M;
        const float den = mPow + sBoost * sBoost;
        float comp = den > 1.0e-20f ? std::sqrt ((mPow + S * S) / den) : 1.0f;
        comp = xs::xclamp (comp, 0.72f, 1.0f);
        sBoost *= comp;
        l[i] = (M + sBoost) * kInvSqrt2;
        r[i] = (M - sBoost) * kInvSqrt2;
    }
}

void BoostXCore::processChorus (float* l, float* r, int n, float intensityVal) noexcept
{
    float wetBase = 0.62f;
    float depthMul = 1.0f;
    float rate = 0.45f + 0.7f * intensityVal;

    switch (params.character)
    {
        case BoostXCharacter::Soft: wetBase = 0.48f; rate = 0.32f; depthMul = 0.7f; break;
        case BoostXCharacter::Wide: depthMul = 1.2f; break;
        default: break;
    }

    const float wet = wetBase * intensityVal;
    const float dry = 1.0f - 0.5f * wet;
    const float base = 0.018f * (float) sampleRate;
    const float base2 = 0.024f * (float) sampleRate;
    const float depth = (0.002f + 0.007f * intensityVal) * (float) sampleRate * depthMul;
    const float lfoInc = rate / (float) sampleRate;

    for (int i = 0; i < n; ++i)
    {
        const float xL = l[i], xR = r[i];
        chorusDL.write (xL);
        chorusDR.write (xR);
        lfoPhase += lfoInc;
        if (lfoPhase >= 1.0f) lfoPhase -= 1.0f;
        const float s = std::sin (lfoPhase * (float) xs::twoPi);
        const float ns = -s;
        const float tapL = 0.72f * chorusDL.readLinear (base + depth * s)
                        + 0.28f * chorusDL.readLinear (base2 + depth * 0.55f * ns);
        const float tapR = 0.72f * chorusDR.readLinear (base + depth * ns)
                        + 0.28f * chorusDR.readLinear (base2 + depth * 0.55f * s);
        l[i] = xL * dry + tapL * wet;
        r[i] = xR * dry + tapR * wet;
    }
}

void BoostXCore::processDrive (float* l, float* r, int n, float intensityVal) noexcept
{
    const float driveMul = params.character == BoostXCharacter::Crunch ? 1.35f : 1.0f;
    const float drive = 1.0f + 16.0f * intensityVal * driveMul;
    const float wet = intensityVal;
    const float warm = params.character != BoostXCharacter::Crunch;
    const float makeup = tanhApprox (0.4f) / xs::xmax (1.0e-4f, tanhApprox (0.4f * drive));

    auto shaper = [drive, warm, makeup, this] (float x, int ch) noexcept
    {
        float s = warm ? dcBlock (tanhApprox ((x + 0.1f * x * x) * drive), ch == 0 ? dcXL : dcXR, ch == 0 ? dcYL : dcYR)
                       : tanhApprox (x * drive);
        return s * makeup;
    };

    for (int i = 0; i < n; ++i)
    {
        inL[(size_t) i] = l[i];
        inR[(size_t) i] = r[i];
    }

    const int factor = oversampler.getFactor();
    if (factor <= 1)
    {
        for (int i = 0; i < n; ++i)
        {
            const float xL = inL[(size_t) i], xR = inR[(size_t) i];
            const float sL = shaper (xL, 0);
            const float sR = shaper (xR, 1);
            l[i] = xL + (sL - xL) * wet;
            r[i] = xR + (sR - xR) * wet;
        }
    }
    else
    {
        oversampler.processBlock (l, r, n, [&] (float* ul, float* ur, int nUp) noexcept
        {
            for (int i = 0; i < nUp; ++i)
            {
                ul[i] = shaper (ul[i], 0);
                ur[i] = shaper (ur[i], 1);
            }
        });

        for (int i = 0; i < n; ++i)
        {
            const float xL = inL[(size_t) i], xR = inR[(size_t) i];
            l[i] = xL + (l[i] - xL) * wet;
            r[i] = xR + (r[i] - xR) * wet;
        }
    }
}

void BoostXCore::processMode (BoostXMode mode, float* left, float* right, int numSamples) noexcept
{
    const float x = amount.getCurrent();
    const float inten = intensity (x, mode == BoostXMode::Drive ? 1.7f
                                   : mode == BoostXMode::Expander ? 1.65f
                                   : mode == BoostXMode::Chorus ? 1.5f : 1.55f);

    applyHpfSum (left, right, numSamples);

    switch (mode)
    {
        case BoostXMode::Expander: processExpander (left, right, numSamples, inten); break;
        case BoostXMode::Chorus:   processChorus (left, right, numSamples, inten); break;
        case BoostXMode::Drive:    processDrive (left, right, numSamples, inten); break;
        default:                   processOtt (left, right, numSamples, inten); break;
    }

    if (hpf.getCurrent() > 1.0f)
    {
        for (int i = 0; i < numSamples; ++i)
        {
            left[i] += lowBufL[(size_t) i];
            right[i] += lowBufR[(size_t) i];
        }
    }
}

void BoostXCore::finishBlock (float* l, float* r, int n) noexcept
{
    float sumL2 = 0.0f, sumR2 = 0.0f, sumLR = 0.0f, sumM = 0.0f, sumS = 0.0f, peak = 0.0f;

    const float outG = outputGain.getCurrent();

    for (int i = 0; i < n; ++i)
    {
        float xL = xs::finiteOrZero (l[i] * outG);
        float xR = xs::finiteOrZero (r[i] * outG);

        if (std::abs (xL) > 2.0f) xL = tanhApprox (xL);
        if (std::abs (xR) > 2.0f) xR = tanhApprox (xR);

        l[i] = xL;
        r[i] = xR;

        sumL2 += xL * xL;
        sumR2 += xR * xR;
        sumLR += xL * xR;
        const float m = (xL + xR) * kInvSqrt2;
        const float s = (xL - xR) * kInvSqrt2;
        sumM += m * m;
        sumS += s * s;
        peak = xs::xmax (peak, xs::xmax (std::abs (xL), std::abs (xR)));
    }

    const float corrDen = std::sqrt (sumL2 * sumR2) + 1.0e-12f;
    float corr = sumLR / corrDen;
    corr = xs::xclamp (corr, -1.0f, 1.0f);
    corrZ = corrZ * 0.85f + 0.15f * corr;

    const float midRms = std::sqrt (sumM / (float) n);
    const float sideRms = std::sqrt (sumS / (float) n);
    widthZ = widthZ * 0.85f + 0.15f * (sideRms / (midRms + sideRms + 1.0e-12f));
    activityZ = activityZ * 0.8f + 0.2f * (peak > 1.0f ? 1.0f : peak);

    if (modeB != BoostXMode::Ott)
        grMeter *= 0.9f;

    widthMeter.store (widthZ, std::memory_order_relaxed);
    activity.store (activityZ, std::memory_order_relaxed);
    grAmount.store (xs::xclamp (grMeter, 0.0f, 1.0f), std::memory_order_relaxed);
}

void BoostXCore::process (float* left, float* right, int numSamples) noexcept
{
    if (left == nullptr || numSamples < 1)
        return;

    if (right == nullptr)
        right = left;

    amount.nextBlock (numSamples);
    mix.nextBlock (numSamples);
    outputGain.nextBlock (numSamples);
    hpf.nextBlock (numSamples);

    int done = 0;
    while (done < numSamples)
    {
        const int chunk = xs::xmin (maxBlock, numSamples - done);
        float* l = left + done;
        float* r = right + done;

        if (xfade >= 1.0f)
        {
            for (int i = 0; i < chunk; ++i)
            {
                inL[(size_t) i] = l[i];
                inR[(size_t) i] = r[i];
            }
            processMode (modeB, l, r, chunk);
        }
        else
        {
            for (int i = 0; i < chunk; ++i)
            {
                inL[(size_t) i] = l[i];
                inR[(size_t) i] = r[i];
            }
            processMode (modeA, l, r, chunk);
            for (int i = 0; i < chunk; ++i)
            {
                aL[(size_t) i] = l[i];
                aR[(size_t) i] = r[i];
                l[i] = inL[(size_t) i];
                r[i] = inR[(size_t) i];
            }
            processMode (modeB, l, r, chunk);
            float xf = xfade;
            for (int i = 0; i < chunk; ++i)
            {
                const float t = xs::xmin (xf, 1.0f);
                l[i] = aL[(size_t) i] + (l[i] - aL[(size_t) i]) * t;
                r[i] = aR[(size_t) i] + (r[i] - aR[(size_t) i]) * t;
                xf += xfadeInc;
            }
            xfade = xf > 1.0f ? 1.0f : xf;
        }

        const float mixAmt = mix.getCurrent();
        for (int i = 0; i < chunk; ++i)
        {
            l[i] = inL[(size_t) i] + (l[i] - inL[(size_t) i]) * mixAmt;
            r[i] = inR[(size_t) i] + (r[i] - inR[(size_t) i]) * mixAmt;
        }

        finishBlock (l, r, chunk);
        done += chunk;
    }
}

} // namespace tmss
