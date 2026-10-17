<template>
  <view ref="well" class="well">
    <dsp-canvas ref="canvas" fill @pointerdown="begin" />
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import DspCanvas from './dsp-canvas.vue'
import { canvasRect, prepareCanvas, observeCanvasResize } from './canvas-util.js'
import { visualFrameMs } from './dsp-theme.js'
import {
  eqResponse, eqHandles, shelfResponse, filterResponse, splitFilterResponse,
  distortionShape, delayBars, chorusBars, phaserNotches, flangerResponse,
  compressorCols, guideSegments, freqX, dbY, rateHz
} from '../../dsp/vital-lite/face-draw.js'
import { midiToHz } from '../../dsp/vital-lite/params.js'

const props = defineProps({
  pluginId: { type: String, required: true },
  state: { type: Object, required: true },
  mode: { type: String, default: 'main' },
  band: { type: String, default: 'low' },
  spectrum: { type: Array, default: () => [] }
})
const emit = defineEmits(['set'])
const canvas = ref(null)
const well = ref(null)
let stopResize = () => {}
let raf = 0
let phase = 0
let lastTs = 0
let lastDraw = 0

function scene (ph) {
  const s = props.state || {}
  const id = props.pluginId
  if (id === 'equalizer-lite') return { ...eqResponse(s), guides: true, handles: eqHandles(s), spectrum: true }
  if (id === 'reverb-lite') {
    return {
      ...shelfResponse(s),
      guides: true,
      spectrum: true,
      handles: [
        { id: 'low', x: freqX(midiToHz(s.lowShelfMidi)), y: dbY(Number(s.lowShelfDb) || 0, -24, 18) },
        { id: 'high', x: freqX(midiToHz(s.highShelfMidi)), y: dbY(Number(s.highShelfDb) || 0, -24, 18) }
      ]
    }
  }
  if (id === 'filter-lite') {
    const pic = filterResponse(s)
    return { ...pic, guides: true, spectrum: true, handles: pic.handle ? [pic.handle] : [] }
  }
  if (id === 'distortion-lite' && props.mode === 'shape') return { ...distortionShape(s), zero: true, shape: true }
  if (id === 'distortion-lite') {
    const off = s.filterOrder === 'off'
    const pic = filterResponse(s)
    return { ...pic, guides: true, spectrum: !off, dim: off, handles: off || !pic.handle ? [] : [pic.handle] }
  }
  if ((id === 'delay-lite' || id === 'chorus-lite') && props.mode === 'filter') {
    const pic = splitFilterResponse(s)
    return { ...pic, guides: true, spectrum: true, handles: pic.handle ? [pic.handle] : [] }
  }
  if (id === 'delay-lite') return { bars: delayBars(s), meter: true, zero: true }
  if (id === 'chorus-lite') return { bars: chorusBars(s, ph), meter: true, animate: true }
  if (id === 'flanger-lite') return { ...flangerResponse(s, ph), guides: true, spectrum: true, animate: true }
  if (id === 'phaser-lite') return { ...phaserNotches(s, ph), guides: true, spectrum: true, animate: true }
  if (id === 'compressor-lite') return { bars: compressorCols(s), zero: true, thresholds: true, bands: true }
  return {}
}

function ink () {
  const host = well.value
  const el = host && host.$el ? host.$el : host
  if (el && el.nodeType === 1 && typeof getComputedStyle === 'function') {
    const color = getComputedStyle(el).color
    if (color) return color
  }
  return '#d5dee6'
}

function peakOf (spec) {
  if (!spec || !spec.length) return 0
  let m = 0
  for (let i = 0; i < spec.length; i++) m = Math.max(m, spec[i] || 0)
  return m
}

function bandPeak (spec, index) {
  if (!spec || spec.length < 3) return 0
  const n = spec.length
  const a = Math.floor(index * n / 3)
  const b = Math.max(a + 1, Math.floor((index + 1) * n / 3))
  let m = 0
  for (let i = a; i < b && i < n; i++) m = Math.max(m, spec[i] || 0)
  return m
}

function draw () {
  const prepared = prepareCanvas(canvas, 640, 168)
  if (!prepared) return
  const { ctx, w, h } = prepared
  const pic = scene(phase)
  const sx = (x) => x / 200 * w
  const sy = (y) => y / 100 * h
  const color = ink()
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = '#141c28'
  ctx.fillRect(0, 0, w, h)
  ctx.globalAlpha = pic.dim ? 0.35 : 1

  if (pic.guides) {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'
    ctx.lineWidth = 1
    ctx.beginPath()
    guideSegments().forEach((seg) => {
      ctx.moveTo(sx(seg.x1), sy(seg.y1))
      ctx.lineTo(sx(seg.x2), sy(seg.y2))
    })
    ctx.stroke()
  }

  const spec = props.spectrum
  if (pic.spectrum && spec && spec.length > 1) {
    const n = spec.length
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const x = sx(6 + (i / (n - 1)) * 188)
      const y = sy(94 - Math.max(0, Math.min(1, spec[i] || 0)) * 70)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.lineTo(sx(194), sy(96))
    ctx.lineTo(sx(6), sy(96))
    ctx.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.fill()
    ctx.beginPath()
    for (let i = 0; i < n; i++) {
      const x = sx(6 + (i / (n - 1)) * 188)
      const y = sy(94 - Math.max(0, Math.min(1, spec[i] || 0)) * 70)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  if (pic.zero) {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(sx(8), sy(50))
    ctx.lineTo(sx(192), sy(50))
    ctx.stroke()
  }

  function strokePoints (pts, alpha, width) {
    if (!pts || pts.length < 2) return
    ctx.beginPath()
    pts.forEach((p, i) => {
      const x = sx(p.x)
      const y = sy(p.y)
      if (i) ctx.lineTo(x, y)
      else ctx.moveTo(x, y)
    })
    ctx.strokeStyle = color
    ctx.globalAlpha = (pic.dim ? 0.35 : 1) * alpha
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.globalAlpha = pic.dim ? 0.35 : 1
  }

  if (pic.points && pic.points.length) {
    const pts = pic.points
    const bottom = pic.shape ? 50 : 96
    ctx.beginPath()
    pts.forEach((p, i) => {
      if (i) ctx.lineTo(sx(p.x), sy(p.y))
      else ctx.moveTo(sx(p.x), sy(p.y))
    })
    ctx.lineTo(sx(pts[pts.length - 1].x), sy(bottom))
    ctx.lineTo(sx(pts[0].x), sy(bottom))
    ctx.closePath()
    ctx.fillStyle = color
    ctx.globalAlpha = pic.dim ? 0.08 : 0.16
    ctx.fill()
    ctx.globalAlpha = pic.dim ? 0.35 : 1
    strokePoints(pts, 1, 1.6)
    strokePoints(pic.points2, 0.55, 1.2)
  }

  const bars = pic.bars || []
  bars.forEach((bar, i) => {
    const alpha = bar.cls === 'off' ? 0.22 : (bar.cls === 'b2' ? 0.72 : 1)
    ctx.globalAlpha = (pic.dim ? 0.35 : 1) * alpha
    ctx.fillStyle = bar.cls === 'off' ? 'rgba(255,255,255,0.35)' : color
    ctx.fillRect(sx(bar.x), sy(bar.y), Math.max(1.5, sx(bar.w)), Math.max(1.5, sy(bar.h) - sy(0)))
    if (pic.bands && bar.cls !== 'off') {
      const level = bandPeak(spec, i)
      if (level > 0.01) {
        const top = sy(94 - level * 78)
        ctx.globalAlpha = 0.85
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.fillRect(sx(bar.x + bar.w - 3.2), top, Math.max(1.5, sx(2.4)), Math.max(1, sy(94) - top))
      }
    }
    if (pic.thresholds && bar.ty != null) {
      ctx.globalAlpha = bar.cls === 'off' ? 0.25 : 0.9
      ctx.strokeStyle = color
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(sx(bar.x - 2), sy(bar.ty))
      ctx.lineTo(sx(bar.x + bar.w + 2), sy(bar.ty))
      ctx.stroke()
    }
  })
  ctx.globalAlpha = 1

  const handles = pic.handles || []
  handles.forEach((handle) => {
    const active = !handle.id || handle.id === props.band
    ctx.beginPath()
    ctx.arc(sx(handle.x), sy(handle.y), active ? 5.5 : 3.5, 0, Math.PI * 2)
    ctx.fillStyle = active ? color : '#141c28'
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = color
    ctx.stroke()
  })

  if (pic.shape) {
    const level = peakOf(spec)
    if (level > 0.02) {
      const x = sx(100 + (level * 2 - 1) * 86)
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, sy(8))
      ctx.lineTo(x, sy(92))
      ctx.stroke()
    }
  }

  if (pic.meter) {
    const level = peakOf(spec)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.85
    ctx.fillRect(sx(4), sy(94 - level * 80), Math.max(2, sx(2.2)), Math.max(1, sy(level * 80)))
    ctx.globalAlpha = 1
  }
}

function animated () {
  const id = props.pluginId
  if (id === 'flanger-lite' || id === 'phaser-lite') return true
  return id === 'chorus-lite' && props.mode !== 'filter'
}

function frame (ts) {
  const budget = visualFrameMs()
  const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0
  lastTs = ts
  if (animated()) {
    phase += dt * rateHz(props.state)
  }
  if (ts - lastDraw >= budget) {
    lastDraw = ts
    draw()
  }
  raf = requestAnimationFrame(frame)
}

function freqToMidi (px) {
  const t = Math.min(1, Math.max(0, (px * 200 - 6) / 188))
  const hz = 20 * Math.pow(1000, t)
  return Math.min(136, Math.max(8, 69 + 12 * Math.log2(hz / 440)))
}

function plotDb (py) {
  const t = (94 - py * 100) / 84
  return -24 + Math.min(1, Math.max(0, t)) * 42
}

function tweak (px, py) {
  const id = props.pluginId
  const yGain = (lo, hi) => hi - py * (hi - lo)
  if (id === 'distortion-lite' && props.mode === 'filter' && props.state.filterOrder === 'off') return
  if (id === 'filter-lite') {
    emit('set', 'cutoffMidi', freqToMidi(px))
    emit('set', 'resonance', Math.min(1, Math.max(0, 1 - py)))
    return
  }
  if (id === 'equalizer-lite') {
    const band = props.band || 'low'
    emit('set', band + 'Midi', freqToMidi(px))
    const mode = props.state[band + 'Mode']
    const gainless = mode === 'highpass' || mode === 'notch' || mode === 'lowpass'
    if (gainless) emit('set', band + 'Res', Math.min(1, Math.max(0, 1 - py)))
    else emit('set', band + 'GainDb', Math.min(15, Math.max(-15, plotDb(py))))
    return
  }
  if (id === 'reverb-lite') {
    const key = props.band === 'high' ? 'high' : 'low'
    emit('set', key + 'ShelfMidi', freqToMidi(px))
    emit('set', key + 'ShelfDb', Math.min(0, Math.max(-6, plotDb(py))))
    return
  }
  if (id === 'distortion-lite' && props.mode === 'shape') {
    emit('set', 'drive', yGain(-30, 30))
    return
  }
  if (id === 'distortion-lite' || ((id === 'delay-lite' || id === 'chorus-lite') && props.mode === 'filter')) {
    emit('set', 'cutoffMidi', freqToMidi(px))
    if (id === 'distortion-lite') emit('set', 'resonance', Math.min(1, Math.max(0, 1 - py)))
    else emit('set', 'spread', Math.min(1, Math.max(0, 1 - py)))
    return
  }
  if (id === 'delay-lite') {
    emit('set', 'feedback', Math.min(1, Math.max(-1, (0.5 - py) * 2)))
    return
  }
  if (id === 'chorus-lite') {
    const t = Math.min(1, Math.max(0, px))
    const delay = 0.00097 * Math.pow(0.02 / 0.00097, t)
    emit('set', px < 0.5 ? 'delay1' : 'delay2', delay)
    emit('set', 'modDepth', Math.min(1, Math.max(0, 1 - py)))
    return
  }
  if (id === 'compressor-lite') {
    const names = ['lowUpperDb', 'bandUpperDb', 'highUpperDb']
    const i = Math.min(2, Math.max(0, Math.floor(px * 3)))
    emit('set', names[i], Math.min(0, Math.max(-80, -80 * py)))
    return
  }
  if (id === 'flanger-lite') {
    emit('set', 'centerMidi', freqToMidi(px))
    emit('set', 'modDepth', Math.min(1, Math.max(0, 1 - py)))
    return
  }
  if (id === 'phaser-lite') {
    emit('set', 'centerMidi', freqToMidi(px))
    emit('set', 'modDepth', Math.min(48, Math.max(0, (1 - py) * 48)))
  }
}

function begin (e) {
  if (e && e.button != null && e.button !== 0 && !e.touches) return
  const apply = (ev) => {
    const point = ev.touches && ev.touches[0] ? ev.touches[0] : ev
    if (!point || point.clientX == null) return
    const rect = canvasRect(canvas)
    const px = (point.clientX - rect.left) / Math.max(1, rect.width)
    const py = (point.clientY - rect.top) / Math.max(1, rect.height)
    tweak(Math.min(1, Math.max(0, px)), Math.min(1, Math.max(0, py)))
  }
  apply(e)
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    apply(ev)
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
    window.removeEventListener('pointercancel', end)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
  window.addEventListener('pointercancel', end)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', end)
}

onMounted(() => {
  stopResize = observeCanvasResize(canvas, draw)
  raf = requestAnimationFrame(frame)
})

onUnmounted(() => {
  stopResize()
  if (raf) cancelAnimationFrame(raf)
})
</script>

<style scoped>
.well {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 8px;
  background: #141c28;
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
  color: var(--vital-accent, #d5dee6);
}
</style>
