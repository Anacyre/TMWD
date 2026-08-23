#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

class ArrangementCanvas;

/** Time ruler plus the scrolling clip canvas. */
class ArrangementView  : public juce::Component,
                         public juce::FileDragAndDropTarget,
                         private DawSession::Listener
{
public:
    explicit ArrangementView (DawSession& sessionToUse);
    ~ArrangementView() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDrag (const juce::MouseEvent&) override;
    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails&) override;

    void setViewY (int y);
    int getViewY() const;
    void scrollPlayheadIntoView();

    std::function<void (int)> onVerticalScroll;

    bool isInterestedInFileDrag (const juce::StringArray& files) override;
    void fileDragEnter (const juce::StringArray&, int, int) override;
    void fileDragMove (const juce::StringArray&, int x, int y) override;
    void fileDragExit (const juce::StringArray&) override;
    void filesDropped (const juce::StringArray& files, int x, int y) override;

private:
    void sessionChanged (int changeFlags) override;
    void updateContentSize();
    void handleRulerDrag (const juce::MouseEvent&, bool isStartOfDrag);
    juce::Point<int> toCanvas (int x, int y) const;
    int getBarLabelStep() const;

    class ArrViewport  : public juce::Viewport
    {
    public:
        std::function<void (int)> onMoved;
        void visibleAreaChanged (const juce::Rectangle<int>&) override
        {
            if (onMoved)
                onMoved (getViewPositionY());
        }
    };

    DawSession& session;
    IconButton snapButton { Icons::drawMagnet, IconButton::Mode::Toggle };
    IconButton zoomOutButton { Icons::drawChevronDown };
    IconButton zoomInButton { Icons::drawChevronUp };
    std::unique_ptr<ArrangementCanvas> canvas;
    ArrViewport viewport;
    juce::Point<int> dropPos { -1, -1 };
    juce::Rectangle<int> rulerBounds;
    bool draggingFiles = false;
    bool draggingLoop = false;
    bool syncing = false;
    double loopAnchorBeat = 0.0;
    float lastRulerPlayheadX = -1.0f;

    friend class ArrangementCanvas;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ArrangementView)
};
