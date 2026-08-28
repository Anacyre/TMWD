#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"
#include "PianoRoll.h"
#include "AutomationView.h"

class TrackInfoView;

/** Lower editor panel: switches between the piano roll, automation and track info. */
class EditorPanel  : public juce::Component,
                     private DawSession::Listener
{
public:
    explicit EditorPanel (DawSession& sessionToUse);
    ~EditorPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    /** Forwards a delete request to whichever editor is showing. */
    void deleteSelection();
    void duplicateSelection();
    void copySelection();
    void pasteSelection();
    bool hasNoteSelection() const;

private:
    void sessionChanged (int changeFlags) override;
    void updateVisibleView();

    DawSession& session;

    TabStrip tabs;
    juce::Label contextLabel;
    IconButton closeButton { Icons::drawChevronDown };

    PianoRoll pianoRoll { session };
    AutomationView automation { session };
    std::unique_ptr<TrackInfoView> trackInfo;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EditorPanel)
};
