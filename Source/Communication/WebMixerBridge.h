#pragma once

#include <JuceHeader.h>
#include "../Audio/MixerEngine.h"

/*  Translates the browser's serialized mixer state into native X-series insert
    slots, so a track that plays through the PC engine gets the same processing
    the browser would have applied to a browser-owned track.

    Only per-track and master lanes are mapped. The `remote` lane belongs to the
    browser: it is the summed tap and must not be duplicated here.
*/
namespace WebMixerBridge
{
    /** Maps a plugin id / display name onto a native insert kind. */
    MixerEngine::InsertKind kindForPlugin (const juce::String& pluginId);

    /** Writes an insert's serialized `state` into the slot's flat value array. */
    void applyInsertState (MixerEngine& mixer, int channelIndex, int slot,
                           const juce::String& pluginId, const juce::var& state);

    /** Clears a slot so nothing from a removed plugin lingers. */
    void clearSlot (MixerEngine& mixer, int channelIndex, int slot);

    /** Number of insert lanes pushed, for diagnostics. */
    struct Applied
    {
        int lanes = 0;
        int inserts = 0;
    };
}
