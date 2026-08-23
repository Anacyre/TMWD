#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

class AutomationLaneCanvas;

/** Mock automation editor for the selected track: one lane of draggable breakpoints. */
class AutomationView  : public juce::Component,
                        private DawSession::Listener
{
public:
    explicit AutomationView (DawSession& sessionToUse);
    ~AutomationView() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void sessionChanged (int changeFlags) override;
    void updateContentSize();
    void refreshToolbar();
    void drawRuler (juce::Graphics&);

    AutomationLane* getLane();

    class LaneViewport  : public juce::Viewport
    {
    public:
        std::function<void()> onMoved;
        void visibleAreaChanged (const juce::Rectangle<int>&) override
        {
            if (onMoved)
                onMoved();
        }
    };

    DawSession& session;

    juce::Label trackLabel, hintLabel;
    juce::TextButton parameterButton { "Volume" };
    IconButton clearButton { Icons::drawScissors };

    std::unique_ptr<AutomationLaneCanvas> canvas;
    LaneViewport viewport;
    juce::Rectangle<int> scaleBounds, rulerBounds;

    friend class AutomationLaneCanvas;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (AutomationView)
};
