import { collectAudioEvents, createAudioClip, buildAudioPreview, sliceWindow, audioClipGain, isAudioClip, audioFadePlan, audioTrim, audioStretch, clipMatchesTrack, audioPlaySlice } from './audio-clips.js'

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
  const fades = audioFadePlan({ fadeInBeats: 4, fadeOutBeats: 4 }, 2, 120)
  assert(fades.fadeInSec > 0 && fades.fadeInSec <= 1 && fades.fadeOutSec <= 1, 'fades stay inside the clip')
  assert(createAudioClip({}).fadeInBeats === 0, 'new audio clips have no fade')
  assert(Math.abs(win.playbackRate - 1) < 0.001, 'an unstretched clip plays at 1x')
}

{
  const stretched = sliceWindow({ lengthBeats: 2, audioSourceBeats: 4, audioOffsetBeats: 0 }, 120, { duration: 4 })
  assert(Math.abs(stretched.playbackRate - 2) < 0.001, 'stretch plays the source faster across a shorter clip')
  assert(Math.abs(stretched.durationSec - 2) < 0.02, 'stretch still consumes the source window')
  const mid = audioPlaySlice({ lengthBeats: 4, audioSourceBeats: 4, audioOffsetBeats: 0 }, 120, { duration: 4 }, 2)
  assert(Math.abs(mid.sourceOffset - 1) < 0.02 && mid.remainSec < 1.1, 'playback from the middle skips the start of the clip')
  const orig = { start: 0, length: 4, offset: 0, source: 4 }
  const cropped = audioTrim(orig, 0, 2, 8)
  assert(cropped.length === 2 && cropped.source === 2 && cropped.offset === 0, 'right edge crops the source instead of stretching it')
  const slipped = audioTrim(orig, 1, 3, 8)
  assert(Math.abs(slipped.offset - 1) < 0.001 && Math.abs(slipped.source - 3) < 0.001, 'left edge crops the start')
  const stretchedEdge = audioStretch(orig, 8)
  assert(stretchedEdge.length === 8 && stretchedEdge.source === 4, 'stretch keeps the source and changes the timeline')
  const midi = { kind: 'midi', midi: true }
  const audio = { kind: 'audio', midi: false }
  assert(clipMatchesTrack({ type: 'audio', source: 'audio' }, audio), 'audio tracks show audio clips')
  assert(!clipMatchesTrack({ type: 'audio', source: 'audio' }, midi), 'audio tracks hide midi clips')
  assert(clipMatchesTrack({ type: 'midi', source: 'orchestra' }, midi), 'midi tracks show midi clips')
  assert(!clipMatchesTrack({ type: 'midi', source: 'orchestra' }, audio), 'midi tracks hide audio clips')
}

console.log('audio-clip ok')
