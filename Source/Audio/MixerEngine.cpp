#include "MixerEngine.h"

MixerEngine::MixerEngine()
{
    masterChannel.targetGain.store (DawUnits::faderToGain (0.8f));
    masterChannel.currentGain = masterChannel.targetGain.load();
}

void MixerEngine::prepare (double sampleRate, int numChannelsInUse)
{
    numChannels.store (juce::jlimit (0, maxChannels, numChannelsInUse));

    // Roughly a 15 ms ramp and a 250 ms meter fall, expressed per block of 64 samples so
    // the constants stay stable across buffer sizes.
    const auto rate = sampleRate > 0.0 ? sampleRate : 44100.0;
    smoothingCoefficient = (float) juce::jlimit (0.005, 1.0, 64.0 / (0.015 * rate));
    meterDecay = (float) juce::jlimit (0.5, 0.999, std::exp (-64.0 / (0.25 * rate)));

    for (auto& channel : channels)
    {
        channel.currentGain = channel.targetGain.load();
        channel.currentPan = channel.targetPan.load();
        channel.meterLevel.store (0.0f);
    }

    masterChannel.currentGain = masterChannel.targetGain.load();
    masterChannel.meterLevel.store (0.0f);
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

void MixerEngine::setMasterGain (float gainPosition)
{
    masterChannel.targetGain.store (DawUnits::faderToGain (gainPosition));
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

void MixerEngine::mixChannel (int index, const juce::AudioBuffer<float>& source,
                              juce::AudioBuffer<float>& master, int numSamples)
{
    if (! juce::isPositiveAndBelow (index, maxChannels) || numSamples <= 0)
        return;

    auto& channel = channels[(size_t) index];

    const auto startGain = channel.currentGain;
    const auto startPan = channel.currentPan;

    channel.currentGain += (channel.targetGain.load() - startGain) * smoothingCoefficient;
    channel.currentPan += (channel.targetPan.load() - startPan) * smoothingCoefficient;

    // Equal-power pan, evaluated at the block edges and ramped across the block.
    const auto panGains = [] (float pan, float gain, float& left, float& right)
    {
        const auto angle = (juce::jlimit (-1.0f, 1.0f, pan) + 1.0f) * 0.25f * juce::MathConstants<float>::pi;
        left = std::cos (angle) * gain * juce::MathConstants<float>::sqrt2;
        right = std::sin (angle) * gain * juce::MathConstants<float>::sqrt2;
    };

    float startLeft = 0.0f, startRight = 0.0f, endLeft = 0.0f, endRight = 0.0f;
    panGains (startPan, startGain, startLeft, startRight);
    panGains (channel.currentPan, channel.currentGain, endLeft, endRight);

    const auto numSourceChannels = source.getNumChannels();
    const auto numMasterChannels = master.getNumChannels();

    if (numSourceChannels <= 0 || numMasterChannels <= 0)
        return;

    float peak = 0.0f;

    for (int destChannel = 0; destChannel < juce::jmin (2, numMasterChannels); ++destChannel)
    {
        const auto* sourceData = source.getReadPointer (juce::jmin (destChannel, numSourceChannels - 1));
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

    const auto startGain = masterChannel.currentGain;
    masterChannel.currentGain += (masterChannel.targetGain.load() - startGain) * smoothingCoefficient;

    master.applyGainRamp (0, numSamples, startGain, masterChannel.currentGain);

    float peak = 0.0f;

    for (int channel = 0; channel < master.getNumChannels(); ++channel)
        peak = juce::jmax (peak, master.getMagnitude (channel, 0, numSamples));

    updateMeter (masterChannel.meterLevel, juce::jmin (1.0f, peak), meterDecay);
}
