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
    @pointerdown.stop="onPointerDown"
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
import { beginPointerDrag, clamp, pointerCoord, relativeFromDelta, RELATIVE_TRAVEL_PX } from '../lib/pointer-drag.js'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  orientation: { type: String, default: 'horizontal' },
  step: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
  label: { type: String, default: 'Level' },
  /** 'x' or 'y': a swipe on that axis scrolls the parent instead of moving the cap. */
  scrollAxis: { type: String, default: '' }
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
    ? { bottom: `calc(${percent.value}% - var(--fader-cap-half, 7px))` }
    : { left: `calc(${percent.value}% - var(--fader-cap-half, 7px))` }
))

function commit (value) {
  if (!Number.isFinite(value)) return
  const next = clamp(value, props.min, props.max, props.modelValue)
  if (next === props.modelValue) return
  emit('update:modelValue', next)
}

function nudge (steps) {
  const increment = props.step > 0 ? props.step : span.value / 100
  commit(props.modelValue + steps * increment)
}

function onPointerDown (event) {
  if (props.disabled) return
  if (!props.scrollAxis) event.preventDefault()
  const startValue = props.modelValue
  const vertical = props.orientation === 'vertical'
  let start = pointerCoord(event)
  let started = false
  beginPointerDrag(event, {
    allowScroll: props.scrollAxis,
    onMove: (ev) => {
      if (!started) {
        started = true
        emit('drag-start')
      }
      const now = pointerCoord(ev)
      if (!now) return
      if (!start) {
        start = now
        return
      }
      const fine = ev.shiftKey ? 0.35 : 1
      const delta = (vertical ? now.y - start.y : now.x - start.x) * fine
      if (!Number.isFinite(delta)) return
      commit(relativeFromDelta(startValue, delta, span.value, RELATIVE_TRAVEL_PX, vertical))
    },
    onEnd: () => { if (started) emit('drag-end') }
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
  height: 36px;
  min-height: 36px;
  display: flex;
  align-items: center;
  cursor: pointer;
  /* flex-basis 0 (from `flex: 1`) let a column parent collapse this to the
     8px track, which a finger cannot grab. */
  flex: 1 1 auto;
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
  margin-left: calc(var(--fader-cap-w, 14px) / -2);
}
.fader:not(.vertical) .cap {
  top: 50%;
  margin-top: calc(var(--fader-cap-h, 14px) / -2);
}
</style>
