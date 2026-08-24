#pragma once

#include "Project.h"

class ProjectFile
{
public:
    static juce::var toVar (const Project& project);
    static bool fromVar (const juce::var& parsed, Project& project, juce::String& error);
    static bool save (const juce::File& file, const Project& project);
    static bool load (const juce::File& file, Project& project, juce::String& error);
};
