#include "InstrumentSelector.h"
#include "Widgets.h"

namespace
{
    constexpr int headerHeight = 36;
    constexpr int searchHeight = 28;
    constexpr int footerHeight = 40;
    constexpr int categoryWidth = 148;
}

InstrumentSelector::InstrumentSelector (DawSession& sessionToUse, int trackIndexToUse)
    : session (sessionToUse), trackIndex (trackIndexToUse)
{
    title.setText ("Instrument", juce::dontSendNotification);
    title.setFont (juce::Font (juce::FontOptions (15.0f).withStyleFlags (juce::Font::bold)));
    title.setColour (juce::Label::textColourId, DawColours::text);
    title.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (title);

    DawWidgets::styleFlatButton (closeButton);
    closeButton.onClick = [this] { if (onClose) onClose(); };
    addAndMakeVisible (closeButton);

    search.setTextToShowWhenEmpty ("Search...", DawColours::textDim);
    search.setColour (juce::TextEditor::backgroundColourId, DawColours::panelSunken);
    search.setColour (juce::TextEditor::outlineColourId, DawColours::divider);
    search.setColour (juce::TextEditor::focusedOutlineColourId, DawColours::accent);
    search.setColour (juce::TextEditor::textColourId, DawColours::text);
    search.setJustification (juce::Justification::centredLeft);
    search.onTextChange = [this] { rebuildVisible(); };
    addAndMakeVisible (search);

    categoryList.setModel (&categoryModel);
    instrumentList.setModel (&instrumentModel);
    categoryList.setColour (juce::ListBox::backgroundColourId, DawColours::panel);
    instrumentList.setColour (juce::ListBox::backgroundColourId, DawColours::panelSunken);
    categoryList.setRowHeight (26);
    instrumentList.setRowHeight (38);
    categoryList.setOutlineThickness (0);
    instrumentList.setOutlineThickness (0);
    addAndMakeVisible (categoryList);
    addAndMakeVisible (instrumentList);

    sourceLabel.setFont (juce::FontOptions (11.0f));
    sourceLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    sourceLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (sourceLabel);

    DawWidgets::styleFlatButton (selectButton);
    selectButton.onClick = [this] { applySelection(); };
    addAndMakeVisible (selectButton);

    categories = session.getEngineAPI().getInstruments().getBrowserCategories();

    if (session.getEngineAPI().getInstruments().findDefinition (InstrumentRegistry::testSynthId) != nullptr
        && ! categories.contains ("Internal"))
        categories.add ("Internal");

    rebuildVisible();
}

InstrumentSelector::~InstrumentSelector()
{
    categoryList.setModel (nullptr);
    instrumentList.setModel (nullptr);
}

void InstrumentSelector::CategoryModel::paintListBoxItem (int row, juce::Graphics& g, int width, int height, bool selected)
{
    if (! juce::isPositiveAndBelow (row, owner.categories.size()))
        return;

    if (selected)
    {
        g.setColour (DawColours::rowSelected);
        g.fillRect (0, 0, width, height);
        g.setColour (DawColours::accent);
        g.fillRect (0, 4, 2, height - 8);
    }

    g.setColour (selected ? DawColours::text : DawColours::textMuted);
    g.setFont (juce::Font (juce::FontOptions (12.0f).withStyleFlags (selected ? juce::Font::bold : 0)));
    g.drawText (owner.categories[row], juce::Rectangle<int> (12, 0, width - 16, height),
                juce::Justification::centredLeft, true);
}

void InstrumentSelector::CategoryModel::listBoxItemClicked (int row, const juce::MouseEvent&)
{
    if (! juce::isPositiveAndBelow (row, owner.categories.size()))
        return;

    owner.categoryIndex = row;
    owner.rebuildVisible();
}

void InstrumentSelector::InstrumentModel::paintListBoxItem (int row, juce::Graphics& g, int width, int height, bool selected)
{
    const auto* definition = owner.definitionAt (row);

    if (definition == nullptr)
        return;

    if (selected)
    {
        g.setColour (DawColours::rowSelected);
        g.fillRect (0, 0, width, height);
        g.setColour (DawColours::accent);
        g.fillRect (0, 4, 2, height - 8);
    }

    const auto& registry = owner.session.getEngineAPI().getInstruments();
    const auto* plugin = registry.find (definition->sourcePlugin);
    juce::ignoreUnused (registry.findPreset (registry.resolvePresetId (*definition)));

    const auto status = owner.session.getEngineAPI().describeDefinitionAvailability (*definition, owner.trackIndex);
    const auto statusColour = status == "Ready" ? DawColours::soloOn
                            : status == "Error" ? DawColours::muteOn
                            : status == "Available" ? DawColours::textMuted
                            : DawColours::textDim;

    auto bounds = juce::Rectangle<int> (12, 0, width - 20, height);
    auto nameRow = bounds.removeFromTop (18);
    g.setColour (status == "Unavailable" ? DawColours::textDim : DawColours::text);
    g.setFont (juce::Font (juce::FontOptions (13.0f).withStyleFlags (juce::Font::bold)));
    g.drawText (definition->displayName, nameRow.removeFromLeft (nameRow.getWidth() - 88),
                juce::Justification::centredLeft, true);
    g.setColour (statusColour);
    g.setFont (juce::FontOptions (10.5f));
    g.drawText (status, nameRow, juce::Justification::centredRight, true);

    g.setColour (DawColours::textDim);
    g.setFont (juce::FontOptions (10.5f));
    const auto source = plugin != nullptr ? plugin->displayName : definition->sourcePlugin;
    g.drawText (source, bounds, juce::Justification::centredLeft, true);
}

void InstrumentSelector::InstrumentModel::selectedRowsChanged (int)
{
    if (const auto* definition = owner.definitionAt (owner.instrumentList.getSelectedRow()))
    {
        const auto* plugin = owner.session.getEngineAPI().getInstruments().find (definition->sourcePlugin);
        owner.sourceLabel.setText (plugin != nullptr ? plugin->displayName : definition->sourcePlugin,
                                   juce::dontSendNotification);
    }
}

void InstrumentSelector::InstrumentModel::listBoxItemDoubleClicked (int, const juce::MouseEvent&)
{
    owner.applySelection();
}

const InstrumentDefinition* InstrumentSelector::definitionAt (int row) const
{
    return juce::isPositiveAndBelow (row, (int) visible.size()) ? visible[(size_t) row] : nullptr;
}

void InstrumentSelector::rebuildVisible()
{
    visible.clear();
    const auto& registry = session.getEngineAPI().getInstruments();
    const auto query = search.getText();
    const auto category = juce::isPositiveAndBelow (categoryIndex, categories.size())
                              ? categories[categoryIndex] : juce::String();

    for (const auto& definition : registry.getCatalogue())
    {
        if (query.isNotEmpty())
        {
            if (! registry.matchesSearch (definition, query))
                continue;
        }
        else if (category.isNotEmpty() && definition.category != category)
        {
            continue;
        }

        visible.push_back (&definition);
    }

    categoryList.updateContent();
    categoryList.selectRow (categoryIndex);
    instrumentList.updateContent();
    instrumentList.selectRow (visible.empty() ? -1 : 0);
    instrumentModel.selectedRowsChanged (0);
    repaint();
}

void InstrumentSelector::applySelection()
{
    if (const auto* definition = definitionAt (instrumentList.getSelectedRow()))
        if (onSelect)
            onSelect (definition->id);
}

void InstrumentSelector::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);
    g.setColour (DawColours::divider);
    g.drawRect (getLocalBounds(), 1);
    g.drawHorizontalLine (headerHeight, 0.0f, (float) getWidth());
    g.drawHorizontalLine (getHeight() - footerHeight, 0.0f, (float) getWidth());
    g.drawVerticalLine (categoryWidth, (float) headerHeight + searchHeight + 8, (float) getHeight() - footerHeight);
}

void InstrumentSelector::resized()
{
    auto area = getLocalBounds().reduced (1);
    auto header = area.removeFromTop (headerHeight);
    closeButton.setBounds (header.removeFromRight (32).reduced (6));
    title.setBounds (header.withTrimmedLeft (12));

    auto searchRow = area.removeFromTop (searchHeight + 8).reduced (10, 4);
    search.setBounds (searchRow);

    auto footer = area.removeFromBottom (footerHeight);
    selectButton.setBounds (footer.removeFromRight (88).reduced (10, 8));
    sourceLabel.setBounds (footer.withTrimmedLeft (12));

    categoryList.setBounds (area.removeFromLeft (categoryWidth));
    instrumentList.setBounds (area);
}

void InstrumentSelector::launch (DawSession& session, juce::Component* anchor, int trackIndex)
{
    session.dismissInstrumentBrowser();

    class BrowserWindow final : public juce::DocumentWindow
    {
    public:
        BrowserWindow (DawSession& sessionToUse, int trackToUse, juce::Component* centreAround)
            : DocumentWindow ("Instrument", DawColours::panel, DocumentWindow::closeButton),
              session (sessionToUse)
        {
            session.bindInstrumentBrowser (this);
            setUsingNativeTitleBar (true);

            auto* selector = new InstrumentSelector (session, trackToUse);
            selector->setSize (560, 420);
            selector->onClose = [this] { closeButtonPressed(); };
            selector->onSelect = [this, trackToUse] (juce::String definitionId)
            {
                auto* sessionPtr = &session;
                const auto trackIndexToLoad = trackToUse;
                juce::Component::SafePointer<BrowserWindow> safeWindow (this);
                juce::MessageManager::callAsync ([sessionPtr, trackIndexToLoad, definitionId, safeWindow]
                {
                    if (safeWindow != nullptr)
                        sessionPtr->dismissInstrumentBrowser();

                    if (auto* track = sessionPtr->getTrack (trackIndexToLoad))
                    {
                        sessionPtr->assignInstrumentDefinition (*track, definitionId);
                        sessionPtr->notify (DawSession::tracksChanged | DawSession::mixerChanged);
                        sessionPtr->showOrchestraSampler (trackIndexToLoad);
                    }
                });
            };

            setContentOwned (selector, true);
            setResizable (false, false);

            if (centreAround != nullptr && centreAround->isShowing())
                centreAroundComponent (centreAround, getWidth(), getHeight());
            else
                centreWithSize (560, 420);

            setVisible (true);
            toFront (true);
        }

        ~BrowserWindow() override
        {
            if (session.getInstrumentBrowserWindow() == this)
                session.bindInstrumentBrowser (nullptr);
        }

        void closeButtonPressed() override
        {
            auto* sessionPtr = &session;
            juce::Component::SafePointer<BrowserWindow> safe (this);
            juce::MessageManager::callAsync ([sessionPtr, safe]
            {
                if (safe != nullptr)
                    sessionPtr->dismissInstrumentBrowser();
            });
        }

    private:
        DawSession& session;
        JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (BrowserWindow)
    };

    new BrowserWindow (session, trackIndex, anchor);
}
