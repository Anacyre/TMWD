#include "EngineAPI.h"

namespace
{
    const juce::Colour remoteTrackPalette[]
    {
        juce::Colour (0xff4a90d9), juce::Colour (0xffd98b4a), juce::Colour (0xff6dbf8a),
        juce::Colour (0xffc46bb3), juce::Colour (0xffd4c05a), juce::Colour (0xff5bb8c4)
    };

    juce::var toVar (const juce::String& s) { return juce::var (s); }

    double getDouble (const juce::var& message, const char* name, double fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (double) value;
    }

    int getInt (const juce::var& message, const char* name, int fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (int) value;
    }

    bool getBool (const juce::var& message, const char* name, bool fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (bool) value;
    }
}

//==============================================================================
EngineAPI::EngineAPI() = default;

EngineAPI::~EngineAPI()
{
    shutdown();
}

juce::String EngineAPI::initialise()
{
    const auto opened = engine.initialise();

    syncTempo();
    syncMixer();
    invalidateSequence();
    flushPendingUpdates();

    return opened ? juce::String() : engine.getLastError();
}

void EngineAPI::shutdown()
{
    engine.shutdown();
}

//==============================================================================
void EngineAPI::play()
{
    flushPendingUpdates();
    engine.start();
}

void EngineAPI::pause()
{
    engine.pause();
}

void EngineAPI::stop()
{
    engine.stop();
}

void EngineAPI::seekToBeats (double beats)
{
    engine.setPositionBeats (juce::jmax (0.0, beats));
}

void EngineAPI::setLooping (bool shouldLoop)
{
    engine.setLooping (shouldLoop);
}

void EngineAPI::setLoopRangeBeats (double startBeats, double endBeats)
{
    engine.setLoopRangeBeats (startBeats, endBeats);
}

void EngineAPI::setMetronomeEnabled (bool enabled)
{
    engine.setMetronomeEnabled (enabled);
}

//==============================================================================
void EngineAPI::syncTempo()      { tempoDirty = true; }
void EngineAPI::syncMixer()      { mixerDirty = true; }
void EngineAPI::invalidateSequence() { sequenceDirty = true; }

bool EngineAPI::flushPendingUpdates()
{
    const auto syncedMixer = tempoDirty || mixerDirty;

    if (syncedMixer)
    {
        // syncMixerFromProject also carries tempo and time signature, so one call covers
        // both flags.
        engine.syncMixerFromProject (project);
        tempoDirty = false;
        mixerDirty = false;
    }

    if (sequenceDirty)
    {
        engine.rebuildSequence (project);
        sequenceDirty = false;
    }

    return syncedMixer;
}

//==============================================================================
void EngineAPI::previewNoteOn (int trackIndex, int pitch, float velocity)
{
    engine.sendNoteOn (trackIndex, pitch, velocity);
}

void EngineAPI::previewNoteOff (int trackIndex, int pitch)
{
    engine.sendNoteOff (trackIndex, pitch);
}

void EngineAPI::allNotesOff()
{
    engine.allNotesOff();
}

void EngineAPI::notify (int changeFlags)
{
    if (onChange != nullptr && changeFlags != 0)
        onChange (changeFlags);
}

//==============================================================================
juce::var EngineAPI::makeError (const juce::String& reason) const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", false);
    object->setProperty ("error", reason);
    return juce::var (object);
}

juce::var EngineAPI::makeOk (juce::DynamicObject* payload) const
{
    auto* object = payload != nullptr ? payload : new juce::DynamicObject();
    object->setProperty ("ok", true);
    return juce::var (object);
}

juce::var EngineAPI::handleMessage (const juce::String& jsonText)
{
    juce::var parsed;

    if (juce::JSON::parse (jsonText, parsed).failed())
        return makeError ("Malformed JSON");

    return handleMessage (parsed);
}

juce::var EngineAPI::handleMessage (const juce::var& message)
{
    const auto type = message.getProperty ("type", juce::var()).toString();

    if (type.isEmpty())
        return makeError ("Missing \"type\"");

    //--------------------------------------------------------------------------
    if (type == "transport.play")   { play();  notify (transportChanged); return makeOk(); }
    if (type == "transport.pause")  { pause(); notify (transportChanged); return makeOk(); }
    if (type == "transport.stop")   { stop();  notify (transportChanged); return makeOk(); }

    if (type == "transport.seek")
    {
        seekToBeats (getDouble (message, "beats", 0.0));
        notify (transportChanged);
        return makeOk();
    }

    if (type == "transport.setBpm")
    {
        project.setBpm (getDouble (message, "bpm", project.getBpm()));
        syncTempo();
        notify (tempoChanged | projectChanged);
        return makeOk();
    }

    if (type == "transport.setLoop")
    {
        setLooping (getBool (message, "enabled", false));

        if (! message.getProperty ("startBeats", juce::var()).isVoid())
            setLoopRangeBeats (getDouble (message, "startBeats", 0.0), getDouble (message, "endBeats", 32.0));

        notify (transportChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "project.setName")
    {
        project.setName (message.getProperty ("name", juce::var()).toString());
        notify (projectChanged);
        return makeOk();
    }

    if (type == "project.getState")
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("project", describeProject());
        return makeOk (object);
    }

    //--------------------------------------------------------------------------
    if (type == "track.create")
    {
        const auto name = message.getProperty ("name", toVar ("Track")).toString();
        const auto colour = remoteTrackPalette[(size_t) (project.getNumTracks() % (int) std::size (remoteTrackPalette))];
        const auto index = project.addTrack (TrackType::Midi, name, colour);

        if (index < 0)
            return makeError ("Could not create track");

        if (auto* track = project.getTrack (index))
        {
            track->instrumentSlot.instrumentId = InstrumentRegistry::testSynthId;
            track->instrumentSlot.name = instruments.getDisplayName (InstrumentRegistry::testSynthId);
            track->instrument = track->instrumentSlot.name;

            auto* object = new juce::DynamicObject();
            object->setProperty ("trackId", (int) track->id);
            object->setProperty ("index", index);
            syncMixer();
            notify (tracksChanged | mixerChanged);
            return makeOk (object);
        }

        return makeError ("Could not create track");
    }

    if (type == "track.delete")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0 || ! project.removeTrack (index))
            return makeError ("Unknown trackId");

        syncMixer();
        invalidateSequence();
        notify (tracksChanged | clipsChanged | mixerChanged);
        return makeOk();
    }

    if (type == "track.setParameter")
    {
        auto* track = project.findTrack ((TrackId) getInt (message, "trackId", 0));

        if (track == nullptr)
            return makeError ("Unknown trackId");

        const auto parameter = message.getProperty ("parameter", juce::var()).toString();

        if (parameter == "volume")      track->volume = (float) juce::jlimit (0.0, 1.0, getDouble (message, "value", track->volume));
        else if (parameter == "pan")    track->pan = (float) juce::jlimit (-1.0, 1.0, getDouble (message, "value", track->pan));
        else if (parameter == "mute")   track->mute = getBool (message, "value", track->mute);
        else if (parameter == "solo")   track->solo = getBool (message, "value", track->solo);
        else if (parameter == "name")   track->name = message.getProperty ("value", juce::var()).toString();
        else return makeError ("Unknown parameter: " + parameter);

        syncMixer();
        notify (mixerChanged | tracksChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "note.create")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        MidiNote note;
        note.pitch = juce::jlimit (0, 127, getInt (message, "pitch", 60));
        note.startBeat = juce::jmax (0.0, getDouble (message, "start", 0.0));
        note.lengthBeats = juce::jmax (0.0625, getDouble (message, "duration", 1.0));
        note.velocity = (float) juce::jlimit (0.0, 1.0, getDouble (message, "velocity", 100.0) / 127.0);

        const auto noteId = project.addNote (clip->id, note);
        invalidateSequence();
        notify (notesChanged);

        auto* object = new juce::DynamicObject();
        object->setProperty ("noteId", (int) noteId);
        return makeOk (object);
    }

    if (type == "note.delete")
    {
        const auto clipId = (ClipId) getInt (message, "clipId", 0);

        if (! project.removeNote (clipId, (NoteId) getInt (message, "noteId", 0)))
            return makeError ("Unknown clipId or noteId");

        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "mixer.setMasterVolume")
    {
        project.setMasterGainPosition ((float) juce::jlimit (0.0, 1.0, getDouble (message, "value", 0.8)));
        syncMixer();
        notify (mixerChanged);
        return makeOk();
    }

    return makeError ("Unknown command: " + type);
}

//==============================================================================
juce::var EngineAPI::describeProject() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("name", project.getName());
    root->setProperty ("bpm", project.getBpm());
    root->setProperty ("timeSigNumerator", project.getTimeSigNumerator());
    root->setProperty ("timeSigDenominator", project.getTimeSigDenominator());
    root->setProperty ("ticksPerQuarterNote", (int) MusicalTime::ticksPerQuarterNote);
    root->setProperty ("positionBeats", getPositionBeats());
    root->setProperty ("playing", isPlaying());

    juce::Array<juce::var> trackArray;

    for (int i = 0; i < project.getNumTracks(); ++i)
    {
        const auto* track = project.getTrack (i);

        if (track == nullptr)
            continue;

        auto* object = new juce::DynamicObject();
        object->setProperty ("trackId", (int) track->id);
        object->setProperty ("index", i);
        object->setProperty ("name", track->name);
        object->setProperty ("type", track->isMaster() ? "master" : (track->isMidi() ? "midi" : "audio"));
        object->setProperty ("instrumentId", track->instrumentSlot.instrumentId);
        object->setProperty ("midiChannel", track->midiChannel);
        object->setProperty ("volume", track->volume);
        object->setProperty ("pan", track->pan);
        object->setProperty ("mute", track->mute);
        object->setProperty ("solo", track->solo);
        object->setProperty ("recordArm", track->recordArm);
        trackArray.add (juce::var (object));
    }

    root->setProperty ("tracks", trackArray);

    juce::Array<juce::var> clipArray;

    for (const auto& clip : project.getClips())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("clipId", (int) clip.id);
        object->setProperty ("trackIndex", clip.trackIndex);
        object->setProperty ("name", clip.name);
        object->setProperty ("start", clip.startBeat);
        object->setProperty ("length", clip.lengthBeats);

        juce::Array<juce::var> noteArray;

        for (const auto& note : clip.notes)
        {
            auto* noteObject = new juce::DynamicObject();
            noteObject->setProperty ("noteId", (int) note.id);
            noteObject->setProperty ("pitch", note.pitch);
            noteObject->setProperty ("start", note.startBeat);
            noteObject->setProperty ("duration", note.lengthBeats);
            noteObject->setProperty ("velocity", (int) note.getVelocityByte());
            noteArray.add (juce::var (noteObject));
        }

        object->setProperty ("notes", noteArray);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);
    return juce::var (root);
}
