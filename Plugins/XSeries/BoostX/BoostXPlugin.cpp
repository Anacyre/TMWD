#include "BoostXPlugin.h"

#include "BoostXEditor.h"



namespace

{

    juce::NormalisableRange<float> logRange (float min, float max, float centre)

    {

        juce::NormalisableRange<float> range { min, max };

        range.setSkewForCentre (centre);

        return range;

    }



    tmss::BoostXMode modeFromChoice (int choice)

    {

        switch (juce::jlimit (0, 3, choice))

        {

            case 1: return tmss::BoostXMode::Expander;

            case 2: return tmss::BoostXMode::Chorus;

            case 3: return tmss::BoostXMode::Drive;

            default: return tmss::BoostXMode::Ott;

        }

    }

}



juce::AudioProcessorValueTreeState::ParameterLayout BoostXPlugin::createLayout()

{

    using namespace juce;

    AudioProcessorValueTreeState::ParameterLayout layout;



    layout.add (std::make_unique<AudioParameterChoice> (

        ParameterID { "boost.mode", 1 }, "Mode",

        StringArray { "OTT", "Wide", "Chorus", "Drive" }, 0));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "boost.amount", 1 }, "Boost",

        NormalisableRange<float> { 0.0f, 1.0f, 0.01f },

        0.35f, AudioParameterFloatAttributes()

                  .withStringFromValueFunction ([] (float v, int)

                  {

                      return juce::String (v * 2.0f, 2);

                  })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "boost.mix", 1 }, "Mix",

        NormalisableRange<float> { 0.0f, 1.0f, 0.01f },

        1.0f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterChoice> (

        ParameterID { "boost.oversampling", 1 }, "Oversampling",

        StringArray { "1x", "2x", "4x" }, 1));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "boost.hpfHz", 1 }, "High Pass",

        NormalisableRange<float> { 0.0f, 400.0f, 1.0f },

        50.0f, AudioParameterFloatAttributes()

                   .withLabel ("Hz")

                   .withStringFromValueFunction ([] (float v, int)

                   {

                       return v <= 0.5f ? juce::String ("Off") : juce::String (juce::roundToInt (v)) + " Hz";

                   })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "boost.outputGain", 1 }, "Output Gain",

        NormalisableRange<float> { -12.0f, 12.0f, 0.1f },

        0.0f, AudioParameterFloatAttributes().withLabel ("dB")));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "bypass", 1 }, "Bypass", false));



    return layout;

}



const std::vector<XPreset>& BoostXPlugin::getFactoryPresets()

{

    static const std::vector<XPreset> presets {

        { "Clean", { { "boost.mode", 0.0f }, { "boost.amount", 0.4f } } },

        { "Punch", { { "boost.mode", 0.0f }, { "boost.amount", 0.52f } } },

        { "Bright", { { "boost.mode", 0.0f }, { "boost.amount", 0.58f } } },

        { "Wide", { { "boost.mode", 1.0f }, { "boost.amount", 0.45f } } },

        { "Crunch", { { "boost.mode", 3.0f }, { "boost.amount", 0.62f }, { "boost.oversampling", 2.0f } } }

    };

    return presets;

}



BoostXPlugin::BoostXPlugin()

    : juce::AudioProcessor (BusesProperties()

                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)

                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),

      apvts (*this, nullptr, "BoostX", createLayout())

{

    modeParam = apvts.getRawParameterValue ("boost.mode");

    amountParam = apvts.getRawParameterValue ("boost.amount");

    mixParam = apvts.getRawParameterValue ("boost.mix");

    oversamplingParam = apvts.getRawParameterValue ("boost.oversampling");

    hpfParam = apvts.getRawParameterValue ("boost.hpfHz");

    outputGainParam = apvts.getRawParameterValue ("boost.outputGain");

    bypassParam = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));

}



void BoostXPlugin::prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock)

{

    core.prepare (sampleRate, maximumExpectedSamplesPerBlock);

    reportedLatency = -1;

    pullParams();

}



void BoostXPlugin::releaseResources()

{

    core.reset();

}



bool BoostXPlugin::isBusesLayoutSupported (const BusesLayout& layouts) const

{

    const auto& out = layouts.getMainOutputChannelSet();

    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())

        return false;

    return layouts.getMainInputChannelSet() == out;

}



void BoostXPlugin::pullParams() noexcept

{

    tmss::BoostXParams next;

    next.mode = modeFromChoice (static_cast<int> (modeParam->load (std::memory_order_relaxed)));

    next.amount = amountParam->load (std::memory_order_relaxed);

    next.mix = mixParam->load (std::memory_order_relaxed);

    next.hpfHz = hpfParam->load (std::memory_order_relaxed);

    next.outputGainDb = outputGainParam->load (std::memory_order_relaxed);



    const int osChoice = static_cast<int> (oversamplingParam->load (std::memory_order_relaxed));

    next.oversampling = osChoice >= 2 ? 4 : (osChoice == 1 ? 2 : 1);



    core.setParams (next);

}



void BoostXPlugin::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)

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



void BoostXPlugin::processBlock (juce::AudioBuffer<double>& buffer, juce::MidiBuffer& midi)

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



int BoostXPlugin::getNumPrograms()

{

    return static_cast<int> (getFactoryPresets().size());

}



void BoostXPlugin::setCurrentProgram (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return;

    currentProgram = index;

    applyXPreset (apvts, presets[static_cast<std::size_t> (index)]);

}



const juce::String BoostXPlugin::getProgramName (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return {};

    return presets[static_cast<std::size_t> (index)].name;

}



void BoostXPlugin::getStateInformation (juce::MemoryBlock& destination)

{

    if (auto xml = apvts.copyState().createXml())

        copyXmlToBinary (*xml, destination);

}



void BoostXPlugin::setStateInformation (const void* data, int sizeInBytes)

{

    if (auto xml = getXmlFromBinary (data, sizeInBytes))

        if (xml->hasTagName (apvts.state.getType()))

            apvts.replaceState (juce::ValueTree::fromXml (*xml));

}



juce::AudioProcessorEditor* BoostXPlugin::createEditor()

{

    return new BoostXEditor (*this);

}



juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()

{

    return new BoostXPlugin();

}

