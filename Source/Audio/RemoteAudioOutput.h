#pragma once

#include <JuceHeader.h>
#include <atomic>
#include <vector>

/*  One mixed stereo tap of the PC *pre-master* bus, for remote playback.

    This is NOT per-track PCM and it is NOT the local master strip. Native VST
    tracks have already been summed (gain, pan and track inserts) by
    MixerEngine; the browser then applies return FX, the Mix-strip inserts and
    the single master fader. Calling this after processMaster() would double-
    apply master.

    Transport is deliberately not hard-coded.  WebGateway currently packs these
    frames as WebSocket binary; WebRTC (or another browser-native path) can
    consume the same pullPacket() without changing the audio thread.
*/
class RemoteAudioOutput
{
public:
    static constexpr int channels = 2;
    static constexpr juce::uint32 magic = 0x41574144; // 'DAWA'
    static constexpr juce::uint16 packetVersion = 1;
    static constexpr juce::uint32 flagUnderrun = 1u;
    static constexpr juce::uint32 flagOverflow = 2u;
    static constexpr juce::uint32 flagClick    = 4u;

    RemoteAudioOutput();

    void prepare (double sampleRate, int blockSize);
    void setEnabled (bool shouldBeEnabled) noexcept { enabled.store (shouldBeEnabled); }
    bool isEnabled() const noexcept                 { return enabled.load(); }

    /** Audio thread. Copies the pre-master summed bus. Never allocates. */
    void pushPreMaster (const juce::AudioBuffer<float>& mix, int numSamples);

    /** Alias kept so existing call sites compile; forwards to pushPreMaster. */
    void pushMaster (const juce::AudioBuffer<float>& master, int numSamples);

    /** Network / message thread.  Builds one packet; returns false if idle. */
    bool pullPacket (juce::MemoryBlock& dest, int maxFrames);

    void requestClick (juce::uint64 token) noexcept;
    void resetCounters() noexcept;

    double getSampleRate() const noexcept { return sampleRate.load(); }
    int getBlockSize() const noexcept     { return blockSize.load(); }
    juce::uint32 getSequence() const noexcept { return sequence.load(); }
    juce::uint32 getUnderruns() const noexcept { return underruns.load(); }
    juce::uint32 getOverflows() const noexcept { return overflows.load(); }
    int getAvailableFrames() const;
    int getBufferDepthMs() const;

    juce::var describeStatus() const;

private:
    static constexpr int ringFrames = 48000 * 2;

    void writeHeader (char* dest, juce::uint32 flags, juce::uint32 frameCount,
                      juce::uint64 hostMicros, juce::uint64 clickToken) const noexcept;

    juce::AbstractFifo fifo { ringFrames };
    std::vector<float> storage;
    std::atomic<bool> enabled { false };
    std::atomic<double> sampleRate { 44100.0 };
    std::atomic<int> blockSize { 512 };
    std::atomic<juce::uint32> sequence { 0 };
    std::atomic<juce::uint32> underruns { 0 };
    std::atomic<juce::uint32> overflows { 0 };
    std::atomic<juce::uint64> pendingClick { 0 };
    std::atomic<juce::uint64> injectedClick { 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (RemoteAudioOutput)
};
