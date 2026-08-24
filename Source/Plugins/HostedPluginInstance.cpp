#include "HostedPluginInstance.h"

HostedPluginInstance::HostedPluginInstance (std::unique_ptr<juce::AudioPluginInstance> pluginToOwn,
                                            juce::String instrumentIdToUse,
                                            juce::String displayNameToUse)
    : plugin (std::move (pluginToOwn)),
      instrumentId (std::move (instrumentIdToUse)),
      displayName (std::move (displayNameToUse))
{
    jassert (plugin != nullptr);
}

void HostedPluginInstance::configureBuses()
{
    if (plugin == nullptr)
        return;

    // setBusesLayout asserts that these arrays have exactly getBusCount() entries.
    // BBCSO / Synchron expose many output buses; never rebuild the arrays from scratch.
    auto layout = plugin->getBusesLayout();

    for (int i = 0; i < layout.inputBuses.size(); ++i)
        layout.inputBuses.getReference (i) = juce::AudioChannelSet::disabled();

    if (auto* main = plugin->getBus (false, 0))
    {
        const auto stereo = main->supportedLayoutWithChannels (2);

        if (! stereo.isDisabled())
            layout.outputBuses.getReference (0) = stereo;
    }

    if (plugin->checkBusesLayoutSupported (layout) && plugin->setBusesLayout (layout))
    {
        plugin->disableNonMainBuses();
        return;
    }

    if (! plugin->disableNonMainBuses())
        plugin->enableAllBuses();
}

void HostedPluginInstance::prepare (double sampleRate, int maximumBlockSize)
{
    if (plugin == nullptr)
        return;

    const auto rate = sampleRate > 0.0 ? sampleRate : 44100.0;
    const auto block = juce::jmax (16, maximumBlockSize);
    const auto alreadyPrepared = prepared
        && juce::approximatelyEqual (preparedSampleRate, rate)
        && preparedBlockSize == block;

    if (! alreadyPrepared)
    {
        configureBuses();
        plugin->setNonRealtime (false);
        plugin->setRateAndBufferSizeDetails (rate, block);
        plugin->prepareToPlay (rate, block);
        preparedSampleRate = rate;
        preparedBlockSize = block;
        prepared = true;
    }

    const auto channels = juce::jmax (2, plugin->getTotalNumInputChannels(),
                                      plugin->getTotalNumOutputChannels());
    work.setSize (channels, juce::jmax (block, 4096), false, true, true);
}

void HostedPluginInstance::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    if (plugin == nullptr || ! prepared)
    {
        buffer.clear();
        return;
    }

    const auto numSamples = buffer.getNumSamples();
    const auto pluginIns = plugin->getTotalNumInputChannels();
    const auto pluginOuts = plugin->getTotalNumOutputChannels();

    if (pluginIns <= buffer.getNumChannels() && pluginOuts <= buffer.getNumChannels())
    {
        plugin->processBlock (buffer, midi);
        capturePeak (buffer);
        return;
    }

    if (work.getNumSamples() < numSamples)
    {
        buffer.clear();
        return;
    }

    work.clear();

    for (int ch = 0; ch < juce::jmin (buffer.getNumChannels(), work.getNumChannels()); ++ch)
        work.copyFrom (ch, 0, buffer, ch, 0, numSamples);

    juce::AudioBuffer<float> view (work.getArrayOfWritePointers(),
                                   juce::jmax (1, pluginOuts),
                                   0, numSamples);
    plugin->processBlock (view, midi);

    buffer.clear();

    for (int ch = 0; ch < juce::jmin (buffer.getNumChannels(), pluginOuts, work.getNumChannels()); ++ch)
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
    if (plugin != nullptr)
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

    plugin->setStateInformation (state.getData(), (int) state.getSize());
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
