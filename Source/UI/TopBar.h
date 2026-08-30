#pragma once

#include <JuceHeader.h>
#include <memory>
#include "DawSession.h"
#include "Icons.h"
#include "Widgets.h"
#include "TransportBar.h"

/** Project identity, undo/redo and the unified transport strip. */
class TopBar  : public juce::Component,
                private DawSession::Listener
{
public:
    explicit TopBar (DawSession& sessionToUse);
    ~TopBar() override;

    std::function<void()> onShowAudioSettings;
    std::function<void()> onQuit;
    std::function<void()> onCaptureState;

    void commandOpenProject() { openProject(); }
    void commandSaveProject (bool saveAs = false) { saveProject (saveAs); }

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void sessionChanged (int changeFlags) override;
    void refresh();
    void showFileMenu();
    void showEditMenu();
    void showInsertMenu();
    void showViewMenu();
    void showTransportMenu();
    void showHelpMenu();
    void openProject();
    void saveProject (bool saveAs);
    void rememberRecent (const juce::File& file);
    void loadRecentFiles();
    void persistRecentFiles() const;
    static juce::PropertiesFile::Options recentOptions();
    static void showStub (const juce::String& title, const juce::String& message);

    DawSession& session;

    juce::TextButton fileBtn { "Project" }, editBtn { "Edit" }, insertBtn { "Insert" },
                     viewBtn { "View" }, transportBtn { "Transport" }, helpBtn { "Help" };

    juce::Label projectName, userName, projectInfo;

    IconButton newButton  { Icons::drawNewFile };
    IconButton openButton { Icons::drawFolder };
    IconButton saveButton { Icons::drawSave };
    IconButton undoButton { Icons::drawUndo };
    IconButton redoButton { Icons::drawRedo };

    IconButton settingsButton { Icons::drawSettings };
    IconButton bellButton { Icons::drawBell };
    IconButton speakerIcon { Icons::drawSpeaker };
    juce::Slider masterVolume;
    TransportBar transport { session };

    juce::Rectangle<float> avatarBounds;
    juce::Rectangle<int> dividerA, dividerB;
    std::shared_ptr<juce::FileChooser> fileChooser;
    juce::StringArray recentFiles;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (TopBar)
};
