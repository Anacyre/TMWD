#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

/** Playback controls, tempo / metre, playhead readout and panel visibility toggles. */
class TransportBar  : public juce::Component,
                      private DawSession::Listener
{
public:
    explicit TransportBar (DawSession& sessionToUse);
    ~TransportBar() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;

private:
    void sessionChanged (int changeFlags) override;
    void refresh();
    void refreshPosition();

    DawSession& session;

    IconButton metronomeButton { Icons::drawMetronome, IconButton::Mode::Toggle };
    DragValueLabel bpmField;
    juce::Label bpmCaption, sigCaption, positionCaption, secondsCaption;
    juce::TextButton timeSigButton { "4/4" };

    IconButton toStartButton { Icons::drawToStart };
    IconButton playButton   { Icons::drawPlay, IconButton::Mode::Toggle };
    IconButton pauseButton  { Icons::drawPause, IconButton::Mode::Toggle };
    IconButton stopButton   { Icons::drawStop };
    IconButton recordButton { Icons::drawRecord, IconButton::Mode::Toggle };
    IconButton loopButton   { Icons::drawLoop, IconButton::Mode::Toggle };

    juce::Label positionLabel, secondsLabel;

    juce::TextButton snapButton { "1/1" };
    MixVisualizer visualizer;
    IconButton editorToggle    { Icons::drawNote, IconButton::Mode::Toggle };
    IconButton mixerToggle     { Icons::drawMixer, IconButton::Mode::Toggle };
    IconButton arrangeToggle   { Icons::drawArrange, IconButton::Mode::Toggle };
    IconButton inspectorToggle { Icons::drawInspector, IconButton::Mode::Toggle };

    juce::Rectangle<int> readoutBounds;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TransportBar)
};
