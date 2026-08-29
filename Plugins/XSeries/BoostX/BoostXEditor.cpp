#include "BoostXEditor.h"
#include "BoostXPlugin.h"

namespace
{
    constexpr int meterWidth = 52;
    constexpr int scopeWidth = 140;
    constexpr int trayHeight = 96;
    constexpr int footerHeight = 30;
}

// ── WaveformScope ────────────────────────────────────────────────────────────

WaveformScope::WaveformScope (juce::String cap, bool output)
    : caption (std::move (cap)), isOutput (output)
{
    setInterceptsMouseClicks (false, false);
}

void WaveformScope::update (float amt, int md, float act, float ph)
{
    amount = amt;
    mode = md;
    activity = act;
    phase = ph;
    repaint();
}

void WaveformScope::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    XTheme::drawPanel (g, bounds);

    const float mid = bounds.getCentreY();
    g.setColour (XTheme::grid());
    g.drawHorizontalLine (juce::roundToInt (mid), bounds.getX() + 4.0f, bounds.getRight() - 4.0f);

    const float w = bounds.getWidth() - 8.0f;
    const float limit = mid - bounds.getY() - 6.0f;
    const float amp = (0.22f + 0.38f * amount + 0.12f * activity) * limit;
    const float harmonics = isOutput ? (0.25f + amount * 0.55f + (mode == 3 ? 0.35f : 0.0f)) : 0.18f;
    const float clip = isOutput && mode == 3 ? amount * 0.85f : 0.0f;

    juce::Path wave;
    for (int x = 0; x <= juce::roundToInt (w); x += 2)
    {
        const float u = static_cast<float> (x) / juce::jmax (1.0f, w);
        float v = std::sin (u * 26.0f + phase);
        v += std::sin (u * 61.0f + phase * 1.7f) * harmonics * 0.34f;
        v += std::sin (u * 137.0f + phase * 2.3f) * harmonics * 0.16f;
        v *= 0.5f + 0.5f * std::sin (u * juce::MathConstants<float>::pi);
        float y = v * amp;
        if (clip > 0.0f)
        {
            const float ceiling = limit * (1.0f - clip * 0.42f);
            y = juce::jlimit (-ceiling, ceiling, y * (1.0f + clip));
        }
        const float py = mid - y;
        if (x == 0)
            wave.startNewSubPath (bounds.getX() + 4.0f + static_cast<float> (x), py);
        else
            wave.lineTo (bounds.getX() + 4.0f + static_cast<float> (x), py);
    }

    g.setColour (isOutput ? XTheme::accent : XTheme::ink3);
    g.strokePath (wave, juce::PathStrokeType (1.4f));

    XTheme::drawCaption (g, caption,
                         juce::Rectangle<int> (juce::roundToInt (bounds.getX()) + 6,
                                               juce::roundToInt (bounds.getY()) + 6, 40, 12),
                         XTheme::ink3, isOutput ? juce::Justification::centredRight : juce::Justification::left,
                         8.0f);
}

// ── BoostXEditor ─────────────────────────────────────────────────────────────

BoostXEditor::BoostXEditor (BoostXPlugin& owner)
    : XEditorBase (owner, owner.getState(), "Boost",
                   BoostXPlugin::getFactoryPresets(), 640, 440),
      plugin (owner),
      amountKnob (owner.getState(), "boost.amount", "Gain", XKnob::Size::large),
      mixKnob (owner.getState(), "boost.mix", "Mix", XKnob::Size::small),
      hpfKnob (owner.getState(), "boost.hpfHz", "High Pass", XKnob::Size::small),
      outputGainKnob (owner.getState(), "boost.outputGain", "Output", XKnob::Size::small),
      modeSegment (owner.getState(), "boost.mode", { "OTT", "Wide", "Chorus", "Drive" }),
      oversampling (owner.getState(), "boost.oversampling", { "1x", "2x", "4x" })
{
    addAndMakeVisible (inScope);
    addAndMakeVisible (outScope);
    addAndMakeVisible (outMeter);
    addAndMakeVisible (amountKnob);
    addAndMakeVisible (mixKnob);
    addAndMakeVisible (hpfKnob);
    addAndMakeVisible (outputGainKnob);
    addAndMakeVisible (modeSegment);
    addAndMakeVisible (oversampling);

    finishConstruction();
}

void BoostXEditor::layoutContent (juce::Rectangle<int> area)
{
    auto footer = area.removeFromBottom (footerHeight);
    oversamplingLabelArea = footer.removeFromLeft (78);
    oversampling.setBounds (footer.removeFromLeft (132).reduced (0, 3));
    hintArea = footer.withTrimmedLeft (10);

    auto tray = area.removeFromBottom (trayHeight);
    mixKnob.setBounds (tray.removeFromLeft (tray.getWidth() / 4).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));
    hpfKnob.setBounds (tray.removeFromLeft (tray.getWidth() / 3).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));
    outputGainKnob.setBounds (tray.removeFromLeft (tray.getWidth() / 2).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));
    modeSegment.setBounds (tray.reduced (0, 28));

    area.removeFromBottom (6);
    outMeter.setBounds (area.removeFromRight (meterWidth));
    inScope.setBounds (area.removeFromLeft (scopeWidth).reduced (4, 0));
    outScope.setBounds (area.removeFromRight (scopeWidth).reduced (4, 0));
    amountKnob.setBounds (area.withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::large), XKnob::heightFor (XKnob::Size::large)));
}

void BoostXEditor::paint (juce::Graphics& g)
{
    XEditorBase::paint (g);

    XTheme::drawCaption (g, "Oversampling", oversamplingLabelArea, XTheme::ink3,
                         juce::Justification::centredLeft);

    static const char* hints[] = {
        "Upward + downward compression across three bands",
        "Frequency-dependent stereo widening",
        "Dual modulated delay",
        "Saturation — raise oversampling to tame aliasing"
    };
    const int mode = static_cast<int> (plugin.getState().getRawParameterValue ("boost.mode")->load());
    g.setFont (XTheme::value (9.5f));
    g.setColour (XTheme::ink3);
    g.drawText (hints[juce::jlimit (0, 3, mode)], hintArea, juce::Justification::centredLeft, false);
}

void BoostXEditor::refreshMeters()
{
    const auto& core = plugin.getCore();
    const float activity = core.getActivity();
    const float amount = plugin.getState().getRawParameterValue ("boost.amount")->load();
    const int mode = static_cast<int> (plugin.getState().getRawParameterValue ("boost.mode")->load());
    const float outGain = plugin.getState().getRawParameterValue ("boost.outputGain")->load();

    animPhase += 0.12f;
    inScope.update (amount, mode, activity, animPhase);
    outScope.update (amount, mode, activity * 1.15f, animPhase + 0.4f);

    const float peakDb = juce::Decibels::gainToDecibels (0.35f + activity * 0.65f, -120.0f) + outGain;
    outMeter.setLevels (peakDb, peakDb);
}
