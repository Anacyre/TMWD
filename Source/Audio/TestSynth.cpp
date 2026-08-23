#include "TestSynth.h"
#include "../Plugins/InstrumentRegistry.h"

TestSynthVoice::TestSynthVoice()
{
    adsr.setParameters (adsrParameters);
}

bool TestSynthVoice::canPlaySound (juce::SynthesiserSound* sound)
{
    return dynamic_cast<TestSynthSound*> (sound) != nullptr;
}

void TestSynthVoice::setCurrentPlaybackSampleRate (double newRate)
{
    juce::SynthesiserVoice::setCurrentPlaybackSampleRate (newRate);

    if (newRate > 0.0)
    {
        adsr.setSampleRate (newRate);
        adsr.setParameters (adsrParameters);
        updateAngleDelta();
    }
}

void TestSynthVoice::updateAngleDelta()
{
    const auto rate = getSampleRate();

    if (rate <= 0.0)
        return;

    const auto bent = frequency * std::pow (2.0, pitchBendSemitones / 12.0);
    angleDelta = bent * juce::MathConstants<double>::twoPi / rate;
}

void TestSynthVoice::startNote (int midiNoteNumber, float velocity, juce::SynthesiserSound*, int pitchWheel)
{
    currentAngle = 0.0;
    frequency = juce::MidiMessage::getMidiNoteInHertz (midiNoteNumber);
    pitchWheelMoved (pitchWheel);

    // Headroom for a large orchestral template: many voices sum into the master bus.
    level = juce::jlimit (0.0f, 1.0f, velocity) * 0.16f;

    adsr.noteOn();
}

void TestSynthVoice::stopNote (float, bool allowTailOff)
{
    if (allowTailOff)
    {
        adsr.noteOff();
    }
    else
    {
        adsr.reset();
        clearCurrentNote();
    }
}

void TestSynthVoice::pitchWheelMoved (int newValue)
{
    pitchBendSemitones = 2.0 * ((double) newValue - 8192.0) / 8192.0;
    updateAngleDelta();
}

void TestSynthVoice::renderNextBlock (juce::AudioBuffer<float>& outputBuffer, int startSample, int numSamples)
{
    if (! adsr.isActive())
        return;

    const auto numChannels = outputBuffer.getNumChannels();

    for (int i = 0; i < numSamples; ++i)
    {
        const auto envelope = adsr.getNextSample();

        // Sine plus a quiet octave, which reads more clearly on small speakers.
        const auto sample = (float) (std::sin (currentAngle) + 0.22 * std::sin (currentAngle * 2.0))
                            * level * envelope;

        for (int channel = 0; channel < numChannels; ++channel)
            outputBuffer.addSample (channel, startSample + i, sample);

        currentAngle += angleDelta;

        if (currentAngle >= juce::MathConstants<double>::twoPi)
            currentAngle -= juce::MathConstants<double>::twoPi;
    }

    if (! adsr.isActive())
        clearCurrentNote();
}

//==============================================================================
TestSynthInstance::TestSynthInstance()
{
    for (int i = 0; i < numVoices; ++i)
        synth.addVoice (new TestSynthVoice());

    synth.addSound (new TestSynthSound());
    synth.setNoteStealingEnabled (true);
}

juce::String TestSynthInstance::getInstrumentId() const
{
    return InstrumentRegistry::testSynthId;
}

void TestSynthInstance::prepare (double sampleRate, int)
{
    synth.setCurrentPlaybackSampleRate (sampleRate);
}

void TestSynthInstance::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    synth.renderNextBlock (buffer, midi, 0, buffer.getNumSamples());
}

void TestSynthInstance::reset()
{
    synth.allNotesOff (0, false);
}
