#include "EngineAPI.h"
#include "WebMixerBridge.h"
#include "../Audio/SessionDiagnostics.h"
#include "../Audio/MOrchestra/MOrchestraEngine.h"
#include "../Model/ProjectFile.h"
#include "../Model/ProjectSchema.h"
#include "../Plugins/OrchestraSamplerModel.h"
#include <algorithm>
#include <cmath>
#include <functional>
#include <limits>
#include <memory>
#include <vector>

static_assert (InstrumentRegistry::maxHostedInstances == AudioEngine::maxTracks);

namespace
{
    const juce::Colour remoteTrackPalette[]
    {
        juce::Colour (0xff4a90d9), juce::Colour (0xffd98b4a), juce::Colour (0xff6dbf8a),
        juce::Colour (0xffc46bb3), juce::Colour (0xffd4c05a), juce::Colour (0xff5bb8c4)
    };

    juce::var toVar (const juce::String& s) { return juce::var (s); }

    juce::String colourToHex (juce::Colour colour)
    {
        return "#" + colour.toDisplayString (false).toLowerCase();
    }

    void fillSketchNotes (ClipData& clip)
    {
        static const int tones[] { 0, 4, 7, 12, 7, 4 };
        int step = 0;

        for (double beat = 0.0; beat < clip.lengthBeats - 0.05; beat += 1.0, ++step)
        {
            MidiNote note;
            note.pitch = 60 + tones[(size_t) (step % (int) std::size (tones))];
            note.startBeat = beat;
            note.lengthBeats = 0.9;
            note.velocity = 0.7f;
            clip.notes.push_back (note);
        }
    }

    constexpr double chordLengthBeats = 8.0;
    constexpr double demoLengthBeats = 64.0;

    struct DemoChord
    {
        const char* name;
        int tones[3];
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
        juce::uint32 colour;
        int basePitch;
        float volume;
        float pan;
        DemoRole role;
        int voice;
        double entryBeat;
        double exitBeat;
        const char* instrumentId;
        const char* techniqueId;
    };

    const DemoTrackSpec demoTracks[]
    {
        { "Violin I",   "Strings",    0xffd9a04a, 74, 0.80f, -0.55f, DemoRole::pad,        2,  0.0, 64.0, "m_orch_violin_1",  "m_orch_long" },
        { "Violin II",  "Strings",    0xffd18f45, 69, 0.78f, -0.30f, DemoRole::pad,        1,  0.0, 64.0, "m_orch_violin_2",  "m_orch_long" },
        { "Viola",      "Strings",    0xffc47f3f, 62, 0.76f,  0.18f, DemoRole::pad,        0,  0.0, 64.0, "m_orch_viola",     "m_orch_long" },
        { "Cello",      "Strings",    0xffb87038, 50, 0.78f,  0.42f, DemoRole::bass,       0,  8.0, 64.0, "m_orch_cello",     "m_orch_long" },
        { "Bass",       "Strings",    0xffa66232, 38, 0.74f,  0.60f, DemoRole::bass,       0,  8.0, 64.0, "m_orch_bass",      "m_orch_long" },
        { "Flute",      "Woodwinds",  0xff6dbf8a, 81, 0.68f, -0.22f, DemoRole::moving,     2, 16.0, 64.0, "m_orch_flute",     "m_orch_long" },
        { "Oboe",       "Woodwinds",  0xff5faf7d, 74, 0.66f, -0.08f, DemoRole::moving,     1, 16.0, 48.0, "m_orch_oboe",      "m_orch_long" },
        { "Clarinet",   "Woodwinds",  0xff53a071, 69, 0.68f,  0.08f, DemoRole::moving,     0, 24.0, 64.0, "m_orch_clarinet",  "m_orch_long" },
        { "Bassoon",    "Woodwinds",  0xff479065, 50, 0.66f,  0.22f, DemoRole::pad,        1, 32.0, 64.0, "m_orch_bassoon",   "m_orch_long" },
        { "Horn",       "Brass",      0xff4a90d9, 57, 0.70f, -0.35f, DemoRole::brass,      0, 32.0, 64.0, "m_orch_horn",      "m_orch_long" },
        { "Trumpet",    "Brass",      0xff4283c4, 69, 0.66f,  0.14f, DemoRole::brass,      2, 48.0, 64.0, "m_orch_trumpet",   "m_orch_long" },
        { "Trombone",   "Brass",      0xff3a76b0, 52, 0.68f,  0.30f, DemoRole::brass,      1, 48.0, 64.0, "m_orch_trombone",  "m_orch_long" },
        { "Tuba",       "Brass",      0xff33699c, 38, 0.66f,  0.45f, DemoRole::bass,       0, 48.0, 64.0, "m_orch_tuba",      "m_orch_long" },
        { "Timpani",    "Percussion", 0xffc46bb3, 38, 0.72f,  0.00f, DemoRole::percussion, 0,  0.0, 64.0, "m_orch_bass_drum", "m_orch_hit"  },
        { "Percussion", "Percussion", 0xffab5c9e, 60, 0.62f,  0.10f, DemoRole::percussion, 0, 32.0, 64.0, "m_orch_snare",     "m_orch_hit"  }
    };

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
                    appendNote (clip, nearestPitch (chord.tones[spec.voice % 3], spec.basePitch),
                                localStart, chordLengthBeats - 0.4, 0.62f + emphasis);
                    break;

                case DemoRole::bass:
                {
                    const auto pitch = nearestPitch (chord.bass, spec.basePitch);
                    appendNote (clip, pitch, localStart, chordLengthBeats * 0.5 - 0.2, 0.72f + emphasis);
                    appendNote (clip, pitch, localStart + chordLengthBeats * 0.5, chordLengthBeats * 0.5 - 0.3, 0.64f);
                    break;
                }

                case DemoRole::moving:
                {
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

    juce::var getProperty (const juce::var& message, const char* name)
    {
        return message.getProperty (name, juce::var());
    }

    juce::var getProperty (const juce::var& message, const char* a, const char* b)
    {
        auto value = getProperty (message, a);
        return value.isVoid() ? getProperty (message, b) : value;
    }

    double getDouble (const juce::var& message, const char* name, double fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (double) value;
    }

    int getInt (const juce::var& message, const char* name, int fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (int) value;
    }

    bool getBool (const juce::var& message, const char* name, bool fallback)
    {
        const auto value = message.getProperty (name, juce::var());
        return value.isVoid() ? fallback : (bool) value;
    }
}

//==============================================================================
EngineAPI::EngineAPI()
{
    sessionId = juce::Uuid().toDashedString();
    refreshPresetAvailability();
}

EngineAPI::~EngineAPI()
{
    alive->store (false);
    shutdown();
}

juce::String EngineAPI::initialise()
{
    const auto opened = engine.initialise();

    MOrchestra::Engine::get().initialise();

    for (const auto& warning : instruments.getResourceWarnings())
        juce::Logger::writeToLog ("Instrument catalogue: " + warning);

    syncTempo();
    syncMixer();
    invalidateSequence();
    setLoopRangeBeats (loopStartBeats, loopEndBeats);
    flushPendingUpdates();

    if (instruments.getStartupStatus().isNotEmpty())
        juce::Logger::writeToLog ("Instrument catalogue: " + instruments.getStartupStatus());

    juce::Logger::writeToLog (pluginHost.describeApprovedPlugins());
    pluginHost.precacheDescriptions();
    refreshPresetAvailability();

    int missingStates = 0;

    for (const auto& preset : instruments.getPresets())
        if (! preset.stateAvailable)
            ++missingStates;

    if (missingStates > 0)
        juce::Logger::writeToLog (juce::String (missingStates)
                                  + " factory state(s) not captured (Help > Capture Plugin State).");

    return opened ? juce::String() : engine.getLastError();
}

void EngineAPI::shutdown()
{
    cancelAllLoads();
    engine.shutdown();
    MOrchestra::Engine::get().shutdown();
}

//==============================================================================
void EngineAPI::play()
{
    ensureAssignedInstrumentsLoaded (true);
    flushPendingUpdates();
    engine.start();
}

void EngineAPI::pause()
{
    engine.pause();
}

void EngineAPI::stop()
{
    engine.stop();
}

void EngineAPI::seekToBeats (double beats)
{
    engine.setPositionBeats (juce::jmax (0.0, beats));
}

void EngineAPI::setLooping (bool shouldLoop)
{
    engine.setLooping (shouldLoop);
}

void EngineAPI::setLoopRangeBeats (double startBeats, double endBeats)
{
    loopStartBeats = juce::jmax (0.0, startBeats);
    loopEndBeats = juce::jmax (loopStartBeats + 0.25, endBeats);
    engine.setLoopRangeBeats (loopStartBeats, loopEndBeats);
}

void EngineAPI::setMetronomeEnabled (bool enabled)
{
    engine.setMetronomeEnabled (enabled);
}

//==============================================================================
void EngineAPI::syncTempo()      { tempoDirty = true; }
void EngineAPI::syncMixer()      { mixerDirty = true; }

/*  Mirrors the browser's per-track and master insert chains into native X-series
    slots. The `remote` lane is deliberately skipped: it is the already summed tap
    that the browser owns, so running it here would double-process the mix.
*/
void EngineAPI::applyWebMixerInserts (const juce::var& webMixer)
{
    auto& mixer = engine.getMixer();

    const auto pushLane = [&] (int channelIndex, const juce::var& lane)
    {
        const auto inserts = lane.getProperty ("inserts", juce::var());
        auto* array = inserts.getArray();

        for (int slot = 0; slot < MixerEngine::insertSlots; ++slot)
        {
            const auto item = (array != nullptr && slot < array->size()) ? array->getReference (slot)
                                                                        : juce::var();
            auto* object = item.getDynamicObject();

            if (object == nullptr)
            {
                WebMixerBridge::clearSlot (mixer, channelIndex, slot);
                continue;
            }

            const auto bypassed = object->getProperty ("enabled").isBool()
                                  && ! (bool) object->getProperty ("enabled");

            if (bypassed || (bool) object->getProperty ("bypassed"))
            {
                WebMixerBridge::clearSlot (mixer, channelIndex, slot);
                continue;
            }

            auto pluginId = object->getProperty ("pluginId").toString();

            if (pluginId.isEmpty())
                pluginId = object->getProperty ("type").toString();
            if (pluginId.isEmpty())
                pluginId = object->getProperty ("name").toString();

            auto state = object->getProperty ("state");

            if (state.getDynamicObject() == nullptr)
                state = object->getProperty ("parameters");

            WebMixerBridge::applyInsertState (mixer, channelIndex, slot, pluginId, state);
        }
    };

    auto* root = webMixer.getDynamicObject();

    if (root == nullptr)
        return;

    pushLane (0, root->getProperty ("master"));

    const auto tracks = root->getProperty ("tracks");

    if (auto* trackObject = tracks.getDynamicObject())
    {
        for (const auto& property : trackObject->getProperties())
        {
            const auto trackId = property.name.toString().getIntValue();
            const auto index = project.indexOfTrack ((TrackId) trackId);

            if (index <= 0)
                continue;

            pushLane (index, property.value);
        }
    }
}
void EngineAPI::invalidateSequence() { sequenceDirty = true; }

bool EngineAPI::flushPendingUpdates()
{
    const auto syncedMixer = tempoDirty || mixerDirty;

    if (syncedMixer)
    {
        // syncMixerFromProject also carries tempo and time signature, so one call covers
        // both flags.
        engine.syncMixerFromProject (project);
        tempoDirty = false;
        mixerDirty = false;
    }

    if (sequenceDirty)
    {
        engine.rebuildSequence (project);
        sequenceDirty = false;
    }

    if (engine.consumeReachedEnd() && engine.isPlaying())
    {
        pause();
        notify (transportChanged);
    }

    return syncedMixer;
}

//==============================================================================
juce::uint64 EngineAPI::noteOffKey (int trackIndex, int pitch) noexcept
{
    return ((juce::uint64) (juce::uint32) trackIndex << 32) | (juce::uint32) (pitch & 0x7f);
}

void EngineAPI::cancelScheduledNoteOff (int trackIndex, int pitch)
{
    scheduledNoteOffs.erase (noteOffKey (trackIndex, pitch));
}

void EngineAPI::flushScheduledNoteOffs (int trackIndex, bool sendNow)
{
    for (auto it = scheduledNoteOffs.begin(); it != scheduledNoteOffs.end();)
    {
        const auto scheduledTrack = (int) (it->first >> 32);
        const auto pitch = (int) (it->first & 0x7fu);

        if (trackIndex >= 0 && scheduledTrack != trackIndex)
        {
            ++it;
            continue;
        }

        if (sendNow)
            engine.sendNoteOff (scheduledTrack, pitch);

        it = scheduledNoteOffs.erase (it);
    }
}

void EngineAPI::previewNoteOn (int trackIndex, int pitch, float velocity)
{
    if (engine.getTrackInstrument (trackIndex) == nullptr)
    {
        ensureTrackInstrumentLoaded (trackIndex, true);
        logSection ("Audio", "instrument not ready, loading asynchronously");
        return;
    }

    if (scheduledNoteOffs.find (noteOffKey (trackIndex, pitch)) != scheduledNoteOffs.end())
    {
        cancelScheduledNoteOff (trackIndex, pitch);
        engine.sendNoteOff (trackIndex, pitch);
    }

    logSection ("Audio", "MIDI note received pitch=" + juce::String (pitch)
                            + " vel=" + juce::String (juce::roundToInt (velocity * 127.0f)));
    engine.sendNoteOn (trackIndex, pitch, velocity);
}

void EngineAPI::previewNoteOff (int trackIndex, int pitch)
{
    const auto* track = project.getTrack (trackIndex);

    if (track != nullptr && SoftwareLegato::isActive (*track))
    {
        const auto key = noteOffKey (trackIndex, pitch);
        const auto generation = ++noteOffGeneration;
        scheduledNoteOffs[key] = generation;
        const auto delayMs = SoftwareLegato::extraMilliseconds (project.getBpm());
        const auto keepAlive = alive;

        juce::Timer::callAfterDelay (delayMs, [this, keepAlive, trackIndex, pitch, generation, key]
        {
            if (! keepAlive->load())
                return;

            const auto it = scheduledNoteOffs.find (key);

            if (it != scheduledNoteOffs.end() && it->second == generation)
            {
                scheduledNoteOffs.erase (it);
                engine.sendNoteOff (trackIndex, pitch);
            }
        });
        return;
    }

    cancelScheduledNoteOff (trackIndex, pitch);
    engine.sendNoteOff (trackIndex, pitch);
}

void EngineAPI::allNotesOff()
{
    flushScheduledNoteOffs (-1, true);
    engine.allNotesOff();
}

//==============================================================================
void EngineAPI::applyTrackDefinitionFields (TrackData& track, const InstrumentDefinition& definition)
{
    track.pluginState.reset();

    track.instrumentDefinitionId = definition.id;
    track.presetId = instruments.resolvePresetId (definition, definition.techniques.isEmpty()
                                                              ? juce::String()
                                                              : definition.techniques[0]);
    track.instrument = definition.displayName;
    track.instrumentSlot.instrumentId = definition.sourcePlugin;
    track.instrumentSlot.name = instruments.getDisplayName (definition.sourcePlugin);
    track.instrumentSource = definition.sourcePlugin == InstrumentRegistry::mOrchestraId
        ? juce::String (ProjectSchema::sourceMOrchestra)
        : juce::String (ProjectSchema::sourceRemoteVst);
    track.section = definition.category;
    track.defaultVelocity = definition.defaultVelocity;
    track.controllerValues.clear();
    track.techniqueId.clear();
    track.legatoEnabled = false;

    if (definition.defaultMidiChannel > 0)
        track.midiChannel = definition.defaultMidiChannel;

    for (const auto& controllerId : definition.controllers)
        if (const auto* controller = instruments.findController (controllerId))
            track.controllerValues[controllerId] = controller->max > controller->min
                ? (float) (controller->defaultValue - controller->min) / (float) (controller->max - controller->min)
                : 0.0f;

    if (! definition.techniques.isEmpty())
        track.techniqueId = definition.techniques[0];
}

void EngineAPI::sanitizeTrackInstrumentFields (TrackData& track)
{
    if (track.instrumentDefinitionId.isEmpty())
        return;

    const auto* definition = instruments.findDefinition (track.instrumentDefinitionId);

    if (definition == nullptr)
        return;

    const auto techniqueAllowed = track.techniqueId.isEmpty()
                                      || definition->techniques.contains (track.techniqueId);
    const auto presetKnown = track.presetId.isEmpty()
                                 || instruments.findPreset (track.presetId) != nullptr;

    if (techniqueAllowed && presetKnown)
    {
        if (track.presetId.isEmpty() && ! definition->techniques.isEmpty())
            track.presetId = instruments.resolvePresetId (*definition, track.techniqueId);

        return;
    }

    track.techniqueId = definition->techniques.isEmpty() ? juce::String() : definition->techniques[0];
    track.presetId = instruments.resolvePresetId (*definition, track.techniqueId);
    track.pluginState.reset();
    track.usesFactoryState = true;
    track.legatoEnabled = false;
}

void EngineAPI::evictHostedIfNeeded (int keepTrackIndex)
{
    struct Hosted
    {
        int index = 0;
        juce::int64 lastUsed = 0;
    };

    std::vector<Hosted> hosted;

    for (int i = 1; i < project.getNumTracks(); ++i)
    {
        const auto* instance = engine.getTrackInstrument (i);

        if (instance == nullptr || ! instance->isExternalPlugin())
            continue;

        hosted.push_back ({ i, project.getTrack (i) != nullptr ? project.getTrack (i)->instrumentLastUsedMs : 0 });
    }

    const bool keepAlreadyHosted = std::any_of (hosted.begin(), hosted.end(),
                                                [keepTrackIndex] (const Hosted& h) { return h.index == keepTrackIndex; });

    const int needed = keepAlreadyHosted ? 0 : 1;

    while ((int) hosted.size() + needed > InstrumentRegistry::maxHostedInstances)
    {
        int evict = -1;
        juce::int64 oldest = std::numeric_limits<juce::int64>::max();

        for (const auto& slot : hosted)
        {
            if (slot.index == keepTrackIndex)
                continue;

            if (slot.lastUsed <= oldest)
            {
                oldest = slot.lastUsed;
                evict = slot.index;
            }
        }

        if (evict < 0)
            break;

        logSection ("Instrument", "evicting track " + juce::String (evict)
                                    + " to stay within "
                                    + juce::String (InstrumentRegistry::maxHostedInstances)
                                    + " hosted instances");
        unloadTrackInstrument (evict, "Unloaded to free memory.");
        hosted.erase (std::remove_if (hosted.begin(), hosted.end(),
                                      [evict] (const Hosted& h) { return h.index == evict; }),
                      hosted.end());
    }
}

void EngineAPI::unloadTrackInstrument (int trackIndex, const juce::String& reason)
{
    auto* track = project.getTrack (trackIndex);

    if (track == nullptr)
        return;

    cancelTrackLoad (trackIndex);

    if (auto* instance = engine.getTrackInstrument (trackIndex))
        track->pluginState = instance->saveState();

    engine.clearTrackInstrument (trackIndex);
    collectUnusedInstrumentsLater();

    if (reason.containsIgnoreCase ("free memory")
        && (track->instrumentLoadState == InstrumentLoadState::Loaded
            || track->instrumentLoadState == InstrumentLoadState::Active))
    {
        track->instrumentLoadState = InstrumentLoadState::Loaded;
        track->instrumentLoadMessage = "Ready (inactive)";
        track->usesFactoryState = false;
    }
    else
    {
        track->instrumentLoadState = InstrumentLoadState::Unloaded;
        track->instrumentLoadMessage = reason.isNotEmpty() ? reason : juce::String ("Unloaded.");
    }

    notify (tracksChanged);
}

void EngineAPI::flushRetiredInstruments()
{
    engine.collectUnusedInstruments();
}

void EngineAPI::clearAllHostedInstruments()
{
    cancelAllLoads();
    engine.allNotesOff();

    const bool wasAttached = engine.isAudioCallbackAttached();

    if (wasAttached)
        engine.detachAudioCallback();

    for (int i = 1; i < project.getNumTracks(); ++i)
        engine.clearTrackInstrument (i);

    engine.collectUnusedInstruments();

    if (wasAttached)
        engine.attachAudioCallback();
}

void EngineAPI::loadTrackInstrument (int trackIndex, const juce::String& definitionId, bool async)
{
    InstrumentLoadOptions options;
    options.async = async;
    loadTrackInstrument (trackIndex, definitionId, options);
}

juce::var EngineAPI::insertTrackPlugin (int trackIndex, const juce::String& pluginId)
{
    auto* track = project.getTrack (trackIndex);

    if (track == nullptr || track->isMaster())
        return makeError ("Unknown trackId");

    if (pluginId == InstrumentRegistry::orchestraSamplerPluginId)
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("pluginId", pluginId);
        object->setProperty ("needsPatch", true);
        return makeOk (object);
    }

    juce::String definitionId;

    if (pluginId == InstrumentRegistry::mOrchestraId)
        definitionId = InstrumentRegistry::mOrchestraDefaultId;
    else if (pluginId == InstrumentRegistry::testSynthId)
        definitionId = InstrumentRegistry::testSynthId;
    else if (instruments.findDefinition (pluginId) != nullptr)
        definitionId = pluginId;
    else
        return makeError ("Unknown plugin: " + pluginId);

    loadTrackInstrument (trackIndex, definitionId, false);
    notify (tracksChanged | mixerChanged);

    auto reply = instrumentStatusReply (trackIndex);

    if (auto* object = reply.getDynamicObject())
    {
        object->setProperty ("pluginId", pluginId);
        object->setProperty ("needsPatch", false);
        object->setProperty ("definitionId", definitionId);
    }

    return reply;
}

void EngineAPI::loadTrackInstrument (int trackIndex, const juce::String& definitionId, const InstrumentLoadOptions& options)
{
    auto* track = project.getTrack (trackIndex);

    if (track == nullptr || track->isMaster())
        return;

    const auto* definition = instruments.findDefinition (definitionId);

    if (definition == nullptr)
    {
        track->instrumentLoadState = InstrumentLoadState::Error;
        track->instrumentLoadMessage = "Unknown instrument: " + definitionId;
        notify (tracksChanged);
        return;
    }

    if (options.applyDefinitionFields)
        applyTrackDefinitionFields (*track, *definition);
    else
        sanitizeTrackInstrumentFields (*track);

    const auto* plugin = instruments.find (definition->sourcePlugin);

    if (plugin != nullptr && plugin->isBuiltIn()
        && definition->sourcePlugin == InstrumentRegistry::mOrchestraId)
    {
        MOrchestra::Engine::get().initialise();

        if (! MOrchestra::Engine::get().isAvailable())
        {
            track->instrumentLoadState = InstrumentLoadState::Unavailable;
            track->instrumentLoadMessage = "M Orchestra sample library was not found.";
            notify (tracksChanged);
            return;
        }
    }

    if (plugin != nullptr && ! plugin->isBuiltIn())
    {
        if (! plugin->isAvailable())
        {
            track->instrumentLoadState = InstrumentLoadState::Unavailable;
            track->instrumentLoadMessage = definition->displayName + " is unavailable.";
            notify (tracksChanged);
            return;
        }

        if (const auto* library = instruments.findLibrary (definition->sourceLibrary))
        {
            if (! library->available)
            {
                track->instrumentLoadState = InstrumentLoadState::Unavailable;
                track->instrumentLoadMessage = definition->displayName + " is unavailable.";
                notify (tracksChanged);
                return;
            }
        }
    }

    if (plugin != nullptr && ! plugin->isBuiltIn() && options.requireCapturedState)
    {
        const bool hasProjectState = ! track->pluginState.isEmpty();
        const bool hasFactory = hasRestorableFactoryState (*track);

        if (! hasProjectState && ! hasFactory)
        {
            failInstrumentLoad (trackIndex, InstrumentLoadState::Unavailable,
                                definition->displayName + " is unavailable.");
            return;
        }
    }

    track->instrumentLoadState = InstrumentLoadState::Loading;
    track->instrumentLoadMessage = "Loading " + definition->displayName + "...";
    track->instrumentLastUsedMs = juce::Time::currentTimeMillis();
    notify (tracksChanged);

    const auto generation = beginTrackLoad (trackIndex);

    if (options.async)
    {
        juce::MessageManager::callAsync ([this, trackIndex, definitionId, generation, requireCapturedState = options.requireCapturedState]
        {
            completeInstrumentLoad (trackIndex, definitionId, generation, requireCapturedState, true);
        });
    }
    else
    {
        completeInstrumentLoad (trackIndex, definitionId, generation, options.requireCapturedState, false);
    }
}

void EngineAPI::refreshPresetAvailability()
{
    for (const auto& preset : instruments.getPresets())
        if (auto* mutablePreset = instruments.findPresetMutable (preset.id))
        {
            juce::MemoryBlock state;
            const auto loaded = stateStore.hasState (preset) && stateStore.loadState (preset, state)
                                && stateStore.isTrustedFactoryState (preset, state);
            mutablePreset->stateAvailable = loaded;

            if (mutablePreset->stateAvailable)
            {
                StateMetadata metadata;

                if (! stateStore.loadMetadata (*mutablePreset, metadata))
                {
                    stateStore.saveMetadata (*mutablePreset, stateStore.makeMetadata (*mutablePreset, state));
                }
                else if (mutablePreset->checksum.isEmpty())
                {
                    mutablePreset->checksum = metadata.checksum;
                    mutablePreset->pluginVersion = metadata.pluginVersion;
                    mutablePreset->stateVersion = metadata.stateVersion;
                }
            }
        }
}

void EngineAPI::finishReady (TrackData& track, const juce::StringArray& notes)
{
    track.instrumentLoadState = InstrumentLoadState::Loaded;
    track.instrumentLoadMessage = notes.isEmpty() ? juce::String ("Ready")
                                                  : notes.joinIntoString (" ");
    logSection ("Instrument", track.instrument + " READY hosted="
                                + juce::String (countHostedInstances()));
    notify (tracksChanged);
}

bool EngineAPI::restorePresetToInstance (PluginInstance& instance, TrackData& track, juce::StringArray& notes,
                                         bool requireCapturedState)
{
    const auto* definition = instruments.findDefinition (track.instrumentDefinitionId);
    const auto displayName = definition != nullptr ? definition->displayName : track.instrument;
    const auto* plugin = definition != nullptr ? instruments.find (definition->sourcePlugin) : nullptr;

    logSection ("Instrument", "id=" + (definition != nullptr ? definition->id : track.instrumentDefinitionId)
                                + " preset=" + track.presetId);
    logSection ("Plugin", plugin != nullptr ? plugin->displayName : instance.getDisplayName());

    if (instance.isExternalPlugin() && plugin != nullptr && instance.getInstrumentId() != plugin->instrumentId
        && instance.getInstrumentId() != track.instrumentSlot.instrumentId)
    {
        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                            displayName + " could not be restored.");
        notes.add ("Plugin identifier mismatch.");
        return false;
    }

    track.instrumentLoadState = InstrumentLoadState::RestoringState;
    track.instrumentLoadMessage = "Restoring...";
    notify (tracksChanged);

    juce::MemoryBlock state;
    const PresetDefinition* preset = track.presetId.isNotEmpty() ? instruments.findPreset (track.presetId)
                                                                 : nullptr;
    bool usedProjectState = false;

    if (! track.pluginState.isEmpty() && ! track.usesFactoryState)
    {
        usedProjectState = true;
        state = track.pluginState;
        logSection ("State", "using project instance state (" + juce::String ((int) state.getSize()) + " bytes)");
    }
    else if (preset != nullptr)
    {
        logSection ("State", "restoring factory " + preset->id);

        if (! stateStore.hasState (*preset) || ! stateStore.loadState (*preset, state))
        {
            if (! requireCapturedState)
                return true;

            const auto message = displayName + " is unavailable.";
            failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Unavailable, message);
            notes.add (message);
            return false;
        }

        juce::String integrityError;

        if (! stateStore.verifyIntegrity (*preset, state, integrityError))
        {
            failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                                displayName + " could not be restored.");
            notes.add (integrityError);
            return false;
        }

        if (! stateStore.isTrustedFactoryState (*preset, state))
        {
            failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Unavailable,
                                displayName + " is unavailable.");
            notes.add ("Factory state is the plugin default, not a captured instrument.");
            logSection ("State", "rejected default dump for " + preset->id);
            return false;
        }
    }
    else if (track.presetId.isNotEmpty())
    {
        if (! requireCapturedState)
            return true;

        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                            displayName + " could not be restored.");
        notes.add ("Unknown preset: " + track.presetId);
        return false;
    }
    else if (! instance.isExternalPlugin() || ! requireCapturedState)
    {
        return true;
    }
    else
    {
        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Unavailable,
                            displayName + " is unavailable.");
        notes.add ("No preset state is associated.");
        return false;
    }

    if (pluginStateMatchesDifferentFactory (track, state))
    {
        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                            displayName + " could not be restored.");
        notes.add ("Captured state matches a different factory instrument.");
        logSection ("State", "rejected: blob matches another factory preset");
        return false;
    }

    if (preset != nullptr && instance.getInstrumentId() != preset->pluginId)
    {
        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                            displayName + " could not be restored.");
        notes.add ("Plugin does not match preset " + preset->id);
        return false;
    }

    logSection ("State", "restoring...");

    if (! instance.restoreState (state))
    {
        failInstrumentLoad (project.indexOfTrack (track.id), InstrumentLoadState::Error,
                            displayName + " could not be restored.");
        logSection ("State", "restore failed");
        return false;
    }

    if (preset != nullptr)
    {
        StateMetadata metadata;

        if (stateStore.loadMetadata (*preset, metadata)
            && metadata.pluginVersion.isNotEmpty()
            && instance.getPluginVersion().isNotEmpty()
            && metadata.pluginVersion != instance.getPluginVersion())
        {
            notes.add ("Warning: captured plugin version " + metadata.pluginVersion
                       + " differs from " + instance.getPluginVersion() + ".");
            logSection ("State", notes[notes.size() - 1]);
        }
    }

    logSection ("State", usedProjectState ? "project state restored successfully"
                                          : "factory state restored successfully");
    notes.add ("State restored.");
    return true;
}

void EngineAPI::markReadyWhenSettled (int trackIndex, const juce::String& definitionId, int generation,
                                      const juce::StringArray& notes, int delayMs)
{
    const auto finish = [this, trackIndex, definitionId, generation, notes]
    {
        if (! isCurrentLoad (trackIndex, generation))
            return;

        auto* track = project.getTrack (trackIndex);

        if (track == nullptr || track->instrumentDefinitionId != definitionId)
            return;

        if (track->instrumentLoadState == InstrumentLoadState::Error
            || track->instrumentLoadState == InstrumentLoadState::Unavailable)
            return;

        finishReady (*track, notes);
    };

    if (delayMs <= 0)
        finish();
    else
        juce::Timer::callAfterDelay (delayMs, finish);
}

void EngineAPI::completeInstrumentLoad (int trackIndex, const juce::String& definitionId, int generation,
                                        bool requireCapturedState, bool deferReady)
{
    if (! isCurrentLoad (trackIndex, generation))
        return;

    auto* track = project.getTrack (trackIndex);
    const auto* definition = instruments.findDefinition (definitionId);

    if (track == nullptr || definition == nullptr || track->instrumentDefinitionId != definitionId)
        return;

    evictHostedIfNeeded (trackIndex);

    PluginInstance* existing = nullptr;

    if (auto* instance = engine.getTrackInstrument (trackIndex))
    {
        if (instance->getInstrumentId() == definition->sourcePlugin)
        {
            existing = instance;
        }
        else
        {
            engine.clearTrackInstrument (trackIndex);
            collectUnusedInstrumentsLater();
        }
    }

    if (existing != nullptr)
    {
        finishInstrumentLoad (trackIndex, definitionId, generation, {}, existing, requireCapturedState, deferReady);
        return;
    }

    track->instrumentLoadState = InstrumentLoadState::Initializing;
    track->instrumentLoadMessage = "Initializing...";
    notify (tracksChanged);

    const auto pluginId = definition->sourcePlugin;
    const auto displayName = definition->displayName;

    if (deferReady)
    {
        juce::MessageManager::callAsync (
            [this, pluginId, trackIndex, definitionId, generation, requireCapturedState, deferReady, displayName]
            {
                if (! alive->load() || ! isCurrentLoad (trackIndex, generation))
                    return;

                pluginHost.createInstanceAsync (pluginId, engine.getSampleRate(), engine.getBlockSize(),
                    [this, trackIndex, definitionId, generation, requireCapturedState, deferReady, displayName]
                    (std::unique_ptr<PluginInstance> created, const juce::String& error)
                    {
                        if (! alive->load() || ! isCurrentLoad (trackIndex, generation))
                            return;

                        auto* loadedTrack = project.getTrack (trackIndex);

                        if (loadedTrack == nullptr || loadedTrack->instrumentDefinitionId != definitionId)
                            return;

                        if (created == nullptr)
                        {
                            loadedTrack->instrumentLoadState = InstrumentLoadState::Error;
                            loadedTrack->instrumentLoadMessage = error.isNotEmpty() ? error
                                                                                   : displayName + " failed to load.";
                            notify (tracksChanged);
                            return;
                        }

                        finishInstrumentLoad (trackIndex, definitionId, generation, std::move (created),
                                              nullptr, requireCapturedState, deferReady);
                    });
            });
        return;
    }

    juce::String error;
    auto created = pluginHost.createInstance (pluginId, engine.getSampleRate(), engine.getBlockSize(), error);

    if (! isCurrentLoad (trackIndex, generation) || track->instrumentDefinitionId != definitionId)
        return;

    if (created == nullptr)
    {
        track->instrumentLoadState = InstrumentLoadState::Error;
        track->instrumentLoadMessage = error.isNotEmpty() ? error
                                                          : displayName + " failed to load.";
        notify (tracksChanged);
        return;
    }

    finishInstrumentLoad (trackIndex, definitionId, generation, std::move (created),
                          nullptr, requireCapturedState, deferReady);
}

void EngineAPI::finishInstrumentLoad (int trackIndex, const juce::String& definitionId, int generation,
                                      std::unique_ptr<PluginInstance> created, PluginInstance* existing,
                                      bool requireCapturedState, bool deferReady)
{
    if (! isCurrentLoad (trackIndex, generation))
        return;

    auto* track = project.getTrack (trackIndex);
    const auto* definition = instruments.findDefinition (definitionId);

    if (track == nullptr || definition == nullptr || track->instrumentDefinitionId != definitionId)
        return;

    auto* target = existing != nullptr ? existing : created.get();

    if (target == nullptr)
        return;

    juce::StringArray notes;

    if (target->isExternalPlugin())
    {
        if (! restorePresetToInstance (*target, *track, notes, requireCapturedState))
        {
            failInstrumentLoad (trackIndex, InstrumentLoadState::Error,
                                track->instrumentLoadMessage.isNotEmpty()
                                    ? track->instrumentLoadMessage
                                    : definition->displayName + " could not be restored.");
            return;
        }
    }

    if (created != nullptr)
    {
        engine.setTrackInstrument (trackIndex, std::move (created));
        syncMixer();
        flushPendingUpdates();
    }

    if (auto* loaded = engine.getTrackInstrument (trackIndex))
        loaded->setInstrumentDefinitionId (definitionId);

    const auto usedDedicatedState = instruments.resolvePresetId (*definition, track->techniqueId).isNotEmpty();

    if (! usedDedicatedState)
        if (const auto* technique = instruments.findTechnique (track->techniqueId))
            applyTechniqueAction (trackIndex, *technique);

    for (const auto& [id, value] : track->controllerValues)
        if (const auto* controller = instruments.findController (id))
            applyControllerDefinition (trackIndex, *controller, value);

    const auto settleMs = target->isExternalPlugin()
        ? (definition->sourcePlugin == InstrumentRegistry::synchronPlayerId ? 1200 : 250)
        : 0;

    if (deferReady)
        markReadyWhenSettled (trackIndex, definitionId, generation, notes, settleMs);
    else
    {
        if (settleMs > 0)
            pumpUi (settleMs);

        markReadyWhenSettled (trackIndex, definitionId, generation, notes, 0);
    }
}

bool EngineAPI::applyTechniqueAction (int trackIndex, const TechniqueDefinition& technique)
{
    const auto& action = technique.action;

    if (! action.mapped || action.type == TechniqueActionType::None)
        return false;

    switch (action.type)
    {
        case TechniqueActionType::KeySwitch:
            engine.sendNoteOn (trackIndex, action.midiNote, (float) action.velocity / 127.0f);
            engine.sendNoteOff (trackIndex, action.midiNote);
            return true;

        case TechniqueActionType::MidiCC:
            engine.sendController (trackIndex, action.midiCC, action.value);
            return true;

        case TechniqueActionType::ProgramChange:
            engine.sendProgramChange (trackIndex, action.program);
            return true;

        case TechniqueActionType::DimensionController:
            engine.sendController (trackIndex, action.midiCC, action.value);
            return true;

        case TechniqueActionType::PresetChange:
            if (auto* instance = engine.getTrackInstrument (trackIndex))
                return instance->applyProgram (action.presetName);
            return false;

        case TechniqueActionType::None:
            break;
    }

    return false;
}

bool EngineAPI::setTrackTechnique (int trackIndex, const juce::String& techniqueId)
{
    auto* track = project.getTrack (trackIndex);
    const auto* technique = instruments.findTechnique (techniqueId);
    const auto* definition = track != nullptr ? instruments.findDefinition (track->instrumentDefinitionId)
                                              : nullptr;

    if (track == nullptr || technique == nullptr || definition == nullptr)
        return false;

    if (! definition->techniques.contains (techniqueId))
        return false;

    flushScheduledNoteOffs (trackIndex, true);
    track->techniqueId = techniqueId;
    track->instrumentLastUsedMs = juce::Time::currentTimeMillis();

    const auto nextPreset = definition != nullptr ? instruments.resolvePresetId (*definition, techniqueId)
                                                  : juce::String();

    if (nextPreset.isNotEmpty())
    {
        if (nextPreset != track->presetId)
        {
            track->presetId = nextPreset;
            track->pluginState.reset();
            track->usesFactoryState = true;

            if (auto* instance = engine.getTrackInstrument (trackIndex))
            {
                juce::StringArray notes;

                if (! restorePresetToInstance (*instance, *track, notes, true))
                {
                    failInstrumentLoad (trackIndex, InstrumentLoadState::Error,
                                        definition != nullptr
                                            ? definition->displayName + " could not be restored."
                                            : juce::String ("Technique state could not be restored."));
                    return false;
                }

                finishReady (*track, notes);
                return true;
            }
        }

        notify (tracksChanged);
        return true;
    }

    if (! technique->action.mapped)
    {
        track->instrumentLoadMessage = technique->displayName + " is not mapped.";
        notify (tracksChanged);
        return false;
    }

    const auto ok = applyTechniqueAction (trackIndex, *technique);
    track->instrumentLoadMessage = ok ? technique->displayName
                                      : technique->displayName + " could not be applied.";
    notify (tracksChanged);
    return ok;
}

bool EngineAPI::capturePresetState (const juce::String& presetId)
{
    auto* preset = instruments.findPresetMutable (presetId);

    if (preset == nullptr)
        return false;

    for (int i = 1; i < project.getNumTracks(); ++i)
        if (auto* instance = engine.getTrackInstrument (i))
            if (instance->getInstrumentId() == preset->pluginId)
            {
                const auto state = instance->saveState();

                for (const auto& other : instruments.getPresets())
                {
                    if (other.id == preset->id)
                        continue;

                    juce::MemoryBlock existing;

                    if (stateStore.loadState (other, existing) && stateStore.statesEqual (existing, state))
                    {
                        logSection ("State", "refused capture of " + preset->id
                                                + " because the blob matches " + other.id);
                        return false;
                    }
                }

                if (! stateStore.isTrustedFactoryState (*preset, state))
                {
                    logSection ("State", "refused capture of " + preset->id
                                            + " because the blob is the plugin default, not a named instrument");
                    return false;
                }

                if (! stateStore.saveState (*preset, state, instance->getPluginVersion()))
                    return false;

                preset->stateAvailable = true;
                preset->checksum = stateStore.hashState (state);
                preset->pluginVersion = instance->getPluginVersion();
                stateStore.writeDump (preset->id, state);
                logSection ("State", "captured " + preset->id
                                        + " bytes=" + juce::String ((int) state.getSize())
                                        + " file=" + stateStore.resolveStateFile (*preset).getFullPathName());
                return true;
            }

    return false;
}

bool EngineAPI::preparePluginForCapture (int trackIndex, const juce::String& pluginId,
                                         std::function<void (bool)> onComplete)
{
    auto* track = project.getTrack (trackIndex);
    const auto* plugin = instruments.find (pluginId);

    if (track == nullptr || track->isMaster() || plugin == nullptr || plugin->isBuiltIn())
    {
        if (onComplete != nullptr)
            onComplete (false);

        return false;
    }

    if (! plugin->isAvailable())
    {
        track->instrumentLoadState = InstrumentLoadState::Unavailable;
        track->instrumentLoadMessage = plugin->displayName + " is unavailable.";
        notify (tracksChanged);

        if (onComplete != nullptr)
            onComplete (false);

        return false;
    }

    evictHostedIfNeeded (trackIndex);
    engine.clearTrackInstrument (trackIndex);

    track->pluginState.reset();
    track->presetId.clear();
    track->instrumentSlot.instrumentId = pluginId;
    track->instrumentSlot.name = plugin->displayName;
    track->instrumentLoadState = InstrumentLoadState::Initializing;
    track->instrumentLoadMessage = "Initializing capture instance...";
    notify (tracksChanged);
    logSection ("Plugin", "prepare capture " + plugin->displayName);

    const auto finish = [this, trackIndex, pluginName = plugin->displayName, onComplete]
        (std::unique_ptr<PluginInstance> created, const juce::String& error)
    {
        auto* loadedTrack = project.getTrack (trackIndex);

        if (loadedTrack == nullptr)
        {
            if (onComplete != nullptr)
                onComplete (false);

            return;
        }

        if (created == nullptr)
        {
            loadedTrack->instrumentLoadState = InstrumentLoadState::Error;
            loadedTrack->instrumentLoadMessage = error.isNotEmpty() ? error
                                                                    : pluginName + " failed to load.";
            notify (tracksChanged);

            if (onComplete != nullptr)
                onComplete (false);

            return;
        }

        logSection ("Plugin", "preparing " + pluginName + " (audio callback detached)");
        engine.setTrackInstrument (trackIndex, std::move (created));
        syncMixer();
        flushPendingUpdates();
        loadedTrack->instrumentLoadState = InstrumentLoadState::Loaded;
        loadedTrack->instrumentLoadMessage = "Plugin ready for capture.";
        logSection ("Plugin", pluginName + " ready for capture");
        notify (tracksChanged);

        if (onComplete != nullptr)
            onComplete (true);
    };

    if (onComplete != nullptr)
    {
        const auto keepAlive = alive;
        pluginHost.createInstanceAsync (pluginId, engine.getSampleRate(), engine.getBlockSize(),
            [this, keepAlive, finish] (std::unique_ptr<PluginInstance> created, const juce::String& error)
            {
                if (! keepAlive->load())
                    return;

                finish (std::move (created), error);
            });
        return true;
    }

    juce::String error;
    auto created = pluginHost.createInstance (pluginId, engine.getSampleRate(), engine.getBlockSize(), error);
    const auto ok = created != nullptr;
    finish (std::move (created), error);
    return ok;
}

void EngineAPI::pumpUi (int milliseconds)
{
    auto* mm = juce::MessageManager::getInstance();
    const auto ms = juce::jmax (0, milliseconds);

    if (mm == nullptr || ! mm->isThisTheMessageThread())
    {
        juce::Thread::sleep (ms);
        return;
    }

    const auto deadline = juce::Time::getMillisecondCounterHiRes() + (double) ms;

    while (juce::Time::getMillisecondCounterHiRes() < deadline)
       #if JUCE_MODAL_LOOPS_PERMITTED
        mm->runDispatchLoopUntil (8);
       #else
        juce::Thread::sleep (8);
       #endif
}

bool EngineAPI::tryAdoptCapturedDump (const juce::String& presetId)
{
    auto* preset = instruments.findPresetMutable (presetId);

    if (preset == nullptr)
        return false;

    juce::MemoryBlock current;
    juce::String integrityError;

    if (stateStore.loadState (*preset, current)
        && stateStore.isTrustedFactoryState (*preset, current)
        && stateStore.verifyIntegrity (*preset, current, integrityError))
        return true;

    const auto dump = juce::File::getSpecialLocation (juce::File::userApplicationDataDirectory)
                          .getChildFile ("DawWeb")
                          .getChildFile ("state-dumps")
                          .getChildFile (presetId + ".state");

    juce::MemoryBlock state;

    if (! dump.existsAsFile() || ! dump.loadFileAsData (state)
        || ! stateStore.isTrustedFactoryState (*preset, state))
        return false;

    for (const auto& other : instruments.getPresets())
    {
        if (other.id == preset->id)
            continue;

        juce::MemoryBlock existing;

        if (stateStore.loadState (other, existing) && stateStore.statesEqual (existing, state))
            return false;
    }

    if (! stateStore.saveState (*preset, state, preset->pluginVersion.isNotEmpty()
                                                    ? preset->pluginVersion
                                                    : juce::String ("1.7.0")))
        return false;

    preset->stateAvailable = true;
    preset->checksum = stateStore.hashState (state);
    refreshPresetAvailability();
    logSection ("State", "adopted dump for " + presetId
                            + " bytes=" + juce::String ((int) state.getSize()));
    return true;
}

bool EngineAPI::tryRecaptureFactoryPreset (const juce::String& presetId)
{
    if (tryAdoptCapturedDump (presetId))
        return true;

    auto* preset = instruments.findPresetMutable (presetId);

    if (preset == nullptr)
        return false;

    int index = -1;

    for (int i = 0; i < project.getNumTracks(); ++i)
        if (const auto* track = project.getTrack (i))
            if (track->isMidi() && ! track->isMaster())
            {
                index = i;
                break;
            }

    if (index < 0)
        index = project.addTrack (TrackType::Midi, "Capture", juce::Colour (0xff4a90d9));

    logSection ("State", "attempting recapture of " + presetId);

    if (! preparePluginForCapture (index, preset->pluginId))
        return false;

    pumpUi (8000);

    auto* instance = engine.getTrackInstrument (index);

    if (instance == nullptr)
        return false;

    const juce::String needles[] = { preset->instrumentName, preset->displayName, preset->technique, "Piano" };

    for (const auto& needle : needles)
        if (needle.isNotEmpty())
            instance->applyProgram (needle);

    pumpUi (3000);

    if (! capturePresetState (presetId))
        return false;

    refreshPresetAvailability();

    juce::MemoryBlock state;
    return stateStore.loadState (*preset, state) && stateStore.isTrustedFactoryState (*preset, state);
}

juce::String EngineAPI::dumpDefaultPluginStates()
{
    juce::String report;
    const int index = project.getNumTracks() > 1
                          ? 1
                          : project.addTrack (TrackType::Midi, "Capture", juce::Colour (0xff4a90d9));

    const auto dumpPlugin = [this, index, &report] (const juce::String& pluginId, const juce::String& dumpName)
        -> juce::MemoryBlock
    {
        report << "\n=== " << pluginId << " ===\n";

        if (! preparePluginForCapture (index, pluginId))
        {
            if (const auto* track = project.getTrack (index))
                report << track->instrumentLoadMessage << "\n";
            else
                report << "prepare failed\n";
            return {};
        }

        auto* instance = engine.getTrackInstrument (index);

        if (instance == nullptr)
        {
            report << "no instance\n";
            return {};
        }

        juce::Thread::sleep (3000);
        const auto state = instance->saveState();
        stateStore.writeDump (dumpName, state);
        report << "bytes=" << (int) state.getSize() << "\n";
        report << instance->getIntrospectionSummary() << "\n";
        return state;
    };

    auto bbcso = dumpPlugin (InstrumentRegistry::bbcsoDiscoverId, "bbcso_default");

    if (! bbcso.isEmpty())
        report << "dumped BBCSO default only; not saved as a factory instrument\n";

    auto synchron = dumpPlugin (InstrumentRegistry::synchronPlayerId, "synchron_default");

    if (! synchron.isEmpty())
        report << "dumped Synchron default only; not saved as a factory instrument\n";

    refreshPresetAvailability();
    return report;
}

bool EngineAPI::saveProjectToFile (const juce::File& file)
{
    snapshotTrackPluginStates();
    return ProjectFile::save (file, project);
}

juce::String EngineAPI::loadProjectFromFile (const juce::File& file)
{
    juce::String error;

    if (! ProjectFile::load (file, project, error))
        return error.isNotEmpty() ? error : juce::String ("Could not load project.");

    finishProjectLoad();
    return {};
}

void EngineAPI::finishProjectLoad()
{
    engine.allNotesOff();

    const bool wasAttached = engine.isAudioCallbackAttached();
    if (wasAttached)
        engine.detachAudioCallback();

    cancelAllLoads();

    for (int i = 1; i < project.getNumTracks(); ++i)
        engine.clearTrackInstrument (i);

    engine.collectUnusedInstruments();

    sequenceDirty = true;
    mixerDirty = true;
    tempoDirty = true;
    flushPendingUpdates();

    for (int i = 1; i < project.getNumTracks(); ++i)
    {
        auto* track = project.getTrack (i);

        if (track == nullptr || ! track->isMidi() || track->instrumentDefinitionId.isEmpty())
            continue;

        sanitizeTrackInstrumentFields (*track);

        InstrumentLoadOptions options;
        options.async = false;
        options.applyDefinitionFields = false;
        options.requireCapturedState = true;
        loadTrackInstrument (i, track->instrumentDefinitionId, options);
    }

    logSection ("Instrument", "project load kept " + juce::String (countHostedInstances())
                                + " hosted instance(s) across "
                                + juce::String (juce::jmax (0, project.getNumTracks() - 1))
                                + " MIDI track(s)");

    if (wasAttached)
        engine.attachAudioCallback();

    notify (projectChanged | tracksChanged | clipsChanged | notesChanged | mixerChanged | tempoChanged);
}

void EngineAPI::logSection (const juce::String& section, const juce::String& message) const
{
    juce::Logger::writeToLog ("[" + section + "] " + message);
}

void EngineAPI::collectUnusedInstrumentsLater()
{
    const auto keepAlive = alive;
    juce::Timer::callAfterDelay (250, [this, keepAlive]
    {
        if (keepAlive->load())
            engine.collectUnusedInstruments();
    });
}

void EngineAPI::failInstrumentLoad (int trackIndex, InstrumentLoadState state, const juce::String& message)
{
    auto* track = project.getTrack (trackIndex);

    if (track == nullptr)
        return;

    engine.clearTrackInstrument (trackIndex);
    collectUnusedInstrumentsLater();
    track->instrumentLoadState = state;
    track->instrumentLoadMessage = message;
    logSection ("Instrument", message);
    notify (tracksChanged);
}

bool EngineAPI::pluginStateMatchesDifferentFactory (const TrackData& track, const juce::MemoryBlock& state) const
{
    const auto hash = stateStore.hashState (state);
    const auto* definition = instruments.findDefinition (track.instrumentDefinitionId);
    const auto pluginId = definition != nullptr ? definition->sourcePlugin : juce::String();

    for (const auto& preset : instruments.getPresets())
    {
        if (preset.id == track.presetId)
            continue;

        if (pluginId.isNotEmpty() && preset.pluginId != pluginId)
            continue;

        juce::MemoryBlock other;

        if (stateStore.loadState (preset, other) && stateStore.hashState (other) == hash)
            return true;
    }

    return false;
}

bool EngineAPI::hasRestorableFactoryState (const TrackData& track) const
{
    if (const auto* preset = instruments.findPreset (track.presetId))
    {
        juce::MemoryBlock state;
        return stateStore.hasState (*preset)
            && stateStore.loadState (*preset, state)
            && stateStore.isTrustedFactoryState (*preset, state);
    }

    return false;
}

void EngineAPI::snapshotTrackPluginStates()
{
    for (int i = 0; i < project.getNumTracks(); ++i)
    {
        auto* track = project.getTrack (i);

        if (track == nullptr)
            continue;

        auto* instance = engine.getTrackInstrument (i);

        if (instance == nullptr)
            continue;

        const auto current = instance->saveState();
        juce::MemoryBlock factory;
        bool sameAsFactory = false;

        if (const auto* preset = instruments.findPreset (track->presetId))
            if (stateStore.loadState (*preset, factory))
                sameAsFactory = stateStore.statesEqual (factory, current);

        track->usesFactoryState = sameAsFactory;
        track->pluginState = sameAsFactory ? juce::MemoryBlock() : current;
        track->pluginVersion = instance->getPluginVersion();
        track->stateVersion = 1;

        if (const auto* preset = instruments.findPreset (track->presetId))
            track->stateVersion = preset->stateVersion;
    }
}

void EngineAPI::logAudioResult (int trackIndex)
{
    float peak = 0.0f;

    if (auto* instance = engine.getTrackInstrument (trackIndex))
        peak = instance->consumeOutputPeak();

    const auto meter = engine.getTrackLevel (trackIndex);
    logSection ("Audio", peak > 0.0001f
                            ? "plugin produced samples peak=" + juce::String (peak, 4)
                              + " meter=" + juce::String (meter, 4)
                            : "no plugin samples detected peak=" + juce::String (peak, 4));
}

int EngineAPI::beginTrackLoad (int trackIndex)
{
    const auto generation = ++loadEpoch;

    if (juce::isPositiveAndBelow (trackIndex, AudioEngine::maxTracks))
        trackLoadGeneration[(size_t) trackIndex] = generation;

    return generation;
}

bool EngineAPI::isCurrentLoad (int trackIndex, int generation) const noexcept
{
    return juce::isPositiveAndBelow (trackIndex, AudioEngine::maxTracks)
        && trackLoadGeneration[(size_t) trackIndex] == generation;
}

void EngineAPI::cancelTrackLoad (int trackIndex)
{
    if (juce::isPositiveAndBelow (trackIndex, AudioEngine::maxTracks))
        trackLoadGeneration[(size_t) trackIndex] = ++loadEpoch;
}

void EngineAPI::cancelAllLoads()
{
    ++loadEpoch;
    trackLoadGeneration.fill (0);
}

int EngineAPI::countHostedInstances() const
{
    int count = 0;

    for (int i = 1; i < project.getNumTracks(); ++i)
        if (auto* instance = engine.getTrackInstrument (i))
            if (instance->isExternalPlugin())
                ++count;

    return count;
}

void EngineAPI::ensureAssignedInstrumentsLoaded (bool async)
{
    for (int i = 1; i < project.getNumTracks(); ++i)
        ensureTrackInstrumentLoaded (i, async);
}

void EngineAPI::ensureTrackInstrumentLoaded (int trackIndex, bool async)
{
    if (engine.getTrackInstrument (trackIndex) != nullptr)
        return;

    auto* track = project.getTrack (trackIndex);

    if (track == nullptr || track->instrumentDefinitionId.isEmpty())
        return;

    if (track->instrumentLoadState == InstrumentLoadState::Error
        || track->instrumentLoadState == InstrumentLoadState::Unavailable
        || track->instrumentLoadState == InstrumentLoadState::Loading
        || track->instrumentLoadState == InstrumentLoadState::Initializing
        || track->instrumentLoadState == InstrumentLoadState::RestoringState)
        return;

    InstrumentLoadOptions options;
    options.async = async;
    options.applyDefinitionFields = false;
    options.requireCapturedState = true;
    loadTrackInstrument (trackIndex, track->instrumentDefinitionId, options);
}

void EngineAPI::playValidationPhrase (int trackIndex, int velocity, bool blocking)
{
    if (blocking)
        ensureTrackInstrumentLoaded (trackIndex, false);
    else if (engine.getTrackInstrument (trackIndex) == nullptr)
    {
        ensureTrackInstrumentLoaded (trackIndex, true);
        logSection ("Audio", "validation phrase deferred until the instrument finishes loading");
        return;
    }

    const int notes[] = { 60, 64, 67, 72 };
    const auto vel = (float) velocity / 127.0f;

    if (auto* instance = engine.getTrackInstrument (trackIndex))
        instance->consumeOutputPeak();

    logSection ("Audio", "MIDI phrase C4 E4 G4 C5 vel=" + juce::String (velocity));

    int extraMs = 0;

    if (const auto* track = project.getTrack (trackIndex))
        if (SoftwareLegato::isActive (*track))
            extraMs = SoftwareLegato::extraMilliseconds (project.getBpm());

    const int holdMs = 1000 + extraMs;
    const int gapMs = 80;
    const int stepMs = holdMs + gapMs;

    if (blocking)
    {
        for (int note : notes)
        {
            logSection ("Audio", "MIDI note received pitch=" + juce::String (note));
            engine.sendNoteOn (trackIndex, note, vel);
            juce::Thread::sleep (holdMs);
            engine.sendNoteOff (trackIndex, note);
            juce::Thread::sleep (gapMs);
        }

        logAudioResult (trackIndex);
        return;
    }

    const auto keepAlive = alive;

    for (int i = 0; i < 4; ++i)
    {
        const auto note = notes[i];
        juce::Timer::callAfterDelay (i * stepMs, [this, keepAlive, trackIndex, note, vel, holdMs]
        {
            if (! keepAlive->load())
                return;

            logSection ("Audio", "MIDI note received pitch=" + juce::String (note));
            engine.sendNoteOn (trackIndex, note, vel);
            juce::Timer::callAfterDelay (holdMs, [this, keepAlive, trackIndex, note]
            {
                if (keepAlive->load())
                    engine.sendNoteOff (trackIndex, note);
            });
        });
    }

    juce::Timer::callAfterDelay (4 * stepMs + 250, [this, keepAlive, trackIndex]
    {
        if (keepAlive->load())
            logAudioResult (trackIndex);
    });
}

juce::String EngineAPI::describeDefinitionAvailability (const InstrumentDefinition& definition, int trackIndex) const
{
    if (const auto* track = project.getTrack (trackIndex))
        if (track->instrumentDefinitionId == definition.id)
        {
            if (track->instrumentLoadState == InstrumentLoadState::Loaded
                || track->instrumentLoadState == InstrumentLoadState::Active)
                return "Ready";

            if (track->instrumentLoadState == InstrumentLoadState::Error)
                return "Error";

            if (track->instrumentLoadState == InstrumentLoadState::Unavailable)
                return "Unavailable";
        }

    if (definition.sourcePlugin == InstrumentRegistry::testSynthId)
        return "Available";

    if (definition.sourcePlugin == InstrumentRegistry::mOrchestraId)
    {
        MOrchestra::Engine::get().initialise();
        return MOrchestra::Engine::get().isAvailable() ? "Available" : "Unavailable";
    }

    const auto* preset = instruments.findPreset (instruments.resolvePresetId (definition));
    return preset != nullptr && preset->stateAvailable ? "Available" : "Unavailable";
}

void EngineAPI::verifyFreshRestore (int trackIndex, const juce::String& presetId,
                                    std::function<void (bool)> onComplete)
{
    const auto finish = [onComplete] (bool ok)
    {
        if (onComplete != nullptr)
            onComplete (ok);
    };

    const auto* definition = instruments.findDefinitionForPreset (presetId);

    if (definition == nullptr)
    {
        finish (false);
        return;
    }

    juce::String techniqueId;

    for (const auto& entry : definition->techniquePresets)
        if (entry.second == presetId)
            techniqueId = entry.first;

    unloadTrackInstrument (trackIndex, "Fresh restore");
    InstrumentLoadOptions options;
    options.async = true;
    options.applyDefinitionFields = true;
    options.requireCapturedState = true;
    loadTrackInstrument (trackIndex, definition->id, options);

    const auto definitionId = definition->id;
    const auto generation = juce::isPositiveAndBelow (trackIndex, AudioEngine::maxTracks)
                                ? trackLoadGeneration[(size_t) trackIndex]
                                : 0;
    const auto keepAlive = alive;
    auto poll = std::make_shared<std::function<void (int)>>();

    *poll = [this, keepAlive, trackIndex, definitionId, generation, techniqueId, finish, poll] (int attempt)
    {
        juce::Timer::callAfterDelay (150, [this, keepAlive, trackIndex, definitionId, generation,
                                           techniqueId, finish, poll, attempt]
        {
            if (! keepAlive->load())
                return;

            auto* track = project.getTrack (trackIndex);

            if (track == nullptr || ! isCurrentLoad (trackIndex, generation)
                || track->instrumentDefinitionId != definitionId)
            {
                finish (false);
                return;
            }

            const auto state = track->instrumentLoadState;

            if (state == InstrumentLoadState::Loaded || state == InstrumentLoadState::Active)
            {
                if (techniqueId.isNotEmpty())
                    setTrackTechnique (trackIndex, techniqueId);

                playValidationPhrase (trackIndex, 80, false);
                finish (true);
                return;
            }

            if (state == InstrumentLoadState::Error || state == InstrumentLoadState::Unavailable)
            {
                finish (false);
                return;
            }

            if (attempt >= 400)
            {
                finish (false);
                return;
            }

            (*poll) (attempt + 1);
        });
    };

    (*poll) (0);
}

bool EngineAPI::applyControllerDefinition (int trackIndex, const ControllerDefinition& controller, float normalised)
{
    if (! controller.mapped)
        return false;

    const auto value = juce::roundToInt (juce::jmap (juce::jlimit (0.0f, 1.0f, normalised),
                                                     0.0f, 1.0f,
                                                     (float) controller.min,
                                                     (float) controller.max));

    if (auto* instance = engine.getTrackInstrument (trackIndex))
        instance->setParameterByName (controller.displayName, juce::jlimit (0.0f, 1.0f, normalised));

    switch (controller.target)
    {
        case ControllerTarget::MidiCC:
        case ControllerTarget::DimensionController:
            if (controller.midiCC < 0)
                return false;
            engine.sendController (trackIndex, controller.midiCC, value);
            return true;

        case ControllerTarget::PitchBend:
            engine.sendPitchBend (trackIndex, juce::roundToInt (normalised * 16383.0f));
            return true;

        case ControllerTarget::Aftertouch:
            engine.sendChannelPressure (trackIndex, value);
            return true;

        case ControllerTarget::NoteVelocity:
            if (auto* track = project.getTrack (trackIndex))
                track->defaultVelocity = juce::jlimit (0.0f, 1.0f, normalised);
            return true;

        case ControllerTarget::AftertouchRelease:
        case ControllerTarget::Speed:
        case ControllerTarget::Unspecified:
            return false;
    }

    return false;
}

bool EngineAPI::setTrackController (int trackIndex, const juce::String& controllerId, float normalised)
{
    auto* track = project.getTrack (trackIndex);
    const auto* controller = instruments.findController (controllerId);

    if (track == nullptr || controller == nullptr)
        return false;

    track->controllerValues[controllerId] = juce::jlimit (0.0f, 1.0f, normalised);
    track->instrumentLastUsedMs = juce::Time::currentTimeMillis();

    if (! controller->mapped)
    {
        notify (tracksChanged);
        return false;
    }

    const auto ok = applyControllerDefinition (trackIndex, *controller, normalised);
    notify (tracksChanged);
    return ok;
}

bool EngineAPI::setTrackLegato (int trackIndex, bool enabled)
{
    auto* track = project.getTrack (trackIndex);

    if (track == nullptr)
        return false;

    if (! enabled)
        flushScheduledNoteOffs (trackIndex, true);

    track->legatoEnabled = enabled;
    invalidateSequence();
    notify (tracksChanged);
    return true;
}

float EngineAPI::getTrackController (int trackIndex, const juce::String& controllerId) const
{
    const auto* track = project.getTrack (trackIndex);
    const auto* controller = instruments.findController (controllerId);

    if (track == nullptr)
        return 0.0f;

    const auto it = track->controllerValues.find (controllerId);

    if (it != track->controllerValues.end())
        return it->second;

    if (controller != nullptr && controller->max > controller->min)
        return (float) (controller->defaultValue - controller->min)
               / (float) (controller->max - controller->min);

    return 0.0f;
}

juce::var EngineAPI::describeInstrumentCapabilities (const juce::String& definitionId) const
{
    const auto* definition = instruments.findDefinition (definitionId);

    if (definition == nullptr)
        return makeError ("Unknown instrument");

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("capabilities", OrchestraSampler::capabilitiesToVar (
                                              OrchestraSampler::buildCapabilities (instruments, *definition)));
    return makeOk (payload);
}

juce::var EngineAPI::describeInstrumentState (int trackIndex) const
{
    const auto* track = project.getTrack (trackIndex);

    if (track == nullptr)
        return makeError ("Unknown track");

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("state", OrchestraSampler::snapshotToVar (
                                       OrchestraSampler::buildSnapshot (instruments, stateStore, track, trackIndex)));
    return makeOk (payload);
}

juce::var EngineAPI::describeInstrumentControls (int trackIndex) const
{
    const auto* track = project.getTrack (trackIndex);

    if (track == nullptr)
        return makeError ("Unknown track");

    auto* payload = new juce::DynamicObject();
    payload->setProperty ("controls", OrchestraSampler::controlsToVar (
                                          OrchestraSampler::buildSnapshot (instruments, stateStore, track, trackIndex)));
    return makeOk (payload);
}

juce::var EngineAPI::describeCatalogue() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("resourceRoot", instruments.getResourceRoot());
    root->setProperty ("configFile", instruments.getLoadedConfigFile().getFullPathName());
    root->setProperty ("startupStatus", instruments.getStartupStatus());
    root->setProperty ("maxHostedInstances", InstrumentRegistry::maxHostedInstances);

    juce::Array<juce::var> warningArray;
    for (const auto& warning : instruments.getResourceWarnings())
        warningArray.add (warning);
    root->setProperty ("warnings", warningArray);

    juce::Array<juce::var> pluginArray;

    for (const auto& descriptor : instruments.getPlugins())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", descriptor.instrumentId);
        object->setProperty ("displayName", descriptor.displayName);
        object->setProperty ("vendor", descriptor.vendor);
        object->setProperty ("kind", descriptor.isBuiltIn() ? "builtin" : "vst3");
        object->setProperty ("available", descriptor.isAvailable());
        object->setProperty ("pluginFileFound", descriptor.pluginFileFound);
        object->setProperty ("sampleLibraryFound", descriptor.sampleLibraryFound);
        object->setProperty ("path", descriptor.firstExistingPluginPath());
        object->setProperty ("error", descriptor.availabilityError);
        pluginArray.add (juce::var (object));
    }

    root->setProperty ("plugins", pluginArray);

    juce::Array<juce::var> techniqueArray;

    for (const auto& technique : instruments.getTechniques())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", technique.id);
        object->setProperty ("displayName", technique.displayName);
        object->setProperty ("pluginId", technique.pluginId);
        object->setProperty ("mapped", technique.action.mapped);
        object->setProperty ("action", techniqueActionToVar (technique.action));
        techniqueArray.add (juce::var (object));
    }

    root->setProperty ("techniques", techniqueArray);

    juce::Array<juce::var> controllerArray;

    for (const auto& controller : instruments.getControllers())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", controller.id);
        object->setProperty ("displayName", controller.displayName);
        object->setProperty ("group", controller.group);
        object->setProperty ("mapped", controller.mapped);
        object->setProperty ("bipolar", controller.bipolar);
        object->setProperty ("midiCC", controller.midiCC);
        object->setProperty ("min", controller.min);
        object->setProperty ("max", controller.max);
        object->setProperty ("defaultValue", controller.defaultValue);
        controllerArray.add (juce::var (object));
    }

    root->setProperty ("controllers", controllerArray);

    juce::Array<juce::var> libraryArray;

    for (const auto& library : instruments.getLibraries())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", library.id);
        object->setProperty ("displayName", library.displayName);
        object->setProperty ("pluginId", library.pluginId);
        object->setProperty ("available", library.available);
        object->setProperty ("path", library.sampleLibraryPath);
        libraryArray.add (juce::var (object));
    }

    root->setProperty ("libraries", libraryArray);

    juce::Array<juce::var> instrumentArray;

    for (const auto& definition : instruments.getCatalogue())
    {
        const auto* plugin = instruments.find (definition.sourcePlugin);
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", definition.id);
        object->setProperty ("displayName", definition.displayName);
        object->setProperty ("category", definition.category);
        object->setProperty ("sourcePlugin", definition.sourcePlugin);
        object->setProperty ("sourceLibrary", definition.sourceLibrary);
        object->setProperty ("preset", definition.preset);
        object->setProperty ("presetId", definition.presetId);
        object->setProperty ("presetMapped", definition.presetMapped);
        const auto* preset = instruments.findPreset (instruments.resolvePresetId (definition));
        const bool mOrchestraReady = definition.sourcePlugin == InstrumentRegistry::mOrchestraId
                                     && MOrchestra::Engine::get().isAvailable();
        object->setProperty ("stateAvailable", preset != nullptr && preset->stateAvailable);
        object->setProperty ("availabilityStatus", describeDefinitionAvailability (definition, 1));
        object->setProperty ("available", mOrchestraReady
                                             || (plugin != nullptr && plugin->isAvailable()
                                                 && (definition.sourcePlugin == InstrumentRegistry::testSynthId
                                                     || (preset != nullptr && preset->stateAvailable))));
        object->setProperty ("techniques", definition.techniques);
        object->setProperty ("controllers", definition.controllers);

        auto* techniquePresets = new juce::DynamicObject();
        for (const auto& pair : definition.techniquePresets)
            techniquePresets->setProperty (pair.first, pair.second);
        object->setProperty ("techniquePresets", juce::var (techniquePresets));
        instrumentArray.add (juce::var (object));
    }

    root->setProperty ("instruments", instrumentArray);

    juce::Array<juce::var> presetArray;

    for (const auto& preset : instruments.getPresets())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("id", preset.id);
        object->setProperty ("displayName", preset.displayName);
        object->setProperty ("pluginId", preset.pluginId);
        object->setProperty ("stateFile", preset.stateFile);
        object->setProperty ("stateAvailable", preset.stateAvailable);
        presetArray.add (juce::var (object));
    }

    root->setProperty ("presets", presetArray);
    return juce::var (root);
}

void EngineAPI::notify (int changeFlags)
{
    if (changeFlags == 0)
        return;

    engineListeners.call ([changeFlags] (Listener& l) { l.onEngineChanged (changeFlags); });
}

//==============================================================================
juce::var EngineAPI::makeError (const juce::String& reason) const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("ok", false);
    object->setProperty ("error", reason);
    return juce::var (object);
}

juce::var EngineAPI::makeOk (juce::DynamicObject* payload) const
{
    auto* object = payload != nullptr ? payload : new juce::DynamicObject();
    object->setProperty ("ok", true);
    return juce::var (object);
}

juce::var EngineAPI::withOk (juce::var payload) const
{
    if (auto* object = payload.getDynamicObject())
        object->setProperty ("ok", true);
    else
        return makeOk();

    return payload;
}

juce::var EngineAPI::instrumentStatusReply (int trackIndex) const
{
    auto* track = project.getTrack (trackIndex);
    auto* object = new juce::DynamicObject();
    object->setProperty ("type", "instrument.status");
    object->setProperty ("trackId", track != nullptr ? (int) track->id : 0);
    object->setProperty ("instrumentId", track != nullptr ? track->instrumentDefinitionId : juce::String());
    object->setProperty ("source", track != nullptr ? track->instrumentSource : juce::String (ProjectSchema::sourceEmpty));
    object->setProperty ("status", track != nullptr ? instrumentStatusToken (track->instrumentLoadState)
                                                    : juce::String ("error"));
    object->setProperty ("message", track != nullptr ? track->instrumentLoadMessage : juce::String ("Unknown track"));
    return makeOk (object);
}

bool EngineAPI::applyTrackMixerField (TrackData& track, const juce::String& parameter, const juce::var& value)
{
    if (parameter == "volumeDb")
        track.volume = DawUnits::dbToFader ((float) juce::jlimit ((double) MixerIds::volumeDbMin,
                                                                (double) MixerIds::volumeDbMax,
                                                                (double) value));
    else if (parameter == "volume")
        track.volume = (float) juce::jlimit (0.0, 1.0, (double) value);
    else if (parameter == "pan")
        track.pan = (float) juce::jlimit (-1.0, 1.0, (double) value);
    else if (parameter == "mute")
        track.mute = (bool) value;
    else if (parameter == "solo")
        track.solo = (bool) value;
    else if (parameter == "recordArm")
        track.recordArm = (bool) value;
    else if (parameter == "name")
        track.name = value.toString();
    else
        return false;

    return true;
}

juce::var EngineAPI::describeTrackMixer (const TrackData& track) const
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("id", (int) track.id);
    object->setProperty ("name", track.name);
    object->setProperty ("volume", track.volume);
    object->setProperty ("volumeDb", track.getVolumeDb());
    object->setProperty ("pan", track.pan);
    object->setProperty ("mute", track.mute);
    object->setProperty ("solo", track.solo);
    object->setProperty ("meter", track.meterLevel);
    object->setProperty ("source", track.instrumentSource);

    juce::Array<juce::var> sendArray;
    for (const auto& send : track.sends)
    {
        auto* sendObject = new juce::DynamicObject();
        sendObject->setProperty ("id", send.id);
        sendObject->setProperty ("name", send.name);
        sendObject->setProperty ("level", send.level);
        sendObject->setProperty ("enabled", send.enabled);
        sendArray.add (juce::var (sendObject));
    }
    object->setProperty ("sends", sendArray);

    juce::Array<juce::var> insertArray;
    for (const auto& slot : track.inserts)
    {
        auto* insertObject = new juce::DynamicObject();
        insertObject->setProperty ("name", slot.name);
        insertObject->setProperty ("instrumentId", slot.instrumentId);
        insertObject->setProperty ("bypassed", slot.bypassed);
        insertArray.add (juce::var (insertObject));
    }
    object->setProperty ("inserts", insertArray);
    return juce::var (object);
}

juce::var EngineAPI::describeMixer() const
{
    auto* root = new juce::DynamicObject();
    juce::Array<juce::var> tracks;

    for (int i = 0; i < project.getNumTracks(); ++i)
        if (auto* track = project.getTrack (i))
            tracks.add (describeTrackMixer (*track));

    root->setProperty ("tracks", tracks);

    auto* master = new juce::DynamicObject();
    master->setProperty ("volume", project.getMasterGainPosition());
    master->setProperty ("volumeDb", DawUnits::faderToDb (project.getMasterGainPosition()));
    master->setProperty ("limiterEnabled", false);
    master->setProperty ("meter", engine.getMasterLevel());
    root->setProperty ("master", juce::var (master));
    if (! project.getWebMixer().isVoid())
        root->setProperty ("webMixer", project.getWebMixer());
    return juce::var (root);
}

juce::var EngineAPI::describeAudioStatus() const
{
    auto status = engine.getRemoteAudio().describeStatus();

    if (auto* object = status.getDynamicObject())
    {
        object->setProperty ("engineRunning", engine.isRunning());
        object->setProperty ("engineStatus", engine.getStatusDescription());
        object->setProperty ("deviceBlockSize", engine.getBlockSize());
        object->setProperty ("deviceSampleRate", engine.getSampleRate());
        object->setProperty ("audioCpuPercent", engine.getAudioCpuPercent());
        object->setProperty ("pluginCount", countHostedInstances());
        object->setProperty ("renderLatencyMs",
                             engine.getSampleRate() > 0.0
                                 ? 1000.0 * (double) engine.getBlockSize() / engine.getSampleRate()
                                 : 0.0);
    }

    return status;
}

juce::var EngineAPI::describeDiagnostics() const
{
    const auto metrics = SessionDiagnostics::collectProcessMetrics (engine);
    auto var = SessionDiagnostics::toVar (metrics, countHostedInstances(), 0);

    if (auto* object = var.getDynamicObject())
    {
        object->setProperty ("sessionId", sessionId);
        object->setProperty ("audio", describeAudioStatus());
        object->setProperty ("bufferSize", engine.getBlockSize());
        object->setProperty ("sampleRate", engine.getSampleRate());

        const auto orchestra = MOrchestra::Engine::get().getDiagnostics();
        auto* mOrch = new juce::DynamicObject();
        mOrch->setProperty ("available", orchestra.libraryAvailable);
        mOrch->setProperty ("cpuPercent", orchestra.cpuPercent);
        mOrch->setProperty ("activeVoices", orchestra.activeVoices);
        mOrch->setProperty ("sampleVoices", orchestra.sampleVoices);
        mOrch->setProperty ("dspVoices", orchestra.dspVoices);
        mOrch->setProperty ("cacheMb", orchestra.cacheMb);
        mOrch->setProperty ("cacheEntries", orchestra.cacheEntries);
        mOrch->setProperty ("libraryRoot", orchestra.libraryRoot);
        juce::Array<juce::var> missing;
        for (const auto& item : orchestra.missingInstruments)
            missing.add (item);
        mOrch->setProperty ("missing", missing);
        object->setProperty ("mOrchestra", juce::var (mOrch));
    }

    return var;
}

juce::var EngineAPI::describeSession() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("type", "session.state");
    root->setProperty ("sessionId", sessionId);
    root->setProperty ("schemaVersion", ProjectSchema::currentVersion);
    root->setProperty ("maxAudioSessions", maxAudioSessions);
    root->setProperty ("project", describeProject());
    root->setProperty ("mixer", describeMixer());
    root->setProperty ("audio", describeAudioStatus());
    root->setProperty ("diagnostics", describeDiagnostics());
    return juce::var (root);
}

juce::var EngineAPI::handleMessage (const juce::String& jsonText)
{
    juce::var parsed;

    if (juce::JSON::parse (jsonText, parsed).failed())
        return makeError ("Malformed JSON");

    return handleMessage (parsed);
}

juce::var EngineAPI::handleMessage (const juce::var& message)
{
    const auto type = message.getProperty ("type", juce::var()).toString();

    if (type.isEmpty())
        return makeError ("Missing \"type\"");

    if (type == "session.state" || type == "session.getState")
        return withOk (describeSession());

    if (type == "diagnostics.ping")
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("type", "diagnostics.pong");
        object->setProperty ("tClient", getDouble (message, "tClient", 0.0));
        object->setProperty ("tServer", juce::Time::getMillisecondCounterHiRes());
        return makeOk (object);
    }

    if (type == "diagnostics.click")
    {
        const auto token = (juce::uint64) juce::jmax (1, getInt (message, "token", 1));
        engine.getRemoteAudio().requestClick (token);
        auto* object = new juce::DynamicObject();
        object->setProperty ("type", "diagnostics.click");
        object->setProperty ("token", (int) token);
        return makeOk (object);
    }

    if (type == "diagnostics.getMetrics")
        return withOk (describeDiagnostics());

    if (type == "audio.getStatus" || type == "audio.subscribe" || type == "audio.unsubscribe")
    {
        auto status = describeAudioStatus();

        if (auto* object = status.getDynamicObject())
        {
            object->setProperty ("type", "audio.status");
            object->setProperty ("ok", true);
            return status;
        }

        return makeError ("Audio status unavailable");
    }

    //--------------------------------------------------------------------------
    if (type == "transport.play")   { play();  notify (transportChanged); return makeOk(); }
    if (type == "transport.pause")  { pause(); notify (transportChanged); return makeOk(); }
    if (type == "transport.stop")   { stop();  notify (transportChanged); return makeOk(); }

    if (type == "transport.seek")
    {
        seekToBeats (getDouble (message, "beats", 0.0));
        notify (transportChanged);
        return makeOk();
    }

    if (type == "transport.setBpm" || type == "transport.tempo.set")
    {
        project.setBpm (getDouble (message, "bpm", project.getBpm()));
        syncTempo();
        notify (tempoChanged | projectChanged);
        return makeOk();
    }

    if (type == "transport.setLoop" || type == "transport.loop.set")
    {
        setLooping (getBool (message, "enabled", false));

        if (! getProperty (message, "startBeats").isVoid() || ! getProperty (message, "endBeats").isVoid())
            setLoopRangeBeats (getDouble (message, "startBeats", loopStartBeats),
                               getDouble (message, "endBeats", loopEndBeats));

        notify (transportChanged);
        return makeOk();
    }

    if (type == "transport.setMetronome")
    {
        setMetronomeEnabled (getBool (message, "enabled", false));
        notify (transportChanged);
        return makeOk();
    }

    if (type == "transport.setTimeSignature" || type == "transport.timeSignature.set")
    {
        project.setTimeSignature (juce::jlimit (1, 16, getInt (message, "numerator", project.getTimeSigNumerator())),
                                  juce::jlimit (1, 16, getInt (message, "denominator", project.getTimeSigDenominator())));
        notify (projectChanged | tempoChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "project.setName")
    {
        project.setName (message.getProperty ("name", juce::var()).toString());
        notify (projectChanged);
        return makeOk();
    }

    if (type == "project.new")
    {
        stop();
        seekToBeats (0.0);
        clearAllHostedInstruments();
        project.clear();
        project.setName ("New Project");
        syncMixer();
        invalidateSequence();
        notify (projectChanged | tracksChanged | clipsChanged | mixerChanged | transportChanged);
        return makeOk();
    }

    if (type == "project.loadDemo")
    {
        loadDemoOrchestra();
        auto* object = new juce::DynamicObject();
        object->setProperty ("project", describeProject());
        return makeOk (object);
    }

    if (type == "project.save")
    {
        const auto path = message.getProperty ("path", juce::var()).toString();

        if (path.isEmpty())
            return makeError ("Missing path");

        if (! saveProjectToFile (juce::File (path)))
            return makeError ("Could not save project");

        return makeOk();
    }

    if (type == "project.load")
    {
        const auto path = message.getProperty ("path", juce::var()).toString();

        if (path.isEmpty())
            return makeError ("Missing path");

        stop();
        seekToBeats (0.0);
        const auto error = loadProjectFromFile (juce::File (path));
        return error.isEmpty() ? makeOk() : makeError (error);
    }

    if (type == "project.getState")
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("project", describeProject());
        object->setProperty ("sessionId", sessionId);
        object->setProperty ("schemaVersion", ProjectSchema::currentVersion);
        return makeOk (object);
    }

    if (type == "project.export")
    {
        for (int i = 0; i < project.getNumTracks(); ++i)
            if (auto* track = project.getTrack (i))
                if (auto* instance = engine.getTrackInstrument (i))
                    track->pluginState = instance->saveState();

        auto* object = new juce::DynamicObject();
        object->setProperty ("json", juce::JSON::toString (ProjectFile::toVar (project), true));
        object->setProperty ("name", project.getName());
        return makeOk (object);
    }

    if (type == "project.import")
    {
        const auto json = message.getProperty ("json", juce::var()).toString();
        juce::String error;

        if (! ProjectFile::fromVar (juce::JSON::parse (json), project, error))
            return makeError (error.isNotEmpty() ? error : juce::String ("Could not import project."));

        stop();
        seekToBeats (0.0);
        finishProjectLoad();
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "track.create")
    {
        const auto name = message.getProperty ("name", toVar ("Track")).toString();
        const auto kind = message.getProperty ("trackType", toVar ("midi")).toString().toLowerCase();
        const auto trackType = kind == "group" ? TrackType::Group
                             : kind == "audio" ? TrackType::Audio
                                               : TrackType::Midi;
        const auto colour = remoteTrackPalette[(size_t) (project.getNumTracks() % (int) std::size (remoteTrackPalette))];
        const auto index = project.addTrack (trackType,
                                             name.isNotEmpty() ? name
                                                               : (trackType == TrackType::Group ? "Group"
                                                                : trackType == TrackType::Audio ? "Audio" : "MIDI"),
                                             colour);

        if (index < 0)
            return makeError ("Could not create track");

        if (auto* track = project.getTrack (index))
        {
            if (track->isMidi())
            {
                track->instrumentSlot.instrumentId = InstrumentRegistry::testSynthId;
                track->instrumentSlot.name = instruments.getDisplayName (InstrumentRegistry::testSynthId);
                track->instrument = track->instrumentSlot.name;
            }

            if (! getProperty (message, "parentId").isVoid())
                track->parentId = (TrackId) getInt (message, "parentId", 0);

            auto* object = new juce::DynamicObject();
            object->setProperty ("trackId", (int) track->id);
            object->setProperty ("index", index);
            object->setProperty ("colour", colourToHex (track->colour));
            syncMixer();
            notify (tracksChanged | mixerChanged);
            return makeOk (object);
        }

        return makeError ("Could not create track");
    }

    if (type == "track.delete")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0 || ! project.removeTrack (index))
            return makeError ("Unknown trackId");

        syncMixer();
        invalidateSequence();
        notify (tracksChanged | clipsChanged | mixerChanged);
        return makeOk();
    }

    if (type == "track.setParameter" || type == "track.update"
        || type == "track.volume" || type == "track.pan"
        || type == "track.mute" || type == "track.solo")
    {
        auto* track = project.findTrack ((TrackId) getInt (message, "trackId", 0));

        if (track == nullptr)
            return makeError ("Unknown trackId");

        auto applyOne = [this, track, &message] (const juce::String& parameter) -> bool
        {
            auto value = getProperty (message, "value");

            if (value.isVoid())
                value = message.getProperty (juce::Identifier (parameter), juce::var());

            if (value.isVoid() && parameter == "mute")
                value = getProperty (message, "muted");

            if (value.isVoid())
                return true;

            return applyTrackMixerField (*track, parameter, value);
        };

        if (type == "track.update")
        {
            static const char* fields[] { "name", "volume", "pan", "mute", "solo", "recordArm" };
            for (auto* field : fields)
                if (! getProperty (message, field).isVoid())
                    applyTrackMixerField (*track, field, getProperty (message, field));
        }
        else if (type == "track.setParameter")
        {
            const auto parameter = message.getProperty ("parameter", juce::var()).toString();
            if (! applyOne (parameter))
                return makeError ("Unknown parameter: " + parameter);
        }
        else
        {
            applyOne (type.fromLastOccurrenceOf (".", false, false));
        }

        syncMixer();
        notify (mixerChanged | tracksChanged);
        return makeOk();
    }

    if (type == "track.duplicate")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));
        auto* source = project.getTrack (index);

        if (source == nullptr || source->isMaster())
            return makeError ("Unknown trackId");

        auto copy = *source;
        copy.id = 0;
        copy.name = source->name + " copy";
        copy.recordArm = false;
        copy.instrumentLoadState = InstrumentLoadState::Unloaded;
        copy.instrumentLoadMessage.clear();

        std::vector<ClipData> copiedClips;

        for (const auto& clip : project.getClips())
        {
            if (clip.trackIndex != index)
                continue;

            auto c = clip;
            c.id = 0;

            for (auto& note : c.notes)
                note.id = 0;

            copiedClips.push_back (c);
        }

        const auto newIndex = project.insertTrack (index + 1, copy);

        if (newIndex < 0)
            return makeError ("Could not duplicate track");

        for (auto& clip : copiedClips)
        {
            clip.trackIndex = newIndex;
            project.addClip (clip);
        }

        if (auto* created = project.getTrack (newIndex))
        {
            if (created->isMidi() && created->instrumentDefinitionId.isNotEmpty())
            {
                InstrumentLoadOptions options;
                options.async = true;
                options.applyDefinitionFields = false;
                loadTrackInstrument (newIndex, created->instrumentDefinitionId, options);
            }

            auto* object = new juce::DynamicObject();
            object->setProperty ("trackId", (int) created->id);
            object->setProperty ("index", newIndex);
            syncMixer();
            invalidateSequence();
            notify (tracksChanged | clipsChanged | mixerChanged);
            return makeOk (object);
        }

        return makeError ("Could not duplicate track");
    }

    if (type == "track.move")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));
        auto toIndex = getInt (message, "toIndex", -1);

        if (toIndex < 0)
            toIndex = index + getInt (message, "delta", 0);

        if (index < 0 || ! project.moveTrack (index, toIndex))
            return makeError ("Could not move track");

        syncMixer();
        invalidateSequence();
        notify (tracksChanged | clipsChanged | mixerChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "clip.create")
    {
        const auto trackId = (TrackId) getInt (message, "trackId", 0);
        auto index = project.indexOfTrack (trackId);

        if (index < 0)
            index = getInt (message, "trackIndex", -1);

        auto* track = project.getTrack (index);

        if (track == nullptr || track->isMaster() || track->isGroup())
            return makeError ("Unknown trackId");

        ClipData clip;
        clip.trackIndex = index;
        clip.startBeat = juce::jmax (0.0, (double) getProperty (message, "start", "startBeat"));
        if (getProperty (message, "start", "startBeat").isVoid())
            clip.startBeat = 0.0;
        clip.lengthBeats = juce::jmax (0.25, getDouble (message, "length", getDouble (message, "lengthBeats", 8.0)));
        clip.name = message.getProperty ("name", toVar (track->name)).toString();
        clip.colour = track->colour;
        clip.midi = track->isMidi();
        clip.kind = track->isMidi() ? ClipKind::Midi
                  : (track->instrumentSource == ProjectSchema::sourceWebSampler ? ClipKind::Sampler : ClipKind::Audio);
        if (clip.kind == ClipKind::Midi)
            clip.loopLengthBeats = clip.lengthBeats;

        if (clip.midi && getBool (message, "sketch", true))
            fillSketchNotes (clip);

        const auto clipIndex = project.addClip (clip);
        invalidateSequence();
        notify (clipsChanged | notesChanged);

        auto* object = new juce::DynamicObject();
        if (const auto* created = project.getClip (clipIndex))
            object->setProperty ("clipId", (int) created->id);
        object->setProperty ("index", clipIndex);
        return makeOk (object);
    }

    if (type == "clip.move")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        if (! getProperty (message, "start", "startBeat").isVoid())
            clip->startBeat = juce::jmax (0.0, (double) getProperty (message, "start", "startBeat"));

        if (! getProperty (message, "length", "lengthBeats").isVoid())
            clip->lengthBeats = juce::jmax (0.25, (double) getProperty (message, "length", "lengthBeats"));

        if (! getProperty (message, "trackIndex").isVoid())
        {
            const auto nextIndex = getInt (message, "trackIndex", clip->trackIndex);
            if (auto* dest = project.getTrack (nextIndex))
                if (! dest->isMaster() && ! dest->isGroup())
                    clip->trackIndex = nextIndex;
        }

        invalidateSequence();
        notify (clipsChanged);
        return makeOk();
    }

    if (type == "clip.delete")
    {
        const auto index = project.indexOfClip ((ClipId) getInt (message, "clipId", 0));

        if (index < 0 || ! project.removeClip (index))
            return makeError ("Unknown clipId");

        invalidateSequence();
        notify (clipsChanged | notesChanged);
        return makeOk();
    }

    if (type == "clip.duplicate")
    {
        auto* source = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (source == nullptr)
            return makeError ("Unknown clipId");

        auto copy = *source;
        copy.id = 0;
        copy.startBeat = source->getEndBeat();

        for (auto& note : copy.notes)
            note.id = 0;

        const auto clipIndex = project.addClip (copy);
        invalidateSequence();
        notify (clipsChanged | notesChanged);

        auto* object = new juce::DynamicObject();
        if (const auto* created = project.getClip (clipIndex))
            object->setProperty ("clipId", (int) created->id);
        object->setProperty ("index", clipIndex);
        return makeOk (object);
    }

    if (type == "clip.update")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        if (! getProperty (message, "name").isVoid())
            clip->name = message.getProperty ("name", juce::var()).toString();

        if (! getProperty (message, "muted").isVoid())
            clip->muted = getBool (message, "muted", false);

        if (! getProperty (message, "loopCount").isVoid())
            clip->loopCount = juce::jmax (1, getInt (message, "loopCount", 1));

        if (! getProperty (message, "loopLengthBeats").isVoid())
            clip->loopLengthBeats = juce::jmax (0.0, getDouble (message, "loopLengthBeats", 0.0));

        if (! getProperty (message, "start", "startBeat").isVoid())
            clip->startBeat = juce::jmax (0.0, (double) getProperty (message, "start", "startBeat"));

        if (! getProperty (message, "length", "lengthBeats").isVoid())
            clip->lengthBeats = juce::jmax (0.25, (double) getProperty (message, "length", "lengthBeats"));

        invalidateSequence();
        notify (clipsChanged);
        return makeOk();
    }

    if (type == "clip.moveBatch")
    {
        auto* items = message.getProperty ("clips", juce::var()).getArray();

        if (items == nullptr)
            return makeError ("Missing clips");

        for (const auto& entry : *items)
        {
            auto* clip = project.findClip ((ClipId) (int) entry.getProperty ("clipId", 0));

            if (clip == nullptr)
                continue;

            if (! entry.getProperty ("start", juce::var()).isVoid())
                clip->startBeat = juce::jmax (0.0, (double) entry.getProperty ("start", clip->startBeat));
            else if (! entry.getProperty ("startBeat", juce::var()).isVoid())
                clip->startBeat = juce::jmax (0.0, (double) entry.getProperty ("startBeat", clip->startBeat));

            if (! entry.getProperty ("length", juce::var()).isVoid())
                clip->lengthBeats = juce::jmax (0.25, (double) entry.getProperty ("length", clip->lengthBeats));
            else if (! entry.getProperty ("lengthBeats", juce::var()).isVoid())
                clip->lengthBeats = juce::jmax (0.25, (double) entry.getProperty ("lengthBeats", clip->lengthBeats));

            if (! entry.getProperty ("trackIndex", juce::var()).isVoid())
            {
                const auto nextIndex = (int) entry.getProperty ("trackIndex", clip->trackIndex);
                if (auto* dest = project.getTrack (nextIndex))
                    if (! dest->isMaster() && ! dest->isGroup())
                        clip->trackIndex = nextIndex;
            }
        }

        invalidateSequence();
        notify (clipsChanged);
        return makeOk();
    }

    if (type == "track.group")
    {
        auto* ids = message.getProperty ("trackIds", juce::var()).getArray();

        if (ids == nullptr || ids->isEmpty())
            return makeError ("Missing trackIds");

        int insertAt = project.getNumTracks();
        std::vector<TrackId> members;

        for (const auto& value : *ids)
        {
            const auto id = (TrackId) (int) value;
            const auto index = project.indexOfTrack (id);
            auto* track = project.getTrack (index);

            if (track == nullptr || track->isMaster() || track->isGroup())
                continue;

            members.push_back (id);
            insertAt = juce::jmin (insertAt, index);
        }

        if (members.empty())
            return makeError ("No tracks to group");

        const auto groupName = message.getProperty ("name", toVar ("Group")).toString();
        const auto groupIndex = project.addTrack (TrackType::Group,
                                                  groupName.isNotEmpty() ? groupName : "Group",
                                                  juce::Colour (0xff3a3a3a));

        if (groupIndex < 0)
            return makeError ("Could not create group");

        project.moveTrack (groupIndex, juce::jmax (1, insertAt));
        auto* group = project.getTrack (juce::jmax (1, insertAt));

        if (group == nullptr)
            return makeError ("Could not create group");

        for (auto id : members)
            if (auto* track = project.findTrack (id))
                track->parentId = group->id;

        auto* object = new juce::DynamicObject();
        object->setProperty ("trackId", (int) group->id);
        notify (tracksChanged);
        return makeOk (object);
    }

    if (type == "track.ungroup")
    {
        auto* group = project.findTrack ((TrackId) getInt (message, "trackId", 0));

        if (group == nullptr || ! group->isGroup())
            return makeError ("Not a group");

        const auto groupId = group->id;

        for (int i = 0; i < project.getNumTracks(); ++i)
            if (auto* track = project.getTrack (i))
                if (track->parentId == groupId)
                    track->parentId = 0;

        const auto index = project.indexOfTrack (groupId);

        if (index >= 0)
            project.removeTrack (index);

        notify (tracksChanged);
        return makeOk();
    }

    if (type == "track.setCollapsed")
    {
        auto* track = project.findTrack ((TrackId) getInt (message, "trackId", 0));

        if (track == nullptr)
            return makeError ("Unknown trackId");

        track->collapsed = getBool (message, "collapsed", ! track->collapsed);
        notify (tracksChanged);
        return makeOk();
    }

    if (type == "marker.create")
    {
        ArrangementMarker marker;
        marker.name = message.getProperty ("name", toVar ("Marker")).toString();
        marker.startBeat = juce::jmax (0.0, getDouble (message, "startBeat", getDouble (message, "beats", 0.0)));
        marker.section = message.getProperty ("section", juce::var()).toString();
        const auto index = project.addMarker (marker);
        notify (projectChanged);
        auto* object = new juce::DynamicObject();
        if (const auto* created = (index >= 0 && index < (int) project.getMarkers().size())
                                    ? &project.getMarkers()[(size_t) index] : nullptr)
            object->setProperty ("markerId", (int) created->id);
        return makeOk (object);
    }

    if (type == "marker.update")
    {
        auto* marker = project.findMarker ((MarkerId) getInt (message, "markerId", 0));

        if (marker == nullptr)
            return makeError ("Unknown markerId");

        if (! getProperty (message, "name").isVoid())
            marker->name = message.getProperty ("name", juce::var()).toString();

        if (! getProperty (message, "startBeat", "beats").isVoid())
            marker->startBeat = juce::jmax (0.0, (double) getProperty (message, "startBeat", "beats"));

        if (! getProperty (message, "section").isVoid())
            marker->section = message.getProperty ("section", juce::var()).toString();

        notify (projectChanged);
        return makeOk();
    }

    if (type == "marker.delete")
    {
        if (! project.removeMarker ((MarkerId) getInt (message, "markerId", 0)))
            return makeError ("Unknown markerId");

        notify (projectChanged);
        return makeOk();
    }

    if (type == "edit.begin")
    {
        beginEdit (message.getProperty ("name", toVar ("Edit")).toString());
        return makeOk();
    }

    if (type == "edit.end")
    {
        endEdit();
        return makeOk();
    }

    if (type == "edit.undo")
    {
        if (! canUndo())
            return makeError ("Nothing to undo");

        undoEdit();
        return makeOk();
    }

    if (type == "edit.redo")
    {
        if (! canRedo())
            return makeError ("Nothing to redo");

        redoEdit();
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "note.create")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        MidiNote note;
        applyNoteFields (note, message);

        if (! noteVarHas (message, "durationTick") && ! noteVarHas (message, "duration") && ! noteVarHas (message, "lengthBeats"))
            note.setDurationTick (NoteModel::defaultDurationTicks);

        if (! noteVarHas (message, "velocity"))
            note.setVelocityMidi (100);

        const auto noteId = project.addNote (clip->id, note);
        invalidateSequence();

        if (auto* created = clip->findNote (noteId))
        {
            auto* delta = new juce::DynamicObject();
            delta->setProperty ("clipId", (int) clip->id);
            juce::Array<juce::var> createdNotes;
            createdNotes.add (noteToEngineVar (*created));
            delta->setProperty ("created", createdNotes);
            pendingNoteDelta = juce::var (delta);
        }

        notify (notesChanged);

        auto* object = new juce::DynamicObject();
        object->setProperty ("noteId", (int) noteId);
        return makeOk (object);
    }

    if (type == "note.delete")
    {
        const auto clipId = (ClipId) getInt (message, "clipId", 0);

        if (! project.removeNote (clipId, (NoteId) getInt (message, "noteId", 0)))
            return makeError ("Unknown clipId or noteId");

        auto* delta = new juce::DynamicObject();
        delta->setProperty ("clipId", (int) clipId);
        juce::Array<juce::var> deleted;
        deleted.add (getInt (message, "noteId", 0));
        delta->setProperty ("deleted", deleted);
        pendingNoteDelta = juce::var (delta);

        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    if (type == "notes.updateBatch" || type == "notes.batchUpdate")
    {
        const auto clipId = (ClipId) getInt (message, "clipId", 0);
        auto* clip = project.findClip (clipId);

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        auto* patches = message.getProperty ("notes", juce::var()).getArray();

        if (patches == nullptr || patches->isEmpty())
            return makeError ("Missing notes");

        project.updateNotesBatch (clipId, *patches);

        auto* delta = new juce::DynamicObject();
        delta->setProperty ("clipId", (int) clipId);
        juce::Array<juce::var> updated;
        for (const auto& patch : *patches)
            if (auto* note = clip->findNote ((NoteId) (int) noteVarGet (patch, "id", "noteId")))
                updated.add (noteToEngineVar (*note));
        delta->setProperty ("updated", updated);
        pendingNoteDelta = juce::var (delta);

        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    if (type == "notes.deleteBatch")
    {
        const auto clipId = (ClipId) getInt (message, "clipId", 0);
        auto* ids = message.getProperty ("noteIds", juce::var()).getArray();

        if (ids == nullptr)
            return makeError ("Missing noteIds");

        std::vector<NoteId> noteIds;
        juce::Array<juce::var> deleted;
        for (const auto& id : *ids)
        {
            noteIds.push_back ((NoteId) (int) id);
            deleted.add ((int) id);
        }

        if (! project.removeNotes (clipId, noteIds))
            return makeError ("Unknown clipId or noteId");

        auto* delta = new juce::DynamicObject();
        delta->setProperty ("clipId", (int) clipId);
        delta->setProperty ("deleted", deleted);
        pendingNoteDelta = juce::var (delta);
        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    if (type == "notes.createBatch")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        auto* patches = message.getProperty ("notes", juce::var()).getArray();

        if (patches == nullptr)
            return makeError ("Missing notes");

        juce::Array<juce::var> created;
        juce::Array<juce::var> ids;

        for (const auto& patch : *patches)
        {
            MidiNote note;
            applyNoteFields (note, patch);
            const auto noteId = project.addNote (clip->id, note);
            ids.add ((int) noteId);
            if (auto* made = clip->findNote (noteId))
                created.add (noteToEngineVar (*made));
        }

        auto* delta = new juce::DynamicObject();
        delta->setProperty ("clipId", (int) clip->id);
        delta->setProperty ("created", created);
        pendingNoteDelta = juce::var (delta);
        invalidateSequence();
        notify (notesChanged);

        auto* object = new juce::DynamicObject();
        object->setProperty ("noteIds", ids);
        return makeOk (object);
    }

    if (type == "timeSignature.setMap")
    {
        project.getTimeSignatureChanges().clear();
        if (auto* changes = message.getProperty ("changes", juce::var()).getArray())
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
        notify (projectChanged | tempoChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "factory.recapture")
    {
        const auto presetId = getProperty (message, "presetId", "id").toString();

        if (presetId.isEmpty())
            return makeError ("Missing presetId");

        if (! tryRecaptureFactoryPreset (presetId))
            return makeError ("Could not recapture " + presetId);

        auto* object = new juce::DynamicObject();
        object->setProperty ("presetId", presetId);
        return makeOk (object);
    }

    if (type == "plugin.insert")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        const auto pluginId = getProperty (message, "pluginId", "id").toString();

        if (pluginId.isEmpty())
            return makeError ("Missing pluginId");

        return insertTrackPlugin (index, pluginId);
    }

    if (type == "instrument.load" || type == "instrument.select")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        const auto definitionId = getProperty (message, "definitionId", "instrumentId").toString();

        if (definitionId.isEmpty())
            return makeError ("Missing instrumentId");

        const auto* definition = instruments.findDefinition (definitionId);

        if (definition == nullptr)
            return makeError ("Unknown instrument: " + definitionId);

        loadTrackInstrument (index, definitionId);
        notify (tracksChanged | mixerChanged);
        return instrumentStatusReply (index);
    }

    if (type == "instrument.playTest")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        playValidationPhrase (index, getInt (message, "velocity", 80), false);
        return makeOk();
    }

    if (type == "instrument.setTechnique" || type == "instrument.technique")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        if (! setTrackTechnique (index, message.getProperty ("techniqueId", juce::var()).toString()))
            return makeError ("Technique is unavailable");

        return makeOk();
    }

    if (type == "instrument.setController" || type == "instrument.controller.set")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        if (! setTrackController (index, message.getProperty ("controllerId", juce::var()).toString(),
                                  (float) getDouble (message, "value", 0.0)))
            return makeError ("Controller is unavailable");

        return makeOk();
    }

    if (type == "instrument.setLegato" || type == "instrument.legato")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        if (! setTrackLegato (index, (bool) message.getProperty ("legato", false)))
            return makeError ("Legato could not be set");

        return makeOk();
    }

    if (type == "instrument.controller.get")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        const auto controllerId = message.getProperty ("controllerId", juce::var()).toString();
        auto* payload = new juce::DynamicObject();
        payload->setProperty ("controllerId", controllerId);
        payload->setProperty ("value", getTrackController (index, controllerId));
        return makeOk (payload);
    }

    if (type == "instrument.capabilities" || type == "instrument.getCapabilities")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));
        auto definitionId = getProperty (message, "definitionId", "instrumentId").toString();

        if (definitionId.isEmpty() && index >= 0)
            if (const auto* track = project.getTrack (index))
                definitionId = track->instrumentDefinitionId;

        return describeInstrumentCapabilities (definitionId);
    }

    if (type == "instrument.state" || type == "instrument.getState")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        return describeInstrumentState (index);
    }

    if (type == "instrument.controls" || type == "instrument.getControls")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        return describeInstrumentControls (index);
    }

    if (type == "instrument.unload")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        unloadTrackInstrument (index);
        return makeOk();
    }

    if (type == "preview.noteOn")
    {
        auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            index = getInt (message, "trackIndex", -1);

        if (index < 0)
            return makeError ("Unknown trackId");

        previewNoteOn (index,
                       juce::jlimit (0, 127, getInt (message, "pitch", 60)),
                       (float) juce::jlimit (0.0, 1.0, getDouble (message, "velocity", 0.8)));
        return makeOk();
    }

    if (type == "preview.noteOff")
    {
        auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            index = getInt (message, "trackIndex", -1);

        if (index < 0)
            return makeError ("Unknown trackId");

        previewNoteOff (index, juce::jlimit (0, 127, getInt (message, "pitch", 60)));
        return makeOk();
    }

    if (type == "preview.allNotesOff")
    {
        allNotesOff();
        return makeOk();
    }

    if (type == "note.set" || type == "note.update")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        auto* note = clip->findNote ((NoteId) getInt (message, "noteId", 0));

        if (note == nullptr)
            return makeError ("Unknown noteId");

        if (! getProperty (message, "pitch").isVoid())
            note->pitch = juce::jlimit (0, 127, getInt (message, "pitch", note->pitch));

        applyNoteFields (*note, message);

        auto* delta = new juce::DynamicObject();
        delta->setProperty ("clipId", (int) clip->id);
        juce::Array<juce::var> updated;
        updated.add (noteToEngineVar (*note));
        delta->setProperty ("updated", updated);
        pendingNoteDelta = juce::var (delta);

        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    if (type == "instrument.getCatalogue")
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("catalogue", describeCatalogue());
        return makeOk (object);
    }

    if (type == "mixer.setMasterVolume")
    {
        if (! message.getProperty ("volumeDb", juce::var()).isVoid())
            project.setMasterGainPosition (DawUnits::dbToFader ((float) juce::jlimit (
                (double) MixerIds::volumeDbMin, (double) MixerIds::volumeDbMax,
                getDouble (message, "volumeDb", 0.0))));
        else
            project.setMasterGainPosition ((float) juce::jlimit (0.0, 1.0, getDouble (message, "value", 0.8)));
        syncMixer();
        notify (mixerChanged);
        return makeOk();
    }

    if (type == "mixer.getState")
        return withOk (describeMixer());

    if (type == "mixer.setState")
    {
        if (auto* tracks = message.getProperty ("tracks", juce::var()).getArray())
        {
            for (const auto& entry : *tracks)
            {
                auto* track = project.findTrack ((TrackId) (int) entry.getProperty ("id",
                                                     entry.getProperty ("trackId", 0)));
                if (track == nullptr)
                    continue;

                if (! entry.getProperty ("volumeDb", juce::var()).isVoid())
                    track->volume = DawUnits::dbToFader ((float) juce::jlimit (
                        (double) MixerIds::volumeDbMin, (double) MixerIds::volumeDbMax,
                        (double) entry.getProperty ("volumeDb", track->getVolumeDb())));
                else if (! entry.getProperty ("volume", juce::var()).isVoid())
                    track->volume = (float) juce::jlimit (0.0, 1.0, (double) entry.getProperty ("volume", track->volume));
                if (! entry.getProperty ("pan", juce::var()).isVoid())
                    track->pan = (float) juce::jlimit (-1.0, 1.0, (double) entry.getProperty ("pan", track->pan));
                if (! entry.getProperty ("mute", juce::var()).isVoid())
                    track->mute = (bool) entry.getProperty ("mute", track->mute);
                if (! entry.getProperty ("solo", juce::var()).isVoid())
                    track->solo = (bool) entry.getProperty ("solo", track->solo);

                if (auto* sends = entry.getProperty ("sends", juce::var()).getArray())
                {
                    for (const auto& sendVar : *sends)
                    {
                        const auto sendId = sendVar.getProperty ("id", juce::var()).toString();
                        for (auto& send : track->sends)
                            if (send.id == sendId)
                            {
                                if (! sendVar.getProperty ("level", juce::var()).isVoid())
                                    send.level = (float) juce::jlimit (0.0, 1.0, (double) sendVar.getProperty ("level", send.level));
                                if (! sendVar.getProperty ("enabled", juce::var()).isVoid())
                                    send.enabled = (bool) sendVar.getProperty ("enabled", send.enabled);
                            }
                    }
                }
            }
        }

        if (auto* master = message.getProperty ("master", juce::var()).getDynamicObject())
        {
            const auto volumeDb = master->getProperty ("volumeDb");
            if (! volumeDb.isVoid())
                project.setMasterGainPosition (DawUnits::dbToFader ((float) juce::jlimit (
                    (double) MixerIds::volumeDbMin, (double) MixerIds::volumeDbMax, (double) volumeDb)));
            else
            {
                const auto volume = master->getProperty ("volume");
                if (! volume.isVoid())
                    project.setMasterGainPosition ((float) juce::jlimit (0.0, 1.0, (double) volume));
            }
        }

        syncMixer();
        notify (mixerChanged | tracksChanged);
        return makeOk();
    }

    if (type == "mixer.setWebMixer")
    {
        const auto webMixer = message.getProperty ("webMixer", juce::var());
        project.setWebMixer (webMixer);
        applyWebMixerInserts (webMixer);
        notify (mixerChanged | projectChanged);
        const auto insertError = validateWebMixerInsertLimit (webMixer);
        if (insertError.isNotEmpty())
            return makeError (insertError);
        return makeOk();
    }

    if (type == "sampler.load")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));
        auto* track = project.getTrack (index);

        if (track == nullptr || track->isMaster())
            return makeError ("Unknown trackId");

        unloadTrackInstrument (index, "Switched to web sampler");
        track->instrumentSource = ProjectSchema::sourceWebSampler;
        track->instrument = message.getProperty ("name", "Web Sampler").toString();
        track->instrumentDefinitionId = message.getProperty ("instrumentId", "web_sampler").toString();
        track->instrumentLoadState = InstrumentLoadState::Loaded;
        track->instrumentLoadMessage = "Web sampler (browser)";
        notify (tracksChanged);
        return instrumentStatusReply (index);
    }

    if (type == "sampler.unload")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));
        auto* track = project.getTrack (index);

        if (track == nullptr)
            return makeError ("Unknown trackId");

        if (track->instrumentSource == ProjectSchema::sourceWebSampler)
        {
            track->instrumentSource = ProjectSchema::sourceEmpty;
            track->instrumentDefinitionId.clear();
            track->instrument.clear();
            track->instrumentLoadState = InstrumentLoadState::Unloaded;
            track->instrumentLoadMessage.clear();
        }

        notify (tracksChanged);
        return instrumentStatusReply (index);
    }

    if (type == "engine.getStatus")
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("clock", describeClock());
        object->setProperty ("project", describeProject());
        return makeOk (object);
    }

    return makeError ("Unknown command: " + type);
}

//==============================================================================
juce::var EngineAPI::describeProject() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("name", project.getName());
    root->setProperty ("schemaVersion", ProjectSchema::currentVersion);
    root->setProperty ("sessionId", sessionId);
    root->setProperty ("bpm", project.getBpm());
    root->setProperty ("timeSigNumerator", project.getTimeSigNumerator());
    root->setProperty ("timeSigDenominator", project.getTimeSigDenominator());
    root->setProperty ("ticksPerQuarterNote", (int) MusicalTime::ticksPerQuarterNote);
    root->setProperty ("positionBeats", getPositionBeats());
    root->setProperty ("playing", isPlaying());
    root->setProperty ("looping", engine.isLooping());
    root->setProperty ("loopStart", loopStartBeats);
    root->setProperty ("loopEnd", loopEndBeats);
    root->setProperty ("metronome", engine.isMetronomeEnabled());
    root->setProperty ("masterGain", project.getMasterGainPosition());
    root->setProperty ("engineRunning", engine.isRunning());
    root->setProperty ("engineStatus", engine.getStatusDescription());
    root->setProperty ("canUndo", canUndo());
    root->setProperty ("canRedo", canRedo());

    auto userName = juce::SystemStats::getFullUserName();
    if (userName.isEmpty())
        userName = juce::SystemStats::getLogonName();
    root->setProperty ("userName", userName.isNotEmpty() ? userName : juce::String ("User"));

    juce::Array<juce::var> trackArray;

    for (int i = 0; i < project.getNumTracks(); ++i)
    {
        const auto* track = project.getTrack (i);

        if (track == nullptr)
            continue;

        auto* object = new juce::DynamicObject();
        object->setProperty ("trackId", (int) track->id);
        object->setProperty ("index", i);
        object->setProperty ("name", track->name);
        object->setProperty ("type", trackTypeName (track->type));
        object->setProperty ("parentId", (int) track->parentId);
        object->setProperty ("collapsed", track->collapsed);
        object->setProperty ("instrumentId", track->instrumentSlot.instrumentId);
        object->setProperty ("instrument", track->instrument);
        object->setProperty ("section", track->section);
        object->setProperty ("definitionId", track->instrumentDefinitionId);
        object->setProperty ("source", track->instrumentSource.isNotEmpty()
                                           ? track->instrumentSource
                                           : ProjectSchema::inferSource ({}, track->instrumentDefinitionId));
        object->setProperty ("presetId", track->presetId);
        object->setProperty ("techniqueId", track->techniqueId);
        object->setProperty ("legato", track->legatoEnabled);
        object->setProperty ("loadState", instrumentLoadStateLabel (track->instrumentLoadState));
        object->setProperty ("status", instrumentStatusToken (track->instrumentLoadState));
        object->setProperty ("loadMessage", track->instrumentLoadMessage);
        object->setProperty ("midiChannel", track->midiChannel);
        object->setProperty ("volume", track->volume);
        object->setProperty ("volumeDb", track->getVolumeDb());
        object->setProperty ("pan", track->pan);
        object->setProperty ("mute", track->mute);
        object->setProperty ("solo", track->solo);
        object->setProperty ("recordArm", track->recordArm);
        object->setProperty ("colour", colourToHex (track->colour));

        auto* controllerObject = new juce::DynamicObject();
        for (const auto& [id, value] : track->controllerValues)
            controllerObject->setProperty (id, value);
        object->setProperty ("controllerValues", juce::var (controllerObject));

        juce::Array<juce::var> sendArray;
        for (const auto& send : track->sends)
        {
            auto* sendObject = new juce::DynamicObject();
            sendObject->setProperty ("id", send.id);
            sendObject->setProperty ("name", send.name);
            sendObject->setProperty ("destination", send.destination);
            sendObject->setProperty ("level", send.level);
            sendObject->setProperty ("enabled", send.enabled);
            sendObject->setProperty ("preFader", send.preFader);
            sendArray.add (juce::var (sendObject));
        }
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
        object->setProperty ("clipId", (int) clip.id);
        object->setProperty ("trackIndex", clip.trackIndex);
        object->setProperty ("name", clip.name);
        object->setProperty ("start", clip.startBeat);
        object->setProperty ("length", clip.lengthBeats);
        object->setProperty ("colour", colourToHex (clip.colour));
        object->setProperty ("midi", clip.midi);
        object->setProperty ("kind", clipKindName (clip.kind));
        object->setProperty ("muted", clip.muted);
        object->setProperty ("loopCount", clip.loopCount);
        object->setProperty ("loopLengthBeats", clip.loopLengthBeats);
        object->setProperty ("sourceId", clip.sourceId);
        object->setProperty ("audioOffsetBeats", clip.audioOffsetBeats);

        juce::Array<juce::var> noteArray;

        for (const auto& note : clip.notes)
            noteArray.add (noteToEngineVar (note));

        object->setProperty ("notes", noteArray);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);

    juce::Array<juce::var> markerArray;
    for (const auto& marker : project.getMarkers())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("markerId", (int) marker.id);
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
    root->setProperty ("timeSignatures", timeSigArray);

    auto* score = new juce::DynamicObject();
    score->setProperty ("ppq", (int) MusicalTime::ticksPerQuarterNote);
    score->setProperty ("timeSignatures", timeSigArray);
    score->setProperty ("markers", markerArray);
    root->setProperty ("score", juce::var (score));

    if (! project.getWebMixer().isVoid())
        root->setProperty ("webMixer", project.getWebMixer());
    return juce::var (root);
}

juce::var EngineAPI::describeClock() const
{
    auto* root = new juce::DynamicObject();
    root->setProperty ("type", "event.clock");
    root->setProperty ("positionBeats", getPositionBeats());
    root->setProperty ("playing", isPlaying());
    root->setProperty ("looping", engine.isLooping());
    root->setProperty ("bpm", project.getBpm());
    root->setProperty ("masterLevel", getMasterLevel());
    root->setProperty ("masterRms", engine.getMixer().getMasterRms());
    root->setProperty ("masterClip", engine.getMixer().isMasterClipping());
    root->setProperty ("engineRunning", engine.isRunning());
    root->setProperty ("engineStatus", engine.getStatusDescription());
    root->setProperty ("hostTimeMs", juce::Time::getMillisecondCounterHiRes());

    juce::Array<juce::var> levels;
    for (int i = 0; i < project.getNumTracks(); ++i)
        levels.add (getTrackLevel (i));
    root->setProperty ("levels", levels);
    return juce::var (root);
}

juce::var EngineAPI::describeNotes() const
{
    auto* root = new juce::DynamicObject();
    juce::Array<juce::var> clipArray;

    for (const auto& clip : project.getClips())
    {
        auto* object = new juce::DynamicObject();
        object->setProperty ("clipId", (int) clip.id);
        juce::Array<juce::var> noteArray;
        for (const auto& note : clip.notes)
            noteArray.add (noteToEngineVar (note));
        object->setProperty ("notes", noteArray);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);
    return juce::var (root);
}

juce::var EngineAPI::takeNoteDelta()
{
    auto delta = pendingNoteDelta;
    pendingNoteDelta = juce::var();
    return delta;
}

void EngineAPI::ensureStarterContent()
{
    if (project.getNumTracks() > 1)
        return;

    loadDemoOrchestra();
}

void EngineAPI::loadDemoOrchestra()
{
    stop();
    seekToBeats (0.0);
    clearAllHostedInstruments();
    project.clear();
    project.setName ("Untitled Orchestra");
    project.setBpm (96.0);
    project.setTimeSignature (4, 4);
    project.setMasterGainPosition (0.8f);
    setLoopRangeBeats (0.0, demoLengthBeats);

    if (auto* master = project.getTrack (0))
        master->inserts = { PluginSlot {}, PluginSlot {}, PluginSlot {}, PluginSlot {}, PluginSlot {} };

    juce::String currentSection;
    TrackId sectionParent = 0;

    for (const auto& spec : demoTracks)
    {
        if (currentSection != spec.section)
        {
            currentSection = spec.section;
            const auto groupIndex = project.addTrack (TrackType::Group, spec.section, juce::Colour (0xff3a3a3a));

            if (auto* group = project.getTrack (groupIndex))
            {
                group->section = spec.section;
                sectionParent = group->id;
            }
        }

        const auto index = project.addTrack (TrackType::Midi, spec.name, juce::Colour (spec.colour));
        auto* track = project.getTrack (index);

        if (track == nullptr)
            continue;

        track->parentId = sectionParent;
        track->section = spec.section;
        track->volume = spec.volume;
        track->pan = spec.pan;
        track->inserts = { PluginSlot {}, PluginSlot {}, PluginSlot {}, PluginSlot {}, PluginSlot {} };
        track->automation.parameterName = "Volume";
        track->automation.points = { { 0.0, spec.volume }, { 16.0, spec.volume },
                                     { 24.0, juce::jlimit (0.0f, 1.0f, spec.volume + 0.12f) },
                                     { 32.0, spec.volume } };

        loadTrackInstrument (index, spec.instrumentId, false);
        setTrackTechnique (index, spec.techniqueId);

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
            clip.kind = ClipKind::Midi;
            clip.loopLengthBeats = clip.lengthBeats;
            fillChordNotes (clip, spec);
            project.addClip (clip);
        }
    }

    ArrangementMarker intro;
    intro.name = "Intro";
    intro.startBeat = 0.0;
    intro.section = "A";
    project.addMarker (intro);

    ArrangementMarker climax;
    climax.name = "Climax";
    climax.startBeat = 32.0;
    climax.section = "B";
    project.addMarker (climax);

    syncMixer();
    syncTempo();
    invalidateSequence();
    flushPendingUpdates();
    notify (projectChanged | tracksChanged | clipsChanged | notesChanged | mixerChanged
            | tempoChanged | transportChanged);
}

EngineAPI::EditSnapshot EngineAPI::captureEdit (const juce::String& name) const
{
    EditSnapshot snapshot;
    snapshot.name = name;
    snapshot.project = project;
    snapshot.loopStart = loopStartBeats;
    snapshot.loopEnd = loopEndBeats;
    snapshot.looping = engine.isLooping();
    return snapshot;
}

void EngineAPI::restoreEdit (const EditSnapshot& snapshot)
{
    project = snapshot.project;
    loopStartBeats = snapshot.loopStart;
    loopEndBeats = snapshot.loopEnd;
    setLooping (snapshot.looping);
    setLoopRangeBeats (loopStartBeats, loopEndBeats);
    syncMixer();
    syncTempo();
    invalidateSequence();
    flushPendingUpdates();
    notify (projectChanged | tracksChanged | clipsChanged | notesChanged | mixerChanged
            | tempoChanged | transportChanged);
}

void EngineAPI::beginEdit (const juce::String& name)
{
    if (editOpen)
        return;

    undoStack.push_back (captureEdit (name.isNotEmpty() ? name : "Edit"));

    if ((int) undoStack.size() > maxUndoSteps)
        undoStack.erase (undoStack.begin());

    redoStack.clear();
    editOpen = true;
}

void EngineAPI::endEdit()
{
    editOpen = false;
}

void EngineAPI::undoEdit()
{
    if (undoStack.empty())
        return;

    endEdit();
    redoStack.push_back (captureEdit (undoStack.back().name));
    restoreEdit (undoStack.back());
    undoStack.pop_back();
}

void EngineAPI::redoEdit()
{
    if (redoStack.empty())
        return;

    endEdit();
    undoStack.push_back (captureEdit (redoStack.back().name));
    restoreEdit (redoStack.back());
    redoStack.pop_back();
}
