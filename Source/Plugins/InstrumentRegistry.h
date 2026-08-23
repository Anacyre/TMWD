#pragma once

#include "PluginDescriptor.h"

/*  The closed catalogue of instruments the application supports.  Nothing in the UI
    knows a file path: it only ever passes an instrumentId around, and the paths for the
    external instruments are stored in a small settings file so they can be pointed at a
    different machine without recompiling.
*/
class InstrumentRegistry
{
public:
    InstrumentRegistry();

    static constexpr const char* testSynthId      = "test_synth";
    static constexpr const char* bbcsoDiscoverId  = "bbcso_discover";
    static constexpr const char* synchronPlayerId = "synchron_player";

    const std::vector<PluginDescriptor>& getAll() const noexcept { return descriptors; }

    const PluginDescriptor* find (const juce::String& instrumentId) const;

    /** Display names in catalogue order, for menus. */
    juce::StringArray getDisplayNames() const;
    juce::StringArray getInstrumentIds() const;

    juce::String getDisplayName (const juce::String& instrumentId) const;

    /** Maps a display name back to its id, so existing UI strings keep working. */
    juce::String findIdForDisplayName (const juce::String& displayName) const;

    /** Points an external instrument at its plugin file and persists the change. */
    bool setPluginPath (const juce::String& instrumentId, const juce::String& path);

    void load();
    void save() const;

    static juce::File getSettingsFile();

private:
    PluginDescriptor* findMutable (const juce::String& instrumentId);

    std::vector<PluginDescriptor> descriptors;
};
