#include "StateCaptureWindow.h"
#include "../Plugins/HostedPluginInstance.h"
#include "Widgets.h"

StateCaptureWindow::StateCaptureWindow (DawSession& sessionToUse)
    : DocumentWindow ("Capture Plugin State", DawColours::panel, DocumentWindow::closeButton)
{
    content = std::make_unique<Content> (sessionToUse);
    setUsingNativeTitleBar (true);
    setContentNonOwned (content.get(), true);
    setResizable (true, true);
    setResizeLimits (720, 560, 1800, 1400);
    centreWithSize (1100, 820);
    addToDesktop (getDesktopWindowStyleFlags());

   #if JUCE_WINDOWS
    if (auto* peer = getPeer())
        if (peer->getAvailableRenderingEngines().contains ("Software Renderer"))
            peer->setCurrentRenderingEngine (0);
   #endif

    setVisible (true);
}

StateCaptureWindow::~StateCaptureWindow()
{
    clearContentComponent();
}

void StateCaptureWindow::closeButtonPressed()
{
    if (onClose != nullptr)
        onClose();
}

StateCaptureWindow::Content::Content (DawSession& sessionToUse)
    : session (sessionToUse)
{
    const auto styleCaption = [] (juce::Label& label, const juce::String& text)
    {
        label.setText (text, juce::dontSendNotification);
        label.setFont (juce::Font (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold)));
        label.setColour (juce::Label::textColourId, DawColours::textDim);
        label.setInterceptsMouseClicks (false, false);
    };

    styleCaption (pluginCaption, "PLUGIN");
    styleCaption (presetCaption, "REQUIRED PRESETS");
    addAndMakeVisible (pluginCaption);
    addAndMakeVisible (presetCaption);

    int pluginIndex = 1;
    pluginBox.addItem ("All plugins", pluginIndex++);
    for (const auto& plugin : session.getEngineAPI().getInstruments().getPlugins())
        if (! plugin.isBuiltIn())
            pluginBox.addItem (plugin.displayName + "  (" + plugin.instrumentId + ")", pluginIndex++);

    pluginBox.setSelectedItemIndex (0, juce::dontSendNotification);
    pluginBox.onChange = [this] { rebuildPresetBox(); };
    presetBox.onChange = [this]
    {
        if (const auto* preset = selectedPreset())
        {
            currentPresetId = preset->id;
            outputPath.setText ("File: " + preset->stateFile
                                    + (preset->stateAvailable ? "  [captured]" : "  [needs capture]"),
                                juce::dontSendNotification);
            auto patchHint = preset->patchFile.isNotEmpty()
                                 ? "\n   BBCSO patch: " + preset->patchFile.fromLastOccurrenceOf ("/", false, false)
                                 : juce::String ("\n   Select this instrument inside Synchron Player");
            steps.setText ("1. Load plugin (the window stays responsive; do not force-quit)\n"
                           "2. The native editor opens in a separate window\n"
                           "3. Select the matching patch for this preset" + patchHint + "\n"
                           "4. Verify the sound with Play test notes\n"
                           "5. Confirm the checkbox, then Capture",
                           juce::dontSendNotification);
        }
    };
    addAndMakeVisible (pluginBox);
    addAndMakeVisible (presetBox);

    remaining.setFont (juce::FontOptions (12.0f));
    remaining.setColour (juce::Label::textColourId, DawColours::text);
    remaining.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (remaining);

    steps.setFont (juce::FontOptions (12.0f));
    steps.setColour (juce::Label::textColourId, DawColours::textMuted);
    steps.setJustificationType (juce::Justification::topLeft);
    steps.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (steps);

    warning.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (juce::Font::bold)));
    warning.setColour (juce::Label::textColourId, DawColours::muteOn);
    warning.setText ("Make sure the plugin currently contains the requested instrument.",
                     juce::dontSendNotification);
    addAndMakeVisible (warning);

    confirm.setColour (juce::ToggleButton::textColourId, DawColours::text);
    confirm.onClick = [this] { captureButton.setEnabled (! busy && confirm.getToggleState()); };
    addAndMakeVisible (confirm);

    DawWidgets::styleFlatButton (loadButton);
    DawWidgets::styleFlatButton (openEditorButton);
    DawWidgets::styleFlatButton (playButton);
    DawWidgets::styleFlatButton (captureButton);
    DawWidgets::styleFlatButton (verifyButton);
    loadButton.onClick = [this] { loadSelected(); };
    openEditorButton.onClick = [this] { showEditorForCurrentPlugin(); };
    playButton.onClick = [this] { playTest(); };
    captureButton.onClick = [this] { captureSelected(); };
    verifyButton.onClick = [this] { verifySelected(); };
    captureButton.setEnabled (false);
    addAndMakeVisible (loadButton);
    addAndMakeVisible (openEditorButton);
    addAndMakeVisible (playButton);
    addAndMakeVisible (captureButton);
    addAndMakeVisible (verifyButton);

    outputPath.setFont (juce::FontOptions (11.0f));
    outputPath.setColour (juce::Label::textColourId, DawColours::textDim);
    addAndMakeVisible (outputPath);

    status.setFont (juce::FontOptions (12.0f));
    status.setColour (juce::Label::textColourId, DawColours::textMuted);
    status.setJustificationType (juce::Justification::topLeft);
    addAndMakeVisible (status);

    editorHint.setFont (juce::FontOptions (13.0f));
    editorHint.setColour (juce::Label::textColourId, DawColours::textMuted);
    editorHint.setJustificationType (juce::Justification::centred);
    editorHint.setText ("The native editor opens in its own window.\n"
                        "BBCSO / Synchron must not be embedded here or they freeze the UI.",
                        juce::dontSendNotification);
    addAndMakeVisible (editorHint);

    rebuildPresetBox();
}

StateCaptureWindow::Content::~Content()
{
    stopTimer();
    detachEditor();
}

void StateCaptureWindow::Content::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);
}

void StateCaptureWindow::Content::resized()
{
    auto area = getLocalBounds().reduced (12);
    auto top = area.removeFromTop (188);
    auto labels = top.removeFromTop (16);
    pluginCaption.setBounds (labels.removeFromLeft (360));
    labels.removeFromLeft (12);
    presetCaption.setBounds (labels);
    auto combos = top.removeFromTop (28);
    pluginBox.setBounds (combos.removeFromLeft (360));
    combos.removeFromLeft (12);
    presetBox.setBounds (combos);
    top.removeFromTop (6);
    remaining.setBounds (top.removeFromTop (18));
    top.removeFromTop (6);
    steps.setBounds (top.removeFromTop (72));
    warning.setBounds (top.removeFromTop (20));
    confirm.setBounds (top.removeFromTop (22));

    auto buttons = area.removeFromTop (32);
    loadButton.setBounds (buttons.removeFromLeft (110));
    buttons.removeFromLeft (8);
    openEditorButton.setBounds (buttons.removeFromLeft (110));
    buttons.removeFromLeft (8);
    playButton.setBounds (buttons.removeFromLeft (130));
    buttons.removeFromLeft (8);
    captureButton.setBounds (buttons.removeFromLeft (90));
    buttons.removeFromLeft (8);
    verifyButton.setBounds (buttons.removeFromLeft (160));
    area.removeFromTop (8);
    outputPath.setBounds (area.removeFromTop (20));
    status.setBounds (area.removeFromTop (48));
    editorHint.setBounds (area);
}

void StateCaptureWindow::Content::timerCallback()
{
    ++loadSeconds;
    status.setText ("Loading " + loadingName + "... " + juce::String (loadSeconds)
                        + "s. The window stays responsive; BBCSO / Synchron can take a minute.",
                    juce::dontSendNotification);
}

juce::String StateCaptureWindow::Content::selectedPluginId() const
{
    const auto text = pluginBox.getText();

    for (const auto& plugin : session.getEngineAPI().getInstruments().getPlugins())
        if (! plugin.isBuiltIn() && text.contains (plugin.instrumentId))
            return plugin.instrumentId;

    return {};
}

void StateCaptureWindow::Content::updateRemainingLabel()
{
    const auto pluginId = selectedPluginId();
    int total = 0, captured = 0;

    for (const auto& preset : session.getEngineAPI().getInstruments().getPresets())
    {
        if (pluginId.isNotEmpty() && preset.pluginId != pluginId)
            continue;

        ++total;

        if (preset.stateAvailable)
            ++captured;
    }

    remaining.setText (juce::String (captured) + " / " + juce::String (total)
                           + " required presets captured"
                           + (captured < total ? "  —  capture the [needs capture] items below"
                                               : "  —  all listed instruments are ready"),
                       juce::dontSendNotification);
}

void StateCaptureWindow::Content::rebuildPresetBox()
{
    const auto previousId = currentPresetId.isNotEmpty() ? currentPresetId
                                                         : (selectedPreset() != nullptr ? selectedPreset()->id
                                                                                        : juce::String());
    visiblePresetIds.clear();
    presetBox.clear (juce::dontSendNotification);

    const auto pluginId = selectedPluginId();
    int index = 1;
    int selectedIndex = 0;

    for (const auto& preset : session.getEngineAPI().getInstruments().getPresets())
    {
        if (pluginId.isNotEmpty() && preset.pluginId != pluginId)
            continue;

        visiblePresetIds.add (preset.id);
        const auto mark = preset.stateAvailable ? "[captured]" : "[needs capture]";
        const auto technique = preset.technique.isNotEmpty() ? "  " + preset.technique : juce::String();
        presetBox.addItem (preset.displayName + technique + "  (" + preset.id + ")  " + mark, index);

        if (preset.id == previousId)
            selectedIndex = index - 1;

        ++index;
    }

    if (presetBox.getNumItems() > 0)
        presetBox.setSelectedItemIndex (selectedIndex, juce::dontSendNotification);

    updateRemainingLabel();

    if (const auto* preset = selectedPreset())
    {
        auto patchHint = preset->patchFile.isNotEmpty()
                             ? "\n   BBCSO patch: " + preset->patchFile.fromLastOccurrenceOf ("/", false, false)
                             : juce::String ("\n   Select this instrument inside Synchron Player");
        steps.setText ("1. Load plugin (the window stays responsive; do not force-quit)\n"
                       "2. The native editor opens in a separate window\n"
                       "3. Select the matching patch for this preset" + patchHint + "\n"
                       "4. Verify the sound with Play test notes\n"
                       "5. Confirm the checkbox, then Capture",
                       juce::dontSendNotification);
        outputPath.setText ("File: " + preset->stateFile
                                + (preset->stateAvailable ? "  [captured]" : "  [needs capture]"),
                            juce::dontSendNotification);
    }
}

const PresetDefinition* StateCaptureWindow::Content::selectedPreset() const
{
    const auto index = presetBox.getSelectedItemIndex();

    if (! juce::isPositiveAndBelow (index, visiblePresetIds.size()))
        return nullptr;

    return session.getEngineAPI().getInstruments().findPreset (visiblePresetIds[index]);
}

void StateCaptureWindow::Content::setBusy (bool shouldBeBusy, const juce::String& message)
{
    busy = shouldBeBusy;
    loadButton.setEnabled (! busy);
    openEditorButton.setEnabled (! busy);
    playButton.setEnabled (! busy);
    verifyButton.setEnabled (! busy);
    pluginBox.setEnabled (! busy);
    presetBox.setEnabled (! busy);
    captureButton.setEnabled (! busy && confirm.getToggleState());

    if (message.isNotEmpty())
        status.setText (message, juce::dontSendNotification);

    if (busy)
    {
        loadSeconds = 0;
        startTimer (1000);
    }
    else
    {
        stopTimer();
    }
}

void StateCaptureWindow::Content::detachEditor()
{
    editorWindow.reset();
}

void StateCaptureWindow::Content::showEditorForCurrentPlugin()
{
    if (editorWindow != nullptr)
    {
        editorWindow->toFront (true);
        return;
    }

    session.pause();

    const auto trackIndex = session.getSelectedTrack();
    auto* instance = dynamic_cast<HostedPluginInstance*> (session.getEngineAPI().getEngine().getTrackInstrument (trackIndex));

    if (instance == nullptr)
    {
        status.setText ("Load the plugin first, then open the editor.",
                        juce::dontSendNotification);
        return;
    }

    auto* plugin = instance->getNativePlugin();

    if (plugin == nullptr || ! plugin->hasEditor())
    {
        status.setText ("This plugin has no native editor.", juce::dontSendNotification);
        return;
    }

    if (auto* existing = plugin->getActiveEditor())
    {
        existing->toFront (true);
        return;
    }

    juce::Logger::writeToLog ("[Plugin] opening native editor for " + instance->getDisplayName());
    auto& engine = session.getEngineAPI().getEngine();
    engine.detachAudioCallback();
    auto* created = plugin->createEditorAndMakeActive();
    engine.attachAudioCallback();

    if (created == nullptr)
    {
        status.setText ("Plugin reported an editor but did not create one.",
                        juce::dontSendNotification);
        return;
    }

    class HostWindow  : public juce::DocumentWindow
    {
    public:
        HostWindow (juce::AudioProcessorEditor* editorToOwn, std::function<void()> onCloseToUse)
            : DocumentWindow (editorToOwn->getName().isNotEmpty() ? editorToOwn->getName()
                                                                  : juce::String ("Plugin Editor"),
                              juce::Colour (0xff121212),
                              juce::DocumentWindow::closeButton),
              onClose (std::move (onCloseToUse))
        {
            setUsingNativeTitleBar (true);
            setContentOwned (editorToOwn, true);
            setResizable (true, false);
            setResizeLimits (400, 280, 2400, 1600);
            centreWithSize (juce::jlimit (480, 1600, editorToOwn->getWidth()),
                            juce::jlimit (320, 1100, editorToOwn->getHeight()));
            setVisible (true);
        }

        void closeButtonPressed() override
        {
            juce::MessageManager::callAsync ([cb = onClose] { if (cb != nullptr) cb(); });
        }

    private:
        std::function<void()> onClose;
    };

    editorWindow = std::make_unique<HostWindow> (created,
        [safe = juce::Component::SafePointer<Content> (this)]
        {
            if (safe != nullptr)
                safe->editorWindow.reset();
        });

    juce::Logger::writeToLog ("[Plugin] native editor window ready");
    editorHint.setText ("Native editor is open in a separate window.\n"
                        "Select the matching patch there, then return here to Capture.",
                        juce::dontSendNotification);
}

void StateCaptureWindow::Content::loadSelected()
{
    const auto* preset = selectedPreset();
    auto* track = session.getTrack (session.getSelectedTrack());

    if (preset == nullptr || track == nullptr || track->isMaster())
    {
        status.setText ("Select a MIDI track and a preset first.", juce::dontSendNotification);
        return;
    }

    currentPresetId = preset->id;
    confirm.setToggleState (false, juce::dontSendNotification);
    loadingName = session.getEngineAPI().getInstruments().getDisplayName (preset->pluginId);

    if (loadingName.isEmpty())
        loadingName = preset->pluginId;

    detachEditor();
    auto loadingMessage = "Loading " + loadingName + "... the UI stays responsive.";

    if (juce::Process::isRunningUnderDebugger())
        loadingMessage += " Debugger is attached: wait if Visual Studio is swallowing plugin debug output.";

    setBusy (true, loadingMessage);

    const auto trackIndex = session.getSelectedTrack();
    const auto pluginId = preset->pluginId;
    const auto presetName = preset->displayName;
    const auto stateFile = preset->stateFile;

    if (! session.getEngineAPI().preparePluginForCapture (trackIndex, pluginId,
            [safe = juce::Component::SafePointer<Content> (this), presetName, stateFile] (bool ok)
            {
                if (safe == nullptr)
                    return;

                if (! ok)
                {
                    safe->setBusy (false);

                    if (auto* loaded = safe->session.getTrack (safe->session.getSelectedTrack()))
                        safe->status.setText (loaded->instrumentLoadMessage.isNotEmpty()
                                                  ? loaded->instrumentLoadMessage
                                                  : juce::String ("Could not load plugin."),
                                              juce::dontSendNotification);
                    return;
                }

                safe->status.setText ("Plugin created. Opening the native editor in its own window...",
                                      juce::dontSendNotification);

                juce::MessageManager::callAsync (
                    [safe, presetName, stateFile]
                    {
                        if (safe == nullptr)
                            return;

                        safe->showEditorForCurrentPlugin();
                        safe->setBusy (false);
                        safe->outputPath.setText ("File: " + stateFile, juce::dontSendNotification);
                        safe->status.setText ("Plugin loaded without restoring factory state.\n"
                                              "Select " + presetName + " in the native editor window, "
                                              "play test notes, then Capture.",
                                              juce::dontSendNotification);
                    });
            }))
    {
        setBusy (false);
        status.setText (track->instrumentLoadMessage.isNotEmpty() ? track->instrumentLoadMessage
                                                                  : juce::String ("Could not load plugin."),
                        juce::dontSendNotification);
    }
}

void StateCaptureWindow::Content::playTest()
{
    session.getEngineAPI().playValidationPhrase (session.getSelectedTrack(), 80, false);
    status.setText ("Playing C4 E4 G4 C5 at velocity 80. Listen, then capture if it is correct.",
                    juce::dontSendNotification);
}

void StateCaptureWindow::Content::captureSelected()
{
    const auto* preset = selectedPreset();

    if (preset == nullptr)
        return;

    if (! confirm.getToggleState())
    {
        status.setText ("Confirm that the native editor currently shows " + preset->displayName + ".",
                        juce::dontSendNotification);
        return;
    }

    currentPresetId = preset->id;

    if (session.getEngineAPI().capturePresetState (currentPresetId))
    {
        const auto file = session.getEngineAPI().getStateStore().resolveStateFile (*preset);
        status.setText ("Captured successfully.\nFile: " + file.getFullPathName(),
                        juce::dontSendNotification);
        rebuildPresetBox();
    }
    else
    {
        status.setText ("Could not capture " + preset->id, juce::dontSendNotification);
    }
}

void StateCaptureWindow::Content::verifySelected()
{
    const auto* preset = selectedPreset();

    if (preset == nullptr)
        return;

    detachEditor();
    loadingName = preset->displayName;
    setBusy (true, "Closing editor and restoring from a fresh instance...");

    const auto stateFile = preset->stateFile;
    session.getEngineAPI().verifyFreshRestore (session.getSelectedTrack(), preset->id,
        [safe = juce::Component::SafePointer<Content> (this), stateFile] (bool ok)
        {
            if (safe == nullptr)
                return;

            safe->setBusy (false);
            const auto* track = safe->session.getTrack (safe->session.getSelectedTrack());
            safe->status.setText (ok ? "Fresh restore completed. Listen to the test notes.\nFile: " + stateFile
                                     : "Fresh restore failed. "
                                           + (track != nullptr ? track->instrumentLoadMessage : juce::String()),
                                  juce::dontSendNotification);
            safe->session.notify (DawSession::tracksChanged | DawSession::mixerChanged);
        });
}
