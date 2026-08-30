import { findLoopPoints, pickRanked, scoreSample } from './pick.js'
import { durationQuality, isOneShotDuration, PLAYBACK } from './playback.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

function sineBuffer (seconds, hz, sampleRate = 44100) {
  const n = Math.floor(seconds * sampleRate)
  const data = new Float32Array(n)
  for (let i = 0; i < n; i++) data[i] = Math.sin(2 * Math.PI * hz * i / sampleRate) * 0.4
  return { data, sampleRate }
}

{
  assert(isOneShotDuration('violin_C4_1_mf_arco-normal.wav'), '_1_ is a one-shot')
  assert(!isOneShotDuration('violin_C4_15_mf_arco-normal.wav'), '_15_ is not a one-shot')
  assert(durationQuality('violin_C4_15_mf.wav', 'long') === 3, '_15_ ranks above _1_')
  assert(durationQuality('violin_C4_very-long_mf.wav', 'long') === 4, 'very-long is preferred')
  assert(durationQuality('violin_C4_1_mf.wav', 'long') === 0, '_1_ is not used as a sustain')
}

{
  const samples = [
    { pack: 'strings', entry: 'vln_C4_1_mf.wav', articulation: 'long', rootNote: 60, dynamicLayer: 64 },
    { pack: 'strings', entry: 'vln_C4_15_mf.wav', articulation: 'long', rootNote: 60, dynamicLayer: 64 },
    { pack: 'strings', entry: 'vln_C4_very-long_mf.wav', articulation: 'long', rootNote: 60, dynamicLayer: 64 }
  ]
  const spec = { pack: 'strings' }
  assert(scoreSample(samples[0], spec, 'long', 60, 100, 100, PLAYBACK) == null, 'one-shot dropped from long pick')
  const picked = pickRanked(samples, spec, 'long', 60, 100, 100, 0, { playback: PLAYBACK })
  assert(picked && picked.entry.includes('very-long'), 'pickRanked prefers very-long over _15_')
}

{
  const { data, sampleRate } = sineBuffer(6, 220)
  const found = findLoopPoints(data, sampleRate, PLAYBACK)
  assert(found.loop, 'a stable sine finds a loop')
  assert(found.loopEnd - found.loopStart >= PLAYBACK.minLoopSec, 'loop meets minLoopSec')
  assert(found.score >= PLAYBACK.minLoopCorrelation, 'loop score meets the native threshold')
}

{
  const { data, sampleRate } = sineBuffer(0.4, 220)
  const found = findLoopPoints(data, sampleRate, PLAYBACK)
  assert(!found.loop, 'a buffer shorter than minLoopSec is rejected')
}

console.log('m-orchestra loop ok')
