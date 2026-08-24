<template>
  <view
    class="fader"
    :class="orientation"
    @mousedown.stop="onDown"
    @touchstart.stop.prevent="onTouchStart"
  >
    <view class="track">
      <view class="fill" :style="fillStyle" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  orientation: { type: String, default: 'horizontal' }
})
const emit = defineEmits(['update:modelValue'])

const percent = computed(() => {
  const span = props.max - props.min || 1
  return Math.min(100, Math.max(0, ((props.modelValue - props.min) / span) * 100))
})

const fillStyle = computed(() => (
  props.orientation === 'vertical'
    ? { height: percent.value + '%' }
    : { width: percent.value + '%' }
))

function setFromEvent (clientX, clientY, el) {
  const rect = el.getBoundingClientRect()
  let t
  if (props.orientation === 'vertical') {
    t = 1 - Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
  } else {
    t = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
  }
  emit('update:modelValue', props.min + t * (props.max - props.min))
}

function bindMove (target) {
  const move = (ev) => {
    const pt = ev.touches ? ev.touches[0] : ev
    setFromEvent(pt.clientX, pt.clientY, target)
  }
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
  setFromEvent(e.clientX, e.clientY, e.currentTarget)
  bindMove(e.currentTarget)
}

function onTouchStart (e) {
  const t = e.changedTouches[0]
  setFromEvent(t.clientX, t.clientY, e.currentTarget)
  bindMove(e.currentTarget)
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
.fader.vertical {
  height: 100%;
  width: 18px;
  min-width: 18px;
  flex: none;
  align-items: stretch;
  justify-content: center;
}
.track {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #2a2a2a;
  overflow: hidden;
  position: relative;
}
.vertical .track {
  width: 6px;
  height: 100%;
  display: flex;
  align-items: flex-end;
}
.fill {
  height: 100%;
  background: #7a7a7a;
  border-radius: 3px;
}
.vertical .fill {
  width: 100%;
  height: auto;
}
</style>
