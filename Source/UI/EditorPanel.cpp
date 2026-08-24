#include "EditorPanel.h"

namespace
{
    constexpr int headerHeight = 28;
    constexpr int rowHeight = 22;
}

//==============================================================================
/** Read-out of everything the selected track holds, including its plugin slots. */
class TrackInfoView  : public juce::Component,
                       private DawSession::Listener
{
public:
    explicit TrackInfoView (DawSession& sessionToUse)
        : session (sessionToUse)
    {
        session.addListener (this);

        nameEditor.setFont (juce::Font (juce::FontOptions (15.0f).withStyleFlags (juce::Font::bold)));
        nameEditor.setColour (juce::Label::textColourId, DawColours::text);
        nameEditor.setEditable (false, true, false);
        nameEditor.setTooltip ("Double-click to rename");
        nameEditor.onTextChange = [this]
        {
            if (auto* track = getTrack())
            {
                track->name = nameEditor.getText();
                session.notify (DawSession::tracksChanged);
            }
        };
        addAndMakeVisible (nameEditor);

        auto addRow = [this] (std::unique_ptr<InfoRow> row)
        {
            addAndMakeVisible (*row);
            rows.push_back (std::move (row));
        };

        addRow (std::make_unique<InfoRow> ("Type"));
        addRow (std::make_unique<InfoRow> ("Section"));
        addRow (std::make_unique<InfoRow> ("MIDI Channel"));
        addRow (std::make_unique<InfoRow> ("Volume"));
        addRow (std::make_unique<InfoRow> ("Pan"));
        addRow (std::make_unique<InfoRow> ("Output"));
        addRow (std::make_unique<InfoRow> ("Clips"));
        addRow (std::make_unique<InfoRow> ("Notes"));

        instrumentButton.setTooltip ("Instrument slot - the hosted VST3 goes here");
        DawWidgets::styleFlatButton (instrumentButton);
        instrumentButton.onClick = [this] { showInstrumentMenu(); };
        addAndMakeVisible (instrumentButton);

        for (int i = 0; i < (int) insertButtons.size(); ++i)
        {
            auto& b = insertButtons[(size_t) i];
            DawWidgets::styleFlatButton (b);
            b.setTooltip ("Insert slot " + juce::String (i + 1));
            b.onClick = [this, i] { showInsertMenu (i); };
            addAndMakeVisible (b);
        }

        refresh();
    }

    ~TrackInfoView() override
    {
        session.removeListener (this);
    }

    void paint (juce::Graphics& g) override
    {
        g.fillAll (DawColours::panel);

        if (const auto* track = getTrack())
        {
            g.setColour (track->colour);
            g.fillRect (0, 0, 3, getHeight());
        }

        for (const auto& caption : captions)
            DawWidgets::drawCaption (g, caption.second, caption.first);
    }

    void resized() override
    {
        captions.clear();
        auto r = getLocalBounds().reduced (18, 12);

        nameEditor.setBounds (r.removeFromTop (24));
        r.removeFromTop (10);

        const auto columns = juce::jlimit (1, 3, r.getWidth() / 260);
        const auto columnWidth = r.getWidth() / columns;

        auto placeColumn = [&] (int columnIndex) { return r.withWidth (columnWidth - 16)
                                                           .withX (r.getX() + columnIndex * columnWidth); };

        // Column 1: identity and mixer values.
        auto first = placeColumn (0);
        captions.push_back ({ "Track", first.removeFromTop (14) });
        first.removeFromTop (2);

        for (int i = 0; i < 6 && i < (int) rows.size(); ++i)
            rows[(size_t) i]->setBounds (first.removeFromTop (rowHeight));

        // Column 2: plugin slots.
        auto second = placeColumn (columns > 1 ? 1 : 0);

        if (columns == 1)
        {
            second = first;
            second.removeFromTop (10);
        }

        captions.push_back ({ "Instrument", second.removeFromTop (14) });
        second.removeFromTop (2);
        instrumentButton.setBounds (second.removeFromTop (24));
        second.removeFromTop (10);
        captions.push_back ({ "Inserts", second.removeFromTop (14) });
        second.removeFromTop (2);

        for (auto& b : insertButtons)
        {
            b.setBounds (second.removeFromTop (22));
            second.removeFromTop (4);
        }

        // Column 3: content summary.
        auto third = placeColumn (columns > 2 ? 2 : (columns > 1 ? 1 : 0));

        if (columns < 3)
        {
            third = second;
            third.removeFromTop (10);
        }

        captions.push_back ({ "Content", third.removeFromTop (14) });
        third.removeFromTop (2);

        for (int i = 6; i < (int) rows.size(); ++i)
            rows[(size_t) i]->setBounds (third.removeFromTop (rowHeight));
    }

    void refresh()
    {
        auto* track = getTrack();

        if (track == nullptr)
        {
            nameEditor.setText ("No track selected", juce::dontSendNotification);

            for (auto& row : rows)
                row->setValue ("-");

            instrumentButton.setButtonText ("-");

            for (auto& b : insertButtons)
                b.setButtonText ("-");

            repaint();
            return;
        }

        if (! nameEditor.isBeingEdited())
            nameEditor.setText (track->name, juce::dontSendNotification);

        int clipCount = 0, noteCount = 0;

        for (const auto& clip : session.getClips())
        {
            if (clip.trackIndex == session.getSelectedTrack())
            {
                ++clipCount;
                noteCount += (int) clip.notes.size();
            }
        }

        rows[0]->setValue (track->isMaster() ? "Master" : (track->isMidi() ? "Instrument" : "Audio"));
        rows[1]->setValue (track->section.isNotEmpty() ? track->section : "-");
        rows[2]->setValue (track->isMidi() ? "Channel " + juce::String (track->midiChannel) : juce::String ("-"));
        rows[3]->setValue (DawUnits::formatDb (track->getVolumeDb()));
        rows[4]->setValue (DawUnits::formatPan (track->pan));
        rows[5]->setValue (track->isMaster() ? "Stereo Out" : "Master");
        rows[6]->setValue (juce::String (clipCount));
        rows[7]->setValue (juce::String (noteCount));

        instrumentButton.setButtonText (track->instrument.isNotEmpty() ? track->instrument
                                                                       : juce::String ("Empty slot"));

        for (int i = 0; i < (int) insertButtons.size(); ++i)
        {
            const auto& slot = i < (int) track->inserts.size() ? track->inserts[(size_t) i] : PluginSlot {};
            insertButtons[(size_t) i].setButtonText (slot.isEmpty() ? "Empty slot"
                                                                    : slot.name + (slot.bypassed ? "  (bypassed)"
                                                                                                 : juce::String()));
        }

        repaint();
    }

private:
    TrackData* getTrack() { return session.getTrack (session.getSelectedTrack()); }
    const TrackData* getTrack() const { return session.getTrack (session.getSelectedTrack()); }

    void showInstrumentMenu()
    {
        auto* track = getTrack();

        if (track == nullptr || track->isMaster())
            return;

        if (track->instrumentDefinitionId.isNotEmpty())
            session.showOrchestraSampler (session.getSelectedTrack());
        else
            session.showInstrumentSelector (&instrumentButton, session.getSelectedTrack());
    }

    void showInsertMenu (int slotIndex)
    {
        auto* track = getTrack();

        if (track == nullptr || slotIndex >= (int) track->inserts.size())
            return;

        juce::PopupMenu m;
        const auto effects = DawSession::getAvailableEffects();

        for (int i = 0; i < effects.size(); ++i)
            m.addItem (i + 1, effects[i], true, track->inserts[(size_t) slotIndex].name == effects[i]);

        m.addSeparator();
        m.addItem (98, "Bypass", ! track->inserts[(size_t) slotIndex].isEmpty(),
                   track->inserts[(size_t) slotIndex].bypassed);
        m.addItem (99, "Remove", ! track->inserts[(size_t) slotIndex].isEmpty());

        m.showMenuAsync (juce::PopupMenu::Options().withTargetComponent (&insertButtons[(size_t) slotIndex]),
                         [this, slotIndex] (int r)
        {
            auto* t = getTrack();

            if (t == nullptr || slotIndex >= (int) t->inserts.size())
                return;

            auto& slot = t->inserts[(size_t) slotIndex];

            if (r == 98)
            {
                slot.bypassed = ! slot.bypassed;
            }
            else if (r == 99)
            {
                slot.name.clear();
                slot.bypassed = false;
            }
            else
            {
                const auto effects = DawSession::getAvailableEffects();

                if (r >= 1 && r <= effects.size())
                    slot.name = effects[r - 1];
            }

            session.notify (DawSession::mixerChanged);
        });
    }

    void sessionChanged (int changeFlags) override
    {
        if ((changeFlags & (DawSession::selectionChanged | DawSession::tracksChanged
                            | DawSession::mixerChanged | DawSession::clipsChanged
                            | DawSession::notesChanged)) != 0)
            refresh();
    }

    DawSession& session;
    juce::Label nameEditor;
    std::vector<std::unique_ptr<InfoRow>> rows;
    juce::TextButton instrumentButton;
    std::array<juce::TextButton, 2> insertButtons;
    std::vector<std::pair<juce::String, juce::Rectangle<int>>> captions;
};

//==============================================================================
EditorPanel::EditorPanel (DawSession& sessionToUse)
    : session (sessionToUse)
{
    session.addListener (this);

    trackInfo = std::make_unique<TrackInfoView> (session);

    tabs.setTabs ({ "Piano Roll", "Automation", "Track Info" }, 0);
    tabs.onTabChanged = [this] (int index)
    {
        session.setEditorTab (static_cast<DawSession::EditorTab> (index));
    };
    addAndMakeVisible (tabs);

    contextLabel.setFont (juce::FontOptions (11.5f));
    contextLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    contextLabel.setJustificationType (juce::Justification::centredRight);
    contextLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (contextLabel);

    closeButton.setTooltip ("Hide editor  (E)");
    closeButton.onClick = [this] { session.setEditorVisible (false); };
    addAndMakeVisible (closeButton);

    addChildComponent (pianoRoll);
    addChildComponent (automation);
    addChildComponent (*trackInfo);

    updateVisibleView();
}

EditorPanel::~EditorPanel()
{
    session.removeListener (this);
}

void EditorPanel::deleteSelection()
{
    if (session.getEditorTab() == DawSession::EditorTab::pianoRoll)
        pianoRoll.deleteSelectedNotes();
}

void EditorPanel::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);

    auto header = getLocalBounds().removeFromTop (headerHeight);
    g.setColour (DawColours::header);
    g.fillRect (header);
    g.setColour (DawColours::divider);
    g.drawHorizontalLine (header.getBottom() - 1, 0.0f, (float) getWidth());
    g.drawHorizontalLine (0, 0.0f, (float) getWidth());
}

void EditorPanel::resized()
{
    auto r = getLocalBounds();
    auto header = r.removeFromTop (headerHeight);

    tabs.setBounds (header.removeFromLeft (juce::jmin (tabs.getPreferredWidth(), header.getWidth())));
    closeButton.setBounds (header.removeFromRight (28).withSizeKeepingCentre (22, 22));
    contextLabel.setBounds (header.reduced (10, 0));

    if (pianoRoll.isVisible())
        pianoRoll.setBounds (r);

    if (automation.isVisible())
        automation.setBounds (r);

    if (trackInfo != nullptr && trackInfo->isVisible())
        trackInfo->setBounds (r);
}

void EditorPanel::updateVisibleView()
{
    const auto tab = session.getEditorTab();
    tabs.setActiveTab (static_cast<int> (tab));

    pianoRoll.setVisible (tab == DawSession::EditorTab::pianoRoll);
    automation.setVisible (tab == DawSession::EditorTab::automation);
    trackInfo->setVisible (tab == DawSession::EditorTab::trackInfo);
    resized();

    const auto* track = session.getTrack (session.getSelectedTrack());
    const auto* clip = session.getClip (session.getSelectedClip());

    juce::String context;

    if (track != nullptr)
        context = track->name;

    if (clip != nullptr && tab == DawSession::EditorTab::pianoRoll)
        context += (context.isEmpty() ? "" : "   -   ") + clip->name;

    contextLabel.setText (context, juce::dontSendNotification);
}

void EditorPanel::sessionChanged (int changeFlags)
{
    if ((changeFlags & (DawSession::viewChanged | DawSession::selectionChanged
                        | DawSession::tracksChanged | DawSession::clipsChanged)) != 0)
        updateVisibleView();
}
