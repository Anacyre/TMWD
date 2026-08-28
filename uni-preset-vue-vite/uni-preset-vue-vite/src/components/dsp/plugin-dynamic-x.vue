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
        <view class="split-hit" :class="{ on: state.splitBands }" @click.stop="toggleSplit">
          <view class="sw" />
          Split
        </view>
      </template>
    </plugin-shell>

    <view class="stage">
      <view class="in-m">
        <dsp-meter fill :level="inLevel" label="In" :height="220" />
      </view>
      <view class="graph-panel x-panel">
        <text class="gtitle">Compressor</text>
        <dsp-canvas ref="canvas" fill :height="248" @pointerdown="onGraph" />
        <view class="gr">
          <text class="dsp-lab">GR</text>
          <view class="gr-col">
            <view class="gr-fill" :style="{ height: (grAmount * 100) + '%' }" />
          </view>
        </view>
      </view>
      <view v-if="state.splitBands" class="split-panel x-panel">
        <dsp-canvas ref="splitCanvas" :height="168" @pointerdown="onXo" />
        <view class="bands">
          <view v-for="(band, i) in state.bands" :key="i" class="band" :class="{ muted: !band.enabled }">
            <text class="blab">{{ bandNames[i] }}</text>
            <view class="tiny" :class="{ on: band.enabled }" @click="toggleBand(i)">{{ band.enabled ? 'On' : 'Off' }}</view>
            <view class="tiny" :class="{ on: band.solo }" @click="soloBand(i)">S</view>
          </view>
        </view>
      </view>
      <view class="out-m">
        <dsp-meter
          fill
          :stereo="false"
          :level="outLevel"
          label="Out"
          show-gain
          :gain="state.makeupDb"
          :gain-min="-12"
          :gain-max="24"
          :gain-default="0"
          :gain-disabled="state.autoGain"
          @update:gain="set('makeupDb', $event)"
        />
      </view>
    </view>

    <view class="knobs x-knobs">
      <dsp-knob
        size="lg"
        :model-value="state.threshold"
        :min="-48" :max="0" :default-value="-18"
        label="Thresh"
        :format="(v) => fmtDb(v)"
        @update:model-value="set('threshold', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.ratio"
        :min="1" :max="20" :default-value="4"
        scale="log"
        label="Ratio"
        :format="(v) => v.toFixed(1) + ' : 1'"
        @update:model-value="set('ratio', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.attack"
        :min="0.001" :max="0.2" :default-value="0.012"
        scale="log"
        label="Attack"
        :format="(v) => fmtMs(v)"
        @update:model-value="set('attack', $event)"
      />
      <dsp-knob
        size="lg"
        :model-value="state.release"
        :min="0.02" :max="1.5" :default-value="0.12"
        scale="log"
        label="Release"
        :format="(v) => state.autoRelease ? 'Auto' : fmtMs(v)"
        :disabled="state.autoRelease"
        @update:model-value="set('release', $event)"
      />
    </view>

    <view class="x-footer">
      <view class="x-chip" :class="{ on: state.autoRelease }" @click="toggleAutoRel">Auto Rel</view>
      <view class="x-chip" :class="{ on: state.autoGain }" @click="toggleAutoGain">Auto Gain</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, applyPreset, resetInsert } from '../../dsp/registry.js'
import { compressorCurve, grMeterAmount } from '../../dsp/dynamic-x.js'
import { canvasRect, prepareCanvas } from './canvas-util.js'
import { DSP_THEME, fmtDb, fmtHz, fmtMs, strokeGlow, fillGlow, freqToX, drawSpectrum } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) },
  spectrum: { type: Array, default: () => [] }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const splitCanvas = ref(null)
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['dynamic-x'].presets)
const inLevel = computed(() => props.meters && props.meters.inPeak != null ? props.meters.inPeak : 0)
const outLevel = computed(() => props.meters && props.meters.outPeak != null ? props.meters.outPeak : 0)
const grAmount = computed(() => {
  const m = props.meters || {}
  if (m.gainReductionDb != null) return grMeterAmount(m.gainReductionDb)
  return Math.min(1, Math.max(0, m.gr || 0))
})
const bandNames = ['Low', 'Mid', 'High']

function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }
function toggleAutoGain () { props.insert.state.autoGain = !props.insert.state.autoGain; if (props.insert.state.autoGain) props.insert.state.makeupDb = 0; commit() }
function toggleAutoRel () { props.insert.state.autoRelease = !props.insert.state.autoRelease; commit() }
function toggleSplit () { props.insert.state.splitBands = !props.insert.state.splitBands; commit() }
function toggleBand (i) { props.insert.state.bands[i].enabled = !props.insert.state.bands[i].enabled; commit() }
function soloBand (i) {
  const next = !props.insert.state.bands[i].solo
  props.insert.state.bands.forEach((b) => { b.solo = false })
  props.insert.state.bands[i].solo = next
  commit()
}

function draw () {
  const prepared = prepareCanvas(canvas, 520, 248)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0B0E14'
  ctx.fillRect(0, 0, w, h)
  const mapIn = (db) => ((db + 60) / 60) * w
  const mapOut = (db) => (1 - (db + 60) / 60) * h
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  ctx.lineWidth = 1
  for (let db = -48; db <= 0; db += 12) {
    ctx.beginPath(); ctx.moveTo(mapIn(db), 0); ctx.lineTo(mapIn(db), h); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, mapOut(db)); ctx.lineTo(w, mapOut(db)); ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke()
  ctx.fillStyle = DSP_THEME.muted
  ctx.font = '8px Inter, Segoe UI, sans-serif'
  ctx.fillText('INPUT', 8, h - 8)
  ctx.save()
  ctx.translate(10, 14)
  ctx.fillText('OUTPUT', 0, 0)
  ctx.restore()

  const pts = compressorCurve(state.value.threshold, state.value.ratio)
  ctx.beginPath()
  pts.forEach((p, i) => i ? ctx.lineTo(mapIn(p.inDb), mapOut(p.outDb)) : ctx.moveTo(mapIn(p.inDb), mapOut(p.outDb)))
  ctx.lineTo(w, h)
  ctx.lineTo(0, h)
  ctx.closePath()
  ctx.fillStyle = DSP_THEME.dyn.fill
  ctx.fill()
  ctx.beginPath()
  pts.forEach((p, i) => i ? ctx.lineTo(mapIn(p.inDb), mapOut(p.outDb)) : ctx.moveTo(mapIn(p.inDb), mapOut(p.outDb)))
  ctx.lineWidth = 1.8
  strokeGlow(ctx, DSP_THEME.dyn.accent, 10, () => ctx.stroke())
  const tx = mapIn(state.value.threshold)
  const ty = mapOut(state.value.threshold)
  ctx.setLineDash([3, 4])
  ctx.strokeStyle = 'rgba(92,225,255,0.28)'
  ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(w, ty); ctx.stroke()
  ctx.setLineDash([])
  fillGlow(ctx, DSP_THEME.dyn.accent, 10, () => {
    ctx.beginPath(); ctx.arc(tx, ty, 6, 0, Math.PI * 2); ctx.fill()
  })
  ctx.beginPath()
  ctx.arc(tx, ty, 6, 0, Math.PI * 2)
  ctx.fillStyle = '#0B0E14'
  ctx.fill()
  ctx.strokeStyle = DSP_THEME.dyn.accent
  ctx.lineWidth = 1.6
  ctx.stroke()

  const meters = props.meters || {}
  const inDb = meters.inputPeakDb != null
    ? meters.inputPeakDb
    : (meters.inPeak ? 20 * Math.log10(Math.max(1e-5, meters.inPeak)) : null)
  const grDb = meters.gainReductionDb != null ? meters.gainReductionDb : 0
  if (inDb != null && inDb > -90) {
    const curveOut = inDb + grDb
    ctx.fillStyle = 'rgba(92,225,255,0.35)'
    ctx.fillRect(mapIn(inDb) - 1, 0, 2, h)
    ctx.fillStyle = 'rgba(56,189,248,0.35)'
    ctx.fillRect(0, mapOut(curveOut) - 1, w, 2)
    fillGlow(ctx, DSP_THEME.dyn.accent, 12, () => {
      ctx.beginPath()
      ctx.arc(mapIn(inDb), mapOut(curveOut), 4, 0, Math.PI * 2)
      ctx.fill()
    })
  }
}

function drawSplit () {
  if (!state.value.splitBands) return
  const prepared = prepareCanvas(splitCanvas, 160, 168)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0B0E14'
  ctx.fillRect(0, 0, w, h)
  drawSpectrum(ctx, props.spectrum, w, h, 'rgba(92,225,255,0.16)')
  const x1 = freqToX(state.value.xo1, w)
  const x2 = freqToX(state.value.xo2, w)
  ctx.fillStyle = 'rgba(94,234,212,0.08)'
  ctx.fillRect(0, 0, x1, h)
  ctx.fillStyle = 'rgba(92,225,255,0.08)'
  ctx.fillRect(x1, 0, x2 - x1, h)
  ctx.fillStyle = 'rgba(167,139,250,0.08)'
  ctx.fillRect(x2, 0, w - x2, h)
  ctx.lineWidth = 1.4
  ;[
    [x1, '#5EEAD4'],
    [x2, '#A78BFA']
  ].forEach(([x, color]) => {
    ctx.strokeStyle = color
    ctx.shadowColor = color
    ctx.shadowBlur = 8
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    ctx.shadowBlur = 0
    ctx.beginPath(); ctx.arc(x, 12, 5, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill()
  })
  ctx.fillStyle = DSP_THEME.muted
  ctx.font = '8px Inter, Segoe UI, sans-serif'
  ctx.fillText(fmtHz(state.value.xo1), Math.min(w - 40, x1 + 4), h - 8)
  ctx.fillText(fmtHz(state.value.xo2), Math.min(w - 40, x2 + 4), h - 20)
}

let raf = 0
let lastDraw = 0
function loop (t) {
  if (!lastDraw || t - lastDraw >= 33) {
    draw()
    drawSplit()
    lastDraw = t
  }
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
watch(() => props.insert.state, () => { draw(); drawSplit() }, { deep: true })

function onGraph (e) {
  const startY = (e.touches ? e.touches[0].clientY : e.clientY)
  const startX = (e.touches ? e.touches[0].clientX : e.clientX)
  const startT = props.insert.state.threshold
  const startR = props.insert.state.ratio
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev
    props.insert.state.threshold = Math.min(0, Math.max(-48, startT - (p.clientY - startY) * 0.15))
    props.insert.state.ratio = Math.min(20, Math.max(1, startR + (p.clientX - startX) * 0.04))
    commit()
  }
  bindDrag(move)
}

function onXo (e) {
  const rect = canvasRect(splitCanvas)
  if (!rect.width) return
  const p0 = e.touches ? e.touches[0] : e
  const x0 = p0.clientX - rect.left
  const x1 = freqToX(state.value.xo1, rect.width)
  const x2 = freqToX(state.value.xo2, rect.width)
  const which = Math.abs(x0 - x1) <= Math.abs(x0 - x2) ? 'xo1' : 'xo2'
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev
    const t = Math.min(1, Math.max(0, (p.clientX - rect.left) / rect.width))
    const hz = Math.exp(Math.log(20) + t * (Math.log(20000) - Math.log(20)))
    if (which === 'xo1') props.insert.state.xo1 = Math.min(800, Math.max(40, hz))
    else props.insert.state.xo2 = Math.min(12000, Math.max(800, hz))
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
.split-hit {
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--dsp-line);
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  cursor: pointer;
}
.split-hit.on { color: var(--dsp-text); border-color: var(--dsp-accent); box-shadow: 0 0 10px var(--dsp-glow); }
.sw {
  width: 22px;
  height: 12px;
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  position: relative;
}
.sw::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--dsp-muted);
}
.split-hit.on .sw { background: rgba(92,225,255,0.25); }
.split-hit.on .sw::after { left: 12px; background: var(--dsp-accent); box-shadow: 0 0 8px var(--dsp-glow); }
.stage {
  display: flex;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
  align-items: stretch;
}
.in-m, .out-m {
  display: flex;
  flex-shrink: 0;
  min-height: 0;
}
.graph-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  position: relative;
  display: flex;
  padding: 8px 28px 8px 8px;
}
.gtitle {
  position: absolute;
  left: 12px;
  top: 8px;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  z-index: 1;
}
.graph { flex: 1; min-width: 0; }
.gr {
  position: absolute;
  right: 8px;
  top: 28px;
  bottom: 12px;
  width: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.gr-col {
  flex: 1;
  width: 4px;
  background: rgba(255,255,255,0.05);
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.gr-fill {
  width: 100%;
  background: var(--dsp-accent);
  box-shadow: 0 0 8px var(--dsp-glow);
  min-height: 1px;
}
.split-panel {
  width: 160px;
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.xo { width: 100%; flex: 1; min-height: 140px; display: block; touch-action: none; }
.bands { display: flex; flex-direction: column; gap: 6px; }
.band { display: flex; align-items: center; gap: 6px; }
.band.muted { filter: grayscale(1); opacity: 0.42; }
.blab { flex: 1; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--dsp-muted); }
.tiny {
  min-width: 28px;
  height: 22px;
  border: 1px solid var(--dsp-line);
  border-radius: 3px;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tiny.on { color: var(--dsp-text); border-color: var(--dsp-accent); }
.knobs { flex-shrink: 0; }

@media (max-width: 720px) {
  .stage,
  uni-view.stage {
    display: grid !important;
    grid-template-columns: 40px minmax(0, 1fr) 64px;
    grid-template-rows: minmax(110px, 24vh) auto;
  }
  .in-m { grid-column: 1; grid-row: 1; }
  .graph-panel { grid-column: 2; grid-row: 1; min-height: 110px; max-height: 24vh; }
  .out-m { grid-column: 3; grid-row: 1; }
  .split-panel {
    grid-column: 1 / -1;
    grid-row: 2;
    width: auto;
    min-height: 110px;
  }
  .tiny { min-width: 36px; height: 32px; }
  .split-hit { height: 36px; }
}
</style>
