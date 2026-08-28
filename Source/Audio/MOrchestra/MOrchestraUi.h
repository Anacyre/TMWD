#pragma once

#include <JuceHeader.h>

/*  Plugin-GUI catalogue for M Orchestra.  This is independent of the DAW
    instrument browser: uncovered instruments stay visible but unavailable.
*/
namespace MOrchestraUi
{
    inline constexpr juce::uint32 gold = 0xffc9a46c;

    struct Family
    {
        const char* id;
        const char* label;
    };

    struct Instrument
    {
        const char* id;
        const char* name;
        const char* family;
        bool available;
        const char* icon;
    };

    inline const Family* families()
    {
        static const Family list[] = {
            { "strings",    "Strings" },
            { "woodwinds",  "Woodwinds" },
            { "brass",      "Brass" },
            { "percussion", "Percussion" },
            { "solo",       "Solo" },
            { "keyboard",   "Keyboard" }
        };
        return list;
    }

    inline int numFamilies() noexcept { return 6; }

    inline const Instrument* instruments()
    {
        static const Instrument list[] = {
            { "m_orch_violin_1", "Violins 1", "strings", true, "violin" },
            { "m_orch_violin_2", "Violins 2", "strings", true, "violin" },
            { "m_orch_viola", "Violas", "strings", true, "viola" },
            { "m_orch_cello", "Cellos", "strings", true, "cello" },
            { "m_orch_bass", "Double Basses", "strings", true, "bass" },
            { "m_orch_harp", "Harp", "strings", false, "harp" },

            { "m_orch_piccolo", "Piccolo", "woodwinds", false, "flute" },
            { "m_orch_flute", "Flute", "woodwinds", true, "flute" },
            { "m_orch_oboe", "Oboe", "woodwinds", true, "oboe" },
            { "m_orch_clarinet", "Clarinet", "woodwinds", true, "clarinet" },
            { "m_orch_bassoon", "Bassoon", "woodwinds", true, "bassoon" },
            { "m_orch_contra_bassoon", "Contra Bassoon", "woodwinds", false, "bassoon" },

            { "m_orch_horn", "Horn", "brass", true, "horn" },
            { "m_orch_trumpet", "Trumpet", "brass", true, "trumpet" },
            { "m_orch_trombone", "Trombone", "brass", true, "trombone" },
            { "m_orch_bass_trombone", "Bass Trombone", "brass", true, "trombone" },
            { "m_orch_tuba", "Tuba", "brass", true, "tuba" },

            { "m_orch_timpani", "Timpani", "percussion", false, "timpani" },
            { "m_orch_snare", "Snare Drum", "percussion", true, "snare" },
            { "m_orch_bass_drum", "Bass Drum", "percussion", true, "bassdrum" },
            { "m_orch_cymbals", "Cymbals", "percussion", true, "cymbal" },
            { "m_orch_suspended_cymbal", "Sus. Cymbal", "percussion", true, "cymbal" },
            { "m_orch_tom", "Tom", "percussion", true, "tom" },
            { "m_orch_triangle", "Triangle", "percussion", true, "triangle" },
            { "m_orch_glock", "Glockenspiel", "percussion", false, "glock" },

            { "m_orch_solo_violin", "Solo Violin", "solo", true, "violin" },
            { "m_orch_solo_cello", "Solo Cello", "solo", true, "cello" },
            { "m_orch_solo_flute", "Solo Flute", "solo", true, "flute" },
            { "m_orch_solo_clarinet", "Solo Clarinet", "solo", true, "clarinet" },
            { "m_orch_solo_horn", "Solo Horn", "solo", true, "horn" },

            { "m_orch_piano", "Piano", "keyboard", false, "piano" },
            { "m_orch_celesta", "Celesta", "keyboard", false, "piano" },
            { "m_orch_tubular_bells", "Tubular Bells", "keyboard", false, "bells" }
        };
        return list;
    }

    inline int numInstruments() noexcept { return 33; }

    inline const Instrument* find (const juce::String& id)
    {
        const auto* list = instruments();
        for (int i = 0; i < numInstruments(); ++i)
            if (id == list[i].id)
                return list + i;
        return nullptr;
    }

    inline juce::String familyOf (const juce::String& definitionId)
    {
        if (const auto* item = find (definitionId))
            return item->family;
        return "strings";
    }

    inline bool isMOrchestraDefinition (const juce::String& definitionId)
    {
        return definitionId.startsWith ("m_orch_");
    }
}
