#pragma once

#include "PluginInstance.h"
#include <atomic>

/*  Wraps a JUCE AudioPluginInstance.  Normal DAW use never opens the native editor.
    A development capture window may create one once to prepare a factory state.
*/
class HostedPluginInstance  : public PluginInstance
{
public:
    HostedPluginInstance (std::unique_ptr<juce::AudioPluginInstance> pluginToOwn,
                          juce::String instrumentIdToUse,
                          juce::String displayNameToUse);

    juce::String getInstrumentId() const override { return instrumentId; }
    juce::String getDisplayName() const override  { return displayName; }
    bool isExternalPlugin() const override        { return true; }

    void prepare (double sampleRate, int maximumBlockSize) override;
    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;
    void reset() override;

    juce::MemoryBlock saveState() const override;
    bool restoreState (const juce::MemoryBlock& state) override;

    juce::StringArray getProgramNames() const override;
    bool applyProgram (const juce::String& name) override;
    bool setParameterByName (const juce::String& name, float normalised) override;
    juce::String getIntrospectionSummary() const override;
    juce::String getPluginVersion() const override;
    float consumeOutputPeak() override;

    void writeIntrospectionLog (const juce::File& file) const;

    juce::AudioPluginInstance* getNativePlugin() noexcept { return plugin.get(); }

private:
    void configureBuses();
    void capturePeak (const juce::AudioBuffer<float>& buffer);

    std::unique_ptr<juce::AudioPluginInstance> plugin;
    juce::String instrumentId, displayName;
    juce::AudioBuffer<float> work;
    std::atomic<float> outputPeak { 0.0f };
    double preparedSampleRate = 0.0;
    int preparedBlockSize = 0;
    bool prepared = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostedPluginInstance)
};
