<template>
  <view class="plug x-plug dsp-skin skin-dyn" :class="{ 'is-off': insert.enabled === false }">
    <plugin-shell
      name="Dynamic X"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    >
      <template #actions>
        <view
          class="x-chip split-btn"
          :class="{ on: state.splitBands }"
          title="Split Bands — separate gain computers for low, mid and high"
          aria-label="Split Bands"
          @click.stop="toggleSplit"
        >
          <text class="x-lab-full">Split Bands</text><text class="x-lab-abbr">3 BAND</text>
        </view>
      </template>
    </plugin-shell>

    <view class="stage">
      <dsp-meter label="In" :level="inLevel" :level-r="inLevelR" fill :height="230" />

      <view class="graph x-panel">
        <view class="readout">
          <text class="ro-lab">{{ targetLabel }}</text>
          <text class="ro-val">{{ fmtDb(target.threshold, 1) }}</text>
          <text class="ro-sub">{{ Number(target.ratio).toFixed(1) }} : 1</text>
        </view>
        <dsp-canvas ref="canvas" fill :height="230" @pointerdown="onGraph" />
        <view class="gr">
          <text class="gr-lab">GR</text>
          <view class="gr-col">
            <view class="gr-fill" :style="{ height: (grAmount * 100) + '%' }" />
          </view>
        </view>
      </view>

      <dsp-meter
        label="Out"
        :level="outLevel"
        :level-r="outLevelR"
        fill
        :height="230"
        show-gain
        :gain="state.makeupDb"
        :gain-min="-12"
        :gain-max="24"
        :gain-default="0"
        :gain-disabled="state.autoGain"
        @update:gain="set('makeupDb', $event)"
      />
    </view>

    <view class="tray x-tray">
      <dsp-knob
        :model-value="target.threshold"
        :min="-48" :max="0" :default-value="-18"
        label="Thresh"
        :format="(v) => fmtDb(v, 1)"
        @update:model-value="setTarget('threshold', $event)"
      />
      <dsp-knob
        :model-value="target.ratio"
        :min="1" :max="20" :default-value="4"
        scale="log"
        label="Ratio"
        :format="(v) => Number(v).toFixed(1) + ' : 1'"
        @update:model-value="setTarget('ratio', $event)"
      />
      <dsp-knob
        :model-value="state.kneeDb"
        :min="0" :max="24" :default-value="6"
        label="Knee"
        :format="(v) => Number(v).toFixed(1) + ' dB'"
        @update:model-value="set('kneeDb', $event)"
      />
      <dsp-knob
        :model-value="state.mix"
        :min="0" :max="1" :default-value="1"
        label="Mix"
        :format="(v) => Math.round(v * 100) + ' %'"
        @update:model-value="set('mix', $event)"
      />
      <dsp-knob
        :model-value="state.lookaheadMs"
        :min="0" :max="10" :default-value="0"
        label="Lookahead"
        :format="fmtLookahead"
        @update:model-value="set('lookaheadMs', $event)"
      />
    </view>

    <view class="faders">
      <dsp-slider
        horizontal
        scale="log"
        :model-value="state.attack"
        :min="0.0002" :max="0.2" :default-value="0.012"
        label="Attack"
        :format="fmtMs"
        @update:model-value="set('attack', $event)"
      />
      <dsp-slider
        horizontal
        scale="log"
        :model-value="state.release"
        :min="0.02" :max="1.5" :default-value="0.12"
        label="Release"
        :format="(v) => state.autoRelease ? 'Auto' : fmtMs(v)"
        :disabled="state.autoRelease"
        @update:model-value="set('release', $event)"
      />
      <dsp-slider
        horizontal
        :model-value="state.makeupDb"
        :min="-12" :max="24" :default-value="0"
        label="Gain"
        :format="(v) => fmtDb(v, 1)"
        :disabled="state.autoGain"
        @update:model-value="set('makeupDb', $event)"
      />
    </view>

    <view class="x-footer">
      <text class="dsp-lab"><text class="x-lab-full">Detector</text><text class="x-lab-abbr">DET</text></text>
      <view class="x-seg railed" title="Level detector">
        <view
          v-for="mode in DYNAMIC_DETECTORS"
          :key="mode"
          class="x-chip det"
          :class="{ on: detector === mode }"
          :title="mode + ' detector'"
          @click="set('detector', mode)"
        >{{ mode }}</view>
      </view>
      <dsp-knob
        v-if="detector === 'rms'"
        size="sm"
        :model-value="state.rmsMs"
        :min="1" :max="100" :default-value="10"
        scale="log"
        label="Window"
        :format="(v) => Math.round(v) + ' ms'"
        @update:model-value="set('rmsMs', $event)"
      />
      <view class="gap" />
      <view
        class="x-chip"
        :class="{ on: state.autoRelease }"
        title="Auto Release — release time follows the programme"
        aria-label="Auto Release"
        @click="toggleAutoRel"
      >
        <text class="x-lab-full">Auto Rel</text><text class="x-lab-abbr">AR</text>
      </view>
      <view
        class="x-chip"
        :class="{ on: state.autoGain }"
        title="Auto Gain — make-up gain tracks the reduction"
        aria-label="Auto Gain"
        @click="toggleAutoGain"
      >
        <text class="x-lab-full">Auto Gain</text><text class="x-lab-abbr">AG</text>
      </view>
    </view>

    <view v-if="state.splitBands" class="bands">
      <view class="band-xo x-panel">
        <dsp-canvas ref="splitCanvas" :height="84" @pointerdown="onXo" />
      </view>
      <view class="band-row">
        <view
          v-for="(band, i) in state.bands"
          :key="i"
          class="band x-card"
          :class="{ sel: selectedBand === i, muted: !band.enabled }"
          @click="selectBand(i)"
        >
          <view class="band-head">
            <view class="x-dot" :class="{ on: band.enabled }" @click.stop="toggleBand(i)">⏻</view>
            <text class="band-name">{{ BAND_NAMES[i] }}</text>
            <view class="x-dot solo" :class="{ on: band.solo }" @click.stop="soloBand(i)">S</view>
          </view>
          <text class="band-hz">{{ bandRange(i) }}</text>
          <text class="band-val">{{ fmtDb(band.threshold, 1) }} · {{ Number(band.ratio).toFixed(1) }}:1</text>
        </view>
        <view class="band x-card" :class="{ sel: selectedBand < 0 }" @click="selectBand(-1)">
          <view class="band-head">
            <text class="band-name">All Bands</text>
          </view>
          <text class="band-hz">Global gain computer</text>
          <text class="band-val">{{ fmtDb(state.threshold, 1) }} · {{ Number(state.ratio).toFixed(1) }}:1</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspSlider from './dsp-slider.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, applyPreset, resetInsert, DYNAMIC_DETECTORS } from '../../dsp/registry.js'
import { compressorCurve, grMeterAmount } from '../../dsp/dynamic-x.js'
import { canvasRect, prepareCanvas, observeCanvasResize } from './canvas-util.js'
import {
  DSP_THEME, fmtDb, fmtMs, fmtHz, freqToX, xToFreq,
  drawSpectrum, drawTransferGrid, dbToY, axisText, drawVisualNotice, visualFrameMs
} from './dsp-theme.js'
import { beginPointerDrag } from '../../lib/pointer-drag.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) },
  spectrum: { type: Array, default: () => [] },
  visState: { type: String, default: '' },
  visNotice: { type: String, default: '' },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const splitCanvas = ref(null)
const selectedBand = ref(-1)

const state = computed(() => props.insert.state)
const presets = computed(() => plugins['dynamic-x'].presets)

const BAND_NAMES = ['Low', 'Mid', 'High']
const IN_MIN_DB = -60
const IN_MAX_DB = 0
const OUT_MIN_DB = -36
const OUT_MAX_DB = 12

const detector = computed(() => DYNAMIC_DETECTORS.includes(state.value.detector) ? state.value.detector : 'peak')
const inLevel = computed(() => num(props.meters.inPeak))
const inLevelR = computed(() => props.meters.inPeakR != null ? props.meters.inPeakR : null)
const outLevel = computed(() => num(props.meters.outPeak))
const outLevelR = computed(() => props.meters.outPeakR != null ? props.meters.outPeakR : null)
const grAmount = computed(() => {
  const m = props.meters || {}
  if (m.gainReductionDb != null) return grMeterAmount(m.gainReductionDb)
  return Math.min(1, Math.max(0, num(m.gr)))
})

/* Thresh / Ratio edit either the global computer or one band, so per-band values
   are reachable without a second set of knobs. */
const bandActive = computed(() => state.value.splitBands && selectedBand.value >= 0)
const target = computed(() => {
  if (bandActive.value) {
    const band = state.value.bands[selectedBand.value]
    if (band) {
      return {
        threshold: num(band.threshold, -18),
        ratio: num(band.ratio, 4)
      }
    }
  }
  return {
    threshold: num(state.value.threshold, -18),
    ratio: num(state.value.ratio, 4)
  }
})
const targetLabel = computed(() => bandActive.value
  ? BAND_NAMES[selectedBand.value] + ' Threshold'
  : 'Threshold')

function num (value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fmtLookahead (v) {
  const ms = num(v)
  return ms <= 0.001 ? 'Off' : ms.toFixed(2) + ' ms'
}

function bandRange (i) {
  const lo = i === 0 ? 20 : i === 1 ? num(state.value.xo1, 180) : num(state.value.xo2, 3500)
  const hi = i === 0 ? num(state.value.xo1, 180) : i === 1 ? num(state.value.xo2, 3500) : 20000
  return fmtHz(lo) + ' – ' + fmtHz(hi)
}

function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function setTarget (key, value) {
  if (bandActive.value) {
    const band = props.insert.state.bands[selectedBand.value]
    if (band) {
      band[key] = value
      commit()
      return
    }
  }
  props.insert.state[key] = value
  commit()
}

function selectBand (i) { selectedBand.value = i }
function toggleAutoGain () {
  props.insert.state.autoGain = !props.insert.state.autoGain
  if (props.insert.state.autoGain) props.insert.state.makeupDb = 0
  commit()
}
function toggleAutoRel () { props.insert.state.autoRelease = !props.insert.state.autoRelease; commit() }
function toggleSplit () {
  props.insert.state.splitBands = !props.insert.state.splitBands
  if (!props.insert.state.splitBands) selectedBand.value = -1
  commit()
}
function toggleBand (i) {
  props.insert.state.bands[i].enabled = !props.insert.state.bands[i].enabled
  commit()
}
function soloBand (i) {
  const next = !props.insert.state.bands[i].solo
  props.insert.state.bands.forEach((band) => { band.solo = false })
  props.insert.state.bands[i].solo = next
  commit()
}

function mapIn (db, w) {
  return ((db - IN_MIN_DB) / (IN_MAX_DB - IN_MIN_DB)) * w
}

function tracePath (ctx, pts, w, h) {
  ctx.beginPath()
  pts.forEach((point, i) => {
    const x = mapIn(point.inDb, w)
    const y = dbToY(point.outDb, h, OUT_MIN_DB, OUT_MAX_DB)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
}

/* Rolling input-level histogram. A transfer curve alone cannot show where the
   material actually sits, so the threshold was being set blind. Bins are on the
   same dB axis as the curve, decaying so old peaks fade out. */
const HIST_BINS = 64
const histogram = new Float32Array(HIST_BINS)

function pushHistogram (inDb) {
  for (let i = 0; i < HIST_BINS; i++) histogram[i] *= 0.985
  if (inDb == null || !Number.isFinite(inDb) || inDb <= IN_MIN_DB) return
  const t = (Math.min(IN_MAX_DB, inDb) - IN_MIN_DB) / (IN_MAX_DB - IN_MIN_DB)
  const bin = Math.min(HIST_BINS - 1, Math.max(0, Math.round(t * (HIST_BINS - 1))))
  histogram[bin] = Math.min(1, histogram[bin] + 0.12)
}

function drawHistogram (ctx, w, h) {
  let max = 0
  for (let i = 0; i < HIST_BINS; i++) if (histogram[i] > max) max = histogram[i]
  if (max < 0.01) return false
  const bw = w / HIST_BINS
  ctx.save()
  ctx.fillStyle = DSP_THEME.dyn.fill
  for (let i = 0; i < HIST_BINS; i++) {
    const v = histogram[i] / max
    if (v <= 0.01) continue
    const bh = v * h * 0.45
    ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 0.5), bh)
  }
  ctx.restore()
  return true
}

function inputDb () {
  const meters = props.meters || {}
  if (meters.inputPeakDb != null) return num(meters.inputPeakDb, null)
  const peak = num(meters.inPeak)
  return peak > 0 ? 20 * Math.log10(Math.max(1e-5, peak)) : null
}

function draw () {
  const prepared = prepareCanvas(canvas, 520, 230)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  pushHistogram(inputDb())
  const liveHistogram = drawHistogram(ctx, w, h)
  drawTransferGrid(ctx, w, h, IN_MIN_DB, IN_MAX_DB, OUT_MIN_DB, OUT_MAX_DB)

  // Unity reference.
  ctx.strokeStyle = DSP_THEME.gridMinor
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(mapIn(IN_MIN_DB, w), dbToY(IN_MIN_DB, h, OUT_MIN_DB, OUT_MAX_DB))
  ctx.lineTo(mapIn(IN_MAX_DB, w), dbToY(IN_MAX_DB, h, OUT_MIN_DB, OUT_MAX_DB))
  ctx.stroke()

  const knee = num(state.value.kneeDb, 6)

  if (state.value.splitBands) {
    ctx.lineWidth = 1
    ctx.strokeStyle = DSP_THEME.gridMinor
    state.value.bands.forEach((band, i) => {
      if (i === selectedBand.value || !band.enabled) return
      tracePath(ctx, compressorCurve(num(band.threshold, -18), num(band.ratio, 4), knee), w, h)
      ctx.stroke()
    })
  }

  const pts = compressorCurve(target.value.threshold, target.value.ratio, knee)
  tracePath(ctx, pts, w, h)
  ctx.lineTo(mapIn(IN_MAX_DB, w), h)
  ctx.lineTo(mapIn(IN_MIN_DB, w), h)
  ctx.closePath()
  ctx.fillStyle = DSP_THEME.dyn.fill
  ctx.fill()

  tracePath(ctx, pts, w, h)
  ctx.strokeStyle = DSP_THEME.dyn.accent
  ctx.lineWidth = 1.8
  ctx.stroke()

  // Handles along the curve, echoing the reference design's dotted transfer line.
  ctx.fillStyle = DSP_THEME.dyn.accent
  for (let db = IN_MIN_DB; db <= IN_MAX_DB; db += 12) {
    const point = pts.reduce((best, p) => (
      Math.abs(p.inDb - db) < Math.abs(best.inDb - db) ? p : best
    ), pts[0])
    ctx.beginPath()
    ctx.arc(mapIn(point.inDb, w), dbToY(point.outDb, h, OUT_MIN_DB, OUT_MAX_DB), 2.6, 0, Math.PI * 2)
    ctx.fill()
  }

  const tx = mapIn(target.value.threshold, w)
  ctx.strokeStyle = DSP_THEME.accentLo
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.moveTo(tx, 0)
  ctx.lineTo(tx, h)
  ctx.stroke()
  ctx.setLineDash([])

  const ty = dbToY(target.value.threshold, h, OUT_MIN_DB, OUT_MAX_DB)
  ctx.beginPath()
  ctx.arc(tx, ty, 5, 0, Math.PI * 2)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fill()
  ctx.strokeStyle = DSP_THEME.dyn.accent
  ctx.lineWidth = 1.8
  ctx.stroke()

  const meters = props.meters || {}
  const inDb = inputDb()
  const grDb = num(meters.gainReductionDb)
  if (inDb != null && inDb > -90) {
    const outDb = inDb + grDb
    ctx.fillStyle = DSP_THEME.dyn.over
    ctx.fillRect(Math.round(mapIn(inDb, w)), 0, 1, h)
    ctx.beginPath()
    ctx.arc(mapIn(inDb, w), dbToY(outDb, h, OUT_MIN_DB, OUT_MAX_DB), 3.4, 0, Math.PI * 2)
    ctx.fill()
  }

  axisText(ctx, 'Input', 6, 10, 'left')
  if (!liveHistogram && props.visNotice) drawVisualNotice(ctx, props.visNotice, w / 2, 20)
}

function drawSplit () {
  if (!state.value.splitBands) return
  const prepared = prepareCanvas(splitCanvas, 480, 84)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  const x1 = freqToX(num(state.value.xo1, 180), w)
  const x2 = freqToX(num(state.value.xo2, 3500), w)
  const regions = [
    [0, x1, 0],
    [x1, x2, 1],
    [x2, w, 2]
  ]
  regions.forEach(([from, to, i]) => {
    const band = state.value.bands[i]
    ctx.fillStyle = selectedBand.value === i
      ? DSP_THEME.accentLo
      : (band && band.enabled ? 'rgba(38,40,44,0.03)' : 'rgba(38,40,44,0.07)')
    ctx.fillRect(from, 0, to - from, h)
  })

  drawSpectrum(ctx, props.spectrum, w, h, DSP_THEME.eq.spec, DSP_THEME.eq.specLine)

  ctx.lineWidth = 1.4
  ctx.strokeStyle = DSP_THEME.dyn.accent
  ;[x1, x2].forEach((x) => {
    ctx.beginPath()
    ctx.moveTo(Math.round(x) + 0.5, 0)
    ctx.lineTo(Math.round(x) + 0.5, h - 12)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x, 10, 4, 0, Math.PI * 2)
    ctx.fillStyle = DSP_THEME.dyn.accent
    ctx.fill()
  })

  axisText(ctx, fmtHz(num(state.value.xo1, 180)), Math.min(w - 4, x1 + 5), h - 6, 'left')
  axisText(ctx, fmtHz(num(state.value.xo2, 3500)), Math.min(w - 4, x2 + 5), h - 6, 'left')
}

let raf = 0
let lastDraw = 0
let stopResize = null
const FRAME_MS = visualFrameMs()
function redraw () {
  draw()
  drawSplit()
}
function loop (t) {
  if (!lastDraw || t - lastDraw >= FRAME_MS) {
    redraw()
    lastDraw = t
  }
  raf = requestAnimationFrame(loop)
}
function start () {
  if (raf) return
  lastDraw = 0
  raf = requestAnimationFrame(loop)
}
function stop () {
  cancelAnimationFrame(raf)
  raf = 0
}
function onVisibility () {
  if (typeof document === 'undefined') return
  if (document.hidden) stop()
  else start()
}
onMounted(() => {
  start()
  stopResize = observeCanvasResize([canvas, splitCanvas], redraw)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  stop()
  if (stopResize) stopResize()
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
})
watch(() => props.insert.state, redraw, { deep: true })

function onGraph (event) {
  const startY = event.clientY
  const startX = event.clientX
  const startT = target.value.threshold
  const startR = target.value.ratio
  beginPointerDrag(event, {
    onMove: (ev) => {
      setTarget('threshold', Math.min(0, Math.max(-48, startT - (ev.clientY - startY) * 0.15)))
      setTarget('ratio', Math.min(20, Math.max(1, startR * Math.pow(2, (ev.clientX - startX) / 160))))
    }
  })
}

function onXo (event) {
  const rect = canvasRect(splitCanvas)
  if (!rect.width) return
  const x0 = event.clientX - rect.left
  const x1 = freqToX(num(state.value.xo1, 180), rect.width)
  const x2 = freqToX(num(state.value.xo2, 3500), rect.width)
  const which = Math.abs(x0 - x1) <= Math.abs(x0 - x2) ? 'xo1' : 'xo2'
  beginPointerDrag(event, {
    onMove: (ev) => {
      const hz = xToFreq(ev.clientX - rect.left, rect.width)
      if (which === 'xo1') props.insert.state.xo1 = Math.min(800, Math.max(40, hz))
      else props.insert.state.xo2 = Math.min(12000, Math.max(800, hz))
      commit()
    }
  })
}
</script>

<style scoped>
.plug { gap: 8px; }
.split-btn { min-width: 88px; }
.stage {
  display: flex;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
  align-items: stretch;
}
.graph {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  padding: 0 30px 0 0;
  overflow: hidden;
}
.readout {
  position: absolute;
  top: 8px;
  right: 40px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  pointer-events: none;
}
.ro-lab {
  font-size: 8px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3);
}
.ro-val {
  font-size: 18px;
  font-weight: 300;
  color: var(--x-ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.ro-sub {
  font-size: 10px;
  color: var(--x-ink-2);
  font-variant-numeric: tabular-nums;
}
.gr {
  position: absolute;
  right: 8px;
  top: 8px;
  bottom: 8px;
  width: 18px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.gr-lab {
  font-size: 8px;
  letter-spacing: 0.1em;
  color: var(--x-ink-3);
}
.gr-col {
  flex: 1;
  width: 6px;
  background: var(--x-panel-2);
  border: 1px solid var(--x-line-2);
  border-radius: 1px;
  display: flex;
  align-items: flex-start;
  overflow: hidden;
  box-sizing: border-box;
}
.gr-fill {
  width: 100%;
  background: var(--x-cool);
  min-height: 1px;
}
.tray {
  display: flex;
  align-items: flex-end;
  justify-content: space-around;
  gap: 6px;
  padding: 8px 10px;
  flex-shrink: 0;
}
.faders {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px 18px;
  padding: 2px 6px;
  flex-shrink: 0;
}
.gap { flex: 1; }
.x-chip.det { min-width: 44px; text-transform: uppercase; }
.bands {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid var(--x-line);
}
.band-xo {
  overflow: hidden;
  display: flex;
  min-height: 84px;
}
.band-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.band {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.band.muted { opacity: 0.5; }
.band-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.band-name {
  flex: 1;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--x-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.band-hz {
  font-size: 9px;
  color: var(--x-ink-3);
  font-variant-numeric: tabular-nums;
}
.band-val {
  font-size: 10px;
  color: var(--x-ink-2);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 720px) {
  .readout { right: 34px; top: 6px; }
  .ro-val { font-size: 15px; }
  .tray {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    justify-items: center;
    gap: 8px 4px;
  }
  .faders { grid-template-columns: 1fr; }
  .band-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
