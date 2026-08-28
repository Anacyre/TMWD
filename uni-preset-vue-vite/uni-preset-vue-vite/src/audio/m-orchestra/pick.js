import { durationQuality, playbackFrom, targetDynamics } from './playback.js'

function matchesPack (sample, spec) {
  if (!sample || !spec || sample.pack !== spec.pack) return false
  const folder = spec.percFolder ? String(spec.percFolder).toLowerCase() + '/' : ''
  if (folder && !String(sample.entry || '').toLowerCase().startsWith(folder)) return false
  return true
}

function noteDelta (sample, midiNote) {
  return sample.unpitched ? 0 : Math.abs((sample.rootNote || 60) - midiNote)
}

function inNoteRange (sample, midiNote) {
  if (sample.unpitched) return true
  const min = sample.minNote != null ? sample.minNote : Math.max(0, (sample.rootNote || 60) - 4)
  const max = sample.maxNote != null ? sample.maxNote : Math.min(127, (sample.rootNote || 60) + 4)
  return midiNote >= min && midiNote <= max
}

export function scoreSample (sample, spec, artic, midiNote, velocity, dynamics, pb) {
  if (!matchesPack(sample, spec) || sample.articulation !== artic) return null
  const stretch = pb.maxStretchSemitones || 4
  const delta = noteDelta(sample, midiNote)
  if (!sample.unpitched && delta > stretch) return null
  const quality = durationQuality(sample.entry, artic)
  if ((artic === 'short') && quality < 2) return null
  const ranged = inNoteRange(sample, midiNote)
  const target = targetDynamics(dynamics, velocity, pb.dynamicsVelocityMix)
  const dynDelta = Math.abs((sample.dynamicLayer || 64) - target) / 127
  let velDelta = 0
  const vmin = sample.velocityMin != null ? sample.velocityMin : 0
  const vmax = sample.velocityMax != null ? sample.velocityMax : 127
  if (velocity < vmin) velDelta = vmin - velocity
  else if (velocity > vmax) velDelta = velocity - vmax
  const pitchScore = ranged ? delta * 2 : delta * 8 + 24
  return pitchScore + dynDelta * 6 + velDelta * 0.04 + (4 - quality) * 0.5
}

function ranked (samples, spec, artic, midiNote, velocity, dynamics, pb, extraFilter) {
  const rankedList = []
  for (const sample of samples || []) {
    if (extraFilter && !extraFilter(sample)) continue
    const score = scoreSample(sample, spec, artic, midiNote, velocity, dynamics, pb)
    if (score == null) continue
    rankedList.push({ sample, score })
  }
  rankedList.sort((a, b) => a.score - b.score || String(a.sample.entry).localeCompare(String(b.sample.entry)))
  return rankedList
}

function pickRoundRobin (rankedList, rrIndex) {
  if (!rankedList.length) return null
  const best = rankedList[0]
  const pool = rankedList.filter((item) =>
    item.sample.rootNote === best.sample.rootNote
    && item.sample.dynamicLayer === best.sample.dynamicLayer
    && item.score <= best.score + 0.35)
  const list = pool.length ? pool : [best]
  return list[Math.abs(rrIndex || 0) % list.length].sample
}

export function pickSample (samples, spec, artic, midiNote, velocity, dynamics, rrIndex, manifest) {
  const pb = playbackFrom(manifest)
  return pickRoundRobin(ranked(samples, spec, artic, midiNote, velocity, dynamics, pb), rrIndex)
}

export function pickLayer (samples, spec, artic, midiNote, velocity, dynamics, excludeLayer, rrIndex, manifest) {
  const pb = playbackFrom(manifest)
  const list = ranked(samples, spec, artic, midiNote, velocity, dynamics, pb, (sample) => {
    if (excludeLayer == null) return true
    return sample.dynamicLayer !== excludeLayer
  })
  const sameRoot = list.filter((item) => item.sample.unpitched || item.sample.rootNote === midiNote
    || Math.abs(item.sample.rootNote - midiNote) <= 1)
  return pickRoundRobin(sameRoot.length ? sameRoot : list, rrIndex)
}

export function pickNeighbor (samples, spec, artic, midiNote, velocity, dynamics, excludeRoot, rrIndex, manifest) {
  const pb = playbackFrom(manifest)
  const list = ranked(samples, spec, artic, midiNote, velocity, dynamics, pb, (sample) => {
    if (sample.unpitched) return false
    if (excludeRoot == null) return sample.rootNote !== midiNote
    return sample.rootNote !== excludeRoot
  })
  return pickRoundRobin(list, rrIndex)
}

export function findLoopPoints (channelData, sampleRate, pb) {
  const n = channelData.length
  const minLoop = pb.minLoopSamples || 2048
  if (n < minLoop * 2) return { loop: false, loopStart: 0, loopEnd: 0 }
  const searchStart = Math.floor(n * (pb.loopSearchStart || 0.35))
  const searchEnd = Math.floor(n * (pb.loopSearchEnd || 0.85))
  const window = Math.max(256, Math.min(searchEnd - searchStart, Math.floor((pb.loopWindowSec || 0.3) * sampleRate)))
  if (window < minLoop || searchEnd - searchStart < window) return { loop: false, loopStart: 0, loopEnd: 0 }
  const hop = Math.max(32, Math.floor(window / 8))
  let bestEnergy = Infinity
  let bestStart = searchStart
  for (let i = searchStart; i + window < searchEnd; i += hop) {
    let energy = 0
    for (let s = 0; s < window; s += 4) {
      const v = channelData[i + s]
      energy += v * v
    }
    if (energy < bestEnergy) {
      bestEnergy = energy
      bestStart = i
    }
  }
  const zcSpan = Math.floor(0.02 * sampleRate)
  const findZc = (pos) => {
    for (let i = 0; i < zcSpan; i++) {
      const a = pos + i
      const b = a + 1
      if (b >= n) break
      if (channelData[a] <= 0 && channelData[b] >= 0) return b
    }
    return pos
  }
  let loopStart = findZc(bestStart)
  let loopEnd = findZc(Math.min(n - 2, bestStart + window))
  if (loopEnd <= loopStart + minLoop) loopEnd = Math.min(n - 2, loopStart + window)
  let xfade = Math.max(64, Math.floor((pb.minCrossfadeMs || 80) * 0.001 * sampleRate))
  xfade = Math.min(xfade, Math.floor((loopEnd - loopStart) / 4))
  let rms = 0
  let count = 0
  for (let i = loopStart; i < loopEnd; i += 8) {
    rms += channelData[i] * channelData[i]
    count++
  }
  rms = Math.sqrt(rms / Math.max(1, count))
  if (loopEnd - loopStart < minLoop || rms > (pb.maxLoopRms || 0.55)) {
    return { loop: false, loopStart: 0, loopEnd: 0 }
  }
  return {
    loop: true,
    loopStart: loopStart / sampleRate,
    loopEnd: loopEnd / sampleRate,
    crossfade: xfade / sampleRate
  }
}
