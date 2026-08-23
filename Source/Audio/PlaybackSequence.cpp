#include "PlaybackSequence.h"
#include <algorithm>

PlaybackSequence::PlaybackSequence (int numTracks)
{
    trackEvents.resize ((size_t) juce::jmax (0, numTracks));
}

void PlaybackSequence::addNote (int trackIndex, int midiChannel, int pitch, juce::uint8 velocity,
                                juce::int64 startTick, juce::int64 endTick)
{
    if (! juce::isPositiveAndBelow (trackIndex, (int) trackEvents.size()))
        return;

    const auto channel = (juce::uint8) (juce::jlimit (1, 16, midiChannel) - 1);
    const auto note = (juce::uint8) juce::jlimit (0, 127, pitch);
    const auto safeEnd = juce::jmax (startTick + 1, endTick);

    auto& events = trackEvents[(size_t) trackIndex];
    events.push_back ({ startTick, (juce::uint8) (0x90 | channel), note, juce::jmax ((juce::uint8) 1, velocity) });
    events.push_back ({ safeEnd,   (juce::uint8) (0x80 | channel), note, 0 });

    lengthTicks = juce::jmax (lengthTicks, safeEnd);
    totalEvents += 2;
}

void PlaybackSequence::finalise()
{
    for (auto& events : trackEvents)
    {
        // Note-offs sort before note-ons at the same tick so a repeated pitch retriggers
        // cleanly instead of the release cutting the new note short.
        std::stable_sort (events.begin(), events.end(),
                          [] (const SequencedEvent& a, const SequencedEvent& b)
                          {
                              if (a.tick != b.tick)
                                  return a.tick < b.tick;

                              return (a.status & 0xf0) < (b.status & 0xf0);
                          });
    }
}

const std::vector<SequencedEvent>& PlaybackSequence::getEvents (int trackIndex) const
{
    static const std::vector<SequencedEvent> empty;

    if (! juce::isPositiveAndBelow (trackIndex, (int) trackEvents.size()))
        return empty;

    return trackEvents[(size_t) trackIndex];
}
