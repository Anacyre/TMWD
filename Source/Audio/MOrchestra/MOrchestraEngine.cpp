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
        if (lower.contains ("_15_"))      return 3;
        if (lower.contains ("_long_"))    return 3;
        if (lower.contains ("_1_"))       return 0;
        return 1;
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

    int estimatePeriod (const std::vector<float>& mono, int center, double sr)
    {
        const int win = juce::jmax (32, (int) (0.10 * sr));
        const int minT = juce::jmax (8, (int) (sr / 1400.0));
        const int maxT = juce::jmin ((int) (sr / 45.0), (int) mono.size() - center - win - 2);
        if (maxT <= minT || center < 0)
            return 0;

        double bestCorr = 0.0;
        int bestT = 0;

        for (int t = minT; t <= maxT; ++t)
        {
            double dot = 0.0, na = 0.0, nb = 0.0;
            for (int i = 0; i < win; i += 2)
            {
                const double a = (double) mono[(size_t) (center + i)];
                const double b = (double) mono[(size_t) (center + i + t)];
                dot += a * b;
                na += a * a;
                nb += b * b;
            }

            if (na < 1.0e-12 || nb < 1.0e-12)
                continue;

            const auto corr = dot / std::sqrt (na * nb);
            if (corr > bestCorr)
            {
                bestCorr = corr;
                bestT = t;
            }
        }

        return bestCorr >= 0.45 ? bestT : 0;
    }

    int estimateVibratoPeriod (const std::vector<float>& mono, int from, int to, double sr)
    {
        const int smooth = juce::jmax (4, (int) (sr * 0.010));
        const int minT = juce::jmax (8, (int) (sr * 0.12));
        const int maxT = juce::jmin ((int) (sr * 0.34), (to - from) / 3);
        if (maxT <= minT)
            return 0;

        std::vector<float> env;
        env.reserve ((size_t) juce::jmax (1, (to - from) / smooth));

        for (int i = from; i + smooth < to; i += smooth)
        {
            float sum = 0.0f;
            for (int j = 0; j < smooth; ++j)
                sum += std::abs (mono[(size_t) (i + j)]);
            env.push_back (sum / (float) smooth);
        }

        if ((int) env.size() < maxT + 8)
            return 0;

        double bestCorr = 0.0;
        int bestT = 0;
        const int win = juce::jmin ((int) env.size() / 2, (int) (0.22 * sr / smooth));

        for (int t = minT / smooth; t <= maxT / smooth; ++t)
        {
            if (t <= 0 || win + t >= (int) env.size())
                continue;

            double dot = 0.0, na = 0.0, nb = 0.0;
            for (int i = 0; i < win; ++i)
            {
                const double a = (double) env[(size_t) i];
                const double b = (double) env[(size_t) (i + t)];
                dot += a * b;
                na += a * a;
                nb += b * b;
            }

            if (na < 1.0e-12 || nb < 1.0e-12)
                continue;

            const auto corr = dot / std::sqrt (na * nb);
            if (corr > bestCorr)
            {
                bestCorr = corr;
                bestT = t * smooth;
            }
        }

        return bestCorr >= 0.35 ? bestT : 0;
    }

    double correlate (const std::vector<float>& mono, int aStart, int bStart, int count)
    {
        if (count <= 8)
            return 0.0;

        double dot = 0.0, na = 0.0, nb = 0.0;
        for (int i = 0; i < count; i += 2)
        {
            const double a = (double) mono[(size_t) (aStart + i)];
            const double b = (double) mono[(size_t) (bStart + i)];
            dot += a * b;
            na += a * a;
            nb += b * b;
        }

        if (na < 1.0e-12 || nb < 1.0e-12)
            return 0.0;

        return dot / std::sqrt (na * nb);
    }

    int snapRisingZero (const std::vector<float>& mono, int pos, int span)
    {
        int snapped = pos;
        int bestDist = span + 1;

        for (int i = -span; i <= span; ++i)
        {
            const int a = pos + i;
            const int b = a + 1;
            if (a < 1 || b >= (int) mono.size())
                continue;

            if (mono[(size_t) a] <= 0.0f && mono[(size_t) b] > 0.0f)
            {
                const int dist = i < 0 ? -i : i;
                if (dist < bestDist)
                {
                    snapped = b;
                    bestDist = dist;
                }
            }
        }

        return snapped;
    }

    int alignToPeriod (int pos, int period, int minPos, int maxPos)
    {
        if (period <= 0)
            return pos;

        if (minPos > maxPos)
            return juce::jlimit (juce::jmin (minPos, maxPos), juce::jmax (minPos, maxPos), pos);

        const int cycles = (int) std::round ((double) (pos - minPos) / (double) period);
        const int aligned = minPos + cycles * period;
        return juce::jlimit (minPos, maxPos, aligned);
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
    const auto sr = buffer.sampleRate;

    const auto xfade = juce::jmax (256, (int) (rules.minCrossfadeMs * 0.001 * sr));
    const auto minLoop = juce::jmax (rules.minLoopSamples, (int) (rules.minLoopSec * sr));
    const auto maxLoop = (int) (rules.maxLoopSec * sr);

    if (! buffer.loop || samples < minLoop + xfade * 2 + (int) (0.35 * sr))
    {
        buffer.loop = false;
        return;
    }

    const auto searchStart = juce::jlimit (0, juce::jmax (0, samples - 2),
                                           (int) (samples * (double) rules.loopSearchStart));
    const auto searchEndCap = juce::jmax (searchStart, samples - 1);
    const auto searchEndMin = juce::jmin (searchStart + 8, searchEndCap);
    const auto searchEnd = juce::jlimit (searchEndMin, searchEndCap,
                                         (int) (samples * (double) rules.loopSearchEnd));
    const auto avail = searchEnd - searchStart;

    if (avail < minLoop + xfade)
    {
        buffer.loop = false;
        return;
    }

    std::vector<float> mono ((size_t) samples);
    for (int i = 0; i < samples; ++i)
    {
        float sum = 0.0f;
        for (int ch = 0; ch < channels; ++ch)
            sum += buffer.audio.getSample (ch, i);
        mono[(size_t) i] = sum / (float) channels;
    }

    const int pitchPeriod = estimatePeriod (mono, searchStart + avail / 4, sr);
    const int vibPeriod = estimateVibratoPeriod (mono, searchStart, searchEnd, sr);
    const int alignPeriod = pitchPeriod > 0 && vibPeriod > 0
        ? juce::jmax (pitchPeriod, vibPeriod)
        : juce::jmax (pitchPeriod, vibPeriod);

    auto loopScore = [&] (int start, int end) -> double
    {
        if (end - start <= xfade * 2 + 64)
            return -1.0;

        const auto boundary = correlate (mono, start, end - xfade, xfade);
        const auto bodyWin = juce::jmin (xfade * 2, (end - start - xfade * 2) / 2);
        const auto body = bodyWin >= 64
            ? correlate (mono, start + xfade, end - xfade - bodyWin, bodyWin)
            : boundary;

        double dot = 0.0, na = 0.0, nb = 0.0;
        const int slopeN = juce::jmin (128, xfade);
        for (int i = 1; i < slopeN; i += 2)
        {
            const double a = (double) mono[(size_t) (start + i)] - (double) mono[(size_t) (start + i - 1)];
            const double b = (double) mono[(size_t) (end - xfade + i)] - (double) mono[(size_t) (end - xfade + i - 1)];
            dot += a * b;
            na += a * a;
            nb += b * b;
        }

        const auto slope = (na < 1.0e-12 || nb < 1.0e-12) ? 0.0 : dot / std::sqrt (na * nb);

        double rmsSumA = 0.0, rmsSumB = 0.0;
        int rmsCount = 0;
        for (int i = 0; i < xfade; i += 4)
        {
            const double a = (double) mono[(size_t) (start + i)];
            const double b = (double) mono[(size_t) (end - xfade + i)];
            rmsSumA += a * a;
            rmsSumB += b * b;
            ++rmsCount;
        }
        const auto rmsA2 = std::sqrt (rmsSumA / (double) juce::jmax (1, rmsCount));
        const auto rmsB2 = std::sqrt (rmsSumB / (double) juce::jmax (1, rmsCount));
        const auto rmsDelta = std::abs (rmsA2 - rmsB2) / juce::jmax (rmsA2, rmsB2, 1.0e-6);

        return boundary * 0.42 + body * 0.38 + slope * 0.12 - rmsDelta * 0.35;
    };

    std::vector<int> lengths;
    const double candidates[] = { rules.loopWindowSec, 1.8, 2.2, 2.6, 3.0, 3.4 };

    for (double sec : candidates)
    {
        int len = (int) (sec * sr);
        if (alignPeriod > 0)
        {
            const int body = juce::jmax (alignPeriod,
                                         (int) std::round (((sec * sr) - (double) xfade) / (double) alignPeriod) * alignPeriod);
            len = body + xfade;
        }

        if (len < minLoop || len > maxLoop || len + xfade >= avail)
            continue;

        bool dup = false;
        for (int existing : lengths)
        {
            const int delta = existing > len ? existing - len : len - existing;
            if (delta < juce::jmax (32, alignPeriod / 2))
                dup = true;
        }
        if (! dup)
            lengths.push_back (len);
    }

    if (lengths.empty())
    {
        int len = juce::jmin (maxLoop, avail - xfade);
        if (alignPeriod > 0)
            len = juce::jmax (minLoop, ((len - xfade) / alignPeriod) * alignPeriod + xfade);
        if (len >= minLoop)
            lengths.push_back (len);
    }

    if (lengths.empty())
    {
        buffer.loop = false;
        return;
    }

    double bestScore = -1.0e9;
    int bestStart = searchStart;
    int bestEnd = searchStart + minLoop;
    const int hop = alignPeriod > 0 ? juce::jmax (8, alignPeriod / 8) : juce::jmax (64, (int) (sr * 0.004));
    const int searchRadius = alignPeriod > 0
        ? juce::jmax (alignPeriod * 3, (int) (sr * 0.05))
        : (int) (sr * 0.14);

    for (int len : lengths)
    {
        const int start0 = searchEnd - len;
        if (start0 < searchStart)
            continue;

        double localScore = -1.0e9;
        int localStart = start0;
        int localEnd = start0 + len;
        const int from = juce::jmax (searchStart, start0 - searchRadius);
        const int to = juce::jmin (searchEnd - minLoop, start0 + searchRadius);

        for (int start = from; start <= to; start += hop)
        {
            const int end = start + len;
            if (end + xfade >= samples || end > searchEnd + (int) (sr * 0.02))
                continue;

            const auto score = loopScore (start, end) + 0.04 * ((double) len / sr);
            if (score > localScore)
            {
                localScore = score;
                localStart = start;
                localEnd = end;
            }
        }

        const int refineFrom = juce::jmax (searchStart, localStart - juce::jmax (128, alignPeriod));
        const int refineTo = juce::jmin (samples - len - xfade - 2, localStart + juce::jmax (128, alignPeriod));

        for (int start = refineFrom; start <= refineTo; ++start)
        {
            const int end = start + len;
            if (end + xfade >= samples)
                continue;

            const auto score = loopScore (start, end) + 0.04 * ((double) len / sr);
            if (score > localScore)
            {
                localScore = score;
                localStart = start;
                localEnd = end;
            }
        }

        if (localScore > bestScore)
        {
            bestScore = localScore;
            bestStart = localStart;
            bestEnd = localEnd;
        }
    }

    if (bestScore < (double) rules.minLoopCorrelation)
    {
        buffer.loop = false;
        return;
    }

    const int zcSpan = juce::jmax (8, (int) (0.012 * sr));
    int snapped = snapRisingZero (mono, bestStart, zcSpan);
    if (alignPeriod > 0)
    {
        const int alignMin = juce::jmax (searchStart, bestStart - alignPeriod);
        const int alignMax = juce::jmin (searchEnd - (bestEnd - bestStart) - xfade, bestStart + alignPeriod);

        if (alignMin <= alignMax)
            snapped = alignToPeriod (snapped, alignPeriod, alignMin, alignMax);
    }

    const int snappedEnd = snapped + (bestEnd - bestStart);
    if (snappedEnd < samples - 2 && loopScore (snapped, snappedEnd) >= bestScore - 0.05)
    {
        bestStart = snapped;
        bestEnd = snappedEnd;
    }

    for (int ch = 0; ch < channels; ++ch)
    {
        auto* data = buffer.audio.getWritePointer (ch);
        for (int i = 0; i < xfade; ++i)
        {
            const float t = xfade <= 1 ? 1.0f : (float) i / (float) (xfade - 1);
            const float fadeOut = std::cos (t * juce::MathConstants<float>::halfPi);
            const float fadeIn = std::sin (t * juce::MathConstants<float>::halfPi);
            const int dst = bestEnd - xfade + i;
            data[dst] = data[dst] * fadeOut + data[bestStart + i] * fadeIn;
        }
    }

    buffer.loop = true;
    buffer.loopStart = bestStart + xfade;
    buffer.loopEnd = bestEnd;
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
        const auto entryLower = sample.entry.toLowerCase();
        const auto oneShot = entryLower.contains ("_1_") && ! entryLower.contains ("_15_")
                             && ! entryLower.contains ("very-long") && ! entryLower.contains ("_long_");
        if ((artic == Articulation::longArt || artic == Articulation::sustain) && oneShot)
            continue;
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
