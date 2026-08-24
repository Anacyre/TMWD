#pragma once

#include <JuceHeader.h>
#include "DawSession.h"

/*  Compact instrument browser popup.  Visual language follows the supplied
    reference: dark, searchable, category-first, no native plugin chrome.
*/
class InstrumentSelector  : public juce::Component
{
public:
    InstrumentSelector (DawSession& sessionToUse, int trackIndexToUse);
    ~InstrumentSelector() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    std::function<void()> onClose;
    std::function<void (juce::String)> onSelect;

    static void launch (DawSession& session, juce::Component* anchor, int trackIndex);

private:
    class CategoryModel  : public juce::ListBoxModel
    {
    public:
        explicit CategoryModel (InstrumentSelector& o) : owner (o) {}
        int getNumRows() override { return juce::jmax (0, owner.categories.size()); }
        void paintListBoxItem (int row, juce::Graphics&, int width, int height, bool selected) override;
        void listBoxItemClicked (int row, const juce::MouseEvent&) override;
        InstrumentSelector& owner;
    };

    class InstrumentModel  : public juce::ListBoxModel
    {
    public:
        explicit InstrumentModel (InstrumentSelector& o) : owner (o) {}
        int getNumRows() override { return (int) owner.visible.size(); }
        void paintListBoxItem (int row, juce::Graphics&, int width, int height, bool selected) override;
        void selectedRowsChanged (int lastRow) override;
        void listBoxItemDoubleClicked (int row, const juce::MouseEvent&) override;
        InstrumentSelector& owner;
    };

    void rebuildVisible();
    void applySelection();
    const InstrumentDefinition* definitionAt (int row) const;

    DawSession& session;
    int trackIndex = -1;
    CategoryModel categoryModel { *this };
    InstrumentModel instrumentModel { *this };

    juce::Label title, sourceLabel;
    juce::TextEditor search;
    juce::TextButton closeButton { "x" }, selectButton { "Select" };
    juce::ListBox categoryList { "categories", nullptr };
    juce::ListBox instrumentList { "instruments", nullptr };
    juce::StringArray categories;
    std::vector<const InstrumentDefinition*> visible;
    int categoryIndex = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InstrumentSelector)
};
