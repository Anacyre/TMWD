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

const MAX_ROW_PX = 5

const hostRef = ref(null)
let canvasEl = null
let resizeObserver = null

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
  if (typeof ResizeObserver === 'function') {
    resizeObserver = new ResizeObserver(() => paint())
    resizeObserver.observe(parent)
  }
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
  const clip = props.clip
  if (clip && (clip.kind === 'audio' || clip.midi === false) && clip.peaks && clip.peaks.length) {
    const peaks = clip.peaks
    const mid = height / 2
    ctx.fillStyle = 'rgba(255,255,255,0.82)'
    const offset = Math.max(0, Number(clip.audioOffsetBeats) || 0)
    const startFrac = clip.audioDuration ? offset / Math.max(0.01, (clip.lengthBeats || 1) + offset) : 0
    for (let i = 0; i < width; i++) {
      const t = startFrac + (i / width) * (1 - startFrac)
      const idx = Math.min(peaks.length - 1, Math.floor(t * peaks.length))
      const amp = Math.max(0.04, Number(peaks[idx]) || 0)
      const h = amp * (height - 2)
      ctx.fillRect(i, mid - h / 2, 1, h)
    }
    return
  }
  const model = buildClipPreview(props.clip)
  if (!model.bars.length) return
  const rows = model.hi - model.lo + 1
  const rh = Math.min(MAX_ROW_PX, height / rows)
  const top = (height - rh * rows) / 2
  const barH = Math.max(1, rh - (rh > 2.5 ? 1 : 0))
  ctx.fillStyle = '#fff'
  model.bars.forEach((bar) => {
    const x = bar.x0 * width
    const w = Math.max(1.5, (bar.x1 - bar.x0) * width - 1)
    const y = top + (model.hi - bar.pitch) * rh
    ctx.globalAlpha = bar.alpha
    ctx.fillRect(x, y, w, barH)
  })
  ctx.globalAlpha = 1
}

watch(() => [
  props.clip && props.clip.id,
  props.revision,
  props.clip && props.clip.lengthBeats,
  props.clip && props.clip.loopLengthBeats,
  props.clip && props.clip.notes && props.clip.notes.length,
  props.clip && props.clip.sourceId,
  props.clip && props.clip.peaks && props.clip.peaks.length
], () => {
  nextTick(paint)
})

onMounted(() => { nextTick(paint) })
onUnmounted(() => {
  if (resizeObserver) resizeObserver.disconnect()
  resizeObserver = null
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
