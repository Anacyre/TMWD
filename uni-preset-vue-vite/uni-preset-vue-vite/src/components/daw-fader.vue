<template>
  <view
    ref="root"
    class="fader"
    :class="[orientation, { disabled }]"
    :aria-label="label"
    :aria-valuenow="Math.round(modelValue * 1000) / 1000"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-disabled="disabled ? 'true' : 'false'"
    role="slider"
    :tabindex="disabled ? -1 : 0"
    @pointerdown.stop.prevent="onPointerDown"
    @keydown="onKeyDown"
    @wheel.prevent="onWheel"
  >
    <view class="track">
      <view class="fill" :style="fillStyle" />
    </view>
    <view class="cap" :style="capStyle" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { beginPointerDrag, trackRatio, clamp } from '../lib/pointer-drag.js'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  orientation: { type: String, default: 'horizontal' },
  step: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: 'Level' }
})
const emit = defineEmits(['update:modelValue', 'drag-start', 'drag-end'])

const root = ref(null)

const span = computed(() => (props.max - props.min) || 1)

const percent = computed(() => clamp(((props.modelValue - props.min) / span.value) * 100, 0, 100))

const fillStyle = computed(() => (
  props.orientation === 'vertical'
    ? { height: percent.value + '%' }
    : { width: percent.value + '%' }
))

const capStyle = computed(() => (
  props.orientation === 'vertical'
    ? { bottom: `calc(${percent.value}% - 7px)` }
    : { left: `calc(${percent.value}% - 7px)` }
))

function element () {
  const node = root.value
  if (!node) return null
  return node.$el || node
}

function commit (value) {
  const next = clamp(value, props.min, props.max)
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

function nudge (steps) {
  const increment = props.step > 0 ? props.step : span.value / 100
  commit(props.modelValue + steps * increment)
}

function applyRatio (event, target) {
  const t = trackRatio(event, target, props.orientation)
  // A zero-height container used to yield NaN here and left the fader stuck.
  if (t === null) return
  commit(props.min + t * span.value)
}

function onPointerDown (event) {
  if (props.disabled) return
  const target = element() || event.currentTarget
  applyRatio(event, target)
  emit('drag-start')
  beginPointerDrag(event, {
    onMove: (ev) => applyRatio(ev, target),
    onEnd: () => emit('drag-end')
  })
}

function onKeyDown (event) {
  if (props.disabled) return
  const key = event.key
  const big = event.shiftKey ? 10 : 1
  if (key === 'ArrowUp' || key === 'ArrowRight') nudge(big)
  else if (key === 'ArrowDown' || key === 'ArrowLeft') nudge(-big)
  else if (key === 'Home') commit(props.min)
  else if (key === 'End') commit(props.max)
  else if (key === 'PageUp') nudge(10)
  else if (key === 'PageDown') nudge(-10)
  else return
  event.preventDefault()
}

function onWheel (event) {
  if (props.disabled) return
  nudge(event.deltaY > 0 ? -1 : 1)
}
</script>

<style scoped>
.fader {
  height: 22px;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex: 1;
  min-width: 40px;
  position: relative;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.fader:focus-visible {
  outline: 1px solid #d98b3a;
  outline-offset: 2px;
}
.fader.disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.fader.vertical {
  height: 100%;
  /* Vertical faders need a floor: a zero-height parent made dragging a no-op. */
  min-height: 48px;
  width: 28px;
  min-width: 28px;
  flex: none;
  align-items: stretch;
  justify-content: center;
  touch-action: none;
}
.track {
  width: 100%;
  height: 8px;
  border-radius: 4px;
  background: #2a2a2a;
  overflow: hidden;
  position: relative;
}
.vertical .track {
  width: 8px;
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.fill {
  height: 100%;
  background: #8a8680;
  border-radius: 4px;
}
.vertical .fill {
  width: 100%;
  height: auto;
}
.cap {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  background: #dedad4;
  pointer-events: none;
  box-shadow: 0 0 0 1px #111;
}
.vertical .cap {
  left: 50%;
  transform: translateX(-50%);
}
.fader:not(.vertical) .cap {
  top: 50%;
  transform: translateY(-50%);
}
</style>
