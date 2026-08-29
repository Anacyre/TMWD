#pragma once

#include "XEditorBase.h"

class EqualizerXPlugin;

/** Log-frequency EQ curve drawn from the native `magnitudeDb` query. */
class EqCurveGraph final : public juce::Component
{
public:
    explicit EqCurveGraph (EqualizerXPlugin& owner);

    void setSelectedBand (int index);
    void paint (juce::Graphics&) override;

private:
    EqualizerXPlugin& plugin;
    int selectedBand = 0;
};

class EqualizerXEditor final : public XEditorBase
{
public:
    explicit EqualizerXEditor (EqualizerXPlugin&);

private:
    void layoutContent (juce::Rectangle<int> area) override;
    void refreshMeters() override;
    void paint (juce::Graphics&) override;

    EqualizerXPlugin& plugin;

    EqCurveGraph graph;
    XMeter outMeter { "Gain", false };

    std::unique_ptr<XKnob> gainKnob, freqKnob, qKnob;
    std::unique_ptr<XSegment> shapeSegment, slopeSegment;
    std::unique_ptr<XChip> enableChip, soloChip;
    XSegment oversampling;
    XChip autoGain;

    juce::OwnedArray<juce::TextButton> bandButtons;
    int selectedBand = 0;

    void selectBand (int index);

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EqualizerXEditor)
};
