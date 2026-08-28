#pragma once

#include <JuceHeader.h>
#include "MixerModel.h"
#include "ProjectSchema.h"
#include <cmath>
#include <map>
#include <vector>

/*  Pure data layer.  Nothing in this file knows about Components, drawing or audio
    devices, so the same structures are shared by the UI, the audio engine, project
    save/load and any future front end.

    Positions are stored in musical time (quarter-note beats) rather than seconds, so
    edits survive tempo changes.  Playback scheduling converts to integer ticks, which
    keeps note boundaries exact instead of accumulating floating point error.
*/

using TrackId  = juce::uint32;
using ClipId   = juce::uint32;
using NoteId   = juce::uint32;
using MarkerId = juce::uint32;

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

    inline juce::int64 ticksPerBar (int numerator, int denominator) noexcept
    {
        return (juce::int64) juce::jmax (1, numerator) * ticksPerQuarterNote * 4
             / (juce::int64) juce::jmax (1, denominator);
    }
}

namespace NoteModel
{
    static constexpr juce::int64 minDurationTicks = MusicalTime::ticksPerQuarterNote / 64;
    static constexpr juce::int64 defaultDurationTicks = MusicalTime::ticksPerQuarterNote / 4;
    static constexpr int minVelocity = 1;
    static constexpr int maxVelocity = 127;
    static constexpr int centerPan = 64;

    inline juce::int64 snapTick (juce::int64 tick, juce::int64 gridTicks) noexcept
    {
        tick = juce::jmax ((juce::int64) 0, tick);

        if (gridTicks <= 0)
            return tick;

        const auto snapped = ((tick + gridTicks / 2) / gridTicks) * gridTicks;
        return juce::jmax ((juce::int64) 0, snapped);
    }

    inline juce::int64 quantizeTick (juce::int64 oldTick, juce::int64 gridTicks, float strength) noexcept
    {
        const auto amount = juce::jlimit (0.0f, 1.0f, strength);
        const auto grid = snapTick (oldTick, gridTicks);
        return (juce::int64) std::llround ((double) oldTick + (double) amount * (double) (grid - oldTick));
    }

    inline int midiVelocityFromStored (double value) noexcept
    {
        if (value > 1.0)
            return juce::jlimit (minVelocity, maxVelocity, juce::roundToInt (value));

        return juce::jlimit (minVelocity, maxVelocity, juce::roundToInt ((float) value * 127.0f));
    }

    inline int midiVelocityFromVar (const juce::var& value, int fallback = 100) noexcept
    {
        if (value.isVoid())
            return fallback;

        if (value.isInt() || value.isInt64())
            return juce::jlimit (minVelocity, maxVelocity, (int) value);

        return midiVelocityFromStored ((double) value);
    }

    inline juce::int64 repeatIntervalTicks (int repeatMode) noexcept
    {
        switch (repeatMode)
        {
            case 1:  return MusicalTime::ticksPerQuarterNote;
            case 2:  return MusicalTime::ticksPerQuarterNote * 3 / 4;
            case 3:  return MusicalTime::ticksPerQuarterNote * 2 / 3;
            case 4:  return MusicalTime::ticksPerQuarterNote / 2;
            case 5:  return MusicalTime::ticksPerQuarterNote * 3 / 8;
            case 6:  return MusicalTime::ticksPerQuarterNote / 3;
            case 7:  return MusicalTime::ticksPerQuarterNote / 4;
            case 8:  return MusicalTime::ticksPerQuarterNote * 3 / 16;
            case 9:  return MusicalTime::ticksPerQuarterNote / 6;
            case 10: return MusicalTime::ticksPerQuarterNote / 8;
            case 11: return MusicalTime::ticksPerQuarterNote * 3 / 32;
            case 12: return MusicalTime::ticksPerQuarterNote / 12;
            case 13: return MusicalTime::ticksPerQuarterNote / 16;
            case 14: return MusicalTime::ticksPerQuarterNote / 24;
            default: return 0;
        }
    }
}

enum class TrackType { Master, Midi, Audio, Group };

enum class ClipKind { Midi, Audio, Sampler, Automation };

inline juce::String trackTypeName (TrackType type)
{
    switch (type)
    {
        case TrackType::Master: return "master";
        case TrackType::Audio:  return "audio";
        case TrackType::Group:  return "group";
        case TrackType::Midi:
        default:                return "midi";
    }
}

inline TrackType trackTypeFromName (const juce::String& name)
{
    if (name == "master") return TrackType::Master;
    if (name == "audio")  return TrackType::Audio;
    if (name == "group")  return TrackType::Group;
    return TrackType::Midi;
}

inline juce::String clipKindName (ClipKind kind)
{
    switch (kind)
    {
        case ClipKind::Audio:       return "audio";
        case ClipKind::Sampler:     return "sampler";
        case ClipKind::Automation:  return "automation";
        case ClipKind::Midi:
        default:                    return "midi";
    }
}

inline ClipKind clipKindFromName (const juce::String& name, bool midiFallback = true)
{
    if (name == "audio")      return ClipKind::Audio;
    if (name == "sampler")    return ClipKind::Sampler;
    if (name == "automation") return ClipKind::Automation;
    if (name == "midi")       return ClipKind::Midi;
    return midiFallback ? ClipKind::Midi : ClipKind::Audio;
}

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

inline juce::String instrumentStatusToken (InstrumentLoadState state)
{
    switch (state)
    {
        case InstrumentLoadState::Loaded:
        case InstrumentLoadState::Active:         return "ready";
        case InstrumentLoadState::Loading:
        case InstrumentLoadState::Initializing:
        case InstrumentLoadState::RestoringState: return "loading";
        case InstrumentLoadState::Unavailable:    return "unavailable";
        case InstrumentLoadState::Error:          return "error";
        case InstrumentLoadState::Unloading:
        case InstrumentLoadState::Unloaded:
        default:                                  return "unloaded";
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
    double startBeat = 0.0;      // clip-relative; ticks are canonical on disk
    double lengthBeats = 0.25;
    float velocity = 100.0f / 127.0f;
    int channel = 0;             // 1-16, or 0 to inherit the track channel
    int releaseVelocity = 64;
    int pan = NoteModel::centerPan;
    int group = 0;
    int color = 0;               // 0-15 metadata
    int pitchOffset = 0;         // 1 = 1/10 semitone
    bool muted = false;
    bool slide = false;
    bool porta = false;
    int repeatMode = 0;
    int modX = 0;
    int modY = 0;
    juce::var extra;
    bool selected = false;

    double getEndBeat() const noexcept { return startBeat + lengthBeats; }

    juce::int64 getStartTick() const noexcept { return MusicalTime::beatsToTicks (startBeat); }
    juce::int64 getLengthTicks() const noexcept
    {
        return juce::jmax (NoteModel::minDurationTicks, MusicalTime::beatsToTicks (lengthBeats));
    }
    juce::int64 getEndTick() const noexcept { return getStartTick() + getLengthTicks(); }

    void setStartTick (juce::int64 tick)
    {
        startBeat = MusicalTime::ticksToBeats (juce::jmax ((juce::int64) 0, tick));
    }

    void setDurationTick (juce::int64 tick)
    {
        lengthBeats = MusicalTime::ticksToBeats (juce::jmax (NoteModel::minDurationTicks, tick));
    }

    juce::uint8 getVelocityByte() const noexcept
    {
        return (juce::uint8) NoteModel::midiVelocityFromStored ((double) velocity);
    }

    void setVelocityMidi (int midi)
    {
        velocity = (float) juce::jlimit (NoteModel::minVelocity, NoteModel::maxVelocity, midi) / 127.0f;
    }
};

inline bool noteVarHas (const juce::var& value, const char* name)
{
    if (auto* object = value.getDynamicObject())
        return object->hasProperty (name);

    return ! value.getProperty (name, juce::var()).isVoid();
}

inline juce::var noteVarGet (const juce::var& value, const char* a, const char* b = nullptr)
{
    auto first = value.getProperty (a, juce::var());

    if (! first.isVoid() || b == nullptr)
        return first;

    return value.getProperty (b, juce::var());
}

inline void applyNoteFields (MidiNote& note, const juce::var& value)
{
    if (noteVarHas (value, "id") || noteVarHas (value, "noteId"))
        note.id = (NoteId) (int) noteVarGet (value, "id", "noteId");

    if (noteVarHas (value, "pitch"))
        note.pitch = juce::jlimit (0, 127, (int) value.getProperty ("pitch", note.pitch));

    if (noteVarHas (value, "startTick"))
        note.setStartTick ((juce::int64) (double) value.getProperty ("startTick", (double) note.getStartTick()));
    else if (noteVarHas (value, "start") || noteVarHas (value, "startBeat"))
        note.startBeat = juce::jmax (0.0, (double) noteVarGet (value, "start", "startBeat"));

    if (noteVarHas (value, "durationTick"))
        note.setDurationTick ((juce::int64) (double) value.getProperty ("durationTick", (double) note.getLengthTicks()));
    else if (noteVarHas (value, "duration") || noteVarHas (value, "lengthBeats"))
        note.lengthBeats = juce::jmax (MusicalTime::ticksToBeats (NoteModel::minDurationTicks),
                                       (double) noteVarGet (value, "duration", "lengthBeats"));

    if (noteVarHas (value, "velocity"))
        note.setVelocityMidi (NoteModel::midiVelocityFromVar (value.getProperty ("velocity", juce::var()),
                                                              note.getVelocityByte()));

    if (noteVarHas (value, "channel"))
        note.channel = juce::jlimit (0, 16, (int) value.getProperty ("channel", note.channel));

    if (noteVarHas (value, "releaseVelocity"))
        note.releaseVelocity = juce::jlimit (1, 127, (int) value.getProperty ("releaseVelocity", note.releaseVelocity));

    if (noteVarHas (value, "pan"))
        note.pan = juce::jlimit (0, 127, (int) value.getProperty ("pan", note.pan));

    if (noteVarHas (value, "group"))
        note.group = juce::jmax (0, (int) value.getProperty ("group", note.group));

    if (noteVarHas (value, "color"))
        note.color = juce::jlimit (0, 15, (int) value.getProperty ("color", note.color));

    if (noteVarHas (value, "pitchOffset"))
        note.pitchOffset = juce::jlimit (-120, 120, (int) value.getProperty ("pitchOffset", note.pitchOffset));

    if (noteVarHas (value, "muted"))
        note.muted = (bool) value.getProperty ("muted", note.muted);

    if (noteVarHas (value, "slide"))
        note.slide = (bool) value.getProperty ("slide", note.slide);

    if (noteVarHas (value, "porta"))
        note.porta = (bool) value.getProperty ("porta", note.porta);

    if (noteVarHas (value, "repeatMode"))
        note.repeatMode = juce::jlimit (0, 14, (int) value.getProperty ("repeatMode", note.repeatMode));

    if (noteVarHas (value, "modX"))
        note.modX = juce::jlimit (0, 127, (int) value.getProperty ("modX", note.modX));

    if (noteVarHas (value, "modY"))
        note.modY = juce::jlimit (0, 127, (int) value.getProperty ("modY", note.modY));

    static const char* known[] {
        "id", "noteId", "pitch", "startTick", "start", "startBeat", "durationTick",
        "duration", "lengthBeats", "velocity", "channel", "releaseVelocity", "pan",
        "group", "color", "pitchOffset", "muted", "slide", "porta", "repeatMode",
        "modX", "modY", "selected"
    };

    if (auto* object = value.getDynamicObject())
    {
        auto* extraObject = note.extra.getDynamicObject();

        if (extraObject == nullptr)
        {
            extraObject = new juce::DynamicObject();
            note.extra = juce::var (extraObject);
        }

        for (auto& prop : object->getProperties())
        {
            const auto name = prop.name.toString();
            bool isKnown = false;

            for (auto* key : known)
                if (name == key)
                    isKnown = true;

            if (! isKnown)
                extraObject->setProperty (prop.name, prop.value);
        }
    }
}

inline juce::var noteToEngineVar (const MidiNote& note)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("id", (int) note.id);
    object->setProperty ("noteId", (int) note.id);
    object->setProperty ("pitch", note.pitch);
    object->setProperty ("startTick", (int) note.getStartTick());
    object->setProperty ("durationTick", (int) note.getLengthTicks());
    object->setProperty ("start", note.startBeat);
    object->setProperty ("duration", note.lengthBeats);
    object->setProperty ("startBeat", note.startBeat);
    object->setProperty ("lengthBeats", note.lengthBeats);
    object->setProperty ("velocity", (int) note.getVelocityByte());
    object->setProperty ("releaseVelocity", note.releaseVelocity);
    object->setProperty ("pan", note.pan);
    object->setProperty ("group", note.group);
    object->setProperty ("color", note.color);
    object->setProperty ("channel", note.channel);
    object->setProperty ("pitchOffset", note.pitchOffset);
    object->setProperty ("muted", note.muted);
    object->setProperty ("slide", note.slide);
    object->setProperty ("porta", note.porta);
    object->setProperty ("repeatMode", note.repeatMode);
    object->setProperty ("modX", note.modX);
    object->setProperty ("modY", note.modY);

    if (auto* extra = note.extra.getDynamicObject())
        for (auto& prop : extra->getProperties())
            if (! object->hasProperty (prop.name))
                object->setProperty (prop.name, prop.value);

    return juce::var (object);
}

struct TimeSignatureChange
{
    juce::int64 timeTick = 0;
    int numerator = 4;
    int denominator = 4;
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
    ClipKind kind = ClipKind::Midi;
    bool selected = false;
    bool muted = false;
    int loopCount = 1;
    double loopLengthBeats = 0.0;
    juce::String sourceId;
    double audioOffsetBeats = 0.0;
    juce::File sourceFile;
    std::vector<MidiNote> notes;

    double getSourceLengthBeats() const noexcept
    {
        return loopLengthBeats > 0.01 ? loopLengthBeats : lengthBeats;
    }

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
struct ArrangementMarker
{
    MarkerId id = 0;
    juce::String name;
    double startBeat = 0.0;
    juce::String section;
    juce::String mode;

    juce::int64 getTimeTick() const noexcept { return MusicalTime::beatsToTicks (startBeat); }
    void setTimeTick (juce::int64 tick)
    {
        startBeat = MusicalTime::ticksToBeats (juce::jmax ((juce::int64) 0, tick));
    }

    juce::String getMode() const { return mode.isNotEmpty() ? mode : section; }
};

//==============================================================================
struct TrackData
{
    using Type = TrackType;

    TrackId id = 0;
    TrackId parentId = 0;
    juce::String name;
    TrackType type = TrackType::Midi;
    juce::Colour colour { 0xff4a90d9 };
    bool collapsed = false;
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
    juce::String instrumentSource { ProjectSchema::sourceEmpty };
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
    std::vector<PluginSlot> inserts { {}, {}, {}, {}, {} };
    std::vector<MixerSend> sends { defaultSends() };
    AutomationLane automation;

    /** Latest level published by the audio engine.  Display only. */
    float meterLevel = 0.0f;

    bool isMaster() const noexcept { return type == TrackType::Master; }
    bool isMidi() const noexcept   { return type == TrackType::Midi; }
    bool isGroup() const noexcept  { return type == TrackType::Group; }
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
