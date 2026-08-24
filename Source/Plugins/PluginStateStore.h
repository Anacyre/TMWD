#pragma once

#include "InstrumentModel.h"
#include <JuceHeader.h>

/*  Factory VST state blobs live on disk, never in UI code.  Search order:

        DAWWEB_RESOURCE_ROOT / states or instruments
        <exe>/Resources/instruments
        <repo>/Source/Resources/instruments
        %AppData%/DawWeb/instruments
*/
struct StateMetadata
{
    juce::String id;
    juce::String pluginId;
    juce::String instrument;
    juce::String technique;
    juce::String library;
    juce::String stateFile;
    int stateVersion = 1;
    juce::String pluginVersion;
    juce::String libraryVersion;
    juce::String checksum;
    juce::String capturedAt;
    juce::int64 byteSize = 0;
};

class PluginStateStore
{
public:
    explicit PluginStateStore (const juce::File& configFile);

    juce::File resolveStateFile (const PresetDefinition& preset) const;
    juce::File resolveMetadataFile (const PresetDefinition& preset) const;
    bool hasState (const PresetDefinition& preset) const;

    bool loadState (const PresetDefinition& preset, juce::MemoryBlock& dest) const;
    bool saveState (const PresetDefinition& preset, const juce::MemoryBlock& state) const;
    bool saveState (const PresetDefinition& preset, const juce::MemoryBlock& state,
                    const juce::String& pluginVersion) const;

    StateMetadata makeMetadata (const PresetDefinition& preset, const juce::MemoryBlock& state,
                                const juce::String& pluginVersion = {}) const;
    bool loadMetadata (const PresetDefinition& preset, StateMetadata& dest) const;
    bool saveMetadata (const PresetDefinition& preset, const StateMetadata& metadata) const;
    bool verifyIntegrity (const PresetDefinition& preset, const juce::MemoryBlock& state,
                          juce::String& error) const;
    juce::String hashState (const juce::MemoryBlock& state) const;
    bool statesEqual (const juce::MemoryBlock& a, const juce::MemoryBlock& b) const;
    bool matchesDefaultDump (const juce::String& pluginId, const juce::MemoryBlock& state) const;
    bool isTrustedFactoryState (const PresetDefinition& preset, const juce::MemoryBlock& state) const;

    juce::File getWriteDirectory() const;
    juce::String extractPrintableStrings (const juce::MemoryBlock& state) const;

    /** Writes a dump of a captured blob for inspection (development). */
    void writeDump (const juce::String& name, const juce::MemoryBlock& state) const;

    /** Replaces equal-length ASCII and UTF-16LE occurrences.  Returns how many replacements ran. */
    int replaceAsciiAndUtf16 (juce::MemoryBlock& state,
                              const juce::String& needle,
                              const juce::String& replacement) const;

    bool containsAsciiOrUtf16 (const juce::MemoryBlock& state, const juce::String& needle) const;

private:
    juce::Array<juce::File> searchRoots;
};
