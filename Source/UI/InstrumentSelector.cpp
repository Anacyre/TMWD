#include "InstrumentSelector.h"
#include "../Audio/MOrchestra/MOrchestraUi.h"
#include "../Plugins/InstrumentRegistry.h"
#include "Widgets.h"

namespace
{
    constexpr int headerHeight = 36;
    constexpr int searchHeight = 28;
    constexpr int footerHeight = 40;
    constexpr int categoryWidth = 148;
}

InstrumentSelector::InstrumentSelector (DawSession& sessionToUse, int trackIndexToUse, Mode modeToUse)
    : session (sessionToUse), trackIndex (trackIndexToUse), mode (modeToUse)
{
    title.setText (mode == Mode::plugins ? "Insert Plugin" : "Instrument", juce::dontSendNotification);
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
    itemList.setModel (&itemModel);
    categoryList.setColour (juce::ListBox::backgroundColourId, DawColours::panel);
    itemList.setColour (juce::ListBox::backgroundColourId, DawColours::panelSunken);
    categoryList.setRowHeight (26);
    itemList.setRowHeight (38);
    categoryList.setOutlineThickness (0);
    itemList.setOutlineThickness (0);
    addAndMakeVisible (categoryList);
    addAndMakeVisible (itemList);
    categoryList.setVisible (mode != Mode::plugins);

    sourceLabel.setFont (juce::FontOptions (11.0f));
    sourceLabel.setColour (juce::Label::textColourId, DawColours::textDim);
    sourceLabel.setInterceptsMouseClicks (false, false);
    addAndMakeVisible (sourceLabel);

    selectButton.setButtonText (mode == Mode::plugins ? "Insert" : "Select");
    DawWidgets::styleFlatButton (selectButton);
    selectButton.onClick = [this] { applySelection(); };
    addAndMakeVisible (selectButton);

    if (mode == Mode::plugins)
    {
        categories.add ("Plugins");
    }
    else
    {
        for (const auto& category : session.getEngineAPI().getInstruments().getBrowserCategories())
            if (category != "M Orchestra" && category != "Internal")
                categories.add (category);
    }

    rebuildVisible();
}

InstrumentSelector::~InstrumentSelector()
{
    categoryList.setModel (nullptr);
    itemList.setModel (nullptr);
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

void InstrumentSelector::ItemModel::paintListBoxItem (int row, juce::Graphics& g, int width, int height, bool selected)
{
    const auto* item = owner.rowAt (row);

    if (item == nullptr)
        return;

    if (selected)
    {
        g.setColour (DawColours::rowSelected);
        g.fillRect (0, 0, width, height);
        g.setColour (DawColours::accent);
        g.fillRect (0, 4, 2, height - 8);
    }

    auto bounds = juce::Rectangle<int> (12, 0, width - 20, height);
    auto nameRow = bounds.removeFromTop (18);
    g.setColour (item->available ? DawColours::text : DawColours::textDim);
    g.setFont (juce::Font (juce::FontOptions (13.0f).withStyleFlags (juce::Font::bold)));
    g.drawText (item->name, nameRow, juce::Justification::centredLeft, true);

    g.setColour (DawColours::textDim);
    g.setFont (juce::FontOptions (10.5f));
    g.drawText (item->detail, bounds, juce::Justification::centredLeft, true);
}

void InstrumentSelector::ItemModel::selectedRowsChanged (int)
{
    if (const auto* item = owner.rowAt (owner.itemList.getSelectedRow()))
        owner.sourceLabel.setText (item->detail, juce::dontSendNotification);
}

void InstrumentSelector::ItemModel::listBoxItemDoubleClicked (int, const juce::MouseEvent&)
{
    owner.applySelection();
}

const InstrumentSelector::Row* InstrumentSelector::rowAt (int row) const
{
    if (! juce::isPositiveAndBelow (row, visible.size()))
        return nullptr;

    return &visible.getReference (row);
}

void InstrumentSelector::rebuildVisible()
{
    visible.clear();
    const auto query = search.getText().trim().toLowerCase();
    const auto category = juce::isPositiveAndBelow (categoryIndex, categories.size())
                              ? categories[categoryIndex] : juce::String();

    if (mode == Mode::plugins)
    {
        const Row plugins[] = {
            { InstrumentRegistry::mOrchestraId, "M Orchestra", "Built-in orchestral plugin", true },
            { InstrumentRegistry::orchestraSamplerPluginId, "Orchestra Sampler", "BBCSO Discover / Synchron Player", true },
            { InstrumentRegistry::testSynthId, "Test Synth", "Built-in", true }
        };

        for (const auto& plugin : plugins)
            if (query.isEmpty()
                || plugin.name.toLowerCase().contains (query)
                || plugin.id.toLowerCase().contains (query))
                visible.add (plugin);
    }
    else
    {
        const auto& registry = session.getEngineAPI().getInstruments();

        for (const auto& definition : registry.getCatalogue())
        {
            if (MOrchestraUi::isMOrchestraDefinition (definition.id)
                || definition.sourcePlugin == InstrumentRegistry::mOrchestraId
                || definition.sourcePlugin == InstrumentRegistry::testSynthId
                || definition.id == InstrumentRegistry::testSynthId)
                continue;

            if (query.isNotEmpty())
            {
                if (! registry.matchesSearch (definition, query))
                    continue;
            }
            else if (category.isNotEmpty() && definition.category != category)
            {
                continue;
            }

            const auto* plugin = registry.find (definition.sourcePlugin);
            Row row;
            row.id = definition.id;
            row.name = definition.displayName;
            row.detail = plugin != nullptr ? plugin->displayName : definition.sourcePlugin;
            row.available = session.getEngineAPI().describeDefinitionAvailability (definition, trackIndex) != "Unavailable";
            visible.add (std::move (row));
        }
    }

    categoryList.updateContent();
    categoryList.selectRow (categoryIndex);
    itemList.updateContent();
    itemList.selectRow (visible.isEmpty() ? -1 : 0);
    itemModel.selectedRowsChanged (0);
    repaint();
}

void InstrumentSelector::applySelection()
{
    if (const auto* item = rowAt (itemList.getSelectedRow()))
        if (item->available && onSelect)
            onSelect (item->id);
}

void InstrumentSelector::paint (juce::Graphics& g)
{
    g.fillAll (DawColours::panel);
    g.setColour (DawColours::divider);
    g.drawRect (getLocalBounds(), 1);
    g.drawHorizontalLine (headerHeight, 0.0f, (float) getWidth());
    g.drawHorizontalLine (getHeight() - footerHeight, 0.0f, (float) getWidth());

    if (categoryList.isVisible())
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

    if (categoryList.isVisible())
        categoryList.setBounds (area.removeFromLeft (categoryWidth));

    itemList.setBounds (area);
}

void InstrumentSelector::launch (DawSession& session, juce::Component* anchor, int trackIndex)
{
    launchWithMode (session, anchor, trackIndex, Mode::plugins);
}

void InstrumentSelector::launchPatches (DawSession& session, juce::Component* anchor, int trackIndex)
{
    launchWithMode (session, anchor, trackIndex, Mode::orchestraPatches);
}

void InstrumentSelector::launchWithMode (DawSession& session, juce::Component* anchor, int trackIndex, Mode mode)
{
    session.dismissInstrumentBrowser();

    class BrowserWindow final : public juce::DocumentWindow
    {
    public:
        BrowserWindow (DawSession& sessionToUse, int trackToUse, juce::Component* centreAround, Mode modeToUse)
            : DocumentWindow (modeToUse == Mode::plugins ? "Insert Plugin" : "Instrument",
                              DawColours::panel, DocumentWindow::closeButton),
              session (sessionToUse)
        {
            session.bindInstrumentBrowser (this);
            setUsingNativeTitleBar (true);

            auto* selector = new InstrumentSelector (session, trackToUse, modeToUse);
            selector->setSize (560, 420);
            selector->onClose = [this] { closeButtonPressed(); };
            selector->onSelect = [this, trackToUse, modeToUse] (juce::String selectedId)
            {
                auto* sessionPtr = &session;
                juce::Component::SafePointer<BrowserWindow> safeWindow (this);
                juce::MessageManager::callAsync ([sessionPtr, trackToUse, selectedId, modeToUse, safeWindow]
                {
                    if (safeWindow != nullptr)
                        sessionPtr->dismissInstrumentBrowser();

                    if (modeToUse == Mode::plugins)
                    {
                        sessionPtr->insertPlugin (trackToUse, selectedId);
                    }
                    else if (auto* track = sessionPtr->getTrack (trackToUse))
                    {
                        sessionPtr->assignInstrumentDefinition (*track, selectedId);
                        sessionPtr->notify (DawSession::tracksChanged | DawSession::mixerChanged);
                        sessionPtr->showOrchestraSampler (trackToUse);
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

    new BrowserWindow (session, trackIndex, anchor, mode);
}
