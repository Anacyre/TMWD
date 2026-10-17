import { collectAudioEvents, createAudioClip, buildAudioPreview, sliceWindow, audioClipGain, isAudioClip } from './audio-clips.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

{
  const clip = createAudioClip({ sourceId: 'abc', startBeat: 2, lengthBeats: 4, gainDb: -6, audioOffsetBeats: 1 })
  assert(clip.kind === 'audio' && clip.midi === false, 'audio clips are tagged non-midi')
  assert(isAudioClip(clip), 'isAudioClip recognises the kind')
  assert(Math.abs(audioClipGain(clip) - Math.pow(10, -6 / 20)) < 0.001, 'gainDb converts to linear gain')
}

{
  const session = {
    bpm: 120,
    tracks: [{ id: 1, type: 'master' }, { id: 2, type: 'audio', mute: false }],
    clips: [
      createAudioClip({ sourceId: 'h1', startBeat: 0, lengthBeats: 2 }),
      { kind: 'midi', midi: true, trackIndex: 1, startBeat: 0, lengthBeats: 1, notes: [{ pitch: 60 }] }
    ]
  }
  session.clips[0].trackIndex = 1
  const { events, endBeat } = collectAudioEvents(session)
  assert(events.length === 1 && events[0].sourceId === 'h1', 'bounce events skip midi clips')
  assert(endBeat >= 2, 'length covers the audio clip')
}

{
  const fake = {
    length: 8,
    duration: 8 / 44100,
    numberOfChannels: 1,
    getChannelData () { return new Float32Array([0, 0.8, -0.4, 0.2, 0, 0, 0.1, -0.1]) }
  }
  const preview = buildAudioPreview(fake, 4)
  assert(preview.peaks.length === 4, 'preview uses the requested bin count')
  assert(preview.peaks[0] > 0, 'peaks capture the loudest bin')
}

{
  const win = sliceWindow({ lengthBeats: 2, audioOffsetBeats: 1, gainDb: 0 }, 120, { duration: 4 })
  assert(win.offsetSec > 0 && win.durationSec > 0, 'trim window is a positive slice')
}

console.log('audio-clip ok')
