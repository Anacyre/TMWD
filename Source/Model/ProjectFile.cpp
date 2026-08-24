#include "ProjectFile.h"

namespace
{
    juce::String encodeState (const juce::MemoryBlock& block)
    {
        return block.isEmpty() ? juce::String() : juce::Base64::toBase64 (block.getData(), block.getSize());
    }

    juce::MemoryBlock decodeState (const juce::String& text)
    {
        juce::MemoryBlock block;

        if (text.isNotEmpty())
        {
            juce::MemoryOutputStream stream (block, false);
            juce::Base64::convertFromBase64 (stream, text);
        }

        return block;
    }

    juce::var noteToVar (const MidiNote& note)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", (int) note.id);
        object->setProperty ("pitch", note.pitch);
        object->setProperty ("startBeat", note.startBeat);
        object->setProperty ("lengthBeats", note.lengthBeats);
        object->setProperty ("velocity", note.velocity);
        object->setProperty ("channel", note.channel);
        return juce::var (object);
    }

    MidiNote noteFromVar (const juce::var& value)
    {
        MidiNote note;
        note.id = (NoteId) (int) value.getProperty ("id", 0);
        note.pitch = (int) value.getProperty ("pitch", 60);
        note.startBeat = (double) value.getProperty ("startBeat", 0.0);
        note.lengthBeats = (double) value.getProperty ("lengthBeats", 1.0);
        note.velocity = (float) (double) value.getProperty ("velocity", 0.8);
        note.channel = (int) value.getProperty ("channel", 0);
        return note;
    }
}

juce::var ProjectFile::toVar (const Project& project)
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("projectVersion", 1);
    root->setProperty ("name", project.getName());
    root->setProperty ("tempo", project.getBpm());
    root->setProperty ("timeSigNumerator", project.getTimeSigNumerator());
    root->setProperty ("timeSigDenominator", project.getTimeSigDenominator());
    root->setProperty ("masterGain", project.getMasterGainPosition());

    juce::Array<juce::var> trackArray;

    for (int i = 0; i < project.getNumTracks(); ++i)
    {
        const auto* track = project.getTrack (i);

        if (track == nullptr)
            continue;

        auto* object = new juce::DynamicObject();
        object->setProperty ("id", (int) track->id);
        object->setProperty ("name", track->name);
        object->setProperty ("type", track->isMaster() ? "master" : (track->isMidi() ? "midi" : "audio"));
        object->setProperty ("colour", (int) track->colour.getARGB());
        object->setProperty ("section", track->section);
        object->setProperty ("instrument", track->instrument);
        object->setProperty ("instrumentId", track->instrumentDefinitionId);
        object->setProperty ("presetId", track->presetId);
        object->setProperty ("technique", track->techniqueId);
        object->setProperty ("legato", track->legatoEnabled);
        object->setProperty ("sourcePlugin", track->instrumentSlot.instrumentId);
        object->setProperty ("midiChannel", track->midiChannel);
        object->setProperty ("volume", track->volume);
        object->setProperty ("pan", track->pan);
        object->setProperty ("mute", track->mute);
        object->setProperty ("solo", track->solo);
        object->setProperty ("recordArm", track->recordArm);
        object->setProperty ("defaultVelocity", track->defaultVelocity);
        object->setProperty ("usesFactoryState", track->usesFactoryState);
        object->setProperty ("stateVersion", track->stateVersion);
        object->setProperty ("pluginVersion", track->pluginVersion);
        object->setProperty ("pluginState", track->usesFactoryState ? juce::String()
                                                                   : encodeState (track->pluginState));

        auto* controllers = new juce::DynamicObject();
        for (const auto& [id, value] : track->controllerValues)
            controllers->setProperty (id, value);
        object->setProperty ("controllers", juce::var (controllers));
        trackArray.add (juce::var (object));
    }

    root->setProperty ("tracks", trackArray);

    juce::Array<juce::var> clipArray;

    for (const auto& clip : project.getClips())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", (int) clip.id);
        object->setProperty ("trackIndex", clip.trackIndex);
        object->setProperty ("name", clip.name);
        object->setProperty ("startBeat", clip.startBeat);
        object->setProperty ("lengthBeats", clip.lengthBeats);
        object->setProperty ("colour", (int) clip.colour.getARGB());
        object->setProperty ("midi", clip.midi);

        juce::Array<juce::var> notes;
        for (const auto& note : clip.notes)
            notes.add (noteToVar (note));
        object->setProperty ("notes", notes);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);
    return juce::var (root);
}

bool ProjectFile::save (const juce::File& file, const Project& project)
{
    file.getParentDirectory().createDirectory();
    return file.replaceWithText (juce::JSON::toString (toVar (project), true));
}

bool ProjectFile::fromVar (const juce::var& parsed, Project& project, juce::String& error)
{
    if (! parsed.isObject())
    {
        error = "Project file is not valid JSON.";
        return false;
    }

    project.clear();
    project.setName (parsed.getProperty ("name", "Untitled").toString());
    project.setBpm ((double) parsed.getProperty ("tempo", 120.0));
    project.setTimeSignature ((int) parsed.getProperty ("timeSigNumerator", 4),
                              (int) parsed.getProperty ("timeSigDenominator", 4));
    project.setMasterGainPosition ((float) (double) parsed.getProperty ("masterGain", 0.8));

    if (auto* tracks = parsed.getProperty ("tracks", juce::var()).getArray())
    {
        for (const auto& entry : *tracks)
        {
            const auto typeName = entry.getProperty ("type", "midi").toString();

            if (typeName == "master")
            {
                if (auto* master = project.getTrack (0))
                {
                    master->name = entry.getProperty ("name", "Master").toString();
                    master->volume = (float) (double) entry.getProperty ("volume", 0.8);
                    master->id = (TrackId) (int) entry.getProperty ("id", (int) master->id);
                }

                continue;
            }

            TrackData track;
            track.id = (TrackId) (int) entry.getProperty ("id", 0);
            track.name = entry.getProperty ("name", "Track").toString();
            track.type = typeName == "audio" ? TrackType::Audio : TrackType::Midi;
            track.colour = juce::Colour ((juce::uint32) (int) entry.getProperty ("colour", (int) 0xff4a90d9));
            track.section = entry.getProperty ("section", {}).toString();
            track.instrument = entry.getProperty ("instrument", {}).toString();
            track.instrumentDefinitionId = entry.getProperty ("instrumentId", {}).toString();
            track.presetId = entry.getProperty ("presetId", {}).toString();
            track.techniqueId = entry.getProperty ("technique", {}).toString();
            track.legatoEnabled = (bool) entry.getProperty ("legato", false);
            track.instrumentSlot.instrumentId = entry.getProperty ("sourcePlugin", {}).toString();
            track.instrumentSlot.name = track.instrument;
            track.midiChannel = (int) entry.getProperty ("midiChannel", 1);
            track.volume = (float) (double) entry.getProperty ("volume", 0.8);
            track.pan = (float) (double) entry.getProperty ("pan", 0.0);
            track.mute = (bool) entry.getProperty ("mute", false);
            track.solo = (bool) entry.getProperty ("solo", false);
            track.recordArm = (bool) entry.getProperty ("recordArm", false);
            track.defaultVelocity = (float) (double) entry.getProperty ("defaultVelocity", 0.8);
            track.usesFactoryState = (bool) entry.getProperty ("usesFactoryState", true);
            track.stateVersion = (int) entry.getProperty ("stateVersion", 1);
            track.pluginVersion = entry.getProperty ("pluginVersion", {}).toString();
            track.pluginState = decodeState (entry.getProperty ("pluginState", {}).toString());

            if (track.usesFactoryState)
                track.pluginState.reset();
            track.instrumentLoadState = InstrumentLoadState::Unloaded;

            if (auto* controllers = entry.getProperty ("controllers", juce::var()).getDynamicObject())
                for (const auto& prop : controllers->getProperties())
                    track.controllerValues[prop.name.toString()] = (float) (double) prop.value;

            project.insertTrack (project.getNumTracks(), track);
        }
    }

    if (auto* clips = parsed.getProperty ("clips", juce::var()).getArray())
    {
        for (const auto& entry : *clips)
        {
            ClipData clip;
            clip.id = (ClipId) (int) entry.getProperty ("id", 0);
            clip.trackIndex = (int) entry.getProperty ("trackIndex", 1);
            clip.name = entry.getProperty ("name", {}).toString();
            clip.startBeat = (double) entry.getProperty ("startBeat", 0.0);
            clip.lengthBeats = (double) entry.getProperty ("lengthBeats", 4.0);
            clip.colour = juce::Colour ((juce::uint32) (int) entry.getProperty ("colour", (int) 0xff4a90d9));
            clip.midi = (bool) entry.getProperty ("midi", true);

            if (auto* notes = entry.getProperty ("notes", juce::var()).getArray())
                for (const auto& note : *notes)
                    clip.notes.push_back (noteFromVar (note));

            project.addClip (clip);
        }
    }

    project.assignMissingIds();
    return true;
}

bool ProjectFile::load (const juce::File& file, Project& project, juce::String& error)
{
    if (! file.existsAsFile())
    {
        error = "Project file not found.";
        return false;
    }

    return fromVar (juce::JSON::parse (file.loadFileAsString()), project, error);
}
