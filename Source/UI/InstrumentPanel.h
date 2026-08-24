#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include "Widgets.h"

/*  Compact instrument / technique / controller strip.  Generated from catalogue data.
    Never hosts a native VST editor.
*/
class InstrumentPanel  : public juce::Component,
                         private DawSession::Listener
{
public:
    explicit InstrumentPanel (DawSession& sessionToUse);
    ~InstrumentPanel() override;

    void resized() override;
    int getPreferredHeight() const;

private:
    struct ControllerRow
    {
        juce::String id;
        juce::Label name;
        juce::Slider slider;
        juce::Label value;
        bool mapped = false;
    };

    void sessionChanged (int changeFlags) override;
    void rebuild();
    TrackData* getTrack();
    const TrackData* getTrack() const;

    DawSession& session;
    juce::Label sourceLabel, statusLabel, techniqueCaption;
    juce::ComboBox techniqueBox;
    juce::TextButton openSamplerButton { "Open Orchestra Sampler" };
    juce::OwnedArray<juce::Label> groupCaptions;
    juce::OwnedArray<ControllerRow> controllerRows;
    juce::String lastDefinitionId;
    bool rebuilding = false;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InstrumentPanel)
};
