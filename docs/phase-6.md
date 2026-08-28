# DawWeb Phase 6

Architecture and local prototype. Not a cloud DAW. Not a claim of real-time until measured.

## A. Architecture

```
                    WEB DAW  (same Vue app)
                       │
        ┌──────────────┼──────────────┐
        │              │              │
     Tracks        Piano Roll       Mixer
        │              │              │
        ├──── Web Sampler             │
        │                             │
        └──── Remote VST Tracks ──────┘
                       │
                  Web Audio graph
                       │
                 Web Master
                       │
                    Output

                         ▲
                         │  ONE mixed stereo tap
                         │  prototype: separate /audio WS binary PCM
                  RemoteAudioOutput
                         │
              ┌──────────┴──────────┐
              │        LOCAL PC     │
              │     JUCE Engine     │
              │          │          │
              │    ┌─────┴─────┐    │
              │   BBCSO     Synchron│
              └─────────────────────┘
```

Layer map:

| Layer | Lives in | Notes |
| --- | --- | --- |
| A Audio engine | `Source/Audio` | Device, transport, sequencer, master mix |
| B Plugin hosting | `Source/Plugins` | PluginHost is the only BBCSO/Synchron owner |
| C EngineAPI | `Source/Communication/EngineAPI.*` | JSON contract |
| D Project model | `Source/Model` | schemaVersion 2 `.dawweb` |
| E JUCE desktop UI | `Source/UI` | Orchestra Sampler remains native |
| F Web UI | `uni-preset-vue-vite/...` | Same frontend for localhost and LAN |

```
JUCE UI  → EngineAPI → Audio Engine
Web UI   → EngineAPI → Audio Engine
```

The Web UI does not touch VST internals. Instrument load/technique/controllers go through EngineAPI. Unknown instruments return an error; there is no silent fallback.

One audio session per engine process. Multiple browsers may observe/control it. Session id is in `/health` and `session.state`.

WebSocket is the **control** channel (JSON text). Mixed stereo PCM uses a **separate** `/audio` (or `/ws/audio`) WebSocket. That PCM path is a **prototype**, not WebRTC. Per-track PCM is not sent. Control sockets never carry binary frames; the audio socket never carries JSON commands.

## B. File structure (Phase 6 additions)

```
Source/Model/ProjectSchema.h
Source/Model/MixerModel.h
Source/Model/WebSamplerModel.h
Source/Audio/RemoteAudioOutput.h/.cpp
Source/Audio/SessionDiagnostics.h/.cpp
Source/Communication/WebGateway.*     (LAN bind, binary tap)
uni-preset-vue-vite/.../src/bridge/engine.js
uni-preset-vue-vite/.../src/audio/graph.js
uni-preset-vue-vite/.../src/audio/web-sampler.js
uni-preset-vue-vite/.../src/model/mixer.js
uni-preset-vue-vite/.../src/schema/project.schema.json
uni-preset-vue-vite/.../src/components/daw-mixer.vue
uni-preset-vue-vite/.../src/components/daw-diagnostics.vue
```

## C. EngineAPI commands

Control channel: JSON text WebSocket. Every reply has `ok: true|false`. Errors have `error`.

Kept: `instrument.select|load`, `instrument.technique`, `instrument.controller.set`, `project.load|save`, `track.create|delete`

Added/aliased:

- `session.state` / `session.getState`
- `track.update` `track.mute` `track.solo` `track.volume` `track.pan`
- `note.create` `note.delete` `note.update` (alias of `note.set`)
- `transport.play|stop|pause|seek`
- `project.new`
- `mixer.getState` `mixer.setState` `mixer.setMasterVolume`
- `sampler.load` `sampler.unload` (web-sampler source only; no VST)
- `audio.getStatus` `audio.subscribe` `audio.unsubscribe`
- `diagnostics.ping` `diagnostics.click` `diagnostics.getMetrics`
- `engine.getStatus` `instrument.getCatalogue`

Example:

```
REQUEST  { "type": "instrument.select", "trackId": 2, "instrumentId": "bbcso_violin_1" }
RESPONSE { "ok": true, "type": "instrument.status", "trackId": 2, "status": "loading|ready|error|unavailable", "instrumentId": "bbcso_violin_1" }
```

Reconnect: browser calls `session.state` and rebuilds from the engine. Browser memory is not the source of truth.

## D. Project schema

`schemaVersion` 2. Files without it are treated as version 1 and migrated on load.

Track `source`: `empty` | `remote-vst` | `web-sampler`

Mixer fields: volume, pan, mute, solo, sends[], inserts[]

JSON schema: `uni-preset-vue-vite/uni-preset-vue-vite/src/schema/project.schema.json`

PC still applies volume/pan for hosted VSTs because the network path is one mixed stereo signal. The browser mixer UI writes those parameters through EngineAPI. Browser-side mixing for web-sampler tracks is local.

## E. Remote audio transport comparison

Phase 6 does **not** freeze a transport. The working prototype is WebSocket binary PCM so LAN audio can be heard and measured. That is convenience for a prototype, not a verdict.

| | WebSocket binary PCM | WebRTC audio | Other (WebTransport / QUIC) |
| --- | --- | --- | --- |
| Latency | Extra jitter buffer required; TCP head-of-line blocking under loss | Designed for media; jitter buffer + NACK/FEC | Promising on HTTP/3 browsers |
| Jitter | Application must absorb it | Stack absorbs it | Similar to WebRTC if datagrams |
| Packet loss | Stall or drop; no media PLC | PLC / concealment | Depends on datagram mode |
| Complexity | Low (already have WS) | Signaling + capture path; no STUN needed on LAN | New runtime |
| Browser support | Universal | Universal | Chrome/Edge first |
| LAN | Fine on a quiet network | Better under interference | Unproven here |
| Future Internet | Poor for raw PCM | Appropriate | Possible later |
| This repo | Prototype tap | Not implemented (no full stack unless measurements demand it) | Not implemented |

Recommendation after prototype: keep WS for control. Revisit WebRTC **if** measured MIDI-to-audible on LAN/mobile is too high or underruns appear under Wi-Fi loss. Do not switch on convenience alone.

Packet: 40-byte little-endian header `DAWA` + interleaved float32 stereo. Sequence + host timestamp + optional diagnostic click flag.

## F. Measured latency

Fill this table from **View → Diagnostics → Measure** on each device. Until then every cell is **unmeasured**. Do not call the path real-time.

| Path | Same PC browser | LAN laptop | Mobile |
| --- | --- | --- | --- |
| Browser → PC control RTT | unmeasured | unmeasured | unmeasured |
| PC VST render (block/sr) | reported by `audio.getStatus.renderLatencyMs` | same PC | same PC |
| PC → browser audio | unmeasured | unmeasured | unmeasured |
| MIDI to audible | unmeasured | unmeasured | unmeasured |
| Jitter | unmeasured | unmeasured | unmeasured |
| Underruns | unmeasured | unmeasured | unmeasured |

Design must keep accounting for: device buffer, network jitter, play-out buffer (~80 ms target in the worklet), clock drift, sample-rate mismatch, dropped packets, reconnect via `session.state`.

## G. CPU / RAM

`diagnostics.getMetrics` reports process CPU, audio callback CPU, working set, private bytes, plugin count. Capture before/after moving mixer DSP to the browser.

## H. Remaining before a full Web DAW

- Visual mixer references from the owner (current mixer is a compact first pass, not a generic strip rack)
- Ear-check BBCSO/Synchron over the remote tap
- WebRTC experiment **if** WS measurements fail
- Clock-drift compensation and packet concealment
- Full web sampler (WAV map, RR, loops)
- Browser FX / sends DSP
- Mute local speakers when a remote client is the monitoring path
- Project picker that is not file-download only
- No cloud, auth, or public Internet in this phase

Git freeze of the previous working native state: tag `phase-5.5-complete`.
