#pragma once

#include <JuceHeader.h>
#include "DawSession.h"

/*  DAW-level plugin picker (Insert Plugin) or Orchestra Sampler patch picker. */
class InstrumentSelector  : public juce::Component
{
public:
    enum class Mode { plugins, orchestraPatches };

    InstrumentSelector (DawSession& sessionToUse, int trackIndexToUse, Mode modeToUse);
    ~InstrumentSelector() override;

    void paint (juce::Graphics&) override;
    void resized() override;

    std::function<void()> onClose;
    std::function<void (juce::String)> onSelect;

    static void launch (DawSession& session, juce::Component* anchor, int trackIndex);
    static void launchPatches (DawSession& session, juce::Component* anchor, int trackIndex);

private:
    struct Row
    {
        juce::String id, name, detail;
        bool available = true;
    };

    class CategoryModel  : public juce::ListBoxModel
    {
    public:
        explicit CategoryModel (InstrumentSelector& o) : owner (o) {}
        int getNumRows() override { return juce::jmax (0, owner.categories.size()); }
        void paintListBoxItem (int row, juce::Graphics&, int width, int height, bool selected) override;
        void listBoxItemClicked (int row, const juce::MouseEvent&) override;
        InstrumentSelector& owner;
    };

    class ItemModel  : public juce::ListBoxModel
    {
    public:
        explicit ItemModel (InstrumentSelector& o) : owner (o) {}
        int getNumRows() override { return owner.visible.size(); }
        void paintListBoxItem (int row, juce::Graphics&, int width, int height, bool selected) override;
        void selectedRowsChanged (int lastRow) override;
        void listBoxItemDoubleClicked (int row, const juce::MouseEvent&) override;
        InstrumentSelector& owner;
    };

    void rebuildVisible();
    void applySelection();
    const Row* rowAt (int row) const;
    static void launchWithMode (DawSession& session, juce::Component* anchor, int trackIndex, Mode mode);

    DawSession& session;
    int trackIndex = -1;
    Mode mode = Mode::plugins;
    CategoryModel categoryModel { *this };
    ItemModel itemModel { *this };

    juce::Label title, sourceLabel;
    juce::TextEditor search;
    juce::TextButton closeButton { "x" }, selectButton { "Insert" };
    juce::ListBox categoryList { "categories", nullptr };
    juce::ListBox itemList { "items", nullptr };
    juce::StringArray categories;
    juce::Array<Row> visible;
    int categoryIndex = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR (InstrumentSelector)
};
