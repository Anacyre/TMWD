#pragma once

#include <JuceHeader.h>
#include "DawLookAndFeel.h"
#include "DawSession.h"
#include "TopBar.h"
#include "TrackListPanel.h"
#include "ArrangementView.h"
#include "EditorPanel.h"
#include "MixerPanel.h"
#include "InspectorPanel.h"
#include "StatusBar.h"
#include "Widgets.h"
#include "StateCaptureWindow.h"

/*  Owns the session and arranges the top-level panels.  All panel-to-panel
    communication goes through DawSession rather than through this class.

    Audio is deliberately not owned here.  The device and the render callback belong to
    the AudioEngine underneath DawSession, so this component never sees an audio buffer.
*/
class MainComponent  : public juce::Component,
                       private juce::KeyListener,
                       private DawSession::Listener
{
public:
    MainComponent();
    explicit MainComponent (EngineAPI& engineToShare);
    ~MainComponent() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void parentHierarchyChanged() override;
    bool keyPressed (const juce::KeyPress& key) override;

private:
    /*  Registered on the window so shortcuts still fire when a panel holds focus. */
    bool keyPressed (const juce::KeyPress& key, juce::Component*) override;

    bool handleShortcut (const juce::KeyPress& key);
    void buildUi();
    void sessionChanged (int changeFlags) override;
    void showAudioSettings();
    void layoutBody();
    void deleteSelection();

    DawLookAndFeel lookAndFeel;
    DawSession session;

    TopBar topBar { session };
    TrackListPanel trackList { session };
    ArrangementView arrangement { session };
    EditorPanel editor { session };
    MixerPanel mixer { session };
    InspectorPanel inspector { session };
    StatusBar statusBar { session };

    SplitterBar trackSplitter { SplitterBar::Orientation::vertical };
    SplitterBar inspectorSplitter { SplitterBar::Orientation::vertical };
    SplitterBar editorSplitter { SplitterBar::Orientation::horizontal };
    SplitterBar mixerSplitter { SplitterBar::Orientation::horizontal };

    juce::TooltipWindow tooltipWindow { this, 600 };
    juce::Component::SafePointer<juce::Component> keyListenerHost;
    std::unique_ptr<StateCaptureWindow> captureWindow;

    int trackListWidth = 140;
    int inspectorWidth = 250;
    int editorHeight = 268;
    int mixerHeight = 236;
    int dragStartValue = 0;

    static constexpr int minTrackListWidth = 120;
    static constexpr int minInspectorWidth = 190;
    static constexpr int minEditorHeight = 150;
    static constexpr int minMixerHeight = 150;
    static constexpr int minArrangementHeight = 120;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MainComponent)
};
