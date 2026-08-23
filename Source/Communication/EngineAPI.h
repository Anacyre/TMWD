#pragma once

#include "../Audio/AudioEngine.h"
#include "../Model/Project.h"
#include "../Plugins/InstrumentRegistry.h"
#include "../Plugins/PluginHost.h"

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

    /** Called when something other than the local UI changed the project, e.g. a remote
        command. The desktop shell hooks this up to its own repaint notification.
    */
    std::function<void (int)> onChange;

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
    // Remote command surface.  The desktop UI does not use these, but they are the
    // contract the future browser front end will speak.
    juce::var handleMessage (const juce::var& message);
    juce::var handleMessage (const juce::String& jsonText);

    /** Full project state as JSON, for a client that has just connected. */
    juce::var describeProject() const;

private:
    juce::var makeError (const juce::String& reason) const;
    juce::var makeOk (juce::DynamicObject* payload = nullptr) const;
    void notify (int changeFlags);

    InstrumentRegistry instruments;
    PluginHost pluginHost { instruments };
    Project project;
    AudioEngine engine { pluginHost };

    bool sequenceDirty = true;
    bool mixerDirty = true;
    bool tempoDirty = true;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineAPI)
};
