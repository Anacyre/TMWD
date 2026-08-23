#pragma once

#include <JuceHeader.h>

/*  Describes one instrument the application is allowed to load.  The application
    deliberately does not offer a general "browse for a VST" workflow: the catalogue is
    fixed, and each entry is addressed by a stable instrumentId.  Only the file location
    is configurable, and it lives in the registry's settings file rather than in the UI.
*/
struct PluginDescriptor
{
    enum class Kind
    {
        builtin,   // compiled into the application
        vst3       // hosted through juce_audio_processors
    };

    juce::String instrumentId;        // "test_synth", "bbcso_discover", "synchron_player"
    juce::String displayName;
    juce::String vendor;
    Kind kind = Kind::builtin;

    /** Where the plugin lives.  Empty until the user points the registry at it. */
    juce::String pluginPath;

    /** Optional sub-plugin identifier for formats that expose several entries. */
    juce::String pluginIdentifier;

    bool isBuiltIn() const noexcept { return kind == Kind::builtin; }

    /** True when this instrument can actually be instantiated right now. */
    bool isAvailable() const
    {
        if (isBuiltIn())
            return true;

        return pluginPath.isNotEmpty() && juce::File (pluginPath).exists();
    }
};
