/** Shared M Orchestra playback contract. Keep in sync with library.json "playback". */

export const PLAYBACK = {
  maxStretchSemitones: 4,
  dynamicsVelocityMix: 0.35,
  minCrossfadeMs: 120,
  loopSearchStart: 0.28,
  loopSearchEnd: 0.90,
  loopWindowSec: 2.4,
  maxLoopRms: 0.90,
  minLoopSamples: 8192,
  minLoopSec: 1.45,
  maxLoopSec: 3.5,
  minLoopCorrelation: 0.38,
  releaseLongSec: 0.45,
  releaseShortSec: 0.12,
  releaseHitSec: 0.08,
  sectionDetuneCents: 2.0,
  soloDetuneCents: 0.8,
  cutoffMinHz: 7000,
  cutoffSpanHz: 12000,
  noiseAmount: 0.0004,
  noiseHpHz: 2200,
  vibratoDepthSemis: 0.12,
  vibratoGate: 0.12,
  maxSources: 1
}

export function playbackFrom (manifest) {
  const raw = manifest && manifest.playback
  if (!raw || typeof raw !== 'object') return { ...PLAYBACK }
  return { ...PLAYBACK, ...raw }
}

export function durationQuality (entry, artic) {
  const lower = String(entry || '').toLowerCase()
  if (artic === 'short') {
    if (lower.includes('_025_')) return 3
    if (lower.includes('_05_')) return 2
    return 0
  }
  if (artic === 'pluck') {
    if (lower.includes('_025_')) return 3
    if (lower.includes('_05_')) return 2
    return 1
  }
  if (lower.includes('very-long')) return 4
  if (lower.includes('_long_')) return 3
  if (lower.includes('_15_')) return 2
  if (lower.includes('_1_')) return 1
  return 0
}

export function classifyArticulation (duration, artic, percussion) {
  if (percussion) return 'hit'
  const a = String(artic || '').toLowerCase()
  if (a.includes('pizz') && !a.includes('gliss')) return 'pluck'
  if (a.includes('tremolo')) return 'sustain'
  if (a.includes('stacc') || a.includes('spicc')) return 'short'
  const d = String(duration || '').toLowerCase()
  if (d === '025' || d === '05') return 'short'
  return 'long'
}

export function sampleArticulation (sample) {
  if (!sample) return 'long'
  const entry = String(sample.entry || '').toLowerCase()
  if (entry.includes('pizz') && !entry.includes('gliss')) return 'pluck'
  if (entry.includes('tremolo')) return 'sustain'
  if (entry.includes('stacc') || entry.includes('spicc') || entry.includes('_025_') || entry.includes('_05_')) {
    if (sample.articulation === 'hit') return 'hit'
    if (entry.includes('_025_') || entry.includes('_05_') || entry.includes('stacc') || entry.includes('spicc')) {
      if (entry.includes('pizz')) return 'pluck'
      return 'short'
    }
  }
  return sample.articulation || 'long'
}

export function targetDynamics (cc1, velocity, mix = PLAYBACK.dynamicsVelocityMix) {
  const dyn = Math.max(1, Math.min(127, cc1 || 100))
  const vel = Math.max(1, Math.min(127, velocity || 100))
  return Math.max(1, Math.min(127, Math.round(dyn * (1 - mix) + vel * mix)))
}
