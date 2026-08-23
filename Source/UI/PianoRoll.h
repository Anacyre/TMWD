#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

class PianoRollKeys;
class PianoRollGrid;

/** Note editor for the selected MIDI clip: keyboard, grid and editable notes. */
class PianoRoll  : public juce::Component,
                   private DawSession::Listener
{
public:
    explicit PianoRoll (DawSession& sessionToUse);
    ~PianoRoll() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    /** Removes every selected note of the edited clip. */
    void deleteSelectedNotes();

private:
    void sessionChanged (int changeFlags) override;
    void updateContentSize();
    void scrollToContent();
    void refreshToolbar();

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

    juce::Label clipLabel, statsLabel;
    juce::TextButton lengthButton { "1/4" };
    DragValueLabel velocityField;
    juce::Label velocityCaption;
    IconButton zoomInButton { Icons::drawChevronUp };
    IconButton zoomOutButton { Icons::drawChevronDown };

    std::unique_ptr<PianoRollKeys> keys;
    std::unique_ptr<PianoRollGrid> grid;
    SyncViewport keysViewport, gridViewport;

    juce::Rectangle<int> rulerBounds;

    int noteHeight = 11;
    double pixelsPerBeat = 42.0;
    double newNoteLength = 1.0;
    int previewPitch = -1;
    bool hasScrolledToContent = false;
    bool syncing = false;

    friend class PianoRollKeys;
    friend class PianoRollGrid;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (PianoRoll)
};
