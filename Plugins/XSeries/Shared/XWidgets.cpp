#include "XWidgets.h"

namespace
{
    constexpr int captionHeight = 12;
    constexpr int valueHeight = 13;
    constexpr juce::uint32 peakHoldMs = 1200;

    void styleChip (juce::TextButton& chip)
    {
        chip.setClickingTogglesState (false);
        chip.setConnectedEdges (0);
        chip.setMouseCursor (juce::MouseCursor::PointingHandCursor);
    }
}

// ── XKnob ────────────────────────────────────────────────────────────────────

int XKnob::widthFor (Size size) noexcept
{
    switch (size)
    {
        case Size::small:  return 56;
        case Size::large:  return 88;
        case Size::medium:
        default:           return 70;
    }
}

int XKnob::heightFor (Size size) noexcept
{
    return widthFor (size) + captionHeight + valueHeight;
}

XKnob::XKnob (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
              juce::String captionText, Size knobSize)
    : caption (std::move (captionText)), size (knobSize)
{
    slider.setSliderStyle (juce::Slider::RotaryVerticalDrag);
    slider.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    slider.setRotaryParameters (juce::MathConstants<float>::pi * 1.25f,
                                juce::MathConstants<float>::pi * 2.75f, true);
    slider.setColour (juce::Slider::thumbColourId, XTheme::accent);
    slider.setDoubleClickReturnValue (true, 0.0);
    addAndMakeVisible (slider);

    valueLabel.setJustificationType (juce::Justification::centred);
    valueLabel.setFont (XTheme::value (size == Size::small ? 9.5f : 11.0f));
    valueLabel.setColour (juce::Label::textColourId, XTheme::ink);
    valueLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (valueLabel);

    attachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (
        state, parameterId, slider);

    if (auto* parameter = state.getParameter (parameterId))
    {
        // The parameter owns the formatting, so the readout always agrees with the host.
        const auto update = [this, parameter]
        {
            valueLabel.setText (parameter->getCurrentValueAsText(), juce::dontSendNotification);
        };
        update();
        slider.onValueChange = update;
    }
}

void XKnob::setAccent (juce::Colour colour)
{
    slider.setColour (juce::Slider::thumbColourId, colour);
    repaint();
}

void XKnob::resized()
{
    auto area = getLocalBounds();
    area.removeFromTop (captionHeight);
    valueLabel.setBounds (area.removeFromBottom (valueHeight));
    slider.setBounds (area);
}

void XKnob::paint (juce::Graphics& g)
{
    XTheme::drawCaption (g, caption, getLocalBounds().removeFromTop (captionHeight),
                         XTheme::ink3, juce::Justification::centred,
                         size == Size::small ? 8.0f : 9.0f);
}

// ── XFader ───────────────────────────────────────────────────────────────────

XFader::XFader (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
                juce::String captionText)
    : caption (std::move (captionText))
{
    slider.setSliderStyle (juce::Slider::LinearHorizontal);
    slider.setTextBoxStyle (juce::Slider::NoTextBox, false, 0, 0);
    slider.setDoubleClickReturnValue (true, 0.0);
    addAndMakeVisible (slider);

    attachment = std::make_unique<juce::AudioProcessorValueTreeState::SliderAttachment> (
        state, parameterId, slider);

    if (auto* parameter = state.getParameter (parameterId))
        slider.onValueChange = [this] { repaint(); };
}

void XFader::resized()
{
    slider.setBounds (getLocalBounds().withTrimmedTop (captionHeight));
}

void XFader::paint (juce::Graphics& g)
{
    auto top = getLocalBounds().removeFromTop (captionHeight);
    XTheme::drawCaption (g, caption, top, XTheme::ink3, juce::Justification::left);

    g.setFont (XTheme::value (11.0f));
    g.setColour (XTheme::ink);
    g.drawText (slider.getTextFromValue (slider.getValue()), top,
                juce::Justification::centredRight, false);
}

// ── XMeter ───────────────────────────────────────────────────────────────────

XMeter::XMeter (juce::String captionText, bool isStereo)
    : caption (std::move (captionText)), stereo (isStereo)
{
    setInterceptsMouseClicks (false, false);
}

void XMeter::setCaption (juce::String text)
{
    caption = std::move (text);
    repaint();
}

void XMeter::setLevels (float leftDb, float rightDb)
{
    const auto now = juce::Time::getMillisecondCounter();

    levelL = juce::jlimit (minDb, maxDb, leftDb);
    levelR = juce::jlimit (minDb, maxDb, stereo ? rightDb : leftDb);

    if (levelL >= holdL) { holdL = levelL; holdUntilL = now + peakHoldMs; }
    else if (now > holdUntilL) { holdL = levelL; }

    if (levelR >= holdR) { holdR = levelR; holdUntilR = now + peakHoldMs; }
    else if (now > holdUntilR) { holdR = levelR; }

    repaint();
}

float XMeter::dbToY (float db, float top, float height) const noexcept
{
    const float t = (db - minDb) / (maxDb - minDb);
    return top + (1.0f - juce::jlimit (0.0f, 1.0f, t)) * height;
}

void XMeter::paint (juce::Graphics& g)
{
    auto bounds = getLocalBounds();
    XTheme::drawCaption (g, caption, bounds.removeFromTop (12), XTheme::ink3,
                         juce::Justification::centred, 8.0f);

    const auto scaleArea = bounds.removeFromRight (20);
    const auto columnArea = bounds.toFloat().reduced (1.0f, 0.0f);
    const float top = columnArea.getY();
    const float height = columnArea.getHeight();

    for (const float tick : { 12.0f, 6.0f, 0.0f, -6.0f, -12.0f, -36.0f })
    {
        const float y = dbToY (tick, top, height);
        g.setColour (juce::approximatelyEqual (tick, 0.0f) ? XTheme::axis() : XTheme::gridMinor());
        g.fillRect (columnArea.getX(), y, columnArea.getWidth(), 1.0f);
        g.setFont (XTheme::label (8.0f));
        g.setColour (XTheme::ink3);
        g.drawText (tick > 0.0f ? "+" + juce::String (juce::roundToInt (tick))
                                : juce::String (juce::roundToInt (tick)),
                    scaleArea.getX(), juce::roundToInt (y) - 5, scaleArea.getWidth(), 10,
                    juce::Justification::centredLeft, false);
    }

    const int columns = stereo ? 2 : 1;
    const float columnWidth = (columnArea.getWidth() - (columns - 1) * 2.0f) / columns;

    for (int c = 0; c < columns; ++c)
    {
        const float x = columnArea.getX() + c * (columnWidth + 2.0f);
        const auto rail = juce::Rectangle<float> (x, top, columnWidth, height);
        g.setColour (XTheme::panel2);
        g.fillRect (rail);
        g.setColour (XTheme::line2());
        g.drawRect (rail, 1.0f);

        const float level = (c == 0) ? levelL : levelR;
        const float hold = (c == 0) ? holdL : holdR;
        const float y = dbToY (level, top, height);
        g.setColour (level > 0.0f ? XTheme::warn : XTheme::accent);
        g.fillRect (juce::Rectangle<float> (x, y, columnWidth, rail.getBottom() - y));

        if (hold > minDb + 0.5f)
        {
            g.setColour (hold > 0.0f ? XTheme::warn : XTheme::ink2);
            g.fillRect (x, dbToY (hold, top, height) - 1.0f, columnWidth, 1.5f);
        }
    }
}

// ── XSegment ─────────────────────────────────────────────────────────────────

XSegment::XSegment (juce::AudioProcessorValueTreeState& stateRef, const juce::String& id,
                    juce::StringArray labels)
    : state (stateRef), parameterId (id),
      attachment (*stateRef.getParameter (id), [this] (float) { refresh(); }, nullptr)
{
    auto* parameter = state.getParameter (parameterId);
    const int count = labels.size();

    for (int i = 0; i < count; ++i)
    {
        auto* chip = chips.add (new juce::TextButton (labels[i]));
        styleChip (*chip);
        chip->onClick = [this, parameter, i, count]
        {
            if (parameter == nullptr)
                return;
            const float norm = count > 1 ? static_cast<float> (i) / static_cast<float> (count - 1) : 0.0f;
            parameter->beginChangeGesture();
            parameter->setValueNotifyingHost (norm);
            parameter->endChangeGesture();
        };
        addAndMakeVisible (chip);
    }

    attachment.sendInitialUpdate();
}

void XSegment::refresh()
{
    auto* parameter = state.getParameter (parameterId);
    if (parameter == nullptr)
        return;

    const int count = chips.size();
    const int index = count > 1
        ? juce::jlimit (0, count - 1,
                        juce::roundToInt (parameter->getValue() * static_cast<float> (count - 1)))
        : 0;

    for (int i = 0; i < count; ++i)
        chips[i]->setToggleState (i == index, juce::dontSendNotification);
}

void XSegment::resized()
{
    auto area = getLocalBounds();
    const int count = juce::jmax (1, chips.size());
    const int width = area.getWidth() / count;
    for (int i = 0; i < chips.size(); ++i)
        chips[i]->setBounds (area.removeFromLeft (i == chips.size() - 1 ? area.getWidth() : width)
                                .reduced (1, 0));
}

// ── XChip ────────────────────────────────────────────────────────────────────

XChip::XChip (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
              juce::String text)
    : button (std::move (text))
{
    button.setClickingTogglesState (true);
    button.setMouseCursor (juce::MouseCursor::PointingHandCursor);
    addAndMakeVisible (button);

    attachment = std::make_unique<juce::AudioProcessorValueTreeState::ButtonAttachment> (
        state, parameterId, button);
}

void XChip::resized()
{
    button.setBounds (getLocalBounds());
}

// ── XReadout ─────────────────────────────────────────────────────────────────

XReadout::XReadout (juce::String captionText)
    : caption (std::move (captionText))
{
    setInterceptsMouseClicks (false, false);
}

void XReadout::setValue (juce::String text, bool isWarning)
{
    if (text == value && isWarning == warn)
        return;
    value = std::move (text);
    warn = isWarning;
    repaint();
}

void XReadout::paint (juce::Graphics& g)
{
    auto area = getLocalBounds();
    XTheme::drawCaption (g, caption, area.removeFromTop (11), XTheme::ink3,
                         juce::Justification::left, 8.0f);

    g.setFont (XTheme::readout (19.0f));
    g.setColour (warn ? XTheme::warn : XTheme::ink);
    g.drawText (value, area, juce::Justification::topLeft, false);
}
