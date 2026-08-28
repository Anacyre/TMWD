#include "SessionDiagnostics.h"
#include "AudioEngine.h"
#include "LimiterX.h"

#if JUCE_WINDOWS
 #include <windows.h>
 #include <psapi.h>
#endif

ProcessMetrics SessionDiagnostics::collectProcessMetrics (const AudioEngine& engine)
{
    ProcessMetrics metrics;
    metrics.audioCpuPercent = engine.getDeviceManager().getCpuUsage() * 100.0;

#if JUCE_WINDOWS
    PROCESS_MEMORY_COUNTERS_EX memory {};
    memory.cb = sizeof (memory);

    if (GetProcessMemoryInfo (GetCurrentProcess(), (PROCESS_MEMORY_COUNTERS*) &memory, sizeof (memory)))
    {
        metrics.workingSetBytes = (juce::int64) memory.WorkingSetSize;
        metrics.privateBytes = (juce::int64) memory.PrivateUsage;
    }

    FILETIME idleTime {}, kernelTime {}, userTime {};
    if (GetSystemTimes (&idleTime, &kernelTime, &userTime))
    {
        // Process-times CPU is sampled coarsely from GetProcessTimes vs wall clock.
        FILETIME creation {}, exit {}, kernel {}, user {};
        if (GetProcessTimes (GetCurrentProcess(), &creation, &exit, &kernel, &user))
        {
            ULARGE_INTEGER k, u;
            k.LowPart = kernel.dwLowDateTime;
            k.HighPart = kernel.dwHighDateTime;
            u.LowPart = user.dwLowDateTime;
            u.HighPart = user.dwHighDateTime;
            static juce::uint64 lastTotal = 0;
            static double lastStamp = 0.0;
            const auto total = k.QuadPart + u.QuadPart;
            const auto now = juce::Time::getMillisecondCounterHiRes();

            if (lastStamp > 0.0 && now > lastStamp)
            {
                const auto delta100ns = (double) (total - lastTotal);
                const auto deltaSec = (now - lastStamp) / 1000.0;
                const auto cores = juce::jmax (1, juce::SystemStats::getNumCpus());
                metrics.cpuPercent = juce::jlimit (0.0, 100.0 * cores,
                                                   (delta100ns / 1.0e7) / deltaSec / (double) cores * 100.0);
            }

            lastTotal = total;
            lastStamp = now;
        }
    }
#else
    juce::ignoreUnused (engine);
#endif

    static double cachedNs = 0.0;
    static double lastBenchMs = 0.0;
    const auto now = juce::Time::getMillisecondCounterHiRes();

    if (cachedNs <= 0.0 || now - lastBenchMs > 2500.0)
    {
        cachedNs = LimiterXProcessor::benchmarkNsPerSample (48000, 4096);
        lastBenchMs = now;
    }

    metrics.limiterNsPerSample = cachedNs;
    return metrics;
}

juce::var SessionDiagnostics::toVar (const ProcessMetrics& metrics, int pluginCount, int clients)
{
    auto* object = new juce::DynamicObject();
    object->setProperty ("cpuPercent", metrics.cpuPercent);
    object->setProperty ("audioCpuPercent", metrics.audioCpuPercent);
    object->setProperty ("workingSetMb", (double) metrics.workingSetBytes / (1024.0 * 1024.0));
    object->setProperty ("privateMb", (double) metrics.privateBytes / (1024.0 * 1024.0));
    object->setProperty ("pluginCount", pluginCount);
    object->setProperty ("clients", clients);
    object->setProperty ("cores", juce::SystemStats::getNumCpus());
    object->setProperty ("limiterNsPerSample", metrics.limiterNsPerSample);
    return juce::var (object);
}
