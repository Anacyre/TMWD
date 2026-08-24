#include "EngineAPI.h"
#include "../Model/ProjectFile.h"
#include "../Plugins/OrchestraSamplerModel.h"
#include <algorithm>
#include <functional>
#include <limits>
#include <memory>

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

void EngineAPI::clearAllHostedInstruments()
{
    cancelAllLoads();
    engine.allNotesOff();

    for (int i = 1; i < project.getNumTracks(); ++i)
        engine.clearTrackInstrument (i);

    collectUnusedInstrumentsLater();
}

void EngineAPI::loadTrackInstrument (int trackIndex, const juce::String& definitionId, bool async)
{
    InstrumentLoadOptions options;
    options.async = async;
    loadTrackInstrument (trackIndex, definitionId, options);
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

    const auto* plugin = instruments.find (definition->sourcePlugin);

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
            juce::Thread::sleep (settleMs);

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

    if (track == nullptr || technique == nullptr)
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
    clearAllHostedInstruments();

    sequenceDirty = true;
    mixerDirty = true;
    tempoDirty = true;
    flushPendingUpdates();

    for (int i = 1; i < project.getNumTracks(); ++i)
    {
        auto* track = project.getTrack (i);

        if (track == nullptr || ! track->isMidi() || track->instrumentDefinitionId.isEmpty())
            continue;

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
        object->setProperty ("stateAvailable", preset != nullptr && preset->stateAvailable);
        object->setProperty ("availabilityStatus", describeDefinitionAvailability (definition, 1));
        object->setProperty ("available", plugin != nullptr && plugin->isAvailable()
                                             && (definition.sourcePlugin == InstrumentRegistry::testSynthId
                                                 || (preset != nullptr && preset->stateAvailable)));
        object->setProperty ("techniques", definition.techniques);
        object->setProperty ("controllers", definition.controllers);
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

    if (type == "transport.setBpm")
    {
        project.setBpm (getDouble (message, "bpm", project.getBpm()));
        syncTempo();
        notify (tempoChanged | projectChanged);
        return makeOk();
    }

    if (type == "transport.setLoop")
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

    if (type == "transport.setTimeSignature")
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
        const auto trackType = kind == "audio" ? TrackType::Audio : TrackType::Midi;
        const auto colour = remoteTrackPalette[(size_t) (project.getNumTracks() % (int) std::size (remoteTrackPalette))];
        const auto index = project.addTrack (trackType,
                                             name.isNotEmpty() ? name
                                                               : (trackType == TrackType::Audio ? "Audio" : "MIDI"),
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

    if (type == "track.setParameter")
    {
        auto* track = project.findTrack ((TrackId) getInt (message, "trackId", 0));

        if (track == nullptr)
            return makeError ("Unknown trackId");

        const auto parameter = message.getProperty ("parameter", juce::var()).toString();

        if (parameter == "volume")      track->volume = (float) juce::jlimit (0.0, 1.0, getDouble (message, "value", track->volume));
        else if (parameter == "pan")    track->pan = (float) juce::jlimit (-1.0, 1.0, getDouble (message, "value", track->pan));
        else if (parameter == "mute")   track->mute = getBool (message, "value", track->mute);
        else if (parameter == "solo")   track->solo = getBool (message, "value", track->solo);
        else if (parameter == "recordArm") track->recordArm = getBool (message, "value", track->recordArm);
        else if (parameter == "name")   track->name = message.getProperty ("value", juce::var()).toString();
        else return makeError ("Unknown parameter: " + parameter);

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

        if (track == nullptr || track->isMaster())
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
                if (! dest->isMaster())
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

    //--------------------------------------------------------------------------
    if (type == "note.create")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        MidiNote note;
        note.pitch = juce::jlimit (0, 127, getInt (message, "pitch", 60));
        note.startBeat = juce::jmax (0.0, getDouble (message, "start", 0.0));
        note.lengthBeats = juce::jmax (0.0625, getDouble (message, "duration", 1.0));
        note.velocity = (float) juce::jlimit (0.0, 1.0, getDouble (message, "velocity", 100.0) / 127.0);

        const auto noteId = project.addNote (clip->id, note);
        invalidateSequence();
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

        invalidateSequence();
        notify (notesChanged);
        return makeOk();
    }

    //--------------------------------------------------------------------------
    if (type == "instrument.load" || type == "instrument.select")
    {
        const auto index = project.indexOfTrack ((TrackId) getInt (message, "trackId", 0));

        if (index < 0)
            return makeError ("Unknown trackId");

        const auto definitionId = getProperty (message, "definitionId", "instrumentId").toString();
        loadTrackInstrument (index, definitionId);
        notify (tracksChanged | mixerChanged);
        return makeOk();
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

    if (type == "note.set")
    {
        auto* clip = project.findClip ((ClipId) getInt (message, "clipId", 0));

        if (clip == nullptr)
            return makeError ("Unknown clipId");

        auto* note = clip->findNote ((NoteId) getInt (message, "noteId", 0));

        if (note == nullptr)
            return makeError ("Unknown noteId");

        if (! getProperty (message, "pitch").isVoid())
            note->pitch = juce::jlimit (0, 127, getInt (message, "pitch", note->pitch));

        if (! getProperty (message, "start").isVoid())
            note->startBeat = juce::jmax (0.0, getDouble (message, "start", note->startBeat));

        if (! getProperty (message, "duration").isVoid())
            note->lengthBeats = juce::jmax (0.0625, getDouble (message, "duration", note->lengthBeats));

        if (! getProperty (message, "velocity").isVoid())
            note->velocity = (float) juce::jlimit (0.0, 1.0, getDouble (message, "velocity", 100.0) / 127.0);

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
        project.setMasterGainPosition ((float) juce::jlimit (0.0, 1.0, getDouble (message, "value", 0.8)));
        syncMixer();
        notify (mixerChanged);
        return makeOk();
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
        object->setProperty ("type", track->isMaster() ? "master" : (track->isMidi() ? "midi" : "audio"));
        object->setProperty ("instrumentId", track->instrumentSlot.instrumentId);
        object->setProperty ("instrument", track->instrument);
        object->setProperty ("section", track->section);
        object->setProperty ("definitionId", track->instrumentDefinitionId);
        object->setProperty ("presetId", track->presetId);
        object->setProperty ("techniqueId", track->techniqueId);
        object->setProperty ("loadState", instrumentLoadStateLabel (track->instrumentLoadState));
        object->setProperty ("loadMessage", track->instrumentLoadMessage);
        object->setProperty ("midiChannel", track->midiChannel);
        object->setProperty ("volume", track->volume);
        object->setProperty ("pan", track->pan);
        object->setProperty ("mute", track->mute);
        object->setProperty ("solo", track->solo);
        object->setProperty ("recordArm", track->recordArm);
        object->setProperty ("colour", colourToHex (track->colour));

        auto* controllerObject = new juce::DynamicObject();
        for (const auto& [id, value] : track->controllerValues)
            controllerObject->setProperty (id, value);
        object->setProperty ("controllerValues", juce::var (controllerObject));

        juce::Array<juce::var> insertArray;
        for (const auto& slot : track->inserts)
        {
            auto* insertObject = new juce::DynamicObject();
            insertObject->setProperty ("name", slot.name);
            insertObject->setProperty ("bypassed", slot.bypassed);
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

        juce::Array<juce::var> noteArray;

        for (const auto& note : clip.notes)
        {
            auto* noteObject = new juce::DynamicObject();
            noteObject->setProperty ("noteId", (int) note.id);
            noteObject->setProperty ("pitch", note.pitch);
            noteObject->setProperty ("start", note.startBeat);
            noteObject->setProperty ("duration", note.lengthBeats);
            noteObject->setProperty ("velocity", (int) note.getVelocityByte());
            noteArray.add (juce::var (noteObject));
        }

        object->setProperty ("notes", noteArray);
        clipArray.add (juce::var (object));
    }

    root->setProperty ("clips", clipArray);
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
    root->setProperty ("engineRunning", engine.isRunning());
    root->setProperty ("engineStatus", engine.getStatusDescription());

    juce::Array<juce::var> levels;
    for (int i = 0; i < project.getNumTracks(); ++i)
        levels.add (getTrackLevel (i));
    root->setProperty ("levels", levels);
    return juce::var (root);
}

void EngineAPI::ensureStarterContent()
{
    if (project.getNumTracks() > 1)
        return;

    const auto colour = remoteTrackPalette[0];
    const auto index = project.addTrack (TrackType::Midi, "Piano", colour);

    if (auto* track = project.getTrack (index))
    {
        track->instrumentSlot.instrumentId = InstrumentRegistry::testSynthId;
        track->instrumentSlot.name = instruments.getDisplayName (InstrumentRegistry::testSynthId);
        track->instrument = track->instrumentSlot.name;
        track->instrumentDefinitionId = InstrumentRegistry::testSynthId;
    }

    ClipData clip;
    clip.trackIndex = index;
    clip.startBeat = 0.0;
    clip.lengthBeats = 8.0;
    clip.name = "Sketch";
    clip.colour = colour;
    clip.midi = true;
    fillSketchNotes (clip);
    project.addClip (clip);

    syncMixer();
    invalidateSequence();
    flushPendingUpdates();
    notify (tracksChanged | clipsChanged | notesChanged | mixerChanged);
}
