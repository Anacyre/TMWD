<template>
  <view ref="host" class="dsp-canvas" :class="{ fill }" :style="wrapStyle" />
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'

const props = defineProps({
  height: { type: Number, default: 248 },
  fill: { type: Boolean, default: false }
})
const wrapStyle = computed(() => props.fill ? null : { height: props.height + 'px' })
const emit = defineEmits(['ready', 'pointerdown', 'dblclick'])
const host = ref(null)
let canvasEl = null

function resolveHost () {
  let el = host.value
  if (!el) return null
  if (el.nodeType === 1) return el
  if (el.$el && el.$el.nodeType === 1) return el.$el
  if (typeof el.$el === 'object' && el.$el && el.$el.querySelector) return el.$el
  return null
}

function mountCanvas (tries) {
  const parent = resolveHost()
  if (!parent || typeof document === 'undefined') {
    if (tries < 30) requestAnimationFrame(() => mountCanvas(tries + 1))
    return
  }
  if (canvasEl) return
  const el = document.createElement('canvas')
  el.className = 'dsp-canvas-el'
  el.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;position:absolute;inset:0;'
  parent.style.position = parent.style.position || 'relative'
  parent.appendChild(el)
  canvasEl = el
  const down = (e) => {
    e.preventDefault()
    emit('pointerdown', e)
  }
  el.addEventListener('mousedown', down)
  el.addEventListener('touchstart', down, { passive: false })
  el.addEventListener('dblclick', (e) => {
    e.preventDefault()
    emit('dblclick', e)
  })
  emit('ready', el)
}

onMounted(() => {
  nextTick(() => mountCanvas(0))
})

onUnmounted(() => {
  if (canvasEl && canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl)
  canvasEl = null
})

defineExpose({
  getElement () { return canvasEl }
})
</script>

<style scoped>
.dsp-canvas {
  width: 100%;
  display: block;
  position: relative;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.dsp-canvas.fill {
  height: 100%;
  min-height: 0;
}
</style>
