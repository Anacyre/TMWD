/** MixerModel 2.0 — shared serializable mixer for Web Audio and JUCE.

    Vue never processes samples. This file is data + helpers only.
    DSP lives in AudioWorklet (browser) and MixerEngine (PC VST sum).
*/

export const MIXER_VERSION = 2
export const MIXER_INSERT_SLOTS = 5
export const VOLUME_DB_MIN = -60
export const VOLUME_DB_MAX = 6
export const VOLUME_DB_UNITY = 0
export const SMOOTH_SEC = 0.012
export const METER_FPS = 24
export const CONTROL_HZ = 40

export const PLUGIN_SHORT = {
  'equalizer-x': 'EQ',
  'dynamic-x': 'DYN',
  'reverb-x': 'REV',
  'boost-x': 'BOOST',
  'limiter-x': 'LIM'
}

export const BUS_REVERB = 'bus_reverb'
export const BUS_DELAY = 'bus_delay'

export function dbToGain (db) {
  if (db == null || db <= VOLUME_DB_MIN + 0.5) return 0
  return Math.pow(10, db / 20)
}

export function gainToDb (gain) {
  const g = Math.max(1e-8, Number(gain) || 0)
  return 20 * Math.log10(g)
}

export function clampVolumeDb (db) {
  const n = Number(db)
  if (!Number.isFinite(n) || n <= VOLUME_DB_MIN + 0.01) return VOLUME_DB_MIN
  return Math.min(VOLUME_DB_MAX, Math.max(VOLUME_DB_MIN, n))
}

/** Fader 0–1, 0.8 = 0 dB, 1 = +6 dB. Matches DawUnits. */
export function dbFromFader (position) {
  const p = Math.min(1, Math.max(0, Number(position) || 0))
  if (p <= 0) return VOLUME_DB_MIN
  if (p >= 0.8) return ((p - 0.8) / 0.2) * VOLUME_DB_MAX
  const t = p / 0.8
  return (t * t) * 60 - 60
}

export function faderFromDb (db) {
  const v = clampVolumeDb(db)
  if (v <= VOLUME_DB_MIN + 0.5) return 0
  if (v >= 0) return 0.8 + (Math.min(VOLUME_DB_MAX, v) / VOLUME_DB_MAX) * 0.2
  const t = Math.sqrt(Math.min(1, Math.max(0, (v - VOLUME_DB_MIN) / 60)))
  return t * 0.8
}

export function formatVolumeDb (db) {
  const v = clampVolumeDb(db)
  if (v <= VOLUME_DB_MIN + 0.5) return '-∞'
  const rounded = Math.round(v)
  if (rounded === 0) return '0'
  return (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 10 ? 0 : 1)
}

export function peakDb (peak) {
  return 20 * Math.log10((Number(peak) || 0) + 1e-8)
}

export function rmsDb (sumSq, n) {
  const rms = Math.sqrt((Number(sumSq) || 0) / Math.max(1, n) + 1e-12)
  return 20 * Math.log10(rms + 1e-8)
}

/** Equal-power pan. pan -1 = L, 0 = C, +1 = R. θ = (pan + 1) × π/4 */
export function panGains (pan) {
  const p = Math.min(1, Math.max(-1, Number(pan) || 0))
  const theta = (p + 1) * Math.PI * 0.25
  return { left: Math.cos(theta), right: Math.sin(theta) }
}

export function formatPan (pan) {
  const amount = Math.round(Math.abs(Number(pan) || 0) * 100)
  if (!amount) return 'C'
  return amount + ((pan < 0) ? ' L' : ' R')
}

export function defaultSends () {
  return [
    { id: 'send_a', name: 'A', destination: BUS_REVERB, level: 0, enabled: false, preFader: false },
    { id: 'send_b', name: 'B', destination: BUS_DELAY, level: 0, enabled: false, preFader: false },
    { id: 'send_c', name: 'C', destination: BUS_REVERB, level: 0, enabled: false, preFader: false }
  ]
}

export function emptyInserts () {
  return [null, null, null, null, null]
}

export function filledInsertCount (inserts) {
  return (inserts || []).filter((item) => item && (item.pluginId || item.type)).length
}

export function canAddInsert (inserts) {
  return filledInsertCount(inserts) < MIXER_INSERT_SLOTS
}

export function defaultBuses () {
  return [
    { id: BUS_REVERB, name: 'Reverb', icon: 'return', volumeDb: 0, pan: 0, mute: false, solo: false, inserts: emptyInserts() },
    { id: BUS_DELAY, name: 'Delay', icon: 'return', volumeDb: 0, pan: 0, mute: false, solo: false, inserts: emptyInserts() }
  ]
}

export function defaultMaster () {
  return {
    volumeDb: 0,
    mute: false,
    limiterEnabled: false,
    clip: false,
    peak: 0,
    rms: 0,
    inserts: emptyInserts()
  }
}

export function defaultMixer () {
  return {
    version: MIXER_VERSION,
    tracks: {},
    buses: defaultBuses(),
    master: defaultMaster(),
    remote: { inserts: emptyInserts(), sends: defaultSends() },
    overflowInserts: [],
    loadError: ''
  }
}

export function isTrackAudible (track, tracks) {
  if (!track) return false
  if (track.mute) return false
  if (track.type === 'master') return !track.mute
  const list = tracks || []
  const anySolo = list.some((item) => item && item.solo && item.type !== 'master' && !item.mute)
  if (anySolo && !track.solo) return false
  return true
}

export function isBusAudible (bus, buses) {
  if (!bus || bus.mute) return false
  const list = buses || []
  const anySolo = list.some((item) => item && item.solo && !item.mute)
  if (anySolo && !bus.solo) return false
  return true
}

function migrateSend (raw, fallback) {
  const base = fallback || defaultSends()[0]
  if (!raw || typeof raw !== 'object') return { ...base }
  return {
    id: raw.id || base.id,
    name: raw.name || base.name,
    destination: raw.destination || raw.busId || base.destination,
    level: raw.level == null ? 0 : Math.min(1, Math.max(0, Number(raw.level) || 0)),
    enabled: raw.enabled != null ? !!raw.enabled : (Number(raw.level) || 0) > 0.001,
    preFader: !!raw.preFader
  }
}

export function normalizeSends (list) {
  const defaults = defaultSends()
  const incoming = Array.isArray(list) ? list : []
  return defaults.map((fallback, index) => migrateSend(incoming[index] || incoming.find((s) => s && s.id === fallback.id), fallback))
}

function insertType (item) {
  if (!item) return ''
  return item.pluginId || item.type || item.instrumentId || ''
}

/** Keep first 5 filled inserts. Extra slots are an error, not a silent drop. */
export function normalizeInserts (list) {
  const incoming = Array.isArray(list) ? list : []
  const packed = []
  incoming.forEach((item) => {
    if (!item) return
    const type = insertType(item)
    if (!type) return
    packed.push(item)
  })
  const error = packed.length > MIXER_INSERT_SLOTS
    ? packed.length + ' inserts exceeds the maximum of ' + MIXER_INSERT_SLOTS
    : ''
  const slots = emptyInserts()
  packed.slice(0, MIXER_INSERT_SLOTS).forEach((item, index) => {
    const pluginId = insertType(item)
    const state = item.state || item.parameters || {}
    slots[index] = {
      slot: index,
      type: pluginId,
      pluginId,
      enabled: item.enabled !== false && item.bypassed !== true,
      instanceId: item.instanceId || '',
      version: item.version || 1,
      presetId: item.presetId || '',
      state,
      parameters: state
    }
  })
  return { slots, overflow: packed.slice(MIXER_INSERT_SLOTS), error }
}

export function validateMixer (raw) {
  const errors = []
  const scan = (label, inserts) => {
    const n = filledInsertCount(inserts)
    if (n > MIXER_INSERT_SLOTS) errors.push(label + ': ' + n + ' inserts (max ' + MIXER_INSERT_SLOTS + ')')
  }
  if (!raw || typeof raw !== 'object') return { ok: true, error: '', errors }
  scan('remote', raw.remote && raw.remote.inserts)
  scan('master', raw.master && raw.master.inserts)
  ;(raw.buses || []).forEach((bus) => scan(bus.id || 'bus', bus.inserts))
  const tracks = raw.tracks
  if (tracks && typeof tracks === 'object') {
    Object.keys(tracks).forEach((id) => scan('track ' + id, tracks[id] && tracks[id].inserts))
  }
  const error = errors.join('; ')
  return { ok: errors.length === 0, error, errors }
}

export function defaultTrackMix (partial = {}) {
  return {
    volumeDb: partial.volumeDb != null ? clampVolumeDb(partial.volumeDb)
      : (partial.volume != null ? dbFromFader(partial.volume) : 0),
    pan: partial.pan == null ? 0 : Math.min(1, Math.max(-1, Number(partial.pan) || 0)),
    mute: !!partial.mute,
    solo: !!partial.solo,
    inserts: emptyInserts(),
    sends: normalizeSends(partial.sends)
  }
}
