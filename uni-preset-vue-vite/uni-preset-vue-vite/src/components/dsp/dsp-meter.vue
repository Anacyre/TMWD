<template>
  <view
    class="meter"
    :class="{ stereo, 'has-gain': gainEnabled, dim: disabled, fill }"
    :style="wrapStyle"
  >
    <text v-if="label" class="lab">{{ label }}</text>
    <view
      ref="body"
      class="body"
      @mousedown.stop.prevent="beginGain"
      @touchstart.stop.prevent="beginGain"
      @wheel.stop.prevent="onWheel"
      @dblclick.stop="resetGain"
    >
      <view class="scale">
        <text class="tick" :style="{ bottom: dbMark(6) }">+6</text>
        <text class="tick" :style="{ bottom: dbMark(0) }">0</text>
        <text class="tick" :style="{ bottom: dbMark(-24) }">-24</text>
        <text class="tick" :style="{ bottom: dbMark(-60) }">-60</text>
      </view>
      <view class="cols">
        <view class="col">
          <view class="fill-bar" :style="fillStyle(level)" />
        </view>
        <view v-if="stereo" class="col">
          <view class="fill-bar" :style="fillStyle(levelR != null ? levelR : level)" />
        </view>
      </view>
      <view v-if="gainEnabled" class="fader" :class="{ locked: gainDisabled }">
        <view class="thumb" :style="{ bottom: (gainT * 100) + '%' }" />
      </view>
    </view>
    <text v-if="showDb" class="db">{{ dbText }}</text>
    <text v-if="gainEnabled" class="gain">{{ gainText }}</text>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { fmtDb, peakToDb, peakToMeterT } from './dsp-theme.js'

const props = defineProps({
  level: { type: Number, default: 0 },
  levelR: { type: Number, default: null },
  stereo: { type: Boolean, default: true },
  label: { type: String, default: '' },
  height: { type: Number, default: 160 },
  fill: { type: Boolean, default: false },
  showDb: { type: Boolean, default: true },
  color: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  showGain: { type: Boolean, default: false },
  gain: { type: Number, default: 0 },
  gainMin: { type: Number, default: -24 },
  gainMax: { type: Number, default: 24 },
  gainDefault: { type: Number, default: 0 },
  gainDisabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:gain'])
const body = ref(null)

const gainEnabled = computed(() => props.showGain)
const wrapStyle = computed(() => props.fill ? null : { height: props.height + 'px' })
const gainT = computed(() => {
  const span = (props.gainMax - props.gainMin) || 1
  return Math.min(1, Math.max(0, (Number(props.gain) - props.gainMin) / span))
})
const dbText = computed(() => {
  const peak = Number(props.level) || 0
  if (peak < 0.00002) return '-∞ dB'
  return fmtDb(peakToDb(peak), 1)
})
const gainText = computed(() => fmtDb(Number(props.gain) || 0, 1))

function dbMark (db) {
  const t = Math.min(1, Math.max(0, (db - (-60)) / (6 - (-60))))
  if (t <= 0.01) return '2px'
  if (t >= 0.99) return 'calc(100% - 10px)'
  return (t * 100) + '%'
}

function fillStyle (peak) {
  const amount = peakToMeterT(peak || 0, -60, 6)
  return {
    height: Math.round(amount * 100) + '%',
    background: props.color || 'linear-gradient(180deg, var(--dsp-accent-2), var(--dsp-accent))',
    boxShadow: amount > 0.04 ? '0 0 8px var(--dsp-glow)' : 'none'
  }
}

function resolveBody (el) {
  if (!el) return null
  if (el.nodeType === 1) return el
  if (el.$el && el.$el.nodeType === 1) return el.$el
  return el
}

function gainFromY (clientY) {
  const el = resolveBody(body.value)
  if (!el || typeof el.getBoundingClientRect !== 'function') return props.gain
  const rect = el.getBoundingClientRect()
  const t = 1 - (clientY - rect.top) / Math.max(1, rect.height)
  const span = props.gainMax - props.gainMin
  return Math.min(props.gainMax, Math.max(props.gainMin, props.gainMin + t * span))
}

function setGain (next) {
  if (!gainEnabled.value || props.gainDisabled || props.disabled) return
  emit('update:gain', next)
}

function beginGain (e) {
  if (!gainEnabled.value || props.gainDisabled || props.disabled) return
  const p = e.touches ? e.touches[0] : e
  setGain(gainFromY(p.clientY))
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    const q = ev.touches ? ev.touches[0] : ev
    setGain(gainFromY(q.clientY))
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

function onWheel (e) {
  if (!gainEnabled.value || props.gainDisabled || props.disabled) return
  const span = props.gainMax - props.gainMin
  setGain(Math.min(props.gainMax, Math.max(props.gainMin, Number(props.gain) - Math.sign(e.deltaY) * span * 0.03)))
}

function resetGain () {
  setGain(props.gainDefault)
}
</script>

<style scoped>
.meter {
  width: 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}
.meter.stereo { width: 36px; }
.meter.has-gain { width: 52px; }
.meter.has-gain.stereo { width: 58px; }
.meter.fill { height: 100%; min-height: 160px; }
.meter.dim { opacity: 0.38; }
.lab {
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--dsp-muted);
  margin-bottom: 6px;
}
.body {
  flex: 1;
  min-height: 0;
  width: 100%;
  display: flex;
  justify-content: center;
  gap: 4px;
  position: relative;
  cursor: default;
}
.meter.has-gain .body { cursor: ns-resize; }
.scale {
  width: 18px;
  position: relative;
  flex-shrink: 0;
}
.tick {
  position: absolute;
  left: 0;
  font-size: 8px;
  color: var(--dsp-dim);
  letter-spacing: 0.04em;
  transform: translateY(50%);
  white-space: nowrap;
}
.cols {
  flex: 0 0 auto;
  height: 100%;
  display: flex;
  justify-content: center;
  gap: 3px;
}
.col {
  width: 4px;
  height: 100%;
  background: rgba(255,255,255,0.04);
  border-radius: 1px;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
}
.fill-bar {
  width: 100%;
  min-height: 1px;
  border-radius: 1px;
}
.fader {
  width: 10px;
  height: 100%;
  position: relative;
  flex-shrink: 0;
}
.fader.locked { opacity: 0.35; }
.thumb {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 8px;
  margin-left: -6px;
  margin-bottom: -4px;
  border-radius: 2px;
  background: #F4F1EA;
  box-shadow: 0 0 10px var(--dsp-glow);
}
.db,
.gain {
  margin-top: 5px;
  font-size: 9px;
  color: var(--dsp-muted);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.gain { color: var(--dsp-accent); }

@media (max-width: 720px) {
  .meter { width: 32px; }
  .meter.stereo { width: 42px; }
  .meter.has-gain { width: 64px; }
  .meter.has-gain.stereo { width: 68px; }
  .meter.fill { min-height: 120px; }
  .col { width: 6px; }
  .thumb {
    width: 16px;
    height: 14px;
    margin-left: -8px;
    margin-bottom: -7px;
  }
  .lab { font-size: 9px; }
}
</style>
