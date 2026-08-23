#include "Transport.h"

void Transport::prepare (double newSampleRate)
{
    sampleRate = newSampleRate > 0.0 ? newSampleRate : 44100.0;
    lastBpm = 0.0;
    updateRate();
}

void Transport::updateRate()
{
    const auto currentBpm = bpm.load();

    if (currentBpm == lastBpm)
        return;

    lastBpm = currentBpm;
    const auto ticksPerSecond = currentBpm / 60.0 * (double) MusicalTime::ticksPerQuarterNote;
    ticksPerSample = ticksPerSecond / sampleRate;
    samplesPerTick = ticksPerSample > 0.0 ? 1.0 / ticksPerSample : 0.0;
}

void Transport::setPlaying (bool shouldPlay)
{
    playing.store (shouldPlay);
}

void Transport::setLoopRangeBeats (double startBeats, double endBeats)
{
    const auto start = MusicalTime::beatsToTicks (juce::jmax (0.0, startBeats));
    const auto end = juce::jmax (start + MusicalTime::ticksPerQuarterNote / 4,
                                 MusicalTime::beatsToTicks (endBeats));
    loopStartTick.store (start);
    loopEndTick.store (end);
}

void Transport::seekToBeats (double beats)
{
    seekTargetTick.store (MusicalTime::beatsToTicks (juce::jmax (0.0, beats)));
    seekRequest.fetch_add (1);
}

//==============================================================================
int Transport::prepareBlock (int numSamples, Segment* segments)
{
    updateRate();

    const auto seek = seekRequest.load();
    bool discontinuity = false;

    if (seek != lastSeenSeekRequest)
    {
        lastSeenSeekRequest = seek;
        currentTick = (double) seekTargetTick.load();
        discontinuity = true;
    }

    const auto nowPlaying = playing.load();

    if (nowPlaying != wasPlaying)
    {
        wasPlaying = nowPlaying;
        discontinuity = true;
    }

    if (! nowPlaying)
    {
        publishedTick.store ((juce::int64) currentTick);
        return 0;
    }

    const auto loop = looping.load();
    const auto loopStart = (double) loopStartTick.load();
    const auto loopEnd = (double) loopEndTick.load();

    if (loop && (currentTick < loopStart || currentTick >= loopEnd))
    {
        currentTick = loopStart;
        discontinuity = true;
    }

    int numSegments = 0;
    int samplesRemaining = numSamples;
    int sampleOffset = 0;

    while (samplesRemaining > 0 && numSegments < maxSegmentsPerBlock)
    {
        auto& segment = segments[numSegments];
        segment.startSample = sampleOffset;
        segment.startTick = currentTick;
        segment.startsDiscontinuity = discontinuity;
        discontinuity = false;

        auto samplesThisSegment = samplesRemaining;

        if (loop)
        {
            // Stop the segment exactly on the loop end so no event is played twice.
            const auto ticksToLoopEnd = loopEnd - currentTick;
            const auto samplesToLoopEnd = (int) std::floor (ticksToLoopEnd * samplesPerTick);

            if (samplesToLoopEnd < samplesThisSegment)
                samplesThisSegment = juce::jmax (0, samplesToLoopEnd);
        }

        if (samplesThisSegment <= 0)
        {
            // The loop point falls inside this sample; restart and continue.
            currentTick = loopStart;
            discontinuity = true;
            segments[numSegments].numSamples = 0;
            continue;
        }

        segment.numSamples = samplesThisSegment;
        currentTick += (double) samplesThisSegment * ticksPerSample;
        segment.endTick = currentTick;

        sampleOffset += samplesThisSegment;
        samplesRemaining -= samplesThisSegment;
        ++numSegments;

        if (loop && currentTick >= loopEnd - 1.0e-9)
        {
            currentTick = loopStart;
            discontinuity = true;
        }
    }

    if (! loop)
    {
        const auto contentEnd = (double) contentLengthTicks.load();

        if (contentEnd > 0.0 && currentTick >= contentEnd)
            reachedEnd.store (true);
    }

    return numSegments;
}

void Transport::finishBlock()
{
    publishedTick.store ((juce::int64) currentTick);
}
