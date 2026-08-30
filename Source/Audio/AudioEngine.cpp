#include "AudioEngine.h"
#include <algorithm>

namespace
{
    constexpr int preallocatedBlockSize = 4096;
    constexpr int masterChannels = 2;
}

AudioEngine::AudioEngine (PluginHost& pluginHostToUse)
    : pluginHost (pluginHostToUse)
{
    sequencer.prepare (maxTracks);
    masterBuffer.setSize (masterChannels, preallocatedBlockSize);

    for (auto& node : nodes)
        node.buffer.setSize (masterChannels, preallocatedBlockSize);

    for (auto& buffer : trackMidi)
        buffer.ensureSize (2048);
}

AudioEngine::~AudioEngine()
{
    shutdown();
}

//==============================================================================
bool AudioEngine::initialise()
{
    // Two outputs, no inputs: this phase has nothing to record.
    juce::Logger::writeToLog ("Audio device: opening default output...");
    lastError = deviceManager.initialiseWithDefaultDevices (0, masterChannels);

    if (lastError.isNotEmpty())
    {
        // A missing or busy device must not stop the editor from opening.  The engine
        // stays idle and the status bar explains why.
        return false;
    }

    deviceManager.addAudioCallback (this);
    audioCallbackAttached = true;
    return true;
}

void AudioEngine::detachAudioCallback()
{
    if (! audioCallbackAttached)
        return;

    deviceManager.removeAudioCallback (this);
    audioCallbackAttached = false;
}

void AudioEngine::attachAudioCallback()
{
    if (audioCallbackAttached || deviceManager.getCurrentAudioDevice() == nullptr)
        return;

    deviceManager.addAudioCallback (this);
    audioCallbackAttached = true;
}

void AudioEngine::shutdown()
{
    detachAudioCallback();
    deviceManager.closeAudioDevice();
    deviceRunning.store (false);
    collectRetiredSequences();
}

juce::String AudioEngine::getStatusDescription() const
{
    if (! deviceRunning.load())
        return lastError.isNotEmpty() ? "Audio: " + lastError : juce::String ("Audio: idle");

    auto* device = deviceManager.getCurrentAudioDevice();
    const auto name = device != nullptr ? device->getName() : juce::String ("Unknown");

    return name + "  " + juce::String (getSampleRate() / 1000.0, 1) + " kHz  "
           + juce::String (getBlockSize()) + " smp";
}

//==============================================================================
void AudioEngine::start()
{
    transport.setPlaying (true);
}

void AudioEngine::stop()
{
    transport.setPlaying (false);
    panicRequested.store (true);
}

void AudioEngine::pause()
{
    transport.setPlaying (false);
    panicRequested.store (true);
}

void AudioEngine::setPositionBeats (double beats)
{
    transport.seekToBeats (beats);
    panicRequested.store (true);
}

void AudioEngine::setLooping (bool shouldLoop)
{
    transport.setLooping (shouldLoop);
}

void AudioEngine::setLoopRangeBeats (double startBeats, double endBeats)
{
    transport.setLoopRangeBeats (startBeats, endBeats);
}

void AudioEngine::setTimeSignature (int numerator, int)
{
    timeSigNumerator.store (juce::jlimit (1, 16, numerator));
}

//==============================================================================
void AudioEngine::rebuildSequence (const Project& project)
{
    const auto numTracks = juce::jmin (maxTracks, project.getNumTracks());
    auto sequence = std::make_unique<PlaybackSequence> (numTracks);

    for (const auto& clip : project.getClips())
    {
        if (clip.muted || ! clip.midi || ! juce::isPositiveAndBelow (clip.trackIndex, numTracks))
            continue;

        const auto* track = project.getTrack (clip.trackIndex);

        if (track == nullptr || track->isMaster() || track->isGroup())
            continue;

        const auto clipStart = clip.getStartTick();
        const auto clipEnd = clipStart + clip.getLengthTicks();
        const auto sourceTicks = juce::jmax ((juce::int64) 1, MusicalTime::beatsToTicks (clip.getSourceLengthBeats()));

        for (const auto& note : clip.notes)
        {
            if (note.muted)
                continue;

            const auto noteStartInSource = note.getStartTick();
            const auto channel = note.channel > 0 ? note.channel : track->midiChannel;
            const auto repeatTicks = NoteModel::repeatIntervalTicks (note.repeatMode);

            auto emitSlice = [&] (juce::int64 sliceStart, juce::int64 sliceEnd)
            {
                for (juce::int64 loopStart = clipStart; loopStart < clipEnd; loopStart += sourceTicks)
                {
                    const auto start = loopStart + sliceStart;

                    if (start >= clipEnd)
                        break;

                    auto end = juce::jmin (clipEnd, loopStart + sliceEnd);

                    if (end <= start)
                        continue;

                    juce::int64 soundingEnd = end;

                    if (SoftwareLegato::isActive (*track))
                    {
                        soundingEnd += SoftwareLegato::extraTicks();

                        for (const auto& otherClip : project.getClips())
                        {
                            if (otherClip.trackIndex != clip.trackIndex || ! otherClip.midi || otherClip.muted)
                                continue;

                            const auto otherClipStart = otherClip.getStartTick();

                            for (const auto& other : otherClip.notes)
                            {
                                if (other.muted || other.pitch != note.pitch)
                                    continue;

                                const auto otherStart = otherClipStart + other.getStartTick();

                                if (otherStart > start && otherStart < soundingEnd)
                                    soundingEnd = otherStart;
                            }
                        }
                    }

                    sequence->addNote (clip.trackIndex, channel, note.pitch,
                                       note.getVelocityByte(), start, soundingEnd);
                }
            };

            if (repeatTicks <= 0)
            {
                emitSlice (noteStartInSource, note.getEndTick());
            }
            else
            {
                const auto noteEnd = note.getEndTick();

                for (auto t = noteStartInSource; t < noteEnd; t += repeatTicks)
                {
                    const auto sliceEnd = juce::jmin (noteEnd, t + repeatTicks);

                    if (sliceEnd - t < NoteModel::minDurationTicks)
                        break;

                    emitSlice (t, sliceEnd);
                }
            }
        }
    }

    sequence->finalise();
    transport.setContentLengthTicks (sequence->getLengthTicks());

    collectRetiredSequences();

    auto* raw = sequence.get();
    ownedSequences.push_back (std::move (sequence));

    if (! incomingSequences.push (raw))
    {
        // The audio thread has not caught up; drop this revision rather than block.
        ownedSequences.pop_back();
    }
}

void AudioEngine::syncMixerFromProject (const Project& project)
{
    const auto numTracks = juce::jmin (maxTracks, project.getNumTracks());

    mixer.setMasterGain (project.getMasterGainPosition());
    mixer.setNumChannels (numTracks);

    // Insert kinds and parameters are owned by mixer.setWebMixer /
    // applyWebMixerInserts. Overwriting them from the two Project slots here
    // used to wipe the 5-slot web mixer chain on every project sync.
    transport.setBpm (project.getBpm());
    setTimeSignature (project.getTimeSigNumerator(), project.getTimeSigDenominator());

    for (int i = 1; i < numTracks; ++i)
    {
        const auto* track = project.getTrack (i);

        if (track == nullptr)
            continue;

        if (track->isGroup())
        {
            mixer.setChannelParameters (i, 0.0f, 0.0f, false);
            nodes[(size_t) i].active.store (false);
            continue;
        }

        const auto audible = project.isTrackAudible (i);
        mixer.setChannelParameters (i, track->volume, track->pan, audible);

        auto& node = nodes[(size_t) i];
        node.midiChannel.store (juce::jlimit (1, 16, track->midiChannel));

        if (track->isMidi())
        {
            ensureInstrument (i, track->instrumentSlot.instrumentId);
            node.active.store (node.instrument.load() != nullptr);
        }
        else
        {
            node.active.store (false);
        }
    }

    for (int i = numTracks; i < maxTracks; ++i)
        nodes[(size_t) i].active.store (false);

    activeTrackCount.store (numTracks);
}

void AudioEngine::ensureInstrument (int trackIndex, const juce::String& instrumentId)
{
    auto& node = nodes[(size_t) trackIndex];
    auto* existing = node.instrument.load();
    const auto wanted = instrumentId.isNotEmpty() ? instrumentId
                                                  : juce::String (InstrumentRegistry::testSynthId);

    if (existing != nullptr && existing->getInstrumentId() == wanted)
        return;

    // Hosted VST3s are loaded only through EngineAPI, so a mixer sync never instantiates
    // every catalogue entry.  Built-in synths stay cheap to create here.
    if (const auto* descriptor = pluginHost.getRegistry().find (wanted))
        if (! descriptor->isBuiltIn())
            return;

    juce::String error;
    auto instance = pluginHost.createInstance (wanted, getSampleRate(), getBlockSize(), error);

    if (instance == nullptr)
        return;

    if (error.isNotEmpty() && lastError.isEmpty())
        lastError = error;

    setTrackInstrument (trackIndex, std::move (instance));
}

void AudioEngine::setTrackInstrument (int trackIndex, std::unique_ptr<PluginInstance> instance)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks) || instance == nullptr)
        return;

    const bool heavy = instance->isExternalPlugin() && audioCallbackAttached;

    if (heavy)
        detachAudioCallback();

    instance->prepare (getSampleRate(), getBlockSize());

    auto* raw = instance.get();

    // The message thread keeps every instance it ever made alive for the session, so the
    // audio thread can read the pointer without ever running a destructor in a callback.
    ownedInstruments.push_back (std::move (instance));
    nodes[(size_t) trackIndex].instrument.store (raw);
    nodes[(size_t) trackIndex].active.store (true);

    if (heavy)
        attachAudioCallback();
}

void AudioEngine::clearTrackInstrument (int trackIndex)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    nodes[(size_t) trackIndex].instrument.store (nullptr);
    nodes[(size_t) trackIndex].active.store (false);
}

void AudioEngine::collectUnusedInstruments()
{
    ownedInstruments.erase (std::remove_if (ownedInstruments.begin(), ownedInstruments.end(),
                                            [this] (const std::unique_ptr<PluginInstance>& instance)
                                            {
                                                if (instance == nullptr)
                                                    return true;

                                                for (const auto& node : nodes)
                                                    if (node.instrument.load() == instance.get())
                                                        return false;

                                                return true;
                                            }),
                            ownedInstruments.end());
}

PluginInstance* AudioEngine::getTrackInstrument (int trackIndex) noexcept
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return nullptr;

    return nodes[(size_t) trackIndex].instrument.load();
}

const PluginInstance* AudioEngine::getTrackInstrument (int trackIndex) const noexcept
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return nullptr;

    return nodes[(size_t) trackIndex].instrument.load();
}

juce::String AudioEngine::getTrackInstrumentName (int trackIndex) const
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return {};

    if (auto* instrument = nodes[(size_t) trackIndex].instrument.load())
        return instrument->getDisplayName();

    return {};
}

void AudioEngine::collectRetiredSequences()
{
    PlaybackSequence* retired = nullptr;

    while (retiredSequences.pop (retired))
    {
        ownedSequences.erase (std::remove_if (ownedSequences.begin(), ownedSequences.end(),
                                              [retired] (const std::unique_ptr<PlaybackSequence>& s)
                                              {
                                                  return s.get() == retired;
                                              }),
                              ownedSequences.end());
    }
}

//==============================================================================
void AudioEngine::queueMidi (const MidiEvent& event)
{
    midiInputQueue.push (event);
}

void AudioEngine::sendNoteOn (int trackIndex, int pitch, float velocity)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    queueMidi ({ trackIndex,
                 (juce::uint8) (0x90 | channel),
                 (juce::uint8) juce::jlimit (0, 127, pitch),
                 (juce::uint8) juce::jlimit (1, 127, juce::roundToInt (velocity * 127.0f)) });
}

void AudioEngine::sendNoteOff (int trackIndex, int pitch)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    queueMidi ({ trackIndex, (juce::uint8) (0x80 | channel),
                 (juce::uint8) juce::jlimit (0, 127, pitch), 0 });
}

void AudioEngine::sendController (int trackIndex, int controllerNumber, int value)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    queueMidi ({ trackIndex, (juce::uint8) (0xb0 | channel),
                 (juce::uint8) juce::jlimit (0, 127, controllerNumber),
                 (juce::uint8) juce::jlimit (0, 127, value) });
}

void AudioEngine::sendProgramChange (int trackIndex, int program)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    queueMidi ({ trackIndex, (juce::uint8) (0xc0 | channel),
                 (juce::uint8) juce::jlimit (0, 127, program), 0 });
}

void AudioEngine::sendPitchBend (int trackIndex, int value14)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    const auto value = juce::jlimit (0, 16383, value14);
    queueMidi ({ trackIndex, (juce::uint8) (0xe0 | channel),
                 (juce::uint8) (value & 0x7f),
                 (juce::uint8) ((value >> 7) & 0x7f) });
}

void AudioEngine::sendChannelPressure (int trackIndex, int pressure)
{
    if (! juce::isPositiveAndBelow (trackIndex, maxTracks))
        return;

    const auto channel = (juce::uint8) (nodes[(size_t) trackIndex].midiChannel.load() - 1);
    queueMidi ({ trackIndex, (juce::uint8) (0xd0 | channel),
                 (juce::uint8) juce::jlimit (0, 127, pressure), 0 });
}

void AudioEngine::allNotesOff()
{
    panicRequested.store (true);
}

//==============================================================================
void AudioEngine::audioDeviceAboutToStart (juce::AudioIODevice* device)
{
    const auto sampleRate = device != nullptr ? device->getCurrentSampleRate() : 44100.0;
    const auto blockSize = device != nullptr ? device->getCurrentBufferSizeSamples() : 512;

    currentSampleRate.store (sampleRate > 0.0 ? sampleRate : 44100.0);
    currentBlockSize.store (juce::jmax (16, blockSize));

    prepareNodes (currentSampleRate.load(), currentBlockSize.load());

    transport.prepare (currentSampleRate.load());
    mixer.prepare (currentSampleRate.load(), activeTrackCount.load(), currentBlockSize.load());
    remoteAudio.prepare (currentSampleRate.load(), currentBlockSize.load());
    sequencer.invalidateCursors();

    click = {};
    wasPlayingLastBlock = false;
    deviceRunning.store (true);
}

void AudioEngine::audioDeviceStopped()
{
    deviceRunning.store (false);
    mixer.clearLevels();
}

void AudioEngine::prepareNodes (double sampleRate, int blockSize)
{
    const auto size = juce::jmax (preallocatedBlockSize, blockSize);

    if (masterBuffer.getNumSamples() < size)
        masterBuffer.setSize (masterChannels, size, false, true, true);

    for (auto& node : nodes)
    {
        if (node.buffer.getNumSamples() < size)
            node.buffer.setSize (masterChannels, size, false, true, true);

        if (auto* instrument = node.instrument.load())
            instrument->prepare (sampleRate, blockSize);
    }
}

void AudioEngine::resetAllInstruments()
{
    for (auto& node : nodes)
        if (auto* instrument = node.instrument.load())
            instrument->reset();
}

//==============================================================================
void AudioEngine::audioDeviceIOCallbackWithContext (const float* const*,
                                                    int,
                                                    float* const* outputChannelData,
                                                    int numOutputChannels,
                                                    int numSamples,
                                                    const juce::AudioIODeviceCallbackContext&)
{
    const auto writeSilence = [outputChannelData, numOutputChannels, numSamples]
    {
        for (int channel = 0; channel < numOutputChannels; ++channel)
            if (outputChannelData[channel] != nullptr)
                juce::FloatVectorOperations::clear (outputChannelData[channel], numSamples);
    };

    if (numSamples <= 0 || numSamples > masterBuffer.getNumSamples())
    {
        writeSilence();
        return;
    }

    // Take delivery of anything the message thread published.  Both of these are
    // bounded, wait-free pops; the old sequence goes back for the message thread to free.
    PlaybackSequence* nextSequence = nullptr;

    while (incomingSequences.pop (nextSequence))
    {
        if (auto* previous = sequencer.getSequence())
            retiredSequences.push (const_cast<PlaybackSequence*> (previous));

        sequencer.setSequence (nextSequence);
    }

    const auto numTracks = juce::jmin (maxTracks, activeTrackCount.load());

    masterBuffer.clear (0, numSamples);

    for (int i = 0; i < numTracks; ++i)
        trackMidi[(size_t) i].clear();

    if (panicRequested.exchange (false))
    {
        resetAllInstruments();
        sequencer.invalidateCursors();
    }

    // Live input: piano roll previews and, later, a MIDI keyboard.
    MidiEvent event;

    while (midiInputQueue.pop (event))
        if (juce::isPositiveAndBelow (event.trackIndex, numTracks))
        {
            const auto status = (juce::uint8) (event.status & 0xf0);
            const auto message = (status == 0xc0 || status == 0xd0)
                                     ? juce::MidiMessage (event.status, event.data1)
                                     : juce::MidiMessage (event.status, event.data1, event.data2);
            trackMidi[(size_t) event.trackIndex].addEvent (message, 0);
        }

    Transport::Segment segments[Transport::maxSegmentsPerBlock];
    const auto numSegments = transport.prepareBlock (numSamples, segments);
    const auto playing = numSegments > 0;

    if (playing != wasPlayingLastBlock)
    {
        wasPlayingLastBlock = playing;

        if (! playing)
            resetAllInstruments();
    }

    if (playing)
    {
        const auto samplesPerTick = transport.getSamplesPerTick();

        for (int i = 0; i < numSegments; ++i)
        {
            if (segments[i].startsDiscontinuity)
                resetAllInstruments();

            sequencer.renderSegment (segments[i], samplesPerTick, trackMidi.data(), numTracks);
        }

        renderMetronome (segments, numSegments, masterBuffer, numSamples);
    }

    transport.finishBlock();

    // Track 0 is the master bus, so instruments start at 1.
    for (int i = 1; i < numTracks; ++i)
    {
        auto& node = nodes[(size_t) i];
        auto* instrument = node.instrument.load();

        if (instrument == nullptr || ! node.active.load())
            continue;

        auto& midi = trackMidi[(size_t) i];

        // A silent, event-free track costs nothing beyond this check.
        if (midi.isEmpty() && mixer.getChannelLevel (i) <= 0.0001f && ! playing)
            continue;

        juce::AudioBuffer<float> view (node.buffer.getArrayOfWritePointers(), masterChannels, 0, numSamples);
        view.clear();
        instrument->process (view, midi);
        mixer.mixChannel (i, view, masterBuffer, numSamples);
    }

    // Pre-master tap: the browser owns master FX and the master fader, so the
    // stream must leave here before the local master strip is applied.
    remoteAudio.pushPreMaster (masterBuffer, numSamples);
    mixer.processMaster (masterBuffer, numSamples);

    for (int channel = 0; channel < numOutputChannels; ++channel)
    {
        if (outputChannelData[channel] == nullptr)
            continue;

        if (channel < masterChannels)
            juce::FloatVectorOperations::copy (outputChannelData[channel],
                                              masterBuffer.getReadPointer (channel), numSamples);
        else
            juce::FloatVectorOperations::clear (outputChannelData[channel], numSamples);
    }
}

//==============================================================================
void AudioEngine::renderMetronome (const Transport::Segment* segments, int numSegments,
                                   juce::AudioBuffer<float>& master, int numSamples)
{
    if (metronomeEnabled.load())
    {
        const auto ticksPerBeat = (double) MusicalTime::ticksPerQuarterNote;
        const auto beatsPerBar = juce::jmax (1, timeSigNumerator.load());
        const auto samplesPerTick = transport.getSamplesPerTick();

        for (int i = 0; i < numSegments && click.samplesRemaining <= 0; ++i)
        {
            const auto& segment = segments[i];
            const auto firstBeat = (juce::int64) std::ceil (segment.startTick / ticksPerBeat);
            const auto lastBeat = (juce::int64) std::ceil (segment.endTick / ticksPerBeat);

            for (auto beat = firstBeat; beat < lastBeat; ++beat)
            {
                const auto offsetTicks = (double) beat * ticksPerBeat - segment.startTick;
                const auto downbeat = (beat % beatsPerBar) == 0;

                click.startOffset = juce::jlimit (0, numSamples - 1,
                                                  segment.startSample + (int) (offsetTicks * samplesPerTick));
                click.lengthSamples = (int) (getSampleRate() * 0.035);
                click.samplesRemaining = click.lengthSamples;
                click.phase = 0.0;
                click.phaseDelta = (downbeat ? 1600.0 : 1050.0) * juce::MathConstants<double>::twoPi / getSampleRate();
                click.level = downbeat ? 0.22f : 0.14f;
                break;
            }
        }
    }

    if (click.samplesRemaining <= 0)
        return;

    const auto numChannels = master.getNumChannels();

    for (int i = click.startOffset; i < numSamples && click.samplesRemaining > 0; ++i)
    {
        const auto envelope = (float) click.samplesRemaining / (float) juce::jmax (1, click.lengthSamples);
        const auto sample = (float) std::sin (click.phase) * click.level * envelope * envelope;

        for (int channel = 0; channel < numChannels; ++channel)
            master.addSample (channel, i, sample);

        click.phase += click.phaseDelta;
        --click.samplesRemaining;
    }

    click.startOffset = 0;
}
