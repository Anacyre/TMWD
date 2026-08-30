import { ensureFxWorklet, createChainNode, pushChain, createAnalyser } from '../dsp/runtime.js'
import { remoteProcessInserts, trackLaneKey, unassignedProcessInserts, laneInserts } from '../model/web-mixer.js'
import { dbToGain, dbFromFader, isTrackAudible, isBusAudible, SMOOTH_SEC, BUS_REVERB, BUS_DELAY } from '../model/mixer-model.js'
import { ROUTING_DIRECT, ROUTING_MIXER, ROUTING_FALLBACK } from './graph.js'

/** True when any lane in this mixer actually carries an insert. */
export function mixerHasInserts (webMixer) {
  if (!webMixer) return false
  const filled = (list) => (list || []).some((item) => item && item.pluginId)
  if (filled(webMixer.remote && webMixer.remote.inserts)) return true
  if (filled(webMixer.master && webMixer.master.inserts)) return true
  for (const bus of webMixer.buses || []) {
    if (filled(bus.inserts)) return true
  }
  const tracks = webMixer.tracks || {}
  for (const id of Object.keys(tracks)) {
    if (filled(tracks[id] && tracks[id].inserts)) return true
  }
  return false
}

/** Tracks whose audio is generated inside the browser and therefore owns its own strip. */
export function isWebOwnedTrack (track, options = {}) {
  if (!track || track.type === 'master' || track.type === 'group') return false
  if (track.source === 'web-sampler') return true
  if (track.source === 'm-orchestra') return true
  if (String(track.definitionId || '').startsWith('m_orch_')) return true
  return !!options.localPlayback && track.source !== 'remote-vst'
}

function smoothGain (node, value, context) {
  if (!node) return
  node.gain.setTargetAtTime(value, context.currentTime, SMOOTH_SEC)
}

function makeGain (ctx, value) {
  const node = ctx.createGain()
  node.gain.value = value
  return node
}

function safeDisconnect (node) {
  if (!node) return
  try { node.disconnect() } catch (err) { /* already disconnected */ }
}

/**
 * Collapse the send list into one level per destination bus. A bus input is a
 * sum, so summing the levels here is identical to one gain node per send and
 * keeps the per-track node count at four instead of twelve.
 */
function sendLevels (sends, audible) {
  const out = { preReverb: 0, preDelay: 0, postReverb: 0, postDelay: 0 }
  if (!audible) return out
  ;(sends || []).forEach((send) => {
    if (!send || !send.enabled) return
    const level = Math.min(1, Math.max(0, Number(send.level) || 0))
    if (level <= 0) return
    const bus = send.destination === BUS_DELAY ? 'Delay' : 'Reverb'
    out[(send.preFader ? 'pre' : 'post') + bus] += level
  })
  out.preReverb = Math.min(2, out.preReverb)
  out.preDelay = Math.min(2, out.preDelay)
  out.postReverb = Math.min(2, out.postReverb)
  out.postDelay = Math.min(2, out.postDelay)
  return out
}

function createLane (ctx, key, input) {
  return {
    key,
    input,
    preTap: makeGain(ctx, 1),
    chain: null,
    gain: makeGain(ctx, 1),
    pan: ctx.createStereoPanner(),
    analyser: createAnalyser(ctx),
    preReverb: makeGain(ctx, 0),
    preDelay: makeGain(ctx, 0),
    postReverb: makeGain(ctx, 0),
    postDelay: makeGain(ctx, 0),
    mode: ''
  }
}

function laneNodes (lane) {
  return [lane.input, lane.preTap, lane.chain, lane.gain, lane.pan, lane.analyser,
    lane.preReverb, lane.preDelay, lane.postReverb, lane.postDelay]
}

/**
 * (Re)build one strip. `mixer` mode runs FX + sends; `direct` mode keeps gain and
 * pan working before the worklet is ready so early notes are still controllable.
 */
function wireLane (graph, lane, mode) {
  laneNodes(lane).forEach(safeDisconnect)
  const nodes = graph.mixerNodes

  if (mode !== ROUTING_MIXER || !nodes) {
    lane.input.connect(lane.gain)
    lane.gain.connect(lane.pan)
    lane.pan.connect(lane.analyser)
    lane.analyser.connect(graph.master)
    lane.mode = ROUTING_DIRECT
    return
  }

  lane.input.connect(lane.preTap)
  if (lane.chain) {
    lane.preTap.connect(lane.chain)
    lane.chain.connect(lane.gain)
  } else {
    lane.preTap.connect(lane.gain)
  }
  lane.gain.connect(lane.pan)
  lane.pan.connect(lane.analyser)
  lane.analyser.connect(nodes.sum)

  lane.preTap.connect(lane.preReverb)
  lane.preTap.connect(lane.preDelay)
  lane.analyser.connect(lane.postReverb)
  lane.analyser.connect(lane.postDelay)
  lane.preReverb.connect(nodes.busReverbChain)
  lane.postReverb.connect(nodes.busReverbChain)
  lane.preDelay.connect(nodes.busDelayChain)
  lane.postDelay.connect(nodes.busDelayChain)
  lane.mode = ROUTING_MIXER
}

/** Attach the FX worklet chain for a lane the first time it actually needs one. */
function ensureLaneChain (graph, lane, inserts) {
  const wanted = (inserts || []).some((item) => item && item.pluginId)
  if (!wanted || lane.chain || !graph.mixerNodes) return false
  lane.chain = createChainNode(graph.context, (m) => {
    const cb = graph.mixerNodes && graph.mixerNodes.onMeters
    if (cb) cb(lane.key, m)
  })
  wireLane(graph, lane, ROUTING_MIXER)
  return true
}

/** Stable per-track strip. Created on demand so noteOn before attach still lands here. */
export function ensureTrackLane (graph, trackId) {
  if (!graph || !graph.context) return null
  const id = trackLaneKey(trackId)
  if (!id) return null
  if (!graph.trackLanes) graph.trackLanes = new Map()
  let lane = graph.trackLanes.get(id)
  if (lane) return lane
  lane = createLane(graph.context, 'track:' + id, makeGain(graph.context, 1))
  lane.trackId = id
  graph.trackLanes.set(id, lane)
  wireLane(graph, lane, graph.mixerNodes ? ROUTING_MIXER : ROUTING_DIRECT)
  return lane
}

/**
 * Node that a browser voice for `trackId` must connect to. Falls back to the
 * shared sampler bus only when there is no track identity at all.
 */
export function trackInputNode (graph, trackId) {
  const lane = ensureTrackLane(graph, trackId)
  if (lane) return lane.input
  if (!graph) return null
  return graph.samplerGain || graph.master || graph.context.destination
}

function setRouting (graph, mode, error, extra = {}) {
  if (!graph.routing) {
    graph.routing = { mode, error: '', fxAttached: false, attempts: 0, muted: false, bypassReason: '' }
  }
  graph.routing.mode = mode
  graph.routing.error = error || ''
  graph.routing.fxAttached = mode === ROUTING_MIXER
  graph.routing.muted = extra.muted === true
  graph.routing.bypassReason = extra.bypassReason || ''
  if (mode === ROUTING_MIXER) graph.routing.attempts = (graph.routing.attempts || 0) + 1
}

/**
 * Dry emergency path. Only legal when the graph has no inserts — otherwise a
 * failed worklet would play the mix as if every plugin had been removed.
 */
function applyLaneGain (lane, value) {
  if (!lane || !lane.gain) return
  lane.gain.gain.value = value
}

function wireDryBypass (graph, error) {
  safeDisconnect(graph.remoteGain)
  safeDisconnect(graph.samplerGain)
  safeDisconnect(graph.master)
  graph.remoteGain.connect(graph.master)
  graph.samplerGain.connect(graph.master)
  graph.master.connect(graph.context.destination)
  if (graph.master.gain) graph.master.gain.value = 1
  if (graph.trackLanes) {
    graph.trackLanes.forEach((lane) => {
      wireLane(graph, lane, ROUTING_DIRECT)
      applyLaneGain(lane, 1)
    })
  }
  setRouting(graph, error ? ROUTING_FALLBACK : ROUTING_DIRECT, error, {
    muted: false,
    bypassReason: error ? 'fx-attach-failed-dry' : ''
  })
}

/** Restore fader/pan when the FX worklet is missing so removing inserts can unmute. */
export function syncDirectLaneGains (graph, tracks = [], options = {}) {
  if (!graph || !graph.context) return
  const list = tracks || []
  const localPlayback = !!options.localPlayback
  const masterTrack = list.find((track) => track.type === 'master')
  const masterMute = !!(options.webMixer && options.webMixer.master && options.webMixer.master.mute)
  const masterDb = options.webMixer && options.webMixer.master && options.webMixer.master.volumeDb != null
    ? options.webMixer.master.volumeDb
    : dbFromFader(masterTrack ? masterTrack.volume : 0.8)
  const masterAudible = masterTrack ? !masterTrack.mute && !masterMute : !masterMute
  if (graph.master && graph.master.gain) graph.master.gain.value = masterAudible ? dbToGain(masterDb) : 0

  list.filter((track) => isWebOwnedTrack(track, { localPlayback })).forEach((track) => {
    const lane = ensureTrackLane(graph, track.id)
    if (!lane) return
    const gain = laneVolumeGain(track, list)
    applyLaneGain(lane, gain)
    if (lane.pan && lane.pan.pan) {
      lane.pan.pan.value = Math.min(1, Math.max(-1, Number(track.pan) || 0))
    }
  })
}

/**
 * Hold the output silent when inserts exist but the FX engine is unavailable.
 * Audio must not leak around the missing worklet.
 */
function wireMutedHold (graph, error) {
  safeDisconnect(graph.remoteGain)
  safeDisconnect(graph.samplerGain)
  safeDisconnect(graph.master)
  graph.remoteGain.connect(graph.master)
  graph.samplerGain.connect(graph.master)
  graph.master.connect(graph.context.destination)
  if (graph.master.gain) graph.master.gain.value = 0
  if (graph.trackLanes) {
    graph.trackLanes.forEach((lane) => {
      wireLane(graph, lane, ROUTING_DIRECT)
      if (lane.gain && lane.gain.gain) lane.gain.gain.value = 0
    })
  }
  setRouting(graph, ROUTING_FALLBACK, error, {
    muted: true,
    bypassReason: 'fx-attach-failed-inserts'
  })
}

function recoverFromAttachFailure (graph, error, webMixer) {
  const mixer = webMixer || graph.lastMixer
  if (mixerHasInserts(mixer)) {
    wireMutedHold(graph, error)
    return
  }
  wireDryBypass(graph, error)
}

export async function attachMixerGraph (graph, webMixer, onMeters, tracks = [], options = {}) {
  if (graph.mixerNodes) {
    graph.mixerNodes.onMeters = onMeters
    syncMixerGraph(graph, webMixer, tracks, options)
    return graph.mixerNodes
  }
  graph.lastMixer = webMixer || graph.lastMixer
  try {
    await ensureFxWorklet(graph.context)
  } catch (err) {
    recoverFromAttachFailure(graph, err.message || String(err), webMixer)
    throw err
  }
  if (graph.mixerNodes) {
    graph.mixerNodes.onMeters = onMeters
    syncMixerGraph(graph, webMixer, tracks, options)
    return graph.mixerNodes
  }

  const ctx = graph.context
  const nodes = {
    onMeters,
    sum: makeGain(ctx, 1),
    busReverbChain: createChainNode(ctx, (m) => nodes.onMeters && nodes.onMeters('bus', m)),
    busDelayChain: createChainNode(ctx, (m) => nodes.onMeters && nodes.onMeters('delay', m)),
    masterChain: createChainNode(ctx, (m) => nodes.onMeters && nodes.onMeters('master', m)),
    analyserBus: createAnalyser(ctx),
    analyserDelay: createAnalyser(ctx),
    analyserMaster: createAnalyser(ctx),
    busReverbGain: makeGain(ctx, 1),
    busDelayGain: makeGain(ctx, 1)
  }
  graph.mixerNodes = nodes

  nodes.remote = createLane(ctx, 'remote', graph.remoteGain)
  nodes.sampler = createLane(ctx, 'sampler', graph.samplerGain)
  nodes.remote.chain = createChainNode(ctx, (m) => nodes.onMeters && nodes.onMeters('remote', m))
  nodes.sampler.chain = createChainNode(ctx, (m) => nodes.onMeters && nodes.onMeters('sampler', m))

  safeDisconnect(graph.remoteGain)
  safeDisconnect(graph.samplerGain)
  safeDisconnect(graph.master)

  wireLane(graph, nodes.remote, ROUTING_MIXER)
  wireLane(graph, nodes.sampler, ROUTING_MIXER)

  nodes.busReverbChain.connect(nodes.analyserBus)
  nodes.analyserBus.connect(nodes.busReverbGain)
  nodes.busReverbGain.connect(nodes.sum)

  nodes.busDelayChain.connect(nodes.analyserDelay)
  nodes.analyserDelay.connect(nodes.busDelayGain)
  nodes.busDelayGain.connect(nodes.sum)

  nodes.sum.connect(nodes.masterChain)
  nodes.masterChain.connect(nodes.analyserMaster)
  nodes.analyserMaster.connect(graph.master)
  graph.master.connect(ctx.destination)

  if (graph.trackLanes) {
    graph.trackLanes.forEach((lane) => wireLane(graph, lane, ROUTING_MIXER))
  }

  setRouting(graph, ROUTING_MIXER, '')
  syncMixerGraph(graph, webMixer, tracks, options)
  return nodes
}

export function getLaneAnalyser (graph, laneKey) {
  if (!graph || !graph.mixerNodes) return null
  const nodes = graph.mixerNodes
  const key = typeof laneKey === 'string' ? laneKey : ''
  if (key.startsWith('track:')) {
    const lane = graph.trackLanes && graph.trackLanes.get(key.slice(6))
    return lane ? lane.analyser : nodes.sampler.analyser
  }
  if (key.startsWith('master')) return nodes.analyserMaster
  if (key.startsWith('delay')) return nodes.analyserDelay
  if (key.startsWith('bus')) return nodes.analyserBus
  if (key.startsWith('sampler') || key === 'track') return nodes.sampler.analyser
  return nodes.remote.analyser
}

export function detachMixerGraph (graph) {
  const nodes = graph && graph.mixerNodes
  if (!nodes) return
  ;[nodes.remote, nodes.sampler].forEach((lane) => laneNodes(lane).forEach(safeDisconnect))
  Object.keys(nodes).forEach((key) => {
    const node = nodes[key]
    if (node && typeof node.disconnect === 'function') safeDisconnect(node)
  })
  graph.mixerNodes = null
  wireDryBypass(graph, '')
}

/** Reconnect a safe path when mixer nodes are missing (HMR, device switch). */
export function ensureOutputRouting (graph, webMixer, tracks = [], options = {}) {
  if (!graph || !graph.context || !graph.master) return
  if (graph.mixerNodes) return
  const mixer = webMixer || graph.lastMixer
  const error = graph.routing ? graph.routing.error : ''
  recoverFromAttachFailure(graph, error, mixer)
  if (!graph.routing || !graph.routing.muted) {
    syncDirectLaneGains(graph, tracks, { ...options, webMixer: mixer })
  }
}

export function routingSnapshot (graph) {
  if (!graph) {
    return {
      mode: 'none',
      error: 'No AudioContext',
      fxAttached: false,
      muted: false,
      bypassReason: '',
      lanes: [],
      laneInfo: []
    }
  }
  const routing = graph.routing || { mode: ROUTING_DIRECT, error: '', fxAttached: false }
  const lanes = []
  const laneInfo = []
  const describe = (key, lane) => {
    lanes.push(key)
    laneInfo.push({
      key,
      mode: (lane && lane.mode) || routing.mode,
      hasChain: !!(lane && lane.chain),
      fxAttached: !!(lane && lane.chain)
    })
  }
  if (graph.mixerNodes) {
    describe('remote', graph.mixerNodes.remote)
    describe('sampler', graph.mixerNodes.sampler)
    lanes.push('bus', 'delay', 'master')
    laneInfo.push(
      { key: 'bus', mode: routing.mode, hasChain: true, fxAttached: !!routing.fxAttached },
      { key: 'delay', mode: routing.mode, hasChain: true, fxAttached: !!routing.fxAttached },
      { key: 'master', mode: routing.mode, hasChain: true, fxAttached: !!routing.fxAttached }
    )
  }
  if (graph.trackLanes) graph.trackLanes.forEach((lane) => describe(lane.key, lane))
  return {
    mode: routing.mode,
    error: routing.error,
    fxAttached: !!routing.fxAttached,
    muted: !!routing.muted,
    bypassReason: routing.bypassReason || '',
    lanes,
    laneInfo
  }
}

function laneVolumeGain (track, tracks) {
  if (!track) return 1
  const db = track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume)
  return isTrackAudible(track, tracks) ? dbToGain(db) : 0
}

function syncLaneStrip (graph, lane, ctx, opts) {
  const { gain, pan, sends, inserts, audible } = opts
  const rebuilt = ensureLaneChain(graph, lane, inserts)
  smoothGain(lane.gain, gain, ctx)
  lane.pan.pan.setTargetAtTime(Math.min(1, Math.max(-1, Number(pan) || 0)), ctx.currentTime, SMOOTH_SEC)
  const levels = sendLevels(sends, audible)
  smoothGain(lane.preReverb, levels.preReverb, ctx)
  smoothGain(lane.preDelay, levels.preDelay, ctx)
  smoothGain(lane.postReverb, levels.postReverb, ctx)
  smoothGain(lane.postDelay, levels.postDelay, ctx)
  if (lane.chain) pushChain(lane.chain, inserts)
  return rebuilt
}

export function syncMixerGraph (graph, webMixer, tracks = [], options = {}) {
  if (!graph || !webMixer) return
  graph.lastMixer = webMixer
  if (!graph.mixerNodes) {
    if (mixerHasInserts(webMixer) && graph.routing && graph.routing.muted) return
    syncDirectLaneGains(graph, tracks, { ...options, webMixer })
    return
  }
  const ctx = graph.context
  const nodes = graph.mixerNodes
  const localPlayback = !!options.localPlayback
  const list = tracks || []

  const webTracks = list.filter((track) => isWebOwnedTrack(track, { localPlayback }))
  const seen = new Set()
  webTracks.forEach((track) => {
    const id = trackLaneKey(track.id)
    if (!id) return
    seen.add(id)
    const lane = ensureTrackLane(graph, id)
    if (!lane) return
    const laneMix = (webMixer.tracks && (webMixer.tracks[id] || webMixer.tracks[track.id])) || null
    syncLaneStrip(graph, lane, ctx, {
      gain: laneVolumeGain(track, list),
      // The track record is what the mixer UI writes; the lane is its mirror.
      pan: track.pan != null ? track.pan : (laneMix ? laneMix.pan : 0),
      sends: laneMix ? laneMix.sends : null,
      inserts: laneInserts(webMixer, { type: 'track', id }).filter(Boolean),
      audible: isTrackAudible(track, list)
    })
  })

  // Strips whose track disappeared must stop feeding the sum.
  if (graph.trackLanes) {
    graph.trackLanes.forEach((lane, id) => {
      if (seen.has(id)) return
      smoothGain(lane.gain, 0, ctx)
      smoothGain(lane.preReverb, 0, ctx)
      smoothGain(lane.preDelay, 0, ctx)
      smoothGain(lane.postReverb, 0, ctx)
      smoothGain(lane.postDelay, 0, ctx)
    })
  }

  // Native VST sum tap: gain/pan/track FX already applied on the engine side.
  syncLaneStrip(graph, nodes.remote, ctx, {
    gain: 1,
    pan: 0,
    sends: (webMixer.remote && webMixer.remote.sends) || null,
    inserts: remoteProcessInserts(webMixer),
    audible: true
  })

  // Voices without a resolvable track id (previews, metronome-free fallbacks).
  syncLaneStrip(graph, nodes.sampler, ctx, {
    gain: 1,
    pan: 0,
    sends: null,
    inserts: unassignedProcessInserts(webMixer),
    audible: false
  })

  const buses = webMixer.buses || []
  const reverb = buses.find((bus) => bus.id === BUS_REVERB) || buses[0]
  const delay = buses.find((bus) => bus.id === BUS_DELAY) || buses[1]
  const busGain = (bus) => {
    if (!bus || !isBusAudible(bus, buses)) return 0
    if (bus.volumeDb != null) return dbToGain(bus.volumeDb)
    return bus.volume == null ? 1 : bus.volume
  }
  smoothGain(nodes.busReverbGain, busGain(reverb), ctx)
  smoothGain(nodes.busDelayGain, busGain(delay), ctx)

  const masterMute = !!(webMixer.master && webMixer.master.mute)
  const masterTrack = list.find((track) => track.type === 'master')
  const masterDb = webMixer.master && webMixer.master.volumeDb != null
    ? webMixer.master.volumeDb
    : dbFromFader(masterTrack ? masterTrack.volume : 0.8)
  const masterAudible = masterTrack ? !masterTrack.mute && !masterMute : !masterMute
  smoothGain(graph.master, masterAudible ? dbToGain(masterDb) : 0, ctx)

  pushChain(nodes.busReverbChain, reverb ? (reverb.inserts || []).filter(Boolean) : [])
  pushChain(nodes.busDelayChain, delay ? (delay.inserts || []).filter(Boolean) : [])
  pushChain(nodes.masterChain, (webMixer.master.inserts || []).filter(Boolean))
}
