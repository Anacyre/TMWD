#include "DynamicXEditor.h"
#include "DynamicXPlugin.h"

namespace
{
    constexpr int meterWidth = 52;
    constexpr int grWidth = 36;
    constexpr int knobRowHeight = 96;
    constexpr int faderRowHeight = 44;
    constexpr int bandRowHeight = 72;
    constexpr int footerHeight = 30;

    juce::String bandParamId (int band, const char* suffix)
    {
        return "dynamic.band" + juce::String (band + 1) + "." + suffix;
    }

    juce::Colour bandColour (int index)
    {
        static const juce::Colour colours[] {
            juce::Colour (0xff5B8DEF),
            juce::Colour (0xff3FAE8A),
            juce::Colour (0xffE08B2F)
        };
        return colours[juce::jlimit (0, 2, index)];
    }
}

// ── DynamicTransferGraph ─────────────────────────────────────────────────────

DynamicTransferGraph::DynamicTransferGraph (DynamicXPlugin& owner)
    : plugin (owner)
{
    setInterceptsMouseClicks (false, false);
}

float DynamicTransferGraph::mapIn (float db, float width) const noexcept
{
    return ((db - inMinDb) / (inMaxDb - inMinDb)) * width;
}

float DynamicTransferGraph::dbToY (float db, float top, float height) const noexcept
{
    const float t = juce::jlimit (0.0f, 1.0f, (db - outMinDb) / (outMaxDb - outMinDb));
    return top + (1.0f - t) * height;
}

void DynamicTransferGraph::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    XTheme::drawPanel (g, bounds);

    const float pad = 8.0f;
    const float w = bounds.getWidth() - pad * 2.0f;
    const float h = bounds.getHeight() - pad * 2.0f;
    const float top = pad;
    const float left = pad;

    for (const float tick : { -48.0f, -36.0f, -24.0f, -12.0f, 0.0f })
    {
        const float y = std::floor (dbToY (tick, top, h)) + 0.5f;
        g.setColour (juce::approximatelyEqual (tick, 0.0f) ? XTheme::axis() : XTheme::grid());
        g.drawLine (left, y, left + w, y, 1.0f);
    }

    g.setColour (XTheme::gridMinor());
    g.drawLine (mapIn (inMinDb, w) + left, dbToY (inMinDb, top, h),
                mapIn (inMaxDb, w) + left, dbToY (inMaxDb, top, h), 1.0f);

    const auto& state = plugin.getState();
    const float knee = state.getRawParameterValue ("dynamic.knee")->load();
    const bool split = state.getRawParameterValue ("dynamic.splitBands")->load() > 0.5f;

    if (split)
    {
        for (int band = 0; band < 3; ++band)
        {
            const auto enabled = state.getRawParameterValue (bandParamId (band, "enabled"));
            if (enabled == nullptr || enabled->load() < 0.5f)
                continue;
            const float th = state.getRawParameterValue (bandParamId (band, "threshold"))->load();
            const float ratio = state.getRawParameterValue (bandParamId (band, "ratio"))->load();

            juce::Path ghost;
            bool started = false;
            for (int i = 0; i <= 96; ++i)
            {
                const float inDb = inMinDb + (static_cast<float> (i) / 96.0f) * (inMaxDb - inMinDb);
                const float outDb = inDb + tmss::DynamicXCore::computeGainDb (inDb, th, ratio, knee);
                const float x = left + mapIn (inDb, w);
                const float y = dbToY (outDb, top, h);
                if (! started) { ghost.startNewSubPath (x, y); started = true; }
                else ghost.lineTo (x, y);
            }
            g.setColour (bandColour (band).withAlpha (0.35f));
            g.strokePath (ghost, juce::PathStrokeType (1.0f));
        }
    }

    const float threshold = state.getRawParameterValue ("dynamic.threshold")->load();
    const float ratio = state.getRawParameterValue ("dynamic.ratio")->load();

    juce::Path fill, line;
    bool started = false;
    for (int i = 0; i <= 96; ++i)
    {
        const float inDb = inMinDb + (static_cast<float> (i) / 96.0f) * (inMaxDb - inMinDb);
        const float outDb = inDb + tmss::DynamicXCore::computeGainDb (inDb, threshold, ratio, knee);
        const float x = left + mapIn (inDb, w);
        const float y = dbToY (outDb, top, h);
        if (! started) { fill.startNewSubPath (x, top + h); line.startNewSubPath (x, y); started = true; }
        else { fill.lineTo (x, y); line.lineTo (x, y); }
    }
    fill.lineTo (left + mapIn (inMaxDb, w), top + h);
    fill.closeSubPath();

    g.setColour (XTheme::cool.withAlpha (0.14f));
    g.fillPath (fill);
    g.setColour (XTheme::cool);
    g.strokePath (line, juce::PathStrokeType (1.8f));

    const float tx = left + mapIn (threshold, w);
    g.setColour (XTheme::accentLo());
    const float dash[] = { 3.0f, 4.0f };
    g.drawDashedLine ({ tx, top, tx, top + h }, dash, 2, 1.0f);

    const float ty = dbToY (threshold, top, h);
    g.setColour (XTheme::panel);
    g.fillEllipse (tx - 5.0f, ty - 5.0f, 10.0f, 10.0f);
    g.setColour (XTheme::cool);
    g.drawEllipse (tx - 5.0f, ty - 5.0f, 10.0f, 10.0f, 1.8f);

    const auto& core = plugin.getCore();
    const float inDb = core.getInputPeakDb();
    const float grDb = core.getGainReductionDb();
    if (inDb > -90.0f)
    {
        const float outDb = inDb + grDb;
        const float ix = left + mapIn (juce::jlimit (inMinDb, inMaxDb, inDb), w);
        g.setColour (XTheme::warn);
        g.drawVerticalLine (juce::roundToInt (ix), top, top + h);
        g.fillEllipse (ix - 3.4f, dbToY (outDb, top, h) - 3.4f, 6.8f, 6.8f);
    }

    XTheme::drawCaption (g, "Input",
                         juce::Rectangle<int> (juce::roundToInt (left) + 4, juce::roundToInt (top) + 2, 40, 12),
                         XTheme::ink3, juce::Justification::left, 8.0f);
}

// ── GainReductionColumn ──────────────────────────────────────────────────────

GainReductionColumn::GainReductionColumn()
{
    setInterceptsMouseClicks (false, false);
}

void GainReductionColumn::setReductionDb (float db)
{
    reduction = juce::jlimit (minDb, 0.0f, db);
    repaint();
}

void GainReductionColumn::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    XTheme::drawPanel (g, bounds);

    const float pad = 6.0f;
    const float top = pad + 14.0f;
    const float height = bounds.getHeight() - top - pad;
    const float width = bounds.getWidth() - pad * 2.0f;

    g.setColour (XTheme::panel2);
    g.fillRoundedRectangle (pad, top, width, height, XTheme::radiusSmall);

    const float t = juce::jlimit (0.0f, 1.0f, reduction / minDb);
    const float fillH = t * height;
    g.setColour (XTheme::cool.withAlpha (0.85f));
    g.fillRoundedRectangle (pad, top + height - fillH, width, fillH, XTheme::radiusSmall);

    XTheme::drawCaption (g, "GR",
                         juce::Rectangle<int> (juce::roundToInt (bounds.getX()), 4,
                                               juce::roundToInt (bounds.getWidth()), 12),
                         XTheme::ink3, juce::Justification::centred, 8.0f);
}

// ── DynamicXEditor ───────────────────────────────────────────────────────────

DynamicXEditor::DynamicXEditor (DynamicXPlugin& owner)
    : XEditorBase (owner, owner.getState(), "Dynamic",
                   DynamicXPlugin::getFactoryPresets(), 760, 520),
      plugin (owner),
      graph (owner),
      threshKnob (owner.getState(), "dynamic.threshold", "Thresh"),
      ratioKnob (owner.getState(), "dynamic.ratio", "Ratio"),
      kneeKnob (owner.getState(), "dynamic.knee", "Knee"),
      mixKnob (owner.getState(), "dynamic.mix", "Mix"),
      lookaheadKnob (owner.getState(), "dynamic.lookahead", "Look"),
      attackFader (owner.getState(), "dynamic.attack", "Attack"),
      releaseFader (owner.getState(), "dynamic.release", "Release"),
      gainFader (owner.getState(), "dynamic.makeup", "Gain"),
      detector (owner.getState(), "dynamic.detector", { "Peak", "RMS" }),
      autoGain (owner.getState(), "dynamic.autoGain", "Auto Gain"),
      autoRelease (owner.getState(), "dynamic.autoRelease", "Auto Rel"),
      splitBands (owner.getState(), "dynamic.splitBands", "Split")
{
    addAndMakeVisible (graph);
    addAndMakeVisible (grColumn);
    addAndMakeVisible (inMeter);
    addAndMakeVisible (outMeter);
    addAndMakeVisible (grReadout);
    addAndMakeVisible (threshKnob);
    addAndMakeVisible (ratioKnob);
    addAndMakeVisible (kneeKnob);
    addAndMakeVisible (mixKnob);
    addAndMakeVisible (lookaheadKnob);
    addAndMakeVisible (attackFader);
    addAndMakeVisible (releaseFader);
    addAndMakeVisible (gainFader);
    addAndMakeVisible (detector);
    addAndMakeVisible (autoGain);
    addAndMakeVisible (autoRelease);
    addAndMakeVisible (splitBands);

    static const char* bandNames[] = { "Low", "Mid", "High" };
    for (int i = 0; i < 3; ++i)
    {
        auto* button = bandButtons.add (new juce::TextButton (bandNames[i]));
        button->setClickingTogglesState (false);
        button->onClick = [this, i] { selectBand (i); };
        addAndMakeVisible (button);

        bandThreshKnobs[static_cast<std::size_t> (i)] = std::make_unique<XKnob> (
            owner.getState(), bandParamId (i, "threshold"), "Th", XKnob::Size::small);
        bandRatioKnobs[static_cast<std::size_t> (i)] = std::make_unique<XKnob> (
            owner.getState(), bandParamId (i, "ratio"), "Ratio", XKnob::Size::small);
        bandEnableChips[static_cast<std::size_t> (i)] = std::make_unique<XChip> (
            owner.getState(), bandParamId (i, "enabled"), "On");
        bandSoloChips[static_cast<std::size_t> (i)] = std::make_unique<XChip> (
            owner.getState(), bandParamId (i, "solo"), "Solo");

        addAndMakeVisible (*bandThreshKnobs[static_cast<std::size_t> (i)]);
        addAndMakeVisible (*bandRatioKnobs[static_cast<std::size_t> (i)]);
        addAndMakeVisible (*bandEnableChips[static_cast<std::size_t> (i)]);
        addAndMakeVisible (*bandSoloChips[static_cast<std::size_t> (i)]);
    }

    finishConstruction();
    selectBand (0);
}

void DynamicXEditor::selectBand (int index)
{
    selectedBand = juce::jlimit (0, 2, index);
    for (int i = 0; i < bandButtons.size(); ++i)
    {
        bandButtons[i]->setToggleState (i == selectedBand, juce::dontSendNotification);
        bandButtons[i]->setColour (juce::TextButton::buttonColourId,
                                   i == selectedBand ? bandColour (i).withAlpha (0.25f) : XTheme::panel2);
    }
    graph.repaint();
}

void DynamicXEditor::layoutContent (juce::Rectangle<int> area)
{
    auto footer = area.removeFromBottom (footerHeight);
    detectorLabelArea = footer.removeFromLeft (52);
    detector.setBounds (footer.removeFromLeft (100).reduced (0, 3));
    footer.removeFromLeft (6);
    autoGain.setBounds (footer.removeFromLeft (72).reduced (0, 3));
    autoRelease.setBounds (footer.removeFromLeft (68).reduced (0, 3));
    splitBands.setBounds (footer.removeFromLeft (52).reduced (0, 3));

    auto bandRow = area.removeFromBottom (bandRowHeight);
    bandRowArea = bandRow;
    const int cardWidth = bandRow.getWidth() / 3;
    for (int i = 0; i < 3; ++i)
    {
        auto card = bandRow.removeFromLeft (cardWidth).reduced (4, 4);
        bandButtons[i]->setBounds (card.removeFromTop (22).reduced (2, 0));
        bandEnableChips[static_cast<std::size_t> (i)]->setBounds (card.removeFromTop (22).reduced (0, 2));
        bandSoloChips[static_cast<std::size_t> (i)]->setBounds (card.removeFromTop (22).reduced (0, 2));
        auto knobs = card;
        const int half = knobs.getWidth() / 2;
        bandThreshKnobs[static_cast<std::size_t> (i)]->setBounds (
            knobs.removeFromLeft (half).withSizeKeepingCentre (
                XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));
        bandRatioKnobs[static_cast<std::size_t> (i)]->setBounds (
            knobs.withSizeKeepingCentre (
                XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));
    }

    auto faderRow = area.removeFromBottom (faderRowHeight);
    const int faderWidth = faderRow.getWidth() / 3;
    attackFader.setBounds (faderRow.removeFromLeft (faderWidth).reduced (4, 4));
    releaseFader.setBounds (faderRow.removeFromLeft (faderWidth).reduced (4, 4));
    gainFader.setBounds (faderRow.reduced (4, 4));

    auto knobRow = area.removeFromBottom (knobRowHeight);
    const int kw = knobRow.getWidth() / 5;
    threshKnob.setBounds (knobRow.removeFromLeft (kw).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    ratioKnob.setBounds (knobRow.removeFromLeft (kw).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    kneeKnob.setBounds (knobRow.removeFromLeft (kw).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    mixKnob.setBounds (knobRow.removeFromLeft (kw).withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    lookaheadKnob.setBounds (knobRow.withSizeKeepingCentre (
        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    area.removeFromBottom (6);
    outMeter.setBounds (area.removeFromRight (meterWidth));
    grColumn.setBounds (area.removeFromRight (grWidth));
    inMeter.setBounds (area.removeFromLeft (meterWidth));

    auto readouts = area.reduced (12, 0).withHeight (36).translated (0, 8);
    grReadout.setBounds (readouts.removeFromLeft (90));
    graph.setBounds (area.reduced (4, 0));
}

void DynamicXEditor::paint (juce::Graphics& g)
{
    XEditorBase::paint (g);
    XTheme::drawCaption (g, "Detector", detectorLabelArea, XTheme::ink3, juce::Justification::centredLeft);

    g.setColour (XTheme::line2());
    g.drawRoundedRectangle (bandRowArea.toFloat().reduced (2.0f), XTheme::radius, 1.0f);
}

void DynamicXEditor::refreshMeters()
{
    const auto& core = plugin.getCore();
    inMeter.setLevels (core.getInputPeakDb(), core.getInputRmsDb());
    outMeter.setLevels (core.getOutputPeakDb(), core.getOutputRmsDb());

    const float gr = juce::jmin (0.0f, core.getGainReductionDb());
    grColumn.setReductionDb (gr);
    grReadout.setValue (juce::String (gr < -0.05f ? gr : 0.0f, 1) + " dB");
    graph.repaint();
}
