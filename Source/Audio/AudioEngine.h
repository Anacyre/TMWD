#pragma once

#include <JuceHeader.h>
#include "LockFreeQueue.h"
#include "MidiSequencer.h"
#include "MixerEngine.h"
#include "PlaybackSequence.h"
#include "RemoteAudioOutput.h"
#include "Transport.h"
#include "../Model/Project.h"
#include "../Plugins/PluginHost.h"

/*  The single owner of everything below the model: the audio device, the transport, the
    sequencer, one instrument per track, the mixer and the master bus.

    Everything public here is safe to call from the message thread.  Nothing above this
    class ever touches an AudioBuffer, a MidiBuffer or a device, which is what lets the
    same API be driven later by a WebSocket server instead of by JUCE components.

    Thread model
    ------------
    Message thread  : this API.  Allocates, builds sequences and instrument instances.
    Audio thread    : audioDeviceIOCallbackWithContext only.  Never allocates, never
                      locks, never touches the model.
    Between them    : atomics for continuous parameters, single-producer lock-free queues
                      for events and for handing over objects built on the message thread.
*/
class AudioEngine  : private juce::AudioIODeviceCallback
{
public:
    explicit AudioEngine (PluginHost& pluginHostToUse);
    ~AudioEngine() override;

    static constexpr int maxTracks = MixerEngine::maxChannels;

    //==============================================================================
    // Lifecycle
    /** Opens the default output device.  Never throws and never leaves the application
        unusable: on failure the engine simply stays silent and reports why.
    */
    bool initialise();
    void shutdown();

    /** Temporarily remove the audio callback so a VST3 can prepare or create its
        editor without deadlocking against processBlock. */
    void detachAudioCallback();
    void attachAudioCallback();
    bool isAudioCallbackAttached() const noexcept { return audioCallbackAttached; }

    bool isRunning() const noexcept          { return deviceRunning.load(); }
    juce::String getLastError() const        { return lastError; }
    juce::String getStatusDescription() const;
    double getSampleRate() const noexcept    { return currentSampleRate.load(); }
    int getBlockSize() const noexcept        { return currentBlockSize.load(); }

    juce::AudioDeviceManager& getDeviceManager() noexcept { return deviceManager; }
    const juce::AudioDeviceManager& getDeviceManager() const noexcept { return deviceManager; }
    PluginHost& getPluginHost() noexcept { return pluginHost; }
    RemoteAudioOutput& getRemoteAudio() noexcept { return remoteAudio; }
    const RemoteAudioOutput& getRemoteAudio() const noexcept { return remoteAudio; }
    float getAudioCpuPercent() const { return (float) (deviceManager.getCpuUsage() * 100.0); }

    //==============================================================================
    // Transport
    void start();
    void stop();
    void pause();
    bool isPlaying() const                   { return transport.isPlaying(); }
    void setPositionBeats (double beats);
    double getPositionBeats() const          { return transport.getPositionBeats(); }
    void setBpm (double bpm)                 { transport.setBpm (bpm); }
    void setLooping (bool shouldLoop);
    bool isLooping() const                   { return transport.isLooping(); }
    void setLoopRangeBeats (double startBeats, double endBeats);
    void setTimeSignature (int numerator, int denominator);
    void setMetronomeEnabled (bool enabled)  { metronomeEnabled.store (enabled); }
    bool isMetronomeEnabled() const          { return metronomeEnabled.load(); }

    /** True once playback has run past the end of the material. */
    bool consumeReachedEnd()                 { return transport.consumeReachedEnd(); }

    //==============================================================================
    // Content
    /** Compiles the project's clips and notes and publishes them to the audio thread. */
    void rebuildSequence (const Project& project);

    /** Pushes every per-track mixer value and the track count in one go. */
    void syncMixerFromProject (const Project& project);

    //==============================================================================
    // Live input, e.g. previewing a note while editing it in the piano roll
    void sendNoteOn (int trackIndex, int pitch, float velocity);
    void sendNoteOff (int trackIndex, int pitch);
    void sendController (int trackIndex, int controllerNumber, int value);
    void sendProgramChange (int trackIndex, int program);
    void sendPitchBend (int trackIndex, int value14);
    void sendChannelPressure (int trackIndex, int pressure);
    void allNotesOff();

    //==============================================================================
    // Metering
    float getTrackLevel (int trackIndex) const  { return mixer.getChannelLevel (trackIndex); }
    float getMasterLevel() const                { return mixer.getMasterLevel(); }
    MixerEngine& getMixer() noexcept            { return mixer; }
    const MixerEngine& getMixer() const noexcept { return mixer; }

    //==============================================================================
    // Instruments
    /** Replaces a track's instrument.  The instance is built on the message thread and
        handed over lock-free, so this is already the path a hosted VST3 will take.
    */
    void setTrackInstrument (int trackIndex, std::unique_ptr<PluginInstance> instance);
    void clearTrackInstrument (int trackIndex);
    /** Message-thread only.  Drops instances no track still points at. */
    void collectUnusedInstruments();
    PluginInstance* getTrackInstrument (int trackIndex) noexcept;
    const PluginInstance* getTrackInstrument (int trackIndex) const noexcept;
    juce::String getTrackInstrumentName (int trackIndex) const;

private:
    //==============================================================================
    void audioDeviceIOCallbackWithContext (const float* const* inputChannelData,
                                           int numInputChannels,
                                           float* const* outputChannelData,
                                           int numOutputChannels,
                                           int numSamples,
                                           const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart (juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

    //==============================================================================
    struct TrackNode
    {
        std::atomic<bool> active { false };
        std::atomic<int> midiChannel { 1 };
        std::atomic<PluginInstance*> instrument { nullptr };

        juce::AudioBuffer<float> buffer;
    };

    struct MidiEvent
    {
        int trackIndex = 0;
        juce::uint8 status = 0;
        juce::uint8 data1 = 0;
        juce::uint8 data2 = 0;
    };

    struct Click
    {
        int samplesRemaining = 0;
        int startOffset = 0;
        int lengthSamples = 0;
        double phase = 0.0;
        double phaseDelta = 0.0;
        float level = 0.0f;
    };

    void prepareNodes (double sampleRate, int blockSize);
    void ensureInstrument (int trackIndex, const juce::String& instrumentId);
    void collectRetiredSequences();
    void resetAllInstruments();
    void renderMetronome (const Transport::Segment* segments, int numSegments,
                          juce::AudioBuffer<float>& master, int numSamples);
    void queueMidi (const MidiEvent& event);

    //==============================================================================
    PluginHost& pluginHost;
    juce::AudioDeviceManager deviceManager;

    Transport transport;
    MidiSequencer sequencer;
    MixerEngine mixer;
    RemoteAudioOutput remoteAudio;

    std::array<TrackNode, (size_t) maxTracks> nodes;
    std::array<juce::MidiBuffer, (size_t) maxTracks> trackMidi;
    juce::AudioBuffer<float> masterBuffer;

    // Objects created on the message thread and handed to the audio thread.  The message
    // thread keeps ownership so nothing is ever deleted inside a callback.
    std::vector<std::unique_ptr<PlaybackSequence>> ownedSequences;
    std::vector<std::unique_ptr<PluginInstance>> ownedInstruments;
    LockFreeQueue<PlaybackSequence*, 32> incomingSequences;
    LockFreeQueue<PlaybackSequence*, 32> retiredSequences;
    LockFreeQueue<MidiEvent, 512> midiInputQueue;

    std::atomic<bool> deviceRunning { false };
    std::atomic<bool> panicRequested { false };
    std::atomic<bool> metronomeEnabled { false };
    std::atomic<double> currentSampleRate { 44100.0 };
    std::atomic<int> currentBlockSize { 512 };
    std::atomic<int> timeSigNumerator { 4 };
    std::atomic<int> activeTrackCount { 0 };

    Click click;
    bool wasPlayingLastBlock = false;
    bool audioCallbackAttached = false;
    juce::String lastError;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AudioEngine)
};
