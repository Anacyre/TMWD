#pragma once

#include <JuceHeader.h>
#include "../Model/ProjectModel.h"

/*  Playback position, tempo and loop state.

    Requests arrive from the message thread as plain atomics; the audio thread is the
    only thing that moves the position, and publishes it back through another atomic for
    the playhead to read.  Nothing here locks, and the message thread never has to wait
    for a callback to finish.
*/
class Transport
{
public:
    Transport() = default;

    /** One contiguous stretch of a block during which time runs continuously. A block is
        split into two of these when playback wraps around the loop end.
    */
    struct Segment
    {
        int startSample = 0;
        int numSamples = 0;
        double startTick = 0.0;
        double endTick = 0.0;
        bool startsDiscontinuity = false;   // a seek or loop wrap landed here
    };

    static constexpr int maxSegmentsPerBlock = 3;

    //==============================================================================
    // Message thread
    void prepare (double newSampleRate);

    void setBpm (double newBpm)         { bpm.store (juce::jlimit (20.0, 300.0, newBpm)); }
    double getBpm() const               { return bpm.load(); }

    void setPlaying (bool shouldPlay);
    bool isPlaying() const              { return playing.load(); }

    void setLooping (bool shouldLoop)   { looping.store (shouldLoop); }
    bool isLooping() const              { return looping.load(); }
    void setLoopRangeBeats (double startBeats, double endBeats);

    /** Moves the playhead.  Takes effect at the start of the next block. */
    void seekToBeats (double beats);

    double getPositionBeats() const { return MusicalTime::ticksToBeats (publishedTick.load()); }

    /** Highest tick that contains material, so playback can stop at the end. */
    void setContentLengthTicks (juce::int64 ticks) { contentLengthTicks.store (ticks); }

    //==============================================================================
    // Audio thread
    /** Splits `numSamples` at loop boundaries.  Returns the number of segments written,
        or 0 when the transport is stopped.
    */
    int prepareBlock (int numSamples, Segment* segments);

    /** Publishes the position reached by the last prepareBlock() call. */
    void finishBlock();

    double getTicksPerSample() const noexcept { return ticksPerSample; }
    double getSamplesPerTick() const noexcept { return samplesPerTick; }

    /** True when the audio thread rolled past the end of the material this block. */
    bool consumeReachedEnd() { return reachedEnd.exchange (false); }

private:
    void updateRate();

    std::atomic<double> bpm { 96.0 };
    std::atomic<bool> playing { false };
    std::atomic<bool> looping { false };
    std::atomic<juce::int64> loopStartTick { 0 };
    std::atomic<juce::int64> loopEndTick { MusicalTime::ticksPerQuarterNote * 32 };
    std::atomic<juce::int64> contentLengthTicks { 0 };

    std::atomic<juce::int64> seekTargetTick { 0 };
    std::atomic<juce::uint32> seekRequest { 0 };
    std::atomic<juce::int64> publishedTick { 0 };
    std::atomic<bool> reachedEnd { false };

    // Audio-thread-only state.
    double currentTick = 0.0;
    double sampleRate = 44100.0;
    double lastBpm = 0.0;
    double ticksPerSample = 0.0;
    double samplesPerTick = 0.0;
    juce::uint32 lastSeenSeekRequest = 0;
    bool wasPlaying = false;
};
