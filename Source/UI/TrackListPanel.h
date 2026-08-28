#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

/** One row of the track list.  Adapts its content to the current track height. */
class TrackStrip  : public juce::Component
{
public:
    TrackStrip (DawSession& sessionToUse, int trackIndex);

    void resized() override;
    void paint (juce::Graphics&) override;
    void mouseDown (const juce::MouseEvent&) override;
    void mouseDoubleClick (const juce::MouseEvent&) override;

    void refresh();
    void refreshMeter();
    int getTrackIndex() const noexcept { return index; }

private:
    void showTrackMenu();
    TrackData* track() { return session.getTrack (index); }
    const TrackData* track() const { return session.getTrack (index); }

    DawSession& session;
    int index = 0;
    juce::Rectangle<int> twistBounds;

    juce::Label nameLabel, instrumentLabel;
    juce::Slider volume, pan;
    juce::TextButton mute { "M" }, solo { "S" }, arm { "R" };
    IconButton menuButton { Icons::drawMenu };
    LevelMeter meter { true };   // summed to one lane: the strip only has a few pixels for it
};

//==============================================================================
class TrackListPanel  : public juce::Component,
                        private DawSession::Listener
{
public:
    explicit TrackListPanel (DawSession& sessionToUse);
    ~TrackListPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    void setViewY (int y);
    int getViewY() const;
    std::function<void (int)> onVerticalScroll;

private:
    void sessionChanged (int changeFlags) override;
    void rebuildTracks();
    void updateContentSize();

    DawSession& session;
    juce::Label headerLabel;
    IconButton addButton { Icons::drawPlus };
    IconButton heightButton { Icons::drawGrid };

    class TracksViewport  : public juce::Viewport
    {
    public:
        std::function<void (int)> onMoved;
        void visibleAreaChanged (const juce::Rectangle<int>&) override
        {
            if (onMoved)
                onMoved (getViewPositionY());
        }
    };

    class TracksContent  : public juce::Component
    {
    public:
        explicit TracksContent (DawSession& s) : session (s) {}

        void resized() override
        {
            auto y = 0;
            const auto h = session.getTrackHeight();

            for (auto* child : getChildren())
            {
                child->setBounds (0, y, getWidth(), h);
                y += h;
            }
        }

        void paint (juce::Graphics& g) override { g.fillAll (DawColours::panel); }

    private:
        DawSession& session;
    };

    TracksViewport viewport;
    TracksContent content { session };
    std::vector<std::unique_ptr<TrackStrip>> strips;
    bool syncing = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TrackListPanel)
};
