#include "OrchestraSamplerModel.h"

namespace OrchestraSampler
{
namespace
{
    float defaultNormalised (const ControllerDefinition& controller)
    {
        if (controller.max <= controller.min)
            return 0.0f;

        return juce::jlimit (0.0f, 1.0f,
                             (float) (controller.defaultValue - controller.min)
                                 / (float) (controller.max - controller.min));
    }

    ControlMappingType techniqueImplementation (const InstrumentRegistry& registry,
                                               const InstrumentDefinition& definition,
                                               const juce::String& techniqueId)
    {
        if (registry.resolvePresetId (definition, techniqueId).isNotEmpty())
            return ControlMappingType::PresetAction;

        if (const auto* technique = registry.findTechnique (techniqueId))
        {
            if (! technique->action.mapped)
                return ControlMappingType::None;

            switch (technique->action.type)
            {
                case TechniqueActionType::KeySwitch:           return ControlMappingType::MidiNote;
                case TechniqueActionType::MidiCC:              return ControlMappingType::MidiCC;
                case TechniqueActionType::DimensionController: return ControlMappingType::DimensionController;
                case TechniqueActionType::PresetChange:        return ControlMappingType::PresetAction;
                case TechniqueActionType::ProgramChange:       return ControlMappingType::PluginParameter;
                case TechniqueActionType::None:                break;
            }
        }

        return ControlMappingType::None;
    }
}

juce::String friendlyPluginName (const juce::String& pluginId, const juce::String& fallback)
{
    if (pluginId == InstrumentRegistry::bbcsoDiscoverId)
        return "BBCSO Discover";

    if (pluginId == InstrumentRegistry::synchronPlayerId)
        return "Synchron Player";

    if (pluginId == InstrumentRegistry::testSynthId)
        return "Test Synth";

    return fallback.isNotEmpty() ? fallback : pluginId;
}

SamplerControlType widgetTypeForController (const juce::String& controllerId)
{
    if (controllerId == "pedal")
        return SamplerControlType::Toggle;

    return SamplerControlType::Knob;
}

ControlMappingType mappingTypeForTarget (ControllerTarget target)
{
    switch (target)
    {
        case ControllerTarget::MidiCC:              return ControlMappingType::MidiCC;
        case ControllerTarget::PitchBend:           return ControlMappingType::PitchBend;
        case ControllerTarget::Aftertouch:          return ControlMappingType::Aftertouch;
        case ControllerTarget::AftertouchRelease:   return ControlMappingType::Aftertouch;
        case ControllerTarget::NoteVelocity:        return ControlMappingType::NoteVelocity;
        case ControllerTarget::DimensionController: return ControlMappingType::DimensionController;
        case ControllerTarget::Speed:
        case ControllerTarget::Unspecified:         break;
    }

    return ControlMappingType::None;
}

juce::String mappingLabel (const ControllerDefinition& controller)
{
    if (! controller.mapped)
        return "N/A";

    switch (controller.target)
    {
        case ControllerTarget::MidiCC:
            return controller.midiCC >= 0 ? "CC" + juce::String (controller.midiCC) : juce::String ("N/A");
        case ControllerTarget::PitchBend:           return "Pitch bend";
        case ControllerTarget::Aftertouch:          return "Aftertouch";
        case ControllerTarget::NoteVelocity:        return "Note velocity";
        case ControllerTarget::DimensionController:
            return controller.dimension.isNotEmpty() ? "Dimension " + controller.dimension
                                                     : juce::String ("Dimension");
        default: break;
    }

    return "N/A";
}

juce::String mappingTypeName (ControlMappingType type)
{
    switch (type)
    {
        case ControlMappingType::MidiCC:               return "MidiCC";
        case ControlMappingType::MidiNote:             return "MidiNote";
        case ControlMappingType::PitchBend:            return "PitchBend";
        case ControlMappingType::Aftertouch:           return "Aftertouch";
        case ControlMappingType::PluginParameter:      return "PluginParameter";
        case ControlMappingType::DimensionController:  return "DimensionController";
        case ControlMappingType::PresetAction:         return "PresetAction";
        case ControlMappingType::TechniqueAction:      return "TechniqueAction";
        case ControlMappingType::NoteVelocity:         return "NoteVelocity";
        case ControlMappingType::None:                 break;
    }

    return "None";
}

juce::String controlTypeName (SamplerControlType type)
{
    switch (type)
    {
        case SamplerControlType::Knob:               return "knob";
        case SamplerControlType::VerticalFader:      return "verticalFader";
        case SamplerControlType::HorizontalFader:    return "horizontalFader";
        case SamplerControlType::Button:             return "button";
        case SamplerControlType::Toggle:             return "toggle";
        case SamplerControlType::Selector:           return "selector";
        case SamplerControlType::XYPad:              return "xy";
        case SamplerControlType::KeyswitchSelector:  return "keyswitchSelector";
        case SamplerControlType::Meter:              return "meter";
    }

    return "knob";
}

bool isTechniqueAvailable (const InstrumentRegistry& registry,
                           const InstrumentDefinition& definition,
                           const juce::String& techniqueId)
{
    const auto presetId = registry.resolvePresetId (definition, techniqueId);

    if (presetId.isNotEmpty())
    {
        const auto* preset = registry.findPreset (presetId);
        return preset != nullptr && preset->stateAvailable;
    }

    const auto* technique = registry.findTechnique (techniqueId);
    return technique != nullptr && technique->action.mapped
           && technique->action.type != TechniqueActionType::None;
}

InstrumentCapabilities buildCapabilities (const InstrumentRegistry& registry,
                                          const InstrumentDefinition& definition)
{
    InstrumentCapabilities capabilities;
    capabilities.instrumentId = definition.id;
    capabilities.displayName = definition.displayName;
    capabilities.category = definition.category;
    capabilities.sourcePlugin = definition.sourcePlugin;
    capabilities.defaultPresetId = definition.presetId;

    if (const auto* plugin = registry.find (definition.sourcePlugin))
        capabilities.sourcePluginName = friendlyPluginName (plugin->instrumentId, plugin->displayName);
    else
        capabilities.sourcePluginName = friendlyPluginName (definition.sourcePlugin, definition.sourcePlugin);

    capabilities.sourceLibrary = definition.sourceLibrary;

    if (const auto* library = registry.findLibrary (definition.sourceLibrary))
        capabilities.sourceLibraryName = library->displayName;
    else
        capabilities.sourceLibraryName = definition.sourceLibrary;

    for (const auto& techniqueId : definition.techniques)
    {
        SamplerTechnique technique;
        technique.id = techniqueId;
        technique.presetId = registry.resolvePresetId (definition, techniqueId);
        technique.available = isTechniqueAvailable (registry, definition, techniqueId);
        technique.implementation = techniqueImplementation (registry, definition, techniqueId);

        if (const auto* definitionTechnique = registry.findTechnique (techniqueId))
            technique.displayName = definitionTechnique->displayName;
        else
            technique.displayName = techniqueId;

        capabilities.techniques.push_back (std::move (technique));
    }

    for (const auto& controllerId : definition.controllers)
    {
        const auto* controller = registry.findController (controllerId);

        if (controller == nullptr)
            continue;

        SamplerControl control;
        control.id = controller->id;
        control.displayName = controller->displayName;
        control.group = controller->group;
        control.type = widgetTypeForController (controller->id);
        control.minimum = 0.0f;
        control.maximum = 1.0f;
        control.defaultValue = defaultNormalised (*controller);
        control.currentValue = control.defaultValue;
        control.unit = controller->mapped ? juce::String() : juce::String ("N/A");
        control.midiMapping = mappingLabel (*controller);
        control.mappingType = controller->mapped ? mappingTypeForTarget (controller->target)
                                                 : ControlMappingType::None;
        control.source = mappingTypeName (control.mappingType);
        control.available = controller->mapped;
        control.automationEnabled = controller->mapped;
        capabilities.controls.push_back (std::move (control));
    }

    return capabilities;
}

InstrumentSnapshot buildSnapshot (const InstrumentRegistry& registry,
                                  const PluginStateStore& stateStore,
                                  const TrackData* track,
                                  int trackIndex)
{
    InstrumentSnapshot snapshot;
    snapshot.trackIndex = trackIndex;

    if (track == nullptr || track->instrumentDefinitionId.isEmpty())
    {
        snapshot.loadState = "Unloaded";
        snapshot.loadMessage = "No instrument assigned.";
        return snapshot;
    }

    const auto* definition = registry.findDefinition (track->instrumentDefinitionId);

    if (definition == nullptr)
    {
        snapshot.loadState = "Error";
        snapshot.loadMessage = "Unknown instrument: " + track->instrumentDefinitionId;
        return snapshot;
    }

    snapshot.capabilities = buildCapabilities (registry, *definition);
    snapshot.techniqueId = track->techniqueId;
    snapshot.presetId = track->presetId.isNotEmpty()
                            ? track->presetId
                            : registry.resolvePresetId (*definition, track->techniqueId);
    snapshot.loadState = instrumentLoadStateLabel (track->instrumentLoadState);
    snapshot.loadMessage = track->instrumentLoadMessage.isNotEmpty()
                               ? track->instrumentLoadMessage
                               : snapshot.loadState;
    snapshot.usesFactoryState = track->usesFactoryState;
    snapshot.legatoEnabled = track->legatoEnabled;
    snapshot.ready = track->instrumentLoadState == InstrumentLoadState::Loaded
                     || track->instrumentLoadState == InstrumentLoadState::Active;

    for (auto& technique : snapshot.capabilities.techniques)
        technique.selected = technique.id == snapshot.techniqueId
                             || (snapshot.techniqueId.isEmpty() && technique.presetId == snapshot.presetId);

    for (const auto& technique : snapshot.capabilities.techniques)
        if (technique.selected)
        {
            snapshot.techniqueName = technique.displayName;
            break;
        }

    if (const auto* preset = registry.findPreset (snapshot.presetId))
    {
        snapshot.stateFile = preset->stateFile;
        snapshot.stateVersion = preset->stateVersion;
        snapshot.pluginVersion = preset->pluginVersion;
        snapshot.checksum = preset->checksum;

        StateMetadata metadata;

        if (stateStore.loadMetadata (*preset, metadata))
        {
            if (metadata.checksum.isNotEmpty())
                snapshot.checksum = metadata.checksum;
            if (metadata.stateVersion > 0)
                snapshot.stateVersion = metadata.stateVersion;
            if (metadata.pluginVersion.isNotEmpty())
                snapshot.pluginVersion = metadata.pluginVersion;
        }

        const auto file = stateStore.resolveStateFile (*preset);

        if (file.existsAsFile())
            snapshot.stateFile = file.getFileName();
    }

    for (auto& control : snapshot.capabilities.controls)
    {
        const auto it = track->controllerValues.find (control.id);
        control.currentValue = it != track->controllerValues.end() ? it->second : control.defaultValue;
    }

    return snapshot;
}

juce::var capabilitiesToVar (const InstrumentCapabilities& capabilities)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("instrumentId", capabilities.instrumentId);
    object->setProperty ("displayName", capabilities.displayName);
    object->setProperty ("category", capabilities.category);
    object->setProperty ("sourcePlugin", capabilities.sourcePlugin);
    object->setProperty ("sourcePluginName", capabilities.sourcePluginName);
    object->setProperty ("sourceLibrary", capabilities.sourceLibrary);
    object->setProperty ("sourceLibraryName", capabilities.sourceLibraryName);
    object->setProperty ("defaultPresetId", capabilities.defaultPresetId);

    juce::Array<juce::var> techniques;

    for (const auto& technique : capabilities.techniques)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("id", technique.id);
        item->setProperty ("displayName", technique.displayName);
        item->setProperty ("presetId", technique.presetId);
        item->setProperty ("available", technique.available);
        item->setProperty ("selected", technique.selected);
        item->setProperty ("implementation", mappingTypeName (technique.implementation));
        techniques.add (juce::var (item));
    }

    object->setProperty ("techniques", juce::var (techniques));

    juce::Array<juce::var> controls;

    for (const auto& control : capabilities.controls)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("id", control.id);
        item->setProperty ("displayName", control.displayName);
        item->setProperty ("group", control.group);
        item->setProperty ("type", controlTypeName (control.type));
        item->setProperty ("min", control.minimum);
        item->setProperty ("max", control.maximum);
        item->setProperty ("defaultValue", control.defaultValue);
        item->setProperty ("currentValue", control.currentValue);
        item->setProperty ("unit", control.unit);
        item->setProperty ("midiMapping", control.midiMapping);
        item->setProperty ("source", control.source);
        item->setProperty ("available", control.available);
        item->setProperty ("automationEnabled", control.automationEnabled);
        controls.add (juce::var (item));
    }

    object->setProperty ("controls", juce::var (controls));
    return juce::var (object);
}

juce::var snapshotToVar (const InstrumentSnapshot& snapshot)
{
    auto object = capabilitiesToVar (snapshot.capabilities);
    auto* root = object.getDynamicObject();

    if (root == nullptr)
        return object;

    root->setProperty ("trackIndex", snapshot.trackIndex);
    root->setProperty ("techniqueId", snapshot.techniqueId);
    root->setProperty ("techniqueName", snapshot.techniqueName);
    root->setProperty ("presetId", snapshot.presetId);
    root->setProperty ("stateFile", snapshot.stateFile);
    root->setProperty ("checksum", snapshot.checksum);
    root->setProperty ("stateVersion", snapshot.stateVersion);
    root->setProperty ("pluginVersion", snapshot.pluginVersion);
    root->setProperty ("loadState", snapshot.loadState);
    root->setProperty ("loadMessage", snapshot.loadMessage);
    root->setProperty ("ready", snapshot.ready);
    root->setProperty ("usesFactoryState", snapshot.usesFactoryState);
    root->setProperty ("legato", snapshot.legatoEnabled);
    return object;
}

juce::var controlsToVar (const InstrumentSnapshot& snapshot)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("instrumentId", snapshot.capabilities.instrumentId);
    object->setProperty ("ready", snapshot.ready);

    juce::Array<juce::var> controls;

    for (const auto& control : snapshot.capabilities.controls)
    {
        auto* item = new juce::DynamicObject();
        item->setProperty ("id", control.id);
        item->setProperty ("displayName", control.displayName);
        item->setProperty ("value", control.currentValue);
        item->setProperty ("available", control.available);
        item->setProperty ("midiMapping", control.midiMapping);
        controls.add (juce::var (item));
    }

    object->setProperty ("controls", juce::var (controls));
    return juce::var (object);
}
}
