#include "DynamicXPlugin.h"

#include "DynamicXEditor.h"



namespace

{

    juce::String bandId (int band, const char* suffix)

    {

        return "dynamic.band" + juce::String (band + 1) + "." + suffix;

    }



    juce::NormalisableRange<float> logRange (float min, float max, float centre)

    {

        juce::NormalisableRange<float> range { min, max };

        range.setSkewForCentre (centre);

        return range;

    }

}



juce::AudioProcessorValueTreeState::ParameterLayout DynamicXPlugin::createLayout()

{

    using namespace juce;

    AudioProcessorValueTreeState::ParameterLayout layout;



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.threshold", 1 }, "Threshold",

        NormalisableRange<float> { -48.0f, 0.0f, 0.1f },

        -18.0f, AudioParameterFloatAttributes().withLabel ("dB")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.ratio", 1 }, "Ratio",

        logRange (1.0f, 20.0f, 4.0f),

        4.0f, AudioParameterFloatAttributes()

                  .withStringFromValueFunction ([] (float v, int)

                  {

                      return juce::String (v, v >= 10.0f ? 0 : 1) + ":1";

                  })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.knee", 1 }, "Knee",

        NormalisableRange<float> { 0.0f, 24.0f, 0.1f },

        6.0f, AudioParameterFloatAttributes().withLabel ("dB")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.attack", 1 }, "Attack",

        logRange (0.0002f, 0.2f, 0.012f),

        0.012f, AudioParameterFloatAttributes()

                    .withLabel ("s")

                    .withStringFromValueFunction ([] (float v, int)

                    {

                        return v < 0.001f ? juce::String (v * 1000.0f, 2) + " ms"

                                          : juce::String (v * 1000.0f, 1) + " ms";

                    })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.release", 1 }, "Release",

        logRange (0.02f, 1.5f, 0.12f),

        0.12f, AudioParameterFloatAttributes()

                   .withLabel ("s")

                   .withStringFromValueFunction ([] (float v, int)

                   {

                       return juce::String (v * 1000.0f, 0) + " ms";

                   })));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.lookahead", 1 }, "Lookahead",

        NormalisableRange<float> { 0.0f, 10.0f, 0.05f },

        0.0f, AudioParameterFloatAttributes()

                  .withLabel ("ms")

                  .withStringFromValueFunction ([] (float v, int)

                  {

                      return v <= 0.001f ? juce::String ("Off") : juce::String (v, 2) + " ms";

                  })));



    layout.add (std::make_unique<AudioParameterChoice> (

        ParameterID { "dynamic.detector", 1 }, "Detector",

        StringArray { "Peak", "RMS" }, 0));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.rmsMs", 1 }, "RMS Window",

        logRange (1.0f, 100.0f, 10.0f),

        10.0f, AudioParameterFloatAttributes().withLabel ("ms")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.mix", 1 }, "Mix",

        NormalisableRange<float> { 0.0f, 1.0f, 0.01f },

        1.0f, AudioParameterFloatAttributes().withLabel ("%")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.makeup", 1 }, "Makeup Gain",

        NormalisableRange<float> { -12.0f, 24.0f, 0.1f },

        0.0f, AudioParameterFloatAttributes().withLabel ("dB")));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "dynamic.autoGain", 1 }, "Auto Gain", false));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "dynamic.autoRelease", 1 }, "Auto Release", false));



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "dynamic.splitBands", 1 }, "Split Bands", false));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.xo1", 1 }, "Crossover 1",

        logRange (40.0f, 800.0f, 180.0f),

        180.0f, AudioParameterFloatAttributes().withLabel ("Hz")));



    layout.add (std::make_unique<AudioParameterFloat> (

        ParameterID { "dynamic.xo2", 1 }, "Crossover 2",

        logRange (800.0f, 12000.0f, 3500.0f),

        3500.0f, AudioParameterFloatAttributes().withLabel ("Hz")));



    for (int i = 0; i < 3; ++i)

    {

        layout.add (std::make_unique<AudioParameterBool> (

            ParameterID { bandId (i, "enabled"), 1 }, "Band " + juce::String (i + 1) + " Enable", true));



        layout.add (std::make_unique<AudioParameterBool> (

            ParameterID { bandId (i, "solo"), 1 }, "Band " + juce::String (i + 1) + " Solo", false));



        layout.add (std::make_unique<AudioParameterFloat> (

            ParameterID { bandId (i, "threshold"), 1 }, "Band " + juce::String (i + 1) + " Threshold",

            NormalisableRange<float> { -48.0f, 0.0f, 0.1f }, -18.0f,

            AudioParameterFloatAttributes().withLabel ("dB")));



        layout.add (std::make_unique<AudioParameterFloat> (

            ParameterID { bandId (i, "ratio"), 1 }, "Band " + juce::String (i + 1) + " Ratio",

            logRange (1.0f, 20.0f, 4.0f), 4.0f));



        layout.add (std::make_unique<AudioParameterFloat> (

            ParameterID { bandId (i, "makeup"), 1 }, "Band " + juce::String (i + 1) + " Makeup",

            NormalisableRange<float> { -12.0f, 24.0f, 0.1f }, 0.0f,

            AudioParameterFloatAttributes().withLabel ("dB")));

    }



    layout.add (std::make_unique<AudioParameterBool> (

        ParameterID { "bypass", 1 }, "Bypass", false));



    return layout;

}



const std::vector<XPreset>& DynamicXPlugin::getFactoryPresets()

{

    static const std::vector<XPreset> presets {

        { "Gentle", {

            { "dynamic.threshold", -16.0f }, { "dynamic.ratio", 2.2f }, { "dynamic.attack", 0.02f },

            { "dynamic.release", 0.18f }, { "dynamic.makeup", 1.5f }

        } },

        { "Vocal", {

            { "dynamic.threshold", -20.0f }, { "dynamic.ratio", 3.5f }, { "dynamic.attack", 0.008f },

            { "dynamic.release", 0.1f }, { "dynamic.autoRelease", 1.0f }, { "dynamic.makeup", 3.0f }

        } },

        { "Bus", {

            { "dynamic.threshold", -14.0f }, { "dynamic.ratio", 2.8f }, { "dynamic.attack", 0.025f },

            { "dynamic.release", 0.22f }, { "dynamic.makeup", 2.0f }

        } },

        { "Punch", {

            { "dynamic.threshold", -18.0f }, { "dynamic.ratio", 6.0f }, { "dynamic.attack", 0.004f },

            { "dynamic.release", 0.08f }, { "dynamic.makeup", 4.0f }

        } },

        { "Master", {

            { "dynamic.threshold", -10.0f }, { "dynamic.ratio", 2.0f }, { "dynamic.attack", 0.04f },

            { "dynamic.release", 0.25f }, { "dynamic.autoRelease", 1.0f }, { "dynamic.autoGain", 1.0f }

        } }

    };

    return presets;

}



DynamicXPlugin::DynamicXPlugin()

    : juce::AudioProcessor (BusesProperties()

                                .withInput ("Input", juce::AudioChannelSet::stereo(), true)

                                .withOutput ("Output", juce::AudioChannelSet::stereo(), true)),

      apvts (*this, nullptr, "DynamicX", createLayout())

{

    thresholdParam = apvts.getRawParameterValue ("dynamic.threshold");

    ratioParam = apvts.getRawParameterValue ("dynamic.ratio");

    kneeParam = apvts.getRawParameterValue ("dynamic.knee");

    attackParam = apvts.getRawParameterValue ("dynamic.attack");

    releaseParam = apvts.getRawParameterValue ("dynamic.release");

    lookaheadParam = apvts.getRawParameterValue ("dynamic.lookahead");

    detectorParam = apvts.getRawParameterValue ("dynamic.detector");

    rmsMsParam = apvts.getRawParameterValue ("dynamic.rmsMs");

    mixParam = apvts.getRawParameterValue ("dynamic.mix");

    makeupParam = apvts.getRawParameterValue ("dynamic.makeup");

    autoGainParam = apvts.getRawParameterValue ("dynamic.autoGain");

    autoReleaseParam = apvts.getRawParameterValue ("dynamic.autoRelease");

    splitBandsParam = apvts.getRawParameterValue ("dynamic.splitBands");

    xo1Param = apvts.getRawParameterValue ("dynamic.xo1");

    xo2Param = apvts.getRawParameterValue ("dynamic.xo2");

    bypassParam = dynamic_cast<juce::AudioParameterBool*> (apvts.getParameter ("bypass"));



    for (int i = 0; i < 3; ++i)

    {

        bandParams[static_cast<std::size_t> (i)].enabled = apvts.getRawParameterValue (bandId (i, "enabled"));

        bandParams[static_cast<std::size_t> (i)].solo = apvts.getRawParameterValue (bandId (i, "solo"));

        bandParams[static_cast<std::size_t> (i)].threshold = apvts.getRawParameterValue (bandId (i, "threshold"));

        bandParams[static_cast<std::size_t> (i)].ratio = apvts.getRawParameterValue (bandId (i, "ratio"));

        bandParams[static_cast<std::size_t> (i)].makeup = apvts.getRawParameterValue (bandId (i, "makeup"));

    }

}



void DynamicXPlugin::prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock)

{

    core.prepare (sampleRate, maximumExpectedSamplesPerBlock);

    reportedLatency = -1;

    pullParams();

}



void DynamicXPlugin::releaseResources()

{

    core.reset();

}



bool DynamicXPlugin::isBusesLayoutSupported (const BusesLayout& layouts) const

{

    const auto& out = layouts.getMainOutputChannelSet();

    if (out != juce::AudioChannelSet::mono() && out != juce::AudioChannelSet::stereo())

        return false;

    return layouts.getMainInputChannelSet() == out;

}



void DynamicXPlugin::pullParams() noexcept

{

    tmss::DynamicXParams next;

    next.threshold = thresholdParam->load (std::memory_order_relaxed);

    next.ratio = ratioParam->load (std::memory_order_relaxed);

    next.kneeDb = kneeParam->load (std::memory_order_relaxed);

    next.attack = attackParam->load (std::memory_order_relaxed);

    next.release = releaseParam->load (std::memory_order_relaxed);

    next.lookaheadMs = lookaheadParam->load (std::memory_order_relaxed);

    next.detector = static_cast<int> (detectorParam->load (std::memory_order_relaxed)) == 1

                        ? tmss::DynamicXDetector::Rms

                        : tmss::DynamicXDetector::Peak;

    next.rmsMs = rmsMsParam->load (std::memory_order_relaxed);

    next.mix = mixParam->load (std::memory_order_relaxed);

    next.makeupDb = makeupParam->load (std::memory_order_relaxed);

    next.autoGain = autoGainParam->load (std::memory_order_relaxed) > 0.5f;

    next.autoRelease = autoReleaseParam->load (std::memory_order_relaxed) > 0.5f;

    next.splitBands = splitBandsParam->load (std::memory_order_relaxed) > 0.5f;

    next.xo1 = xo1Param->load (std::memory_order_relaxed);

    next.xo2 = xo2Param->load (std::memory_order_relaxed);



    for (int i = 0; i < 3; ++i)

    {

        const auto& atoms = bandParams[static_cast<std::size_t> (i)];

        auto& band = next.bands[i];

        band.enabled = atoms.enabled->load (std::memory_order_relaxed) > 0.5f;

        band.solo = atoms.solo->load (std::memory_order_relaxed) > 0.5f;

        band.threshold = atoms.threshold->load (std::memory_order_relaxed);

        band.ratio = atoms.ratio->load (std::memory_order_relaxed);

        band.makeupDb = atoms.makeup->load (std::memory_order_relaxed);

    }



    core.setParams (next);

}



void DynamicXPlugin::processBlock (juce::AudioBuffer<float>& buffer, juce::MidiBuffer&)

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



void DynamicXPlugin::processBlock (juce::AudioBuffer<double>& buffer, juce::MidiBuffer& midi)

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



int DynamicXPlugin::getNumPrograms()

{

    return static_cast<int> (getFactoryPresets().size());

}



void DynamicXPlugin::setCurrentProgram (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return;

    currentProgram = index;

    applyXPreset (apvts, presets[static_cast<std::size_t> (index)]);

}



const juce::String DynamicXPlugin::getProgramName (int index)

{

    const auto& presets = getFactoryPresets();

    if (index < 0 || index >= static_cast<int> (presets.size()))

        return {};

    return presets[static_cast<std::size_t> (index)].name;

}



void DynamicXPlugin::getStateInformation (juce::MemoryBlock& destination)

{

    if (auto xml = apvts.copyState().createXml())

        copyXmlToBinary (*xml, destination);

}



void DynamicXPlugin::setStateInformation (const void* data, int sizeInBytes)

{

    if (auto xml = getXmlFromBinary (data, sizeInBytes))

        if (xml->hasTagName (apvts.state.getType()))

            apvts.replaceState (juce::ValueTree::fromXml (*xml));

}



juce::AudioProcessorEditor* DynamicXPlugin::createEditor()

{

    return new DynamicXEditor (*this);

}



juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter()

{

    return new DynamicXPlugin();

}

