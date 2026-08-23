#include "DawSession.h"
#include <algorithm>
#include <cmath>

namespace
{
    const juce::Colour trackPalette[]
    {
        juce::Colour (0xff4a90d9),
        juce::Colour (0xffd98b4a),
        juce::Colour (0xff6dbf8a),
        juce::Colour (0xffc46bb3),
        juce::Colour (0xffd4c05a),
        juce::Colour (0xff5bb8c4),
        juce::Colour (0xffd96a6a)
    };

    constexpr int maxUndoSteps = 64;

    //==============================================================================
    // The demonstration project: eight bars of D minor, twice through, so that pressing
    // Play produces something recognisably musical rather than a random cluster.
    constexpr double chordLengthBeats = 8.0;
    constexpr double demoLengthBeats = 64.0;

    struct DemoChord
    {
        const char* name;
        int tones[3];   // pitch classes, root first
        int bass;
    };

    const DemoChord progression[]
    {
        { "Dm",  { 2, 5, 9 },   2 },
        { "Bb",  { 10, 2, 5 }, 10 },
        { "F",   { 5, 9, 0 },   5 },
        { "C",   { 0, 4, 7 },   0 },
        { "Dm",  { 2, 5, 9 },   2 },
        { "Gm",  { 7, 10, 2 },  7 },
        { "A",   { 9, 1, 4 },   9 },
        { "Dm",  { 2, 5, 9 },   2 }
    };

    constexpr int numChords = (int) std::size (progression);

    enum class DemoRole { pad, moving, bass, brass, percussion };

    struct DemoTrackSpec
    {
        const char* name;
        const char* section;
        const char* library;      // the instrument the part is written for
        juce::uint32 colour;
        int basePitch;
        float volume;
        float pan;
        DemoRole role;
        int voice;                // which chord tone this part takes
        double entryBeat;
        double exitBeat;
    };

    // Panning roughly follows a concert seating plan.
    const DemoTrackSpec demoTracks[]
    {
        { "Violin I",   "Strings",    "BBC Symphony Orchestra Discover", 0xffd9a04a, 74, 0.80f, -0.55f, DemoRole::pad,        2,  0.0, 64.0 },
        { "Violin II",  "Strings",    "BBC Symphony Orchestra Discover", 0xffd18f45, 69, 0.78f, -0.30f, DemoRole::pad,        1,  0.0, 64.0 },
        { "Viola",      "Strings",    "BBC Symphony Orchestra Discover", 0xffc47f3f, 62, 0.76f,  0.18f, DemoRole::pad,        0,  0.0, 64.0 },
        { "Cello",      "Strings",    "BBC Symphony Orchestra Discover", 0xffb87038, 50, 0.78f,  0.42f, DemoRole::bass,       0,  8.0, 64.0 },
        { "Bass",       "Strings",    "BBC Symphony Orchestra Discover", 0xffa66232, 38, 0.74f,  0.60f, DemoRole::bass,       0,  8.0, 64.0 },
        { "Flute",      "Woodwinds",  "BBC Symphony Orchestra Discover", 0xff6dbf8a, 81, 0.68f, -0.22f, DemoRole::moving,     2, 16.0, 64.0 },
        { "Oboe",       "Woodwinds",  "BBC Symphony Orchestra Discover", 0xff5faf7d, 74, 0.66f, -0.08f, DemoRole::moving,     1, 16.0, 48.0 },
        { "Clarinet",   "Woodwinds",  "BBC Symphony Orchestra Discover", 0xff53a071, 69, 0.68f,  0.08f, DemoRole::moving,     0, 24.0, 64.0 },
        { "Bassoon",    "Woodwinds",  "BBC Symphony Orchestra Discover", 0xff479065, 50, 0.66f,  0.22f, DemoRole::pad,        1, 32.0, 64.0 },
        { "Horn",       "Brass",      "Synchron Player",                 0xff4a90d9, 57, 0.70f, -0.35f, DemoRole::brass,      0, 32.0, 64.0 },
        { "Trumpet",    "Brass",      "Synchron Player",                 0xff4283c4, 69, 0.66f,  0.14f, DemoRole::brass,      2, 48.0, 64.0 },
        { "Trombone",   "Brass",      "Synchron Player",                 0xff3a76b0, 52, 0.68f,  0.30f, DemoRole::brass,      1, 48.0, 64.0 },
        { "Tuba",       "Brass",      "Synchron Player",                 0xff33699c, 38, 0.66f,  0.45f, DemoRole::bass,       0, 48.0, 64.0 },
        { "Timpani",    "Percussion", "Synchron Player",                 0xffc46bb3, 38, 0.72f,  0.00f, DemoRole::percussion, 0,  0.0, 64.0 },
        { "Percussion", "Percussion", "Synchron Player",                 0xffab5c9e, 60, 0.62f,  0.10f, DemoRole::percussion, 0, 32.0, 64.0 }
    };

    /** Nearest occurrence of a pitch class to a reference pitch, so every part stays in
        its own register without having to spell out octaves by hand.
    */
    int nearestPitch (int pitchClass, int reference)
    {
        const auto offset = ((pitchClass - reference) % 12 + 18) % 12 - 6;
        return juce::jlimit (21, 108, reference + offset);
    }

    void appendNote (ClipData& clip, int pitch, double startBeat, double lengthBeats, float velocity)
    {
        if (startBeat < -0.001 || startBeat >= clip.lengthBeats - 0.001)
            return;

        MidiNote note;
        note.pitch = pitch;
        note.startBeat = startBeat;
        note.lengthBeats = juce::jmin (lengthBeats, clip.lengthBeats - startBeat);
        note.velocity = juce::jlimit (0.1f, 1.0f, velocity);
        clip.notes.push_back (note);
    }

    void fillChordNotes (ClipData& clip, const DemoTrackSpec& spec)
    {
        for (int chordIndex = 0; chordIndex < numChords * 2; ++chordIndex)
        {
            const auto chordStart = (double) chordIndex * chordLengthBeats;

            if (chordStart >= clip.startBeat + clip.lengthBeats || chordStart + chordLengthBeats <= clip.startBeat)
                continue;

            const auto& chord = progression[(size_t) (chordIndex % numChords)];
            const auto localStart = chordStart - clip.startBeat;
            const auto emphasis = chordIndex % 4 == 0 ? 0.06f : 0.0f;

            switch (spec.role)
            {
                case DemoRole::pad:
                {
                    const auto pitch = nearestPitch (chord.tones[spec.voice % 3], spec.basePitch);
                    appendNote (clip, pitch, localStart, chordLengthBeats - 0.4, 0.62f + emphasis);
                    break;
                }

                case DemoRole::bass:
                {
                    const auto pitch = nearestPitch (chord.bass, spec.basePitch);
                    appendNote (clip, pitch, localStart, chordLengthBeats * 0.5 - 0.2, 0.72f + emphasis);
                    appendNote (clip, pitch, localStart + chordLengthBeats * 0.5, chordLengthBeats * 0.5 - 0.3, 0.64f);
                    break;
                }

                case DemoRole::moving:
                {
                    // A slow arpeggio across the chord, one note per bar.
                    const int order[] { 0, 1, 2, 1 };

                    for (int step = 0; step < 4; ++step)
                    {
                        const auto tone = chord.tones[(size_t) ((spec.voice + order[step]) % 3)];
                        appendNote (clip, nearestPitch (tone, spec.basePitch),
                                    localStart + (double) step * 2.0, 1.7, 0.58f + emphasis);
                    }

                    break;
                }

                case DemoRole::brass:
                {
                    const auto pitch = nearestPitch (chord.tones[spec.voice % 3], spec.basePitch);
                    appendNote (clip, pitch, localStart + 0.5, 3.2, 0.66f + emphasis);
                    appendNote (clip, pitch, localStart + 4.5, 3.2, 0.60f);
                    break;
                }

                case DemoRole::percussion:
                {
                    const auto pitch = nearestPitch (chord.bass, spec.basePitch);
                    appendNote (clip, pitch, localStart, 0.6, 0.78f);
                    appendNote (clip, pitch, localStart + 4.0, 0.4, 0.58f);
                    break;
                }
            }
        }
    }

    /** Fallback content for clips the user creates by hand: an arpeggio of the tonic. */
    void fillSketchNotes (ClipData& clip, int basePitch)
    {
        static const int tones[] { 0, 4, 7, 12, 7, 4 };
        int step = 0;

        for (double beat = 0.0; beat < clip.lengthBeats - 0.05; beat += 1.0, ++step)
            appendNote (clip, basePitch + tones[(size_t) (step % (int) std::size (tones))],
                        beat, 0.9, 0.7f);
    }
}

//==============================================================================
DawSession::DawSession()
{
    userName = juce::SystemStats::getFullUserName();

    if (userName.isEmpty())
        userName = juce::SystemStats::getLogonName();

    if (userName.isEmpty())
        userName = "User";

    loadDemoProject();

    // Commands arriving from outside the UI - today only the JSON surface used by tests,
    // later a WebSocket client - still have to refresh the views.
    api.onChange = [this] (int) { notify (everythingChanged); };

    const auto engineError = api.initialise();

    if (engineError.isNotEmpty())
        juce::Logger::writeToLog ("Audio engine: " + engineError);

    pushTransportStateToEngine();

    lastTimeMs = juce::Time::getMillisecondCounterHiRes();
    startTimerHz (30);
}

DawSession::~DawSession()
{
    stopTimer();
    api.onChange = nullptr;
    api.shutdown();
}

juce::StringArray DawSession::getAvailableInstruments() const
{
    return api.getInstruments().getDisplayNames();
}

juce::StringArray DawSession::getAvailableEffects()
{
    return { "Convolution Reverb", "Channel EQ", "Compressor", "Tape Saturation" };
}

void DawSession::assignInstrument (TrackData& track, const juce::String& displayName)
{
    auto id = api.getInstruments().findIdForDisplayName (displayName);

    if (id.isEmpty())
        id = InstrumentRegistry::testSynthId;

    track.instrument = displayName;
    track.instrumentSlot.instrumentId = id;
    track.instrumentSlot.name = api.getInstruments().getDisplayName (id);
}

void DawSession::clearInstrument (TrackData& track)
{
    track.instrument.clear();
    track.instrumentSlot.name.clear();
    track.instrumentSlot.instrumentId.clear();
}

//==============================================================================
void DawSession::notify (int changeFlags)
{
    if (changeFlags == 0)
        return;

    if ((changeFlags & ~(positionChanged | metersChanged | selectionChanged | viewChanged | engineChanged)) != 0)
        dirty = true;

    // The one place model edits reach the audio layer.  Nothing is pushed to the audio
    // thread here; the API only marks what needs rebuilding on the next timer tick.
    if ((changeFlags & (tracksChanged | mixerChanged | projectChanged)) != 0)
        api.syncMixer();

    if ((changeFlags & projectChanged) != 0)
        api.syncTempo();

    if ((changeFlags & (tracksChanged | clipsChanged | notesChanged)) != 0)
    {
        project().assignMissingIds();
        api.invalidateSequence();
    }

    listeners.call ([changeFlags] (Listener& l) { l.sessionChanged (changeFlags); });
}

void DawSession::pushTransportStateToEngine()
{
    api.setLooping (looping);
    api.setLoopRangeBeats (loopStart, loopEnd);
    api.setMetronomeEnabled (metronome);
}

//==============================================================================
void DawSession::play()
{
    if (playing)
        return;

    playing = true;
    api.seekToBeats (positionBeats);
    api.play();
    lastTimeMs = juce::Time::getMillisecondCounterHiRes();
    notify (transportChanged);
}

void DawSession::pause()
{
    if (! playing)
        return;

    playing = false;
    api.pause();
    notify (transportChanged);
}

void DawSession::togglePlay()
{
    if (playing)
        pause();
    else
        play();
}

void DawSession::stop()
{
    const bool wasPlaying = playing;
    playing = false;
    recording = false;
    api.stop();

    if (! wasPlaying)
    {
        positionBeats = looping ? loopStart : 0.0;
        api.seekToBeats (positionBeats);
    }

    notify (transportChanged | positionChanged);
}

void DawSession::returnToStart()
{
    positionBeats = looping ? loopStart : 0.0;
    api.seekToBeats (positionBeats);
    notify (positionChanged);
}

void DawSession::toggleRecord()
{
    recording = ! recording;

    if (recording && ! playing)
    {
        playing = true;
        api.seekToBeats (positionBeats);
        api.play();
        lastTimeMs = juce::Time::getMillisecondCounterHiRes();
    }

    notify (transportChanged);
}

void DawSession::toggleLoop()
{
    looping = ! looping;
    api.setLooping (looping);
    notify (transportChanged);
}

void DawSession::toggleMetronome()
{
    metronome = ! metronome;
    api.setMetronomeEnabled (metronome);
    notify (transportChanged);
}

void DawSession::toggleSnap()
{
    snap = ! snap;
    notify (viewChanged);
}

double DawSession::getBpm() const noexcept
{
    return project().getBpm();
}

void DawSession::setBpm (double newBpm)
{
    project().setBpm (newBpm);
    notify (projectChanged);
}

void DawSession::setPositionBeats (double beats)
{
    positionBeats = juce::jmax (0.0, beats);
    api.seekToBeats (positionBeats);
    notify (positionChanged);
}

void DawSession::setLoopRange (double startBeats, double endBeats)
{
    loopStart = juce::jmax (0.0, startBeats);
    loopEnd = juce::jmax (loopStart + 0.25, endBeats);
    api.setLoopRangeBeats (loopStart, loopEnd);
    notify (transportChanged);
}

int DawSession::getTimeSigNumerator() const noexcept
{
    return project().getTimeSigNumerator();
}

int DawSession::getTimeSigDenominator() const noexcept
{
    return project().getTimeSigDenominator();
}

void DawSession::setTimeSignature (int numerator, int denominator)
{
    project().setTimeSignature (numerator, denominator);
    notify (projectChanged);
}

float DawSession::getMasterGain() const noexcept
{
    return project().getMasterGainPosition();
}

void DawSession::setMasterGain (float gain)
{
    project().setMasterGainPosition (gain);
    notify (mixerChanged);
}

void DawSession::setPixelsPerBeat (double ppb)
{
    pixelsPerBeat = juce::jlimit (6.0, 220.0, ppb);
    notify (viewChanged);
}

void DawSession::setTrackHeight (int newHeight)
{
    trackHeight = juce::jlimit (minTrackHeight, maxTrackHeight, newHeight);
    notify (viewChanged);
}

void DawSession::setSnapGridBeats (double beats)
{
    snapGrid = juce::jlimit (0.0625, 16.0, beats);
    notify (viewChanged);
}

juce::String DawSession::getProjectName() const
{
    return project().getName();
}

void DawSession::setProjectName (const juce::String& name)
{
    project().setName (name);
    notify (projectChanged);
}

void DawSession::markSaved()
{
    dirty = false;
    notify (projectChanged);
}

//==============================================================================
void DawSession::setMixerVisible (bool shouldBeVisible)
{
    if (mixerVisible == shouldBeVisible)
        return;

    mixerVisible = shouldBeVisible;
    notify (viewChanged);
}

void DawSession::setEditorVisible (bool shouldBeVisible)
{
    if (editorVisible == shouldBeVisible)
        return;

    editorVisible = shouldBeVisible;
    notify (viewChanged);
}

void DawSession::setInspectorVisible (bool shouldBeVisible)
{
    if (inspectorVisible == shouldBeVisible)
        return;

    inspectorVisible = shouldBeVisible;
    notify (viewChanged);
}

void DawSession::setEditorTab (EditorTab tab)
{
    if (editorTab == tab)
        return;

    editorTab = tab;
    notify (viewChanged);
}

//==============================================================================
double DawSession::snapBeat (double beat) const
{
    if (! snap)
        return juce::jmax (0.0, beat);

    return juce::jmax (0.0, std::round (beat / snapGrid) * snapGrid);
}

void DawSession::getBarBeatTick (int& bar, int& beat, int& tick) const
{
    const auto beatsPerBar = (double) getTimeSigNumerator();
    const auto total = juce::jmax (0.0, positionBeats);
    bar = (int) std::floor (total / beatsPerBar) + 1;
    const auto beatInBar = total - (double) (bar - 1) * beatsPerBar;
    beat = (int) std::floor (beatInBar) + 1;
    tick = (int) std::floor (std::fmod (beatInBar, 1.0) * (double) ticksPerBeat);
}

juce::String DawSession::getPositionString() const
{
    int bar = 1, beat = 1, tick = 0;
    getBarBeatTick (bar, beat, tick);
    return juce::String::formatted ("%03d.%d.%03d", bar, beat, tick);
}

juce::String DawSession::getSecondsString() const
{
    const auto seconds = MusicalTime::beatsToSeconds (positionBeats, getBpm());
    const auto mins = (int) (seconds / 60.0);
    const auto secs = seconds - mins * 60.0;
    return juce::String::formatted ("%d:%05.2f", mins, secs);
}

//==============================================================================
std::vector<TrackData>& DawSession::getTracks()             { return project().getTracks(); }
const std::vector<TrackData>& DawSession::getTracks() const { return project().getTracks(); }
std::vector<ClipData>& DawSession::getClips()               { return project().getClips(); }
const std::vector<ClipData>& DawSession::getClips() const   { return project().getClips(); }

int DawSession::getNumTracks() const noexcept { return project().getNumTracks(); }

TrackData* DawSession::getTrack (int index)             { return project().getTrack (index); }
const TrackData* DawSession::getTrack (int index) const { return project().getTrack (index); }
ClipData* DawSession::getClip (int index)               { return project().getClip (index); }
const ClipData* DawSession::getClip (int index) const   { return project().getClip (index); }

bool DawSession::isTrackAudible (int index) const { return project().isTrackAudible (index); }

int DawSession::addTrack (TrackType type, const juce::String& name)
{
    beginTransaction ("Add Track");

    const auto fallbackName = (type == TrackType::Midi ? "MIDI " : "Audio ")
                              + juce::String (getNumTracks());
    const auto index = project().addTrack (type, name.isNotEmpty() ? name : fallbackName,
                                          nextTrackColour());

    if (index < 0)
        return -1;

    if (auto* track = getTrack (index))
        if (type == TrackType::Midi)
            assignInstrument (*track, getAvailableInstruments()[0]);

    selectedTrack = index;
    notify (tracksChanged | selectionChanged);
    return selectedTrack;
}

void DawSession::removeTrack (int index)
{
    if (index <= 0 || index >= getNumTracks())
        return;

    beginTransaction ("Delete Track");
    project().removeTrack (index);
    clampSelection();
    notify (tracksChanged | clipsChanged | selectionChanged);
}

void DawSession::moveTrack (int fromIndex, int toIndex)
{
    if (fromIndex == toIndex)
        return;

    beginTransaction ("Move Track");

    if (! project().moveTrack (fromIndex, toIndex))
        return;

    selectedTrack = toIndex;
    notify (tracksChanged | clipsChanged | selectionChanged);
}

int DawSession::duplicateTrack (int index)
{
    const auto* source = getTrack (index);

    if (source == nullptr || source->isMaster())
        return -1;

    beginTransaction ("Duplicate Track");

    auto copy = *source;
    copy.id = 0;                     // insertTrack stamps a fresh identifier
    copy.name = source->name + " copy";
    copy.recordArm = false;

    // Collect the source clips before inserting, because inserting renumbers the tracks
    // below it and would otherwise make the comparison ambiguous.
    std::vector<ClipData> copiedClips;

    for (const auto& clip : getClips())
    {
        if (clip.trackIndex != index)
            continue;

        auto c = clip;
        c.id = 0;

        for (auto& note : c.notes)
            note.id = 0;

        copiedClips.push_back (c);
    }

    const auto newIndex = project().insertTrack (index + 1, copy);

    for (auto& clip : copiedClips)
    {
        clip.trackIndex = newIndex;
        project().addClip (clip);
    }

    selectedTrack = newIndex;
    notify (tracksChanged | clipsChanged | selectionChanged);
    return newIndex;
}

int DawSession::addClip (int trackIndex, double startBeat, double lengthBeats, const juce::String& name)
{
    auto* track = getTrack (trackIndex);

    if (track == nullptr || track->isMaster())
        return -1;

    beginTransaction ("Add Clip");

    ClipData clip;
    clip.trackIndex = trackIndex;
    clip.startBeat = juce::jmax (0.0, startBeat);
    clip.lengthBeats = juce::jmax (0.25, lengthBeats);
    clip.name = name.isNotEmpty() ? name : track->name;
    clip.colour = track->colour;
    clip.midi = track->isMidi();

    if (clip.midi)
        fillSketchNotes (clip, 60);

    selectedClip = project().addClip (clip);
    notify (clipsChanged | notesChanged | selectionChanged);
    return selectedClip;
}

int DawSession::addClipFromFile (const juce::File& file, int trackIndex, double startBeat)
{
    const auto ext = file.getFileExtension().toLowerCase();
    const bool midi = ext == ".mid" || ext == ".midi";

    auto* track = getTrack (trackIndex);

    if (track == nullptr || track->isMaster() || track->isMidi() != midi)
        trackIndex = addTrack (midi ? TrackType::Midi : TrackType::Audio,
                               file.getFileNameWithoutExtension());

    track = getTrack (trackIndex);

    if (track == nullptr)
        return -1;

    beginTransaction ("Import File");

    ClipData clip;
    clip.trackIndex = trackIndex;
    clip.startBeat = snapBeat (startBeat);
    clip.lengthBeats = midi ? 8.0 : 4.0;
    clip.name = file.getFileNameWithoutExtension();
    clip.colour = track->colour;
    clip.midi = midi;
    clip.sourceFile = file;

    if (midi)
        fillSketchNotes (clip, 60);

    selectedClip = project().addClip (clip);
    notify (clipsChanged | notesChanged | selectionChanged);
    return selectedClip;
}

void DawSession::removeClip (int index)
{
    if (! juce::isPositiveAndBelow (index, (int) getClips().size()))
        return;

    beginTransaction ("Delete Clip");
    project().removeClip (index);
    clampSelection();
    notify (clipsChanged | selectionChanged);
}

int DawSession::duplicateClip (int index)
{
    const auto* source = getClip (index);

    if (source == nullptr)
        return -1;

    beginTransaction ("Duplicate Clip");

    auto copy = *source;
    copy.id = 0;
    copy.startBeat = source->getEndBeat();

    for (auto& note : copy.notes)
        note.id = 0;

    selectedClip = project().addClip (copy);
    notify (clipsChanged | selectionChanged);
    return selectedClip;
}

//==============================================================================
void DawSession::setSelectedTrack (int index)
{
    const auto clamped = juce::isPositiveAndBelow (index, getNumTracks()) ? index : -1;

    if (clamped == selectedTrack)
        return;

    selectedTrack = clamped;
    notify (selectionChanged);
}

void DawSession::setSelectedClip (int index)
{
    const auto clamped = juce::isPositiveAndBelow (index, (int) getClips().size()) ? index : -1;

    if (clamped == selectedClip)
        return;

    selectedClip = clamped;

    if (const auto* clip = getClip (selectedClip))
        selectedTrack = clip->trackIndex;

    notify (selectionChanged);
}

void DawSession::clampSelection()
{
    if (! juce::isPositiveAndBelow (selectedTrack, getNumTracks()))
        selectedTrack = getNumTracks() > 1 ? 1 : -1;

    if (! juce::isPositiveAndBelow (selectedClip, (int) getClips().size()))
        selectedClip = getClips().empty() ? -1 : 0;
}

//==============================================================================
void DawSession::previewNoteOn (int trackIndex, int pitch, float velocity)
{
    api.previewNoteOn (trackIndex, pitch, velocity);
}

void DawSession::previewNoteOff (int trackIndex, int pitch)
{
    api.previewNoteOff (trackIndex, pitch);
}

float DawSession::getTrackLevel (int trackIndex) const
{
    return trackIndex == 0 ? api.getMasterLevel() : api.getTrackLevel (trackIndex);
}

juce::String DawSession::getEngineStatus() const
{
    return api.getEngine().getStatusDescription();
}

bool DawSession::isEngineRunning() const
{
    return api.getEngine().isRunning();
}

//==============================================================================
ProjectSnapshot DawSession::takeSnapshot() const
{
    ProjectSnapshot s;
    s.project = project();
    s.selectedTrack = selectedTrack;
    s.selectedClip = selectedClip;
    return s;
}

void DawSession::restoreSnapshot (const ProjectSnapshot& s)
{
    project() = s.project;
    selectedTrack = s.selectedTrack;
    selectedClip = s.selectedClip;
    clampSelection();
}

void DawSession::beginTransaction (const juce::String& name)
{
    undoStack.push_back (takeSnapshot());
    undoNames.add (name);

    if ((int) undoStack.size() > maxUndoSteps)
    {
        undoStack.erase (undoStack.begin());
        undoNames.remove (0);
    }

    redoStack.clear();
    redoNames.clear();
}

void DawSession::undo()
{
    if (undoStack.empty())
        return;

    redoStack.push_back (takeSnapshot());
    redoNames.add (undoNames[undoNames.size() - 1]);

    restoreSnapshot (undoStack.back());
    undoStack.pop_back();
    undoNames.remove (undoNames.size() - 1);

    notify (everythingChanged);
}

void DawSession::redo()
{
    if (redoStack.empty())
        return;

    undoStack.push_back (takeSnapshot());
    undoNames.add (redoNames[redoNames.size() - 1]);

    restoreSnapshot (redoStack.back());
    redoStack.pop_back();
    redoNames.remove (redoNames.size() - 1);

    notify (everythingChanged);
}

//==============================================================================
void DawSession::newProject()
{
    beginTransaction ("New Project");

    project().clear();
    project().setName ("Untitled");
    colourIndex = 0;
    positionBeats = 0.0;
    playing = false;
    recording = false;
    api.stop();
    api.seekToBeats (0.0);

    selectedTrack = -1;
    selectedClip = -1;
    dirty = false;
    notify (everythingChanged);
}

void DawSession::loadDemoProject()
{
    undoStack.clear();
    redoStack.clear();
    undoNames.clear();
    redoNames.clear();
    colourIndex = 0;

    auto& p = project();
    p.clear();
    p.setName ("Untitled Orchestra");
    p.setBpm (96.0);
    p.setTimeSignature (4, 4);
    p.setMasterGainPosition (0.8f);

    positionBeats = 0.0;
    loopStart = 0.0;
    loopEnd = demoLengthBeats;

    if (auto* master = p.getTrack (0))
        master->inserts = { PluginSlot { "Convolution Reverb", {}, false }, PluginSlot {} };

    for (const auto& spec : demoTracks)
    {
        const auto index = p.addTrack (TrackType::Midi, spec.name, juce::Colour (spec.colour));
        auto* track = p.getTrack (index);

        if (track == nullptr)
            continue;

        track->section = spec.section;
        track->volume = spec.volume;
        track->pan = spec.pan;
        track->instrument = spec.library;

        // The parts are written for the orchestral libraries, but this phase plays them
        // through the built-in synth: the slot shows what is actually loaded.
        track->instrumentSlot.instrumentId = InstrumentRegistry::testSynthId;
        track->instrumentSlot.name = api.getInstruments().getDisplayName (InstrumentRegistry::testSynthId);

        track->automation.parameterName = "Volume";
        track->automation.points = { { 0.0, spec.volume }, { 16.0, spec.volume },
                                     { 24.0, juce::jlimit (0.0f, 1.0f, spec.volume + 0.12f) },
                                     { 32.0, spec.volume } };

        // One clip per 32 beat section, clipped to the range where this part plays.
        for (double sectionStart = 0.0; sectionStart < demoLengthBeats; sectionStart += 32.0)
        {
            const auto start = juce::jmax (sectionStart, spec.entryBeat);
            const auto end = juce::jmin (sectionStart + 32.0, spec.exitBeat);

            if (end - start < 1.0)
                continue;

            ClipData clip;
            clip.trackIndex = index;
            clip.startBeat = start;
            clip.lengthBeats = end - start;
            clip.name = juce::String (spec.name) + (sectionStart < 1.0 ? " A" : " B");
            clip.colour = track->colour;
            clip.midi = true;
            fillChordNotes (clip, spec);
            p.addClip (clip);
        }
    }

    selectedTrack = 1;
    selectedClip = 0;
    dirty = false;

    api.syncMixer();
    api.syncTempo();
    api.invalidateSequence();
    pushTransportStateToEngine();
    notify (everythingChanged);
}

//==============================================================================
juce::Colour DawSession::nextTrackColour()
{
    auto colour = trackPalette[colourIndex % (int) std::size (trackPalette)];
    ++colourIndex;
    return colour;
}

bool DawSession::updateMeters()
{
    bool changed = false;
    auto& tracks = getTracks();

    for (int i = 0; i < (int) tracks.size(); ++i)
    {
        const auto level = getTrackLevel (i);
        auto& track = tracks[(size_t) i];

        if (std::abs (level - track.meterLevel) > 0.002f)
            changed = true;

        track.meterLevel = level;
    }

    return changed;
}

void DawSession::timerCallback()
{
    const auto now = juce::Time::getMillisecondCounterHiRes();
    const auto deltaSec = juce::jlimit (0.0, 0.1, (now - lastTimeMs) * 0.001);
    lastTimeMs = now;

    int flags = 0;

    if (api.flushPendingUpdates())
    {
        // The engine may have substituted a fallback instrument; show what is loaded.
        auto& tracks = getTracks();

        for (int i = 1; i < (int) tracks.size(); ++i)
        {
            const auto loaded = api.getEngine().getTrackInstrumentName (i);

            if (loaded.isNotEmpty() && tracks[(size_t) i].instrumentSlot.name != loaded)
            {
                tracks[(size_t) i].instrumentSlot.name = loaded;
                flags |= mixerChanged;
            }
        }
    }

    const auto running = api.getEngine().isRunning();

    if (running != lastEngineRunning)
    {
        lastEngineRunning = running;
        flags |= engineChanged;
    }

    if (playing)
    {
        auto next = positionBeats;

        if (running)
        {
            next = api.getPositionBeats();
        }
        else
        {
            // No audio device: keep the playhead moving so the editor is still usable.
            next += deltaSec * getBpm() / 60.0;

            if (looping && next >= loopEnd)
                next = loopStart + std::fmod (next - loopStart, juce::jmax (0.25, loopEnd - loopStart));
        }

        const auto contentEnd = project().getLengthBeats();

        if (! looping && contentEnd > 0.25 && next >= contentEnd)
        {
            next = contentEnd;
            playing = false;
            recording = false;
            api.pause();
            flags |= transportChanged;
        }

        if (api.getEngine().consumeReachedEnd() && playing)
        {
            playing = false;
            recording = false;
            api.pause();
            flags |= transportChanged;
        }

        if (std::abs (next - positionBeats) > 1.0e-6)
        {
            positionBeats = next;
            flags |= positionChanged;
        }
    }

    if (updateMeters())
        flags |= metersChanged;

    notify (flags);
}
