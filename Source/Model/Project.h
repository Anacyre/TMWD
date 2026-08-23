#pragma once

#include "ProjectModel.h"

/*  The project model: every piece of musical data the application owns, and nothing
    else.  It has no knowledge of Components, audio devices or plugins, which is what
    lets the UI, the audio engine, undo and (later) a web front end share one source of
    truth.

    Identifiers are stable for the lifetime of the project, so external callers - the
    engine, a saved file, a WebSocket client - can refer to a track or note without
    depending on its current position in a vector.
*/
class Project
{
public:
    Project();

    //==============================================================================
    const juce::String& getName() const noexcept { return name; }
    void setName (const juce::String& newName);

    double getBpm() const noexcept { return bpm; }
    void setBpm (double newBpm);

    int getTimeSigNumerator() const noexcept   { return timeSigNum; }
    int getTimeSigDenominator() const noexcept { return timeSigDen; }
    void setTimeSignature (int numerator, int denominator);

    float getMasterGainPosition() const noexcept { return masterGain; }
    void setMasterGainPosition (float position);

    //==============================================================================
    // Tracks.  Index 0 is always the master track.
    std::vector<TrackData>& getTracks() noexcept             { return tracks; }
    const std::vector<TrackData>& getTracks() const noexcept { return tracks; }
    int getNumTracks() const noexcept { return (int) tracks.size(); }

    TrackData* getTrack (int index);
    const TrackData* getTrack (int index) const;
    TrackData* findTrack (TrackId trackId);
    const TrackData* findTrack (TrackId trackId) const;
    int indexOfTrack (TrackId trackId) const;

    /** Appends a track and returns its index, or -1 if the type is not allowed. */
    int addTrack (TrackType type, const juce::String& trackName, juce::Colour colour);
    int insertTrack (int index, TrackData track);
    bool removeTrack (int index);
    bool moveTrack (int fromIndex, int toIndex);

    /** True when the track is heard given the current mute / solo state. */
    bool isTrackAudible (int index) const;
    bool anyTrackSoloed() const;

    //==============================================================================
    // Clips
    std::vector<ClipData>& getClips() noexcept             { return clips; }
    const std::vector<ClipData>& getClips() const noexcept { return clips; }
    int getNumClips() const noexcept { return (int) clips.size(); }

    ClipData* getClip (int index);
    const ClipData* getClip (int index) const;
    ClipData* findClip (ClipId clipId);
    int indexOfClip (ClipId clipId) const;

    int addClip (ClipData clip);
    bool removeClip (int index);

    /** Adds a note to a clip and returns its new identifier, or 0 on failure. */
    NoteId addNote (ClipId clipId, MidiNote note);
    bool removeNote (ClipId clipId, NoteId noteId);

    //==============================================================================
    /** Length of the arranged material in beats, used for playback bounds. */
    double getLengthBeats() const;

    void clear();

    //==============================================================================
    // Identifier allocation.  Callers that build objects before inserting them - the
    // demo generator, the piano roll - stamp them with these.
    TrackId nextTrackId() noexcept { return ++lastTrackId; }
    ClipId  nextClipId() noexcept  { return ++lastClipId; }
    NoteId  nextNoteId() noexcept  { return ++lastNoteId; }

    /** Assigns identifiers to anything still unstamped, after a bulk import. */
    void assignMissingIds();

private:
    juce::String name { "Untitled" };
    double bpm = 96.0;
    int timeSigNum = 4;
    int timeSigDen = 4;
    float masterGain = 0.8f;

    std::vector<TrackData> tracks;
    std::vector<ClipData> clips;

    TrackId lastTrackId = 0;
    ClipId lastClipId = 0;
    NoteId lastNoteId = 0;
};

//==============================================================================
/** One undo step.  The project is plain data, so a copy is all a snapshot needs; the
    selection lives alongside it because restoring a project without its selection
    leaves the editor pointing at the wrong material.
*/
struct ProjectSnapshot
{
    Project project;
    int selectedTrack = -1;
    int selectedClip = -1;
};
