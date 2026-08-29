#include "LimiterXEditor.h"
#include "LimiterXPlugin.h"

namespace
{
    constexpr int meterWidth = 52;
    constexpr int trayHeight = 96;
    constexpr int footerHeight = 30;
}

// ── GainReductionGraph ───────────────────────────────────────────────────────

GainReductionGraph::GainReductionGraph()
{
    history.fill (0.0f);
    setInterceptsMouseClicks (false, false);
}

void GainReductionGraph::push (float reductionDb, float holdDb)
{
    head = (head + 1) % historyLength;
    history[static_cast<std::size_t> (head)] = juce::jlimit (floorDb, 0.0f, reductionDb);
    hold = juce::jlimit (floorDb, 0.0f, holdDb);
    repaint();
}

float GainReductionGraph::dbToY (float db, float top, float height) const noexcept
{
    const float t = juce::jlimit (0.0f, 1.0f, db / floorDb);
    return top + t * height;
}

void GainReductionGraph::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    XTheme::drawPanel (g, bounds);

    const float scaleWidth = 26.0f;
    const float top = bounds.getY() + 46.0f;
    const float height = juce::jmax (20.0f, bounds.getBottom() - 14.0f - top);
    const float right = bounds.getRight() - scaleWidth;

    for (const float tick : { 0.0f, -3.0f, -6.0f, -9.0f, -12.0f })
    {
        const float y = std::floor (dbToY (tick, top, height)) + 0.5f;
        g.setColour (juce::approximatelyEqual (tick, 0.0f) ? XTheme::axis() : XTheme::grid());
        g.drawLine (bounds.getX(), y, right, y, 1.0f);
        g.setFont (XTheme::label (8.0f));
        g.setColour (XTheme::ink3);
        g.drawText (juce::String (juce::roundToInt (tick)),
                    juce::Rectangle<float> (right + 4.0f, y - 5.0f, scaleWidth - 6.0f, 10.0f),
                    juce::Justification::centredLeft, false);
    }

    // Oldest sample on the left so reduction scrolls away from the playhead.
    const float span = right - bounds.getX();
    juce::Path fill, line;
    fill.startNewSubPath (bounds.getX(), top);
    for (int i = 0; i < historyLength; ++i)
    {
        const float db = history[static_cast<std::size_t> ((head + 1 + i) % historyLength)];
        const float x = bounds.getX() + (static_cast<float> (i) / (historyLength - 1)) * span;
        const float y = dbToY (db, top, height);
        fill.lineTo (x, y);
        if (i == 0)
            line.startNewSubPath (x, y);
        else
            line.lineTo (x, y);
    }
    fill.lineTo (right, top);
    fill.closeSubPath();

    g.setColour (XTheme::accent.withAlpha (0.18f));
    g.fillPath (fill);
    g.setColour (XTheme::accent);
    g.strokePath (line, juce::PathStrokeType (1.4f));

    if (hold < -0.05f)
    {
        const float y = std::floor (dbToY (hold, top, height)) + 0.5f;
        g.setColour (XTheme::warn);
        const float dash[] = { 3.0f, 3.0f };
        g.drawDashedLine ({ bounds.getX(), y, right, y }, dash, 2, 1.0f);
    }

    XTheme::drawCaption (g, "dB GR",
                         juce::Rectangle<int> (juce::roundToInt (bounds.getX()) + 6,
                                               juce::roundToInt (top) - 16, 60, 12),
                         XTheme::ink3, juce::Justification::left, 8.0f);
}

// ── LimiterXEditor ───────────────────────────────────────────────────────────

LimiterXEditor::LimiterXEditor (LimiterXPlugin& owner)
    : XEditorBase (owner, owner.getState(), "Limit",
                   LimiterXPlugin::getFactoryPresets(), 620, 430),
      plugin (owner),
      gainKnob (owner.getState(), "limiter.gain", "Gain"),
      ceilingKnob (owner.getState(), "limiter.ceiling", "Ceiling"),
      releaseKnob (owner.getState(), "limiter.release", "Release"),
      lookaheadKnob (owner.getState(), "limiter.lookahead", "Lookahead"),
      oversampling (owner.getState(), "limiter.oversampling", { "1x", "2x", "4x" }),
      truePeak (owner.getState(), "limiter.truePeak", "True Peak")
{
    addAndMakeVisible (graph);
    addAndMakeVisible (inMeter);
    addAndMakeVisible (outMeter);
    addAndMakeVisible (reductionReadout);
    addAndMakeVisible (peakReadout);
    addAndMakeVisible (gainKnob);
    addAndMakeVisible (ceilingKnob);
    addAndMakeVisible (releaseKnob);
    addAndMakeVisible (lookaheadKnob);
    addAndMakeVisible (oversampling);
    addAndMakeVisible (truePeak);

    finishConstruction();
}

void LimiterXEditor::layoutContent (juce::Rectangle<int> area)
{
    footerArea = area.removeFromBottom (footerHeight);
    auto footer = footerArea;
    oversamplingLabelArea = footer.removeFromLeft (78);
    oversampling.setBounds (footer.removeFromLeft (132).reduced (0, 3));
    footer.removeFromLeft (8);
    truePeak.setBounds (footer.removeFromLeft (76).reduced (0, 3));
    hintArea = footer.withTrimmedLeft (10);

    auto tray = area.removeFromBottom (trayHeight);
    const int knobWidth = tray.getWidth() / 4;
    gainKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    ceilingKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    releaseKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    lookaheadKnob.setBounds (tray.withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    area.removeFromBottom (6);
    inMeter.setBounds (area.removeFromLeft (meterWidth));
    outMeter.setBounds (area.removeFromRight (meterWidth));
    graph.setBounds (area.reduced (8, 0));

    auto readouts = graph.getBounds().reduced (12, 0).withHeight (40).translated (0, 8);
    reductionReadout.setBounds (readouts.removeFromLeft (130));
    readouts.removeFromLeft (20);
    peakReadout.setBounds (readouts.removeFromLeft (120));
}

void LimiterXEditor::paint (juce::Graphics& g)
{
    XEditorBase::paint (g);

    XTheme::drawCaption (g, "Oversampling", oversamplingLabelArea, XTheme::ink3,
                         juce::Justification::centredLeft);

    const float lookahead = plugin.getState().getRawParameterValue ("limiter.lookahead")
                                ->load (std::memory_order_relaxed);
    g.setFont (XTheme::value (9.5f));
    g.setColour (XTheme::ink3);
    g.drawText (lookahead > 0.0f
                    ? "Latency " + juce::String (lookahead, 2) + " ms, reported to the host"
                    : juce::String ("Zero latency"),
                hintArea, juce::Justification::centredLeft, false);
}

void LimiterXEditor::refreshMeters()
{
    const auto& core = plugin.getCore();

    inMeter.setLevels (core.getInputPeakDb(), core.getInputPeakDb());
    outMeter.setLevels (core.getOutputPeakDb(), core.getOutputPeakDb());

    const float reduction = juce::jmin (0.0f, core.getGainReductionDb());
    const float peak = core.getTruePeakDb();
    shownReduction += (reduction - shownReduction) * 0.28f;
    shownPeak += (peak - shownPeak) * 0.28f;

    graph.push (reduction, shownReduction);

    reductionReadout.setValue (juce::String (shownReduction < -0.05f ? shownReduction : 0.0f, 1) + " dB");

    const float ceiling = plugin.getState().getRawParameterValue ("limiter.ceiling")
                              ->load (std::memory_order_relaxed);
    peakReadout.setValue (shownPeak > -90.0f ? juce::String (shownPeak, 1) + " dB"
                                             : juce::String (juce::CharPointer_UTF8 ("-\xe2\x88\x9e dB")),
                          shownPeak > ceiling + 0.05f);
}
