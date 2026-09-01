import { collectBounceEvents, encodeWav } from './bounce.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

{
  const session = {
    bpm: 120,
    tracks: [
      { id: 1, type: 'master', mute: false },
      { id: 2, type: 'midi', source: 'm-orchestra', definitionId: 'm_orch_violin', mute: false },
      { id: 3, type: 'midi', source: 'remote-vst', mute: false }
    ],
    clips: [
      {
        trackIndex: 1,
        startBeat: 0,
        midi: true,
        notes: [{ pitch: 60, startTick: 0, durationTick: 960, velocity: 100 }]
      },
      {
        trackIndex: 2,
        startBeat: 0,
        midi: true,
        notes: [{ pitch: 64, startTick: 0, durationTick: 960, velocity: 100 }]
      }
    ]
  }
  const { events, endBeat } = collectBounceEvents(session)
  assert(events.length === 1 && events[0].kind === 'm-orchestra', 'bounce collects browser-owned notes only')
  assert(endBeat >= 1, 'bounce length covers the last note')
}

{
  const empty = collectBounceEvents({ tracks: [], clips: [] })
  assert(empty.events.length === 0, 'an empty project has nothing to bounce')
}

{
  const length = 8
  const fake = {
    numberOfChannels: 1,
    sampleRate: 8000,
    length,
    getChannelData () { return new Float32Array(length) }
  }
  const wav = encodeWav(fake)
  const view = new DataView(wav)
  assert(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) === 'RIFF', 'WAV starts with RIFF')
  assert(wav.byteLength === 44 + length * 2, 'PCM16 mono WAV size matches payload')
}

console.log('bounce ok')
