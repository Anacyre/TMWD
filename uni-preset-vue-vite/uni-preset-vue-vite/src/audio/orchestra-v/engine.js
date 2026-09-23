/** Orchestra V voice runtime.
 *
 * Loading an instrument compiles its cloud samples into an SFZ-style zone table once
 * (see sfz.js), so a note-on is a table lookup rather than a scan of the whole library.
 * A note can sound two velocity layers at equal power, which is what gives the sampler
 * its dynamic crossfade; everything else follows the usual sample-player shape.
 *
 * Encoded bytes are cached in the same IndexedDB store M Orchestra uses, so the two
 * samplers never download the same file twice.
 */

import { trackInputNode } from '../mixer-graph.js'
import { AsyncLimiter, AudioBufferLru, readEncodedSample, writeEncodedSample } from '../m-orchestra/sample-cache.js'
import { bakeLoopSeam, splitSustainRelease } from '../m-orchestra/pick.js'
import { targetDynamics } from '../m-orchestra/playback.js'
import { findDefinition, libraryOf } from './catalog.js'
import { articulationChain, compileRegions, selectZone } from './sfz.js'
import { ensureManifest, librarySamples, playbackRules, sampleCount, sampleUrl } from './library.js'
import { releasePlan } from './release.js'

export { ensureManifest, sampleCount } from './library.js'
export { findDefinition } from './catalog.js'
export { LIBRARIES, findLibrary } from './libraries.js'

const TECHNIQUE_ARTIC = {
  ov_long: 'long',
  ov_short: 'short',
  ov_pizz: 'pluck',
  ov_trem: 'sustain',
  ov_hit: 'hit'
}

const DECODE_TAG = '|ov-v1'
const PITCH_BEND_SEMITONES = 2

/** Equal-power pair for the body/release crossfade, so the two halves of one recording sum
 * to constant power even though their phases are unrelated. */
const FADE_STEPS = 33
const FADE_IN = new Float32Array(FADE_STEPS)
const FADE_OUT = new Float32Array(FADE_STEPS)
for (let i = 0; i < FADE_STEPS; i++) {
  const t = i / (FADE_STEPS - 1)
  FADE_IN[i] = Math.sin(t * Math.PI * 0.5)
  FADE_OUT[i] = Math.cos(t * Math.PI * 0.5)
}

function scaleCurve (curve, peak) {
  const out = new Float32Array(curve.length)
  for (let i = 0; i < curve.length; i++) out[i] = curve[i] * peak
  return out
}

function crossfade (param, curve, at, seconds) {
  try {
    param.cancelScheduledValues(at)
    param.setValueCurveAtTime(curve, at, Math.max(0.005, seconds))
  } catch (err) {
    // Safari rejects a curve that overlaps an earlier event; a ramp is close enough.
    param.linearRampToValueAtTime(curve[curve.length - 1], at + Math.max(0.005, seconds))
  }
}

const regionMaps = new Map()
const bufferCache = new AudioBufferLru(96 * 1024 * 1024)
const decodeQueue = new AsyncLimiter(2)
const decodePromises = new Map()
const voices = new Map()
const pending = new Map()
const seqStates = new Map()
const spacesByContext = new WeakMap()
const trackContexts = new Map()
const pedalDown = new Map()
let noteEpoch = 0

const profile = { noteCount: 0, cacheHits: 0, idbHits: 0, networkFetches: 0, fetchMs: 0, decodeMs: 0 }

export function getLoadDiagnostics () {
  return {
    ...profile,
    decodedMb: Math.round(bufferCache.bytes / 10485.76) / 100,
    decodeActive: decodeQueue.active,
    decodePending: decodeQueue.pending,
    instrumentsCompiled: regionMaps.size
  }
}

function nowMs () {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()
}

// --- controllers -------------------------------------------------------------

/** Track controller values arrive as either 0..1 or 0..127; normalise to 0..1. */
function cc (track, id, fallback) {
  const raw = track && track.controllerValues ? track.controllerValues[id] : undefined
  if (raw == null || !Number.isFinite(Number(raw))) return fallback
  const value = Number(raw)
  return Math.max(0, Math.min(1, value > 1 ? value / 127 : value))
}

export const DEFAULT_CONTROLLERS = {
  dynamics: 100,
  expression: 100,
  reverb: 30,
  release: 50,
  micClose: 100,
  micDecca: 45,
  micHall: 25,
  mod: 40,
  pitch: 64,
  pedal: 0
}

function controllers (track) {
  return {
    dynamics: cc(track, 'dynamics', 100 / 127),
    expression: cc(track, 'expression', 100 / 127),
    reverb: cc(track, 'reverb', 30 / 127),
    release: cc(track, 'release', 50 / 127),
    micClose: cc(track, 'micClose', 1),
    micDecca: cc(track, 'micDecca', 45 / 127),
    micHall: cc(track, 'micHall', 25 / 127),
    mod: cc(track, 'mod', 40 / 127),
    bend: (cc(track, 'pitch', 0.5) - 0.5) * 2,
    pedal: cc(track, 'pedal', 0)
  }
}

export function articForTrack (track, def) {
  const mapped = TECHNIQUE_ARTIC[track && track.techniqueId]
  if (mapped) return mapped
  const list = (def && def.articulations) || ['long']
  return list[0] || 'long'
}

function isSustaining (artic) {
  return artic === 'long' || artic === 'sustain'
}

/** Dynamics shapes both loudness and brightness, the way a real section does. */
function voiceLevel (ctrl, def, velocity) {
  const vm = def.voiceModel || {}
  const shaped = Math.pow(ctrl.dynamics, vm.gamma || 1.35)
  // How much of the level velocity is responsible for. A library with several dynamic layers
  // leaves most of it to the layer choice; one recorded at a single dynamic has nothing else.
  const track = vm.velocityTrack == null ? 0.45 : vm.velocityTrack
  // Voices that stack detuned copies of one recording need headroom for the sum; a recorded
  // ensemble is one source and can sit near unity.
  const trim = vm.gainTrim == null ? (vm.solo ? 0.9 : 0.55) : vm.gainTrim
  return (0.28 + 0.72 * shaped) * ((1 - track) + track * Math.max(0.05, velocity))
    * Math.max(0.15, ctrl.expression) * trim
}

function cutoffHz (ctrl, def, velocity, rules) {
  const gamma = (def.voiceModel && def.voiceModel.gamma) || 1.35
  const shaped = Math.pow(ctrl.dynamics, gamma)
  return rules.cutoffMinHz + rules.cutoffSpanHz * shaped * (0.7 + 0.3 * Math.max(0.05, velocity))
}

function releaseSeconds (zone, ctrl) {
  const base = (zone && zone.ampegRelease) || 0.45
  return Math.max(0.03, base * (0.35 + 1.7 * ctrl.release))
}

// --- region maps -------------------------------------------------------------

/** Compile an instrument's zone table, or return the cached one. */
export async function loadInstrument (definitionId) {
  const def = findDefinition(definitionId)
  if (!def || !def.available) return null
  if (regionMaps.has(def.id)) return regionMaps.get(def.id)
  const library = libraryOf(def)
  await ensureManifest(library)
  if (regionMaps.has(def.id)) return regionMaps.get(def.id)
  const map = compileRegions(librarySamples(library), def, { playback: playbackRules(library) })
  map.library = library
  regionMaps.set(def.id, map)
  return map
}

/** Playback rules of the library an instrument belongs to. */
function rulesFor (def) {
  return playbackRules(libraryOf(def))
}

export function regionMapFor (definitionId) {
  return regionMaps.get(String(definitionId || '')) || null
}

/** Articulations that actually compiled to zones, for greying out UI chips. */
export async function availableArticulations (definitionId) {
  const map = await loadInstrument(definitionId)
  return map ? map.articulations.slice() : []
}

// --- sample fetch and decode --------------------------------------------------

/**
 * Encoded bytes live in the same IndexedDB store M Orchestra writes, keyed by object path so
 * the two samplers share the VMS Solo downloads. Libraries in other buckets are prefixed,
 * because only the bucket makes an object path unique.
 */
function cachePath (library, objectPath) {
  return library === 'vms-solo' ? objectPath : library + '/' + objectPath
}

const VORBIS_POOL = 2
const vorbisIdle = []
const vorbisWaiters = []
let vorbisCreated = 0

async function takeVorbisDecoder () {
  if (vorbisIdle.length) return vorbisIdle.pop()
  if (vorbisCreated < VORBIS_POOL) {
    vorbisCreated += 1
    const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis')
    const decoder = new OggVorbisDecoder()
    await decoder.ready
    decoder._used = false
    return decoder
  }
  return new Promise((resolve) => { vorbisWaiters.push(resolve) })
}

function releaseVorbisDecoder (decoder) {
  const waiter = vorbisWaiters.shift()
  if (waiter) waiter(decoder)
  else vorbisIdle.push(decoder)
}

/** Safari cannot decode Ogg Vorbis with decodeAudioData. Decode to PCM instead. */
async function decodeVorbis (context, bytes) {
  const decoder = await takeVorbisDecoder()
  try {
    if (decoder._used) await decoder.reset()
    decoder._used = true
    const decoded = await decoder.decode(new Uint8Array(bytes))
    const channels = decoded.channelData || []
    const length = decoded.samplesDecoded || (channels[0] && channels[0].length) || 0
    const rate = decoded.sampleRate || context.sampleRate
    if (!length) throw new Error('empty vorbis decode')
    const audio = context.createBuffer(Math.max(1, channels.length), length, rate)
    channels.forEach((channel, index) => {
      audio.copyToChannel(channel.subarray(0, length), index)
    })
    return audio
  } finally {
    releaseVorbisDecoder(decoder)
  }
}

async function decodeSampleBytes (context, bytes) {
  try {
    const audio = await context.decodeAudioData(bytes.slice(0))
    if (audio && audio.length > 0 && audio.duration > 0) return audio
  } catch (err) {
    /* iPad / Safari rejects application/ogg */
  }
  return decodeVorbis(context, bytes)
}

async function fetchSampleBytes (library, objectPath) {
  const stored = cachePath(library, objectPath)
  const cached = await readEncodedSample(stored)
  if (cached) {
    profile.idbHits += 1
    return cached
  }
  const started = nowMs()
  const response = await fetch(sampleUrl(library, objectPath))
  if (!response.ok) throw new Error('orchestra-v sample ' + objectPath + ' ' + response.status)
  const type = String(response.headers.get('content-type') || '')
  // The Cloudflare site answers missing assets with index.html and status 200.
  // Decoding that page is what made every Orchestra V note silent.
  if (type.includes('text/html')) throw new Error('orchestra-v sample ' + objectPath + ' returned HTML')
  const bytes = await response.arrayBuffer()
  profile.fetchMs += nowMs() - started
  profile.networkFetches += 1
  writeEncodedSample(stored, bytes.slice(0)).catch(() => {})
  return bytes
}

function decodeKey (library, zone, context) {
  return library + '|' + zone.sample + DECODE_TAG + '|' + (context.sampleRate || 0)
}

function cachedDecode (library, zone, context) {
  return bufferCache.get(decodeKey(library, zone, context))
}

/** Decode a zone's sample and bake in whatever loop seam it declares. */
async function decodeZone (context, library, zone, rules, priority = true) {
  const key = decodeKey(library, zone, context)
  const hit = bufferCache.get(key)
  if (hit) {
    profile.cacheHits += 1
    return hit
  }
  if (decodePromises.has(key)) return decodePromises.get(key)

  const promise = decodeQueue.run(async () => {
    const bytes = await fetchSampleBytes(library, zone.sample)
    const started = nowMs()
    const audio = await decodeSampleBytes(context, bytes)
    profile.decodeMs += nowMs() - started

    let loop = false
    let loopStart = 0
    let loopEnd = 0
    // Where note-off should pick the recording up again. A body-plus-release library
    // publishes this as `mainSec` (4 s into a 6 s take, 1 s into a 2 s take).
    let releaseStart = zone.mainSec > 0 ? Math.min(zone.mainSec, audio.duration) : 0

    if (zone.loopMode === 'loop_continuous' && zone.loopEnd > zone.loopStart) {
      const seam = bakeLoopSeam(audio, zone.loopStart, zone.loopEnd, zone.crossfadeSec)
      loop = true
      loopStart = seam.loopStart
      loopEnd = seam.loopEnd
      if (!releaseStart) releaseStart = seam.loopEnd
    } else if (!zone.mainSec && isSustaining(zone.articulation)) {
      // No published loop or body length: fall back to a runtime split so held notes still
      // get a tail.
      const split = splitSustainRelease(audio.getChannelData(0), audio.sampleRate)
      if (split.loop) {
        const seam = bakeLoopSeam(audio, split.loopStart, split.loopEnd, 0.06, 0.08)
        loop = true
        loopStart = seam.loopStart
        loopEnd = seam.loopEnd
      }
      releaseStart = split.releaseStart || 0
    }

    const decoded = { audio, loop, loopStart, loopEnd, releaseStart, key }
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

// --- per-track ambience -------------------------------------------------------

/** Close / Decca / Hall on a single-mic library is a blend of dry signal, early
 * reflections and a short tail rather than three real microphone positions. */
function buildSpace (context) {
  const input = context.createGain()
  const dry = context.createGain()
  const early = context.createGain()
  const tail = context.createGain()
  const nodes = [input, dry, early, tail]

  input.connect(dry)

  const taps = [[0.0131, 0.70], [0.0211, 0.55], [0.0313, 0.42], [0.0431, 0.32]]
  for (const [time, level] of taps) {
    const delay = context.createDelay(0.25)
    delay.delayTime.value = time
    const gain = context.createGain()
    gain.gain.value = level
    input.connect(delay)
    delay.connect(gain)
    gain.connect(early)
    nodes.push(delay, gain)
  }

  const pre = context.createDelay(0.5)
  pre.delayTime.value = 0.035
  input.connect(pre)
  nodes.push(pre)
  for (const time of [0.0797, 0.0971]) {
    const delay = context.createDelay(0.5)
    delay.delayTime.value = time
    const damp = context.createBiquadFilter()
    damp.type = 'lowpass'
    damp.frequency.value = 3600
    const feedback = context.createGain()
    feedback.gain.value = 0.62
    pre.connect(delay)
    delay.connect(damp)
    damp.connect(feedback)
    feedback.connect(delay)
    damp.connect(tail)
    nodes.push(delay, damp, feedback)
  }

  return { input, dry, early, tail, nodes, dest: null }
}

function applySpaceMix (space, ctrl, context) {
  const now = context.currentTime
  space.dry.gain.setTargetAtTime(Math.max(0, ctrl.micClose), now, 0.05)
  space.early.gain.setTargetAtTime(ctrl.micDecca * ctrl.reverb * 0.8, now, 0.05)
  space.tail.gain.setTargetAtTime(ctrl.micHall * ctrl.reverb * 0.6, now, 0.05)
}

function ensureSpace (context, trackId, dest, ctrl) {
  let byTrack = spacesByContext.get(context)
  if (!byTrack) {
    byTrack = new Map()
    spacesByContext.set(context, byTrack)
  }
  let space = byTrack.get(trackId)
  if (!space) {
    space = buildSpace(context)
    byTrack.set(trackId, space)
  }
  if (space.dest !== dest) {
    if (space.dest) {
      try { space.dry.disconnect(space.dest) } catch (err) { /* already gone */ }
      try { space.early.disconnect(space.dest) } catch (err) { /* already gone */ }
      try { space.tail.disconnect(space.dest) } catch (err) { /* already gone */ }
    }
    space.dry.connect(dest)
    space.early.connect(dest)
    space.tail.connect(dest)
    space.dest = dest
  }
  applySpaceMix(space, ctrl, context)
  trackContexts.set(String(trackId), context)
  return space
}

function spaceFor (trackId) {
  const context = trackContexts.get(String(trackId))
  const byTrack = context && spacesByContext.get(context)
  const space = byTrack && byTrack.get(trackId)
  return space ? { space, context } : null
}

function orchestraDest (graph, track) {
  if (!graph) return null
  const trackId = track && track.id != null ? track.id : null
  if (trackId != null) {
    const input = trackInputNode(graph, trackId)
    if (input) return input
  }
  return graph.samplerGain || graph.master || graph.context.destination
}

// --- voice bookkeeping ---------------------------------------------------------

function voiceKey (trackId, pitch, id) {
  return String(trackId || 0) + ':' + pitch + ':' + (id == null ? pitch : id)
}

function resolveVoiceKeys (pitchOrKey, trackId) {
  const keys = new Set()
  const match = (key) => {
    if (typeof pitchOrKey === 'string') {
      if (key === pitchOrKey) return true
      const parts = key.split(':')
      return parts.length >= 3 && parts.slice(2).join(':') === pitchOrKey
    }
    return key.startsWith(String(trackId || 0) + ':' + pitchOrKey + ':')
  }
  voices.forEach((_, key) => { if (match(key)) keys.add(key) })
  pending.forEach((_, key) => { if (match(key)) keys.add(key) })
  if (typeof pitchOrKey === 'string' && (voices.has(pitchOrKey) || pending.has(pitchOrKey))) keys.add(pitchOrKey)
  return Array.from(keys)
}

export function cancelPending (pitchOrKey, trackId) {
  resolveVoiceKeys(pitchOrKey, trackId).forEach((key) => {
    const entry = pending.get(key)
    if (entry) entry.cancelled = true
  })
}

function disposeVoice (voice) {
  voice.sources.forEach((src) => { try { src.stop() } catch (err) { /* ended */ } })
  voice.lfos.forEach((osc) => { try { osc.stop() } catch (err) { /* ended */ } })
  try { voice.out.disconnect() } catch (err) { /* already gone */ }
  try { voice.filter.disconnect() } catch (err) { /* already gone */ }
  try { voice.mix.disconnect() } catch (err) { /* already gone */ }
  try { voice.body.disconnect() } catch (err) { /* already gone */ }
  try { voice.tail.disconnect() } catch (err) { /* already gone */ }
}

function stopSources (sources, at, fadeSec) {
  sources.forEach((src) => {
    try { src.loop = false } catch (err) { /* ignore */ }
    try { src.stop(at + fadeSec + 0.02) } catch (err) { /* ended */ }
  })
}

function stopBody (voice, at, fadeSec) {
  crossfade(voice.body.gain, FADE_OUT, at, fadeSec)
  stopSources(voice.bodySources || [], at, fadeSec)
}

/**
 * Play the release tail the recording already contains (last 2 s of a 6 s long take,
 * last 1 s of a 2 s short take).
 *
 * The body and its tail were recorded as one continuous note, so at the splice point the
 * level matches but the phase does not: jumping straight there clicks. An equal-power
 * crossfade hides the seam. The tail source must not go through `stopBody`, which used to
 * halt every BufferSource on the voice and made the release last only the fade (a cut).
 */
function playReleaseSegment (voice, context, at) {
  const decoded = voice.decoded
  const from = decoded.releaseStart
  const rate = Math.max(0.05, voice.baseRate || 1)
  const remaining = Math.max(0.05, decoded.audio.duration - from)
  const fade = Math.max(0.08, Math.min(0.14, voice.releaseCrossfadeSec || 0.08))

  const tail = context.createBufferSource()
  tail.buffer = decoded.audio
  tail.playbackRate.value = rate
  tail.connect(voice.tail)
  tail.start(at, from)
  tail.stop(at + remaining / rate + 0.02)
  // Body-only. Putting the tail on `bodySources` would let `stopBody` kill it after ~80 ms.
  voice.sources.push(tail)

  voice.tail.gain.cancelScheduledValues(at)
  voice.tail.gain.setValueAtTime(0, at)
  crossfade(voice.tail.gain, FADE_IN, at, fade)
  stopBody(voice, at, fade)
  return remaining / rate
}

function fadeOutEnvelope (voice, at, seconds) {
  const fade = Math.max(0.08, seconds)
  const peak = Number(voice.out.gain.value)
  const from = Number.isFinite(peak) ? peak : 1
  voice.out.gain.cancelScheduledValues(at)
  voice.out.gain.setValueAtTime(from, at)
  crossfade(voice.out.gain, scaleCurve(FADE_OUT, from), at, fade)
  stopSources(voice.sources, at, fade)
  return fade
}

function damperSeconds (voice) {
  // Rapid, but long enough that a stopped buffer is not heard as a click. Felt on a
  // string is closer to this than to a studio fade, and much closer than a hard cut.
  return Math.max(0.12, Math.min(0.28, (voice.release || 0.45) * 0.45))
}

function releaseVoice (key, options = {}) {
  const voice = voices.get(key)
  if (!voice || voice.releasing) return

  const context = voice.out.context
  const now = context.currentTime
  const plan = releasePlan(voice, {
    force: options.force,
    pedalDown: pedalDown.get(String(voice.trackId)),
    elapsedSec: now - voice.startedAt
  })

  if (plan.action === 'none') return
  if (plan.action === 'hold') {
    voice.pedalHeld = true
    return
  }

  voices.delete(key)
  voice.releasing = true

  if (plan.action === 'free') return
  if (voice.expiry) { clearTimeout(voice.expiry); voice.expiry = 0 }

  if (plan.action === 'segment') {
    const remaining = playReleaseSegment(voice, context, now)
    setTimeout(() => disposeVoice(voice), Math.round(remaining * 1000 + 120))
    return
  }

  const fade = voice.decays ? damperSeconds(voice) : Math.max(0.08, voice.release || 0.45)
  fadeOutEnvelope(voice, now, fade)
  setTimeout(() => disposeVoice(voice), Math.round(fade * 1000 + 120))
}

export function noteOff (pitchOrKey, trackId) {
  resolveVoiceKeys(pitchOrKey, trackId).forEach((key) => releaseVoice(key))
}

/** Damp everything the pedal was holding for one track. */
function liftPedal (trackId) {
  const id = String(trackId)
  Array.from(voices.entries()).forEach(([key, voice]) => {
    if (String(voice.trackId) !== id || !voice.pedalHeld) return
    releaseVoice(key, { force: true })
  })
}

export function allNotesOff () {
  noteEpoch += 1
  pending.forEach((entry) => { entry.cancelled = true })
  pending.clear()
  pedalDown.clear()
  Array.from(voices.keys()).forEach((key) => releaseVoice(key, { force: true }))
}

function seqStateFor (trackId) {
  const id = String(trackId == null ? 0 : trackId)
  let state = seqStates.get(id)
  if (!state) {
    state = new Map()
    seqStates.set(id, state)
  }
  return state
}

// --- playback ------------------------------------------------------------------

function attachLayer (voice, context, decoded, item, def, pitch, ctrl, rules, detuneCents) {
  const source = context.createBufferSource()
  source.buffer = decoded.audio
  const semitones = item.zone.unpitched
    ? 0
    : Math.max(-rules.maxStretchSemitones, Math.min(rules.maxStretchSemitones, pitch - item.zone.pitchKeycenter))
  const rate = Math.pow(2, (semitones + ctrl.bend * PITCH_BEND_SEMITONES + detuneCents / 100) / 12)
  source.playbackRate.value = rate
  if (decoded.loop && decoded.loopEnd - decoded.loopStart > 0.4) {
    source.loop = true
    source.loopStart = decoded.loopStart
    source.loopEnd = decoded.loopEnd
  }

  const panner = context.createStereoPanner()
  const width = (def.voiceModel && def.voiceModel.sectionSize) > 1 ? 0.3 : 0
  panner.pan.value = detuneCents === 0 ? 0 : (detuneCents > 0 ? width : -width)

  const gain = context.createGain()
  gain.gain.value = item.gain

  source.connect(panner)
  panner.connect(gain)
  gain.connect(voice.body)
  source.start()
  voice.sources.push(source)
  if (!voice.bodySources) voice.bodySources = []
  voice.bodySources.push(source)

  if (voice.vibratoGain) voice.vibratoGain.connect(source.playbackRate)
  if (!voice.baseRate) voice.baseRate = rate
  return source
}

export async function noteOn (graph, track, pitch, velocity = 0.8, id) {
  if (!graph || !track) return null
  profile.noteCount += 1
  if (graph.context.state === 'suspended') {
    try { await graph.context.resume() } catch (err) { /* autoplay policy */ }
  }

  const key = voiceKey(track.id, pitch, id)
  const epoch = noteEpoch
  pending.set(key, { cancelled: false, epoch })

  const def = findDefinition(track.definitionId)
  const map = def ? await loadInstrument(def.id) : null
  if (!map) {
    pending.delete(key)
    return null
  }

  const library = libraryOf(def)
  const rules = playbackRules(library)
  const ctrl = controllers(track)
  pedalDown.set(String(track.id), ctrl.pedal >= 0.5)
  const artic = articForTrack(track, def)
  const velocityMidi = Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)
  const layerVelocity = targetDynamics(Math.round(ctrl.dynamics * 127), velocityMidi, rules.dynamicsVelocityMix)
  const selection = selectZone(map, pitch, layerVelocity, articulationChain(artic), seqStateFor(track.id))
  if (!selection.length) {
    pending.delete(key)
    return null
  }

  selection.sort((a, b) => b.gain - a.gain)
  const primary = selection[0]
  let decodedPrimary = null
  try {
    decodedPrimary = await decodeZone(graph.context, library, primary.zone, rules)
  } catch (err) {
    console.warn('[orchestra-v] decode', err)
    pending.delete(key)
    return null
  }

  const entry = pending.get(key)
  pending.delete(key)
  // A new play, stop, or seek bumps noteEpoch. A note-off only sets cancelled, and that
  // sample should still be heard: start it and release immediately instead of dropping it.
  if (!entry || entry.epoch !== noteEpoch) return null
  const releasedEarly = !!entry.cancelled

  const context = graph.context
  const dest = orchestraDest(graph, track)
  const space = ensureSpace(context, track.id, dest, ctrl)

  const out = context.createGain()
  out.gain.value = voiceLevel(ctrl, def, velocity)
  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'
  filter.Q.value = 0.45
  filter.frequency.value = cutoffHz(ctrl, def, velocity, rules)
  const mix = context.createGain()
  // The held body and the release tail get their own gains so note-off can crossfade
  // between them rather than cutting one off.
  const body = context.createGain()
  const tail = context.createGain()
  tail.gain.value = 0
  body.connect(mix)
  tail.connect(mix)
  mix.connect(filter)
  filter.connect(out)
  out.connect(space.input)

  const voice = {
    sources: [],
    bodySources: [],
    lfos: [],
    mix,
    body,
    tail,
    filter,
    out,
    trackId: track.id,
    pitch,
    artic,
    velocity,
    baseRate: 0,
    decoded: decodedPrimary,
    release: releaseSeconds(primary.zone, ctrl),
    releaseMode: primary.zone.releaseMode || 'tail',
    releaseCrossfadeSec: primary.zone.releaseCrossfadeSec || 0.08,
    decays: !!primary.zone.decays || !!def.pedal,
    pedal: !!def.pedal,
    pedalHeld: false,
    releasing: false,
    startedAt: context.currentTime,
    vibratoGain: null
  }

  const wantsVibrato = isSustaining(artic)
    && def.voiceModel && def.voiceModel.vibrato
    && ctrl.mod >= rules.vibratoGate
  if (wantsVibrato) {
    const depth = ((ctrl.mod - rules.vibratoGate) / Math.max(0.001, 1 - rules.vibratoGate)) * rules.vibratoDepthSemis
    const lfo = context.createOscillator()
    lfo.type = 'sine'
    lfo.frequency.value = 5.05
    const lfoGain = context.createGain()
    lfoGain.gain.value = Math.pow(2, depth / 12) - 1
    lfo.connect(lfoGain)
    lfo.start()
    voice.lfos.push(lfo)
    voice.vibratoGain = lfoGain
  }

  // Cap voices before adding, oldest first, so a dense passage sheds the stalest note. The
  // cap has to win over a held pedal, otherwise a pedalled passage would never free a slot.
  const maxVoices = (def.voiceModel && def.voiceModel.maxVoices) || 16
  const trackVoices = Array.from(voices.keys()).filter((k) => voices.get(k).trackId === track.id)
  while (trackVoices.length >= maxVoices) releaseVoice(trackVoices.shift(), { force: true })
  resolveVoiceKeys(id == null ? pitch : id, track.id)
    .forEach((existing) => releaseVoice(existing, { force: true }))

  const detune = (def.voiceModel && def.voiceModel.detuneCents) || 0
  attachLayer(voice, context, decodedPrimary, primary, def, pitch, ctrl, rules, 0)
  if (noteEpoch !== epoch) {
    disposeVoice(voice)
    return null
  }
  voices.set(key, voice)
  if (releasedEarly) releaseVoice(key)

  // A take that rings out on its own is never released, so its only end is the end of the
  // buffer; without this the node graph would leak one chain per note.
  if (voice.releaseMode === 'free' || !decodedPrimary.loop) {
    const lifetime = decodedPrimary.audio.duration / Math.max(0.05, voice.baseRate || 1)
    voice.expiry = setTimeout(() => {
      if (voices.get(key) === voice) voices.delete(key)
      disposeVoice(voice)
    }, Math.round(lifetime * 1000 + 150))
  }

  // The quieter half of a velocity crossfade only joins once it is decoded, so the
  // first play of a note is never held up waiting for a second download.
  const secondary = selection[1]
  if (secondary && !releasedEarly) {
    const ready = cachedDecode(library, secondary.zone, context)
    if (ready) {
      attachLayer(voice, context, ready, secondary, def, pitch, ctrl, rules, detune)
    } else {
      decodeZone(context, library, secondary.zone, rules, false).then((decoded) => {
        if (voices.get(key) !== voice) return
        attachLayer(voice, context, decoded, secondary, def, pitch, ctrl, rules, detune)
      }).catch(() => {})
    }
  }

  return key
}

export function applyControllers (track) {
  if (!track) return
  const def = findDefinition(track.definitionId)
  if (!def) return
  const ctrl = controllers(track)
  const rules = rulesFor(def)

  // Letting the pedal up is the moment the dampers land, so it has to damp every note that
  // was only still sounding because the pedal was down.
  const id = String(track.id)
  const down = ctrl.pedal >= 0.5
  const was = pedalDown.get(id) === true
  pedalDown.set(id, down)
  if (was && !down) liftPedal(track.id)

  voices.forEach((voice) => {
    if (voice.trackId !== track.id) return
    const context = voice.out.context
    const now = context.currentTime
    voice.out.gain.setTargetAtTime(voiceLevel(ctrl, def, voice.velocity), now, 0.04)
    voice.filter.frequency.setTargetAtTime(cutoffHz(ctrl, def, voice.velocity, rules), now, 0.04)
    if (voice.vibratoGain) {
      const gated = ctrl.mod >= rules.vibratoGate && isSustaining(voice.artic)
      const depth = gated
        ? ((ctrl.mod - rules.vibratoGate) / Math.max(0.001, 1 - rules.vibratoGate)) * rules.vibratoDepthSemis
        : 0
      voice.vibratoGain.gain.setTargetAtTime(Math.pow(2, depth / 12) - 1, now, 0.06)
    }
  })
  const found = spaceFor(track.id)
  if (found) applySpaceMix(found.space, ctrl, found.context)
}

// --- preloading -----------------------------------------------------------------

export async function preloadInstrument (graph, definitionId) {
  const map = await loadInstrument(definitionId)
  if (!map || !graph) return
  const library = map.library
  const rules = playbackRules(library)
  for (const artic of map.articulations) {
    const bank = map.byArticulation[artic]
    const middle = Math.round((bank.keyLo + bank.keyHi) / 2)
    const zones = bank.byKey[middle] || bank.byKey[bank.keyLo] || []
    for (const zone of zones.slice(0, 2)) {
      try { await decodeZone(graph.context, library, zone, rules, false) } catch (err) { /* retry on note-on */ }
    }
  }
}

/** Decode exactly the zones the next transport window will ask for. */
export async function preloadNotes (graph, track, pitches, velocity = 0.8) {
  if (!graph || !track || !Array.isArray(pitches) || !pitches.length) return
  const def = findDefinition(track.definitionId)
  const map = def ? await loadInstrument(def.id) : null
  if (!map) return
  const library = map.library
  const rules = playbackRules(library)
  const ctrl = controllers(track)
  const artic = articForTrack(track, def)
  const velocityMidi = Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)
  const layerVelocity = targetDynamics(Math.round(ctrl.dynamics * 127), velocityMidi, rules.dynamicsVelocityMix)
  const unique = [...new Set(pitches.map((pitch) => Math.round(Number(pitch))).filter(Number.isFinite))]

  const wanted = new Map()
  for (const pitch of unique) {
    for (const item of selectZone(map, pitch, layerVelocity, articulationChain(artic))) {
      wanted.set(item.zone.sample, item.zone)
    }
  }
  await Promise.all(Array.from(wanted.values()).map(async (zone) => {
    try { await decodeZone(graph.context, library, zone, rules, false) } catch (err) { /* retry on note-on */ }
  }))
}

/** Schedule one note on a live or offline context, for bounce rendering. */
export async function renderNoteAt (context, dest, track, pitch, velocity, when, durationSec) {
  if (!context || !dest || !track) return false
  const def = findDefinition(track.definitionId)
  const map = def ? await loadInstrument(def.id) : null
  if (!map) return false

  const library = map.library
  const rules = playbackRules(library)
  const ctrl = controllers(track)
  const artic = articForTrack(track, def)
  const velocityMidi = Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)
  const layerVelocity = targetDynamics(Math.round(ctrl.dynamics * 127), velocityMidi, rules.dynamicsVelocityMix)
  const selection = selectZone(map, pitch, layerVelocity, articulationChain(artic))
  if (!selection.length) return false

  const start = Math.max(0, when || 0)
  const hold = Math.max(0.05, durationSec || 0.5)
  const level = voiceLevel(ctrl, def, velocity)
  const space = ensureSpace(context, track.id, dest, ctrl)

  for (const item of selection) {
    let decoded = null
    try {
      decoded = await decodeZone(context, library, item.zone, rules, false)
    } catch (err) {
      continue
    }
    const source = context.createBufferSource()
    source.buffer = decoded.audio
    const semitones = item.zone.unpitched
      ? 0
      : Math.max(-rules.maxStretchSemitones, Math.min(rules.maxStretchSemitones, pitch - item.zone.pitchKeycenter))
    const rate = Math.pow(2, semitones / 12)
    source.playbackRate.value = rate
    if (decoded.loop && decoded.loopEnd - decoded.loopStart > 0.4) {
      source.loop = true
      source.loopStart = decoded.loopStart
      source.loopEnd = decoded.loopEnd
    }
    const peak = level * item.gain
    const gain = context.createGain()
    source.connect(gain)
    gain.connect(space.input)

    // A take that rings out on its own ignores the note length, exactly as it does live.
    if (item.zone.releaseMode === 'free') {
      gain.gain.setValueAtTime(peak, start)
      source.start(start)
      source.stop(start + decoded.audio.duration / rate + 0.02)
      continue
    }

    const hasSegment = decoded.releaseStart > 0 && decoded.releaseStart < decoded.audio.duration - 0.04
    const reachedTail = !decoded.loop && hold * rate >= decoded.releaseStart
    const decaying = item.zone.decays || item.zone.releaseMode === 'envelope'
    if (hasSegment && !reachedTail && !decaying) {
      const fade = Math.max(0.08, Math.min(0.14, item.zone.releaseCrossfadeSec || 0.08))
      const remaining = (decoded.audio.duration - decoded.releaseStart) / rate
      gain.gain.setValueAtTime(peak, start)
      crossfade(gain.gain, scaleCurve(FADE_OUT, peak), start + hold, fade)
      source.start(start)
      source.stop(start + hold + fade + 0.02)

      const tail = context.createBufferSource()
      tail.buffer = decoded.audio
      tail.playbackRate.value = rate
      const tailGain = context.createGain()
      tailGain.gain.setValueAtTime(0, start + hold)
      crossfade(tailGain.gain, scaleCurve(FADE_IN, peak), start + hold, fade)
      tail.connect(tailGain)
      tailGain.connect(space.input)
      tail.start(start + hold, decoded.releaseStart)
      tail.stop(start + hold + remaining + 0.02)
      continue
    }

    const release = decaying
      ? Math.max(0.12, Math.min(0.28, releaseSeconds(item.zone, ctrl) * 0.45))
      : Math.max(0.08, releaseSeconds(item.zone, ctrl))
    gain.gain.setValueAtTime(peak, start)
    crossfade(gain.gain, scaleCurve(FADE_OUT, peak), start + hold, release)
    source.start(start)
    source.stop(start + hold + release + 0.05)
  }
  return true
}
