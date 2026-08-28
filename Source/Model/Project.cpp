#include "Project.h"
#include <algorithm>

Project::Project()
{
    TrackData master;
    master.id = nextTrackId();
    master.name = "Master";
    master.type = TrackType::Master;
    master.colour = juce::Colour (0xff8a8a8a);
    master.section = "Output";
    master.instrument = "Stereo Output";
    master.volume = masterGain;
    tracks.push_back (master);
}

//==============================================================================
void Project::setName (const juce::String& newName)
{
    name = newName.isEmpty() ? "Untitled" : newName;
}

void Project::setBpm (double newBpm)
{
    bpm = juce::jlimit (20.0, 300.0, newBpm);
}

void Project::setTimeSignature (int numerator, int denominator)
{
    timeSigNum = juce::jlimit (1, 16, numerator);
    timeSigDen = juce::jlimit (1, 16, denominator);
}

void Project::setMasterGainPosition (float position)
{
    masterGain = juce::jlimit (0.0f, 1.0f, position);

    if (! tracks.empty() && tracks.front().isMaster())
        tracks.front().volume = masterGain;
}

//==============================================================================
TrackData* Project::getTrack (int index)
{
    return juce::isPositiveAndBelow (index, (int) tracks.size()) ? &tracks[(size_t) index] : nullptr;
}

const TrackData* Project::getTrack (int index) const
{
    return juce::isPositiveAndBelow (index, (int) tracks.size()) ? &tracks[(size_t) index] : nullptr;
}

TrackData* Project::findTrack (TrackId trackId)
{
    const auto index = indexOfTrack (trackId);
    return index >= 0 ? &tracks[(size_t) index] : nullptr;
}

const TrackData* Project::findTrack (TrackId trackId) const
{
    const auto index = indexOfTrack (trackId);
    return index >= 0 ? &tracks[(size_t) index] : nullptr;
}

int Project::indexOfTrack (TrackId trackId) const
{
    for (int i = 0; i < (int) tracks.size(); ++i)
        if (tracks[(size_t) i].id == trackId)
            return i;

    return -1;
}

int Project::addTrack (TrackType type, const juce::String& trackName, juce::Colour colour)
{
    if (tracks.empty())
    {
        TrackData master;
        master.id = nextTrackId();
        master.name = "Master";
        master.type = TrackType::Master;
        master.colour = juce::Colour (0xff8a8a8a);
        master.section = "Output";
        master.instrument = "Stereo Output";
        tracks.push_back (master);
    }

    if (type == TrackType::Master)
        return -1;   // exactly one master, created with the project

    TrackData track;
    track.id = nextTrackId();
    track.type = type;
    track.name = trackName;
    track.colour = colour;
    track.midiChannel = juce::jlimit (1, 16, (int) tracks.size());
    tracks.push_back (track);
    return (int) tracks.size() - 1;
}

int Project::insertTrack (int index, TrackData track)
{
    if (track.id == 0)
        track.id = nextTrackId();

    index = juce::jlimit (1, (int) tracks.size(), index);
    tracks.insert (tracks.begin() + index, std::move (track));

    // Clips address their track by position, so anything below the insert shifts down.
    for (auto& clip : clips)
        if (clip.trackIndex >= index)
            ++clip.trackIndex;

    return index;
}

bool Project::removeTrack (int index)
{
    auto* track = getTrack (index);

    if (track == nullptr || track->isMaster())
        return false;

    clips.erase (std::remove_if (clips.begin(), clips.end(),
                                 [index] (const ClipData& c) { return c.trackIndex == index; }),
                 clips.end());

    for (auto& clip : clips)
        if (clip.trackIndex > index)
            --clip.trackIndex;

    const auto removedId = track->id;

    tracks.erase (tracks.begin() + index);

    for (auto& remaining : tracks)
        if (remaining.parentId == removedId)
            remaining.parentId = 0;

    return true;
}

bool Project::moveTrack (int fromIndex, int toIndex)
{
    if (! juce::isPositiveAndBelow (fromIndex, (int) tracks.size())
        || ! juce::isPositiveAndBelow (toIndex, (int) tracks.size())
        || fromIndex == 0 || toIndex == 0 || fromIndex == toIndex)
        return false;

    auto track = tracks[(size_t) fromIndex];
    tracks.erase (tracks.begin() + fromIndex);
    tracks.insert (tracks.begin() + toIndex, std::move (track));

    for (auto& clip : clips)
    {
        if (clip.trackIndex == fromIndex)
            clip.trackIndex = toIndex;
        else if (fromIndex < toIndex && clip.trackIndex > fromIndex && clip.trackIndex <= toIndex)
            --clip.trackIndex;
        else if (fromIndex > toIndex && clip.trackIndex >= toIndex && clip.trackIndex < fromIndex)
            ++clip.trackIndex;
    }

    return true;
}

bool Project::anyTrackSoloed() const
{
    return std::any_of (tracks.begin(), tracks.end(),
                        [] (const TrackData& t) { return t.solo && ! t.isMaster(); });
}

bool Project::isTrackAudible (int index) const
{
    const auto* track = getTrack (index);

    if (track == nullptr)
        return false;

    if (track->isMaster())
        return ! track->mute;

    if (track->isGroup())
        return false;

    if (track->mute)
        return false;

    return track->solo || ! anyTrackSoloed();
}

//==============================================================================
ClipData* Project::getClip (int index)
{
    return juce::isPositiveAndBelow (index, (int) clips.size()) ? &clips[(size_t) index] : nullptr;
}

const ClipData* Project::getClip (int index) const
{
    return juce::isPositiveAndBelow (index, (int) clips.size()) ? &clips[(size_t) index] : nullptr;
}

ClipData* Project::findClip (ClipId clipId)
{
    const auto index = indexOfClip (clipId);
    return index >= 0 ? &clips[(size_t) index] : nullptr;
}

int Project::indexOfClip (ClipId clipId) const
{
    for (int i = 0; i < (int) clips.size(); ++i)
        if (clips[(size_t) i].id == clipId)
            return i;

    return -1;
}

int Project::addClip (ClipData clip)
{
    if (clip.id == 0)
        clip.id = nextClipId();

    for (auto& note : clip.notes)
        if (note.id == 0)
            note.id = nextNoteId();

    clips.push_back (std::move (clip));
    return (int) clips.size() - 1;
}

bool Project::removeClip (int index)
{
    if (! juce::isPositiveAndBelow (index, (int) clips.size()))
        return false;

    clips.erase (clips.begin() + index);
    return true;
}

NoteId Project::addNote (ClipId clipId, MidiNote note)
{
    auto* clip = findClip (clipId);

    if (clip == nullptr)
        return 0;

    note.id = nextNoteId();
    note.pitch = juce::jlimit (0, 127, note.pitch);
    note.startBeat = juce::jmax (0.0, note.startBeat);
    note.lengthBeats = juce::jmax (MusicalTime::ticksToBeats (NoteModel::minDurationTicks), note.lengthBeats);
    note.velocity = juce::jlimit (1.0f / 127.0f, 1.0f, note.velocity);
    clip->notes.push_back (note);
    return note.id;
}

int Project::updateNotesBatch (ClipId clipId, const juce::Array<juce::var>& patches)
{
    auto* clip = findClip (clipId);

    if (clip == nullptr)
        return 0;

    int updated = 0;

    for (const auto& patch : patches)
    {
        const auto noteId = (NoteId) (int) noteVarGet (patch, "id", "noteId");
        auto* note = clip->findNote (noteId);

        if (note == nullptr)
            continue;

        applyNoteFields (*note, patch);
        ++updated;
    }

    return updated;
}

bool Project::removeNotes (ClipId clipId, const std::vector<NoteId>& noteIds)
{
    auto* clip = findClip (clipId);

    if (clip == nullptr)
        return false;

    const auto before = clip->notes.size();
    clip->notes.erase (std::remove_if (clip->notes.begin(), clip->notes.end(),
                                       [&noteIds] (const MidiNote& n)
                                       {
                                           return std::find (noteIds.begin(), noteIds.end(), n.id) != noteIds.end();
                                       }),
                       clip->notes.end());
    return clip->notes.size() != before;
}

bool Project::removeNote (ClipId clipId, NoteId noteId)
{
    auto* clip = findClip (clipId);

    if (clip == nullptr)
        return false;

    const auto before = clip->notes.size();
    clip->notes.erase (std::remove_if (clip->notes.begin(), clip->notes.end(),
                                       [noteId] (const MidiNote& n) { return n.id == noteId; }),
                       clip->notes.end());
    return clip->notes.size() != before;
}

//==============================================================================
double Project::getLengthBeats() const
{
    double length = 0.0;

    for (const auto& clip : clips)
        length = juce::jmax (length, clip.getEndBeat());

    return length;
}

ArrangementMarker* Project::findMarker (MarkerId markerId)
{
    for (auto& marker : markers)
        if (marker.id == markerId)
            return &marker;

    return nullptr;
}

int Project::addMarker (ArrangementMarker marker)
{
    if (marker.id == 0)
        marker.id = nextMarkerId();

    markers.push_back (std::move (marker));
    return (int) markers.size() - 1;
}

bool Project::removeMarker (MarkerId markerId)
{
    const auto before = markers.size();
    markers.erase (std::remove_if (markers.begin(), markers.end(),
                                   [markerId] (const ArrangementMarker& m) { return m.id == markerId; }),
                   markers.end());
    return markers.size() != before;
}

TimeSignatureChange Project::getTimeSignatureAtTick (juce::int64 tick) const
{
    TimeSignatureChange current;
    current.numerator = timeSigNum;
    current.denominator = timeSigDen;

    for (const auto& change : timeSignatureChanges)
        if (change.timeTick <= tick)
            current = change;

    return current;
}

bool Project::isTrackHiddenByCollapse (int index) const
{
    const auto* track = getTrack (index);

    if (track == nullptr || track->parentId == 0)
        return false;

    auto parentId = track->parentId;
    int guard = 0;

    while (parentId != 0 && guard++ < 32)
    {
        const auto* parent = findTrack (parentId);

        if (parent == nullptr)
            return false;

        if (parent->collapsed)
            return true;

        parentId = parent->parentId;
    }

    return false;
}

void Project::clear()
{
    tracks.clear();
    clips.clear();
    markers.clear();
    timeSignatureChanges.clear();
    webMixer = juce::var();

    TrackData master;
    master.id = nextTrackId();
    master.name = "Master";
    master.type = TrackType::Master;
    master.colour = juce::Colour (0xff8a8a8a);
    master.section = "Output";
    master.instrument = "Stereo Output";
    master.volume = masterGain;
    tracks.push_back (master);
}

void Project::assignMissingIds()
{
    for (auto& track : tracks)
        if (track.id == 0)
            track.id = nextTrackId();

    for (auto& clip : clips)
    {
        if (clip.id == 0)
            clip.id = nextClipId();

        for (auto& note : clip.notes)
            if (note.id == 0)
                note.id = nextNoteId();
    }

    for (auto& marker : markers)
        if (marker.id == 0)
            marker.id = nextMarkerId();
}
