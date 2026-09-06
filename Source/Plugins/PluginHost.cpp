#include "PluginHost.h"
#include "HostedPluginInstance.h"
#include "../Audio/TestSynth.h"
#include "../Audio/MOrchestra/MOrchestraInstance.h"

namespace
{
    /** JUCE 9's VST3 slow description path touches IComponent buses and requires the message thread. */
    template <typename Fn>
    void runOnMessageThread (Fn&& fn)
    {
        if (juce::MessageManager::getInstance()->isThisTheMessageThread())
        {
            fn();
            return;
        }

        juce::WaitableEvent done;
        juce::MessageManager::callAsync ([&fn, &done]
        {
            fn();
            done.signal();
        });
        done.wait (300000);
    }

   #if JUCE_PLUGINHOST_VST3
    int findVst3TypesSEH (juce::AudioPluginFormat* format,
                          juce::OwnedArray<juce::PluginDescription>* types,
                          const juce::String* path)
    {
       #if JUCE_WINDOWS
        __try
        {
            format->findAllTypesForFile (*types, *path);
            return 1;
        }
        __except (1)
        {
            return 0;
        }
       #else
        format->findAllTypesForFile (*types, *path);
        return 1;
       #endif
    }

    void findVst3TypesSafe (juce::AudioPluginFormat& format,
                            juce::OwnedArray<juce::PluginDescription>& types,
                            const juce::String& path)
    {
        runOnMessageThread ([&format, &types, &path]
        {
            if (findVst3TypesSEH (&format, &types, &path) == 0)
            {
                types.clear();
                juce::Logger::writeToLog ("[Plugin] VST3 type scan crashed for " + path + " (caught)");
            }
        });
    }
   #endif
}

PluginHost::PluginHost (InstrumentRegistry& registryToUse)
    : registry (registryToUse)
{
   #if JUCE_PLUGINHOST_VST3
    formatManager.addFormat (std::make_unique<juce::VST3PluginFormat>());
   #endif
}

PluginHost::~PluginHost()
{
    alive->store (false);
}

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
        if (instrumentId == InstrumentRegistry::mOrchestraId)
        {
            MOrchestra::Engine::get().initialise();

            if (! MOrchestra::Engine::get().isAvailable())
            {
                errorMessage = "M Orchestra sample library was not found.";
                return {};
            }

            auto instance = std::make_unique<MOrchestra::Instance> (juce::String());
            instance->prepare (sampleRate, maximumBlockSize);
            return instance;
        }

        auto instance = std::make_unique<TestSynthInstance>();
        instance->prepare (sampleRate, maximumBlockSize);
        return instance;
    }

    return createExternalInstance (*descriptor, sampleRate, maximumBlockSize, errorMessage);
}

void PluginHost::createInstanceAsync (const juce::String& instrumentId,
                                      double sampleRate,
                                      int maximumBlockSize,
                                      CreateCallback callback)
{
    if (callback == nullptr)
        return;

    const auto* descriptor = registry.find (instrumentId);

    if (descriptor == nullptr)
    {
        callback ({}, "Unknown instrument id: " + instrumentId);
        return;
    }

    if (descriptor->isBuiltIn())
    {
        if (instrumentId == InstrumentRegistry::mOrchestraId)
        {
            MOrchestra::Engine::get().initialise();

            if (! MOrchestra::Engine::get().isAvailable())
            {
                callback ({}, "M Orchestra sample library was not found.");
                return;
            }

            auto instance = std::make_unique<MOrchestra::Instance> (juce::String());
            instance->prepare (sampleRate, maximumBlockSize);
            callback (std::move (instance), {});
            return;
        }

        auto instance = std::make_unique<TestSynthInstance>();
        instance->prepare (sampleRate, maximumBlockSize);
        callback (std::move (instance), {});
        return;
    }

    if (! descriptor->isApprovedExternal())
    {
        callback ({}, descriptor->displayName + " is not an approved VST3 instrument.");
        return;
    }

    if (! descriptor->isAvailable())
    {
        callback ({}, descriptor->availabilityError.isNotEmpty()
                          ? descriptor->availabilityError
                          : descriptor->displayName + " is unavailable.");
        return;
    }

   #if ! JUCE_PLUGINHOST_VST3
    callback ({}, "VST3 hosting is disabled in this build.");
   #else
    const auto rate = sampleRate > 0.0 ? sampleRate : 44100.0;
    const auto block = juce::jmax (16, maximumBlockSize);
    const auto id = descriptor->instrumentId;
    const auto name = descriptor->displayName;
    const auto paths = descriptor->allPluginPaths();
    const auto keepAlive = alive;

    auto loadOnMessageThread = [this, keepAlive, callback, id, name, paths, rate, block]
    {
        if (! keepAlive->load())
            return;

        juce::PluginDescription description;
        juce::String error;
        bool cached = false;

        {
            const juce::ScopedLock sl (cacheLock);
            const auto it = descriptionCache.find (id);

            if (it != descriptionCache.end())
            {
                description = it->second;
                cached = true;
            }
        }

        if (! cached && ! resolveDescriptionFromPaths (paths, name, description, error))
        {
            callback ({}, error);
            return;
        }

        if (! cached)
        {
            const juce::ScopedLock sl (cacheLock);
            descriptionCache[id] = description;
        }

        juce::Logger::writeToLog ("[Plugin] creating " + name + " on message thread");
        juce::String createError;
        auto plugin = formatManager.createPluginInstance (description, rate, block, createError);

        if (plugin == nullptr)
        {
            juce::Logger::writeToLog ("[Plugin] " + name + " failed: " + createError);
            callback ({}, createError.isNotEmpty() ? createError
                                                   : name + " failed to load.");
            return;
        }

        juce::Logger::writeToLog ("[Plugin] " + name + " factory instance created");
        auto instance = std::make_unique<HostedPluginInstance> (std::move (plugin), id, name);
        callback (std::move (instance), {});
    };

    if (juce::MessageManager::getInstance()->isThisTheMessageThread())
        loadOnMessageThread();
    else
        juce::MessageManager::callAsync (std::move (loadOnMessageThread));
   #endif
}

void PluginHost::precacheDescriptions()
{
    // Do not call findAllTypesForFile at startup.  BBCSO / Synchron can AV on
    // type-scan after a previous process crash (iLok).  Resolve on first load.
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

juce::String PluginHost::describeApprovedPlugins()
{
    juce::String text;

    for (const auto* id : { InstrumentRegistry::bbcsoDiscoverId, InstrumentRegistry::synchronPlayerId })
    {
        const auto* descriptor = registry.find (id);

        if (descriptor == nullptr)
        {
            text << id << ": missing from registry\n";
            continue;
        }

        const auto path = descriptor->firstExistingPluginPath();

        if (path.isNotEmpty())
            text << descriptor->displayName << ": " << path << "\n";
        else
            text << descriptor->displayName << ": "
                 << (descriptor->availabilityError.isNotEmpty() ? descriptor->availabilityError
                                                                : juce::String ("file not found."))
                 << "\n";
    }

    return text;
}

juce::String PluginHost::inspectApprovedPlugins()
{
    juce::String text;

   #if ! JUCE_PLUGINHOST_VST3
    return "VST3 hosting is disabled.";
   #else
    auto* format = formatManager.getFormat (0);

    if (format == nullptr)
        return "VST3 format is not registered.";

    for (const auto* id : { InstrumentRegistry::bbcsoDiscoverId, InstrumentRegistry::synchronPlayerId })
    {
        const auto* descriptor = registry.find (id);

        if (descriptor == nullptr)
        {
            text << id << ": missing from registry\n";
            continue;
        }

        juce::OwnedArray<juce::PluginDescription> types;

        for (const auto& path : descriptor->allPluginPaths())
        {
            if (! juce::File (path).exists())
                continue;

            types.clear();
            findVst3TypesSafe (*format, types, path);

            if (! types.isEmpty())
            {
                text << descriptor->displayName << ": described as \"" << types[0]->name
                     << "\"  " << types[0]->version << "  from " << path << "\n";
                break;
            }
        }

        if (types.isEmpty())
            text << descriptor->displayName << ": " << (descriptor->availabilityError.isNotEmpty()
                                                            ? descriptor->availabilityError
                                                            : juce::String ("could not be described."))
                 << "\n";
    }

    return text;
   #endif
}

bool PluginHost::resolveDescriptionFromPaths (const juce::StringArray& paths,
                                              const juce::String& displayName,
                                              juce::PluginDescription& description,
                                              juce::String& errorMessage)
{
   #if ! JUCE_PLUGINHOST_VST3
    errorMessage = "VST3 hosting is disabled in this build.";
    return false;
   #else
    juce::VST3PluginFormat format;
    juce::OwnedArray<juce::PluginDescription> types;

    for (const auto& path : paths)
    {
        if (! juce::File (path).exists())
            continue;

        juce::Logger::writeToLog ("[Plugin] reading VST3 types from " + path);
        types.clear();
        findVst3TypesSafe (format, types, path);

        if (! types.isEmpty())
            break;
    }

    if (types.isEmpty() || types[0] == nullptr)
    {
        errorMessage = displayName + " could not be described as a VST3.";
        return false;
    }

    description = *types[0];
    return true;
   #endif
}

bool PluginHost::resolveDescription (const PluginDescriptor& descriptor,
                                     juce::PluginDescription& description,
                                     juce::String& errorMessage)
{
   #if ! JUCE_PLUGINHOST_VST3
    errorMessage = "VST3 hosting is disabled in this build.";
    return false;
   #else
    {
        const juce::ScopedLock sl (cacheLock);
        const auto cached = descriptionCache.find (descriptor.instrumentId);

        if (cached != descriptionCache.end())
        {
            description = cached->second;
            return true;
        }
    }

    if (! resolveDescriptionFromPaths (descriptor.allPluginPaths(),
                                       descriptor.displayName,
                                       description,
                                       errorMessage))
        return false;

    const juce::ScopedLock sl (cacheLock);
    descriptionCache[descriptor.instrumentId] = description;
    return true;
   #endif
}

std::unique_ptr<PluginInstance> PluginHost::createExternalInstance (const PluginDescriptor& descriptor,
                                                                   double sampleRate,
                                                                   int maximumBlockSize,
                                                                   juce::String& errorMessage)
{
    if (! descriptor.isApprovedExternal())
    {
        errorMessage = descriptor.displayName + " is not an approved VST3 instrument.";
        return {};
    }

    if (! descriptor.isAvailable())
    {
        errorMessage = descriptor.availabilityError.isNotEmpty()
                           ? descriptor.availabilityError
                           : descriptor.displayName + " is unavailable.";
        return {};
    }

   #if ! JUCE_PLUGINHOST_VST3
    errorMessage = "VST3 hosting is disabled in this build.";
    return {};
   #else
    struct LoadResult
    {
        std::unique_ptr<PluginInstance> instance;
        juce::String error;
    } result;

    const auto rate = sampleRate > 0.0 ? sampleRate : 44100.0;
    const auto block = juce::jmax (16, maximumBlockSize);

    runOnMessageThread ([this, &descriptor, rate, block, &result]
    {
        juce::PluginDescription description;

        if (! resolveDescription (descriptor, description, result.error))
            return;

        juce::Logger::writeToLog ("[Plugin] creating " + descriptor.displayName + " synchronously");
        auto plugin = formatManager.createPluginInstance (description, rate, block, result.error);

        if (plugin == nullptr)
        {
            if (result.error.isEmpty())
                result.error = descriptor.displayName + " failed to load.";
            return;
        }

        auto instance = std::make_unique<HostedPluginInstance> (std::move (plugin),
                                                                descriptor.instrumentId,
                                                                descriptor.displayName);
        instance->prepare (rate, block);
        result.instance = std::move (instance);
    });

    errorMessage = result.error;
    return std::move (result.instance);
   #endif
}
