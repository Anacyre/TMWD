#include "MOrchestraEngine.h"
#include "MOrchestraInstance.h"
#include <algorithm>
#include <cmath>
#include <vector>

namespace MOrchestra
{
namespace
{
    juce::File findLibraryJson()
    {
        const auto env = juce::SystemStats::getEnvironmentVariable ("DAWWEB_RESOURCE_ROOT", {});

        if (env.isNotEmpty())
        {
            const juce::File fromEnv (env.replaceCharacter ('/', juce::File::getSeparatorChar()));
            const auto candidate = fromEnv.getChildFile ("m-orchestra").getChildFile ("library.json");
            if (candidate.existsAsFile())
                return candidate;
        }

        const auto exe = juce::File::getSpecialLocation (juce::File::currentExecutableFile);
        const auto sibling = exe.getSiblingFile ("Resources")
                                .getChildFile ("m-orchestra")
                                .getChildFile ("library.json");

        if (sibling.existsAsFile())
            return sibling;

        auto dir = exe.getParentDirectory();

        for (int i = 0; i < 8 && dir != dir.getParentDirectory(); ++i)
        {
            const auto candidate = dir.getChildFile ("Source")
                                       .getChildFile ("Resources")
                                       .getChildFile ("m-orchestra")
                                       .getChildFile ("library.json");
            if (candidate.existsAsFile())
                return candidate;

            dir = dir.getParentDirectory();
        }

        return {};
    }

    juce::int64 bufferBytes (const SampleBuffer& buffer)
    {
        return (juce::int64) buffer.audio.getNumSamples()
             * (juce::int64) juce::jmax (1, buffer.audio.getNumChannels())
             * (juce::int64) sizeof (float);
    }

    int durationQuality (const juce::String& entry, Articulation artic)
    {
        const auto lower = entry.toLowerCase();

        if (artic == Articulation::shortArt)
        {
            if (lower.contains ("_025_")) return 3;
            if (lower.contains ("_05_"))  return 2;
            return 0;
        }

        if (artic == Articulation::pluck)
        {
            if (lower.contains ("_025_")) return 3;
            if (lower.contains ("_05_"))  return 2;
            return 1;
        }

        if (lower.contains ("very-long")) return 4;
        if (lower.contains ("_long_"))    return 3;
        if (lower.contains ("_15_"))      return 2;
        if (lower.contains ("_1_"))       return 1;
        return 0;
    }

    int mixedDynamics (int cc1, int velocity, float mix)
    {
        const auto dyn = (float) juce::jlimit (1, 127, cc1);
        const auto vel = (float) juce::jlimit (1, 127, velocity);
        return juce::jlimit (1, 127, juce::roundToInt (dyn * (1.0f - mix) + vel * mix));
    }

    bool sampleMatches (const SampleRef& sample, const InstrumentSpec& spec, Articulation artic)
    {
        if (sample.pack != spec.pack || sample.articulation != artic)
            return false;

        if (spec.percFolder.isNotEmpty() && ! sample.entry.startsWithIgnoreCase (spec.percFolder + "/"))
            return false;

        return true;
    }
}

Engine& Engine::get()
{
    static Engine engine;
    return engine;
}

Engine::Engine()
    : juce::Thread ("MOrchestraDecode")
{
    formats.registerBasicFormats();
}

Engine::~Engine()
{
    shutdown();
}

void Engine::initialise()
{
    if (running.load())
        return;

    library = loadLibrarySpec (findLibraryJson());
    root = resolveLibraryRoot (library);

    if (! root.isDirectory())
    {
        available.store (false);
        juce::Logger::writeToLog ("M Orchestra: sample root not found.");
        return;
    }

    scanPacks (library, root);

    for (const auto& zipFile : root.findChildFiles (juce::File::findFiles, false, "*.zip"))
    {
        auto zip = std::make_unique<juce::ZipFile> (zipFile);
        zips[zipFile.getFileNameWithoutExtension()] = std::move (zip);
    }

    available.store (! library.samples.empty());
    cpuWindowStart.store (juce::Time::getMillisecondCounterHiRes() * 0.001);
    running.store (true);
    startThread (juce::Thread::Priority::low);

    juce::Logger::writeToLog ("M Orchestra: " + juce::String ((int) library.samples.size())
                              + " samples from " + root.getFullPathName()
                              + " (" + juce::String ((int) library.instruments.size())
                              + " instruments, cache "
                              + juce::String (library.cacheBudgetMb) + " MB).");
}

void Engine::shutdown()
{
    running.store (false);
    jobEvent.signal();
    decodedEvent.signal();
    stopThread (4000);

    const juce::ScopedLock sl (cacheLock);
    cache.clear();
    lru.clear();
    cacheByteCount = 0;
    zips.clear();
}

const InstrumentSpec* Engine::findInstrument (const juce::String& id) const
{
    for (const auto& spec : library.instruments)
        if (spec.id == id)
            return &spec;

    return nullptr;
}

juce::String Engine::sampleKey (const SampleRef& ref) const
{
    return ref.pack + "|" + ref.entry;
}

SamplePtr Engine::findCached (const juce::String& key) const
{
    const juce::ScopedLock sl (cacheLock);
    const auto it = cache.find (key);
    return it != cache.end() ? it->second : SamplePtr {};
}

void Engine::insertCache (SamplePtr buffer)
{
    if (buffer == nullptr)
        return;

    const juce::ScopedLock sl (cacheLock);
    const auto extra = bufferBytes (*buffer);
    evictIfNeeded ((size_t) extra);
    cache[buffer->key] = buffer;
    lru.erase (std::remove (lru.begin(), lru.end(), buffer->key), lru.end());
    lru.push_back (buffer->key);
    cacheByteCount += extra;
}

void Engine::evictIfNeeded (size_t extraBytes)
{
    const auto budget = (juce::int64) library.cacheBudgetMb * 1024 * 1024;

    while (! lru.empty() && cacheByteCount + (juce::int64) extraBytes > budget)
    {
        const auto oldest = lru.front();
        lru.erase (lru.begin());
        const auto it = cache.find (oldest);

        if (it == cache.end())
            continue;

        cacheByteCount -= bufferBytes (*it->second);
        cache.erase (it);
    }
}

SamplePtr Engine::decode (const SampleRef& ref)
{
    const auto key = sampleKey (ref);
    if (auto cached = findCached (key))
        return cached;

    const auto it = zips.find (ref.pack);

    if (it == zips.end() || it->second == nullptr)
        return {};

    const auto* entry = it->second->getEntry (ref.entry);

    if (entry == nullptr)
        return {};

    std::unique_ptr<juce::InputStream> stream (it->second->createStreamForEntry (*entry));

    if (stream == nullptr)
        return {};

    std::unique_ptr<juce::AudioFormatReader> reader (formats.createReaderFor (std::move (stream)));

    if (reader == nullptr || reader->lengthInSamples <= 0)
        return {};

    auto buffer = std::make_shared<SampleBuffer>();
    buffer->key = key;
    buffer->rootNote = ref.rootNote;
    buffer->sampleRate = reader->sampleRate;
    buffer->loop = ref.loop;
    const auto samples = (int) juce::jmin ((juce::int64) reader->lengthInSamples, (juce::int64) 1'200'000);
    const auto outCh = juce::jlimit (1, 2, (int) reader->numChannels);
    buffer->audio.setSize (outCh, samples);
    reader->read (&buffer->audio, 0, samples, 0, true, true);

    if (buffer->loop)
        findLoopPoints (*buffer);

    insertCache (buffer);
    return buffer;
}

void Engine::findLoopPoints (SampleBuffer& buffer) const
{
    const auto& rules = library.playback;
    const auto samples = buffer.audio.getNumSamples();
    const auto channels = juce::jmax (1, buffer.audio.getNumChannels());

    if (! buffer.loop || samples < rules.minLoopSamples * 2)
    {
        buffer.loop = false;
        return;
    }

    const auto searchStart = juce::jlimit (0, samples - 2, (int) (samples * (double) rules.loopSearchStart));
    const auto searchEnd = juce::jlimit (searchStart + 8, samples - 1, (int) (samples * (double) rules.loopSearchEnd));
    const auto window = juce::jlimit (256, searchEnd - searchStart,
                                      (int) (rules.loopWindowSec * buffer.sampleRate));

    if (window < rules.minLoopSamples || searchEnd - searchStart < window)
    {
        buffer.loop = false;
        return;
    }

    const auto* data = buffer.audio.getReadPointer (0);
    const auto hop = juce::jmax (32, window / 8);
    double bestEnergy = 1.0e100;
    int bestStart = searchStart;

    for (int i = searchStart; i + window < searchEnd; i += hop)
    {
        double energy = 0.0;
        for (int s = 0; s < window; s += 4)
        {
            const auto v = data[i + s];
            energy += (double) v * (double) v;
        }

        if (energy < bestEnergy)
        {
            bestEnergy = energy;
            bestStart = i;
        }
    }

    const auto zcSpan = juce::jmax (8, (int) (0.02 * buffer.sampleRate));
    auto findZero = [&] (int pos)
    {
        for (int i = 0; i < zcSpan; ++i)
        {
            const auto a = pos + i;
            const auto b = a + 1;
            if (b >= samples)
                break;
            if (data[a] <= 0.0f && data[b] >= 0.0f)
                return b;
        }
        return pos;
    };

    auto loopStart = findZero (bestStart);
    auto loopEnd = findZero (juce::jmin (samples - 2, bestStart + window));

    if (loopEnd <= loopStart + rules.minLoopSamples)
        loopEnd = juce::jmin (samples - 2, loopStart + window);

    auto xfade = juce::jmax (64, (int) (rules.minCrossfadeMs * 0.001 * buffer.sampleRate));
    xfade = juce::jmin (xfade, juce::jmax (1, (loopEnd - loopStart) / 4));

    double rms = 0.0;
    int count = 0;
    for (int i = loopStart; i < loopEnd; i += 8)
    {
        float v = 0.0f;
        for (int ch = 0; ch < channels; ++ch)
            v += buffer.audio.getSample (ch, i);
        v /= (float) channels;
        rms += (double) v * (double) v;
        ++count;
    }
    rms = std::sqrt (rms / (double) juce::jmax (1, count));

    if (loopEnd - loopStart < rules.minLoopSamples || rms > (double) rules.maxLoopRms)
    {
        buffer.loop = false;
        return;
    }

    buffer.loopStart = loopStart;
    buffer.loopEnd = loopEnd;
    buffer.crossfade = xfade;
}

SamplePtr Engine::requestSample (const SampleRef& ref, bool waitIfNeeded)
{
    const auto key = sampleKey (ref);

    if (auto cached = findCached (key))
        return cached;

    {
        const juce::ScopedLock sl (jobLock);
        bool queued = false;
        for (const auto& job : jobs)
            if (sampleKey (job) == key)
                queued = true;
        if (! queued)
            jobs.push_back (ref);
    }

    jobEvent.signal();

    if (! waitIfNeeded || ! juce::MessageManager::existsAndIsCurrentThread())
        return {};

    const auto deadline = juce::Time::getMillisecondCounterHiRes() + 1200.0;

    while (juce::Time::getMillisecondCounterHiRes() < deadline)
    {
        if (auto cached = findCached (key))
            return cached;

        decodedEvent.wait (20);
    }

    return findCached (key);
}

const SampleRef* Engine::pickRanked (const InstrumentSpec& spec, Articulation artic,
                                     int midiNote, int velocity, int dynamics, int rrIndex,
                                     int excludeLayer, int excludeRoot) const
{
    const auto& rules = library.playback;
    const auto targetDyn = mixedDynamics (dynamics, velocity, rules.dynamicsVelocityMix);
    struct Ranked { const SampleRef* sample; double score; };
    std::vector<Ranked> ranked;
    ranked.reserve (64);

    for (const auto& sample : library.samples)
    {
        if (! sampleMatches (sample, spec, artic))
            continue;
        if (excludeLayer >= 0 && sample.dynamicLayer == excludeLayer)
            continue;
        if (excludeRoot >= 0 && ! sample.unpitched && sample.rootNote == excludeRoot)
            continue;

        const auto noteDelta = sample.unpitched ? 0 : std::abs (sample.rootNote - midiNote);
        if (! sample.unpitched && noteDelta > rules.maxStretchSemitones)
            continue;

        const auto quality = durationQuality (sample.entry, artic);
        if (artic == Articulation::shortArt && quality < 2)
            continue;

        const auto inRange = sample.unpitched
            || (midiNote >= sample.minNote && midiNote <= sample.maxNote);
        const auto dynDelta = std::abs (sample.dynamicLayer - targetDyn) / 127.0;
        int velDelta = 0;
        if (velocity < sample.velocityMin)
            velDelta = sample.velocityMin - velocity;
        else if (velocity > sample.velocityMax)
            velDelta = velocity - sample.velocityMax;

        const auto pitchScore = inRange ? (double) noteDelta * 2.0 : (double) noteDelta * 8.0 + 24.0;
        const auto score = pitchScore + dynDelta * 6.0 + (double) velDelta * 0.04 + (double) (4 - quality) * 0.5;
        ranked.push_back ({ &sample, score });
    }

    if (ranked.empty())
        return nullptr;

    std::sort (ranked.begin(), ranked.end(), [] (const Ranked& a, const Ranked& b)
    {
        if (a.score != b.score)
            return a.score < b.score;
        return a.sample->entry < b.sample->entry;
    });

    const auto* best = ranked.front().sample;
    std::vector<const SampleRef*> pool;

    for (const auto& item : ranked)
        if (item.sample->rootNote == best->rootNote
            && item.sample->dynamicLayer == best->dynamicLayer
            && item.score <= ranked.front().score + 0.35)
            pool.push_back (item.sample);

    if (pool.empty())
        pool.push_back (best);

    return pool[(size_t) juce::jmax (0, rrIndex) % pool.size()];
}

const SampleRef* Engine::pickSample (const InstrumentSpec& spec, Articulation artic,
                                     int midiNote, int velocity, int dynamics, int rrIndex) const
{
    return pickRanked (spec, artic, midiNote, velocity, dynamics, rrIndex, -1, -1);
}

const SampleRef* Engine::pickLayer (const InstrumentSpec& spec, Articulation artic,
                                    int midiNote, int velocity, int dynamics,
                                    int excludeLayer, int rrIndex) const
{
    return pickRanked (spec, artic, midiNote, velocity, dynamics, rrIndex, excludeLayer, -1);
}

const SampleRef* Engine::pickNeighbor (const InstrumentSpec& spec, Articulation artic,
                                       int midiNote, int velocity, int dynamics,
                                       int excludeRoot, int rrIndex) const
{
    return pickRanked (spec, artic, midiNote, velocity, dynamics, rrIndex, -1, excludeRoot);
}

void Engine::prefetchAround (const InstrumentSpec& spec, Articulation artic,
                             int midiNote, int velocity, int dynamics)
{
    if (const auto* primary = pickSample (spec, artic, midiNote, velocity, dynamics, 0))
        requestSample (*primary, false);

    if (const auto* layer = pickLayer (spec, artic, midiNote, velocity, dynamics, -1, 1))
        requestSample (*layer, false);

    if (const auto* neighbor = pickNeighbor (spec, artic, midiNote, velocity, dynamics, midiNote, 2))
        requestSample (*neighbor, false);

    const int offsets[] = { -2, -1, 1, 2 };
    for (int offset : offsets)
        if (const auto* nearby = pickSample (spec, artic, midiNote + offset, velocity, dynamics, 0))
            requestSample (*nearby, false);
}

void Engine::run()
{
    while (! threadShouldExit() && running.load())
    {
        SampleRef job;
        {
            const juce::ScopedLock sl (jobLock);
            if (jobs.empty())
            {
                jobEvent.wait (250);
                continue;
            }

            job = jobs.front();
            jobs.erase (jobs.begin());
        }

        decode (job);
        decodedEvent.signal();
    }
}

void Engine::registerInstance (Instance* instance)
{
    const juce::ScopedLock sl (instanceLock);
    if (std::find (instances.begin(), instances.end(), instance) == instances.end())
        instances.push_back (instance);
}

void Engine::unregisterInstance (Instance* instance)
{
    const juce::ScopedLock sl (instanceLock);
    instances.erase (std::remove (instances.begin(), instances.end(), instance), instances.end());
}

void Engine::notifyVoiceStarted() { activeVoices.fetch_add (1); }
void Engine::notifyVoiceEnded()
{
    auto current = activeVoices.load();
    while (current > 0 && ! activeVoices.compare_exchange_weak (current, current - 1))
    {}
}

bool Engine::shouldSteal() const
{
    return activeVoices.load() >= library.globalMaxVoices;
}

void Engine::stealQuietest()
{
    const juce::ScopedLock sl (instanceLock);
    Instance* target = nullptr;
    int bestCount = 0;

    for (auto* instance : instances)
    {
        if (instance == nullptr)
            continue;

        const auto count = instance->countActiveVoices();
        if (count > bestCount)
        {
            bestCount = count;
            target = instance;
        }
    }

    if (target != nullptr)
        target->stealQuietestVoice();
}

void Engine::addCallbackTime (double seconds)
{
    const auto now = juce::Time::getMillisecondCounterHiRes() * 0.001;
    auto start = cpuWindowStart.load();

    if (now - start >= 1.0)
    {
        cpuSeconds.store (seconds);
        cpuWindowStart.store (now);
    }
    else
    {
        cpuSeconds.store (cpuSeconds.load() + seconds);
    }
}

juce::int64 Engine::cacheBytes() const
{
    const juce::ScopedLock sl (cacheLock);
    return cacheByteCount;
}

Diagnostics Engine::getDiagnostics() const
{
    Diagnostics d;
    d.libraryAvailable = available.load();
    d.libraryRoot = root.getFullPathName();
    d.missingInstruments = library.missing;
    d.activeVoices = activeVoices.load();
    d.sampleVoices = d.activeVoices;
    d.dspVoices = d.activeVoices;
    d.cacheMb = (double) cacheBytes() / (1024.0 * 1024.0);

    {
        const juce::ScopedLock sl (cacheLock);
        d.cacheEntries = (int) cache.size();
    }

    const auto now = juce::Time::getMillisecondCounterHiRes() * 0.001;
    const auto start = cpuWindowStart.load();
    const auto window = juce::jmax (0.001, now - start);
    d.cpuPercent = juce::jlimit (0.0, 100.0, cpuSeconds.load() / window * 100.0);
    return d;
}
}
