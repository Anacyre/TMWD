#include "StatusBar.h"

StatusBar::StatusBar (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    auto setup = [this] (juce::Label& l, juce::Justification justification, juce::Colour colour)
    {
        l.setFont (juce::FontOptions (11.0f));
        l.setColour (juce::Label::textColourId, colour);
        l.setJustificationType (justification);
        l.setInterceptsMouseClicks (false, false);
        addAndMakeVisible (l);
    };

    setup (selectionLabel, juce::Justification::centredLeft, DawColours::textMuted);
    setup (hintLabel, juce::Justification::centred, DawColours::textDim);
    setup (engineLabel, juce::Justification::centredRight, DawColours::textDim);

    hintLabel.setText ("Space play   -   Ctrl+wheel zoom   -   double-click a lane to add a clip",
                       juce::dontSendNotification);

    refresh();
}

StatusBar::~StatusBar()
{
    session.removeListener (this);
}

void StatusBar::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (0, 0.0f, (float) getWidth());

    // Small transport state dot on the far left.
    const auto colour = session.isRecording() ? DawColours::record
                                              : (session.isPlaying() ? DawColours::soloOn
                                                                     : DawColours::textDim);
    g.setColour (colour);
    g.fillEllipse (9.0f, (float) getHeight() * 0.5f - 3.0f, 6.0f, 6.0f);
}

void StatusBar::resized()
{
    auto r = getLocalBounds();
    r.removeFromLeft (22);
    engineLabel.setBounds (r.removeFromRight (juce::jmin (260, r.getWidth() / 3)).withTrimmedRight (12));
    selectionLabel.setBounds (r.removeFromLeft (juce::jmin (320, r.getWidth() / 2)));
    hintLabel.setBounds (r);
}

void StatusBar::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::selectionChanged | DawSession::transportChanged
                        | DawSession::tracksChanged | DawSession::clipsChanged
                        | DawSession::notesChanged | DawSession::viewChanged
                        | DawSession::projectChanged | DawSession::engineChanged)) != 0)
        refresh();
}

void StatusBar::refresh()
{
    juce::String selection;

    if (const auto* track = session.getTrack (session.getSelectedTrack()))
        selection << "Track " << DawWidgets::makeTrackNumber (session.getSelectedTrack())
                  << "  " << track->name;
    else
        selection << "No track selected";

    if (const auto* clip = session.getClip (session.getSelectedClip()))
        selection << "   -   " << clip->name << "  (" << (int) clip->notes.size() << " notes)";

    selectionLabel.setText (selection, juce::dontSendNotification);

    juce::String engine;
    engine << (session.isRecording() ? "Recording" : (session.isPlaying() ? "Playing" : "Stopped"))
           << "   -   " << session.getEngineStatus();
    engineLabel.setText (engine, juce::dontSendNotification);

    repaint();
}
