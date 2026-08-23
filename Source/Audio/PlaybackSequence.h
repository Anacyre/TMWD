#pragma once

#include <JuceHeader.h>
#include "../Model/ProjectModel.h"

/*  The project's clips and notes flattened into one sorted event list per track.

    The model is convenient to edit but awkward to read from an audio callback: notes
    live inside clips, clips are unordered, and finding "what happens in the next 512
    samples" would mean scanning everything.  So the message thread compiles the model
    into this structure, and the audio thread only ever walks a sorted vector.

    A published sequence is immutable.  Edits build a new one and hand it over through
    the engine's lock-free queue, which is what keeps note editing free of locks.
*/
struct SequencedEvent
{
    juce::int64 tick = 0;
    juce::uint8 status = 0;   // status byte including the MIDI channel
    juce::uint8 data1 = 0;
    juce::uint8 data2 = 0;

    juce::MidiMessage toMidiMessage() const
    {
        return juce::MidiMessage (status, data1, data2);
    }
};

class PlaybackSequence
{
public:
    explicit PlaybackSequence (int numTracks);

    /** Emits the note-on / note-off pair for one note.  Message thread only. */
    void addNote (int trackIndex, int midiChannel, int pitch, juce::uint8 velocity,
                  juce::int64 startTick, juce::int64 endTick);

    /** Sorts every track and caches the total length.  Call once before publishing. */
    void finalise();

    int getNumTracks() const noexcept { return (int) trackEvents.size(); }
    juce::int64 getLengthTicks() const noexcept { return lengthTicks; }
    int getTotalNumEvents() const noexcept { return totalEvents; }

    const std::vector<SequencedEvent>& getEvents (int trackIndex) const;

private:
    std::vector<std::vector<SequencedEvent>> trackEvents;
    juce::int64 lengthTicks = 0;
    int totalEvents = 0;

    JUCE_DECLARE_NON_COPYABLE (PlaybackSequence)
};
