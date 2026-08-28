#include "TopBar.h"

TopBar::TopBar (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    for (auto* b : { &fileBtn, &editBtn, &insertBtn, &viewBtn, &transportBtn, &helpBtn })
    {
        DawWidgets::styleMenuButton (*b);
        addAndMakeVisible (*b);
    }

    fileBtn.setButtonText ("Project");
    editBtn.setVisible (false);
    insertBtn.setVisible (false);
    viewBtn.setVisible (false);
    transportBtn.setVisible (false);
    helpBtn.setVisible (false);
    newButton.setVisible (false);
    openButton.setVisible (false);
    saveButton.setVisible (false);
    bellButton.setVisible (false);
    speakerIcon.setVisible (false);
    masterVolume.setVisible (false);
    userName.setVisible (false);
    projectInfo.setVisible (false);
    fileBtn.onClick      = [this] { showFileMenu(); };
    editBtn.onClick      = [this] { showEditMenu(); };
    insertBtn.onClick    = [this] { showInsertMenu(); };
    viewBtn.onClick      = [this] { showViewMenu(); };
    transportBtn.onClick = [this] { showTransportMenu(); };
    helpBtn.onClick      = [this] { showHelpMenu(); };

    projectName.setFont (juce::Font (juce::FontOptions (14.0f).withStyleFlags (juce::Font::bold)));
    projectName.setColour (juce::Label::textColourId, DawColours::text);
    projectName.setJustificationType (juce::Justification::centredLeft);
    projectName.setEditable (false, true, false);
    projectName.onTextChange = [this] { session.setProjectName (projectName.getText()); };
    projectName.setTooltip ("Double-click to rename the project");
    addAndMakeVisible (projectName);

    userName.setFont (juce::FontOptions (11.0f));
    userName.setColour (juce::Label::textColourId, DawColours::textMuted);
    userName.setJustificationType (juce::Justification::centredLeft);
    addAndMakeVisible (userName);

    projectInfo.setFont (juce::FontOptions (11.5f));
    projectInfo.setColour (juce::Label::textColourId, DawColours::textDim);
    projectInfo.setJustificationType (juce::Justification::centredRight);
    projectInfo.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (projectInfo);

    newButton.setTooltip ("New project");
    newButton.onClick = [this]
    {
        session.newProject();
        session.addTrack (TrackType::Midi, "Instrument 1");
    };
    addAndMakeVisible (newButton);

    openButton.setTooltip ("Open project");
    openButton.onClick = [this] { openProject(); };
    addAndMakeVisible (openButton);

    saveButton.setTooltip ("Save project");
    saveButton.onClick = [this] { saveProject (false); };
    addAndMakeVisible (saveButton);

    undoButton.setTooltip ("Undo");
    undoButton.onClick = [this] { session.undo(); };
    addAndMakeVisible (undoButton);

    redoButton.setTooltip ("Redo");
    redoButton.onClick = [this] { session.redo(); };
    addAndMakeVisible (redoButton);

    settingsButton.setTooltip ("Audio settings");
    settingsButton.onClick = [this] { if (onShowAudioSettings) onShowAudioSettings(); };
    addAndMakeVisible (settingsButton);

    bellButton.setTooltip ("Notifications");
    bellButton.onClick = [] { showStub ("Notifications", "No new notifications."); };
    addAndMakeVisible (bellButton);

    speakerIcon.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (speakerIcon);

    masterVolume.setWantsKeyboardFocus (false);
    masterVolume.setSliderStyle (juce::Slider::LinearHorizontal);
    masterVolume.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    masterVolume.setRange (0.0, 1.0, 0.001);
    masterVolume.setTooltip ("Master output level");
    masterVolume.onValueChange = [this] { session.setMasterGain ((float) masterVolume.getValue()); };
    addAndMakeVisible (masterVolume);
    addAndMakeVisible (transport);

    refresh();
}

TopBar::~TopBar()
{
    session.removeListener (this);
}

void TopBar::showStub (const juce::String& title, const juce::String& message)
{
    juce::NativeMessageBox::showMessageBoxAsync (juce::MessageBoxIconType::InfoIcon, title, message);
}

void TopBar::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (getHeight() - 1, 0.0f, (float) getWidth());
}

void TopBar::resized()
{
    auto area = getLocalBounds().reduced (10, 8);
    const auto iconSize = juce::jmin (26, area.getHeight());

    fileBtn.setBounds (area.removeFromLeft (64));
    area.removeFromLeft (8);
    const auto nameW = juce::jmin (168, juce::jmax (80, area.getWidth() / 5));
    projectName.setBounds (area.removeFromLeft (nameW));
    area.removeFromLeft (6);
    undoButton.setBounds (area.removeFromLeft (iconSize).withSizeKeepingCentre (iconSize, iconSize));
    area.removeFromLeft (2);
    redoButton.setBounds (area.removeFromLeft (iconSize).withSizeKeepingCentre (iconSize, iconSize));
    area.removeFromLeft (8);

    settingsButton.setBounds (area.removeFromRight (iconSize).withSizeKeepingCentre (iconSize, iconSize));
    area.removeFromRight (4);
    transport.setBounds (area);
}

void TopBar::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::projectChanged | DawSession::tracksChanged | DawSession::clipsChanged
                  | DawSession::mixerChanged | DawSession::viewChanged)) != 0)
        refresh();
}

void TopBar::refresh()
{
    auto name = session.getProjectName();

    if (projectName.getText() != name)
        projectName.setText (name, juce::dontSendNotification);

    undoButton.setEnabledLook (session.canUndo());
    redoButton.setEnabledLook (session.canRedo());
}

//==============================================================================
void TopBar::showFileMenu()
{
    juce::PopupMenu m;
    m.addItem (1, "New Project");
    m.addItem (2, "Open...");
    m.addSeparator();
    m.addItem (3, "Save");
    m.addItem (4, "Save As...");
    m.addSeparator();
    m.addItem (5, "Export Audio...");
    m.addItem (6, "Export MIDI...");
    m.addSeparator();
    m.addItem (7, "Load Demo Project");
    m.addItem (8, "Audio Settings...");
    if (recentFiles.size() > 0)
    {
        juce::PopupMenu recent;
        for (int i = 0; i < recentFiles.size(); ++i)
            recent.addItem (100 + i, juce::File (recentFiles[i]).getFileNameWithoutExtension());
        m.addSeparator();
        m.addSubMenu ("Recent", recent);
    }
    m.addSeparator();
    m.addItem (9, "Exit");

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&fileBtn), [this] (int r)
    {
        switch (r)
        {
            case 1: session.newProject(); session.addTrack (TrackType::Midi, "Instrument 1"); break;
            case 2: openProject(); break;
            case 3: saveProject (false); break;
            case 4: saveProject (true); break;
            case 5: showStub ("Export Audio", "Offline rendering needs the audio engine."); break;
            case 6: showStub ("Export MIDI", "MIDI export needs the sequencer back end."); break;
            case 7: session.loadDemoProject(); break;
            case 8: if (onShowAudioSettings) onShowAudioSettings(); break;
            case 9: if (onQuit) onQuit(); break;
            default:
                if (r >= 100 && r < 100 + recentFiles.size())
                {
                    const auto error = session.loadProjectFrom (juce::File (recentFiles[r - 100]));
                    if (error.isNotEmpty())
                        showStub ("Open Project", error);
                }
                break;
        }
    });
}

void TopBar::showEditMenu()
{
    juce::PopupMenu m;
    m.addItem (1, session.canUndo() ? "Undo " + session.getUndoName() : "Undo", session.canUndo());
    m.addItem (2, session.canRedo() ? "Redo " + session.getRedoName() : "Redo", session.canRedo());
    m.addSeparator();
    m.addItem (3, "Duplicate Selected Clip", session.getSelectedClip() >= 0);
    m.addItem (4, "Delete Selected Clip", session.getSelectedClip() >= 0);
    m.addSeparator();
    m.addItem (5, "Duplicate Selected Track", session.getSelectedTrack() > 0);
    m.addItem (6, "Delete Selected Track", session.getSelectedTrack() > 0);

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&editBtn), [this] (int r)
    {
        switch (r)
        {
            case 1: session.undo(); break;
            case 2: session.redo(); break;
            case 3: session.duplicateClip (session.getSelectedClip()); break;
            case 4: session.removeClip (session.getSelectedClip()); break;
            case 5: session.duplicateTrack (session.getSelectedTrack()); break;
            case 6: session.removeTrack (session.getSelectedTrack()); break;
            default: break;
        }
    });
}

void TopBar::showInsertMenu()
{
    juce::PopupMenu m;
    m.addItem (1, "Instrument Track");
    m.addItem (2, "Audio Track");
    m.addSeparator();
    m.addItem (3, "MIDI Clip on Selected Track", session.getSelectedTrack() > 0);

    juce::PopupMenu templates;
    templates.addItem (10, "Strings Section");
    templates.addItem (11, "Woodwinds Section");
    templates.addItem (12, "Brass Section");
    m.addSubMenu ("Add Section", templates);

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&insertBtn), [this] (int r)
    {
        const auto addSection = [this] (const juce::StringArray& names, const juce::String& section)
        {
            for (const auto& n : names)
            {
                const auto index = session.addTrack (TrackType::Midi, n);

                if (auto* track = session.getTrack (index))
                    track->section = section;
            }

            session.notify (DawSession::tracksChanged);
        };

        switch (r)
        {
            case 1: session.addTrack (TrackType::Midi); break;
            case 2: session.addTrack (TrackType::Audio); break;
            case 3: session.addClip (session.getSelectedTrack(), session.snapBeat (session.getPositionBeats()), 8.0); break;
            case 10: addSection ({ "Violin I", "Violin II", "Viola", "Cello", "Bass" }, "Strings"); break;
            case 11: addSection ({ "Flute", "Oboe", "Clarinet", "Bassoon" }, "Woodwinds"); break;
            case 12: addSection ({ "Horn", "Trumpet", "Trombone", "Tuba" }, "Brass"); break;
            default: break;
        }
    });
}

void TopBar::showViewMenu()
{
    juce::PopupMenu m;
    m.addItem (1, "Editor Panel", true, session.isEditorVisible());
    m.addItem (2, "Mixer", true, session.isMixerVisible());
    m.addItem (3, "Inspector", true, session.isInspectorVisible());
    m.addSeparator();
    m.addItem (4, "Piano Roll", true, session.getEditorTab() == DawSession::EditorTab::pianoRoll);
    m.addItem (5, "Automation", true, session.getEditorTab() == DawSession::EditorTab::automation);
    m.addItem (6, "Track Info", true, session.getEditorTab() == DawSession::EditorTab::trackInfo);
    m.addSeparator();
    m.addItem (7, "Snap to Grid", true, session.isSnapOn());

    juce::PopupMenu heights;
    heights.addItem (20, "Compact");
    heights.addItem (21, "Normal");
    heights.addItem (22, "Large");
    m.addSubMenu ("Track Height", heights);

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&viewBtn), [this] (int r)
    {
        switch (r)
        {
            case 1: session.toggleEditor(); break;
            case 2: session.toggleMixer(); break;
            case 3: session.toggleInspector(); break;
            case 4: session.setEditorVisible (true); session.setEditorTab (DawSession::EditorTab::pianoRoll); break;
            case 5: session.setEditorVisible (true); session.setEditorTab (DawSession::EditorTab::automation); break;
            case 6: session.setEditorVisible (true); session.setEditorTab (DawSession::EditorTab::trackInfo); break;
            case 7: session.toggleSnap(); break;
            case 20: session.setTrackHeight (DawSession::minTrackHeight); break;
            case 21: session.setTrackHeight (DawSession::defaultTrackHeight); break;
            case 22: session.setTrackHeight (84); break;
            default: break;
        }
    });
}

void TopBar::showTransportMenu()
{
    juce::PopupMenu m;
    m.addItem (1, session.isPlaying() ? "Pause" : "Play");
    m.addItem (2, "Stop");
    m.addItem (3, "Return to Start");
    m.addSeparator();
    m.addItem (4, "Record", true, session.isRecording());
    m.addItem (5, "Loop", true, session.isLooping());
    m.addItem (6, "Metronome", true, session.isMetronomeOn());
    m.addSeparator();
    m.addItem (7, "Set Loop to Project Length");

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&transportBtn), [this] (int r)
    {
        switch (r)
        {
            case 1: session.togglePlay(); break;
            case 2: session.stop(); break;
            case 3: session.returnToStart(); break;
            case 4: session.toggleRecord(); break;
            case 5: session.toggleLoop(); break;
            case 6: session.toggleMetronome(); break;
            case 7:
            {
                double end = 32.0;

                for (const auto& clip : session.getClips())
                    end = juce::jmax (end, clip.getEndBeat());

                session.setLoopRange (0.0, end);
                break;
            }
            default: break;
        }
    });
}

void TopBar::showHelpMenu()
{
    juce::PopupMenu m;
    m.addItem (1, "Keyboard Shortcuts");
    m.addItem (2, "About DawWeb");
    m.addSeparator();
    m.addItem (3, "Capture / Verify Plugin State...");

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&helpBtn), [this] (int r)
    {
        if (r == 1)
            showStub ("Keyboard Shortcuts",
                      "Space      Play / Pause\n"
                      "Enter      Return to start\n"
                      "R          Record\n"
                      "L          Loop\n"
                      "E          Editor panel\n"
                      "M          Mixer\n"
                      "I          Inspector\n"
                      "Ctrl+O     Open project\n"
                      "Ctrl+S     Save project\n"
                      "Ctrl+Z     Undo\n"
                      "Ctrl+Y     Redo\n"
                      "Ctrl+Wheel Zoom timeline\n"
                      "Delete     Remove selection");
        else if (r == 2)
            showStub ("About DawWeb",
                      "DawWeb  " + juce::String (ProjectInfo::versionString)
                          + "\nOrchestral DAW with BBCSO Discover and Synchron Player hosting.\n"
                            "Instrument selection uses captured VST state, not the native plugin GUI.");
        else if (r == 3 && onCaptureState)
            onCaptureState();
    });
}

void TopBar::openProject()
{
    fileChooser = std::make_shared<juce::FileChooser> ("Open Project",
                                                       session.getCurrentProjectFile() == juce::File()
                                                           ? juce::File::getSpecialLocation (juce::File::userDocumentsDirectory)
                                                           : session.getCurrentProjectFile().getParentDirectory(),
                                                       "*.dawweb;*.json");

    const auto browserFlags = juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles;
    fileChooser->launchAsync (browserFlags, [this] (const juce::FileChooser& chooser)
    {
        const auto file = chooser.getResult();

        if (file == juce::File())
            return;

        const auto error = session.loadProjectFrom (file);

        if (error.isNotEmpty())
            showStub ("Open Project", error);
        else
            rememberRecent (file);
    });
}

void TopBar::saveProject (bool saveAs)
{
    if (! saveAs && session.saveProject())
    {
        rememberRecent (session.getCurrentProjectFile());
        return;
    }

    fileChooser = std::make_shared<juce::FileChooser> ("Save Project",
                                                       session.getCurrentProjectFile() == juce::File()
                                                           ? juce::File::getSpecialLocation (juce::File::userDocumentsDirectory)
                                                                 .getChildFile (session.getProjectName() + ".dawweb")
                                                           : session.getCurrentProjectFile(),
                                                       "*.dawweb;*.json");

    const auto browserFlags = juce::FileBrowserComponent::saveMode
                       | juce::FileBrowserComponent::canSelectFiles
                       | juce::FileBrowserComponent::warnAboutOverwriting;
    fileChooser->launchAsync (browserFlags, [this] (const juce::FileChooser& chooser)
    {
        auto file = chooser.getResult();

        if (file == juce::File())
            return;

        if (file.getFileExtension().isEmpty())
            file = file.withFileExtension (".dawweb");

        if (! session.saveProjectAs (file))
            showStub ("Save Project", "Could not write " + file.getFileName());
        else
            rememberRecent (file);
    });
}

void TopBar::rememberRecent (const juce::File& file)
{
    if (! file.existsAsFile())
        return;

    const auto path = file.getFullPathName();
    recentFiles.removeString (path);
    recentFiles.insert (0, path);

    while (recentFiles.size() > 8)
        recentFiles.remove (recentFiles.size() - 1);
}
