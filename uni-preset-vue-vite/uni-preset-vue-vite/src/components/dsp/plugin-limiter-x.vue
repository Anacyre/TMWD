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
    />

    <view class="stage x-panel">
      <view class="readout">
        <text class="gr-num">{{ grText }}</text>
        <text class="peak-num">{{ peakText }}</text>
      </view>
      <dsp-canvas ref="canvas" fill :height="248" />
    </view>

    <view class="knobs x-knobs">
      <dsp-knob
        size="lg"
        :model-value="state.gainDb"
        :min="-12" :max="18" :default-value="0"
        label="Gain"
        :format="fmtGain"
        @update:model-value="set('gainDb', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.releaseMs"
        :min="10" :max="1000" :default-value="100"
        scale="log"
        label="Release"
        :format="fmtRelease"
        @update:model-value="set('releaseMs', $event)"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, applyPreset, resetInsert } from '../../dsp/registry.js'
import { limiterLinToDb, LIMITER_X_PEAK_HOLD_MS } from '../../dsp/limiter-x.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME, fmtDb, fillGlow } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['limiter-x'].presets)

const GR_TICKS = [0, -2, -4, -6, -12]
const HOLD_MS = LIMITER_X_PEAK_HOLD_MS

let holdGrDb = 0
let holdPeakDb = -120
let holdGrUntil = 0
let holdPeakUntil = 0
const shownGr = ref(0)
const shownPeak = ref(-120)

const grText = computed(() => {
  const db = shownGr.value
  if (!(db < -0.05)) return '0.0 dB GR'
  return db.toFixed(1) + ' dB GR'
})
const peakText = computed(() => {
  const db = shownPeak.value
  if (!(db > -90)) return 'PEAK  -∞'
  return 'PEAK  ' + fmtDb(db, 1)
})

function fmtGain (v) {
  return fmtDb(v, 1)
}
function fmtRelease (v) {
  const ms = Number(v) || 0
  if (ms < 10) return ms.toFixed(1) + ' ms'
  return Math.round(ms) + ' ms'
}

function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function readMeters () {
  const m = props.meters || {}
  let grDb = 0
  if (m.gainReductionDb != null) grDb = m.gainReductionDb
  else if (m.gr != null) grDb = -Math.max(0, m.gr) * 12
  if (!(grDb < 0)) grDb = 0
  let peakDb = -120
  if (m.outputPeakDb != null) peakDb = m.outputPeakDb
  else if (m.outPeak != null) peakDb = limiterLinToDb(m.outPeak)
  return { grDb, peakDb }
}

function mapY (db, h) {
  const t = Math.min(1, Math.max(0, -db / 12))
  return t * h
}

function draw () {
  const prepared = prepareCanvas(canvas, 360, 248)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0B0E14'
  ctx.fillRect(0, 0, w, h)

  const now = performance.now()
  const live = readMeters()
  if (live.grDb < holdGrDb) {
    holdGrDb = live.grDb
    holdGrUntil = now + HOLD_MS
  } else if (now > holdGrUntil) {
    holdGrDb = live.grDb
  }
  if (live.peakDb > holdPeakDb) {
    holdPeakDb = live.peakDb
    holdPeakUntil = now + HOLD_MS
  } else if (now > holdPeakUntil) {
    holdPeakDb = live.peakDb
  }
  shownGr.value += (holdGrDb - shownGr.value) * 0.28
  shownPeak.value += (holdPeakDb - shownPeak.value) * 0.28

  const meterX = Math.round(w * 0.58)
  const meterW = Math.max(10, Math.round(w * 0.08))
  const padT = 16
  const padB = 18
  const mh = h - padT - padB

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  ctx.font = '10px Inter, Segoe UI, sans-serif'
  ctx.fillStyle = DSP_THEME.muted
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let i = 0; i < GR_TICKS.length; i++) {
    const db = GR_TICKS[i]
    const y = padT + mapY(db, mh)
    ctx.beginPath()
    ctx.moveTo(meterX - 18, y)
    ctx.lineTo(meterX + meterW + 18, y)
    ctx.stroke()
    ctx.fillText(db === 0 ? '0' : String(db), meterX - 24, y)
  }

  ctx.fillStyle = 'rgba(255,255,255,0.05)'
  ctx.fillRect(meterX, padT, meterW, mh)

  const fillH = mapY(shownGr.value, mh)
  if (fillH > 0.5) {
    const g = ctx.createLinearGradient(0, padT, 0, padT + fillH)
    g.addColorStop(0, DSP_THEME.lim.accent)
    g.addColorStop(1, 'rgba(232, 184, 74, 0.18)')
    ctx.fillStyle = g
    fillGlow(ctx, DSP_THEME.lim.accent, 12, () => {
      ctx.fillRect(meterX, padT, meterW, fillH)
    })
  }

  const holdY = padT + mapY(holdGrDb, mh)
  ctx.fillStyle = DSP_THEME.lim.accent
  ctx.fillRect(meterX - 3, holdY - 1, meterW + 6, 2)

  ctx.fillStyle = DSP_THEME.muted
  ctx.font = '8px Inter, Segoe UI, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('dB', meterX + meterW + 10, padT + 2)
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
watch(() => props.insert.state, () => { draw() }, { deep: true })
</script>

<style scoped>
.plug { gap: 10px; }
.stage {
  display: flex;
  gap: 12px;
  align-items: stretch;
  min-height: 0;
  flex: 1 1 auto;
  padding: 12px 16px;
}
.readout {
  width: 132px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 10px;
}
.gr-num {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--dsp-accent);
  font-variant-numeric: tabular-nums;
}
.peak-num {
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  font-variant-numeric: tabular-nums;
}
.knobs { flex-shrink: 0; }

@media (max-width: 720px) {
  .stage,
  uni-view.stage {
    flex-direction: column;
    max-height: 28vh;
    min-height: 120px;
  }
  .readout {
    width: auto;
    flex-direction: row;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
  }
  .gr-num { font-size: 18px; }
}
</style>
