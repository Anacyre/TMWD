#include "AutomationView.h"
#include <algorithm>

namespace
{
    constexpr int scaleWidth = 46;
    constexpr int laneRulerHeight = 18;
    constexpr float pointRadius = 4.0f;

    const char* parameterNames[] { "Volume", "Pan", "Expression", "Reverb Send" };
}

//==============================================================================
class AutomationLaneCanvas  : public juce::Component
{
public:
    explicit AutomationLaneCanvas (AutomationView& ownerToUse) : owner (ownerToUse)
    {
        setOpaque (true);
    }

    void paint (juce::Graphics& g) override
    {
        auto& session = owner.session;
        g.fillAll (DawColours::arrangement);

        if (getWidth() <= 1 || getHeight() <= 1)
            return;

        auto* lane = owner.getLane();
        const auto* track = session.getTrack (session.getSelectedTrack());

        if (lane == nullptr || track == nullptr)
        {
            g.setColour (DawColours::textDim);
            g.setFont (juce::FontOptions (13.0f));
            g.drawFittedText ("Select a track to edit its automation",
                              getLocalBounds(), juce::Justification::centred, 1);
            return;
        }

        const auto ppb = session.getPixelsPerBeat();
        const auto beatsPerBar = session.getBeatsPerBar();
        const auto area = g.getClipBounds();

        // Horizontal value guides at 0, 25, 50, 75, 100 %.
        for (int i = 0; i <= 4; ++i)
        {
            const auto y = (float) getHeight() * (float) i / 4.0f;
            g.setColour (i == 2 ? DawColours::gridBar : DawColours::gridBeat);
            g.drawHorizontalLine ((int) juce::jlimit (0.0f, (float) getHeight() - 1.0f, y),
                                  (float) area.getX(), (float) area.getRight());
        }

        const auto firstBeat = juce::jmax (0, (int) std::floor (area.getX() / ppb));
        const auto lastBeat = (int) std::ceil (area.getRight() / ppb);
        const bool showBeats = ppb > 16.0;

        for (int b = firstBeat; b <= lastBeat; ++b)
        {
            const bool bar = (b % beatsPerBar) == 0;

            if (! bar && ! showBeats)
                continue;

            g.setColour (bar ? DawColours::gridBar : DawColours::gridBeat);
            g.drawVerticalLine ((int) ((double) b * ppb), 0.0f, (float) getHeight());
        }

        if (session.isLooping())
        {
            g.setColour (DawColours::loopRegion);
            g.fillRect ((float) (session.getLoopStart() * ppb), 0.0f,
                        (float) ((session.getLoopEnd() - session.getLoopStart()) * ppb), (float) getHeight());
        }

        // Curve plus filled area under it.
        if (! lane->points.empty())
        {
            juce::Path curve, fill;
            bool started = false;

            for (const auto& point : lane->points)
            {
                const auto p = toPixels (point);

                if (! started)
                {
                    curve.startNewSubPath (p);
                    fill.startNewSubPath (p.x, (float) getHeight());
                    fill.lineTo (p);
                    started = true;
                }
                else
                {
                    curve.lineTo (p);
                    fill.lineTo (p);
                }
            }

            const auto last = toPixels (lane->points.back());
            curve.lineTo ((float) getWidth(), last.y);
            fill.lineTo ((float) getWidth(), last.y);
            fill.lineTo ((float) getWidth(), (float) getHeight());
            fill.closeSubPath();

            g.setColour (track->colour.withAlpha (0.16f));
            g.fillPath (fill);
            g.setColour (track->colour.brighter (0.2f));
            g.strokePath (curve, juce::PathStrokeType (1.6f, juce::PathStrokeType::curved,
                                                       juce::PathStrokeType::rounded));

            for (int i = 0; i < (int) lane->points.size(); ++i)
            {
                const auto p = toPixels (lane->points[(size_t) i]);
                const bool hot = i == hoverPoint || i == draggedPoint;
                g.setColour (hot ? DawColours::noteSelected : track->colour.brighter (0.4f));
                g.fillEllipse (p.x - pointRadius, p.y - pointRadius, pointRadius * 2.0f, pointRadius * 2.0f);
                g.setColour (DawColours::arrangement);
                g.fillEllipse (p.x - pointRadius + 1.5f, p.y - pointRadius + 1.5f,
                               (pointRadius - 1.5f) * 2.0f, (pointRadius - 1.5f) * 2.0f);
            }
        }

        const auto playX = (float) (session.getPositionBeats() * ppb);
        g.setColour (DawColours::playhead.withAlpha (0.85f));
        g.drawVerticalLine ((int) playX, 0.0f, (float) getHeight());
    }

    void mouseMove (const juce::MouseEvent& e) override
    {
        const auto index = hitTestPoint (e.position);

        if (index != hoverPoint)
        {
            hoverPoint = index;
            setMouseCursor (index >= 0 ? juce::MouseCursor::UpDownResizeCursor
                                       : juce::MouseCursor::CrosshairCursor);
            repaint();
        }
    }

    void mouseExit (const juce::MouseEvent&) override
    {
        hoverPoint = -1;
        repaint();
    }

    void mouseDown (const juce::MouseEvent& e) override
    {
        auto* lane = owner.getLane();

        if (lane == nullptr)
            return;

        const auto index = hitTestPoint (e.position);

        if (e.mods.isRightButtonDown() || e.mods.isAltDown())
        {
            if (index >= 0 && lane->points.size() > 1)
            {
                lane->points.erase (lane->points.begin() + index);
                owner.session.notify (DawSession::mixerChanged);
            }

            return;
        }

        if (index >= 0)
        {
            draggedPoint = index;
            return;
        }

        AutomationPoint point;
        point.beat = juce::jmax (0.0, owner.session.snapBeat (e.position.x / owner.session.getPixelsPerBeat()));
        point.value = juce::jlimit (0.0f, 1.0f, 1.0f - e.position.y / (float) getHeight());

        const auto insertAt = std::lower_bound (lane->points.begin(), lane->points.end(), point.beat,
                                                [] (const AutomationPoint& p, double beat) { return p.beat < beat; });
        draggedPoint = (int) std::distance (lane->points.begin(), lane->points.insert (insertAt, point));
        owner.session.notify (DawSession::mixerChanged);
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        auto* lane = owner.getLane();

        if (lane == nullptr || ! juce::isPositiveAndBelow (draggedPoint, (int) lane->points.size()))
            return;

        // Points stay in time order, so a dragged point is clamped between its neighbours
        // instead of being re-sorted (which would invalidate draggedPoint).
        const auto lowerBound = draggedPoint > 0 ? lane->points[(size_t) draggedPoint - 1].beat : 0.0;
        const auto upperBound = draggedPoint < (int) lane->points.size() - 1
                                    ? lane->points[(size_t) draggedPoint + 1].beat
                                    : std::numeric_limits<double>::max();

        auto& point = lane->points[(size_t) draggedPoint];
        point.beat = juce::jlimit (lowerBound, upperBound,
                                   owner.session.snapBeat (e.position.x / owner.session.getPixelsPerBeat()));
        point.value = juce::jlimit (0.0f, 1.0f, 1.0f - e.position.y / (float) getHeight());

        owner.session.notify (DawSession::mixerChanged);
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        draggedPoint = -1;
        repaint();
    }

    void mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override
    {
        if (e.mods.isCtrlDown() || e.mods.isCommandDown())
        {
            owner.session.setPixelsPerBeat (owner.session.getPixelsPerBeat() * (wheel.deltaY > 0 ? 1.15 : 0.87));
            return;
        }

        Component::mouseWheelMove (e, wheel);
    }

private:
    juce::Point<float> toPixels (const AutomationPoint& point) const
    {
        return { (float) (point.beat * owner.session.getPixelsPerBeat()),
                 (1.0f - point.value) * (float) getHeight() };
    }

    int hitTestPoint (juce::Point<float> p) const
    {
        const auto* lane = owner.getLane();

        if (lane == nullptr)
            return -1;

        for (int i = 0; i < (int) lane->points.size(); ++i)
            if (toPixels (lane->points[(size_t) i]).getDistanceFrom (p) <= pointRadius + 3.0f)
                return i;

        return -1;
    }

    AutomationView& owner;
    int hoverPoint = -1, draggedPoint = -1;
};

//==============================================================================
AutomationView::AutomationView (DawSession& sessionToUse)
    : session (sessionToUse)
{
    canvas = std::make_unique<AutomationLaneCanvas> (*this);

    trackLabel.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (juce::Font::bold)));
    trackLabel.setColour (juce::Label::textColourId, DawColours::text);
    trackLabel.setJustificationType (juce::Justification::centredLeft);
    trackLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (trackLabel);

    hintLabel.setText ("Click to add a point   -   drag to move   -   right-click to remove",
                       juce::dontSendNotification);
    hintLabel.setFont (juce::FontOptions (11.0f));
    hintLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    hintLabel.setJustificationType (juce::Justification::centredRight);
    hintLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (hintLabel);

    DawWidgets::styleFlatButton (parameterButton);
    parameterButton.setTooltip ("Automated parameter");
    parameterButton.onClick = [this]
    {
        auto* lane = getLane();

        if (lane == nullptr)
            return;

        juce::PopupMenu m;

        for (int i = 0; i < (int) std::size (parameterNames); ++i)
            m.addItem (i + 1, parameterNames[i], true, lane->parameterName == parameterNames[i]);

        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&parameterButton), [this] (int r)
        {
            if (r >= 1 && r <= (int) std::size (parameterNames))
                if (auto* l = getLane())
                {
                    l->parameterName = parameterNames[r - 1];
                    session.notify (DawSession::mixerChanged);
                }
        });
    };
    addAndMakeVisible (parameterButton);

    clearButton.setTooltip ("Clear automation");
    clearButton.onClick = [this]
    {
        if (auto* lane = getLane())
        {
            lane->points.clear();
            session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (clearButton);

    viewport.onMoved = [this]
    {
        if (isShowing())
            repaint (rulerBounds);
    };
    viewport.setScrollBarsShown (false, true);
    viewport.setViewedComponent (canvas.get(), false);
    addAndMakeVisible (viewport);

    refreshToolbar();
    session.addListener (this);
}

AutomationView::~AutomationView()
{
    session.removeListener (this);
    viewport.setViewedComponent (nullptr, false);
    canvas.reset();
}

AutomationLane* AutomationView::getLane()
{
    if (auto* track = session.getTrack (session.getSelectedTrack()))
        return &track->automation;

    return nullptr;
}

void AutomationView::paint (juce::Graphics& g)
{
    if (getWidth() <= 0 || getHeight() <= 0)
        return;

    g.fillAll (DawColours::panel);

    auto toolbar = getLocalBounds().removeFromTop (26);
    g.setColour (DawColours::panelRaised);
    g.fillRect (toolbar);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (toolbar.getBottom() - 1, 0.0f, (float) getWidth());

    // Bar ruler above the lane, offset by the horizontal scroll.
    g.setColour (DawColours::ruler);
    g.fillRect (rulerBounds.withX (0).withWidth (getWidth()));
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (rulerBounds.getBottom() - 1, 0.0f, (float) getWidth());
    drawRuler (g);

    // Value scale down the left edge.
    g.setColour (DawColours::panelSunken);
    g.fillRect (scaleBounds);
    g.setColour (DawColours::divider);
    g.drawVerticalLine (scaleBounds.getRight() - 1, (float) scaleBounds.getY(), (float) scaleBounds.getBottom());

    const auto* lane = session.getTrack (session.getSelectedTrack()) != nullptr
                           ? &session.getTrack (session.getSelectedTrack())->automation
                           : nullptr;
    const bool isPan = lane != nullptr && lane->parameterName == "Pan";

    g.setFont (juce::FontOptions (9.5f));
    g.setColour (DawColours::textDim);

    for (int i = 0; i <= 4; ++i)
    {
        const auto proportion = 1.0f - (float) i / 4.0f;
        const auto y = scaleBounds.getY() + (int) ((float) scaleBounds.getHeight() * (float) i / 4.0f);
        juce::String text;

        if (isPan)
            text = DawUnits::formatPan (proportion * 2.0f - 1.0f);
        else
            text = DawUnits::formatDb (DawUnits::faderToDb (proportion));

        g.drawText (text, scaleBounds.getX(), juce::jlimit (scaleBounds.getY(),
                                                            scaleBounds.getBottom() - 12, y - 6),
                    scaleBounds.getWidth() - 5, 12, juce::Justification::centredRight, false);
    }
}

void AutomationView::drawRuler (juce::Graphics& g)
{
    juce::Graphics::ScopedSaveState state (g);
    g.reduceClipRegion (rulerBounds);

    const auto scrollX = viewport.getViewPositionX();
    const auto barWidth = session.getPixelsPerBeat() * session.getBeatsPerBar();
    const auto labelStep = juce::jmax (1, (int) std::ceil (44.0 / juce::jmax (1.0, barWidth)));
    const auto firstBar = juce::jmax (0, (int) std::floor (scrollX / barWidth));
    const auto lastBar = firstBar + (int) std::ceil (rulerBounds.getWidth() / barWidth) + 1;

    g.setFont (juce::FontOptions (10.5f));

    for (int bar = firstBar; bar <= lastBar; ++bar)
    {
        const auto x = (float) ((double) bar * barWidth - scrollX) + (float) rulerBounds.getX();
        const bool labelled = (bar % labelStep) == 0;

        g.setColour (labelled ? juce::Colour (0xff555555) : juce::Colour (0xff383838));
        g.drawVerticalLine ((int) x, (float) rulerBounds.getY() + (labelled ? 4.0f : 12.0f),
                            (float) rulerBounds.getBottom() - 1.0f);

        if (labelled)
        {
            g.setColour (DawColours::textMuted);
            g.drawText (juce::String (bar + 1), (int) x + 4, rulerBounds.getY(),
                        40, rulerBounds.getHeight() - 1, juce::Justification::centredLeft, false);
        }
    }

    const auto playX = (float) (session.getPositionBeats() * session.getPixelsPerBeat() - scrollX)
                       + (float) rulerBounds.getX();
    g.setColour (DawColours::playhead);
    g.drawVerticalLine ((int) playX, (float) rulerBounds.getY(), (float) rulerBounds.getBottom());
}

void AutomationView::resized()
{
    if (getWidth() <= 0 || getHeight() <= 0)
        return;

    auto r = getLocalBounds();

    auto toolbar = r.removeFromTop (26).reduced (8, 3);
    trackLabel.setBounds (toolbar.removeFromLeft (juce::jmin (180, toolbar.getWidth() / 2)));
    clearButton.setBounds (toolbar.removeFromRight (22).withSizeKeepingCentre (20, 20));
    toolbar.removeFromRight (6);
    parameterButton.setBounds (toolbar.removeFromRight (100).withSizeKeepingCentre (100, 18));
    toolbar.removeFromRight (10);
    hintLabel.setBounds (toolbar);

    auto ruler = r.removeFromTop (laneRulerHeight);
    ruler.removeFromLeft (scaleWidth);
    rulerBounds = ruler;

    scaleBounds = r.removeFromLeft (scaleWidth);
    viewport.setBounds (r);
    updateContentSize();
}

void AutomationView::updateContentSize()
{
    if (canvas == nullptr)
        return;

    const auto viewW = viewport.getMaximumVisibleWidth();
    const auto viewH = viewport.getMaximumVisibleHeight();

    if (viewW <= 0 || viewH <= 0)
        return;

    double maxBeat = 64.0;

    for (const auto& clip : session.getClips())
        maxBeat = juce::jmax (maxBeat, clip.getEndBeat() + 8.0);

    if (auto* lane = getLane())
        for (const auto& point : lane->points)
            maxBeat = juce::jmax (maxBeat, point.beat + 8.0);

    const auto ppb = juce::jlimit (4.0, 400.0, session.getPixelsPerBeat());
    const auto width = juce::jlimit (1, 32768, juce::jmax (viewW, (int) std::ceil (maxBeat * ppb)));
    const auto height = juce::jlimit (1, 32768, viewH);

    if (canvas->getWidth() != width || canvas->getHeight() != height)
        canvas->setSize (width, height);
}

void AutomationView::refreshToolbar()
{
    const auto* track = session.getTrack (session.getSelectedTrack());

    trackLabel.setText (track != nullptr ? track->name : juce::String ("No track selected"),
                        juce::dontSendNotification);
    parameterButton.setButtonText (track != nullptr ? track->automation.parameterName : juce::String ("-"));
}

void AutomationView::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::selectionChanged | DawSession::tracksChanged
                        | DawSession::mixerChanged | DawSession::clipsChanged
                        | DawSession::viewChanged | DawSession::projectChanged)) != 0)
    {
        refreshToolbar();
        updateContentSize();

        if (canvas != nullptr)
            canvas->repaint();

        repaint();
        return;
    }

    if ((changeFlags & (DawSession::positionChanged | DawSession::transportChanged)) != 0)
    {
        if (canvas != nullptr)
            canvas->repaint();

        if (isShowing())
            repaint (rulerBounds);
    }
}
