<template>
  <view
    class="knob"
    :title="title"
    @pointerdown.stop.prevent="onDown"
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
const emit = defineEmits(['update:modelValue'])

const angle = computed(() => {
  const t = (props.modelValue - props.min) / (props.max - props.min || 1)
  return -135 + t * 270
})

function onDown (e) {
  const startY = e.clientY
  const startVal = props.modelValue
  const move = (ev) => {
    const next = startVal - (ev.clientY - startY) * 0.01
    emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function reset () {
  emit('update:modelValue', 0)
}
</script>

<style scoped>
.knob {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  cursor: ns-resize;
  touch-action: pan-x;
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
