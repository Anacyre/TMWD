<template>
  <view
    class="sl"
    :class="{ dim: disabled, horizontal }"
    :aria-label="label"
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
    <text v-if="label" class="lab">{{ label }}</text>
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
  disabled: { type: Boolean, default: false },
  horizontal: { type: Boolean, default: false },
  length: { type: Number, default: 140 }
})
const emit = defineEmits(['update:modelValue'])

const t = computed(() => {
  const span = props.max - props.min || 1
  return Math.min(1, Math.max(0, (props.modelValue - props.min) / span))
})
const trackStyle = computed(() => props.horizontal
  ? {}
  : { height: props.length + 'px' })
const fillStyle = computed(() => props.horizontal
  ? { width: (t.value * 100) + '%' }
  : { height: (t.value * 100) + '%' })
const thumbStyle = computed(() => props.horizontal
  ? { left: (t.value * 100) + '%' }
  : { bottom: (t.value * 100) + '%' })

function set (next) {
  if (props.disabled) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function begin (e) {
  const start = e.touches ? e.touches[0] : e
  const startPos = props.horizontal ? start.clientX : start.clientY
  const startVal = props.modelValue
  const span = props.max - props.min
  const move = (ev) => {
    const p = ev.touches ? ev.touches[0] : ev
    const delta = props.horizontal ? (p.clientX - startPos) : (startPos - p.clientY)
    set(startVal + delta / 140 * span)
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
  const span = props.max - props.min
  set(props.modelValue - Math.sign(e.deltaY) * span * 0.03)
}

function onKey (e) {
  const span = props.max - props.min
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(props.modelValue + span * 0.02)
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(props.modelValue - span * 0.02)
}

function reset () { set(props.defaultValue) }
</script>

<style scoped>
.sl { display: flex; flex-direction: column; align-items: center; touch-action: none; min-width: 28px; }
.sl.dim { opacity: 0.35; }
.track {
  width: 2px;
  height: 140px;
  background: rgba(255,255,255,0.08);
  border-radius: 1px;
  position: relative;
}
.sl.horizontal .track { width: 100%; min-width: 120px; height: 2px; }
.fill {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 100%;
  background: var(--dsp-accent, #B794F6);
  border-radius: 1px;
  box-shadow: 0 0 8px var(--dsp-glow, rgba(183,148,246,0.4));
}
.sl.horizontal .fill { left: 0; top: 0; bottom: auto; height: 100%; }
.thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 6px;
  background: #F4F1EA;
  left: 50%;
  margin-left: -6px;
  margin-bottom: -6px;
  box-shadow: 0 0 10px var(--dsp-glow, rgba(183,148,246,0.45));
}
.sl.horizontal .thumb {
  left: 0;
  top: 50%;
  bottom: auto;
  margin-left: -6px;
  margin-top: -6px;
  margin-bottom: 0;
}
.lab {
  margin-top: 10px;
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dsp-muted, #7A8494);
}
</style>
