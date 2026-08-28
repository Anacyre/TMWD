#include "ProjectFile.h"
#include "ProjectSchema.h"

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
        return noteToEngineVar (note);
    }

    MidiNote noteFromVar (const juce::var& value)
    {
        MidiNote note;
        applyNoteFields (note, value);
        return note;
    }

    juce::var sendToVar (const MixerSend& send)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", send.id);
        object->setProperty ("name", send.name);
        object->setProperty ("destination", send.destination);
        object->setProperty ("level", send.level);
        object->setProperty ("enabled", send.enabled);
        object->setProperty ("preFader", send.preFader);
        return juce::var (object);
    }

    MixerSend sendFromVar (const juce::var& value)
    {
        MixerSend send;
        send.id = value.getProperty ("id", MixerIds::sendA).toString();
        send.name = value.getProperty ("name", send.id).toString();
        send.destination = value.getProperty ("destination", value.getProperty ("busId", MixerIds::busReverb)).toString();
        send.level = (float) (double) value.getProperty ("level", 0.0);
        send.enabled = (bool) value.getProperty ("enabled", false);
        send.preFader = (bool) value.getProperty ("preFader", false);
        return send;
    }
}

juce::var ProjectFile::toVar (const Project& project)
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("schemaVersion", ProjectSchema::currentVersion);
    root->setProperty ("projectVersion", ProjectSchema::currentVersion);
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
        object->setProperty ("parentId", (int) track->parentId);
        object->setProperty ("name", track->name);
        object->setProperty ("type", trackTypeName (track->type));
        object->setProperty ("collapsed", track->collapsed);
        object->setProperty ("colour", (int) track->colour.getARGB());
        object->setProperty ("section", track->section);
        object->setProperty ("instrument", track->instrument);
        object->setProperty ("instrumentId", track->instrumentDefinitionId);
        object->setProperty ("source", track->instrumentSource.isNotEmpty()
                                           ? track->instrumentSource
                                           : ProjectSchema::inferSource ({}, track->instrumentDefinitionId));
        object->setProperty ("presetId", track->presetId);
        object->setProperty ("technique", track->techniqueId);
        object->setProperty ("legato", track->legatoEnabled);
        object->setProperty ("sourcePlugin", track->instrumentSlot.instrumentId);
        object->setProperty ("midiChannel", track->midiChannel);
        object->setProperty ("volume", track->volume);
        object->setProperty ("volumeDb", track->getVolumeDb());
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

        juce::Array<juce::var> sendArray;
        for (const auto& send : track->sends)
            sendArray.add (sendToVar (send));
        object->setProperty ("sends", sendArray);

        juce::Array<juce::var> insertArray;
        for (const auto& slot : track->inserts)
        {
            auto* insertObject = new juce::DynamicObject();
            insertObject->setProperty ("name", slot.name);
            insertObject->setProperty ("instrumentId", slot.instrumentId);
            insertObject->setProperty ("pluginId", slot.instrumentId);
            insertObject->setProperty ("bypassed", slot.bypassed);
            insertObject->setProperty ("enabled", ! slot.bypassed);
            insertArray.add (juce::var (insertObject));
        }
        object->setProperty ("inserts", insertArray);

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
        object->setProperty ("kind", clipKindName (clip.kind));
        object->setProperty ("muted", clip.muted);
        object->setProperty ("loopCount", clip.loopCount);
        object->setProperty ("loopLengthBeats", clip.loopLengthBeats);
        object->setProperty ("sourceId", clip.sourceId);
        object->setProperty ("audioOffsetBeats", clip.audioOffsetBeats);

        juce::Array<juce::var> notes;
        for (const auto& note : clip.notes)
            notes.add (noteToVar (note));
        object->setProperty ("notes", notes);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);

    juce::Array<juce::var> markerArray;
    for (const auto& marker : project.getMarkers())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", (int) marker.id);
        object->setProperty ("name", marker.name);
        object->setProperty ("startBeat", marker.startBeat);
        object->setProperty ("timeTick", (int) marker.getTimeTick());
        object->setProperty ("section", marker.section);
        object->setProperty ("mode", marker.getMode());
        markerArray.add (juce::var (object));
    }
    root->setProperty ("markers", markerArray);

    juce::Array<juce::var> timeSigArray;
    for (const auto& change : project.getTimeSignatureChanges())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("timeTick", (int) change.timeTick);
        object->setProperty ("numerator", change.numerator);
        object->setProperty ("denominator", change.denominator);
        timeSigArray.add (juce::var (object));
    }

    auto* score = new juce::DynamicObject();
    score->setProperty ("ppq", (int) MusicalTime::ticksPerQuarterNote);
    score->setProperty ("timeSignature", juce::var (new juce::DynamicObject()));
    if (auto* ts = score->getProperty ("timeSignature").getDynamicObject())
    {
        ts->setProperty ("numerator", project.getTimeSigNumerator());
        ts->setProperty ("denominator", project.getTimeSigDenominator());
    }
    score->setProperty ("timeSignatures", timeSigArray);
    score->setProperty ("markers", markerArray);
    root->setProperty ("score", juce::var (score));
    root->setProperty ("timeSignatures", timeSigArray);

    if (! project.getWebMixer().isVoid())
        root->setProperty ("webMixer", project.getWebMixer());
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

    const auto schemaVersion = (int) parsed.getProperty ("schemaVersion",
                                                         parsed.getProperty ("projectVersion", 1));

    if (! ProjectSchema::isReadable (schemaVersion))
    {
        error = "Unsupported project schema version " + juce::String (schemaVersion)
                + " (this build reads 1–" + juce::String (ProjectSchema::currentVersion) + ").";
        return false;
    }

    if (auto* tracks = parsed.getProperty ("tracks", juce::var()).getArray())
    {
        for (const auto& entry : *tracks)
        {
            auto* inserts = entry.getProperty ("inserts", juce::var()).getArray();
            if (inserts == nullptr)
                continue;

            juce::StringArray overflowNames;
            int filled = 0;
            for (int i = 0; i < inserts->size(); ++i)
            {
                const auto& slotVar = inserts->getReference (i);
                const auto name = slotVar.getProperty ("name", {}).toString();
                const auto id = slotVar.getProperty ("instrumentId",
                    slotVar.getProperty ("pluginId", {})).toString();
                if (name.isEmpty() && id.isEmpty())
                    continue;
                if (filled >= MixerIds::maxInserts)
                    overflowNames.add (name.isNotEmpty() ? name : id);
                ++filled;
            }
            if (filled > MixerIds::maxInserts)
            {
                error = "Track \"" + entry.getProperty ("name", "Track").toString()
                        + "\" has " + juce::String (filled)
                        + " inserts (max " + juce::String (MixerIds::maxInserts)
                        + "). Extra effects were not discarded: "
                        + overflowNames.joinIntoString (", ");
                return false;
            }
        }
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
                    master->parentId = 0;
                    master->collapsed = false;
                }

                continue;
            }

            TrackData track;
            track.id = (TrackId) (int) entry.getProperty ("id", 0);
            track.parentId = (TrackId) (int) entry.getProperty ("parentId", 0);
            track.collapsed = (bool) entry.getProperty ("collapsed", false);
            track.name = entry.getProperty ("name", "Track").toString();
            track.type = trackTypeFromName (typeName);
            track.colour = juce::Colour ((juce::uint32) (int) entry.getProperty ("colour", (int) 0xff4a90d9));
            track.section = entry.getProperty ("section", {}).toString();
            track.instrument = entry.getProperty ("instrument", {}).toString();
            track.instrumentDefinitionId = entry.getProperty ("instrumentId", {}).toString();
            track.instrumentSource = ProjectSchema::inferSource (entry.getProperty ("source", {}).toString(),
                                                                 track.instrumentDefinitionId);
            track.presetId = entry.getProperty ("presetId", {}).toString();
            track.techniqueId = entry.getProperty ("technique", {}).toString();
            track.legatoEnabled = (bool) entry.getProperty ("legato", false);
            track.instrumentSlot.instrumentId = entry.getProperty ("sourcePlugin", {}).toString();
            track.instrumentSlot.name = track.instrument;
            track.midiChannel = (int) entry.getProperty ("midiChannel", 1);
            if (! entry.getProperty ("volumeDb", juce::var()).isVoid())
                track.volume = DawUnits::dbToFader ((float) juce::jlimit (
                    (double) MixerIds::volumeDbMin, (double) MixerIds::volumeDbMax,
                    (double) entry.getProperty ("volumeDb", 0.0)));
            else
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

            track.sends = defaultSends();
            if (auto* sends = entry.getProperty ("sends", juce::var()).getArray())
            {
                const int count = juce::jmin ((int) track.sends.size(), sends->size());
                for (int i = 0; i < count; ++i)
                    track.sends[(size_t) i] = sendFromVar (sends->getReference (i));
            }

            track.inserts.assign ((size_t) MixerIds::maxInserts, PluginSlot {});
            if (auto* inserts = entry.getProperty ("inserts", juce::var()).getArray())
            {
                juce::StringArray overflowNames;
                int filled = 0;
                for (int i = 0; i < inserts->size(); ++i)
                {
                    const auto& slotVar = inserts->getReference (i);
                    PluginSlot slot;
                    slot.name = slotVar.getProperty ("name", {}).toString();
                    slot.instrumentId = slotVar.getProperty ("instrumentId",
                        slotVar.getProperty ("pluginId", {})).toString();
                    slot.bypassed = (bool) slotVar.getProperty ("bypassed",
                        ! (bool) slotVar.getProperty ("enabled", true));
                    if (slot.isEmpty())
                        continue;
                    if (filled < MixerIds::maxInserts)
                        track.inserts[(size_t) filled] = slot;
                    else
                        overflowNames.add (slot.name.isNotEmpty() ? slot.name : slot.instrumentId);
                    ++filled;
                }
                if (filled > MixerIds::maxInserts)
                {
                    error = "Track \"" + track.name + "\" has " + juce::String (filled)
                            + " inserts (max " + juce::String (MixerIds::maxInserts)
                            + "). Extra effects were not discarded from the file: "
                            + overflowNames.joinIntoString (", ");
                    return false;
                }
            }

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
            clip.kind = clipKindFromName (entry.getProperty ("kind", clip.midi ? "midi" : "audio").toString(), clip.midi);
            clip.midi = clip.kind == ClipKind::Midi;
            clip.muted = (bool) entry.getProperty ("muted", false);
            clip.loopCount = juce::jmax (1, (int) entry.getProperty ("loopCount", 1));
            clip.loopLengthBeats = (double) entry.getProperty ("loopLengthBeats", 0.0);
            clip.sourceId = entry.getProperty ("sourceId", {}).toString();
            clip.audioOffsetBeats = (double) entry.getProperty ("audioOffsetBeats", 0.0);

            if (auto* notes = entry.getProperty ("notes", juce::var()).getArray())
                for (const auto& note : *notes)
                    clip.notes.push_back (noteFromVar (note));

            project.addClip (clip);
        }
    }

    if (auto* markers = parsed.getProperty ("markers", juce::var()).getArray())
    {
        for (const auto& entry : *markers)
        {
            ArrangementMarker marker;
            marker.id = (MarkerId) (int) entry.getProperty ("id", 0);
            marker.name = entry.getProperty ("name", {}).toString();
            marker.startBeat = (double) entry.getProperty ("startBeat", 0.0);
            if (! entry.getProperty ("timeTick", juce::var()).isVoid())
                marker.setTimeTick ((juce::int64) (double) entry.getProperty ("timeTick", 0.0));
            marker.section = entry.getProperty ("section", {}).toString();
            marker.mode = entry.getProperty ("mode", marker.section).toString();
            project.addMarker (marker);
        }
    }

    auto loadTimeSignatures = [&project] (const juce::var& source)
    {
        if (auto* changes = source.getArray())
        {
            for (const auto& entry : *changes)
            {
                TimeSignatureChange change;
                change.timeTick = (juce::int64) (double) entry.getProperty ("timeTick", 0.0);
                change.numerator = juce::jlimit (1, 16, (int) entry.getProperty ("numerator", 4));
                change.denominator = juce::jlimit (1, 16, (int) entry.getProperty ("denominator", 4));
                project.getTimeSignatureChanges().push_back (change);
            }
        }
    };

    loadTimeSignatures (parsed.getProperty ("timeSignatures", juce::var()));
    if (auto* score = parsed.getProperty ("score", juce::var()).getDynamicObject())
        if (project.getTimeSignatureChanges().empty())
            loadTimeSignatures (score->getProperty ("timeSignatures"));

    project.assignMissingIds();
    if (auto* object = parsed.getDynamicObject())
        if (object->hasProperty ("webMixer"))
            project.setWebMixer (object->getProperty ("webMixer"));
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
