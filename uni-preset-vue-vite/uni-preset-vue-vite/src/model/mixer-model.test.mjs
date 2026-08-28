import {
  MIXER_INSERT_SLOTS,
  dbToGain,
  dbFromFader,
  faderFromDb,
  panGains,
  canAddInsert,
  normalizeInserts,
  normalizeSends,
  validateMixer,
  isTrackAudible,
  defaultSends
} from './mixer-model.js'
import { remoteProcessInserts, samplerProcessInserts, laneInserts, setLaneInserts, defaultWebMixer } from './web-mixer.js'
import { createInsert } from '../dsp/plugin.js'
import { plugins } from '../dsp/registry.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

assert(Math.abs(dbToGain(0) - 1) < 1e-9, '0 dB is unity')
assert(dbFromFader(0.8) === 0, 'fader 0.8 is 0 dB')
assert(Math.abs(faderFromDb(0) - 0.8) < 1e-9, '0 dB is fader 0.8')
assert(Math.abs(dbToGain(6) - 2) < 0.01, '+6 dB ≈ ×2')

const center = panGains(0)
assert(Math.abs(center.left - Math.SQRT1_2) < 1e-6, 'center left equal-power')
assert(Math.abs(center.right - Math.SQRT1_2) < 1e-6, 'center right equal-power')
const left = panGains(-1)
assert(Math.abs(left.left - 1) < 1e-6 && Math.abs(left.right) < 1e-6, 'hard left')
const right = panGains(1)
assert(Math.abs(right.left) < 1e-6 && Math.abs(right.right - 1) < 1e-6, 'hard right')

assert(defaultSends().length === 3, 'three global sends')
assert(canAddInsert([null, null, null, null, null]), 'empty chain can add')
assert(!canAddInsert([
  { pluginId: 'equalizer-x' },
  { pluginId: 'dynamic-x' },
  { pluginId: 'reverb-x' },
  { pluginId: 'boost-x' },
  { pluginId: 'equalizer-x' }
]), 'sixth insert refused')

const packed = normalizeInserts([
  { pluginId: 'equalizer-x' },
  { pluginId: 'dynamic-x' },
  { pluginId: 'reverb-x' },
  { pluginId: 'boost-x' },
  { pluginId: 'equalizer-x' },
  { pluginId: 'dynamic-x' }
])
assert(packed.error.includes('exceeds'), 'overflow is an error')
assert(packed.overflow.length === 1, 'overflow is kept, not discarded')
assert(packed.slots.filter(Boolean).length === MIXER_INSERT_SLOTS, 'DSP slots stay at 5')

const sends = normalizeSends([{ id: 'send_a', level: 0.5, enabled: true }])
assert(sends.length === 3 && sends[0].level === 0.5 && sends[1].id === 'send_b', 'pad to A/B/C')

assert(validateMixer({
  remote: { inserts: packed.slots.concat(packed.overflow) }
}).ok === false, 'validateMixer rejects 6 inserts')

const tracks = [
  { mute: false, solo: true, type: 'midi' },
  { mute: false, solo: false, type: 'midi' }
]
assert(isTrackAudible(tracks[0], tracks), 'soloed track audible')
assert(!isTrackAudible(tracks[1], tracks), 'unsoloed track silent when any solo')

const mix = {
  remote: { inserts: [{ pluginId: 'equalizer-x' }, null, null, null, null] },
  tracks: {
    t1: { inserts: [{ pluginId: 'dynamic-x' }, null, null, null, null] }
  }
}
const vstTracks = [{ id: 't1', type: 'midi', source: 'vst' }]
const mixChain = remoteProcessInserts(mix, vstTracks, { localPlayback: false })
assert(mixChain.length === 2, 'remote chain includes VST track inserts + Mix strip')
assert(mixChain[0].pluginId === 'dynamic-x', 'VST track inserts run on summed tap')
assert(mixChain[1].pluginId === 'equalizer-x', 'Mix strip inserts follow track inserts')

const localTracks = [{ id: 't1', type: 'midi', source: 'empty' }, { id: 't2', type: 'midi', source: 'web-sampler' }]
const localSamplerChain = samplerProcessInserts(mix, localTracks, { localPlayback: true })
assert(localSamplerChain.length === 1, 'local playback routes all track inserts to sampler chain')
assert(localSamplerChain[0].pluginId === 'dynamic-x', 'local track EQ on sampler chain')
assert(remoteProcessInserts(mix, localTracks, { localPlayback: true }).length === 1, 'local remote chain is Mix-only')

const samplerTracks = [{ id: 't1', type: 'midi', source: 'web-sampler' }]
const samplerChain = samplerProcessInserts(mix, samplerTracks, { localPlayback: false })
assert(samplerChain.filter(Boolean)[0].pluginId === 'dynamic-x', 'web sampler keeps a per-track chain')

const wm = defaultWebMixer()
const live = createInsert('equalizer-x', plugins, { state: { outputGainDb: 0 } })
setLaneInserts(wm, { type: 'track', id: 1 }, [live, null, null, null, null])
const fromLane = laneInserts(wm, { type: 'track', id: 1 })[0]
fromLane.state.outputGainDb = 6
assert(fromLane === wm.tracks['1'].inserts[0], 'laneInserts returns live insert refs')
assert(wm.tracks['1'].inserts[0].state.outputGainDb === 6, 'param edits stick on stored insert')

assert(plugins['limiter-x'], 'Limiter X is registered')
assert(plugins['limiter-x'].parameters.find((p) => p.id === 'limiter.gain'), 'limiter.gain automatable')
const lim = createInsert('limiter-x', plugins)
assert(lim.state.gainDb === 0 && lim.state.releaseMs === 100, 'Limiter X default state')

console.log('mixer-model 2.0 ok')
