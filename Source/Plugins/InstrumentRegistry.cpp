#include "InstrumentRegistry.h"

namespace
{
    const char* browserCategoryOrder[] = { "M Orchestra", "Piano", "Strings", "Woodwinds", "Brass", "Percussion", "Choir" };

    juce::String readString (const juce::var& object, const char* name, const juce::String& fallback = {})
    {
        return object.getProperty (name, juce::var (fallback)).toString();
    }

    int readInt (const juce::var& object, const char* name, int fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (int) value;
    }

    float readFloat (const juce::var& object, const char* name, float fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (float) (double) value;
    }

    bool readBool (const juce::var& object, const char* name, bool fallback)
    {
        const auto value = object.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (bool) value;
    }

    juce::StringArray readStringArray (const juce::var& object, const char* name)
    {
        juce::StringArray result;
        const auto value = object.getProperty (name, juce::var());

        if (auto* array = value.getArray())
            for (const auto& item : *array)
                result.add (item.toString());

        return result;
    }

    TechniqueAction parseAction (const juce::var& object)
    {
        TechniqueAction action;
        action.type = techniqueActionTypeFromString (readString (object, "type"));
        action.midiNote = readInt (object, "midiNote", 0);
        action.velocity = readInt (object, "velocity", 100);
        action.midiCC = readInt (object, "midiCC", 0);
        action.value = readInt (object, "value", 0);
        action.program = readInt (object, "program", 0);
        action.dimension = readString (object, "dimension");
        action.presetName = readString (object, "presetName");
        action.mapped = readBool (object, "mapped", action.type != TechniqueActionType::None);
        return action;
    }
}

//==============================================================================
InstrumentRegistry::InstrumentRegistry()
{
    seedBuiltInPlugins();
    load();
}

void InstrumentRegistry::seedBuiltInPlugins()
{
    descriptors =
    {
        { testSynthId,      "Test Synth",                      "DawWeb",         PluginDescriptor::Kind::builtin },
        { mOrchestraId,     "M Orchestra",                     "DawWeb",         PluginDescriptor::Kind::builtin },
        { bbcsoDiscoverId,  "BBC Symphony Orchestra Discover", "Spitfire Audio", PluginDescriptor::Kind::vst3 },
        { synchronPlayerId, "Synchron Player",                 "VSL",            PluginDescriptor::Kind::vst3 }
    };
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

const InstrumentDefinition* InstrumentRegistry::findDefinition (const juce::String& id) const
{
    for (const auto& d : catalogue)
        if (d.id == id)
            return &d;

    return nullptr;
}

const InstrumentDefinition* InstrumentRegistry::findDefinitionByDisplayName (const juce::String& displayName) const
{
    for (const auto& d : catalogue)
        if (d.displayName == displayName)
            return &d;

    return nullptr;
}

const TechniqueDefinition* InstrumentRegistry::findTechnique (const juce::String& id) const
{
    for (const auto& t : techniques)
        if (t.id == id)
            return &t;

    return nullptr;
}

const ControllerDefinition* InstrumentRegistry::findController (const juce::String& id) const
{
    for (const auto& c : controllers)
        if (c.id == id)
            return &c;

    return nullptr;
}

const SampleLibrary* InstrumentRegistry::findLibrary (const juce::String& id) const
{
    for (const auto& library : libraries)
        if (library.id == id)
            return &library;

    return nullptr;
}

const PresetDefinition* InstrumentRegistry::findPreset (const juce::String& id) const
{
    for (const auto& preset : presets)
        if (preset.id == id)
            return &preset;

    return nullptr;
}

PresetDefinition* InstrumentRegistry::findPresetMutable (const juce::String& id)
{
    for (auto& preset : presets)
        if (preset.id == id)
            return &preset;

    return nullptr;
}

const InstrumentDefinition* InstrumentRegistry::findDefinitionForPreset (const juce::String& presetId) const
{
    if (presetId.isEmpty())
        return nullptr;

    for (const auto& definition : catalogue)
        if (definition.presetId == presetId)
            return &definition;

    for (const auto& definition : catalogue)
        for (const auto& entry : definition.techniquePresets)
            if (entry.second == presetId)
                return &definition;

    return nullptr;
}

juce::String InstrumentRegistry::resolvePresetId (const InstrumentDefinition& definition,
                                                 const juce::String& techniqueId) const
{
    if (techniqueId.isNotEmpty())
    {
        const auto it = definition.techniquePresets.find (techniqueId);

        if (it != definition.techniquePresets.end() && it->second.isNotEmpty())
            return it->second;

        return {};
    }

    return definition.presetId;
}

bool InstrumentRegistry::matchesSearch (const InstrumentDefinition& definition, const juce::String& query) const
{
    if (query.isEmpty())
        return true;

    const auto q = query.trim();

    auto contains = [&q] (const juce::String& text)
    {
        return text.containsIgnoreCase (q);
    };

    if (contains (definition.displayName) || contains (definition.category)
        || contains (definition.sourcePlugin) || contains (definition.sourceLibrary)
        || contains (definition.description) || contains (definition.id))
        return true;

    for (const auto& alias : definition.aliases)
        if (contains (alias))
            return true;

    if (const auto* plugin = find (definition.sourcePlugin))
        if (contains (plugin->displayName) || contains (plugin->vendor))
            return true;

    return false;
}

juce::StringArray InstrumentRegistry::getDisplayNames() const
{
    juce::StringArray names;

    if (! catalogue.empty())
    {
        for (const auto& d : catalogue)
            if (d.category != "Internal")
                names.add (d.displayName);

        return names;
    }

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

juce::StringArray InstrumentRegistry::getBrowserCategories() const
{
    juce::StringArray categories;

    for (const auto* name : browserCategoryOrder)
        categories.add (name);

    for (const auto& d : catalogue)
        if (d.category != "Internal" && ! categories.contains (d.category))
            categories.add (d.category);

    return categories;
}

std::vector<const InstrumentDefinition*> InstrumentRegistry::getDefinitionsInCategory (const juce::String& category) const
{
    std::vector<const InstrumentDefinition*> result;

    for (const auto& d : catalogue)
        if (d.category == category)
            result.push_back (&d);

    return result;
}

juce::String InstrumentRegistry::getDisplayName (const juce::String& instrumentId) const
{
    if (auto* definition = findDefinition (instrumentId))
        return definition->displayName;

    if (auto* d = find (instrumentId))
        return d->displayName;

    return {};
}

juce::String InstrumentRegistry::findIdForDisplayName (const juce::String& displayName) const
{
    if (auto* definition = findDefinitionByDisplayName (displayName))
        return definition->id;

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
    d->validate();
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

juce::File InstrumentRegistry::findConfigFile()
{
    const auto env = juce::SystemStats::getEnvironmentVariable ("DAWWEB_RESOURCE_ROOT", {});

    if (env.isNotEmpty())
    {
        const juce::File fromEnv (env.replaceCharacter ('/', juce::File::getSeparatorChar()));
        const auto candidate = fromEnv.getChildFile ("instruments.json");

        if (candidate.existsAsFile())
            return candidate;
    }

    const auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
    const auto sibling = exe.getSiblingFile ("Resources").getChildFile ("instruments.json");

    if (sibling.existsAsFile())
        return sibling;

    auto dir = exe.getParentDirectory();

    for (int i = 0; i < 8 && dir != dir.getParentDirectory(); ++i)
    {
        const auto candidate = dir.getChildFile ("Source")
                                   .getChildFile ("Resources")
                                   .getChildFile ("instruments.json");

        if (candidate.existsAsFile())
            return candidate;

        dir = dir.getParentDirectory();
    }

    const auto appData = getSettingsFile();

    if (appData.existsAsFile())
        return appData;

    return {};
}

juce::String InstrumentRegistry::resolvePath (const juce::String& path) const
{
    if (path.isEmpty())
        return {};

    if (juce::File::isAbsolutePath (path))
        return path;

    if (resourceRoot.isNotEmpty())
        return juce::File (resourceRoot).getChildFile (path).getFullPathName();

    return path;
}

void InstrumentRegistry::load()
{
    seedBuiltInPlugins();
    catalogue.clear();
    techniques.clear();
    controllers.clear();
    libraries.clear();
    presets.clear();
    resourceWarnings.clear();
    startupStatus.clear();

    loadedConfigFile = findConfigFile();

    if (! loadedConfigFile.existsAsFile())
    {
        startupStatus = "instruments.json was not found. Using the built-in Test Synth only.";
        resourceWarnings.add (startupStatus);

        InstrumentDefinition fallback;
        fallback.id = testSynthId;
        fallback.displayName = "Test Synth";
        fallback.category = "Internal";
        fallback.sourcePlugin = testSynthId;
        fallback.presetMapped = true;
        fallback.controllers.add ("velocity");
        catalogue.push_back (fallback);

        ControllerDefinition velocity;
        velocity.id = "velocity";
        velocity.displayName = "Velocity";
        velocity.target = ControllerTarget::NoteVelocity;
        velocity.min = 1;
        velocity.max = 127;
        velocity.defaultValue = 100;
        velocity.mapped = true;
        controllers.push_back (velocity);

        for (auto& d : descriptors)
            d.validate();

        return;
    }

    const auto parsed = juce::JSON::parse (loadedConfigFile.loadFileAsString());

    if (! parsed.isObject())
    {
        startupStatus = "instruments.json is invalid.";
        resourceWarnings.add (startupStatus);
        return;
    }

    parseConfig (parsed);
    validateResources();
}

void InstrumentRegistry::parseConfig (const juce::var& root)
{
    resourceRoot = resolvePath (readString (root, "resourceRoot"));

    if (auto* pluginArray = root.getProperty ("plugins", juce::var()).getArray())
    {
        for (const auto& entry : *pluginArray)
        {
            const auto id = readString (entry, "instrumentId");
            auto* d = findMutable (id);

            if (d == nullptr || d->isBuiltIn())
                continue;

            d->displayName = readString (entry, "displayName", d->displayName);
            d->vendor = readString (entry, "vendor", d->vendor);
            d->pluginPath = resolvePath (readString (entry, "pluginPath"));
            d->pluginIdentifier = readString (entry, "pluginIdentifier");
            d->sampleLibraryPath = resolvePath (readString (entry, "sampleLibraryPath"));
            d->pluginPathFallbacks.clear();

            for (const auto& fallback : readStringArray (entry, "pluginPathFallbacks"))
                d->pluginPathFallbacks.add (resolvePath (fallback));
        }
    }

    if (auto* libraryArray = root.getProperty ("libraries", juce::var()).getArray())
    {
        for (const auto& entry : *libraryArray)
        {
            SampleLibrary library;
            library.id = readString (entry, "id");
            library.displayName = readString (entry, "displayName");
            library.pluginId = readString (entry, "pluginId");
            library.sampleLibraryPath = resolvePath (readString (entry, "sampleLibraryPath"));
            libraries.push_back (std::move (library));
        }
    }

    if (auto* techniqueArray = root.getProperty ("techniques", juce::var()).getArray())
    {
        for (const auto& entry : *techniqueArray)
        {
            TechniqueDefinition technique;
            technique.id = readString (entry, "id");
            technique.displayName = readString (entry, "displayName");
            technique.pluginId = readString (entry, "pluginId");
            technique.action = parseAction (entry.getProperty ("action", juce::var()));
            techniques.push_back (std::move (technique));
        }
    }

    if (auto* controllerArray = root.getProperty ("controllers", juce::var()).getArray())
    {
        for (const auto& entry : *controllerArray)
        {
            ControllerDefinition controller;
            controller.id = readString (entry, "id");
            controller.displayName = readString (entry, "displayName");
            controller.group = readString (entry, "group", "Performance");
            controller.target = controllerTargetFromString (readString (entry, "target"));
            controller.midiCC = readInt (entry, "midiCC", -1);
            controller.min = readInt (entry, "min", 0);
            controller.max = readInt (entry, "max", 127);
            controller.defaultValue = readInt (entry, "default", 64);
            controller.bipolar = readBool (entry, "bipolar", false);
            controller.mapped = readBool (entry, "mapped", false);
            controller.dimension = readString (entry, "dimension");
            controllers.push_back (std::move (controller));
        }
    }

    if (auto* instrumentArray = root.getProperty ("instruments", juce::var()).getArray())
    {
        for (const auto& entry : *instrumentArray)
        {
            InstrumentDefinition definition;
            definition.id = readString (entry, "id");
            definition.displayName = readString (entry, "displayName");
            definition.category = readString (entry, "category");
            definition.sourcePlugin = readString (entry, "sourcePlugin");
            definition.sourceLibrary = readString (entry, "sourceLibrary");
            definition.preset = readString (entry, "preset");
            definition.presetId = readString (entry, "presetId");
            definition.presetMapped = readBool (entry, "presetMapped", false);
            definition.techniques = readStringArray (entry, "techniques");
            definition.aliases = readStringArray (entry, "aliases");
            definition.description = readString (entry, "description");
            definition.controllers = readStringArray (entry, "controllers");

            const auto techniqueMap = entry.getProperty ("techniquePresets", juce::var());
            if (auto* map = techniqueMap.getDynamicObject())
                for (const auto& prop : map->getProperties())
                    definition.techniquePresets[prop.name.toString()] = prop.value.toString();
            definition.defaultMidiChannel = readInt (entry, "defaultMidiChannel", 1);
            definition.defaultVelocity = readFloat (entry, "defaultVelocity", 0.8f);
            definition.defaultVolume = readFloat (entry, "defaultVolume", 0.8f);
            definition.defaultPan = readFloat (entry, "defaultPan", 0.0f);
            catalogue.push_back (std::move (definition));
        }
    }

    if (auto* presetArray = root.getProperty ("presets", juce::var()).getArray())
    {
        for (const auto& entry : *presetArray)
        {
            PresetDefinition preset;
            preset.id = readString (entry, "id");
            preset.displayName = readString (entry, "displayName");
            preset.pluginId = readString (entry, "plugin");
            if (preset.pluginId.isEmpty())
                preset.pluginId = readString (entry, "pluginId");
            preset.stateFile = readString (entry, "stateFile");
            preset.patchFile = readString (entry, "patchFile");
            preset.instrumentName = readString (entry, "instrument");
            preset.technique = readString (entry, "technique");
            preset.libraryName = readString (entry, "library");
            preset.stateVersion = readInt (entry, "stateVersion", 1);
            preset.pluginVersion = readString (entry, "pluginVersion");
            preset.libraryVersion = readString (entry, "libraryVersion");
            presets.push_back (std::move (preset));
        }
    }
}

void InstrumentRegistry::validateResources()
{
    for (auto& d : descriptors)
        d.validate();

    for (auto& library : libraries)
    {
        library.available = library.sampleLibraryPath.isNotEmpty()
                            && (juce::File (library.sampleLibraryPath).isDirectory()
                                || juce::File (library.sampleLibraryPath).exists());

        if (! library.available)
            resourceWarnings.add (library.displayName + ": sample library not found.");
    }

    for (const auto& d : descriptors)
    {
        if (d.isBuiltIn())
            continue;

        if (! d.pluginFileFound)
            resourceWarnings.add (d.displayName + " is unavailable.");
        else if (! d.sampleLibraryFound && d.sampleLibraryPath.isNotEmpty())
            resourceWarnings.add (d.displayName + ": sample library not found.");
    }

    if (resourceWarnings.isEmpty())
        startupStatus = "Instrument catalogue loaded from " + loadedConfigFile.getFileName() + ".";
    else
        startupStatus = juce::String (resourceWarnings.size()) + " instrument resource warning(s).";
}

void InstrumentRegistry::save() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("resourceRoot", resourceRoot);

    juce::Array<juce::var> pluginArray;

    for (const auto& d : descriptors)
    {
        if (d.isBuiltIn())
            continue;

        auto* object = new juce::DynamicObject();
        object->setProperty ("instrumentId", d.instrumentId);
        object->setProperty ("displayName", d.displayName);
        object->setProperty ("vendor", d.vendor);
        object->setProperty ("pluginPath", d.pluginPath);
        object->setProperty ("pluginIdentifier", d.pluginIdentifier);
        object->setProperty ("sampleLibraryPath", d.sampleLibraryPath);

        juce::Array<juce::var> fallbacks;
        for (const auto& path : d.pluginPathFallbacks)
            fallbacks.add (path);
        object->setProperty ("pluginPathFallbacks", fallbacks);
        pluginArray.add (juce::var (object));
    }

    root->setProperty ("plugins", pluginArray);

    const auto file = getSettingsFile();
    file.getParentDirectory().createDirectory();
    file.replaceWithText (juce::JSON::toString (juce::var (root), true));
}
