<template>
  <view
    class="k"
    :class="['sz-' + size, { dim: disabled, drag: dragging }]"
    :style="accentStyle"
    :aria-label="label"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    role="slider"
    tabindex="0"
    @mousedown.stop.prevent="begin"
    @touchstart.stop.prevent="begin"
    @wheel.stop.prevent="onWheel"
    @keydown.stop="onKey"
    @dblclick.stop="reset"
    @contextmenu.prevent
  >
    <text v-if="label" class="lab">{{ label }}</text>
    <svg class="svg" viewBox="0 0 80 80">
      <defs>
        <radialGradient :id="bodyId" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stop-color="#2A3140"/>
          <stop offset="55%" stop-color="#161B24"/>
          <stop offset="100%" stop-color="#0C0F16"/>
        </radialGradient>
        <linearGradient :id="dualId" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--dsp-accent)"/>
          <stop offset="100%" stop-color="var(--dsp-accent-2)"/>
        </linearGradient>
        <filter :id="glowId" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      <path :d="track" fill="none" class="track" stroke-linecap="round" pathLength="270"/>
      <path
        :d="track"
        fill="none"
        class="arc"
        stroke-linecap="round"
        pathLength="270"
        :stroke-dasharray="arcDash"
        :style="dual ? { stroke: 'url(#' + dualId + ')' } : null"
        :filter="'url(#' + glowId + ')'"
      />
      <circle cx="40" cy="40" r="22" :fill="'url(#' + bodyId + ')'" class="body"/>
      <ellipse cx="36" cy="30" rx="12" ry="7" fill="rgba(255,255,255,0.07)"/>
      <line :x1="hub.x" :y1="hub.y" :x2="tip.x" :y2="tip.y" class="needle"/>
      <circle cx="40" cy="40" r="2.2" class="hub"/>
    </svg>
    <text v-if="showValue" class="val">{{ display }}</text>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1 },
  defaultValue: { type: Number, default: 0 },
  label: { type: String, default: '' },
  format: { type: Function, default: null },
  disabled: { type: Boolean, default: false },
  showValue: { type: Boolean, default: true },
  size: { type: String, default: 'md' },
  scale: { type: String, default: 'lin' },
  accent: { type: String, default: '' },
  dual: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])
const dragging = ref(false)
const uid = Math.random().toString(36).slice(2, 8)
const glowId = 'kg' + uid
const bodyId = 'kb' + uid
const dualId = 'kd' + uid

const accentStyle = computed(() => props.accent ? { '--dsp-accent': props.accent } : null)

function toT (value) {
  if (props.scale === 'log') {
    const min = Math.max(1e-6, props.min)
    const max = Math.max(min * 1.0001, props.max)
    const v = Math.max(min, Math.min(max, value))
    return Math.log(v / min) / Math.log(max / min)
  }
  const span = props.max - props.min || 1
  return Math.min(1, Math.max(0, (value - props.min) / span))
}

function fromT (t) {
  const u = Math.min(1, Math.max(0, t))
  if (props.scale === 'log') {
    const min = Math.max(1e-6, props.min)
    const max = Math.max(min * 1.0001, props.max)
    return min * Math.pow(max / min, u)
  }
  return props.min + u * (props.max - props.min)
}

function polar (u, radius) {
  const a = (-225 + u * 270) * Math.PI / 180
  return { x: 40 + Math.cos(a) * radius, y: 40 + Math.sin(a) * radius }
}

const t = computed(() => toT(props.modelValue))

const track = computed(() => {
  const a = polar(0, 29)
  const b = polar(0.999, 29)
  return `M ${a.x} ${a.y} A 29 29 0 1 1 ${b.x} ${b.y}`
})

const arcDash = computed(() => {
  const filled = Math.max(0.2, t.value * 270)
  return `${filled} 270`
})
const hub = computed(() => polar(t.value, 6))
const tip = computed(() => polar(t.value, 16))
const display = computed(() => props.format ? props.format(props.modelValue) : props.modelValue.toFixed(2))

function set (next) {
  if (props.disabled) return
  emit('update:modelValue', Math.min(props.max, Math.max(props.min, next)))
}

function begin (e) {
  if (props.disabled) return
  dragging.value = true
  const isTouch = !!e.touches
  const startY = isTouch ? e.touches[0].clientY : e.clientY
  const startT = t.value
  const span = isTouch ? 110 : 140
  const move = (ev) => {
    if (ev.cancelable) ev.preventDefault()
    const y = ev.touches ? ev.touches[0].clientY : ev.clientY
    set(fromT(startT - (y - startY) / span))
  }
  const end = () => {
    dragging.value = false
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
  set(fromT(t.value - Math.sign(e.deltaY) * 0.02))
}

function onKey (e) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(fromT(t.value + 0.02))
  if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(fromT(t.value - 0.02))
}

function reset () { set(props.defaultValue) }
</script>

<style scoped>
.k {
  width: 92px;
  display: flex;
  flex-direction: column;
  align-items: center;
  touch-action: none;
  cursor: ns-resize;
  user-select: none;
}
.k.sz-sm { width: 76px; }
.k.sz-lg { width: 112px; }
.k.sz-xl { width: 156px; }
.k.dim { opacity: 0.35; pointer-events: none; }
.svg { width: 100%; height: auto; }
.body { stroke: rgba(255,255,255,0.08); stroke-width: 1; }
.track { stroke: rgba(255,255,255,0.08); stroke-width: 2.2; }
.arc { stroke: var(--dsp-accent, #C084FC); stroke-width: 2.4; fill: none; }
.needle {
  stroke: #F4F1EA;
  stroke-width: 1.6;
  stroke-linecap: round;
}
.hub { fill: #F4F1EA; }
.k:hover .arc, .k.drag .arc { stroke-width: 3.1; }
.k:hover .needle, .k.drag .needle { stroke: #fff; }
.lab {
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--dsp-muted, #6B7380);
  margin-bottom: 2px;
}
.val {
  font-size: 13px;
  font-weight: 500;
  color: var(--dsp-accent, #C084FC);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.k.sz-xl .val { font-size: 22px; font-weight: 600; margin-top: 6px; color: var(--dsp-accent); }
.k.sz-xl .lab { font-size: 11px; }

@media (max-width: 720px) {
  .k,
  .k.sz-sm,
  .k.sz-lg {
    width: min(152px, 100%);
  }
  .k.sz-xl { width: min(200px, 100%); }
  .lab { font-size: 11px; }
  .val { font-size: 15px; }
}
</style>
