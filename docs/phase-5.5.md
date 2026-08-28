# DawWeb Phase 5.5 freeze

Git tag: `phase-5.5-complete`.

This is the last native-only working state before the Phase 6 web shell. Phase 6 and 6.5 keep this contract:

- JUCE on the PC hosts BBCSO Discover and Synchron Player.
- Factory instruments are opaque `.state` + `.meta.json` files. A blob that matches the plugin default dump, or is smaller than 1024 bytes for those two plugins, is not a factory instrument.
- Orchestra Sampler (native panel) talks to real hosted instances through EngineAPI: technique, mapped controllers, pedal, legato. Unmapped controls stay N/A.
- Projects are `.dawweb` files. There is no DawWeb database, login, or cloud.
- The Vue H5 app is the same UI for localhost and LAN. It does not load those VSTs.

Do not treat Phase 6 web work as a replacement for this freeze. If a later change breaks factory restore or EngineAPI, revert to this tag and re-apply the web layers.

## What Phase 5.5 already had

- VST3 hosting limited to the approved BBCSO / Synchron paths in `instruments.json`
- InstrumentDefinition / PresetDefinition ids
- Factory restore for Violin I Long / Spiccato and the four Synchron libraries (captured states in `Source/Resources/instruments/`)
- Project save/load of track assignment, not a rewrite of PluginHost
- `--probe-vst3` and `--audio-test` (must run on the message thread)

## Piano factory state

`bbcso/piano.state` must be a named BBCSO Piano capture (with matching `piano.meta.json`), not `bbcso_default.state`. Recapture via State Capture if the blob is ever replaced by the 502-byte default again.
