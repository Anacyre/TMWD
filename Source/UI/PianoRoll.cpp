#include "PianoRoll.h"
#include <algorithm>

namespace
{
    constexpr int keyboardWidth = 62;
    constexpr int rollRulerHeight = 20;
    constexpr int numPitches = 128;
    constexpr float noteEdgeGrab = 5.0f;

    bool isBlackKey (int pitch) { return juce::MidiMessage::isMidiNoteBlack (pitch); }

    struct NoteLengthOption { const char* name; double beats; };

    const NoteLengthOption noteLengthOptions[]
    {
        { "1/1", 4.0 }, { "1/2", 2.0 }, { "1/4", 1.0 }, { "1/8", 0.5 }, { "1/16", 0.25 }
    };
}

//==============================================================================
class PianoRollKeys  : public juce::Component
{
public:
    explicit PianoRollKeys (PianoRoll& ownerToUse) : owner (ownerToUse)
    {
        setOpaque (true);
        setRepaintsOnMouseActivity (true);
    }

    void paint (juce::Graphics& g) override
    {
        const auto h = (float) owner.getNoteHeight();
        const auto clip = g.getClipBounds();
        g.fillAll (DawColours::panelSunken);

        const auto first = juce::jmax (0, (int) (clip.getY() / h));
        const auto last = juce::jmin (numPitches - 1, (int) (clip.getBottom() / h) + 1);

        for (int i = first; i <= last; ++i)
        {
            const auto pitch = numPitches - 1 - i;
            const auto y = (float) i * h;
            const bool black = isBlackKey (pitch);
            const bool held = pitch == owner.previewPitch;

            g.setColour (held ? DawColours::accent
                              : (black ? DawColours::keyBlack : DawColours::keyWhite));
            g.fillRect (0.0f, y, (float) getWidth() - (black ? (float) getWidth() * 0.38f : 0.0f), h - 1.0f);

            if (! black && (pitch % 12) == 0 && h >= 9.0f)
            {
                g.setColour (DawColours::keyLabel);
                g.setFont (juce::FontOptions (juce::jmin (10.0f, h - 1.0f)));
                g.drawText (DawUnits::pitchToName (pitch),
                            juce::Rectangle<float> (0.0f, y, (float) getWidth() - 5.0f, h),
                            juce::Justification::centredRight, false);
            }
        }

        g.setColour (DawColours::divider);
        g.drawVerticalLine (getWidth() - 1, 0.0f, (float) getHeight());
    }

    void mouseDown (const juce::MouseEvent& e) override
    {
        owner.startPreview (yToPitch (e.position.y));
        repaint();
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        owner.startPreview (yToPitch (e.position.y));
        repaint();
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        owner.stopPreview();
        repaint();
    }

    void mouseExit (const juce::MouseEvent& e) override
    {
        if (! e.mods.isAnyMouseButtonDown())
        {
            owner.stopPreview();
            repaint();
        }
    }

private:
    int yToPitch (float y) const
    {
        return juce::jlimit (0, 127, numPitches - 1 - (int) (y / (float) owner.getNoteHeight()));
    }

    PianoRoll& owner;
};

//==============================================================================
class PianoRollGrid  : public juce::Component
{
public:
    explicit PianoRollGrid (PianoRoll& ownerToUse) : owner (ownerToUse)
    {
        setOpaque (true);
        setWantsKeyboardFocus (true);
    }

    void paint (juce::Graphics& g) override
    {
        auto& session = owner.session;
        auto* clip = owner.getEditedClip();
        const auto area = g.getClipBounds();
        g.fillAll (DawColours::arrangement);

        if (clip == nullptr)
        {
            g.setColour (DawColours::textDim);
            g.setFont (juce::FontOptions (13.0f));
            g.drawFittedText ("Select a MIDI clip in the arrangement to edit its notes",
                              getLocalBounds(), juce::Justification::centred, 1);
            return;
        }

        const auto h = (float) owner.getNoteHeight();
        const auto ppb = owner.getPixelsPerBeat();

        // Pitch lanes
        const auto firstRow = juce::jmax (0, (int) (area.getY() / h));
        const auto lastRow = juce::jmin (numPitches - 1, (int) (area.getBottom() / h) + 1);

        for (int i = firstRow; i <= lastRow; ++i)
        {
            const auto pitch = numPitches - 1 - i;
            const auto y = (float) i * h;

            g.setColour ((pitch % 12) == 0 ? DawColours::laneRoot
                                           : (isBlackKey (pitch) ? DawColours::laneBlack : DawColours::laneWhite));
            g.fillRect (0.0f, y, (float) getWidth(), h);

            if (h >= 6.0f)
            {
                g.setColour (juce::Colour (0xff0a0a0a));
                g.drawHorizontalLine ((int) y, (float) area.getX(), (float) area.getRight());
            }
        }

        // Time grid, aligned to the bar the clip starts on.
        const auto beatsPerBar = session.getBeatsPerBar();
        const auto barOffset = std::fmod (clip->startBeat, (double) beatsPerBar);
        const auto firstBeat = juce::jmax (0, (int) std::floor (area.getX() / ppb));
        const auto lastBeat = (int) std::ceil (area.getRight() / ppb);
        const auto subdivision = session.getSnapGridBeats();
        const bool showSub = subdivision < 1.0 && ppb * subdivision > 5.0;

        if (showSub)
        {
            g.setColour (juce::Colour (0xff161616));

            for (double b = std::floor (area.getX() / ppb); b * ppb < area.getRight(); b += subdivision)
                g.drawVerticalLine ((int) (b * ppb), (float) area.getY(), (float) area.getBottom());
        }

        for (int b = firstBeat; b <= lastBeat; ++b)
        {
            const auto absoluteBeat = (double) b + barOffset;
            const bool bar = std::abs (std::fmod (absoluteBeat, (double) beatsPerBar)) < 1.0e-6;
            g.setColour (bar ? DawColours::gridBar : DawColours::gridBeat);
            g.drawVerticalLine ((int) ((double) b * ppb), (float) area.getY(), (float) area.getBottom());
        }

        // End-of-clip shading
        const auto clipEndX = (float) (clip->lengthBeats * ppb);

        if (clipEndX < (float) getWidth())
        {
            g.setColour (juce::Colours::black.withAlpha (0.45f));
            g.fillRect (clipEndX, 0.0f, (float) getWidth() - clipEndX, (float) getHeight());
            g.setColour (DawColours::divider);
            g.drawVerticalLine ((int) clipEndX, 0.0f, (float) getHeight());
        }

        // Notes
        const auto baseColour = clip->colour;

        for (const auto& note : clip->notes)
        {
            auto r = getNoteBounds (note);

            if (! r.toNearestInt().intersects (area))
                continue;

            g.setColour (baseColour.withMultipliedBrightness (0.7f + 0.5f * note.velocity));
            g.fillRoundedRectangle (r, 2.0f);

            g.setColour (note.selected ? DawColours::noteSelected : juce::Colours::black.withAlpha (0.5f));
            g.drawRoundedRectangle (r.reduced (0.5f), 2.0f, note.selected ? 1.5f : 1.0f);
        }

        if (! rubberBand.isEmpty())
        {
            g.setColour (DawColours::selectionFill);
            g.fillRect (rubberBand);
            g.setColour (DawColours::selectionEdge.withAlpha (0.7f));
            g.drawRect (rubberBand, 1);
        }

        // Playhead, in clip-relative time
        const auto playX = (float) ((session.getPositionBeats() - clip->startBeat) * ppb);

        if (playX >= 0.0f)
        {
            g.setColour (DawColours::playhead.withAlpha (0.85f));
            g.drawVerticalLine ((int) playX, (float) area.getY(), (float) area.getBottom());
        }
    }

    void playheadMoved()
    {
        auto* clip = owner.getEditedClip();

        if (clip == nullptr)
            return;

        const auto x = (float) ((owner.session.getPositionBeats() - clip->startBeat) * owner.getPixelsPerBeat());

        if (std::abs (x - lastPlayheadX) < 0.5f)
            return;

        repaint ((int) lastPlayheadX - 2, 0, 5, getHeight());
        repaint ((int) x - 2, 0, 5, getHeight());
        lastPlayheadX = x;
    }

    //==============================================================================
    void mouseMove (const juce::MouseEvent& e) override
    {
        const auto index = hitTestNote (e.position);
        setMouseCursor (index >= 0 && isOverRightEdge (index, e.position)
                            ? juce::MouseCursor::LeftRightResizeCursor
                            : juce::MouseCursor::NormalCursor);
    }

    void mouseDown (const juce::MouseEvent& e) override
    {
        auto* clip = owner.getEditedClip();

        if (clip == nullptr)
            return;

        grabKeyboardFocus();
        const auto index = hitTestNote (e.position);

        if (index < 0)
        {
            if (! e.mods.isShiftDown())
                setAllSelected (false);

            rubberBandOrigin = e.getPosition();
            rubberBand = {};
            gesture = Gesture::rubberBand;
            repaint();
            return;
        }

        if (e.mods.isRightButtonDown() || e.mods.isAltDown())
        {
            clip->notes.erase (clip->notes.begin() + index);
            owner.session.notify (DawSession::notesChanged);
            return;
        }

        if (! e.mods.isShiftDown() && ! clip->notes[(size_t) index].selected)
            setAllSelected (false);

        clip->notes[(size_t) index].selected = true;
        gesture = isOverRightEdge (index, e.position) ? Gesture::resize : Gesture::move;
        anchorPitch = yToPitch (e.position.y);
        captureOriginals (*clip);
        owner.startPreview (clip->notes[(size_t) index].pitch,
                            clip->notes[(size_t) index].velocity);
        owner.session.notify (DawSession::notesChanged);
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        auto* clip = owner.getEditedClip();

        if (clip == nullptr)
            return;

        auto& session = owner.session;

        if (gesture == Gesture::rubberBand)
        {
            rubberBand = juce::Rectangle<int>::leftTopRightBottom (
                juce::jmin (rubberBandOrigin.x, e.x), juce::jmin (rubberBandOrigin.y, e.y),
                juce::jmax (rubberBandOrigin.x, e.x), juce::jmax (rubberBandOrigin.y, e.y));

            for (auto& note : clip->notes)
                note.selected = getNoteBounds (note).toNearestInt().intersects (rubberBand);

            repaint();
            owner.session.notify (DawSession::notesChanged);
            return;
        }

        if (originals.empty())
            return;

        const auto beatDelta = e.getDistanceFromDragStartX() / owner.getPixelsPerBeat();
        const auto pitchDelta = yToPitch (e.position.y) - anchorPitch;

        for (const auto& original : originals)
        {
            if (! juce::isPositiveAndBelow (original.index, (int) clip->notes.size()))
                continue;

            auto& note = clip->notes[(size_t) original.index];

            if (gesture == Gesture::resize)
            {
                note.lengthBeats = juce::jmax (0.0625,
                                               session.snapBeat (original.startBeat + original.lengthBeats + beatDelta)
                                                   - note.startBeat);
            }
            else
            {
                note.startBeat = juce::jmax (0.0, session.snapBeat (original.startBeat + beatDelta));
                note.pitch = juce::jlimit (0, 127, original.pitch + pitchDelta);
            }
        }

        if (gesture == Gesture::move && ! originals.empty())
        {
            const auto& first = originals.front();

            if (juce::isPositiveAndBelow (first.index, (int) clip->notes.size()))
                owner.startPreview (clip->notes[(size_t) first.index].pitch,
                                    clip->notes[(size_t) first.index].velocity);
        }

        owner.session.notify (DawSession::notesChanged);
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        gesture = Gesture::none;
        originals.clear();
        rubberBand = {};
        owner.stopPreview();
        repaint();
    }

    void mouseDoubleClick (const juce::MouseEvent& e) override
    {
        auto* clip = owner.getEditedClip();

        if (clip == nullptr || hitTestNote (e.position) >= 0)
            return;

        MidiNote note;
        note.pitch = yToPitch (e.position.y);
        note.startBeat = juce::jmax (0.0, owner.session.snapBeat (e.position.x / owner.getPixelsPerBeat()));
        note.lengthBeats = owner.newNoteLength;
        note.velocity = 0.8f;
        note.selected = true;
        setAllSelected (false);
        clip->notes.push_back (note);
        owner.startPreview (note.pitch, note.velocity);
        owner.session.notify (DawSession::notesChanged);
    }

    void mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override
    {
        if (e.mods.isCtrlDown() || e.mods.isCommandDown())
        {
            owner.pixelsPerBeat = juce::jlimit (8.0, 400.0,
                                                owner.pixelsPerBeat * (wheel.deltaY > 0 ? 1.15 : 0.87));
            owner.updateContentSize();
            return;
        }

        if (e.mods.isShiftDown())
        {
            owner.noteHeight = juce::jlimit (5, 26, owner.noteHeight + (wheel.deltaY > 0 ? 1 : -1));
            owner.updateContentSize();
            return;
        }

        Component::mouseWheelMove (e, wheel);
    }

    bool keyPressed (const juce::KeyPress& key) override
    {
        if (key == juce::KeyPress::deleteKey || key == juce::KeyPress::backspaceKey)
        {
            owner.deleteSelectedNotes();
            return true;
        }

        return false;
    }

private:
    enum class Gesture { none, move, resize, rubberBand };
    struct Original { int index; double startBeat; double lengthBeats; int pitch; };

    juce::Rectangle<float> getNoteBounds (const MidiNote& note) const
    {
        const auto h = (float) owner.getNoteHeight();
        const auto ppb = owner.getPixelsPerBeat();
        return { (float) (note.startBeat * ppb),
                 (float) (numPitches - 1 - note.pitch) * h,
                 juce::jmax (3.0f, (float) (note.lengthBeats * ppb)),
                 juce::jmax (3.0f, h - 1.0f) };
    }

    int hitTestNote (juce::Point<float> p) const
    {
        const auto* clip = owner.getEditedClip();

        if (clip == nullptr)
            return -1;

        for (int i = (int) clip->notes.size(); --i >= 0;)
            if (getNoteBounds (clip->notes[(size_t) i]).contains (p))
                return i;

        return -1;
    }

    bool isOverRightEdge (int index, juce::Point<float> p) const
    {
        const auto* clip = owner.getEditedClip();

        if (clip == nullptr || ! juce::isPositiveAndBelow (index, (int) clip->notes.size()))
            return false;

        const auto r = getNoteBounds (clip->notes[(size_t) index]);
        return r.getWidth() > noteEdgeGrab * 2.5f && p.x >= r.getRight() - noteEdgeGrab;
    }

    int yToPitch (float y) const
    {
        return juce::jlimit (0, 127, numPitches - 1 - (int) (y / (float) owner.getNoteHeight()));
    }

    void setAllSelected (bool shouldBeSelected)
    {
        if (auto* clip = owner.getEditedClip())
            for (auto& note : clip->notes)
                note.selected = shouldBeSelected;
    }

    void captureOriginals (const ClipData& clip)
    {
        originals.clear();

        for (int i = 0; i < (int) clip.notes.size(); ++i)
            if (clip.notes[(size_t) i].selected)
                originals.push_back ({ i, clip.notes[(size_t) i].startBeat,
                                       clip.notes[(size_t) i].lengthBeats, clip.notes[(size_t) i].pitch });
    }

    PianoRoll& owner;
    Gesture gesture = Gesture::none;
    std::vector<Original> originals;
    juce::Point<int> rubberBandOrigin;
    juce::Rectangle<int> rubberBand;
    int anchorPitch = 60;
    float lastPlayheadX = 0.0f;
};

//==============================================================================
PianoRoll::PianoRoll (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    keys = std::make_unique<PianoRollKeys> (*this);
    grid = std::make_unique<PianoRollGrid> (*this);

    clipLabel.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (juce::Font::bold)));
    clipLabel.setColour (juce::Label::textColourId, DawColours::text);
    clipLabel.setJustificationType (juce::Justification::centredLeft);
    clipLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (clipLabel);

    statsLabel.setFont (juce::FontOptions (11.0f));
    statsLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    statsLabel.setJustificationType (juce::Justification::centredRight);
    statsLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (statsLabel);

    DawWidgets::styleFlatButton (lengthButton);
    lengthButton.setTooltip ("Length of newly drawn notes");
    lengthButton.onClick = [this]
    {
        juce::PopupMenu m;

        for (int i = 0; i < (int) std::size (noteLengthOptions); ++i)
            m.addItem (i + 1, noteLengthOptions[i].name, true,
                       std::abs (newNoteLength - noteLengthOptions[i].beats) < 1.0e-6);

        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&lengthButton), [this] (int r)
        {
            if (r >= 1 && r <= (int) std::size (noteLengthOptions))
            {
                newNoteLength = noteLengthOptions[r - 1].beats;
                lengthButton.setButtonText (noteLengthOptions[r - 1].name);
            }
        });
    };
    addAndMakeVisible (lengthButton);

    velocityCaption.setText ("VEL", juce::dontSendNotification);
    velocityCaption.setFont (juce::Font (juce::FontOptions (9.0f).withStyleFlags (juce::Font::bold)));
    velocityCaption.setColour (juce::Label::textColourId, DawColours::textDim);
    velocityCaption.setJustificationType (juce::Justification::centredRight);
    velocityCaption.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (velocityCaption);

    velocityField.setRange (1.0, 127.0);
    velocityField.setSensitivity (0.6);
    velocityField.setValue (100.0);
    velocityField.setTooltip ("Velocity of the selected notes");
    velocityField.onValueChange = [this] (double v)
    {
        if (auto* clip = getEditedClip())
        {
            bool any = false;

            for (auto& note : clip->notes)
            {
                if (note.selected)
                {
                    note.velocity = juce::jlimit (0.01f, 1.0f, (float) v / 127.0f);
                    any = true;
                }
            }

            if (any)
                session.notify (DawSession::notesChanged);
        }
    };
    addAndMakeVisible (velocityField);

    zoomInButton.setTooltip ("Zoom in  (Ctrl + wheel)");
    zoomInButton.onClick = [this] { pixelsPerBeat = juce::jmin (400.0, pixelsPerBeat * 1.3); updateContentSize(); };
    addAndMakeVisible (zoomInButton);

    zoomOutButton.setTooltip ("Zoom out  (Ctrl + wheel)");
    zoomOutButton.onClick = [this] { pixelsPerBeat = juce::jmax (8.0, pixelsPerBeat / 1.3); updateContentSize(); };
    addAndMakeVisible (zoomOutButton);

    keysViewport.setViewedComponent (keys.get(), false);
    keysViewport.setScrollBarsShown (false, false, true, false);
    keysViewport.onMoved = [this] (juce::Point<int> pos)
    {
        if (syncing)
            return;

        syncing = true;
        gridViewport.setViewPosition (gridViewport.getViewPositionX(), pos.y);
        syncing = false;
    };
    addAndMakeVisible (keysViewport);

    gridViewport.setViewedComponent (grid.get(), false);
    gridViewport.setScrollBarsShown (true, true);
    gridViewport.onMoved = [this] (juce::Point<int> pos)
    {
        if (! syncing)
        {
            syncing = true;
            keysViewport.setViewPosition (0, pos.y);
            syncing = false;
        }

        repaint (rulerBounds);
    };
    addAndMakeVisible (gridViewport);

    refreshToolbar();
}

PianoRoll::~PianoRoll()
{
    stopPreview();
    session.removeListener (this);
}

void PianoRoll::startPreview (int pitch, float velocity)
{
    pitch = juce::jlimit (0, 127, pitch);
    const auto track = session.getSelectedTrack();

    if (pitch == previewPitch)
        return;

    stopPreview();
    previewPitch = pitch;
    session.previewNoteOn (track, pitch, velocity);
}

void PianoRoll::stopPreview()
{
    if (previewPitch < 0)
        return;

    session.previewNoteOff (session.getSelectedTrack(), previewPitch);
    previewPitch = -1;
}

ClipData* PianoRoll::getEditedClip()
{
    return session.getClip (session.getSelectedClip());
}

void PianoRoll::deleteSelectedNotes()
{
    if (auto* clip = getEditedClip())
    {
        const auto before = clip->notes.size();
        clip->notes.erase (std::remove_if (clip->notes.begin(), clip->notes.end(),
                                           [] (const MidiNote& n) { return n.selected; }),
                           clip->notes.end());

        if (clip->notes.size() != before)
            session.notify (DawSession::notesChanged);
    }
}

//==============================================================================
void PianoRoll::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    auto toolbar = getLocalBounds().removeFromTop (26);
    g.setColour (DawColours::panelRaised);
    g.fillRect (toolbar);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (toolbar.getBottom() - 1, 0.0f, (float) getWidth());

    // Bar ruler above the grid, offset by the horizontal scroll.
    auto fullRuler = rulerBounds.withX (0).withWidth (getWidth());
    g.setColour (DawColours::ruler);
    g.fillRect (fullRuler);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (rulerBounds.getBottom() - 1, 0.0f, (float) getWidth());
    g.drawVerticalLine (rulerBounds.getX() - 1, (float) rulerBounds.getY(), (float) rulerBounds.getBottom());

    const auto* clip = session.getClip (session.getSelectedClip());

    if (clip == nullptr)
        return;

    g.reduceClipRegion (rulerBounds);

    const auto scrollX = gridViewport.getViewPositionX();
    const auto beatsPerBar = session.getBeatsPerBar();
    const auto barWidth = pixelsPerBeat * beatsPerBar;
    const auto labelStep = juce::jmax (1, (int) std::ceil (44.0 / juce::jmax (1.0, barWidth)));
    const auto clipStartBar = clip->startBeat / (double) beatsPerBar;
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
            g.drawText (juce::String ((int) std::floor (clipStartBar) + bar + 1),
                        (int) x + 4, rulerBounds.getY(), 40, rulerBounds.getHeight() - 1,
                        juce::Justification::centredLeft, false);
        }
    }

    const auto playX = (float) ((session.getPositionBeats() - clip->startBeat) * pixelsPerBeat - scrollX)
                       + (float) rulerBounds.getX();

    if (playX >= (float) rulerBounds.getX())
    {
        g.setColour (DawColours::playhead);
        g.drawVerticalLine ((int) playX, (float) rulerBounds.getY(), (float) rulerBounds.getBottom());
    }
}

void PianoRoll::resized()
{
    auto r = getLocalBounds();

    auto toolbar = r.removeFromTop (26).reduced (8, 3);
    clipLabel.setBounds (toolbar.removeFromLeft (juce::jmin (240, toolbar.getWidth() / 2)));

    zoomInButton.setBounds (toolbar.removeFromRight (22).withSizeKeepingCentre (20, 20));
    zoomOutButton.setBounds (toolbar.removeFromRight (22).withSizeKeepingCentre (20, 20));
    toolbar.removeFromRight (8);
    velocityField.setBounds (toolbar.removeFromRight (38).withSizeKeepingCentre (38, 18));
    velocityCaption.setBounds (toolbar.removeFromRight (28));
    toolbar.removeFromRight (8);
    lengthButton.setBounds (toolbar.removeFromRight (42).withSizeKeepingCentre (42, 18));
    toolbar.removeFromRight (10);
    statsLabel.setBounds (toolbar);

    auto ruler = r.removeFromTop (rollRulerHeight);
    ruler.removeFromLeft (keyboardWidth);
    rulerBounds = ruler;

    keysViewport.setBounds (r.removeFromLeft (keyboardWidth));
    gridViewport.setBounds (r);
    updateContentSize();
    scrollToContent();
}

void PianoRoll::updateContentSize()
{
    const auto* clip = session.getClip (session.getSelectedClip());
    const auto lengthBeats = clip != nullptr ? juce::jmax (8.0, clip->lengthBeats + 8.0) : 32.0;

    grid->setSize (juce::jmax (gridViewport.getMaximumVisibleWidth(),
                               (int) std::ceil (lengthBeats * pixelsPerBeat)),
                   numPitches * noteHeight);
    keys->setSize (keyboardWidth, numPitches * noteHeight);
    repaint();
}

void PianoRoll::scrollToContent()
{
    if (hasScrolledToContent || getHeight() <= 0)
        return;

    const auto* clip = session.getClip (session.getSelectedClip());
    int centrePitch = 60;

    if (clip != nullptr && ! clip->notes.empty())
    {
        int low = 127, high = 0;

        for (const auto& note : clip->notes)
        {
            low = juce::jmin (low, note.pitch);
            high = juce::jmax (high, note.pitch);
        }

        centrePitch = (low + high) / 2;
    }

    const auto y = (numPitches - 1 - centrePitch) * noteHeight - gridViewport.getHeight() / 2;
    gridViewport.setViewPosition (0, juce::jmax (0, y));
    hasScrolledToContent = true;
}

void PianoRoll::refreshToolbar()
{
    const auto* clip = session.getClip (session.getSelectedClip());

    if (clip == nullptr)
    {
        clipLabel.setText ("No clip selected", juce::dontSendNotification);
        statsLabel.setText ({}, juce::dontSendNotification);
        return;
    }

    const auto* track = session.getTrack (clip->trackIndex);
    clipLabel.setText (clip->name + (track != nullptr ? "   -   " + track->name : juce::String()),
                       juce::dontSendNotification);

    int selectedCount = 0;
    float velocitySum = 0.0f;

    for (const auto& note : clip->notes)
        if (note.selected)
        {
            ++selectedCount;
            velocitySum += note.velocity;
        }

    statsLabel.setText (juce::String ((int) clip->notes.size()) + " notes"
                            + (selectedCount > 0 ? "   " + juce::String (selectedCount) + " selected"
                                                 : juce::String()),
                        juce::dontSendNotification);

    if (selectedCount > 0 && ! velocityField.isMouseButtonDown())
        velocityField.setValue (juce::roundToInt (velocitySum / (float) selectedCount * 127.0f));
}

void PianoRoll::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::selectionChanged) != 0)
    {
        hasScrolledToContent = false;
        updateContentSize();
        scrollToContent();
        grid->repaint();
        refreshToolbar();
        return;
    }

    if ((changeFlags & (DawSession::notesChanged | DawSession::clipsChanged
                        | DawSession::viewChanged | DawSession::projectChanged)) != 0)
    {
        updateContentSize();
        grid->repaint();
        refreshToolbar();
        return;
    }

    if ((changeFlags & (DawSession::positionChanged | DawSession::transportChanged)) != 0)
    {
        grid->playheadMoved();
        repaint (rulerBounds);
    }
}
