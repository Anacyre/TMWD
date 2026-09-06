#include "HostedPluginInstance.h"

#if JUCE_WINDOWS
 #include <excpt.h>
#endif

namespace
{
    bool layoutIsPlayable (const juce::AudioPluginInstance& plugin) noexcept
    {
        return plugin.getTotalNumInputChannels() == 0
            && plugin.getTotalNumOutputChannels() > 0;
    }

    juce::AudioChannelSet preferredMainOutputLayout (juce::AudioProcessor::Bus& mainBus)
    {
        for (const auto channels : { 2, 1 })
        {
            const auto layout = mainBus.supportedLayoutWithChannels (channels);

            if (! layout.isDisabled() && mainBus.isLayoutSupported (layout))
                return layout;
        }

        const auto current = mainBus.getCurrentLayout();

        if (! current.isDisabled() && current.size() <= 2)
            return current;

        return {};
    }

   #if JUCE_WINDOWS
    bool processBlockSEH (juce::AudioPluginInstance& instance,
                          juce::AudioBuffer<float>& buffer,
                          juce::MidiBuffer& midi)
    {
        __try
        {
            instance.processBlock (buffer, midi);
            return true;
        }
        __except (EXCEPTION_EXECUTE_HANDLER)
        {
            return false;
        }
    }
   #endif
}

HostedPluginInstance::HostedPluginInstance (std::unique_ptr<juce::AudioPluginInstance> pluginToOwn,
                                            juce::String instrumentIdToUse,
                                            juce::String displayNameToUse)
    : plugin (std::move (pluginToOwn)),
      instrumentId (std::move (instrumentIdToUse)),
      displayName (std::move (displayNameToUse)),
      editorTitle (displayName)
{
    jassert (plugin != nullptr);
}

HostedPluginInstance::~HostedPluginInstance()
{
    destroyNativeEditor();
}

void HostedPluginInstance::destroyNativeEditor()
{
    nativeEditorReady.store (false, std::memory_order_release);
    nativeEditorWindow.reset();
}

bool HostedPluginInstance::ensureNativeEditor()
{
    if (plugin == nullptr)
        return false;

    if (nativeEditorWindow != nullptr && plugin->getActiveEditor() != nullptr)
    {
        nativeEditorReady.store (true, std::memory_order_release);
        nativeEditorWindow->setName (editorTitle);
        nativeEditorWindow->setVisible (true);
        nativeEditorWindow->toFront (true);
        return true;
    }

    if (auto* existing = plugin->getActiveEditor())
    {
        nativeEditorReady.store (true, std::memory_order_release);
        existing->toFront (true);
        return true;
    }

    if (! plugin->hasEditor())
        return false;

    juce::Logger::writeToLog ("[Plugin] opening native editor for " + editorTitle);
    auto* created = plugin->createEditorAndMakeActive();

    if (created == nullptr)
        return false;

    class HostWindow  : public juce::DocumentWindow
    {
    public:
        HostWindow (juce::AudioProcessorEditor* editorToOwn, juce::String title)
            : DocumentWindow (title.isNotEmpty() ? title : juce::String ("Plugin Editor"),
                              juce::Colour (0xff121212),
                              juce::DocumentWindow::minimiseButton)
        {
            setUsingNativeTitleBar (true);
            setContentOwned (editorToOwn, true);
            setResizable (true, false);
            setResizeLimits (400, 280, 2400, 1600);
            centreWithSize (juce::jlimit (480, 1600, editorToOwn->getWidth()),
                            juce::jlimit (320, 1100, editorToOwn->getHeight()));
            setVisible (true);
        }

        void closeButtonPressed() override {}
    };

    nativeEditorWindow = std::make_unique<HostWindow> (created, editorTitle);
    nativeEditorReady.store (true, std::memory_order_release);
    juce::Logger::writeToLog ("[Plugin] native editor window ready for " + editorTitle);
    return true;
}

void HostedPluginInstance::setNativeEditorTitle (const juce::String& title)
{
    editorTitle = title.isNotEmpty() ? title : displayName;

    if (nativeEditorWindow != nullptr)
        nativeEditorWindow->setName (editorTitle);
}

void HostedPluginInstance::configureBuses()
{
    if (plugin == nullptr)
        return;

    busesConfigured = false;

    if (instrumentId == InstrumentRegistry::synchronPlayerId)
    {
        busesConfigured = plugin->getTotalNumOutputChannels() > 0;
        return;
    }

    for (int bus = 0; bus < plugin->getBusCount (true); ++bus)
        if (auto* inputBus = plugin->getBus (true, bus))
            if (inputBus->isEnabled())
                inputBus->enable (false);

    plugin->disableNonMainBuses();

    if (layoutIsPlayable (*plugin))
    {
        busesConfigured = true;
        return;
    }

    auto layout = plugin->getBusesLayout();

    for (int i = 0; i < layout.inputBuses.size(); ++i)
        layout.inputBuses.getReference (i) = juce::AudioChannelSet::disabled();

    if (auto* main = plugin->getBus (false, 0))
    {
        const auto mainLayout = preferredMainOutputLayout (*main);

        if (! mainLayout.isDisabled())
            layout.outputBuses.getReference (0) = mainLayout;
    }

    if (plugin->checkBusesLayoutSupported (layout) && plugin->setBusesLayout (layout))
        plugin->disableNonMainBuses();

    if (! layoutIsPlayable (*plugin))
    {
        for (int bus = 1; bus < plugin->getBusCount (false); ++bus)
            if (auto* outputBus = plugin->getBus (false, bus))
                if (outputBus->isEnabled())
                    outputBus->enable (false);

        plugin->disableNonMainBuses();
    }

    busesConfigured = layoutIsPlayable (*plugin);

    if (! busesConfigured)
        juce::Logger::writeToLog ("[Plugin] " + displayName
                                  + " could not be reduced to stereo (outs="
                                  + juce::String (plugin->getTotalNumOutputChannels()) + ")");
}

void HostedPluginInstance::prepare (double sampleRate, int maximumBlockSize)
{
    if (plugin == nullptr)
        return;

    const auto rate = sampleRate > 0.0 ? sampleRate : 44100.0;
    const auto block = juce::jmax (16, maximumBlockSize);
    const auto alreadyPrepared = prepared
        && busesConfigured
        && juce::approximatelyEqual (preparedSampleRate, rate)
        && preparedBlockSize == block;

    if (! alreadyPrepared)
    {
        configureBuses();
        plugin->setNonRealtime (false);
        plugin->setRateAndBufferSizeDetails (rate, block);
        plugin->prepareToPlay (rate, block);
        plugin->suspendProcessing (false);
        preparedSampleRate = rate;
        preparedBlockSize = block;
        prepared = true;
    }

    const auto channels = juce::jmax (2, plugin->getTotalNumOutputChannels());
    work.setSize (channels, juce::jmax (block, 4096), false, true, true);
}

void HostedPluginInstance::forceReprepare (double sampleRate, int maximumBlockSize)
{
    prepared = false;
    busesConfigured = false;
    prepare (sampleRate, maximumBlockSize);
}

bool HostedPluginInstance::hasValidBusLayout() const
{
    if (plugin == nullptr || ! prepared || ! busesConfigured)
        return false;

    if (instrumentId == InstrumentRegistry::synchronPlayerId)
        return plugin->getTotalNumOutputChannels() > 0;

    return plugin->getTotalNumInputChannels() == 0
        && plugin->getTotalNumOutputChannels() > 0;
}

bool HostedPluginInstance::isProcessReady() const
{
    if (! hasValidBusLayout() || ! processingAllowed.load (std::memory_order_acquire))
        return false;

    if (instrumentId == InstrumentRegistry::synchronPlayerId)
        return nativeEditorReady.load (std::memory_order_acquire)
            && ! processCrashed.load (std::memory_order_acquire);

    return true;
}

void HostedPluginInstance::allowProcessing()
{
    if (! hasValidBusLayout())
    {
        processingAllowed.store (false, std::memory_order_release);
        return;
    }

    if (plugin != nullptr)
        plugin->suspendProcessing (false);

    processingAllowed.store (true, std::memory_order_release);
}

bool HostedPluginInstance::runOfflineWarmup (int)
{
    // Do not call processBlock here. Vienna Synchron Player writes through a
    // null object (AV at 0x20) when processed on the message thread before
    // its player is constructed. Audio-thread mute window covers the rest.
    return plugin != nullptr && prepared;
}

void HostedPluginInstance::blockProcessing()
{
    processingAllowed.store (false, std::memory_order_release);

    if (plugin != nullptr)
        plugin->suspendProcessing (true);
}

bool HostedPluginInstance::runProcessBlockSafe (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    if (plugin == nullptr)
        return false;

   #if JUCE_WINDOWS
    if (! processBlockSEH (*plugin, buffer, midi))
    {
        processCrashed.store (true, std::memory_order_release);
        blockProcessing();
        juce::Logger::writeToLog ("[Plugin] " + displayName + " crashed during process; track silenced.");
        return false;
    }
    return true;
   #else
    plugin->processBlock (buffer, midi);
    return true;
   #endif
}

void HostedPluginInstance::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    const auto warmupActive = offlineWarmupActive.load (std::memory_order_acquire);
    const auto crashed = processCrashed.load (std::memory_order_acquire);
    const auto ready = isProcessReady();

    if (plugin == nullptr || warmupActive || ! ready || crashed)
    {
        buffer.clear();
        return;
    }

    const auto numSamples = buffer.getNumSamples();
    const auto pluginOuts = plugin->getTotalNumOutputChannels();

    juce::MidiBuffer midiToUse;
    midiToUse = midi;

    if (pluginOuts <= buffer.getNumChannels())
    {
        if (! runProcessBlockSafe (buffer, midiToUse))
            buffer.clear();
        else
            capturePeak (buffer);

        return;
    }

    if (work.getNumSamples() < numSamples || work.getNumChannels() < pluginOuts)
    {
        buffer.clear();
        return;
    }

    work.clear();

    juce::AudioBuffer<float> view (work.getArrayOfWritePointers(), pluginOuts, 0, numSamples);

    if (! runProcessBlockSafe (view, midiToUse))
    {
        buffer.clear();
        return;
    }

    buffer.clear();

    for (int ch = 0; ch < juce::jmin (buffer.getNumChannels(), pluginOuts); ++ch)
        buffer.copyFrom (ch, 0, work, ch, 0, numSamples);

    capturePeak (buffer);
}

void HostedPluginInstance::capturePeak (const juce::AudioBuffer<float>& buffer)
{
    const auto mag = buffer.getMagnitude (0, buffer.getNumSamples());
    auto current = outputPeak.load (std::memory_order_relaxed);

    while (mag > current
           && ! outputPeak.compare_exchange_weak (current, mag, std::memory_order_relaxed))
    {
    }
}

float HostedPluginInstance::consumeOutputPeak()
{
    return outputPeak.exchange (0.0f, std::memory_order_relaxed);
}

juce::String HostedPluginInstance::getPluginVersion() const
{
    return plugin != nullptr ? plugin->getPluginDescription().version : juce::String();
}

void HostedPluginInstance::reset()
{
    if (plugin == nullptr)
        return;

    if (auto* mm = juce::MessageManager::getInstanceWithoutCreating())
        if (! mm->isThisTheMessageThread())
            return;

    plugin->reset();
}

juce::MemoryBlock HostedPluginInstance::saveState() const
{
    juce::MemoryBlock block;

    if (plugin != nullptr)
        plugin->getStateInformation (block);

    return block;
}

bool HostedPluginInstance::restoreState (const juce::MemoryBlock& state)
{
    if (plugin == nullptr || state.isEmpty())
        return false;

    plugin->suspendProcessing (true);
    plugin->setStateInformation (state.getData(), (int) state.getSize());
    prepared = false;
    busesConfigured = false;
    processingAllowed.store (false, std::memory_order_release);
    nativeEditorReady.store (false, std::memory_order_release);
    return true;
}

juce::StringArray HostedPluginInstance::getProgramNames() const
{
    juce::StringArray names;

    if (plugin == nullptr)
        return names;

    const auto n = plugin->getNumPrograms();

    for (int i = 0; i < n; ++i)
        names.add (plugin->getProgramName (i));

    return names;
}

bool HostedPluginInstance::applyProgram (const juce::String& name)
{
    if (plugin == nullptr || name.isEmpty())
        return false;

    const auto n = plugin->getNumPrograms();

    for (int i = 0; i < n; ++i)
    {
        const auto programName = plugin->getProgramName (i);

        if (programName.equalsIgnoreCase (name) || programName.containsIgnoreCase (name))
        {
            plugin->setCurrentProgram (i);
            return true;
        }
    }

    for (auto* parameter : plugin->getParameters())
    {
        if (parameter == nullptr)
            continue;

        const auto parameterName = parameter->getName (128);
        const auto looksLikePatch = parameterName.containsIgnoreCase ("patch")
                                    || parameterName.containsIgnoreCase ("preset")
                                    || parameterName.containsIgnoreCase ("instrument")
                                    || parameterName.containsIgnoreCase ("program");

        if (! looksLikePatch)
            continue;

        const auto values = parameter->getAllValueStrings();

        for (int i = 0; i < values.size(); ++i)
        {
            if (values[i].equalsIgnoreCase (name) || values[i].containsIgnoreCase (name))
            {
                const auto normalised = values.size() <= 1 ? 0.0f
                    : (float) i / (float) (values.size() - 1);
                parameter->setValueNotifyingHost (normalised);
                return true;
            }
        }
    }

    return false;
}

bool HostedPluginInstance::setParameterByName (const juce::String& name, float normalised)
{
    if (plugin == nullptr || name.isEmpty())
        return false;

    for (auto* parameter : plugin->getParameters())
    {
        if (parameter == nullptr)
            continue;

        if (parameter->getName (128).equalsIgnoreCase (name))
        {
            parameter->setValueNotifyingHost (juce::jlimit (0.0f, 1.0f, normalised));
            return true;
        }
    }

    return false;
}

juce::String HostedPluginInstance::getIntrospectionSummary() const
{
    if (plugin == nullptr)
        return {};

    juce::String s;
    s << plugin->getName() << "  programs=" << plugin->getNumPrograms()
      << "  params=" << plugin->getParameters().size();
    return s;
}

void HostedPluginInstance::writeIntrospectionLog (const juce::File& file) const
{
    if (plugin == nullptr)
        return;

    juce::String text;
    text << "Plugin: " << plugin->getName() << "\n"
         << "Instrument id: " << instrumentId << "\n"
         << "Programs (" << plugin->getNumPrograms() << "):\n";

    for (int i = 0; i < plugin->getNumPrograms(); ++i)
        text << "  [" << i << "] " << plugin->getProgramName (i) << "\n";

    text << "Parameters (" << plugin->getParameters().size() << "):\n";

    for (auto* parameter : plugin->getParameters())
    {
        if (parameter == nullptr)
            continue;

        text << "  " << parameter->getName (128)
             << " = " << parameter->getCurrentValueAsText();

        const auto values = parameter->getAllValueStrings();

        if (values.size() > 0 && values.size() <= 64)
            text << "  values=[" << values.joinIntoString (", ") << "]";

        text << "\n";
    }

    file.getParentDirectory().createDirectory();
    file.replaceWithText (text);
}
