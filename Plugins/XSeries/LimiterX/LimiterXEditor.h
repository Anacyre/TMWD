#pragma once

#include "XEditorBase.h"

class LimiterXPlugin;

/** Scrolling gain-reduction history, mirroring the web Limiter X graph. */
class GainReductionGraph final : public juce::Component
{
public:
    static constexpr float floorDb = -12.0f;

    GainReductionGraph();

    /** Pushes one frame of gain reduction (a negative dB value). */
    void push (float reductionDb, float holdDb);
    void paint (juce::Graphics&) override;

private:
    float dbToY (float db, float top, float height) const noexcept;

    static constexpr int historyLength = 240;
    std::array<float, historyLength> history {};
    int head = 0;
    float hold = 0.0f;
};

class LimiterXEditor final : public XEditorBase
{
public:
    explicit LimiterXEditor (LimiterXPlugin&);

private:
    void layoutContent (juce::Rectangle<int> area) override;
    void refreshMeters() override;
    void paint (juce::Graphics&) override;

    LimiterXPlugin& plugin;

    GainReductionGraph graph;
    XMeter inMeter { "In" };
    XMeter outMeter { "Out" };
    XReadout reductionReadout { "Gain Reduction" };
    XReadout peakReadout { "True Peak" };

    XKnob gainKnob, ceilingKnob, releaseKnob, lookaheadKnob;
    XSegment oversampling;
    XChip truePeak;

    juce::Rectangle<int> footerArea, oversamplingLabelArea, hintArea;
    float shownReduction = 0.0f;
    float shownPeak = -120.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (LimiterXEditor)
};
