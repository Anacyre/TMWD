<template>
  <view
    class="fader"
    :class="orientation"
    @mousedown.stop="onDown"
    @touchstart.stop="onTouchStart"
  >
    <view class="track">
      <view class="fill" :style="fillStyle" />
    </view>
    <view class="cap" :style="capStyle" />
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

const capStyle = computed(() => (
  props.orientation === 'vertical'
    ? { bottom: `calc(${percent.value}% - 7px)` }
    : { left: `calc(${percent.value}% - 7px)` }
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
    if (ev.cancelable) ev.preventDefault()
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
  const el = e.currentTarget
  const startX = t.clientX
  const startY = t.clientY
  let captured = false
  const move = (ev) => {
    const pt = ev.touches && ev.touches[0]
    if (!pt) return
    if (!captured) {
      const dx = Math.abs(pt.clientX - startX)
      const dy = Math.abs(pt.clientY - startY)
      if (dx < 8 && dy < 8) return
      if (props.orientation === 'vertical' ? dx > dy : dy > dx) {
        window.removeEventListener('touchmove', move)
        window.removeEventListener('touchend', up)
        return
      }
      captured = true
    }
    if (ev.cancelable) ev.preventDefault()
    setFromEvent(pt.clientX, pt.clientY, el)
  }
  const up = () => {
    window.removeEventListener('touchmove', move)
    window.removeEventListener('touchend', up)
  }
  window.addEventListener('touchmove', move, { passive: false })
  window.addEventListener('touchend', up)
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
  touch-action: pan-x;
}
.fader.vertical {
  height: 100%;
  width: 28px;
  min-width: 28px;
  flex: none;
  align-items: stretch;
  justify-content: center;
  touch-action: pan-x;
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
