<template>
  <view class="plug x-plug dsp-skin skin-eq" :class="{ 'is-off': insert.enabled === false, 'eq-fill': !embedded }">
    <plugin-shell
      name="Equalizer X"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    />

    <view class="stage">
      <view class="graph x-panel">
        <dsp-canvas
          ref="canvas"
          :fill="!embedded"
          :height="embedded ? 170 : 240"
          @pointerdown="onDown"
          @dblclick="onCreate"
        />
        <view class="add-node" :class="{ full: nodes.length >= 7 }" @click="addNodeAtCenter">
          {{ nodes.length >= 7 ? '7 / 7' : '+' }}
        </view>
      </view>
      <dsp-meter
        label="Gain"
        :level="outLevel"
        :level-r="outLevelR"
        fill
        :height="embedded ? 170 : 240"
        show-gain
        :gain="state.outputGainDb"
        :gain-min="-24"
        :gain-max="24"
        :gain-default="0"
        @update:gain="set('outputGainDb', $event)"
      />
    </view>

    <view class="strip">
      <view
        v-for="(node, i) in nodes"
        :key="'band' + i"
        class="card x-card"
        :class="{ sel: i === activeIndex, muted: node.enabled === false }"
        :style="{ '--band': eqBandColor(i) }"
        @pointerdown="activeIndex = i"
      >
        <view class="card-head">
          <view class="x-dot num" :class="{ on: node.enabled !== false }" @click.stop="toggleEnableAt(i)">{{ i + 1 }}</view>
          <view class="shape" @click.stop>
            <view class="x-sel shape-btn" @click="shapeOpen = shapeOpen === i ? -1 : i">
              <text class="shape-txt">{{ shapeShort(node) }}</text>
              <text class="caret">▾</text>
            </view>
            <view v-if="shapeOpen === i" class="x-menu shape-menu">
              <view
                v-for="shape in EQ_SHAPES"
                :key="shape"
                class="item"
                :class="{ on: node.shape === shape }"
                @click="setShapeAt(i, shape)"
              >{{ SHAPE_LABELS[shape] }}</view>
            </view>
          </view>
          <view class="x-dot solo" :class="{ on: node.solo }" @click.stop="soloAt(i)">S</view>
          <view class="x-dot kill" @click.stop="removeAt(i)">×</view>
        </view>

        <view class="card-knobs">
          <dsp-knob
            size="sm"
            :accent="eqBandColor(i)"
            :model-value="showGainFor(node) ? node.gain : 0"
            :min="-18" :max="18" :default-value="0"
            label="Gain"
            :format="(v) => fmtDb(v, 1)"
            :disabled="!showGainFor(node)"
            @update:model-value="setAt(i, 'gain', $event)"
          />
          <dsp-knob
            size="sm"
            :accent="eqBandColor(i)"
            :model-value="node.freq"
            :min="20" :max="20000" :default-value="1000"
            scale="log"
            label="Freq"
            :format="(v) => fmtHz(v)"
            @update:model-value="setAt(i, 'freq', $event)"
          />
          <dsp-knob
            size="sm"
            :accent="eqBandColor(i)"
            :model-value="node.q"
            :min="0.2" :max="12" :default-value="0.9"
            scale="log"
            label="Q"
            :format="(v) => Number(v).toFixed(2)"
            :disabled="!showQFor(node)"
            @update:model-value="setAt(i, 'q', $event)"
          />
        </view>

        <view v-if="canSlope(node)" class="card-slope">
          <view class="x-seg railed">
            <view
              v-for="step in SLOPE_STEPS"
              :key="step"
              class="x-chip slope"
              :class="{ on: (node.slope || 12) === step }"
              @click.stop="setAt(i, 'slope', step)"
            >{{ step }}</view>
          </view>
        </view>
      </view>

      <view v-if="!nodes.length" class="card empty" @click="addNodeAtCenter">
        <text class="empty-lab">Add a band</text>
        <text class="empty-plus">+</text>
      </view>
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Analyzer</text>
      <view class="x-seg railed">
        <view
          v-for="mode in EQ_ANALYZER_MODES"
          :key="mode"
          class="x-chip an"
          :class="{ on: analyzerMode === mode }"
          @click="set('analyzerMode', mode)"
        >{{ mode }}</view>
      </view>

      <text class="dsp-lab">Oversampling</text>
      <view class="x-seg railed">
        <view
          v-for="factor in OVERSAMPLE_FACTORS"
          :key="factor"
          class="x-chip os"
          :class="{ on: oversampling === factor }"
          @click="set('oversampling', factor)"
        >{{ factor }}×</view>
      </view>

      <view class="gap" />
      <view class="x-chip" :class="{ on: state.autoGain }" @click="set('autoGain', !state.autoGain)">Auto Gain</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import {
  plugins, EQ_SHAPES, EQ_ANALYZER_MODES, OVERSAMPLE_FACTORS,
  applyPreset, resetInsert, createEmptyNode
} from '../../dsp/registry.js'
import { eqCurvePoints, nodeToCanvas, canvasToNode } from '../../dsp/eq-curve.js'
import { showToast } from '../../store/session.js'
import { canvasRect, prepareCanvas } from './canvas-util.js'
import {
  DSP_THEME, fmtHz, fmtDb, SHAPE_LABELS, SHAPE_LABELS_SHORT,
  eqBandColor, drawFreqGrid, drawDbGrid, drawSpectrum
} from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  spectrum: { type: Array, default: () => [] },
  meters: { type: Object, default: () => ({}) },
  embedded: { type: Boolean, default: false }
})
const emit = defineEmits(['change'])
const canvas = ref(null)
const activeIndex = ref(0)
const shapeOpen = ref(-1)

const SLOPE_STEPS = [6, 12, 24, 48]
const SLOPE_SHAPES = ['lowcut', 'highcut', 'lowshelf', 'highshelf']
const DB_RANGE = 18
const DB_TICKS = [12, 6, 0, -6, -12]

const state = computed(() => props.insert.state)
const nodes = computed(() => state.value.nodes || [])
const presets = computed(() => plugins['equalizer-x'].presets)
const analyzerMode = computed(() => EQ_ANALYZER_MODES.includes(state.value.analyzerMode) ? state.value.analyzerMode : 'post')
const oversampling = computed(() => OVERSAMPLE_FACTORS.includes(state.value.oversampling) ? state.value.oversampling : 1)
const outLevel = computed(() => props.meters && props.meters.outPeak != null ? props.meters.outPeak : 0)
const outLevelR = computed(() => props.meters && props.meters.outPeakR != null ? props.meters.outPeakR : null)

function showGainFor (node) { return !!node && !['lowcut', 'highcut', 'notch', 'bandpass'].includes(node.shape) }
function showQFor (node) { return !!node && ['bell', 'notch', 'bandpass'].includes(node.shape) }
function canSlope (node) { return !!node && SLOPE_SHAPES.includes(node.shape) }
function shapeShort (node) { return SHAPE_LABELS_SHORT[(node && node.shape) || 'bell'] || 'PEAK' }

function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); activeIndex.value = 0; shapeOpen.value = -1; commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function setAt (index, key, value) {
  const node = nodes.value[index]
  if (!node) return
  node[key] = value
  activeIndex.value = index
  commit()
}

function setShapeAt (index, shape) {
  const node = nodes.value[index]
  if (!node) return
  node.shape = shape
  if (canSlope(node) && !node.slope) node.slope = 12
  shapeOpen.value = -1
  activeIndex.value = index
  commit()
}

function toggleEnableAt (index) {
  const node = nodes.value[index]
  if (!node) return
  node.enabled = node.enabled === false
  activeIndex.value = index
  commit()
}

function soloAt (index) {
  const node = nodes.value[index]
  if (!node) return
  const next = !node.solo
  nodes.value.forEach((item) => { item.solo = false })
  node.solo = next
  activeIndex.value = index
  commit()
}

function removeAt (index) {
  if (!nodes.value[index]) return
  nodes.value.splice(index, 1)
  if (activeIndex.value >= nodes.value.length) activeIndex.value = Math.max(0, nodes.value.length - 1)
  shapeOpen.value = -1
  commit()
}

function addNodeAtCenter () {
  if (nodes.value.length >= 7) {
    showToast('Equalizer X allows 7 nodes')
    return
  }
  nodes.value.push(createEmptyNode(1000, 0))
  activeIndex.value = nodes.value.length - 1
  commit()
}

function draw () {
  const prepared = prepareCanvas(canvas, 960, 420)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  drawSpectrum(ctx, props.spectrum, w, h, DSP_THEME.eq.spec, DSP_THEME.eq.specLine)
  drawDbGrid(ctx, w, h, -DB_RANGE, DB_RANGE, DB_TICKS)
  drawFreqGrid(ctx, w, h)

  const list = nodes.value

  // Ghost curve per band so every card's contribution stays readable at a glance.
  if (list.length > 1) {
    ctx.lineWidth = 1
    list.forEach((node, i) => {
      if (node.enabled === false) return
      const ghost = eqCurvePoints([node], w, h)
      if (!ghost.length) return
      ctx.beginPath()
      ghost.forEach((point, k) => k ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]))
      ctx.strokeStyle = eqBandColor(i)
      ctx.globalAlpha = i === activeIndex.value ? 0.55 : 0.26
      ctx.stroke()
    })
    ctx.globalAlpha = 1
  }

  const pts = eqCurvePoints(list, w, h)
  if (pts.length) {
    ctx.beginPath()
    pts.forEach((point, i) => i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]))
    ctx.lineTo(w, h / 2)
    ctx.lineTo(0, h / 2)
    ctx.closePath()
    ctx.fillStyle = DSP_THEME.eq.fill
    ctx.fill()

    ctx.beginPath()
    pts.forEach((point, i) => i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]))
    ctx.strokeStyle = DSP_THEME.eq.accent
    ctx.lineWidth = 2
    ctx.stroke()
  }

  list.forEach((node, i) => {
    const p = nodeToCanvas(node, w, h)
    const active = i === activeIndex.value
    const off = node.enabled === false
    const color = off ? DSP_THEME.ink3 : eqBandColor(i)
    const r = active ? 10 : 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = off ? 0.4 : 1
    ctx.fill()
    ctx.globalAlpha = 1
    if (active) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.stroke()
    }
    ctx.fillStyle = '#FFFFFF'
    ctx.font = (active ? '600 ' : '500 ') + '10px Inter, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), p.x, p.y + 0.5)
  })
}

let raf = 0
let lastDraw = 0
function loop (t) {
  if (!lastDraw || t - lastDraw >= 25) {
    draw()
    lastDraw = t
  }
  raf = requestAnimationFrame(loop)
}
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
watch(() => props.insert.state, draw, { deep: true })
watch(() => nodes.value.length, (n) => {
  if (activeIndex.value >= n) activeIndex.value = Math.max(0, n - 1)
})

function localXY (e) {
  const rect = canvasRect(canvas)
  const p = e.touches ? e.touches[0] : e
  return { x: p.clientX - rect.left, y: p.clientY - rect.top, w: rect.width, h: rect.height }
}

function hitNode (x, y, w, h) {
  return nodes.value.findIndex((node) => {
    const p = nodeToCanvas(node, w, h)
    return Math.hypot(p.x - x, p.y - y) < 16
  })
}

let createGuard = 0
function onCreate (e) {
  const now = Date.now()
  if (now - createGuard < 400) return
  createGuard = now
  if (nodes.value.length >= 7) {
    showToast('Equalizer X allows 7 nodes')
    return
  }
  const { x, y, w, h } = localXY(e)
  const mapped = canvasToNode(x, y, w, h)
  nodes.value.push(createEmptyNode(mapped.freq, mapped.gain))
  activeIndex.value = nodes.value.length - 1
  commit()
}

function isTouchEvent (e) {
  return e.type === 'touchstart' || !!(e.touches && e.touches.length)
}

let lastTouchTap = 0
let lastTouchX = 0
let lastTouchY = 0

function onDown (e) {
  shapeOpen.value = -1
  const { x, y, w, h } = localXY(e)
  const idx = hitNode(x, y, w, h)
  if (idx < 0) {
    if (isTouchEvent(e)) {
      const now = Date.now()
      const sameSpot = Math.hypot(x - lastTouchX, y - lastTouchY) < 24
      if (now - lastTouchTap < 320 && sameSpot) {
        lastTouchTap = 0
        onCreate(e)
      } else {
        lastTouchTap = now
        lastTouchX = x
        lastTouchY = y
      }
    }
    return
  }
  activeIndex.value = idx
  const node = nodes.value[idx]
  const canGain = showGainFor(node)
  const move = (ev) => {
    const loc = localXY(ev)
    const mapped = canvasToNode(loc.x, loc.y, loc.w, loc.h)
    node.freq = mapped.freq
    if (canGain) node.gain = mapped.gain
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
.plug.eq-fill { flex: 1; height: 100%; min-height: 0; }
.stage {
  display: flex;
  gap: 10px;
  min-height: 0;
  flex: 1 1 auto;
}
.plug:not(.eq-fill) .stage { min-height: 170px; flex: 0 0 auto; }
.graph {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.plug:not(.eq-fill) .graph { height: 170px; }
.add-node {
  position: absolute;
  right: 8px;
  top: 8px;
  min-width: 26px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--x-line);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--x-ink-2);
  background: var(--x-panel);
  cursor: pointer;
  z-index: 2;
  box-sizing: border-box;
}
.add-node.full { font-size: 9px; color: var(--x-ink-3); }

.strip {
  display: flex;
  gap: 8px;
  padding: 2px 2px 6px;
  overflow-x: auto;
  overflow-y: visible;
  flex-shrink: 0;
  scrollbar-width: thin;
}
.card {
  flex: 0 0 auto;
  width: 194px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-top: 2px solid var(--band, var(--x-accent));
}
.card.muted { opacity: 0.52; }
.card.empty {
  width: 140px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 96px;
  border: 1px dashed var(--x-line);
  cursor: pointer;
}
.empty-lab { font-size: 9px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--x-ink-3); }
.empty-plus { font-size: 20px; color: var(--x-ink-3); }
.card-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.x-dot.num {
  font-size: 9px;
  font-weight: 600;
}
.x-dot.num.on {
  background: var(--band, var(--x-accent));
  border-color: var(--band, var(--x-accent));
}
.x-dot.kill { font-size: 13px; line-height: 1; }
.x-dot.kill:hover { color: var(--x-warn); border-color: var(--x-warn); }
.shape { position: relative; flex: 1; min-width: 0; }
.shape-btn { width: 100%; }
.shape-txt {
  font-size: 9px;
  letter-spacing: 0.08em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret { font-size: 8px; color: var(--x-ink-3); }
.shape-menu { top: 26px; left: 0; right: 0; max-height: 210px; overflow: auto; }
.card-knobs {
  display: flex;
  justify-content: space-between;
  gap: 2px;
}
.card-slope { display: flex; justify-content: center; }
.x-chip.slope { min-width: 30px; height: 20px; font-size: 8px; }
.x-chip.an,
.x-chip.os { min-width: 38px; text-transform: uppercase; }
.gap { flex: 1; }

@media (max-width: 720px) {
  .stage { min-height: 110px; max-height: 24vh; }
  .add-node { min-width: 34px; height: 34px; }
  .card { width: 210px; }
  .x-chip.slope { min-width: 36px; height: 30px; font-size: 9px; }
}
</style>
