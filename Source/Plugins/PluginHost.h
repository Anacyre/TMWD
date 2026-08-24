#pragma once

#include "InstrumentRegistry.h"
#include "PluginInstance.h"
#include <atomic>
#include <functional>
#include <map>
#include <memory>

/*  Creates instrument instances from stable plugin ids.  External hosting is limited
    to bbcso_discover and synchron_player.  There is no plugin scanner.
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

    /** VST3 creation must not run on a blocked message thread.  The callback arrives
        on the message thread after the plugin has been built in the background.
    */
    void createInstanceAsync (const juce::String& instrumentId,
                              double sampleRate,
                              int maximumBlockSize,
                              CreateCallback callback);

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
