#pragma once

#include "../Audio/AudioEngine.h"
#include "../Model/Project.h"
#include "../Model/ProjectSchema.h"
#include "../Plugins/InstrumentRegistry.h"
#include "../Plugins/PluginHost.h"
#include "../Plugins/PluginStateStore.h"
#include <array>
#include <atomic>
#include <deque>
#include <functional>
#include <map>
#include <memory>

/*  The application core: the project, the plugin host and the audio engine, plus the one
    API that drives them.  Nothing here includes a JUCE component header, so this object
    is exactly what a WebSocket server would sit on top of when the browser front end
    replaces the desktop shell.

    handleMessage() is that seam made concrete.  The desktop UI calls the typed methods
    directly because it is in-process; a remote client sends the same operations as JSON.
*/
class EngineAPI
{
public:
    EngineAPI();
    ~EngineAPI();

    /** What changed, for observers that need to refresh. */
    enum Change
    {
        transportChanged = 1 << 0,
        tempoChanged     = 1 << 1,
        tracksChanged    = 1 << 2,
        clipsChanged     = 1 << 3,
        notesChanged     = 1 << 4,
        mixerChanged     = 1 << 5,
        projectChanged   = 1 << 6
    };

    struct Listener
    {
        virtual ~Listener() = default;
        virtual void onEngineChanged (int changeFlags) = 0;
    };

    void addListener (Listener* l)       { engineListeners.add (l); }
    void removeListener (Listener* l)    { engineListeners.remove (l); }

    /** Broadcasts a model change to every listener (native views and the web gateway). */
    void notify (int changeFlags);

    //==============================================================================
    /** Opens the audio device.  Returns an empty string on success, otherwise a message
        suitable for the status bar.  The application stays usable either way.
    */
    juce::String initialise();
    void shutdown();

    Project& getProject() noexcept                   { return project; }
    const Project& getProject() const noexcept       { return project; }
    AudioEngine& getEngine() noexcept                { return engine; }
    const AudioEngine& getEngine() const noexcept    { return engine; }
    InstrumentRegistry& getInstruments() noexcept             { return instruments; }
    const InstrumentRegistry& getInstruments() const noexcept { return instruments; }

    //==============================================================================
    // Transport
    void play();
    void pause();
    void stop();
    void seekToBeats (double beats);
    bool isPlaying() const                { return engine.isPlaying(); }
    double getPositionBeats() const       { return engine.getPositionBeats(); }
    void setLooping (bool shouldLoop);
    void setLoopRangeBeats (double startBeats, double endBeats);
    void setMetronomeEnabled (bool enabled);

    //==============================================================================
    // Model to engine synchronisation.  The UI edits the project and then tells the API
    // what kind of change it made; nothing is pushed to the audio thread per keystroke.
    void syncTempo();
    void syncMixer();
    void invalidateSequence();

    /** Applies anything queued by the calls above.  Message thread, called from a timer,
        so a note drag rebuilds the playback sequence once rather than once per frame.
        Returns true when instrument assignments may have changed.
    */
    bool flushPendingUpdates();

    //==============================================================================
    float getTrackLevel (int trackIndex) const  { return engine.getTrackLevel (trackIndex); }
    float getMasterLevel() const                { return engine.getMasterLevel(); }

    void previewNoteOn (int trackIndex, int pitch, float velocity);
    void previewNoteOff (int trackIndex, int pitch);
    void allNotesOff();

    //==============================================================================
    // Instrument system.  Each MIDI track keeps its own hosted VST3 so the
    // arrangement can play every assigned timbre at once.  Loading never happens
    // on the audio thread.  The UI talks in InstrumentDefinition ids, not file paths.
    struct InstrumentLoadOptions
    {
        bool async = true;
        bool applyDefinitionFields = true;
        bool requireCapturedState = true;
    };

    void loadTrackInstrument (int trackIndex, const juce::String& definitionId, bool async = true);
    void loadTrackInstrument (int trackIndex, const juce::String& definitionId, const InstrumentLoadOptions& options);
    juce::var insertTrackPlugin (int trackIndex, const juce::String& pluginId);
    void unloadTrackInstrument (int trackIndex, const juce::String& reason = {});
    void clearAllHostedInstruments();
    void flushRetiredInstruments();
    bool setTrackTechnique (int trackIndex, const juce::String& techniqueId);
    bool setTrackController (int trackIndex, const juce::String& controllerId, float normalised);
    bool setTrackLegato (int trackIndex, bool enabled);
    void sanitizeTrackInstrumentFields (TrackData& track);
    bool capturePresetState (const juce::String& presetId);
    bool tryAdoptCapturedDump (const juce::String& presetId);
    bool tryRecaptureFactoryPreset (const juce::String& presetId);
    bool preparePluginForCapture (int trackIndex, const juce::String& pluginId,
                                  std::function<void (bool)> onComplete = {});
    juce::String dumpDefaultPluginStates();
    void pumpUi (int milliseconds);
    void playValidationPhrase (int trackIndex, int velocity = 80, bool blocking = false);
    juce::String describeDefinitionAvailability (const InstrumentDefinition& definition, int trackIndex) const;
    void verifyFreshRestore (int trackIndex, const juce::String& presetId,
                             std::function<void (bool)> onComplete);
    bool saveProjectToFile (const juce::File& file);
    juce::String loadProjectFromFile (const juce::File& file);
    PluginStateStore& getStateStore() noexcept { return stateStore; }
    juce::var describeCatalogue() const;
    juce::var describeInstrumentCapabilities (const juce::String& definitionId) const;
    juce::var describeInstrumentState (int trackIndex) const;
    juce::var describeInstrumentControls (int trackIndex) const;
    float getTrackController (int trackIndex, const juce::String& controllerId) const;

    //==============================================================================
    // Remote command surface.  The desktop UI does not use these, but they are the
    // contract the future browser front end will speak.
    juce::var handleMessage (const juce::var& message);
    juce::var handleMessage (const juce::String& jsonText);

    /** Full project state as JSON, for a client that has just connected. */
    juce::var describeProject() const;

    /** Playhead, meters and engine status, cheap enough to push several times a second. */
    juce::var describeClock() const;

    /** Session snapshot used on connect and reconnect.  One audio session per engine. */
    juce::var describeSession() const;
    juce::var describeMixer() const;
    juce::var describeAudioStatus() const;
    juce::var describeDiagnostics() const;
    juce::var describeNotes() const;
    juce::var takeNoteDelta();

    juce::String getSessionId() const;
    static constexpr int maxAudioSessions = 1;

    void beginEdit (const juce::String& name);
    void endEdit();
    void undoEdit();
    void redoEdit();
    bool canUndo() const noexcept { return ! undoStack.empty(); }
    bool canRedo() const noexcept { return ! redoStack.empty(); }

    /** Same Untitled Orchestra demonstration used by the desktop File menu. */
    void loadDemoOrchestra();

    /** Loads the orchestra demo when the project still only has the master track. */
    void ensureStarterContent();

    double getLoopStartBeats() const noexcept { return loopStartBeats; }
    double getLoopEndBeats() const noexcept   { return loopEndBeats; }

private:
    juce::var makeError (const juce::String& reason) const;
    juce::var makeOk (juce::DynamicObject* payload = nullptr) const;
    juce::var withOk (juce::var payload) const;
    juce::var instrumentStatusReply (int trackIndex) const;
    void applyWebMixerInserts (const juce::var& webMixer);
    bool applyTrackMixerField (TrackData& track, const juce::String& parameter, const juce::var& value);
    juce::var describeTrackMixer (const TrackData& track) const;

    InstrumentRegistry instruments;
    PluginHost pluginHost { instruments };
    PluginStateStore stateStore { instruments.getLoadedConfigFile() };
    Project project;
    AudioEngine engine { pluginHost };
    juce::ListenerList<Listener> engineListeners;

    void applyTrackDefinitionFields (TrackData& track, const InstrumentDefinition& definition);
    void completeInstrumentLoad (int trackIndex, const juce::String& definitionId, int generation,
                                 bool requireCapturedState, bool deferReady);
    void finishInstrumentLoad (int trackIndex, const juce::String& definitionId, int generation,
                               std::unique_ptr<PluginInstance> created, PluginInstance* existing,
                               bool requireCapturedState, bool deferReady);
    void evictHostedIfNeeded (int keepTrackIndex);
    int beginTrackLoad (int trackIndex);
    bool isCurrentLoad (int trackIndex, int generation) const noexcept;
    void cancelTrackLoad (int trackIndex);
    void cancelAllLoads();
    int countHostedInstances() const;
    void ensureAssignedInstrumentsLoaded (bool async);
    bool applyTechniqueAction (int trackIndex, const TechniqueDefinition& technique);
    bool applyControllerDefinition (int trackIndex, const ControllerDefinition& controller, float normalised);
    bool restorePresetToInstance (PluginInstance& instance, TrackData& track, juce::StringArray& notes,
                                  bool requireCapturedState);
    void markReadyWhenSettled (int trackIndex, const juce::String& definitionId, int generation,
                               const juce::StringArray& notes, int delayMs);
    void scheduleSynchronWarmupThenReady (int trackIndex, const juce::String& definitionId, int generation,
                                          juce::StringArray notes, bool wasAudioAttached, bool deferReady,
                                          const juce::String& displayName);
    void startNextSynchronWarmup();
    void finishSynchronWarmup (bool wasAudioAttached);
    void refreshPresetAvailability();
    void finishReady (TrackData& track, const juce::StringArray& notes);
    void finishProjectLoad();
    void logSection (const juce::String& section, const juce::String& message) const;
    void collectUnusedInstrumentsLater();
    void failInstrumentLoad (int trackIndex, InstrumentLoadState state, const juce::String& message);
    bool pluginStateMatchesDifferentFactory (const TrackData& track, const juce::MemoryBlock& state) const;
    bool hasRestorableFactoryState (const TrackData& track) const;
    void snapshotTrackPluginStates();
    void logAudioResult (int trackIndex);
    void ensureTrackInstrumentLoaded (int trackIndex, bool async = true);
    void cancelScheduledNoteOff (int trackIndex, int pitch);
    void flushScheduledNoteOffs (int trackIndex, bool sendNow);
    static juce::uint64 noteOffKey (int trackIndex, int pitch) noexcept;

    bool sequenceDirty = true;
    bool mixerDirty = true;
    bool tempoDirty = true;
    int loadEpoch = 0;
    std::array<int, AudioEngine::maxTracks> trackLoadGeneration {};
    std::shared_ptr<std::atomic<bool>> alive { std::make_shared<std::atomic<bool>> (true) };
    std::atomic<int> pendingSynchronWarmups { 0 };

    /*  Synchron Player needs its native editor open before processBlock is safe, and
        that sequence detaches the audio callback.  Overlapping loads would leave the
        callback detached and later instances silent, so they run one at a time.
    */
    struct SynchronWarmupJob
    {
        int trackIndex = 0;
        juce::String definitionId;
        int generation = 0;
        juce::StringArray notes;
        bool wasAudioAttached = false;
        bool deferReady = false;
    };

    std::deque<SynchronWarmupJob> synchronWarmupQueue;
    bool synchronWarmupActive = false;
    std::map<juce::uint64, juce::uint32> scheduledNoteOffs;
    juce::uint32 noteOffGeneration = 0;
    double loopStartBeats = 0.0;
    double loopEndBeats = 32.0;
    // UTF-8 UUID, written once in the constructor. Never a juce::String: concurrent
    // copies of the same StringHolder crash in StringHolderUtils::retain.
    std::array<char, 48> sessionId {};

    struct EditSnapshot
    {
        juce::String name;
        Project project;
        double loopStart = 0.0;
        double loopEnd = 32.0;
        bool looping = false;
    };

    EditSnapshot captureEdit (const juce::String& name) const;
    void restoreEdit (const EditSnapshot& snapshot);

    std::vector<EditSnapshot> undoStack, redoStack;
    bool editOpen = false;
    juce::var pendingNoteDelta;
    static constexpr int maxUndoSteps = 64;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineAPI)
};
