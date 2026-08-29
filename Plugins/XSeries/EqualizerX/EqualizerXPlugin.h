#pragma once

#include <JuceHeader.h>

#include "EqualizerXCore.h"
#include "XPresets.h"

/** TMSS Equalizer X 2.0 — seven-node serial parametric EQ. Parameter ids follow
    docs/x-series-2.0.md section 2.1 and the web `registry.js` contract. */
class EqualizerXPlugin final : public juce::AudioProcessor
{
public:
    EqualizerXPlugin();

    void prepareToPlay (double sampleRate, int maximumExpectedSamplesPerBlock) override;
    void releaseResources() override;
    bool isBusesLayoutSupported (const BusesLayout&) const override;
    void processBlock (juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void processBlock (juce::AudioBuffer<double>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }

    const juce::String getName() const override { return "TMSS EQ X"; }
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
    const EqualizerXCore& getCore() const noexcept { return core; }

    static const std::vector<XPreset>& getFactoryPresets();

private:
    static juce::AudioProcessorValueTreeState::ParameterLayout createLayout();
    void pullParams() noexcept;

    juce::AudioProcessorValueTreeState apvts;
    EqualizerXCore core;

    std::array<std::atomic<float>*, 7> freqParams {};
    std::array<std::atomic<float>*, 7> gainParams {};
    std::array<std::atomic<float>*, 7> qParams {};
    std::array<std::atomic<float>*, 7> slopeParams {};
    std::array<std::atomic<float>*, 7> shapeParams {};
    std::array<std::atomic<float>*, 7> enabledParams {};
    std::array<std::atomic<float>*, 7> soloParams {};

    std::atomic<float>* outputGainParam = nullptr;
    std::atomic<float>* autoGainParam = nullptr;
    std::atomic<float>* oversamplingParam = nullptr;
    juce::AudioParameterBool* bypassParam = nullptr;

    int reportedLatency = -1;
    int currentProgram = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EqualizerXPlugin)
};
