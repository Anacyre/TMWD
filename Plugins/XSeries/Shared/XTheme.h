#pragma once

#include <JuceHeader.h>

/** TMSS "Renaissance" light skin. Mirrors the CSS custom properties in
    uni-preset-vue-vite/src/components/dsp/dsp-theme.css so the native editors and the web
    editors are the same design. See docs/x-series-2.0.md section 1.1. */
namespace XTheme
{
    inline const juce::Colour chassis   { 0xFFEDECE8 };
    inline const juce::Colour chassis2  { 0xFFE4E2DD };
    inline const juce::Colour chassisHi { 0xFFF4F3F0 };
    inline const juce::Colour panel     { 0xFFFBFAF8 };
    inline const juce::Colour panel2    { 0xFFF3F1ED };
    inline const juce::Colour ink       { 0xFF26282C };
    inline const juce::Colour ink2      { 0xFF5A5E66 };
    inline const juce::Colour ink3      { 0xFF8E939C };
    inline const juce::Colour accent    { 0xFFE08B2F };
    inline const juce::Colour accentHi  { 0xFFF2A64A };
    inline const juce::Colour cool      { 0xFF4E7FA8 };
    inline const juce::Colour warn      { 0xFFC4503C };
    inline const juce::Colour ok        { 0xFF5E8C61 };

    inline juce::Colour line()      { return ink.withAlpha (0.12f); }
    inline juce::Colour line2()     { return ink.withAlpha (0.06f); }
    inline juce::Colour accentLo()  { return accent.withAlpha (0.16f); }
    inline juce::Colour grid()      { return ink.withAlpha (0.08f); }
    inline juce::Colour gridMinor() { return ink.withAlpha (0.045f); }
    inline juce::Colour axis()      { return ink.withAlpha (0.20f); }

    /** Corner radius used by every panel, card and chip. */
    inline constexpr float radius = 6.0f;
    inline constexpr float radiusSmall = 3.0f;

    inline juce::Font label (float height = 9.0f)
    {
        return juce::FontOptions (juce::Font::getDefaultSansSerifFontName(), height, juce::Font::plain);
    }

    inline juce::Font value (float height = 11.0f)
    {
        return juce::FontOptions (juce::Font::getDefaultSansSerifFontName(), height, juce::Font::plain);
    }

    inline juce::Font readout (float height = 19.0f)
    {
        return juce::FontOptions (juce::Font::getDefaultSansSerifFontName(), height, juce::Font::plain);
    }

    /** Uppercase, letter-spaced caption drawing, matching the CSS `.dsp-lab` treatment. */
    void drawCaption (juce::Graphics& g, juce::String text, juce::Rectangle<int> area,
                      juce::Colour colour, juce::Justification justification, float height = 9.0f,
                      float tracking = 1.4f);

    void drawPanel (juce::Graphics& g, juce::Rectangle<float> area, bool raised = false);
    void drawCard (juce::Graphics& g, juce::Rectangle<float> area, juce::Colour topEdge = {});
}
