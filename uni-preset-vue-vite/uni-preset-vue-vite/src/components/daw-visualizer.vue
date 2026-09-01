<template>
  <view class="viz" :class="{ on: session.playing }">
    <view
      v-for="(height, index) in bars"
      :key="index"
      class="bar"
      :style="{ height: height + '%' }"
    />
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { session, getFxAnalyser } from '../store/session.js'
import { readSpectrum } from '../dsp/runtime.js'

const bars = ref(new Array(16).fill(8))
let raf = 0

function tick (now) {
  raf = 0
  const analyser = getFxAnalyser('master')
  if (analyser) {
    const spectrum = readSpectrum(analyser, 16)
    bars.value = spectrum.map((value) => Math.max(6, Math.round(value * 100)))
  } else {
    const master = session.tracks[0]
    const level = (master && master.meterLevel) || 0
    const t = (now || 0) * 0.001
    bars.value = bars.value.map((_, index) => {
      const wave = 0.5 + 0.5 * Math.sin(t * (2.3 + index * 0.33) + index)
      const amount = session.playing ? 0.14 + level * (0.4 + 0.5 * wave) : 0.08 + level * 0.28
      return Math.max(6, Math.round(amount * 100))
    })
  }
  if (session.playing) raf = requestAnimationFrame(tick)
}

onMounted(() => { raf = requestAnimationFrame(tick) })
onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
})
watch(() => session.playing, (on) => {
  if (on) {
    if (!raf) raf = requestAnimationFrame(tick)
  } else {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    tick()
  }
})
</script>

<style scoped>
.viz {
  width: 88px;
  height: 28px;
  background: #0e0e0e;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  padding: 2px 3px;
  box-sizing: border-box;
  flex-shrink: 0;
}
.bar {
  flex: 1;
  min-height: 2px;
  background: #56a35c;
  border-radius: 1px;
  transition: height 80ms linear;
}
.viz.on .bar { background: linear-gradient(#d24b4b, #d0b04a, #56a35c); }
</style>
