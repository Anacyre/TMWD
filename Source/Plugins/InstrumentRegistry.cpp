#include "InstrumentRegistry.h"

InstrumentRegistry::InstrumentRegistry()
{
    descriptors =
    {
        { testSynthId,      "Test Synth",                      "DawWeb",        PluginDescriptor::Kind::builtin },
        { bbcsoDiscoverId,  "BBC Symphony Orchestra Discover", "Spitfire Audio", PluginDescriptor::Kind::vst3 },
        { synchronPlayerId, "Synchron Player",                 "VSL",           PluginDescriptor::Kind::vst3 }
    };

    load();
}

const PluginDescriptor* InstrumentRegistry::find (const juce::String& instrumentId) const
{
    for (const auto& d : descriptors)
        if (d.instrumentId == instrumentId)
            return &d;

    return nullptr;
}

PluginDescriptor* InstrumentRegistry::findMutable (const juce::String& instrumentId)
{
    for (auto& d : descriptors)
        if (d.instrumentId == instrumentId)
            return &d;

    return nullptr;
}

juce::StringArray InstrumentRegistry::getDisplayNames() const
{
    juce::StringArray names;

    for (const auto& d : descriptors)
        names.add (d.displayName);

    return names;
}

juce::StringArray InstrumentRegistry::getInstrumentIds() const
{
    juce::StringArray ids;

    for (const auto& d : descriptors)
        ids.add (d.instrumentId);

    return ids;
}

juce::String InstrumentRegistry::getDisplayName (const juce::String& instrumentId) const
{
    if (auto* d = find (instrumentId))
        return d->displayName;

    return {};
}

juce::String InstrumentRegistry::findIdForDisplayName (const juce::String& displayName) const
{
    for (const auto& d : descriptors)
        if (d.displayName == displayName)
            return d.instrumentId;

    return {};
}

bool InstrumentRegistry::setPluginPath (const juce::String& instrumentId, const juce::String& path)
{
    auto* d = findMutable (instrumentId);

    if (d == nullptr || d->isBuiltIn())
        return false;

    d->pluginPath = path;
    save();
    return true;
}

//==============================================================================
juce::File InstrumentRegistry::getSettingsFile()
{
    return juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
               .getChildFile ("DawWeb")
               .getChildFile ("instruments.json");
}

void InstrumentRegistry::load()
{
    const auto file = getSettingsFile();

    if (! file.existsAsFile())
        return;

    const auto parsed = juce::JSON::parse (file.loadFileAsString());
    const auto* entries = parsed.getArray();

    if (entries == nullptr)
        return;

    for (const auto& entry : *entries)
    {
        const auto id = entry.getProperty ("instrumentId", {}).toString();

        if (auto* d = findMutable (id))
        {
            if (! d->isBuiltIn())
            {
                d->pluginPath = entry.getProperty ("pluginPath", d->pluginPath).toString();
                d->pluginIdentifier = entry.getProperty ("pluginIdentifier", d->pluginIdentifier).toString();
            }
        }
    }
}

void InstrumentRegistry::save() const
{
    juce::Array<juce::var> entries;

    for (const auto& d : descriptors)
    {
        if (d.isBuiltIn())
            continue;

        auto* object = new juce::DynamicObject();
        object->setProperty ("instrumentId", d.instrumentId);
        object->setProperty ("pluginPath", d.pluginPath);
        object->setProperty ("pluginIdentifier", d.pluginIdentifier);
        entries.add (juce::var (object));
    }

    const auto file = getSettingsFile();
    file.getParentDirectory().createDirectory();
    file.replaceWithText (juce::JSON::toString (juce::var (entries), false));
}
