#include "TransportBar.h"

namespace
{
    struct SnapOption { const char* name; double beats; };

    const SnapOption snapOptions[]
    {
        { "Off",  0.0    },
        { "1/1",  4.0    },
        { "1/2",  2.0    },
        { "1/4",  1.0    },
        { "1/8",  0.5    },
        { "1/16", 0.25   },
        { "1/32", 0.125  }
    };
}

TransportBar::TransportBar (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    auto addCaption = [this] (juce::Label& l, const juce::String& text)
    {
        l.setText (text, juce::dontSendNotification);
        l.setFont (juce::Font (juce::FontOptions (9.0f).withStyleFlags (juce::Font::bold)));
        l.setColour (juce::Label::textColourId, DawColours::textDim);
        l.setJustificationType (juce::Justification::centred);
        l.setInterceptsMouseClicks (false, false);
        addAndMakeVisible (l);
    };

    metronomeButton.setTooltip ("Metronome");
    metronomeButton.setActiveColour (DawColours::accent);
    metronomeButton.onClick = [this] { session.toggleMetronome(); };
    addAndMakeVisible (metronomeButton);

    bpmField.setRange (20.0, 300.0);
    bpmField.setSensitivity (0.35);
    bpmField.setBoldFont (15.0f);
    bpmField.setTooltip ("Tempo - drag or double-click");
    bpmField.onValueChange = [this] (double v) { session.setBpm (v); };
    addAndMakeVisible (bpmField);
    addCaption (bpmCaption, "BPM");

    DawWidgets::styleFlatButton (timeSigButton);
    timeSigButton.setTooltip ("Time signature");
    timeSigButton.onClick = [this]
    {
        juce::PopupMenu m;
        const char* sigs[] = { "2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8" };

        for (int i = 0; i < (int) std::size (sigs); ++i)
            m.addItem (i + 1, sigs[i], true,
                       juce::String (sigs[i]) == juce::String (session.getTimeSigNumerator())
                                                    + "/" + juce::String (session.getTimeSigDenominator()));

        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&timeSigButton), [this] (int r)
        {
            const char* choices[] = { "2/4", "3/4", "4/4", "5/4", "6/8", "7/8", "12/8" };

            if (r >= 1 && r <= (int) std::size (choices))
            {
                juce::StringArray parts;
                parts.addTokens (juce::String (choices[r - 1]), "/", "");
                session.setTimeSignature (parts[0].getIntValue(), parts[1].getIntValue());
            }
        });
    };
    addAndMakeVisible (timeSigButton);
    addCaption (sigCaption, "SIG");

    toStartButton.setTooltip ("Return to start");
    toStartButton.onClick = [this] { session.returnToStart(); };
    addAndMakeVisible (toStartButton);

    playButton.setTooltip ("Play  (Space)");
    playButton.setActiveColour (DawColours::soloOn);
    playButton.onClick = [this] { session.play(); };
    addAndMakeVisible (playButton);

    pauseButton.setTooltip ("Pause");
    pauseButton.setActiveColour (DawColours::accent);
    pauseButton.onClick = [this] { session.pause(); };
    addAndMakeVisible (pauseButton);

    stopButton.setTooltip ("Stop  (Esc)");
    stopButton.onClick = [this] { session.stop(); };
    addAndMakeVisible (stopButton);

    recordButton.setTooltip ("Record  (R)");
    recordButton.setActiveColour (DawColours::record);
    recordButton.onClick = [this] { session.toggleRecord(); };
    addAndMakeVisible (recordButton);

    loopButton.setTooltip ("Loop  (L)");
    loopButton.setActiveColour (DawColours::accent);
    loopButton.onClick = [this] { session.toggleLoop(); };
    addAndMakeVisible (loopButton);

    positionLabel.setFont (juce::Font (juce::FontOptions (21.0f).withStyleFlags (juce::Font::bold)));
    positionLabel.setColour (juce::Label::textColourId, DawColours::text);
    positionLabel.setJustificationType (juce::Justification::centredLeft);
    positionLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (positionLabel);

    secondsLabel.setFont (juce::FontOptions (12.0f));
    secondsLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    secondsLabel.setJustificationType (juce::Justification::centredLeft);
    secondsLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (secondsLabel);

    DawWidgets::styleFlatButton (snapButton);
    snapButton.setTooltip ("Snap grid");
    snapButton.onClick = [this]
    {
        juce::PopupMenu m;

        for (int i = 0; i < (int) std::size (snapOptions); ++i)
        {
            const auto& option = snapOptions[i];
            const bool ticked = option.beats == 0.0 ? ! session.isSnapOn()
                                                    : session.isSnapOn()
                                                          && std::abs (session.getSnapGridBeats() - option.beats) < 1.0e-6;
            m.addItem (i + 1, option.name, true, ticked);
        }

        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&snapButton), [this] (int r)
        {
            if (r < 1 || r > (int) std::size (snapOptions))
                return;

            const auto& option = snapOptions[r - 1];

            if (option.beats == 0.0)
            {
                if (session.isSnapOn())
                    session.toggleSnap();
            }
            else
            {
                if (! session.isSnapOn())
                    session.toggleSnap();

                session.setSnapGridBeats (option.beats);
            }
        });
    };
    addAndMakeVisible (snapButton);

    editorToggle.setTooltip ("Editor panel  (E)");
    editorToggle.setActiveColour (DawColours::accent);
    editorToggle.onClick = [this] { session.toggleEditor(); };
    addAndMakeVisible (editorToggle);

    mixerToggle.setTooltip ("Mixer  (M)");
    mixerToggle.setActiveColour (DawColours::accent);
    mixerToggle.onClick = [this] { session.toggleMixer(); };
    addAndMakeVisible (mixerToggle);

    inspectorToggle.setTooltip ("Inspector  (I)");
    inspectorToggle.setActiveColour (DawColours::accent);
    inspectorToggle.onClick = [this] { session.toggleInspector(); };
    addAndMakeVisible (inspectorToggle);

    refresh();
}

TransportBar::~TransportBar()
{
    session.removeListener (this);
}

void TransportBar::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panelRaised);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (getHeight() - 1, 0.0f, (float) getWidth());

    if (! readoutBounds.isEmpty())
    {
        g.setColour (DawColours::panelSunken);
        g.fillRoundedRectangle (readoutBounds.toFloat(), 3.0f);

        if (session.isRecording())
        {
            g.setColour (DawColours::record.withAlpha (0.6f));
            g.drawRoundedRectangle (readoutBounds.toFloat().reduced (0.5f), 3.0f, 1.0f);
        }
    }
}

void TransportBar::resized()
{
    auto area = getLocalBounds().reduced (10, 6);
    const auto h = area.getHeight();

    // Tempo / metre block on the left.
    metronomeButton.setBounds (area.removeFromLeft (26).withSizeKeepingCentre (26, 26));
    area.removeFromLeft (8);

    auto tempoArea = area.removeFromLeft (54);
    bpmCaption.setBounds (tempoArea.removeFromBottom (10));
    bpmField.setBounds (tempoArea);
    area.removeFromLeft (6);

    auto sigArea = area.removeFromLeft (46);
    sigCaption.setBounds (sigArea.removeFromBottom (10));
    timeSigButton.setBounds (sigArea.withSizeKeepingCentre (46, juce::jmin (22, sigArea.getHeight())));

    // Panel toggles on the right.
    snapButton.setBounds (area.removeFromRight (46).withSizeKeepingCentre (46, juce::jmin (22, h)));
    area.removeFromRight (12);
    inspectorToggle.setBounds (area.removeFromRight (26).withSizeKeepingCentre (26, 26));
    mixerToggle.setBounds (area.removeFromRight (26).withSizeKeepingCentre (26, 26));
    editorToggle.setBounds (area.removeFromRight (26).withSizeKeepingCentre (26, 26));

    // Transport cluster plus readout, centred in whatever space is left.
    const int clusterWidth = 6 * 30 + 12 + 192;
    auto centre = area.withSizeKeepingCentre (juce::jmin (clusterWidth, area.getWidth()), h);

    auto placeButton = [&centre] (IconButton& b, int width)
    {
        b.setBounds (centre.removeFromLeft (width).withSizeKeepingCentre (juce::jmin (width, 30), 28));
    };

    placeButton (toStartButton, 28);
    placeButton (playButton, 32);
    placeButton (pauseButton, 28);
    placeButton (stopButton, 28);
    placeButton (recordButton, 30);
    centre.removeFromLeft (6);
    placeButton (loopButton, 28);
    centre.removeFromLeft (12);

    readoutBounds = centre;
    auto readout = centre.reduced (9, 2);
    positionLabel.setBounds (readout.removeFromLeft (juce::jmax (0, readout.getWidth() - 52)));
    secondsLabel.setBounds (readout);
}

void TransportBar::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::positionChanged | DawSession::transportChanged)) != 0)
        refreshPosition();

    if ((changeFlags & (DawSession::transportChanged | DawSession::projectChanged | DawSession::viewChanged)) != 0)
        refresh();
}

void TransportBar::refreshPosition()
{
    positionLabel.setText (session.getPositionString(), juce::dontSendNotification);
    secondsLabel.setText (session.getSecondsString(), juce::dontSendNotification);
}

void TransportBar::refresh()
{
    refreshPosition();

    bpmField.setValue (session.getBpm());
    timeSigButton.setButtonText (juce::String (session.getTimeSigNumerator()) + "/"
                                 + juce::String (session.getTimeSigDenominator()));

    metronomeButton.setToggleState (session.isMetronomeOn());
    loopButton.setToggleState (session.isLooping());
    recordButton.setToggleState (session.isRecording());
    playButton.setToggleState (session.isPlaying());
    pauseButton.setToggleState (! session.isPlaying() && session.getPositionBeats() > 0.0);

    juce::String snapText ("Off");

    if (session.isSnapOn())
        for (const auto& option : snapOptions)
            if (option.beats > 0.0 && std::abs (session.getSnapGridBeats() - option.beats) < 1.0e-6)
                snapText = option.name;

    snapButton.setButtonText (snapText);

    editorToggle.setToggleState (session.isEditorVisible());
    mixerToggle.setToggleState (session.isMixerVisible());
    inspectorToggle.setToggleState (session.isInspectorVisible());

    repaint();
}
