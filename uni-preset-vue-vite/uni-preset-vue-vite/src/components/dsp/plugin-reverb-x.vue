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
        <view class="x-chip wet-btn" :class="{ on: state.wetProcess }" @click="toggleWet">Wet Process</view>
      </template>
    </plugin-shell>

    <view class="stage">
      <view class="graph x-panel">
        <text class="graph-lab">Amount</text>
        <dsp-canvas ref="canvas" fill :height="230" @pointerdown="dragTime" />
        <view class="pods">
          <view class="pod x-card">
            <dsp-knob
              size="sm"
              :model-value="state.preDelayMs"
              :min="0" :max="250" :default-value="20"
              scale="log"
              label="Pre-Delay"
              :format="fmtPreDelay"
              @update:model-value="set('preDelayMs', $event)"
            />
          </view>
          <view class="pod x-card">
            <dsp-knob
              size="sm"
              :model-value="state.dampingHz"
              :min="500" :max="20000" :default-value="6200"
              scale="log"
              label="Damping"
              :format="fmtDamping"
              @update:model-value="set('dampingHz', $event)"
            />
          </view>
        </view>
      </view>

      <dsp-meter label="Out" :level="outLevel" fill :height="230" />
    </view>

    <view class="tray x-tray">
      <dsp-knob
        :model-value="state.reverbLevel"
        :min="0" :max="1.5" :default-value="0.65"
        label="Amount"
        :format="fmtPercent150"
        @update:model-value="set('reverbLevel', $event)"
      />
      <dsp-knob
        :model-value="state.decay"
        :min="0.15" :max="12" :default-value="2.2"
        scale="log"
        label="Time"
        :format="(v) => Number(v).toFixed(2) + ' s'"
        @update:model-value="set('decay', $event)"
      />
      <dsp-knob
        :model-value="state.size"
        :min="0" :max="1" :default-value="0.62"
        label="Size"
        :format="(v) => Math.round(v * 100) + ' %'"
        @update:model-value="set('size', $event)"
      />
      <dsp-knob
        :model-value="state.amount"
        :min="0" :max="1" :default-value="0.35"
        label="Mix"
        :format="(v) => Math.round(v * 100) + ' %'"
        @update:model-value="set('amount', $event)"
      />
      <dsp-knob
        :model-value="state.width"
        :min="0" :max="2" :default-value="1"
        label="Width"
        :format="(v) => Math.round(v * 100) + ' %'"
        @update:model-value="set('width', $event)"
      />
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Mode</text>
      <view class="x-seg railed wrap">
        <view
          v-for="mode in REVERB_MODES"
          :key="mode.id"
          class="x-chip"
          :class="{ on: activeMode === mode.id }"
          @click="setMode(mode)"
        >{{ mode.name }}</view>
      </view>
      <view class="x-sel venue-sel" @click.stop="venueOpen = !venueOpen">
        <text>{{ venueName }}</text>
        <text class="caret">▾</text>
      </view>
      <view v-if="venueOpen" class="x-menu venue-menu" @click.stop>
        <view
          v-for="venue in REVERB_VENUES"
          :key="venue.id"
          class="item"
          :class="{ on: state.venue === venue.id }"
          @click="setVenue(venue.id)"
        >{{ venue.name }}</view>
      </view>
    </view>

    <view v-if="wetInsert" class="wet-editor">
      <view class="wet-head">
        <text class="dsp-lab">Wet chain</text>
        <view class="x-sel wet-pick" @click="cycleWet">
          <text>{{ wetLabel }}</text>
          <text class="caret">⇄</text>
        </view>
      </view>
      <plugin-equalizer-x v-if="wetInsert.pluginId === 'equalizer-x'" embedded :insert="wetInsert" @change="onWetChange" />
      <plugin-dynamic-x v-else-if="wetInsert.pluginId === 'dynamic-x'" embedded :insert="wetInsert" @change="onWetChange" />
      <plugin-boost-x v-else-if="wetInsert.pluginId === 'boost-x'" :insert="wetInsert" @change="onWetChange" />
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
import {
  plugins, REVERB_VENUES, REVERB_MODES, reverbModeForVenue,
  WET_PROCESS_PLUGINS, applyPreset, resetInsert, getPlugin
} from '../../dsp/registry.js'
import { createInsert } from '../../dsp/plugin.js'
import { getReverbVisualization } from '../../dsp/reverb-x.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME, drawLogTimeGrid, drawDecadeGrid, timeToX, ampToY, axisText } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const venueOpen = ref(false)
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['reverb-x'].presets)

const T_LO = 0.001
const T_HI = 10
const FLOOR_DB = -60

const outLevel = computed(() => {
  const m = props.meters || {}
  if (m.wetPeak != null && m.wetPeak > 0) return m.wetPeak
  return m.outPeak != null ? m.outPeak : 0
})
const activeMode = computed(() => reverbModeForVenue(state.value.venue))
const venueName = computed(() => {
  const found = REVERB_VENUES.find((venue) => venue.id === state.value.venue)
  return found ? found.name : 'Concert Hall'
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

function fmtPreDelay (v) {
  const ms = Number(v) || 0
  return ms < 10 ? ms.toFixed(1) + ' ms' : Math.round(ms) + ' ms'
}

function fmtDamping (v) {
  const hz = Number(v) || 0
  return hz >= 1000 ? (hz / 1000).toFixed(1) + ' kHz' : Math.round(hz) + ' Hz'
}

function fmtPercent150 (v) {
  return Math.round((Number(v) || 0) / 1.5 * 100) + ' %'
}

function commit () { emit('change', props.insert) }
function set (key, value) { props.insert.state[key] = value; commit() }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }

function setVenue (id) {
  props.insert.state.venue = id
  const match = presets.value.find((preset) => preset.id === id)
  if (match) props.insert.presetId = match.id
  venueOpen.value = false
  commit()
}

function setMode (mode) {
  // A mode chip selects its representative venue unless the current venue already
  // belongs to that mode, in which case it is left alone.
  if (activeMode.value === mode.id) return
  setVenue(mode.venue)
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
  const prepared = prepareCanvas(canvas, 640, 230)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  const padL = 4
  const padR = 96
  const padT = 18
  const padB = 4
  const gw = Math.max(40, w - padL - padR)
  const gh = Math.max(40, h - padT - padB)

  ctx.save()
  ctx.translate(padL, padT)
  drawDecadeGrid(ctx, gw, gh, FLOOR_DB)
  drawLogTimeGrid(ctx, gw, gh, T_LO, T_HI)

  const viz = getReverbVisualization(state.value) || {}
  const envelope = Array.isArray(viz.envelope) ? viz.envelope : []
  const taps = Array.isArray(viz.earlyTaps) ? viz.earlyTaps : []
  const level = Number(state.value.reverbLevel)
  const scale = Math.min(1, Number.isFinite(level) ? level / 1.5 : 0.43) * 0.75 + 0.25
  const preDelaySec = Math.max(0, Number(state.value.preDelayMs) || 0) / 1000

  if (envelope.length > 1) {
    const trace = (close) => {
      ctx.beginPath()
      if (close) ctx.moveTo(timeToX(preDelaySec + T_LO, gw, T_LO, T_HI), gh)
      envelope.forEach((point, i) => {
        const x = timeToX(preDelaySec + Math.max(T_LO, point.t), gw, T_LO, T_HI)
        const y = ampToY(Math.max(1e-6, point.env * scale), gh, FLOOR_DB)
        if (!close && i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      if (close) {
        const last = envelope[envelope.length - 1]
        ctx.lineTo(timeToX(preDelaySec + Math.max(T_LO, last.t), gw, T_LO, T_HI), gh)
        ctx.closePath()
      }
    }

    trace(true)
    ctx.fillStyle = DSP_THEME.rev.fill
    ctx.fill()

    trace(false)
    ctx.strokeStyle = DSP_THEME.rev.accent
    ctx.lineWidth = 1.6
    ctx.stroke()
  }

  // Early reflections as discrete taps, offset by pre-delay like the real tap list.
  ctx.strokeStyle = DSP_THEME.rev.early
  ctx.lineWidth = 1
  taps.forEach((tap) => {
    const x = timeToX(preDelaySec + Math.max(T_LO, tap.t), gw, T_LO, T_HI)
    const amp = Math.max(1e-6, Math.abs(Number(tap.gL) || 0) * scale)
    const y = ampToY(amp, gh, FLOOR_DB)
    if (y >= gh - 1) return
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, gh)
    ctx.lineTo(Math.round(x) + 0.5, y)
    ctx.stroke()
  })
  ctx.restore()

  axisText(ctx, 'Time', w - padR - 22, padT + 8, 'right')
}

let vizTimer = 0
onMounted(() => { draw(); vizTimer = setInterval(draw, 60) })
onUnmounted(() => clearInterval(vizTimer))
watch(() => props.insert.state, draw, { deep: true })

function dragTime (e) {
  const startX = e.touches ? e.touches[0].clientX : e.clientX
  const start = props.insert.state.decay
  const move = (ev) => {
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX
    // Horizontal drag is a ratio so it feels even across the log time axis.
    props.insert.state.decay = Math.min(12, Math.max(0.15, start * Math.pow(2, (x - startX) / 140)))
    commit()
  }
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
.plug { gap: 8px; }
.stage {
  display: flex;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
}
.graph {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  overflow: hidden;
}
.graph-lab {
  position: absolute;
  top: 6px;
  left: 8px;
  z-index: 2;
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3);
  pointer-events: none;
}
.pods {
  position: absolute;
  top: 8px;
  right: 8px;
  bottom: 8px;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.pod {
  width: 76px;
  padding: 6px 4px;
  display: flex;
  justify-content: center;
  background: var(--x-panel-2);
}
.tray {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
}
.wrap { flex-wrap: wrap; }
.venue-sel { margin-left: auto; min-width: 120px; }
.venue-menu { right: 2px; bottom: 34px; }
.wet-btn { min-width: 88px; }
.wet-editor {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--x-line);
}
.wet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}
.wet-pick { min-width: 130px; }
.caret { font-size: 8px; color: var(--x-ink-3); }

@media (max-width: 720px) {
  .pods {
    position: static;
    flex-direction: row;
    justify-content: flex-start;
  }
  .graph { flex-direction: column; }
  .pod { width: 68px; }
  .tray {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    justify-items: center;
    gap: 8px 4px;
  }
  .venue-sel { margin-left: 0; flex: 1 1 100%; }
  .venue-menu { left: 0; right: 0; }
}
</style>
