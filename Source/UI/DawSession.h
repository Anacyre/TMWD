#pragma once

#include <JuceHeader.h>
#include <memory>
#include "DawColours.h"
#include "../Communication/EngineAPI.h"

/*  The session layer the views talk to.

    It owns the view state - zoom, selection, which panels are open, undo history - and
    forwards everything musical to the EngineAPI underneath it, which owns the project
    model and the audio engine.  Views observe it through DawSession::Listener and never
    talk to each other, and no view has ever seen an AudioBuffer.

        views  ->  DawSession  ->  EngineAPI  ->  Project + AudioEngine

    notify() is the single funnel for edits: whatever a view changes in the model, it says
    so here, and this class works out what the engine needs to be told.
*/
class DawSession  : private juce::Timer,
                    private EngineAPI::Listener
{
public:
    DawSession();
    explicit DawSession (EngineAPI& engineToShare);
    ~DawSession() override;

    //==============================================================================
    enum ChangeFlags
    {
        transportChanged  = 1 << 0,   // play / stop / record / loop / metronome
        positionChanged   = 1 << 1,   // playhead moved
        tracksChanged     = 1 << 2,   // tracks added / removed / renamed
        clipsChanged      = 1 << 3,   // clips added / removed / moved
        notesChanged      = 1 << 4,   // MIDI content of a clip
        selectionChanged  = 1 << 5,
        mixerChanged      = 1 << 6,   // volume / pan / mute / solo / plugins
        metersChanged     = 1 << 7,
        projectChanged    = 1 << 8,   // name, tempo, time signature
        viewChanged       = 1 << 9,   // zoom, track height, snap
        engineChanged     = 1 << 10,  // audio device state
        everythingChanged = 0x7ff
    };

    struct Listener
    {
        virtual ~Listener() = default;
        virtual void sessionChanged (int changeFlags) = 0;
    };

    void addListener (Listener* l)    { listeners.add (l); }
    void removeListener (Listener* l) { listeners.remove (l); }

    //==============================================================================
    // Transport
    void play();
    void pause();
    void togglePlay();
    void stop();
    void returnToStart();
    void toggleRecord();
    void toggleLoop();
    void toggleMetronome();
    void toggleSnap();
    void setSnapEnabled (bool shouldBeOn);

    bool isPlaying() const noexcept     { return playing; }
    bool isRecording() const noexcept   { return recording; }
    bool isLooping() const noexcept     { return looping; }
    bool isMetronomeOn() const noexcept { return metronome; }
    bool isSnapOn() const noexcept      { return snap; }

    double getBpm() const noexcept;
    void setBpm (double newBpm);

    double getPositionBeats() const noexcept { return positionBeats; }
    void setPositionBeats (double beats);

    double getLoopStart() const noexcept { return loopStart; }
    double getLoopEnd() const noexcept   { return loopEnd; }
    void setLoopRange (double startBeats, double endBeats);

    int getTimeSigNumerator() const noexcept;
    int getTimeSigDenominator() const noexcept;
    int getBeatsPerBar() const noexcept { return getTimeSigNumerator(); }
    void setTimeSignature (int numerator, int denominator);

    float getMasterGain() const noexcept;
    void setMasterGain (float gain);

    //==============================================================================
    // View state shared between the track list and the arrangement
    double getPixelsPerBeat() const noexcept { return pixelsPerBeat; }
    void setPixelsPerBeat (double ppb);

    int getTrackHeight() const noexcept { return trackHeight; }
    void setTrackHeight (int newHeight);

    double getSnapGridBeats() const noexcept { return snapGrid; }
    void setSnapGridBeats (double beats);

    // Which panels are on screen.  Kept here so the menus, transport bar and main
    // layout all observe a single source of truth.
    enum class EditorTab { pianoRoll, automation, trackInfo };

    bool isMixerVisible() const noexcept     { return mixerVisible; }
    bool isEditorVisible() const noexcept    { return editorVisible; }
    bool isInspectorVisible() const noexcept { return inspectorVisible; }
    void setMixerVisible (bool shouldBeVisible);
    void setEditorVisible (bool shouldBeVisible);
    void setInspectorVisible (bool shouldBeVisible);
    void toggleMixer()     { setMixerVisible (! mixerVisible); }
    void toggleEditor()    { setEditorVisible (! editorVisible); }
    void toggleInspector() { setInspectorVisible (! inspectorVisible); }

    EditorTab getEditorTab() const noexcept { return editorTab; }
    void setEditorTab (EditorTab tab);

    double snapBeat (double beat) const;
    juce::String getPositionString() const;
    bool isMusicalPosition() const noexcept { return musicalPosition; }
    void togglePositionFormat();
    juce::String getSecondsString() const;
    void getBarBeatTick (int& bar, int& beat, int& tick) const;

    //==============================================================================
    // Project
    juce::String getProjectName() const;
    void setProjectName (const juce::String& name);
    juce::String getUserName() const    { return userName; }
    bool hasUnsavedChanges() const noexcept { return dirty; }
    void markSaved();

    void newProject();
    void loadDemoProject();
    bool saveProject();
    bool saveProjectAs (const juce::File& file);
    juce::String loadProjectFrom (const juce::File& file);
    juce::File getCurrentProjectFile() const { return currentProjectFile; }

    void showInstrumentSelector (juce::Component* anchor, int trackIndex = -1);
    void showOrchestraPatchSelector (juce::Component* anchor, int trackIndex = -1);
    void dismissInstrumentBrowser();
    void bindInstrumentBrowser (juce::DocumentWindow* window) noexcept { instrumentBrowser = window; }
    juce::DocumentWindow* getInstrumentBrowserWindow() const noexcept { return instrumentBrowser; }

    void insertPlugin (int trackIndex, const juce::String& pluginId);
    void showPluginUI (int trackIndex = -1);
    bool isMOrchestraTrack (const TrackData& track) const;

    void showOrchestraSampler (int trackIndex = -1);
    void closeOrchestraSampler();
    void showMOrchestra (int trackIndex = -1);
    void closeMOrchestra();

    void showFxInsertEditor (int trackIndex, int slotIndex);
    void closeFxInsertEditor();

    //==============================================================================
    // Content
    std::vector<TrackData>& getTracks();
    const std::vector<TrackData>& getTracks() const;
    std::vector<ClipData>& getClips();
    const std::vector<ClipData>& getClips() const;

    int getNumTracks() const noexcept;
    TrackData* getTrack (int index);
    const TrackData* getTrack (int index) const;
    TrackData* findTrack (TrackId trackId);
    const TrackData* findTrack (TrackId trackId) const;
    int indexOfTrack (TrackId trackId) const;
    ClipData* getClip (int index);
    const ClipData* getClip (int index) const;

    Project& project() noexcept             { return api.getProject(); }
    const Project& project() const noexcept { return api.getProject(); }

    int addTrack (TrackType type, const juce::String& name = {});
    void removeTrack (int index);
    void moveTrack (int fromIndex, int toIndex);
    int duplicateTrack (int index);
    void setTrackCollapsed (int index, bool collapsed);

    int addClip (int trackIndex, double startBeat, double lengthBeats, const juce::String& name = {});
    int addClipFromFile (const juce::File& file, int trackIndex, double startBeat);
    void removeClip (int index);
    int duplicateClip (int index);

    /** True when the track is audible given the current mute / solo state. */
    bool isTrackAudible (int index) const;

    bool isPlaylistTrackVisible (int index) const;
    int getVisibleTrackCount() const;
    int getVisibleRowForTrack (int trackIndex) const;
    int getTrackIndexForVisibleRow (int row) const;
    int getTrackDepth (int index) const;

    //==============================================================================
    // Selection
    int getSelectedTrack() const noexcept { return selectedTrack; }
    void setSelectedTrack (int index);
    int getSelectedClip() const noexcept { return selectedClip; }
    void setSelectedClip (int index);

    //==============================================================================
    // Audio engine.  Views use these three; nothing else in the UI reaches downwards.
    /** Sounds a note straight away so an edit is audible while it is being made.  The
        note still goes through the engine - the piano roll never renders audio itself.
    */
    void previewNoteOn (int trackIndex, int pitch, float velocity);
    void previewNoteOff (int trackIndex, int pitch);

    /** Level published by the audio engine for this track, 0 to 1. */
    float getTrackLevel (int trackIndex) const;

    juce::String getEngineStatus() const;
    bool isEngineRunning() const;
    EngineAPI& getEngineAPI() noexcept { return api; }

    //==============================================================================
    // Undo / redo over whole-project snapshots.
    void beginTransaction (const juce::String& name);
    void undo();
    void redo();
    bool canUndo() const noexcept { return ! undoStack.empty(); }
    bool canRedo() const noexcept { return ! redoStack.empty(); }
    juce::String getUndoName() const { return undoNames[undoNames.size() - 1]; }
    juce::String getRedoName() const { return redoNames[redoNames.size() - 1]; }

    /** Call after mutating tracks/clips in place so views refresh and the engine hears
        the change.  This is the only place model edits reach the audio layer.
    */
    void notify (int changeFlags);

    //==============================================================================
    static constexpr int ticksPerBeat       = (int) MusicalTime::ticksPerQuarterNote;
    static constexpr int topBarHeight       = 48;
    static constexpr int transportHeight    = 0;
    static constexpr int rulerHeight        = 32;
    static constexpr int statusBarHeight    = 24;
    static constexpr int defaultTrackHeight = 50;
    static constexpr int minTrackHeight     = 44;
    static constexpr int maxTrackHeight      = 132;

    /** Instruments the user may choose from.  Comes from the plugin host's registry, so
        there is no way to reach an arbitrary plugin from the UI.
    */
    juce::StringArray getAvailableInstruments() const;
    static juce::StringArray getAvailableEffects();
    static juce::String effectIdForName (const juce::String& effectName);

    static constexpr int instrumentMenuIdBase = 1000;
    static constexpr int instrumentMenuRemoveId = 99;
    static constexpr int insertMenuOpenId = 100;

    void fillInstrumentBrowserMenu (juce::PopupMenu& menu, const juce::String& currentDefinitionId) const;
    juce::String definitionIdFromMenuResult (int result) const;

    void assignInstrument (TrackData& track, const juce::String& displayName);
    void assignInstrumentDefinition (TrackData& track, const juce::String& definitionId);
    void clearInstrument (TrackData& track);
    bool setTrackTechnique (TrackData& track, const juce::String& techniqueId);
    bool setTrackController (TrackData& track, const juce::String& controllerId, float normalised);
    bool setTrackLegato (TrackData& track, bool enabled);

private:
    void timerCallback() override;
    void onEngineChanged (int changeFlags) override;
    void setupSession (bool initialiseEngine);
    bool updateMeters();
    juce::Colour nextTrackColour();
    ProjectSnapshot takeSnapshot() const;
    void restoreSnapshot (const ProjectSnapshot&);
    void clampSelection();
    void pushTransportStateToEngine();

    std::unique_ptr<EngineAPI> ownedApi;
    EngineAPI& api;
    bool applyingRemote = false;

    juce::ListenerList<Listener> listeners;

    juce::String userName;
    juce::File currentProjectFile;
    bool dirty = false;

    bool playing = false;
    bool recording = false;
    bool looping = false;
    bool metronome = false;
    bool snap = true;

    double positionBeats = 0.0;
    double loopStart = 0.0;
    double loopEnd = 32.0;
    double lastTimeMs = 0.0;
    double pixelsPerBeat = 21.0;
    double snapGrid = 0.25;
    int trackHeight = defaultTrackHeight;
    int colourIndex = 0;
    bool mixerVisible = false;
    bool editorVisible = false;
    bool inspectorVisible = false;
    bool musicalPosition = true;
    EditorTab editorTab = EditorTab::pianoRoll;
    int selectedTrack = 1;
    int selectedClip = 0;
    bool lastEngineRunning = false;

    std::vector<ProjectSnapshot> undoStack, redoStack;
    juce::StringArray undoNames, redoNames;
    juce::DocumentWindow* instrumentBrowser = nullptr;
    std::unique_ptr<class OrchestraSamplerWindow> orchestraSamplerWindow;
    std::unique_ptr<class MOrchestraWindow> mOrchestraWindow;
    std::unique_ptr<class FxInsertEditorWindow> fxInsertEditorWindow;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DawSession)
};
