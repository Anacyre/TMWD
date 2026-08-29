# X Series 2.0 — Design & Parameter Contract

Single source of truth shared by three implementations:

1. **Web UI** — `uni-preset-vue-vite/src/components/dsp/plugin-*-x.vue`
2. **Web DSP** — `uni-preset-vue-vite/src/dsp/*.js` (AudioWorklet)
3. **Native DSP + VST3** — `Source/Audio/XSeries/*.{h,cpp}` and `Plugins/XSeries/`

Any parameter added here must appear in all three, with identical id, range, default and
unit. The JS `registry.js` parameter metadata and the C++ `APVTS` layout are generated from
the tables below.

---

## 1. Visual language (TMSS "Renaissance" light skin)

Replaces the previous dark neon skin. Warm light chassis, single amber accent, flat panels,
thin strokes, tabular numerals. Optimised for dense parameter layouts at small sizes.

### 1.1 Palette

| Token | Value | Use |
| --- | --- | --- |
| `--x-chassis` | `#EDECE8` | Plugin body |
| `--x-chassis-2` | `#E4E2DD` | Recessed control trays |
| `--x-panel` | `#FBFAF8` | Graph / display panels |
| `--x-panel-2` | `#F3F1ED` | Secondary panels, band cards |
| `--x-ink` | `#26282C` | Primary text |
| `--x-ink-2` | `#5A5E66` | Secondary text |
| `--x-ink-3` | `#8E939C` | Micro labels, axis text |
| `--x-line` | `rgba(38,40,44,0.12)` | Panel borders |
| `--x-line-2` | `rgba(38,40,44,0.06)` | Minor grid |
| `--x-accent` | `#E08B2F` | Amber: knobs, curves, meters |
| `--x-accent-hi` | `#F2A64A` | Amber highlight / hover |
| `--x-accent-lo` | `rgba(224,139,47,0.16)` | Amber fill under curves |
| `--x-cool` | `#4E7FA8` | Secondary data (spectrum, GR) |
| `--x-warn` | `#C4503C` | Over / clip |
| `--x-ok` | `#5E8C61` | Solo / active-good |

Per-plugin identity is expressed by the **band/data colours only**, not by re-tinting the
chassis, so a chain of five plugins reads as one product family:

| Plugin | Data colour |
| --- | --- |
| Equalizer X | node colours `#C4503C` `#D9A227` `#8E939C` `#4E7FA8` `#5E8C61` `#8B5E9C` `#B0703C` |
| Reverb X | `--x-accent` envelope, `--x-cool` early reflections |
| Dynamic X | `--x-accent` curve, `--x-cool` GR, `--x-warn` over-threshold |
| Boost X | `--x-accent` output wave, `--x-ink-3` input wave |
| Limiter X | `--x-accent` GR history, `--x-warn` ceiling breach |

### 1.2 Type

- Family: `Inter, "Segoe UI", -apple-system, sans-serif`
- Wordmark: script `X` glyph + plugin name, `13px`, `letter-spacing .16em`, uppercase
- Micro label: `9px`, `letter-spacing .13em`, uppercase, `--x-ink-3`
- Value readout: `12px`, `font-variant-numeric: tabular-nums`, `--x-ink`
- Axis text: `9px`, `--x-ink-3`

### 1.3 Geometry

- Panel radius `6px`, tray radius `8px`, chip radius `4px`
- Panel border `1px solid var(--x-line)`, plus `inset 0 1px 0 rgba(255,255,255,.7)`
- Knob: outer ring `1px var(--x-line)`, body `#FCFBF9`, amber arc `2.5px`, pointer
  `1.5px var(--x-ink-2)`; sizes `sm 30px / md 38px / lg 48px / xl 96px`
- Slider (horizontal): 3px track `var(--x-line)`, amber fill, `13px` white thumb with
  `1px var(--x-line)` ring
- Meter: 6px bar, `--x-panel-2` trough, amber fill, `--x-warn` above 0 dB; scale ticks
  `+12 +6 0 -6 -12 -36`
- No glows, no `box-shadow` blur on data — legibility over decoration

### 1.4 Layout grammar

Every plugin uses the same three-row skeleton so muscle memory transfers:

```
┌ header ─ wordmark │ preset picker │ tool button │ power ────────┐
├ stage ─── graph panel (flex 1) │ meter column ─────────────────┤
├ tray ──── primary knob/slider row ────────────────────────────┤
└ footer ── mode chips │ secondary toggles │ quality selectors ──┘
```

Mobile (`<720px`): stage clamps to `24vh`, tray becomes a 2-column grid, chips grow to
36px hit targets.

---

## 2. Parameter tables

`key` is the runtime state key (JS `insert.state`, C++ `XParams` field).
`id` is the automation id used by `registry.js` and by the VST3 `APVTS`.
**NEW** marks parameters added in 2.0.

### 2.1 Equalizer X — `equalizer-x` / VST3 `TMSS EQ X`

Global:

| id | key | range | default | unit | notes |
| --- | --- | --- | --- | --- | --- |
| `eq.outputGain` | `outputGainDb` | -24 … 24 | 0 | dB | |
| `eq.autoGain` | `autoGain` | bool | false | | RMS match, ±12 dB clamp |
| `eq.analyzerMode` | `analyzerMode` | `pre` \| `post` | `post` | | **NEW** |
| `eq.oversampling` | `oversampling` | 1, 2, 4 | 1 | × | **NEW** cures near-Nyquist warping |

Per node, `i` = 1…7:

| id | key | range | default | unit |
| --- | --- | --- | --- | --- |
| `eq.node{i}.frequency` | `nodes[i].freq` | 20 … 20000 (log) | 1000 | Hz |
| `eq.node{i}.gain` | `nodes[i].gain` | -18 … 18 | 0 | dB |
| `eq.node{i}.q` | `nodes[i].q` | 0.2 … 12 (log) | 0.9 | |
| `eq.node{i}.slope` | `nodes[i].slope` | 6,12,18,24,30,36,48 | 12 | dB/oct |
| `eq.node{i}.shape` | `nodes[i].shape` | see below | `bell` | |
| `eq.node{i}.enabled` | `nodes[i].enabled` | bool | true | |
| `eq.node{i}.solo` | `nodes[i].solo` | bool | false | |

Shapes: `lowcut` `lowshelf` `bell` `notch` `highshelf` `highcut` `bandpass`.

UI: all active bands are editable simultaneously in a horizontal band-card strip (the 2.0
change — 1.x forced select-one-band). Graph shows spectrum + per-band ghost curves + sum.

### 2.2 Reverb X — `reverb-x` / VST3 `TMSS Reverb X`

| id | key | range | default | unit | notes |
| --- | --- | --- | --- | --- | --- |
| `reverb.mix` | `amount` | 0 … 1 | 0.35 | % | wet/dry (key kept for session compat) |
| `reverb.level` | `reverbLevel` | 0 … 1.5 | 0.65 | % | **NEW** tail+ER level, "Amount" knob |
| `reverb.decay` | `decay` | 0.15 … 12 (log) | 2.2 | s | RT60 target |
| `reverb.size` | `size` | 0 … 1 | 0.62 | % | |
| `reverb.width` | `width` | 0 … 2 | 1.0 | % | **NEW** M/S on wet |
| `reverb.preDelay` | `preDelayMs` | 0 … 250 (log) | 20 | ms | **NEW** exposed |
| `reverb.damping` | `dampingHz` | 500 … 20000 (log) | 6200 | Hz | **NEW** in-loop LP |
| `reverb.venue` | `venue` | 8 ids | `concert-hall` | | |
| `reverb.wetProcess` | `wetProcess` | bool | false | | wet-only FX chain |

Venue → UI mode chip mapping (the 5 chips in the reference design, 3 extra in the preset
menu): `small-room`→ROOM, `studio`→ROOM, `chamber`→CHAMBER, `hall`→HALL,
`concert-hall`→HALL, `cathedral`→CATHEDRAL, `large-stage`→PLATE, `outdoor`→PLATE.

Algorithm change in 2.0: comb delay times become **sample-rate independent** (stored in
seconds, not 44.1 kHz sample counts) and gain **±0.6 % randomised modulation** to break up
metallic coloration.

### 2.3 Dynamic X — `dynamic-x` / VST3 `TMSS Dynamic X`

| id | key | range | default | unit | notes |
| --- | --- | --- | --- | --- | --- |
| `dynamic.threshold` | `threshold` | -48 … 0 | -18 | dB | |
| `dynamic.ratio` | `ratio` | 1 … 20 (log) | 4 | :1 | |
| `dynamic.knee` | `kneeDb` | 0 … 24 | 6 | dB | **NEW** soft knee |
| `dynamic.attack` | `attack` | 0.0002 … 0.2 (log) | 0.012 | s | min lowered for true peak |
| `dynamic.release` | `release` | 0.02 … 1.5 (log) | 0.12 | s | |
| `dynamic.lookahead` | `lookaheadMs` | 0 … 10 | 0 | ms | **NEW** reported as latency |
| `dynamic.detector` | `detector` | `peak` \| `rms` | `peak` | | **NEW** per-sample, was block-RMS |
| `dynamic.rmsMs` | `rmsMs` | 1 … 100 (log) | 10 | ms | **NEW** RMS window |
| `dynamic.mix` | `mix` | 0 … 1 | 1.0 | % | **NEW** parallel/dry blend |
| `dynamic.makeup` | `makeupDb` | -12 … 24 | 0 | dB | |
| `dynamic.autoGain` | `autoGain` | bool | false | | |
| `dynamic.autoRelease` | `autoRelease` | bool | false | | 35…650 ms adaptive |
| `dynamic.splitBands` | `splitBands` | bool | false | | |
| `dynamic.xo1` | `xo1` | 40 … 800 (log) | 180 | Hz | |
| `dynamic.xo2` | `xo2` | 800 … 12000 (log) | 3500 | Hz | |

Per band, `i` = 1…3 (Low / Mid / High):

| id | key | range | default | notes |
| --- | --- | --- | --- | --- |
| `dynamic.band{i}.enabled` | `bands[i].enabled` | bool | true | |
| `dynamic.band{i}.solo` | `bands[i].solo` | bool | false | |
| `dynamic.band{i}.threshold` | `bands[i].threshold` | -48 … 0 dB | -18 | **must actually reach the DSP** — 1.x bug |
| `dynamic.band{i}.ratio` | `bands[i].ratio` | 1 … 20 | 4 | **must actually reach the DSP** — 1.x bug |
| `dynamic.band{i}.makeup` | `bands[i].makeupDb` | -12 … 24 dB | 0 | **NEW** |

2.0 detector rewrite: per-sample peak (with optional sliding RMS), soft-knee gain computer,
optional lookahead delay with latency reporting.

### 2.4 Boost X — `boost-x` / VST3 `TMSS Boost X`

| id | key | range | default | unit | notes |
| --- | --- | --- | --- | --- | --- |
| `boost.mode` | `mode` | `ott` `expander` `chorus` `drive` | `ott` | | `distortion` accepted as alias of `drive` |
| `boost.amount` | `amount` | 0 … 1 | 0.35 | % | big knob, displayed ×2 as `0.00…2.00` |
| `boost.mix` | `mix` | 0 … 1 | 1.0 | % | **NEW** |
| `boost.oversampling` | `oversampling` | 1, 2, 4 | 2 | × | **NEW** required for `drive` |
| `boost.hpfHz` | `hpfHz` | 0 … 400 | 50 | Hz | **NEW** keeps lows out of the nonlinearity |
| `boost.outputGain` | `outputGainDb` | -12 … 12 | 0 | dB | **NEW** |
| — | `character` | string | `clean` | | preset-driven, not automatable |

### 2.5 Limiter X — `limiter-x` / VST3 `TMSS Limiter X`

| id | key | range | default | unit | notes |
| --- | --- | --- | --- | --- | --- |
| `limiter.gain` | `gainDb` | -12 … 18 | 0 | dB | input gain |
| `limiter.ceiling` | `ceilingDb` | -3 … 0 | -0.1 | dB | **NEW** was hardcoded -0.1 |
| `limiter.release` | `releaseMs` | 10 … 1000 (log) | 100 | ms | |
| `limiter.lookahead` | `lookaheadMs` | 0 … 5 | 1.5 | ms | **NEW** removes overshoot |
| `limiter.oversampling` | `oversampling` | 1, 2, 4 | 4 | × | **NEW** replaces Hermite guess |
| `limiter.truePeak` | `truePeak` | bool | true | | **NEW** ITU-R BS.1770 style detect |

---

## 3. DSP quality targets

| Effect | 1.x defect | 2.0 requirement |
| --- | --- | --- |
| Equalizer X | 1024-pt FFT inside audio callback | analyser fed from a lock-free ring buffer, FFT on the UI side |
| Equalizer X | near-Nyquist shapes warp | optional 2×/4× oversampling of the whole cascade |
| Reverb X | comb times pinned to 44.1 kHz indices | times in seconds, resampled per `prepare` |
| Reverb X | static parallel combs sound metallic | slow randomised delay modulation, in-loop damping LP |
| Dynamic X | block-RMS detector misses transients | per-sample peak / sliding-RMS detector |
| Dynamic X | hard knee only | quadratic soft knee 0…24 dB |
| Dynamic X | per-band threshold/ratio ignored | per-band gain computers |
| Dynamic X | full+split double processing during crossfade | single path, crossfade the gain signal instead |
| Boost X | `drive` aliases badly | polyphase 2×/4× oversampling around the shaper |
| Boost X | `log10`/`pow` per sample in OTT | dB conversion via fast approximations, gains in linear domain |
| Limiter X | Hermite interpolation guesses inter-sample peaks | real oversampled true-peak detection |
| Limiter X | no lookahead → overshoot and clicks | lookahead delay + smoothed gain, latency reported |
| All | full-state `postMessage` per change | unchanged for web; VST3 uses `APVTS` atomics |
| All | denormals | flush-to-zero on every recursive state |

CPU budget, measured by the self-tests at 48 kHz / 128-sample blocks, stereo, one instance:

| Effect | Max % of realtime |
| --- | --- |
| Equalizer X (7 bands, 1×) | 12 % |
| Reverb X | 18 % |
| Dynamic X (3-band) | 15 % |
| Boost X (OTT, 2×) | 15 % |
| Limiter X (4×) | 10 % |

---

## 4. VST3 packaging

| Plugin | Bundle | Plugin code | Category |
| --- | --- | --- | --- |
| Equalizer X | `TMSS EQ X.vst3` | `TxEQ` | `Fx|EQ` |
| Reverb X | `TMSS Reverb X.vst3` | `TxRV` | `Fx|Reverb` |
| Dynamic X | `TMSS Dynamic X.vst3` | `TxDY` | `Fx|Dynamics` |
| Boost X | `TMSS Boost X.vst3` | `TxBO` | `Fx|Distortion` |
| Limiter X | `TMSS Limiter X.vst3` | `TxLM` | `Fx|Dynamics` |

- Manufacturer: `TMSS`, code `TMSS`
- Build: CMake + `juce_add_plugin`, `Release|x64`, static runtime off
- Install target: `C:\Program Files\Common Files\VST3\TMSS X series\`
- Each plugin reports latency (`setLatencySamples`) when lookahead or oversampling adds any
