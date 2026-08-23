#include "DawLookAndFeel.h"

DawLookAndFeel::DawLookAndFeel()
{
    setColour (juce::ResizableWindow::backgroundColourId, DawColours::background);
    setColour (juce::TextButton::buttonColourId, DawColours::control);
    setColour (juce::TextButton::buttonOnColourId, DawColours::controlHover);
    setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
    setColour (juce::TextButton::textColourOnId, DawColours::text);
    setColour (juce::Label::textColourId, DawColours::text);
    setColour (juce::Label::backgroundColourId, juce::Colours::transparentBlack);
    setColour (juce::Label::outlineColourId, juce::Colours::transparentBlack);
    setColour (juce::Slider::backgroundColourId, DawColours::sliderTrack);
    setColour (juce::Slider::trackColourId, DawColours::sliderFill);
    setColour (juce::Slider::thumbColourId, juce::Colour (0xffd0d0d0));
    setColour (juce::Slider::rotarySliderFillColourId, juce::Colour (0xffd0d0d0));
    setColour (juce::Slider::rotarySliderOutlineColourId, juce::Colour (0xff5c5c5c));
    setColour (juce::TextEditor::backgroundColourId, DawColours::panelRaised);
    setColour (juce::TextEditor::textColourId, DawColours::text);
    setColour (juce::TextEditor::highlightColourId, DawColours::accent.withAlpha (0.35f));
    setColour (juce::TextEditor::outlineColourId, DawColours::divider);
    setColour (juce::TextEditor::focusedOutlineColourId, DawColours::accent);
    setColour (juce::PopupMenu::backgroundColourId, juce::Colour (0xff242424));
    setColour (juce::PopupMenu::textColourId, DawColours::text);
    setColour (juce::PopupMenu::highlightedBackgroundColourId, juce::Colour (0xff3a3a3a));
    setColour (juce::PopupMenu::highlightedTextColourId, juce::Colours::white);
    setColour (juce::TooltipWindow::backgroundColourId, juce::Colour (0xff2a2a2a));
    setColour (juce::TooltipWindow::textColourId, DawColours::text);
    setColour (juce::TooltipWindow::outlineColourId, DawColours::divider);
    setColour (juce::ScrollBar::thumbColourId, juce::Colour (0xff4a4a4a));
    setColour (juce::ScrollBar::backgroundColourId, juce::Colours::transparentBlack);
    setColour (juce::ComboBox::backgroundColourId, DawColours::control);
    setColour (juce::ComboBox::textColourId, DawColours::text);
    setColour (juce::ComboBox::outlineColourId, DawColours::divider);
    setColour (juce::ComboBox::arrowColourId, DawColours::textMuted);
    setColour (juce::AlertWindow::backgroundColourId, DawColours::panelRaised);
    setColour (juce::AlertWindow::textColourId, DawColours::text);
    setColour (juce::AlertWindow::outlineColourId, DawColours::divider);
}

void DawLookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height,
                                       float sliderPos, float rotaryStartAngle, float rotaryEndAngle,
                                       juce::Slider&)
{
    auto bounds = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height).reduced (1.5f);
    const auto radius = juce::jmin (bounds.getWidth(), bounds.getHeight()) * 0.5f;
    const auto centre = bounds.getCentre();
    const auto angle = rotaryStartAngle + sliderPos * (rotaryEndAngle - rotaryStartAngle);

    g.setColour (DawColours::knob);
    g.fillEllipse (centre.x - radius, centre.y - radius, radius * 2.0f, radius * 2.0f);

    g.setColour (juce::Colour (0xff5c5c5c));
    g.drawEllipse (centre.x - radius, centre.y - radius, radius * 2.0f, radius * 2.0f, 1.2f);

    juce::Path pointer;
    pointer.startNewSubPath (centre.getPointOnCircumference (radius * 0.22f, angle));
    pointer.lineTo (centre.getPointOnCircumference (radius * 0.78f, angle));
    g.setColour (juce::Colour (0xffd4d4d4));
    g.strokePath (pointer, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
}

void DawLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                       float sliderPos, float minSliderPos, float maxSliderPos,
                                       juce::Slider::SliderStyle style, juce::Slider& slider)
{
    juce::ignoreUnused (minSliderPos, maxSliderPos, slider);

    if (style == juce::Slider::LinearHorizontal || style == juce::Slider::LinearBar)
    {
        auto track = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height);
        track = track.withSizeKeepingCentre (track.getWidth(), 6.0f);
        g.setColour (DawColours::sliderTrack);
        g.fillRoundedRectangle (track, 3.0f);

        const auto t = juce::jlimit (0.0f, 1.0f, (sliderPos - (float) x) / juce::jmax (1.0f, (float) width));
        auto filled = track.withWidth (track.getWidth() * t);
        g.setColour (DawColours::sliderFill);
        g.fillRoundedRectangle (filled, 3.0f);
        return;
    }

    if (style == juce::Slider::LinearVertical)
    {
        // Console-style fader: thin track with a wide cap.
        auto bounds = juce::Rectangle<float> ((float) x, (float) y, (float) width, (float) height);
        auto track = bounds.withSizeKeepingCentre (4.0f, bounds.getHeight());
        g.setColour (DawColours::sliderTrack);
        g.fillRoundedRectangle (track, 2.0f);

        const auto thumbY = juce::jlimit (bounds.getY(), bounds.getBottom(), sliderPos);
        g.setColour (DawColours::sliderFill);
        g.fillRoundedRectangle (track.withTop (thumbY), 2.0f);

        // Unity mark at the 0 dB fader position.
        const auto unityY = bounds.getBottom() - bounds.getHeight() * 0.8f;
        g.setColour (juce::Colour (0xff4a4a4a));
        g.fillRect (bounds.getX(), unityY, bounds.getWidth(), 1.0f);

        auto cap = juce::Rectangle<float> (bounds.getWidth(), 12.0f)
                       .withCentre ({ bounds.getCentreX(), thumbY });
        g.setColour (juce::Colour (0xff3a3a3a));
        g.fillRoundedRectangle (cap, 2.0f);
        g.setColour (juce::Colour (0xff6a6a6a));
        g.drawRoundedRectangle (cap.reduced (0.5f), 2.0f, 1.0f);
        g.setColour (juce::Colour (0xffcfcfcf));
        g.fillRect (cap.getX() + 2.0f, cap.getCentreY() - 0.5f, cap.getWidth() - 4.0f, 1.0f);
        return;
    }

    LookAndFeel_V4::drawLinearSlider (g, x, y, width, height, sliderPos, minSliderPos, maxSliderPos, style, slider);
}

void DawLookAndFeel::drawButtonBackground (juce::Graphics& g, juce::Button& button, const juce::Colour& backgroundColour,
                                           bool shouldDrawButtonAsHighlighted, bool shouldDrawButtonAsDown)
{
    auto bounds = button.getLocalBounds().toFloat().reduced (0.5f);
    auto colour = backgroundColour;

    if (button.getToggleState())
        colour = button.findColour (juce::TextButton::buttonOnColourId);
    else if (shouldDrawButtonAsDown)
        colour = colour.brighter (0.15f);
    else if (shouldDrawButtonAsHighlighted)
        colour = colour.brighter (0.08f);

    g.setColour (colour);
    g.fillRoundedRectangle (bounds, 3.0f);
}

void DawLookAndFeel::drawButtonText (juce::Graphics& g, juce::TextButton& button,
                                     bool, bool)
{
    g.setFont (getTextButtonFont (button, button.getHeight()));
    g.setColour (button.getToggleState() ? juce::Colours::white
                                         : button.findColour (button.getToggleState() ? juce::TextButton::textColourOnId
                                                                                      : juce::TextButton::textColourOffId));
    g.drawFittedText (button.getButtonText(), button.getLocalBounds().reduced (2),
                      juce::Justification::centred, 1);
}

juce::Font DawLookAndFeel::getTextButtonFont (juce::TextButton&, int buttonHeight)
{
    return juce::Font (juce::FontOptions ((float) juce::jmin (13, buttonHeight - 6)));
}

juce::Font DawLookAndFeel::getPopupMenuFont()
{
    return juce::Font (juce::FontOptions (13.5f));
}

void DawLookAndFeel::drawPopupMenuBackground (juce::Graphics& g, int width, int height)
{
    g.setColour (findColour (juce::PopupMenu::backgroundColourId));
    g.fillRoundedRectangle (0.0f, 0.0f, (float) width, (float) height, 6.0f);
    g.setColour (DawColours::divider);
    g.drawRoundedRectangle (0.5f, 0.5f, (float) width - 1.0f, (float) height - 1.0f, 6.0f, 1.0f);
}

void DawLookAndFeel::drawTooltip (juce::Graphics& g, const juce::String& text, int width, int height)
{
    g.setColour (findColour (juce::TooltipWindow::backgroundColourId));
    g.fillRoundedRectangle (0.0f, 0.0f, (float) width, (float) height, 4.0f);
    g.setColour (findColour (juce::TooltipWindow::outlineColourId));
    g.drawRoundedRectangle (0.5f, 0.5f, (float) width - 1.0f, (float) height - 1.0f, 4.0f, 1.0f);
    g.setColour (findColour (juce::TooltipWindow::textColourId));
    g.setFont (juce::FontOptions (12.5f));
    g.drawFittedText (text, { 8, 4, width - 16, height - 8 }, juce::Justification::centredLeft, 3);
}

juce::Slider::SliderLayout DawLookAndFeel::getSliderLayout (juce::Slider& slider)
{
    juce::Slider::SliderLayout layout;
    layout.sliderBounds = slider.getLocalBounds();
    layout.textBoxBounds = {};
    return layout;
}
