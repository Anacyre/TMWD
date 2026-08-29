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

    <view class="stage x-panel">
      <view class="scope">
        <text class="scope-lab">In</text>
        <dsp-canvas ref="inCanvas" fill :height="200" />
      </view>

      <view class="dial">
        <dsp-knob
          size="xl"
          :model-value="state.amount"
          :min="0" :max="1" :default-value="0.35"
          label="Gain"
          :format="fmtAmount"
          @update:model-value="set('amount', $event)"
        />
      </view>

      <view class="scope">
        <text class="scope-lab right">Out</text>
        <dsp-canvas ref="outCanvas" fill :height="200" />
      </view>

      <dsp-meter
        label="Out"
        :level="outLevel"
        :level-r="outLevelR"
        fill
        :height="200"
        show-gain
        :gain="state.outputGainDb"
        :gain-min="-12"
        :gain-max="12"
        :gain-default="0"
        @update:gain="set('outputGainDb', $event)"
      />
    </view>

    <view class="tray x-tray">
      <dsp-knob
        size="sm"
        :model-value="state.mix"
        :min="0" :max="1" :default-value="1"
        label="Mix"
        :format="(v) => Math.round(v * 100) + '%'"
        @update:model-value="set('mix', $event)"
      />
      <dsp-knob
        size="sm"
        :model-value="state.hpfHz"
        :min="0" :max="400" :default-value="50"
        label="High Pass"
        :format="fmtHpf"
        @update:model-value="set('hpfHz', $event)"
      />
      <view class="mode-col">
        <text class="dsp-lab">Mode</text>
        <view class="x-seg railed">
          <view
            v-for="mode in modes"
            :key="mode.id"
            class="x-chip"
            :class="{ on: state.mode === mode.id }"
            @click="onMode(mode.id)"
          >{{ mode.short }}</view>
        </view>
      </view>
    </view>

    <view class="x-footer">
      <text class="dsp-lab">Oversampling</text>
      <view class="x-seg railed">
        <view
          v-for="factor in OVERSAMPLE_FACTORS"
          :key="factor"
          class="x-chip os"
          :class="{ on: state.oversampling === factor }"
          @click="set('oversampling', factor)"
        >{{ factor }}×</view>
      </view>
      <text class="hint">{{ modeHint }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import DspMeter from './dsp-meter.vue'
import DspCanvas from './dsp-canvas.vue'
import { plugins, BOOST_MODES, OVERSAMPLE_FACTORS, resetInsert } from '../../dsp/registry.js'
import { prepareCanvas } from './canvas-util.js'
import { DSP_THEME } from './dsp-theme.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true },
  meters: { type: Object, default: () => ({}) }
})
const emit = defineEmits(['change'])
const inCanvas = ref(null)
const outCanvas = ref(null)
const state = computed(() => props.insert.state)

const modes = [
  { id: 'ott', name: 'OTT Multiband', short: 'OTT', hint: 'Upward + downward compression across three bands' },
  { id: 'expander', name: 'Stereo Expander', short: 'Wide', hint: 'Frequency-dependent stereo widening' },
  { id: 'chorus', name: 'Chorus', short: 'Chorus', hint: 'Dual modulated delay' },
  { id: 'drive', name: 'Drive', short: 'Drive', hint: 'Saturation — raise oversampling to tame aliasing' }
]

const outLevel = computed(() => num(props.meters.outPeak))
const outLevelR = computed(() => props.meters.outPeakR != null ? props.meters.outPeakR : null)
const modeHint = computed(() => {
  const found = modes.find((mode) => mode.id === state.value.mode)
  return found ? found.hint : ''
})

function num (value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function fmtAmount (v) {
  return (num(v) * 2).toFixed(2)
}

function fmtHpf (v) {
  const hz = Math.round(num(v))
  return hz <= 0 ? 'Off' : hz + ' Hz'
}

function commit () { emit('change', props.insert) }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function onMode (id) {
  const next = id === 'distortion' ? 'drive' : id
  props.insert.state.mode = BOOST_MODES.includes(next) ? next : 'ott'
  const preset = plugins['boost-x'].presets.find((item) => item.state.mode === props.insert.state.mode)
  if (preset) {
    props.insert.presetId = preset.id
    if (preset.state.character) props.insert.state.character = preset.state.character
  }
  commit()
}

/* Two scopes share one shape generator: the output copy is driven harder and, in
   `drive`, clipped, so the pair reads as a before/after of the current mode. */
function drawScope (canvasRef, color, amp, phase, harmonics, clip) {
  const prepared = prepareCanvas(canvasRef, 180, 200)
  if (!prepared) return
  const { ctx, w, h } = prepared
  ctx.clearRect(0, 0, w, h)
  ctx.fillStyle = DSP_THEME.panel
  ctx.fillRect(0, 0, w, h)

  const mid = h / 2
  ctx.strokeStyle = DSP_THEME.grid
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, Math.round(mid) + 0.5)
  ctx.lineTo(w, Math.round(mid) + 0.5)
  ctx.stroke()

  const limit = mid - 4
  ctx.beginPath()
  for (let x = 0; x <= w; x += 2) {
    const u = x / Math.max(1, w)
    let v = Math.sin(u * 26 + phase)
    v += Math.sin(u * 61 + phase * 1.7) * harmonics * 0.34
    v += Math.sin(u * 137 + phase * 2.3) * harmonics * 0.16
    v *= 0.5 + 0.5 * Math.sin(u * Math.PI)
    let y = v * amp
    if (clip > 0) {
      const ceiling = limit * (1 - clip * 0.42)
      y = Math.max(-ceiling, Math.min(ceiling, y * (1 + clip)))
    }
    const py = mid - Math.max(-limit, Math.min(limit, y))
    if (x === 0) ctx.moveTo(x, py)
    else ctx.lineTo(x, py)
  }
  ctx.strokeStyle = color
  ctx.lineWidth = 1.4
  ctx.stroke()
}

function draw () {
  const meters = props.meters || {}
  const amount = num(state.value.amount)
  const mode = state.value.mode || 'ott'
  const activity = num(meters.boostActivity)
  const width = num(meters.boostWidth)
  const gr = num(meters.boostGr)
  const phase = performance.now() / 520

  const inPeak = meters.inPeak != null ? num(meters.inPeak) : amount * 0.4
  const outPeak = meters.outPeak != null ? num(meters.outPeak) : Math.max(amount, activity)
  const inAmp = 10 + inPeak * 72
  const outAmp = 10 + outPeak * 78

  const harmonics = mode === 'drive'
    ? amount * 0.9
    : mode === 'ott' ? Math.min(1, amount * 0.5 + gr * 0.7) : amount * 0.2
  const spread = mode === 'expander' ? Math.min(1, width * 1.3 + amount * 0.3) : 0

  drawScope(inCanvas, DSP_THEME.boost.in, inAmp, phase, harmonics * 0.3, 0)
  drawScope(outCanvas, DSP_THEME.boost.out, outAmp, phase + spread, harmonics, mode === 'drive' ? amount : 0)
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
</script>

<style scoped>
.plug { gap: 8px; }
.stage {
  display: flex;
  gap: 10px;
  align-items: stretch;
  min-height: 0;
  flex: 1 1 auto;
  padding: 10px 12px;
}
.scope {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  position: relative;
}
.scope-lab {
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3);
  margin-bottom: 4px;
}
.scope-lab.right { text-align: right; }
.dial {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.tray {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 8px 14px;
  flex-shrink: 0;
}
.mode-col {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.x-chip.os { min-width: 34px; }
.hint {
  margin-left: auto;
  font-size: 9px;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--x-ink-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 720px) {
  .stage {
    flex-wrap: wrap;
    max-height: none;
    padding: 8px;
  }
  .scope { flex: 1 1 40%; min-height: 84px; }
  .dial { order: -1; flex: 1 1 100%; }
  .tray {
    flex-wrap: wrap;
    gap: 10px 14px;
  }
  .mode-col {
    margin-left: 0;
    align-items: flex-start;
    flex: 1 1 100%;
  }
  .hint { display: none; }
}
</style>
