#include "EqualizerXCore.h"

//==============================================================================
// Static design helpers
//==============================================================================

int EqualizerXCore::cutOrderForSlope (int slopeDbPerOct) noexcept
{
    if (slopeDbPerOct >= 48) return 8;
    if (slopeDbPerOct >= 36) return 6;
    if (slopeDbPerOct >= 30) return 5;
    if (slopeDbPerOct >= 24) return 4;
    if (slopeDbPerOct >= 18) return 3;
    if (slopeDbPerOct >= 12) return 2;
    return 1;
}

double EqualizerXCore::butterworthSectionQ (int order, int sectionIndex) noexcept
{
    const int n = xs::xmax (1, order);

    // Even orders split into n/2 conjugate pairs at pi(2i+1)/2n from the imaginary
    // axis; odd orders keep one real pole and put the pairs at pi(i+1)/n.
    const double theta = ((n & 1) == 0)
        ? xs::pi * (2.0 * (double) sectionIndex + 1.0) / (2.0 * (double) n)
        : xs::pi * ((double) sectionIndex + 1.0) / (double) n;

    const double c = std::cos (theta);
    return c > 1.0e-6 ? 1.0 / (2.0 * c) : 60.0;
}

void EqualizerXCore::designRecipe (EqShape shape, double freq, double gainDb, double q,
                                   int slope, double sampleRate, Recipe& out) noexcept
{
    for (int i = 0; i < maxBiquads; ++i)
        out.bq[i].setIdentity();

    out.fo.setIdentity();
    out.numBiquads = 0;
    out.hasFirstOrder = false;

    const double nyquist = sampleRate * 0.49;
    const double f = xs::xclamp (freq, (double) freqMin, xs::xmin ((double) freqMax, nyquist));
    const double qq = xs::xclamp (q, (double) qMin, (double) qMax);
    const double g = xs::xclamp (gainDb, (double) nodeGainMin, (double) nodeGainMax);

    switch (shape)
    {
        case EqShape::lowCut:
        case EqShape::highCut:
        {
            const int order = cutOrderForSlope (slope);
            out.numBiquads = xs::xmin (order / 2, maxBiquads);
            out.hasFirstOrder = (order & 1) != 0;

            for (int i = 0; i < out.numBiquads; ++i)
            {
                const double sectionQ = butterworthSectionQ (order, i);

                if (shape == EqShape::lowCut) out.bq[i].highPass (f, sectionQ, sampleRate);
                else                          out.bq[i].lowPass  (f, sectionQ, sampleRate);
            }

            if (out.hasFirstOrder)
            {
                if (shape == EqShape::lowCut) out.fo.setHighPass (f, sampleRate);
                else                          out.fo.setLowPass  (f, sampleRate);
            }

            break;
        }

        case EqShape::lowShelf:
            out.numBiquads = 1;
            out.bq[0].shelfBySlope (f, (double) slope, g, sampleRate, false);
            break;

        case EqShape::highShelf:
            out.numBiquads = 1;
            out.bq[0].shelfBySlope (f, (double) slope, g, sampleRate, true);
            break;

        case EqShape::notch:
            out.numBiquads = 1;
            out.bq[0].notch (f, qq, sampleRate);
            break;

        case EqShape::bandPass:
            out.numBiquads = 1;
            out.bq[0].bandPass (f, qq, sampleRate);
            break;

        case EqShape::bell:
        default:
            out.numBiquads = 1;
            out.bq[0].bell (f, qq, g, sampleRate);
            break;
    }
}

double EqualizerXCore::recipeMagnitudeSquared (const Recipe& r, double omega) noexcept
{
    double m = 1.0;

    for (int i = 0; i < r.numBiquads; ++i)
        m *= r.bq[i].magnitudeSquared (omega);

    if (r.hasFirstOrder)
        m *= r.fo.magnitudeSquared (omega);

    return m;
}

//==============================================================================
// Chain
//==============================================================================

void EqualizerXCore::Chain::reset() noexcept
{
    for (int i = 0; i < maxBiquads; ++i)
    {
        bq[i][0].reset();
        bq[i][1].reset();
    }

    fo[0].reset();
    fo[1].reset();
}

void EqualizerXCore::Chain::flush() noexcept
{
    for (int i = 0; i < numBiquads; ++i)
    {
        bq[i][0].flush();
        bq[i][1].flush();
    }

    if (hasFirstOrder)
    {
        fo[0].flush();
        fo[1].flush();
    }
}

void EqualizerXCore::Chain::applyRecipe (const Recipe& r) noexcept
{
    numBiquads = r.numBiquads;
    hasFirstOrder = r.hasFirstOrder;

    for (int i = 0; i < numBiquads; ++i)
    {
        bq[i][0].copyCoefficientsFrom (r.bq[i]);
        bq[i][1].copyCoefficientsFrom (r.bq[i]);
    }

    if (hasFirstOrder)
    {
        fo[0].copyCoefficientsFrom (r.fo);
        fo[1].copyCoefficientsFrom (r.fo);
    }
}

void EqualizerXCore::Chain::processStereo (float& l, float& r) noexcept
{
    for (int i = 0; i < numBiquads; ++i)
    {
        l = bq[i][0].process (l);
        r = bq[i][1].process (r);
    }

    if (hasFirstOrder)
    {
        l = fo[0].process (l);
        r = fo[1].process (r);
    }
}

//==============================================================================
// Lifecycle
//==============================================================================

void EqualizerXCore::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = newSampleRate > 1000.0 ? newSampleRate : 48000.0;
    maxBlock = xs::xmax (1, maxBlockSize);
    oversampler.prepare (4, maxBlock);
    oversampler.setFactor (factor);
    outputPeak.prepare (sampleRate, 0.14);
    updateRate();

    for (auto& nd : nodes)
    {
        nd.freq.snap (nd.freq.getTarget() > 0.0f ? nd.freq.getTarget() : 1000.0f);
        nd.gain.snap (nd.gain.getTarget());
        nd.q.snap (nd.q.getTarget() > 0.0f ? nd.q.getTarget() : 0.9f);
    }

    outputGain.snap (outputGain.getTarget() > 0.0f ? outputGain.getTarget() : 1.0f);
    reset();
}

void EqualizerXCore::updateRate() noexcept
{
    activeRate = sampleRate * (double) factor;

    for (auto& nd : nodes)
    {
        nd.freq.setTimeConstant (paramSmoothSec, activeRate);
        nd.gain.setTimeConstant (paramSmoothSec, activeRate);
        nd.q.setTimeConstant (paramSmoothSec, activeRate);
        nd.designed = false;
    }

    topoFadeInc = (float) (1.0 / xs::xmax (1.0, (double) shapeFadeSec * activeRate));
    levelInc = topoFadeInc;
    outputGain.setTimeConstant (outputSmoothSec, sampleRate);
}

void EqualizerXCore::reset() noexcept
{
    for (auto& nd : nodes)
    {
        nd.chain[0].reset();
        nd.chain[1].reset();
        nd.fade = 1.0f;
        nd.fading = false;
        nd.level = nd.levelTarget;
        nd.cleared = false;
        nd.designed = false;
        nd.shape = nd.targetShape;
        nd.slope = nd.targetSlope;
        nd.freq.snap();
        nd.gain.snap();
        nd.q.snap();
    }

    oversampler.reset();
    outputGain.snap();
    outputPeak.reset();
    inputMeanSquare = 1.0e-12f;
    outputMeanSquare = 1.0e-12f;
    autoGainDbZ = 0.0f;
    inputRmsDb.store (-120.0f, std::memory_order_relaxed);
    outputRmsDb.store (-120.0f, std::memory_order_relaxed);
    outputPeakDb.store (-120.0f, std::memory_order_relaxed);
    autoGainDb.store (0.0f, std::memory_order_relaxed);
}

void EqualizerXCore::setParams (const EqualizerXParams& p) noexcept
{
    int solo = -1;

    for (int i = 0; i < numNodes; ++i)
    {
        const auto& src = p.nodes[i];

        if (src.enabled && src.solo)
            solo = i;
    }

    for (int i = 0; i < numNodes; ++i)
    {
        const auto& src = p.nodes[i];
        Node& nd = nodes[i];

        nd.freq.setTarget (xs::xclamp (src.freq, freqMin, freqMax));
        nd.gain.setTarget (xs::xclamp (src.gain, nodeGainMin, nodeGainMax));
        nd.q.setTarget (xs::xclamp (src.q, qMin, qMax));
        nd.targetShape = src.shape;
        nd.targetSlope = src.slope;
        nd.enabled = src.enabled;
        nd.solo = src.solo;
        nd.levelTarget = (src.enabled && (solo < 0 || solo == i)) ? 1.0f : 0.0f;
    }

    outputGainDbTarget = xs::xclamp (p.outputGainDb, outputGainMinDb, outputGainMaxDb);
    outputGain.setTarget (xs::dbToGain (outputGainDbTarget));
    autoGainOn = p.autoGain;

    const int want = p.oversampling >= 4 ? 4 : (p.oversampling >= 2 ? 2 : 1);

    if (want != factor)
    {
        factor = want;
        oversampler.setFactor (factor);
        updateRate();

        for (auto& nd : nodes)
        {
            nd.chain[0].reset();
            nd.chain[1].reset();
            nd.fading = false;
            nd.fade = 1.0f;
            nd.freq.snap();
            nd.gain.snap();
            nd.q.snap();
        }
    }
}

//==============================================================================
// Coefficient update (chunk rate)
//==============================================================================

void EqualizerXCore::updateCoefficients (int numSamples) noexcept
{
    for (auto& nd : nodes)
    {
        const bool topoChanged = (nd.targetShape != nd.shape) || (nd.targetSlope != nd.slope);

        if (topoChanged)
        {
            // Snap the continuous parameters so the incoming topology starts at the
            // requested settings, then crossfade the two chains instead of resetting
            // state under the signal.
            nd.freq.snap();
            nd.gain.snap();
            nd.q.snap();
            nd.shape = nd.targetShape;
            nd.slope = nd.targetSlope;

            const int incoming = 1 - nd.active;
            designRecipe (nd.shape, (double) nd.freq.getCurrent(), (double) nd.gain.getCurrent(),
                          (double) nd.q.getCurrent(), nd.slope, activeRate, scratch);
            nd.chain[incoming].applyRecipe (scratch);
            nd.chain[incoming].reset();
            nd.active = incoming;
            nd.fade = 0.0f;
            nd.fading = true;
            nd.designed = true;
            continue;
        }

        nd.freq.nextBlock (numSamples);
        nd.gain.nextBlock (numSamples);
        nd.q.nextBlock (numSamples);

        if (nd.designed && nd.freq.settled() && nd.gain.settled() && nd.q.settled())
            continue;

        designRecipe (nd.shape, (double) nd.freq.getCurrent(), (double) nd.gain.getCurrent(),
                      (double) nd.q.getCurrent(), nd.slope, activeRate, scratch);
        nd.chain[nd.active].applyRecipe (scratch);
        nd.designed = true;
    }
}

//==============================================================================
// Audio
//==============================================================================

void EqualizerXCore::processNode (Node& nd, float& l, float& r,
                                  float fadeInc, float levelInc) noexcept
{
    if (nd.level != nd.levelTarget)
    {
        nd.level += nd.levelTarget > nd.level ? levelInc : -levelInc;
        nd.level = xs::xclamp (nd.level, 0.0f, 1.0f);
    }

    if (nd.level <= 0.0f)
    {
        if (! nd.cleared)
        {
            nd.chain[0].reset();
            nd.chain[1].reset();
            nd.fading = false;
            nd.fade = 1.0f;
            nd.cleared = true;
        }

        return;
    }

    nd.cleared = false;

    const float dryL = l;
    const float dryR = r;
    float wetL = l;
    float wetR = r;

    if (nd.fading)
    {
        float oldL = l;
        float oldR = r;
        nd.chain[1 - nd.active].processStereo (oldL, oldR);
        nd.chain[nd.active].processStereo (wetL, wetR);

        nd.fade += fadeInc;

        if (nd.fade >= 1.0f)
        {
            nd.fade = 1.0f;
            nd.fading = false;
        }

        wetL = oldL + (wetL - oldL) * nd.fade;
        wetR = oldR + (wetR - oldR) * nd.fade;
    }
    else
    {
        nd.chain[nd.active].processStereo (wetL, wetR);
    }

    l = dryL + (wetL - dryL) * nd.level;
    r = dryR + (wetR - dryR) * nd.level;
}

void EqualizerXCore::runCascade (float* left, float* right, int numSamples) noexcept
{
    int done = 0;

    while (done < numSamples)
    {
        const int chunk = xs::xmin (chunkSize, numSamples - done);
        updateCoefficients (chunk);

        const float fadeInc = topoFadeInc;
        const float lvlInc = levelInc;

        for (int i = done; i < done + chunk; ++i)
        {
            float xl = left[i];
            float xr = right[i];

            for (auto& nd : nodes)
                processNode (nd, xl, xr, fadeInc, lvlInc);

            left[i] = xs::finiteOrZero (xl);
            right[i] = xs::finiteOrZero (xr);
        }

        done += chunk;
    }

    for (auto& nd : nodes)
    {
        nd.chain[0].flush();
        nd.chain[1].flush();
    }
}

/*  Real-time guarantees for process():
      - no allocation, no locks, no I/O, no exceptions, no virtual dispatch
      - all buffers sized in prepare(); numSamples above maxBlockSize is chunked
      - every recursive state is denormal-flushed and NaN-guarded
*/
void EqualizerXCore::process (float* left, float* right, int numSamples) noexcept
{
    if (left == nullptr || numSamples < 1)
        return;

    if (right == nullptr)
        right = left;

    int done = 0;

    while (done < numSamples)
    {
        const int chunk = xs::xmin (maxBlock, numSamples - done);
        processChunk (left + done, right + done, chunk);
        done += chunk;
    }
}

void EqualizerXCore::processChunk (float* left, float* right, int numSamples) noexcept
{
    const double n2 = 2.0 * (double) numSamples;
    double inSum = 0.0;

    for (int i = 0; i < numSamples; ++i)
    {
        const float l = left[i];
        const float r = right[i];
        inSum += (double) l * l + (double) r * r;
    }

    oversampler.processBlock (left, right, numSamples,
                              [this] (float* l, float* r, int n) noexcept { runCascade (l, r, n); });

    double outSum = 0.0;

    for (int i = 0; i < numSamples; ++i)
    {
        const float l = left[i];
        const float r = right[i];
        outSum += (double) l * l + (double) r * r;
    }

    const float rmsA = (float) (1.0 - std::exp (-(double) numSamples / ((double) rmsWindowSec * sampleRate)));
    inputMeanSquare += ((float) (inSum / n2) - inputMeanSquare) * rmsA;
    outputMeanSquare += ((float) (outSum / n2) - outputMeanSquare) * rmsA;
    xs::flushDenormal (inputMeanSquare);
    xs::flushDenormal (outputMeanSquare);

    const float inDb = 10.0f * std::log10 (inputMeanSquare + 1.0e-12f);
    const float outDb = 10.0f * std::log10 (outputMeanSquare + 1.0e-12f);
    const float err = autoGainOn ? xs::xclamp (inDb - outDb, -autoGainClampDb, autoGainClampDb) : 0.0f;
    const float tau = err < autoGainDbZ ? 0.07f : 0.22f;
    const float aG = (float) (1.0 - std::exp (-(double) numSamples / ((double) tau * sampleRate)));
    autoGainDbZ += (err - autoGainDbZ) * aG;
    const float autoLin = xs::dbToGain (autoGainDbZ);

    float blockPeak = 0.0f;

    for (int i = 0; i < numSamples; ++i)
    {
        const float g = outputGain.next() * autoLin;
        const float l = xs::finiteOrZero (left[i] * g);
        const float r = xs::finiteOrZero (right[i] * g);
        left[i] = l;
        right[i] = r;
        const float p = xs::xmax (l < 0.0f ? -l : l, r < 0.0f ? -r : r);

        if (p > blockPeak)
            blockPeak = p;
    }

    outputPeak.processBlock (blockPeak, numSamples);

    inputRmsDb.store (inDb, std::memory_order_relaxed);
    outputRmsDb.store (outDb + xs::gainToDb (autoLin * outputGain.getCurrent()), std::memory_order_relaxed);
    outputPeakDb.store (xs::gainToDb (outputPeak.get()), std::memory_order_relaxed);
    autoGainDb.store (autoGainDbZ, std::memory_order_relaxed);
}

//==============================================================================
// Curve query
//==============================================================================

float EqualizerXCore::magnitudeDb (float freqHz) const noexcept
{
    const double sr = activeRate > 1000.0 ? activeRate : 48000.0;
    const double f = xs::xclamp ((double) freqHz, 0.01, sr * 0.4999);
    const double w = xs::twoPi * f / sr;
    double mag2 = 1.0;
    Recipe r;

    for (const auto& nd : nodes)
    {
        if (! nd.enabled)
            continue;

        designRecipe (nd.targetShape, (double) nd.freq.getTarget(), (double) nd.gain.getTarget(),
                      (double) nd.q.getTarget(), nd.targetSlope, sr, r);
        mag2 *= recipeMagnitudeSquared (r, w);
    }

    const double db = 10.0 * std::log10 (xs::xmax (1.0e-30, mag2));
    return (float) (db + (double) outputGainDbTarget);
}
