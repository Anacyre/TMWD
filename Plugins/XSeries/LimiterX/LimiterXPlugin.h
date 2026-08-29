#pragma once

#include <JuceHeader.h>

#include "LimiterXCore.h"
#include "XPresets.h"

/** TMSS Limiter X 2.0. Parameter ids match docs/x-series-2.0.md section 2.5 and the web
    `registry.js` entries, so a session can move between the browser mixer and a VST3 host. */
class LimiterXPlugin final : public juce::AudioProcessor
{
public:
    LimiterXPlugin();

    void prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "TMSS Limiter X"; }
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

    juce::AudioProcessorValueTreeState& getState() noexcept { return state; }
    const tmss::LimiterXCore& getCore() const noexcept { return core; }

    static const std::vector<XPreset>& getFactoryPresets();

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    void pullParams() noexcept;

    juce::AudioProcessorValueTreeState state;
    tmss::LimiterXCore core;

    std::atomic<float>* gainParam = nullptr;
    std::atomic<float>* ceilingParam = nullptr;
    std::atomic<float>* releaseParam = nullptr;
    std::atomic<float>* lookaheadParam = nullptr;
    std::atomic<float>* oversamplingParam = nullptr;
    std::atomic<float>* truePeakParam = nullptr;
    juce::AudioParameterBool* bypassParam = nullptr;

    tmss::LimiterXParams active {};
    int reportedLatency = -1;
    int currentProgram = 0;
    juce::AudioBuffer<float> monoScratch;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LimiterXPlugin)
};
