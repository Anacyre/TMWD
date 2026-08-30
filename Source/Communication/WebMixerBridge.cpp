#include "WebMixerBridge.h"

namespace
{
    using Kind = MixerEngine::InsertKind;
    using Slot = XSeriesInsert;

    juce::DynamicObject* asObject (const juce::var& value)
    {
        return value.getDynamicObject();
    }

    bool hasKey (const juce::var& value, const juce::Identifier& key)
    {
        auto* object = asObject (value);
        return object != nullptr && object->hasProperty (key);
    }

    /** Reads the first key that is present. Returns false when none are. */
    bool readNumber (const juce::var& source, const juce::StringArray& keys, float& out)
    {
        auto* object = asObject (source);

        if (object == nullptr)
            return false;

        for (const auto& key : keys)
        {
            const juce::Identifier id (key);

            if (! object->hasProperty (id))
                continue;

            const auto value = object->getProperty (id);

            if (value.isBool())
            {
                out = ((bool) value) ? 1.0f : 0.0f;
                return true;
            }

            if (value.isDouble() || value.isInt() || value.isInt64())
            {
                out = (float) (double) value;
                return true;
            }
        }

        return false;
    }

    void writeNumber (MixerEngine& mixer, int channel, int slot, int index,
                      const juce::var& source, const juce::StringArray& keys)
    {
        float value = 0.0f;

        if (! readNumber (source, keys, value))
            return;

        if (channel == 0)
            mixer.setMasterInsertValue (slot, index, value);
        else
            mixer.setChannelInsertValue (channel, slot, index, value);
    }

    void writeRaw (MixerEngine& mixer, int channel, int slot, int index, float value)
    {
        if (channel == 0)
            mixer.setMasterInsertValue (slot, index, value);
        else
            mixer.setChannelInsertValue (channel, slot, index, value);
    }

    juce::String readString (const juce::var& source, const juce::Identifier& key)
    {
        auto* object = asObject (source);

        if (object == nullptr || ! object->hasProperty (key))
            return {};

        return object->getProperty (key).toString().toLowerCase();
    }

    int eqShapeIndex (const juce::String& shape)
    {
        if (shape == "lowcut" || shape == "low-cut" || shape == "highpass") return 0;
        if (shape == "lowshelf" || shape == "low-shelf") return 1;
        if (shape == "notch") return 3;
        if (shape == "highshelf" || shape == "high-shelf") return 4;
        if (shape == "highcut" || shape == "high-cut" || shape == "lowpass") return 5;
        if (shape == "bandpass" || shape == "band-pass") return 6;
        return 2;   // bell
    }

    int boostModeIndex (const juce::String& mode)
    {
        if (mode == "expander") return 1;
        if (mode == "chorus") return 2;
        if (mode == "drive" || mode == "distortion") return 3;
        return 0;   // ott
    }

    int boostCharacterIndex (const juce::String& character)
    {
        if (character == "subtle") return 1;
        if (character == "air") return 2;
        if (character == "bright") return 3;
        if (character == "punch") return 4;
        if (character == "aggressive") return 5;
        if (character == "soft" || character == "warm") return 6;
        if (character == "wide") return 7;
        if (character == "crunch") return 8;
        return 0;   // clean
    }

    int reverbVenueIndex (const juce::String& venue)
    {
        if (venue == "small-room" || venue == "room") return 0;
        if (venue == "studio") return 1;
        if (venue == "chamber") return 2;
        if (venue == "hall") return 3;
        if (venue == "cathedral") return 5;
        if (venue == "large-stage" || venue == "stage") return 6;
        if (venue == "outdoor") return 7;
        return 4;   // concert-hall
    }

    void applyEqualizer (MixerEngine& mixer, int channel, int slot, const juce::var& state)
    {
        const auto nodes = state.getProperty ("nodes", juce::var());

        if (auto* array = nodes.getArray())
        {
            for (int i = 0; i < juce::jmin (equalizerXNumNodes, array->size()); ++i)
            {
                const auto& node = array->getReference (i);
                const auto base = Slot::Eq::nodeBase + i * Slot::Eq::perNode;
                writeNumber (mixer, channel, slot, base + 0, node, { "freq", "frequency" });
                writeNumber (mixer, channel, slot, base + 1, node, { "gain", "gainDb" });
                writeNumber (mixer, channel, slot, base + 2, node, { "q" });
                writeNumber (mixer, channel, slot, base + 3, node, { "slope" });
                writeRaw (mixer, channel, slot, base + 4, (float) eqShapeIndex (readString (node, "shape")));
                // A node with no explicit flag is enabled, matching the browser.
                writeRaw (mixer, channel, slot, base + 5,
                          hasKey (node, "enabled") ? (node.getProperty ("enabled", true) ? 1.0f : 0.0f) : 1.0f);
            }

            // Nodes the browser dropped must stop filtering natively too.
            for (int i = array->size(); i < equalizerXNumNodes; ++i)
                writeRaw (mixer, channel, slot, Slot::Eq::nodeBase + i * Slot::Eq::perNode + 5, 0.0f);
        }

        writeNumber (mixer, channel, slot, Slot::Eq::outputGainDb, state, { "outputGainDb", "outputGain" });
        writeNumber (mixer, channel, slot, Slot::Eq::autoGain, state, { "autoGain" });
        writeNumber (mixer, channel, slot, Slot::Eq::oversampling, state, { "oversampling" });
    }

    void applyDynamics (MixerEngine& mixer, int channel, int slot, const juce::var& state)
    {
        writeNumber (mixer, channel, slot, Slot::Dyn::threshold, state, { "threshold", "thresholdDb" });
        writeNumber (mixer, channel, slot, Slot::Dyn::ratio, state, { "ratio" });
        writeNumber (mixer, channel, slot, Slot::Dyn::kneeDb, state, { "kneeDb", "knee" });
        writeNumber (mixer, channel, slot, Slot::Dyn::attackSec, state, { "attack", "attackSec" });
        writeNumber (mixer, channel, slot, Slot::Dyn::releaseSec, state, { "release", "releaseSec" });
        writeNumber (mixer, channel, slot, Slot::Dyn::lookaheadMs, state, { "lookaheadMs", "lookahead" });
        writeNumber (mixer, channel, slot, Slot::Dyn::rmsMs, state, { "rmsMs" });
        writeNumber (mixer, channel, slot, Slot::Dyn::mix, state, { "mix" });
        writeNumber (mixer, channel, slot, Slot::Dyn::makeupDb, state, { "makeupDb", "makeup" });
        writeNumber (mixer, channel, slot, Slot::Dyn::autoGain, state, { "autoGain" });
        writeNumber (mixer, channel, slot, Slot::Dyn::autoRelease, state, { "autoRelease" });
        writeNumber (mixer, channel, slot, Slot::Dyn::splitBands, state, { "splitBands" });
        writeNumber (mixer, channel, slot, Slot::Dyn::xo1, state, { "xo1" });
        writeNumber (mixer, channel, slot, Slot::Dyn::xo2, state, { "xo2" });

        const auto detector = readString (state, "detector");
        if (detector.isNotEmpty())
            writeRaw (mixer, channel, slot, Slot::Dyn::detector, detector == "rms" ? 1.0f : 0.0f);

        const auto bands = state.getProperty ("bands", juce::var());

        if (auto* array = bands.getArray())
        {
            for (int band = 0; band < juce::jmin (3, array->size()); ++band)
            {
                const auto& item = array->getReference (band);
                const auto base = Slot::Dyn::bandBase + band * Slot::Dyn::perBand;
                writeNumber (mixer, channel, slot, base + 0, item, { "enabled" });
                writeNumber (mixer, channel, slot, base + 1, item, { "solo" });
                writeNumber (mixer, channel, slot, base + 2, item, { "threshold" });
                writeNumber (mixer, channel, slot, base + 3, item, { "ratio" });
                writeNumber (mixer, channel, slot, base + 4, item, { "makeupDb", "makeup" });
            }
        }
    }

    void applyBoost (MixerEngine& mixer, int channel, int slot, const juce::var& state)
    {
        writeRaw (mixer, channel, slot, Slot::Boost::mode, (float) boostModeIndex (readString (state, "mode")));
        writeRaw (mixer, channel, slot, Slot::Boost::character,
                  (float) boostCharacterIndex (readString (state, "character")));
        writeNumber (mixer, channel, slot, Slot::Boost::amount, state, { "amount" });
        writeNumber (mixer, channel, slot, Slot::Boost::mix, state, { "mix" });
        writeNumber (mixer, channel, slot, Slot::Boost::oversampling, state, { "oversampling" });
        writeNumber (mixer, channel, slot, Slot::Boost::hpfHz, state, { "hpfHz" });
        writeNumber (mixer, channel, slot, Slot::Boost::outputGainDb, state, { "outputGainDb", "outputGain" });
    }

    void applyLimiter (MixerEngine& mixer, int channel, int slot, const juce::var& state)
    {
        writeNumber (mixer, channel, slot, Slot::Lim::gainDb, state, { "gainDb", "gain" });
        writeNumber (mixer, channel, slot, Slot::Lim::ceilingDb, state, { "ceilingDb", "ceiling" });
        writeNumber (mixer, channel, slot, Slot::Lim::releaseMs, state, { "releaseMs", "release" });
        writeNumber (mixer, channel, slot, Slot::Lim::lookaheadMs, state, { "lookaheadMs", "lookahead" });
        writeNumber (mixer, channel, slot, Slot::Lim::oversampling, state, { "oversampling" });
        writeNumber (mixer, channel, slot, Slot::Lim::truePeak, state, { "truePeak" });
    }

    void applyReverb (MixerEngine& mixer, int channel, int slot, const juce::var& state)
    {
        writeNumber (mixer, channel, slot, Slot::Rev::amount, state, { "amount", "mix" });
        writeNumber (mixer, channel, slot, Slot::Rev::level, state, { "reverbLevel", "level" });
        writeNumber (mixer, channel, slot, Slot::Rev::decay, state, { "decay" });
        writeNumber (mixer, channel, slot, Slot::Rev::size, state, { "size" });
        writeNumber (mixer, channel, slot, Slot::Rev::width, state, { "width" });
        writeNumber (mixer, channel, slot, Slot::Rev::preDelayMs, state, { "preDelayMs", "preDelay" });
        writeNumber (mixer, channel, slot, Slot::Rev::dampingHz, state, { "dampingHz", "damping" });
        writeNumber (mixer, channel, slot, Slot::Rev::wetProcess, state, { "wetProcess" });
        writeRaw (mixer, channel, slot, Slot::Rev::venue, (float) reverbVenueIndex (readString (state, "venue")));
    }
}

MixerEngine::InsertKind WebMixerBridge::kindForPlugin (const juce::String& pluginId)
{
    return MixerEngine::kindFromId (pluginId, pluginId);
}

void WebMixerBridge::clearSlot (MixerEngine& mixer, int channelIndex, int slot)
{
    if (channelIndex == 0)
    {
        mixer.clearMasterInsertValues (slot);
        mixer.setMasterInsertKind (slot, Kind::none);
    }
    else
    {
        mixer.clearChannelInsertValues (channelIndex, slot);
        mixer.setChannelInsertKind (channelIndex, slot, Kind::none);
    }
}

void WebMixerBridge::applyInsertState (MixerEngine& mixer, int channelIndex, int slot,
                                       const juce::String& pluginId, const juce::var& state)
{
    const auto kind = kindForPlugin (pluginId);

    if (kind == Kind::none)
    {
        clearSlot (mixer, channelIndex, slot);
        return;
    }

    if (channelIndex == 0)
        mixer.clearMasterInsertValues (slot);
    else
        mixer.clearChannelInsertValues (channelIndex, slot);

    switch (kind)
    {
        case Kind::equalizer: applyEqualizer (mixer, channelIndex, slot, state); break;
        case Kind::dynamics:  applyDynamics (mixer, channelIndex, slot, state); break;
        case Kind::boost:     applyBoost (mixer, channelIndex, slot, state); break;
        case Kind::limiter:   applyLimiter (mixer, channelIndex, slot, state); break;
        case Kind::reverb:    applyReverb (mixer, channelIndex, slot, state); break;
        case Kind::none:
        default: break;
    }

    // Kind last: the audio thread must not start processing before the values land.
    if (channelIndex == 0)
        mixer.setMasterInsertKind (slot, kind);
    else
        mixer.setChannelInsertKind (channelIndex, slot, kind);
}
