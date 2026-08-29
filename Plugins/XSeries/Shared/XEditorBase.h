#pragma once

#include "XLookAndFeel.h"
#include "XPresets.h"
#include "XWidgets.h"

/** Chrome shared by every X Series editor: the warm chassis background and the header row
    holding the script mark, the plugin name, the preset selector and the bypass switch.

    Subclasses lay their own content out inside `getContentArea()`.
*/
class XEditorBase : public juce::AudioProcessorEditor,
                    private juce::Timer
{
public:
    XEditorBase (juce::AudioProcessor& processor,
                 juce::AudioProcessorValueTreeState& state,
                 juce::String displayName,
                 std::vector<XPreset> presets,
                 int defaultWidth, int defaultHeight);

    ~XEditorBase() override;

    void paint (juce::Graphics&) override;
    void resized() override final;

protected:
    /** Must be the last statement of every subclass constructor. Sizing the editor triggers
        layoutContent(), which cannot run until the subclass members exist. */
    void finishConstruction();

    /** Everything below the header. */
    juce::Rectangle<int> getContentArea() const;

    /** Called whenever the editor is resized, with the area below the header. */
    virtual void layoutContent (juce::Rectangle<int> area) = 0;

    /** Called at the metering refresh rate on the message thread. */
    virtual void refreshMeters() {}

    juce::AudioProcessorValueTreeState& state;

private:
    void timerCallback() override;
    void drawMark (juce::Graphics&, juce::Rectangle<int> area) const;

    XLookAndFeel lookAndFeel;
    juce::String displayName;
    std::vector<XPreset> presets;

    juce::ComboBox presetBox;
    juce::TextButton powerButton { "" };
    std::unique_ptr<juce::AudioProcessorValueTreeState::ButtonAttachment> bypassAttachment;

    int defaultWidth = 600;
    int defaultHeight = 420;
    bool constructed = false;

    static constexpr int headerHeight = 42;
};
