<template>
  <view class="twin">
    <view class="viz" ref="vizRef" />
    <view class="row presets">
      <text
        v-for="p in presets"
        :key="p.id"
        class="chip"
        :class="{ on: presetId === p.id }"
        @click="applyPreset(p.id)"
      >{{ p.name }}</text>
    </view>
    <view class="oscs">
      <view v-for="(osc, i) in oscs" :key="osc.key" class="card">
        <text class="cap">Osc {{ i + 1 }}</text>
        <view class="waves">
          <text
            v-for="w in waves"
            :key="w"
            class="chip sm"
            :class="{ on: osc.wave === w }"
            @click="setOsc(osc.key, 'wave', w)"
          >{{ w }}</text>
        </view>
        <view class="knobs">
          <view class="k" @pointerdown="dragNum($event, osc.key, 'level', 0, 1)"><text class="kv">{{ pct(osc.level) }}</text><text class="kl">Level</text></view>
          <view class="k" @pointerdown="dragNum($event, osc.key, 'detune', 0, 100)"><text class="kv">{{ Math.round(osc.detune) }}</text><text class="kl">Detune</text></view>
          <view class="k" @pointerdown="dragNum($event, osc.key, 'unison', 1, 8)"><text class="kv">{{ Math.round(osc.unison) }}</text><text class="kl">Unison</text></view>
          <view class="k" @pointerdown="dragNum($event, osc.key, 'pan', -1, 1)"><text class="kv">{{ osc.pan.toFixed(2) }}</text><text class="kl">Pan</text></view>
        </view>
      </view>
    </view>
    <view class="oscs">
      <view class="card">
        <text class="cap">Filter</text>
        <view class="waves">
          <text class="chip sm" :class="{ on: state.filterRoute === 'serial' }" @click="set('filterRoute', 'serial')">Serial</text>
          <text class="chip sm" :class="{ on: state.filterRoute === 'parallel' }" @click="set('filterRoute', 'parallel')">Parallel</text>
        </view>
        <view class="knobs">
          <view class="k drop" data-dst="cutoff" @pointerdown="dragNested($event, 'filter1', 'cutoff', 40, 18000)" @pointerup="dropMod('cutoff')"><text class="kv">{{ Math.round(state.filter1.cutoff) }}</text><text class="kl">Cutoff</text></view>
          <view class="k drop" data-dst="res" @pointerdown="dragNested($event, 'filter1', 'res', 0, 0.95)" @pointerup="dropMod('res')"><text class="kv">{{ state.filter1.res.toFixed(2) }}</text><text class="kl">Res</text></view>
          <view class="k" @pointerdown="dragNum($event, '', 'chorus', 0, 1)"><text class="kv">{{ pct(state.chorus) }}</text><text class="kl">Chorus</text></view>
          <view class="k" @pointerdown="dragNum($event, '', 'delay', 0, 1)"><text class="kv">{{ pct(state.delay) }}</text><text class="kl">Delay</text></view>
          <view class="k" @pointerdown="dragNum($event, '', 'reverb', 0, 1)"><text class="kv">{{ pct(state.reverb) }}</text><text class="kl">Reverb</text></view>
        </view>
      </view>
      <view class="card">
        <text class="cap">Env / LFO</text>
        <view class="knobs">
          <view class="k" @pointerdown="dragNested($event, 'env1', 'attack', 0.001, 2)"><text class="kv">{{ state.env1.attack.toFixed(2) }}</text><text class="kl">A</text></view>
          <view class="k" @pointerdown="dragNested($event, 'env1', 'decay', 0.01, 3)"><text class="kv">{{ state.env1.decay.toFixed(2) }}</text><text class="kl">D</text></view>
          <view class="k" @pointerdown="dragNested($event, 'env1', 'sustain', 0, 1)"><text class="kv">{{ pct(state.env1.sustain) }}</text><text class="kl">S</text></view>
          <view class="k" @pointerdown="dragNested($event, 'env1', 'release', 0.01, 4)"><text class="kv">{{ state.env1.release.toFixed(2) }}</text><text class="kl">R</text></view>
          <view class="k" @pointerdown="dragNested($event, 'lfo1', 'rate', 0.05, 16)"><text class="kv">{{ state.lfo1.rate.toFixed(1) }}</text><text class="kl">LFO</text></view>
        </view>
        <view class="mods">
          <text
            v-for="src in sources"
            :key="src"
            class="chip sm"
            draggable="false"
            @pointerdown="beginMod($event, src)"
          >{{ src }}</text>
        </view>
        <text v-if="state.mods.length" class="mod-list">{{ state.mods.map((m) => m.src + ' → ' + m.dst).join(' · ') }}</text>
      </view>
    </view>
    <view class="keys">
      <view
        v-for="key in keys"
        :key="key.pitch"
        class="key"
        :class="{ black: key.black }"
        @pointerdown.prevent="play(key.pitch, $event)"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { WAVES, MOD_SOURCES, defaultTwinState, normalizeTwinState } from '../../dsp/synth/params.js'
import { TWIN_PRESETS } from '../../dsp/synth/presets.js'
import { previewNoteOn, previewNoteOff, updateTwinPatch } from '../../store/session.js'

const props = defineProps({ track: { type: Object, required: true } })
const waves = WAVES.slice(0, 6)
const sources = MOD_SOURCES
const presets = TWIN_PRESETS
const vizRef = ref(null)
const presetId = ref('init')
let draggingMod = ''
let vizTimer = 0

const state = computed(() => normalizeTwinState(props.track.twinState || defaultTwinState()))
const oscs = computed(() => [
  { key: 'osc1', ...state.value.osc1 },
  { key: 'osc2', ...state.value.osc2 },
  { key: 'osc3', ...state.value.osc3 }
])
const keys = computed(() => {
  const out = []
  for (let p = 48; p <= 72; p++) {
    const n = p % 12
    out.push({ pitch: p, black: n === 1 || n === 3 || n === 6 || n === 8 || n === 10 })
  }
  return out
})

function pct (v) { return Math.round((Number(v) || 0) * 100) + '%' }

function commit (next) {
  props.track.twinState = normalizeTwinState(next)
  updateTwinPatch(props.track)
}

function set (key, value) {
  commit({ ...state.value, [key]: value })
}

function setOsc (oscKey, field, value) {
  commit({ ...state.value, [oscKey]: { ...state.value[oscKey], [field]: value } })
}

function applyPreset (id) {
  const p = TWIN_PRESETS.find((item) => item.id === id)
  if (!p) return
  presetId.value = id
  commit(p.state)
}

function dragNum (e, oscKey, field, min, max) {
  const startY = e.clientY
  const current = oscKey ? state.value[oscKey][field] : state.value[field]
  const start = Number(current) || 0
  const move = (ev) => {
    const next = Math.min(max, Math.max(min, start - (ev.clientY - startY) * (max - min) / 140))
    if (oscKey) setOsc(oscKey, field, next)
    else set(field, next)
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function dragNested (e, group, field, min, max) {
  const startY = e.clientY
  const start = Number(state.value[group][field]) || 0
  const move = (ev) => {
    const next = Math.min(max, Math.max(min, start - (ev.clientY - startY) * (max - min) / 140))
    commit({ ...state.value, [group]: { ...state.value[group], [field]: next } })
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function beginMod (e, src) {
  draggingMod = src
  const up = () => {
    window.removeEventListener('pointerup', up)
    setTimeout(() => { draggingMod = '' }, 0)
  }
  window.addEventListener('pointerup', up)
}

function dropMod (dst) {
  if (!draggingMod) return
  const mods = state.value.mods.filter((m) => !(m.src === draggingMod && m.dst === dst))
  mods.push({ src: draggingMod, dst, amount: 0.35 })
  commit({ ...state.value, mods })
  draggingMod = ''
}

function play (pitch, e) {
  previewNoteOn(props.track, pitch, 0.85)
  const up = () => {
    previewNoteOff(props.track, pitch)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
  }
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}

function paintViz () {
  const host = vizRef.value
  const el = host && (host.nodeType === 1 ? host : host.$el)
  if (!el || typeof document === 'undefined') return
  let canvas = el.querySelector('canvas')
  if (!canvas) {
    canvas = document.createElement('canvas')
    canvas.style.cssText = 'width:100%;height:100%;display:block;'
    el.appendChild(canvas)
  }
  const w = Math.max(1, el.clientWidth || 1)
  const h = Math.max(1, el.clientHeight || 1)
  canvas.width = w * 2
  canvas.height = h * 2
  const ctx = canvas.getContext('2d')
  ctx.setTransform(2, 0, 0, 2, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = '#6aa8ff'
  ctx.lineWidth = 1.4
  ctx.beginPath()
  const osc = state.value.osc1
  for (let x = 0; x < w; x++) {
    const ph = x / w
    let y = 0
    if (osc.wave === 'square') y = ph % 1 < 0.5 ? 1 : -1
    else if (osc.wave === 'tri') y = 1 - 4 * Math.abs(Math.round(ph) - ph)
    else if (osc.wave === 'sine') y = Math.sin(ph * Math.PI * 2)
    else y = ph * 2 - 1
    const py = h / 2 - y * (h * 0.35)
    if (x === 0) ctx.moveTo(x, py)
    else ctx.lineTo(x, py)
  }
  ctx.stroke()
}

watch(state, () => paintViz(), { deep: true })
onMounted(() => {
  paintViz()
  vizTimer = setInterval(paintViz, 400)
})
onUnmounted(() => { if (vizTimer) clearInterval(vizTimer) })
</script>

<style scoped>
.twin { display: flex; flex-direction: column; gap: 10px; padding: 8px 10px 14px; min-height: 0; }
.viz { height: clamp(140px, 24vh, 220px); background: #141c28; border-radius: 10px; }
.row { display: flex; gap: 6px; overflow-x: auto; touch-action: pan-x; }
.chip {
  flex: 0 0 auto;
  min-height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  background: #243044;
  color: #c5ced6;
  font-size: 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.chip.on { color: #6aa8ff; box-shadow: inset 0 -2px 0 #6aa8ff; }
.chip.sm { min-height: 32px; font-size: 11px; text-transform: uppercase; }
.oscs { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.card { background: #161616; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
.cap { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: #8b939e; }
.waves { display: flex; flex-wrap: wrap; gap: 4px; }
.knobs { display: grid; grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); gap: 8px; }
.k {
  min-height: 56px;
  min-width: 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #243044;
  border-radius: 8px;
  touch-action: none;
}
.kv { font-size: 14px; color: #f2f5f8; }
.kl { font-size: 10px; color: #9aa6b4; }
.mods { display: flex; gap: 4px; flex-wrap: wrap; }
.mod-list { font-size: 11px; color: #8b939e; }
.keys { display: flex; height: 72px; gap: 2px; }
.key { flex: 1; min-width: 18px; background: #e8edf3; border-radius: 0 0 6px 6px; }
.key.black { background: #1b1b1b; flex: 0.6; }
</style>
