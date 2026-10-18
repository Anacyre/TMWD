<template>
  <view class="twin twin-panel" @pointerdown="onRootDown">
    <view class="main">
      <view class="col oscs">
        <view v-for="osc in oscs" :key="osc.key" class="osc" :class="{ mute: osc.level < 0.001 }">
          <view class="osc-top">
            <view class="pwr" :class="{ on: osc.level >= 0.001 }" @click.stop="toggleOsc(osc)" />
            <view class="wave-btn" @pointerdown.stop @click.stop="toggleWave(osc.key, $event)">
              <svg viewBox="0 0 36 16"><path :d="wavePath(osc.wave)" /></svg>
            </view>
            <view class="uni" @pointerdown.stop.prevent="dragOsc(osc.key, 'unison', 1, 8, true, $event)">
              <text class="uni-v">{{ Math.round(osc.unison) }}</text>
              <text class="uni-l">Uni</text>
            </view>
          </view>
          <view class="osc-foot">
            <view class="knob" :data-dst="osc.levelDst" @pointerdown.stop.prevent="dragOsc(osc.key, 'level', 0, 1, false, $event)">
              <svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="14" class="face" />
                <circle cx="20" cy="20" r="15" class="ring" />
                <circle cx="20" cy="20" r="15" class="arc" :stroke-dasharray="arcDash(osc.level, 0, 1)" />
              </svg>
            </view>
            <text class="osc-name">OSC {{ osc.key.slice(-1) }}</text>
          </view>
        </view>
      </view>
      <view class="col center">
        <view class="plot-tools">
          <text class="cap">Filter</text>
          <view class="pills">
            <text v-for="t in filterTypeLabels" :key="t.id" class="pill" :class="{ on: state[activeFilt].type === t.id }" @click.stop="setFilt(activeFilt, 'type', t.id)">{{ t.label }}</text>
          </view>
          <view class="pills">
            <text class="pill" :class="{ on: activeFilt === 'filter1' }" @click.stop="activeFilt = 'filter1'">1</text>
            <text class="pill" :class="{ on: activeFilt === 'filter2' }" @click.stop="activeFilt = 'filter2'">2</text>
          </view>
        </view>
        <view class="plot filt" data-dst="cutoff" @pointerdown.stop.prevent="onFilterDown">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none">
            <path v-for="(d, i) in grids" :key="i" :d="d" class="grid" />
            <path :d="curve2" class="f2" /><path :d="curve1" class="f1 glow" /><path :d="curve1" class="f1" />
          </svg>
          <view class="node n1" :class="{ on: activeFilt === 'filter1' }" :style="nodeStyle(state.filter1)" data-filt="filter1">1</view>
          <view class="node n2" :class="{ on: activeFilt === 'filter2' }" :style="nodeStyle(state.filter2)" data-filt="filter2">2</view>
        </view>
        <view class="plot env" @pointerdown.stop.prevent="onEnvDown">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="envD" class="env-line" /><path :d="envD" class="env-glow" /></svg>
          <view v-for="pt in envDots" :key="pt.id" class="dot" :data-env="pt.id" :style="{ left: pt.x + '%', top: (pt.y / 40 * 100) + '%' }">{{ pt.id.toUpperCase() }}</view>
          <text class="plot-tag">Envelope</text>
        </view>
      </view>
      <view class="col side">
        <view class="lfo-dial" @click.stop="openSideLfo($event)">
          <svg viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="29" class="dial-face" />
            <circle cx="32" cy="32" r="29" class="dial-ring" />
          </svg>
          <svg class="dial-wave" viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="sideLfoPath" /></svg>
        </view>
        <text class="side-name" @click.stop="openSideLfo($event)">{{ sideLfoLabel }}</text>
        <view class="side-eg" @click.stop="selectModEg">
          <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="env2Path" /></svg>
        </view>
        <text class="side-name" @click.stop="selectModEg">Mod EG</text>
      </view>
      <view class="col fx">
        <view v-for="fx in fxSlots" :key="fx.id" class="fx-slot" :class="{ off: !fx.live || fxValue(fx) < 0.001 }">
          <view class="knob fx-knob" @pointerdown.stop.prevent="fx.live && dragFx(fx, $event)" @dblclick.stop="fx.live && setFx(fx, 0)">
            <svg viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="14" class="face" />
              <circle cx="20" cy="20" r="15" class="ring purple" />
              <circle cx="20" cy="20" r="15" class="arc purple" :stroke-dasharray="arcDash(fxValue(fx), 0, fx.max)" />
            </svg>
            <view class="pwr sm" :class="{ on: fx.live && fxValue(fx) >= 0.001 }" @click.stop="toggleFx(fx)" />
          </view>
          <text class="fx-name" @click.stop="fx.live && openFx(fx, $event)">{{ fx.label }} <text class="fx-caret">⌄</text></text>
        </view>
      </view>
    </view>
    <view class="rack">
      <view class="xy" data-dst="cutoff" @pointerdown.stop.prevent="onXy">
        <view class="xy-dot" :style="xyStyle" />
        <text class="xy-l x">X: Cutoff</text>
        <text class="xy-l y">Y: Resonance</text>
      </view>
      <view class="rack-sep" />
      <view v-for="src in sources" :key="src.id" class="src" :class="{ sel: selectedSrc === src.id }" @pointerdown.stop.prevent="onSrcDown(src, $event)">
        <view class="src-knob" :style="{ borderColor: src.color }"><view class="src-dot" :style="{ background: src.color }" /></view>
        <view class="src-tile" :style="{ color: src.color }"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="src.path" /></svg></view>
        <text class="src-name">{{ src.label }}</text>
      </view>
    </view>
    <view class="keys">
      <view v-for="key in keys" :key="key.pitch" class="key" :class="{ black: key.black, down: held === key.pitch }" :data-pitch="key.pitch" @pointerdown.prevent.stop="play(key.pitch)" />
    </view>
    <view v-if="waveFor" class="menu" :style="menuStyle" @pointerdown.stop>
      <view v-for="w in waveChoices" :key="w.id" class="menu-item" :class="{ on: state[waveFor].wave === w.id }" @click="chooseWave(w.id)">
        <svg viewBox="0 0 36 16"><path :d="wavePath(w.id)" /></svg><text>{{ w.label }}</text>
      </view>
      <template v-if="showMorph">
        <view class="menu-sep" />
        <text class="menu-cap">Morph</text>
        <view class="menu-slider" @pointerdown.stop.prevent="onMorph" :style="{ left: menuStyle.left, width: '150px' }">
          <view class="menu-fill" :style="{ width: (state[waveFor].wtPos * 100) + '%' }" />
        </view>
      </template>
    </view>
    <view v-if="popup" class="pop" :style="popup.style" @pointerdown.stop>
      <text class="pop-title">{{ popup.title }}</text>
      <template v-if="popup.kind === 'lfo'">
        <view class="pop-plot" @pointerdown.stop.prevent="onLfoPlot(popup.id, $event)"><svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="lfoPath(state[popup.id].shape)" /></svg></view>
        <view class="pop-shapes">
          <view v-for="sh in lfoShapes" :key="sh" class="pop-shape" :class="{ on: state[popup.id].shape === sh }" @click.stop="setLfoShape(popup.id, sh)">
            <svg viewBox="0 0 100 40" preserveAspectRatio="none"><path :d="lfoPath(sh)" /></svg>
          </view>
        </view>
        <view class="mini grow" @pointerdown.stop.prevent="dragLfo(popup.id, 'rate', 0.02, 32, $event)"><text class="mini-v">{{ state[popup.id].rate.toFixed(2) }} Hz</text></view>
      </template>
      <template v-else-if="popup.kind === 'fx'">
        <text class="pop-val">{{ fxReadout(popup.fx) }}</text>
        <view class="pop-slider" @pointerdown.stop.prevent="dragFx(popup.fx, $event)"><view class="src-fill" :style="{ width: (fxValue(popup.fx) / popup.fx.max * 100) + '%' }" /></view>
      </template>
      <view class="pop-x" @click="popup = null">×</view>
    </view>
    <view v-if="ghost" class="ghost" :style="{ left: ghost.x + 'px', top: ghost.y + 'px' }">{{ ghost.label }}</view>
    <view v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { FILTER_TYPES, LFO_SHAPES, MOD_SOURCES, defaultTwinState, normalizeTwinState } from '../../dsp/synth/params.js'
import { previewNoteOn, previewNoteOff } from '../../store/session.js'
import { pointerCoord } from '../../lib/pointer-drag.js'
import { useTwinPatch } from './twin-patch.js'
import {
  freqToX, xToFreq, nodeY, yToRes, filterCurve, serialCurve, toPath,
  envPoints, envPath, lfoPath, wavePath, xToSec, WAVE_CHOICES
} from '../../dsp/synth/twin-ui.js'

const props = defineProps({ track: { type: Object, required: true } })
const { state, commit, setOsc, setFilt, setLfo, pct, toggleOsc, remembered } = useTwinPatch(props)
const filterTypes = FILTER_TYPES
const filterTypeLabels = [
  { id: 'lowpass', label: 'LP' }, { id: 'low12', label: 'LP12' },
  { id: 'highpass', label: 'HP' }, { id: 'high12', label: 'HP12' },
  { id: 'bandpass', label: 'BP' }, { id: 'notch', label: 'NOT' },
  { id: 'shelf', label: 'SH' }
]
const lfoShapes = LFO_SHAPES
const waveChoices = WAVE_CHOICES
const fxSlots = [
  { id: 'reverb', label: 'Reverb', key: 'reverb', max: 1, live: true },
  { id: 'delay', label: 'Delay', key: 'delay', max: 1, live: true },
  { id: 'chorus', label: 'Chorus', key: 'chorus', max: 1, live: true },
  { id: 'phaser', label: 'Phaser', key: '', max: 1, live: false },
  { id: 'drive', label: 'Drive', key: 'drive', max: 12, live: true },
  { id: 'compress', label: 'Compress', key: '', max: 1, live: false }
]
const activeFilt = ref('filter1')
const activeEnv = ref('env1')
const selectedSrc = ref('env1')
const lastLfo = ref('lfo1')
const waveFor = ref('')
const menuStyle = ref({})
const popup = ref(null)
const ghost = ref(null)
const tip = ref(null)
const held = ref(0)
const grids = ['M4 20 H96', 'M4 36 H96', 'M27 4 V56', 'M50 4 V56', 'M73 4 V56']

const oscs = computed(() => ['osc1', 'osc2', 'osc3'].map((key) => ({ key, ...state.value[key], levelDst: key + 'Level' })))
const curve1 = computed(() => toPath(state.value.filterRoute === 'serial' ? serialCurve(state.value.filter1, state.value.filter2) : filterCurve(state.value.filter1)))
const curve2 = computed(() => toPath(filterCurve(state.value.filter2)))
const envD = computed(() => envPath(state.value[activeEnv.value]))
const envDots = computed(() => { const p = envPoints(state.value[activeEnv.value]); return [p.a, p.d, p.h, p.r] })
const env2Path = computed(() => envPath(state.value.env2))
const sources = computed(() => [
  { id: 'lfo1', label: 'LFO 1', color: '#35d3a4', kind: 'lfo', path: lfoPath(state.value.lfo1.shape) },
  { id: 'lfo2', label: 'LFO 2', color: '#2ec4b6', kind: 'lfo', path: lfoPath(state.value.lfo2.shape) },
  { id: 'env1', label: 'Filter EG', color: '#58a6e8', kind: 'env', path: envPath(state.value.env1) },
  { id: 'env2', label: 'Mod EG', color: '#7aa2ff', kind: 'env', path: envPath(state.value.env2) },
  { id: 'vel', label: 'Velocity', color: '#a06ff2', kind: 'vel', path: 'M8 30 L92 18' }
])
const keys = computed(() => {
  const out = []
  for (let p = 48; p <= 72; p++) {
    const n = p % 12
    out.push({ pitch: p, black: n === 1 || n === 3 || n === 6 || n === 8 || n === 10 })
  }
  return out
})
const xyStyle = computed(() => ({ left: freqToX(state.value.filter1.cutoff) + '%', top: (nodeY(state.value.filter1.res) / 60 * 100) + '%' }))
const sideLfo = computed(() => (lastLfo.value === 'lfo2' ? 'lfo2' : 'lfo1'))
const sideLfoLabel = computed(() => (sideLfo.value === 'lfo2' ? 'LFO 2' : 'LFO 1'))
const sideLfoPath = computed(() => lfoPath(state.value[sideLfo.value].shape))

function arcDash (value, min, max) { return (Math.max(0.2, Math.min(1, (value - min) / (max - min || 1))) * 78) + ' 100' }
function nodeStyle (filt) { return { left: freqToX(filt.cutoff) + '%', top: (nodeY(filt.res) / 60 * 100) + '%' } }
function fxValue (fx) { return !fx.live ? 0 : (fx.id === 'drive' ? state.value.filter1.drive : state.value[fx.key] || 0) }
function setFx (fx, value) {
  const v = Math.min(fx.max, Math.max(0, value))
  if (fx.id === 'drive') setFilt('filter1', 'drive', v)
  else commit({ ...state.value, [fx.key]: v })
}
function fxReadout (fx) { const v = fxValue(fx); return fx.id === 'drive' ? v.toFixed(1) : pct(v) }
function toggleFx (fx) {
  if (!fx.live) return
  const v = fxValue(fx)
  if (v >= 0.001) { remembered[fx.id] = v; setFx(fx, 0) } else setFx(fx, remembered[fx.id] || (fx.id === 'drive' ? 3 : 0.25))
}
function toggleWave (key, e) {
  waveFor.value = waveFor.value === key ? '' : key
  popup.value = null
  if (waveFor.value) {
    const r = anchorRect(e, '.wave-btn')
    menuStyle.value = r ? { left: r.left + 'px', top: (r.bottom + 6) + 'px' } : { left: '40px', top: '140px' }
  }
}
function chooseWave (id) {
  const key = waveFor.value
  if (!key) return
  const wt = id.indexOf('wt') === 0 ? Number(id.slice(2)) : state.value[key].wt
  commit({ ...state.value, [key]: { ...state.value[key], wave: id, wt } })
  waveFor.value = ''
}
function anchorRect (e, sel) {
  let el = e && e.currentTarget
  if (!el || typeof el.getBoundingClientRect !== 'function') el = e && e.target
  if (el && typeof el.closest === 'function' && sel) { const host = el.closest(sel); if (host) el = host }
  return el && typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : null
}
function openLfoPopup (key, r) {
  const left = r ? Math.max(8, r.left - 40) : 90
  const top = r ? Math.max(8, r.top - 140) : 120
  popup.value = { kind: 'lfo', id: key, title: key === 'lfo2' ? 'LFO 2' : 'LFO 1', style: { left: left + 'px', top: top + 'px' } }
}
function openSideLfo (e) {
  waveFor.value = ''
  openLfoPopup(sideLfo.value, anchorRect(e, '.lfo-dial'))
}
function selectModEg () {
  waveFor.value = ''
  selectedSrc.value = 'env2'
  activeEnv.value = 'env2'
}
function showTip (e, text) {
  const p = pointerCoord(e)
  if (!p) return
  tip.value = { x: p.x + 14, y: p.y - 28, text }
}
function evXY (e) {
  const p = pointerCoord(e)
  return p ? { x: p.x, y: p.y } : null
}
function dragValue (e, read, write, min, max, integer, format) {
  const startVal = Number(read()) || 0
  let start = evXY(e)
  const move = (ev) => {
    const p = evXY(ev)
    if (!p) return
    if (!start) start = p
    let n = startVal - (p.y - start.y) * (max - min) / 140
    n = Math.min(max, Math.max(min, n))
    if (integer) n = Math.round(n)
    write(n)
    showTip(ev, format(n))
  }
  const up = () => { tip.value = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
function dragOsc (key, field, min, max, integer, e) {
  dragValue(e, () => state.value[key][field], (v) => setOsc(key, field, v), min, max, integer, (v) => field === 'level' ? pct(v) : String(Math.round(v)))
}
function dragFx (fx, e) { dragValue(e, () => fxValue(fx), (v) => setFx(fx, v), 0, fx.max, false, () => fxReadout(fx)) }
function dragLfo (key, field, min, max, e) { dragValue(e, () => state.value[key][field], (v) => setLfo(key, field, v), min, max, false, (v) => v.toFixed(2) + ' Hz') }
function setLfoShape (key, shape) { setLfo(key, 'shape', shape) }
function closest (e, sel) { const n = e.target && e.target.nodeType === 1 ? e.target : null; return n && n.closest ? n.closest(sel) : null }
function rectEl (e, sel) {
  let el = e.currentTarget
  if (!el || typeof el.getBoundingClientRect !== 'function') el = e.target
  if (el && typeof el.closest === 'function' && sel) { const h = el.closest(sel); if (h) el = h }
  return el
}
function localPoint (e, el, w, h) {
  let node = el
  if (!node || typeof node.getBoundingClientRect !== 'function') node = e.target
  if (!node || typeof node.getBoundingClientRect !== 'function') return { x: w / 2, y: h / 2 }
  const p = pointerCoord(e)
  if (!p) return { x: w / 2, y: h / 2 }
  const r = node.getBoundingClientRect()
  return { x: ((p.x - r.left) / Math.max(1, r.width)) * w, y: ((p.y - r.top) / Math.max(1, r.height)) * h }
}
function bindDrag (apply) {
  const move = (ev) => { if (ev.cancelable) ev.preventDefault(); apply(ev) }
  const up = () => { tip.value = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
function onFilterDown (e) {
  const el = rectEl(e, '.filt')
  const host = closest(e, '[data-filt]')
  const which = host && host.dataset.filt ? host.dataset.filt : 'filter1'
  activeFilt.value = which
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 60)
    const next = { ...state.value[which], cutoff: xToFreq(pt.x), res: yToRes(pt.y) }
    commit({ ...state.value, [which]: next })
    showTip(ev, Math.round(next.cutoff) + ' Hz')
  }
  apply(e); bindDrag(apply)
}
function onEnvDown (e) {
  const el = rectEl(e, '.env')
  const host = closest(e, '[data-env]')
  const id = host && host.dataset.env ? host.dataset.env : 'a'
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 40)
    const env = state.value[activeEnv.value]
    const sec = xToSec(pt.x)
    const sustain = Math.min(1, Math.max(0, 1 - (pt.y - 4) / 30))
    const patch = {}
    if (id === 'a') patch.attack = Math.min(4, Math.max(0.001, sec))
    else if (id === 'd') { patch.decay = Math.min(6, Math.max(0.01, sec - env.attack)); patch.sustain = sustain }
    else if (id === 'h') patch.sustain = sustain
    else if (id === 'r') patch.release = Math.min(8, Math.max(0.01, sec - env.attack - env.decay - 0.55))
    const key = activeEnv.value
    commit({ ...state.value, [key]: { ...state.value[key], ...patch } })
  }
  apply(e); bindDrag(apply)
}
function onXy (e) {
  const el = rectEl(e, '.xy')
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 60)
    commit({ ...state.value, filter1: { ...state.value.filter1, cutoff: xToFreq(pt.x), res: yToRes(pt.y) } })
  }
  apply(e); bindDrag(apply)
}
function onLfoPlot (key, e) {
  const el = rectEl(e, '.pop-plot')
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 40)
    commit({ ...state.value, [key]: { ...state.value[key], rate: 0.02 + Math.min(1, Math.max(0, (pt.x - 4) / 92)) * 16, amount: Math.min(1, Math.max(0, 1 - pt.y / 36)) } })
  }
  apply(e); bindDrag(apply)
}
function upsertMod (src, dst, amount) {
  const mods = state.value.mods.filter((m) => !(m.src === src && m.dst === dst))
  mods.push({ src, dst, amount })
  commit({ ...state.value, mods })
}
function onSrcDown (src, e) {
  let s = evXY(e); let moved = false
  selectedSrc.value = src.id
  if (src.kind === 'env') activeEnv.value = src.id
  if (src.kind === 'lfo') lastLfo.value = src.id
  const move = (ev) => {
    const p = evXY(ev)
    if (!p) return
    if (!s) s = p
    if (Math.hypot(p.x - s.x, p.y - s.y) > 6) moved = true
    if (moved) ghost.value = { x: p.x + 12, y: p.y + 12, label: src.label }
  }
  const up = (ev) => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); ghost.value = null
    if (!moved && src.kind === 'lfo') {
      waveFor.value = ''
      openLfoPopup(src.id, anchorRect(e, '.src'))
      return
    }
    if (moved) {
      const p = evXY(ev) || s
      const el = document.elementFromPoint(p.x, p.y)
      const host = el && el.closest ? el.closest('[data-dst]') : null
      if (host && host.dataset.dst && MOD_SOURCES.includes(src.id)) upsertMod(src.id, host.dataset.dst, 0.35)
    }
  }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
const showMorph = computed(() => !!waveFor.value && state.value[waveFor.value] && String(state.value[waveFor.value].wave).indexOf('wt') === 0)
function onMorph (e) {
  const el = rectEl(e, '.menu-slider')
  const apply = (ev) => {
    const pt = localPoint(ev, el, 100, 1)
    const v = Math.min(1, Math.max(0, pt.x / 100))
    if (waveFor.value) commit({ ...state.value, [waveFor.value]: { ...state.value[waveFor.value], wtPos: v } })
  }
  apply(e); bindDrag(apply)
}
function openFx (fx, e) {
  waveFor.value = ''
  const r = anchorRect(e, '.fx-name')
  popup.value = { kind: 'fx', fx, title: fx.label, style: r ? { left: Math.max(8, r.left - 80) + 'px', top: (r.bottom + 8) + 'px' } : { left: '80px', top: '140px' } }
}
function onRootDown () { waveFor.value = ''; popup.value = null }
function play (pitch) {
  held.value = pitch; previewNoteOn(props.track, pitch, 0.85)
  const move = (ev) => {
    const p = pointerCoord(ev)
    if (!p) return
    const el = document.elementFromPoint(p.x, p.y)
    const key = el && el.closest ? el.closest('[data-pitch]') : null
    const next = key ? Number(key.dataset.pitch) : 0
    if (next && next !== held.value) { previewNoteOff(props.track, held.value); held.value = next; previewNoteOn(props.track, next, 0.85) }
  }
  const up = () => { previewNoteOff(props.track, held.value); held.value = 0; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
}
</script>

<style scoped>
.twin-panel {
  flex: 1;
  min-height: 480px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  touch-action: manipulation;
  color: #d6d9de;
  background: #1f2125;
  box-sizing: border-box;
  padding: 2px;
}
.main {
  flex: 1;
  min-height: 250px;
  display: grid;
  grid-template-columns: minmax(150px, 176px) minmax(0, 1fr) minmax(78px, 92px) minmax(148px, 172px);
  gap: 8px;
}
.col { min-height: 0; min-width: 0; }
.oscs { display: flex; flex-direction: column; gap: 8px; }
.osc {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  border-radius: 10px;
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.055);
  box-sizing: border-box;
}
.osc.mute { opacity: 0.45; }
.osc-top { display: flex; align-items: center; gap: 6px; }
.pwr { width: 9px; height: 9px; border-radius: 50%; background: #3a3e44; cursor: pointer; flex-shrink: 0; }
.pwr.on { background: #35d3a4; box-shadow: 0 0 8px rgba(53,211,164,0.8); }
.pwr.sm { position: absolute; right: 1px; top: 1px; }
.wave-btn {
  flex: 1;
  height: 26px;
  background: #1e2024;
  border: 1px solid rgba(255,255,255,0.05);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  min-width: 0;
}
.wave-btn svg, .src-tile svg { width: 100%; height: 13px; }
.wave-btn path, .menu-item path { fill: none; stroke: #f2b13d; stroke-width: 1.4; }
.uni { display: flex; flex-direction: column; align-items: center; cursor: ns-resize; touch-action: none; flex-shrink: 0; min-width: 18px; }
.uni-v { font-size: 11px; color: #f2b13d; line-height: 1.1; }
.uni-l { font-size: 8px; color: #8b919b; text-transform: uppercase; letter-spacing: 0.08em; }
.osc-foot { display: flex; align-items: center; gap: 8px; }
.osc-name { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #8b919b; }
.knob { position: relative; width: 42px; height: 42px; cursor: ns-resize; touch-action: none; flex-shrink: 0; }
.knob svg { width: 100%; height: 100%; display: block; }
.face { fill: #1c1e22; }
.ring { fill: none; stroke: rgba(255,255,255,0.1); stroke-width: 2.5; }
.arc { fill: none; stroke: #f2b13d; stroke-width: 2.5; stroke-linecap: round; transform: rotate(-130deg); transform-origin: 20px 20px; }
.arc.purple, .ring.purple { stroke: #a06ff2; }
.center { display: flex; flex-direction: column; gap: 6px; min-height: 220px; }
.plot-tools { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.cap { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #8b919b; }
.pills { display: flex; gap: 3px; }
.pill {
  padding: 2px 7px;
  border-radius: 5px;
  font-size: 10px;
  color: #8b919b;
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
}
.pill.on { color: #f2b13d; border-color: rgba(242,177,61,0.45); background: rgba(242,177,61,0.08); }
.plot { position: relative; background: #212327; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px; overflow: hidden; touch-action: none; cursor: crosshair; }
.plot.filt { flex: 1.2; min-height: 104px; }
.plot.env { flex: 1.15; min-height: 92px; }
.plot svg { width: 100%; height: 100%; display: block; position: absolute; inset: 0; }
.plot-tag { position: absolute; right: 6px; top: 4px; font-size: 8px; letter-spacing: 0.14em; text-transform: uppercase; color: #6d737d; }
.grid { fill: none; stroke: rgba(255,255,255,0.055); stroke-width: 0.3; }
.f1 { fill: none; stroke: #f2b13d; stroke-width: 1; }
.f1.glow { stroke-width: 3; opacity: 0.22; }
.f2 { fill: none; stroke: #a97e2c; stroke-width: 0.5; opacity: 0.75; }
.env-line { fill: none; stroke: #58a6e8; stroke-width: 1; }
.env-glow { fill: none; stroke: #58a6e8; stroke-width: 3; opacity: 0.18; }
.node, .dot {
  position: absolute;
  width: 14px; height: 14px;
  margin: -7px 0 0 -7px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 7px; font-weight: 700;
  cursor: pointer;
}
.node { background: #f2b13d; color: #1f2125; box-shadow: 0 0 0 2px rgba(242,177,61,0.25); }
.node.n2 { background: #cf9430; }
.node.on { box-shadow: 0 0 0 2.5px rgba(242,177,61,0.55), 0 0 10px rgba(242,177,61,0.5); }
.dot { background: #58a6e8; color: #0e1620; box-shadow: 0 0 0 2px rgba(88,166,232,0.3); }
.side { display: flex; flex-direction: column; align-items: center; gap: 3px; padding-top: 24px; }
.lfo-dial { position: relative; width: 66px; height: 66px; cursor: pointer; }
.lfo-dial svg { position: absolute; inset: 0; width: 100%; height: 100%; }
.dial-face { fill: #1c1e22; }
.dial-ring { fill: none; stroke: rgba(255,255,255,0.09); stroke-width: 1.4; }
.dial-wave { fill: none; stroke: #35d3a4; stroke-width: 1.6; }
.side-name { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b919b; cursor: pointer; text-align: center; }
.side-eg {
  width: 66px; height: 40px;
  margin-top: 6px;
  background: #212327;
  border: 1px solid rgba(255,255,255,0.045);
  border-radius: 7px;
  overflow: hidden;
  cursor: pointer;
}
.side-eg svg { width: 100%; height: 100%; display: block; }
.side-eg path { fill: none; stroke: #7aa2ff; stroke-width: 1.6; }
.fx { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 6px; align-content: start; }
.fx-slot { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.fx-slot.off { opacity: 0.38; }
.fx-knob { width: 46px; height: 46px; }
.fx-name { font-size: 8px; letter-spacing: 0.12em; text-transform: uppercase; color: #b9a4ec; cursor: pointer; white-space: nowrap; }
.fx-caret { color: #6d737d; }
.rack {
  flex-shrink: 0;
  display: flex;
  gap: 8px;
  min-height: 88px;
  padding: 8px;
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.055);
  border-radius: 10px;
  overflow-x: auto;
  box-sizing: border-box;
}
.xy {
  position: relative;
  width: 84px;
  flex-shrink: 0;
  background: #212327;
  border: 1px solid rgba(255,255,255,0.045);
  border-radius: 8px;
  touch-action: none;
  cursor: crosshair;
}
.xy-dot {
  position: absolute;
  width: 9px; height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: #35d3a4;
  box-shadow: 0 0 10px #35d3a4, 0 0 22px rgba(53,211,164,0.55);
}
.xy-l { position: absolute; left: 5px; bottom: 3px; font-size: 7.5px; color: #6d737d; letter-spacing: 0.06em; }
.xy-l.y { bottom: auto; top: 3px; }
.rack-sep { width: 1px; background: rgba(255,255,255,0.06); flex-shrink: 0; }
.src { flex: 1; min-width: 58px; display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: grab; touch-action: none; }
.src.sel .src-knob { box-shadow: 0 0 0 2px rgba(255,255,255,0.12); }
.src-knob {
  width: 16px; height: 16px;
  border-radius: 50%;
  border: 2px solid #35d3a4;
  display: flex; align-items: center; justify-content: center;
  background: #1c1e22;
}
.src-dot { width: 5px; height: 5px; border-radius: 50%; }
.src-tile {
  width: 100%;
  flex: 1;
  min-height: 34px;
  padding: 4px 5px;
  background: #212327;
  border: 1px solid rgba(255,255,255,0.045);
  border-radius: 7px;
  box-sizing: border-box;
}
.src-tile path { fill: none; stroke: currentColor; stroke-width: 1.5; }
.src.sel .src-tile { border-color: rgba(255,255,255,0.16); }
.src-name { font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: #9aa0aa; white-space: nowrap; }
.keys {
  display: flex;
  height: 46px;
  gap: 2px;
  flex-shrink: 0;
  padding: 3px 3px 0;
  background: #141519;
  border: 1px solid rgba(255,255,255,0.06);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  box-sizing: border-box;
}
.key { flex: 1; min-width: 8px; background: #d9dce1; border-radius: 0 0 3px 3px; cursor: pointer; touch-action: none; }
.key.black { background: #1d2026; border: 1px solid rgba(255,255,255,0.16); border-top: none; flex: 0.62; margin: 0 -3px; height: 62%; z-index: 1; border-radius: 0 0 3px 3px; box-sizing: border-box; }
.key.down { background: #35d3a4; box-shadow: 0 0 12px rgba(53,211,164,0.7); }
.menu, .pop, .ghost, .tip { position: fixed; z-index: 90; }
.menu, .pop {
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 10px;
  padding: 6px;
  box-shadow: 0 16px 40px rgba(0,0,0,0.55);
}
.menu-item { display: flex; align-items: center; gap: 8px; padding: 4px 6px; font-size: 12px; cursor: pointer; border-radius: 5px; }
.menu-item.on { color: #f2b13d; background: rgba(242,177,61,0.08); }
.menu-item svg { width: 30px; height: 14px; flex-shrink: 0; }
.pop { width: 200px; position: relative; }
.pop-title { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #9aa0aa; }
.pop-plot { height: 56px; margin: 6px 0; background: #212327; border-radius: 7px; overflow: hidden; touch-action: none; }
.pop-plot svg { width: 100%; height: 100%; display: block; }
.pop-plot path { fill: none; stroke: #35d3a4; stroke-width: 1.2; }
.mini { cursor: ns-resize; touch-action: none; }
.mini.grow { padding: 5px 0 2px; }
.mini-v { font-size: 12px; color: #d6d9de; }
.pop-val { font-size: 13px; color: #d6d9de; }
.pop-slider { height: 5px; background: #1c1e22; border-radius: 99px; overflow: hidden; margin-top: 8px; touch-action: none; }
.src-fill { height: 100%; background: #a06ff2; }
.pop-x { position: absolute; right: 6px; top: 4px; cursor: pointer; color: #8b919b; }
.pop-shapes { display: flex; gap: 3px; margin: 2px 0; }
.pop-shape { flex: 1; height: 22px; padding: 3px; background: #212327; border: 1px solid rgba(255,255,255,0.05); border-radius: 5px; cursor: pointer; box-sizing: border-box; }
.pop-shape.on { border-color: rgba(53,211,164,0.5); background: rgba(53,211,164,0.08); }
.pop-shape svg { width: 100%; height: 100%; display: block; }
.pop-shape path { fill: none; stroke: #9aa0aa; stroke-width: 2; }
.pop-shape.on path { stroke: #35d3a4; }
.menu-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
.menu-cap { display: block; font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: #8b919b; padding: 0 2px; }
.menu-slider { position: relative; height: 6px; background: #1c1e22; border-radius: 99px; overflow: hidden; touch-action: none; margin-top: 4px; }
.menu-fill { height: 100%; background: #f2b13d; }
.ghost, .tip { pointer-events: none; padding: 4px 8px; border-radius: 6px; background: #17181c; font-size: 11px; color: #d6d9de; border: 1px solid rgba(255,255,255,0.09); }
@media (max-width: 880px) {
  .main { grid-template-columns: 1fr 1fr; }
  .center { grid-column: 1 / -1; order: -1; min-height: 230px; }
  .oscs { flex-direction: row; }
  .fx { grid-column: 1 / -1; grid-template-columns: repeat(6, 1fr); }
  .side { flex-direction: row; justify-content: center; align-items: center; gap: 10px; padding-top: 0; }
}
</style>
