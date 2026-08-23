#pragma once

#include <JuceHeader.h>
#include "../Model/ProjectModel.h"

/*  Gain staging and metering for the track buses and the master bus.

    The mixer UI writes targets through setChannelParameters(); the audio thread reads
    them and ramps towards them, so moving a fader never produces a click and never makes
    the message thread wait.  Meter levels travel back the same way, as atomics the UI
    samples at its own rate.
*/
class MixerEngine
{
public:
    static constexpr int maxChannels = 64;

    MixerEngine();

    //==============================================================================
    // Message thread
    void prepare (double sampleRate, int numChannelsInUse);

    void setChannelParameters (int index, float gainPosition, float pan, bool audible);
    void setMasterGain (float gainPosition);
    void setNumChannels (int count);

    float getChannelLevel (int index) const;
    float getMasterLevel() const;

    //==============================================================================
    // Audio thread
    /** Mixes one rendered track buffer into the master bus, applying gain and pan. */
    void mixChannel (int index, const juce::AudioBuffer<float>& source,
                     juce::AudioBuffer<float>& master, int numSamples);

    /** Applies the master fader and updates the master meter. */
    void processMaster (juce::AudioBuffer<float>& master, int numSamples);

    /** Drops all meters to zero, for when the transport stops. */
    void clearLevels();

private:
    struct Channel
    {
        std::atomic<float> targetGain { 0.0f };
        std::atomic<float> targetPan { 0.0f };
        std::atomic<float> meterLevel { 0.0f };

        // Audio-thread-only ramps.
        float currentGain = 0.0f;
        float currentPan = 0.0f;
    };

    static void updateMeter (std::atomic<float>& meter, float peak, float decay);

    std::array<Channel, (size_t) maxChannels> channels;
    Channel masterChannel;
    std::atomic<int> numChannels { 0 };
    float smoothingCoefficient = 0.2f;
    float meterDecay = 0.85f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MixerEngine)
};
