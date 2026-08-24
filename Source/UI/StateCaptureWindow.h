#pragma once

#include <JuceHeader.h>
#include "DawSession.h"
#include <functional>

/*  Development-only capture of a known-good VST state.  The native editor may appear
    here so a preset can be prepared; normal DAW use never opens it.
*/
class StateCaptureWindow  : public juce::DocumentWindow
{
public:
    explicit StateCaptureWindow (DawSession& sessionToUse);
    ~StateCaptureWindow() override;

    void closeButtonPressed() override;

    std::function<void()> onClose;

private:
    class Content  : public juce::Component,
                     private juce::Timer
    {
    public:
        explicit Content (DawSession& sessionToUse);
        ~Content() override;
        void resized() override;
        void paint (juce::Graphics&) override;

    private:
        void timerCallback() override;
        juce::String selectedPluginId() const;
        void rebuildPresetBox();
        void updateRemainingLabel();
        const PresetDefinition* selectedPreset() const;
        void showEditorForCurrentPlugin();
        void detachEditor();
        void setBusy (bool shouldBeBusy, const juce::String& message = {});
        void loadSelected();
        void playTest();
        void captureSelected();
        void verifySelected();

        DawSession& session;
        juce::StringArray visiblePresetIds;
        juce::Label pluginCaption, presetCaption, remaining, steps, warning, outputPath, status, editorHint;
        juce::ComboBox pluginBox, presetBox;
        juce::ToggleButton confirm { "I confirm the native editor currently shows this instrument." };
        juce::TextButton loadButton { "Load plugin" },
                         openEditorButton { "Open editor" },
                         playButton { "Play test notes" },
                         captureButton { "Capture" },
                         verifyButton { "Verify fresh instance" };
        std::unique_ptr<juce::DocumentWindow> editorWindow;
        juce::String currentPresetId;
        juce::String loadingName;
        bool busy = false;
        int loadSeconds = 0;
    };

    std::unique_ptr<Content> content;
};
