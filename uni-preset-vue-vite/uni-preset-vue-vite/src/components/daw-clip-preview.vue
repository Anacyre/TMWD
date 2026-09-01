<template>
  <view class="preview" ref="hostRef" />
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { buildClipPreview } from '../model/playlist-model.js'

const props = defineProps({
  clip: { type: Object, default: null },
  revision: { type: Number, default: 0 }
})

const hostRef = ref(null)
let canvasEl = null

function resolveHost () {
  let el = hostRef.value
  if (!el) return null
  if (el.nodeType === 1) return el
  if (el.$el && el.$el.nodeType === 1) return el.$el
  return null
}

function mountCanvas () {
  if (canvasEl) return canvasEl
  const parent = resolveHost()
  if (!parent || typeof document === 'undefined') return null
  const el = document.createElement('canvas')
  el.className = 'preview-canvas'
  el.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;'
  parent.appendChild(el)
  canvasEl = el
  return el
}

function paint () {
  const el = mountCanvas()
  const parent = el && el.parentNode
  if (!el || !parent) return
  const width = Math.max(1, parent.clientWidth || 1)
  const height = Math.max(1, parent.clientHeight || 1)
  const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)
  const bw = Math.floor(width * dpr)
  const bh = Math.floor(height * dpr)
  if (el.width !== bw) el.width = bw
  if (el.height !== bh) el.height = bh
  const ctx = el.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const cols = buildClipPreview(props.clip)
  if (!cols.length) return
  const rows = (cols[0] && cols[0].length) || 8
  const cw = width / cols.length
  const rh = height / rows
  ctx.fillStyle = '#fff'
  for (let x = 0; x < cols.length; x++) {
    const col = cols[x]
    for (let y = 0; y < rows; y++) {
      const cell = col[y]
      if (!(cell > 0)) continue
      ctx.globalAlpha = cell
      ctx.fillRect(x * cw + cw * 0.1, height - (y + 1) * rh, cw * 0.8, rh * 0.9)
    }
  }
  ctx.globalAlpha = 1
}

watch(() => [props.clip && props.clip.id, props.revision, props.clip && props.clip.lengthBeats], () => {
  nextTick(paint)
})

onMounted(() => { nextTick(paint) })
onUnmounted(() => {
  if (canvasEl && canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl)
  canvasEl = null
})
</script>

<style scoped>
.preview {
  position: absolute;
  left: 2px;
  right: 2px;
  top: 14px;
  bottom: 2px;
  pointer-events: none;
}
</style>
