<template>
  <view class="plug x-plug dsp-skin skin-rev" :class="{ 'is-off': insert.enabled === false }">
    <plugin-shell
      name="Reverb X"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    >
      <template #actions>
        <view class="wet header-wet">
          <text class="wet-lab">Wet</text>
          <view class="wet-track" @mousedown.stop.prevent="dragAmount" @touchstart.stop.prevent="dragAmount">
            <view class="wet-fill" :style="{ width: (state.amount * 100) + '%' }" />
            <view class="wet-thumb" :style="{ left: (state.amount * 100) + '%' }" />
          </view>
          <text class="wet-lab">Dry</text>
        </view>
      </template>
    </plugin-shell>

    <view class="stage x-panel">
      <view class="graph-wrap">
        <dsp-canvas class="graph" ref="canvas" fill :height="248" @pointerdown="dragTime" />
      </view>
      <dsp-meter fill :level="outLevel" label="Out" :height="220" />
    </view>

    <view class="knobs x-knobs">
      <dsp-knob
        size="lg"
        :model-value="state.amount"
        :min="0" :max="1" :default-value="0.35"
        label="Amount"
        :format="(v) => Math.round(v * 100) + '%'"
        @update:model-value="set('amount', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.decay"
        :min="0.15" :max="12" :default-value="2.2"
        scale="log"
        label="Time"
        :format="(v) => v.toFixed(2) + ' s'"
        @update:model-value="set('decay', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.size"
        :min="0" :max="1" :default-value="0.62"
        label="Size"
        :format="(v) => Math.round(v * 100) + '%'"
        @update:model-value="set('size', $event)"
      />
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Venue</text>
      <view class="x-seg wrap">
        <view
          v-for="v in venues"
          :key="v.id"
          class="x-chip"
          :class="{ on: state.venue === v.id }"
          @click="setVenue(v.id)"
        >{{ shortVenue(v.name) }}</view>
      </view>
      <view class="gap" />
      <view class="wet footer-wet">
        <text class="wet-lab">Wet</text>
        <view class="wet-track" @mousedown.stop.prevent="dragAmount" @touchstart.stop.prevent="dragAmount">
          <view class="wet-fill" :style="{ width: (state.amount * 100) + '%' }" />
          <view class="wet-thumb" :style="{ left: (state.amount * 100) + '%' }" />
        </view>
        <text class="wet-lab">Dry</text>
      </view>
      <view class="x-chip" :class="{ on: state.wetProcess }" @click="toggleWet">Wet FX</view>
    </view>

    <view v-if="state.wetProcess" class="wet-pick" @click="cycleWet">{{ wetLabel }}</view>
    <view v-if="wetInsert" class="wet-editor">
      <text class="wet-head">Wet process · {{ wetLabel }}</text>
      <plugin-equalizer-x v-if="wetInsert && wetInsert.pluginId === 'equalizer-x'" embedded :insert="wetInsert" @change="onWetChange" />
      <plugin-dynamic-x v-else-if="wetInsert && wetInsert.pluginId === 'dynamic-x'" :insert="wetInsert" @change="onWetChange" />
      <plugin-boost-x v-else-if="wetInsert && wetInsert.pluginId === 'boost-x'" :insert="wetInsert" @change="onWetChange" />
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import PluginEqualizerX from './plugin-equalizer-x.vue'
import PluginDynamicX from './plugin-dynamic-x.vue'
import PluginBoostX from './plugin-boost-x.vue'
import { plugins, REVERB_VENUES, WET_PROCESS_PLUGINS, applyPreset, resetInsert, getPlugin } from '../../dsp/registry.js'
import { createInsert } from '../../dsp/plugin.js'
import { getReverbVisualization } from '../../dsp/reverb-x.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME, strokeGlow } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['reverb-x'].presets)
const venues = REVERB_VENUES
const outLevel = computed(() => {
  const m = props.meters || {}
  if (m.wetPeak != null && m.wetPeak > 0) return m.wetPeak
  return m.outPeak != null ? m.outPeak : 0
})
const wetLabel = computed(() => {
  const id = state.value.wetPluginId
  if (!id) return 'Select FX'
  return (getPlugin(id) || {}).name || id
})
const wetInsert = ref(null)
watch(() => [state.value.wetProcess, state.value.wetPluginId, state.value.wetState], () => {
  if (!state.value.wetProcess || !state.value.wetPluginId || !state.value.wetState) {
    wetInsert.value = null
    return
  }
  if (!wetInsert.value || wetInsert.value.pluginId !== state.value.wetPluginId) {
    wetInsert.value = {
      pluginId: state.value.wetPluginId,
      enabled: true,
      presetId: '',
      state: state.value.wetState
    }
  } else {
    wetInsert.value.state = state.value.wetState
  }
}, { immediate: true })

function shortVenue (name) {
  if (name === 'Concert Hall') return 'Concert'
  if (name === 'Large Stage') return 'Stage'
  if (name === 'Small Room') return 'Room'
  return name
}

function commit () { emit('change', props.insert) }
function set (key, value) { props.insert.state[key] = value; commit() }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function setVenue (id) {
  props.insert.state.venue = id
  const match = presets.value.find((p) => p.id === id)
  if (match) props.insert.presetId = match.id
  commit()
}
function toggleWet () {
  props.insert.state.wetProcess = !props.insert.state.wetProcess
  if (props.insert.state.wetProcess && !props.insert.state.wetPluginId) {
    const fx = createInsert('equalizer-x', plugins, { presetId: 'default' })
    props.insert.state.wetPluginId = fx.pluginId
    props.insert.state.wetState = fx.state
  }
  commit()
}
function cycleWet () {
  const cur = WET_PROCESS_PLUGINS.indexOf(props.insert.state.wetPluginId)
  const nextId = WET_PROCESS_PLUGINS[(cur + 1) % WET_PROCESS_PLUGINS.length]
  const fx = createInsert(nextId, plugins)
  props.insert.state.wetPluginId = fx.pluginId
  props.insert.state.wetState = fx.state
  commit()
}
function onWetChange () {
  if (wetInsert.value) props.insert.state.wetState = wetInsert.value.state
  commit()
}

function draw () {
  const prepared = prepareCanvas(canvas, 640, 248)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0B0E14'
  ctx.fillRect(0, 0, w, h)

  const padL = 36, padB = 28, padT = 16, padR = 12
  const gw = w - padL - padR
  const gh = h - padT - padB
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  ;[0.1, 0.25, 0.5, 1].forEach((t) => {
    const y = padT + (1 - t) * gh
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke()
  })
  ctx.fillStyle = DSP_THEME.muted
  ctx.font = '8px Inter, Segoe UI, sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('AMT', padL - 6, padT + 8)
  ctx.fillText('100%', padL - 6, padT + 14)
  ctx.textAlign = 'left'
  ;[0.5, 1, 2, 5, 10].forEach((sec) => {
    const x = padL + Math.min(1, sec / 12) * gw
    ctx.fillText(sec + 's', x, h - 8)
  })

  const viz = getReverbVisualization(state.value)
  const amount = viz.wetGain
  const tEnd = Math.min(0.96, Math.max(0.18, viz.tMax / 12))
  const ss = Math.min(2, viz.sizeScale)
  const rw = gw * (0.18 + 0.32 * (ss / 2))
  const rh = gh * (0.16 + 0.22 * (ss / 2))
  ctx.strokeStyle = 'rgba(183,148,246,0.14)'
  ctx.strokeRect(padL + 6, padT + 6, rw, rh)

  ctx.beginPath()
  ctx.moveTo(padL, padT + gh)
  viz.envelope.forEach((pt) => {
    const x = padL + Math.min(1, pt.t / 12) * tEnd * gw
    ctx.lineTo(x, padT + gh - pt.env * gh)
  })
  ctx.lineTo(padL + tEnd * gw, padT + gh)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, padT, 0, padT + gh)
  fill.addColorStop(0, 'rgba(183,148,246,0.22)')
  fill.addColorStop(1, 'rgba(183,148,246,0.02)')
  ctx.fillStyle = fill
  ctx.fill()

  ctx.beginPath()
  viz.envelope.forEach((pt, i) => {
    const x = padL + Math.min(1, pt.t / 12) * tEnd * gw
    const y = padT + gh - pt.env * gh
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.lineWidth = 1.8
  strokeGlow(ctx, DSP_THEME.rev.accent, 10, () => ctx.stroke())

  ctx.strokeStyle = 'rgba(183,148,246,0.45)'
  ctx.lineWidth = 1
  viz.earlyTaps.forEach((tap) => {
    const x = padL + Math.min(1, tap.t / 12) * tEnd * gw
    const hgt = Math.min(gh * 0.9, Math.max(2, Math.abs(tap.gL) * amount * gh * 1.4))
    ctx.globalAlpha = 0.35 + Math.min(0.5, Math.abs(tap.gL))
    ctx.beginPath()
    ctx.moveTo(x, padT + gh)
    ctx.lineTo(x, padT + gh - hgt)
    ctx.stroke()
  })
  ctx.globalAlpha = 1
}

let vizTimer = 0
onMounted(() => { draw(); vizTimer = setInterval(draw, 50) })
onUnmounted(() => clearInterval(vizTimer))
watch(() => props.insert.state, draw, { deep: true })

function dragTime (e) {
  const startX = e.touches ? e.touches[0].clientX : e.clientX
  const start = props.insert.state.decay
  const move = (ev) => {
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX
    props.insert.state.decay = Math.min(12, Math.max(0.15, start + (x - startX) / 80))
    commit()
  }
  bindDrag(move)
}

function dragAmount (e) {
  const startX = e.touches ? e.touches[0].clientX : e.clientX
  const start = props.insert.state.amount
  const move = (ev) => {
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX
    props.insert.state.amount = Math.min(1, Math.max(0, start + (x - startX) / 140))
    commit()
  }
  bindDrag(move)
}

function bindDrag (move) {
  const end = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', end)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', end)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', end)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', end)
}
</script>

<style scoped>
.plug { gap: 10px; }
.wet {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
}
.wet-lab {
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dsp-muted);
}
.wet-track {
  width: 88px;
  height: 22px;
  background: transparent;
  border-radius: 2px;
  position: relative;
  cursor: ew-resize;
  display: flex;
  align-items: center;
}
.wet-fill {
  height: 6px;
  background: var(--dsp-accent);
  border-radius: 2px;
  box-shadow: 0 0 8px var(--dsp-glow);
  width: 0;
}
.wet-track::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  background: rgba(255,255,255,0.08);
  border-radius: 2px;
  z-index: 0;
}
.wet-fill { position: relative; z-index: 1; }
.wet-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
  z-index: 2;
  border-radius: 50%;
  background: #F4F1EA;
  box-shadow: 0 0 8px var(--dsp-glow);
}
.stage {
  display: flex;
  gap: 10px;
  padding: 8px 10px 8px 8px;
  min-height: 0;
  flex: 1 1 auto;
}
.graph-wrap { flex: 1; min-width: 0; min-height: 0; height: auto; display: flex; }
.knobs { flex-shrink: 0; }
.wrap { flex-wrap: wrap; }
.gap { flex: 1; }
.wet-pick {
  margin-left: auto;
  min-height: 28px;
  padding: 0 12px;
  width: max-content;
  border: 1px solid var(--dsp-line);
  border-radius: 4px;
  color: var(--dsp-muted);
  font-size: 11px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.wet-editor { margin-top: 8px; padding-top: 10px; border-top: 1px solid var(--dsp-line); }
.wet-head {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  margin-bottom: 8px;
}
.footer-wet { display: none; }

@media (max-width: 720px) {
  .wet-track { width: 120px; }
  .header-wet { display: none; }
  .footer-wet { display: flex; }
  .x-footer { padding-bottom: 8px; }
}
</style>
