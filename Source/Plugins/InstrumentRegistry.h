#pragma once

#include "InstrumentModel.h"
#include "PluginDescriptor.h"

/*  Closed catalogue of plugins and musical instruments.  Paths come from
    instruments.json (or DAWWEB_RESOURCE_ROOT).  Nothing in the UI stores a path.
*/
class InstrumentRegistry
{
public:
    InstrumentRegistry();

    static constexpr const char* testSynthId      = "test_synth";
    static constexpr const char* bbcsoDiscoverId  = "bbcso_discover";
    static constexpr const char* synchronPlayerId = "synchron_player";

    /** One live hosted VST3 per mixer channel so every track can sound at once. */
    static constexpr int maxHostedInstances = 64;

    const std::vector<PluginDescriptor>& getPlugins() const noexcept { return descriptors; }
    const std::vector<InstrumentDefinition>& getCatalogue() const noexcept { return catalogue; }
    const std::vector<TechniqueDefinition>& getTechniques() const noexcept { return techniques; }
    const std::vector<ControllerDefinition>& getControllers() const noexcept { return controllers; }
    const std::vector<SampleLibrary>& getLibraries() const noexcept { return libraries; }
    const std::vector<PresetDefinition>& getPresets() const noexcept { return presets; }

    const PluginDescriptor* find (const juce::String& instrumentId) const;
    const InstrumentDefinition* findDefinition (const juce::String& id) const;
    const InstrumentDefinition* findDefinitionByDisplayName (const juce::String& displayName) const;
    const TechniqueDefinition* findTechnique (const juce::String& id) const;
    const ControllerDefinition* findController (const juce::String& id) const;
    const SampleLibrary* findLibrary (const juce::String& id) const;
    const PresetDefinition* findPreset (const juce::String& id) const;
    PresetDefinition* findPresetMutable (const juce::String& id);
    const InstrumentDefinition* findDefinitionForPreset (const juce::String& presetId) const;

    juce::String resolvePresetId (const InstrumentDefinition& definition,
                                  const juce::String& techniqueId = {}) const;
    bool matchesSearch (const InstrumentDefinition& definition, const juce::String& query) const;

    juce::StringArray getDisplayNames() const;
    juce::StringArray getInstrumentIds() const;
    juce::StringArray getBrowserCategories() const;
    std::vector<const InstrumentDefinition*> getDefinitionsInCategory (const juce::String& category) const;

    juce::String getDisplayName (const juce::String& instrumentId) const;
    juce::String findIdForDisplayName (const juce::String& displayName) const;

    bool setPluginPath (const juce::String& instrumentId, const juce::String& path);

    juce::String getResourceRoot() const { return resourceRoot; }
    juce::File getLoadedConfigFile() const { return loadedConfigFile; }
    juce::String getStartupStatus() const { return startupStatus; }
    juce::StringArray getResourceWarnings() const { return resourceWarnings; }

    void load();
    void save() const;

    static juce::File getSettingsFile();
    static juce::File findConfigFile();

private:
    PluginDescriptor* findMutable (const juce::String& instrumentId);
    void seedBuiltInPlugins();
    void parseConfig (const juce::var& root);
    void validateResources();
    juce::String resolvePath (const juce::String& path) const;

    std::vector<PluginDescriptor> descriptors;
    std::vector<InstrumentDefinition> catalogue;
    std::vector<TechniqueDefinition> techniques;
    std::vector<ControllerDefinition> controllers;
    std::vector<SampleLibrary> libraries;
    std::vector<PresetDefinition> presets;
    juce::String resourceRoot;
    juce::File loadedConfigFile;
    juce::String startupStatus;
    juce::StringArray resourceWarnings;
};
