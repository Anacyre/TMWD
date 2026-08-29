#include "EqualizerXPlugin.h"
#include "EqualizerXEditor.h"

namespace
{
    juce::String nodeId (int index, const char* suffix)
    {
        return "eq.node" + juce::String (index + 1) + "." + suffix;
    }

    juce::NormalisableRange<float> logRange (float min, float max, float centre)
    {
        juce::NormalisableRange<float> range { min, max };
        range.setSkewForCentre (centre);
        return range;
    }

    EqShape shapeFromChoice (int choice)
    {
        switch (juce::jlimit (0, 6, choice))
        {
            case 0: return EqShape::lowCut;
            case 1: return EqShape::lowShelf;
            case 2: return EqShape::bell;
            case 3: return EqShape::notch;
            case 4: return EqShape::highShelf;
            case 5: return EqShape::highCut;
            default: return EqShape::bandPass;
        }
    }

    int choiceFromShape (EqShape shape)
    {
        switch (shape)
        {
            case EqShape::lowCut: return 0;
            case EqShape::lowShelf: return 1;
            case EqShape::bell: return 2;
            case EqShape::notch: return 3;
            case EqShape::highShelf: return 4;
            case EqShape::highCut: return 5;
            case EqShape::bandPass: return 6;
        }
        return 2;
    }

    int slopeFromChoice (int choice)
    {
        static constexpr int steps[] { 6, 12, 18, 24, 30, 36, 48 };
        return steps[juce::jlimit (0, 6, choice)];
    }
}

juce::AudioProcessorValueTreeState::ParameterLayout EqualizerXPlugin::createLayout()
{
    using namespace juce;
    AudioProcessorValueTreeState::ParameterLayout layout;

    layout.add (std::make_unique<AudioParameterFloat> (
        ParameterID { "eq.outputGain", 1 }, "Output Gain",
        NormalisableRange<float> { EqualizerXCore::outputGainMinDb, EqualizerXCore::outputGainMaxDb, 0.1f },
        0.0f, AudioParameterFloatAttributes().withLabel ("dB")));

    layout.add (std::make_unique<AudioParameterBool> (
        ParameterID { "eq.autoGain", 1 }, "Auto Gain", false));

    layout.add (std::make_unique<AudioParameterChoice> (
        ParameterID { "eq.oversampling", 1 }, "Oversampling",
        StringArray { "1x", "2x", "4x" }, 0));

    layout.add (std::make_unique<AudioParameterBool> (
        ParameterID { "bypass", 1 }, "Bypass", false));

    static const char* shapeLabels[] = { "Low Cut", "Low Shelf", "Peak", "Notch", "High Shelf", "High Cut", "Band Pass" };

    for (int i = 0; i < EqualizerXCore::numNodes; ++i)
    {
        layout.add (std::make_unique<AudioParameterFloat> (
            ParameterID { nodeId (i, "frequency"), 1 }, "Node " + juce::String (i + 1) + " Frequency",
            logRange (EqualizerXCore::freqMin, EqualizerXCore::freqMax, 1000.0f),
            i == 0 ? 1000.0f : 1000.0f));

        layout.add (std::make_unique<AudioParameterFloat> (
            ParameterID { nodeId (i, "gain"), 1 }, "Node " + juce::String (i + 1) + " Gain",
            NormalisableRange<float> { EqualizerXCore::nodeGainMin, EqualizerXCore::nodeGainMax, 0.1f },
            0.0f, AudioParameterFloatAttributes().withLabel ("dB")));

        layout.add (std::make_unique<AudioParameterFloat> (
            ParameterID { nodeId (i, "q"), 1 }, "Node " + juce::String (i + 1) + " Q",
            logRange (EqualizerXCore::qMin, EqualizerXCore::qMax, 0.9f),
            0.9f));

        layout.add (std::make_unique<AudioParameterChoice> (
            ParameterID { nodeId (i, "slope"), 1 }, "Node " + juce::String (i + 1) + " Slope",
            StringArray { "6", "12", "18", "24", "30", "36", "48" }, 1));

        StringArray shapes;
        for (const auto* label : shapeLabels)
            shapes.add (label);

        layout.add (std::make_unique<AudioParameterChoice> (
            ParameterID { nodeId (i, "shape"), 1 }, "Node " + juce::String (i + 1) + " Shape",
            shapes, 2));

        layout.add (std::make_unique<AudioParameterBool> (
            ParameterID { nodeId (i, "enabled"), 1 }, "Node " + juce::String (i + 1) + " Enabled",
            i == 0));

        layout.add (std::make_unique<AudioParameterBool> (
            ParameterID { nodeId (i, "solo"), 1 }, "Node " + juce::String (i + 1) + " Solo",
            false));
    }

    return layout;
}

const std::vector<XPreset>& EqualizerXPlugin::getFactoryPresets()
{
    static const std::vector<XPreset> presets {
        { "Default", {
            { nodeId (0, "frequency"), 1000.0f },
            { nodeId (0, "enabled"), 1.0f }
        } },
        { "Vocal-ish", {
            { nodeId (0, "frequency"), 80.0f }, { nodeId (0, "shape"), 0.0f }, { nodeId (0, "slope"), 1.0f }, { nodeId (0, "enabled"), 1.0f },
            { nodeId (1, "frequency"), 220.0f }, { nodeId (1, "gain"), -2.5f }, { nodeId (1, "enabled"), 1.0f },
            { nodeId (2, "frequency"), 3200.0f }, { nodeId (2, "gain"), 2.0f }, { nodeId (2, "enabled"), 1.0f },
            { nodeId (3, "frequency"), 11000.0f }, { nodeId (3, "gain"), 1.5f }, { nodeId (3, "shape"), 4.0f }, { nodeId (3, "slope"), 1.0f }, { nodeId (3, "enabled"), 1.0f }
        } },
        { "Warm", {
            { nodeId (0, "frequency"), 120.0f }, { nodeId (0, "gain"), 2.2f }, { nodeId (0, "shape"), 1.0f }, { nodeId (0, "slope"), 1.0f }, { nodeId (0, "enabled"), 1.0f },
            { nodeId (1, "frequency"), 4500.0f }, { nodeId (1, "gain"), -1.5f }, { nodeId (1, "enabled"), 1.0f }
        } },
        { "Bright", {
            { nodeId (0, "frequency"), 9000.0f }, { nodeId (0, "gain"), 2.5f }, { nodeId (0, "shape"), 4.0f }, { nodeId (0, "slope"), 1.0f }, { nodeId (0, "enabled"), 1.0f },
            { nodeId (1, "frequency"), 250.0f }, { nodeId (1, "gain"), -1.0f }, { nodeId (1, "enabled"), 1.0f }
        } }
    };
    return presets;
}

EqualizerXPlugin::EqualizerXPlugin()
    : juce::AudioProcessor (BusesProperties()
                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)
                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),
      apvts (*this, nullptr, "EqualizerX", createLayout())
{
    for (int i = 0; i < EqualizerXCore::numNodes; ++i)
    {
        freqParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "frequency"));
        gainParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "gain"));
        qParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "q"));
        slopeParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "slope"));
        shapeParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "shape"));
        enabledParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "enabled"));
        soloParams[static_cast<std::size_t> (i)] = apvts.getRawParameterValue (nodeId (i, "solo"));
    }

    outputGainParam = apvts.getRawParameterValue ("eq.outputGain");
    autoGainParam = apvts.getRawParameterValue ("eq.autoGain");
    oversamplingParam = apvts.getRawParameterValue ("eq.oversampling");
    bypassParam = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));
}

void EqualizerXPlugin::prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock)
{
    core.prepare (sampleRate, maximumExpectedSamplesPerBlock);
    reportedLatency = -1;
    pullParams();
}

void EqualizerXPlugin::releaseResources()
{
    core.reset();
}

bool EqualizerXPlugin::isBusesLayoutSupported (const BusesLayout& layouts) const
{
    const auto& out = layouts.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())
        return false;
    return layouts.getMainInputChannelSet() == out;
}

void EqualizerXPlugin::pullParams() noexcept
{
    EqualizerXParams next {};

    for (int i = 0; i < EqualizerXCore::numNodes; ++i)
    {
        auto& node = next.nodes[i];
        node.freq = freqParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed);
        node.gain = gainParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed);
        node.q = qParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed);
        node.slope = slopeFromChoice (static_cast<int> (slopeParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed)));
        node.shape = shapeFromChoice (static_cast<int> (shapeParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed)));
        node.enabled = enabledParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed) > 0.5f;
        node.solo = soloParams[static_cast<std::size_t> (i)]->load (std::memory_order_relaxed) > 0.5f;
    }

    next.outputGainDb = outputGainParam->load (std::memory_order_relaxed);
    next.autoGain = autoGainParam->load (std::memory_order_relaxed) > 0.5f;

    const int osChoice = static_cast<int> (oversamplingParam->load (std::memory_order_relaxed));
    next.oversampling = osChoice >= 2 ? 4 : (osChoice == 1 ? 2 : 1);

    core.setParams (next);
}

void EqualizerXPlugin::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals noDenormals;

    const int numSamples = buffer.getNumSamples();
    const int numChannels = buffer.getNumChannels();
    for (int channel = numChannels; channel < getTotalNumOutputChannels(); ++channel)
        buffer.clear (channel, 0, numSamples);

    if (numSamples <= 0 || numChannels <= 0)
        return;

    pullParams();

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

void EqualizerXPlugin::processBlock (juce::AudioBuffer<double>& buffer, juce::MidiBuffer& midi)
{
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

int EqualizerXPlugin::getNumPrograms()
{
    return static_cast<int> (getFactoryPresets().size());
}

void EqualizerXPlugin::setCurrentProgram (int index)
{
    const auto& presets = getFactoryPresets();
    if (index < 0 || index >= static_cast<int> (presets.size()))
        return;
    currentProgram = index;
    applyXPreset (apvts, presets[static_cast<std::size_t> (index)]);
}

const juce::String EqualizerXPlugin::getProgramName (int index)
{
    const auto& presets = getFactoryPresets();
    if (index < 0 || index >= static_cast<int> (presets.size()))
        return {};
    return presets[static_cast<std::size_t> (index)].name;
}

void EqualizerXPlugin::getStateInformation (juce::MemoryBlock& destination)
{
    if (auto xml = apvts.copyState().createXml())
        copyXmlToBinary (*xml, destination);
}

void EqualizerXPlugin::setStateInformation (const void* data, int sizeInBytes)
{
    if (auto xml = getXmlFromBinary (data, sizeInBytes))
        if (xml->hasTagName (apvts.state.getType()))
            apvts.replaceState (juce::ValueTree::fromXml (*xml));
}

juce::AudioProcessorEditor* EqualizerXPlugin::createEditor()
{
    return new EqualizerXEditor (*this);
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()
{
    return new EqualizerXPlugin();
}
