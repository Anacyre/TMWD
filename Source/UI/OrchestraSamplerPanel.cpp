#include "OrchestraSamplerPanel.h"
#include "Widgets.h"
#include "InstrumentSelector.h"
#include "InstrumentArtwork.h"

namespace
{
    juce::Colour statusColour (const juce::String& state)
    {
        if (state.containsIgnoreCase ("ready") || state.containsIgnoreCase ("loaded")
            || state.containsIgnoreCase ("active"))
            return DawColours::soloOn;

        if (state.containsIgnoreCase ("load") || state.containsIgnoreCase ("restor")
            || state.containsIgnoreCase ("init"))
            return DawColours::accent;

        if (state.containsIgnoreCase ("error") || state.containsIgnoreCase ("unavailable"))
            return DawColours::muteOn;

        return DawColours::textDim;
    }

    juce::String mappingCaption (const SamplerControl& control)
    {
        if (! control.available)
            return "Unmapped";

        if (control.midiMapping.isNotEmpty())
            return control.midiMapping;

        return control.source.isNotEmpty() ? control.source : juce::String ("MIDI");
    }
}

//==============================================================================
class OrchestraSamplerPanel::InstrumentHero  : public juce::Component,
                                               private juce::Timer
{
public:
    void setGlyph (const juce::String& identity, juce::Image image, bool animate)
    {
        if (identity == currentId && ! incomingImage.isValid())
        {
            currentImage = image;
            repaint();
            return;
        }

        if (! animate || ! currentImage.isValid())
        {
            currentId = identity;
            currentImage = image;
            incomingImage = {};
            fade = 1.0f;
            stopTimer();
            repaint();
            return;
        }

        incomingId = identity;
        incomingImage = image;
        fade = 0.0f;
        startTimerHz (60);
    }

    void pulse()
    {
        pulseAmount = 1.0f;
        startTimerHz (60);
    }

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat().reduced (6.0f);
        const auto scale = 1.0f + pulseAmount * 0.04f;
        bounds = bounds.withSizeKeepingCentre (bounds.getWidth() * scale, bounds.getHeight() * scale);

        auto draw = [&g, &bounds] (const juce::Image& image, float alpha, float y)
        {
            if (! image.isValid())
                return;

            g.setOpacity (alpha);
            g.drawImage (image, bounds.translated (0.0f, y),
                         juce::RectanglePlacement::centred | juce::RectanglePlacement::onlyReduceInSize);
            g.setOpacity (1.0f);
        };

        if (incomingImage.isValid())
        {
            draw (currentImage, 1.0f - fade, -8.0f * fade);
            draw (incomingImage, fade, 10.0f * (1.0f - fade));
        }
        else
        {
            draw (currentImage, 1.0f, 0.0f);
        }
    }

private:
    void timerCallback() override
    {
        bool busy = false;

        if (incomingImage.isValid())
        {
            fade = juce::jmin (1.0f, fade + 0.14f);
            busy = fade < 1.0f;

            if (fade >= 1.0f)
            {
                currentImage = incomingImage;
                currentId = incomingId;
                incomingImage = {};
            }
        }

        if (pulseAmount > 0.002f)
        {
            pulseAmount *= 0.8f;
            busy = true;
        }
        else
        {
            pulseAmount = 0.0f;
        }

        if (! busy)
            stopTimer();

        repaint();
    }

    juce::String currentId, incomingId;
    juce::Image currentImage, incomingImage;
    float fade = 1.0f, pulseAmount = 0.0f;
};

//==============================================================================
class OrchestraSamplerPanel::TechniqueButton  : public juce::Button,
                                                private juce::Timer
{
public:
    juce::String techniqueId;
    bool available = false;

    TechniqueButton() : juce::Button ({})
    {
        setMouseCursor (juce::MouseCursor::PointingHandCursor);
        setWantsKeyboardFocus (false);
    }

    void setActive (bool shouldBeActive, bool animate)
    {
        target = shouldBeActive ? 1.0f : 0.0f;

        if (! animate)
        {
            amount = target;
            stopTimer();
            repaint();
            return;
        }

        startTimerHz (60);
    }

    void paintButton (juce::Graphics& g, bool highlighted, bool down) override
    {
        auto colour = available ? DawColours::textMuted : DawColours::textDim;

        if (available && (highlighted || down))
            colour = DawColours::text;

        colour = colour.interpolatedWith (DawColours::text, amount);
        g.setColour (colour);
        g.setFont (juce::Font (juce::FontOptions (15.0f)
                                   .withStyleFlags (amount > 0.5f ? juce::Font::bold : juce::Font::plain)));
        g.drawText (getButtonText(), getLocalBounds().toFloat().removeFromTop ((float) getHeight() - 8.0f),
                    juce::Justification::centred, false);

        if (amount > 0.01f)
        {
            auto line = juce::Rectangle<float> (0.0f, (float) getHeight() - 3.0f, (float) getWidth(), 2.0f)
                            .reduced ((1.0f - amount) * (float) getWidth() * 0.32f, 0.0f);
            g.setColour (DawColours::text.withAlpha (0.3f + 0.6f * amount));
            g.fillRoundedRectangle (line, 1.0f);
        }
    }

private:
    void timerCallback() override
    {
        amount += (target - amount) * 0.28f;

        if (std::abs (amount - target) < 0.012f)
        {
            amount = target;
            stopTimer();
        }

        repaint();
    }

    float amount = 0.0f, target = 0.0f;
};

//==============================================================================
class OrchestraSamplerPanel::PerformanceKnob  : public juce::Component
{
public:
    juce::String id;
    bool available = false;
    float defaultValue = 0.5f;
    std::function<void (float)> onChange;

    PerformanceKnob()
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
        g.setColour (available ? DawColours::textMuted : DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (11.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (name.toUpperCase(), bounds.removeFromTop (16.0f), juce::Justification::centred, false);

        g.setColour (DawColours::textDim);
        g.setFont (juce::FontOptions (10.0f));
        g.drawText (mapping, bounds.removeFromTop (14.0f), juce::Justification::centred, false);

        auto valueArea = bounds.removeFromBottom (16.0f);
        g.setColour (available ? DawColours::text : DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (13.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (available ? juce::String (juce::roundToInt (value * 127.0f)) : juce::String ("N/A"),
                    valueArea, juce::Justification::centred, false);

        const auto size = juce::jmin (bounds.getWidth(), bounds.getHeight()) - 4.0f;
        auto ring = bounds.withSizeKeepingCentre (size, size);
        const auto start = juce::degreesToRadians (225.0f);
        const auto end = juce::degreesToRadians (495.0f);
        const auto angle = start + (end - start) * value;
        const auto thickness = dragging ? 3.1f : 2.3f;

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
            g.setColour (DawColours::text.withAlpha (dragging ? 0.95f : 0.8f));
            g.strokePath (fill, juce::PathStrokeType (thickness, juce::PathStrokeType::curved, juce::PathStrokeType::rounded));
            const auto tip = juce::Point<float> (ring.getCentreX(), ring.getCentreY())
                                 .getPointOnCircumference (ring.getWidth() * 0.33f, angle);
            g.fillEllipse (juce::Rectangle<float> (6.5f, 6.5f).withCentre (tip));
        }
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

    bool keyPressed (const juce::KeyPress& key) override
    {
        if (! available)
            return false;

        const auto step = key.getModifiers().isShiftDown() ? 1.0f / 127.0f : 8.0f / 127.0f;

        if (key == juce::KeyPress::upKey || key == juce::KeyPress::rightKey)
        {
            setValue (value + step, juce::sendNotification);
            return true;
        }

        if (key == juce::KeyPress::downKey || key == juce::KeyPress::leftKey)
        {
            setValue (value - step, juce::sendNotification);
            return true;
        }

        return false;
    }

private:
    juce::String name, mapping;
    float value = 0.5f, dragStart = 0.5f;
    bool dragging = false;
};

//==============================================================================
class OrchestraSamplerPanel::LegatoSwitch  : public juce::Component,
                                             private juce::Timer
{
public:
    std::function<void (bool)> onChange;

    void setOn (bool shouldBeOn, bool animate)
    {
        target = shouldBeOn ? 1.0f : 0.0f;

        if (! animate)
        {
            amount = target;
            stopTimer();
            repaint();
            return;
        }

        startTimerHz (60);
    }

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat();
        g.setColour (DawColours::textMuted);
        g.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (juce::Font::bold)));
        g.drawText ("LEGATO", bounds.removeFromLeft (70.0f), juce::Justification::centredLeft, false);

        auto track = bounds.removeFromLeft (44.0f).withSizeKeepingCentre (40.0f, 22.0f);
        g.setColour (DawColours::sliderTrack.interpolatedWith (DawColours::text.withAlpha (0.2f), amount));
        g.fillRoundedRectangle (track, 11.0f);
        g.setColour (DawColours::text);
        g.fillEllipse (juce::Rectangle<float> (18.0f, 18.0f)
                           .withCentre ({ track.getX() + 11.0f + amount * 18.0f, track.getCentreY() }));
        g.setColour (DawColours::text.withAlpha (0.45f + 0.5f * amount));
        g.setFont (juce::FontOptions (11.0f));
        g.drawText (amount > 0.5f ? "ON" : "OFF", bounds, juce::Justification::centredLeft, false);
    }

    void mouseUp (const juce::MouseEvent&) override
    {
        if (onChange != nullptr)
            onChange (target < 0.5f);
    }

private:
    void timerCallback() override
    {
        amount += (target - amount) * 0.28f;

        if (std::abs (amount - target) < 0.012f)
        {
            amount = target;
            stopTimer();
        }

        repaint();
    }

    float amount = 0.0f, target = 0.0f;
};

//==============================================================================
class OrchestraSamplerPanel::MiniKeyboard  : public juce::Component
{
public:
    int trackIndex = -1;
    DawSession* session = nullptr;

    void paint (juce::Graphics& g) override
    {
        auto bounds = getLocalBounds().toFloat().reduced (4.0f, 6.0f);
        const int whiteCount = 15;
        const auto whiteW = bounds.getWidth() / (float) whiteCount;
        const auto blackW = whiteW * 0.62f;
        const auto blackH = bounds.getHeight() * 0.62f;

        for (int i = 0; i < whiteCount; ++i)
        {
            auto key = juce::Rectangle<float> (bounds.getX() + (float) i * whiteW, bounds.getY(),
                                               whiteW - 1.2f, bounds.getHeight());
            g.setColour (whiteNoteAt (i) == heldNote ? DawColours::accent : DawColours::keyWhite);
            g.fillRoundedRectangle (key, 2.0f);
        }

        static constexpr int blackOffsets[] = { 1, 2, 4, 5, 6, 8, 9, 11, 12, 13 };

        for (int offset : blackOffsets)
        {
            auto key = juce::Rectangle<float> (bounds.getX() + (float) offset * whiteW - blackW * 0.5f,
                                               bounds.getY(), blackW, blackH);
            const auto note = blackNoteAt (offset);
            g.setColour (note == heldNote ? DawColours::accent.darker (0.2f) : DawColours::keyBlack);
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
OrchestraSamplerPanel::OrchestraSamplerPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    auto style = [] (juce::Label& label, float size, juce::Colour colour, bool bold, juce::Justification just)
    {
        label.setFont (bold ? juce::Font (juce::FontOptions (size).withStyleFlags (juce::Font::bold))
                            : juce::Font (juce::FontOptions (size)));
        label.setColour (juce::Label::textColourId, colour);
        label.setJustificationType (just);
        label.setInterceptsMouseClicks (false, false);
    };

    style (statusLabel, 12.0f, DawColours::textMuted, true, juce::Justification::centredRight);
    style (messageLabel, 12.0f, DawColours::textDim, false, juce::Justification::centredLeft);
    style (nameLabel, 22.0f, DawColours::text, true, juce::Justification::centred);
    style (sourceLabel, 13.0f, DawColours::textMuted, false, juce::Justification::centred);

    for (auto* label : { &statusLabel, &messageLabel, &nameLabel, &sourceLabel })
        addAndMakeVisible (*label);

    for (auto* button : { &changeButton, &playButton, &settingsButton, &resetButton })
    {
        DawWidgets::styleFlatButton (*button);
        addAndMakeVisible (*button);
    }

    resetButton.setVisible (false);
    changeButton.onClick = [this] { changeInstrument(); };
    playButton.onClick = [this] { playTest(); };
    settingsButton.setClickingTogglesState (true);
    settingsButton.onClick = [this]
    {
        settingsOpen = settingsButton.getToggleState();
        debugEditor.setVisible (settingsOpen);
        resetButton.setVisible (settingsOpen);
        resized();
        repaint();
    };
    resetButton.onClick = [this] { resetPerformance(); };

    hero = std::make_unique<InstrumentHero>();
    addAndMakeVisible (*hero);

    legatoSwitch = std::make_unique<LegatoSwitch>();
    legatoSwitch->onChange = [this] (bool on) { applyLegato (on); };
    addChildComponent (*legatoSwitch);

    keyboard = std::make_unique<MiniKeyboard>();
    keyboard->session = &session;
    addAndMakeVisible (*keyboard);

    debugEditor.setMultiLine (true);
    debugEditor.setReadOnly (true);
    debugEditor.setFont (juce::Font (juce::FontOptions (12.0f).withName (juce::Font::getDefaultMonospacedFontName())));
    debugEditor.setColour (juce::TextEditor::backgroundColourId, DawColours::panelSunken);
    debugEditor.setColour (juce::TextEditor::textColourId, DawColours::textMuted);
    addChildComponent (debugEditor);

    trackIndex = session.getSelectedTrack();
    rebuild();
}

OrchestraSamplerPanel::~OrchestraSamplerPanel()
{
    session.removeListener (this);
}

void OrchestraSamplerPanel::setTrackIndex (int newTrackIndex)
{
    if (trackIndex == newTrackIndex)
        return;

    trackIndex = newTrackIndex;
    rebuild();
}

TrackData* OrchestraSamplerPanel::getTrack() { return session.getTrack (trackIndex); }
const TrackData* OrchestraSamplerPanel::getTrack() const { return session.getTrack (trackIndex); }

void OrchestraSamplerPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::selectionChanged | DawSession::tracksChanged
                        | DawSession::mixerChanged | DawSession::projectChanged)) == 0)
        return;

    if ((changeFlags & DawSession::selectionChanged) != 0)
        trackIndex = session.getSelectedTrack();

    const auto* track = getTrack();
    const auto definitionId = track != nullptr ? track->instrumentDefinitionId : juce::String();
    const auto techniqueId = track != nullptr ? track->techniqueId : juce::String();
    const auto legato = track != nullptr && track->legatoEnabled;

    if (definitionId != snapshot.capabilities.instrumentId
        || techniqueId != snapshot.techniqueId
        || legato != snapshot.legatoEnabled)
        rebuild();
    else
        refreshValues();
}

void OrchestraSamplerPanel::updateHero()
{
    const auto id = snapshot.capabilities.instrumentId;
    const auto image = InstrumentArtwork::glyphFor (id,
                                                    snapshot.capabilities.displayName,
                                                    snapshot.capabilities.category);
    const bool instrumentChanged = lastInstrumentId != id;
    hero->setGlyph (id, image, instrumentChanged && lastInstrumentId.isNotEmpty());

    if (! instrumentChanged && lastTechniqueId != snapshot.techniqueId && lastTechniqueId.isNotEmpty())
        hero->pulse();

    lastInstrumentId = id;
    lastTechniqueId = snapshot.techniqueId;
}

void OrchestraSamplerPanel::rebuild()
{
    rebuilding = true;
    auto& api = session.getEngineAPI();
    snapshot = OrchestraSampler::buildSnapshot (api.getInstruments(), api.getStateStore(),
                                                getTrack(), trackIndex);

    nameLabel.setText (snapshot.capabilities.displayName.isNotEmpty() ? snapshot.capabilities.displayName
                                                                      : juce::String ("No instrument"),
                       juce::dontSendNotification);
    sourceLabel.setText (snapshot.capabilities.sourcePluginName, juce::dontSendNotification);
    statusLabel.setText (snapshot.loadState, juce::dontSendNotification);
    statusLabel.setColour (juce::Label::textColourId, statusColour (snapshot.loadState));
    messageLabel.setText (snapshot.ready ? juce::String() : snapshot.loadMessage, juce::dontSendNotification);

    techniqueButtons.clear();
    for (const auto& technique : snapshot.capabilities.techniques)
    {
        auto button = std::make_unique<TechniqueButton>();
        button->techniqueId = technique.id;
        button->available = technique.available && snapshot.ready;
        button->setButtonText (technique.displayName.toUpperCase());
        button->setToggleable (true);
        button->setToggleState (technique.selected, juce::dontSendNotification);
        button->setActive (technique.selected, false);
        button->setEnabled (button->available);
        button->onClick = [this, id = technique.id]
        {
            if (! rebuilding)
                applyTechnique (id);
        };
        addAndMakeVisible (*button);
        techniqueButtons.add (std::move (button));
    }

    knobs.clear();
    toggles.clear();
    toggleIds.clear();

    for (const auto& control : snapshot.capabilities.controls)
    {
        if (control.type == SamplerControlType::Toggle)
        {
            auto toggle = std::make_unique<juce::TextButton> (control.displayName);
            DawWidgets::styleFlatButton (*toggle);
            toggle->setClickingTogglesState (true);
            toggle->setToggleState (control.currentValue >= 0.5f, juce::dontSendNotification);
            toggle->setEnabled (control.available && snapshot.ready);
            toggle->onClick = [this, id = control.id, raw = toggle.get()]
            {
                if (! rebuilding)
                    applyControl (id, raw->getToggleState() ? 1.0f : 0.0f);
            };
            addAndMakeVisible (*toggle);
            toggleIds.add (control.id);
            toggles.add (std::move (toggle));
            continue;
        }

        auto knob = std::make_unique<PerformanceKnob>();
        knob->id = control.id;
        knob->available = control.available && snapshot.ready;
        knob->defaultValue = control.defaultValue;
        knob->setLabels (control.displayName, mappingCaption (control));
        knob->setValue (control.currentValue, juce::dontSendNotification);
        knob->setEnabled (knob->available);
        knob->onChange = [this, id = control.id] (float value)
        {
            if (! rebuilding)
                applyControl (id, value);
        };
        addAndMakeVisible (*knob);
        knobs.add (std::move (knob));
    }

    const bool showLegato = snapshot.ready && SoftwareLegato::isSustainedTechnique (snapshot.techniqueId);
    legatoSwitch->setVisible (showLegato);
    legatoSwitch->setOn (snapshot.legatoEnabled, false);

    if (keyboard != nullptr)
        keyboard->trackIndex = trackIndex;

    debugEditor.setText (juce::JSON::toString (OrchestraSampler::snapshotToVar (snapshot), true), false);
    playButton.setEnabled (snapshot.ready);
    updateHero();
    rebuilding = false;
    resized();
    repaint();
}

void OrchestraSamplerPanel::refreshValues()
{
    auto& api = session.getEngineAPI();
    snapshot = OrchestraSampler::buildSnapshot (api.getInstruments(), api.getStateStore(),
                                                getTrack(), trackIndex);

    statusLabel.setText (snapshot.loadState, juce::dontSendNotification);
    statusLabel.setColour (juce::Label::textColourId, statusColour (snapshot.loadState));
    messageLabel.setText (snapshot.ready ? juce::String() : snapshot.loadMessage, juce::dontSendNotification);
    playButton.setEnabled (snapshot.ready);

    for (int i = 0; i < techniqueButtons.size(); ++i)
        if (juce::isPositiveAndBelow (i, (int) snapshot.capabilities.techniques.size()))
        {
            const auto& technique = snapshot.capabilities.techniques[(size_t) i];
            techniqueButtons[i]->setToggleState (technique.selected, juce::dontSendNotification);
            techniqueButtons[i]->setActive (technique.selected, true);
            techniqueButtons[i]->available = technique.available && snapshot.ready;
            techniqueButtons[i]->setEnabled (techniqueButtons[i]->available);
        }

    auto findControl = [this] (const juce::String& id) -> const SamplerControl*
    {
        for (const auto& control : snapshot.capabilities.controls)
            if (control.id == id)
                return &control;
        return nullptr;
    };

    for (auto* knob : knobs)
        if (const auto* control = findControl (knob->id))
        {
            knob->available = control->available && snapshot.ready;
            knob->setLabels (control->displayName, mappingCaption (*control));
            knob->setValue (control->currentValue, juce::dontSendNotification);
        }

    for (int i = 0; i < toggles.size(); ++i)
        if (const auto* control = findControl (toggleIds[i]))
            toggles[i]->setToggleState (control->currentValue >= 0.5f, juce::dontSendNotification);

    const bool showLegato = snapshot.ready && SoftwareLegato::isSustainedTechnique (snapshot.techniqueId);
    legatoSwitch->setVisible (showLegato);
    legatoSwitch->setOn (snapshot.legatoEnabled, true);

    if (debugEditor.isVisible())
        debugEditor.setText (juce::JSON::toString (OrchestraSampler::snapshotToVar (snapshot), true), false);

    updateHero();
    resized();
}

void OrchestraSamplerPanel::applyTechnique (const juce::String& techniqueId)
{
    if (auto* track = getTrack())
        session.setTrackTechnique (*track, techniqueId);
}

void OrchestraSamplerPanel::applyControl (const juce::String& controlId, float value)
{
    if (auto* track = getTrack())
        session.setTrackController (*track, controlId, value);
}

void OrchestraSamplerPanel::applyLegato (bool enabled)
{
    if (auto* track = getTrack())
        session.setTrackLegato (*track, enabled);
}

void OrchestraSamplerPanel::playTest()
{
    session.getEngineAPI().playValidationPhrase (trackIndex, 80, false);
}

void OrchestraSamplerPanel::changeInstrument()
{
    session.showInstrumentSelector (this, trackIndex);
}

void OrchestraSamplerPanel::resetPerformance()
{
    if (auto* track = getTrack())
        for (const auto& control : snapshot.capabilities.controls)
            if (control.available)
                session.setTrackController (*track, control.id, control.defaultValue);
}

void OrchestraSamplerPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::background);

    auto caption = [&g] (juce::Rectangle<int> area, const juce::String& text)
    {
        if (area.isEmpty() || text.isEmpty())
            return;

        g.setColour (DawColours::textDim);
        g.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));
        g.drawText (text, area, juce::Justification::centredLeft, false);
    };

    caption (techniqueLine, techniqueButtons.isEmpty() ? juce::String() : juce::String ("TECHNIQUE"));
    caption (performanceLine, knobs.isEmpty() && toggles.isEmpty() ? juce::String() : juce::String ("PERFORMANCE"));
    caption (settingsLine, settingsOpen ? "SETTINGS" : juce::String());
}

void OrchestraSamplerPanel::resized()
{
    auto bounds = getLocalBounds().reduced (24, 18);
    const auto settingsH = settingsOpen ? juce::jmin (150, bounds.getHeight() / 4) : 0;

    if (settingsH > 0)
    {
        settingsLine = bounds.removeFromBottom (16);
        auto settings = bounds.removeFromBottom (settingsH);
        resetButton.setBounds (settings.removeFromTop (32).removeFromLeft (168));
        settings.removeFromTop (6);
        debugEditor.setBounds (settings);
    }
    else
    {
        settingsLine = {};
        resetButton.setBounds ({});
        debugEditor.setBounds ({});
    }

    auto top = bounds.removeFromTop (32);
    changeButton.setBounds (top.removeFromLeft (84));
    top.removeFromLeft (8);
    playButton.setBounds (top.removeFromLeft (72));
    top.removeFromLeft (8);
    settingsButton.setBounds (top.removeFromLeft (88));
    statusLabel.setBounds (top.removeFromRight (132));
    messageLabel.setBounds (top);

    bounds.removeFromTop (6);
    keyboard->setBounds (bounds.removeFromBottom (86));
    bounds.removeFromBottom (8);

    const auto compact = getWidth() < 760;
    auto heroArea = bounds.removeFromTop (compact ? 168 : 208);
    hero->setBounds (heroArea.removeFromTop (heroArea.getHeight() - 52).reduced (compact ? 36 : 88, 0));
    nameLabel.setBounds (heroArea.removeFromTop (28));
    sourceLabel.setBounds (heroArea);

    bounds.removeFromTop (6);

    if (techniqueButtons.size() > 0)
    {
        techniqueLine = bounds.removeFromTop (14);
        auto row = bounds.removeFromTop (40);
        const auto w = juce::jmax (72, row.getWidth() / techniqueButtons.size());
        for (auto* button : techniqueButtons)
            button->setBounds (row.removeFromLeft (w).reduced (4, 0));
    }
    else
    {
        techniqueLine = {};
    }

    if (legatoSwitch->isVisible())
    {
        bounds.removeFromTop (4);
        legatoSwitch->setBounds (bounds.removeFromTop (28).withSizeKeepingCentre (juce::jmin (220, bounds.getWidth()), 28));
    }
    else
    {
        legatoSwitch->setBounds ({});
    }

    bounds.removeFromTop (8);

    if (knobs.size() > 0 || toggles.size() > 0)
    {
        performanceLine = bounds.removeFromTop (14);
        auto row = bounds.removeFromTop (compact ? 118 : 132);
        const auto count = juce::jmax (1, knobs.size() + toggles.size());
        const auto knobW = juce::jmax (72, juce::jmin (110, row.getWidth() / count));
        for (auto* knob : knobs)
            knob->setBounds (row.removeFromLeft (knobW).reduced (4, 0));
        for (auto* toggle : toggles)
            toggle->setBounds (row.removeFromLeft (96).withSizeKeepingCentre (88, 36));
    }
    else
    {
        performanceLine = {};
    }
}

//==============================================================================
OrchestraSamplerWindow::OrchestraSamplerWindow (DawSession& sessionToUse)
    : DocumentWindow ("Orchestra Sampler", DawColours::background, DocumentWindow::closeButton)
{
    panel = std::make_unique<OrchestraSamplerPanel> (sessionToUse);
    setUsingNativeTitleBar (true);
    setContentNonOwned (panel.get(), true);
    setResizable (true, true);
    setResizeLimits (640, 560, 1400, 1000);
    centreWithSize (900, 720);
    addToDesktop (getDesktopWindowStyleFlags());
    setVisible (true);
}

OrchestraSamplerWindow::~OrchestraSamplerWindow()
{
    clearContentComponent();
}

void OrchestraSamplerWindow::closeButtonPressed()
{
    if (onClose != nullptr)
        onClose();
}

void OrchestraSamplerWindow::setTrackIndex (int trackIndex)
{
    if (panel != nullptr)
        panel->setTrackIndex (trackIndex);
}
