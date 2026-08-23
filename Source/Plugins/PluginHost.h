#pragma once

#include "InstrumentRegistry.h"
#include "PluginInstance.h"

/*  Creates instrument instances from stable instrument ids.  This is the single place
    that will ever know how to load a VST3, which keeps the "only two approved
    instruments" rule enforceable: the UI cannot ask for anything that is not in the
    registry, and there is no browse-for-a-plugin entry point anywhere.
*/
class PluginHost
{
public:
    explicit PluginHost (InstrumentRegistry& registryToUse);
    ~PluginHost();

    InstrumentRegistry& getRegistry() noexcept { return registry; }

    /** Creates a prepared instance, or nullptr with a reason in `errorMessage`.
        Called on the message thread only - it may allocate and touch the file system.
    */
    std::unique_ptr<PluginInstance> createInstance (const juce::String& instrumentId,
                                                   double sampleRate,
                                                   int maximumBlockSize,
                                                   juce::String& errorMessage);

    /** Falls back to the built-in synth so a track is never left silent. */
    std::unique_ptr<PluginInstance> createInstanceOrFallback (const juce::String& instrumentId,
                                                             double sampleRate,
                                                             int maximumBlockSize,
                                                             juce::String& errorMessage);

private:
    std::unique_ptr<PluginInstance> createExternalInstance (const PluginDescriptor& descriptor,
                                                           double sampleRate,
                                                           int maximumBlockSize,
                                                           juce::String& errorMessage);

    InstrumentRegistry& registry;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginHost)
};
