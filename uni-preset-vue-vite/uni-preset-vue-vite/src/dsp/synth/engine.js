/** Twin instrument: AudioWorklet when available, rendered buffers otherwise. */

import { trackInputNode } from '../../audio/mixer-graph.js'
import { TWIN_PLUGIN_ID, defaultTwinState, normalizeTwinState } from './params.js'
import { TWIN_WORKLET_SOURCE } from './worklet-source.js'
import { renderTwinNote } from './voice.js'

const pending = new Map()
const voices = new Map()
const nodes = new WeakMap()
const orphanOffs = new Set()
let noteEpoch = 0
let modulePromise = null

function voiceKey (trackId, pitch, id) {
  if (id) return String(id)
  return String(trackId) + ':' + pitch
}

function stateOf (track) {
  return normalizeTwinState((track && track.twinState) || defaultTwinState())
}

async function ensureWorklet (context) {
  if (!context || !context.audioWorklet) return null
  if (!modulePromise) {
    const blob = new Blob([TWIN_WORKLET_SOURCE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    modulePromise = context.audioWorklet.addModule(url).then(() => url).catch((err) => {
      modulePromise = null
      throw err
    })
  }
  try { await modulePromise } catch (err) { return null }
  let node = nodes.get(context)
  if (node) return node
  try {
    node = new AudioWorkletNode(context, 'daw-twin', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })
  } catch (err) {
    return null
  }
  nodes.set(context, node)
  return node
}

function destOf (graph, track) {
  return trackInputNode(graph, track.id) || graph.destination || graph.context.destination
}

export function noteReady () { return true }
export async function preloadNotes () { return true }
export function applyControllers () {}

export function updateTwinState (graph, track) {
  const node = graph && graph.context && nodes.get(graph.context)
  if (node) node.port.postMessage({ type: 'state', state: stateOf(track) })
}

export async function noteOn (graph, track, pitch, velocity = 0.8, id, when) {
  if (!graph || !track) return null
  const key = voiceKey(track.id, pitch, id)
  const epoch = noteEpoch
  pending.set(key, { cancelled: orphanOffs.delete(key), epoch })
  if (graph.context.state === 'suspended') {
    try { await graph.context.resume() } catch (err) { /* autoplay */ }
  }
  const entry = pending.get(key)
  pending.delete(key)
  if (!entry || entry.epoch !== noteEpoch) return null
  const context = graph.context
  const dest = destOf(graph, track)
  const node = await ensureWorklet(context)
  if (node) {
    if (!node._wired) {
      node.connect(dest)
      node._wired = dest
    } else if (node._wired !== dest) {
      try { node.disconnect() } catch (err) { /* */ }
      node.connect(dest)
      node._wired = dest
    }
    node.port.postMessage({ type: 'state', state: stateOf(track) })
    node.port.postMessage({ type: 'noteOn', pitch, velocity, key })
    voices.set(key, { kind: 'worklet', node, pitch, trackId: track.id })
    if (entry.cancelled) noteOff(key, track.id)
    return key
  }
  const rendered = renderTwinNote({ pitch, velocity, state: stateOf(track), sampleRate: context.sampleRate, gateSec: 8 })
  const buffer = context.createBuffer(2, rendered.L.length, rendered.sampleRate)
  buffer.getChannelData(0).set(rendered.L)
  buffer.getChannelData(1).set(rendered.R)
  const src = context.createBufferSource()
  src.buffer = buffer
  const gain = context.createGain()
  src.connect(gain)
  gain.connect(dest)
  const startAt = when == null ? context.currentTime : Math.max(context.currentTime, when)
  src.start(startAt)
  voices.set(key, { kind: 'buffer', src, gain, pitch, trackId: track.id })
  if (entry.cancelled) noteOff(key, track.id)
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
    orphanOffs.add(key)
    return
  }
  if (voice.kind === 'worklet') {
    voice.node.port.postMessage({ type: 'noteOff', pitch: voice.pitch, key })
    voices.delete(key)
    return
  }
  voices.delete(key)
  const now = voice.gain.context.currentTime
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now)
  voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.2)
  try { voice.src.stop(now + 0.22) } catch (err) { /* */ }
}

export function allNotesOff () {
  noteEpoch += 1
  pending.forEach((e) => { e.cancelled = true })
  pending.clear()
  orphanOffs.clear()
  Array.from(voices.entries()).forEach(([key, voice]) => {
    if (voice.kind === 'worklet') voice.node.port.postMessage({ type: 'allOff' })
    else noteOff(key)
  })
  voices.clear()
}

export async function renderNoteAt (context, dest, track, pitch, velocity, startSec, durationSec) {
  const rendered = renderTwinNote({
    pitch,
    velocity,
    state: stateOf(track),
    sampleRate: context.sampleRate,
    gateSec: durationSec
  })
  const buffer = context.createBuffer(2, rendered.L.length, rendered.sampleRate)
  buffer.getChannelData(0).set(rendered.L)
  buffer.getChannelData(1).set(rendered.R)
  const src = context.createBufferSource()
  src.buffer = buffer
  src.connect(dest)
  src.start(startSec)
  src.stop(startSec + rendered.duration)
}

export { TWIN_PLUGIN_ID }
