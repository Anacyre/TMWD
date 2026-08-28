#include "MixerPanel.h"

namespace
{
    constexpr int mixerHeaderHeight = 24;
    constexpr int masterStripWidth = 92;
}

//==============================================================================
ChannelStrip::ChannelStrip (DawSession& sessionToUse, int trackIndex)
    : session (sessionToUse), index (trackIndex)
{
    nameLabel.setFont (juce::Font (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold)));
    nameLabel.setColour (juce::Label::textColourId, DawColours::text);
    nameLabel.setJustificationType (juce::Justification::centred);
    nameLabel.setEditable (false, true, false);
    nameLabel.onTextChange = [this]
    {
        if (auto* t = track())
        {
            t->name = nameLabel.getText();
            session.notify (DawSession::tracksChanged);
        }
    };
    addAndMakeVisible (nameLabel);

    instrumentLabel.setFont (juce::FontOptions (9.0f));
    instrumentLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    instrumentLabel.setJustificationType (juce::Justification::centred);
    instrumentLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (instrumentLabel);

    for (int i = 0; i < (int) insertButtons.size(); ++i)
    {
        auto& b = insertButtons[(size_t) i];
        DawWidgets::styleFlatButton (b);
        b.setTooltip ("Insert slot " + juce::String (i + 1) + " — double-click to open");
        b.onClick = [this, i] { showInsertMenu (i); };
        b.addMouseListener (this, false);
        addAndMakeVisible (b);
    }

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

    fader.setWantsKeyboardFocus (false);
    fader.setSliderStyle (juce::Slider::LinearVertical);
    fader.setTextBoxStyle (juce::Slider::NoTextBox, true, 0, 0);
    fader.setRange (0.0, 1.0, 0.001);
    fader.setDoubleClickReturnValue (true, 0.8);
    fader.onValueChange = [this]
    {
        if (auto* t = track())
        {
            t->volume = (float) fader.getValue();
            dbLabel.setText (DawUnits::formatDb (t->getVolumeDb()), juce::dontSendNotification);

            if (t->isMaster())
                session.setMasterGain (t->volume);
            else
                session.notify (DawSession::mixerChanged);
        }
    };
    addAndMakeVisible (fader);

    dbLabel.setFont (juce::FontOptions (9.5f));
    dbLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    dbLabel.setJustificationType (juce::Justification::centred);
    dbLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (dbLabel);

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

    addAndMakeVisible (meter);
    refresh();
}

void ChannelStrip::showInsertMenu (int slotIndex)
{
    auto* t = track();

    if (t == nullptr || slotIndex >= (int) t->inserts.size())
        return;

    juce::PopupMenu m;
    const auto effects = DawSession::getAvailableEffects();

    for (int i = 0; i < effects.size(); ++i)
        m.addItem (i + 1, effects[i], true, t->inserts[(size_t) slotIndex].name == effects[i]);

    m.addSeparator();
    m.addItem (DawSession::insertMenuOpenId, "Open",
               ! t->inserts[(size_t) slotIndex].isEmpty());
    m.addItem (98, "Bypass", ! t->inserts[(size_t) slotIndex].isEmpty(),
               t->inserts[(size_t) slotIndex].bypassed);
    m.addItem (99, "Remove", ! t->inserts[(size_t) slotIndex].isEmpty());

    m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&insertButtons[(size_t) slotIndex]),
                     [this, slotIndex] (int r)
    {
        auto* t2 = track();

        if (t2 == nullptr || slotIndex >= (int) t2->inserts.size())
            return;

        auto& slot = t2->inserts[(size_t) slotIndex];

        if (r == 98)
        {
            slot.bypassed = ! slot.bypassed;
        }
        else if (r == DawSession::insertMenuOpenId)
        {
            session.showFxInsertEditor (index, slotIndex);
            return;
        }
        else if (r == 99)
        {
            slot.name.clear();
            slot.instrumentId.clear();
            slot.bypassed = false;
        }
        else
        {
            const auto effects = DawSession::getAvailableEffects();

            if (r >= 1 && r <= effects.size())
            {
                slot.name = effects[r - 1];
                slot.instrumentId = DawSession::effectIdForName (slot.name);
                slot.bypassed = false;
                session.notify (DawSession::mixerChanged);
                session.showFxInsertEditor (index, slotIndex);
                return;
            }
        }

        session.notify (DawSession::mixerChanged);
    });
}

void ChannelStrip::mouseDoubleClick (const juce::MouseEvent& e)
{
    for (int i = 0; i < (int) insertButtons.size(); ++i)
    {
        if (e.eventComponent != &insertButtons[(size_t) i])
            continue;

        auto* t = track();

        if (t != nullptr && i < (int) t->inserts.size() && ! t->inserts[(size_t) i].isEmpty())
            session.showFxInsertEditor (index, i);

        return;
    }
}

void ChannelStrip::mouseDown (const juce::MouseEvent&)
{
    session.setSelectedTrack (index);
}

void ChannelStrip::resized()
{
    auto r = getLocalBounds().reduced (5, 4);
    const auto* t = track();
    const bool isMaster = t != nullptr && t->isMaster();

    r.removeFromTop (3);   // room for the colour tab painted at the top
    nameLabel.setBounds (r.removeFromTop (15));
    instrumentLabel.setBounds (r.removeFromTop (11));
    r.removeFromTop (4);

    for (auto& b : insertButtons)
    {
        b.setBounds (r.removeFromTop (15));
        r.removeFromTop (3);
    }

    r.removeFromTop (2);
    pan.setBounds (r.removeFromTop (24).withSizeKeepingCentre (24, 24));
    r.removeFromTop (4);

    auto bottom = r.removeFromBottom (18);
    const auto toggleWidth = juce::jmin (22, (bottom.getWidth() - 4) / 2);
    auto toggles = bottom.withSizeKeepingCentre (toggleWidth * 2 + 4, 16);
    mute.setBounds (toggles.removeFromLeft (toggleWidth));
    toggles.removeFromLeft (4);
    solo.setBounds (toggles.removeFromLeft (toggleWidth));
    solo.setVisible (! isMaster);

    if (isMaster)
        mute.setBounds (bottom.withSizeKeepingCentre (toggleWidth, 16));

    dbLabel.setBounds (r.removeFromBottom (12));

    auto faderArea = r.reduced (0, 2);
    meter.setBounds (faderArea.removeFromRight (10).reduced (1, 0));
    faderArea.removeFromRight (3);
    fader.setBounds (faderArea);
}

void ChannelStrip::paint (juce::Graphics& g)
{
    const auto* t = track();

    if (t == nullptr)
        return;

    const bool selected = session.getSelectedTrack() == index;
    g.fillAll (selected ? DawColours::rowSelected : DawColours::panel);

    g.setColour (t->colour.withAlpha (session.isTrackAudible (index) ? 1.0f : 0.4f));
    g.fillRect (0, 0, getWidth(), 3);

    g.setColour (DawColours::divider);
    g.drawVerticalLine (getWidth() - 1, 0.0f, (float) getHeight());

    if (selected)
    {
        g.setColour (DawColours::accent);
        g.fillRect (0, 0, getWidth(), 2);
    }

    // Track number in the top-left corner.
    g.setColour (DawColours::textDim);
    g.setFont (juce::FontOptions (8.5f));
    g.drawText (t->isMaster() ? "MST" : DawWidgets::makeTrackNumber (index),
                3, 4, 24, 12, juce::Justification::centredLeft, false);

    if (t->recordArm)
    {
        g.setColour (DawColours::armOn);
        g.fillEllipse ((float) getWidth() - 10.0f, 6.0f, 4.0f, 4.0f);
    }
}

void ChannelStrip::refresh()
{
    const auto* t = track();

    if (t == nullptr)
        return;

    if (! nameLabel.isBeingEdited())
        nameLabel.setText (t->name, juce::dontSendNotification);

    instrumentLabel.setText (t->instrumentSlot.isEmpty() ? juce::String ("-") : t->instrumentSlot.name,
                             juce::dontSendNotification);
    instrumentLabel.setTooltip (t->instrument);

    for (int i = 0; i < (int) insertButtons.size(); ++i)
    {
        const auto empty = i >= (int) t->inserts.size() || t->inserts[(size_t) i].isEmpty();
        auto& b = insertButtons[(size_t) i];
        b.setButtonText (empty ? "+" : (t->inserts[(size_t) i].instrumentId == "equalizer-x" ? "EQ"
                                      : t->inserts[(size_t) i].instrumentId == "dynamic-x" ? "DYN"
                                      : t->inserts[(size_t) i].instrumentId == "reverb-x" ? "REV"
                                      : t->inserts[(size_t) i].instrumentId == "boost-x" ? "BOOST"
                                      : t->inserts[(size_t) i].instrumentId == "limiter-x" ? "LIM"
                                      : t->inserts[(size_t) i].name));
        b.setColour (juce::TextButton::textColourOffId,
                     empty ? DawColours::textDim
                           : (t->inserts[(size_t) i].bypassed ? DawColours::textDim : DawColours::text));
        b.setColour (juce::TextButton::buttonColourId,
                     empty ? DawColours::insertSlot : DawColours::control);
    }

    if (! fader.isMouseButtonDown())
        fader.setValue (t->volume, juce::dontSendNotification);

    if (! pan.isMouseButtonDown())
        pan.setValue (t->pan, juce::dontSendNotification);

    fader.setTooltip ("Volume: " + DawUnits::formatDb (t->getVolumeDb()));
    pan.setTooltip ("Pan: " + DawUnits::formatPan (t->pan));
    dbLabel.setText (DawUnits::formatDb (t->getVolumeDb()), juce::dontSendNotification);

    mute.setToggleState (t->mute, juce::dontSendNotification);
    solo.setToggleState (t->solo, juce::dontSendNotification);

    repaint();
}

void ChannelStrip::refreshMeter()
{
    if (const auto* t = track())
        meter.setLevel (t->meterLevel);
}

//==============================================================================
MixerPanel::MixerPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    headerLabel.setText ("MIXER", juce::dontSendNotification);
    headerLabel.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
    headerLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    headerLabel.setJustificationType (juce::Justification::centredLeft);
    headerLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (headerLabel);

    closeButton.setTooltip ("Hide mixer  (M)");
    closeButton.onClick = [this] { session.setMixerVisible (false); };
    addAndMakeVisible (closeButton);

    viewport.setViewedComponent (&holder, false);
    viewport.setScrollBarsShown (false, true);
    addAndMakeVisible (viewport);

    rebuildStrips();
}

MixerPanel::~MixerPanel()
{
    session.removeListener (this);
}

void MixerPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    auto header = getLocalBounds().removeFromTop (mixerHeaderHeight);
    g.setColour (DawColours::header);
    g.fillRect (header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (0, 0.0f, (float) getWidth());
    g.drawHorizontalLine (header.getBottom() - 1, 0.0f, (float) getWidth());

    if (masterStrip != nullptr)
    {
        g.setColour (DawColours::divider);
        g.drawVerticalLine (masterStrip->getX() - 1, (float) masterStrip->getY(),
                            (float) masterStrip->getBottom());
    }
}

void MixerPanel::resized()
{
    auto r = getLocalBounds();
    auto header = r.removeFromTop (mixerHeaderHeight);
    closeButton.setBounds (header.removeFromRight (26).withSizeKeepingCentre (20, 20));
    headerLabel.setBounds (header.withTrimmedLeft (9));

    if (masterStrip != nullptr)
    {
        auto master = r.removeFromRight (masterStripWidth);
        masterStrip->setBounds (master.withTrimmedLeft (2));
    }

    viewport.setBounds (r);
    holder.setSize (juce::jmax (viewport.getMaximumVisibleWidth(),
                                (int) strips.size() * StripHolder::stripWidth),
                    juce::jmax (1, viewport.getMaximumVisibleHeight()));
    holder.resized();
}

void MixerPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::metersChanged) != 0)
    {
        for (auto& strip : strips)
            strip->refreshMeter();

        if (masterStrip != nullptr)
            masterStrip->refreshMeter();
    }

    if ((changeFlags & DawSession::tracksChanged) != 0)
    {
        rebuildStrips();
        return;
    }

    if ((changeFlags & (DawSession::mixerChanged | DawSession::selectionChanged
                        | DawSession::tracksChanged)) != 0)
    {
        for (auto& strip : strips)
            strip->refresh();

        if (masterStrip != nullptr)
            masterStrip->refresh();
    }
}

void MixerPanel::rebuildStrips()
{
    holder.removeAllChildren();
    strips.clear();
    masterStrip.reset();

    for (int i = 1; i < session.getNumTracks(); ++i)
    {
        const auto* track = session.getTrack (i);

        if (track == nullptr || track->isGroup())
            continue;

        auto strip = std::make_unique<ChannelStrip> (session, i);
        holder.addAndMakeVisible (*strip);
        strips.push_back (std::move (strip));
    }

    if (session.getNumTracks() > 0)
    {
        masterStrip = std::make_unique<ChannelStrip> (session, 0);
        addAndMakeVisible (*masterStrip);
    }

    resized();
}
