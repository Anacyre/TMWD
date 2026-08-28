#pragma once

#include <JuceHeader.h>
#include "../Model/ProjectModel.h"

/*  Gain staging, metering, equal-power pan, and logical mute/solo.
    X-series insert DSP (including Limiter X) runs in the browser AudioWorklet
    on the remote mix. Native insert slots are routing metadata. Limiter X
    C++ lives in LimiterX.h for diagnostics and matching parameter semantics.
*/

class MixerEngine
{
public:
    static constexpr int maxChannels = 64;

    enum class InsertKind : int
    {
        none = 0,
        equalizer = 1,
        reverb = 2,
        boost = 3,
        dynamics = 4,
        limiter = 5
    };

    MixerEngine();

    //==============================================================================
    // Message thread
    void prepare (double sampleRate, int numChannelsInUse, int maximumBlockSize = 2048);

    void setChannelParameters (int index, float gainPosition, float pan, bool audible);
    void setChannelInserts (int index, InsertKind slotA, InsertKind slotB);
    void setMasterGain (float gainPosition);
    void setMasterInserts (InsertKind slotA, InsertKind slotB);
    void setNumChannels (int count);

    static InsertKind kindFromSlot (const PluginSlot& slot);

    struct FxInsertParams
    {
        std::atomic<float> eqHighPassHz { 85.0f };
        std::atomic<float> eqHighShelfDb { 1.8f };
        std::atomic<float> reverbWet { 0.32f };
        std::atomic<float> reverbRoom { 0.62f };
        std::atomic<float> reverbDamp { 0.38f };
        std::atomic<float> boostDrive { 1.85f };
        std::atomic<float> dynThresholdDb { -16.0f };
        std::atomic<float> dynMakeupDb { 1.0f };
        std::atomic<float> limiterGainDb { 0.0f };
        std::atomic<float> limiterReleaseMs { 100.0f };
    };

    /** Track index 0 is the master bus; 1+ are mixer channels. */
    FxInsertParams* getFxParamsForTrack (int trackIndex) noexcept;
    const FxInsertParams* getFxParamsForTrack (int trackIndex) const noexcept;

    float getChannelLevel (int index) const;
    float getMasterLevel() const;
    float getMasterRms() const { return masterRms.load(); }
    bool isMasterClipping() const { return masterClip.load(); }

    //==============================================================================
    // Audio thread
    /** Mixes one rendered track buffer into the master bus, applying inserts, gain and pan. */
    void mixChannel (int index, const juce::AudioBuffer<float>& source,
                     juce::AudioBuffer<float>& master, int numSamples);

    /** Applies master inserts, the master fader and updates the master meter. */
    void processMaster (juce::AudioBuffer<float>& master, int numSamples);

    /** Drops all meters to zero, for when the transport stops. */
    void clearLevels();

private:
    struct InsertChain
    {
        std::atomic<int> slotA { 0 };
        std::atomic<int> slotB { 0 };
        juce::IIRFilter highPass[2];
        juce::IIRFilter highShelf[2];
        juce::Reverb reverb;
        float env[2] { 0.0f, 0.0f };
        FxInsertParams params;
        float cachedHighPassHz = -1.0f;
        float cachedHighShelfDb = -1000.0f;
        float cachedReverbWet = -1.0f;
        float cachedReverbRoom = -1.0f;
        float cachedReverbDamp = -1.0f;
    };

    struct Channel
    {
        std::atomic<float> targetGain { 0.0f };
        std::atomic<float> targetPan { 0.0f };
        std::atomic<float> meterLevel { 0.0f };
        InsertChain inserts;

        // Audio-thread-only ramps.
        float currentGain = 0.0f;
        float currentPan = 0.0f;
    };

    void prepareChain (InsertChain& chain);
    void processInserts (InsertChain& chain, juce::AudioBuffer<float>& buffer, int numSamples);
    void applyKind (InsertChain& chain, InsertKind kind, juce::AudioBuffer<float>& buffer, int numSamples);
    static void updateMeter (std::atomic<float>& meter, float peak, float decay);

    std::array<Channel, (size_t) maxChannels> channels;
    Channel masterChannel;
    juce::AudioBuffer<float> work;
    std::atomic<int> numChannels { 0 };
    std::atomic<float> masterRms { 0.0f };
    std::atomic<bool> masterClip { false };
    double currentSampleRate = 44100.0;
    float smoothingCoefficient = 0.2f;
    float meterDecay = 0.85f;
    float compressorAttack = 0.08f;
    float compressorRelease = 0.008f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MixerEngine)
};
