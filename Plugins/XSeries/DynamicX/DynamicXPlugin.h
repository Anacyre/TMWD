#pragma once



#include <JuceHeader.h>



#include "DynamicXCore.h"

#include "XPresets.h"



/** TMSS Dynamic X 2.0 — soft-knee compressor with optional 3-band split.

    Parameter ids match docs/x-series-2.0.md section 2.3 and the web registry. */

class DynamicXPlugin final : public juce::AudioProcessor

{

public:

    DynamicXPlugin();



    void prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock) override;

    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout&) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;



    juce::AudioProcessorEditor* createEditor() override;

    bool hasEditor() const override { return true; }



    const juce::String getName() const override { return "TMSS Dynamic X"; }

    bool acceptsMidi() const override { return false; }

    bool producesMidi() const override { return false; }

    bool isMidiEffect() const override { return false; }

    double getTailLengthSeconds() const override { return 0.0; }



    int getNumPrograms() override;

    int getCurrentProgram() override { return currentProgram; }

    void setCurrentProgram (int index) override;

    const juce::String getProgramName (int index) override;

    void changeProgramName (int, const juce::String&) override {}



    void getStateInformation (juce::MemoryBlock&) override;

    void setStateInformation (const void* data, int sizeInBytes) override;



    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParam; }



    juce::AudioProcessorValueTreeState& getState() noexcept { return apvts; }

    const tmss::DynamicXCore& getCore() const noexcept { return core; }



    static const std::vector<XPreset>& getFactoryPresets();



private:

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    void pullParams() noexcept;



    juce::AudioProcessorValueTreeState apvts;

    tmss::DynamicXCore core;



    std::atomic<float>* thresholdParam = nullptr;

    std::atomic<float>* ratioParam = nullptr;

    std::atomic<float>* kneeParam = nullptr;

    std::atomic<float>* attackParam = nullptr;

    std::atomic<float>* releaseParam = nullptr;

    std::atomic<float>* lookaheadParam = nullptr;

    std::atomic<float>* detectorParam = nullptr;

    std::atomic<float>* rmsMsParam = nullptr;

    std::atomic<float>* mixParam = nullptr;

    std::atomic<float>* makeupParam = nullptr;

    std::atomic<float>* autoGainParam = nullptr;

    std::atomic<float>* autoReleaseParam = nullptr;

    std::atomic<float>* splitBandsParam = nullptr;

    std::atomic<float>* xo1Param = nullptr;

    std::atomic<float>* xo2Param = nullptr;



    struct BandAtomics

    {

        std::atomic<float>* enabled = nullptr;

        std::atomic<float>* solo = nullptr;

        std::atomic<float>* threshold = nullptr;

        std::atomic<float>* ratio = nullptr;

        std::atomic<float>* makeup = nullptr;

    };

    std::array<BandAtomics, 3> bandParams {};



    juce::AudioParameterBool* bypassParam = nullptr;



    int reportedLatency = -1;

    int currentProgram = 0;



    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DynamicXPlugin)

};

