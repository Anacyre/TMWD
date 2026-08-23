#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Widgets.h"

/** Thin footer showing the current selection, hints and (mock) engine status. */
class StatusBar  : public juce::Component,
                   private DawSession::Listener
{
public:
    explicit StatusBar (DawSession& sessionToUse);
    ~StatusBar() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void sessionChanged (int changeFlags) override;
    void refresh();

    DawSession& session;
    juce::Label selectionLabel, hintLabel, engineLabel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (StatusBar)
};
