#pragma once

#include <JuceHeader.h>

namespace DawColours
{
    inline const juce::Colour background     { 0xff121212 };
    inline const juce::Colour header         { 0xff1a1a1a };
    inline const juce::Colour panel          { 0xff161616 };
    inline const juce::Colour panelRaised    { 0xff1e1e1e };
    inline const juce::Colour arrangement    { 0xff101010 };
    inline const juce::Colour ruler          { 0xff2a2a2a };
    inline const juce::Colour gridBar        { 0xff2c2c2c };
    inline const juce::Colour gridBeat       { 0xff1c1c1c };
    inline const juce::Colour laneLine       { 0xff202020 };
    inline const juce::Colour divider        { 0xff2a2a2a };
    inline const juce::Colour text           { 0xffe6e6e6 };
    inline const juce::Colour textMuted      { 0xff8d8d8d };
    inline const juce::Colour textDim        { 0xff6a6a6a };
    inline const juce::Colour control        { 0xff2b2b2b };
    inline const juce::Colour controlHover   { 0xff353535 };
    inline const juce::Colour sliderTrack    { 0xff2a2a2a };
    inline const juce::Colour sliderFill     { 0xff7a7a7a };
    inline const juce::Colour knob           { 0xff2b2b2b };
    inline const juce::Colour playhead       { 0xffffffff };
    inline const juce::Colour record         { 0xffe74c3c };
    inline const juce::Colour muteOn         { 0xffc45c26 };
    inline const juce::Colour soloOn         { 0xff2ea44f };
    inline const juce::Colour armOn          { 0xffd23b3b };
    inline const juce::Colour accent         { 0xff4da3ff };
    inline const juce::Colour loopRegion     { 0x224da3ff };
    inline const juce::Colour dropHighlight  { 0x334da3ff };

    // Added for the DAW shell: piano roll, mixer meters, tabs and selection.
    inline const juce::Colour panelSunken    { 0xff0e0e0e };
    inline const juce::Colour rowSelected    { 0xff232323 };
    inline const juce::Colour rowHover       { 0xff1c1c1c };
    inline const juce::Colour selectionFill  { 0x224da3ff };
    inline const juce::Colour selectionEdge  { 0xff4da3ff };
    inline const juce::Colour keyWhite       { 0xffcccccc };
    inline const juce::Colour keyBlack       { 0xff1b1b1b };
    inline const juce::Colour keyLabel       { 0xff5a5a5a };
    inline const juce::Colour laneWhite      { 0xff151515 };
    inline const juce::Colour laneBlack      { 0xff101010 };
    inline const juce::Colour laneRoot       { 0xff1a1a1a };
    inline const juce::Colour noteFill       { 0xff5f9ea0 };
    inline const juce::Colour noteSelected   { 0xffe8e8e8 };
    inline const juce::Colour meterLow       { 0xff56a35c };
    inline const juce::Colour meterMid       { 0xffd0b04a };
    inline const juce::Colour meterHigh      { 0xffd24b4b };
    inline const juce::Colour meterBack      { 0xff0c0c0c };
    inline const juce::Colour insertSlot     { 0xff232323 };
    inline const juce::Colour tabActive      { 0xff232323 };
}
