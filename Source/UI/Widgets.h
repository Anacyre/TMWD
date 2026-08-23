#pragma once

#include <JuceHeader.h>
#include "DawColours.h"
#include "Icons.h"

/*  Small reusable controls shared by the DAW panels.  They follow the same flat,
    low-noise drawing style as Icons.h / DawLookAndFeel.
*/

//==============================================================================
/** A compact numeric field that is dragged vertically or double-clicked to type. */
class DragValueLabel  : public juce::Component,
                        public juce::SettableTooltipClient
{
public:
    DragValueLabel()
    {
        label.setJustificationType (juce::Justification::centred);
        label.setInterceptsMouseClicks (false, false);
        addAndMakeVisible (label);

        editor.setInputRestrictions (7, "0123456789.-/");
        editor.setJustification (juce::Justification::centred);
        editor.setBorder ({});
        editor.setIndents (0, 0);
        editor.onReturnKey = [this] { commitEditor(); };
        editor.onFocusLost = [this] { commitEditor(); };
        editor.onEscapeKey = [this] { editor.setVisible (false); label.setVisible (true); };
        addChildComponent (editor);
        setMouseCursor (juce::MouseCursor::UpDownResizeCursor);
    }

    void setValue (double v, juce::NotificationType notify = juce::dontSendNotification)
    {
        value = juce::jlimit (minValue, maxValue, v);
        label.setText (formatValue(), juce::dontSendNotification);

        if (notify != juce::dontSendNotification && onValueChange)
            onValueChange (value);
    }

    double getValue() const noexcept { return value; }

    void setRange (double minVal, double maxVal) { minValue = minVal; maxValue = maxVal; }
    void setDecimals (int d)          { decimals = d; }
    void setSensitivity (double s)    { sensitivity = s; }
    void setSuffix (juce::String s)   { suffix = std::move (s); setValue (value); }
    void setFontHeight (float h)      { label.setFont (juce::FontOptions (h)); }
    void setBoldFont (float h)        { label.setFont (juce::Font (juce::FontOptions (h).withStyleFlags (juce::Font::bold))); }
    void setTextColour (juce::Colour c) { label.setColour (juce::Label::textColourId, c); }
    void setShowBackground (bool s)   { showBackground = s; repaint(); }

    std::function<void (double)> onValueChange;

    void resized() override
    {
        label.setBounds (getLocalBounds());
        editor.setBounds (getLocalBounds());
    }

    void mouseDown (const juce::MouseEvent&) override { dragStart = value; }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        setValue (dragStart - e.getDistanceFromDragStartY() * sensitivity, juce::sendNotification);
    }

    void mouseDoubleClick (const juce::MouseEvent&) override
    {
        label.setVisible (false);
        editor.setText (juce::String (value, decimals), false);
        editor.setVisible (true);
        editor.grabKeyboardFocus();
        editor.selectAll();
    }

    void paint (juce::Graphics& g) override
    {
        if (! showBackground)
            return;

        g.setColour (isMouseOverOrDragging() ? DawColours::controlHover : DawColours::control);
        g.fillRoundedRectangle (getLocalBounds().toFloat(), 3.0f);
    }

private:
    juce::String formatValue() const { return juce::String (value, decimals) + suffix; }

    void commitEditor()
    {
        setValue (editor.getText().getDoubleValue(), juce::sendNotification);
        editor.setVisible (false);
        label.setVisible (true);
    }

    juce::Label label;
    juce::TextEditor editor;
    juce::String suffix;
    double value = 120.0, minValue = 20.0, maxValue = 400.0, dragStart = 120.0, sensitivity = 0.25;
    int decimals = 0;
    bool showBackground = true;
};

//==============================================================================
/** A draggable divider between two panels. */
class SplitterBar  : public juce::Component
{
public:
    enum class Orientation { vertical, horizontal };

    explicit SplitterBar (Orientation o) : orientation (o)
    {
        setMouseCursor (orientation == Orientation::vertical ? juce::MouseCursor::LeftRightResizeCursor
                                                            : juce::MouseCursor::UpDownResizeCursor);
        setRepaintsOnMouseActivity (true);
    }

    /** Called with the accumulated pixel delta since the drag started. */
    std::function<void (int)> onDrag;
    std::function<void()> onDragStart;

    void paint (juce::Graphics& g) override
    {
        const bool hot = isMouseOverOrDragging();
        g.setColour (hot ? DawColours::accent.withAlpha (0.55f) : DawColours::divider);

        if (orientation == Orientation::vertical)
            g.fillRect (getLocalBounds().withSizeKeepingCentre (1, getHeight()));
        else
            g.fillRect (getLocalBounds().withSizeKeepingCentre (getWidth(), 1));
    }

    void mouseDown (const juce::MouseEvent&) override
    {
        if (onDragStart)
            onDragStart();
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        if (onDrag)
            onDrag (orientation == Orientation::vertical ? e.getDistanceFromDragStartX()
                                                         : e.getDistanceFromDragStartY());
    }

private:
    Orientation orientation;
};

//==============================================================================
/** Mock signal meter.  Fed by DawSession, so it already behaves like the real thing. */
class LevelMeter  : public juce::Component
{
public:
    explicit LevelMeter (bool isVertical = true) : vertical (isVertical)
    {
        setInterceptsMouseClicks (false, false);
    }

    void setLevel (float newLevel)
    {
        newLevel = juce::jlimit (0.0f, 1.0f, newLevel);

        if (std::abs (newLevel - level) < 0.004f && newLevel <= peak)
            return;

        level = newLevel;
        peak = juce::jmax (peak * 0.94f, level);
        repaint();
    }

    void setNumChannels (int n) { channels = juce::jlimit (1, 2, n); }

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat();
        g.setColour (DawColours::meterBack);
        g.fillRect (bounds);

        for (int ch = 0; ch < channels; ++ch)
        {
            auto lane = vertical
                          ? bounds.withWidth (bounds.getWidth() / (float) channels)
                                  .withX (bounds.getX() + bounds.getWidth() / (float) channels * (float) ch)
                          : bounds.withHeight (bounds.getHeight() / (float) channels)
                                  .withY (bounds.getY() + bounds.getHeight() / (float) channels * (float) ch);

            lane = vertical ? lane.reduced (0.5f, 0.0f) : lane.reduced (0.0f, 0.5f);

            // A touch of channel offset so the two sides do not look artificially identical.
            const auto chLevel = juce::jlimit (0.0f, 1.0f, level * (ch == 0 ? 1.0f : 0.9f));
            paintBar (g, lane, chLevel);
        }

        if (peak > 0.02f)
        {
            g.setColour (juce::Colours::white.withAlpha (0.6f));

            if (vertical)
            {
                const auto y = bounds.getBottom() - bounds.getHeight() * peak;
                g.fillRect (bounds.getX(), y, bounds.getWidth(), 1.0f);
            }
            else
            {
                const auto x = bounds.getX() + bounds.getWidth() * peak;
                g.fillRect (x, bounds.getY(), 1.0f, bounds.getHeight());
            }
        }
    }

private:
    void paintBar (juce::Graphics& g, juce::Rectangle<float> lane, float amount) const
    {
        if (amount <= 0.001f)
            return;

        auto filled = vertical ? lane.withTop (lane.getBottom() - lane.getHeight() * amount)
                               : lane.withWidth (lane.getWidth() * amount);

        auto colour = amount > 0.92f ? DawColours::meterHigh
                                     : (amount > 0.75f ? DawColours::meterMid : DawColours::meterLow);
        g.setColour (colour);
        g.fillRect (filled);
    }

    bool vertical = true;
    int channels = 2;
    float level = 0.0f, peak = 0.0f;
};

//==============================================================================
/** Flat tab row with an accent underline for the active tab. */
class TabStrip  : public juce::Component
{
public:
    void setTabs (juce::StringArray names, int active = 0)
    {
        tabs = std::move (names);
        activeTab = juce::jlimit (0, juce::jmax (0, tabs.size() - 1), active);
        repaint();
    }

    int getActiveTab() const noexcept { return activeTab; }

    void setActiveTab (int index, juce::NotificationType notify = juce::dontSendNotification)
    {
        index = juce::jlimit (0, juce::jmax (0, tabs.size() - 1), index);

        if (index == activeTab)
            return;

        activeTab = index;
        repaint();

        if (notify != juce::dontSendNotification && onTabChanged)
            onTabChanged (activeTab);
    }

    std::function<void (int)> onTabChanged;

    void paint (juce::Graphics& g) override
    {
        g.setFont (juce::FontOptions (12.0f));

        for (int i = 0; i < tabs.size(); ++i)
        {
            const auto r = getTabBounds (i);
            const bool active = i == activeTab;
            const bool hot = i == hoverTab;

            if (active)
            {
                g.setColour (DawColours::tabActive);
                g.fillRect (r);
                g.setColour (DawColours::accent);
                g.fillRect (r.getX(), r.getBottom() - 2, r.getWidth(), 2);
            }
            else if (hot)
            {
                g.setColour (DawColours::rowHover);
                g.fillRect (r);
            }

            g.setColour (active ? DawColours::text : (hot ? DawColours::textMuted : DawColours::textDim));
            g.drawText (tabs[i], r, juce::Justification::centred, false);
        }
    }

    void mouseMove (const juce::MouseEvent& e) override
    {
        const auto index = indexAt (e.getPosition());

        if (index != hoverTab)
        {
            hoverTab = index;
            repaint();
        }
    }

    void mouseExit (const juce::MouseEvent&) override
    {
        hoverTab = -1;
        repaint();
    }

    void mouseUp (const juce::MouseEvent& e) override
    {
        const auto index = indexAt (e.getPosition());

        if (index >= 0)
            setActiveTab (index, juce::sendNotification);
    }

    int getPreferredWidth() const { return tabs.size() * tabWidth; }

private:
    juce::Rectangle<int> getTabBounds (int index) const
    {
        return { index * tabWidth, 0, tabWidth, getHeight() };
    }

    int indexAt (juce::Point<int> p) const
    {
        const auto index = p.x / tabWidth;
        return juce::isPositiveAndBelow (index, tabs.size()) ? index : -1;
    }

    juce::StringArray tabs;
    int activeTab = 0, hoverTab = -1;
    static constexpr int tabWidth = 104;
};

//==============================================================================
/** Label / value pair used by the inspector.  Optionally clickable. */
class InfoRow  : public juce::Component
{
public:
    InfoRow (juce::String labelText, juce::String valueText = {})
        : name (std::move (labelText)), value (std::move (valueText))
    {
        setRepaintsOnMouseActivity (true);
    }

    void setValue (juce::String newValue)
    {
        if (value == newValue)
            return;

        value = std::move (newValue);
        repaint();
    }

    void setValueColour (juce::Colour c) { valueColour = c; repaint(); }
    void setClickable (bool shouldBeClickable)
    {
        clickable = shouldBeClickable;
        setMouseCursor (clickable ? juce::MouseCursor::PointingHandCursor : juce::MouseCursor::NormalCursor);
    }

    std::function<void()> onClick;

    void paint (juce::Graphics& g) override
    {
        auto r = getLocalBounds();

        if (clickable && isMouseOver())
        {
            g.setColour (DawColours::rowHover);
            g.fillRoundedRectangle (r.toFloat(), 3.0f);
        }

        g.setFont (juce::FontOptions (11.0f));
        g.setColour (DawColours::textDim);
        g.drawText (name, r.removeFromLeft (juce::jmin (86, r.getWidth() / 2)).reduced (4, 0),
                    juce::Justification::centredLeft, false);

        g.setFont (juce::FontOptions (12.0f));
        g.setColour (valueColour);
        g.drawText (value, r.reduced (4, 0), juce::Justification::centredRight, true);
    }

    void mouseUp (const juce::MouseEvent& e) override
    {
        if (clickable && e.mouseWasClicked() && onClick)
            onClick();
    }

private:
    juce::String name, value;
    juce::Colour valueColour { DawColours::text };
    bool clickable = false;
};

//==============================================================================
namespace DawWidgets
{
    /*  Transport keys have to win over widget focus: a focused juce::Button eats space
        and return, so every mock control here stays out of the keyboard focus order and
        key presses bubble up to MainComponent.
    */
    inline void styleMiniToggle (juce::TextButton& b, juce::Colour onColour, juce::String tooltip = {})
    {
        b.setWantsKeyboardFocus (false);
        b.setClickingTogglesState (true);
        b.setColour (juce::TextButton::buttonColourId, DawColours::control);
        b.setColour (juce::TextButton::buttonOnColourId, onColour);
        b.setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
        b.setColour (juce::TextButton::textColourOnId, juce::Colours::white);
        b.setMouseCursor (juce::MouseCursor::PointingHandCursor);

        if (tooltip.isNotEmpty())
            b.setTooltip (tooltip);
    }

    inline void styleFlatButton (juce::TextButton& b)
    {
        b.setWantsKeyboardFocus (false);
        b.setColour (juce::TextButton::buttonColourId, DawColours::control);
        b.setColour (juce::TextButton::buttonOnColourId, DawColours::controlHover);
        b.setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
        b.setColour (juce::TextButton::textColourOnId, DawColours::text);
        b.setMouseCursor (juce::MouseCursor::PointingHandCursor);
    }

    inline void styleMenuButton (juce::TextButton& b)
    {
        b.setWantsKeyboardFocus (false);
        b.setColour (juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
        b.setColour (juce::TextButton::buttonOnColourId, juce::Colours::transparentBlack);
        b.setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
        b.setColour (juce::TextButton::textColourOnId, DawColours::text);
        b.setMouseCursor (juce::MouseCursor::PointingHandCursor);
    }

    inline void setupPanKnob (juce::Slider& s)
    {
        s.setWantsKeyboardFocus (false);
        s.setSliderStyle (juce::Slider::RotaryHorizontalVerticalDrag);
        s.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
        s.setRange (-1.0, 1.0, 0.01);
        s.setRotaryParameters (juce::degreesToRadians (220.0f), juce::degreesToRadians (500.0f), true);
        s.setDoubleClickReturnValue (true, 0.0);
    }

    /** Section caption used by the inspector and mixer. */
    inline void drawCaption (juce::Graphics& g, juce::Rectangle<int> area, const juce::String& text)
    {
        g.setColour (DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (text.toUpperCase(), area, juce::Justification::centredLeft, false);
    }

    inline juce::String makeTrackNumber (int index)
    {
        return index < 10 ? "0" + juce::String (index) : juce::String (index);
    }
}
