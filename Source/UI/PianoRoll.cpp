#include "PianoRoll.h"
#include <algorithm>
#include <limits>

namespace
{
    constexpr int keyboardWidth = 62;
    constexpr int rollRulerHeight = 20;
    constexpr int numPitches = 128;
    constexpr float noteEdgeGrab = 10.0f;

    bool isBlackKey (int pitch) { return juce::MidiMessage::isMidiNoteBlack (pitch); }

    struct NoteLengthOption { const char* name; double beats; };

    const NoteLengthOption noteLengthOptions[]
    {
        { "1/1", 4.0 }, { "1/2", 2.0 }, { "1/4", 1.0 }, { "1/8", 0.5 }, { "1/16", 0.25 }, { "1/32", 0.125 }
    };

    struct SnapPreset { const char* name; double beats; bool off; };

    const SnapPreset snapPresets[]
    {
        { "Off", 0.0, true },
        { "1/4", 1.0, false },
        { "1/8", 0.5, false },
        { "1/16", 0.25, false },
        { "1/32", 0.125, false },
        { "Triplet", 1.0 / 3.0, false },
        { "Bar", 4.0, false }
    };

    bool isScalePitch (int pitch, int root, int mode)
    {
        static const int major[] { 0, 2, 4, 5, 7, 9, 11 };
        static const int minor[] { 0, 2, 3, 5, 7, 8, 10 };
        const auto* intervals = mode == 1 ? minor : major;
        const int count = 7;
        const int pc = ((pitch % 12) + 12) % 12;
        const int rel = (pc - ((root % 12) + 12) % 12 + 12) % 12;

        for (int i = 0; i < count; ++i)
            if (intervals[i] == rel)
                return true;

        return false;
    }

    TimeSignatureChange signatureAtTick (const Project& project, juce::int64 tick)
    {
        TimeSignatureChange current { 0, project.getTimeSigNumerator(), project.getTimeSigDenominator() };

        for (const auto& change : project.getTimeSignatureChanges())
            if (change.timeTick <= tick)
                current = change;

        return current;
    }

    const char* repeatLabel (int mode)
    {
        switch (mode)
        {
            case 1:  return "1/4";
            case 2:  return "1/8d";
            case 3:  return "1/4t";
            case 4:  return "1/8";
            case 5:  return "1/16d";
            case 6:  return "1/8t";
            case 7:  return "1/16";
            case 8:  return "1/32d";
            case 9:  return "1/16t";
            case 10: return "1/32";
            case 11: return "1/64d";
            case 12: return "1/32t";
            case 13: return "1/64";
            case 14: return "1/64t";
            default: return "Off";
        }
    }
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

            const bool inScale = ! owner.scaleGuide || isScalePitch (pitch, owner.scaleRoot, owner.scaleMode);
            g.setColour ((pitch % 12) == 0 ? DawColours::laneRoot
                                           : (isBlackKey (pitch)
                                                  ? (inScale ? DawColours::laneBlack : juce::Colour (0xff0c0c0c))
                                                  : (inScale ? DawColours::laneWhite : juce::Colour (0xff111111))));
            g.fillRect (0.0f, y, (float) getWidth(), h);

            if (h >= 6.0f)
            {
                g.setColour (juce::Colour (0xff0a0a0a));
                g.drawHorizontalLine ((int) y, (float) area.getX(), (float) area.getRight());
            }
        }

        // Time grid follows the arrangement time-signature map; clip-relative X.
        const auto clipStartTick = MusicalTime::beatsToTicks (clip->startBeat);
        const auto firstTick = MusicalTime::beatsToTicks (area.getX() / ppb);
        const auto lastTick = MusicalTime::beatsToTicks (area.getRight() / ppb);
        const auto sig0 = signatureAtTick (session.project(), clipStartTick + firstTick);
        const auto beatTicks = MusicalTime::ticksPerQuarterNote * 4 / juce::jmax (1, sig0.denominator);
        auto sub = beatTicks;
        const auto pxPerTick = ppb / (double) MusicalTime::ticksPerQuarterNote;
        if (pxPerTick * (double) (beatTicks / 2) > 8.0) sub = beatTicks / 2;
        if (pxPerTick * (double) (beatTicks / 4) > 8.0) sub = beatTicks / 4;
        if (pxPerTick * (double) (beatTicks / 8) > 10.0) sub = beatTicks / 8;
        sub = juce::jmax ((juce::int64) 1, sub);
        const auto first = (firstTick / sub) * sub;

        for (auto t = first; t <= lastTick; t += sub)
        {
            const auto absTick = clipStartTick + t;
            const auto sig = signatureAtTick (session.project(), absTick);
            const auto barTicks = MusicalTime::ticksPerBar (sig.numerator, sig.denominator);
            const auto beat = MusicalTime::ticksPerQuarterNote * 4 / juce::jmax (1, sig.denominator);
            const auto origin = sig.timeTick;
            const bool bar = barTicks > 0 && ((absTick - origin) % barTicks + barTicks) % barTicks == 0;
            const bool onBeat = beat > 0 && ((absTick - origin) % beat + beat) % beat == 0;
            g.setColour (bar ? DawColours::gridBar
                             : (onBeat ? DawColours::gridBeat : juce::Colour (0xff161616)));
            g.drawVerticalLine ((int) (MusicalTime::ticksToBeats (t) * ppb),
                                (float) area.getY(), (float) area.getBottom());
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

            g.setColour (baseColour.withMultipliedBrightness (0.55f + 0.45f * (float) note.getVelocityByte() / 127.0f)
                                   .withAlpha (note.muted ? 0.32f : 1.0f));
            g.fillRoundedRectangle (r, 2.0f);

            if (note.color > 0)
            {
                static const juce::uint32 meta[] {
                    0xff8aa4b8, 0xff8a9a8a, 0xffb8a48a, 0xff9a8ab8,
                    0xffa48a8a, 0xff8ab4b0, 0xffb8b08a, 0xff8a8a9a,
                    0xff7a90a8, 0xff90a07a, 0xffa8907a, 0xff9078a0,
                    0xffa07878, 0xff78a09c, 0xffa89c78, 0xff787888
                };
                g.setColour (juce::Colour (meta[note.color % 16]));
                g.fillRect (r.getX(), r.getY(), 2.0f, r.getHeight());
            }

            if (note.slide || note.porta)
            {
                g.setColour (juce::Colours::white.withAlpha (0.45f));
                g.fillRect (r.getX() + 4.0f, r.getCentreY() - 0.5f, juce::jmax (6.0f, r.getWidth() - 8.0f), 1.0f);
            }

            g.setColour (note.selected ? juce::Colours::white.withAlpha (0.7f) : juce::Colours::black.withAlpha (0.5f));
            g.drawRoundedRectangle (r.reduced (0.5f), 2.0f, note.selected ? 1.4f : 1.0f);
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
            if (owner.tool == PianoRoll::Tool::select || e.mods.isShiftDown())
            {
                if (! e.mods.isShiftDown())
                    setAllSelected (false);

                rubberBandOrigin = e.getPosition();
                rubberBand = {};
                gesture = Gesture::rubberBand;
                repaint();
                return;
            }

            if (owner.tool == PianoRoll::Tool::erase)
                return;

            owner.session.beginTransaction ("Create note");
            setAllSelected (false);
            MidiNote note;
            note.pitch = yToPitch (e.position.y);
            const auto rawBeat = e.position.x / owner.getPixelsPerBeat();
            note.startBeat = juce::jmax (0.0, owner.session.isSnapOn() ? owner.session.snapBeat (rawBeat) : rawBeat);
            note.lengthBeats = owner.newNoteLength;
            note.setVelocityMidi (100);
            note.selected = true;
            clip->notes.push_back (note);
            owner.startPreview (note.pitch, note.velocity);
            captureOriginals (*clip);
            gesture = Gesture::resize;
            owner.notifyNotesCoalesced();
            return;
        }

        if (owner.tool == PianoRoll::Tool::erase)
        {
            owner.session.beginTransaction ("Delete notes");
            clip->notes.erase (clip->notes.begin() + index);
            owner.session.notify (DawSession::notesChanged);
            return;
        }

        if (e.mods.isPopupMenu())
        {
            if (! clip->notes[(size_t) index].selected)
            {
                setAllSelected (false);
                clip->notes[(size_t) index].selected = true;
                if (clip->notes[(size_t) index].group > 0)
                    owner.selectGroup (clip->notes[(size_t) index].group);
            }

            owner.showNoteMenu (e.getScreenPosition());
            return;
        }

        if (! e.mods.isShiftDown() && ! clip->notes[(size_t) index].selected)
        {
            setAllSelected (false);

            if (clip->notes[(size_t) index].group > 0)
                owner.selectGroup (clip->notes[(size_t) index].group);
            else
                clip->notes[(size_t) index].selected = true;
        }
        else if (e.mods.isShiftDown())
        {
            clip->notes[(size_t) index].selected = ! clip->notes[(size_t) index].selected;
        }

        owner.inspectorOpen = true;
        owner.session.beginTransaction (isOverRightEdge (index, e.position) ? "Resize notes" : "Move notes");
        gesture = isOverRightEdge (index, e.position) ? Gesture::resize : Gesture::move;
        anchorPitch = yToPitch (e.position.y);
        captureOriginals (*clip);
        owner.startPreview (clip->notes[(size_t) index].pitch,
                            clip->notes[(size_t) index].velocity);
        owner.refreshToolbar();
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        auto* clip = owner.getEditedClip();

        if (clip == nullptr)
            return;

        if (gesture == Gesture::rubberBand)
        {
            rubberBand = juce::Rectangle<int>::leftTopRightBottom (
                juce::jmin (rubberBandOrigin.x, e.x), juce::jmin (rubberBandOrigin.y, e.y),
                juce::jmax (rubberBandOrigin.x, e.x), juce::jmax (rubberBandOrigin.y, e.y));

            for (auto& note : clip->notes)
                note.selected = getNoteBounds (note).toNearestInt().intersects (rubberBand);

            repaint();
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
                const auto grid = owner.session.isSnapOn() && ! e.mods.isAltDown()
                                    ? owner.session.getSnapGridBeats() : 0.0;
                auto length = original.lengthBeats + beatDelta;
                if (grid > 0.0)
                    length = owner.session.snapBeat (original.startBeat + original.lengthBeats + beatDelta) - original.startBeat;
                note.lengthBeats = juce::jmax (MusicalTime::ticksToBeats (NoteModel::minDurationTicks), length);
            }
            else
            {
                if (e.mods.isAltDown() || ! owner.session.isSnapOn())
                    note.startBeat = juce::jmax (0.0, original.startBeat + beatDelta);
                else
                    note.startBeat = juce::jmax (0.0, owner.session.snapBeat (original.startBeat + beatDelta));
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

        owner.notifyNotesCoalesced();
        repaint();
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        if (gesture == Gesture::move || gesture == Gesture::resize)
            owner.session.notify (DawSession::notesChanged);

        gesture = Gesture::none;
        originals.clear();
        rubberBand = {};
        owner.stopPreview();
        repaint();
    }

    void mouseDoubleClick (const juce::MouseEvent& e) override
    {
        if (hitTestNote (e.position) >= 0)
        {
            owner.inspectorOpen = true;
            owner.inspectorAdvanced = true;
            owner.resized();
        }
    }

    void mouseWheelMove (const juce::MouseEvent& e, const juce::MouseWheelDetails& wheel) override
    {
        if (e.mods.isCtrlDown() || e.mods.isCommandDown())
        {
            owner.pixelsPerBeat = juce::jlimit (12.0, 280.0,
                                                owner.pixelsPerBeat * (wheel.deltaY > 0 ? 1.15 : 0.87));
            owner.updateContentSize();
            return;
        }

        if (e.mods.isShiftDown())
        {
            owner.noteHeight = juce::jlimit (8, 28, owner.noteHeight + (wheel.deltaY > 0 ? 1 : -1));
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

        const auto code = key.getKeyCode();

        if (key.getModifiers().isCtrlDown() || key.getModifiers().isCommandDown())
        {
            if (code == 'C' || code == 'c') { owner.copySelectedNotes(); return true; }
            if (code == 'V' || code == 'v') { owner.pasteNotes(); return true; }
            if (code == 'A' || code == 'a') { setAllSelected (true); owner.refreshToolbar(); repaint(); return true; }
            if (code == 'D' || code == 'd') { owner.duplicateSelectedNotes(); return true; }
        }

        if (code == '1') { owner.drawTool.triggerClick(); return true; }
        if (code == '2') { owner.selectTool.triggerClick(); return true; }
        if (code == '3') { owner.eraseTool.triggerClick(); return true; }
        if (code == 'Q' || code == 'q') { owner.quantizeSelectedNotes(); return true; }

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
class PianoRollVelocity  : public juce::Component
{
public:
    explicit PianoRollVelocity (PianoRoll& ownerToUse) : owner (ownerToUse)
    {
        setOpaque (true);
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (juce::Colour (0xff121212));
        g.setColour (DawColours::textDim);
        g.setFont (juce::FontOptions (9.0f));
        g.drawText ("VELOCITY", 8, 2, 80, 12, juce::Justification::centredLeft, false);

        auto* clip = owner.getEditedClip();
        if (clip == nullptr)
            return;

        const auto scrollX = owner.gridViewport.getViewPositionX();
        const auto ppb = owner.getPixelsPerBeat();
        const auto h = (float) getHeight();

        for (const auto& note : clip->notes)
        {
            const auto x = (float) (note.startBeat * ppb - scrollX);
            const auto vel = (float) note.getVelocityByte() / 127.0f;
            const auto barH = juce::jmax (2.0f, vel * (h - 16.0f));
            g.setColour ((note.selected ? DawColours::accent : juce::Colour (0xff4da3ff))
                             .withAlpha (note.muted ? 0.3f : 0.9f));
            g.fillRect (x, h - 4.0f - barH, 5.0f, barH);
        }
    }

    void mouseDown (const juce::MouseEvent& e) override
    {
        auto* clip = owner.getEditedClip();
        if (clip == nullptr)
            return;

        owner.session.beginTransaction ("Velocity");
        dragging = true;
        originY = e.y;
        originals.clear();

        bool any = false;
        for (auto& note : clip->notes)
            if (note.selected)
            {
                originals.push_back ({ &note, note.getVelocityByte() });
                any = true;
            }

        if (! any)
        {
            const auto scrollX = owner.gridViewport.getViewPositionX();
            const auto ppb = owner.getPixelsPerBeat();
            MidiNote* hit = nullptr;
            for (auto& note : clip->notes)
            {
                const auto x = (float) (note.startBeat * ppb - scrollX);
                if (std::abs (e.position.x - x) <= 12.0f)
                    hit = &note;
            }

            if (hit != nullptr)
            {
                for (auto& note : clip->notes)
                    note.selected = (&note == hit);
                originals.push_back ({ hit, hit->getVelocityByte() });
            }
        }
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        if (! dragging)
            return;

        const auto delta = (originY - e.y) / 2;
        for (auto& item : originals)
            if (item.note != nullptr)
                item.note->setVelocityMidi (item.velocity + (int) delta);

        owner.notifyNotesCoalesced();
        repaint();
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        dragging = false;
        originals.clear();
        owner.session.notify (DawSession::notesChanged);
    }

private:
    struct Item { MidiNote* note = nullptr; int velocity = 100; };
    PianoRoll& owner;
    bool dragging = false;
    int originY = 0;
    std::vector<Item> originals;
};

//==============================================================================
class NoteInspector  : public juce::Component
{
public:
    explicit NoteInspector (PianoRoll& ownerToUse) : owner (ownerToUse)
    {
        setOpaque (true);
        DawWidgets::styleFlatButton (advanced);
        DawWidgets::styleFlatButton (mute);
        advanced.onClick = [this]
        {
            owner.inspectorAdvanced = ! owner.inspectorAdvanced;
            owner.resized();
        };
        mute.onClick = [this] { owner.muteSelectedNotes(); };
        addAndMakeVisible (advanced);
        addAndMakeVisible (mute);
    }

    int preferredHeight() const noexcept { return owner.inspectorAdvanced ? 236 : 124; }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (juce::Colour (0xff161616));
        g.setColour (juce::Colour (0xff2a2a2a));
        g.drawRect (getLocalBounds(), 1);
        g.setColour (DawColours::text);
        g.setFont (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold));
        g.drawText ("Note", 8, 6, getWidth() - 16, 14, juce::Justification::centredLeft, false);

        auto* clip = owner.getEditedClip();
        const MidiNote* note = nullptr;
        if (clip != nullptr)
            for (const auto& n : clip->notes)
                if (n.selected) { note = &n; break; }

        g.setColour (DawColours::textMuted);
        g.setFont (juce::FontOptions (11.0f));
        int y = 24;
        auto row = [&] (const juce::String& k, const juce::String& v)
        {
            g.setColour (DawColours::textDim);
            g.drawText (k, 8, y, 64, 16, juce::Justification::centredLeft, false);
            g.setColour (DawColours::text);
            g.drawText (v, 72, y, getWidth() - 80, 16, juce::Justification::centredRight, false);
            y += 16;
        };

        if (note == nullptr)
        {
            row ("Pitch", "-");
            return;
        }

        row ("Pitch", DawUnits::pitchToName (note->pitch));
        row ("Start", juce::String (note->startBeat, 3));
        row ("Length", juce::String (note->lengthBeats, 3));
        row ("Velocity", juce::String (note->getVelocityByte()));

        if (owner.inspectorAdvanced)
        {
            row ("Release", juce::String (note->releaseVelocity));
            row ("Pan", juce::String (note->pan));
            row ("Fine", juce::String (note->pitchOffset));
            row ("Group", juce::String (note->group));
            row ("Color", juce::String (note->color));
            row ("Mute", note->muted ? "On" : "Off");
            row ("Slide", "Unsupported");
            row ("Porta", "Unsupported");
            row ("Repeat", repeatLabel (note->repeatMode));
            row ("Mod X", juce::String (note->modX));
            row ("Mod Y", juce::String (note->modY));
        }
    }

    void resized() override
    {
        auto r = getLocalBounds().reduced (8);
        r.removeFromTop (owner.inspectorAdvanced ? 204 : 88);
        advanced.setButtonText (owner.inspectorAdvanced ? "Less" : "Advanced");
        advanced.setBounds (r.removeFromTop (18));
        r.removeFromTop (4);
        mute.setBounds (r.removeFromTop (18));
    }

    PianoRoll& owner;
    juce::TextButton advanced { "Advanced" }, mute { "Mute" };
};

//==============================================================================
PianoRoll::PianoRoll (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    keys = std::make_unique<PianoRollKeys> (*this);
    grid = std::make_unique<PianoRollGrid> (*this);
    velocityLane = std::make_unique<PianoRollVelocity> (*this);
    inspector = std::make_unique<NoteInspector> (*this);
    addChildComponent (*inspector);

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

    contextLabel.setFont (juce::FontOptions (11.0f));
    contextLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    contextLabel.setJustificationType (juce::Justification::centredLeft);
    contextLabel.setInterceptsMouseClicks (false, false);
    contextLabel.setVisible (false);
    addChildComponent (contextLabel);

    DawWidgets::styleFlatButton (drawTool);
    DawWidgets::styleFlatButton (selectTool);
    DawWidgets::styleFlatButton (eraseTool);
    auto applyTool = [this] (Tool next)
    {
        tool = next;
        drawTool.setColour (juce::TextButton::buttonColourId,
                            tool == Tool::draw ? DawColours::rowSelected : DawColours::control);
        selectTool.setColour (juce::TextButton::buttonColourId,
                              tool == Tool::select ? DawColours::rowSelected : DawColours::control);
        eraseTool.setColour (juce::TextButton::buttonColourId,
                             tool == Tool::erase ? DawColours::rowSelected : DawColours::control);
    };
    drawTool.onClick = [this, applyTool] { applyTool (Tool::draw); };
    selectTool.onClick = [this, applyTool] { applyTool (Tool::select); };
    eraseTool.onClick = [this, applyTool] { applyTool (Tool::erase); };
    addAndMakeVisible (drawTool);
    addAndMakeVisible (selectTool);
    addAndMakeVisible (eraseTool);
    applyTool (Tool::draw);

    DawWidgets::styleFlatButton (snapButton);
    snapButton.setTooltip ("Snap");
    snapButton.onClick = [this]
    {
        juce::PopupMenu m;
        for (int i = 0; i < (int) std::size (snapPresets); ++i)
        {
            const bool ticked = snapPresets[i].off ? ! session.isSnapOn()
                                                   : session.isSnapOn()
                                                         && std::abs (session.getSnapGridBeats() - snapPresets[i].beats) < 1.0e-3;
            m.addItem (i + 1, snapPresets[i].name, true, ticked);
        }
        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&snapButton), [this] (int r)
        {
            if (r >= 1)
                applySnapPreset (r - 1);
        });
    };
    addAndMakeVisible (snapButton);

    DawWidgets::styleFlatButton (quantizeButton);
    quantizeButton.setTooltip ("Quantize selected note starts");
    quantizeButton.onClick = [this] { quantizeSelectedNotes(); };
    addAndMakeVisible (quantizeButton);

    DawWidgets::styleFlatButton (moreButton);
    moreButton.setTooltip ("Scale guide and grouping");
    moreButton.onClick = [this]
    {
        juce::PopupMenu m;
        m.addItem (1, "Scale guide", true, scaleGuide);
        juce::PopupMenu keysMenu;
        const char* names[] { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
        for (int i = 0; i < 12; ++i)
            keysMenu.addItem (10 + i, names[i], true, scaleRoot == i);
        m.addSubMenu ("Key", keysMenu);
        juce::PopupMenu scaleMenu;
        scaleMenu.addItem (30, "Major", true, scaleMode == 0);
        scaleMenu.addItem (31, "Minor", true, scaleMode == 1);
        m.addSubMenu ("Scale", scaleMenu);
        m.addSeparator();
        m.addItem (40, "Group selected");
        m.addItem (41, "Ungroup");
        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&moreButton), [this] (int r)
        {
            if (r == 1) { scaleGuide = ! scaleGuide; grid->repaint(); }
            else if (r >= 10 && r < 22) { scaleRoot = r - 10; grid->repaint(); }
            else if (r == 30 || r == 31) { scaleMode = r - 30; grid->repaint(); }
            else if (r == 40)
            {
                if (auto* clip = getEditedClip())
                {
                    int group = 0;
                    for (const auto& n : clip->notes) group = juce::jmax (group, n.group);
                    session.beginTransaction ("Group notes");
                    for (auto& n : clip->notes) if (n.selected) n.group = group + 1;
                    session.notify (DawSession::notesChanged);
                }
            }
            else if (r == 41)
            {
                if (auto* clip = getEditedClip())
                {
                    session.beginTransaction ("Ungroup notes");
                    for (auto& n : clip->notes) if (n.selected) n.group = 0;
                    session.notify (DawSession::notesChanged);
                }
            }
        });
    };
    addAndMakeVisible (moreButton);

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
                    note.setVelocityMidi (juce::roundToInt (v));
                    any = true;
                }
            }

            if (any)
                session.notify (DawSession::notesChanged);
        }
    };
    addAndMakeVisible (velocityField);

    zoomInButton.setTooltip ("Zoom in  (Ctrl + wheel)");
    zoomInButton.onClick = [this] { pixelsPerBeat = juce::jmin (280.0, pixelsPerBeat * 1.3); updateContentSize(); };
    addAndMakeVisible (zoomInButton);

    zoomOutButton.setTooltip ("Zoom out  (Ctrl + wheel)");
    zoomOutButton.onClick = [this] { pixelsPerBeat = juce::jmax (12.0, pixelsPerBeat / 1.3); updateContentSize(); };
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
        if (velocityLane != nullptr)
            velocityLane->repaint();
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

        if (velocityLane != nullptr)
            velocityLane->repaint();
        repaint (rulerBounds);
    };
    addAndMakeVisible (gridViewport);
    addAndMakeVisible (*velocityLane);

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
        session.beginTransaction ("Delete notes");
        clip->notes.erase (std::remove_if (clip->notes.begin(), clip->notes.end(),
                                           [] (const MidiNote& n) { return n.selected; }),
                           clip->notes.end());

        if (clip->notes.size() != before)
            session.notify (DawSession::notesChanged);
    }
}

bool PianoRoll::hasSelectedNotes() const
{
    if (auto* clip = session.getClip (session.getSelectedClip()))
        for (const auto& note : clip->notes)
            if (note.selected)
                return true;

    return false;
}

void PianoRoll::duplicateSelectedNotes()
{
    auto* clip = getEditedClip();

    if (clip == nullptr)
        return;

    std::vector<MidiNote> selected;
    juce::int64 startTick = std::numeric_limits<juce::int64>::max();
    juce::int64 endTick = 0;

    for (const auto& note : clip->notes)
        if (note.selected)
        {
            selected.push_back (note);
            startTick = juce::jmin (startTick, note.getStartTick());
            endTick = juce::jmax (endTick, note.getEndTick());
        }

    if (selected.empty())
        return;

    session.beginTransaction ("Duplicate notes");
    const auto shift = juce::jmax (NoteModel::minDurationTicks, endTick - startTick);

    for (auto& note : clip->notes)
        note.selected = false;

    for (auto copy : selected)
    {
        copy.id = 0;
        copy.setStartTick (copy.getStartTick() + shift);
        copy.selected = true;
        clip->notes.push_back (copy);
    }

    session.notify (DawSession::notesChanged);
}

void PianoRoll::quantizeSelectedNotes()
{
    auto* clip = getEditedClip();

    if (clip == nullptr)
        return;

    const auto gridTicks = MusicalTime::beatsToTicks (session.getSnapGridBeats());
    if (gridTicks <= 0)
        return;

    session.beginTransaction ("Quantize notes");
    bool any = false;

    for (auto& note : clip->notes)
        if (note.selected)
        {
            note.setStartTick (NoteModel::quantizeTick (note.getStartTick(), gridTicks, 1.0f));
            any = true;
        }

    if (any)
        session.notify (DawSession::notesChanged);
}

void PianoRoll::copySelectedNotes()
{
    auto* clip = getEditedClip();
    if (clip == nullptr)
        return;

    juce::Array<juce::var> notes;
    for (const auto& note : clip->notes)
        if (note.selected)
            notes.add (noteToEngineVar (note));

    if (notes.isEmpty())
        return;

    auto* object = new juce::DynamicObject();
    object->setProperty ("format", "dawweb-notes");
    object->setProperty ("version", 1);
    object->setProperty ("ppq", (int) MusicalTime::ticksPerQuarterNote);
    object->setProperty ("notes", notes);
    juce::SystemClipboard::copyTextToClipboard (juce::JSON::toString (juce::var (object), false));
}

void PianoRoll::pasteNotes()
{
    auto* clip = getEditedClip();
    if (clip == nullptr)
        return;

    auto parsed = juce::JSON::parse (juce::SystemClipboard::getTextFromClipboard());
    auto* notes = parsed.getProperty ("notes", juce::var()).getArray();
    if (notes == nullptr || parsed.getProperty ("format", {}).toString() != "dawweb-notes")
        return;

    session.beginTransaction ("Paste notes");
    for (auto& note : clip->notes)
        note.selected = false;

    for (const auto& item : *notes)
    {
        MidiNote note;
        applyNoteFields (note, item);
        note.id = 0;
        note.selected = true;
        clip->notes.push_back (note);
    }

    session.notify (DawSession::notesChanged);
}

void PianoRoll::muteSelectedNotes()
{
    auto* clip = getEditedClip();
    if (clip == nullptr)
        return;

    bool allMuted = true;
    for (const auto& note : clip->notes)
        if (note.selected && ! note.muted)
            allMuted = false;

    session.beginTransaction ("Mute notes");
    for (auto& note : clip->notes)
        if (note.selected)
            note.muted = ! allMuted;

    session.notify (DawSession::notesChanged);
    if (inspector != nullptr)
        inspector->repaint();
}

void PianoRoll::applySnapPreset (int index)
{
    if (! juce::isPositiveAndBelow (index, (int) std::size (snapPresets)))
        return;

    const auto& preset = snapPresets[index];
    session.setSnapEnabled (! preset.off);
    if (! preset.off)
    {
        auto beats = preset.beats;
        if (std::abs (beats - 4.0) < 1.0e-6)
            beats = (double) session.getBeatsPerBar();
        session.setSnapGridBeats (beats);
    }
    snapButton.setButtonText (preset.name);
}

void PianoRoll::selectGroup (int group)
{
    if (auto* clip = getEditedClip())
        for (auto& note : clip->notes)
            note.selected = note.group == group && group > 0;
}

void PianoRoll::notifyNotesCoalesced()
{
    const auto now = juce::Time::getMillisecondCounter();
    if (now - lastNoteNotifyMs < 32)
    {
        if (grid != nullptr)
            grid->repaint();
        if (velocityLane != nullptr)
            velocityLane->repaint();
        return;
    }

    lastNoteNotifyMs = now;
    session.notify (DawSession::notesChanged);
}

void PianoRoll::showNoteMenu (juce::Point<int> position)
{
    juce::PopupMenu m;
    m.addItem (1, "Edit");
    m.addItem (2, "Duplicate");
    m.addItem (3, "Mute");
    m.addItem (4, "Delete");
    m.addItem (5, "Repeat");
    m.addItem (6, "Advanced");
    m.showMenuAsync (juce::PopupMenu::Options().withTargetScreenArea ({ position.x, position.y, 1, 1 }),
                     [this] (int r)
    {
        if (r == 1) { inspectorOpen = true; inspectorAdvanced = false; resized(); }
        if (r == 2) duplicateSelectedNotes();
        if (r == 3) muteSelectedNotes();
        if (r == 4) deleteSelectedNotes();
        if (r == 5)
        {
            if (auto* clip = getEditedClip())
            {
                session.beginTransaction ("Repeat");
                for (auto& note : clip->notes)
                    if (note.selected)
                        note.repeatMode = (note.repeatMode + 1) % 15;
                session.notify (DawSession::notesChanged);
            }
        }
        if (r == 6) { inspectorOpen = true; inspectorAdvanced = true; resized(); }
    });
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

    const auto loopX0 = (float) ((session.getLoopStart() - clip->startBeat) * pixelsPerBeat - scrollX) + (float) rulerBounds.getX();
    const auto loopX1 = (float) ((session.getLoopEnd() - clip->startBeat) * pixelsPerBeat - scrollX) + (float) rulerBounds.getX();
    g.setColour (DawColours::accent.withAlpha (0.18f));
    g.fillRect (loopX0, (float) rulerBounds.getY(), juce::jmax (2.0f, loopX1 - loopX0), (float) rulerBounds.getHeight());

    g.setFont (juce::FontOptions (9.0f));
    for (const auto& marker : session.project().getMarkers())
    {
        const auto x = (float) ((marker.startBeat - clip->startBeat) * pixelsPerBeat - scrollX) + (float) rulerBounds.getX();
        if (x < (float) rulerBounds.getX() - 40.0f || x > (float) rulerBounds.getRight())
            continue;
        g.setColour (juce::Colour (0xff4a4a4a));
        g.drawVerticalLine ((int) x, (float) rulerBounds.getY() + 2.0f, (float) rulerBounds.getBottom() - 1.0f);
        g.setColour (DawColours::textMuted);
        g.drawText (marker.name, (int) x + 3, rulerBounds.getY(), 64, rulerBounds.getHeight(),
                    juce::Justification::centredLeft, false);
    }
}

void PianoRoll::resized()
{
    auto r = getLocalBounds();

    auto toolbar = r.removeFromTop (26).reduced (8, 3);
    clipLabel.setBounds (toolbar.removeFromLeft (juce::jmin (140, toolbar.getWidth() / 4)));
    drawTool.setBounds (toolbar.removeFromLeft (44).withSizeKeepingCentre (42, 18));
    selectTool.setBounds (toolbar.removeFromLeft (50).withSizeKeepingCentre (48, 18));
    eraseTool.setBounds (toolbar.removeFromLeft (48).withSizeKeepingCentre (46, 18));
    toolbar.removeFromLeft (6);
    snapButton.setBounds (toolbar.removeFromLeft (52).withSizeKeepingCentre (50, 18));
    quantizeButton.setBounds (toolbar.removeFromLeft (28).withSizeKeepingCentre (26, 18));
    moreButton.setBounds (toolbar.removeFromLeft (28).withSizeKeepingCentre (26, 18));
    toolbar.removeFromLeft (8);

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

    velocityLane->setBounds (r.removeFromBottom (velocityLaneHeight));
    keysViewport.setBounds (r.removeFromLeft (keyboardWidth));
    gridViewport.setBounds (r);

    if (inspector != nullptr)
    {
        inspector->setVisible (inspectorOpen && getEditedClip() != nullptr);
        if (inspector->isVisible())
        {
            const auto h = inspector->preferredHeight();
            inspector->setBounds (gridViewport.getRight() - 176, gridViewport.getY() + 8, 168, h);
            inspector->toFront (false);
        }
    }

    updateContentSize();
    scrollToContent();
}

void PianoRoll::mouseDown (const juce::MouseEvent& e)
{
    if (! rulerBounds.contains (e.getPosition()))
        return;

    const auto* clip = session.getClip (session.getSelectedClip());
    if (clip == nullptr)
        return;

    const auto scrollX = gridViewport.getViewPositionX();
    const auto beat = clip->startBeat + (e.x - rulerBounds.getX() + scrollX) / pixelsPerBeat;
    const auto loopStartX = (int) ((session.getLoopStart() - clip->startBeat) * pixelsPerBeat - scrollX) + rulerBounds.getX();
    const auto loopEndX = (int) ((session.getLoopEnd() - clip->startBeat) * pixelsPerBeat - scrollX) + rulerBounds.getX();

    if (std::abs (e.x - loopStartX) <= 10)
        rulerDrag = RulerDrag::loopStart;
    else if (std::abs (e.x - loopEndX) <= 10)
        rulerDrag = RulerDrag::loopEnd;
    else
    {
        rulerDrag = RulerDrag::none;
        session.setPositionBeats (juce::jmax (0.0, beat));
    }
}

void PianoRoll::mouseDrag (const juce::MouseEvent& e)
{
    if (rulerDrag == RulerDrag::none)
        return;

    const auto* clip = session.getClip (session.getSelectedClip());
    if (clip == nullptr)
        return;

    const auto beat = juce::jmax (0.0, clip->startBeat
        + (e.x - rulerBounds.getX() + gridViewport.getViewPositionX()) / pixelsPerBeat);

    if (rulerDrag == RulerDrag::loopStart)
        session.setLoopRange (juce::jmin (beat, session.getLoopEnd() - 0.25), session.getLoopEnd());
    else
        session.setLoopRange (session.getLoopStart(), juce::jmax (beat, session.getLoopStart() + 0.25));
}

void PianoRoll::mouseUp (const juce::MouseEvent&)
{
    rulerDrag = RulerDrag::none;
}

void PianoRoll::mouseDoubleClick (const juce::MouseEvent& e)
{
    if (! rulerBounds.contains (e.getPosition()))
        return;

    const auto* clip = session.getClip (session.getSelectedClip());
    if (clip == nullptr)
        return;

    const auto beat = clip->startBeat + (e.x - rulerBounds.getX() + gridViewport.getViewPositionX()) / pixelsPerBeat;
    ArrangementMarker* found = nullptr;
    for (auto& marker : session.project().getMarkers())
        if (std::abs (marker.startBeat - beat) < 0.35)
            found = &marker;

    if (found == nullptr)
        return;

    auto* window = new juce::AlertWindow ("Marker", "Rename", juce::MessageBoxIconType::NoIcon);
    window->addTextEditor ("name", found->name);
    window->addButton ("OK", 1, juce::KeyPress (juce::KeyPress::returnKey));
    window->addButton ("Cancel", 0, juce::KeyPress (juce::KeyPress::escapeKey));
    const auto id = found->id;
    window->enterModalState (true, juce::ModalCallbackFunction::create (
        [this, id, window] (int result)
        {
            if (result == 1)
            {
                const auto name = window->getTextEditorContents ("name");
                for (auto& marker : session.project().getMarkers())
                    if (marker.id == id)
                        marker.name = name;
                session.notify (DawSession::projectChanged);
                repaint();
            }
        }), true);
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
    clipLabel.setText (clip->name + (track != nullptr ? "   -   " + track->name : juce::String())
                           + (track != nullptr && track->techniqueId.isNotEmpty() ? "  " + track->techniqueId : juce::String())
                           + (track != nullptr && track->legatoEnabled ? "  Legato ON" : juce::String()),
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
        keys->repaint();
        if (velocityLane != nullptr)
            velocityLane->repaint();
        if (inspector != nullptr)
            inspector->repaint();
        refreshToolbar();
        return;
    }

    if ((changeFlags & (DawSession::notesChanged | DawSession::clipsChanged
                        | DawSession::viewChanged | DawSession::projectChanged)) != 0)
    {
        updateContentSize();
        grid->repaint();
        keys->repaint();
        if (velocityLane != nullptr)
            velocityLane->repaint();
        if (inspector != nullptr)
            inspector->repaint();
        refreshToolbar();
        return;
    }

    if ((changeFlags & (DawSession::positionChanged | DawSession::transportChanged)) != 0)
    {
        grid->playheadMoved();
        repaint (rulerBounds);
    }
}
