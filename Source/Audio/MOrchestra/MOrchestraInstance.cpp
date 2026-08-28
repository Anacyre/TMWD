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

    float readSample (const SampleBuffer& buffer, double position)
    {
        const auto length = buffer.audio.getNumSamples();

        if (length <= 1)
            return 0.0f;

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
                const auto a = wrapped;
                const auto b = start + (wrapped - (end - xf));
                const auto ia = juce::jlimit (0, length - 2, (int) a);
                const auto ib = juce::jlimit (0, length - 2, (int) b);
                const auto fa = (float) (a - (double) ia);
                const auto fb = (float) (b - (double) ib);
                const auto* data = buffer.audio.getReadPointer (0);
                const auto sa = data[ia] + (data[ia + 1] - data[ia]) * fa;
                const auto sb = data[ib] + (data[ib + 1] - data[ib]) * fb;
                return sa * fade + sb * (1.0f - fade);
            }
        }
        else if (wrapped >= (double) (length - 1))
        {
            return 0.0f;
        }

        const auto i = juce::jlimit (0, length - 2, (int) wrapped);
        const auto frac = (float) (wrapped - (double) i);
        const auto* data = buffer.audio.getReadPointer (0);
        return data[i] + (data[i + 1] - data[i]) * frac;
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
                if (const auto* ref = Engine::get().pickSample (*instrument, art, note, 100, 96))
                    Engine::get().requestSample (*ref, true);
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
            voices[best].active = false;
            Engine::get().notifyVoiceEnded();
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
            voice.active = false;
            voice.env = 0.0f;
            Engine::get().notifyVoiceEnded();
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

void Instance::startSources (Voice& voice, const SampleRef& ref)
{
    const auto* instrument = spec();
    const auto count = instrument != nullptr ? juce::jlimit (1, 4, instrument->sourceVoices) : 1;
    auto sample = Engine::get().requestSample (ref, false);
    voice.sourceCount = 0;

    if (sample == nullptr)
        return;

    const auto width = instrument != nullptr && instrument->sectionSize > 1
        ? juce::jlimit (0.12f, 0.7f, 0.18f + 0.03f * (float) instrument->sectionSize)
        : 0.0f;

    for (int i = 0; i < count; ++i)
    {
        auto& source = voice.sources[i];
        source.sample = sample;
        source.pos = 0.0;
        const auto seed = mixHash (voice.seed, (uint32_t) (i + 1) * 0x9e3779b9u);
        source.cents = (hash01 (seed) - 0.5f) * (instrument != nullptr && instrument->sectionSize > 1 ? 7.0f : 2.2f);
        source.delaySamples = hash01 (mixHash (seed, 17)) * (0.004f + 0.0004f * (float) (instrument != nullptr ? instrument->sectionSize : 1)) * (float) sampleRate;
        source.velOffset = (hash01 (mixHash (seed, 31)) - 0.5f) * 0.08f;
        source.cutoff = 1800.0f;
        source.lp = 0.0f;
        const auto pan = count <= 1 ? 0.0f : (-width * 0.5f + width * (float) i / (float) (count - 1));
        source.panL = std::cos ((pan + 1.0f) * juce::MathConstants<float>::halfPi * 0.5f);
        source.panR = std::sin ((pan + 1.0f) * juce::MathConstants<float>::halfPi * 0.5f);
        const auto semitones = (float) (voice.midiNote - sample->rootNote) + source.cents / 100.0f;
        const auto pitch = std::pow (2.0f, juce::jlimit (-4.0f, 4.0f, semitones) / 12.0f);
        source.ratio = (sample->sampleRate / sampleRate) * (double) pitch;
        ++voice.sourceCount;
    }
}

void Instance::noteOn (int note, float velocity)
{
    const auto* instrument = spec();

    if (instrument == nullptr)
        return;

    const auto art = currentArtic();
    const int dynamics = juce::roundToInt (cc1.load() * 127.0f);
    const auto* ref = Engine::get().pickSample (*instrument, art, note,
                                                juce::roundToInt (velocity * 127.0f),
                                                dynamics);

    if (ref == nullptr)
        return;

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
    voice.midiNote = note;
    voice.id = nextVoiceId++;
    voice.velocity = juce::jlimit (0.05f, 1.0f, velocity);
    voice.env = 0.0f;
    voice.envTarget = 1.0f;
    voice.age = 0.0f;
    voice.seed = makeSeed (note, voice.id);
    voice.vibratoPhase = hash01 (voice.seed) * juce::MathConstants<float>::twoPi;
    voice.vibratoRate = 4.7f + hash01 (mixHash (voice.seed, 9)) * 1.1f;
    startSources (voice, *ref);

    if (voice.sourceCount <= 0)
    {
        voice.active = false;
        Engine::get().requestSample (*ref, false);
        return;
    }

    Engine::get().notifyVoiceStarted();
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
    const auto* instrument = spec();
    const auto dynamics = std::pow (juce::jlimit (0.0f, 1.0f, cc1.load()),
                                    instrument != nullptr ? instrument->gamma : 1.35f);
    const auto expression = 0.22f + 0.78f * juce::jlimit (0.0f, 1.0f, cc11.load());
    const auto attack = juce::jmap (voice.velocity, 0.05f, 1.0f, 0.028f, 0.006f);
    const auto release = currentArtic() == Articulation::hit ? 0.04f
                       : currentArtic() == Articulation::shortArt ? 0.08f : 0.2f;
    const auto attackCoeff = 1.0f - std::exp (-1.0f / (float) juce::jmax (1.0, sampleRate * attack));
    const auto releaseCoeff = 1.0f - std::exp (-1.0f / (float) juce::jmax (1.0, sampleRate * release));
    const auto sustainGain = (0.28f + 0.72f * dynamics) * (0.55f + 0.45f * voice.velocity) * expression;
    const auto cutoffHz = 900.0f + 7800.0f * dynamics * (0.65f + 0.35f * voice.velocity);
    const auto sat = 0.04f * dynamics;
    const auto noiseAmt = instrument != nullptr && instrument->noise != NoiseKind::none
        ? 0.0032f * dynamics : 0.0f;
    const auto vibratoDepth = (instrument != nullptr && instrument->vibrato
                               && currentArtic() == Articulation::longArt)
        ? vibratoAmt.load() * 0.22f : 0.0f;
    const auto onset = 0.18f;
    const auto sectionScale = 0.62f / std::sqrt ((float) juce::jmax (1, voice.sourceCount));
    auto* left = buffer.getWritePointer (0);
    auto* right = buffer.getNumChannels() > 1 ? buffer.getWritePointer (1) : left;
    uint32_t noise = voice.seed;

    for (int i = 0; i < numSamples; ++i)
    {
        voice.age += 1.0f / (float) sampleRate;
        const auto coeff = voice.releasing || voice.envTarget < voice.env ? releaseCoeff : attackCoeff;
        voice.env += (voice.envTarget - voice.env) * coeff;

        if (voice.releasing && voice.env < 0.0008f)
        {
            voice.active = false;
            Engine::get().notifyVoiceEnded();
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
                if (currentArtic() != Articulation::longArt)
                    voice.releasing = true;
                continue;
            }

            const auto value = readSample (sample, source.pos);
            source.pos += source.ratio * (double) vibrato;
            const auto lpCoeff = 1.0f - std::exp (-juce::MathConstants<float>::twoPi * cutoffHz / (float) sampleRate);
            source.lp += (value - source.lp) * juce::jlimit (0.0005f, 0.9f, lpCoeff);
            auto shaped = source.lp * (1.0f + source.velOffset);
            shaped = shaped - sat * shaped * shaped * shaped;
            mixL += shaped * source.panL;
            mixR += shaped * source.panR;
            ++live;
        }

        if (live == 0 && voice.releasing)
        {
            voice.active = false;
            Engine::get().notifyVoiceEnded();
            break;
        }

        noise = noise * 1664525u + 1013904223u;
        const auto n = ((int) (noise >> 9) - 4194304) * (1.0f / 4194304.0f) * noiseAmt;
        const auto gain = voice.env * sustainGain * sectionScale;
        const auto outL = (mixL + n) * gain;
        const auto outR = (mixR + n) * gain;
        left[i] += outL;
        right[i] += outR;
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
