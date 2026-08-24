#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "InstrumentPanel.h"
#include "Widgets.h"

/** Right-hand panel describing the current track, clip and project. */
class InspectorPanel  : public juce::Component,
                        private DawSession::Listener
{
public:
    explicit InspectorPanel (DawSession& sessionToUse);
    ~InspectorPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void sessionChanged (int changeFlags) override;
    void refresh();
    void showInstrumentMenu();
    void paintContent (juce::Graphics&);

    struct Section
    {
        juce::String caption;
        std::vector<InfoRow*> rows;
        juce::Rectangle<int> captionBounds;
    };

    InfoRow* addRow (Section& section, const juce::String& name);
    void layoutSection (Section&, juce::Rectangle<int>& area);

    class ContentComponent  : public juce::Component
    {
    public:
        std::function<void (juce::Graphics&)> onPaint;
        void paint (juce::Graphics& g) override { if (onPaint) onPaint (g); }
    };

    DawSession& session;

    juce::Label headerLabel;
    IconButton closeButton { Icons::drawInspector };

    juce::Label trackNameLabel;
    juce::TextButton instrumentButton;
    InstrumentPanel instrumentPanel { session };

    std::vector<std::unique_ptr<InfoRow>> ownedRows;
    Section trackSection { "Track" }, clipSection { "Clip" }, projectSection { "Project" };
    juce::Rectangle<int> colourSwatch, instrumentCaption;

    juce::Viewport viewport;
    ContentComponent content;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InspectorPanel)
};
