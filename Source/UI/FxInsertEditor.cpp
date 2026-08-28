#include "FxInsertEditor.h"
#include "DawColours.h"
#include "Widgets.h"

namespace
{
    juce::String pluginDisplayName (const juce::String& pluginId)
    {
        if (pluginId == "equalizer-x") return "Equalizer X";
        if (pluginId == "reverb-x")    return "Reverb X";
        if (pluginId == "boost-x")     return "Boost X";
        if (pluginId == "dynamic-x")   return "Dynamic X";
        if (pluginId == "limiter-x")   return "Limiter X";
        return pluginId;
    }
}

FxInsertEditorPanel::FxInsertEditorPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    titleLabel.setFont (juce::Font (juce::FontOptions (18.0f).withStyleFlags (juce::Font::bold)));
    titleLabel.setColour (juce::Label::textColourId, DawColours::text);
    titleLabel.setJustificationType (juce::Justification::centredLeft);
    addAndMakeVisible (titleLabel);

    bodyLabel.setFont (juce::FontOptions (11.5f));
    bodyLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    bodyLabel.setJustificationType (juce::Justification::topLeft);
    addAndMakeVisible (bodyLabel);

    DawWidgets::styleFlatButton (openButton);
    openButton.onClick = [this] { openDesignedUiInBrowser(); };
    addAndMakeVisible (openButton);

    session.addListener (this);
}

FxInsertEditorPanel::~FxInsertEditorPanel()
{
    session.removeListener (this);
}

void FxInsertEditorPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::background);
    g.setColour (DawColours::divider);
    g.drawRect (getLocalBounds());
}

void FxInsertEditorPanel::resized()
{
    auto r = getLocalBounds().reduced (18, 16);
    titleLabel.setBounds (r.removeFromTop (28));
    r.removeFromTop (8);
    bodyLabel.setBounds (r.removeFromTop (96));
    r.removeFromTop (12);
    openButton.setBounds (r.removeFromTop (30).removeFromLeft (180));
}

void FxInsertEditorPanel::bind (int newTrackIndex, int newSlotIndex)
{
    trackIndex = newTrackIndex;
    slotIndex = newSlotIndex;
    refresh();
    openDesignedUiInBrowser();
}

void FxInsertEditorPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::mixerChanged | DawSession::tracksChanged)) != 0)
        refresh();
}

juce::String FxInsertEditorPanel::pluginIdForCurrentInsert() const
{
    const auto* track = session.getTrack (trackIndex);

    if (track == nullptr || slotIndex < 0 || slotIndex >= (int) track->inserts.size())
        return {};

    const auto& slot = track->inserts[(size_t) slotIndex];

    if (slot.instrumentId.isNotEmpty())
        return slot.instrumentId;

    return DawSession::effectIdForName (slot.name);
}

void FxInsertEditorPanel::openDesignedUiInBrowser()
{
    const auto pluginId = pluginIdForCurrentInsert();

    if (pluginId.isEmpty())
        return;

    juce::URL (pluginEditorUrl (pluginId, trackIndex, slotIndex)).launchInDefaultBrowser();
}

void FxInsertEditorPanel::refresh()
{
    const auto* track = session.getTrack (trackIndex);
    const auto pluginId = pluginIdForCurrentInsert();

    if (track == nullptr || pluginId.isEmpty())
    {
        titleLabel.setText ("Insert", juce::dontSendNotification);
        bodyLabel.setText ("No insert selected.", juce::dontSendNotification);
        openButton.setEnabled (false);
        return;
    }

    openButton.setEnabled (true);
    titleLabel.setText (pluginDisplayName (pluginId) + "  ·  " + track->name, juce::dontSendNotification);

    bodyLabel.setText ("The designed plugin interface opens in your browser.\n\n"
                       "1. Keep  npm run dev:h5  running in uni-preset-vue-vite/uni-preset-vue-vite\n"
                       "2. Use the browser window for EQ graph, Reverb venue, Boost modes, etc.\n"
                       "3. X-series DSP runs in the browser AudioWorklet on the remote mix path.",
                       juce::dontSendNotification);
}

//==============================================================================
FxInsertEditorWindow::FxInsertEditorWindow (DawSession& sessionToUse)
    : DocumentWindow ("Effect", DawColours::background, DocumentWindow::closeButton),
      session (sessionToUse)
{
    panel = std::make_unique<FxInsertEditorPanel> (session);
    setUsingNativeTitleBar (true);
    setContentNonOwned (panel.get(), true);
    setResizable (true, true);
    setResizeLimits (420, 240, 640, 360);
    centreWithSize (480, 260);
    addToDesktop (getDesktopWindowStyleFlags());
    setVisible (true);
}

FxInsertEditorWindow::~FxInsertEditorWindow()
{
    clearContentComponent();
}

void FxInsertEditorWindow::closeButtonPressed()
{
    if (onClose != nullptr)
        onClose();
}

void FxInsertEditorWindow::bind (int trackIndex, int slotIndex, const juce::String& windowTitle)
{
    if (panel != nullptr)
        panel->bind (trackIndex, slotIndex);

    setName (windowTitle);
}
