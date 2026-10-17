/** SoundFont / dropped-WAV sampler. Same noteOn/noteOff/cancelPending surface as Orchestra V. */

import { trackInputNode } from '../mixer-graph.js'
import { parseSf2, selectSf2Zone, zoneFromBuffer } from './parse.js'

const pending = new Map()
const voices = new Map()
const libraries = new Map()
const orphanOffs = new Set()
let noteEpoch = 0

function voiceKey (trackId, pitch, id) {
  if (id) return String(id)
  return String(trackId) + ':' + pitch
}

function rememberOrphanOff (pitchOrKey, trackId) {
  orphanOffs.add(voiceKey(trackId, pitchOrKey, pitchOrKey))
}

function consumeOrphanOff (trackId, pitch, id) {
  const key = voiceKey(trackId, pitch, id)
  if (!orphanOffs.has(key)) return false
  orphanOffs.delete(key)
  return true
}

function overlayPatch (zone, patch) {
  if (!zone) return null
  if (!patch) return zone
  return {
    ...zone,
    attack: patch.attack != null ? Number(patch.attack) : zone.attack,
    decay: patch.decay != null ? Number(patch.decay) : zone.decay,
    sustain: patch.sustain != null ? Number(patch.sustain) : zone.sustain,
    release: patch.release != null ? Number(patch.release) : zone.release
  }
}

function bufferFromZone (context, zone) {
  if (zone.audioBuffer && zone.audioBuffer.sampleRate === context.sampleRate) return zone.audioBuffer
  const sr = zone.sampleRate || context.sampleRate
  const buffer = context.createBuffer(1, Math.max(1, zone.pcm.length), sr)
  buffer.getChannelData(0).set(zone.pcm)
  zone.audioBuffer = buffer
  return buffer
}

function adsrGain (gainNode, context, zone, velocity, when) {
  const now = when == null ? context.currentTime : Math.max(context.currentTime, when)
  const peak = Math.max(0.0001, zone.gain * Math.max(0.05, velocity))
  const a = Math.max(0.001, zone.attack || 0.005)
  const h = Math.max(0, zone.hold || 0)
  const d = Math.max(0.001, zone.decay || 0.12)
  const s = Math.max(0.0001, (zone.sustain == null ? 0.8 : zone.sustain) * peak)
  gainNode.gain.cancelScheduledValues(now)
  gainNode.gain.setValueAtTime(0.0001, now)
  gainNode.gain.linearRampToValueAtTime(peak, now + a)
  gainNode.gain.setValueAtTime(peak, now + a + h)
  gainNode.gain.linearRampToValueAtTime(s, now + a + h + d)
}

export function installLibrary (id, parsed) {
  libraries.set(String(id), parsed)
  return parsed
}

export function libraryOf (id) {
  return libraries.get(String(id)) || null
}

export async function loadSf2Buffer (id, buffer) {
  const parsed = parseSf2(buffer)
  return installLibrary(id, parsed)
}

export function loadPcmZone (id, pcm, options) {
  const zone = zoneFromBuffer(pcm, options)
  return installLibrary(id, { name: zone.preset, presets: [{ name: zone.preset, bank: 0, program: 0 }], zones: [zone] })
}

export function noteReady (graph, track, pitch, velocity) {
  const lib = libraryOf(track && (track.sf2Id || track.definitionId))
  if (!lib) return false
  const vel = Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)
  return !!selectSf2Zone(lib.zones, pitch, vel)
}

export async function preloadNotes () { return true }

export async function noteOn (graph, track, pitch, velocity = 0.8, id, when) {
  if (!graph || !track) return null
  const key = voiceKey(track.id, pitch, id)
  const epoch = noteEpoch
  pending.set(key, { cancelled: consumeOrphanOff(track.id, pitch, id), epoch })
  if (graph.context.state === 'suspended') {
    try { await graph.context.resume() } catch (err) { /* autoplay */ }
  }
  const lib = libraryOf(track.sf2Id || track.definitionId)
  if (!lib) {
    pending.delete(key)
    return null
  }
  const vel = Math.round(Math.max(0.05, Math.min(1, velocity)) * 127)
  const zone = overlayPatch(selectSf2Zone(lib.zones, pitch, vel), track.sf2Patch)
  const entry = pending.get(key)
  pending.delete(key)
  if (!zone || !entry || entry.epoch !== noteEpoch) return null
  const context = graph.context
  const dest = trackInputNode(graph, track.id) || graph.destination || context.destination
  const src = context.createBufferSource()
  src.buffer = bufferFromZone(context, zone)
  const semitones = (pitch - zone.rootKey) + (zone.coarseTune || 0) + (zone.fineTune || 0) / 100
  src.playbackRate.value = Math.pow(2, semitones / 12)
  if (zone.loop && zone.loopEnd > zone.loopStart + 4) {
    src.loop = true
    src.loopStart = zone.loopStart / zone.sampleRate
    src.loopEnd = zone.loopEnd / zone.sampleRate
  }
  const gain = context.createGain()
  const pan = context.createStereoPanner ? context.createStereoPanner() : null
  if (pan) pan.pan.value = zone.pan || 0
  src.connect(gain)
  if (pan) {
    gain.connect(pan)
    pan.connect(dest)
  } else gain.connect(dest)
  const startAt = when == null ? context.currentTime : Math.max(context.currentTime, when)
  adsrGain(gain, context, zone, velocity, startAt)
  src.start(startAt)
  const voice = { src, gain, zone, trackId: track.id, startedAt: startAt }
  voices.set(key, voice)
  if (entry.cancelled) {
    noteOff(key, track.id)
  }
  return key
}

export function cancelPending (pitchOrKey, trackId) {
  const key = voiceKey(trackId, pitchOrKey, pitchOrKey)
  const entry = pending.get(key)
  if (entry) entry.cancelled = true
}

export function noteOff (pitchOrKey, trackId) {
  const key = voiceKey(trackId, pitchOrKey, pitchOrKey)
  const entry = pending.get(key)
  if (entry) entry.cancelled = true
  const voice = voices.get(key)
  if (!voice) {
    rememberOrphanOff(pitchOrKey, trackId)
    return
  }
  voices.delete(key)
  const now = voice.gain.context.currentTime
  const rel = Math.max(0.02, (voice.zone && voice.zone.release) || 0.2)
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now)
  voice.gain.gain.linearRampToValueAtTime(0.0001, now + rel)
  try { voice.src.stop(now + rel + 0.02) } catch (err) { /* stopped */ }
}

export function allNotesOff () {
  noteEpoch += 1
  pending.forEach((entry) => { entry.cancelled = true })
  pending.clear()
  orphanOffs.clear()
  Array.from(voices.keys()).forEach((key) => noteOff(key))
}

export function applyControllers () {}

export async function renderNoteAt (context, dest, track, pitch, velocity, startSec, durationSec) {
  const lib = libraryOf(track && (track.sf2Id || track.definitionId))
  if (!lib) return
  const zone = selectSf2Zone(lib.zones, pitch, Math.round(velocity * 127))
  if (!zone) return
  const src = context.createBufferSource()
  src.buffer = bufferFromZone(context, zone)
  src.playbackRate.value = Math.pow(2, (pitch - zone.rootKey) / 12)
  const gain = context.createGain()
  adsrGain(gain, context, zone, velocity, startSec)
  const end = startSec + Math.max(0.05, durationSec)
  gain.gain.setValueAtTime(Math.max(0.0001, zone.gain * velocity * (zone.sustain == null ? 0.8 : zone.sustain)), Math.max(startSec, end))
  gain.gain.linearRampToValueAtTime(0.0001, end + Math.max(0.02, zone.release || 0.2))
  src.connect(gain)
  gain.connect(dest)
  src.start(startSec)
  src.stop(end + (zone.release || 0.2) + 0.05)
}
