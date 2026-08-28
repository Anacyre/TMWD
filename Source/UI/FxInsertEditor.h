#pragma once

#include "DawSession.h"
#include <JuceHeader.h>

class FxInsertEditorPanel  : public juce::Component,
                             private DawSession::Listener
{
public:
    FxInsertEditorPanel (DawSession& sessionToUse);
    ~FxInsertEditorPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    void bind (int trackIndex, int slotIndex);

private:
    void sessionChanged (int changeFlags) override;
    void refresh();
    void openDesignedUiInBrowser();
    juce::String pluginIdForCurrentInsert() const;
    static juce::String pluginEditorUrl (const juce::String& pluginId,
                                         int trackIndex,
                                         int slotIndex)
    {
        return "http://127.0.0.1:5173/#/pages/plugin-editor/index?pluginId=" + pluginId
             + "&trackIndex=" + juce::String (trackIndex)
             + "&slotIndex=" + juce::String (slotIndex);
    };

    DawSession& session;
    int trackIndex = -1;
    int slotIndex = -1;
    juce::Label titleLabel, bodyLabel;
    juce::TextButton openButton { "Open designed UI" };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FxInsertEditorPanel)
};

class FxInsertEditorWindow  : public juce::DocumentWindow
{
public:
    explicit FxInsertEditorWindow (DawSession& sessionToUse);
    ~FxInsertEditorWindow() override;

    void closeButtonPressed() override;
    void bind (int trackIndex, int slotIndex, const juce::String& windowTitle);

    std::function<void()> onClose;

private:
    DawSession& session;
    std::unique_ptr<FxInsertEditorPanel> panel;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (FxInsertEditorWindow)
};
