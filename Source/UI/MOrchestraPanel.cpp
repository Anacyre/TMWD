#include "MOrchestraPanel.h"
#include "../Audio/MOrchestra/MOrchestraEngine.h"
#include "../Audio/MOrchestra/MOrchestraUi.h"
#include "../Plugins/InstrumentRegistry.h"
#include "Widgets.h"

namespace
{
    const juce::Colour gold { MOrchestraUi::gold };
    const juce::Colour goldDim { 0xff8a7349 };
    const juce::Colour panelBg { 0xff121212 };
    const juce::Colour cardBg { 0xff161616 };
    const juce::Colour railBg { 0xff141414 };

    bool liveAvailable (const MOrchestraUi::Instrument& item)
    {
        if (! item.available)
            return false;

        if (! MOrchestra::Engine::get().isAvailable())
            return item.available;

        return MOrchestra::Engine::get().findInstrument (item.id) != nullptr;
    }
}

//==============================================================================
class MOrchestraPanel::FamilyRail  : public juce::Component
{
public:
    std::function<void (juce::String)> onSelect;
    juce::String selected;

    FamilyRail()
    {
        for (int i = 0; i < MOrchestraUi::numFamilies(); ++i)
        {
            auto* button = buttons.add (new juce::TextButton (MOrchestraUi::families()[i].label));
            button->setClickingTogglesState (true);
            button->setRadioGroupId (47);
            button->setColour (juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
            button->setColour (juce::TextButton::buttonOnColourId, juce::Colour (0xff1c1c1c));
            button->setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
            button->setColour (juce::TextButton::textColourOnId, gold);
            const auto id = juce::String (MOrchestraUi::families()[i].id);
            button->onClick = [this, id] { if (onSelect) onSelect (id); };
            addAndMakeVisible (button);
        }
    }

    void setSelected (const juce::String& familyId)
    {
        selected = familyId;
        for (int i = 0; i < buttons.size(); ++i)
            buttons[i]->setToggleState (familyId == MOrchestraUi::families()[i].id, juce::dontSendNotification);
    }

    void resized() override
    {
        auto area = getLocalBounds().reduced (6, 8);
        for (auto* button : buttons)
            button->setBounds (area.removeFromTop (56).reduced (2, 4));
    }

    juce::OwnedArray<juce::TextButton> buttons;
};

//==============================================================================
class MOrchestraPanel::Hero  : public juce::Component
{
public:
    juce::String familyName, instrumentName, techniqueName;

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat().reduced (8.0f);
        const auto size = juce::jmin (bounds.getWidth(), bounds.getHeight());
        auto ring = bounds.withSizeKeepingCentre (size, size);

        g.setColour (juce::Colour (0xff101010));
        g.fillEllipse (ring);
        g.setColour (gold.withAlpha (0.4f));
        g.drawEllipse (ring.reduced (1.0f), 1.2f);
        g.setColour (gold.withAlpha (0.18f));
        g.drawEllipse (ring.reduced (size * 0.16f), 1.0f);

        auto text = ring.reduced (size * 0.16f);
        g.setColour (gold);
        g.setFont (juce::Font (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (familyName.toUpperCase(), text.removeFromTop (text.getHeight() * 0.28f).toNearestInt(),
                    juce::Justification::centredBottom, false);
        g.setColour (DawColours::text);
        g.setFont (juce::Font (juce::FontOptions (20.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (instrumentName.toUpperCase(), text.removeFromTop (text.getHeight() * 0.55f).toNearestInt(),
                    juce::Justification::centred, true);
        g.setColour (DawColours::textMuted);
        g.setFont (juce::FontOptions (12.0f));
        g.drawText (techniqueName.toUpperCase(), text.toNearestInt(), juce::Justification::centredTop, false);
    }
};

//==============================================================================
class MOrchestraPanel::GoldKnob  : public juce::Component
{
public:
    juce::String id;
    bool available = false;
    float defaultValue = 0.5f;
    std::function<void (float)> onChange;

    GoldKnob()
    {
        setWantsKeyboardFocus (true);
        setMouseCursor (juce::MouseCursor::UpDownResizeCursor);
    }

    void setLabels (const juce::String& nameText, const juce::String& mappingText)
    {
        name = nameText;
        mapping = mappingText;
        repaint();
    }

    void setValue (float newValue, juce::NotificationType notify)
    {
        value = juce::jlimit (0.0f, 1.0f, newValue);
        repaint();

        if (notify != juce::dontSendNotification && onChange != nullptr)
            onChange (value);
    }

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat();
        g.setColour (available ? gold : DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (name.toUpperCase(), bounds.removeFromTop (16.0f), juce::Justification::centred, false);

        auto valueArea = bounds.removeFromBottom (16.0f);
        g.setColour (available ? DawColours::text : DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (available ? juce::String (juce::roundToInt (value * 127.0f)) : juce::String ("N/A"),
                    valueArea, juce::Justification::centred, false);

        const auto size = juce::jmin (bounds.getWidth(), bounds.getHeight()) - 4.0f;
        auto ring = bounds.withSizeKeepingCentre (size, size);
        const auto start = juce::degreesToRadians (225.0f);
        const auto end = juce::degreesToRadians (495.0f);
        const auto angle = start + (end - start) * value;
        const auto thickness = dragging ? 3.1f : 2.4f;

        juce::Path track;
        track.addCentredArc (ring.getCentreX(), ring.getCentreY(), ring.getWidth() * 0.42f, ring.getHeight() * 0.42f,
                             0.0f, start, end, true);
        g.setColour (DawColours::sliderTrack);
        g.strokePath (track, juce::PathStrokeType (thickness, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));

        if (available)
        {
            juce::Path fill;
            fill.addCentredArc (ring.getCentreX(), ring.getCentreY(), ring.getWidth() * 0.42f, ring.getHeight() * 0.42f,
                                0.0f, start, angle, true);
            g.setColour (gold.withAlpha (dragging ? 0.95f : 0.85f));
            g.strokePath (fill, juce::PathStrokeType (thickness, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
            const auto tip = juce::Point<float> (ring.getCentreX(), ring.getCentreY())
                                 .getPointOnCircumference (ring.getWidth() * 0.33f, angle);
            g.setColour (gold);
            g.fillEllipse (juce::Rectangle<float> (6.5f, 6.5f).withCentre (tip));
        }

        g.setColour (DawColours::textDim);
        g.setFont (juce::FontOptions (9.0f));
        g.drawText (mapping, getLocalBounds().removeFromBottom (14).translated (0, -16),
                    juce::Justification::centred, false);
    }

    void mouseDown (const juce::MouseEvent&) override
    {
        if (! available)
            return;

        dragStart = value;
        dragging = true;
        grabKeyboardFocus();
        repaint();
    }

    void mouseDrag (const juce::MouseEvent& e) override
    {
        if (available)
            setValue (dragStart - (float) e.getDistanceFromDragStartY() / 140.0f, juce::sendNotification);
    }

    void mouseUp (const juce::MouseEvent&) override { dragging = false; repaint(); }

    void mouseDoubleClick (const juce::MouseEvent&) override
    {
        if (available)
            setValue (defaultValue, juce::sendNotification);
    }

    void mouseWheelMove (const juce::MouseEvent&, const juce::MouseWheelDetails& wheel) override
    {
        if (available)
            setValue (value + wheel.deltaY * 0.08f, juce::sendNotification);
    }

private:
    juce::String name, mapping;
    float value = 0.5f, dragStart = 0.5f;
    bool dragging = false;
};

//==============================================================================
class MOrchestraPanel::MiniKeyboard  : public juce::Component
{
public:
    int trackIndex = -1;
    DawSession* session = nullptr;

    void paint (juce::Graphics& g) override
    {
        g.fillAll (juce::Colour (0xff0e0e0e));
        auto bounds = getLocalBounds().toFloat().reduced (4.0f, 6.0f);
        const int whiteCount = 15;
        const auto whiteW = bounds.getWidth() / (float) whiteCount;
        const auto blackW = whiteW * 0.62f;
        const auto blackH = bounds.getHeight() * 0.62f;

        for (int i = 0; i < whiteCount; ++i)
        {
            auto key = juce::Rectangle<float> (bounds.getX() + (float) i * whiteW, bounds.getY(),
                                               whiteW - 1.2f, bounds.getHeight());
            g.setColour (whiteNoteAt (i) == heldNote ? gold : juce::Colour (0xffece6dc));
            g.fillRoundedRectangle (key, 2.0f);
        }

        static constexpr int blackOffsets[] = { 1, 2, 4, 5, 6, 8, 9, 11, 12, 13 };

        for (int offset : blackOffsets)
        {
            auto key = juce::Rectangle<float> (bounds.getX() + (float) offset * whiteW - blackW * 0.5f,
                                               bounds.getY(), blackW, blackH);
            const auto note = blackNoteAt (offset);
            g.setColour (note == heldNote ? goldDim : juce::Colour (0xff161616));
            g.fillRoundedRectangle (key, 2.0f);
        }
    }

    void mouseDown (const juce::MouseEvent& e) override { noteOn (noteAt (e.position)); }
    void mouseUp (const juce::MouseEvent&) override { noteOff(); }
    void mouseDrag (const juce::MouseEvent& e) override
    {
        const auto note = noteAt (e.position);
        if (note != heldNote) { noteOff(); noteOn (note); }
    }
    void mouseExit (const juce::MouseEvent&) override { noteOff(); }

private:
    int heldNote = -1;
    static constexpr int firstNote = 48;

    static int whiteNoteAt (int whiteIndex)
    {
        static constexpr int pattern[] = { 0, 2, 4, 5, 7, 9, 11 };
        return firstNote + (whiteIndex / 7) * 12 + pattern[whiteIndex % 7];
    }

    static int blackNoteAt (int offsetFromC)
    {
        static constexpr int semis[] = { -1, 1, 3, -1, 6, 8, 10 };
        const auto degree = offsetFromC % 7;
        return semis[degree] < 0 ? -1 : firstNote + (offsetFromC / 7) * 12 + semis[degree];
    }

    int noteAt (juce::Point<float> pos) const
    {
        auto bounds = getLocalBounds().toFloat().reduced (4.0f, 6.0f);
        const int whiteCount = 15;
        const auto whiteW = bounds.getWidth() / (float) whiteCount;
        const auto blackW = whiteW * 0.62f;
        const auto blackH = bounds.getHeight() * 0.62f;
        const auto x = pos.x - bounds.getX();
        const auto y = pos.y - bounds.getY();

        if (y < blackH)
        {
            static constexpr int blackOffsets[] = { 1, 2, 4, 5, 6, 8, 9, 11, 12, 13 };
            for (int offset : blackOffsets)
            {
                const auto left = (float) offset * whiteW - blackW * 0.5f;
                if (x >= left && x < left + blackW)
                    return blackNoteAt (offset);
            }
        }

        return whiteNoteAt (juce::jlimit (0, whiteCount - 1, (int) (x / whiteW)));
    }

    void noteOn (int note)
    {
        if (session == nullptr || trackIndex < 0 || note < 0)
            return;

        heldNote = note;
        session->previewNoteOn (trackIndex, note, 0.8f);
        repaint();
    }

    void noteOff()
    {
        if (session != nullptr && heldNote >= 0)
            session->previewNoteOff (trackIndex, heldNote);

        heldNote = -1;
        repaint();
    }
};

//==============================================================================
class MOrchestraPanel::LibraryGrid  : public juce::Component
{
public:
    std::function<void (juce::String)> onSelect;
    juce::String familyId { "strings" };
    juce::String selectedId;
    juce::OwnedArray<juce::TextButton> cards;

    void rebuild()
    {
        cards.clear();

        for (int i = 0; i < MOrchestraUi::numInstruments(); ++i)
        {
            const auto& item = MOrchestraUi::instruments()[i];

            if (familyId != item.family)
                continue;

            auto* card = cards.add (new juce::TextButton (item.name));
            const auto available = liveAvailable (item);
            card->setEnabled (available);
            card->setColour (juce::TextButton::buttonColourId, cardBg);
            card->setColour (juce::TextButton::buttonOnColourId, juce::Colour (0xff1c1c1c));
            card->setColour (juce::TextButton::textColourOffId, available ? DawColours::text : DawColours::textDim);
            card->setColour (juce::TextButton::textColourOnId, gold);
            card->setClickingTogglesState (true);
            card->setRadioGroupId (91);
            card->setToggleState (selectedId == item.id, juce::dontSendNotification);
            const juce::String id (item.id);
            const juce::String caption = available ? juce::String (item.name)
                                                   : juce::String (item.name) + "\nNo sample";
            card->setButtonText (caption);
            card->onClick = [this, id, available]
            {
                if (available && onSelect)
                    onSelect (id);
            };
            addAndMakeVisible (card);
        }

        resized();
        repaint();
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (railBg);
        g.setColour (gold);
        g.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (familyId.toUpperCase(), getLocalBounds().removeFromTop (28).reduced (10, 8),
                    juce::Justification::centredLeft, false);
    }

    void resized() override
    {
        auto area = getLocalBounds().reduced (10);
        area.removeFromTop (22);
        const int columns = 2;
        const int rows = juce::jmax (1, (cards.size() + columns - 1) / columns);
        const auto cellW = area.getWidth() / columns;
        const auto cellH = juce::jmax (64, juce::jmin (84, area.getHeight() / juce::jmax (1, rows)));

        for (int i = 0; i < cards.size(); ++i)
        {
            const int col = i % columns;
            const int row = i / columns;
            cards[i]->setBounds (area.getX() + col * cellW + 3,
                                 area.getY() + row * cellH + 3,
                                 cellW - 6, cellH - 6);
        }
    }
};

//==============================================================================
MOrchestraPanel::MOrchestraPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);
    MOrchestra::Engine::get().initialise();

    brandLabel.setText ("M ORCHESTRA", juce::dontSendNotification);
    brandLabel.setFont (juce::Font (juce::FontOptions (13.0f).withStyleFlags (juce::Font::bold)));
    brandLabel.setColour (juce::Label::textColourId, gold);
    brandLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (brandLabel);

    subLabel.setText ("Built-in orchestral plugin", juce::dontSendNotification);
    subLabel.setFont (juce::FontOptions (11.0f));
    subLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    subLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (subLabel);

    statusLabel.setFont (juce::FontOptions (11.0f));
    statusLabel.setColour (juce::Label::textColourId, DawColours::textMuted);
    statusLabel.setJustificationType (juce::Justification::centredRight);
    statusLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (statusLabel);

    familyRail = std::make_unique<FamilyRail>();
    familyRail->onSelect = [this] (juce::String id) { selectFamily (id); };
    addAndMakeVisible (*familyRail);

    hero = std::make_unique<Hero>();
    addAndMakeVisible (*hero);

    keyboard = std::make_unique<MiniKeyboard>();
    keyboard->session = &session;
    addAndMakeVisible (*keyboard);

    libraryGrid = std::make_unique<LibraryGrid>();
    libraryGrid->onSelect = [this] (juce::String id) { selectInstrument (id); };
    addAndMakeVisible (*libraryGrid);
}

MOrchestraPanel::~MOrchestraPanel()
{
    session.removeListener (this);
}

TrackData* MOrchestraPanel::getTrack() { return session.getTrack (trackIndex); }
const TrackData* MOrchestraPanel::getTrack() const { return session.getTrack (trackIndex); }

void MOrchestraPanel::setTrackIndex (int newTrackIndex)
{
    trackIndex = newTrackIndex;
    keyboard->trackIndex = newTrackIndex;

    if (auto* track = getTrack())
        boundTrackId = track->id;

    rebuild();
}

void MOrchestraPanel::sessionChanged (int changeFlags)
{
    pendingChangeFlags |= changeFlags;

    if (sessionUpdateScheduled)
        return;

    sessionUpdateScheduled = true;
    juce::Component::SafePointer<MOrchestraPanel> safe (this);
    juce::MessageManager::callAsync ([safe]
    {
        if (safe != nullptr)
            safe->applySessionChange();
    });
}

void MOrchestraPanel::applySessionChange()
{
    sessionUpdateScheduled = false;
    const auto flagsToApply = pendingChangeFlags;
    pendingChangeFlags = 0;

    if ((flagsToApply & (DawSession::tracksChanged | DawSession::mixerChanged | DawSession::selectionChanged)) == 0)
        return;

    if (auto* track = session.findTrack (boundTrackId))
        trackIndex = session.indexOfTrack (track->id);

    if (rebuilding)
    {
        rebuildPending = true;
        return;
    }

    auto* track = getTrack();
    const auto instrumentId = track != nullptr ? track->instrumentDefinitionId : juce::String();
    const auto techniqueId = track != nullptr ? track->techniqueId : juce::String();

    if (instrumentId != lastInstrumentId)
        rebuild();
    else if (techniqueId != lastTechniqueId)
        rebuild();
    else
        refreshValues();
}

void MOrchestraPanel::selectFamily (const juce::String& id)
{
    familyId = id;
    familyRail->setSelected (familyId);
    libraryGrid->familyId = familyId;
    libraryGrid->rebuild();
    resized();
}

void MOrchestraPanel::selectInstrument (const juce::String& definitionId)
{
    if (auto* track = getTrack())
        session.assignInstrumentDefinition (*track, definitionId);
}

void MOrchestraPanel::applyTechnique (const juce::String& techniqueId)
{
    if (auto* track = getTrack())
        session.setTrackTechnique (*track, techniqueId);
}

void MOrchestraPanel::applyControl (const juce::String& controlId, float value)
{
    if (auto* track = getTrack())
        session.setTrackController (*track, controlId, value);
}

void MOrchestraPanel::rebuild()
{
    if (rebuilding)
    {
        rebuildPending = true;
        return;
    }

    rebuilding = true;
    auto* track = getTrack();
    const auto& registry = session.getEngineAPI().getInstruments();
    const auto* definition = track != nullptr
                                 ? registry.findDefinition (track->instrumentDefinitionId)
                                 : nullptr;

    lastInstrumentId = definition != nullptr ? definition->id : juce::String();
    lastTechniqueId = track != nullptr ? track->techniqueId : juce::String();
    familyId = MOrchestraUi::familyOf (lastInstrumentId);
    familyRail->setSelected (familyId);

    const auto* ui = MOrchestraUi::find (lastInstrumentId);
    hero->familyName = familyId;
    hero->instrumentName = ui != nullptr ? juce::String (ui->name)
                                         : (track != nullptr ? track->instrument : juce::String ("M Orchestra"));

    techniqueButtons.clear();
    knobs.clear();

    if (definition != nullptr)
    {
        for (const auto& techniqueId : definition->techniques)
        {
            const auto* technique = registry.findTechnique (techniqueId);
            auto* button = techniqueButtons.add (new juce::TextButton (technique != nullptr ? technique->displayName
                                                                                            : techniqueId));
            button->setClickingTogglesState (true);
            button->setRadioGroupId (73);
            button->setColour (juce::TextButton::buttonColourId, juce::Colours::transparentBlack);
            button->setColour (juce::TextButton::buttonOnColourId, juce::Colour (0xff1c1c1c));
            button->setColour (juce::TextButton::textColourOffId, DawColours::textMuted);
            button->setColour (juce::TextButton::textColourOnId, gold);
            const auto mapped = technique != nullptr && technique->action.mapped;
            button->setEnabled (mapped);
            button->setToggleState (track != nullptr && track->techniqueId == techniqueId, juce::dontSendNotification);
            button->onClick = [this, techniqueId] { applyTechnique (techniqueId); };
            addAndMakeVisible (button);
        }

        if (! definition->techniques.isEmpty())
        {
            const auto* selected = registry.findTechnique (track != nullptr ? track->techniqueId : juce::String());
            hero->techniqueName = selected != nullptr ? selected->displayName : definition->techniques[0];
        }
        else
        {
            hero->techniqueName = "Long";
        }

        for (const auto& controlId : definition->controllers)
        {
            if (controlId == "pedal")
                continue;

            const auto* controller = registry.findController (controlId);
            auto* knob = knobs.add (new GoldKnob());
            knob->id = controlId;
            knob->available = controller != nullptr && controller->mapped;
            knob->defaultValue = 0.8f;

            if (controller != nullptr && controller->max > controller->min)
                knob->defaultValue = (float) (controller->defaultValue - controller->min)
                                     / (float) (controller->max - controller->min);

            juce::String mapping;
            if (controller != nullptr && controller->midiCC > 0)
                mapping = "CC" + juce::String (controller->midiCC);
            knob->setLabels (controller != nullptr ? controller->displayName : controlId, mapping);
            knob->onChange = [this, controlId] (float value) { applyControl (controlId, value); };
            addAndMakeVisible (knob);
        }
    }
    else
    {
        hero->techniqueName = "Long";
    }

    if (track != nullptr)
    {
        statusLabel.setText (track->instrumentLoadMessage.isNotEmpty()
                                 ? track->instrumentLoadMessage
                                 : instrumentLoadStateLabel (track->instrumentLoadState),
                             juce::dontSendNotification);
        const auto err = track->instrumentLoadState == InstrumentLoadState::Error
                      || track->instrumentLoadState == InstrumentLoadState::Unavailable;
        statusLabel.setColour (juce::Label::textColourId, err ? DawColours::muteOn : juce::Colour (0xff9db89a));
    }
    else
    {
        statusLabel.setText ({}, juce::dontSendNotification);
    }

    libraryGrid->selectedId = lastInstrumentId;
    libraryGrid->familyId = familyId;
    libraryGrid->rebuild();
    keyboard->trackIndex = trackIndex;

    rebuilding = false;
    refreshValues();
    resized();
    hero->repaint();

    if (rebuildPending)
    {
        rebuildPending = false;
        rebuild();
    }
}

void MOrchestraPanel::refreshValues()
{
    auto* track = getTrack();

    if (track == nullptr)
        return;

    for (auto* knob : knobs)
    {
        const auto it = track->controllerValues.find (knob->id);
        if (it != track->controllerValues.end())
            knob->setValue (it->second, juce::dontSendNotification);
    }

    statusLabel.setText (track->instrumentLoadMessage.isNotEmpty()
                             ? track->instrumentLoadMessage
                             : instrumentLoadStateLabel (track->instrumentLoadState),
                         juce::dontSendNotification);
}

void MOrchestraPanel::paint (juce::Graphics& g)
{
    g.fillAll (panelBg);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (44, 0.0f, (float) getWidth());
    g.drawVerticalLine (76, 44.0f, (float) getHeight());
    g.drawVerticalLine (getWidth() - 248, 44.0f, (float) getHeight());
}

void MOrchestraPanel::resized()
{
    auto bounds = getLocalBounds();
    auto header = bounds.removeFromTop (44);
    brandLabel.setBounds (header.removeFromLeft (220).reduced (14, 4).removeFromTop (22));
    subLabel.setBounds (14, 24, 220, 16);
    statusLabel.setBounds (header.reduced (12, 10));

    familyRail->setBounds (bounds.removeFromLeft (76));
    libraryGrid->setBounds (bounds.removeFromRight (248));

    auto stage = bounds.reduced (12, 10);
    hero->setBounds (stage.removeFromTop (juce::jmin (220, stage.getHeight() / 2)).withSizeKeepingCentre (
                         juce::jmin (220, stage.getWidth()), juce::jmin (200, stage.getHeight() / 2)));

    if (! techniqueButtons.isEmpty())
    {
        auto row = stage.removeFromTop (34);
        const auto w = juce::jmin (120, row.getWidth() / techniqueButtons.size());
        auto centred = row.withSizeKeepingCentre (w * techniqueButtons.size(), 28);
        for (auto* button : techniqueButtons)
            button->setBounds (centred.removeFromLeft (w).reduced (4, 2));
    }

    if (! knobs.isEmpty())
    {
        auto row = stage.removeFromTop (130);
        const auto w = juce::jmax (80, juce::jmin (110, row.getWidth() / knobs.size()));
        auto centred = row.withSizeKeepingCentre (w * knobs.size(), 124);
        for (auto* knob : knobs)
            knob->setBounds (centred.removeFromLeft (w).reduced (4, 0));
    }

    keyboard->setBounds (stage.removeFromBottom (78));
}

//==============================================================================
MOrchestraWindow::MOrchestraWindow (DawSession& sessionToUse)
    : DocumentWindow ("M Orchestra", panelBg, DocumentWindow::closeButton)
{
    panel = std::make_unique<MOrchestraPanel> (sessionToUse);
    setUsingNativeTitleBar (true);
    setContentNonOwned (panel.get(), true);
    setResizable (true, true);
    setResizeLimits (860, 620, 1600, 1100);
    centreWithSize (1080, 740);
    addToDesktop (getDesktopWindowStyleFlags());
    setVisible (true);
}

MOrchestraWindow::~MOrchestraWindow()
{
    clearContentComponent();
}

void MOrchestraWindow::closeButtonPressed()
{
    if (onClose != nullptr)
        onClose();
}

void MOrchestraWindow::setTrackIndex (int trackIndex)
{
    if (panel != nullptr)
        panel->setTrackIndex (trackIndex);
}
