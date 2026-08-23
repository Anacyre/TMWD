#pragma once

#include <JuceHeader.h>

/*  Everything that turns MIDI into audio for one track implements this interface: the
    built-in test synth today, a hosted VST3 instrument later.  The audio engine only
    ever sees PluginInstance, so swapping in BBCSO Discover or Synchron Player does not
    touch the engine or the UI.

    process() runs on the audio thread and must be real-time safe: no allocation, no
    locking, no file access.
*/
class PluginInstance
{
public:
    virtual ~PluginInstance() = default;

    /** Stable key from the instrument registry, e.g. "test_synth". */
    virtual juce::String getInstrumentId() const = 0;
    virtual juce::String getDisplayName() const = 0;

    /** True once this is backed by a real hosted plugin rather than a built-in. */
    virtual bool isExternalPlugin() const { return false; }

    /** Called on the message thread before the instance is handed to the engine. */
    virtual void prepare (double sampleRate, int maximumBlockSize) = 0;

    /** Renders `buffer` in place from `midi`.  Audio thread only. */
    virtual void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) = 0;

    /** Silences any sounding voices.  Audio thread only. */
    virtual void reset() = 0;
};
