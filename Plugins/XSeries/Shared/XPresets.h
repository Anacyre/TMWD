#pragma once

#include <JuceHeader.h>

/** Factory presets, mirroring the `presets` arrays in the web `registry.js` so the two front
    ends offer the same starting points. Values are in real parameter units, not normalised. */
struct XPreset
{
    juce::String name;
    std::vector<std::pair<juce::String, float>> values;
};

inline void applyXPreset (juce::AudioProcessorValueTreeState& state, const XPreset& preset)
{
    for (const auto& [id, value] : preset.values)
    {
        if (auto* parameter = state.getParameter (id))
        {
            parameter->beginChangeGesture();
            parameter->setValueNotifyingHost (parameter->convertTo0to1 (value));
            parameter->endChangeGesture();
        }
    }
}
