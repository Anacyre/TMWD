#pragma once



#include "XEditorBase.h"



class ReverbXPlugin;



/** Log-time decay envelope, mirroring the web Reverb X graph. */

class ReverbDecayGraph final : public juce::Component

{

public:

    explicit ReverbDecayGraph (ReverbXPlugin& owner);



    void paint (juce::Graphics&) override;



private:

    ReverbXPlugin& plugin;

};



class ReverbXEditor final : public XEditorBase

{

public:

    explicit ReverbXEditor (ReverbXPlugin&);



private:

    void layoutContent (juce::Rectangle<int> area) override;

    void refreshMeters() override;

    void paint (juce::Graphics&) override;



    ReverbXPlugin& plugin;



    ReverbDecayGraph graph;

    XMeter outMeter { "Out", false };



    XKnob amountKnob, timeKnob, sizeKnob, mixKnob, widthKnob;

    XKnob preDelayKnob, dampingKnob;

    XChip wetProcess;



    juce::ComboBox venueBox;

    std::unique_ptr<juce::AudioProcessorValueTreeState::ComboBoxAttachment> venueAttachment;



    juce::Rectangle<int> venueLabelArea;



    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (ReverbXEditor)

};

