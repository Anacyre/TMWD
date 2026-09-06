#pragma once

#include "PluginInstance.h"
#include "InstrumentRegistry.h"
#include <atomic>

/*  Wraps a JUCE AudioPluginInstance.  BBCSO stays headless.  Synchron Player needs its
    native editor window kept alive before processBlock is invoked.
*/
class HostedPluginInstance  : public PluginInstance
{
public:
    HostedPluginInstance (std::unique_ptr<juce::AudioPluginInstance> pluginToOwn,
                          juce::String instrumentIdToUse,
                          juce::String displayNameToUse);
    ~HostedPluginInstance() override;

    /** Message-thread only. Opens the native editor in a visible window, matching
        the Capture workflow Vienna needs before processBlock is safe. */
    bool ensureNativeEditor();
    void setNativeEditorTitle (const juce::String& title);

    juce::String getInstrumentId() const override { return instrumentId; }
    juce::String getDisplayName() const override  { return displayName; }
    bool isExternalPlugin() const override        { return true; }

    void prepare (double sampleRate, int maximumBlockSize) override;
    void forceReprepare (double sampleRate, int maximumBlockSize) override;
    bool hasValidBusLayout() const override;
    bool isProcessReady() const override;
    void allowProcessing() override;
    void blockProcessing() override;
    void process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi) override;
    void reset() override;

    /** Message-thread only. Runs empty processBlock passes before playback. */
    bool runOfflineWarmup (int numBlocks);

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
    juce::String instrumentId, displayName, editorTitle;
    juce::AudioBuffer<float> work;
    std::atomic<float> outputPeak { 0.0f };
    double preparedSampleRate = 0.0;
    int preparedBlockSize = 0;
    bool prepared = false;
    bool busesConfigured = false;
    std::atomic<bool> processingAllowed { false };
    std::atomic<bool> offlineWarmupActive { false };
    std::atomic<bool> processCrashed { false };
    std::atomic<bool> nativeEditorReady { false };
    std::unique_ptr<juce::DocumentWindow> nativeEditorWindow;

    void destroyNativeEditor();
    bool runProcessBlockSafe (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (HostedPluginInstance)
};
