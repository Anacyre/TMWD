#pragma once



#include "XEditorBase.h"



class DynamicXPlugin;



/** Compressor transfer curve using DynamicXCore::computeGainDb. */

class DynamicTransferGraph final : public juce::Component

{

public:

    static constexpr float inMinDb = -48.0f;

    static constexpr float inMaxDb = 0.0f;

    static constexpr float outMinDb = -48.0f;

    static constexpr float outMaxDb = 12.0f;



    explicit DynamicTransferGraph (DynamicXPlugin& owner);



    void paint (juce::Graphics&) override;



private:

    DynamicXPlugin& plugin;



    float mapIn (float db, float width) const noexcept;

    float dbToY (float db, float top, float height) const noexcept;

};



/** Vertical gain-reduction column. */

class GainReductionColumn final : public juce::Component

{

public:

    static constexpr float minDb = -24.0f;



    GainReductionColumn();



    void setReductionDb (float db);

    void paint (juce::Graphics&) override;



private:

    float reduction = 0.0f;

};



class DynamicXEditor final : public XEditorBase

{

public:

    explicit DynamicXEditor (DynamicXPlugin&);



private:

    void layoutContent (juce::Rectangle<int> area) override;

    void refreshMeters() override;

    void paint (juce::Graphics&) override;



    void selectBand (int index);



    DynamicXPlugin& plugin;



    DynamicTransferGraph graph;

    GainReductionColumn grColumn;

    XMeter inMeter { "In" };

    XMeter outMeter { "Out" };

    XReadout grReadout { "GR" };



    XKnob threshKnob, ratioKnob, kneeKnob, mixKnob, lookaheadKnob;

    XFader attackFader, releaseFader, gainFader;

    XSegment detector;

    XChip autoGain, autoRelease, splitBands;



    juce::OwnedArray<juce::TextButton> bandButtons;

    std::array<std::unique_ptr<XKnob>, 3> bandThreshKnobs;

    std::array<std::unique_ptr<XKnob>, 3> bandRatioKnobs;

    std::array<std::unique_ptr<XChip>, 3> bandEnableChips;

    std::array<std::unique_ptr<XChip>, 3> bandSoloChips;



    int selectedBand = 0;

    juce::Rectangle<int> bandRowArea, detectorLabelArea;



    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (DynamicXEditor)

};

