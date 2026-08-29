#include "ReverbXPlugin.h"

#include "ReverbXEditor.h"



namespace

{

    juce::NormalisableRange<float> logRange (float min, float max, float centre)

    {

        juce::NormalisableRange<float> range { min, max };

        range.setSkewForCentre (centre);

        return range;

    }



    tmss::ReverbXVenue venueFromChoice (int choice)

    {

        switch (juce::jlimit (0, 7, choice))

        {

            case 0: return tmss::ReverbXVenue::SmallRoom;

            case 1: return tmss::ReverbXVenue::Studio;

            case 2: return tmss::ReverbXVenue::Chamber;

            case 3: return tmss::ReverbXVenue::Hall;

            case 5: return tmss::ReverbXVenue::Cathedral;

            case 6: return tmss::ReverbXVenue::LargeStage;

            case 7: return tmss::ReverbXVenue::Outdoor;

            default: return tmss::ReverbXVenue::ConcertHall;

        }

    }

}



juce::AudioProcessorValueTreeState::ParameterLayout ReverbXPlugin::createLayout()

{

    using namespace juce;

    AudioProcessorValueTreeState::ParameterLayout layout;



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.mix", 1 }, "Mix",

        NormalisableRange<float> { tmss::ReverbXCore::amountMin, tmss::ReverbXCore::amountMax, 0.01f },

        0.35f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.level", 1 }, "Amount",

        NormalisableRange<float> { tmss::ReverbXCore::levelMin, tmss::ReverbXCore::levelMax, 0.01f },

        0.65f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.decay", 1 }, "Time",

        logRange (tmss::ReverbXCore::decayMin, tmss::ReverbXCore::decayMax, 2.2f),

        2.2f, AudioParameterFloatAttributes()

                  .withLabel ("s")

                  .withStringFromValueFunction ([] (float v, int)

                  {

                      return juce::String (v, v < 1.0f ? 2 : 1) + " s";

                  })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.size", 1 }, "Size",

        NormalisableRange<float> { tmss::ReverbXCore::sizeMin, tmss::ReverbXCore::sizeMax, 0.01f },

        0.62f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.width", 1 }, "Width",

        NormalisableRange<float> { tmss::ReverbXCore::widthMin, tmss::ReverbXCore::widthMax, 0.01f },

        1.0f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.preDelay", 1 }, "Pre-Delay",

        logRange (0.0f, tmss::ReverbXCore::preDelayMaxMs, 20.0f),

        20.0f, AudioParameterFloatAttributes()

                   .withLabel ("ms")

                   .withStringFromValueFunction ([] (float v, int)

                   {

                       return v <= 0.5f ? juce::String ("Off") : juce::String (juce::roundToInt (v)) + " ms";

                   })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "reverb.damping", 1 }, "Damping",

        logRange (tmss::ReverbXCore::dampingMinHz, tmss::ReverbXCore::dampingMaxHz, 6200.0f),

        6200.0f, AudioParameterFloatAttributes()

                     .withLabel ("Hz")

                     .withStringFromValueFunction ([] (float v, int)

                     {

                         return v >= 1000.0f ? juce::String (v / 1000.0f, 1) + " kHz"

                                             : juce::String (juce::roundToInt (v)) + " Hz";

                     })));



    layout.add (std::make_unique<AudioParameterChoice> (

        ParameterID { "reverb.venue", 1 }, "Venue",

        StringArray { "Small Room", "Studio", "Chamber", "Hall", "Concert Hall", "Cathedral", "Large Stage", "Outdoor" },

        4));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "reverb.wetProcess", 1 }, "Wet Process", false));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "bypass", 1 }, "Bypass", false));



    return layout;

}



const std::vector<XPreset>& ReverbXPlugin::getFactoryPresets()

{

    static const std::vector<XPreset> presets {

        { "Concert Hall", {

            { "reverb.mix", 0.35f }, { "reverb.level", 0.65f }, { "reverb.decay", 2.8f },

            { "reverb.size", 0.82f }, { "reverb.width", 1.1f }, { "reverb.preDelay", 32.0f },

            { "reverb.damping", 6200.0f }, { "reverb.venue", 4.0f }

        } },

        { "Small Room", {

            { "reverb.mix", 0.28f }, { "reverb.level", 0.55f }, { "reverb.decay", 0.45f },

            { "reverb.size", 0.22f }, { "reverb.width", 0.8f }, { "reverb.preDelay", 8.0f },

            { "reverb.damping", 5200.0f }, { "reverb.venue", 0.0f }

        } },

        { "Cathedral", {

            { "reverb.mix", 0.38f }, { "reverb.level", 0.72f }, { "reverb.decay", 6.2f },

            { "reverb.size", 1.0f }, { "reverb.width", 1.0f }, { "reverb.preDelay", 48.0f },

            { "reverb.damping", 3800.0f }, { "reverb.venue", 5.0f }

        } },

        { "Hall", {

            { "reverb.mix", 0.32f }, { "reverb.level", 0.68f }, { "reverb.decay", 2.1f },

            { "reverb.size", 0.68f }, { "reverb.width", 1.15f }, { "reverb.preDelay", 26.0f },

            { "reverb.damping", 7800.0f }, { "reverb.venue", 3.0f }

        } },

        { "Outdoor", {

            { "reverb.mix", 0.20f }, { "reverb.level", 0.35f }, { "reverb.decay", 0.35f },

            { "reverb.size", 0.70f }, { "reverb.width", 1.5f }, { "reverb.preDelay", 42.0f },

            { "reverb.damping", 9000.0f }, { "reverb.venue", 7.0f }

        } }

    };

    return presets;

}



ReverbXPlugin::ReverbXPlugin()

    : juce::AudioProcessor (BusesProperties()

                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)

                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),

      apvts (*this, nullptr, "ReverbX", createLayout())

{

    mixParam = apvts.getRawParameterValue ("reverb.mix");

    levelParam = apvts.getRawParameterValue ("reverb.level");

    decayParam = apvts.getRawParameterValue ("reverb.decay");

    sizeParam = apvts.getRawParameterValue ("reverb.size");

    widthParam = apvts.getRawParameterValue ("reverb.width");

    preDelayParam = apvts.getRawParameterValue ("reverb.preDelay");

    dampingParam = apvts.getRawParameterValue ("reverb.damping");

    venueParam = apvts.getRawParameterValue ("reverb.venue");

    wetProcessParam = apvts.getRawParameterValue ("reverb.wetProcess");

    bypassParam = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));

}



void ReverbXPlugin::prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock)

{

    core.prepare (sampleRate, maximumExpectedSamplesPerBlock);

    pullParams();

}



void ReverbXPlugin::releaseResources()

{

    core.reset();

}



bool ReverbXPlugin::isBusesLayoutSupported (const BusesLayout& layouts) const

{

    const auto& out = layouts.getMainOutputChannelSet();

    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())

        return false;

    return layouts.getMainInputChannelSet() == out;

}



void ReverbXPlugin::pullParams() noexcept

{

    tmss::ReverbXParams next;

    next.amount = mixParam->load (std::memory_order_relaxed);

    next.reverbLevel = levelParam->load (std::memory_order_relaxed);

    next.decay = decayParam->load (std::memory_order_relaxed);

    next.size = sizeParam->load (std::memory_order_relaxed);

    next.width = widthParam->load (std::memory_order_relaxed);

    next.preDelayMs = preDelayParam->load (std::memory_order_relaxed);

    next.dampingHz = dampingParam->load (std::memory_order_relaxed);

    next.venue = venueFromChoice (static_cast<int> (venueParam->load (std::memory_order_relaxed)));

    next.wetProcess = wetProcessParam->load (std::memory_order_relaxed) > 0.5f;

    core.setParams (next);

}



void ReverbXPlugin::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)

{

    juce::ScopedNoDenormals noDenormals;



    const int numSamples = buffer.getNumSamples();

    const int numChannels = buffer.getNumChannels();

    for (int channel = numChannels; channel < getTotalNumOutputChannels(); ++channel)

        buffer.clear (channel, 0, numSamples);



    if (numSamples <= 0 || numChannels <= 0)

        return;



    pullParams();



    if (bypassParam != nullptr && bypassParam->get())

        return;



    float* left = buffer.getWritePointer (0);

    float* right = numChannels > 1 ? buffer.getWritePointer (1) : left;

    core.process (left, right, numSamples);

}



void ReverbXPlugin::processBlock (juce::AudioBuffer<double>& buffer, juce::MidiBuffer& midi)

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



int ReverbXPlugin::getNumPrograms()

{

    return static_cast<int> (getFactoryPresets().size());

}



void ReverbXPlugin::setCurrentProgram (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return;

    currentProgram = index;

    applyXPreset (apvts, presets[static_cast<std::size_t> (index)]);

}



const juce::String ReverbXPlugin::getProgramName (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return {};

    return presets[static_cast<std::size_t> (index)].name;

}



void ReverbXPlugin::getStateInformation (juce::MemoryBlock& destination)

{

    if (auto xml = apvts.copyState().createXml())

        copyXmlToBinary (*xml, destination);

}



void ReverbXPlugin::setStateInformation (const void* data, int sizeInBytes)

{

    if (auto xml = getXmlFromBinary (data, sizeInBytes))

        if (xml->hasTagName (apvts.state.getType()))

            apvts.replaceState (juce::ValueTree::fromXml (*xml));

}



juce::AudioProcessorEditor* ReverbXPlugin::createEditor()

{

    return new ReverbXEditor (*this);

}



juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()

{

    return new ReverbXPlugin();

}

