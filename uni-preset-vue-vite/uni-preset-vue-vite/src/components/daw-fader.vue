<template>
  <view
    class="fader"
    @mousedown.stop="onDown"
    @touchstart.stop.prevent="onTouchStart"
  >
    <view class="track">
      <view class="fill" :style="{ width: percent + '%' }" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 }
})
const emit = defineEmits(['update:modelValue'])

const percent = computed(() => {
  const span = props.max - props.min || 1
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100))
})

function setFromClientX (clientX, el) {
  const rect = el.getBoundingClientRect()
  const t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  emit('update:modelValue', props.min + t * (props.max - props.min))
}

function bindMove (getX, target) {
  const move = (ev) => setFromClientX(getX(ev), target)
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', up)
}

function onDown (e) {
  setFromClientX(e.clientX, e.currentTarget)
  bindMove((ev) => ev.clientX, e.currentTarget)
}

function onTouchStart (e) {
  const t = e.changedTouches[0]
  setFromClientX(t.clientX, e.currentTarget)
  bindMove((ev) => (ev.touches ? ev.touches[0].clientX : ev.changedTouches[0].clientX), e.currentTarget)
}
</script>

<style scoped>
.fader {
  height: 18px;
  display: flex;
  align-items: center;
  cursor: pointer;
  flex: 1;
  min-width: 40px;
}
.track {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #2a2a2a;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: #7a7a7a;
  border-radius: 3px;
}
</style>
