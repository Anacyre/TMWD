#pragma once

#include <JuceHeader.h>
#include "ProjectSchema.h"

/*  Browser-owned sampler.  The PC stores the track source and never loads a VST
    for these tracks.  Sample data is not stored in the engine in Phase 6.
*/
struct WebSamplerPatch
{
    juce::String name { "Web Sampler" };
    juce::String sampleUrl;
    int rootNote = 60;
    bool pitchTracking = true;
    float velocity = 0.8f;
    float attack = 0.005f;
    float release = 0.12f;
    float gain = 0.7f;
    float loopStart = 0.0f;
    float loopEnd = 0.0f;
    int polyphony = 8;
    int roundRobin = 1;

    juce::var toVar() const
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("type", ProjectSchema::sourceWebSampler);
        object->setProperty ("name", name);
        object->setProperty ("sampleUrl", sampleUrl);
        object->setProperty ("rootNote", rootNote);
        object->setProperty ("pitchTracking", pitchTracking);
        object->setProperty ("velocity", velocity);
        object->setProperty ("attack", attack);
        object->setProperty ("release", release);
        object->setProperty ("gain", gain);
        object->setProperty ("loopStart", loopStart);
        object->setProperty ("loopEnd", loopEnd);
        object->setProperty ("polyphony", polyphony);
        object->setProperty ("roundRobin", roundRobin);
        return juce::var (object);
    }
};
