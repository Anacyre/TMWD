#pragma once

#include <JuceHeader.h>
#include <vector>

/*  Engine-independent M Orchestra definition.  Native and (later) Web Audio
    loaders consume the same JSON.  This is not a VST and not BBCSO/Synchron.
*/
namespace MOrchestra
{
    enum class Family
    {
        strings,
        woodwinds,
        brass,
        solo,
        percussion,
        pitchedPercussion,
        other
    };

    enum class Articulation
    {
        longArt,
        shortArt,
        hit,
        pluck,
        sustain
    };

    enum class NoiseKind
    {
        none,
        bow,
        breath,
        air
    };

    struct SampleRef
    {
        juce::String pack;
        juce::String entry;          // path inside the zip (or relative file)
        int rootNote = 60;
        int minNote = 0;
        int maxNote = 127;
        int velocityMin = 0;
        int velocityMax = 127;
        Articulation articulation = Articulation::longArt;
        int dynamicLayer = 64;       // 0-127 mapped from ppp..ff
        bool loop = false;
        int loopStart = 0;
        int loopEnd = 0;
        int crossfade = 0;
        bool unpitched = false;
    };

    struct InstrumentSpec
    {
        juce::String id;
        juce::String name;
        Family family = Family::strings;
        int sectionSize = 1;
        int sourceVoices = 1;
        int maxVoices = 16;
        juce::String pack;
        juce::String percFolder;
        bool solo = false;
        bool vibrato = false;
        float gamma = 1.35f;
        NoiseKind noise = NoiseKind::none;
        std::vector<Articulation> articulations;
        juce::StringArray controllers;
        juce::StringArray aliases;
        juce::String uncoveredReason; // empty if implemented
    };

    struct LibrarySpec
    {
        juce::String id { "m_orchestra" };
        juce::String displayName { "M Orchestra" };
        int cacheBudgetMb = 192;
        int globalMaxVoices = 64;
        juce::StringArray libraryRoots;
        std::vector<InstrumentSpec> instruments;
        std::vector<SampleRef> samples;
        juce::StringArray missing;   // requested instruments with no samples
    };

    inline const char* familyName (Family f)
    {
        switch (f)
        {
            case Family::strings: return "strings";
            case Family::woodwinds: return "woodwinds";
            case Family::brass: return "brass";
            case Family::solo: return "solo";
            case Family::percussion: return "percussion";
            case Family::pitchedPercussion: return "pitchedPercussion";
            case Family::other: return "other";
        }
        return "other";
    }

    inline Family familyFromString (const juce::String& s)
    {
        const auto t = s.toLowerCase();
        if (t == "strings") return Family::strings;
        if (t == "woodwinds") return Family::woodwinds;
        if (t == "brass") return Family::brass;
        if (t == "solo") return Family::solo;
        if (t == "percussion") return Family::percussion;
        if (t == "pitchedpercussion" || t == "pitched_percussion") return Family::pitchedPercussion;
        return Family::other;
    }

    inline Articulation articulationFromString (const juce::String& s)
    {
        const auto t = s.toLowerCase();
        if (t == "short") return Articulation::shortArt;
        if (t == "hit") return Articulation::hit;
        if (t == "pluck") return Articulation::pluck;
        if (t == "sustain") return Articulation::sustain;
        return Articulation::longArt;
    }

    inline const char* articulationName (Articulation a)
    {
        switch (a)
        {
            case Articulation::shortArt: return "short";
            case Articulation::hit: return "hit";
            case Articulation::pluck: return "pluck";
            case Articulation::sustain: return "sustain";
            case Articulation::longArt: return "long";
        }
        return "long";
    }

    inline NoiseKind noiseFromString (const juce::String& s)
    {
        const auto t = s.toLowerCase();
        if (t == "bow") return NoiseKind::bow;
        if (t == "breath") return NoiseKind::breath;
        if (t == "air") return NoiseKind::air;
        return NoiseKind::none;
    }

    int parseMidiNote (const juce::String& token);
    int dynamicToLayer (const juce::String& token);
    Articulation classifyArticulation (const juce::String& duration, const juce::String& artic, bool percussion);

    LibrarySpec loadLibrarySpec (const juce::File& jsonFile);
    void scanPacks (LibrarySpec& spec, const juce::File& root);
    juce::File resolveLibraryRoot (const LibrarySpec& spec);
}
