#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

class PianoRollKeys;
class PianoRollGrid;
class PianoRollVelocity;
class NoteInspector;

/** Note editor for the selected MIDI clip: keyboard, grid and editable notes. */
class PianoRoll  : public juce::Component,
                   private DawSession::Listener
{
public:
    explicit PianoRoll (DawSession& sessionToUse);
    ~PianoRoll() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseUp (const juce::MouseEvent&) override;
    void mouseDoubleClick (const juce::MouseEvent&) override;

    /** Removes every selected note of the edited clip. */
    void deleteSelectedNotes();
    void duplicateSelectedNotes();
    void quantizeSelectedNotes();
    void copySelectedNotes();
    void pasteNotes();
    void muteSelectedNotes();
    bool hasSelectedNotes() const;

    enum class Tool { draw, select, erase };
    Tool getTool() const noexcept { return tool; }

private:
    void sessionChanged (int changeFlags) override;
    void updateContentSize();
    void scrollToContent();
    void refreshToolbar();
    void applySnapPreset (int index);
    void showNoteMenu (juce::Point<int> position);
    void selectGroup (int group);
    void notifyNotesCoalesced();

    ClipData* getEditedClip();
    int getNoteHeight() const noexcept { return noteHeight; }
    double getPixelsPerBeat() const noexcept { return pixelsPerBeat; }

    void startPreview (int pitch, float velocity = 0.8f);
    void stopPreview();

    class SyncViewport  : public juce::Viewport
    {
    public:
        std::function<void (juce::Point<int>)> onMoved;
        void visibleAreaChanged (const juce::Rectangle<int>&) override
        {
            if (onMoved)
                onMoved (getViewPosition());
        }
    };

    DawSession& session;

    juce::Label clipLabel, statsLabel, contextLabel;
    juce::TextButton lengthButton { "1/16" };
    juce::TextButton drawTool { "Draw" }, selectTool { "Select" }, eraseTool { "Erase" };
    juce::TextButton snapButton { "1/16" }, quantizeButton { "Q" }, moreButton { "..." };
    DragValueLabel velocityField;
    juce::Label velocityCaption;
    IconButton zoomInButton { Icons::drawChevronUp };
    IconButton zoomOutButton { Icons::drawChevronDown };

    std::unique_ptr<PianoRollKeys> keys;
    std::unique_ptr<PianoRollGrid> grid;
    std::unique_ptr<PianoRollVelocity> velocityLane;
    std::unique_ptr<NoteInspector> inspector;
    SyncViewport keysViewport, gridViewport;

    juce::Rectangle<int> rulerBounds;

    int noteHeight = 12;
    double pixelsPerBeat = 48.0;
    double newNoteLength = 0.25;
    int previewPitch = -1;
    bool hasScrolledToContent = false;
    bool syncing = false;
    Tool tool = Tool::draw;
    int velocityLaneHeight = 52;
    bool scaleGuide = true;
    int scaleRoot = 0;
    int scaleMode = 0;
    bool inspectorOpen = false;
    juce::uint32 lastNoteNotifyMs = 0;
    enum class RulerDrag { none, loopStart, loopEnd };
    RulerDrag rulerDrag = RulerDrag::none;

    friend class PianoRollKeys;
    friend class PianoRollGrid;
    friend class PianoRollVelocity;
    friend class NoteInspector;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PianoRoll)
};
