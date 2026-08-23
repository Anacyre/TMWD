#pragma once

#include <JuceHeader.h>
#include "PlaybackSequence.h"
#include "Transport.h"

/*  Turns a stretch of musical time into MIDI.

    Runs on the audio thread only.  Each track keeps a read cursor into its event list so
    the common case - time moving forward - costs one comparison per event.  A seek or a
    loop wrap invalidates the cursors, and they are re-found with a binary search.
*/
class MidiSequencer
{
public:
    MidiSequencer() = default;

    /** Sizes the cursor table up front so the audio thread never allocates. */
    void prepare (int maxTracks);

    /** Takes the sequence the engine just swapped in.  Audio thread. */
    void setSequence (const PlaybackSequence* newSequence);
    const PlaybackSequence* getSequence() const noexcept { return sequence; }

    /** Appends every event inside the segment to the matching track buffer, positioned
        at its sample offset within the block.
    */
    void renderSegment (const Transport::Segment& segment,
                        double samplesPerTick,
                        juce::MidiBuffer* trackBuffers,
                        int numTrackBuffers);

    /** Forces the next segment to re-find its position. */
    void invalidateCursors();

private:
    void seekCursors (juce::int64 tick);

    const PlaybackSequence* sequence = nullptr;
    std::vector<int> cursors;
    bool cursorsValid = false;
};
