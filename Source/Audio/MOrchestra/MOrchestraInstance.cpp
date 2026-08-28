#include "MOrchestraInstance.h"
#include <cmath>

namespace MOrchestra
{
namespace
{
    uint32_t mixHash (uint32_t hash, uint32_t value)
    {
        hash ^= value;
        hash *= 16777619u;
        return hash;
    }

    float hash01 (uint32_t hash)
    {
        return (float) (hash & 0x00ffffffu) / 16777215.0f;
    }

    float centsRatio (float cents)
    {
        return std::pow (2.0f, cents / 1200.0f);
    }

    bool isSustaining (Articulation artic)
    {
        return artic == Articulation::longArt || artic == Articulation::sustain;
    }

    void readSample (const SampleBuffer& buffer, double position, float& left, float& right)
    {
        left = 0.0f;
        right = 0.0f;
        const auto length = buffer.audio.getNumSamples();
        const auto channels = juce::jmax (1, buffer.audio.getNumChannels());

        if (length <= 1)
            return;

        auto lerp = [&] (int channel, double pos) -> float
        {
            const auto i = juce::jlimit (0, length - 2, (int) pos);
            const auto frac = (float) (pos - (double) i);
            const auto* data = buffer.audio.getReadPointer (juce::jmin (channel, channels - 1));
            return data[i] + (data[i + 1] - data[i]) * frac;
        };

        auto wrapped = position;

        if (buffer.loop && buffer.loopEnd > buffer.loopStart + 8)
        {
            const auto start = (double) buffer.loopStart;
            const auto end = (double) buffer.loopEnd;
            const auto span = end - start;

            if (wrapped >= end)
                wrapped = start + std::fmod (wrapped - start, span);

            const auto xf = (double) juce::jmax (1, buffer.crossfade);

            if (wrapped >= end - xf)
            {
                const auto fade = (float) ((end - wrapped) / xf);
                const auto b = start + (wrapped - (end - xf));
                const auto la = lerp (0, wrapped);
                const auto ra = lerp (1, wrapped);
                const auto lb = lerp (0, b);
                const auto rb = lerp (1, b);
                left = la * fade + lb * (1.0f - fade);
                right = ra * fade + rb * (1.0f - fade);
                return;
            }
        }
        else if (wrapped >= (double) (length - 1))
        {
            return;
        }

        left = lerp (0, wrapped);
        right = lerp (1, wrapped);
    }
}

Instance::Instance (const juce::String& definitionIdToUse)
    : definitionId (definitionIdToUse)
{
    Engine::get().registerInstance (this);
}

Instance::~Instance()
{
    Engine::get().unregisterInstance (this);
}

juce::String Instance::getInstrumentId() const
{
    return "m_orchestra";
}

juce::String Instance::getDisplayName() const
{
    if (const auto* s = spec())
        return s->name;

    return "M Orchestra";
}

void Instance::setInstrumentDefinitionId (const juce::String& id)
{
    const auto* instrument = Engine::get().findInstrument (id);

    if (instrument == nullptr)
        return;

    if (Engine::get().isAvailable())
    {
        const int notes[] = { 48, 60, 72 };

        for (int note : notes)
            for (auto art : instrument->articulations)
                Engine::get().prefetchAround (*instrument, art, note, 100, 96);
    }

    {
        const juce::SpinLock::ScopedLockType sl (idLock);
        pendingDefinitionId = id;
    }
    pendingApply.store (true);
}

void Instance::applyPendingDefinition()
{
    if (! pendingApply.exchange (false))
        return;

    juce::String id;
    {
        const juce::SpinLock::ScopedLockType sl (idLock);
        id = pendingDefinitionId;
    }
    definitionId = id;
    allOff (true);

    if (const auto* instrument = spec())
        articulation = instrument->articulations.empty() ? Articulation::longArt
                                                         : instrument->articulations.front();
}

void Instance::prepare (double newSampleRate, int)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;
}

void Instance::reset()
{
    allOff (true);
}

bool Instance::applyProgram (const juce::String& name)
{
    const auto text = name.toLowerCase();

    if (text.contains ("short") || text == "1")
        articulation = Articulation::shortArt;
    else if (text.contains ("hit") || text == "2")
        articulation = Articulation::hit;
    else if (text.contains ("pizz") || text.contains ("pluck") || text == "3")
        articulation = Articulation::pluck;
    else if (text.contains ("trem") || text == "4")
        articulation = Articulation::sustain;
    else
        articulation = Articulation::longArt;

    return true;
}

bool Instance::setParameterByName (const juce::String& name, float value)
{
    const auto n = name.toLowerCase();
    const auto v = juce::jlimit (0.0f, 1.0f, value);

    if (n.contains ("dynamic"))
        cc1.store (v);
    else if (n.contains ("expression"))
        cc11.store (v);
    else if (n.contains ("vibrato"))
        vibratoAmt.store (v);
    else
        return false;

    return true;
}

const InstrumentSpec* Instance::spec() const
{
    return Engine::get().findInstrument (definitionId);
}

Articulation Instance::currentArtic() const
{
    const auto* instrument = spec();

    if (instrument == nullptr)
        return articulation;

    for (auto art : instrument->articulations)
        if (art == articulation)
            return articulation;

    return instrument->articulations.front();
}

uint32_t Instance::makeSeed (int note, int voiceIndex) const
{
    uint32_t hash = 2166136261u;
    hash = mixHash (hash, (uint32_t) definitionId.hashCode());
    hash = mixHash (hash, (uint32_t) note);
    hash = mixHash (hash, (uint32_t) voiceIndex);
    hash = mixHash (hash, (uint32_t) currentArtic());
    return hash;
}

int Instance::countActiveVoices() const
{
    int count = 0;
    for (const auto& voice : voices)
        if (voice.active)
            ++count;
    return count;
}

void Instance::stealQuietestVoice()
{
    int best = -1;
    float bestScore = 1.0e9f;

    for (int i = 0; i < maxLocalVoices; ++i)
    {
        auto& voice = voices[i];
        if (! voice.active)
            continue;

        const auto score = (voice.releasing ? 0.15f : 1.0f) * (voice.env + 0.02f)
                         + voice.age * 0.00001f;

        if (score < bestScore)
        {
            bestScore = score;
            best = i;
        }
    }

    if (best >= 0)
    {
        voices[best].releasing = true;
        voices[best].envTarget = 0.0f;
        if (voices[best].env < 0.08f)
        {
            if (voices[best].startedNotify)
                Engine::get().notifyVoiceEnded();
            voices[best].active = false;
            voices[best].pending = false;
            voices[best].startedNotify = false;
        }
    }
}

void Instance::allOff (bool immediate)
{
    for (auto& voice : voices)
    {
        if (! voice.active)
            continue;

        if (immediate)
        {
            if (voice.startedNotify)
                Engine::get().notifyVoiceEnded();
            voice.active = false;
            voice.pending = false;
            voice.startedNotify = false;
            voice.env = 0.0f;
        }
        else
        {
            voice.releasing = true;
            voice.envTarget = 0.0f;
        }
    }
}

void Instance::noteOff (int note)
{
    for (auto& voice : voices)
        if (voice.active && voice.midiNote == note)
        {
            voice.releasing = true;
            voice.envTarget = 0.0f;
        }
}

void Instance::addSource (Voice& voice, const SampleRef& ref, SamplePtr sample, int role, int index, int count)
{
    juce::ignoreUnused (ref);
    if (sample == nullptr || voice.sourceCount >= 4)
        return;

    const auto* instrument = spec();
    const auto& rules = Engine::get().getLibrary().playback;
    auto& source = voice.sources[voice.sourceCount];
    source = Source {};
    source.sample = std::move (sample);
    source.pos = 0.0;
    source.role = role;
    source.dynLayer = role == 1 ? voice.dynLayerB : voice.dynLayerA;
    const auto seed = mixHash (voice.seed, (uint32_t) (role + 1) * 0x9e3779b9u);
    const auto detuneSpan = instrument != nullptr && instrument->solo
        ? rules.soloDetuneCents
        : rules.sectionDetuneCents;
    source.cents = role == 0 ? 0.0f : (hash01 (seed) - 0.5f) * 2.0f * detuneSpan;
    source.delaySamples = role == 0 ? 0.0
        : hash01 (mixHash (seed, 17)) * 0.0035f * (float) sampleRate;
    source.velOffset = (hash01 (mixHash (seed, 31)) - 0.5f) * 0.05f;
    source.cutoff = rules.cutoffMinHz + rules.cutoffSpanHz;
    source.lpL = 0.0f;
    source.lpR = 0.0f;

    const auto width = instrument != nullptr && instrument->sectionSize > 1
        ? juce::jlimit (0.12f, 0.55f, 0.16f + 0.025f * (float) instrument->sectionSize)
        : 0.0f;
    const auto pan = count <= 1 ? 0.0f : (-width * 0.5f + width * (float) index / (float) juce::jmax (1, count - 1));
    source.panL = std::cos ((pan + 1.0f) * juce::MathConstants<float>::halfPi * 0.5f);
    source.panR = std::sin ((pan + 1.0f) * juce::MathConstants<float>::halfPi * 0.5f);

    const auto semitones = (float) (voice.midiNote - source.sample->rootNote) + source.cents / 100.0f;
    const auto pitch = std::pow (2.0f, juce::jlimit (-(float) rules.maxStretchSemitones,
                                                     (float) rules.maxStretchSemitones,
                                                     semitones) / 12.0f);
    source.ratio = (source.sample->sampleRate / sampleRate) * (double) pitch;
    ++voice.sourceCount;
}

void Instance::tryFillSources (Voice& voice)
{
    if (! voice.hasPrimary)
        return;

    auto hasRole = [&] (int role)
    {
        for (int i = 0; i < voice.sourceCount; ++i)
            if (voice.sources[i].role == role && voice.sources[i].sample != nullptr)
                return true;
        return false;
    };

    int wanted = 1;
    if (voice.hasLayer) ++wanted;
    if (voice.hasNeighbor) ++wanted;

    if (! hasRole (0))
    {
        if (auto sample = Engine::get().requestSample (voice.primaryRef, false))
            addSource (voice, voice.primaryRef, sample, 0, 0, wanted);
        else
        {
            voice.pending = true;
            return;
        }
    }

    if (voice.hasLayer && ! hasRole (1))
        if (auto sample = Engine::get().requestSample (voice.layerRef, false))
            addSource (voice, voice.layerRef, sample, 1, 1, wanted);

    if (voice.hasNeighbor && ! hasRole (2))
        if (auto sample = Engine::get().requestSample (voice.neighborRef, false))
            addSource (voice, voice.neighborRef, sample, 2, voice.hasLayer ? 2 : 1, wanted);

    voice.pending = false;

    if (! voice.startedNotify && voice.sourceCount > 0)
    {
        voice.startedNotify = true;
        Engine::get().notifyVoiceStarted();
    }
}

void Instance::noteOn (int note, float velocity)
{
    const auto* instrument = spec();

    if (instrument == nullptr)
        return;

    const auto art = currentArtic();
    const int dynamics = juce::roundToInt (cc1.load() * 127.0f);
    const int velocityMidi = juce::roundToInt (velocity * 127.0f);
    const auto* primary = Engine::get().pickSample (*instrument, art, note, velocityMidi, dynamics, nextVoiceId);

    if (primary == nullptr)
        return;

    const auto* layer = isSustaining (art)
        ? Engine::get().pickLayer (*instrument, art, note, velocityMidi, dynamics, primary->dynamicLayer, nextVoiceId + 1)
        : nullptr;

    if (layer != nullptr && Engine::get().sampleKey (*layer) == Engine::get().sampleKey (*primary))
        layer = nullptr;

    const auto& rules = Engine::get().getLibrary().playback;
    int wanted = juce::jlimit (1, rules.maxSources, instrument->sourceVoices);
    if (instrument->solo || instrument->sectionSize <= 1)
        wanted = layer != nullptr ? 2 : 1;
    else if (layer != nullptr)
        wanted = juce::jmax (wanted, 2);

    const auto* neighbor = (! instrument->solo && instrument->sectionSize > 1 && wanted >= (layer != nullptr ? 3 : 2))
        ? Engine::get().pickNeighbor (*instrument, art, note, velocityMidi, dynamics, primary->rootNote, nextVoiceId + 2)
        : nullptr;

    if (neighbor != nullptr && Engine::get().sampleKey (*neighbor) == Engine::get().sampleKey (*primary))
        neighbor = nullptr;
    if (neighbor != nullptr && layer != nullptr && Engine::get().sampleKey (*neighbor) == Engine::get().sampleKey (*layer))
        neighbor = nullptr;

    Engine::get().prefetchAround (*instrument, art, note, velocityMidi, dynamics);

    if (Engine::get().shouldSteal())
        Engine::get().stealQuietest();

    const auto localMax = juce::jlimit (1, maxLocalVoices, instrument->maxVoices);
    if (countActiveVoices() >= localMax)
        stealQuietestVoice();

    int slot = -1;
    for (int i = 0; i < maxLocalVoices; ++i)
        if (! voices[i].active)
        {
            slot = i;
            break;
        }

    if (slot < 0)
    {
        stealQuietestVoice();
        for (int i = 0; i < maxLocalVoices; ++i)
            if (! voices[i].active)
            {
                slot = i;
                break;
            }
    }

    if (slot < 0)
        return;

    auto& voice = voices[slot];
    voice = Voice {};
    voice.active = true;
    voice.releasing = false;
    voice.pending = true;
    voice.midiNote = note;
    voice.id = nextVoiceId++;
    voice.velocity = juce::jlimit (0.05f, 1.0f, velocity);
    voice.velocityMidi = velocityMidi;
    voice.env = 0.0f;
    voice.envTarget = 1.0f;
    voice.age = 0.0f;
    voice.seed = makeSeed (note, voice.id);
    voice.vibratoPhase = hash01 (voice.seed) * juce::MathConstants<float>::twoPi;
    voice.vibratoRate = 4.7f + hash01 (mixHash (voice.seed, 9)) * 1.1f;
    voice.hasPrimary = true;
    voice.primaryRef = *primary;
    voice.dynLayerA = primary->dynamicLayer;
    if (layer != nullptr)
    {
        voice.hasLayer = true;
        voice.dualLayer = true;
        voice.layerRef = *layer;
        voice.dynLayerB = layer->dynamicLayer;
    }
    if (neighbor != nullptr)
    {
        voice.hasNeighbor = true;
        voice.neighborRef = *neighbor;
    }

    tryFillSources (voice);
}

void Instance::handleMidi (const juce::MidiMessage& message)
{
    if (message.isNoteOn())
        noteOn (message.getNoteNumber(), message.getFloatVelocity());
    else if (message.isNoteOff())
        noteOff (message.getNoteNumber());
    else if (message.isAllNotesOff() || message.isAllSoundOff())
        allOff (message.isAllSoundOff());
    else if (message.isController())
    {
        const auto cc = message.getControllerNumber();
        const auto v = (float) message.getControllerValue() / 127.0f;
        if (cc == 1) cc1.store (v);
        else if (cc == 11) cc11.store (v);
        else if (cc == 21) vibratoAmt.store (v);
        else if (cc == 123) allOff (false);
    }
    else if (message.isProgramChange())
    {
        applyProgram (juce::String (message.getProgramChangeNumber()));
    }
}

void Instance::renderVoice (Voice& voice, juce::AudioBuffer<float>& buffer, int numSamples)
{
    if (voice.pending || voice.sourceCount <= 0)
        tryFillSources (voice);

    if (voice.sourceCount <= 0)
    {
        voice.age += (float) numSamples / (float) sampleRate;
        if (voice.age > 2.0f)
        {
            voice.active = false;
            voice.pending = false;
            if (voice.startedNotify)
                Engine::get().notifyVoiceEnded();
            voice.startedNotify = false;
        }
        return;
    }

    const auto* instrument = spec();
    const auto& rules = Engine::get().getLibrary().playback;
    const auto art = currentArtic();
    const auto dyn01 = juce::jlimit (0.0f, 1.0f, cc1.load());
    const auto dynamics = std::pow (dyn01, instrument != nullptr ? instrument->gamma : 1.35f);
    const auto expression = 0.22f + 0.78f * juce::jlimit (0.0f, 1.0f, cc11.load());
    const auto attack = juce::jmap (voice.velocity, 0.05f, 1.0f, 0.028f, 0.006f);
    const auto release = art == Articulation::hit ? rules.releaseHitSec
                       : (art == Articulation::shortArt || art == Articulation::pluck) ? rules.releaseShortSec
                       : rules.releaseLongSec;
    const auto attackCoeff = 1.0f - std::exp (-1.0f / (float) juce::jmax (1.0, sampleRate * attack));
    const auto releaseCoeff = 1.0f - std::exp (-1.0f / (float) juce::jmax (1.0, sampleRate * release));
    const auto sustainGain = (0.28f + 0.72f * dynamics) * (0.55f + 0.45f * voice.velocity) * expression;
    const auto cutoffOpen = rules.cutoffMinHz + rules.cutoffSpanHz * dynamics * (0.7f + 0.3f * voice.velocity);
    const auto sat = 0.03f * dynamics;
    const auto noiseAmt = instrument != nullptr && instrument->noise != NoiseKind::none
        ? rules.noiseAmount * dynamics : 0.0f;
    const auto noiseHpCoeff = 1.0f - std::exp (-juce::MathConstants<float>::twoPi * rules.noiseHpHz / (float) sampleRate);
    const auto vibAmt = vibratoAmt.load();
    const auto vibratoDepth = (instrument != nullptr && instrument->vibrato
                               && isSustaining (art)
                               && vibAmt >= rules.vibratoGate)
        ? ((vibAmt - rules.vibratoGate) / juce::jmax (0.001f, 1.0f - rules.vibratoGate)) * rules.vibratoDepthSemis
        : 0.0f;
    const auto onset = 0.18f;
    const auto sectionScale = 0.62f / std::sqrt ((float) juce::jmax (1, voice.sourceCount));
    auto* left = buffer.getWritePointer (0);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : left;
    uint32_t noise = voice.seed;

    float layerMixB = 0.0f;
    if (voice.dualLayer)
    {
        const auto a = (float) voice.dynLayerA / 127.0f;
        const auto b = (float) voice.dynLayerB / 127.0f;
        if (std::abs (b - a) > 0.02f)
            layerMixB = juce::jlimit (0.0f, 1.0f, (dyn01 - a) / (b - a));
        else
            layerMixB = 0.5f;
    }

    for (int i = 0; i < numSamples; ++i)
    {
        voice.age += 1.0f / (float) sampleRate;
        const auto coeff = voice.releasing || voice.envTarget < voice.env ? releaseCoeff : attackCoeff;
        voice.env += (voice.envTarget - voice.env) * coeff;

        if (voice.releasing && voice.env < 0.0008f)
        {
            if (voice.startedNotify)
                Engine::get().notifyVoiceEnded();
            voice.active = false;
            voice.pending = false;
            voice.startedNotify = false;
            break;
        }

        float vibrato = 1.0f;
        if (vibratoDepth > 0.0001f && voice.age > onset)
        {
            const auto amount = juce::jlimit (0.0f, 1.0f, (voice.age - onset) / 0.22f);
            voice.vibratoPhase += voice.vibratoRate * juce::MathConstants<float>::twoPi / (float) sampleRate;
            vibrato = centsRatio (amount * vibratoDepth * 100.0f
                                  * std::sin (voice.vibratoPhase));
        }

        const auto releaseDark = voice.releasing ? juce::jlimit (0.35f, 1.0f, 0.35f + 0.65f * voice.env) : 1.0f;
        const auto cutoffHz = cutoffOpen * releaseDark;
        const auto lpCoeff = juce::jlimit (0.0005f, 0.9f,
            1.0f - std::exp (-juce::MathConstants<float>::twoPi * cutoffHz / (float) sampleRate));

        float mixL = 0.0f;
        float mixR = 0.0f;
        int live = 0;

        for (int s = 0; s < voice.sourceCount; ++s)
        {
            auto& source = voice.sources[s];
            if (source.sample == nullptr)
                continue;

            if (source.delaySamples > 0.0)
            {
                source.delaySamples -= 1.0;
                continue;
            }

            const auto& sample = *source.sample;
            const auto ended = ! sample.loop && source.pos >= (double) (sample.audio.getNumSamples() - 2);

            if (ended)
            {
                voice.releasing = true;
                voice.envTarget = 0.0f;
                continue;
            }

            float sl = 0.0f, sr = 0.0f;
            readSample (sample, source.pos, sl, sr);
            source.pos += source.ratio * (double) vibrato;
            source.lpL += (sl - source.lpL) * lpCoeff;
            source.lpR += (sr - source.lpR) * lpCoeff;
            auto shapedL = source.lpL * (1.0f + source.velOffset);
            auto shapedR = source.lpR * (1.0f + source.velOffset);
            shapedL = shapedL - sat * shapedL * shapedL * shapedL;
            shapedR = shapedR - sat * shapedR * shapedR * shapedR;

            float layerGain = 1.0f;
            if (voice.dualLayer && source.role == 0)
                layerGain = 1.0f - layerMixB;
            else if (voice.dualLayer && source.role == 1)
                layerGain = layerMixB;
            else if (source.role == 2)
                layerGain = 0.72f;

            mixL += shapedL * source.panL * layerGain;
            mixR += shapedR * source.panR * layerGain;
            ++live;
        }

        if (live == 0 && voice.releasing)
        {
            if (voice.startedNotify)
                Engine::get().notifyVoiceEnded();
            voice.active = false;
            voice.pending = false;
            voice.startedNotify = false;
            break;
        }

        noise = noise * 1664525u + 1013904223u;
        const auto rawN = ((int) (noise >> 9) - 4194304) * (1.0f / 4194304.0f);
        voice.noiseLp += (rawN - voice.noiseLp) * juce::jlimit (0.0005f, 0.9f, noiseHpCoeff);
        const auto n = (rawN - voice.noiseLp) * noiseAmt;
        const auto gain = voice.env * sustainGain * sectionScale;
        left[i] += (mixL + n) * gain;
        right[i] += (mixR + n) * gain;
    }
}

void Instance::process (juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    const auto t0 = juce::Time::getMillisecondCounterHiRes();
    applyPendingDefinition();

    for (const auto metadata : midi)
        handleMidi (metadata.getMessage());

    midi.clear();

    for (auto& voice : voices)
        if (voice.active)
            renderVoice (voice, buffer, buffer.getNumSamples());

    Engine::get().addCallbackTime ((juce::Time::getMillisecondCounterHiRes() - t0) * 0.001);
}
}
