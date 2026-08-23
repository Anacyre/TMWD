#pragma once

#include <JuceHeader.h>
#include "../Plugins/PluginInstance.h"

/*  A deliberately plain polyphonic sine synth.  Its only job is to prove that the
    MIDI path from the project model through the engine reaches the audio device, so it
    is tuned for clarity rather than for sound quality.  It will be replaced by hosted
    VST3 instruments without the engine noticing, because it is just a PluginInstance.
*/
class TestSynthSound  : public juce::SynthesiserSound
{
public:
    bool appliesToNote (int) override    { return true; }
    bool appliesToChannel (int) override { return true; }
};

//==============================================================================
class TestSynthVoice  : public juce::SynthesiserVoice
{
public:
    TestSynthVoice();

    bool canPlaySound (juce::SynthesiserSound* sound) override;
    void setCurrentPlaybackSampleRate (double newRate) override;

    void startNote (int midiNoteNumber, float velocity, juce::SynthesiserSound*, int pitchWheel) override;
    void stopNote (float velocity, bool allowTailOff) override;
    void pitchWheelMoved (int newValue) override;
    void controllerMoved (int, int) override {}

    void renderNextBlock (juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples) override;

private:
    void updateAngleDelta();

    juce::ADSR adsr;
    juce::ADSR::Parameters adsrParameters { 0.012f, 0.18f, 0.72f, 0.35f };

    double currentAngle = 0.0;
    double angleDelta = 0.0;
    double frequency = 440.0;
    double pitchBendSemitones = 0.0;
    float level = 0.0f;
};

//==============================================================================
/** The built-in instrument, presented to the engine as an ordinary plugin instance. */
class TestSynthInstance  : public PluginInstance
{
public:
    TestSynthInstance();

    juce::String getInstrumentId() const override;
    juce::String getDisplayName() const override { return "Test Synth"; }

    void prepare (double sampleRate, int maximumBlockSize) override;
    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;
    void reset() override;

    static constexpr int numVoices = 16;

private:
    juce::Synthesiser synth;
};
