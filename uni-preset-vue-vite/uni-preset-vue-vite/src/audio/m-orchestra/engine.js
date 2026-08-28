import JSZip from 'jszip'
import { publicOrchestraUrl } from '../../lib/supabase.js'
import bundled from './manifest.json'

const TECHNIQUE_ARTIC = {
  m_orch_long: 'long',
  m_orch_short: 'short',
  m_orch_hit: 'hit'
}

let manifest = bundled
let loadPromise = null
const zipCache = new Map()
const bufferCache = new Map()
const voices = new Map()

function durationQuality (entry, artic) {
  const lower = String(entry || '').toLowerCase()
  if (artic === 'short') {
    if (lower.includes('_025_')) return 3
    if (lower.includes('_05_')) return 2
    return 0
  }
  if (lower.includes('very-long')) return 4
  if (lower.includes('_long_')) return 3
  if (lower.includes('_15_')) return 2
  if (lower.includes('_1_')) return 1
  return 0
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

export function pickSample (spec, artic, midiNote, dynamics) {
  if (!spec || !manifest || !manifest.samples) return null
  let best = null
  let bestScore = 1e9
  const targetDyn = Math.max(1, Math.min(127, dynamics || 100))
  const folder = spec.percFolder ? String(spec.percFolder).toLowerCase() + '/' : ''
  for (const sample of manifest.samples) {
    if (sample.pack !== spec.pack || sample.articulation !== artic) continue
    if (folder && !String(sample.entry).toLowerCase().startsWith(folder)) continue
    const noteDelta = sample.unpitched ? 0 : Math.abs(sample.rootNote - midiNote)
    if (noteDelta > 7) continue
    const dynDelta = Math.abs(sample.dynamicLayer - targetDyn) / 127
    const quality = 4 - durationQuality(sample.entry, artic)
    const score = noteDelta * 8 + dynDelta * 3 + quality * 0.35
    if (score < bestScore) {
      bestScore = score
      best = sample
    }
  }
  return best
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

async function decodeSample (context, sample) {
  const key = sample.pack + '|' + sample.entry
  if (bufferCache.has(key)) return bufferCache.get(key)
  const zip = await fetchZip(sample.pack)
  const file = zip.file(sample.entry)
  if (!file) throw new Error('missing ' + sample.entry)
  const bytes = await file.async('arraybuffer')
  const audio = await context.decodeAudioData(bytes.slice(0))
  const decoded = { audio, loop: !!sample.loop, rootNote: sample.rootNote, unpitched: !!sample.unpitched }
  bufferCache.set(key, decoded)
  return decoded
}

export async function ensureManifest () {
  if (loadPromise) return loadPromise
  loadPromise = (async () => {
    try {
      const response = await fetch(publicOrchestraUrl('manifest.json'))
      if (response.ok) manifest = await response.json()
    } catch (err) {
      console.warn('[m-orchestra] using bundled manifest', err)
    }
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

export async function noteOn (graph, track, pitch, velocity = 0.8, id) {
  if (!graph || !track) return null
  await ensureManifest()
  const spec = findInstrument(track.definitionId)
  if (!spec) return null
  const artic = articForTrack(track, spec)
  const sample = pickSample(spec, artic, pitch, dynamicsForTrack(track))
  if (!sample) return null
  const decoded = await decodeSample(graph.context, sample)
  noteOff(id || pitch, track.id)
  const dest = graph.samplerGain || graph.master || graph.context.destination
  const gain = graph.context.createGain()
  const expr = ((track.controllerValues || {}).expression)
  const exprNorm = expr == null ? 0.8 : (expr > 1 ? expr / 127 : expr)
  gain.gain.value = Math.max(0.05, velocity) * Math.max(0.15, exprNorm) * (spec.solo ? 0.9 : 0.55)
  gain.connect(dest)
  const sources = []
  const copies = Math.max(1, Math.min(2, spec.sourceVoices || 1))
  const rate = decoded.unpitched ? 1 : Math.pow(2, (pitch - decoded.rootNote) / 12)
  for (let i = 0; i < copies; i++) {
    const src = graph.context.createBufferSource()
    src.buffer = decoded.audio
    src.playbackRate.value = rate * (i === 0 ? 1 : 1.003)
    if (decoded.loop && decoded.audio.duration > 0.4) {
      src.loop = true
      src.loopStart = decoded.audio.duration * 0.38
      src.loopEnd = decoded.audio.duration * 0.82
    }
    src.connect(gain)
    src.start()
    sources.push(src)
  }
  const key = voiceKey(track.id, pitch, id)
  voices.set(key, { sources, gain })
  return key
}

export function noteOff (pitchOrKey, trackId) {
  const keys = []
  if (typeof pitchOrKey === 'string' && pitchOrKey.includes(':')) keys.push(pitchOrKey)
  else {
    const pitch = pitchOrKey
    voices.forEach((_, key) => {
      if (key.startsWith(String(trackId || 0) + ':' + pitch + ':') || key.endsWith(':' + pitch)) keys.push(key)
    })
  }
  keys.forEach((key) => {
    const voice = voices.get(key)
    if (!voice) return
    const now = voice.gain.context.currentTime
    voice.gain.gain.cancelScheduledValues(now)
    voice.gain.gain.setTargetAtTime(0, now, 0.04)
    setTimeout(() => {
      voice.sources.forEach((src) => { try { src.stop() } catch (err) { /* ended */ } })
      try { voice.gain.disconnect() } catch (err) { /* already */ }
    }, 250)
    voices.delete(key)
  })
}

export function allNotesOff () {
  Array.from(voices.keys()).forEach((key) => noteOff(key))
}

export async function preloadInstrument (graph, definitionId) {
  await ensureManifest()
  const spec = findInstrument(definitionId)
  if (!spec || !graph) return
  await fetchZip(spec.pack)
  const arts = spec.articulations || ['long']
  for (const artic of arts) {
    const sample = pickSample(spec, artic, 60, 100)
    if (sample) {
      try { await decodeSample(graph.context, sample) } catch (err) { console.warn('[m-orchestra] preload', err) }
    }
  }
}
