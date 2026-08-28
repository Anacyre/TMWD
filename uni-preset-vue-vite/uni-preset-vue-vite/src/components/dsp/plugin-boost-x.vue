<template>
  <view class="plug x-plug dsp-skin skin-boost" :class="{ 'is-off': insert.enabled === false }">
    <plugin-shell
      name="Boost X"
      :model-value="insert.state.mode"
      :items="modes"
      :enabled="insert.enabled"
      @update:model-value="onMode"
      @update:enabled="onEnabled"
      @reset="onReset"
    />

    <view class="stage">
      <view class="io x-panel in">
        <text class="iolab">Input</text>
        <view class="io-body">
          <dsp-meter :level="inLevel" :stereo="false" :show-db="true" fill :height="200" color="#C8F542" />
          <dsp-canvas ref="inCanvas" fill :height="200" />
        </view>
      </view>

      <view class="io x-panel out">
        <text class="iolab outlab">Output</text>
        <view class="io-body">
          <dsp-canvas ref="outCanvas" fill :height="200" />
          <dsp-meter :level="outLevel" :stereo="false" :show-db="true" fill :height="200" color="#A78BFA" />
        </view>
      </view>
    </view>

    <view class="knobs x-knobs knobs-one">
      <dsp-knob
        size="xl"
        dual
        :model-value="insert.state.amount"
        :min="0" :max="1" :default-value="0.35"
        label="Boost"
        :format="(v) => Math.round(v * 100) + '%'"
        @update:model-value="setAmount"
      />
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Mode</text>
      <view class="x-seg wrap">
        <view
          v-for="mode in modes"
          :key="mode.id"
          class="x-chip"
          :class="{ on: insert.state.mode === mode.id }"
          @click="onMode(mode.id)"
        >{{ mode.short }}</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, BOOST_MODES, resetInsert } from '../../dsp/registry.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME, strokeGlow } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const inCanvas = ref(null)
const outCanvas = ref(null)
const modes = [
  { id: 'ott', name: 'OTT', short: 'OTT' },
  { id: 'expander', name: 'Stereo Expander', short: 'Wide' },
  { id: 'chorus', name: 'Chorus', short: 'Chorus' },
  { id: 'distortion', name: 'Distortion', short: 'Drive' }
]
const inLevel = computed(() => (props.meters && props.meters.inPeak != null) ? props.meters.inPeak : 0)
const outLevel = computed(() => (props.meters && props.meters.outPeak != null) ? props.meters.outPeak : 0)

function commit () { emit('change', props.insert) }
function onMode (id) {
  props.insert.state.mode = BOOST_MODES.includes(id) ? id : 'ott'
  const preset = plugins['boost-x'].presets.find((p) => p.state.mode === id)
  if (preset) {
    props.insert.presetId = preset.id
    if (preset.state.character) props.insert.state.character = preset.state.character
  }
  commit()
}
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function setAmount (v) { props.insert.state.amount = v; commit() }

function drawWave (canvasRef, color, amp, reverse, density, spread) {
  const prepared = prepareCanvas(canvasRef, 180, 200)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  for (let y = 0; y < h; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }
  const t = performance.now() / 420
  const mid = h / 2
  const dens = 1 + density * 1.8
  const spr = spread * 10
  ctx.beginPath()
  ctx.moveTo(0, mid)
  for (let x = 0; x <= w; x += 2) {
    const u = reverse ? 1 - x / w : x / w
    const y = mid
      + Math.sin((reverse ? w - x : x) * 0.08 * dens + t + spr) * amp * (0.35 + 0.65 * Math.sin(u * Math.PI))
      + Math.sin((reverse ? w - x : x) * 0.19 + t * 1.7) * amp * density * 0.22
    ctx.lineTo(x, y)
  }
  ctx.lineWidth = 1.7
  strokeGlow(ctx, color, 10, () => ctx.stroke())
}

function draw () {
  const meters = props.meters || {}
  const amount = props.insert.state.amount || 0
  const mode = props.insert.state.mode || 'ott'
  const activity = meters.boostActivity != null ? meters.boostActivity : 0
  const width = meters.boostWidth != null ? meters.boostWidth : 0
  const gr = meters.boostGr != null ? meters.boostGr : 0
  const inAmp = 8 + (meters.inPeak != null ? meters.inPeak : amount * 0.45) * 70
  const outAmp = 8 + (meters.outPeak != null ? meters.outPeak : Math.max(amount, activity)) * 78
  const density = mode === 'ott' ? Math.min(1, amount * 0.55 + gr * 0.8) : mode === 'distortion' ? amount * 0.7 : amount * 0.25
  const spread = mode === 'expander' ? Math.min(1, width * 1.4 + amount * 0.35) : mode === 'chorus' ? amount * 0.55 : 0
  drawWave(inCanvas, DSP_THEME.boost.in, inAmp, false, density * 0.35, 0)
  drawWave(outCanvas, DSP_THEME.boost.out, outAmp, true, density, spread)
}

let raf = 0
function loop () { draw(); raf = requestAnimationFrame(loop) }
onMounted(() => { raf = requestAnimationFrame(loop) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.plug { gap: 10px; }
.stage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  align-items: stretch;
  min-height: 0;
  flex: 1 1 auto;
}
.io {
  padding: 10px 10px 12px;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.iolab {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #C8F542;
  margin-bottom: 8px;
}
.outlab { color: #A78BFA; text-align: right; }
.io-body { flex: 1; display: flex; gap: 8px; min-height: 0; height: auto; position: relative; }
.wave { flex: 1; min-width: 0; display: block; }
.knobs { justify-content: center; }
.wrap { flex-wrap: wrap; }

@media (max-width: 720px) {
  .stage { grid-template-columns: 1fr; max-height: 24vh; }
  .io { min-height: 96px; }
}
</style>
