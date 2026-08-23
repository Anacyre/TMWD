#include "ArrangementView.h"
#include <algorithm>

namespace
{
    constexpr int loopLaneHeight = 7;
    constexpr float clipEdgeGrab = 6.0f;

    bool fileIsSupported (const juce::File& file)
    {
        static const char* exts[] = { ".mp3", ".mp4", ".wav", ".aac", ".ogg", ".flac",
                                      ".mid", ".midi", ".aif", ".aiff", ".m4a" };
        const auto ext = file.getFileExtension().toLowerCase();

        for (auto* e : exts)
            if (ext == e)
                return true;

        return false;
    }
}

//==============================================================================
class ArrangementCanvas  : public juce::Component
{
public:
    explicit ArrangementCanvas (ArrangementView& ownerToUse)
        : owner (ownerToUse)
    {
        setOpaque (true);
    }

    void paint (juce::Graphics& g) override
    {
        auto& session = owner.session;
        const auto clip = g.getClipBounds();
        g.fillAll (DawColours::arrangement);

        const auto ppb = session.getPixelsPerBeat();
        const auto beatsPerBar = session.getBeatsPerBar();
        const auto rowHeight = session.getTrackHeight();
        const auto numTracks = session.getNumTracks();
        const auto height = (float) getHeight();

        // Lane backgrounds: the master row and the selected row are tinted.
        for (int t = 0; t < numTracks; ++t)
        {
            const auto y = t * rowHeight;

            if (y + rowHeight < clip.getY() || y > clip.getBottom())
                continue;

            if (t == session.getSelectedTrack())
                g.setColour (DawColours::panel.withAlpha (0.55f));
            else if (t == 0)
                g.setColour (DawColours::panelSunken);
            else
                g.setColour ((t % 2) == 0 ? juce::Colour (0xff121212) : DawColours::arrangement);

            g.fillRect (0, y, getWidth(), rowHeight);
        }

        if (session.isLooping())
        {
            g.setColour (DawColours::loopRegion);
            g.fillRect ((float) (session.getLoopStart() * ppb), 0.0f,
                        (float) ((session.getLoopEnd() - session.getLoopStart()) * ppb), height);
        }

        // Vertical grid.  Beat lines only appear once there is room for them.
        const auto firstBeat = juce::jmax (0, (int) std::floor (clip.getX() / ppb));
        const auto lastBeat = (int) std::ceil (clip.getRight() / ppb);
        const bool showBeats = ppb > 13.0;

        for (int b = firstBeat; b <= lastBeat; ++b)
        {
            const bool bar = (b % beatsPerBar) == 0;

            if (! bar && ! showBeats)
                continue;

            g.setColour (bar ? DawColours::gridBar : DawColours::gridBeat);
            g.drawVerticalLine ((int) ((double) b * ppb), (float) clip.getY(), (float) clip.getBottom());
        }

        g.setColour (DawColours::laneLine);

        for (int t = 0; t <= numTracks; ++t)
            g.drawHorizontalLine (t * rowHeight, (float) clip.getX(), (float) clip.getRight());

        // Clips
        const auto& clips = session.getClips();

        for (int i = 0; i < (int) clips.size(); ++i)
        {
            const auto& c = clips[(size_t) i];
            auto r = getClipBounds (c);

            if (! r.toNearestInt().intersects (clip))
                continue;

            paintClip (g, c, r, i == session.getSelectedClip());
        }

        if (clips.empty())
        {
            auto visible = getLocalBounds();

            if (auto* vp = findParentComponentOfClass<juce::Viewport>())
                visible = vp->getViewArea();

            g.setColour (DawColours::textDim);
            g.setFont (juce::FontOptions (15.0f));
            g.drawFittedText ("Double-click a lane to create a MIDI clip",
                              visible.removeFromTop (visible.getHeight() / 2 + 10),
                              juce::Justification::centredBottom, 1);
            g.setFont (juce::FontOptions (12.5f));
            g.drawFittedText ("or drop audio / MIDI files here  -  WAV, MP3, FLAC, AIFF, MID",
                              visible, juce::Justification::centredTop, 1);
        }

        if (! rubberBand.isEmpty())
        {
            g.setColour (DawColours::selectionFill);
            g.fillRect (rubberBand);
            g.setColour (DawColours::selectionEdge.withAlpha (0.7f));
            g.drawRect (rubberBand, 1);
        }

        if (owner.draggingFiles && owner.dropPos.y >= 0)
        {
            const auto beat = session.snapBeat (xToBeat ((float) owner.dropPos.x));
            const auto track = yToTrack ((float) owner.dropPos.y);
            g.setColour (DawColours::dropHighlight);
            g.fillRoundedRectangle ((float) (beat * ppb), (float) (track * rowHeight + 4),
                                    (float) (4.0 * ppb), (float) rowHeight - 8.0f, 3.0f);
        }

        const auto playX = (float) (session.getPositionBeats() * ppb);
        g.setColour (DawColours::playhead);
        g.drawVerticalLine ((int) playX, (float) clip.getY(), (float) clip.getBottom());
    }

    /** Repaints only the two playhead columns instead of the whole canvas. */
    void playheadMoved()
    {
        const auto x = (float) (owner.session.getPositionBeats() * owner.session.getPixelsPerBeat());

        if (std::abs (x - lastPlayheadX) < 0.5f)
            return;

        repaint (juce::Rectangle<int> ((int) lastPlayheadX - 2, 0, 5, getHeight()));
        repaint (juce::Rectangle<int> ((int) x - 2, 0, 5, getHeight()));
        lastPlayheadX = x;
    }

    //==============================================================================
    void mouseMove (const juce::MouseEvent& e) override
    {
        const auto index = hitTestClip (e.position);
        const auto edge = index >= 0 ? clipEdgeAt (index, e.position) : Edge::none;
        setMouseCursor (edge != Edge::none ? juce::MouseCursor::LeftRightResizeCursor
                                           : (index >= 0 ? juce::MouseCursor::NormalCursor
                                                         : juce::MouseCursor::IBeamCursor));
    }

    void mouseDown (const juce::MouseEvent& e) override
    {
        auto& session = owner.session;
        const auto index = hitTestClip (e.position);
        const auto track = yToTrack (e.position.y);

        if (track >= 0)
            session.setSelectedTrack (track);

        if (index < 0)
        {
            clearClipSelection();
            session.setSelectedClip (-1);
            rubberBandOrigin = e.position.toInt();
            rubberBand = {};
            gesture = Gesture::rubberBand;
            repaint();
            return;
        }

        if (e.mods.isRightButtonDown())
        {
            showClipMenu (index);
            return;
        }

        auto& clips = session.getClips();

        if (! e.mods.isShiftDown() && ! clips[(size_t) index].selected)
            clearClipSelection();

        clips[(size_t) index].selected = true;
        session.setSelectedClip (index);

        dragEdge = clipEdgeAt (index, e.position);
        gesture = dragEdge == Edge::none ? Gesture::moveClips : Gesture::resizeClip;
        dragOriginals.clear();

        for (int i = 0; i < (int) clips.size(); ++i)
            if (clips[(size_t) i].selected)
                dragOriginals.push_back ({ i, clips[(size_t) i].startBeat,
                                           clips[(size_t) i].lengthBeats, clips[(size_t) i].trackIndex });

        dragAnchorTrack = track;
        repaint();
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        auto& session = owner.session;

        if (gesture == Gesture::rubberBand)
        {
            rubberBand = juce::Rectangle<int>::leftTopRightBottom (
                juce::jmin (rubberBandOrigin.x, e.x), juce::jmin (rubberBandOrigin.y, e.y),
                juce::jmax (rubberBandOrigin.x, e.x), juce::jmax (rubberBandOrigin.y, e.y));

            auto& clips = session.getClips();
            int primary = -1;

            for (int i = 0; i < (int) clips.size(); ++i)
            {
                const bool hit = getClipBounds (clips[(size_t) i]).toNearestInt().intersects (rubberBand);
                clips[(size_t) i].selected = hit;

                if (hit && primary < 0)
                    primary = i;
            }

            session.setSelectedClip (primary);
            repaint();
            return;
        }

        if (dragOriginals.empty())
            return;

        auto& clips = session.getClips();
        const auto beatDelta = e.getDistanceFromDragStartX() / session.getPixelsPerBeat();
        const auto trackDelta = yToTrack (e.position.y) - dragAnchorTrack;

        if (gesture == Gesture::resizeClip)
        {
            const auto& original = dragOriginals.front();
            auto& c = clips[(size_t) original.index];

            if (dragEdge == Edge::right)
            {
                c.lengthBeats = juce::jmax (0.25, session.snapBeat (original.startBeat + original.lengthBeats + beatDelta)
                                                      - c.startBeat);
            }
            else
            {
                const auto newStart = juce::jlimit (0.0, original.startBeat + original.lengthBeats - 0.25,
                                                    session.snapBeat (original.startBeat + beatDelta));
                c.lengthBeats = original.startBeat + original.lengthBeats - newStart;
                c.startBeat = newStart;
            }
        }
        else
        {
            for (const auto& original : dragOriginals)
            {
                auto& c = clips[(size_t) original.index];
                c.startBeat = juce::jmax (0.0, session.snapBeat (original.startBeat + beatDelta));

                const auto target = original.trackIndex + trackDelta;

                if (target >= 1 && target < session.getNumTracks())
                    c.trackIndex = target;
            }
        }

        session.notify (DawSession::clipsChanged);
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        if (gesture == Gesture::rubberBand && ! rubberBand.isEmpty())
            repaint();

        gesture = Gesture::none;
        dragEdge = Edge::none;
        dragOriginals.clear();
        rubberBand = {};
        repaint();
    }

    void mouseDoubleClick (const juce::MouseEvent& e) override
    {
        auto& session = owner.session;
        const auto index = hitTestClip (e.position);

        if (index >= 0)
        {
            session.setSelectedClip (index);
            session.setEditorVisible (true);
            session.setEditorTab (DawSession::EditorTab::pianoRoll);
            return;
        }

        const auto track = yToTrack (e.position.y);

        if (track >= 1)
            session.addClip (track, session.snapBeat (xToBeat (e.position.x)), 8.0);
    }

private:
    enum class Gesture { none, moveClips, resizeClip, rubberBand };
    enum class Edge { none, left, right };

    struct DragOriginal { int index; double startBeat; double lengthBeats; int trackIndex; };

    void paintClip (juce::Graphics& g, const ClipData& c, juce::Rectangle<float> r, bool primary) const
    {
        const bool audible = owner.session.isTrackAudible (c.trackIndex);
        const auto base = c.colour.withMultipliedSaturation (audible ? 1.0f : 0.35f);

        g.setColour (base.withAlpha (c.selected ? 0.9f : 0.7f));
        g.fillRoundedRectangle (r, 3.0f);

        // A slightly darker body so the title strip reads as a header.
        auto body = r.withTrimmedTop (14.0f);

        if (body.getHeight() > 4.0f)
        {
            g.setColour (juce::Colours::black.withAlpha (0.3f));
            g.fillRect (body.reduced (1.0f, 0.0f).withTrimmedBottom (1.0f));
            paintNotePreview (g, c, body.reduced (2.0f, 2.0f));
        }

        g.setColour (primary ? juce::Colours::white
                             : (c.selected ? juce::Colours::white.withAlpha (0.65f)
                                           : juce::Colours::white.withAlpha (0.14f)));
        g.drawRoundedRectangle (r.reduced (0.5f), 3.0f, primary ? 1.6f : 1.0f);

        if (r.getWidth() > 26.0f)
        {
            g.setColour (juce::Colours::white.withAlpha (audible ? 0.92f : 0.5f));
            g.setFont (juce::FontOptions (10.5f));
            g.drawText (c.name, r.withHeight (14.0f).reduced (5.0f, 1.0f),
                        juce::Justification::centredLeft, true);
        }
    }

    void paintNotePreview (juce::Graphics& g, const ClipData& c, juce::Rectangle<float> area) const
    {
        if (! c.midi || c.notes.empty() || area.getHeight() < 6.0f || area.getWidth() < 6.0f)
        {
            if (! c.midi && area.getHeight() > 6.0f)
            {
                // Placeholder waveform for audio clips.
                g.setColour (juce::Colours::white.withAlpha (0.35f));
                const auto mid = area.getCentreY();

                for (float x = area.getX(); x < area.getRight(); x += 2.0f)
                {
                    const auto amp = area.getHeight() * 0.4f
                                     * std::abs (std::sin (x * 0.09f) * std::cos (x * 0.021f));
                    g.fillRect (x, mid - amp, 1.0f, amp * 2.0f);
                }
            }

            return;
        }

        int lowest = 127, highest = 0;

        for (const auto& n : c.notes)
        {
            lowest = juce::jmin (lowest, n.pitch);
            highest = juce::jmax (highest, n.pitch);
        }

        const auto span = (float) juce::jmax (6, highest - lowest);
        const auto noteHeight = juce::jmax (1.0f, juce::jmin (3.0f, area.getHeight() / span));
        const auto scaleX = area.getWidth() / (float) juce::jmax (0.25, c.lengthBeats);

        g.setColour (juce::Colours::white.withAlpha (0.6f));

        for (const auto& n : c.notes)
        {
            const auto x = area.getX() + (float) n.startBeat * scaleX;
            const auto w = juce::jmax (1.0f, (float) n.lengthBeats * scaleX);
            const auto y = area.getBottom() - noteHeight
                           - ((float) (n.pitch - lowest) / span) * (area.getHeight() - noteHeight);
            g.fillRect (x, y, juce::jmin (w, area.getRight() - x), noteHeight);
        }
    }

    void showClipMenu (int index)
    {
        auto& session = owner.session;
        juce::PopupMenu m;
        m.addItem (1, "Open in Piano Roll");
        m.addSeparator();
        m.addItem (2, "Duplicate");
        m.addItem (3, "Delete");
        m.addSeparator();
        m.addItem (4, "Set Loop to Clip");

        m.showMenuAsync (juce::PopupMenu::Options().withParentComponent (getTopLevelComponent()),
                         [this, &session, index] (int r)
        {
            const auto* c = session.getClip (index);

            if (c == nullptr)
                return;

            switch (r)
            {
                case 1:
                    session.setSelectedClip (index);
                    session.setEditorVisible (true);
                    session.setEditorTab (DawSession::EditorTab::pianoRoll);
                    break;
                case 2: session.duplicateClip (index); break;
                case 3: session.removeClip (index); break;
                case 4: session.setLoopRange (c->startBeat, c->getEndBeat()); break;
                default: break;
            }
        });
    }

    void clearClipSelection()
    {
        for (auto& c : owner.session.getClips())
            c.selected = false;
    }

    double xToBeat (float x) const
    {
        return juce::jmax (0.0, (double) x / owner.session.getPixelsPerBeat());
    }

    int yToTrack (float y) const
    {
        return juce::jlimit (0, juce::jmax (0, owner.session.getNumTracks() - 1),
                             (int) (y / (float) owner.session.getTrackHeight()));
    }

    juce::Rectangle<float> getClipBounds (const ClipData& c) const
    {
        const auto ppb = owner.session.getPixelsPerBeat();
        const auto rowHeight = owner.session.getTrackHeight();
        return { (float) (c.startBeat * ppb),
                 (float) (c.trackIndex * rowHeight + 3),
                 juce::jmax (3.0f, (float) (c.lengthBeats * ppb)),
                 (float) rowHeight - 7.0f };
    }

    int hitTestClip (juce::Point<float> p) const
    {
        const auto& clips = owner.session.getClips();

        for (int i = (int) clips.size(); --i >= 0;)
            if (getClipBounds (clips[(size_t) i]).contains (p))
                return i;

        return -1;
    }

    Edge clipEdgeAt (int index, juce::Point<float> p) const
    {
        const auto* c = owner.session.getClip (index);

        if (c == nullptr)
            return Edge::none;

        const auto r = getClipBounds (*c);

        if (r.getWidth() < clipEdgeGrab * 3.0f)
            return Edge::none;

        if (p.x <= r.getX() + clipEdgeGrab)     return Edge::left;
        if (p.x >= r.getRight() - clipEdgeGrab) return Edge::right;

        return Edge::none;
    }

    ArrangementView& owner;
    Gesture gesture = Gesture::none;
    Edge dragEdge = Edge::none;
    std::vector<DragOriginal> dragOriginals;
    juce::Point<int> rubberBandOrigin;
    juce::Rectangle<int> rubberBand;
    int dragAnchorTrack = 0;
    float lastPlayheadX = 0.0f;
};

//==============================================================================
ArrangementView::ArrangementView (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);
    canvas = std::make_unique<ArrangementCanvas> (*this);

    snapButton.setTooltip ("Snap to grid");
    snapButton.setActiveColour (DawColours::accent);
    snapButton.onClick = [this] { session.toggleSnap(); };
    snapButton.setToggleState (session.isSnapOn());
    addAndMakeVisible (snapButton);

    zoomInButton.setTooltip ("Zoom in  (Ctrl + wheel)");
    zoomInButton.onClick = [this] { session.setPixelsPerBeat (session.getPixelsPerBeat() * 1.3); };
    addAndMakeVisible (zoomInButton);

    zoomOutButton.setTooltip ("Zoom out  (Ctrl + wheel)");
    zoomOutButton.onClick = [this] { session.setPixelsPerBeat (session.getPixelsPerBeat() / 1.3); };
    addAndMakeVisible (zoomOutButton);

    viewport.setViewedComponent (canvas.get(), false);
    viewport.setScrollBarsShown (true, true);
    viewport.onMoved = [this] (int y)
    {
        if (! syncing && onVerticalScroll)
            onVerticalScroll (y);

        repaint (rulerBounds);
    };
    addAndMakeVisible (viewport);
    updateContentSize();
}

ArrangementView::~ArrangementView()
{
    session.removeListener (this);
}

int ArrangementView::getBarLabelStep() const
{
    const auto barWidth = session.getPixelsPerBeat() * session.getBeatsPerBar();
    return juce::jmax (1, (int) std::ceil (48.0 / juce::jmax (1.0, barWidth)));
}

void ArrangementView::paint (juce::Graphics& g)
{
    auto ruler = rulerBounds;
    g.setColour (DawColours::ruler);
    g.fillRect (ruler);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (ruler.getBottom() - 1, 0.0f, (float) getWidth());

    const auto ppb = session.getPixelsPerBeat();
    const auto beatsPerBar = session.getBeatsPerBar();
    const auto scrollX = viewport.getViewPositionX();
    const auto labelStep = getBarLabelStep();
    const auto firstBar = (int) std::floor (scrollX / (ppb * beatsPerBar));
    const auto lastBar = (int) std::ceil ((scrollX + getWidth()) / (ppb * beatsPerBar));

    g.setFont (juce::FontOptions (11.0f));

    for (int bar = firstBar; bar <= lastBar; ++bar)
    {
        if (bar < 0)
            continue;

        const auto x = (float) ((double) bar * beatsPerBar * ppb - scrollX);
        const bool labelled = (bar % labelStep) == 0;

        g.setColour (labelled ? juce::Colour (0xff585858) : juce::Colour (0xff3a3a3a));
        g.drawVerticalLine ((int) x, (float) ruler.getY() + (labelled ? 10.0f : 20.0f),
                            (float) ruler.getBottom() - 1.0f);

        if (labelled)
        {
            g.setColour (DawColours::textMuted);
            g.drawText (juce::String (bar + 1), (int) x + 5, ruler.getY() + loopLaneHeight,
                        44, ruler.getHeight() - loopLaneHeight - 2,
                        juce::Justification::centredLeft, false);
        }
    }

    // Loop lane along the top edge of the ruler.
    auto loopLane = ruler.removeFromTop (loopLaneHeight);
    g.setColour (DawColours::panelSunken);
    g.fillRect (loopLane);

    if (session.isLooping())
    {
        const auto x1 = (float) (session.getLoopStart() * ppb - scrollX);
        const auto x2 = (float) (session.getLoopEnd() * ppb - scrollX);
        g.setColour (DawColours::accent);
        g.fillRect (x1, (float) loopLane.getY() + 1.0f, juce::jmax (2.0f, x2 - x1),
                    (float) loopLane.getHeight() - 2.0f);
    }

    const auto playX = (float) (session.getPositionBeats() * ppb - scrollX);
    g.setColour (DawColours::playhead);
    g.drawVerticalLine ((int) playX, (float) rulerBounds.getY(), (float) rulerBounds.getBottom());
    juce::Path marker;
    marker.addTriangle (playX - 4.0f, (float) rulerBounds.getBottom() - 6.0f,
                        playX + 4.0f, (float) rulerBounds.getBottom() - 6.0f,
                        playX, (float) rulerBounds.getBottom());
    g.fillPath (marker);
    lastRulerPlayheadX = playX;
}

void ArrangementView::resized()
{
    auto r = getLocalBounds();
    rulerBounds = r.removeFromTop (DawSession::rulerHeight);

    auto tools = rulerBounds;
    zoomInButton.setBounds (tools.removeFromRight (24).withSizeKeepingCentre (22, 22));
    zoomOutButton.setBounds (tools.removeFromRight (24).withSizeKeepingCentre (22, 22));
    snapButton.setBounds (tools.removeFromRight (26).withSizeKeepingCentre (22, 22));

    viewport.setBounds (r);
    updateContentSize();
}

void ArrangementView::setViewY (int y)
{
    syncing = true;
    viewport.setViewPosition (viewport.getViewPositionX(), y);
    syncing = false;
}

int ArrangementView::getViewY() const
{
    return viewport.getViewPositionY();
}

void ArrangementView::scrollPlayheadIntoView()
{
    const auto x = (int) (session.getPositionBeats() * session.getPixelsPerBeat());
    const auto visible = viewport.getViewArea();

    if (x < visible.getX() || x > visible.getRight() - 40)
        viewport.setViewPosition (juce::jmax (0, x - visible.getWidth() / 4), viewport.getViewPositionY());
}

//==============================================================================
void ArrangementView::handleRulerDrag (const juce::MouseEvent& e, bool isStartOfDrag)
{
    const auto beat = session.snapBeat ((e.x + viewport.getViewPositionX()) / session.getPixelsPerBeat());

    if (isStartOfDrag)
    {
        draggingLoop = e.getMouseDownY() < rulerBounds.getY() + loopLaneHeight;
        loopAnchorBeat = beat;
    }

    if (draggingLoop)
    {
        if (std::abs (beat - loopAnchorBeat) > 0.001)
        {
            session.setLoopRange (juce::jmin (loopAnchorBeat, beat), juce::jmax (loopAnchorBeat, beat));

            if (! session.isLooping())
                session.toggleLoop();
        }
    }
    else
    {
        session.setPositionBeats (beat);
    }
}

void ArrangementView::mouseDown (const juce::MouseEvent& e)
{
    if (e.y < rulerBounds.getBottom())
        handleRulerDrag (e, true);
}

void ArrangementView::mouseDrag (const juce::MouseEvent& e)
{
    if (e.getMouseDownY() < rulerBounds.getBottom())
        handleRulerDrag (e, false);
}

void ArrangementView::mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel)
{
    if (e.mods.isCtrlDown() || e.mods.isCommandDown())
    {
        const auto anchorX = juce::jmax (0, e.x);
        const auto beatAtMouse = (anchorX + viewport.getViewPositionX()) / session.getPixelsPerBeat();
        session.setPixelsPerBeat (session.getPixelsPerBeat() * (wheel.deltaY > 0 ? 1.15 : 0.87));
        updateContentSize();
        viewport.setViewPosition (juce::jmax (0, (int) (beatAtMouse * session.getPixelsPerBeat()) - anchorX),
                                  viewport.getViewPositionY());
        return;
    }

    if (e.mods.isShiftDown())
    {
        session.setTrackHeight (session.getTrackHeight() + (wheel.deltaY > 0 ? 6 : -6));
        return;
    }

    Component::mouseWheelMove (e, wheel);
}

//==============================================================================
void ArrangementView::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::viewChanged) != 0)
        snapButton.setToggleState (session.isSnapOn());

    const auto structural = DawSession::tracksChanged | DawSession::clipsChanged
                            | DawSession::notesChanged | DawSession::selectionChanged
                            | DawSession::mixerChanged | DawSession::viewChanged
                            | DawSession::projectChanged;

    if ((changeFlags & structural) != 0)
    {
        updateContentSize();
        canvas->repaint();
        repaint (rulerBounds);

        if ((changeFlags & (DawSession::viewChanged | DawSession::projectChanged)) != 0)
            repaint();

        return;
    }

    if ((changeFlags & (DawSession::positionChanged | DawSession::transportChanged)) != 0)
    {
        canvas->playheadMoved();
        repaint (rulerBounds);

        if (session.isPlaying())
            scrollPlayheadIntoView();
    }
}

void ArrangementView::updateContentSize()
{
    double maxBeat = 64.0;
    maxBeat = juce::jmax (maxBeat, session.getPositionBeats() + 16.0, session.getLoopEnd() + 8.0);

    for (const auto& clip : session.getClips())
        maxBeat = juce::jmax (maxBeat, clip.getEndBeat() + 8.0);

    const auto w = juce::jmax (viewport.getMaximumVisibleWidth(),
                               (int) std::ceil (maxBeat * session.getPixelsPerBeat()));
    const auto h = juce::jmax (viewport.getMaximumVisibleHeight(),
                               session.getNumTracks() * session.getTrackHeight());
    canvas->setSize (w, h);
}

juce::Point<int> ArrangementView::toCanvas (int x, int y) const
{
    return canvas->getLocalPoint (this, juce::Point<int> (x, y));
}

//==============================================================================
bool ArrangementView::isInterestedInFileDrag (const juce::StringArray& files)
{
    for (const auto& path : files)
        if (fileIsSupported (juce::File (path)))
            return true;

    return false;
}

void ArrangementView::fileDragEnter (const juce::StringArray&, int x, int y)
{
    draggingFiles = true;
    dropPos = toCanvas (x, y);
    canvas->repaint();
}

void ArrangementView::fileDragMove (const juce::StringArray&, int x, int y)
{
    dropPos = toCanvas (x, y);
    canvas->repaint();
}

void ArrangementView::fileDragExit (const juce::StringArray&)
{
    draggingFiles = false;
    dropPos = { -1, -1 };
    canvas->repaint();
}

void ArrangementView::filesDropped (const juce::StringArray& files, int x, int y)
{
    draggingFiles = false;
    const auto pos = toCanvas (x, y);
    const auto beat = session.snapBeat (pos.x / session.getPixelsPerBeat());
    const auto track = juce::jlimit (0, juce::jmax (0, session.getNumTracks() - 1),
                                     pos.y / session.getTrackHeight());

    for (const auto& path : files)
    {
        juce::File file (path);

        if (fileIsSupported (file))
            session.addClipFromFile (file, track, beat);
    }

    dropPos = { -1, -1 };
    canvas->repaint();
}
