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

    <view class="stage x-panel">
      <view class="graph-wrap">
        <dsp-canvas
          ref="canvas"
          :fill="!embedded"
          :height="embedded ? 180 : 248"
          @pointerdown="onDown"
          @dblclick="onCreate"
        />
        <view class="add-node" :class="{ full: state.nodes.length >= 7 }" @click="addNodeAtCenter">
          {{ state.nodes.length >= 7 ? '7 / 7' : '+' }}
        </view>
      </view>
      <dsp-meter
        fill
        :stereo="false"
        :level="outLevel"
        label="Out"
        show-gain
        :gain="state.outputGainDb"
        :gain-min="-24"
        :gain-max="24"
        :gain-default="0"
        @update:gain="setOutDb"
      />
    </view>

    <view
      class="band"
      :class="{ empty: !selected }"
      :style="selected ? { '--band': eqBandColor(selectedIndex) } : null"
    >
      <template v-if="selected">
        <view class="band-head">
          <view class="pills">
            <view
              v-for="(node, i) in state.nodes"
              :key="'n' + i"
              class="pill"
              :class="{ on: i === selectedIndex, off: node.enabled === false }"
              :style="{ '--band': eqBandColor(i) }"
              @click="select(i)"
            >{{ i + 1 }}</view>
          </view>
          <view class="dot" :class="{ off: !selected.enabled }" @click.stop="toggleEnableAt(selectedIndex)">
            {{ selected.enabled === false ? 'Off' : 'On' }}
          </view>
          <view class="shape" :class="{ 'ctrl-off': selected.enabled === false }" @click.stop>
            <view class="shape-btn" @click="shapeOpen = !shapeOpen">
              <text>{{ shapeName(selected) }}</text>
              <text class="caret">▾</text>
            </view>
            <view v-if="shapeOpen" class="shape-drop">
              <view
                v-for="shape in shapes"
                :key="shape"
                class="shape-item"
                :class="{ on: selected.shape === shape }"
                @click="setShape(shape)"
              >{{ shapeLabel(shape) }}</view>
            </view>
          </view>
          <view class="solo" :class="{ on: selected.solo }" @click.stop="soloAt(selectedIndex)">S</view>
        </view>
        <view class="controls" :class="{ 'ctrl-off': selected.enabled === false, 'ctrl-lock': selected.enabled === false }">
          <view class="knobs x-knobs">
            <dsp-knob
              :size="embedded ? 'md' : 'lg'"
              :accent="eqBandColor(selectedIndex)"
              :model-value="showGainFor(selected) ? selected.gain : 0"
              :min="-18" :max="18" :default-value="0"
              label="Gain"
              :format="(v) => fmtDb(v)"
              :disabled="!showGainFor(selected)"
              @update:model-value="setGainAt(selectedIndex, $event)"
            />
            <dsp-knob
              :size="embedded ? 'md' : 'lg'"
              :accent="eqBandColor(selectedIndex)"
              :model-value="selected.freq"
              :min="20" :max="20000" :default-value="1000"
              scale="log"
              label="Freq"
              :format="(v) => fmtHz(v)"
              @update:model-value="setFreqAt(selectedIndex, $event)"
            />
            <dsp-knob
              :size="embedded ? 'md' : 'lg'"
              :accent="eqBandColor(selectedIndex)"
              :model-value="selected.q"
              :min="0.2" :max="12" :default-value="0.9"
              scale="log"
              label="Q"
              :format="(v) => v.toFixed(2)"
              :disabled="!showQFor(selected)"
              @update:model-value="setQAt(selectedIndex, $event)"
            />
          </view>
          <view v-if="canSlope" class="slope">
            <text class="dsp-lab">Slope</text>
            <view class="x-seg">
              <view
                v-for="step in slopeSteps"
                :key="step"
                class="x-chip"
                :class="{ on: (selected.slope || 12) === step }"
                @click="setSlope(step)"
              >{{ step }}</view>
            </view>
          </view>
        </view>
      </template>
      <template v-else>
        <text class="empty-lab">No band selected</text>
        <text class="empty-plus" @click="addNodeAtCenter">+</text>
      </template>
    </view>

    <view class="x-footer">
      <text class="dsp-lab">{{ analyzerOn ? '● Analyzer' : 'Analyzer' }}</text>
      <view class="gap" />
      <view class="x-chip" :class="{ on: state.autoGain }" @click="toggleAuto">{{ state.autoGain ? 'Auto Gain ON' : 'Auto Gain OFF' }}</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, EQ_SHAPES, applyPreset, resetInsert, createEmptyNode } from '../../dsp/registry.js'
import { eqCurvePoints, nodeToCanvas, canvasToNode } from '../../dsp/eq-curve.js'
import { showToast } from '../../store/session.js'
import { canvasRect, prepareCanvas } from './canvas-util.js'
import {
  DSP_THEME, fmtHz, fmtDb, SHAPE_LABELS,
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
const selectedIndex = ref(0)
const shapeOpen = ref(false)
const slopeSteps = [6, 12, 24, 48]
const shapes = EQ_SHAPES
const state = computed(() => props.insert.state)
const presets = computed(() => plugins['equalizer-x'].presets)
const selected = computed(() => state.value.nodes[selectedIndex.value] || null)
const canSlope = computed(() => selected.value && ['lowcut', 'highcut', 'lowshelf', 'highshelf'].includes(selected.value.shape))
const analyzerOn = computed(() => (props.spectrum || []).some((v) => v > 0.03))
const outLevel = computed(() => props.meters && props.meters.outPeak != null ? props.meters.outPeak : 0)

function showGainFor (node) { return node && !['lowcut', 'highcut', 'notch', 'bandpass'].includes(node.shape) }
function showQFor (node) { return node && ['bell', 'notch', 'bandpass'].includes(node.shape) }
function shapeName (node) { return SHAPE_LABELS[(node && node.shape) || 'bell'] || 'Peak' }
function shapeLabel (shape) { return SHAPE_LABELS[shape] || shape }
function select (index) { selectedIndex.value = index; shapeOpen.value = false }

let raf = 0
function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); selectedIndex.value = 0; shapeOpen.value = false; commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }

function draw () {
  const prepared = prepareCanvas(canvas, 960, 420)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#0B0E14'
  ctx.fillRect(0, 0, w, h)
  drawSpectrum(ctx, props.spectrum, w, h, DSP_THEME.eq.spec)
  drawDbGrid(ctx, w, h, -18, 18, [12, 6, 0, -6, -12])
  drawFreqGrid(ctx, w, h)

  const pts = eqCurvePoints(state.value.nodes, w, h)
  if (pts.length) {
    const grad = ctx.createLinearGradient(0, 0, w, 0)
    grad.addColorStop(0, DSP_THEME.eq.accent)
    grad.addColorStop(0.5, DSP_THEME.eq.accent2)
    grad.addColorStop(1, DSP_THEME.eq.accent)
    ctx.beginPath()
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
    ctx.lineTo(w, h / 2)
    ctx.lineTo(0, h / 2)
    ctx.closePath()
    ctx.fillStyle = DSP_THEME.eq.fill
    ctx.fill()
    ctx.beginPath()
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))
    ctx.lineWidth = 2
    ctx.strokeStyle = grad
    ctx.shadowColor = DSP_THEME.eq.accent
    ctx.shadowBlur = 10
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.stroke()
  }

  state.value.nodes.forEach((node, i) => {
    const p = nodeToCanvas(node, w, h)
    const active = i === selectedIndex.value
    const color = node.enabled === false ? '#4A5160' : eqBandColor(i)
    const r = active ? 11 : 9
    ctx.save()
    ctx.shadowColor = color
    ctx.shadowBlur = active ? 14 : 8
    ctx.beginPath()
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fillStyle = '#0B0E14'
    ctx.fill()
    ctx.lineWidth = active ? 2 : 1.5
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.restore()
    ctx.fillStyle = node.enabled === false ? '#6B7380' : '#F4F6FA'
    ctx.font = (active ? '700 ' : '500 ') + '10px Inter, Segoe UI, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(i + 1), p.x, p.y + 0.5)
  })
}

function loop () { draw(); raf = requestAnimationFrame(loop) }
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
watch(() => props.insert.state, draw, { deep: true })
watch(() => selectedIndex.value, draw)
watch(() => (state.value.nodes || []).length, (n) => {
  if (selectedIndex.value >= n) selectedIndex.value = Math.max(0, n - 1)
})

function localXY (e) {
  const rect = canvasRect(canvas)
  const p = e.touches ? e.touches[0] : e
  return { x: p.clientX - rect.left, y: p.clientY - rect.top, w: rect.width, h: rect.height }
}

function hitNode (x, y, w, h) {
  return state.value.nodes.findIndex((node) => {
    const p = nodeToCanvas(node, w, h)
    return Math.hypot(p.x - x, p.y - y) < 16
  })
}

let createGuard = 0

function onCreate (e) {
  const now = Date.now()
  if (now - createGuard < 400) return
  createGuard = now
  if (state.value.nodes.length >= 7) {
    showToast('Equalizer X allows 7 nodes')
    return
  }
  const { x, y, w, h } = localXY(e)
  const mapped = canvasToNode(x, y, w, h)
  state.value.nodes.push(createEmptyNode(mapped.freq, mapped.gain))
  selectedIndex.value = state.value.nodes.length - 1
  commit()
}

function addNodeAtCenter () {
  if (state.value.nodes.length >= 7) {
    showToast('Equalizer X allows 7 nodes')
    return
  }
  state.value.nodes.push(createEmptyNode(1000, 0))
  selectedIndex.value = state.value.nodes.length - 1
  commit()
}

function isTouchEvent (e) {
  return e.type === 'touchstart' || !!(e.touches && e.touches.length)
}

let lastTouchTap = 0
let lastTouchX = 0
let lastTouchY = 0

function onDown (e) {
  shapeOpen.value = false
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
  selectedIndex.value = idx
  const node = state.value.nodes[idx]
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

function toggleEnableAt (index) {
  const node = state.value.nodes[index]
  if (!node) return
  node.enabled = !node.enabled
  selectedIndex.value = index
  commit()
}
function soloAt (index) {
  const node = state.value.nodes[index]
  if (!node) return
  const next = !node.solo
  state.value.nodes.forEach((n) => { n.solo = false })
  node.solo = next
  selectedIndex.value = index
  commit()
}
function setGainAt (index, v) {
  const node = state.value.nodes[index]
  if (!node) return
  node.gain = v
  selectedIndex.value = index
  commit()
}
function setFreqAt (index, v) {
  const node = state.value.nodes[index]
  if (!node) return
  node.freq = v
  selectedIndex.value = index
  commit()
}
function setQAt (index, v) {
  const node = state.value.nodes[index]
  if (!node) return
  node.q = v
  selectedIndex.value = index
  commit()
}
function setShape (shape) {
  if (!selected.value) return
  selected.value.shape = shape
  shapeOpen.value = false
  commit()
}
function setSlope (step) {
  if (!selected.value || !canSlope.value) return
  selected.value.slope = step
  commit()
}
function setOutDb (v) { props.insert.state.outputGainDb = v; commit() }
function toggleAuto () { props.insert.state.autoGain = !props.insert.state.autoGain; commit() }
</script>

<style scoped>
.plug { gap: 8px; }
.plug.eq-fill { flex: 1; height: 100%; min-height: 0; }
.stage {
  display: flex;
  gap: 10px;
  padding: 8px 10px 8px 8px;
  min-height: 0;
  flex: 1 1 auto;
}
.plug:not(.eq-fill) .stage { min-height: 180px; flex: 0 0 auto; }
.graph-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
}
.plug.eq-fill .graph-wrap { height: auto; }
.plug:not(.eq-fill) .graph-wrap { height: 180px; }
.add-node {
  position: absolute;
  right: 10px;
  bottom: 18px;
  min-width: 28px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsp-line);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--dsp-muted);
  background: rgba(8,10,15,0.72);
  cursor: pointer;
  z-index: 2;
}
.add-node.full { font-size: 10px; }
.band {
  flex-shrink: 0;
  min-height: 0;
  padding: 4px 2px 2px;
}
.band.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 72px;
  border: 1px dashed var(--dsp-line);
  border-radius: 8px;
  opacity: 0.7;
}
.empty-lab { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--dsp-muted); }
.empty-plus { font-size: 22px; color: var(--dsp-dim); cursor: pointer; }
.band-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pills { display: flex; gap: 4px; flex-wrap: wrap; }
.pill {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--dsp-line);
  color: var(--dsp-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
}
.pill.on { border-color: var(--band, var(--dsp-accent)); color: var(--dsp-text); box-shadow: 0 0 8px var(--dsp-glow); }
.pill.off { border-style: dashed; }
.dot {
  min-width: 36px;
  height: 22px;
  padding: 0 8px;
  border-radius: 3px;
  border: 1px solid var(--band, var(--dsp-accent));
  color: var(--dsp-text);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
}
.dot.off { border-style: dashed; color: var(--dsp-muted); }
.shape { position: relative; flex: 1; min-width: 120px; }
.shape-btn {
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--dsp-line);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  cursor: pointer;
  font-size: 11px;
  color: var(--dsp-text);
}
.caret { color: var(--dsp-muted); font-size: 9px; }
.shape-drop {
  position: absolute;
  top: 26px;
  left: 0;
  right: 0;
  background: #10131A;
  border: 1px solid var(--dsp-line);
  border-radius: 6px;
  z-index: 12;
  max-height: 220px;
  overflow: auto;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
}
.shape-item {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  font-size: 12px;
  color: var(--dsp-muted);
  cursor: pointer;
}
.shape-item:hover { background: rgba(255,255,255,0.04); color: var(--dsp-text); }
.shape-item.on { color: var(--dsp-text); }
.solo {
  width: 22px;
  height: 22px;
  border: 1px solid var(--dsp-line);
  border-radius: 3px;
  color: var(--dsp-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  cursor: pointer;
}
.solo.on { color: var(--dsp-text); border-color: var(--band, var(--dsp-accent)); box-shadow: 0 0 8px var(--dsp-glow); }
.controls { display: flex; align-items: center; gap: 16px; }
.knobs { flex: 1; justify-content: space-around; }
.slope {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 168px;
}
.gap { flex: 1; }

@media (max-width: 720px) {
  .stage { min-height: 110px; max-height: 24vh; }
  .add-node { min-width: 36px; height: 36px; }
  .pill { width: 32px; height: 32px; font-size: 12px; }
  .dot, .solo, .shape-btn { height: 36px; min-width: 36px; }
  .band-head { flex-wrap: wrap; }
  .controls { flex-direction: column; align-items: stretch; gap: 10px; }
  .slope { min-width: 0; }
}
</style>
