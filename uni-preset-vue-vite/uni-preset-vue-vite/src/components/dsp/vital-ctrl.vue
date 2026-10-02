<template>
  <view
    v-if="spec && spec.options"
    class="txt"
    :class="{ dim: disabled }"
    @click.stop="cycle(1)"
    @contextmenu.prevent.stop="cycle(-1)"
  >
    <text class="txt-lab">{{ spec.label }}</text>
    <text class="txt-val">{{ modelValue }}</text>
  </view>
  <view
    v-else-if="spec && linear"
    class="lin"
    :class="[linear, { dim: disabled }]"
    @pointerdown.stop.prevent="beginLin"
  >
    <text class="txt-lab">{{ spec.label }}</text>
    <view class="lin-track">
      <view class="lin-fill" :style="fillStyle" />
    </view>
    <text class="txt-val">{{ display }}</text>
  </view>
  <dsp-knob
    v-else-if="spec"
    tone="vital"
    size="sm"
    :model-value="num"
    :min="spec.min"
    :max="spec.max"
    :default-value="spec.defaultValue"
    :scale="spec.scale || 'lin'"
    :label="spec.label"
    :format="format"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup>
import { computed } from 'vue'
import DspKnob from './dsp-knob.vue'
import { formatVitalValue } from '../../dsp/vital-lite/face-draw.js'

const props = defineProps({
  spec: { type: Object, default: null },
  modelValue: { type: [Number, String], default: 0 },
  disabled: { type: Boolean, default: false },
  linear: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const num = computed(() => {
  const n = Number(props.modelValue)
  return Number.isFinite(n) ? n : (props.spec ? props.spec.defaultValue : 0)
})
const display = computed(() => props.spec
  ? formatVitalValue(props.spec.format, num.value, props.spec.defaultValue)
  : '')
const format = (v) => formatVitalValue(props.spec && props.spec.format, v, props.spec && props.spec.defaultValue)

function toT (value) {
  const spec = props.spec
  if (!spec) return 0
  if (spec.scale === 'log') {
    const min = Math.max(1e-6, spec.min)
    const max = Math.max(min * 1.0001, spec.max)
    const v = Math.max(min, Math.min(max, value))
    return Math.log(v / min) / Math.log(max / min)
  }
  return Math.min(1, Math.max(0, (value - spec.min) / (spec.max - spec.min || 1)))
}
function fromT (t) {
  const spec = props.spec
  const u = Math.min(1, Math.max(0, t))
  if (spec.scale === 'log') {
    const min = Math.max(1e-6, spec.min)
    const max = Math.max(min * 1.0001, spec.max)
    return min * Math.pow(max / min, u)
  }
  return spec.min + u * (spec.max - spec.min)
}
const fillStyle = computed(() => {
  const t = toT(num.value)
  if (props.linear === 'y') return { height: (t * 100) + '%' }
  return { width: (t * 100) + '%' }
})

function cycle (dir) {
  if (props.disabled || !props.spec || !props.spec.options) return
  const options = props.spec.options
  const i = options.indexOf(props.modelValue)
  emit('update:modelValue', options[(i + dir + options.length) % options.length])
}

function beginLin (e) {
  if (props.disabled || !props.spec) return
  const track = e.currentTarget.querySelector('.lin-track') || e.currentTarget
  const apply = (ev) => {
    const point = ev.touches ? ev.touches[0] : ev
    const rect = track.getBoundingClientRect()
    const t = props.linear === 'y'
      ? 1 - (point.clientY - rect.top) / Math.max(1, rect.height)
      : (point.clientX - rect.left) / Math.max(1, rect.width)
    emit('update:modelValue', fromT(t))
  }
  apply(e)
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    apply(ev)
  }
  const end = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', end)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
</script>

<style scoped>
.txt, .lin {
  min-width: 72px;
  min-height: 54px;
  padding: 6px 8px;
  border-radius: 6px;
  background: #0c0e11;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  box-sizing: border-box;
}
.txt-lab {
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b939e;
}
.txt-val {
  font-size: 12px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #e7eaee;
}
.lin { cursor: ns-resize; }
.lin.x { cursor: ew-resize; min-width: 0; width: 100%; }
.lin.y { height: 100%; min-height: 120px; }
.lin-track {
  position: relative;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 99px;
  overflow: hidden;
}
.lin.x .lin-track { width: 100%; height: 6px; margin: 8px 0; }
.lin.y .lin-track { width: 6px; flex: 1; min-height: 64px; display: flex; align-items: flex-end; }
.lin-fill { background: #d5dee6; border-radius: 99px; }
.lin.x .lin-fill { height: 100%; }
.lin.y .lin-fill { width: 100%; }
.dim { opacity: 0.35; pointer-events: none; }
</style>
