#include "ReverbXEditor.h"

#include "ReverbXPlugin.h"



namespace

{

    constexpr int meterWidth = 52;

    constexpr int trayHeight = 96;

    constexpr int footerHeight = 30;

    constexpr int podWidth = 88;

}



// ── ReverbDecayGraph ─────────────────────────────────────────────────────────



ReverbDecayGraph::ReverbDecayGraph (ReverbXPlugin& owner)

    : plugin (owner)

{

    setInterceptsMouseClicks (false, false);

}



void ReverbDecayGraph::paint (juce::Graphics& g)

{

    const auto bounds = getLocalBounds().toFloat();

    XTheme::drawPanel (g, bounds);



    const float level = plugin.getState().getRawParameterValue ("reverb.level")->load();

    const float decay = plugin.getState().getRawParameterValue ("reverb.decay")->load();

    const float amount = level;

    const float tMax = juce::jmin (12.0f, juce::jmax (0.6f, decay * 2.2f));



    const float padL = 36.0f, padR = 12.0f, padT = 28.0f, padB = 22.0f;

    const float gw = bounds.getWidth() - padL - padR;

    const float gh = bounds.getHeight() - padT - padB;



    auto timeToX = [padL, gw, tMax] (float t)

    {

        return padL + (t / tMax) * gw;

    };



    auto envToY = [padT, gh] (float env)

    {

        const float db = env > 1.0e-6f ? 20.0f * std::log10 (env) : -60.0f;

        const float t = juce::jlimit (0.0f, 1.0f, (db + 60.0f) / 60.0f);

        return padT + (1.0f - t) * gh;

    };



    for (const float tickDb : { 0.0f, -20.0f, -40.0f, -60.0f })

    {

        const float env = std::pow (10.0f, tickDb / 20.0f);

        const float y = std::floor (envToY (env)) + 0.5f;

        g.setColour (juce::approximatelyEqual (tickDb, 0.0f) ? XTheme::axis() : XTheme::grid());

        g.drawLine (padL, y, bounds.getRight() - padR, y, 1.0f);

    }



    juce::Path fill, line;

    bool started = false;

    for (int i = 0; i <= 64; ++i)

    {

        const float t = (static_cast<float> (i) / 64.0f) * tMax;

        const float env = amount * std::pow (10.0f, -3.0f * t / juce::jmax (0.15f, decay));

        const float x = timeToX (t);

        const float y = envToY (env);

        if (! started) { fill.startNewSubPath (x, padT + gh); line.startNewSubPath (x, y); started = true; }

        else { fill.lineTo (x, y); line.lineTo (x, y); }

    }

    fill.lineTo (timeToX (tMax), padT + gh);

    fill.closeSubPath();



    g.setColour (XTheme::accent.withAlpha (0.18f));

    g.fillPath (fill);

    g.setColour (XTheme::accent);

    g.strokePath (line, juce::PathStrokeType (1.6f));



    g.setFont (XTheme::label (8.0f));

    g.setColour (XTheme::ink3);

    g.drawText ("0 s", juce::Rectangle<int> (juce::roundToInt (padL), juce::roundToInt (padT + gh + 4), 24, 12),

                juce::Justification::centredLeft, false);

    g.drawText (juce::String (tMax, 1) + " s",

                juce::Rectangle<int> (juce::roundToInt (timeToX (tMax)) - 20, juce::roundToInt (padT + gh + 4), 40, 12),

                juce::Justification::centredRight, false);



    XTheme::drawCaption (g, "Decay",

                         juce::Rectangle<int> (juce::roundToInt (bounds.getX()) + 8,

                                               juce::roundToInt (bounds.getY()) + 8, 60, 12),

                         XTheme::ink3, juce::Justification::left, 8.0f);

}



// ── ReverbXEditor ────────────────────────────────────────────────────────────



ReverbXEditor::ReverbXEditor (ReverbXPlugin& owner)

    : XEditorBase (owner, owner.getState(), "Reverb",

                   ReverbXPlugin::getFactoryPresets(), 680, 460),

      plugin (owner),

      graph (owner),

      amountKnob (owner.getState(), "reverb.level", "Amount"),

      timeKnob (owner.getState(), "reverb.decay", "Time"),

      sizeKnob (owner.getState(), "reverb.size", "Size"),

      mixKnob (owner.getState(), "reverb.mix", "Mix"),

      widthKnob (owner.getState(), "reverb.width", "Width"),

      preDelayKnob (owner.getState(), "reverb.preDelay", "Pre-Delay", XKnob::Size::small),

      dampingKnob (owner.getState(), "reverb.damping", "Damping", XKnob::Size::small),

      wetProcess (owner.getState(), "reverb.wetProcess", "Wet Process")

{

    addAndMakeVisible (graph);

    addAndMakeVisible (outMeter);

    addAndMakeVisible (amountKnob);

    addAndMakeVisible (timeKnob);

    addAndMakeVisible (sizeKnob);

    addAndMakeVisible (mixKnob);

    addAndMakeVisible (widthKnob);

    addAndMakeVisible (preDelayKnob);

    addAndMakeVisible (dampingKnob);

    addAndMakeVisible (wetProcess);



    venueBox.addItemList ({ "Small Room", "Studio", "Chamber", "Hall", "Concert Hall", "Cathedral", "Large Stage", "Outdoor" }, 1);

    addAndMakeVisible (venueBox);

    venueAttachment = std::make_unique<juce::AudioProcessorValueTreeState::ComboBoxAttachment> (

        owner.getState(), "reverb.venue", venueBox);



    finishConstruction();

}



void ReverbXEditor::layoutContent (juce::Rectangle<int> area)

{

    auto footer = area.removeFromBottom (footerHeight);

    venueLabelArea = footer.removeFromLeft (44);

    venueBox.setBounds (footer.removeFromLeft (140).reduced (0, 4));

    footer.removeFromLeft (8);

    wetProcess.setBounds (footer.removeFromLeft (88).reduced (0, 3));



    auto tray = area.removeFromBottom (trayHeight);

    const int knobWidth = tray.getWidth() / 5;

    amountKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    timeKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    sizeKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    mixKnob.setBounds (tray.removeFromLeft (knobWidth).withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));

    widthKnob.setBounds (tray.withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::medium), XKnob::heightFor (XKnob::Size::medium)));



    area.removeFromBottom (6);

    outMeter.setBounds (area.removeFromRight (meterWidth));



    auto graphArea = area.reduced (8, 0);

    auto pods = graphArea.removeFromRight (podWidth * 2 + 8);

    graph.setBounds (graphArea);



    auto podRow = pods.reduced (0, 8);

    preDelayKnob.setBounds (podRow.removeFromLeft (podWidth).withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));

    podRow.removeFromLeft (4);

    dampingKnob.setBounds (podRow.withSizeKeepingCentre (

        XKnob::widthFor (XKnob::Size::small), XKnob::heightFor (XKnob::Size::small)));

}



void ReverbXEditor::paint (juce::Graphics& g)

{

    XEditorBase::paint (g);

    XTheme::drawCaption (g, "Venue", venueLabelArea, XTheme::ink3, juce::Justification::centredLeft);

}



void ReverbXEditor::refreshMeters()

{

    const float wetDb = juce::Decibels::gainToDecibels (plugin.getCore().getWetPeak(), -120.0f);

    outMeter.setLevels (wetDb, wetDb);

    graph.repaint();

}

