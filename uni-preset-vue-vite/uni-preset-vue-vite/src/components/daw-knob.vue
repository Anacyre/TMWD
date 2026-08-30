<template>
  <view
    class="knob"
    :class="{ disabled }"
    :title="title"
    :aria-label="title"
    role="slider"
    :aria-valuenow="Math.round(modelValue * 100) / 100"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-disabled="disabled ? 'true' : 'false'"
    :tabindex="disabled ? -1 : 0"
    @pointerdown.stop.prevent="onPointerDown"
    @dblclick.stop.prevent="reset"
    @keydown="onKeyDown"
    @wheel.prevent="onWheel"
  >
    <view class="disc">
      <view class="pointer" :style="{ transform: `rotate(${angle}deg)` }" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { beginPointerDrag, clamp } from '../lib/pointer-drag.js'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: -1 },
  max: { type: Number, default: 1 },
  title: { type: String, default: 'Pan' },
  resetValue: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue', 'drag-start', 'drag-end'])

import { RELATIVE_TRAVEL_PX } from '../lib/pointer-drag.js'

// Full travel over this many pixels of vertical drag.
const DRAG_PIXELS = RELATIVE_TRAVEL_PX

const span = computed(() => (props.max - props.min) || 1)

const angle = computed(() => {
  const t = clamp((props.modelValue - props.min) / span.value, 0, 1)
  return -135 + t * 270
})

function commit (next) {
  const value = clamp(next, props.min, props.max)
  if (value === props.modelValue) return
  emit('update:modelValue', value)
}

function nudge (steps) {
  commit(props.modelValue + steps * (span.value / 100))
}

function onPointerDown (event) {
  if (props.disabled) return
  const startY = event.clientY
  const startValue = props.modelValue
  emit('drag-start')
  if (typeof document !== 'undefined') document.documentElement.classList.add('daw-pointer-lock')
  beginPointerDrag(event, {
    onMove: (ev) => {
      const scale = ev.shiftKey ? 0.2 : 1
      const delta = (startY - ev.clientY) / DRAG_PIXELS
      commit(startValue + delta * span.value * scale)
    },
    onEnd: () => {
      if (typeof document !== 'undefined') document.documentElement.classList.remove('daw-pointer-lock')
      emit('drag-end')
    }
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
  else if (key === 'Backspace' || key === 'Delete') reset()
  else return
  event.preventDefault()
}

function onWheel (event) {
  if (props.disabled) return
  nudge(event.deltaY > 0 ? -1 : 1)
}

function reset () {
  if (props.disabled) return
  emit('drag-start')
  commit(props.resetValue)
  emit('drag-end')
}
</script>

<style scoped>
.knob {
  /* 26px of ink inside a 32px touch target keeps the look but stays tappable. */
  width: 32px;
  height: 32px;
  padding: 3px;
  box-sizing: border-box;
  flex-shrink: 0;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}
.knob:focus-visible {
  outline: 1px solid #d98b3a;
  outline-offset: 1px;
  border-radius: 50%;
}
.knob.disabled {
  cursor: not-allowed;
  opacity: 0.4;
}
.disc {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: #2b2b2b;
  border: 1.2px solid #5c5c5c;
  position: relative;
}
.pointer {
  position: absolute;
  left: 50%;
  top: 18%;
  width: 2px;
  height: 38%;
  margin-left: -1px;
  background: #d4d4d4;
  border-radius: 1px;
  transform-origin: bottom center;
}
</style>
