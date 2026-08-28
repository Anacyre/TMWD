#include "MOrchestraEngine.h"
#include "MOrchestraInstance.h"
#include <algorithm>
#include <cmath>

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

        if (lower.contains ("very-long")) return 4;
        if (lower.contains ("_long_"))    return 3;
        if (lower.contains ("_15_"))      return 2;
        if (lower.contains ("_1_"))       return 1;
        return 0;
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
    buffer->audio.setSize (1, samples);
    juce::AudioBuffer<float> decoded (juce::jmax (1, (int) reader->numChannels), samples);
    reader->read (&decoded, 0, samples, 0, true, true);

    auto* dest = buffer->audio.getWritePointer (0);
    const auto channels = decoded.getNumChannels();

    for (int i = 0; i < samples; ++i)
    {
        float sum = 0.0f;
        for (int ch = 0; ch < channels; ++ch)
            sum += decoded.getSample (ch, i);
        dest[i] = sum / (float) juce::jmax (1, channels);
    }

    if (buffer->loop && samples > 2048)
    {
        buffer->loopStart = (int) (samples * 0.38);
        buffer->loopEnd = (int) (samples * 0.82);
        buffer->crossfade = juce::jlimit (64, 2048, (int) (0.02 * buffer->sampleRate));
        buffer->crossfade = juce::jmin (buffer->crossfade, (buffer->loopEnd - buffer->loopStart) / 4);
    }

    insertCache (buffer);
    return buffer;
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

const SampleRef* Engine::pickSample (const InstrumentSpec& spec, Articulation artic,
                                     int midiNote, int velocity, int dynamics) const
{
    juce::ignoreUnused (velocity);
    const SampleRef* best = nullptr;
    double bestScore = 1.0e9;
    const int targetDyn = juce::jlimit (1, 127, dynamics);

    for (const auto& sample : library.samples)
    {
        if (sample.pack != spec.pack || sample.articulation != artic)
            continue;

        if (spec.percFolder.isNotEmpty() && ! sample.entry.startsWithIgnoreCase (spec.percFolder + "/"))
            continue;

        const auto noteDelta = sample.unpitched ? 0 : std::abs (sample.rootNote - midiNote);
        if (noteDelta > 7)
            continue;

        const auto dynDelta = std::abs (sample.dynamicLayer - targetDyn) / 127.0;
        const auto quality = 4 - durationQuality (sample.entry, artic);
        const auto score = (double) noteDelta * 8.0 + dynDelta * 3.0 + (double) quality * 0.35;

        if (score < bestScore)
        {
            bestScore = score;
            best = &sample;
        }
    }

    return best;
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
