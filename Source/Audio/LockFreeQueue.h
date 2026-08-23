#pragma once

#include <JuceHeader.h>
#include <array>

/*  Single-producer / single-consumer queue used for every message-thread to audio-thread
    hand-off.  The audio thread never allocates and never blocks: it drains whatever is
    waiting at the top of the callback and carries on.

    T must be trivially copyable - these carry parameter changes, MIDI previews and
    pointers to objects built on the message thread, never anything that owns memory.
*/
template <typename T, int capacity>
class LockFreeQueue
{
public:
    /** Producer side.  Returns false when the queue is full, which the caller must
        treat as "this update was dropped" rather than retrying in a spin loop.
    */
    bool push (const T& item)
    {
        const auto scope = fifo.write (1);

        if (scope.blockSize1 > 0)
            storage[(size_t) scope.startIndex1] = item;
        else if (scope.blockSize2 > 0)
            storage[(size_t) scope.startIndex2] = item;
        else
            return false;

        return true;
    }

    /** Consumer side. */
    bool pop (T& item)
    {
        const auto scope = fifo.read (1);

        if (scope.blockSize1 > 0)
            item = storage[(size_t) scope.startIndex1];
        else if (scope.blockSize2 > 0)
            item = storage[(size_t) scope.startIndex2];
        else
            return false;

        return true;
    }

    int getNumReady() const { return fifo.getNumReady(); }

    void reset() { fifo.reset(); }

private:
    juce::AbstractFifo fifo { capacity };
    std::array<T, (size_t) capacity> storage {};
};
