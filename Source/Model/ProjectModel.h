#pragma once

#include <JuceHeader.h>
#include <map>

/*  Pure data layer.  Nothing in this file knows about Components, drawing or audio
    devices, so the same structures are shared by the UI, the audio engine, project
    save/load and any future front end.

    Positions are stored in musical time (quarter-note beats) rather than seconds, so
    edits survive tempo changes.  Playback scheduling converts to integer ticks, which
    keeps note boundaries exact instead of accumulating floating point error.
*/

using TrackId = juce::uint32;
using ClipId  = juce::uint32;
using NoteId  = juce::uint32;

namespace MusicalTime
{
    /** Editing / scheduling resolution.  960 is the usual DAW PPQ. */
    static constexpr juce::int64 ticksPerQuarterNote = 960;

    inline juce::int64 beatsToTicks (double beats) noexcept
    {
        return (juce::int64) std::llround (beats * (double) ticksPerQuarterNote);
    }

    inline double ticksToBeats (juce::int64 ticks) noexcept
    {
        return (double) ticks / (double) ticksPerQuarterNote;
    }

    inline double beatsToSeconds (double beats, double bpm) noexcept
    {
        return beats * 60.0 / juce::jmax (1.0, bpm);
    }

    inline double secondsToBeats (double seconds, double bpm) noexcept
    {
        return seconds * juce::jmax (1.0, bpm) / 60.0;
    }
}

enum class TrackType { Master, Midi, Audio };

enum class InstrumentLoadState
{
    Unloaded,
    Loading,
    Initializing,
    RestoringState,
    Loaded,
    Active,
    Unloading,
    Unavailable,
    Error
};

inline juce::String instrumentLoadStateLabel (InstrumentLoadState state)
{
    switch (state)
    {
        case InstrumentLoadState::Unloaded:       return "Unloaded";
        case InstrumentLoadState::Loading:        return "Loading...";
        case InstrumentLoadState::Initializing:   return "Initializing...";
        case InstrumentLoadState::RestoringState: return "Restoring...";
        case InstrumentLoadState::Loaded:         return "Ready";
        case InstrumentLoadState::Active:         return "Ready";
        case InstrumentLoadState::Unloading:      return "Unloading...";
        case InstrumentLoadState::Unavailable:    return "Unavailable";
        case InstrumentLoadState::Error:          return "Error";
        default:                                  return "Unknown";
    }
}

namespace DawUnits
{
    // The faders store a normalised position; 0.8 is unity gain and 1.0 is +6 dB.
    inline float faderToDb (float position)
    {
        position = juce::jlimit (0.0f, 1.0f, position);

        if (position <= 0.0f)
            return -100.0f;

        if (position >= 0.8f)
            return juce::jmap (position, 0.8f, 1.0f, 0.0f, 6.0f);

        const auto t = position / 0.8f;
        return juce::jmap (t * t, 0.0f, 1.0f, -60.0f, 0.0f);
    }

    inline float dbToFader (float db)
    {
        if (db >= 0.0f)
            return juce::jmap (juce::jmin (db, 6.0f), 0.0f, 6.0f, 0.8f, 1.0f);

        const auto t = std::sqrt (juce::jlimit (0.0f, 1.0f, juce::jmap (db, -60.0f, 0.0f, 0.0f, 1.0f)));
        return t * 0.8f;
    }

    /** Linear gain for a fader position, used by both the meters and the audio path. */
    inline float faderToGain (float position)
    {
        const auto db = faderToDb (position);
        return db <= -59.5f ? 0.0f : juce::Decibels::decibelsToGain (db);
    }

    inline juce::String formatDb (float db)
    {
        if (db <= -59.5f)
            return "-inf";

        return (db > 0.0f ? "+" : "") + juce::String (db, 1) + " dB";
    }

    inline juce::String formatPan (float pan)
    {
        const auto amount = juce::roundToInt (std::abs (pan) * 100.0f);

        if (amount == 0)
            return "Centre";

        return juce::String (amount) + (pan < 0.0f ? " L" : " R");
    }

    inline juce::String pitchToName (int pitch)
    {
        return juce::MidiMessage::getMidiNoteName (pitch, true, true, 4);
    }
}

//==============================================================================
struct MidiNote
{
    NoteId id = 0;
    int pitch = 60;
    double startBeat = 0.0;      // relative to the start of the owning clip
    double lengthBeats = 1.0;
    float velocity = 0.8f;
    int channel = 0;             // 1-16, or 0 to inherit the track channel
    bool selected = false;

    double getEndBeat() const noexcept { return startBeat + lengthBeats; }

    juce::int64 getStartTick() const noexcept { return MusicalTime::beatsToTicks (startBeat); }
    juce::int64 getLengthTicks() const noexcept
    {
        return juce::jmax ((juce::int64) 1, MusicalTime::beatsToTicks (lengthBeats));
    }
    juce::int64 getEndTick() const noexcept { return getStartTick() + getLengthTicks(); }

    juce::uint8 getVelocityByte() const noexcept
    {
        return (juce::uint8) juce::jlimit (1, 127, juce::roundToInt (velocity * 127.0f));
    }
};

//==============================================================================
/** A slot that holds an instrument or effect.  `instrumentId` is the stable key the
    plugin host resolves; `name` is only what the UI shows.
*/
struct PluginSlot
{
    juce::String name;
    juce::String instrumentId;
    bool bypassed = false;

    bool isEmpty() const noexcept { return name.isEmpty() && instrumentId.isEmpty(); }
};

//==============================================================================
struct ClipData
{
    ClipId id = 0;
    int trackIndex = 1;
    double startBeat = 0.0;
    double lengthBeats = 4.0;
    juce::String name;
    juce::Colour colour { 0xff4a90d9 };
    bool midi = true;
    bool selected = false;
    juce::File sourceFile;
    std::vector<MidiNote> notes;

    double getEndBeat() const noexcept { return startBeat + lengthBeats; }
    juce::int64 getStartTick() const noexcept { return MusicalTime::beatsToTicks (startBeat); }
    juce::int64 getLengthTicks() const noexcept { return MusicalTime::beatsToTicks (lengthBeats); }

    MidiNote* findNote (NoteId noteId)
    {
        for (auto& n : notes)
            if (n.id == noteId)
                return &n;

        return nullptr;
    }
};

//==============================================================================
struct AutomationPoint
{
    double beat = 0.0;
    float value = 0.5f;
};

struct AutomationLane
{
    juce::String parameterName { "Volume" };
    std::vector<AutomationPoint> points;
};

//==============================================================================
struct TrackData
{
    using Type = TrackType;

    TrackId id = 0;
    juce::String name;
    TrackType type = TrackType::Midi;
    juce::Colour colour { 0xff4a90d9 };
    juce::String section;       // "Strings", "Woodwinds", ...
    juce::String instrument;    // display name shown in the inspector
    int midiChannel = 1;
    float volume = 0.8f;
    float pan = 0.0f;
    bool mute = false;
    bool solo = false;
    bool recordArm = false;

    PluginSlot instrumentSlot;
    juce::String instrumentDefinitionId;
    juce::String presetId;
    juce::String techniqueId;
    InstrumentLoadState instrumentLoadState = InstrumentLoadState::Unloaded;
    juce::String instrumentLoadMessage;
    float defaultVelocity = 0.8f;
    juce::int64 instrumentLastUsedMs = 0;
    std::map<juce::String, float> controllerValues;
    juce::MemoryBlock pluginState;
    bool usesFactoryState = true;
    bool legatoEnabled = false;
    int stateVersion = 1;
    juce::String pluginVersion;
    std::vector<PluginSlot> inserts { {}, {} };
    AutomationLane automation;

    /** Latest level published by the audio engine.  Display only. */
    float meterLevel = 0.0f;

    bool isMaster() const noexcept { return type == TrackType::Master; }
    bool isMidi() const noexcept   { return type == TrackType::Midi; }
    float getVolumeDb() const noexcept { return DawUnits::faderToDb (volume); }
    float getGain() const noexcept     { return DawUnits::faderToGain (volume); }
};

namespace SoftwareLegato
{
    inline bool isSustainedTechnique (const juce::String& techniqueId)
    {
        return techniqueId.containsIgnoreCase ("long");
    }

    inline bool isActive (const TrackData& track)
    {
        return track.legatoEnabled && isSustainedTechnique (track.techniqueId);
    }

    inline juce::int64 extraTicks()
    {
        return MusicalTime::ticksPerQuarterNote / 2;
    }

    inline int extraMilliseconds (double bpm)
    {
        return juce::roundToInt (30000.0 / juce::jmax (1.0, bpm));
    }
}
