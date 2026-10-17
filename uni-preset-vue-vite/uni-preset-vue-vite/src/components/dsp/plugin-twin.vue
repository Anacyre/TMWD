<template>
  <view class="twin" @pointerdown="onRootDown">
    <view class="bar">
      <text class="mark">Twin</text>
      <view class="preset">
        <view class="step" @click.stop="stepPreset(-1)">‹</view>
        <text class="preset-name">{{ presetLabel }}</text>
        <view class="step" @click.stop="stepPreset(1)">›</view>
      </view>
      <text class="out">{{ outLabel }}</text>
    </view>

    <view class="main">
      <view class="oscs">
        <view v-for="osc in oscs" :key="osc.key" class="osc" :class="{ mute: osc.level < 0.001 }">
          <view class="pwr" :class="{ on: osc.level >= 0.001 }" @click.stop="toggleOsc(osc)" />
          <view class="wave-btn" @pointerdown.stop @click.stop="toggleWave(osc.key, $event)">
            <svg viewBox="0 0 36 16"><path :d="wavePath(osc.wave)" /></svg>
          </view>
          <view class="mini" @pointerdown.stop.prevent="dragOsc(osc.key, 'unison', 1, 8, true, $event)">
            <text class="mini-v">{{ Math.round(osc.unison) }}</text>
            <text class="mini-l">Uni</text>
          </view>
          <view
            class="knob"
            :data-dst="osc.levelDst"
            @pointerdown.stop.prevent="dragOsc(osc.key, 'level', 0, 1, false, $event)"
            @dblclick.stop="setOsc(osc.key, 'level', 0.7)"
          >
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="15" class="ring" />
              <circle cx="20" cy="20" r="15" class="arc" :stroke-dasharray="arc(osc.level, 0, 1)" />
            </svg>
          </view>
          <view class="subrow">
            <view
              class="mini grow"
              :data-dst="osc.key === 'osc1' ? 'osc1Detune' : ''"
              @pointerdown.stop.prevent="dragOsc(osc.key, 'detune', 0, 100, false, $event)"
            >
              <text class="mini-v">{{ Math.round(osc.detune) }}</text>
              <text class="mini-l">Detune</text>
            </view>
            <view
              class="mini"
              :data-dst="osc.key === 'osc1' ? 'pan' : ''"
              @pointerdown.stop.prevent="dragOsc(osc.key, 'pan', -1, 1, false, $event)"
            >
              <text class="mini-v">{{ panLabel(osc.pan) }}</text>
              <text class="mini-l">Pan</text>
            </view>
          </view>
        </view>
      </view>

      <view class="center">
        <view class="plot-tools">
          <text
            v-for="t in filterTypes"
            :key="t"
            class="pill"
            :class="{ on: state[activeFilt].type === t }"
            @click.stop="setFilt(activeFilt, 'type', t)"
          >{{ t === 'lowpass' ? 'LP' : t === 'highpass' ? 'HP' : 'BP' }}</text>
          <text class="pill" :class="{ on: state.filterRoute === 'serial' }" @click.stop="set('filterRoute', state.filterRoute === 'serial' ? 'parallel' : 'serial')">
            {{ state.filterRoute === 'serial' ? 'Serial' : 'Parallel' }}
          </text>
          <text class="pill" :class="{ on: activeFilt === 'filter1' }" @click.stop="activeFilt = 'filter1'">1</text>
          <text class="pill" :class="{ on: activeFilt === 'filter2' }" @click.stop="activeFilt = 'filter2'">2</text>
        </view>
        <view class="plot filt" data-dst="cutoff" @pointerdown.stop.prevent="onFilterDown">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none">
            <path v-for="g in grids" :key="g" :d="g" class="grid" />
            <path :d="curve2" class="f2" />
            <path :d="curve1" class="f1 glow" />
            <path :d="curve1" class="f1" />
          </svg>
          <view class="node n1" :class="{ on: activeFilt === 'filter1' }" :style="nodeStyle(state.filter1)" data-filt="filter1">1</view>
          <view class="node n2" :class="{ on: activeFilt === 'filter2' }" :style="nodeStyle(state.filter2)" data-filt="filter2">2</view>
        </view>
        <view class="plot env" @pointerdown.stop.prevent="onEnvDown">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <path :d="envD" class="env-line" />
          </svg>
          <view
            v-for="pt in envDots"
            :key="pt.id"
            class="dot"
            :data-env="pt.id"
            :style="{ left: pt.x + '%', top: (pt.y / 40 * 100) + '%' }"
          >{{ pt.id === 's0' ? '' : pt.id.toUpperCase() }}</view>
        </view>
      </view>

      <view class="fx">
        <view v-for="fx in fxSlots" :key="fx.id" class="fx-slot" :class="{ off: !fx.live || fxValue(fx) < 0.001 }">
          <view
            class="knob fx-knob"
            @pointerdown.stop.prevent="fx.live && dragFx(fx, $event)"
            @dblclick.stop="fx.live && setFx(fx, 0)"
          >
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="15" class="ring purple" />
              <circle cx="20" cy="20" r="15" class="arc purple" :stroke-dasharray="arc(fxValue(fx), 0, fx.max)" />
            </svg>
            <view class="pwr sm" :class="{ on: fx.live && fxValue(fx) >= 0.001 }" @click.stop="toggleFx(fx)" />
          </view>
          <text class="fx-name" @click.stop="fx.live && openFx(fx, $event)">{{ fx.label }}</text>
        </view>
      </view>
    </view>

    <view class="glow" :style="{ opacity: 0.25 + Math.min(1, state.gain) * 0.6 }" />

    <view class="mods">
      <view class="xy" data-dst="cutoff" @pointerdown.stop.prevent="onXy">
        <view class="xy-dot" :style="xyStyle" />
        <text class="xy-l">X Cutoff</text>
        <text class="xy-l y">Y Res</text>
      </view>
      <view
        v-for="src in sources"
        :key="src.id"
        class="src"
        :class="{ on: selectedSrc === src.id }"
        @pointerdown.stop.prevent="onSrcDown(src, $event)"
      >
        <view class="src-ring" :style="{ color: src.color }">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none">
            <path :d="src.path" />
          </svg>
        </view>
        <text class="src-name">{{ src.label }}</text>
        <view class="src-slider" @pointerdown.stop.prevent="dragModAmount(src.id, $event)">
          <view class="src-fill" :style="{ width: modPct(src.id) }" />
        </view>
      </view>
    </view>

    <view v-if="state.mods.length" class="routes">
      <text v-for="(m, i) in state.mods" :key="i" class="route" @click.stop="removeMod(i)">{{ m.src }} → {{ m.dst }}</text>
    </view>

    <view class="foot">
      <text class="foot-k" @pointerdown.stop.prevent="dragTop('voices', 1, 16, true, $event)">Poly {{ state.voices }}</text>
      <text class="foot-k" @pointerdown.stop.prevent="dragTop('glide', 0, 0.6, false, $event)">Glide {{ state.glide.toFixed(2) }}</text>
      <text class="foot-k" data-dst="amp" @pointerdown.stop.prevent="dragTop('gain', 0, 1.5, false, $event)">{{ outLabel }}</text>
    </view>

    <view class="keys">
      <view
        v-for="key in keys"
        :key="key.pitch"
        class="key"
        :class="{ black: key.black, down: held === key.pitch }"
        :data-pitch="key.pitch"
        @pointerdown.prevent.stop="play(key.pitch, $event)"
      />
    </view>

    <view v-if="waveFor" class="menu" :style="menuStyle" @pointerdown.stop>
      <view
        v-for="w in waveChoices"
        :key="w.id"
        class="menu-item"
        :class="{ on: state[waveFor].wave === w.id }"
        @click="chooseWave(w.id)"
      >
        <svg viewBox="0 0 36 16"><path :d="wavePath(w.id)" /></svg>
        <text>{{ w.label }}</text>
      </view>
    </view>

    <view v-if="popup" class="pop" :style="popup.style" @pointerdown.stop>
      <text class="pop-title">{{ popup.title }}</text>
      <template v-if="popup.kind === 'lfo'">
        <view class="pop-shapes">
          <text v-for="sh in lfoShapes" :key="sh" class="pill" :class="{ on: state[popup.id].shape === sh }" @click="setLfo(popup.id, 'shape', sh)">{{ sh }}</text>
        </view>
        <view class="pop-plot" @pointerdown.stop.prevent="onLfoPlot(popup.id, $event)">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="lfoPath(state[popup.id].shape)" /></svg>
        </view>
        <view class="pop-row">
          <view class="mini grow" @pointerdown.stop.prevent="dragLfo(popup.id, 'rate', 0.02, 32, $event)">
            <text class="mini-v">{{ state[popup.id].rate.toFixed(2) }} Hz</text>
            <text class="mini-l">Rate</text>
          </view>
          <view class="mini grow" @pointerdown.stop.prevent="dragLfo(popup.id, 'amount', 0, 1, $event)">
            <text class="mini-v">{{ pct(state[popup.id].amount) }}</text>
            <text class="mini-l">Depth</text>
          </view>
        </view>
      </template>
      <template v-else-if="popup.kind === 'fx'">
        <text class="pop-val">{{ fxReadout(popup.fx) }}</text>
        <view class="pop-slider" @pointerdown.stop.prevent="dragFx(popup.fx, $event)">
          <view class="src-fill" :style="{ width: (fxValue(popup.fx) / popup.fx.max * 100) + '%' }" />
        </view>
      </template>
      <view class="pop-x" @click="popup = null">×</view>
    </view>

    <view v-if="ghost" class="ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }">{{ ghost.label }}</view>
    <view v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { WAVES, FILTER_TYPES, MOD_SOURCES, defaultTwinState, normalizeTwinState } from '../../dsp/synth/params.js'
import { TWIN_PRESETS } from '../../dsp/synth/presets.js'
import { previewNoteOn, previewNoteOff, updateTwinPatch } from '../../store/session.js'
import {
  freqToX, xToFreq, nodeY, yToRes, filterCurve, serialCurve, toPath,
  envPoints, envPath, lfoPath, wavePath, xToSec, WAVE_CHOICES
} from '../../dsp/synth/twin-ui.js'

const props = defineProps({ track: { type: Object, required: true } })
const filterTypes = FILTER_TYPES
const waveChoices = WAVE_CHOICES
const lfoShapes = ['sine', 'saw', 'square']
const fxSlots = [
  { id: 'reverb', label: 'Reverb', key: 'reverb', max: 1, live: true },
  { id: 'delay', label: 'Delay', key: 'delay', max: 1, live: true },
  { id: 'chorus', label: 'Chorus', key: 'chorus', max: 1, live: true },
  { id: 'phaser', label: 'Phaser', key: '', max: 1, live: false },
  { id: 'drive', label: 'Drive', key: 'drive', max: 12, live: true },
  { id: 'compress', label: 'Compress', key: '', max: 1, live: false }
]
const remembered = {}
const activeFilt = ref('filter1')
const activeEnv = ref('env1')
const selectedSrc = ref('env1')
const waveFor = ref('')
const menuStyle = ref({})
const popup = ref(null)
const ghost = ref(null)
const tip = ref(null)
const held = ref(0)
const presetCursor = ref(0)

const state = computed(() => normalizeTwinState(props.track.twinState || defaultTwinState()))
const oscs = computed(() => ['osc1', 'osc2', 'osc3'].map((key) => ({
  key,
  ...state.value[key],
  levelDst: key + 'Level'
})))
const curve1 = computed(() => toPath(state.value.filterRoute === 'serial'
  ? serialCurve(state.value.filter1, state.value.filter2)
  : filterCurve(state.value.filter1)))
const curve2 = computed(() => toPath(filterCurve(state.value.filter2)))
const envD = computed(() => envPath(state.value[activeEnv.value]))
const envDots = computed(() => {
  const p = envPoints(state.value[activeEnv.value])
  return [p.a, p.d, p.h, p.r]
})
const grids = ['M4 20 H96', 'M4 36 H96', 'M4 50 H96', 'M27 4 V56', 'M50 4 V56', 'M73 4 V56']
const sources = computed(() => [
  { id: 'lfo1', label: 'LFO 1', color: '#3ddec8', kind: 'lfo', path: lfoPath(state.value.lfo1.shape) },
  { id: 'lfo2', label: 'LFO 2', color: '#2ec4b6', kind: 'lfo', path: lfoPath(state.value.lfo2.shape) },
  { id: 'env1', label: 'Filter EG', color: '#5eb0f0', kind: 'env', path: envPath(state.value.env1) },
  { id: 'env2', label: 'Mod EG', color: '#7aa2ff', kind: 'env', path: envPath(state.value.env2) },
  { id: 'vel', label: 'Velocity', color: '#b388ff', kind: 'vel', path: 'M8 30 L20 8 L32 30 L44 12 L56 30 L68 16 L80 30 L92 18' }
])
const keys = computed(() => {
  const out = []
  for (let p = 48; p <= 72; p++) {
    const n = p % 12
    out.push({ pitch: p, black: n === 1 || n === 3 || n === 6 || n === 8 || n === 10 })
  }
  return out
})
const presetLabel = computed(() => {
  const cur = JSON.stringify(state.value)
  const found = TWIN_PRESETS.find((p) => JSON.stringify(normalizeTwinState(p.state)) === cur)
  return found ? found.name : 'Edited'
})
const outLabel = computed(() => {
  const g = state.value.gain
  if (g < 0.001) return '-inf'
  const db = 20 * Math.log10(g)
  return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB'
})
const xyStyle = computed(() => ({
  left: freqToX(state.value.filter1.cutoff) + '%',
  top: (nodeY(state.value.filter1.res) / 60 * 100) + '%'
}))

function pct (v) { return Math.round((Number(v) || 0) * 100) + '%' }
function panLabel (v) {
  const n = Math.round((Number(v) || 0) * 100)
  if (Math.abs(n) < 3) return 'C'
  return n < 0 ? 'L' + Math.abs(n) : 'R' + n
}
function arc (value, min, max) {
  const t = Math.min(1, Math.max(0, (value - min) / (max - min || 1)))
  const len = t * 78
  return len + ' 100'
}
function nodeStyle (filt) {
  return { left: freqToX(filt.cutoff) + '%', top: (nodeY(filt.res) / 60 * 100) + '%' }
}
function commit (next) {
  props.track.twinState = normalizeTwinState(next)
  updateTwinPatch(props.track)
}
function set (key, value) { commit({ ...state.value, [key]: value }) }
function setOsc (oscKey, field, value) {
  commit({ ...state.value, [oscKey]: { ...state.value[oscKey], [field]: value } })
}
function setFilt (which, field, value) {
  commit({ ...state.value, [which]: { ...state.value[which], [field]: value } })
}
function setLfo (key, field, value) {
  commit({ ...state.value, [key]: { ...state.value[key], [field]: value } })
}
function fxValue (fx) {
  if (!fx.live) return 0
  if (fx.id === 'drive') return state.value.filter1.drive
  return state.value[fx.key] || 0
}
function setFx (fx, value) {
  const v = Math.min(fx.max, Math.max(0, value))
  if (fx.id === 'drive') setFilt('filter1', 'drive', v)
  else set(fx.key, v)
}
function fxReadout (fx) {
  const v = fxValue(fx)
  if (fx.id === 'drive') return v.toFixed(1)
  return pct(v)
}

function showTip (e, text) {
  const p = e.touches ? e.touches[0] : e
  tip.value = { x: p.clientX + 14, y: p.clientY - 28, text }
}
function dragValue (e, read, write, min, max, integer, format) {
  const startY = e.clientY
  const start = Number(read()) || 0
  const move = (ev) => {
    let next = start - (ev.clientY - startY) * (max - min) / 140
    next = Math.min(max, Math.max(min, next))
    if (integer) next = Math.round(next)
    write(next)
    showTip(ev, format(next))
  }
  const up = () => {
    tip.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function dragOsc (key, field, min, max, integer, e) {
  dragValue(e, () => state.value[key][field], (v) => setOsc(key, field, v), min, max, integer, (v) => {
    if (field === 'level') return pct(v)
    if (field === 'pan') return panLabel(v)
    if (field === 'detune') return Math.round(v) + ' ct'
    return String(Math.round(v))
  })
}
function dragTop (field, min, max, integer, e) {
  dragValue(e, () => state.value[field], (v) => set(field, v), min, max, integer, (v) => {
    if (field === 'gain') return outLabel.value
    if (field === 'voices') return 'Poly ' + Math.round(v)
    return 'Glide ' + v.toFixed(2)
  })
}
function dragFx (fx, e) {
  dragValue(e, () => fxValue(fx), (v) => setFx(fx, v), 0, fx.max, false, () => fx.label + '  ' + fxReadout(fx))
}
function dragLfo (key, field, min, max, e) {
  dragValue(e, () => state.value[key][field], (v) => setLfo(key, field, v), min, max, false, (v) => {
    return field === 'rate' ? v.toFixed(2) + ' Hz' : pct(v)
  })
}
function dragModAmount (src, e) {
  const existing = state.value.mods.find((m) => m.src === src)
  dragValue(
    e,
    () => existing ? existing.amount : 0,
    (v) => upsertMod(src, existing ? existing.dst : 'cutoff', v),
    -1,
    1,
    false,
    (v) => src + '  ' + Math.round(v * 100) + '%'
  )
}

function toggleOsc (osc) {
  if (osc.level >= 0.001) {
    remembered[osc.key] = osc.level
    setOsc(osc.key, 'level', 0)
  } else setOsc(osc.key, 'level', remembered[osc.key] || 0.7)
}
function toggleFx (fx) {
  if (!fx.live) return
  const v = fxValue(fx)
  if (v >= 0.001) {
    remembered[fx.id] = v
    setFx(fx, 0)
  } else setFx(fx, remembered[fx.id] || (fx.id === 'drive' ? 3 : 0.25))
}
function toggleWave (key, e) {
  if (waveFor.value === key) { waveFor.value = ''; return }
  waveFor.value = key
  popup.value = null
  const r = e.currentTarget.getBoundingClientRect()
  menuStyle.value = { left: r.left + 'px', top: (r.bottom + 6) + 'px' }
}
function chooseWave (id) {
  const key = waveFor.value
  if (!key || !WAVES.includes(id)) return
  const wt = id.indexOf('wt') === 0 ? Number(id.slice(2)) : state.value[key].wt
  commit({ ...state.value, [key]: { ...state.value[key], wave: id, wt } })
  waveFor.value = ''
}
function stepPreset (dir) {
  const cur = JSON.stringify(state.value)
  let i = TWIN_PRESETS.findIndex((p) => JSON.stringify(normalizeTwinState(p.state)) === cur)
  if (i < 0) i = presetCursor.value
  const next = (i + dir + TWIN_PRESETS.length) % TWIN_PRESETS.length
  presetCursor.value = next
  commit(TWIN_PRESETS[next].state)
  waveFor.value = ''
  popup.value = null
}

function closestAttr (e, sel) {
  const node = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement)
  return node && node.closest ? node.closest(sel) : null
}
function localPoint (e, el, w, h) {
  const p = e.touches ? e.touches[0] : e
  const r = el.getBoundingClientRect()
  return {
    x: ((p.clientX - r.left) / Math.max(1, r.width)) * w,
    y: ((p.clientY - r.top) / Math.max(1, r.height)) * h,
    px: p.clientX,
    py: p.clientY
  }
}
function onFilterDown (e) {
  const el = e.currentTarget
  const host = closestAttr(e, '[data-filt]')
  const which = host && host.dataset.filt ? host.dataset.filt : nearestFilt(localPoint(e, el, 100, 60).x)
  activeFilt.value = which
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 60)
    commit({ ...state.value, [which]: { ...state.value[which], cutoff: xToFreq(pt.x), res: yToRes(pt.y) } })
    const f = state.value[which]
    showTip(ev, Math.round(f.cutoff) + ' Hz  ·  res ' + Math.round(f.res * 100) + '%')
  }
  apply(e)
  bindDrag(apply)
}
function nearestFilt (x) {
  const a = Math.abs(freqToX(state.value.filter1.cutoff) - x)
  const b = Math.abs(freqToX(state.value.filter2.cutoff) - x)
  return b + 6 < a ? 'filter2' : 'filter1'
}
function onEnvDown (e) {
  const el = e.currentTarget
  const host = closestAttr(e, '[data-env]')
  const id = host && host.dataset.env ? host.dataset.env : nearestEnv(localPoint(e, el, 100, 40))
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 40)
    const env = state.value[activeEnv.value]
    const sec = xToSec(pt.x)
    const sustain = Math.min(1, Math.max(0, 1 - (pt.y - 4) / 30))
    const patch = {}
    if (id === 'a') patch.attack = Math.min(4, Math.max(0.001, sec))
    else if (id === 'd') {
      patch.decay = Math.min(6, Math.max(0.01, sec - env.attack))
      patch.sustain = sustain
    } else if (id === 'h') patch.sustain = sustain
    else if (id === 'r') patch.release = Math.min(8, Math.max(0.01, sec - env.attack - env.decay - 0.55))
    const key = activeEnv.value
    commit({ ...state.value, [key]: { ...state.value[key], ...patch } })
    const now = state.value[activeEnv.value]
    showTip(ev, id.toUpperCase() + '  ' + (id === 'h' || id === 'd' ? pct(now.sustain) : now[id === 'a' ? 'attack' : id === 'r' ? 'release' : 'decay'].toFixed(2) + ' s'))
  }
  apply(e)
  bindDrag(apply)
}
function nearestEnv (pt) {
  const dots = envPoints(state.value[activeEnv.value])
  let best = 'a'
  let dist = 1e9
  ;['a', 'd', 'h', 'r'].forEach((id) => {
    const d = Math.hypot(dots[id].x - pt.x, (dots[id].y - pt.y) * 1.6)
    if (d < dist) { dist = d; best = id }
  })
  return best
}
function onXy (e) {
  const el = e.currentTarget
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 60)
    commit({ ...state.value, filter1: { ...state.value.filter1, cutoff: xToFreq(pt.x), res: yToRes(pt.y) } })
    showTip(ev, Math.round(state.value.filter1.cutoff) + ' Hz')
  }
  apply(e)
  bindDrag(apply)
}
function onLfoPlot (key, e) {
  const el = e.currentTarget
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 40)
    const rate = 0.02 + Math.min(1, Math.max(0, (pt.x - 4) / 92)) * 16
    const amount = Math.min(1, Math.max(0, 1 - pt.y / 36))
    commit({ ...state.value, [key]: { ...state.value[key], rate, amount } })
    showTip(ev, rate.toFixed(2) + ' Hz')
  }
  apply(e)
  bindDrag(apply)
}
function bindDrag (apply) {
  const move = (ev) => { if (ev.cancelable) ev.preventDefault(); apply(ev) }
  const up = () => {
    tip.value = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onSrcDown (src, e) {
  const startX = e.clientX
  const startY = e.clientY
  let moved = false
  selectedSrc.value = src.id
  if (src.kind === 'env') activeEnv.value = src.id
  const move = (ev) => {
    if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 6) moved = true
    if (moved) ghost.value = { x: ev.clientX + 12, y: ev.clientY + 12, label: src.label }
  }
  const up = (ev) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    ghost.value = null
    if (!moved) {
      if (src.kind === 'lfo') openLfo(src, e)
      return
    }
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const host = el && el.closest ? el.closest('[data-dst]') : null
    const dst = host && host.dataset ? host.dataset.dst : ''
    if (dst && MOD_SOURCES.includes(src.id)) upsertMod(src.id, dst, 0.35)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function upsertMod (src, dst, amount) {
  const mods = state.value.mods.filter((m) => !(m.src === src && m.dst === dst))
  mods.push({ src, dst, amount })
  commit({ ...state.value, mods })
}
function removeMod (index) {
  const mods = state.value.mods.filter((_, i) => i !== index)
  commit({ ...state.value, mods })
}
function modPct (src) {
  const m = state.value.mods.find((item) => item.src === src)
  const amount = m ? m.amount : 0
  return Math.round(((amount + 1) / 2) * 100) + '%'
}
function openLfo (src, e) {
  waveFor.value = ''
  const r = e.currentTarget.getBoundingClientRect()
  popup.value = {
    kind: 'lfo',
    id: src.id,
    title: src.label,
    style: { left: Math.max(8, r.left - 40) + 'px', top: Math.max(8, r.top - 168) + 'px' }
  }
}
function openFx (fx, e) {
  waveFor.value = ''
  const r = e.currentTarget.getBoundingClientRect()
  popup.value = {
    kind: 'fx',
    fx,
    title: fx.label,
    style: { left: Math.max(8, r.left - 80) + 'px', top: (r.bottom + 8) + 'px' }
  }
}
function onRootDown () {
  waveFor.value = ''
  popup.value = null
}

function play (pitch, e) {
  held.value = pitch
  previewNoteOn(props.track, pitch, 0.85)
  const move = (ev) => {
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const key = el && el.closest ? el.closest('[data-pitch]') : null
    const next = key ? Number(key.dataset.pitch) : 0
    if (next && next !== held.value) {
      previewNoteOff(props.track, held.value)
      held.value = next
      previewNoteOn(props.track, next, 0.85)
    }
  }
  const up = () => {
    previewNoteOff(props.track, held.value)
    held.value = 0
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
</script>

<style scoped>
.twin {
  height: 100%;
  min-height: 560px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  box-sizing: border-box;
  background: #14161a;
  color: #d7dbe2;
  overflow: auto;
  user-select: none;
}
.bar, .preset, .plot-tools, .subrow, .pop-shapes, .pop-row, .routes, .foot {
  display: flex;
  align-items: center;
  gap: 6px;
}
.bar { flex-shrink: 0; }
.mark {
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #e6c15a;
  font-size: 13px;
}
.preset { margin-left: auto; min-width: 0; }
.preset-name {
  min-width: 88px;
  max-width: 180px;
  text-align: center;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.step, .pop-x {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #9aa3ae;
}
.out { font-size: 11px; color: #8b939e; min-width: 52px; text-align: right; }
.main {
  flex: 1;
  min-height: 280px;
  display: grid;
  grid-template-columns: 188px minmax(0, 1fr) 156px;
  gap: 8px;
}
.oscs, .fx { display: flex; flex-direction: column; gap: 6px; min-height: 0; }
.osc {
  display: grid;
  grid-template-columns: 16px 42px 36px 1fr;
  grid-template-rows: 46px 28px;
  gap: 4px 6px;
  align-items: center;
  padding: 4px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.02);
}
.osc.mute { opacity: 0.45; }
.pwr {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #3a3f46;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16);
  cursor: pointer;
}
.pwr.on { background: #3ddec8; box-shadow: 0 0 8px rgba(61, 222, 200, 0.7); }
.pwr.sm { position: absolute; right: 0; top: 0; }
.wave-btn, .src-ring, .pop-plot {
  background: #101216;
  border-radius: 6px;
  cursor: pointer;
}
.wave-btn { height: 32px; display: flex; align-items: center; justify-content: center; }
.wave-btn svg, .src-ring svg, .pop-plot svg { width: 100%; height: 16px; }
.wave-btn path, .menu-item path { fill: none; stroke: #e6c15a; stroke-width: 1.4; }
.knob { position: relative; width: 46px; height: 46px; justify-self: end; cursor: ns-resize; touch-action: none; }
.knob svg { width: 100%; height: 100%; }
.ring { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 2; }
.arc { fill: none; stroke: #e6c15a; stroke-width: 2; stroke-linecap: round; transform: rotate(-130deg); transform-origin: 20px 20px; }
.arc.purple, .ring.purple { stroke: #8b6cff; }
.ring.purple { stroke: rgba(139, 108, 255, 0.28); }
.mini {
  min-width: 36px;
  height: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: ns-resize;
  touch-action: none;
}
.mini.grow { flex: 1; }
.mini-v { font-size: 11px; color: #e8edf2; }
.mini-l { font-size: 8px; letter-spacing: 0.08em; text-transform: uppercase; color: #8b939e; }
.subrow { grid-column: 1 / -1; }
.center { display: flex; flex-direction: column; gap: 4px; min-width: 0; min-height: 0; }
.plot {
  position: relative;
  flex: 1;
  min-height: 90px;
  background: #101216;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
}
.plot svg { width: 100%; height: 100%; display: block; }
.grid { fill: none; stroke: rgba(255,255,255,0.05); stroke-width: 0.3; }
.f1 { fill: none; stroke: #e6c15a; stroke-width: 0.7; }
.f1.glow { stroke-width: 2.2; opacity: 0.28; }
.f2 { fill: none; stroke: #c9842a; stroke-width: 0.45; opacity: 0.7; }
.env-line { fill: none; stroke: #5eb0f0; stroke-width: 0.8; }
.node, .dot {
  position: absolute;
  width: 16px;
  height: 16px;
  margin: -8px 0 0 -8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8px;
  color: #14161a;
  background: #e6c15a;
}
.node.n2 { background: #c9842a; }
.node.on { box-shadow: 0 0 0 2px rgba(230, 193, 90, 0.45); }
.dot { background: #5eb0f0; color: #071018; }
.fx { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 6px; align-content: start; }
.fx-slot { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.fx-slot.off { opacity: 0.38; }
.fx-knob { width: 52px; height: 52px; }
.fx-name { font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #b9a7ff; cursor: pointer; }
.glow {
  height: 8px;
  flex-shrink: 0;
  border-radius: 99px;
  background: linear-gradient(90deg, transparent, #1f8f86, #5eb0f0, #8b6cff, transparent);
  filter: blur(3px);
}
.mods { display: flex; gap: 6px; min-height: 78px; flex-shrink: 0; }
.xy {
  position: relative;
  width: 86px;
  flex-shrink: 0;
  background: #101216;
  border-radius: 8px;
  touch-action: none;
  cursor: crosshair;
}
.xy-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  margin: -4px 0 0 -4px;
  border-radius: 50%;
  background: #3ddec8;
  box-shadow: 0 0 8px #3ddec8;
}
.xy-l { position: absolute; left: 4px; bottom: 2px; font-size: 8px; color: #6d7682; }
.xy-l.y { bottom: auto; top: 2px; }
.src { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; cursor: grab; }
.src-ring { flex: 1; min-height: 36px; padding: 4px; border: 1px solid rgba(255,255,255,0.06); }
.src-ring path, .pop-plot path { fill: none; stroke: currentColor; stroke-width: 1.4; }
.src.on .src-ring { border-color: currentColor; }
.src-name { font-size: 9px; text-align: center; color: #9aa3ae; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.src-slider, .pop-slider {
  height: 4px;
  border-radius: 99px;
  background: #2a2e34;
  overflow: hidden;
  cursor: ew-resize;
  touch-action: none;
}
.src-fill { height: 100%; background: #8b6cff; }
.routes { flex-wrap: wrap; }
.route, .pill, .foot-k, .menu-item {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #9aa3ae;
  cursor: pointer;
}
.route { padding: 2px 6px; border-radius: 99px; background: #1c2026; }
.pill { padding: 2px 6px; border-radius: 4px; }
.pill.on { color: #e6c15a; }
.foot { flex-shrink: 0; gap: 14px; }
.foot-k { touch-action: none; cursor: ns-resize; }
.keys { display: flex; height: 54px; gap: 2px; flex-shrink: 0; }
.key { flex: 1; min-width: 10px; background: #e6e9ee; border-radius: 0 0 4px 4px; }
.key.black { background: #2a2e34; flex: 0.62; margin: 0 -4px; height: 62%; z-index: 1; }
.key.down { background: #e6c15a; }
.menu, .pop, .ghost, .tip {
  position: fixed;
  z-index: 80;
}
.menu, .pop {
  background: #1b1e24;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.45);
  padding: 6px;
}
.menu { max-height: 280px; overflow: auto; min-width: 140px; }
.menu-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; text-transform: none; letter-spacing: 0; font-size: 12px; }
.menu-item svg { width: 36px; height: 14px; }
.menu-item.on { color: #e6c15a; }
.pop { width: 220px; }
.pop-title { font-size: 12px; color: #e8edf2; }
.pop-plot { height: 64px; margin: 6px 0; }
.pop-plot svg { height: 100%; }
.pop-val { font-size: 18px; color: #e8edf2; }
.pop-x { position: absolute; right: 4px; top: 4px; }
.ghost, .tip {
  pointer-events: none;
  padding: 4px 8px;
  border-radius: 6px;
  background: #0e1013;
  color: #e8edf2;
  font-size: 11px;
  border: 1px solid rgba(255,255,255,0.08);
}
@media (max-width: 860px) {
  .main { grid-template-columns: 1fr 1fr; }
  .center { grid-column: 1 / -1; min-height: 220px; }
  .mods { overflow-x: auto; }
}
</style>
