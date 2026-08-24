#pragma once

#include <JuceHeader.h>
#include "../Communication/EngineAPI.h"
#include "../Communication/WebGateway.h"
#include "DawLookAndFeel.h"
#include "DawColours.h"

class EngineHostComponent  : public juce::Component,
                             private juce::Timer
{
public:
    EngineHostComponent (EngineAPI& apiToUse, WebGateway& gatewayToUse);
    ~EngineHostComponent() override;

    void paint (juce::Graphics&) override;
    void resized() override;

private:
    void timerCallback() override;
    void showAudioSettings();
    void openLandingPage();
    void openVueDevServer();
    void refreshStatus();

    EngineAPI& api;
    WebGateway& gateway;
    DawLookAndFeel lookAndFeel;

    juce::Label title, status, hint;
    juce::TextButton openUiButton { "Open Engine Page" };
    juce::TextButton openVueButton { "Open Vue UI (5173)" };
    juce::TextButton audioButton { "Audio Settings" };
    juce::TextButton quitButton { "Quit" };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (EngineHostComponent)
};
