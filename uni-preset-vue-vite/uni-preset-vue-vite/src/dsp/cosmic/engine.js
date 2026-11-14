/** Cosmic 2 instrument. One same-origin worklet node per track when the dev server emits it, buffers otherwise. */

import { trackInputNode } from '../../audio/mixer-graph.js'
import { renderCosmicNote } from './voice.js'
import { defaultCosmicState, normalizeCosmicState } from './dsp.js'

const pending = new Map()
const voices = new Map()
const contextNodes = new WeakMap()
const liveNodes = new Set()
const orphanOffs = new Set()
const scopeListeners = new Set()
const liveListeners = new Set()
const watched = new Set()
let noteEpoch = 0
let modulePromise = null
let transportBpm = 120
let performance = { bend: 0, wheel: 0, after: 0 }

function voiceKey (trackId, pitch, id) {
  if (id) return String(id)
  return String(trackId) + ':' + pitch
}

function stateOf (track) {
  return normalizeCosmicState((track && track.cosmicState) || defaultCosmicState())
}

export function cosmicWorkletUrl () {
  try {
    if (typeof document !== 'undefined' && document.baseURI) return new URL('daw-cosmic.js', document.baseURI).href
  } catch (err) { /* ignore */ }
  return '/daw-cosmic.js'
}

function nodesOf (context) {
  let map = contextNodes.get(context)
  if (!map) {
    map = new Map()
    contextNodes.set(context, map)
  }
  return map
}

function nodeFor (graph, track) {
  if (!graph || !graph.context || !track) return null
  return nodesOf(graph.context).get(String(track.id)) || null
}

function emit (set, msg) {
  set.forEach((fn) => {
    try { fn(msg) } catch (err) { /* listener */ }
  })
}

async function ensureWorklet (context, track) {
  if (!context || !context.audioWorklet || typeof AudioWorkletNode !== 'function') return null
  if (!modulePromise) {
    const url = cosmicWorkletUrl()
    modulePromise = context.audioWorklet.addModule(url).catch((err) => {
      modulePromise = null
      throw err
    })
  }
  try { await modulePromise } catch (err) { return null }
  const id = String(track.id)
  const map = nodesOf(context)
  let node = map.get(id)
  if (node) return node
  try {
    node = new AudioWorkletNode(context, 'daw-cosmic', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2]
    })
  } catch (err) {
    return null
  }
  node._trackId = id
  node.port.onmessage = (event) => {
    const msg = event.data || {}
    msg.trackId = id
    if (msg.type === 'scope') emit(scopeListeners, msg)
    else if (msg.type === 'live') emit(liveListeners, msg)
  }
  map.set(id, node)
  liveNodes.add(node)
  if (watched.has(id)) post(node, { type: 'watch', on: true })
  return node
}

function destOf (graph, track) {
  return trackInputNode(graph, track.id) || graph.destination || graph.context.destination
}

function post (node, message) {
  if (node) node.port.postMessage(message)
}

export function noteReady () { return true }
export async function preloadNotes () { return true }

/** Scope frames ({ trackId, peak, samples }) for watched tracks. */
export function onCosmicScope (fn) {
  scopeListeners.add(fn)
  return () => scopeListeners.delete(fn)
}

/** Live modulation ({ trackId, voices, live, lfo }) for watched tracks, about 30 times a second. */
export function onCosmicLive (fn) {
  liveListeners.add(fn)
  return () => liveListeners.delete(fn)
}

/** The worklet only streams scope and live values while an editor watches the track. */
export function watchCosmic (graph, track, on) {
  if (!track) return
  const id = String(track.id)
  if (on) watched.add(id)
  else watched.delete(id)
  post(nodeFor(graph, track), { type: 'watch', on: !!on })
}

export function setClock (bpm) {
  transportBpm = Math.max(20, Number(bpm) || 120)
  liveNodes.forEach((node) => post(node, { type: 'clock', bpm: transportBpm }))
}

export function setPerformance (graph, next) {
  performance = {
    bend: Number(next && next.bend) || 0,
    wheel: Math.min(1, Math.max(0, Number(next && next.wheel) || 0)),
    after: Math.min(1, Math.max(0, Number(next && next.after) || 0))
  }
  liveNodes.forEach((node) => post(node, { type: 'perf', perf: performance }))
}

export function applyControllers (track) {
  const nodeList = []
  return track && nodeList
}

export function updateCosmicState (graph, track) {
  const node = nodeFor(graph, track)
  post(node, { type: 'state', state: stateOf(track) })
  post(node, { type: 'clock', bpm: transportBpm })
  post(node, { type: 'perf', perf: performance })
}

function wire (node, dest) {
  if (node._wired === dest) return
  if (node._wired) {
    try { node.disconnect() } catch (err) { /* rewire */ }
  }
  node.connect(dest)
  node._wired = dest
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
  const node = await ensureWorklet(context, track)
  if (node) {
    wire(node, dest)
    post(node, { type: 'state', state: stateOf(track) })
    post(node, { type: 'clock', bpm: transportBpm })
    post(node, { type: 'perf', perf: performance })
    post(node, { type: 'noteOn', pitch, velocity, key, trackId: track.id })
    voices.set(key, { kind: 'worklet', node, pitch, trackId: track.id })
    if (entry.cancelled) noteOff(key, track.id)
    return key
  }
  const rendered = renderCosmicNote({
    pitch,
    velocity,
    state: stateOf(track),
    sampleRate: context.sampleRate,
    gateSec: 6,
    bpm: transportBpm
  })
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
    voice.node.port.postMessage({ type: 'noteOff', pitch: voice.pitch, key, trackId: voice.trackId })
    voices.delete(key)
    return
  }
  voices.delete(key)
  const now = voice.gain.context.currentTime
  voice.gain.gain.cancelScheduledValues(now)
  voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now)
  voice.gain.gain.linearRampToValueAtTime(0.0001, now + 0.2)
  try { voice.src.stop(now + 0.22) } catch (err) { /* already stopped */ }
}

export function allNotesOff () {
  noteEpoch += 1
  pending.forEach((entry) => { entry.cancelled = true })
  pending.clear()
  orphanOffs.clear()
  liveNodes.forEach((node) => node.port.postMessage({ type: 'allOff' }))
  Array.from(voices.entries()).forEach(([key, voice]) => {
    if (voice.kind !== 'worklet') noteOff(key)
  })
  voices.clear()
}

export async function renderNoteAt (context, dest, track, pitch, velocity, startSec, durationSec) {
  const rendered = renderCosmicNote({
    pitch,
    velocity,
    state: stateOf(track),
    sampleRate: context.sampleRate,
    gateSec: durationSec,
    bpm: transportBpm
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

export function setTransportBpm (bpm) {
  transportBpm = Math.max(20, Number(bpm) || 120)
}
