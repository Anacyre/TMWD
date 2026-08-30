#include "XSeriesInsert.h"

#include <algorithm>
#include <cmath>

namespace
{
    template <typename T>
    T clampTo (T value, T low, T high)
    {
        return value < low ? low : (value > high ? high : value);
    }

    int quantiseOversampling (float raw)
    {
        const auto n = (int) std::lround (raw);
        if (n >= 4) return 4;
        if (n >= 2) return 2;
        return 1;
    }
}

void XSeriesInsert::prepare (double newSampleRate, int maxBlockSize)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 48000.0;
    maxBlock = maxBlockSize > 0 ? maxBlockSize : 512;
    prepared.store (false, std::memory_order_release);

    if (eqOwned != nullptr) eqOwned->prepare (sampleRate, maxBlock);
    if (dynOwned != nullptr) dynOwned->prepare (sampleRate, maxBlock);
    if (boostOwned != nullptr) boostOwned->prepare (sampleRate, maxBlock);
    if (limiterOwned != nullptr) limiterOwned->prepare (sampleRate, maxBlock);
    if (reverbOwned != nullptr) reverbOwned->prepare (sampleRate, maxBlock);

    prepared.store (true, std::memory_order_release);
}

void XSeriesInsert::clearValues()
{
    for (int i = 0; i < maxValues; ++i)
        values[i].store (unset, std::memory_order_relaxed);
}

void XSeriesInsert::setValue (int index, float newValue)
{
    if (index < 0 || index >= maxValues)
        return;

    values[index].store (newValue, std::memory_order_relaxed);
}

void XSeriesInsert::setKind (Kind kind)
{
    // Allocate here, on the message thread, and keep the core for the lifetime of
    // the slot. Never freeing it means the audio thread's pointer can never dangle.
    switch (kind)
    {
        case Kind::equalizer:
            if (eqOwned == nullptr)
            {
                eqOwned = std::make_unique<EqualizerXCore>();
                eqOwned->prepare (sampleRate, maxBlock);
                eq.store (eqOwned.get(), std::memory_order_release);
            }
            break;

        case Kind::dynamics:
            if (dynOwned == nullptr)
            {
                dynOwned = std::make_unique<DynamicXCore>();
                dynOwned->prepare (sampleRate, maxBlock);
                dyn.store (dynOwned.get(), std::memory_order_release);
            }
            break;

        case Kind::boost:
            if (boostOwned == nullptr)
            {
                boostOwned = std::make_unique<BoostXCore>();
                boostOwned->prepare (sampleRate, maxBlock);
                boost.store (boostOwned.get(), std::memory_order_release);
            }
            break;

        case Kind::limiter:
            if (limiterOwned == nullptr)
            {
                limiterOwned = std::make_unique<LimiterXCore>();
                limiterOwned->prepare (sampleRate, maxBlock);
                limiter.store (limiterOwned.get(), std::memory_order_release);
            }
            break;

        case Kind::reverb:
            if (reverbOwned == nullptr)
            {
                reverbOwned = std::make_unique<ReverbXCore>();
                reverbOwned->prepare (sampleRate, maxBlock);
                reverb.store (reverbOwned.get(), std::memory_order_release);
            }
            break;

        case Kind::none:
        default:
            break;
    }

    kindIndex.store ((int) kind, std::memory_order_release);
}

void XSeriesInsert::reset() noexcept
{
    if (auto* core = eq.load (std::memory_order_acquire)) core->reset();
    if (auto* core = dyn.load (std::memory_order_acquire)) core->reset();
    if (auto* core = boost.load (std::memory_order_acquire)) core->reset();
    if (auto* core = limiter.load (std::memory_order_acquire)) core->reset();
    if (auto* core = reverb.load (std::memory_order_acquire)) core->reset();
}

float XSeriesInsert::value (int index, float fallback) const noexcept
{
    if (index < 0 || index >= maxValues)
        return fallback;

    const auto stored = values[index].load (std::memory_order_relaxed);
    return stored <= unset ? fallback : stored;
}

bool XSeriesInsert::flag (int index, bool fallback) const noexcept
{
    if (index < 0 || index >= maxValues)
        return fallback;

    const auto stored = values[index].load (std::memory_order_relaxed);
    return stored <= unset ? fallback : stored > 0.5f;
}

float XSeriesInsert::getGainReductionDb() const noexcept
{
    switch (getKind())
    {
        case Kind::dynamics:
            if (auto* core = dyn.load (std::memory_order_acquire)) return core->getGainReductionDb();
            break;
        case Kind::limiter:
            if (auto* core = limiter.load (std::memory_order_acquire)) return core->getGainReductionDb();
            break;
        default:
            break;
    }

    return 0.0f;
}

void XSeriesInsert::process (float* left, float* right, int numSamples) noexcept
{
    if (left == nullptr || right == nullptr || numSamples <= 0)
        return;

    if (! prepared.load (std::memory_order_acquire))
        return;

    switch (getKind())
    {
        case Kind::equalizer: applyEqualizer (left, right, numSamples); break;
        case Kind::dynamics:  applyDynamics (left, right, numSamples); break;
        case Kind::boost:     applyBoost (left, right, numSamples); break;
        case Kind::limiter:   applyLimiter (left, right, numSamples); break;
        case Kind::reverb:    applyReverb (left, right, numSamples); break;
        case Kind::none:
        default: break;
    }
}

void XSeriesInsert::applyEqualizer (float* left, float* right, int numSamples) noexcept
{
    auto* core = eq.load (std::memory_order_acquire);
    if (core == nullptr)
        return;

    EqualizerXParams params;

    for (int i = 0; i < equalizerXNumNodes; ++i)
    {
        const auto base = Eq::nodeBase + i * Eq::perNode;
        auto& node = params.nodes[i];
        node.freq = clampTo (value (base + 0, node.freq), 20.0f, 20000.0f);
        node.gain = clampTo (value (base + 1, node.gain), -18.0f, 18.0f);
        node.q = clampTo (value (base + 2, node.q), 0.2f, 12.0f);
        node.slope = clampTo ((int) std::lround (value (base + 3, (float) node.slope)), 6, 48);
        node.shape = (EqShape) clampTo ((int) std::lround (value (base + 4, (float) (int) node.shape)), 0, 6);
        node.enabled = flag (base + 5, node.enabled);
    }

    params.outputGainDb = clampTo (value (Eq::outputGainDb, 0.0f), -24.0f, 24.0f);
    params.autoGain = flag (Eq::autoGain, false);
    params.oversampling = quantiseOversampling (value (Eq::oversampling, 1.0f));

    core->setParams (params);
    core->process (left, right, numSamples);
}

void XSeriesInsert::applyDynamics (float* left, float* right, int numSamples) noexcept
{
    auto* core = dyn.load (std::memory_order_acquire);
    if (core == nullptr)
        return;

    DynamicXParams params;
    params.threshold = clampTo (value (Dyn::threshold, params.threshold), -48.0f, 0.0f);
    params.ratio = clampTo (value (Dyn::ratio, params.ratio), 1.0f, 20.0f);
    params.kneeDb = clampTo (value (Dyn::kneeDb, params.kneeDb), 0.0f, 24.0f);
    params.attack = clampTo (value (Dyn::attackSec, params.attack), 0.0002f, 0.2f);
    params.release = clampTo (value (Dyn::releaseSec, params.release), 0.02f, 1.5f);
    params.lookaheadMs = clampTo (value (Dyn::lookaheadMs, params.lookaheadMs), 0.0f, 10.0f);
    params.detector = (DynamicXDetector) clampTo ((int) std::lround (value (Dyn::detector, 0.0f)), 0, 1);
    params.rmsMs = clampTo (value (Dyn::rmsMs, params.rmsMs), 1.0f, 100.0f);
    params.mix = clampTo (value (Dyn::mix, params.mix), 0.0f, 1.0f);
    params.makeupDb = clampTo (value (Dyn::makeupDb, params.makeupDb), -12.0f, 24.0f);
    params.autoGain = flag (Dyn::autoGain, false);
    params.autoRelease = flag (Dyn::autoRelease, false);
    params.splitBands = flag (Dyn::splitBands, false);
    params.xo1 = clampTo (value (Dyn::xo1, params.xo1), 40.0f, 800.0f);
    params.xo2 = clampTo (value (Dyn::xo2, params.xo2), 800.0f, 12000.0f);

    for (int band = 0; band < 3; ++band)
    {
        const auto base = Dyn::bandBase + band * Dyn::perBand;
        auto& b = params.bands[band];
        b.enabled = flag (base + 0, b.enabled);
        b.solo = flag (base + 1, b.solo);
        b.threshold = clampTo (value (base + 2, b.threshold), -48.0f, 0.0f);
        b.ratio = clampTo (value (base + 3, b.ratio), 1.0f, 20.0f);
        b.makeupDb = clampTo (value (base + 4, b.makeupDb), -12.0f, 24.0f);
    }

    core->setParams (params);
    core->process (left, right, numSamples);
}

void XSeriesInsert::applyBoost (float* left, float* right, int numSamples) noexcept
{
    auto* core = boost.load (std::memory_order_acquire);
    if (core == nullptr)
        return;

    BoostXParams params;
    params.mode = (BoostXMode) clampTo ((int) std::lround (value (Boost::mode, 0.0f)), 0, 3);
    params.amount = clampTo (value (Boost::amount, params.amount), 0.0f, 1.0f);
    params.mix = clampTo (value (Boost::mix, params.mix), 0.0f, 1.0f);
    params.oversampling = quantiseOversampling (value (Boost::oversampling, 2.0f));
    params.hpfHz = clampTo (value (Boost::hpfHz, params.hpfHz), 0.0f, 400.0f);
    params.outputGainDb = clampTo (value (Boost::outputGainDb, 0.0f), -12.0f, 12.0f);
    params.character = (BoostXCharacter) clampTo ((int) std::lround (value (Boost::character, 0.0f)), 0, 8);

    core->setParams (params);
    core->process (left, right, numSamples);
}

void XSeriesInsert::applyLimiter (float* left, float* right, int numSamples) noexcept
{
    auto* core = limiter.load (std::memory_order_acquire);
    if (core == nullptr)
        return;

    LimiterXParams params;
    params.gainDb = clampTo (value (Lim::gainDb, 0.0f), -12.0f, 18.0f);
    params.ceilingDb = clampTo (value (Lim::ceilingDb, params.ceilingDb), -3.0f, 0.0f);
    params.releaseMs = clampTo (value (Lim::releaseMs, params.releaseMs), 10.0f, 1000.0f);
    params.lookaheadMs = clampTo (value (Lim::lookaheadMs, params.lookaheadMs), 0.0f, 5.0f);
    params.oversampling = quantiseOversampling (value (Lim::oversampling, 4.0f));
    params.truePeak = flag (Lim::truePeak, true);

    core->setParams (params);
    core->process (left, right, numSamples);
}

void XSeriesInsert::applyReverb (float* left, float* right, int numSamples) noexcept
{
    auto* core = reverb.load (std::memory_order_acquire);
    if (core == nullptr)
        return;

    ReverbXParams params;
    params.amount = clampTo (value (Rev::amount, params.amount), 0.0f, 1.0f);
    params.reverbLevel = clampTo (value (Rev::level, params.reverbLevel), 0.0f, 1.5f);
    params.decay = clampTo (value (Rev::decay, params.decay), 0.15f, 12.0f);
    params.size = clampTo (value (Rev::size, params.size), 0.0f, 1.0f);
    params.width = clampTo (value (Rev::width, params.width), 0.0f, 2.0f);
    params.preDelayMs = clampTo (value (Rev::preDelayMs, params.preDelayMs), 0.0f, 250.0f);
    params.dampingHz = clampTo (value (Rev::dampingHz, params.dampingHz), 500.0f, 20000.0f);
    params.venue = (ReverbXVenue) clampTo ((int) std::lround (value (Rev::venue, 4.0f)), 0, 7);
    params.wetProcess = flag (Rev::wetProcess, false);

    core->setParams (params);
    core->process (left, right, numSamples);
}
