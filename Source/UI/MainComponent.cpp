#include "MainComponent.h"

MainComponent::MainComponent()
{
    buildUi();
}

MainComponent::MainComponent (EngineAPI& engineToShare)
    : session (engineToShare)
{
    buildUi();
}

void MainComponent::buildUi()
{
    juce::LookAndFeel::setDefaultLookAndFeel (&lookAndFeel);

    setOpaque (true);
    setWantsKeyboardFocus (true);

    session.addListener (this);

    topBar.onShowAudioSettings = [this] { showAudioSettings(); };
    topBar.onQuit = []
    {
        if (auto* app = juce::JUCEApplication::getInstance())
            app->systemRequestedQuit();
    };
    topBar.onCaptureState = [this]
    {
        if (captureWindow != nullptr)
        {
            captureWindow->toFront (true);
            return;
        }

        captureWindow = std::make_unique<StateCaptureWindow> (session);
        captureWindow->onClose = [this] { captureWindow.reset(); };
    };
    addAndMakeVisible (topBar);

    trackList.onVerticalScroll = [this] (int y) { arrangement.setViewY (y); };
    arrangement.onVerticalScroll = [this] (int y) { trackList.setViewY (y); };
    addAndMakeVisible (trackList);
    addAndMakeVisible (arrangement);

    addChildComponent (editor);
    addChildComponent (mixer);
    addChildComponent (inspector);
    addAndMakeVisible (statusBar);

    trackSplitter.onDragStart = [this] { dragStartValue = trackListWidth; };
    trackSplitter.onDrag = [this] (int delta)
    {
        trackListWidth = dragStartValue + delta;
        layoutBody();
    };
    addAndMakeVisible (trackSplitter);

    inspectorSplitter.onDragStart = [this] { dragStartValue = inspectorWidth; };
    inspectorSplitter.onDrag = [this] (int delta)
    {
        inspectorWidth = dragStartValue - delta;
        layoutBody();
    };
    addChildComponent (inspectorSplitter);

    editorSplitter.onDragStart = [this] { dragStartValue = editorHeight; };
    editorSplitter.onDrag = [this] (int delta)
    {
        editorHeight = dragStartValue - delta;
        layoutBody();
    };
    addChildComponent (editorSplitter);

    mixerSplitter.onDragStart = [this] { dragStartValue = mixerHeight; };
    mixerSplitter.onDrag = [this] (int delta)
    {
        mixerHeight = dragStartValue - delta;
        layoutBody();
    };
    addChildComponent (mixerSplitter);

    setSize (1560, 920);
}

MainComponent::~MainComponent()
{
    captureWindow.reset();

    if (keyListenerHost != nullptr)
        keyListenerHost->removeKeyListener (this);

    session.removeListener (this);
    juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
}

//==============================================================================
void MainComponent::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::background);
}

void MainComponent::resized()
{
    auto r = getLocalBounds();
    topBar.setBounds (r.removeFromTop (DawSession::topBarHeight));
    layoutBody();
}

void MainComponent::layoutBody()
{
    auto body = getLocalBounds();
    body.removeFromTop (DawSession::topBarHeight);
    statusBar.setBounds (body.removeFromBottom (DawSession::statusBarHeight));

    const bool showEditor = session.isEditorVisible();
    const bool showMixer = session.isMixerVisible();
    const bool showInspector = session.isInspectorVisible();

    editor.setVisible (showEditor);
    editorSplitter.setVisible (showEditor);
    mixer.setVisible (showMixer);
    mixerSplitter.setVisible (showMixer);
    inspector.setVisible (showInspector);
    inspectorSplitter.setVisible (showInspector);

    // Share the vertical space, never letting the arrangement collapse completely.
    const auto budget = juce::jmax (0, body.getHeight() - minArrangementHeight);
    auto editorH = showEditor ? juce::jmax (minEditorHeight, editorHeight) : 0;
    auto mixerH = showMixer ? juce::jmax (minMixerHeight, mixerHeight) : 0;

    if (editorH + mixerH > budget)
    {
        if (showEditor && showMixer)
        {
            const auto half = budget / 2;
            editorH = juce::jmin (editorH, juce::jmax (0, budget - juce::jmin (mixerH, half)));
            mixerH = juce::jmax (0, budget - editorH);
        }
        else
        {
            editorH = showEditor ? budget : 0;
            mixerH = showMixer ? budget : 0;
        }
    }

    if (showMixer)
    {
        mixer.setBounds (body.removeFromBottom (mixerH));
        mixerSplitter.setBounds (body.getX(), mixer.getY() - 2, body.getWidth(), 5);
    }

    if (showEditor)
    {
        editor.setBounds (body.removeFromBottom (editorH));
        editorSplitter.setBounds (body.getX(), editor.getY() - 2, body.getWidth(), 5);
    }

    if (showInspector)
    {
        inspectorWidth = juce::jlimit (minInspectorWidth,
                                       juce::jmax (minInspectorWidth,
                                                   body.getWidth() - minTrackListWidth - 240),
                                       inspectorWidth);
        inspector.setBounds (body.removeFromRight (inspectorWidth));
        inspectorSplitter.setBounds (inspector.getX() - 2, body.getY(), 5, body.getHeight());
    }

    trackListWidth = juce::jlimit (minTrackListWidth,
                                   juce::jmax (minTrackListWidth, body.getWidth() - 240),
                                   trackListWidth);
    trackList.setBounds (body.removeFromLeft (trackListWidth));
    arrangement.setBounds (body);
    trackSplitter.setBounds (trackList.getRight() - 2, trackList.getY(), 5, trackList.getHeight());

    for (auto* splitter : { &trackSplitter, &inspectorSplitter, &editorSplitter, &mixerSplitter })
        splitter->toFront (false);
}

//==============================================================================
void MainComponent::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::viewChanged) != 0)
        layoutBody();
}

void MainComponent::deleteSelection()
{
    if (session.isEditorVisible() && session.getEditorTab() == DawSession::EditorTab::pianoRoll
        && editor.hasNoteSelection())
    {
        editor.deleteSelection();
        return;
    }

    auto& clips = session.getClips();
    bool removedAny = false;

    for (int i = (int) clips.size(); --i >= 0;)
    {
        if (clips[(size_t) i].selected)
        {
            session.removeClip (i);
            removedAny = true;
        }
    }

    if (! removedAny && session.getSelectedClip() >= 0)
        session.removeClip (session.getSelectedClip());
}

void MainComponent::parentHierarchyChanged()
{
    auto* top = getTopLevelComponent();

    if (top == keyListenerHost)
        return;

    if (keyListenerHost != nullptr)
        keyListenerHost->removeKeyListener (this);

    keyListenerHost = top;

    if (top != nullptr && top != this)
        top->addKeyListener (this);
}

bool MainComponent::keyPressed (const juce::KeyPress& key)
{
    return handleShortcut (key);
}

bool MainComponent::keyPressed (const juce::KeyPress& key, juce::Component*)
{
    return handleShortcut (key);
}

bool MainComponent::handleShortcut (const juce::KeyPress& key)
{
    if (dynamic_cast<juce::TextEditor*> (juce::Component::getCurrentlyFocusedComponent()) != nullptr)
        return false;

    const auto code = key.getKeyCode();

    if (key.getModifiers().isCtrlDown() || key.getModifiers().isCommandDown())
    {
        switch (code)
        {
            case 'Z': case 'z':
                if (key.getModifiers().isShiftDown())
                    session.redo();
                else
                    session.undo();
                return true;
            case 'Y': case 'y': session.redo(); return true;
            case 'S': case 's': topBar.commandSaveProject (key.getModifiers().isShiftDown()); return true;
            case 'O': case 'o': topBar.commandOpenProject(); return true;
            case 'D': case 'd':
                if (session.isEditorVisible() && editor.hasNoteSelection())
                    editor.duplicateSelection();
                else
                    session.duplicateClip (session.getSelectedClip());
                return true;
            case 'C': case 'c':
                if (session.isEditorVisible() && editor.hasNoteSelection())
                {
                    editor.copySelection();
                    return true;
                }
                return false;
            case 'V': case 'v':
                if (session.isEditorVisible() && session.getEditorTab() == DawSession::EditorTab::pianoRoll)
                {
                    editor.pasteSelection();
                    return true;
                }
                return false;
            default: return false;
        }
    }

    if (key == juce::KeyPress::spaceKey)  { session.togglePlay(); return true; }
    if (key == juce::KeyPress::homeKey)   { session.returnToStart(); return true; }
    if (key == juce::KeyPress::escapeKey) { session.stop(); return true; }
    if (key == juce::KeyPress::returnKey)
    {
        if (session.getSelectedClip() >= 0)
        {
            session.setEditorVisible (true);
            session.setEditorTab (DawSession::EditorTab::pianoRoll);
            return true;
        }
        return false;
    }

    if (key == juce::KeyPress::deleteKey || key == juce::KeyPress::backspaceKey)
    {
        deleteSelection();
        return true;
    }

    switch (code)
    {
        case 'R': case 'r': session.toggleRecord(); return true;
        case 'L': case 'l': session.toggleLoop(); return true;
        case 'E': case 'e': session.toggleEditor(); return true;
        case 'M': case 'm': session.toggleMixer(); return true;
        case 'I': case 'i': session.toggleInspector(); return true;
        default: break;
    }

    return false;
}

//==============================================================================
void MainComponent::showAudioSettings()
{
    auto& deviceManager = session.getEngineAPI().getEngine().getDeviceManager();
    auto* selector = new juce::AudioDeviceSelectorComponent (deviceManager, 0, 0, 1, 2, false, false, true, false);
    selector->setSize (540, 430);

    juce::DialogWindow::LaunchOptions options;
    options.content.setOwned (selector);
    options.dialogTitle = "Audio Settings";
    options.dialogBackgroundColour = DawColours::panelRaised;
    options.escapeKeyTriggersCloseButton = true;
    options.useNativeTitleBar = true;
    options.resizable = true;
    options.componentToCentreAround = this;
    options.launchAsync();
}
