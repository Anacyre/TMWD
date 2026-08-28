import { mergeState } from './plugin.js'
import { defaultDynamicState, normalizeDynamicState } from './dynamic-x.js'
import { defaultLimiterState, normalizeLimiterState, LIMITER_X_FACTORY_PRESETS } from './limiter-x.js'
import { normalizeEqState } from './equalizer-x.js'
import { REVERB_X_FACTORY_PRESETS } from './reverb-x.js'

export const PLUGIN_IDS = {
  reverb: 'reverb-x',
  eq: 'equalizer-x',
  boost: 'boost-x',
  dynamic: 'dynamic-x',
  limiter: 'limiter-x'
}

export const EQ_SHAPES = ['lowcut', 'lowshelf', 'bell', 'notch', 'highshelf', 'highcut', 'bandpass']
export const BOOST_MODES = ['ott', 'expander', 'chorus', 'distortion']
export const REVERB_VENUES = [
  { id: 'small-room', name: 'Small Room' },
  { id: 'studio', name: 'Studio' },
  { id: 'chamber', name: 'Chamber' },
  { id: 'hall', name: 'Hall' },
  { id: 'concert-hall', name: 'Concert Hall' },
  { id: 'cathedral', name: 'Cathedral' },
  { id: 'large-stage', name: 'Large Stage' },
  { id: 'outdoor', name: 'Outdoor' }
]

const reverbParams = [
  { id: 'reverb.amount', name: 'Amount', min: 0, max: 1, default: 0.35, unit: '%', automatable: true },
  { id: 'reverb.decay', name: 'Decay', min: 0.15, max: 12, default: 2.2, unit: 's', scale: 'log', automatable: true },
  { id: 'reverb.size', name: 'Size', min: 0, max: 1, default: 0.62, unit: '%', automatable: true },
  { id: 'reverb.venue', name: 'Venue', min: 0, max: 7, default: 4, unit: '', automatable: true },
  { id: 'reverb.wetProcess', name: 'Wet Process', min: 0, max: 1, default: 0, unit: '', automatable: false }
]

function defaultReverbState () {
  return {
    amount: 0.35,
    decay: 2.2,
    size: 0.62,
    venue: 'concert-hall',
    wetProcess: false,
    wetPluginId: '',
    wetState: null,
    returnOnly: false
  }
}

function defaultEqState () {
  return {
    outputGainDb: 0,
    autoGain: false,
    nodes: [
      { freq: 1000, gain: 0, q: 0.9, shape: 'bell', enabled: true, solo: false }
    ]
  }
}

function defaultBoostState () {
  return {
    mode: 'ott',
    amount: 0.35,
    character: 'clean'
  }
}

function eqParams () {
  const list = [
    { id: 'eq.outputGain', name: 'Output Gain', min: -24, max: 24, default: 0, unit: 'dB', automatable: true },
    { id: 'eq.autoGain', name: 'Auto Gain', min: 0, max: 1, default: 0, unit: '', automatable: false }
  ]
  for (let i = 1; i <= 7; ++i) {
    list.push(
      { id: `eq.node${i}.frequency`, name: `Node ${i} Frequency`, min: 20, max: 20000, default: 1000, unit: 'Hz', scale: 'log', automatable: true },
      { id: `eq.node${i}.gain`, name: `Node ${i} Gain`, min: -18, max: 18, default: 0, unit: 'dB', automatable: true },
      { id: `eq.node${i}.q`, name: `Node ${i} Q`, min: 0.2, max: 12, default: 0.9, unit: '', scale: 'log', automatable: true },
      { id: `eq.node${i}.slope`, name: `Node ${i} Slope`, min: 6, max: 48, default: 12, unit: 'dB/oct', automatable: true }
    )
  }
  return list
}

function dynamicParams () {
  const list = [
    { id: 'dynamic.threshold', name: 'Threshold', min: -48, max: 0, default: -18, unit: 'dB', automatable: true },
    { id: 'dynamic.ratio', name: 'Ratio', min: 1, max: 20, default: 4, unit: ':1', scale: 'log', automatable: true },
    { id: 'dynamic.attack', name: 'Attack', min: 0.001, max: 0.2, default: 0.012, unit: 's', scale: 'log', automatable: true },
    { id: 'dynamic.release', name: 'Release', min: 0.02, max: 1.5, default: 0.12, unit: 's', scale: 'log', automatable: true },
    { id: 'dynamic.autoRelease', name: 'Auto Release', min: 0, max: 1, default: 0, unit: '', automatable: false },
    { id: 'dynamic.makeup', name: 'Makeup Gain', min: -12, max: 24, default: 0, unit: 'dB', automatable: true },
    { id: 'dynamic.autoGain', name: 'Auto Gain', min: 0, max: 1, default: 0, unit: '', automatable: false },
    { id: 'dynamic.splitBands', name: 'Split Bands', min: 0, max: 1, default: 0, unit: '', automatable: false },
    { id: 'dynamic.xo1', name: 'Crossover 1', min: 40, max: 800, default: 180, unit: 'Hz', scale: 'log', automatable: true },
    { id: 'dynamic.xo2', name: 'Crossover 2', min: 800, max: 12000, default: 3500, unit: 'Hz', scale: 'log', automatable: true }
  ]
  for (let i = 1; i <= 3; ++i) {
    list.push(
      { id: `dynamic.band${i}.enabled`, name: `Band ${i} Enable`, min: 0, max: 1, default: 1, unit: '', automatable: false },
      { id: `dynamic.band${i}.threshold`, name: `Band ${i} Threshold`, min: -48, max: 0, default: -18, unit: 'dB', automatable: true }
    )
  }
  return list
}

export const plugins = {
  'reverb-x': {
    id: 'reverb-x',
    name: 'Reverb X',
    version: 1,
    category: 'space',
    defaultPreset: 'concert-hall',
    parameters: reverbParams,
    createState: () => defaultReverbState(),
    normalize: (state) => mergeState(defaultReverbState(), state),
    presets: REVERB_X_FACTORY_PRESETS
  },
  'equalizer-x': {
    id: 'equalizer-x',
    name: 'Equalizer X',
    version: 1,
    category: 'eq',
    defaultPreset: 'default',
    parameters: eqParams(),
    createState: () => defaultEqState(),
    normalize: (state) => normalizeEqState(mergeState(defaultEqState(), state)),
    presets: [
      { id: 'default', name: 'Default', state: { nodes: [
        { freq: 1000, gain: 0, q: 0.9, shape: 'bell', enabled: true, solo: false }
      ] } },
      { id: 'vocal', name: 'Vocal-ish', state: { nodes: [
        { freq: 80, gain: 0, q: 0.7, shape: 'lowcut', slope: 12, enabled: true },
        { freq: 220, gain: -2.5, q: 0.8, shape: 'bell', enabled: true },
        { freq: 3200, gain: 2, q: 1.1, shape: 'bell', enabled: true },
        { freq: 11000, gain: 1.5, q: 0.7, shape: 'highshelf', slope: 12, enabled: true }
      ] } },
      { id: 'warm', name: 'Warm', state: { nodes: [
        { freq: 120, gain: 2.2, q: 0.7, shape: 'lowshelf', slope: 12, enabled: true },
        { freq: 4500, gain: -1.5, q: 0.8, shape: 'bell', enabled: true }
      ] } },
      { id: 'bright', name: 'Bright', state: { nodes: [
        { freq: 80, gain: 0, q: 0.7, shape: 'lowcut', slope: 12, enabled: true },
        { freq: 8000, gain: 2.8, q: 0.7, shape: 'highshelf', slope: 12, enabled: true }
      ] } },
      { id: 'lowcut', name: 'Low Cut', state: { nodes: [
        { freq: 90, gain: 0, q: 0.7, shape: 'lowcut', slope: 24, enabled: true }
      ] } },
      { id: 'master-clean', name: 'Master Clean', state: { nodes: [
        { freq: 35, gain: 0, q: 0.7, shape: 'lowcut', slope: 12, enabled: true },
        { freq: 250, gain: -1, q: 0.9, shape: 'bell', enabled: true },
        { freq: 12000, gain: 1.2, q: 0.7, shape: 'highshelf', slope: 12, enabled: true }
      ] } }
    ]
  },
  'boost-x': {
    id: 'boost-x',
    name: 'Boost X',
    version: 1,
    category: 'color',
    defaultPreset: 'ott',
    parameters: [
      { id: 'boost.mode', name: 'Mode', min: 0, max: 3, default: 0, unit: '', automatable: false },
      { id: 'boost.amount', name: 'Boost', min: 0, max: 1, default: 0.35, unit: '%', automatable: true }
    ],
    createState: () => defaultBoostState(),
    normalize: (state) => {
      const next = mergeState(defaultBoostState(), state)
      if (!BOOST_MODES.includes(next.mode)) next.mode = 'ott'
      next.amount = Math.min(1, Math.max(0, Number(next.amount) || 0))
      if (typeof next.character !== 'string' || !next.character) next.character = 'clean'
      return next
    },
    presets: [
      { id: 'ott', name: 'Clean', state: { mode: 'ott', amount: 0.4, character: 'clean' } },
      { id: 'ott-punch', name: 'Punch', state: { mode: 'ott', amount: 0.52, character: 'punch' } },
      { id: 'ott-bright', name: 'Bright', state: { mode: 'ott', amount: 0.58, character: 'bright' } },
      { id: 'ott-aggressive', name: 'Aggressive', state: { mode: 'ott', amount: 0.78, character: 'aggressive' } },
      { id: 'wide', name: 'Wide', state: { mode: 'expander', amount: 0.45, character: 'wide' } },
      { id: 'stereo-subtle', name: 'Subtle', state: { mode: 'expander', amount: 0.22, character: 'subtle' } },
      { id: 'stereo-air', name: 'Air', state: { mode: 'expander', amount: 0.55, character: 'air' } },
      { id: 'chorus', name: 'Soft', state: { mode: 'chorus', amount: 0.4, character: 'soft' } },
      { id: 'chorus-wide', name: 'Wide Chorus', state: { mode: 'chorus', amount: 0.62, character: 'wide' } },
      { id: 'distortion', name: 'Warm', state: { mode: 'distortion', amount: 0.28, character: 'warm' } },
      { id: 'dist-crunch', name: 'Crunch', state: { mode: 'distortion', amount: 0.62, character: 'crunch' } }
    ]
  },
  'dynamic-x': {
    id: 'dynamic-x',
    name: 'Dynamic X',
    version: 1,
    category: 'dynamics',
    defaultPreset: 'gentle',
    parameters: dynamicParams(),
    createState: () => defaultDynamicState(),
    normalize: (state) => normalizeDynamicState(state),
    presets: [
      { id: 'gentle', name: 'Gentle', state: { threshold: -16, ratio: 2.2, attack: 0.02, release: 0.18, autoRelease: false, autoGain: false, makeupDb: 1.5, splitBands: false } },
      { id: 'vocal', name: 'Vocal', state: { threshold: -20, ratio: 3.5, attack: 0.008, release: 0.1, autoRelease: true, autoGain: false, makeupDb: 3, splitBands: false } },
      { id: 'bus', name: 'Bus', state: { threshold: -14, ratio: 2.8, attack: 0.025, release: 0.22, autoRelease: false, autoGain: false, makeupDb: 2, splitBands: false } },
      { id: 'punch', name: 'Punch', state: { threshold: -18, ratio: 6, attack: 0.004, release: 0.08, autoRelease: false, autoGain: false, makeupDb: 4, splitBands: false } },
      { id: 'soft', name: 'Soft', state: { threshold: -12, ratio: 1.8, attack: 0.03, release: 0.28, autoRelease: false, autoGain: false, makeupDb: 1, splitBands: false } },
      { id: 'master', name: 'Master', state: { threshold: -10, ratio: 2, attack: 0.04, release: 0.25, autoRelease: true, autoGain: true, makeupDb: 0, splitBands: false } }
    ]
  },
  'limiter-x': {
    id: 'limiter-x',
    name: 'Limiter X',
    version: 1,
    category: 'dynamics',
    defaultPreset: 'default',
    parameters: [
      { id: 'limiter.gain', name: 'Gain', min: -12, max: 18, default: 0, unit: 'dB', automatable: true },
      { id: 'limiter.release', name: 'Release', min: 10, max: 1000, default: 100, unit: 'ms', scale: 'log', automatable: true }
    ],
    createState: () => defaultLimiterState(),
    normalize: (state) => normalizeLimiterState(state),
    presets: LIMITER_X_FACTORY_PRESETS
  }
}

export function getPlugin (id) {
  return plugins[id] || null
}

export function listPlugins () {
  return Object.values(plugins)
}

export function applyPreset (insert, presetId) {
  const def = getPlugin(insert.pluginId)
  if (!def) return insert
  const preset = def.presets.find((item) => item.id === presetId)
  if (!preset) return insert
  insert.presetId = presetId
  insert.state = def.normalize({ ...(insert.state || {}), ...preset.state })
  return insert
}

export function resetInsert (insert) {
  const def = getPlugin(insert.pluginId)
  if (!def) return insert
  return applyPreset(insert, def.defaultPreset)
}

export function createEmptyNode (freq = 1000, gain = 0) {
  return {
    id: Date.now() % 100000,
    freq,
    gain,
    q: 0.9,
    shape: 'bell',
    slope: 12,
    enabled: true,
    solo: false
  }
}

export const WET_PROCESS_PLUGINS = ['equalizer-x', 'dynamic-x', 'boost-x']
