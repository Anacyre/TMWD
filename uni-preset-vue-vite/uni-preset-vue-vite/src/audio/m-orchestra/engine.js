import JSZip from 'jszip'
import { publicOrchestraUrl } from '../../lib/supabase.js'
import bundled from './manifest.json'
import { playbackFrom } from './playback.js'
import { pickLayer, pickSample as pickFromManifest } from './pick.js'
import { AsyncLimiter, AudioBufferLru, readEncodedSample, writeEncodedSample } from './sample-cache.js'

const TECHNIQUE_ARTIC = {
  m_orch_long: 'long',
  m_orch_short: 'short',
  m_orch_hit: 'hit',
  m_orch_pizz: 'pluck',
  m_orch_trem: 'sustain'
}

let manifest = bundled
let loadPromise = null
const zipCache = new Map()
const bufferCache = new AudioBufferLru(96 * 1024 * 1024)
const decodePromises = new Map()
const decodeQueue = new AsyncLimiter(2)
const voices = new Map()
const pending = new Map()
const rrCounters = new Map()
let noteEpoch = 0
const profile = {
  noteCount: 0,
  cacheHits: 0,
  idbHits: 0,
  networkFetches: 0,
  zipFallbacks: 0,
  fetchMs: 0,
  decodeMs: 0,
  loopMs: 0,
  noteReadyMs: 0,
  maxNoteReadyMs: 0
}

function nowMs () {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

export function getLoadDiagnostics () {
  return {
    ...profile,
    decodedMb: Math.round(bufferCache.bytes / 10485.76) / 100,
    decodeActive: decodeQueue.active,
    decodePending: decodeQueue.pending
  }
}

export function resetLoadDiagnostics () {
  Object.keys(profile).forEach((key) => { profile[key] = 0 })
}

function pb () {
  return playbackFrom(manifest)
}

export function findInstrument (definitionId) {
  const list = (manifest && manifest.instruments) || []
  return list.find((item) => item.id === definitionId) || null
}

export function articForTrack (track, spec) {
  const mapped = TECHNIQUE_ARTIC[track && track.techniqueId]
  if (mapped) return mapped
  const arts = (spec && spec.articulations) || ['long']
  return arts[0] || 'long'
}

export function dynamicsForTrack (track) {
  const values = (track && track.controllerValues) || {}
  const raw = values.dynamics
  if (raw == null) return 100
  return raw > 1 ? Math.round(raw) : Math.round(raw * 127)
}

export function expressionForTrack (track) {
  const values = (track && track.controllerValues) || {}
  const raw = values.expression
  if (raw == null) return 100
  return raw > 1 ? raw / 127 : raw
}

export function vibratoForTrack (track) {
  const values = (track && track.controllerValues) || {}
  const raw = values.vibrato
  if (raw == null) return 0.35
  return raw > 1 ? raw / 127 : raw
}

function samples () {
  return (manifest && manifest.samples) || []
}

export function pickSample (spec, artic, midiNote, dynamics, velocity = 100, rrIndex = 0) {
  return pickFromManifest(samples(), spec, artic, midiNote, velocity, dynamics, rrIndex, manifest)
}

function nextRr (specId, artic, note) {
  const key = specId + ':' + artic + ':' + note
  const n = (rrCounters.get(key) || 0) + 1
  rrCounters.set(key, n)
  return n
}

function isSustaining (artic) {
  return artic === 'long' || artic === 'sustain'
}

function releaseSec (artic, rules) {
  if (artic === 'hit') return rules.releaseHitSec
  if (artic === 'short' || artic === 'pluck') return rules.releaseShortSec
  return rules.releaseLongSec
}

async function fetchZip (pack) {
  if (zipCache.has(pack)) return zipCache.get(pack)
  const pending = (async () => {
    const response = await fetch(publicOrchestraUrl(pack + '.zip'))
    if (!response.ok) throw new Error('pack ' + pack + ' ' + response.status)
    return JSZip.loadAsync(await response.arrayBuffer())
  })()
  zipCache.set(pack, pending)
  try {
    return await pending
  } catch (err) {
    zipCache.delete(pack)
    throw err
  }
}

async function fetchSampleBytes (sample) {
  const objectPath = sample.objectPath || `samples/${sample.pack}/${sample.entry}`
  const cacheKey = objectPath
  const cached = await readEncodedSample(cacheKey)
  if (cached) {
    profile.idbHits += 1
    return cached
  }

  const started = nowMs()
  if (objectPath) {
    const response = await fetch(publicOrchestraUrl(objectPath))
    if (response.ok) {
      const bytes = await response.arrayBuffer()
      profile.fetchMs += nowMs() - started
      profile.networkFetches += 1
      writeEncodedSample(cacheKey, bytes.slice(0)).catch(() => {})
      return bytes
    }
  }

  profile.zipFallbacks += 1
  const zip = await fetchZip(sample.pack)
  const file = zip.file(sample.entry)
  if (!file) throw new Error('missing ' + sample.entry)
  const bytes = await file.async('arraybuffer')
  profile.fetchMs += nowMs() - started
  writeEncodedSample(cacheKey, bytes.slice(0)).catch(() => {})
  return bytes
}

/** Applies only the short equal-power seam described by the manifest. The expensive
 * loop search is performed by the publisher, never while transport is running. */
function applyManifestLoop (audio, sample) {
  if (!sample.loop) {
    return { loop: false, loopStart: 0, loopEnd: 0 }
  }
  const started = nowMs()
  const sr = audio.sampleRate
  const duration = audio.duration || (audio.length / sr)
  const loopStart = sample.loopEnd > sample.loopStart ? sample.loopStart : Math.max(0.18, duration * 0.28)
  const loopEnd = sample.loopEnd > sample.loopStart
    ? sample.loopEnd
    : Math.min(duration - 0.08, loopStart + Math.min(3.2, Math.max(1.15, duration * 0.52)))
  if (loopEnd - loopStart < 0.8) return { loop: false, loopStart: 0, loopEnd: 0 }
  const start = Math.max(0, Math.min(audio.length - 2, Math.round(loopStart * sr)))
  const end = Math.max(start + 2, Math.min(audio.length - 1, Math.round(loopEnd * sr)))
  const maxCrossfade = Math.floor((end - start) * 0.1)
  const crossfade = Math.max(0, Math.min(maxCrossfade, Math.round((sample.crossfadeSec || 0.08) * sr)))
  if (crossfade > 8) {
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const data = audio.getChannelData(channel)
      for (let i = 0; i < crossfade; i++) {
        const t = i / Math.max(1, crossfade - 1)
        const fadeOut = Math.cos(t * Math.PI * 0.5)
        const fadeIn = Math.sin(t * Math.PI * 0.5)
        data[end - crossfade + i] = data[end - crossfade + i] * fadeOut + data[start + i] * fadeIn
      }
    }
  }
  profile.loopMs += nowMs() - started
  return { loop: true, loopStart: (start + crossfade) / sr, loopEnd: end / sr }
}

async function decodeSample (context, sample, priority = true) {
  const key = sample.pack + '|' + sample.entry + '|object-v2'
  const cached = bufferCache.get(key)
  if (cached) {
    profile.cacheHits += 1
    return cached
  }
  if (decodePromises.has(key)) return decodePromises.get(key)

  const promise = decodeQueue.run(async () => {
    const bytes = await fetchSampleBytes(sample)
    const started = nowMs()
    const audio = await context.decodeAudioData(bytes.slice(0))
    profile.decodeMs += nowMs() - started
    const loopInfo = applyManifestLoop(audio, sample)
    const decoded = {
      audio,
      loop: !!loopInfo.loop,
      loopStart: loopInfo.loopStart || 0,
      loopEnd: loopInfo.loopEnd || 0,
      rootNote: sample.rootNote,
      unpitched: !!sample.unpitched,
      dynamicLayer: sample.dynamicLayer,
      key
    }
    bufferCache.set(key, decoded)
    return decoded
  }, priority)
  decodePromises.set(key, promise)
  try {
    return await promise
  } finally {
    decodePromises.delete(key)
  }
}

function prefetchSilent (context, spec, artic, pitch, velocity, dynamics) {
  if (decodeQueue.pending > 2) return pb()
  const rules = pb()
  const list = [
    pickFromManifest(samples(), spec, artic, pitch, velocity, dynamics, 0, manifest),
    pickLayer(samples(), spec, artic, pitch, velocity, dynamics, -1, 1, manifest)
  ]
  for (const offset of [-1, 1]) {
    list.push(pickFromManifest(samples(), spec, artic, pitch + offset, velocity, dynamics, 0, manifest))
  }
  list.filter(Boolean).slice(0, 3).forEach((sample) => {
    decodeSample(context, sample, false).catch(() => {})
  })
  return rules
}

export async function ensureManifest () {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const response = await fetch(publicOrchestraUrl('manifest.json'))
      if (response.ok) {
        const remote = await response.json()
        const bundledCount = ((bundled && bundled.samples) || []).length
        const remoteCount = ((remote && remote.samples) || []).length
        const bundledReady = !!(bundled && bundled.playback)
        const remoteReady = !!(remote && remote.playback)
        const bundledFormat = Number(bundled && bundled.formatVersion) || 1
        const remoteFormat = Number(remote && remote.formatVersion) || 1
        if (remoteReady && remoteCount >= bundledCount && remoteFormat >= bundledFormat) manifest = remote
        else if (!bundledReady) manifest = remote
      }
    } catch (err) {
      console.warn('[m-orchestra] using bundled manifest', err)
    }
    bufferCache.setBudgetMb(Math.min(96, (manifest && manifest.cacheBudgetMb) || 96))
    return manifest
  })()
  return loadPromise
}

export function sampleCount () {
  return (manifest && manifest.sampleCount) || ((manifest && manifest.samples) || []).length
}

function voiceKey (trackId, pitch, id) {
  return String(trackId || 0) + ':' + pitch + ':' + (id || pitch)
}

function resolveVoiceKeys (pitchOrKey, trackId) {
  const keys = new Set()
  if (typeof pitchOrKey === 'string') {
    if (voices.has(pitchOrKey)) keys.add(pitchOrKey)
    if (pending.has(pitchOrKey)) keys.add(pitchOrKey)
    voices.forEach((_, key) => {
      const parts = key.split(':')
      if (parts.length >= 3 && parts.slice(2).join(':') === pitchOrKey) keys.add(key)
    })
    pending.forEach((_, key) => {
      const parts = key.split(':')
      if (parts.length >= 3 && parts.slice(2).join(':') === pitchOrKey) keys.add(key)
    })
  } else {
    const pitch = pitchOrKey
    const prefix = String(trackId || 0) + ':' + pitch + ':'
    voices.forEach((_, key) => {
      if (key.startsWith(prefix)) keys.add(key)
    })
    pending.forEach((_, key) => {
      if (key.startsWith(prefix)) keys.add(key)
    })
  }
  return Array.from(keys)
}

function cancelPendingKeys (keys) {
  keys.forEach((key) => {
    const entry = pending.get(key)
    if (entry) entry.cancelled = true
  })
}

export function cancelPending (pitchOrKey, trackId) {
  cancelPendingKeys(resolveVoiceKeys(pitchOrKey, trackId))
}

function releaseVoice (key) {
  const voice = voices.get(key)
  if (!voice) return
  const now = voice.gain.context.currentTime
  const rules = pb()
  const release = releaseSec(voice.artic, rules)
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setTargetAtTime(0, now, Math.max(0.03, release / 3))
  if (voice.filter) {
    voice.filter.frequency.cancelScheduledValues(now)
    voice.filter.frequency.setTargetAtTime(rules.cutoffMinHz * 0.55, now, Math.max(0.04, release / 3))
  }
  const holdMs = Math.round(release * 1000 + 80)
  setTimeout(() => {
    voice.sources.forEach((src) => { try { src.stop() } catch (err) { /* ended */ } })
    ;(voice.lfos || []).forEach((osc) => { try { osc.stop() } catch (err) { /* ended */ } })
    try { voice.gain.disconnect() } catch (err) { /* already */ }
    try { voice.filter && voice.filter.disconnect() } catch (err) { /* already */ }
  }, holdMs)
  voices.delete(key)
}

function orchestraDest (graph) {
  if (!graph) return null
  return graph.samplerGain || graph.master || graph.context.destination
}

const noiseBuffers = new WeakMap()

function makeNoiseBuffer (context) {
  if (noiseBuffers.has(context)) return noiseBuffers.get(context)
  const length = Math.max(1, Math.floor(context.sampleRate * 0.35))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
  noiseBuffers.set(context, buffer)
  return buffer
}

function cutoffHz (spec, track, velocity, rules) {
  const dyn01 = Math.max(0, Math.min(1, dynamicsForTrack(track) / 127))
  const gamma = spec && spec.gamma ? spec.gamma : 1.35
  const dynamics = Math.pow(dyn01, gamma)
  return rules.cutoffMinHz + rules.cutoffSpanHz * dynamics * (0.7 + 0.3 * Math.max(0.05, velocity))
}

function layerMix (voice, track) {
  if (!voice.dualLayer) return { a: 1, b: 0 }
  const dyn01 = Math.max(0, Math.min(1, dynamicsForTrack(track) / 127))
  const a = voice.dynLayerA / 127
  const b = voice.dynLayerB / 127
  if (Math.abs(b - a) < 0.02) return { a: 0.5, b: 0.5 }
  const mixB = Math.max(0, Math.min(1, (dyn01 - a) / (b - a)))
  return { a: 1 - mixB, b: mixB }
}

export function applyControllers (track) {
  if (!track) return
  const rules = pb()
  const spec = findInstrument(track.definitionId)
  const expr = Math.max(0.15, expressionForTrack(track))
  const vib = vibratoForTrack(track)
  voices.forEach((voice) => {
    if (!voice || voice.trackId !== track.id) return
    const ctx = voice.gain.context
    const now = ctx.currentTime
    const vel = voice.velocity || 0.8
    const dyn01 = Math.max(0, Math.min(1, dynamicsForTrack(track) / 127))
    const gamma = spec && spec.gamma ? spec.gamma : 1.35
    const dynamics = Math.pow(dyn01, gamma)
    const sustain = (0.28 + 0.72 * dynamics) * (0.55 + 0.45 * vel) * expr * (spec && spec.solo ? 0.9 : 0.55)
    voice.gain.gain.setTargetAtTime(Math.max(0.02, sustain), now, 0.04)
    if (voice.filter) {
      voice.filter.frequency.setTargetAtTime(cutoffHz(spec, track, vel, rules), now, 0.04)
    }
    const mix = layerMix(voice, track)
    if (voice.layerGainA) voice.layerGainA.gain.setTargetAtTime(mix.a, now, 0.05)
    if (voice.layerGainB) voice.layerGainB.gain.setTargetAtTime(mix.b, now, 0.05)
    if (voice.lfoGain) {
      const gated = vib >= rules.vibratoGate && isSustaining(voice.artic)
      const depth = gated
        ? ((vib - rules.vibratoGate) / Math.max(0.001, 1 - rules.vibratoGate)) * rules.vibratoDepthSemis
        : 0
      const rate = voice.baseRate || 1
      voice.lfoGain.gain.setTargetAtTime(rate * (Math.pow(2, depth / 12) - 1), now, 0.06)
    }
  })
}

function attachLayerWhenReady (context, key, layer, track, spec, pitch, rules) {
  if (!layer) return
  decodeSample(context, layer, false).then((decoded) => {
    const voice = voices.get(key)
    if (!voice) return
    const src = context.createBufferSource()
    src.buffer = decoded.audio
    const pan = context.createStereoPanner()
    pan.pan.value = (spec.sectionSize || 1) > 1 ? 0.22 : 0
    const semitones = decoded.unpitched
      ? 0
      : Math.max(-rules.maxStretchSemitones, Math.min(rules.maxStretchSemitones, pitch - decoded.rootNote))
    src.playbackRate.value = Math.pow(2, semitones / 12)
    if (decoded.loop && decoded.loopEnd - decoded.loopStart > 0.8) {
      src.loop = true
      src.loopStart = decoded.loopStart
      src.loopEnd = decoded.loopEnd
    }
    src.connect(pan)
    pan.connect(voice.layerGainB)
    const now = context.currentTime
    voice.dualLayer = true
    voice.dynLayerB = layer.dynamicLayer
    const mix = layerMix(voice, track)
    voice.layerGainA.gain.setTargetAtTime(mix.a, now, 0.045)
    voice.layerGainB.gain.setValueAtTime(0, now)
    voice.layerGainB.gain.setTargetAtTime(mix.b, now, 0.045)
    src.start()
    voice.sources.push(src)
  }).catch(() => {})
}

export async function noteOn (graph, track, pitch, velocity = 0.8, id) {
  if (!graph || !track) return null
  const noteStarted = nowMs()
  profile.noteCount += 1
  if (graph.context.state === 'suspended') {
    try { await graph.context.resume() } catch (err) { /* autoplay policy */ }
  }
  const key = voiceKey(track.id, pitch, id)
  const epoch = noteEpoch
  pending.set(key, { cancelled: false, epoch })
  await ensureManifest()
  const spec = findInstrument(track.definitionId)
  if (!spec) {
    pending.delete(key)
    return null
  }
  const artic = articForTrack(track, spec)
  const rules = pb()
  const dynamics = dynamicsForTrack(track)
  const velocityMidi = Math.round(Math.max(0.05, velocity) * 127)
  const rr = nextRr(spec.id, artic, pitch)
  const primary = pickFromManifest(samples(), spec, artic, pitch, velocityMidi, dynamics, rr, manifest)
  if (!primary) {
    pending.delete(key)
    return null
  }

  const layer = isSustaining(artic)
    ? pickLayer(samples(), spec, artic, pitch, velocityMidi, dynamics, primary.dynamicLayer, rr + 1, manifest)
    : null
  const secondaryLayer = layer && layer.entry !== primary.entry ? layer : null
  const dual = false
  const refs = [primary]
  const decodedList = []
  for (const ref of refs) {
    try {
      decodedList.push({ ref, decoded: await decodeSample(graph.context, ref) })
    } catch (err) {
      console.warn('[m-orchestra] decode', err)
    }
  }
  if (!decodedList.length) {
    pending.delete(key)
    return null
  }

  const pend = pending.get(key)
  if (!pend || pend.cancelled || pend.epoch !== noteEpoch) {
    pending.delete(key)
    return null
  }
  pending.delete(key)

  prefetchSilent(graph.context, spec, artic, pitch, velocityMidi, dynamics)
  if (voices.has(key)) releaseVoice(key)
  resolveVoiceKeys(id || pitch, track.id).forEach((existingKey) => {
    if (existingKey !== key) releaseVoice(existingKey)
  })

  const dest = orchestraDest(graph)
  const ctx = graph.context
  const voiceGain = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.45
  filter.frequency.value = cutoffHz(spec, track, velocity, rules)
  const expr = Math.max(0.15, expressionForTrack(track))
  const dyn01 = Math.max(0, Math.min(1, dynamics / 127))
  const dynamicsShaped = Math.pow(dyn01, spec.gamma || 1.35)
  voiceGain.gain.value = (0.28 + 0.72 * dynamicsShaped) * (0.55 + 0.45 * Math.max(0.05, velocity)) * expr * (spec.solo ? 0.9 : 0.55)
  voiceGain.connect(filter)
  filter.connect(dest)

  const layerGainA = ctx.createGain()
  const layerGainB = ctx.createGain()
  const mix = dual ? { a: 0.65, b: 0.35 } : { a: 1, b: 0 }
  layerGainA.gain.value = mix.a
  layerGainB.gain.value = mix.b
  layerGainA.connect(voiceGain)
  layerGainB.connect(voiceGain)

  const sources = []
  const lfos = []
  const vib = vibratoForTrack(track)
  const gatedVib = vib >= rules.vibratoGate && isSustaining(artic) && spec.vibrato
  const vibDepth = gatedVib
    ? ((vib - rules.vibratoGate) / Math.max(0.001, 1 - rules.vibratoGate)) * rules.vibratoDepthSemis
    : 0
  let lfoGain = null
  const detune = spec.solo ? rules.soloDetuneCents : rules.sectionDetuneCents

  decodedList.forEach((item, index) => {
    const decoded = item.decoded
    const src = ctx.createBufferSource()
    src.buffer = decoded.audio
    const pan = ctx.createStereoPanner()
    const width = (spec.sectionSize || 1) > 1 ? 0.35 : 0
    pan.pan.value = decodedList.length <= 1 ? 0 : (-width + (2 * width * index) / Math.max(1, decodedList.length - 1))
    const cents = index === 0 ? 0 : (index % 2 === 0 ? detune : -detune)
    const semitones = decoded.unpitched ? 0 : Math.max(-rules.maxStretchSemitones, Math.min(rules.maxStretchSemitones, pitch - decoded.rootNote + cents / 100))
    const rate = Math.pow(2, semitones / 12)
    src.playbackRate.value = rate
    if (decoded.loop && decoded.loopEnd - decoded.loopStart > 0.8) {
      src.loop = true
      src.loopStart = decoded.loopStart
      src.loopEnd = decoded.loopEnd
    }
    src.connect(pan)
    pan.connect(index === 1 && dual ? layerGainB : layerGainA)
    src.start()
    sources.push(src)
    if (vibDepth > 0) {
      if (!lfoGain) {
        lfoGain = ctx.createGain()
        lfoGain.gain.value = rate * (Math.pow(2, vibDepth / 12) - 1)
        const osc = ctx.createOscillator()
        osc.type = 'sine'
        osc.frequency.value = 5.05
        osc.connect(lfoGain)
        osc.start()
        lfos.push(osc)
      }
      lfoGain.connect(src.playbackRate)
    }
  })

  if (spec.noise && spec.noise !== 'none' && rules.noiseAmount > 0) {
    const noiseSrc = ctx.createBufferSource()
    noiseSrc.buffer = makeNoiseBuffer(ctx)
    noiseSrc.loop = true
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = rules.noiseHpHz
    const ng = ctx.createGain()
    ng.gain.value = rules.noiseAmount * dynamicsShaped
    noiseSrc.connect(hp)
    hp.connect(ng)
    ng.connect(voiceGain)
    noiseSrc.start()
    sources.push(noiseSrc)
  }

  voices.set(key, {
    sources,
    lfos,
    gain: voiceGain,
    filter,
    layerGainA,
    layerGainB,
    lfoGain,
    trackId: track.id,
    artic,
    velocity,
    dualLayer: dual,
    dynLayerA: primary.dynamicLayer,
    dynLayerB: primary.dynamicLayer,
    baseRate: decodedList[0] ? (decodedList[0].decoded.unpitched ? 1 : Math.pow(2, (pitch - decodedList[0].decoded.rootNote) / 12)) : 1
  })
  attachLayerWhenReady(ctx, key, secondaryLayer, track, spec, pitch, rules)
  applyControllers(track)
  const readyMs = nowMs() - noteStarted
  profile.noteReadyMs += readyMs
  profile.maxNoteReadyMs = Math.max(profile.maxNoteReadyMs, readyMs)
  return key
}

export function noteOff (pitchOrKey, trackId) {
  resolveVoiceKeys(pitchOrKey, trackId).forEach((key) => releaseVoice(key))
}

export function allNotesOff () {
  noteEpoch += 1
  cancelPendingKeys(Array.from(pending.keys()))
  pending.clear()
  Array.from(voices.keys()).forEach((key) => releaseVoice(key))
}

export async function preloadInstrument (graph, definitionId) {
  await ensureManifest()
  const spec = findInstrument(definitionId)
  if (!spec || !graph) return
  const arts = spec.articulations || ['long']
  for (const artic of arts) {
    const sample = pickFromManifest(samples(), spec, artic, 60, 100, 100, 0, manifest)
    if (sample) {
      try { await decodeSample(graph.context, sample, false) } catch (err) { console.warn('[m-orchestra] preload', err) }
    }
  }
}

/** Preloads only the exact primary samples used by the next transport window. */
export async function preloadNotes (graph, track, pitches, velocity = 0.8) {
  if (!graph || !track || !Array.isArray(pitches) || !pitches.length) return
  await ensureManifest()
  const spec = findInstrument(track.definitionId)
  if (!spec) return
  const artic = articForTrack(track, spec)
  const dynamics = dynamicsForTrack(track)
  const velocityMidi = Math.round(Math.max(0.05, velocity) * 127)
  const unique = [...new Set(pitches.map((pitch) => Math.round(Number(pitch))).filter(Number.isFinite))]
  await Promise.all(unique.slice(0, 24).map(async (pitch) => {
    const sample = pickFromManifest(samples(), spec, artic, pitch, velocityMidi, dynamics, 0, manifest)
    if (!sample) return
    try { await decodeSample(graph.context, sample, false) } catch (err) { /* retry on note-on */ }
  }))
}
