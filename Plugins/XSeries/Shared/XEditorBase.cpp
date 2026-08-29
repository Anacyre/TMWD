#include "XEditorBase.h"

XEditorBase::XEditorBase (juce::AudioProcessor& processor,
                          juce::AudioProcessorValueTreeState& stateRef,
                          juce::String name,
                          std::vector<XPreset> presetList,
                          int width, int height)
    : juce::AudioProcessorEditor (processor),
      state (stateRef),
      displayName (std::move (name)),
      presets (std::move (presetList)),
      defaultWidth (width),
      defaultHeight (height)
{
    setLookAndFeel (&lookAndFeel);

    presetBox.setTextWhenNothingSelected ("Default");
    for (int i = 0; i < static_cast<int> (presets.size()); ++i)
        presetBox.addItem (presets[static_cast<std::size_t> (i)].name, i + 1);
    presetBox.onChange = [this]
    {
        const int index = presetBox.getSelectedItemIndex();
        if (index >= 0 && index < static_cast<int> (presets.size()))
            applyXPreset (state, presets[static_cast<std::size_t> (index)]);
    };
    addAndMakeVisible (presetBox);

    powerButton.setClickingTogglesState (true);
    powerButton.setTooltip ("Bypass");
    addAndMakeVisible (powerButton);

    // The bypass parameter is optional so the base class stays usable during bring-up.
    if (state.getParameter ("bypass") != nullptr)
        bypassAttachment = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (
            state, "bypass", powerButton);
}

void XEditorBase::finishConstruction()
{
    constructed = true;

    setResizable (true, true);
    setResizeLimits (defaultWidth * 3 / 4, defaultHeight * 3 / 4, defaultWidth * 2, defaultHeight * 2);
    if (auto* constrainer = getConstrainer())
        constrainer->setFixedAspectRatio (static_cast<double> (defaultWidth)
                                          / static_cast<double> (defaultHeight));
    setSize (defaultWidth, defaultHeight);

    startTimerHz (30);
}

XEditorBase::~XEditorBase()
{
    stopTimer();
    setLookAndFeel (nullptr);
}

void XEditorBase::timerCallback()
{
    refreshMeters();
}

juce::Rectangle<int> XEditorBase::getContentArea() const
{
    return getLocalBounds().reduced (14, 0).withTrimmedTop (headerHeight).withTrimmedBottom (12);
}

void XEditorBase::resized()
{
    if (! constructed)
        return;

    auto header = getLocalBounds().reduced (14, 0).removeFromTop (headerHeight).reduced (0, 8);
    powerButton.setBounds (header.removeFromRight (28));
    header.removeFromRight (8);
    presetBox.setBounds (header.removeFromRight (juce::jmin (176, header.getWidth() / 2)));

    layoutContent (getContentArea());
}

void XEditorBase::drawMark (juce::Graphics& g, juce::Rectangle<int> area) const
{
    // Script "X" drawn as two crossing strokes with a swash, echoing the reference series mark.
    const auto box = area.toFloat();
    const float x = box.getX();
    const float y = box.getY();
    const float w = box.getWidth();
    const float h = box.getHeight();

    juce::Path mark;
    mark.startNewSubPath (x + w * 0.08f, y + h * 0.10f);
    mark.cubicTo (x + w * 0.40f, y + h * 0.30f,
                  x + w * 0.62f, y + h * 0.62f,
                  x + w * 0.94f, y + h * 0.92f);
    mark.startNewSubPath (x + w * 0.94f, y + h * 0.10f);
    mark.cubicTo (x + w * 0.60f, y + h * 0.34f,
                  x + w * 0.36f, y + h * 0.60f,
                  x + w * 0.06f, y + h * 0.94f);
    mark.startNewSubPath (x - w * 0.04f, y + h * 0.99f);
    mark.quadraticTo (x + w * 0.16f, y + h * 0.86f, x + w * 0.30f, y + h * 0.99f);

    g.setColour (XTheme::ink);
    g.strokePath (mark, juce::PathStrokeType (1.5f, juce::PathStrokeType::curved,
                                              juce::PathStrokeType::rounded));
}

void XEditorBase::paint (juce::Graphics& g)
{
    juce::ColourGradient chassis (XTheme::chassisHi, 0.0f, 0.0f,
                                 XTheme::chassis2, 0.0f, static_cast<float> (getHeight()), false);
    chassis.addColour (0.38, XTheme::chassis);
    g.setGradientFill (chassis);
    g.fillAll();

    auto header = getLocalBounds().reduced (14, 0).removeFromTop (headerHeight).reduced (0, 8);
    drawMark (g, header.removeFromLeft (20).withSizeKeepingCentre (18, 18));
    header.removeFromLeft (6);

    XTheme::drawCaption (g, displayName, header, XTheme::ink, juce::Justification::left, 13.0f, 2.2f);

    g.setColour (XTheme::line());
    g.fillRect (14, headerHeight - 1, getWidth() - 28, 1);

    // Power glyph on the bypass switch.
    const auto power = powerButton.getBounds().toFloat().reduced (8.0f);
    g.setColour (powerButton.getToggleState() ? XTheme::ink3 : XTheme::accent);
    juce::Path ring;
    ring.addCentredArc (power.getCentreX(), power.getCentreY(),
                        power.getWidth() * 0.5f, power.getHeight() * 0.5f, 0.0f,
                        juce::MathConstants<float>::pi * 0.25f,
                        juce::MathConstants<float>::pi * 1.75f, true);
    g.strokePath (ring, juce::PathStrokeType (1.4f));
    g.drawLine (power.getCentreX(), power.getY() - 1.0f,
                power.getCentreX(), power.getCentreY() - power.getHeight() * 0.1f, 1.4f);
}
