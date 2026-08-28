#pragma once

#include <JuceHeader.h>

class AudioEngine;

struct ProcessMetrics
{
    double cpuPercent = 0.0;
    double audioCpuPercent = 0.0;
    juce::int64 workingSetBytes = 0;
    juce::int64 privateBytes = 0;
    double limiterNsPerSample = 0.0;
};

namespace SessionDiagnostics
{
    ProcessMetrics collectProcessMetrics (const AudioEngine& engine);
    juce::var toVar (const ProcessMetrics& metrics, int pluginCount, int clients);
}
