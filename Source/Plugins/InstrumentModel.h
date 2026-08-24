#pragma once

#include <JuceHeader.h>
#include <map>

/*  Data-driven instrument catalogue.  The UI and EngineAPI only ever see these
    structures; VST3 paths, keyswitch notes and MIDI CC numbers stay in configuration.
*/

enum class TechniqueActionType
{
    KeySwitch,
    MidiCC,
    ProgramChange,
    DimensionController,
    PresetChange,
    None
};

enum class ControllerTarget
{
    MidiCC,
    PitchBend,
    Aftertouch,
    AftertouchRelease,
    NoteVelocity,
    Speed,
    DimensionController,
    Unspecified
};

inline TechniqueActionType techniqueActionTypeFromString (const juce::String& s)
{
    const auto t = s.trim();
    if (t.equalsIgnoreCase ("KeySwitch"))           return TechniqueActionType::KeySwitch;
    if (t.equalsIgnoreCase ("MidiCC"))              return TechniqueActionType::MidiCC;
    if (t.equalsIgnoreCase ("ProgramChange"))       return TechniqueActionType::ProgramChange;
    if (t.equalsIgnoreCase ("DimensionController")) return TechniqueActionType::DimensionController;
    if (t.equalsIgnoreCase ("PresetChange"))        return TechniqueActionType::PresetChange;
    return TechniqueActionType::None;
}

inline ControllerTarget controllerTargetFromString (const juce::String& s)
{
    const auto t = s.trim();
    if (t.equalsIgnoreCase ("midiCC"))              return ControllerTarget::MidiCC;
    if (t.equalsIgnoreCase ("pitchBend"))           return ControllerTarget::PitchBend;
    if (t.equalsIgnoreCase ("aftertouch"))          return ControllerTarget::Aftertouch;
    if (t.equalsIgnoreCase ("aftertouchRelease"))   return ControllerTarget::AftertouchRelease;
    if (t.equalsIgnoreCase ("noteVelocity"))        return ControllerTarget::NoteVelocity;
    if (t.equalsIgnoreCase ("speed"))               return ControllerTarget::Speed;
    if (t.equalsIgnoreCase ("dimensionController")) return ControllerTarget::DimensionController;
    return ControllerTarget::Unspecified;
}

struct TechniqueAction
{
    TechniqueActionType type = TechniqueActionType::None;
    int midiNote = 0;
    int velocity = 100;
    int midiCC = 0;
    int value = 0;
    int program = 0;
    juce::String dimension;      // A-H for Synchron
    juce::String presetName;
    bool mapped = false;
};

struct TechniqueDefinition
{
    juce::String id;
    juce::String displayName;
    juce::String pluginId;
    TechniqueAction action;
};

struct PresetDefinition
{
    juce::String id;
    juce::String displayName;
    juce::String pluginId;
    juce::String instrumentName;
    juce::String technique;
    juce::String libraryName;
    juce::String stateFile;
    juce::String patchFile;
    int stateVersion = 1;
    juce::String pluginVersion;
    juce::String libraryVersion;
    juce::String checksum;
    bool stateAvailable = false;
};

struct ControllerDefinition
{
    juce::String id;
    juce::String displayName;
    juce::String group { "Performance" };
    ControllerTarget target = ControllerTarget::Unspecified;
    int midiCC = -1;
    int min = 0;
    int max = 127;
    int defaultValue = 64;
    bool bipolar = false;
    bool mapped = false;
    juce::String dimension;
};

struct SampleLibrary
{
    juce::String id;
    juce::String displayName;
    juce::String pluginId;
    juce::String sampleLibraryPath;
    bool available = false;
};

struct InstrumentDefinition
{
    juce::String id;
    juce::String displayName;
    juce::String category;
    juce::String sourcePlugin;
    juce::String sourceLibrary;
    juce::String preset;
    juce::String presetId;
    bool presetMapped = false;
    juce::StringArray techniques;
    juce::StringArray aliases;
    juce::String description;
    std::map<juce::String, juce::String> techniquePresets;
    juce::StringArray controllers;
    int defaultMidiChannel = 1;
    float defaultVelocity = 0.8f;
    float defaultVolume = 0.8f;
    float defaultPan = 0.0f;
};

inline juce::var techniqueActionToVar (const TechniqueAction& action)
{
    auto* object = new juce::DynamicObject();
    juce::String typeName = "None";

    switch (action.type)
    {
        case TechniqueActionType::KeySwitch:           typeName = "KeySwitch"; break;
        case TechniqueActionType::MidiCC:              typeName = "MidiCC"; break;
        case TechniqueActionType::ProgramChange:       typeName = "ProgramChange"; break;
        case TechniqueActionType::DimensionController: typeName = "DimensionController"; break;
        case TechniqueActionType::PresetChange:        typeName = "PresetChange"; break;
        case TechniqueActionType::None:                break;
    }

    object->setProperty ("type", typeName);
    object->setProperty ("mapped", action.mapped);
    return juce::var (object);
}
