#include "InspectorPanel.h"

namespace
{
    constexpr int panelHeaderHeight = 26;
    constexpr int rowHeight = 21;
    constexpr int captionHeight = 15;
}

InspectorPanel::InspectorPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    headerLabel.setText ("INSPECTOR", juce::dontSendNotification);
    headerLabel.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
    headerLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    headerLabel.setJustificationType (juce::Justification::centredLeft);
    headerLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (headerLabel);

    closeButton.setTooltip ("Hide inspector  (I)");
    closeButton.onClick = [this] { session.setInspectorVisible (false); };
    addAndMakeVisible (closeButton);

    content.onPaint = [this] (juce::Graphics& g) { paintContent (g); };
    viewport.setViewedComponent (&content, false);
    viewport.setScrollBarsShown (true, false);
    addAndMakeVisible (viewport);

    trackNameLabel.setFont (juce::Font (juce::FontOptions (15.0f).withStyleFlags (juce::Font::bold)));
    trackNameLabel.setColour (juce::Label::textColourId, DawColours::text);
    trackNameLabel.setJustificationType (juce::Justification::centredLeft);
    trackNameLabel.setEditable (false, true, false);
    trackNameLabel.setTooltip ("Double-click to rename the track");
    trackNameLabel.onTextChange = [this]
    {
        if (auto* track = session.getTrack (session.getSelectedTrack()))
        {
            track->name = trackNameLabel.getText();
            session.notify (DawSession::tracksChanged);
        }
    };
    content.addAndMakeVisible (trackNameLabel);

    DawWidgets::styleFlatButton (instrumentButton);
    instrumentButton.setTooltip ("Instrument currently loaded on this track");
    instrumentButton.onClick = [this] { showInstrumentMenu(); };
    content.addAndMakeVisible (instrumentButton);

    addRow (trackSection, "Type");
    addRow (trackSection, "Section");
    addRow (trackSection, "Volume");
    addRow (trackSection, "Pan");
    addRow (trackSection, "MIDI Channel");
    addRow (trackSection, "State");
    addRow (trackSection, "Output");

    addRow (clipSection, "Name");
    addRow (clipSection, "Track");
    addRow (clipSection, "Start");
    addRow (clipSection, "Length");
    addRow (clipSection, "Notes");
    addRow (clipSection, "Source");

    addRow (projectSection, "Name");
    addRow (projectSection, "Tempo");
    addRow (projectSection, "Time Signature");
    addRow (projectSection, "Tracks");
    addRow (projectSection, "Clips");
    addRow (projectSection, "Engine");

    refresh();
}

InspectorPanel::~InspectorPanel()
{
    session.removeListener (this);
}

InfoRow* InspectorPanel::addRow (Section& section, const juce::String& name)
{
    auto row = std::make_unique<InfoRow> (name);
    auto* raw = row.get();
    content.addAndMakeVisible (*raw);
    section.rows.push_back (raw);
    ownedRows.push_back (std::move (row));
    return raw;
}

//==============================================================================
void InspectorPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    auto header = getLocalBounds().removeFromTop (panelHeaderHeight);
    g.setColour (DawColours::header);
    g.fillRect (header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (header.getBottom() - 1, 0.0f, (float) getWidth());
    g.drawVerticalLine (0, 0.0f, (float) getHeight());
}

void InspectorPanel::paintContent (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    if (! colourSwatch.isEmpty())
    {
        const auto* track = session.getTrack (session.getSelectedTrack());
        g.setColour (track != nullptr ? track->colour : DawColours::textDim);
        g.fillRoundedRectangle (colourSwatch.toFloat(), 2.0f);
    }

    for (const auto* section : { &trackSection, &clipSection, &projectSection })
    {
        if (! section->captionBounds.isEmpty())
        {
            DawWidgets::drawCaption (g, section->captionBounds, section->caption);
            g.setColour (DawColours::divider);
            g.drawHorizontalLine (section->captionBounds.getBottom() - 1,
                                  (float) section->captionBounds.getX(),
                                  (float) section->captionBounds.getRight());
        }
    }

    if (! instrumentCaption.isEmpty())
        DawWidgets::drawCaption (g, instrumentCaption, "Instrument");
}

void InspectorPanel::layoutSection (Section& section, juce::Rectangle<int>& area)
{
    section.captionBounds = area.removeFromTop (captionHeight);
    area.removeFromTop (4);

    for (auto* row : section.rows)
        row->setBounds (area.removeFromTop (rowHeight));

    area.removeFromTop (14);
}

void InspectorPanel::resized()
{
    auto r = getLocalBounds();
    auto header = r.removeFromTop (panelHeaderHeight);
    closeButton.setBounds (header.removeFromRight (26).withSizeKeepingCentre (20, 20));
    headerLabel.setBounds (header.withTrimmedLeft (10));

    viewport.setBounds (r);

    const auto contentWidth = juce::jmax (60, viewport.getMaximumVisibleWidth());
    const auto totalRows = (int) ownedRows.size();
    const auto contentHeight = 12 + 24 + 10                      // name row
                               + captionHeight + 4 + 24 + 14     // instrument slot
                               + 3 * (captionHeight + 4 + 14)    // section captions
                               + totalRows * rowHeight + 20;
    content.setSize (contentWidth, juce::jmax (viewport.getHeight(), contentHeight));

    auto area = content.getLocalBounds().reduced (10, 12);

    auto nameRow = area.removeFromTop (24);
    colourSwatch = nameRow.removeFromLeft (4).withSizeKeepingCentre (4, 18);
    nameRow.removeFromLeft (8);
    trackNameLabel.setBounds (nameRow);
    area.removeFromTop (10);

    instrumentCaption = area.removeFromTop (captionHeight);
    area.removeFromTop (4);
    instrumentButton.setBounds (area.removeFromTop (24));
    area.removeFromTop (14);

    layoutSection (trackSection, area);
    layoutSection (clipSection, area);
    layoutSection (projectSection, area);
}

//==============================================================================
void InspectorPanel::showInstrumentMenu()
{
    auto* track = session.getTrack (session.getSelectedTrack());

    if (track == nullptr || track->isMaster())
        return;

    juce::PopupMenu m;
    const auto available = session.getAvailableInstruments();

    for (int i = 0; i < available.size(); ++i)
        m.addItem (i + 1, available[i], true, track->instrument == available[i]);

    m.addSeparator();
    m.addItem (99, "Remove Instrument", ! track->instrumentSlot.isEmpty());

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&instrumentButton), [this] (int r)
    {
        auto* t = session.getTrack (session.getSelectedTrack());

        if (t == nullptr)
            return;

        if (r == 99)
        {
            session.clearInstrument (*t);
        }
        else
        {
            const auto available = session.getAvailableInstruments();

            if (r >= 1 && r <= available.size())
                session.assignInstrument (*t, available[r - 1]);
        }

        session.notify (DawSession::tracksChanged | DawSession::mixerChanged);
    });
}

void InspectorPanel::refresh()
{
    const auto* track = session.getTrack (session.getSelectedTrack());
    const auto* clip = session.getClip (session.getSelectedClip());

    if (track != nullptr)
    {
        if (! trackNameLabel.isBeingEdited())
            trackNameLabel.setText (track->name, juce::dontSendNotification);

        instrumentButton.setButtonText (track->instrument.isNotEmpty() ? track->instrument
                                                                      : juce::String ("Empty slot"));

        juce::StringArray state;

        if (track->mute)       state.add ("Mute");
        if (track->solo)       state.add ("Solo");
        if (track->recordArm)  state.add ("Armed");

        trackSection.rows[0]->setValue (track->isMaster() ? "Master"
                                                          : (track->isMidi() ? "Instrument" : "Audio"));
        trackSection.rows[1]->setValue (track->section.isNotEmpty() ? track->section : "-");
        trackSection.rows[2]->setValue (DawUnits::formatDb (track->getVolumeDb()));
        trackSection.rows[3]->setValue (DawUnits::formatPan (track->pan));
        trackSection.rows[4]->setValue (track->isMidi() ? "Channel " + juce::String (track->midiChannel)
                                                        : juce::String ("-"));
        trackSection.rows[5]->setValue (state.isEmpty() ? "Active" : state.joinIntoString (", "));
        trackSection.rows[5]->setValueColour (state.isEmpty() ? DawColours::text : DawColours::muteOn);
        trackSection.rows[6]->setValue (track->isMaster() ? "Stereo Out" : "Master");
    }
    else
    {
        trackNameLabel.setText ("No track selected", juce::dontSendNotification);
        instrumentButton.setButtonText ("-");

        for (auto* row : trackSection.rows)
            row->setValue ("-");
    }

    if (clip != nullptr)
    {
        const auto* clipTrack = session.getTrack (clip->trackIndex);
        const auto beatsPerBar = juce::jmax (1, session.getBeatsPerBar());

        clipSection.rows[0]->setValue (clip->name);
        clipSection.rows[1]->setValue (clipTrack != nullptr ? clipTrack->name : juce::String ("-"));
        clipSection.rows[2]->setValue ("Bar " + juce::String (clip->startBeat / beatsPerBar + 1.0, 2));
        clipSection.rows[3]->setValue (juce::String (clip->lengthBeats / beatsPerBar, 2) + " bars");
        clipSection.rows[4]->setValue (clip->midi ? juce::String ((int) clip->notes.size())
                                                  : juce::String ("-"));
        clipSection.rows[5]->setValue (clip->sourceFile != juce::File()
                                           ? clip->sourceFile.getFileName()
                                           : juce::String (clip->midi ? "MIDI" : "Audio"));
    }
    else
    {
        for (auto* row : clipSection.rows)
            row->setValue ("-");
    }

    projectSection.rows[0]->setValue (session.getProjectName());
    projectSection.rows[1]->setValue (juce::String (session.getBpm(), 1) + " BPM");
    projectSection.rows[2]->setValue (juce::String (session.getTimeSigNumerator()) + "/"
                                      + juce::String (session.getTimeSigDenominator()));
    projectSection.rows[3]->setValue (juce::String (juce::jmax (0, session.getNumTracks() - 1)));
    projectSection.rows[4]->setValue (juce::String ((int) session.getClips().size()));
    const auto engineRunning = session.isEngineRunning();
    projectSection.rows[5]->setValue (session.getEngineStatus());
    projectSection.rows[5]->setValueColour (engineRunning ? DawColours::text : DawColours::muteOn);

    content.repaint();
}

void InspectorPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::selectionChanged | DawSession::tracksChanged
                        | DawSession::clipsChanged | DawSession::notesChanged
                        | DawSession::mixerChanged | DawSession::projectChanged
                        | DawSession::engineChanged)) != 0)
        refresh();
}
