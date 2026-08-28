#pragma once

#include "InstrumentRegistry.h"
#include "PluginInstance.h"
#include <atomic>
#include <functional>
#include <map>
#include <memory>

/*  Creates instrument instances from stable plugin ids.  External hosting is limited
    to bbcso_discover and synchron_player.  Built-ins are Test Synth and M Orchestra.
    There is no plugin scanner.
*/
class PluginHost
{
public:
    explicit PluginHost (InstrumentRegistry& registryToUse);
    ~PluginHost();

    InstrumentRegistry& getRegistry() noexcept { return registry; }

    using CreateCallback = std::function<void (std::unique_ptr<PluginInstance>, const juce::String&)>;

    std::unique_ptr<PluginInstance> createInstance (const juce::String& instrumentId,
                                                   double sampleRate,
                                                   int maximumBlockSize,
                                                   juce::String& errorMessage);

    /** Loads an approved VST3 on the JUCE message thread and invokes callback there.
        Callers may invoke this from any thread; work is marshalled when needed.
    */
    void createInstanceAsync (const juce::String& instrumentId,
                              double sampleRate,
                              int maximumBlockSize,
                              CreateCallback callback);

    /** Reads VST3 descriptions for approved plugins.  Must run on the message thread. */
    void precacheDescriptions();

    std::unique_ptr<PluginInstance> createInstanceOrFallback (const juce::String& instrumentId,
                                                             double sampleRate,
                                                             int maximumBlockSize,
                                                             juce::String& errorMessage);

    /** File paths only.  Does not LoadLibrary the VST3s. */
    juce::String describeApprovedPlugins();

    /** Opens the VST3 modules to read name/version.  Can stall for minutes under a debugger. */
    juce::String inspectApprovedPlugins();

private:
    std::unique_ptr<PluginInstance> createExternalInstance (const PluginDescriptor& descriptor,
                                                           double sampleRate,
                                                           int maximumBlockSize,
                                                           juce::String& errorMessage);
    bool resolveDescription (const PluginDescriptor& descriptor,
                             juce::PluginDescription& description,
                             juce::String& errorMessage);

    bool resolveDescriptionFromPaths (const juce::StringArray& paths,
                                      const juce::String& displayName,
                                      juce::PluginDescription& description,
                                      juce::String& errorMessage);

    InstrumentRegistry& registry;
    juce::AudioPluginFormatManager formatManager;
    juce::CriticalSection cacheLock;
    std::map<juce::String, juce::PluginDescription> descriptionCache;
    std::shared_ptr<std::atomic<bool>> alive { std::make_shared<std::atomic<bool>> (true) };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PluginHost)
};
