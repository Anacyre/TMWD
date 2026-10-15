import { clipPlaybackNotes, buildClipPreview } from './playlist-model.js'

const PPQ = 960
const note = (id, pitch, startBeat, beats, extra = {}) => ({
  id, pitch, startTick: startBeat * PPQ, durationTick: beats * PPQ, velocity: 100, ...extra
})

// Looped clip: a 2-beat source tiled across 6 beats.
const looped = {
  id: 1,
  lengthBeats: 6,
  loopLengthBeats: 2,
  notes: [note(1, 60, 0, 1), note(2, 64, 1.5, 2)]
}
const played = clipPlaybackNotes(looped)
const starts = played.filter((item) => item.pitch === 60).map((item) => item.start)
if (starts.join(',') !== '0,2,4') throw new Error('looped clip should repeat the source: ' + starts.join(','))
const tail = played.find((item) => item.pitch === 64)
if (Math.abs(tail.duration - 0.5) > 1e-9) throw new Error('notes are cropped at the loop source edge')

// Short clip without a loop crops notes past its end.
const cropped = clipPlaybackNotes({ id: 2, lengthBeats: 3, notes: [note(1, 60, 0, 1), note(2, 62, 2.5, 4), note(3, 65, 3.5, 1)] })
if (cropped.length !== 2) throw new Error('notes after the clip end must not play')
if (Math.abs(cropped[1].duration - 0.5) > 1e-9) throw new Error('note crossing the clip end is shortened')

// Repeat-mode notes expand into slices; muted notes stay silent.
const repeated = clipPlaybackNotes({ id: 3, lengthBeats: 4, notes: [note(1, 60, 0, 2, { repeatMode: 4 }), note(2, 72, 0, 1, { muted: true })] })
if (repeated.length !== 4) throw new Error('1/8 repeat over 2 beats should give 4 slices, got ' + repeated.length)
if (repeated.some((item) => item.pitch === 72)) throw new Error('muted notes must not play')
if (new Set(repeated.map((item) => item.key)).size !== repeated.length) throw new Error('slice keys must be unique')

// The preview draws exactly what plays, positioned over the arranged length.
const preview = buildClipPreview(looped)
if (preview.bars.length !== played.length) throw new Error('preview and playback disagree on note count')
preview.bars.forEach((bar, i) => {
  const item = played[i]
  if (Math.abs(bar.x0 - item.start / 6) > 1e-9) throw new Error('preview bar start differs from playback')
  if (Math.abs(bar.x1 - (item.start + item.duration) / 6) > 1e-9) throw new Error('preview bar end differs from playback')
})

console.log('clip-playback ok')
