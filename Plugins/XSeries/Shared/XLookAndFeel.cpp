#include "XLookAndFeel.h"

namespace XTheme
{
    void drawCaption (juce::Graphics& g, juce::String text, juce::Rectangle<int> area,
                      juce::Colour colour, juce::Justification justification, float height,
                      float tracking)
    {
        text = text.toUpperCase();
        if (text.isEmpty())
            return;

        const auto font = label (height);
        g.setFont (font);
        g.setColour (colour);

        float total = 0.0f;
        for (int i = 0; i < text.length(); ++i)
            total += juce::GlyphArrangement::getStringWidth (font, text.substring (i, i + 1)) + tracking;
        total -= tracking;

        float x = static_cast<float> (area.getX());
        if (justification.testFlags (juce::Justification::horizontallyCentred))
            x += (static_cast<float> (area.getWidth()) - total) * 0.5f;
        else if (justification.testFlags (juce::Justification::right))
            x += static_cast<float> (area.getWidth()) - total;

        const float baseline = static_cast<float> (area.getCentreY()) + height * 0.36f;
        for (int i = 0; i < text.length(); ++i)
        {
            const auto glyph = text.substring (i, i + 1);
            g.drawSingleLineText (glyph, juce::roundToInt (x), juce::roundToInt (baseline));
            x += juce::GlyphArrangement::getStringWidth (font, glyph) + tracking;
        }
    }

    void drawPanel (juce::Graphics& g, juce::Rectangle<float> area, bool raised)
    {
        g.setColour (raised ? panel2 : panel);
        g.fillRoundedRectangle (area, radius);
        g.setColour (line());
        g.drawRoundedRectangle (area.reduced (0.5f), radius, 1.0f);
    }

    void drawCard (juce::Graphics& g, juce::Rectangle<float> area, juce::Colour topEdge)
    {
        g.setColour (panel);
        g.fillRoundedRectangle (area, radiusSmall);
        g.setColour (line());
        g.drawRoundedRectangle (area.reduced (0.5f), radiusSmall, 1.0f);
        if (! topEdge.isTransparent())
        {
            g.setColour (topEdge);
            g.fillRect (area.getX() + radiusSmall, area.getY(),
                        area.getWidth() - radiusSmall * 2.0f, 2.0f);
        }
    }
}

XLookAndFeel::XLookAndFeel()
{
    setColour (juce::ResizableWindow::backgroundColourId, XTheme::chassis);
    setColour (juce::Label::textColourId, XTheme::ink);
    setColour (juce::Slider::textBoxTextColourId, XTheme::ink);
    setColour (juce::Slider::textBoxOutlineColourId, juce::Colours::transparentBlack);
    setColour (juce::Slider::textBoxBackgroundColourId, juce::Colours::transparentBlack);
    setColour (juce::TextButton::textColourOffId, XTheme::ink2);
    setColour (juce::TextButton::textColourOnId, XTheme::ink);
    setColour (juce::ComboBox::textColourId, XTheme::ink);
    setColour (juce::ComboBox::backgroundColourId, XTheme::panel);
    setColour (juce::ComboBox::outlineColourId, XTheme::line());
    setColour (juce::ComboBox::arrowColourId, XTheme::ink3);
    setColour (juce::PopupMenu::backgroundColourId, XTheme::panel);
    setColour (juce::PopupMenu::textColourId, XTheme::ink2);
    setColour (juce::PopupMenu::highlightedBackgroundColourId, XTheme::accentLo());
    setColour (juce::PopupMenu::highlightedTextColourId, XTheme::ink);
    setColour (juce::TooltipWindow::backgroundColourId, XTheme::panel);
    setColour (juce::TooltipWindow::textColourId, XTheme::ink2);
}

void XLookAndFeel::drawRotarySlider (juce::Graphics& g, int x, int y, int width, int height,
                                     float sliderPos, float rotaryStartAngle, float rotaryEndAngle,
                                     juce::Slider& slider)
{
    const auto bounds = juce::Rectangle<int> (x, y, width, height).toFloat().reduced (2.0f);
    const float diameter = juce::jmin (bounds.getWidth(), bounds.getHeight());
    const auto body = juce::Rectangle<float> (diameter, diameter).withCentre (bounds.getCentre());
    const auto centre = body.getCentre();
    const float radius = diameter * 0.5f;
    const float angle = rotaryStartAngle + sliderPos * (rotaryEndAngle - rotaryStartAngle);
    const bool enabled = slider.isEnabled();

    const auto accent = slider.findColour (juce::Slider::thumbColourId, true).isTransparent()
        ? XTheme::accent
        : slider.findColour (juce::Slider::thumbColourId);
    const auto liveAccent = enabled ? accent : XTheme::ink3;

    // Engraved bezel ticks.
    g.setColour (XTheme::ink.withAlpha (0.14f));
    for (int i = 0; i <= 10; ++i)
    {
        const float t = static_cast<float> (i) / 10.0f;
        const float a = rotaryStartAngle + t * (rotaryEndAngle - rotaryStartAngle);
        const auto from = centre.getPointOnCircumference (radius * 0.99f, a);
        const auto to = centre.getPointOnCircumference (radius * 0.90f, a);
        g.drawLine ({ from, to }, 1.0f);
    }

    // Value arc.
    const float arcRadius = radius * 0.80f;
    juce::Path track;
    track.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f,
                         rotaryStartAngle, rotaryEndAngle, true);
    g.setColour (XTheme::ink.withAlpha (0.12f));
    g.strokePath (track, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved,
                                               juce::PathStrokeType::rounded));

    if (std::abs (angle - rotaryStartAngle) > 0.001f)
    {
        juce::Path arc;
        arc.addCentredArc (centre.x, centre.y, arcRadius, arcRadius, 0.0f,
                           rotaryStartAngle, angle, true);
        g.setColour (liveAccent);
        g.strokePath (arc, juce::PathStrokeType (2.0f, juce::PathStrokeType::curved,
                                                 juce::PathStrokeType::rounded));
    }

    // Knob body: white-to-light-grey, thin outline, no glow.
    const auto knob = body.reduced (radius * 0.30f);
    juce::ColourGradient face (juce::Colour (0xFFFFFFFF), knob.getCentreX(), knob.getY(),
                               juce::Colour (0xFFE8E6E2), knob.getCentreX(), knob.getBottom(), false);
    g.setGradientFill (face);
    g.fillEllipse (knob);
    g.setColour (XTheme::ink.withAlpha (0.18f));
    g.drawEllipse (knob.reduced (0.5f), 1.0f);

    // Needle.
    const auto needleFrom = centre.getPointOnCircumference (knob.getWidth() * 0.16f, angle);
    const auto needleTo = centre.getPointOnCircumference (knob.getWidth() * 0.46f, angle);
    g.setColour (enabled ? XTheme::ink : XTheme::ink3);
    g.drawLine ({ needleFrom, needleTo }, 1.6f);

    g.setColour (liveAccent);
    g.fillEllipse (juce::Rectangle<float> (3.4f, 3.4f).withCentre (centre));
}

void XLookAndFeel::drawLinearSlider (juce::Graphics& g, int x, int y, int width, int height,
                                     float sliderPos, float, float,
                                     juce::Slider::SliderStyle style, juce::Slider& slider)
{
    const bool vertical = style == juce::Slider::LinearVertical
                       || style == juce::Slider::LinearBarVertical;
    const bool enabled = slider.isEnabled();
    const auto accent = enabled ? XTheme::accent : XTheme::ink3;
    const auto bounds = juce::Rectangle<int> (x, y, width, height).toFloat();

    if (vertical)
    {
        const auto rail = juce::Rectangle<float> (4.0f, bounds.getHeight())
                              .withCentre ({ bounds.getCentreX(), bounds.getCentreY() });
        g.setColour (XTheme::panel2);
        g.fillRoundedRectangle (rail, 2.0f);
        g.setColour (XTheme::line());
        g.drawRoundedRectangle (rail.reduced (0.5f), 2.0f, 1.0f);

        g.setColour (accent);
        g.fillRoundedRectangle (rail.withTop (sliderPos).reduced (0.5f), 2.0f);

        const auto thumb = juce::Rectangle<float> (16.0f, 8.0f)
                               .withCentre ({ bounds.getCentreX(), sliderPos });
        g.setColour (juce::Colours::white);
        g.fillRoundedRectangle (thumb, 2.0f);
        g.setColour (accent);
        g.drawRoundedRectangle (thumb.reduced (0.5f), 2.0f, 1.2f);
    }
    else
    {
        const auto rail = juce::Rectangle<float> (bounds.getWidth(), 4.0f)
                              .withCentre ({ bounds.getCentreX(), bounds.getCentreY() });
        g.setColour (XTheme::panel2);
        g.fillRoundedRectangle (rail, 2.0f);
        g.setColour (XTheme::line());
        g.drawRoundedRectangle (rail.reduced (0.5f), 2.0f, 1.0f);

        g.setColour (accent);
        g.fillRoundedRectangle (rail.withRight (sliderPos).reduced (0.5f), 2.0f);

        const auto thumb = juce::Rectangle<float> (8.0f, 16.0f)
                               .withCentre ({ sliderPos, bounds.getCentreY() });
        g.setColour (juce::Colours::white);
        g.fillRoundedRectangle (thumb, 2.0f);
        g.setColour (accent);
        g.drawRoundedRectangle (thumb.reduced (0.5f), 2.0f, 1.2f);
    }
}

void XLookAndFeel::drawButtonBackground (juce::Graphics& g, juce::Button& button,
                                         const juce::Colour&, bool shouldDrawAsHighlighted, bool)
{
    const auto area = button.getLocalBounds().toFloat().reduced (0.5f);
    const bool on = button.getToggleState();

    g.setColour (on ? XTheme::accentLo() : XTheme::panel);
    g.fillRoundedRectangle (area, XTheme::radiusSmall);
    g.setColour (on ? XTheme::accent
                    : (shouldDrawAsHighlighted ? XTheme::ink.withAlpha (0.28f) : XTheme::line()));
    g.drawRoundedRectangle (area, XTheme::radiusSmall, 1.0f);
}

void XLookAndFeel::drawButtonText (juce::Graphics& g, juce::TextButton& button, bool, bool)
{
    const auto colour = button.getToggleState() ? XTheme::ink : XTheme::ink2;
    XTheme::drawCaption (g, button.getButtonText(), button.getLocalBounds(), colour,
                         juce::Justification::centred, 9.0f, 1.2f);
}

void XLookAndFeel::drawToggleButton (juce::Graphics& g, juce::ToggleButton& button,
                                     bool shouldDrawAsHighlighted, bool shouldDrawAsDown)
{
    drawButtonBackground (g, button, {}, shouldDrawAsHighlighted, shouldDrawAsDown);
    const auto colour = button.getToggleState() ? XTheme::ink : XTheme::ink2;
    XTheme::drawCaption (g, button.getButtonText(), button.getLocalBounds(), colour,
                         juce::Justification::centred, 9.0f, 1.2f);
}

void XLookAndFeel::drawComboBox (juce::Graphics& g, int width, int height, bool,
                                 int, int, int, int, juce::ComboBox& box)
{
    const auto area = juce::Rectangle<int> (0, 0, width, height).toFloat().reduced (0.5f);
    g.setColour (XTheme::panel);
    g.fillRoundedRectangle (area, XTheme::radiusSmall);
    g.setColour (box.isMouseOver() ? XTheme::ink.withAlpha (0.24f) : XTheme::line());
    g.drawRoundedRectangle (area, XTheme::radiusSmall, 1.0f);

    juce::Path caret;
    const float cx = static_cast<float> (width) - 12.0f;
    const float cy = static_cast<float> (height) * 0.5f;
    caret.addTriangle (cx - 3.5f, cy - 1.8f, cx + 3.5f, cy - 1.8f, cx, cy + 2.6f);
    g.setColour (XTheme::ink3);
    g.fillPath (caret);
}

void XLookAndFeel::positionComboBoxText (juce::ComboBox& box, juce::Label& label)
{
    label.setBounds (8, 0, box.getWidth() - 24, box.getHeight());
    label.setFont (getComboBoxFont (box));
    label.setJustificationType (juce::Justification::centredLeft);
}

juce::Font XLookAndFeel::getComboBoxFont (juce::ComboBox&)
{
    return XTheme::value (11.0f);
}

juce::Font XLookAndFeel::getPopupMenuFont()
{
    return XTheme::value (12.0f);
}

juce::Font XLookAndFeel::getLabelFont (juce::Label& label)
{
    return label.getFont().getHeight() > 0.0f ? label.getFont() : XTheme::value (11.0f);
}

void XLookAndFeel::drawPopupMenuBackground (juce::Graphics& g, int width, int height)
{
    const auto area = juce::Rectangle<int> (0, 0, width, height).toFloat().reduced (0.5f);
    g.setColour (XTheme::panel);
    g.fillRoundedRectangle (area, XTheme::radius);
    g.setColour (XTheme::line());
    g.drawRoundedRectangle (area, XTheme::radius, 1.0f);
}

void XLookAndFeel::drawPopupMenuItem (juce::Graphics& g, const juce::Rectangle<int>& area,
                                      bool isSeparator, bool isActive, bool isHighlighted,
                                      bool isTicked, bool, const juce::String& text,
                                      const juce::String&, const juce::Drawable*,
                                      const juce::Colour*)
{
    if (isSeparator)
    {
        g.setColour (XTheme::line());
        g.fillRect (area.reduced (8, 0).withHeight (1).withY (area.getCentreY()));
        return;
    }

    if (isHighlighted && isActive)
    {
        g.setColour (XTheme::accentLo());
        g.fillRect (area);
    }

    g.setFont (XTheme::value (12.0f));
    g.setColour (! isActive ? XTheme::ink3 : (isHighlighted || isTicked ? XTheme::ink : XTheme::ink2));
    g.drawText (text, area.reduced (12, 0), juce::Justification::centredLeft, true);

    if (isTicked)
    {
        g.setColour (XTheme::accent);
        g.fillEllipse (juce::Rectangle<float> (4.0f, 4.0f)
                           .withCentre ({ static_cast<float> (area.getRight()) - 12.0f,
                                          static_cast<float> (area.getCentreY()) }));
    }
}
