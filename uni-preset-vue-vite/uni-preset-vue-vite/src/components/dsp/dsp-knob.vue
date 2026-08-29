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
        <linearGradient :id="bodyId" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFFFFF"/>
          <stop offset="100%" stop-color="#EFEDE9"/>
        </linearGradient>
        <linearGradient :id="dualId" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="var(--x-accent, #E08B2F)"/>
          <stop offset="100%" stop-color="var(--x-cool, #4E7FA8)"/>
        </linearGradient>
      </defs>
      <line
        v-for="(tick, i) in ticks"
        :key="i"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
        class="tick"
      />
      <path :d="track" fill="none" class="track" stroke-linecap="round" pathLength="270"/>
      <path
        :d="track"
        fill="none"
        class="arc"
        stroke-linecap="round"
        pathLength="270"
        :stroke-dasharray="arcDash"
        :style="dual ? { stroke: 'url(#' + dualId + ')' } : null"
      />
      <circle cx="40" cy="40" r="21" :fill="'url(#' + bodyId + ')'" class="body"/>
      <line :x1="hub.x" :y1="hub.y" :x2="tip.x" :y2="tip.y" class="needle"/>
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
const bodyId = 'kb' + uid
const dualId = 'kd' + uid

const accentStyle = computed(() => props.accent
  ? { '--x-accent': props.accent, '--dsp-accent': props.accent }
  : null)

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
const hub = computed(() => polar(t.value, 5))
const tip = computed(() => polar(t.value, 18))

// Engraved bezel ticks at the ends and centre of the 270° sweep.
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((u) => {
  const a = polar(u, 33)
  const b = polar(u, 36)
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y }
}))
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
  width: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  touch-action: none;
  cursor: ns-resize;
  user-select: none;
}
.k.sz-sm { width: 58px; }
.k.sz-lg { width: 96px; }
.k.sz-xl { width: 190px; }
.k.dim { opacity: 0.4; pointer-events: none; }
.svg { width: 100%; height: auto; }
.body {
  stroke: rgba(38, 40, 44, 0.18);
  stroke-width: 1;
}
.tick { stroke: rgba(38, 40, 44, 0.22); stroke-width: 1; }
.track { stroke: rgba(38, 40, 44, 0.14); stroke-width: 2.6; }
.arc { stroke: var(--x-accent, #E08B2F); stroke-width: 2.6; fill: none; }
.needle {
  stroke: var(--x-ink-2, #5A5E66);
  stroke-width: 1.8;
  stroke-linecap: round;
}
.k:hover .arc, .k.drag .arc { stroke: var(--x-accent-hi, #F2A64A); stroke-width: 3.2; }
.k:hover .needle, .k.drag .needle { stroke: var(--x-ink, #26282C); }
.lab {
  font-size: 9px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--x-ink-3, #8E939C);
  margin-bottom: 3px;
}
.val {
  font-size: 11px;
  font-weight: 500;
  color: var(--x-ink, #26282C);
  margin-top: 3px;
  font-variant-numeric: tabular-nums;
}
.k.sz-sm .lab { font-size: 8px; letter-spacing: 0.1em; }
.k.sz-sm .val { font-size: 10px; }
.k.sz-xl .val {
  font-size: 30px;
  font-weight: 300;
  margin-top: 8px;
  color: var(--x-ink, #26282C);
  letter-spacing: -0.01em;
}
.k.sz-xl .lab { font-size: 10px; margin-bottom: 6px; }

@media (max-width: 720px) {
  .k,
  .k.sz-sm,
  .k.sz-lg {
    width: min(140px, 100%);
  }
  .k.sz-xl { width: min(220px, 100%); }
  .lab { font-size: 10px; }
  .val { font-size: 13px; }
}
</style>
