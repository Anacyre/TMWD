#include "MixerEngine.h"

MixerEngine::MixerEngine()
{
    masterChannel.targetGain.store (DawUnits::faderToGain (0.8f));
    masterChannel.currentGain = masterChannel.targetGain.load();
}

MixerEngine::InsertKind MixerEngine::kindFromSlot (const PluginSlot& slot)
{
    if (slot.bypassed || slot.isEmpty())
        return InsertKind::none;

    const auto id = slot.instrumentId.toLowerCase();
    const auto name = slot.name;

    if (id == "equalizer-x" || name.containsIgnoreCase ("equalizer"))
        return InsertKind::equalizer;
    if (id == "reverb-x" || name.containsIgnoreCase ("reverb"))
        return InsertKind::reverb;
    if (id == "boost-x" || name.containsIgnoreCase ("boost"))
        return InsertKind::boost;
    if (id == "dynamic-x" || name.containsIgnoreCase ("dynamic"))
        return InsertKind::dynamics;
    if (id == "limiter-x" || name.containsIgnoreCase ("limiter"))
        return InsertKind::limiter;

    return InsertKind::none;
}

void MixerEngine::prepareChain (InsertChain& chain)
{
    const auto sr = currentSampleRate > 0.0 ? currentSampleRate : 44100.0;
    chain.cachedHighPassHz = -1.0f;
    chain.cachedHighShelfDb = -1000.0f;
    chain.cachedReverbWet = -1.0f;
    chain.cachedReverbRoom = -1.0f;
    chain.cachedReverbDamp = -1.0f;

    for (int i = 0; i < 2; ++i)
    {
        chain.highPass[i].reset();
        chain.highShelf[i].reset();
        chain.env[i] = 0.0f;
    }

    chain.reverb.setSampleRate (sr);
    chain.reverb.reset();
}

MixerEngine::FxInsertParams* MixerEngine::getFxParamsForTrack (int trackIndex) noexcept
{
    if (trackIndex == 0)
        return &masterChannel.inserts.params;

    if (! juce::isPositiveAndBelow (trackIndex, maxChannels))
        return nullptr;

    return &channels[(size_t) trackIndex].inserts.params;
}

const MixerEngine::FxInsertParams* MixerEngine::getFxParamsForTrack (int trackIndex) const noexcept
{
    return const_cast<MixerEngine*> (this)->getFxParamsForTrack (trackIndex);
}

void MixerEngine::prepare (double sampleRate, int numChannelsInUse, int maximumBlockSize)
{
    currentSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    numChannels.store (juce::jlimit (0, maxChannels, numChannelsInUse));
    work.setSize (2, juce::jmax (2048, maximumBlockSize), false, false, true);

    smoothingCoefficient = (float) juce::jlimit (0.05, 1.0, 1.0 - std::exp (-64.0 / (0.012 * currentSampleRate)));
    meterDecay = (float) juce::jlimit (0.5, 0.999, std::exp (-64.0 / (0.25 * currentSampleRate)));
    compressorAttack = (float) juce::jlimit (0.002, 0.5, 1.0 - std::exp (-1.0 / (0.012 * currentSampleRate)));
    compressorRelease = (float) juce::jlimit (0.0005, 0.5, 1.0 - std::exp (-1.0 / (0.12 * currentSampleRate)));

    for (auto& channel : channels)
    {
        channel.currentGain = channel.targetGain.load();
        channel.currentPan = channel.targetPan.load();
        channel.meterLevel.store (0.0f);
        prepareChain (channel.inserts);
    }

    masterChannel.currentGain = masterChannel.targetGain.load();
    masterChannel.meterLevel.store (0.0f);
    prepareChain (masterChannel.inserts);
}

void MixerEngine::setNumChannels (int count)
{
    numChannels.store (juce::jlimit (0, maxChannels, count));
}

void MixerEngine::setChannelParameters (int index, float gainPosition, float pan, bool audible)
{
    if (! juce::isPositiveAndBelow (index, maxChannels))
        return;

    auto& channel = channels[(size_t) index];
    channel.targetGain.store (audible ? DawUnits::faderToGain (gainPosition) : 0.0f);
    channel.targetPan.store (juce::jlimit (-1.0f, 1.0f, pan));
}

void MixerEngine::setChannelInserts (int index, InsertKind slotA, InsertKind slotB)
{
    if (! juce::isPositiveAndBelow (index, maxChannels))
        return;

    auto& chain = channels[(size_t) index].inserts;
    chain.slotA.store ((int) slotA);
    chain.slotB.store ((int) slotB);
}

void MixerEngine::setMasterGain (float gainPosition)
{
    masterChannel.targetGain.store (DawUnits::faderToGain (gainPosition));
}

void MixerEngine::setMasterInserts (InsertKind slotA, InsertKind slotB)
{
    masterChannel.inserts.slotA.store ((int) slotA);
    masterChannel.inserts.slotB.store ((int) slotB);
}

float MixerEngine::getChannelLevel (int index) const
{
    if (! juce::isPositiveAndBelow (index, maxChannels))
        return 0.0f;

    return channels[(size_t) index].meterLevel.load();
}

float MixerEngine::getMasterLevel() const
{
    return masterChannel.meterLevel.load();
}

void MixerEngine::clearLevels()
{
    for (auto& channel : channels)
        channel.meterLevel.store (0.0f);

    masterChannel.meterLevel.store (0.0f);
}

//==============================================================================
void MixerEngine::updateMeter (std::atomic<float>& meter, float peak, float decay)
{
    const auto previous = meter.load();
    meter.store (peak > previous ? peak : previous * decay);
}

void MixerEngine::applyKind (InsertChain& chain, InsertKind kind, juce::AudioBuffer<float>& buffer, int numSamples)
{
    // X-series DSP, including Limiter X, runs in the browser AudioWorklet.
    juce::ignoreUnused (chain, kind, buffer, numSamples);
}

void MixerEngine::processInserts (InsertChain& chain, juce::AudioBuffer<float>& buffer, int numSamples)
{
    applyKind (chain, (InsertKind) chain.slotA.load(), buffer, numSamples);
    applyKind (chain, (InsertKind) chain.slotB.load(), buffer, numSamples);
}

void MixerEngine::mixChannel (int index, const juce::AudioBuffer<float>& source,
                              juce::AudioBuffer<float>& master, int numSamples)
{
    if (! juce::isPositiveAndBelow (index, maxChannels) || numSamples <= 0)
        return;

    auto& channel = channels[(size_t) index];

    if (work.getNumSamples() < numSamples)
        numSamples = work.getNumSamples();

    if (numSamples <= 0)
        return;

    work.clear();
    const auto copyChannels = juce::jmin (2, source.getNumChannels());

    for (int c = 0; c < copyChannels; ++c)
        work.copyFrom (c, 0, source, c, 0, numSamples);

    if (copyChannels == 1)
        work.copyFrom (1, 0, work, 0, 0, numSamples);

    processInserts (channel.inserts, work, numSamples);

    const auto startGain = channel.currentGain;
    const auto startPan = channel.currentPan;

    channel.currentGain += (channel.targetGain.load() - startGain)
        * (float) juce::jlimit (0.05, 1.0, 1.0 - std::exp (-(double) numSamples / (0.012 * currentSampleRate)));
    channel.currentPan += (channel.targetPan.load() - startPan)
        * (float) juce::jlimit (0.05, 1.0, 1.0 - std::exp (-(double) numSamples / (0.012 * currentSampleRate)));

    const auto panGains = [] (float pan, float gain, float& left, float& right)
    {
        const auto angle = (juce::jlimit (-1.0f, 1.0f, pan) + 1.0f) * 0.25f * juce::MathConstants<float>::pi;
        left = std::cos (angle) * gain;
        right = std::sin (angle) * gain;
    };

    float startLeft = 0.0f, startRight = 0.0f, endLeft = 0.0f, endRight = 0.0f;
    panGains (startPan, startGain, startLeft, startRight);
    panGains (channel.currentPan, channel.currentGain, endLeft, endRight);

    const auto numMasterChannels = master.getNumChannels();

    if (numMasterChannels <= 0)
        return;

    float peak = 0.0f;

    for (int destChannel = 0; destChannel < juce::jmin (2, numMasterChannels); ++destChannel)
    {
        const auto* sourceData = work.getReadPointer (destChannel);
        auto* destData = master.getWritePointer (destChannel);
        const auto start = destChannel == 0 ? startLeft : startRight;
        const auto end = destChannel == 0 ? endLeft : endRight;
        const auto step = (end - start) / (float) numSamples;
        auto gain = start;

        for (int i = 0; i < numSamples; ++i)
        {
            const auto value = sourceData[i] * gain;
            destData[i] += value;
            peak = juce::jmax (peak, std::abs (value));
            gain += step;
        }
    }

    updateMeter (channel.meterLevel, juce::jmin (1.0f, peak), meterDecay);
}

void MixerEngine::processMaster (juce::AudioBuffer<float>& master, int numSamples)
{
    if (numSamples <= 0)
        return;

    processInserts (masterChannel.inserts, master, numSamples);

    const auto startGain = masterChannel.currentGain;
    const auto coeff = (float) juce::jlimit (0.05, 1.0, 1.0 - std::exp (-(double) numSamples / (0.012 * currentSampleRate)));
    masterChannel.currentGain += (masterChannel.targetGain.load() - startGain) * coeff;

    master.applyGainRamp (0, numSamples, startGain, masterChannel.currentGain);

    float peak = 0.0f;
    double sumSq = 0.0;
    const auto channelsUsed = master.getNumChannels();

    for (int channel = 0; channel < channelsUsed; ++channel)
    {
        const auto* data = master.getReadPointer (channel);
        for (int i = 0; i < numSamples; ++i)
        {
            const auto value = data[i];
            peak = juce::jmax (peak, std::abs (value));
            sumSq += (double) value * (double) value;
        }
    }

    masterClip.store (peak > 1.0f);
    masterRms.store ((float) std::sqrt (sumSq / (double) juce::jmax (1, numSamples * juce::jmax (1, channelsUsed))));
    updateMeter (masterChannel.meterLevel, juce::jmin (1.0f, peak), meterDecay);

    if (peak > 8.0f)
        master.applyGain (8.0f / peak);
}
