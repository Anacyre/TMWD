#pragma once



#include <JuceHeader.h>



#include "BoostXCore.h"

#include "XPresets.h"



/** TMSS Boost X 2.0 — OTT / expander / chorus / drive with oversampling.

    Parameter ids match docs/x-series-2.0.md section 2.4 and the web registry. */

class BoostXPlugin final : public juce::AudioProcessor

{

public:

    BoostXPlugin();



    void prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock) override;

    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout&) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;



    juce::AudioProcessorEditor* createEditor() override;

    bool hasEditor() const override { return true; }



    const juce::String getName() const override { return "TMSS Boost X"; }

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

    const tmss::BoostXCore& getCore() const noexcept { return core; }



    static const std::vector<XPreset>& getFactoryPresets();



private:

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    void pullParams() noexcept;



    juce::AudioProcessorValueTreeState apvts;

    tmss::BoostXCore core;



    std::atomic<float>* modeParam = nullptr;

    std::atomic<float>* amountParam = nullptr;

    std::atomic<float>* mixParam = nullptr;

    std::atomic<float>* oversamplingParam = nullptr;

    std::atomic<float>* hpfParam = nullptr;

    std::atomic<float>* outputGainParam = nullptr;

    juce::AudioParameterBool* bypassParam = nullptr;



    int reportedLatency = -1;

    int currentProgram = 0;



    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BoostXPlugin)

};

