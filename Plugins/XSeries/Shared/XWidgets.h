#pragma once

#include "XTheme.h"

/** A knob with its caption above and live value below, attached to an APVTS parameter.
    Layout matches the web `dsp-knob` component: caption, dial, value. */
class XKnob final : public juce::Component
{
public:
    enum class Size { small, medium, large };

    XKnob (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
           juce::String caption, Size size = Size::medium);

    void resized() override;
    void paint (juce::Graphics&) override;

    void setAccent (juce::Colour colour);
    juce::Slider& getSlider() noexcept { return slider; }

    static int widthFor (Size size) noexcept;
    static int heightFor (Size size) noexcept;

private:
    juce::Slider slider;
    juce::Label valueLabel;
    juce::String caption;
    Size size;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment;
};

/** Horizontal fader with the caption on the left and the value right-aligned above the rail,
    matching the web `dsp-slider` in horizontal mode. */
class XFader final : public juce::Component
{
public:
    XFader (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
            juce::String caption);

    void resized() override;
    void paint (juce::Graphics&) override;

    juce::Slider& getSlider() noexcept { return slider; }

private:
    juce::Slider slider;
    juce::String caption;
    std::unique_ptr<juce::AudioProcessorValueTreeState::SliderAttachment> attachment;
};

/** Vertical peak meter with a dB scale, peak-hold tick and optional stereo pair.
    Range matches the web meter: -36 dB … +12 dB. */
class XMeter final : public juce::Component
{
public:
    static constexpr float minDb = -36.0f;
    static constexpr float maxDb = 12.0f;

    explicit XMeter (juce::String caption, bool stereo = true);

    /** Called from the editor timer, never from the audio thread. */
    void setLevels (float leftDb, float rightDb);
    void setCaption (juce::String text);

    void paint (juce::Graphics&) override;

private:
    float dbToY (float db, float top, float height) const noexcept;

    juce::String caption;
    bool stereo;
    float levelL = minDb, levelR = minDb;
    float holdL = minDb, holdR = minDb;
    juce::uint32 holdUntilL = 0, holdUntilR = 0;
};

/** A row of chips bound to a choice parameter, drawn on a shared rail. */
class XSegment final : public juce::Component
{
public:
    XSegment (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
              juce::StringArray labels);

    void resized() override;

private:
    void refresh();

    juce::AudioProcessorValueTreeState& state;
    juce::String parameterId;
    juce::OwnedArray<juce::TextButton> chips;
    juce::ParameterAttachment attachment;
};

/** Latching chip bound to a bool parameter. */
class XChip final : public juce::Component
{
public:
    XChip (juce::AudioProcessorValueTreeState& state, const juce::String& parameterId,
           juce::String text);

    void resized() override;

private:
    juce::TextButton button;
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> attachment;
};

/** Large numeric readout with a caption, as used for gain reduction and true peak. */
class XReadout final : public juce::Component
{
public:
    explicit XReadout (juce::String caption);

    void setValue (juce::String text, bool warn = false);
    void paint (juce::Graphics&) override;

private:
    juce::String caption, value { "--" };
    bool warn = false;
};
