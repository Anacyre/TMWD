<template>
  <view class="well" @pointerdown.stop.prevent="begin">
    <svg class="svg" viewBox="0 0 200 100" preserveAspectRatio="none">
      <path v-for="(d, i) in guidePaths" :key="'g' + i" :d="d" class="guide" />
      <path v-if="fill" :d="fill" class="fill" />
      <path v-if="line" :d="line" class="line" />
      <path v-if="line2" :d="line2" class="line2" />
      <line v-if="zero" x1="8" x2="192" y1="50" y2="50" class="zero" />
      <rect
        v-for="(bar, i) in bars"
        :key="'b' + i"
        :x="bar.x"
        :y="bar.y"
        :width="bar.w"
        :height="bar.h"
        :class="bar.cls"
        rx="1"
      />
    </svg>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import {
  eqResponse, shelfResponse, filterResponse, distortionShape,
  delayBars, chorusBars, lfoPath, phaserNotches, compressorCols, guides
} from '../../dsp/vital-lite/face-draw.js'

const props = defineProps({
  pluginId: { type: String, required: true },
  state: { type: Object, required: true },
  mode: { type: String, default: 'main' },
  band: { type: String, default: 'low' }
})
const emit = defineEmits(['set'])

const picture = computed(() => {
  const s = props.state || {}
  const id = props.pluginId
  if (id === 'equalizer-lite') return { ...eqResponse(s), guides: true }
  if (id === 'reverb-lite') return { ...shelfResponse(s), guides: true }
  if (id === 'filter-lite') return { ...filterResponse(s), guides: true }
  if (id === 'distortion-lite' && props.mode === 'shape') return { ...distortionShape(s), zero: true }
  if (id === 'distortion-lite') return { ...filterResponse(s), guides: true }
  if (id === 'delay-lite' && props.mode === 'filter') {
    return {
      ...filterResponse({ cutoffMidi: s.cutoffMidi, resonance: 0.15 + (s.spread || 0) * 0.5, blend: 0, style: '12dB' }),
      guides: true
    }
  }
  if (id === 'delay-lite') return { bars: delayBars(s) }
  if (id === 'chorus-lite' && props.mode === 'filter') {
    return {
      ...filterResponse({ cutoffMidi: s.cutoffMidi, resonance: 0.2 + (s.spread || 0) * 0.6, blend: 0, style: '12dB' }),
      guides: true
    }
  }
  if (id === 'chorus-lite') return { bars: chorusBars(s) }
  if (id === 'flanger-lite') {
    return { line: lfoPath(s.modDepth, 0), line2: lfoPath(s.modDepth, (s.phaseOffset || 0) * Math.PI * 2) }
  }
  if (id === 'phaser-lite') return { ...phaserNotches(s), guides: true }
  if (id === 'compressor-lite') return { bars: compressorCols(s), zero: true }
  return {}
})

const line = computed(() => picture.value.line || '')
const line2 = computed(() => picture.value.line2 || '')
const fill = computed(() => picture.value.fill || '')
const bars = computed(() => picture.value.bars || [])
const zero = computed(() => !!picture.value.zero)
const guidePaths = computed(() => picture.value.guides ? guides() : [])

function freqToMidi (px) {
  const t = Math.min(1, Math.max(0, (px * 200 - 6) / 188))
  const hz = 20 * Math.pow(1000, t)
  return Math.min(136, Math.max(8, 69 + 12 * Math.log2(hz / 440)))
}

function begin (e) {
  const el = e.currentTarget
  const apply = (ev) => {
    const point = ev.touches ? ev.touches[0] : ev
    const rect = el.getBoundingClientRect()
    const px = (point.clientX - rect.left) / Math.max(1, rect.width)
    const py = (point.clientY - rect.top) / Math.max(1, rect.height)
    tweak(px, py)
  }
  apply(e)
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    apply(ev)
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}

function plotDb (py) {
  const t = (94 - py * 100) / 84
  return -24 + Math.min(1, Math.max(0, t)) * 42
}

function tweak (px, py) {
  const id = props.pluginId
  const yGain = (lo, hi) => hi - py * (hi - lo)
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
  if (id === 'distortion-lite' || (id === 'delay-lite' && props.mode === 'filter') || (id === 'chorus-lite' && props.mode === 'filter')) {
    emit('set', 'cutoffMidi', freqToMidi(px))
    if (id === 'distortion-lite') emit('set', 'resonance', Math.min(1, Math.max(0, 1 - py)))
    else emit('set', 'spread', Math.min(1, Math.max(0, 1 - py)))
    return
  }
  if (id === 'delay-lite') emit('set', 'feedback', Math.min(1, Math.max(-1, (0.5 - py) * 2)))
}
</script>

<style scoped>
.well {
  position: relative;
  min-height: 96px;
  height: 100%;
  border-radius: 8px;
  background: #0c0e11;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
}
.svg { width: 100%; height: 100%; display: block; }
.guide { fill: none; stroke: rgba(255, 255, 255, 0.06); stroke-width: 0.4; }
.line { fill: none; stroke: #e8eef2; stroke-width: 1.4; }
.line2 { fill: none; stroke: #7fd0c4; stroke-width: 1.2; opacity: 0.85; }
.fill { fill: rgba(127, 208, 196, 0.16); stroke: none; }
.zero { stroke: rgba(255, 255, 255, 0.16); stroke-width: 0.4; }
.b1 { fill: rgba(232, 238, 242, 0.88); }
.b2 { fill: rgba(127, 208, 196, 0.9); }
.off { fill: rgba(255, 255, 255, 0.16); }
</style>
