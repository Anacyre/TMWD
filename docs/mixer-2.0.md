# MixerModel 2.0

Shared mixer for the Vue UI and JUCE engine. Schema version **4**.

The mixer is a small instrument, not a technical console. The same serializable model drives:

- Browser: Vue → MixerModel → AudioGraph → AudioWorklet
- Local/remote PC: MixerModel → JUCE MixerEngine (volume / pan / mute / logical solo on hosted VSTs)

Vue never processes samples. The PC never sends per-track PCM. Remote audio remains **one mixed stereo stream**.

## Signal path

```
input → instrument/sampler → insert 1…5 → volume → pan → sends → master
```

Mute is after inserts and before sends/master. Solo is logical: the mixer computes an effective mute; plugins stay loaded.

Volume is dB (−60…+6, 0 = unity). Pan is equal-power: θ = (pan + 1) × π/4.

Sends are post-insert by default. `preFader` is stored so a later pre/post switch does not require a new model.

## Inserts

Maximum **5** built-in effects per lane (track, Mix, return, master):

Equalizer X, Dynamic X, Reverb X, Boost X.

A sixth insert is refused in the UI, MixerModel, and AudioGraph. A project with 6+ filled inserts returns an error and keeps overflow in `webMixer.overflowInserts` — extras are not silently dropped.

X-series DSP runs in the **browser AudioWorklet**. VST-track insert slots are stored, not concatenated onto the remote stereo tap (that would fake per-track EQ on a summed mix). Use the **Mix** strip for orchestra-wide inserts. Web Sampler tracks get a real per-track chain.

Reverb X belongs on a return (`bus_reverb`, `returnOnly`) unless the user places it as an insert. Demo FX: Mix EQ → Dynamic, Send A → Reverb return, Master Boost.

## Sends and returns

Three global sends: A → Reverb, B → Delay, C → Reverb. The Sends row stays hidden until opened. Return buses use ↻ typography, not colored cards.

VST tracks cannot have per-track sends over the network. Their send UI is the Mix strip. Web Sampler tracks have per-track send amounts.

## Modes

Compact / Detail. Compact: icon, name, five slots, volume, pan, mute, solo, small meter. Clicking a slot opens the X-series editor — the mixer does not embed plugin panels.

## Persistence

`.dawweb` stores fader `volume` plus canonical `volumeDb`, five insert slots, send A/B/C, and opaque `webMixer` (plugin JSON only, no AudioNodes).
