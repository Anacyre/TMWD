#include "LimiterXPlugin.h"
#include "LimiterXEditor.h"

namespace
{
    juce::String formatDb (float value, int decimals)
    {
        return juce::String (value, decimals) + " dB";
    }

    juce::String formatMs (float value, int decimals)
    {
        return juce::String (value, decimals) + " ms";
    }

    /** Skewed range whose midpoint sits at `centre`, matching the web knob's log scaling. */
    juce::NormalisableRange<float> logRange (float min, float max, float centre)
    {
        juce::NormalisableRange<float> range { min, max };
        range.setSkewForCentre (centre);
        return range;
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout LimiterXPlugin::createLayout()
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add (std::make_unique<AudioParameterFloat> (
        ParameterID { "limiter.gain", 1 }, "Gain",
        NormalisableRange<float> { tmss::LimiterXCore::gainMinDb, tmss::LimiterXCore::gainMaxDb, 0.1f },
        0.0f, AudioParameterFloatAttributes()
                  .withLabel ("dB")
                  .withStringFromValueFunction ([] (float v, int) { return formatDb (v, 1); })));

    layout.add (std::make_unique<AudioParameterFloat> (
        ParameterID { "limiter.ceiling", 1 }, "Ceiling",
        NormalisableRange<float> { tmss::LimiterXCore::ceilingMinDb, tmss::LimiterXCore::ceilingMaxDb, 0.01f },
        -0.1f, AudioParameterFloatAttributes()
                   .withLabel ("dB")
                   .withStringFromValueFunction ([] (float v, int) { return formatDb (v, 2); })));

    layout.add (std::make_unique<AudioParameterFloat> (
        ParameterID { "limiter.release", 1 }, "Release",
        logRange (tmss::LimiterXCore::releaseMinMs, tmss::LimiterXCore::releaseMaxMs, 100.0f),
        100.0f, AudioParameterFloatAttributes()
                    .withLabel ("ms")
                    .withStringFromValueFunction ([] (float v, int)
                    {
                        return v < 10.0f ? formatMs (v, 1) : juce::String (roundToInt (v)) + " ms";
                    })));

    layout.add (std::make_unique<AudioParameterFloat> (
        ParameterID { "limiter.lookahead", 1 }, "Lookahead",
        NormalisableRange<float> { 0.0f, tmss::LimiterXCore::lookaheadMaxMs, 0.05f },
        1.5f, AudioParameterFloatAttributes()
                  .withLabel ("ms")
                  .withStringFromValueFunction ([] (float v, int)
                  {
                      return v <= 0.001f ? juce::String ("Off") : formatMs (v, 2);
                  })));

    layout.add (std::make_unique<AudioParameterChoice> (
        ParameterID { "limiter.oversampling", 1 }, "Oversampling",
        StringArray { "1x", "2x", "4x" }, 2));

    layout.add (std::make_unique<AudioParameterBool> (
        ParameterID { "limiter.truePeak", 1 }, "True Peak", true));

    layout.add (std::make_unique<AudioParameterBool> (
        ParameterID { "bypass", 1 }, "Bypass", false));

    return layout;
}

const std::vector<XPreset>& LimiterXPlugin::getFactoryPresets()
{
    // Mirrors the `limiter-x` presets in the web registry.
    static const std::vector<XPreset> presets {
        { "Default",     { { "limiter.gain", 0.0f },  { "limiter.ceiling", -0.1f }, { "limiter.release", 100.0f }, { "limiter.lookahead", 1.5f } } },
        { "Transparent", { { "limiter.gain", 0.0f },  { "limiter.ceiling", -0.3f }, { "limiter.release", 240.0f }, { "limiter.lookahead", 3.0f } } },
        { "Loud",        { { "limiter.gain", 6.0f },  { "limiter.ceiling", -0.1f }, { "limiter.release", 60.0f },  { "limiter.lookahead", 1.5f } } },
        { "Streaming",   { { "limiter.gain", 2.0f },  { "limiter.ceiling", -1.0f }, { "limiter.release", 180.0f }, { "limiter.lookahead", 2.5f } } },
        { "Safety",      { { "limiter.gain", 0.0f },  { "limiter.ceiling", -0.1f }, { "limiter.release", 400.0f }, { "limiter.lookahead", 0.0f } } }
    };
    return presets;
}

LimiterXPlugin::LimiterXPlugin()
    : juce::AudioProcessor (BusesProperties()
                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      state (*this, nullptr, "LimiterX", createLayout())
{
    gainParam = state.getRawParameterValue ("limiter.gain");
    ceilingParam = state.getRawParameterValue ("limiter.ceiling");
    releaseParam = state.getRawParameterValue ("limiter.release");
    lookaheadParam = state.getRawParameterValue ("limiter.lookahead");
    oversamplingParam = state.getRawParameterValue ("limiter.oversampling");
    truePeakParam = state.getRawParameterValue ("limiter.truePeak");
    bypassParam = dynamic_cast<juce::AudioParameterBool*> (state.getParameter ("bypass"));
}

void LimiterXPlugin::prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock)
{
    core.prepare (sampleRate, maximumExpectedSamplesPerBlock);
    monoScratch.setSize (1, juce::jmax (1, maximumExpectedSamplesPerBlock));
    reportedLatency = -1;
    pullParams();
}

void LimiterXPlugin::releaseResources()
{
    core.reset();
}

bool LimiterXPlugin::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainInputChannelSet() == out;
}

void LimiterXPlugin::pullParams() noexcept
{
    tmss::LimiterXParams next;
    next.gainDb = gainParam->load (std::memory_order_relaxed);
    next.ceilingDb = ceilingParam->load (std::memory_order_relaxed);
    next.releaseMs = releaseParam->load (std::memory_order_relaxed);
    next.lookaheadMs = lookaheadParam->load (std::memory_order_relaxed);
    next.truePeak = truePeakParam->load (std::memory_order_relaxed) > 0.5f;

    const int choice = static_cast<int> (oversamplingParam->load (std::memory_order_relaxed));
    next.oversampling = choice >= 2 ? 4 : (choice == 1 ? 2 : 1);

    core.setParams (next);
    active = next;
}

void LimiterXPlugin::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();
    for (int channel = numChannels; channel < getTotalNumOutputChannels(); ++channel)
        buffer.clear (channel, 0, numSamples);

    if (numSamples <= 0 || numChannels <= 0)
        return;

    pullParams();

    // Latency changes only when lookahead does, so the host is told once per change.
    const int latency = core.getLatencySamples();
    if (latency != reportedLatency)
    {
        reportedLatency = latency;
        setLatencySamples (latency);
    }

    if (bypassParam != nullptr && bypassParam->get())
        return;

    float* left = buffer.getWritePointer (0);
    float* right = numChannels > 1 ? buffer.getWritePointer (1) : left;
    core.process (left, right, numSamples);
}

void LimiterXPlugin::processBlock (juce::AudioBuffer<double>& buffer, juce::MidiBuffer& midi)
{
    // The core is single precision; convert rather than refuse to run.
    juce::AudioBuffer<float> temp (buffer.getNumChannels(), buffer.getNumSamples());
    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
    {
        const double* source = buffer.getReadPointer (channel);
        float* destination = temp.getWritePointer (channel);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            destination[i] = static_cast<float> (source[i]);
    }

    processBlock (temp, midi);

    for (int channel = 0; channel < buffer.getNumChannels(); ++channel)
    {
        const float* source = temp.getReadPointer (channel);
        double* destination = buffer.getWritePointer (channel);
        for (int i = 0; i < buffer.getNumSamples(); ++i)
            destination[i] = static_cast<double> (source[i]);
    }
}

int LimiterXPlugin::getNumPrograms()
{
    return static_cast<int> (getFactoryPresets().size());
}

void LimiterXPlugin::setCurrentProgram (int index)
{
    const auto& presets = getFactoryPresets();
    if (index < 0 || index >= static_cast<int> (presets.size()))
        return;
    currentProgram = index;
    applyXPreset (state, presets[static_cast<std::size_t> (index)]);
}

const juce::String LimiterXPlugin::getProgramName (int index)
{
    const auto& presets = getFactoryPresets();
    if (index < 0 || index >= static_cast<int> (presets.size()))
        return {};
    return presets[static_cast<std::size_t> (index)].name;
}

void LimiterXPlugin::getStateInformation (juce::MemoryBlock& destination)
{
    if (auto xml = state.copyState().createXml())
        copyXmlToBinary (*xml, destination);
}

void LimiterXPlugin::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (state.state.getType()))
            state.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* LimiterXPlugin::createEditor()
{
    return new LimiterXEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new LimiterXPlugin();
}
