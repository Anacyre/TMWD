#pragma once

#include <JuceHeader.h>
#include <vector>

/*  MixerModel 2.0 — shared mixer data for the Vue UI and JUCE AudioEngine.

    Volume is stored as fader 0–1 on TrackData for native sliders; volumeDb is
    the canonical musical value (-60 … +6, 0 = unity).  Insert DSP for the
    X-series plugins runs in the browser AudioWorklet.  The PC mixer applies
    volume, equal-power pan, mute, and logical solo when summing hosted VSTs
    into the single stereo tap.  Do not send per-track PCM.
*/
struct MixerSend
{
    juce::String id;
    juce::String name;
    juce::String destination;
    float level = 0.0f;
    bool enabled = false;
    bool preFader = false;
};

struct MixerInsert
{
    int slot = 0;
    juce::String type;
    juce::String id;
    juce::String name;
    bool enabled = true;
    bool bypassed = false;
};

struct MixerBus
{
    juce::String id;
    juce::String name;
    float volumeDb = 0.0f;
    float pan = 0.0f;
    bool mute = false;
    bool solo = false;
    std::vector<MixerInsert> inserts;
};

struct MixerMaster
{
    float volumeDb = 0.0f;
    bool mute = false;
    bool limiterEnabled = false;
    std::vector<MixerInsert> inserts;
};

namespace MixerIds
{
    inline constexpr int maxInserts = 5;
    inline constexpr float volumeDbMin = -60.0f;
    inline constexpr float volumeDbMax = 6.0f;
    inline constexpr const char* sendA = "send_a";
    inline constexpr const char* sendB = "send_b";
    inline constexpr const char* sendC = "send_c";
    inline constexpr const char* busReverb = "bus_reverb";
    inline constexpr const char* busDelay = "bus_delay";
    inline constexpr const char* master = "master";
}

inline std::vector<MixerSend> defaultSends()
{
    return {
        { MixerIds::sendA, "A", MixerIds::busReverb, 0.0f, false, false },
        { MixerIds::sendB, "B", MixerIds::busDelay,  0.0f, false, false },
        { MixerIds::sendC, "C", MixerIds::busReverb, 0.0f, false, false }
    };
}

inline std::vector<MixerInsert> defaultInsertSlots()
{
    std::vector<MixerInsert> slots ((size_t) MixerIds::maxInserts);
    for (int i = 0; i < MixerIds::maxInserts; ++i)
        slots[(size_t) i].slot = i;
    return slots;
}

inline int countFilledMixerInserts (const juce::var& inserts)
{
    auto* arr = inserts.getArray();
    if (arr == nullptr)
        return 0;

    int n = 0;
    for (const auto& item : *arr)
    {
        auto* object = item.getDynamicObject();
        if (object == nullptr)
            continue;

        if (object->getProperty ("pluginId").toString().isNotEmpty()
            || object->getProperty ("type").toString().isNotEmpty()
            || object->getProperty ("instrumentId").toString().isNotEmpty()
            || object->getProperty ("name").toString().isNotEmpty())
            ++n;
    }
    return n;
}

inline juce::String validateWebMixerInsertLimit (const juce::var& webMixer)
{
    auto* root = webMixer.getDynamicObject();
    if (root == nullptr)
        return {};

    juce::StringArray errors;
    auto check = [&] (const juce::String& label, const juce::var& inserts)
    {
        const int n = countFilledMixerInserts (inserts);
        if (n > MixerIds::maxInserts)
            errors.add (label + ": " + juce::String (n)
                        + " inserts (max " + juce::String (MixerIds::maxInserts) + ")");
    };

    if (auto* remote = root->getProperty ("remote").getDynamicObject())
        check ("remote", remote->getProperty ("inserts"));
    if (auto* master = root->getProperty ("master").getDynamicObject())
        check ("master", master->getProperty ("inserts"));
    if (auto* buses = root->getProperty ("buses").getArray())
        for (const auto& bus : *buses)
            if (auto* object = bus.getDynamicObject())
                check (object->getProperty ("id").toString(), object->getProperty ("inserts"));
    if (auto* tracks = root->getProperty ("tracks").getDynamicObject())
        for (const auto& prop : tracks->getProperties())
            if (auto* object = prop.value.getDynamicObject())
                check ("track " + prop.name.toString(), object->getProperty ("inserts"));

    return errors.joinIntoString ("; ");
}
