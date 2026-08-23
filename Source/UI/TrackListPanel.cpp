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

    juce::PopupMenu instruments;
    const auto available = session.getAvailableInstruments();

    for (int i = 0; i < available.size(); ++i)
        instruments.addItem (100 + i, available[i], ! t->isMaster(), t->instrument == available[i]);

    instruments.addSeparator();
    instruments.addItem (99, "No Instrument", ! t->isMaster(), t->instrument.isEmpty());
    m.addSubMenu ("Instrument", instruments, ! t->isMaster());

    m.addSeparator();
    m.addItem (2, "Add MIDI Clip at Playhead", ! t->isMaster());
    m.addSeparator();
    m.addItem (3, "Move Up", index > 1);
    m.addItem (4, "Move Down", ! t->isMaster() && index < session.getNumTracks() - 1);
    m.addItem (5, "Duplicate Track", ! t->isMaster());
    m.addItem (6, "Delete Track", ! t->isMaster());

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&menuButton), [this] (int r)
    {
        if (r >= 100)
        {
            if (auto* t2 = track())
            {
                session.assignInstrument (*t2, session.getAvailableInstruments()[r - 100]);
                session.notify (DawSession::tracksChanged | DawSession::mixerChanged);
            }

            return;
        }

        switch (r)
        {
            case 1: nameLabel.showEditor(); break;
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

void TrackStrip::mouseDown (const juce::MouseEvent&)
{
    session.setSelectedTrack (index);
}

void TrackStrip::mouseDoubleClick (const juce::MouseEvent&)
{
    session.setEditorVisible (true);
    session.setEditorTab (DawSession::EditorTab::trackInfo);
}

void TrackStrip::resized()
{
    auto r = getLocalBounds();
    r.removeFromLeft (gutterWidth);
    meter.setBounds (colourBarWidth, 0, meterWidth, getHeight());

    r = r.reduced (7, 5);

    const auto h = getHeight();
    const bool compact = h < 44;
    const bool roomy = h >= 72;

    const auto* t = track();
    const bool isMaster = t != nullptr && t->isMaster();
    solo.setVisible (! isMaster);
    arm.setVisible (! isMaster);
    instrumentLabel.setVisible (roomy);

    if (compact)
    {
        // A single dense row: name, toggles, pan.
        menuButton.setBounds (r.removeFromRight (18).withSizeKeepingCentre (18, 18));
        pan.setBounds (r.removeFromRight (20).withSizeKeepingCentre (20, 20));
        r.removeFromRight (4);

        if (! isMaster)
        {
            arm.setBounds (r.removeFromRight (17).withSizeKeepingCentre (17, 17));
            r.removeFromRight (2);
            solo.setBounds (r.removeFromRight (17).withSizeKeepingCentre (17, 17));
            r.removeFromRight (2);
        }

        mute.setBounds (r.removeFromRight (17).withSizeKeepingCentre (17, 17));
        r.removeFromRight (6);
        volume.setBounds (r.removeFromRight (juce::jmin (60, juce::jmax (0, r.getWidth() - 70)))
                              .withSizeKeepingCentre (juce::jmin (60, juce::jmax (0, r.getWidth())), 14));
        r.removeFromLeft (20);
        nameLabel.setBounds (r);
        return;
    }

    auto top = r.removeFromTop (18);
    menuButton.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 18));
    top.removeFromRight (2);

    if (! isMaster)
    {
        arm.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 17));
        top.removeFromRight (2);
        solo.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 17));
        top.removeFromRight (2);
    }

    mute.setBounds (top.removeFromRight (18).withSizeKeepingCentre (18, 17));
    top.removeFromRight (6);
    top.removeFromLeft (20);   // room for the track number painted underneath
    nameLabel.setBounds (top);

    if (roomy)
        instrumentLabel.setBounds (r.removeFromTop (13));

    r.removeFromTop (2);
    auto bottom = r.removeFromTop (juce::jmin (20, r.getHeight()));
    pan.setBounds (bottom.removeFromRight (20).withSizeKeepingCentre (20, 20));
    bottom.removeFromRight (6);
    volume.setBounds (bottom.withSizeKeepingCentre (bottom.getWidth(), 14));
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

    // Track number, left of the name.
    g.setColour (selected ? DawColours::textMuted : DawColours::textDim);
    g.setFont (juce::FontOptions (10.0f));
    const auto numberArea = juce::Rectangle<int> (gutterWidth + 7, 0, 20, getHeight() < 44 ? getHeight() : 28);
    g.drawText (t->isMaster() ? "M" : DawWidgets::makeTrackNumber (index),
                numberArea, juce::Justification::centredLeft, false);

    if (t->recordArm)
    {
        g.setColour (DawColours::armOn.withAlpha (0.9f));
        g.fillEllipse ((float) getWidth() - 7.0f, 5.0f, 4.0f, 4.0f);
    }
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
        m.addItem (1, "Instrument Track");
        m.addItem (2, "Audio Track");
        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&addButton), [this] (int r)
        {
            if (r == 1) session.addTrack (TrackType::Midi);
            if (r == 2) session.addTrack (TrackType::Audio);
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
            if (r == 1) session.setTrackHeight (38);
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
                                        session.getNumTracks() * session.getTrackHeight()));
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
        if ((int) strips.size() != session.getNumTracks())
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
        auto strip = std::make_unique<TrackStrip> (session, i);
        content.addAndMakeVisible (*strip);
        strips.push_back (std::move (strip));
    }

    headerLabel.setText ("TRACKS  " + juce::String (juce::jmax (0, session.getNumTracks() - 1)),
                         juce::dontSendNotification);
    updateContentSize();
}
