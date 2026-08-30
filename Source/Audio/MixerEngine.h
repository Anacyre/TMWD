#pragma once

#include <JuceHeader.h>
#include "../Model/ProjectModel.h"
#include "XSeries/XSeriesInsert.h"

/*  Gain staging, metering, equal-power pan, logical mute/solo and native
    X-series track/master inserts.

    Ownership contract with the browser:
      - A native VST track's gain, pan and track inserts are applied here.
      - `pushPreMaster` taps the summed bus *before* the master strip, so the
        browser applies master FX and the master fader exactly once.
      - `processMaster` is the local monitoring path for the PC's own output.
*/

class MixerEngine
{
public:
    static constexpr int maxChannels = 64;
    static constexpr int insertSlots = 5;

    using InsertKind = XSeriesInsert::Kind;

    MixerEngine();

    //==============================================================================
    // Message thread
    void prepare (double sampleRate, int numChannelsInUse, int maximumBlockSize = 2048);

    void setChannelParameters (int index, float gainPosition, float pan, bool audible);
    void setChannelInserts (int index, InsertKind slotA, InsertKind slotB);
    void setChannelInsertKind (int index, int slot, InsertKind kind);
    void setChannelInsertValue (int index, int slot, int valueIndex, float value);
    void clearChannelInsertValues (int index, int slot);
    void setMasterGain (float gainPosition);
    void setMasterInserts (InsertKind slotA, InsertKind slotB);
    void setMasterInsertKind (int slot, InsertKind kind);
    void setMasterInsertValue (int slot, int valueIndex, float value);
    void clearMasterInsertValues (int slot);
    void setNumChannels (int count);

    static InsertKind kindFromSlot (const PluginSlot& slot);
    static InsertKind kindFromId (const juce::String& pluginId, const juce::String& displayName);

    float getChannelLevel (int index) const;
    float getMasterLevel() const;
    float getMasterRms() const { return masterRms.load(); }
    bool isMasterClipping() const { return masterClip.load(); }

    /** Total native inserts currently running, for diagnostics. */
    int getActiveInsertCount() const;

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
    using InsertChain = std::array<XSeriesInsert, (size_t) insertSlots>;

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
    static void updateMeter (std::atomic<float>& meter, float peak, float decay);
    Channel* channelFor (int index) noexcept;

    std::array<Channel, (size_t) maxChannels> channels;
    Channel masterChannel;
    juce::AudioBuffer<float> work;
    std::atomic<int> numChannels { 0 };
    std::atomic<float> masterRms { 0.0f };
    std::atomic<bool> masterClip { false };
    double currentSampleRate = 44100.0;
    int currentBlockSize = 2048;
    float smoothingCoefficient = 0.2f;
    float meterDecay = 0.85f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MixerEngine)
};
