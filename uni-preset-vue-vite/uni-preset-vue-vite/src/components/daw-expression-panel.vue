<template>
  <view class="panel" :class="{ open: session.expressionOpen }">
    <view
      class="lift"
      aria-label="Expression"
      @pointerdown="onLift"
    >
      <view class="arrow" :class="{ open: session.expressionOpen }" />
    </view>
    <view v-if="session.expressionOpen" class="body" :style="{ height: session.expressionHeight + 'px' }">
      <view class="split" @pointerdown.stop.prevent="onSplit" />
      <view class="tabs">
        <view class="tab" :class="{ on: session.expressionLane === 'expression' }" @click="setExpressionLane('expression')">Expr</view>
        <view class="tab" :class="{ on: session.expressionLane === 'dynamics' }" @click="setExpressionLane('dynamics')">Dyn</view>
        <view class="tab" :class="{ on: session.expressionLane === 'velocity' }" @click="setExpressionLane('velocity')">Vel</view>
        <view v-if="showPedal" class="tab" :class="{ on: session.expressionLane === 'sustain' }" @click="setExpressionLane('sustain')">Ped</view>
      </view>
      <view
        v-if="session.expressionLane === 'velocity'"
        class="vel"
      >
        <text class="hint">Velocity stays on the selected notes</text>
        <input
          v-if="selectedVelocity != null"
          class="range"
          type="range"
          min="1"
          max="127"
          :value="selectedVelocity"
          @input="onVelocity"
        >
      </view>
      <view
        v-else
        ref="laneEl"
        class="lane"
        @pointerdown.prevent="onLaneDown"
        @dblclick.prevent="onLaneDbl"
      >
        <canvas ref="canvasEl" class="cv" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  session,
  setExpressionOpen,
  setExpressionLane,
  setExpressionHeight,
  addClipExpressionPoint,
  moveClipExpressionPoint,
  deleteClipExpressionPoint,
  addClipSustain,
  moveClipSustain,
  deleteClipSustain,
  getSelectedClip,
  getSelectedTrack
} from '../store/session.js'
import { PPQ } from '../model/note-model.js'
import { ensureExpression, hitLanePoint, hitSustainBlock, sortLane, sortSustain, sampleLane } from '../model/expression-lane.js'
import { pedalMapped } from '../model/expression-lane.js'

const props = defineProps({
  selectedNotes: { type: Array, default: () => [] },
  pixelsPerBeat: { type: Number, default: 48 },
  scrollX: { type: Number, default: 0 }
})

const emit = defineEmits(['velocity'])

const laneEl = ref(null)
const canvasEl = ref(null)
let raf = 0
let gesture = null
let lastTap = 0

const clip = computed(() => getSelectedClip())
const track = computed(() => getSelectedTrack())
const showPedal = computed(() => pedalMapped(track.value, session.catalogue.controllers))
const selectedVelocity = computed(() => {
  const note = props.selectedNotes[0]
  return note ? note.velocity : null
})
const cc = computed(() => (session.expressionLane === 'expression' ? 11 : 1))

function onVelocity (e) {
  emit('velocity', Number(e.target.value))
}

function onLift (e) {
  const startY = e.clientY
  const open = session.expressionOpen
  const startH = session.expressionHeight
  const move = (ev) => {
    const dy = startY - ev.clientY
    if (!open && dy > 24) {
      setExpressionOpen(true)
      setExpressionHeight(Math.max(96, dy + 40))
    } else if (open) {
      setExpressionHeight(startH + dy)
      if (session.expressionHeight <= 72 && dy < -40) setExpressionOpen(false)
    }
  }
  const up = (ev) => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    if (Math.abs(ev.clientY - startY) < 10) setExpressionOpen(!session.expressionOpen)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onSplit (e) {
  const startY = e.clientY
  const startH = session.expressionHeight
  const move = (ev) => setExpressionHeight(startH + (startY - ev.clientY))
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function laneMetrics () {
  const el = laneEl.value
  if (!el) return null
  const rect = el.getBoundingClientRect()
  return { rect, w: rect.width, h: rect.height }
}

function xToBeat (x, metrics) {
  return Math.max(0, (x + props.scrollX) / Math.max(8, props.pixelsPerBeat))
}

function yToValue (y, metrics) {
  return Math.max(0, Math.min(127, Math.round(127 * (1 - y / Math.max(1, metrics.h)))))
}

function onLaneDbl (e) {
  if (!clip.value) return
  const metrics = laneMetrics()
  if (!metrics) return
  const x = e.clientX - metrics.rect.left
  const y = e.clientY - metrics.rect.top
  const t = xToBeat(x, metrics)
  if (session.expressionLane === 'sustain') {
    addClipSustain(clip.value, t * PPQ, (t + 1) * PPQ)
    return
  }
  addClipExpressionPoint(clip.value, cc.value, t, yToValue(y, metrics))
}

function onLaneDown (e) {
  if (!clip.value) return
  const metrics = laneMetrics()
  if (!metrics) return
  const x = e.clientX - metrics.rect.left
  const y = e.clientY - metrics.rect.top
  const t = xToBeat(x, metrics)
  const now = Date.now()
  const dbl = now - lastTap < 320
  lastTap = now

  if (session.expressionLane === 'sustain') {
    const tick = t * PPQ
    const hit = hitSustainBlock(ensureExpression(clip.value).cc64, tick)
    if (hit && (e.detail > 1 || dbl)) {
      deleteClipSustain(clip.value, hit.index)
      return
    }
    if (hit) {
      const block = sortSustain(clip.value.expression.cc64)[hit.index]
      gesture = { type: 'sustain', ...hit, originTick: tick, start: block.startTick, end: block.endTick }
    } else if (dbl) {
      addClipSustain(clip.value, tick, tick + PPQ)
    }
    bindGesture()
    return
  }

  const expr = ensureExpression(clip.value)
  const points = expr[session.expressionLane === 'expression' ? 'cc11' : 'cc1']
  const index = hitLanePoint(points, t, yToValue(y, metrics), 0.18, 18)
  if (index >= 0 && (e.detail > 1 || dbl)) {
    deleteClipExpressionPoint(clip.value, cc.value, index)
    return
  }
  if (index >= 0) {
    gesture = { type: 'point', index }
    startHoldDelete(index)
  } else if (dbl) {
    addClipExpressionPoint(clip.value, cc.value, t, yToValue(y, metrics))
  }
  bindGesture()
}

function startHoldDelete (index) {
  const timer = setTimeout(() => {
    if (clip.value) deleteClipExpressionPoint(clip.value, cc.value, index)
    gesture = null
  }, 520)
  gesture.hold = timer
}

function bindGesture () {
  const move = (ev) => {
    if (!gesture || !clip.value) return
    if (gesture.hold) {
      clearTimeout(gesture.hold)
      gesture.hold = 0
    }
    const metrics = laneMetrics()
    if (!metrics) return
    const x = ev.clientX - metrics.rect.left
    const y = ev.clientY - metrics.rect.top
    const t = xToBeat(x, metrics)
    if (gesture.type === 'point') {
      moveClipExpressionPoint(clip.value, cc.value, gesture.index, t, yToValue(y, metrics))
    } else if (gesture.type === 'sustain') {
      const tick = t * PPQ
      const delta = tick - gesture.originTick
      if (gesture.edge === 'start') moveClipSustain(clip.value, gesture.index, gesture.start + delta, gesture.end)
      else if (gesture.edge === 'end') moveClipSustain(clip.value, gesture.index, gesture.start, gesture.end + delta)
      else moveClipSustain(clip.value, gesture.index, gesture.start + delta, gesture.end + delta)
    }
  }
  const up = () => {
    if (gesture && gesture.hold) clearTimeout(gesture.hold)
    gesture = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function draw () {
  raf = requestAnimationFrame(draw)
  const canvas = canvasEl.value
  const host = laneEl.value
  if (!canvas || !host || !session.expressionOpen) return
  const w = host.clientWidth
  const h = host.clientHeight
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = w + 'px'
    canvas.style.height = h + 'px'
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, w, h)
  if (!clip.value) return
  const expr = ensureExpression(clip.value)
  const ppb = Math.max(8, props.pixelsPerBeat)
  const beatToX = (beat) => beat * ppb - props.scrollX
  if (session.expressionLane === 'sustain') {
    ctx.fillStyle = 'rgba(77,163,255,0.28)'
    sortSustain(expr.cc64).forEach((b) => {
      const x = beatToX(b.startTick / PPQ)
      const rw = Math.max(4, (b.endTick - b.startTick) / PPQ * ppb)
      ctx.fillRect(x, 8, rw, h - 16)
    })
    return
  }
  const points = sortLane(expr[session.expressionLane === 'expression' ? 'cc11' : 'cc1'])
  ctx.strokeStyle = '#4da3ff'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  const beats = w / ppb + props.scrollX / ppb + 1
  for (let i = 0; i <= beats * 8; i++) {
    const t = props.scrollX / ppb + i / 8
    const x = beatToX(t)
    const v = sampleLane(points, t)
    const y = (1 - v / 127) * (h - 8) + 4
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  points.forEach((p) => {
    const x = beatToX(p.t)
    const y = (1 - p.v / 127) * (h - 8) + 4
    ctx.fillStyle = '#e6e6e6'
    ctx.beginPath()
    ctx.arc(x, y, 5, 0, Math.PI * 2)
    ctx.fill()
  })
}

onMounted(() => { raf = requestAnimationFrame(draw) })
onUnmounted(() => cancelAnimationFrame(raf))
watch(() => session.expressionOpen, () => nextTick())
</script>

<style scoped>
.panel {
  flex-shrink: 0;
  background: #121212;
  border-top: 1px solid #2a2a2a;
}
.lift {
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.arrow {
  width: 12px;
  height: 12px;
  border-left: 2px solid #8d8d8d;
  border-top: 2px solid #8d8d8d;
  transform: rotate(45deg);
  margin-top: 4px;
}
.arrow.open { transform: rotate(225deg); margin-top: -2px; }
.body {
  display: flex;
  flex-direction: column;
  min-height: 72px;
  position: relative;
}
.split {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 10px;
  cursor: ns-resize;
  z-index: 2;
}
.tabs {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}
.tab {
  min-width: 44px;
  height: 26px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #161616;
  color: #8d8d8d;
  border-radius: 6px;
  font-size: 11px;
}
.tab.on { background: #2b2b2b; color: #e6e6e6; }
.lane, .vel { flex: 1; min-height: 0; position: relative; }
.cv { position: absolute; inset: 0; width: 100%; height: 100%; }
.hint { color: #6a6a6a; font-size: 11px; padding: 8px; }
.range { width: calc(100% - 16px); margin: 0 8px; }
</style>
