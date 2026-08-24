#include "EngineHostComponent.h"

EngineHostComponent::EngineHostComponent (EngineAPI& apiToUse, WebGateway& gatewayToUse)
    : api (apiToUse), gateway (gatewayToUse)
{
    juce::LookAndFeel::setDefaultLookAndFeel (&lookAndFeel);
    setOpaque (true);

    title.setText ("DawWeb Engine", juce::dontSendNotification);
    title.setFont (juce::Font (juce::FontOptions (22.0f).withStyleFlags (juce::Font::bold)));
    title.setColour (juce::Label::textColourId, DawColours::text);
    addAndMakeVisible (title);

    status.setColour (juce::Label::textColourId, DawColours::textMuted);
    status.setJustificationType (juce::Justification::topLeft);
    status.setMinimumHorizontalScale (1.0f);
    addAndMakeVisible (status);

    hint.setColour (juce::Label::textColourId, DawColours::textDim);
    hint.setText ("Keep this window open. The Vue3 DAW in the browser talks to this process.",
                  juce::dontSendNotification);
    addAndMakeVisible (hint);

    openUiButton.onClick = [this] { openLandingPage(); };
    openVueButton.onClick = [this] { openVueDevServer(); };
    audioButton.onClick = [this] { showAudioSettings(); };
    quitButton.onClick = []
    {
        if (auto* app = juce::JUCEApplication::getInstance())
            app->systemRequestedQuit();
    };

    addAndMakeVisible (openUiButton);
    addAndMakeVisible (openVueButton);
    addAndMakeVisible (audioButton);
    addAndMakeVisible (quitButton);

    refreshStatus();
    startTimerHz (2);
}

EngineHostComponent::~EngineHostComponent()
{
    stopTimer();
    juce::LookAndFeel::setDefaultLookAndFeel (nullptr);
}

void EngineHostComponent::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::background);
    g.setColour (DawColours::divider);
    g.drawRect (getLocalBounds(), 1);
}

void EngineHostComponent::resized()
{
    auto r = getLocalBounds().reduced (22);
    title.setBounds (r.removeFromTop (32));
    r.removeFromTop (10);
    status.setBounds (r.removeFromTop (110));
    hint.setBounds (r.removeFromTop (48));
    r.removeFromTop (8);

    auto row = r.removeFromTop (34);
    const auto gap = 8;
    const auto w = (row.getWidth() - gap * 3) / 4;
    openUiButton.setBounds (row.removeFromLeft (w));
    row.removeFromLeft (gap);
    openVueButton.setBounds (row.removeFromLeft (w));
    row.removeFromLeft (gap);
    audioButton.setBounds (row.removeFromLeft (w));
    row.removeFromLeft (gap);
    quitButton.setBounds (row);
}

void EngineHostComponent::timerCallback()
{
    refreshStatus();
}

void EngineHostComponent::refreshStatus()
{
    juce::String text;
    text << (gateway.isListening() ? "Listening  " : "Not listening  ")
         << gateway.getListenUrl() << "\n"
         << "WebSocket  " << gateway.getWebSocketUrl() << "\n"
         << api.getEngine().getStatusDescription() << "\n"
         << "Clients  " << juce::String (gateway.getNumClients());

    if (gateway.getWebRoot().isDirectory())
        text << "\nUI  " << gateway.getWebRoot().getFullPathName();
    else
        text << "\nUI  run  npm run dev:h5  in uni-preset-vue-vite/uni-preset-vue-vite";

    status.setText (text, juce::dontSendNotification);
}

void EngineHostComponent::showAudioSettings()
{
    auto& deviceManager = api.getEngine().getDeviceManager();
    auto* selector = new juce::AudioDeviceSelectorComponent (deviceManager, 0, 0, 1, 2, false, false, true, false);
    selector->setSize (540, 430);

    juce::DialogWindow::LaunchOptions options;
    options.content.setOwned (selector);
    options.dialogTitle = "Audio Settings";
    options.dialogBackgroundColour = DawColours::panelRaised;
    options.escapeKeyTriggersCloseButton = true;
    options.useNativeTitleBar = true;
    options.resizable = true;
    options.launchAsync();
}

void EngineHostComponent::openLandingPage()
{
    const auto url = gateway.getListenUrl();

    if (url.isNotEmpty())
        juce::URL (url).launchInDefaultBrowser();
}

void EngineHostComponent::openVueDevServer()
{
    juce::URL ("http://localhost:5173").launchInDefaultBrowser();
}
