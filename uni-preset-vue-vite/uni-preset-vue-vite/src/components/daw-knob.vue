<template>
  <view
    class="knob"
    :title="title"
    @mousedown.stop.prevent="begin"
    @touchstart.stop.prevent="begin"
    @dblclick.stop="reset"
  >
    <view class="disc">
      <view class="pointer" :style="{ transform: `rotate(${angle}deg)` }" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: -1 },
  max: { type: Number, default: 1 },
  title: { type: String, default: 'Pan' }
})
const emit = defineEmits(['update:modelValue', 'drag-start', 'drag-end'])

const angle = computed(() => {
  const t = (props.modelValue - props.min) / (props.max - props.min || 1)
  return -135 + t * 270
})

function set (next) {
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function begin (e) {
  emit('drag-start')
  const isTouch = !!e.touches
  const startY = isTouch ? e.touches[0].clientY : e.clientY
  const startVal = props.modelValue
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY
    set(startVal - (y - startY) * 0.01)
  }
  const end = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', end)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', end)
    emit('drag-end')
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', end)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', end)
}

function reset () {
  set(0)
}
</script>

<style scoped>
.knob {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
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
