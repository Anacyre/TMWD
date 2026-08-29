#pragma once

#include "XEditorBase.h"

class BoostXPlugin;

/** Synthetic waveform scope driven by amount/mode/activity, like the web Boost X scopes. */
class WaveformScope final : public juce::Component
{
public:
    WaveformScope (juce::String caption, bool isOutput);

    void update (float amount, int mode, float activity, float phase);
    void paint (juce::Graphics&) override;

private:
    juce::String caption;
    bool isOutput;
    float amount = 0.35f;
    int mode = 0;
    float activity = 0.0f;
    float phase = 0.0f;
};

class BoostXEditor final : public XEditorBase
{
public:
    explicit BoostXEditor (BoostXPlugin&);

private:
    void layoutContent (juce::Rectangle<int> area) override;
    void refreshMeters() override;
    void paint (juce::Graphics&) override;

    BoostXPlugin& plugin;

    WaveformScope inScope { "In", false };
    WaveformScope outScope { "Out", true };
    XMeter outMeter { "Out" };

    XKnob amountKnob;
    XKnob mixKnob, hpfKnob, outputGainKnob;
    XSegment modeSegment, oversampling;

    juce::Rectangle<int> oversamplingLabelArea, hintArea;
    float animPhase = 0.0f;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BoostXEditor)
};
