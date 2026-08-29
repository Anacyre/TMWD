<template>
  <view
    class="sl"
    :class="{ dim: disabled, horizontal }"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    role="slider"
    tabindex="0"
    @mousedown.stop.prevent="begin"
    @touchstart.stop.prevent="begin"
    @wheel.stop.prevent="onWheel"
    @keydown.stop="onKey"
    @dblclick.stop="reset"
    @contextmenu.prevent
  >
    <view class="track" :style="trackStyle">
      <view class="fill" :style="fillStyle" />
      <view class="thumb" :style="thumbStyle" />
    </view>
    <view v-if="label || showValue" class="cap">
      <text v-if="label" class="lab">{{ label }}</text>
      <text v-if="showValue" class="val">{{ display }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  defaultValue: { type: Number, default: 0 },
  label: { type: String, default: '' },
  format: { type: Function, default: null },
  showValue: { type: Boolean, default: true },
  disabled: { type: Boolean, default: false },
  horizontal: { type: Boolean, default: false },
  scale: { type: String, default: 'lin' },
  length: { type: Number, default: 140 }
})
const emit = defineEmits(['update:modelValue'])

function toT (value) {
  if (props.scale === 'log') {
    const min = Math.max(1e-6, props.min)
    const max = Math.max(min * 1.0001, props.max)
    const v = Math.max(min, Math.min(max, value))
    return Math.log(v / min) / Math.log(max / min)
  }
  const span = props.max - props.min || 1
  return Math.min(1, Math.max(0, (value - props.min) / span))
}

function fromT (t) {
  const u = Math.min(1, Math.max(0, t))
  if (props.scale === 'log') {
    const min = Math.max(1e-6, props.min)
    const max = Math.max(min * 1.0001, props.max)
    return min * Math.pow(max / min, u)
  }
  return props.min + u * (props.max - props.min)
}

const t = computed(() => toT(props.modelValue))
const trackStyle = computed(() => props.horizontal ? {} : { height: props.length + 'px' })
const fillStyle = computed(() => props.horizontal
  ? { width: (t.value * 100) + '%' }
  : { height: (t.value * 100) + '%' })
const thumbStyle = computed(() => props.horizontal
  ? { left: (t.value * 100) + '%' }
  : { bottom: (t.value * 100) + '%' })
const display = computed(() => props.format
  ? props.format(props.modelValue)
  : (Number(props.modelValue) || 0).toFixed(2))

function set (next) {
  if (props.disabled) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function begin (e) {
  if (props.disabled) return
  const start = e.touches ? e.touches[0] : e
  const startPos = props.horizontal ? start.clientX : start.clientY
  const startT = t.value
  const span = props.horizontal ? 180 : 140
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    const p = ev.touches ? ev.touches[0] : ev
    const delta = props.horizontal ? (p.clientX - startPos) : (startPos - p.clientY)
    set(fromT(startT + delta / span))
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
  set(fromT(t.value - Math.sign(e.deltaY) * 0.03))
}

function onKey (e) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(fromT(t.value + 0.02))
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(fromT(t.value - 0.02))
}

function reset () { set(props.defaultValue) }
</script>

<style scoped>
.sl {
  display: flex;
  flex-direction: column;
  align-items: center;
  touch-action: none;
  min-width: 28px;
  cursor: pointer;
  user-select: none;
}
.sl.horizontal { align-items: stretch; }
.sl.dim { opacity: 0.4; pointer-events: none; }
.track {
  width: 3px;
  height: 140px;
  background: var(--x-line);
  border-radius: 2px;
  position: relative;
}
.sl.horizontal .track {
  width: 100%;
  min-width: 90px;
  height: 3px;
  margin: 7px 0;
}
.fill {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  background: var(--x-accent, #E08B2F);
  border-radius: 2px;
}
.sl.horizontal .fill { left: 0; top: 0; bottom: auto; height: 100%; }
.thumb {
  position: absolute;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #FFFFFF;
  border: 1px solid var(--x-accent, #E08B2F);
  box-sizing: border-box;
  left: 50%;
  margin-left: -6.5px;
  margin-bottom: -6.5px;
}
.sl.horizontal .thumb {
  left: 0;
  top: 50%;
  bottom: auto;
  margin-left: -6.5px;
  margin-top: -6.5px;
  margin-bottom: 0;
}
.sl:hover .thumb { border-color: var(--x-accent-hi, #F2A64A); }
.cap {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 6px;
  margin-top: 4px;
}
.sl.horizontal .cap { justify-content: space-between; }
.lab {
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3);
  white-space: nowrap;
}
.val {
  font-size: 11px;
  color: var(--x-ink);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .sl.horizontal .track { height: 4px; margin: 12px 0; }
  .thumb { width: 20px; height: 20px; margin-left: -10px; margin-bottom: -10px; }
  .sl.horizontal .thumb { margin-top: -10px; margin-bottom: 0; }
  .lab { font-size: 10px; }
  .val { font-size: 12px; }
}
</style>
