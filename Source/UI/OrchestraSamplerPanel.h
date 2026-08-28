#pragma once

#include "DawSession.h"
#include "../Plugins/OrchestraSamplerModel.h"
#include <JuceHeader.h>

class OrchestraSamplerPanel  : public juce::Component,
                               private DawSession::Listener
{
public:
    explicit OrchestraSamplerPanel (DawSession& sessionToUse);
    ~OrchestraSamplerPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void setTrackIndex (int newTrackIndex);
    int getTrackIndex() const noexcept { return trackIndex; }

private:
    class TechniqueButton;
    class PerformanceKnob;
    class LegatoSwitch;
    class InstrumentHero;
    class MiniKeyboard;

    void sessionChanged (int changeFlags) override;
    void applySessionChange();
    void rebuild();
    void refreshValues();
    void updateHero();
    void bindToTrack (int index);
    TrackData* getTrack();
    const TrackData* getTrack() const;
    void applyTechnique (const juce::String& techniqueId);
    void applyControl (const juce::String& controlId, float value);
    void applyLegato (bool enabled);
    void playTest();
    void changeInstrument();
    void resetPerformance();

    DawSession& session;
    int trackIndex = -1;
    TrackId boundTrackId = 0;
    InstrumentSnapshot snapshot;
    bool rebuilding = false;
    bool rebuildPending = false;
    bool sessionUpdateScheduled = false;
    int pendingChangeFlags = 0;
    juce::String lastInstrumentId, lastTechniqueId;

    juce::TextButton changeButton { "Change" },
                     playButton { "Play" },
                     settingsButton { "Settings" },
                     resetButton { "Reset performance" };
    juce::Label statusLabel, messageLabel, nameLabel, sourceLabel;
    std::unique_ptr<InstrumentHero> hero;
    juce::OwnedArray<TechniqueButton> techniqueButtons;
    std::unique_ptr<LegatoSwitch> legatoSwitch;
    juce::OwnedArray<PerformanceKnob> knobs;
    juce::OwnedArray<juce::TextButton> toggles;
    juce::StringArray toggleIds;
    std::unique_ptr<MiniKeyboard> keyboard;
    juce::TextEditor debugEditor;
    bool settingsOpen = false;
    juce::Rectangle<int> techniqueLine, performanceLine, settingsLine;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (OrchestraSamplerPanel)
};

class OrchestraSamplerWindow  : public juce::DocumentWindow
{
public:
    explicit OrchestraSamplerWindow (DawSession& sessionToUse);
    ~OrchestraSamplerWindow() override;

    void closeButtonPressed() override;
    void setTrackIndex (int trackIndex);
    OrchestraSamplerPanel& getPanel() noexcept { return *panel; }

    std::function<void()> onClose;

private:
    std::unique_ptr<OrchestraSamplerPanel> panel;
};
