#include "TrackListPanel.h"

namespace
{
    constexpr int colourBarWidth = 3;
    constexpr int meterWidth = 5;
    constexpr int gutterWidth = colourBarWidth + meterWidth;
}

TrackStrip::TrackStrip (DawSession& sessionToUse, int trackIndex)
    : session (sessionToUse), index (trackIndex)
{
    nameLabel.setEditable (false, true, false);
    nameLabel.setColour (juce::Label::textColourId, DawColours::text);
    nameLabel.setFont (juce::FontOptions (13.0f));
    nameLabel.setBorderSize ({ 0, 0, 0, 0 });
    nameLabel.onTextChange = [this]
    {
        if (auto* t = track())
        {
            t->name = nameLabel.getText();
            session.notify (DawSession::tracksChanged);
        }
    };
    addAndMakeVisible (nameLabel);

    instrumentLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    instrumentLabel.setFont (juce::FontOptions (10.5f));
    instrumentLabel.setBorderSize ({ 0, 0, 0, 0 });
    instrumentLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (instrumentLabel);

    volume.setWantsKeyboardFocus (false);
    volume.setSliderStyle (juce::Slider::LinearHorizontal);
    volume.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    volume.setRange (0.0, 1.0, 0.001);
    volume.setSliderSnapsToMousePosition (true);
    volume.onValueChange = [this]
    {
        if (auto* t = track())
        {
            t->volume = (float) volume.getValue();
            volume.setTooltip (DawUnits::formatDb (t->getVolumeDb()));

            if (t->isMaster())
                session.setMasterGain (t->volume);
            else
                session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (volume);

    DawWidgets::setupPanKnob (pan);
    pan.onValueChange = [this]
    {
        if (auto* t = track())
        {
            t->pan = (float) pan.getValue();
            pan.setTooltip ("Pan: " + DawUnits::formatPan (t->pan));
            session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (pan);

    DawWidgets::styleMiniToggle (mute, DawColours::muteOn, "Mute");
    mute.onClick = [this]
    {
        if (auto* t = track())
        {
            t->mute = mute.getToggleState();
            session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (mute);

    DawWidgets::styleMiniToggle (solo, DawColours::soloOn, "Solo");
    solo.onClick = [this]
    {
        if (auto* t = track())
        {
            t->solo = solo.getToggleState();
            session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (solo);

    DawWidgets::styleMiniToggle (arm, DawColours::armOn, "Record arm");
    arm.onClick = [this]
    {
        if (auto* t = track())
        {
            t->recordArm = arm.getToggleState();
            session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (arm);

    menuButton.setTooltip ("Track options");
    menuButton.onClick = [this] { showTrackMenu(); };
    addAndMakeVisible (menuButton);

    meter.setNumChannels (1);
    addAndMakeVisible (meter);

    refresh();
}

void TrackStrip::showTrackMenu()
{
    auto* t = track();

    if (t == nullptr)
        return;

    juce::PopupMenu m;
    m.addItem (1, "Rename");
    m.addItem (12, t->isGroup() ? (t->collapsed ? "Expand" : "Collapse") : "Group", t->isGroup());
    m.addItem (10, "Insert Plugin...", ! t->isMaster() && ! t->isGroup());
    m.addItem (11, "Open Plugin", ! t->isMaster() && t->instrumentDefinitionId.isNotEmpty());
    m.addItem (13, "Open Piano Roll", ! t->isMaster() && ! t->isGroup());
    m.addItem (14, "Open Mixer", ! t->isMaster() && ! t->isGroup());

    m.addSeparator();
    m.addItem (2, "Add MIDI Clip at Playhead", ! t->isMaster());
    m.addSeparator();
    m.addItem (3, "Move Up", index > 1);
    m.addItem (4, "Move Down", ! t->isMaster() && index < session.getNumTracks() - 1);
    m.addItem (5, "Duplicate Track", ! t->isMaster());
    m.addItem (6, "Delete Track", ! t->isMaster());

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&menuButton), [this] (int r)
    {
        switch (r)
        {
            case 1: nameLabel.showEditor(); break;
            case 10: session.showInstrumentSelector (this, index); break;
            case 11: session.showPluginUI (index); break;
            case 12:
                if (auto* group = track())
                    session.setTrackCollapsed (index, ! group->collapsed);
                break;
            case 13:
                session.setEditorVisible (true);
                session.setEditorTab (DawSession::EditorTab::pianoRoll);
                break;
            case 14: session.setMixerVisible (true); break;
            case 2: session.addClip (index, session.snapBeat (session.getPositionBeats()), 8.0); break;
            case 3: session.moveTrack (index, index - 1); break;
            case 4: session.moveTrack (index, index + 1); break;
            case 5: session.duplicateTrack (index); break;
            case 6: session.removeTrack (index); break;
            case 99:
                if (auto* t3 = track())
                {
                    session.clearInstrument (*t3);
                    session.notify (DawSession::tracksChanged | DawSession::mixerChanged);
                }
                break;
            default: break;
        }
    });
}

void TrackStrip::mouseDown (const juce::MouseEvent& e)
{
    if (auto* t = track(); t != nullptr && t->isGroup() && twistBounds.contains (e.getPosition()))
    {
        session.setTrackCollapsed (index, ! t->collapsed);
        return;
    }

    session.setSelectedTrack (index);

    if (auto* t = track(); t != nullptr && ! t->isMaster()
        && instrumentLabel.isVisible() && instrumentLabel.getBounds().contains (e.getPosition()))
    {
        if (t->instrumentDefinitionId.isNotEmpty())
            session.showPluginUI (index);
        else
            session.showInstrumentSelector (this, index);
    }
}

void TrackStrip::mouseDoubleClick (const juce::MouseEvent&)
{
    nameLabel.showEditor();
}

void TrackStrip::resized()
{
    auto r = getLocalBounds();
    r.removeFromLeft (gutterWidth);
    meter.setBounds (colourBarWidth, 0, meterWidth, getHeight());

    r = r.reduced (7, 5);
    r.removeFromLeft (session.getTrackDepth (index) * 12);
    twistBounds = r.removeFromLeft (18).withSizeKeepingCentre (18, 18);
    r.removeFromLeft (4);

    const auto* t = track();
    const bool isMaster = t != nullptr && t->isMaster();
    const bool isGroup = t != nullptr && t->isGroup();
    solo.setVisible (! isMaster && ! isGroup);
    arm.setVisible (false);
    instrumentLabel.setVisible (false);
    volume.setVisible (false);
    pan.setVisible (false);
    meter.setVisible (false);
    menuButton.setVisible (! isGroup);

    auto top = r;
    menuButton.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 18));
    top.removeFromRight (2);

    if (! isMaster)
    {
        if (! isGroup)
        {
            solo.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 17));
            top.removeFromRight (2);
        }
        mute.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 17));
        top.removeFromRight (6);
    }

    nameLabel.setBounds (top);
}

void TrackStrip::paint (juce::Graphics& g)
{
    const auto* t = track();

    if (t == nullptr)
        return;

    const bool selected = session.getSelectedTrack() == index;
    g.fillAll (selected ? DawColours::rowSelected : DawColours::panel);

    g.setColour (t->colour.withAlpha (session.isTrackAudible (index) ? 1.0f : 0.4f));
    g.fillRect (0, 0, colourBarWidth, getHeight());

    g.setColour (DawColours::laneLine);
    g.drawHorizontalLine (getHeight() - 1, 0.0f, (float) getWidth());

    if (selected)
    {
        g.setColour (DawColours::accent);
        g.fillRect (0, 0, colourBarWidth, getHeight());
    }

    g.setFont (juce::Font (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold)));
    g.setColour (selected ? DawColours::text : DawColours::textMuted);

    if (t->isGroup())
        g.drawText (t->collapsed ? juce::CharPointer_UTF8 ("\xe2\x96\xb8")
                                 : juce::CharPointer_UTF8 ("\xe2\x96\xbe"),
                    twistBounds, juce::Justification::centred, false);
    else
        g.drawText (t->name.substring (0, 1).toUpperCase(),
                    twistBounds, juce::Justification::centred, false);
}

void TrackStrip::refresh()
{
    const auto* t = track();

    if (t == nullptr)
        return;

    if (! nameLabel.isBeingEdited())
        nameLabel.setText (t->name, juce::dontSendNotification);

    instrumentLabel.setText (t->instrument.isNotEmpty() ? t->instrument : "No instrument",
                             juce::dontSendNotification);

    if (! volume.isMouseButtonDown())
        volume.setValue (t->volume, juce::dontSendNotification);

    if (! pan.isMouseButtonDown())
        pan.setValue (t->pan, juce::dontSendNotification);

    volume.setTooltip (DawUnits::formatDb (t->getVolumeDb()));
    pan.setTooltip ("Pan: " + DawUnits::formatPan (t->pan));

    mute.setToggleState (t->mute, juce::dontSendNotification);
    solo.setToggleState (t->solo, juce::dontSendNotification);
    arm.setToggleState (t->recordArm, juce::dontSendNotification);

    repaint();
}

void TrackStrip::refreshMeter()
{
    if (const auto* t = track())
        meter.setLevel (t->meterLevel);
}

//==============================================================================
TrackListPanel::TrackListPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    headerLabel.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
    headerLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    headerLabel.setJustificationType (juce::Justification::centredLeft);
    headerLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (headerLabel);

    addButton.setTooltip ("Add track");
    addButton.onClick = [this]
    {
        juce::PopupMenu m;
        m.addItem (1, "Instrument");
        m.addItem (2, "Audio");
        m.addItem (3, "Group");
        m.addItem (4, "Empty Track");
        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&addButton), [this] (int r)
        {
            if (r == 1) session.addTrack (TrackType::Midi);
            if (r == 2) session.addTrack (TrackType::Audio);
            if (r == 3) session.addTrack (TrackType::Group, "Group");
            if (r == 4)
            {
                const auto index = session.addTrack (TrackType::Midi, "Track");
                if (auto* track = session.getTrack (index))
                    session.clearInstrument (*track);
            }
        });
    };
    addAndMakeVisible (addButton);

    heightButton.setTooltip ("Track height");
    heightButton.onClick = [this]
    {
        juce::PopupMenu m;
        m.addItem (1, "Compact", true, session.getTrackHeight() < 46);
        m.addItem (2, "Normal", true, session.getTrackHeight() >= 46 && session.getTrackHeight() < 72);
        m.addItem (3, "Large", true, session.getTrackHeight() >= 72);
        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&heightButton), [this] (int r)
        {
            if (r == 1) session.setTrackHeight (DawSession::minTrackHeight);
            if (r == 2) session.setTrackHeight (DawSession::defaultTrackHeight);
            if (r == 3) session.setTrackHeight (84);
        });
    };
    addAndMakeVisible (heightButton);

    viewport.setViewedComponent (&content, false);
    viewport.setScrollBarsShown (false, false, true, false);
    viewport.onMoved = [this] (int y)
    {
        if (! syncing && onVerticalScroll)
            onVerticalScroll (y);
    };
    addAndMakeVisible (viewport);

    rebuildTracks();
}

TrackListPanel::~TrackListPanel()
{
    session.removeListener (this);
}

void TrackListPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    auto header = getLocalBounds().removeFromTop (DawSession::rulerHeight);
    g.setColour (DawColours::ruler);
    g.fillRect (header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (header.getBottom() - 1, 0.0f, (float) getWidth());
    g.drawVerticalLine (getWidth() - 1, 0.0f, (float) getHeight());
}

void TrackListPanel::resized()
{
    auto r = getLocalBounds();
    auto header = r.removeFromTop (DawSession::rulerHeight);
    header.removeFromRight (2);
    heightButton.setBounds (header.removeFromRight (26).withSizeKeepingCentre (22, 22));
    addButton.setBounds (header.removeFromRight (26).withSizeKeepingCentre (22, 22));
    headerLabel.setBounds (header.withTrimmedLeft (9));

    viewport.setBounds (r);
    updateContentSize();
}

void TrackListPanel::updateContentSize()
{
    const auto width = juce::jmax (1, viewport.getMaximumVisibleWidth());
    content.setSize (width, juce::jmax (viewport.getHeight(),
                                        juce::jmax (1, session.getVisibleTrackCount()) * session.getTrackHeight()));
    content.resized();
}

void TrackListPanel::setViewY (int y)
{
    syncing = true;
    viewport.setViewPosition (0, y);
    syncing = false;
}

int TrackListPanel::getViewY() const
{
    return viewport.getViewPositionY();
}

void TrackListPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::metersChanged) != 0)
        for (auto& strip : strips)
            strip->refreshMeter();

    if ((changeFlags & (DawSession::tracksChanged | DawSession::viewChanged)) != 0)
    {
        if ((int) strips.size() != session.getVisibleTrackCount())
        {
            rebuildTracks();
        }
        else
        {
            updateContentSize();

            for (auto& strip : strips)
                strip->refresh();
        }

        headerLabel.setText ("TRACKS  " + juce::String (juce::jmax (0, session.getNumTracks() - 1)),
                             juce::dontSendNotification);
    }
    else if ((changeFlags & (DawSession::mixerChanged | DawSession::selectionChanged)) != 0)
    {
        for (auto& strip : strips)
            strip->refresh();
    }
}

void TrackListPanel::rebuildTracks()
{
    content.removeAllChildren();
    strips.clear();

    for (int i = 0; i < session.getNumTracks(); ++i)
    {
        if (! session.isPlaylistTrackVisible (i))
            continue;

        auto strip = std::make_unique<TrackStrip> (session, i);
        content.addAndMakeVisible (*strip);
        strips.push_back (std::move (strip));
    }

    headerLabel.setText ("TRACKS  " + juce::String (juce::jmax (0, session.getNumTracks() - 1)),
                         juce::dontSendNotification);
    updateContentSize();
}
