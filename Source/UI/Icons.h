#pragma once

#include <JuceHeader.h>
#include "DawColours.h"

namespace Icons
{
    /** Insets an icon box, but never by so much that a small button loses its glyph. */
    inline juce::Rectangle<float> pad (juce::Rectangle<float> r, float amount = 5.0f)
    {
        const auto limit = juce::jmin (r.getWidth(), r.getHeight()) * 0.34f;
        return r.reduced (juce::jmin (amount, limit));
    }

    inline void drawPlay (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.0f);
        juce::Path p;
        p.addTriangle (r.getX(), r.getY(),
                       r.getRight(), r.getCentreY(),
                       r.getX(), r.getBottom());
        g.setColour (c);
        g.fillPath (p);
    }

    inline void drawPause (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 8.0f);
        auto w = r.getWidth() * 0.32f;
        g.setColour (c);
        g.fillRoundedRectangle (r.getX(), r.getY(), w, r.getHeight(), 1.5f);
        g.fillRoundedRectangle (r.getRight() - w, r.getY(), w, r.getHeight(), 1.5f);
    }

    inline void drawStop (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 8.5f);
        g.setColour (c);
        g.fillRoundedRectangle (r, 2.0f);
    }

    inline void drawRecord (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.0f);
        g.setColour (c);
        g.fillEllipse (r);
    }

    inline void drawToStart (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.5f);
        g.setColour (c);
        g.fillRect (r.getX(), r.getY(), 2.2f, r.getHeight());
        juce::Path p;
        p.addTriangle (r.getRight(), r.getY(),
                       r.getX() + 3.0f, r.getCentreY(),
                       r.getRight(), r.getBottom());
        g.fillPath (p);
    }

    inline void drawLoop (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        juce::PathStrokeType stroke (1.6f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded);

        juce::Path arc;
        arc.addRoundedRectangle (r.reduced (1.0f), 4.0f);
        g.strokePath (arc, stroke);

        juce::Path arrow;
        auto tip = juce::Point<float> (r.getRight() - 1.0f, r.getY() + 3.0f);
        arrow.addTriangle (tip.x - 4.0f, tip.y - 3.5f,
                           tip.x + 1.0f, tip.y + 0.5f,
                           tip.x - 4.0f, tip.y + 2.5f);
        g.fillPath (arrow);
    }

    inline void drawMetronome (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        juce::Path body;
        body.startNewSubPath (r.getCentreX() - 2.0f, r.getY());
        body.lineTo (r.getX(), r.getBottom());
        body.lineTo (r.getRight(), r.getBottom());
        body.lineTo (r.getCentreX() + 2.0f, r.getY());
        body.closeSubPath();
        g.setColour (c);
        g.strokePath (body, juce::PathStrokeType (1.5f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        g.drawLine (r.getCentreX() + 1.0f, r.getY() + 2.0f, r.getX() + r.getWidth() * 0.28f, r.getBottom() - 3.0f, 1.5f);
    }

    inline void drawSpeaker (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        g.setColour (c);
        auto cone = r.removeFromLeft (r.getWidth() * 0.48f);
        g.fillRoundedRectangle (cone.withHeight (cone.getHeight() * 0.45f)
                                    .withCentre ({ cone.getCentreX(), r.getCentreY() }), 1.5f);
        juce::Path horn;
        horn.addTriangle (cone.getRight() - 1.0f, r.getCentreY() - r.getHeight() * 0.18f,
                          r.getRight() - 2.0f, r.getY(),
                          r.getRight() - 2.0f, r.getBottom());
        g.fillPath (horn);
    }

    inline void drawMagnet (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        juce::Path p;
        p.startNewSubPath (r.getX(), r.getY() + 2.0f);
        p.lineTo (r.getX(), r.getCentreY());
        p.quadraticTo (r.getX(), r.getBottom(), r.getCentreX(), r.getBottom());
        p.quadraticTo (r.getRight(), r.getBottom(), r.getRight(), r.getCentreY());
        p.lineTo (r.getRight(), r.getY() + 2.0f);
        g.setColour (c);
        g.strokePath (p, juce::PathStrokeType (1.8f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        g.fillRect (r.getX() - 0.5f, r.getY(), 3.5f, 4.0f);
        g.fillRect (r.getRight() - 3.0f, r.getY(), 3.5f, 4.0f);
    }

    inline void drawPlus (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 8.0f);
        g.setColour (c);
        auto cx = r.getCentreX(), cy = r.getCentreY();
        g.drawLine (cx, r.getY(), cx, r.getBottom(), 1.8f);
        g.drawLine (r.getX(), cy, r.getRight(), cy, 1.8f);
    }

    inline void drawWaveform (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.0f);
        g.setColour (c);
        juce::Path p;
        p.startNewSubPath (r.getX(), r.getCentreY());
        p.quadraticTo (r.getX() + r.getWidth() * 0.15f, r.getY(), r.getX() + r.getWidth() * 0.3f, r.getCentreY());
        p.quadraticTo (r.getX() + r.getWidth() * 0.45f, r.getBottom(), r.getX() + r.getWidth() * 0.6f, r.getCentreY());
        p.quadraticTo (r.getX() + r.getWidth() * 0.75f, r.getY() + 2.0f, r.getRight(), r.getCentreY());
        g.strokePath (p, juce::PathStrokeType (1.5f));
    }

    inline void drawBell (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        juce::Path p;
        p.startNewSubPath (r.getX() + 2.0f, r.getY() + r.getHeight() * 0.42f);
        p.quadraticTo (r.getX() + 2.0f, r.getY(), r.getCentreX(), r.getY());
        p.quadraticTo (r.getRight() - 2.0f, r.getY(), r.getRight() - 2.0f, r.getY() + r.getHeight() * 0.42f);
        p.lineTo (r.getRight(), r.getBottom() - 5.0f);
        p.lineTo (r.getX(), r.getBottom() - 5.0f);
        p.closeSubPath();
        g.setColour (c);
        g.strokePath (p, juce::PathStrokeType (1.5f));
        g.fillEllipse (r.getCentreX() - 1.6f, r.getBottom() - 4.0f, 3.2f, 3.2f);
    }

    inline void drawSave (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.0f);
        g.setColour (c);
        g.drawLine (r.getCentreX(), r.getY(), r.getCentreX(), r.getBottom() - 2.0f, 1.6f);
        juce::Path arrow;
        arrow.addTriangle (r.getCentreX() - 4.5f, r.getBottom() - 7.0f,
                           r.getCentreX() + 4.5f, r.getBottom() - 7.0f,
                           r.getCentreX(), r.getBottom() - 1.0f);
        g.fillPath (arrow);
        g.drawLine (r.getX(), r.getBottom(), r.getRight(), r.getBottom(), 1.6f);
    }

    inline void drawHeadphones (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        juce::Path band;
        band.startNewSubPath (r.getX() + 2.0f, r.getCentreY());
        band.quadraticTo (r.getCentreX(), r.getY() - 2.0f, r.getRight() - 2.0f, r.getCentreY());
        g.setColour (c);
        g.strokePath (band, juce::PathStrokeType (1.6f));
        g.fillRoundedRectangle (r.getX(), r.getCentreY() - 2.0f, 5.0f, 9.0f, 1.5f);
        g.fillRoundedRectangle (r.getRight() - 5.0f, r.getCentreY() - 2.0f, 5.0f, 9.0f, 1.5f);
    }

    inline void drawMenu (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 8.0f);
        g.setColour (c);
        for (int i = 0; i < 3; ++i)
            g.drawLine (r.getX(), r.getY() + i * (r.getHeight() / 2.0f),
                        r.getRight(), r.getY() + i * (r.getHeight() / 2.0f), 1.5f);
    }

    inline void drawGrid (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 7.0f);
        g.setColour (c);
        g.drawRect (r, 1.2f);
        g.drawLine (r.getCentreX(), r.getY(), r.getCentreX(), r.getBottom(), 1.2f);
        g.drawLine (r.getX(), r.getCentreY(), r.getRight(), r.getCentreY(), 1.2f);
    }

    inline void drawPiano (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        g.drawRect (r, 1.2f);
        auto w = r.getWidth() / 4.0f;
        for (int i = 1; i < 4; ++i)
            g.drawLine (r.getX() + w * (float) i, r.getY(), r.getX() + w * (float) i, r.getBottom(), 1.0f);
        g.fillRect (r.getX() + w * 0.65f, r.getY(), w * 0.45f, r.getHeight() * 0.55f);
        g.fillRect (r.getX() + w * 1.65f, r.getY(), w * 0.45f, r.getHeight() * 0.55f);
    }

    inline void drawUndo (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        juce::Path p;
        p.addCentredArc (r.getCentreX(), r.getCentreY() + 1.0f,
                         r.getWidth() * 0.42f, r.getHeight() * 0.34f, 0.0f,
                         juce::MathConstants<float>::pi * 1.85f,
                         juce::MathConstants<float>::pi * 0.55f, true);
        g.strokePath (p, juce::PathStrokeType (1.5f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        juce::Path arrow;
        auto tip = juce::Point<float> (r.getX() + r.getWidth() * 0.08f, r.getY() + r.getHeight() * 0.36f);
        arrow.addTriangle (tip.x, tip.y - 1.0f, tip.x + 5.5f, tip.y - 3.0f, tip.x + 4.0f, tip.y + 3.5f);
        g.fillPath (arrow);
    }

    inline void drawRedo (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        juce::Path p;
        p.addCentredArc (r.getCentreX(), r.getCentreY() + 1.0f,
                         r.getWidth() * 0.42f, r.getHeight() * 0.34f, 0.0f,
                         juce::MathConstants<float>::pi * 0.15f,
                         juce::MathConstants<float>::pi * 1.45f, true);
        g.strokePath (p, juce::PathStrokeType (1.5f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        juce::Path arrow;
        auto tip = juce::Point<float> (r.getRight() - r.getWidth() * 0.08f, r.getY() + r.getHeight() * 0.36f);
        arrow.addTriangle (tip.x, tip.y - 1.0f, tip.x - 5.5f, tip.y - 3.0f, tip.x - 4.0f, tip.y + 3.5f);
        g.fillPath (arrow);
    }

    inline void drawNewFile (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        auto page = r.withTrimmedRight (r.getWidth() * 0.18f);
        g.setColour (c);
        g.drawRect (page, 1.3f);
        g.fillRect (r.getRight() - 5.0f, r.getBottom() - 6.0f, 5.0f, 1.4f);
        g.fillRect (r.getRight() - 3.2f, r.getBottom() - 7.8f, 1.4f, 5.0f);
    }

    inline void drawFolder (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        auto body = r.withTrimmedTop (r.getHeight() * 0.2f);
        g.drawRoundedRectangle (body, 1.5f, 1.3f);
        g.fillRect (r.getX() + 1.0f, r.getY() + r.getHeight() * 0.2f - 2.5f, r.getWidth() * 0.42f, 2.5f);
    }

    inline void drawSettings (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        g.setColour (c);

        for (int i = 0; i < 3; ++i)
        {
            const auto y = r.getY() + r.getHeight() * (0.18f + 0.32f * (float) i);
            g.drawLine (r.getX(), y, r.getRight(), y, 1.3f);
            const auto knobX = r.getX() + r.getWidth() * (i == 1 ? 0.68f : 0.34f);
            g.setColour (DawColours::panel);
            g.fillEllipse (knobX - 2.6f, y - 2.6f, 5.2f, 5.2f);
            g.setColour (c);
            g.drawEllipse (knobX - 2.6f, y - 2.6f, 5.2f, 5.2f, 1.3f);
        }
    }

    inline void drawMixer (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        g.setColour (c);

        for (int i = 0; i < 3; ++i)
        {
            const auto x = r.getX() + r.getWidth() * (0.16f + 0.34f * (float) i);
            g.drawLine (x, r.getY(), x, r.getBottom(), 1.3f);
            const auto y = r.getY() + r.getHeight() * (i == 1 ? 0.28f : 0.62f);
            g.fillRoundedRectangle (x - 3.0f, y - 1.6f, 6.0f, 3.2f, 1.0f);
        }
    }

    inline void drawAutomation (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        juce::Path p;
        p.startNewSubPath (r.getX(), r.getBottom());
        p.lineTo (r.getX() + r.getWidth() * 0.36f, r.getY() + r.getHeight() * 0.28f);
        p.lineTo (r.getX() + r.getWidth() * 0.66f, r.getY() + r.getHeight() * 0.52f);
        p.lineTo (r.getRight(), r.getY());
        g.strokePath (p, juce::PathStrokeType (1.4f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
        g.fillEllipse (r.getX() + r.getWidth() * 0.36f - 1.8f, r.getY() + r.getHeight() * 0.28f - 1.8f, 3.6f, 3.6f);
        g.fillEllipse (r.getX() + r.getWidth() * 0.66f - 1.8f, r.getY() + r.getHeight() * 0.52f - 1.8f, 3.6f, 3.6f);
    }

    inline void drawInfo (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        g.drawEllipse (r, 1.3f);
        g.fillEllipse (r.getCentreX() - 1.0f, r.getY() + r.getHeight() * 0.22f, 2.0f, 2.0f);
        g.fillRect (r.getCentreX() - 0.8f, r.getY() + r.getHeight() * 0.42f, 1.6f, r.getHeight() * 0.34f);
    }

    inline void drawInspector (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        g.drawRect (r, 1.3f);
        g.drawLine (r.getX() + r.getWidth() * 0.58f, r.getY(),
                    r.getX() + r.getWidth() * 0.58f, r.getBottom(), 1.3f);
    }

    inline void drawPlugin (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        g.setColour (c);
        auto body = r.withTrimmedLeft (2.5f);
        g.drawRoundedRectangle (body, 1.5f, 1.3f);

        for (int i = 0; i < 3; ++i)
        {
            const auto y = body.getY() + body.getHeight() * (0.24f + 0.26f * (float) i);
            g.fillRect (r.getX(), y - 0.7f, 2.5f, 1.5f);
        }
    }

    inline void drawNote (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.0f);
        g.setColour (c);
        g.fillEllipse (r.getX(), r.getBottom() - 6.0f, 6.5f, 5.0f);
        g.fillRect (r.getX() + 5.2f, r.getY(), 1.5f, r.getHeight() - 3.5f);
        g.fillRect (r.getX() + 5.2f, r.getY(), r.getWidth() * 0.45f, 1.5f);
    }

    inline void drawScissors (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        r = pad (r, 6.5f);
        g.setColour (c);
        g.drawLine (r.getX(), r.getY(), r.getRight() - 2.0f, r.getBottom() - 4.0f, 1.3f);
        g.drawLine (r.getRight() - 2.0f, r.getY(), r.getX(), r.getBottom() - 4.0f, 1.3f);
        g.drawEllipse (r.getX(), r.getBottom() - 4.5f, 4.5f, 4.5f, 1.2f);
        g.drawEllipse (r.getRight() - 4.5f, r.getBottom() - 4.5f, 4.5f, 4.5f, 1.2f);
    }

    inline void drawChevron (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c, bool pointingDown)
    {
        r = pad (r, 8.0f);
        g.setColour (c);
        juce::Path p;

        if (pointingDown)
        {
            p.startNewSubPath (r.getX(), r.getCentreY() - 2.0f);
            p.lineTo (r.getCentreX(), r.getCentreY() + 2.5f);
            p.lineTo (r.getRight(), r.getCentreY() - 2.0f);
        }
        else
        {
            p.startNewSubPath (r.getX(), r.getCentreY() + 2.5f);
            p.lineTo (r.getCentreX(), r.getCentreY() - 2.0f);
            p.lineTo (r.getRight(), r.getCentreY() + 2.5f);
        }

        g.strokePath (p, juce::PathStrokeType (1.6f, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
    }

    inline void drawChevronDown (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c) { drawChevron (g, r, c, true); }
    inline void drawChevronUp   (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c) { drawChevron (g, r, c, false); }

    inline void drawUser (juce::Graphics& g, juce::Rectangle<float> r, juce::Colour c)
    {
        g.setColour (juce::Colour (0xff3a3a3a));
        g.fillEllipse (r);
        g.setColour (c);
        g.fillEllipse (r.withSizeKeepingCentre (r.getWidth() * 0.32f, r.getHeight() * 0.32f)
                        .translated (0.0f, -r.getHeight() * 0.08f));
        juce::Path shoulders;
        shoulders.addEllipse (r.getX() + r.getWidth() * 0.18f,
                              r.getY() + r.getHeight() * 0.52f,
                              r.getWidth() * 0.64f,
                              r.getHeight() * 0.7f);
        g.reduceClipRegion (r.toNearestInt());
        g.fillPath (shoulders);
    }
}

class IconButton  : public juce::Component,
                    public juce::SettableTooltipClient
{
public:
    enum class Mode { Momentary, Toggle };

    using DrawFn = std::function<void (juce::Graphics&, juce::Rectangle<float>, juce::Colour)>;

    IconButton (DrawFn drawFn, Mode mode = Mode::Momentary)
        : drawer (std::move (drawFn)), buttonMode (mode)
    {
        setRepaintsOnMouseActivity (true);
        setMouseCursor (juce::MouseCursor::PointingHandCursor);
    }

    bool getToggleState() const noexcept { return toggleOn; }

    void setToggleState (bool shouldBeOn, juce::NotificationType notify = juce::dontSendNotification)
    {
        if (toggleOn == shouldBeOn)
            return;

        toggleOn = shouldBeOn;
        repaint();

        if (notify != juce::dontSendNotification && onClick)
            onClick();
    }

    void setDrawFunction (DrawFn fn) { drawer = std::move (fn); repaint(); }
    void setActiveColour (juce::Colour colour) { active = colour; repaint(); }

    /** Greys the icon out and swallows clicks, without removing it from the layout. */
    void setEnabledLook (bool shouldLookEnabled)
    {
        if (looksEnabled == shouldLookEnabled)
            return;

        looksEnabled = shouldLookEnabled;
        setMouseCursor (looksEnabled ? juce::MouseCursor::PointingHandCursor
                                     : juce::MouseCursor::NormalCursor);
        repaint();
    }

    bool getEnabledLook() const noexcept { return looksEnabled; }

    std::function<void()> onClick;

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat();
        const bool hot = looksEnabled && isMouseOverOrDragging();

        if (hot || toggleOn)
        {
            g.setColour ((toggleOn ? active : DawColours::controlHover).withAlpha (toggleOn ? 0.22f : 1.0f));
            g.fillRoundedRectangle (bounds, 4.0f);
        }

        auto colour = ! looksEnabled ? DawColours::textDim.withAlpha (0.45f)
                                     : (toggleOn ? active : (hot ? DawColours::text : DawColours::textMuted));

        if (drawer)
            drawer (g, bounds, colour);
    }

    void mouseUp (const juce::MouseEvent& e) override
    {
        if (! looksEnabled || ! e.mouseWasClicked() || ! contains (e.getPosition()))
            return;

        if (buttonMode == Mode::Toggle)
            toggleOn = ! toggleOn;

        repaint();

        if (onClick)
            onClick();
    }

private:
    DrawFn drawer;
    Mode buttonMode;
    bool toggleOn = false;
    bool looksEnabled = true;
    juce::Colour active { DawColours::accent };
};
