#pragma once

#include <JuceHeader.h>

/*  Describes one hosted plugin the application is allowed to load.  The catalogue is
    closed: only bbcso_discover and synchron_player are external, plus the built-in
    test synth.  File locations come from instruments.json, not from C++.
*/
struct PluginDescriptor
{
    enum class Kind
    {
        builtin,
        vst3
    };

    juce::String instrumentId;
    juce::String displayName;
    juce::String vendor;
    Kind kind = Kind::builtin;

    juce::String pluginPath;
    juce::StringArray pluginPathFallbacks;
    juce::String pluginIdentifier;
    juce::String sampleLibraryPath;

    bool pluginFileFound = false;
    bool sampleLibraryFound = false;
    juce::String availabilityError;

    bool isBuiltIn() const noexcept { return kind == Kind::builtin; }

    bool isApprovedExternal() const noexcept
    {
        return instrumentId == "bbcso_discover" || instrumentId == "synchron_player";
    }

    juce::StringArray allPluginPaths() const
    {
        juce::StringArray paths;
        if (pluginPath.isNotEmpty())
            paths.add (pluginPath);
        paths.addArray (pluginPathFallbacks);
        paths.removeEmptyStrings();
        paths.removeDuplicates (false);
        return paths;
    }

    juce::String firstExistingPluginPath() const
    {
        for (const auto& path : allPluginPaths())
            if (juce::File (path).exists())
                return path;

        return {};
    }

    void validate()
    {
        pluginFileFound = false;
        sampleLibraryFound = false;
        availabilityError.clear();

        if (isBuiltIn())
        {
            pluginFileFound = true;
            sampleLibraryFound = true;
            return;
        }

        pluginFileFound = firstExistingPluginPath().isNotEmpty();

        if (sampleLibraryPath.isEmpty())
            sampleLibraryFound = true;
        else
            sampleLibraryFound = juce::File (sampleLibraryPath).isDirectory()
                                 || juce::File (sampleLibraryPath).exists();

        if (! pluginFileFound)
            availabilityError = displayName + " is unavailable.";
        else if (! sampleLibraryFound)
            availabilityError = "Sample library not found.";
    }

    bool isAvailable() const
    {
        if (isBuiltIn())
            return true;

        return pluginFileFound;
    }
};
