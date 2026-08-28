#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"

/** One mixer channel: inserts, pan, fader, meter and the usual toggles. */
class ChannelStrip  : public juce::Component
{
public:
    ChannelStrip (DawSession& sessionToUse, int trackIndex);

    void paint (juce::Graphics&) override;
    void resized() override;
    void mouseDown (const juce::MouseEvent&) override;

    void refresh();
    void refreshMeter();

private:
    void mouseDoubleClick (const juce::MouseEvent&) override;
    void showInsertMenu (int slotIndex);
    TrackData* track() { return session.getTrack (index); }
    const TrackData* track() const { return session.getTrack (index); }

    DawSession& session;
    int index = 0;

    juce::Label nameLabel, instrumentLabel, dbLabel;
    std::array<juce::TextButton, 5> insertButtons;
    juce::Slider pan, fader;
    juce::TextButton mute { "M" }, solo { "S" };
    LevelMeter meter { true };
};

//==============================================================================
/** Scrollable rack of channel strips with a pinned master channel. */
class MixerPanel  : public juce::Component,
                    private DawSession::Listener
{
public:
    explicit MixerPanel (DawSession& sessionToUse);
    ~MixerPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void sessionChanged (int changeFlags) override;
    void rebuildStrips();

    DawSession& session;
    juce::Label headerLabel;
    IconButton closeButton { Icons::drawChevronDown };

    class StripHolder  : public juce::Component
    {
    public:
        void resized() override
        {
            auto x = 0;

            for (auto* child : getChildren())
            {
                child->setBounds (x, 0, stripWidth, getHeight());
                x += stripWidth;
            }
        }

        static constexpr int stripWidth = 78;
    };

    juce::Viewport viewport;
    StripHolder holder;
    std::vector<std::unique_ptr<ChannelStrip>> strips;
    std::unique_ptr<ChannelStrip> masterStrip;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MixerPanel)
};
