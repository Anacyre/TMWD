import { durationQuality, isOneShotDuration, playbackFrom, targetDynamics, acceptManifestLoop } from './playback.js'

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
  if ((artic === 'long' || artic === 'sustain') && isOneShotDuration(sample.entry)) return null
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
  const loopBonus = acceptManifestLoop(sample, pb) ? 1.4 : 0
  return pitchScore + dynDelta * 6 + velDelta * 0.04 + (4 - quality) * 0.5 - loopBonus
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

export function pickRanked (samples, spec, artic, midiNote, velocity, dynamics, rrIndex, manifest, extraFilter) {
  const pb = playbackFrom(manifest)
  return pickRoundRobin(ranked(samples, spec, artic, midiNote, velocity, dynamics, pb, extraFilter), rrIndex)
}

export function pickSample (samples, spec, artic, midiNote, velocity, dynamics, rrIndex, manifest) {
  return pickRanked(samples, spec, artic, midiNote, velocity, dynamics, rrIndex, manifest)
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

function estimatePeriod (mono, center, sr) {
  const win = Math.floor(0.10 * sr)
  const minT = Math.max(8, Math.floor(sr / 1400))
  const maxT = Math.min(Math.floor(sr / 45), mono.length - center - win - 2)
  if (maxT <= minT || center < 0) return 0
  let bestT = 0
  let bestC = 0
  for (let t = minT; t <= maxT; t++) {
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < win; i += 2) {
      const a = mono[center + i]
      const b = mono[center + i + t]
      dot += a * b
      na += a * a
      nb += b * b
    }
    const corr = (na < 1e-12 || nb < 1e-12) ? 0 : dot / Math.sqrt(na * nb)
    if (corr > bestC) {
      bestC = corr
      bestT = t
    }
  }
  return bestC >= 0.45 ? bestT : 0
}

function mixMono (audioBuffer) {
  const n = audioBuffer.length
  const chans = audioBuffer.numberOfChannels
  const mono = new Float32Array(n)
  for (let c = 0; c < chans; c++) {
    const data = audioBuffer.getChannelData(c)
    for (let i = 0; i < n; i++) mono[i] += data[i]
  }
  if (chans > 1) {
    const inv = 1 / chans
    for (let i = 0; i < n; i++) mono[i] *= inv
  }
  return mono
}

function correlate (mono, aStart, bStart, count) {
  if (count <= 8) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < count; i += 2) {
    const a = mono[aStart + i]
    const b = mono[bStart + i]
    dot += a * b
    na += a * a
    nb += b * b
  }
  return (na < 1e-12 || nb < 1e-12) ? 0 : dot / Math.sqrt(na * nb)
}

function estimateVibratoPeriod (mono, from, to, sr) {
  const smooth = Math.max(4, Math.floor(sr * 0.010))
  const minT = Math.max(8, Math.floor(sr * 0.12))
  const maxT = Math.min(Math.floor(sr * 0.34), Math.floor((to - from) / 3))
  if (maxT <= minT) return 0
  const env = []
  for (let i = from; i + smooth < to; i += smooth) {
    let sum = 0
    for (let j = 0; j < smooth; j++) sum += Math.abs(mono[i + j])
    env.push(sum / smooth)
  }
  if (env.length < maxT / smooth + 8) return 0
  let bestT = 0
  let bestC = 0
  const win = Math.min(Math.floor(env.length / 2), Math.floor(0.22 * sr / smooth))
  for (let t = Math.floor(minT / smooth); t <= Math.floor(maxT / smooth); t++) {
    if (t <= 0 || win + t >= env.length) continue
    let dot = 0
    let na = 0
    let nb = 0
    for (let i = 0; i < win; i++) {
      const a = env[i]
      const b = env[i + t]
      dot += a * b
      na += a * a
      nb += b * b
    }
    const corr = (na < 1e-12 || nb < 1e-12) ? 0 : dot / Math.sqrt(na * nb)
    if (corr > bestC) {
      bestC = corr
      bestT = t * smooth
    }
  }
  return bestC >= 0.35 ? bestT : 0
}

function alignToPeriod (pos, period, minPos, maxPos) {
  if (period <= 0) return pos
  const cycles = Math.round((pos - minPos) / period)
  const aligned = minPos + cycles * period
  return Math.max(minPos, Math.min(maxPos, aligned))
}

function loopScore (mono, start, end, xfade) {
  if (end - start <= xfade * 2 + 64) return -1
  const boundary = correlate(mono, start, end - xfade, xfade)
  const bodyWin = Math.min(xfade * 2, Math.floor((end - start - xfade * 2) / 2))
  const body = bodyWin >= 64 ? correlate(mono, start + xfade, end - xfade - bodyWin, bodyWin) : boundary
  let dot = 0
  let na = 0
  let nb = 0
  const slopeN = Math.min(128, xfade)
  for (let i = 1; i < slopeN; i += 2) {
    const a = mono[start + i] - mono[start + i - 1]
    const b = mono[end - xfade + i] - mono[end - xfade + i - 1]
    dot += a * b
    na += a * a
    nb += b * b
  }
  const slope = (na < 1e-12 || nb < 1e-12) ? 0 : dot / Math.sqrt(na * nb)
  let rmsA = 0
  let rmsB = 0
  let rmsCount = 0
  for (let i = 0; i < xfade; i += 4) {
    const a = mono[start + i]
    const b = mono[end - xfade + i]
    rmsA += a * a
    rmsB += b * b
    rmsCount++
  }
  rmsA = Math.sqrt(rmsA / Math.max(1, rmsCount))
  rmsB = Math.sqrt(rmsB / Math.max(1, rmsCount))
  const rmsDelta = Math.abs(rmsA - rmsB) / Math.max(rmsA, rmsB, 1e-6)
  return boundary * 0.42 + body * 0.38 + slope * 0.12 - rmsDelta * 0.35
}

function risingZero (mono, pos, span) {
  const n = mono.length
  let best = pos
  let bestDist = span + 1
  for (let i = -span; i <= span; i++) {
    const a = pos + i
    const b = a + 1
    if (a < 1 || b >= n) continue
    if (mono[a] <= 0 && mono[b] > 0 && Math.abs(i) < bestDist) {
      best = b
      bestDist = Math.abs(i)
    }
  }
  return best
}

function bakeEqualPower (audioBuffer, start, end, xfade) {
  const chans = audioBuffer.numberOfChannels
  for (let c = 0; c < chans; c++) {
    const data = audioBuffer.getChannelData(c)
    for (let i = 0; i < xfade; i++) {
      const t = xfade <= 1 ? 1 : i / (xfade - 1)
      const fadeOut = Math.cos(t * Math.PI * 0.5)
      const fadeIn = Math.sin(t * Math.PI * 0.5)
      const dst = end - xfade + i
      data[dst] = data[dst] * fadeOut + data[start + i] * fadeIn
    }
  }
}

/** Bake the short equal-power seam a published loop needs so it wraps without a click.
 * Returns the wrap points in seconds; the expensive loop search stays in the publisher. */
export function bakeLoopSeam (audioBuffer, loopStart, loopEnd, crossfadeSec, maxRatio = 0.1) {
  const sr = audioBuffer.sampleRate
  const start = Math.max(0, Math.min(audioBuffer.length - 2, Math.round(loopStart * sr)))
  const end = Math.max(start + 2, Math.min(audioBuffer.length - 1, Math.round(loopEnd * sr)))
  const maxCrossfade = Math.floor((end - start) * maxRatio)
  const crossfade = Math.max(0, Math.min(maxCrossfade, Math.round((crossfadeSec || 0.08) * sr)))
  if (crossfade > 8) bakeEqualPower(audioBuffer, start, end, crossfade)
  return { loopStart: (start + crossfade) / sr, loopEnd: end / sr, crossfade: crossfade / sr }
}

/** Find a long, correlated sustain loop and bake an equal-power crossfade into the buffer. */
export function prepareLoop (audioBuffer, pb) {
  const sr = audioBuffer.sampleRate
  const n = audioBuffer.length
  const minLoopSec = pb.minLoopSec || 1.45
  const maxLoopSec = pb.maxLoopSec || 3.5
  const xfade = Math.max(256, Math.floor((pb.minCrossfadeMs || 320) * 0.001 * sr))
  const minLoop = Math.max(pb.minLoopSamples || 8192, Math.floor((pb.minLoopSec || 1.45) * sr))
  if (n < minLoop + xfade * 2 + Math.floor(0.35 * sr)) {
    return { loop: false, loopStart: 0, loopEnd: 0, wrapStart: 0 }
  }

  const searchStart = Math.floor(n * (pb.loopSearchStart || 0.28))
  const searchEnd = Math.floor(n * (pb.loopSearchEnd || 0.90))
  const avail = searchEnd - searchStart
  if (avail < minLoop + xfade) return { loop: false, loopStart: 0, loopEnd: 0, wrapStart: 0 }

  const mono = mixMono(audioBuffer)
  const period = estimatePeriod(mono, searchStart + Math.floor(avail * 0.25), sr)
  const vibPeriod = estimateVibratoPeriod(mono, searchStart, searchEnd, sr)
  const alignPeriod = period > 0 && vibPeriod > 0 ? Math.max(period, vibPeriod) : Math.max(period, vibPeriod)
  const lengths = []
  const targetBodies = [pb.loopWindowSec || 2.4, 1.8, 2.2, 2.6, 3.0, 3.4]
  for (const sec of targetBodies) {
    let len = Math.floor(sec * sr)
    if (alignPeriod > 0) {
      const body = Math.max(alignPeriod, Math.round((sec * sr - xfade) / alignPeriod) * alignPeriod)
      len = body + xfade
    }
    if (len >= minLoop && len <= Math.floor(maxLoopSec * sr) && len + xfade < avail) {
      if (!lengths.some((value) => Math.abs(value - len) < Math.max(32, alignPeriod / 2 || 64))) lengths.push(len)
    }
  }
  if (!lengths.length) {
    const len = Math.min(Math.floor(maxLoopSec * sr), avail - xfade)
    if (len >= minLoop) lengths.push(len)
  }
  if (!lengths.length) return { loop: false, loopStart: 0, loopEnd: 0, wrapStart: 0 }

  let best = { score: -1e9, start: 0, end: 0 }
  const hop = alignPeriod > 0 ? Math.max(8, Math.floor(alignPeriod / 8)) : Math.max(64, Math.floor(sr * 0.004))
  const searchRadius = alignPeriod > 0
    ? Math.max(alignPeriod * 3, Math.floor(sr * 0.05))
    : Math.floor(sr * 0.14)

  for (const len of lengths) {
    const start0 = searchEnd - len
    if (start0 < searchStart) continue
    let local = { score: -1e9, start: start0, end: start0 + len }
    const from = Math.max(searchStart, start0 - searchRadius)
    const to = Math.min(searchEnd - minLoop, start0 + searchRadius)
    for (let start = from; start <= to; start += hop) {
      const end = start + len
      if (end + xfade >= n || end > searchEnd + Math.floor(sr * 0.02)) continue
      const score = loopScore(mono, start, end, xfade) + 0.04 * (len / sr)
      if (score > local.score) local = { score, start, end }
    }
    const refineFrom = Math.max(searchStart, local.start - Math.max(128, alignPeriod))
    const refineTo = Math.min(n - len - xfade - 2, local.start + Math.max(128, alignPeriod))
    for (let start = refineFrom; start <= refineTo; start++) {
      const end = start + len
      if (end + xfade >= n) continue
      const score = loopScore(mono, start, end, xfade) + 0.04 * (len / sr)
      if (score > local.score) local = { score, start, end }
    }
    if (local.score > best.score) best = local
  }

  const minCorr = pb.minLoopCorrelation != null ? pb.minLoopCorrelation : 0.38
  if (best.score < minCorr) return { loop: false, loopStart: 0, loopEnd: 0, wrapStart: 0 }

  let snappedStart = risingZero(mono, best.start, Math.floor(0.012 * sr))
  if (alignPeriod > 0) {
    snappedStart = alignToPeriod(
      snappedStart,
      alignPeriod,
      Math.max(searchStart, best.start - alignPeriod),
      Math.min(searchEnd - (best.end - best.start) - xfade, best.start + alignPeriod)
    )
  }
  const snappedEnd = snappedStart + (best.end - best.start)
  if (snappedEnd < n - 2 && loopScore(mono, snappedStart, snappedEnd, xfade) >= best.score - 0.05) {
    best.start = snappedStart
    best.end = snappedEnd
  }

  bakeEqualPower(audioBuffer, best.start, best.end, xfade)
  const wrapStart = (best.start + xfade) / sr
  return {
    loop: true,
    loopStart: wrapStart,
    loopEnd: best.end / sr,
    wrapStart,
    crossfade: xfade / sr,
    score: best.score
  }
}

export function findLoopPoints (channelData, sampleRate, pb) {
  const n = channelData.length
  const fake = {
    length: n,
    sampleRate,
    numberOfChannels: 1,
    getChannelData: () => channelData
  }
  return prepareLoop(fake, pb)
}

/** Split a decoded one-shot into a loud sustain (loopable) and a quiet release tail. */
export function splitSustainRelease (channelData, sampleRate, options = {}) {
  const data = channelData || new Float32Array(0)
  const sr = Math.max(1, sampleRate || 44100)
  const n = data.length
  const duration = n / sr
  const empty = { loop: false, loopStart: 0, loopEnd: 0, releaseStart: 0, sustainStart: 0, sustainEnd: 0 }
  if (n < sr * 0.25) return empty

  const win = Math.max(64, Math.round((options.windowSec || 0.02) * sr))
  const hop = Math.max(32, Math.floor(win / 2))
  const frames = []
  let peak = 1e-8
  for (let i = 0; i + win <= n; i += hop) {
    let sum = 0
    for (let j = 0; j < win; j++) sum += data[i + j] * data[i + j]
    const rms = Math.sqrt(sum / win)
    frames.push({ t: i / sr, rms })
    if (rms > peak) peak = rms
  }
  if (!frames.length) return empty

  const thresh = peak * (options.floor || 0.35)
  const quiet = peak * (options.quietFloor || 0.22)
  const skip = options.attackSkipSec != null ? options.attackSkipSec : 0.08
  let first = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].rms >= thresh && frames[i].t >= skip) { first = i; break }
  }
  let last = first
  for (let i = first; i < frames.length; i++) {
    if (frames[i].rms >= thresh) last = i
    if (frames[i].rms < quiet && frames[i].t > frames[first].t + 0.35) {
      let stays = true
      const until = Math.min(frames.length, i + 6)
      for (let j = i; j < until; j++) {
        if (frames[j].rms > thresh) { stays = false; break }
      }
      if (stays) {
        last = Math.max(first, i - 1)
        break
      }
    }
  }
  const sustainStart = frames[first].t
  const sustainEnd = Math.min(duration, frames[last].t + win / sr)
  const body = sustainEnd - sustainStart
  const minLoop = options.minLoopSec != null ? options.minLoopSec : 0.45
  const loopStart = sustainStart + Math.min(0.18, body * 0.08)
  const loopEnd = Math.max(loopStart + minLoop, sustainEnd - 0.04)
  const canLoop = body >= minLoop && (loopEnd - loopStart) >= minLoop && loopEnd < duration - 0.02
  const releaseStart = Math.min(duration, Math.max(loopEnd, sustainEnd))
  return {
    loop: canLoop,
    loopStart: canLoop ? loopStart : 0,
    loopEnd: canLoop ? Math.min(loopEnd, duration) : 0,
    releaseStart,
    sustainStart,
    sustainEnd
  }
}
