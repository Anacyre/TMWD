<template>
  <view class="plug x-plug dsp-skin skin-lim" :class="{ 'is-off': insert.enabled === false }">
    <plugin-shell
      name="Limiter X"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    >
      <template #actions>
        <view class="x-chip" :class="{ on: state.truePeak !== false }" @click="set('truePeak', state.truePeak === false)">
          True Peak
        </view>
      </template>
    </plugin-shell>

    <view class="stage">
      <dsp-meter label="In" :level="inLevel" :level-r="inLevelR" fill :height="220" />

      <view class="graph x-panel">
        <view class="readout">
          <view class="ro">
            <text class="ro-lab">Gain Reduction</text>
            <text class="ro-val">{{ grText }}</text>
          </view>
          <view class="ro">
            <text class="ro-lab">True Peak</text>
            <text class="ro-val" :class="{ over: peakOver }">{{ peakText }}</text>
          </view>
        </view>
        <dsp-canvas ref="canvas" fill :height="220" />
      </view>

      <dsp-meter
        label="Out"
        :level="outLevel"
        :level-r="outLevelR"
        fill
        :height="220"
        show-gain
        :gain="state.gainDb"
        :gain-min="-12"
        :gain-max="18"
        :gain-default="0"
        @update:gain="set('gainDb', $event)"
      />
    </view>

    <view class="tray x-tray">
      <dsp-knob
        :model-value="state.gainDb"
        :min="-12" :max="18" :default-value="0"
        label="Gain"
        :format="(v) => fmtDb(v, 1)"
        @update:model-value="set('gainDb', $event)"
      />
      <dsp-knob
        :model-value="state.ceilingDb"
        :min="-3" :max="0" :default-value="-0.1"
        label="Ceiling"
        :format="(v) => fmtDb(v, 2)"
        @update:model-value="set('ceilingDb', $event)"
      />
      <dsp-knob
        :model-value="state.releaseMs"
        :min="10" :max="1000" :default-value="100"
        scale="log"
        label="Release"
        :format="fmtRelease"
        @update:model-value="set('releaseMs', $event)"
      />
      <dsp-knob
        :model-value="state.lookaheadMs"
        :min="0" :max="5" :default-value="1.5"
        label="Lookahead"
        :format="fmtLookahead"
        @update:model-value="set('lookaheadMs', $event)"
      />
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Oversampling</text>
      <view class="x-seg railed">
        <view
          v-for="factor in OVERSAMPLE_FACTORS"
          :key="factor"
          class="x-chip os"
          :class="{ on: state.oversampling === factor }"
          @click="set('oversampling', factor)"
        >{{ factor }}×</view>
      </view>
      <text class="hint">{{ latencyText }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, applyPreset, resetInsert, OVERSAMPLE_FACTORS } from '../../dsp/registry.js'
import { limiterLinToDb, LIMITER_X_PEAK_HOLD_MS } from '../../dsp/limiter-x.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME, fmtDb, axisText } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['limiter-x'].presets)

const GR_FLOOR_DB = -12
const GR_TICKS = [0, -3, -6, -9, -12]
const HISTORY = 240

// Ring buffer of recent gain reduction, newest at `head`.
const history = new Float32Array(HISTORY)
let head = 0

let holdGrDb = 0
let holdPeakDb = -120
let holdGrUntil = 0
let holdPeakUntil = 0
const shownGr = ref(0)
const shownPeak = ref(-120)

const inLevel = computed(() => num(props.meters.inPeak))
const inLevelR = computed(() => props.meters.inPeakR != null ? props.meters.inPeakR : null)
const outLevel = computed(() => num(props.meters.outPeak))
const outLevelR = computed(() => props.meters.outPeakR != null ? props.meters.outPeakR : null)

const grText = computed(() => {
  const db = shownGr.value
  return (db < -0.05 ? db.toFixed(1) : '0.0') + ' dB'
})
const peakOver = computed(() => shownPeak.value > num(state.value.ceilingDb, -0.1) + 0.05)
const peakText = computed(() => shownPeak.value > -90 ? fmtDb(shownPeak.value, 1) : '-\u221e dB')
const latencyText = computed(() => {
  const ms = num(state.value.lookaheadMs, 0)
  return ms > 0 ? 'Latency ' + ms.toFixed(2) + ' ms, reported to the host' : 'Zero latency'
})

function num (value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fmtRelease (v) {
  const ms = num(v)
  return ms < 10 ? ms.toFixed(1) + ' ms' : Math.round(ms) + ' ms'
}

function fmtLookahead (v) {
  const ms = num(v)
  return ms <= 0.001 ? 'Off' : ms.toFixed(2) + ' ms'
}

function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function readMeters () {
  const m = props.meters || {}
  let grDb = 0
  if (m.gainReductionDb != null) grDb = num(m.gainReductionDb)
  else if (m.gr != null) grDb = -Math.max(0, num(m.gr)) * 12
  if (!(grDb < 0)) grDb = 0

  let peakDb = -120
  if (m.truePeakDb != null) peakDb = num(m.truePeakDb, -120)
  else if (m.outputPeakDb != null) peakDb = num(m.outputPeakDb, -120)
  else if (m.outPeak != null) peakDb = limiterLinToDb(num(m.outPeak))
  return { grDb, peakDb }
}

function grToY (db, top, height) {
  const t = Math.min(1, Math.max(0, -db / -GR_FLOOR_DB))
  return top + t * height
}

function draw () {
  const prepared = prepareCanvas(canvas, 420, 220)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  const now = performance.now()
  const live = readMeters()
  if (live.grDb < holdGrDb) {
    holdGrDb = live.grDb
    holdGrUntil = now + LIMITER_X_PEAK_HOLD_MS
  } else if (now > holdGrUntil) {
    holdGrDb = live.grDb
  }
  if (live.peakDb > holdPeakDb) {
    holdPeakDb = live.peakDb
    holdPeakUntil = now + LIMITER_X_PEAK_HOLD_MS
  } else if (now > holdPeakUntil) {
    holdPeakDb = live.peakDb
  }
  shownGr.value += (holdGrDb - shownGr.value) * 0.28
  shownPeak.value += (holdPeakDb - shownPeak.value) * 0.28

  head = (head + 1) % HISTORY
  history[head] = live.grDb

  const padT = 46
  const padB = 16
  const gh = Math.max(20, h - padT - padB)

  ctx.lineWidth = 1
  GR_TICKS.forEach((db) => {
    const y = Math.round(grToY(db, padT, gh)) + 0.5
    ctx.strokeStyle = db === 0 ? DSP_THEME.axis : DSP_THEME.grid
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w - 26, y)
    ctx.stroke()
    axisText(ctx, db === 0 ? '0' : String(db), w - 22, y, 'left')
  })

  // Oldest sample on the left so reduction scrolls away from the playhead.
  ctx.beginPath()
  ctx.moveTo(0, padT)
  for (let i = 0; i < HISTORY; i++) {
    const db = history[(head + 1 + i) % HISTORY]
    const x = (i / (HISTORY - 1)) * (w - 26)
    ctx.lineTo(x, grToY(db, padT, gh))
  }
  ctx.lineTo(w - 26, padT)
  ctx.closePath()
  ctx.fillStyle = DSP_THEME.lim.fill
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i < HISTORY; i++) {
    const db = history[(head + 1 + i) % HISTORY]
    const x = (i / (HISTORY - 1)) * (w - 26)
    const y = grToY(db, padT, gh)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = DSP_THEME.lim.accent
  ctx.lineWidth = 1.4
  ctx.stroke()

  const holdY = Math.round(grToY(holdGrDb, padT, gh)) + 0.5
  if (holdGrDb < -0.05) {
    ctx.strokeStyle = DSP_THEME.lim.over
    ctx.setLineDash([3, 3])
    ctx.beginPath()
    ctx.moveTo(0, holdY)
    ctx.lineTo(w - 26, holdY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  axisText(ctx, 'dB GR', 4, padT - 8, 'left')
}

let raf = 0
let lastDraw = 0
function loop (t) {
  if (!lastDraw || t - lastDraw >= 33) {
    draw()
    lastDraw = t
  }
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.plug { gap: 8px; }
.stage {
  display: flex;
  gap: 10px;
  align-items: stretch;
  min-height: 0;
  flex: 1 1 auto;
}
.graph {
  flex: 1 1 auto;
  min-width: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.readout {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  gap: 26px;
  padding: 9px 12px 0;
  pointer-events: none;
}
.ro { display: flex; flex-direction: column; gap: 1px; }
.ro-lab {
  font-size: 8px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3);
}
.ro-val {
  font-size: 19px;
  font-weight: 300;
  color: var(--x-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.ro-val.over { color: var(--x-warn); }
.tray {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 8px;
  padding: 8px 12px;
  flex-shrink: 0;
}
.x-chip.os { min-width: 34px; }
.hint {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--x-ink-3);
  white-space: nowrap;
}

@media (max-width: 720px) {
  .readout { gap: 16px; padding: 7px 8px 0; }
  .ro-val { font-size: 16px; }
  .tray {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    justify-items: center;
    gap: 8px 4px;
  }
  .hint { display: none; }
}
</style>
