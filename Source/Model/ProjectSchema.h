#pragma once

#include <JuceHeader.h>

/*  Versioned DawWeb project schema.

    schemaVersion 1  — original .dawweb (tempo, tracks, clips, factory-state refs)
    schemaVersion 2  — Phase 6: instrument source, mixer/sends, web-sampler tracks
    schemaVersion 3  — Phase 6.5: opaque webMixer (browser DSP inserts/sends/buses)
    schemaVersion 4  — MixerModel 2.0: volumeDb, 5 insert slots, send A/B/C, return buses
    schemaVersion 5  — Playlist: group tracks, clip kinds, clip looping, arrangement markers
    schemaVersion 6  — Unified piano-roll Note model (ticks, advanced note fields, time-signature map)

    JUCE, the Vue UI, and any future store all speak this JSON.  Loaders must
    migrate older files; they must never invent a second incompatible format.
*/
namespace ProjectSchema
{
    static constexpr int currentVersion = 6;
    static constexpr int minimumReadableVersion = 1;

    inline constexpr const char* sourceEmpty      = "empty";
    inline constexpr const char* sourceRemoteVst  = "remote-vst";
    inline constexpr const char* sourceWebSampler = "web-sampler";
    inline constexpr const char* sourceMOrchestra = "m-orchestra";

    inline juce::String inferSource (const juce::String& stored,
                                     const juce::String& instrumentDefinitionId)
    {
        if (stored == sourceRemoteVst || stored == sourceWebSampler
            || stored == sourceEmpty || stored == sourceMOrchestra)
            return stored;

        if (instrumentDefinitionId.startsWith ("m_orch_"))
            return sourceMOrchestra;

        return instrumentDefinitionId.isNotEmpty() ? juce::String (sourceRemoteVst)
                                                   : juce::String (sourceEmpty);
    }

    inline bool isReadable (int version) noexcept
    {
        return version >= minimumReadableVersion && version <= currentVersion;
    }
}
