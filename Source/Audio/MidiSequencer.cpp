#include "MidiSequencer.h"
#include <algorithm>

void MidiSequencer::prepare (int maxTracks)
{
    cursors.assign ((size_t) juce::jmax (1, maxTracks), 0);
    cursorsValid = false;
}

void MidiSequencer::setSequence (const PlaybackSequence* newSequence)
{
    sequence = newSequence;
    cursorsValid = false;
}

void MidiSequencer::invalidateCursors()
{
    cursorsValid = false;
}

void MidiSequencer::seekCursors (juce::int64 tick)
{
    if (sequence == nullptr)
        return;

    const auto numTracks = juce::jmin ((int) cursors.size(), sequence->getNumTracks());

    for (int track = 0; track < numTracks; ++track)
    {
        const auto& events = sequence->getEvents (track);
        const auto it = std::lower_bound (events.begin(), events.end(), tick,
                                          [] (const SequencedEvent& e, juce::int64 t) { return e.tick < t; });
        cursors[(size_t) track] = (int) std::distance (events.begin(), it);
    }

    cursorsValid = true;
}

void MidiSequencer::renderSegment (const Transport::Segment& segment,
                                   double samplesPerTick,
                                   juce::MidiBuffer* trackBuffers,
                                   int numTrackBuffers)
{
    if (sequence == nullptr || segment.numSamples <= 0)
        return;

    const auto startTick = (juce::int64) std::ceil (segment.startTick);
    const auto endTick = (juce::int64) std::ceil (segment.endTick);

    if (segment.startsDiscontinuity || ! cursorsValid)
        seekCursors (startTick);

    const auto numTracks = juce::jmin (numTrackBuffers,
                                       juce::jmin ((int) cursors.size(), sequence->getNumTracks()));

    for (int track = 0; track < numTracks; ++track)
    {
        const auto& events = sequence->getEvents (track);
        auto& cursor = cursors[(size_t) track];

        // A discontinuity may have moved the cursor backwards past events we already
        // emitted; lower_bound above has already placed it correctly.
        while (cursor < (int) events.size() && events[(size_t) cursor].tick < startTick)
            ++cursor;

        auto& buffer = trackBuffers[track];

        while (cursor < (int) events.size() && events[(size_t) cursor].tick < endTick)
        {
            const auto& event = events[(size_t) cursor];
            const auto offsetTicks = (double) event.tick - segment.startTick;
            const auto sampleOffset = juce::jlimit (0, segment.numSamples - 1,
                                                    (int) (offsetTicks * samplesPerTick));

            buffer.addEvent (event.toMidiMessage(), segment.startSample + sampleOffset);
            ++cursor;
        }
    }
}
