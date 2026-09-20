import { createInsert, uid } from '../dsp/plugin.js'
import { plugins } from '../dsp/registry.js'
import {
  MIXER_INSERT_SLOTS,
  MIXER_VERSION,
  defaultMixer,
  defaultSends,
  defaultTrackMix,
  emptyInserts,
  filledInsertCount,
  normalizeInserts as packInserts,
  normalizeSends,
  validateMixer,
  BUS_REVERB,
  BUS_DELAY
} from './mixer-model.js'

export {
  MIXER_INSERT_SLOTS,
  MIXER_VERSION,
  defaultSends,
  emptyInserts,
  filledInsertCount,
  validateMixer,
  BUS_REVERB,
  BUS_DELAY
} from './mixer-model.js'

export function nameToPluginId (name) {
  if (!name) return ''
  const lower = String(name).toLowerCase()
  if (lower.includes('equalizer') || lower === 'eq') return 'equalizer-x'
  if (lower.includes('reverb') || lower === 'rev') return 'reverb-x'
  if (lower.includes('boost')) return 'boost-x'
  if (lower.includes('dynamic') || lower === 'dyn') return 'dynamic-x'
  if (lower.includes('limiter') || lower === 'lim') return 'limiter-x'
  return ''
}

function trackKey (id) {
  return id == null || id === '' ? '' : String(id)
}

export { trackKey as trackLaneKey }

function hydrateInsert (item) {
  if (!item) return null
  const pluginId = item.pluginId || item.type || nameToPluginId(item.name)
  if (!plugins[pluginId]) return null
  const def = plugins[pluginId]
  const extra = {
    instanceId: item.instanceId || uid(pluginId),
    enabled: item.enabled !== false && item.bypassed !== true,
    presetId: item.presetId || def.defaultPreset,
    state: item.state || item.parameters || {}
  }
  const insert = createInsert(pluginId, plugins, extra)
  insert.slot = item.slot
  insert.type = pluginId
  insert.parameters = insert.state
  return insert
}

export function ensureInsertSlots (inserts) {
  const packed = packInserts(inserts)
  const slots = emptyInserts()
  packed.slots.forEach((item, index) => {
    slots[index] = hydrateInsert(item)
  })
  return slots
}

/** Return stored slot array without re-hydrating (preserves live insert refs + state). */
export function slotArray (inserts) {
  const slots = emptyInserts()
  const src = Array.isArray(inserts) ? inserts : []
  for (let i = 0; i < MIXER_INSERT_SLOTS; i++) slots[i] = src[i] || null
  return slots
}

function ensureTrackLane (webMixer, trackId) {
  const key = trackKey(trackId)
  if (!webMixer.tracks[key]) webMixer.tracks[key] = defaultTrackMix()
  const lane = webMixer.tracks[key]
  if (!Array.isArray(lane.inserts) || lane.inserts.length < MIXER_INSERT_SLOTS) {
    lane.inserts = slotArray(lane.inserts)
  }
  return lane
}

export function defaultWebMixer () {
  const mixer = defaultMixer()
  mixer.remote.inserts = ensureInsertSlots([])
  mixer.buses = mixer.buses.map((bus) => ({
    ...bus,
    volume: 1,
    inserts: ensureInsertSlots([])
  }))
  mixer.master.inserts = ensureInsertSlots([])
  return mixer
}

export function normalizeWebMixer (raw) {
  const base = defaultWebMixer()
  if (!raw || typeof raw !== 'object') return base
  const check = validateMixer(raw)
  const remotePacked = packInserts(raw.remote && raw.remote.inserts)
  const masterPacked = packInserts(raw.master && raw.master.inserts)
  const overflow = []
    .concat(Array.isArray(raw.overflowInserts) ? raw.overflowInserts : [], remotePacked.overflow, masterPacked.overflow)
  const laneErrors = [check.error, remotePacked.error, masterPacked.error].filter(Boolean)

  const busesIn = (Array.isArray(raw.buses) && raw.buses.length) ? raw.buses : base.buses
  const buses = busesIn.map((bus, index) => {
    const packed = packInserts(bus.inserts)
    overflow.push(...packed.overflow)
    if (packed.error) laneErrors.push(packed.error)
    return {
      id: bus.id || (index === 0 ? BUS_REVERB : BUS_DELAY),
      name: bus.name || (index === 0 ? 'Reverb' : 'Delay'),
      icon: 'return',
      volumeDb: bus.volumeDb != null ? bus.volumeDb : 0,
      volume: bus.volume == null ? 1 : bus.volume,
      pan: bus.pan || 0,
      mute: !!bus.mute,
      solo: !!bus.solo,
      inserts: ensureInsertSlots(packed.slots)
    }
  })
  while (buses.length < 2) {
    buses.push({
      id: buses.length === 0 ? BUS_REVERB : BUS_DELAY,
      name: buses.length === 0 ? 'Reverb' : 'Delay',
      icon: 'return',
      volumeDb: 0,
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
      inserts: ensureInsertSlots([])
    })
  }

  const tracks = {}
  if (raw.tracks && typeof raw.tracks === 'object') {
    Object.keys(raw.tracks).forEach((id) => {
      const lane = raw.tracks[id] || {}
      const packed = packInserts(lane.inserts)
      overflow.push(...packed.overflow)
      if (packed.error) laneErrors.push(packed.error)
      tracks[id] = {
        ...defaultTrackMix(lane),
        inserts: ensureInsertSlots(packed.slots),
        sends: normalizeSends(lane.sends)
      }
    })
  }

  return {
    version: MIXER_VERSION,
    loadError: [...new Set(laneErrors)].join('; '),
    overflowInserts: overflow,
    remote: {
      inserts: ensureInsertSlots(remotePacked.slots),
      sends: normalizeSends(raw.remote && raw.remote.sends)
    },
    tracks,
    buses,
    master: {
      volumeDb: raw.master && raw.master.volumeDb != null ? raw.master.volumeDb : 0,
      mute: !!(raw.master && raw.master.mute),
      limiterEnabled: !!(raw.master && raw.master.limiterEnabled),
      clip: false,
      peak: 0,
      rms: 0,
      inserts: ensureInsertSlots(masterPacked.slots)
    }
  }
}

export function allTrackInserts (webMixer, tracks = []) {
  const list = []
  const trackMap = (webMixer && webMixer.tracks) || {}
  const ordered = tracks.length
    ? tracks.filter((track) => track.type !== 'master')
    : Object.keys(trackMap).map((id) => ({ id }))
  ordered.forEach((track) => {
    const key = trackKey(track.id)
    const lane = trackMap[key] || trackMap[track.id]
    const inserts = lane && lane.inserts
    if (inserts && inserts.length) list.push(...inserts.filter(Boolean))
  })
  return list
}

function nativeSlotEmpty (slot) {
  return !slot || (!slot.name && !slot.instrumentId && !slot.pluginId && !slot.type)
}

export function insertFromNativeSlot (slot, lane = null) {
  if (nativeSlotEmpty(slot)) return null
  const pluginId = slot.pluginId || slot.instrumentId || nameToPluginId(slot.name)
  if (!plugins[pluginId]) return null
  const extra = { enabled: slot.bypassed !== true }
  if (pluginId === 'reverb-x' && lane && lane.type === 'bus') {
    extra.state = { returnOnly: true }
  }
  return createInsert(pluginId, plugins, extra)
}

function syncLaneFromNativeSlots (webSlots, nativeSlots, lane) {
  const slots = slotArray(webSlots)
  for (let i = 0; i < MIXER_INSERT_SLOTS; i++) {
    const native = nativeSlots && nativeSlots[i]
    const web = slots[i]
    if (web && web.pluginId) {
      continue
    }
    if (!nativeSlotEmpty(native)) {
      const mapped = insertFromNativeSlot(native, lane)
      if (mapped) slots[i] = mapped
    } else {
      slots[i] = web || null
    }
  }
  return slots
}

export function syncNativeInsertsToWebMixer (webMixer, tracks = []) {
  if (!webMixer || !Array.isArray(tracks) || !tracks.length) return webMixer

  const master = tracks.find((track) => track.type === 'master')
  if (master) {
    webMixer.master.inserts = syncLaneFromNativeSlots(
      webMixer.master.inserts,
      master.inserts,
      { type: 'master' }
    )
  }

  tracks.filter((track) => track.type !== 'master').forEach((track) => {
    const key = trackKey(track.id)
    if (!webMixer.tracks[key]) webMixer.tracks[key] = defaultTrackMix(track)
    webMixer.tracks[key].inserts = syncLaneFromNativeSlots(
      webMixer.tracks[key].inserts,
      track.inserts,
      { type: 'track', id: track.id }
    )
    webMixer.tracks[key].sends = normalizeSends(track.sends || webMixer.tracks[key].sends)
  })

  return webMixer
}

export function trackLaneInserts (webMixer, track) {
  if (!webMixer || !webMixer.tracks || !track) return []
  const key = trackKey(track.id != null ? track.id : track)
  if (!webMixer.tracks[key] && !webMixer.tracks[track.id]) {
    webMixer.tracks[key] = defaultTrackMix(track)
  }
  const lane = webMixer.tracks[key] || webMixer.tracks[track.id]
  return ((lane && lane.inserts) || []).filter(Boolean)
}

/**
 * FX for the summed native VST tap. This carries the Mix strip only — per-track
 * inserts belong to their own strip (native for VST tracks, per-track Web Audio
 * lane for browser tracks) and must never be chained onto an already summed mix.
 */
export function remoteProcessInserts (webMixer) {
  return ((webMixer && webMixer.remote && webMixer.remote.inserts) || []).filter(Boolean)
}

/** Shared fallback bus for voices with no resolvable track id. Carries no inserts. */
export function unassignedProcessInserts () {
  return []
}

export function demoWebMixer () {
  const mixer = defaultWebMixer()
  mixer.remote.inserts = ensureInsertSlots([
    createInsert('equalizer-x', plugins, { presetId: 'master-clean' }),
    createInsert('dynamic-x', plugins, { presetId: 'gentle' })
  ])
  mixer.remote.sends[0] = {
    id: 'send_a',
    name: 'A',
    destination: BUS_REVERB,
    level: 0.32,
    enabled: true,
    preFader: false
  }
  mixer.buses[0].inserts = ensureInsertSlots([
    createInsert('reverb-x', plugins, { presetId: 'concert-hall', state: { returnOnly: true } })
  ])
  mixer.master.inserts = ensureInsertSlots([
    createInsert('boost-x', plugins, { presetId: 'ott', state: { mode: 'ott', amount: 0.22 } })
  ])
  return mixer
}

export function laneFromOpen (open) {
  if (!open) return null
  if (open.lane) return open.lane
  return {
    type: open.laneType || 'remote',
    id: open.laneId || (open.laneType === 'bus' ? BUS_REVERB : undefined)
  }
}

/** True when the browser generates this track's audio and therefore owns its strip. */
export function isBrowserOwnedTrack (track, options = {}) {
  if (!track || track.type === 'master' || track.type === 'group') return false
  if (track.source === 'web-sampler' || track.source === 'm-orchestra' || track.source === 'orchestra-v') return true
  const def = String(track.definitionId || '')
  if (def.startsWith('m_orch_') || def.startsWith('ov_')) return true
  return !!options.localPlayback && track.source !== 'remote-vst'
}

export function fxMeterLaneKey (openOrKey, tracks = [], options = {}) {
  if (openOrKey == null || openOrKey === '') return 'remote'
  const localPlayback = !!options.localPlayback
  if (typeof openOrKey === 'string') {
    if (openOrKey.startsWith('track:')) return openOrKey
    if (openOrKey === 'master' || openOrKey.startsWith('master')) return 'master'
    if (openOrKey === 'bus' || openOrKey.startsWith('bus')) return 'bus'
    if (openOrKey === 'delay' || openOrKey.startsWith('delay')) return 'delay'
    if (openOrKey === 'sampler' || openOrKey.startsWith('sampler')) return 'sampler'
    return localPlayback ? 'sampler' : 'remote'
  }
  const lane = laneFromOpen(openOrKey)
  if (!lane) return localPlayback ? 'sampler' : 'remote'
  if (lane.type === 'master') return 'master'
  if (lane.type === 'bus') return lane.id === BUS_DELAY ? 'delay' : 'bus'
  if (lane.type === 'track') {
    const key = trackKey(lane.id)
    const track = (tracks || []).find((item) => trackKey(item.id) === key)
    if (isBrowserOwnedTrack(track, { localPlayback })) return 'track:' + key
    return 'remote'
  }
  return localPlayback ? 'sampler' : 'remote'
}

export function resolveInsert (webMixer, open) {
  if (!open || !webMixer) return null
  const list = laneInserts(webMixer, laneFromOpen(open))
  let insert = null
  if (open.instanceId) insert = list.find((item) => item && item.instanceId === open.instanceId) || null
  if (!insert && open.index != null) insert = list[open.index] || null
  if (!insert || !insert.pluginId) return null
  const def = plugins[insert.pluginId]
  if (def) {
    insert.version = insert.version || def.version
    insert.presetId = insert.presetId || def.defaultPreset
    if (!insert._stateReady) {
      insert.state = def.normalize(insert.state)
      insert.parameters = insert.state
      insert._stateReady = true
    }
    insert.type = insert.pluginId
  }
  return insert
}

export function resolveOpenInsert (webMixer, open, tracks = []) {
  const resolved = resolveInsert(webMixer, open)
  if (resolved) return resolved
  if (!open) return null
  const lane = laneFromOpen(open)
  if (!lane) return null
  if (lane.type === 'track') {
    const track = tracks.find((item) => trackKey(item.id) === trackKey(lane.id))
    const slot = track && track.inserts && track.inserts[open.index]
    if (!slot) return null
    const pluginId = slot.pluginId || slot.instrumentId || nameToPluginId(slot.name)
    if (!plugins[pluginId]) return null
    return createInsert(pluginId, plugins, { enabled: slot.bypassed !== true })
  }
  return null
}

export function laneInserts (webMixer, lane) {
  if (!webMixer || !lane) return emptyInserts()
  if (lane.type === 'remote') {
    if (!webMixer.remote) webMixer.remote = { inserts: emptyInserts(), sends: defaultSends() }
    if (!Array.isArray(webMixer.remote.inserts)) webMixer.remote.inserts = emptyInserts()
    return slotArray(webMixer.remote.inserts)
  }
  if (lane.type === 'master') {
    if (!webMixer.master) webMixer.master = { inserts: emptyInserts() }
    if (!Array.isArray(webMixer.master.inserts)) webMixer.master.inserts = emptyInserts()
    return slotArray(webMixer.master.inserts)
  }
  if (lane.type === 'bus') {
    const busId = lane.id || (webMixer.buses[0] && webMixer.buses[0].id)
    const bus = webMixer.buses.find((item) => item.id === busId)
    if (bus && !Array.isArray(bus.inserts)) bus.inserts = emptyInserts()
    return slotArray(bus ? bus.inserts : [])
  }
  if (lane.type === 'track') {
    const trackLane = ensureTrackLane(webMixer, lane.id)
    return slotArray(trackLane.inserts)
  }
  return emptyInserts()
}

export function setLaneInserts (webMixer, lane, inserts) {
  const packed = packInserts(inserts)
  const slots = emptyInserts()
  for (let i = 0; i < MIXER_INSERT_SLOTS; i++) {
    const item = packed.slots[i]
    slots[i] = item && item.pluginId ? item : (item ? hydrateInsert(item) : null)
  }
  webMixer.loadError = packed.error
  webMixer.overflowInserts = packed.overflow
  if (lane.type === 'remote') webMixer.remote.inserts = slots
  else if (lane.type === 'master') webMixer.master.inserts = slots
  else if (lane.type === 'bus') {
    const bus = webMixer.buses.find((item) => item.id === lane.id)
    if (bus) bus.inserts = slots
  } else if (lane.type === 'track') {
    const key = trackKey(lane.id)
    if (!webMixer.tracks[key]) webMixer.tracks[key] = defaultTrackMix()
    webMixer.tracks[key].inserts = slots
  }
}

export function reorderLaneInserts (webMixer, lane, fromIndex, toIndex) {
  const list = laneInserts(webMixer, lane).slice()
  const from = Number(fromIndex)
  const to = Number(toIndex)
  if (!Number.isInteger(from) || !Number.isInteger(to)) return
  if (from < 0 || to < 0 || from >= list.length || to >= list.length) return
  const [item] = list.splice(from, 1)
  list.splice(to, 0, item)
  setLaneInserts(webMixer, lane, list)
}
