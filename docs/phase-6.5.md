# DawWeb Phase 6.5 — Browser-native Web DSP

Phase 5.5 remains frozen. Phase 6 local architecture is unchanged except an **opaque `webMixer` field** (schema 3, MixerModel 2.0 in schema **4**) so the engine can round-trip browser plugin JSON.

These four plugins run in the **browser** (Web Audio / AudioWorklet). They are not JUCE/VST inserts.

## A. Web DSP architecture

```
Remote VST (BBCSO / Synchron)
        ↓
PC-side VST summing
        ↓
ONE stereo remote audio stream
        ↓
Browser RemoteVstPlayer (AudioWorklet)
        ↓
Remote mix inserts  (generic WebDSPPlugin chain)
        ↓──────────────────┐
Track output              Send → Reverb bus inserts (wet return)
        ↓──────────────────┘
                              Web Sampler ──┐
                                            ↓
                                         Sum
                                            ↓
                                    Master inserts
                                            ↓
                                         Output
```

Vue never processes samples. Flow:

```
Vue UI  →  plugin model (JSON state)  →  AudioWorklet parameters/messages  →  DSP
```

| Layer | Location | Role |
| --- | --- | --- |
| Contract | `src/dsp/plugin.js` | ids, clamp, normalize, `createInsert` / `serializeInsert` |
| Registry | `src/dsp/registry.js` | four plugins, parameters, factory presets |
| DSP | `src/dsp/fx-worklet.js` | `daw-fx-chain` AudioWorkletProcessor |
| Runtime | `src/dsp/runtime.js` | worklet load, chain node, AnalyserNode spectrum |
| Graph | `src/audio/mixer-graph.js` | remote / bus / master chains |
| Model | `src/model/web-mixer.js` | inserts, sends, buses |
| UI | `src/components/dsp/*` | controls the model only |

PC still owns PluginHost, BBCSO, Synchron, factory `.state`, native Orchestra Sampler, and the mixed stereo tap. Native `MixerEngine` insert slots are **routing metadata only** — Equalizer X / Reverb X / Boost X / Dynamic X run in the browser AudioWorklet, not as a second native DSP copy. EngineAPI gained `mixer.setWebMixer` only.

## B. Plugin API

Conceptual `WebDSPPlugin`:

- `id`, `name`, `version`, `category`
- `parameters[]` — stable ids, display name, min, max, default, unit, `scale`, `automatable`
- `createState()` / `normalize(state)`
- `presets[]`
- DSP: `process()` / `reset()` inside the worklet (not Vue)
- Persistence: `getState` / `setState` via JSON `insert.state`

Insert on a lane:

```json
{
  "instanceId": "equalizer-x_ab12cd9k3",
  "pluginId": "equalizer-x",
  "version": 1,
  "enabled": true,
  "presetId": "warm",
  "state": { }
}
```

Normalized value is derived: `paramNorm(param, value)` in `plugin.js`. Do not store AudioNodes.

## C. Parameter schema (automation-ready)

| Plugin | IDs |
| --- | --- |
| Reverb X | `reverb.amount`, `reverb.decay`, `reverb.size`, `reverb.venue`, `reverb.wetProcess` |
| Equalizer X | `eq.outputGain`, `eq.autoGain`, `eq.node1..7.frequency`, `.gain`, `.q`, `.slope` |
| Boost X | `boost.mode`, `boost.amount` |
| Dynamic X | `dynamic.threshold`, `dynamic.ratio`, `dynamic.attack`, `dynamic.release`, `dynamic.autoRelease`, `dynamic.makeup`, `dynamic.autoGain`, `dynamic.splitBands`, `dynamic.xo1`, `dynamic.xo2`, `dynamic.band1..3.enabled`, `dynamic.band1..3.threshold` |

Automation is **not** implemented. IDs are stable for Phase 7.

## D. Mixer routing

Generic inserts — the mixer does not hard-code the four plugin types.

Demo chain (Mix → **Demo FX**):

```
Remote mix → Equalizer X → Dynamic X → Send → Reverb bus (Reverb X, wet-only return)
                                                    ↓
Web Sampler ──────────────────────────────────────→ Sum → Master Boost X → Output
```

**Limitation (intentional):** the PC sends one mixed stereo VST signal. Browser inserts on **Remote mix** process that sum. They cannot independently EQ Violin vs Choir after BBCSO/Synchron have been mixed on the PC.

Web Sampler joins at the sum, so it does **not** pass through Remote mix inserts. It does pass through Master inserts.

## E. Project schema changes

`ProjectSchema::currentVersion = 3` (still reads 1–2).

New optional root field `webMixer` (opaque JSON). JUCE stores and returns it. JUCE track `inserts` remain PluginSlot `{ name, bypassed }` and are **not** Web DSP.

Load order: restore `webMixer` model → construct AudioWorklet chains → push parameters.

Command: `mixer.setWebMixer { webMixer }`.

## F / G. CPU and browser audio performance

Diagnostics (header engine chip → Measure) now reports:

- PC CPU / audio CPU / working set / VST plugin count (engine)
- Browser plugin count
- Worklet block time (`cpuMs` EMA from `daw-fx-chain`)
- Underruns, jitter, remote buffer depth

Fill the comparison table by measuring on the target PC/device. Do **not** assume browser FX are cheaper than PC mixing.

| Setup | PC CPU | Browser worklet | Underruns | Notes |
| --- | --- | --- | --- | --- |
| A BBCSO/Synchron only | measure | — | measure | Remote audio off or no browser inserts |
| B + PC mixer | measure | — | measure | Unchanged JUCE mixer |
| C + browser mixer | measure | measure | measure | Empty insert slots |
| D browser mixer + 4 plugins | measure | measure | measure | Demo FX chain |

Moving FX to the browser does not automatically improve the whole system. VST hosting cost stays on the PC.

## H. Known limitations

1. One mixed stereo VST tap — no per-remote-track browser FX.
2. Split-band Dynamic X uses low-latency **Linkwitz-Riley-ish 2nd-order IIR** crossovers (Q = 0.5), not linear-phase and not a perfect LR4. Bands can be soloed/bypassed.
3. Reverb is delay + comb/allpass + filters + venue table. Not convolution. No IR files.
4. EQ auto-gain is slow RMS compensation, not loudness (LUFS) normalization.
5. Boost OTT is a simplified multiband up/down compressor, not Ableton OTT.
6. Per-track `webMixer.tracks` exists in the model; DSP wiring for individual web-sampler tracks is not in this phase.
7. Wet Process supports Equalizer X, Dynamic X, Boost X on the **wet** buffer only.
8. Same Vue app for localhost and LAN. No cloud, auth, or database.
9. CPU numbers above are unmeasured until you run Diagnostics → Measure with audio playing.

## I. Recommended Phase 7 (do not start automatically)

- Parameter automation using the stable IDs above
- Optional VST buses if independent remote-track FX become necessary
- Per-track web-sampler insert DSP
- Convolution / IR venues for Reverb X
- Linear-phase or true LR4 crossovers if CPU allows
- Cloud/project sync only after local + LAN is stable

## UI / test notes

- Mix panel: **Remote mix**, **Reverb** bus, **Master**, then track volume chips
- **Demo FX** loads the test-plan chain
- Equalizer X: max 7 nodes; `+` or double-click/double-tap to create; 8th rejected
- Knobs: vertical / touch / wheel / arrows / double-click reset; no hover-only state
- Bypass is On/Off text, not colour alone
- Orchestra Sampler (native) is untouched
