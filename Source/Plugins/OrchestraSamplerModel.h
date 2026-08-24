#pragma once

#include "InstrumentModel.h"
#include "InstrumentRegistry.h"
#include "PluginStateStore.h"
#include "../Model/ProjectModel.h"
#include <JuceHeader.h>
#include <vector>

/*  Plugin-agnostic instrument editor model.

    Orchestra Sampler never addresses a VST by vendor UI names.  Every control the
    panel shows is a SamplerControl whose mapping comes from catalogue data.
    Unmapped controls stay N/A; they do not invent MIDI, keyswitches or parameters.
*/

enum class SamplerControlType
{
    Knob,
    VerticalFader,
    HorizontalFader,
    Button,
    Toggle,
    Selector,
    XYPad,
    KeyswitchSelector,
    Meter
};

enum class ControlMappingType
{
    MidiCC,
    MidiNote,
    PitchBend,
    Aftertouch,
    PluginParameter,
    DimensionController,
    PresetAction,
    TechniqueAction,
    NoteVelocity,
    None
};

struct SamplerControl
{
    juce::String id;
    juce::String displayName;
    juce::String group;
    SamplerControlType type = SamplerControlType::Knob;
    float minimum = 0.0f;
    float maximum = 1.0f;
    float defaultValue = 0.5f;
    float currentValue = 0.5f;
    juce::String unit;
    juce::String midiMapping;
    ControlMappingType mappingType = ControlMappingType::None;
    juce::String source;
    bool available = false;
    bool automationEnabled = true;
};

struct SamplerTechnique
{
    juce::String id;
    juce::String displayName;
    juce::String presetId;
    bool available = false;
    bool selected = false;
    ControlMappingType implementation = ControlMappingType::None;
};

struct InstrumentCapabilities
{
    juce::String instrumentId;
    juce::String displayName;
    juce::String category;
    juce::String sourcePlugin;
    juce::String sourcePluginName;
    juce::String sourceLibrary;
    juce::String sourceLibraryName;
    juce::String defaultPresetId;
    std::vector<SamplerTechnique> techniques;
    std::vector<SamplerControl> controls;
};

struct InstrumentSnapshot
{
    InstrumentCapabilities capabilities;
    juce::String techniqueId;
    juce::String techniqueName;
    juce::String presetId;
    juce::String stateFile;
    juce::String checksum;
    int stateVersion = 1;
    juce::String pluginVersion;
    juce::String loadState;
    juce::String loadMessage;
    bool ready = false;
    bool usesFactoryState = true;
    bool legatoEnabled = false;
    int trackIndex = -1;
};

namespace OrchestraSampler
{
    juce::String friendlyPluginName (const juce::String& pluginId, const juce::String& fallback);
    SamplerControlType widgetTypeForController (const juce::String& controllerId);
    ControlMappingType mappingTypeForTarget (ControllerTarget target);
    juce::String mappingLabel (const ControllerDefinition& controller);
    juce::String mappingTypeName (ControlMappingType type);
    juce::String controlTypeName (SamplerControlType type);

    bool isTechniqueAvailable (const InstrumentRegistry& registry,
                               const InstrumentDefinition& definition,
                               const juce::String& techniqueId);

    InstrumentCapabilities buildCapabilities (const InstrumentRegistry& registry,
                                              const InstrumentDefinition& definition);

    InstrumentSnapshot buildSnapshot (const InstrumentRegistry& registry,
                                      const PluginStateStore& stateStore,
                                      const TrackData* track,
                                      int trackIndex);

    juce::var capabilitiesToVar (const InstrumentCapabilities& capabilities);
    juce::var snapshotToVar (const InstrumentSnapshot& snapshot);
    juce::var controlsToVar (const InstrumentSnapshot& snapshot);
}
