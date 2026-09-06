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

    virtual juce::String getInstrumentId() const = 0;
    virtual juce::String getDisplayName() const = 0;

    virtual void setInstrumentDefinitionId (const juce::String&) {}
    virtual juce::String getInstrumentDefinitionId() const { return {}; }

    virtual bool isExternalPlugin() const { return false; }

    virtual void prepare (double sampleRate, int maximumBlockSize) = 0;
    virtual void forceReprepare (double sampleRate, int maximumBlockSize) { prepare (sampleRate, maximumBlockSize); }
    virtual bool hasValidBusLayout() const { return true; }
    virtual bool isProcessReady() const { return true; }
    virtual void allowProcessing() {}
    virtual void blockProcessing() {}

    virtual void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) = 0;
    virtual void reset() = 0;

    /** Opaque plugin chunk.  Some VST state cannot be reconstructed from our UI. */
    virtual juce::MemoryBlock saveState() const { return {}; }
    virtual bool restoreState (const juce::MemoryBlock&) { return false; }

    virtual juce::StringArray getProgramNames() const { return {}; }
    virtual bool applyProgram (const juce::String&) { return false; }
    virtual bool setParameterByName (const juce::String&, float) { return false; }
    virtual juce::String getIntrospectionSummary() const { return {}; }
    virtual juce::String getPluginVersion() const { return {}; }
    virtual float consumeOutputPeak() { return 0.0f; }
};
