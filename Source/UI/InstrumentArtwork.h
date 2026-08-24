#pragma once

#include <JuceHeader.h>

/*  Large line-art glyphs for Orchestra Sampler.

    Crops the supplied instrument sheets at runtime and recolors them for the dark UI.
    Choir has no matching cell in the sheets, so that glyph is drawn with the same
    stroke weight rather than substituting a different instrument.
*/
namespace InstrumentArtwork
{
    juce::Image glyphFor (const juce::String& instrumentId,
                          const juce::String& displayName,
                          const juce::String& category);
}
