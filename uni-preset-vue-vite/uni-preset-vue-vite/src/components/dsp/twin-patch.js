import { computed } from 'vue'
import { WAVES, defaultTwinState, normalizeTwinState } from '../../dsp/synth/params.js'
import { updateTwinPatch } from '../../store/session.js'

const WAVE_LABEL = { saw: 'Saw', square: 'Square', tri: 'Triangle', sine: 'Sine', noise: 'Noise' }
const remembered = {}

export function useTwinPatch (props) {
  const state = computed(() => normalizeTwinState((props.track && props.track.twinState) || defaultTwinState()))

  function commit (next) {
    props.track.twinState = normalizeTwinState(next)
    updateTwinPatch(props.track)
  }
  function set (key, value) { commit({ ...state.value, [key]: value }) }
  function setOsc (key, field, value) { commit({ ...state.value, [key]: { ...state.value[key], [field]: value } }) }
  function setFilt (which, field, value) { commit({ ...state.value, [which]: { ...state.value[which], [field]: value } }) }
  function setLfo (key, field, value) { commit({ ...state.value, [key]: { ...state.value[key], [field]: value } }) }

  function pct (v) { return Math.round((Number(v) || 0) * 100) + '%' }
  function unit (value, min, max) { return Math.min(1, Math.max(0, (value - min) / (max - min || 1))) }
  function fromUnit (t, min, max) { return min + Math.min(1, Math.max(0, t)) * (max - min) }
  function logUnit (value, min, max) {
    const v = Math.min(max, Math.max(min, value))
    return (Math.log(v) - Math.log(min)) / (Math.log(max) - Math.log(min))
  }
  function fromLog (t, min, max) {
    const u = Math.min(1, Math.max(0, t))
    return Math.exp(Math.log(min) + u * (Math.log(max) - Math.log(min)))
  }
  function waveName (id) {
    if (WAVE_LABEL[id]) return WAVE_LABEL[id]
    if (String(id).indexOf('wt') === 0) return 'Wave ' + id.slice(2)
    return id
  }
  function toggleOsc (osc) {
    if (osc.level >= 0.001) {
      remembered[osc.key] = osc.level
      setOsc(osc.key, 'level', 0)
    } else setOsc(osc.key, 'level', remembered[osc.key] || 0.7)
  }
  function cycleWave (key) {
    const cur = state.value[key].wave
    const i = Math.max(0, WAVES.indexOf(cur))
    const next = WAVES[(i + 1) % WAVES.length]
    const wt = String(next).indexOf('wt') === 0 ? Number(next.slice(2)) : state.value[key].wt
    commit({ ...state.value, [key]: { ...state.value[key], wave: next, wt } })
  }

  return {
    state, commit, set, setOsc, setFilt, setLfo,
    pct, unit, fromUnit, logUnit, fromLog, waveName, toggleOsc, cycleWave, remembered
  }
}
