#include "EqualizerXEditor.h"
#include "EqualizerXPlugin.h"

namespace
{
    constexpr int meterWidth = 52;
    constexpr int bandRowHeight = 28;
    constexpr int knobRowHeight = 96;
    constexpr int footerHeight = 30;

    juce::String bandParamId (int band, const char* suffix)
    {
        return "eq.node" + juce::String (band + 1) + "." + suffix;
    }

    juce::Colour bandColour (int index)
    {
        static const juce::Colour colours[] {
            juce::Colour (0xffE08B2F),
            juce::Colour (0xff5B8DEF),
            juce::Colour (0xff3FAE8A),
            juce::Colour (0xffC45BC4),
            juce::Colour (0xffD4A017),
            juce::Colour (0xff6B7280),
            juce::Colour (0xff8B5A2B)
        };
        return colours[juce::jlimit (0, 6, index)];
    }
}

// ── EqCurveGraph ─────────────────────────────────────────────────────────────

EqCurveGraph::EqCurveGraph (EqualizerXPlugin& owner)
    : plugin (owner)
{
    setInterceptsMouseClicks (false, false);
}

void EqCurveGraph::setSelectedBand (int index)
{
    selectedBand = juce::jlimit (0, EqualizerXCore::numNodes - 1, index);
    repaint();
}

void EqCurveGraph::paint (juce::Graphics& g)
{
    const auto bounds = getLocalBounds().toFloat();
    XTheme::drawPanel (g, bounds);

    const float padL = 8.0f, padR = 8.0f, padT = 10.0f, padB = 18.0f;
    const float gw = bounds.getWidth() - padL - padR;
    const float gh = bounds.getHeight() - padT - padB;
    const float midY = padT + gh * 0.5f;

    g.setColour (XTheme::grid());
    for (const float db : { 12.0f, 6.0f, 0.0f, -6.0f, -12.0f })
    {
        const float y = midY - (db / 18.0f) * (gh * 0.5f);
        g.drawHorizontalLine (juce::roundToInt (y), padL, bounds.getRight() - padR);
    }

    const auto& core = plugin.getCore();

    auto freqToX = [padL, gw] (float hz)
    {
        const float t = (std::log (hz) - std::log (20.0f)) / (std::log (20000.0f) - std::log (20.0f));
        return padL + juce::jlimit (0.0f, 1.0f, t) * gw;
    };

    auto dbToY = [midY, gh] (float db)
    {
        return midY - (db / 18.0f) * (gh * 0.5f);
    };

    // Ghost curves per enabled band.
    for (int band = 0; band < EqualizerXCore::numNodes; ++band)
    {
        const auto enabled = plugin.getState().getRawParameterValue (bandParamId (band, "enabled"));
        if (enabled == nullptr || enabled->load() < 0.5f)
            continue;

        juce::Path ghost;
        bool started = false;
        for (int i = 0; i <= 256; ++i)
        {
            const float t = (float) i / 256.0f;
            const float hz = std::exp (std::log (20.0f) + t * (std::log (20000.0f) - std::log (20.0f)));
            const float db = core.magnitudeDb (hz);
            const float x = freqToX (hz);
            const float y = dbToY (db);
            if (! started) { ghost.startNewSubPath (x, y); started = true; }
            else ghost.lineTo (x, y);
        }
        g.setColour (bandColour (band).withAlpha (band == selectedBand ? 0.55f : 0.22f));
        g.strokePath (ghost, juce::PathStrokeType (1.0f));
    }

    juce::Path sum;
    bool started = false;
    for (int i = 0; i <= 256; ++i)
    {
        const float t = (float) i / 256.0f;
        const float hz = std::exp (std::log (20.0f) + t * (std::log (20000.0f) - std::log (20.0f)));
        const float db = core.magnitudeDb (hz);
        const float x = freqToX (hz);
        const float y = dbToY (db);
        if (! started) { sum.startNewSubPath (x, y); started = true; }
        else sum.lineTo (x, y);
    }

    juce::Path fill = sum;
    fill.lineTo (padL + gw, midY);
    fill.lineTo (padL, midY);
    fill.closeSubPath();
    g.setColour (XTheme::accent.withAlpha (0.14f));
    g.fillPath (fill);
    g.setColour (XTheme::accent);
    g.strokePath (sum, juce::PathStrokeType (2.0f));

    g.setFont (XTheme::label (8.0f));
    g.setColour (XTheme::ink3);
    for (const float hz : { 100.0f, 1000.0f, 10000.0f })
    {
        const float x = freqToX (hz);
        g.drawText (hz >= 1000.0f ? juce::String (hz / 1000.0f, 0) + "k" : juce::String (juce::roundToInt (hz)),
                    juce::Rectangle<int> (juce::roundToInt (x) - 14, juce::roundToInt (bounds.getBottom()) - 16, 28, 12),
                    juce::Justification::centred, false);
    }
}

// ── EqualizerXEditor ─────────────────────────────────────────────────────────

EqualizerXEditor::EqualizerXEditor (EqualizerXPlugin& owner)
    : XEditorBase (owner, owner.getState(), "EQ",
                   EqualizerXPlugin::getFactoryPresets(), 720, 480),
      plugin (owner),
      graph (owner),
      oversampling (owner.getState(), "eq.oversampling", { "1x", "2x", "4x" }),
      autoGain (owner.getState(), "eq.autoGain", "Auto Gain")
{
    addAndMakeVisible (graph);
    addAndMakeVisible (outMeter);
    addAndMakeVisible (oversampling);
    addAndMakeVisible (autoGain);

    for (int i = 0; i < EqualizerXCore::numNodes; ++i)
    {
        auto* button = bandButtons.add (new juce::TextButton (juce::String (i + 1)));
        button->setClickingTogglesState (false);
        button->onClick = [this, i] { selectBand (i); };
        addAndMakeVisible (button);
    }

    selectBand (0);
    finishConstruction();
}

void EqualizerXEditor::selectBand (int index)
{
    selectedBand = juce::jlimit (0, EqualizerXCore::numNodes - 1, index);
    graph.setSelectedBand (selectedBand);

    for (int b = 0; b < bandButtons.size(); ++b)
        bandButtons[b]->setToggleState (b == selectedBand, juce::dontSendNotification);

    gainKnob.reset();
    freqKnob.reset();
    qKnob.reset();
    shapeSegment.reset();
    slopeSegment.reset();
    enableChip.reset();
    soloChip.reset();

    gainKnob = std::make_unique<XKnob> (plugin.getState(), bandParamId (selectedBand, "gain"),
                                        "Gain", XKnob::Size::medium);
    freqKnob = std::make_unique<XKnob> (plugin.getState(), bandParamId (selectedBand, "frequency"),
                                        "Freq", XKnob::Size::medium);
    qKnob = std::make_unique<XKnob> (plugin.getState(), bandParamId (selectedBand, "q"),
                                     "Q", XKnob::Size::medium);
    shapeSegment = std::make_unique<XSegment> (plugin.getState(), bandParamId (selectedBand, "shape"),
                                               juce::StringArray { "LC", "LS", "PK", "NT", "HS", "HC", "BP" });
    slopeSegment = std::make_unique<XSegment> (plugin.getState(), bandParamId (selectedBand, "slope"),
                                               juce::StringArray { "6", "12", "18", "24", "30", "36", "48" });
    enableChip = std::make_unique<XChip> (plugin.getState(), bandParamId (selectedBand, "enabled"), "On");
    soloChip = std::make_unique<XChip> (plugin.getState(), bandParamId (selectedBand, "solo"), "S");

    addAndMakeVisible (*gainKnob);
    addAndMakeVisible (*freqKnob);
    addAndMakeVisible (*qKnob);
    addAndMakeVisible (*shapeSegment);
    addAndMakeVisible (*enableChip);
    addAndMakeVisible (*soloChip);

    gainKnob->setAccent (bandColour (selectedBand));
    freqKnob->setAccent (bandColour (selectedBand));
    qKnob->setAccent (bandColour (selectedBand));

    resized();
}

void EqualizerXEditor::layoutContent (juce::Rectangle<int> area)
{
    auto footer = area.removeFromBottom (footerHeight);
    auto footerLabel = footer.removeFromLeft (78);
    oversampling.setBounds (footer.removeFromLeft (132).reduced (0, 3));
    footer.removeFromLeft (8);
    autoGain.setBounds (footer.removeFromLeft (88).reduced (0, 3));
    juce::ignoreUnused (footerLabel);

    auto knobs = area.removeFromBottom (knobRowHeight);
    if (gainKnob != nullptr && freqKnob != nullptr && qKnob != nullptr)
    {
        const int knobW = knobs.getWidth() / 3;
        gainKnob->setBounds (knobs.removeFromLeft (knobW).withSizeKeepingCentre (
            XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
        freqKnob->setBounds (knobs.removeFromLeft (knobW).withSizeKeepingCentre (
            XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
        qKnob->setBounds (knobs.withSizeKeepingCentre (
            XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));
    }

    auto bandRow = area.removeFromBottom (bandRowHeight);
    const int chipW = juce::jmax (24, bandRow.getWidth() / 10);
    for (auto* button : bandButtons)
        button->setBounds (bandRow.removeFromLeft (chipW).reduced (2, 4));
    if (shapeSegment != nullptr)
        shapeSegment->setBounds (bandRow.removeFromLeft (bandRow.getWidth() / 2).reduced (4, 2));
    if (enableChip != nullptr)
        enableChip->setBounds (bandRow.removeFromLeft (44).reduced (2, 4));
    if (soloChip != nullptr)
        soloChip->setBounds (bandRow.removeFromLeft (36).reduced (2, 4));

    area.removeFromBottom (6);
    outMeter.setBounds (area.removeFromRight (meterWidth));
    graph.setBounds (area.reduced (0, 0));
}

void EqualizerXEditor::paint (juce::Graphics& g)
{
    XEditorBase::paint (g);
    XTheme::drawCaption (g, "Oversampling", getContentArea().removeFromBottom (footerHeight).removeFromLeft (78),
                         XTheme::ink3, juce::Justification::centredLeft);
}

void EqualizerXEditor::refreshMeters()
{
    const auto& core = plugin.getCore();
    outMeter.setLevels (core.getOutputPeakDb(), core.getOutputPeakDb());
    graph.repaint();
}
