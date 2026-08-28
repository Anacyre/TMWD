#pragma once

#include "DawSession.h"
#include <JuceHeader.h>

class MOrchestraPanel  : public juce::Component,
                         private DawSession::Listener
{
public:
    explicit MOrchestraPanel (DawSession& sessionToUse);
    ~MOrchestraPanel() override;

    void paint (juce::Graphics&) override;
    void resized() override;
    void setTrackIndex (int newTrackIndex);
    int getTrackIndex() const noexcept { return trackIndex; }

private:
    class FamilyRail;
    class Hero;
    class GoldKnob;
    class MiniKeyboard;
    class LibraryGrid;

    void sessionChanged (int changeFlags) override;
    void applySessionChange();
    void rebuild();
    void refreshValues();
    TrackData* getTrack();
    const TrackData* getTrack() const;
    void selectFamily (const juce::String& familyId);
    void selectInstrument (const juce::String& definitionId);
    void applyTechnique (const juce::String& techniqueId);
    void applyControl (const juce::String& controlId, float value);

    DawSession& session;
    int trackIndex = -1;
    TrackId boundTrackId = 0;
    juce::String familyId { "strings" };
    bool rebuilding = false;
    bool rebuildPending = false;
    bool sessionUpdateScheduled = false;
    int pendingChangeFlags = 0;
    juce::String lastInstrumentId, lastTechniqueId;

    juce::Label brandLabel, subLabel, statusLabel;
    std::unique_ptr<FamilyRail> familyRail;
    std::unique_ptr<Hero> hero;
    juce::OwnedArray<juce::TextButton> techniqueButtons;
    juce::OwnedArray<GoldKnob> knobs;
    std::unique_ptr<MiniKeyboard> keyboard;
    std::unique_ptr<LibraryGrid> libraryGrid;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (MOrchestraPanel)
};

class MOrchestraWindow  : public juce::DocumentWindow
{
public:
    explicit MOrchestraWindow (DawSession& sessionToUse);
    ~MOrchestraWindow() override;

    void closeButtonPressed() override;
    void setTrackIndex (int trackIndex);
    MOrchestraPanel& getPanel() noexcept { return *panel; }

    std::function<void()> onClose;

private:
    std::unique_ptr<MOrchestraPanel> panel;
};
