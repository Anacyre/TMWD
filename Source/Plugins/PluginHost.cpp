#include "PluginHost.h"
#include "../Audio/TestSynth.h"

PluginHost::PluginHost (InstrumentRegistry& registryToUse)
    : registry (registryToUse)
{
}

PluginHost::~PluginHost() = default;

std::unique_ptr<PluginInstance> PluginHost::createInstance (const juce::String& instrumentId,
                                                           double sampleRate,
                                                           int maximumBlockSize,
                                                           juce::String& errorMessage)
{
    errorMessage.clear();

    const auto* descriptor = registry.find (instrumentId);

    if (descriptor == nullptr)
    {
        errorMessage = "Unknown instrument id: " + instrumentId;
        return {};
    }

    if (descriptor->isBuiltIn())
    {
        auto instance = std::make_unique<TestSynthInstance>();
        instance->prepare (sampleRate, maximumBlockSize);
        return instance;
    }

    return createExternalInstance (*descriptor, sampleRate, maximumBlockSize, errorMessage);
}

std::unique_ptr<PluginInstance> PluginHost::createInstanceOrFallback (const juce::String& instrumentId,
                                                                     double sampleRate,
                                                                     int maximumBlockSize,
                                                                     juce::String& errorMessage)
{
    if (auto instance = createInstance (instrumentId, sampleRate, maximumBlockSize, errorMessage))
        return instance;

    auto fallback = std::make_unique<TestSynthInstance>();
    fallback->prepare (sampleRate, maximumBlockSize);
    return fallback;
}

std::unique_ptr<PluginInstance> PluginHost::createExternalInstance (const PluginDescriptor& descriptor,
                                                                   double,
                                                                   int,
                                                                   juce::String& errorMessage)
{
    if (! descriptor.isAvailable())
    {
        errorMessage = descriptor.displayName + " is not installed yet. Set its path in "
                       + InstrumentRegistry::getSettingsFile().getFileName() + ".";
        return {};
    }

    // VST3 wrapping lands in the next phase: enable JUCE_PLUGINHOST_VST3, describe the
    // file with AudioPluginFormatManager, createPluginInstance() on the message thread,
    // adapt the resulting AudioPluginInstance to PluginInstance, then hand it to the
    // engine through AudioEngine::setTrackInstrument (already lock-free).
    errorMessage = descriptor.displayName + " hosting is not implemented in this phase.";
    return {};
}
