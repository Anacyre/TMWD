#pragma once



#include <JuceHeader.h>



#include "ReverbXCore.h"

#include "XPresets.h"



/** TMSS Reverb X 2.0 — early reflections + Schroeder/Moorer late reverb.

    Parameter ids match docs/x-series-2.0.md section 2.2 and the web registry. */

class ReverbXPlugin final : public juce::AudioProcessor

{

public:

    ReverbXPlugin();



    void prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock) override;

    void releaseResources() override;

    bool isBusesLayoutSupported (const BusesLayout&) const override;

    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;



    juce::AudioProcessorEditor* createEditor() override;

    bool hasEditor() const override { return true; }



    const juce::String getName() const override { return "TMSS Reverb X"; }

    bool acceptsMidi() const override { return false; }

    bool producesMidi() const override { return false; }

    bool isMidiEffect() const override { return false; }

    double getTailLengthSeconds() const override { return 12.0; }



    int getNumPrograms() override;

    int getCurrentProgram() override { return currentProgram; }

    void setCurrentProgram (int index) override;

    const juce::String getProgramName (int index) override;

    void changeProgramName (int, const juce::String&) override {}



    void getStateInformation (juce::MemoryBlock&) override;

    void setStateInformation (const void* data, int sizeInBytes) override;



    juce::AudioProcessorParameter* getBypassParameter() const override { return bypassParam; }



    juce::AudioProcessorValueTreeState& getState() noexcept { return apvts; }

    const tmss::ReverbXCore& getCore() const noexcept { return core; }



    static const std::vector<XPreset>& getFactoryPresets();



private:

    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();

    void pullParams() noexcept;



    juce::AudioProcessorValueTreeState apvts;

    tmss::ReverbXCore core;



    std::atomic<float>* mixParam = nullptr;

    std::atomic<float>* levelParam = nullptr;

    std::atomic<float>* decayParam = nullptr;

    std::atomic<float>* sizeParam = nullptr;

    std::atomic<float>* widthParam = nullptr;

    std::atomic<float>* preDelayParam = nullptr;

    std::atomic<float>* dampingParam = nullptr;

    std::atomic<float>* venueParam = nullptr;

    std::atomic<float>* wetProcessParam = nullptr;

    juce::AudioParameterBool* bypassParam = nullptr;



    int currentProgram = 4;



    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReverbXPlugin)

};

