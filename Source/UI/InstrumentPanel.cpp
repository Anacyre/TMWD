#include "InstrumentPanel.h"

namespace
{
    constexpr int lineHeight = 18;
    constexpr int comboHeight = 22;
    constexpr int sliderHeight = 16;
}

InstrumentPanel::InstrumentPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    auto styleLabel = [] (juce::Label& label, float size, juce::Colour colour)
    {
        label.setFont (juce::FontOptions (size));
        label.setColour (juce::Label::textColourId, colour);
        label.setJustificationType (juce::Justification::centredLeft);
        label.setInterceptsMouseClicks (false, false);
    };

    styleLabel (sourceLabel, 11.0f, DawColours::textMuted);
    styleLabel (statusLabel, 11.0f, DawColours::textDim);
    styleLabel (techniqueCaption, 10.0f, DawColours::textDim);
    techniqueCaption.setText ("TECHNIQUE", juce::dontSendNotification);
    techniqueCaption.setFont (juce::Font (juce::FontOptions (10.0f).withStyleFlags (juce::Font::bold)));

    techniqueBox.setWantsKeyboardFocus (false);
    techniqueBox.onChange = [this]
    {
        if (rebuilding)
            return;

        if (auto* track = getTrack())
        {
            const auto techniqueId = techniqueBox.getSelectedId() > 0
                                         ? techniqueBox.getItemText (techniqueBox.getSelectedItemIndex())
                                         : juce::String();
            const auto* definition = session.getEngineAPI().getInstruments()
                                         .findDefinition (track->instrumentDefinitionId);

            if (definition != nullptr && juce::isPositiveAndBelow (techniqueBox.getSelectedItemIndex(),
                                                                   definition->techniques.size()))
                session.setTrackTechnique (*track, definition->techniques[techniqueBox.getSelectedItemIndex()]);
        }
    };

    addAndMakeVisible (sourceLabel);
    addAndMakeVisible (statusLabel);
    addAndMakeVisible (techniqueCaption);
    addAndMakeVisible (techniqueBox);

    DawWidgets::styleFlatButton (openSamplerButton);
    openSamplerButton.setWantsKeyboardFocus (false);
    openSamplerButton.onClick = [this]
    {
        session.showOrchestraSampler (session.getSelectedTrack());
    };
    addAndMakeVisible (openSamplerButton);
    rebuild();
}

InstrumentPanel::~InstrumentPanel()
{
    session.removeListener (this);
}

TrackData* InstrumentPanel::getTrack() { return session.getTrack (session.getSelectedTrack()); }
const TrackData* InstrumentPanel::getTrack() const { return session.getTrack (session.getSelectedTrack()); }

void InstrumentPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & DawSession::selectionChanged) != 0)
    {
        rebuild();
        return;
    }

    if ((changeFlags & (DawSession::tracksChanged | DawSession::mixerChanged)) == 0)
        return;

    const auto* track = getTrack();
    const auto definitionId = track != nullptr ? track->instrumentDefinitionId : juce::String();

    if (definitionId != lastDefinitionId)
        rebuild();
    else if (track != nullptr)
    {
        auto statusColour = DawColours::textDim;

        if (track->instrumentLoadState == InstrumentLoadState::Error
            || track->instrumentLoadState == InstrumentLoadState::Unavailable)
            statusColour = DawColours::muteOn;
        else if (track->instrumentLoadState == InstrumentLoadState::Loaded
                 || track->instrumentLoadState == InstrumentLoadState::Active)
            statusColour = DawColours::textMuted;

        statusLabel.setColour (juce::Label::textColourId, statusColour);
        statusLabel.setText (track->instrumentLoadMessage.isNotEmpty()
                                 ? track->instrumentLoadMessage
                                 : instrumentLoadStateLabel (track->instrumentLoadState),
                             juce::dontSendNotification);
    }
}

void InstrumentPanel::rebuild()
{
    const auto* track = getTrack();
    const auto& registry = session.getEngineAPI().getInstruments();
    const auto* definition = track != nullptr
                                 ? registry.findDefinition (track->instrumentDefinitionId)
                                 : nullptr;

    lastDefinitionId = definition != nullptr ? definition->id : juce::String();
    rebuilding = true;

    if (track == nullptr || track->isMaster() || definition == nullptr)
    {
        sourceLabel.setText ({}, juce::dontSendNotification);
        statusLabel.setText ({}, juce::dontSendNotification);
        techniqueBox.clear (juce::dontSendNotification);
        techniqueCaption.setVisible (false);
        techniqueBox.setVisible (false);
        openSamplerButton.setVisible (false);
        controllerRows.clear();
        groupCaptions.clear();
        rebuilding = false;
        resized();
        return;
    }

    const auto* plugin = registry.find (definition->sourcePlugin);
    sourceLabel.setText (plugin != nullptr ? plugin->displayName : definition->sourcePlugin,
                         juce::dontSendNotification);

    auto statusColour = DawColours::textDim;

    if (track->instrumentLoadState == InstrumentLoadState::Error
        || track->instrumentLoadState == InstrumentLoadState::Unavailable)
        statusColour = DawColours::muteOn;
    else if (track->instrumentLoadState == InstrumentLoadState::Loaded
             || track->instrumentLoadState == InstrumentLoadState::Active)
        statusColour = DawColours::textMuted;

    statusLabel.setColour (juce::Label::textColourId, statusColour);
    statusLabel.setText (track->instrumentLoadMessage.isNotEmpty()
                             ? track->instrumentLoadMessage
                             : instrumentLoadStateLabel (track->instrumentLoadState),
                         juce::dontSendNotification);

    techniqueBox.clear (juce::dontSendNotification);

    for (int i = 0; i < definition->techniques.size(); ++i)
    {
        const auto* technique = registry.findTechnique (definition->techniques[i]);
        const auto name = technique != nullptr ? technique->displayName : definition->techniques[i];
        const auto enabled = technique != nullptr && technique->action.mapped;
        techniqueBox.addItem (name, i + 1);
        // ComboBox cannot disable individual items after addItem on all JUCE versions;
        // unmapped techniques are still listed but applying them reports unavailable.
        juce::ignoreUnused (enabled);
    }

    const auto techniqueIndex = definition->techniques.indexOf (track->techniqueId);
    techniqueBox.setSelectedId (techniqueIndex >= 0 ? techniqueIndex + 1 : 0, juce::dontSendNotification);
    const bool showTechnique = definition->techniques.size() > 0;
    techniqueCaption.setVisible (showTechnique);
    techniqueBox.setVisible (showTechnique);
    openSamplerButton.setVisible (true);

    controllerRows.clear();
    groupCaptions.clear();
    rebuilding = false;
    resized();
}

int InstrumentPanel::getPreferredHeight() const
{
    const auto* track = getTrack();
    const auto* definition = track != nullptr
                                 ? session.getEngineAPI().getInstruments().findDefinition (track->instrumentDefinitionId)
                                 : nullptr;

    if (definition == nullptr)
        return 0;

    int height = lineHeight + lineHeight + 6;

    if (definition->techniques.size() > 0)
        height += 14 + comboHeight + 8;

    height += 32;
    return height;
}

void InstrumentPanel::resized()
{
    auto area = getLocalBounds();
    sourceLabel.setBounds (area.removeFromTop (lineHeight));
    statusLabel.setBounds (area.removeFromTop (lineHeight));
    area.removeFromTop (6);

    if (techniqueBox.isVisible())
    {
        techniqueCaption.setBounds (area.removeFromTop (14));
        techniqueBox.setBounds (area.removeFromTop (comboHeight));
        area.removeFromTop (8);
    }

    if (openSamplerButton.isVisible())
        openSamplerButton.setBounds (area.removeFromTop (26));
}
