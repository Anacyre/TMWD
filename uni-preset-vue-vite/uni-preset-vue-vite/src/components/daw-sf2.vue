<template>
  <view class="sf2">
    <view class="row">
      <view class="lt-btn" @click="pickFile">Load SoundFont</view>
      <view class="lt-btn ghost" @click="pickWav">Load WAV</view>
    </view>
    <text v-if="track.sf2Name" class="name">{{ track.sf2Name }}</text>
    <text v-else class="hint">Drop an SF2 or WAV, or pick a cloud SoundFont below.</text>
    <view v-if="cloudFonts.length" class="group">
      <view v-for="item in cloudFonts" :key="item.name" class="lt-row" @click="loadCloud(item)">
        <text class="grow">{{ item.name }}</text>
      </view>
    </view>
    <view class="env" ref="envRef" @pointerdown.stop.prevent="dragEnvelope" />
    <view class="knobs">
      <view class="k" @pointerdown.stop.prevent="drag($event, 'attack')"><text class="kv">{{ n(patch.attack) }}</text><text class="kl">Attack</text></view>
      <view class="k" @pointerdown.stop.prevent="drag($event, 'decay')"><text class="kv">{{ n(patch.decay) }}</text><text class="kl">Decay</text></view>
      <view class="k" @pointerdown.stop.prevent="drag($event, 'sustain')"><text class="kv">{{ n(patch.sustain) }}</text><text class="kl">Sustain</text></view>
      <view class="k" @pointerdown.stop.prevent="drag($event, 'release')"><text class="kv">{{ n(patch.release) }}</text><text class="kl">Release</text></view>
    </view>
    <view class="keys">
      <view
        v-for="key in keys"
        :key="key"
        class="key"
        :class="{ black: isBlack(key) }"
        @pointerdown.prevent="play(key)"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { loadSf2File, loadSf2Wav, noteEdited, previewNoteOn, previewNoteOff } from '../store/session.js'
import { listPublicSoundfonts } from '../audio/sf2/index.js'
import { pointerCoord } from '../lib/pointer-drag.js'

const props = defineProps({ track: { type: Object, required: true } })
const cloudFonts = ref([])
const envRef = ref(null)
const patch = computed(() => props.track.sf2Patch || { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 })
let envCanvas = null

function envHost () {
  const el = envRef.value
  if (!el) return null
  if (el.nodeType === 1) return el
  if (el.$el && el.$el.nodeType === 1) return el.$el
  return null
}

function paintEnvelope () {
  const host = envHost()
  if (!host || typeof document === 'undefined') return
  if (!envCanvas) {
    envCanvas = document.createElement('canvas')
    envCanvas.style.cssText = 'width:100%;height:100%;display:block;pointer-events:none;'
    host.appendChild(envCanvas)
  }
  const width = Math.max(1, host.clientWidth || 280)
  const height = Math.max(1, host.clientHeight || 72)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  envCanvas.width = Math.floor(width * dpr)
  envCanvas.height = Math.floor(height * dpr)
  const ctx = envCanvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)
  const p = patch.value
  const attack = Math.max(0.001, Number(p.attack) || 0)
  const decay = Math.max(0.001, Number(p.decay) || 0)
  const sustain = Math.min(1, Math.max(0, Number(p.sustain) || 0))
  const release = Math.max(0.001, Number(p.release) || 0)
  const hold = Math.max(0.25, (attack + decay + release) * 0.35)
  const total = attack + decay + hold + release
  const pad = 8
  const xAt = (t) => pad + (t / total) * (width - pad * 2)
  const yAt = (level) => 8 + (1 - level) * (height - 16)
  const points = [
    [xAt(0), yAt(0)],
    [xAt(attack), yAt(1)],
    [xAt(attack + decay), yAt(sustain)],
    [xAt(attack + decay + hold), yAt(sustain)],
    [xAt(total), yAt(0)]
  ]
  ctx.beginPath()
  ctx.moveTo(points[0][0], yAt(0))
  points.forEach((pt) => ctx.lineTo(pt[0], pt[1]))
  ctx.lineTo(points[points.length - 1][0], yAt(0))
  ctx.closePath()
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(points[0][0], points[0][1])
  points.slice(1).forEach((pt) => ctx.lineTo(pt[0], pt[1]))
  ctx.strokeStyle = '#f2f5f8'
  ctx.lineWidth = 2
  ctx.stroke()
  points.slice(1, 4).forEach((pt) => {
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 3.5, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  })
}

onMounted(() => {
  listPublicSoundfonts().then((rows) => { cloudFonts.value = rows }).catch(() => {})
  nextTick(paintEnvelope)
})
onUnmounted(() => {
  if (envCanvas && envCanvas.parentNode) envCanvas.parentNode.removeChild(envCanvas)
  envCanvas = null
})
watch(patch, () => nextTick(paintEnvelope), { deep: true })
async function loadCloud (item) {
  const res = await fetch(item.url)
  const blob = await res.blob()
  const file = new File([blob], item.name, { type: 'application/octet-stream' })
  await loadSf2File(props.track, file)
}
const keys = computed(() => {
  const out = []
  for (let p = 48; p <= 72; p++) out.push(p)
  return out
})
function isBlack (p) {
  const n = p % 12
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10
}
function n (v) { return (Number(v) || 0).toFixed(2) }

function pickFile () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sf2,audio/x-soundfont'
  input.onchange = () => { if (input.files && input.files[0]) loadSf2File(props.track, input.files[0]) }
  input.click()
}
function pickWav () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/wav,audio/x-wav,.wav,.mp3,.ogg'
  input.onchange = () => { if (input.files && input.files[0]) loadSf2Wav(props.track, input.files[0]) }
  input.click()
}
function writePatch (field, value) {
  const max = field === 'sustain' ? 1 : 2
  const next = Math.min(max, Math.max(0.001, value))
  props.track.sf2Patch = { ...patch.value, [field]: next }
}
function dragField (e, field, readStart) {
  const origin = pointerCoord(e)
  const start = readStart()
  let y0 = origin ? origin.y : null
  const move = (ev) => {
    const p = pointerCoord(ev)
    if (!p) return
    if (y0 == null) { y0 = p.y; return }
    const max = field === 'sustain' ? 1 : 2
    writePatch(field, start - (p.y - y0) * max / 140)
  }
  const up = () => {
    noteEdited()
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function drag (e, field) {
  dragField(e, field, () => Number(patch.value[field]) || 0)
}
function envelopeField (x, host) {
  const width = Math.max(1, host.clientWidth || 1)
  const third = width / 3
  if (x < third) return 'attack'
  if (x < third * 2) return 'decay'
  return x < width * 0.72 ? 'sustain' : 'release'
}
function dragEnvelope (e) {
  const host = envHost()
  const origin = pointerCoord(e)
  if (!host || !origin) return
  const rect = host.getBoundingClientRect()
  const field = envelopeField(origin.x - rect.left, host)
  dragField(e, field, () => Number(patch.value[field]) || 0)
}
function play (pitch) {
  previewNoteOn(props.track, pitch, 0.85)
  const up = () => {
    previewNoteOff(props.track, pitch)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}
</script>

<style scoped>
.sf2 { display: flex; flex-direction: column; gap: 12px; padding: 10px; }
.row { display: flex; gap: 8px; }
.lt-btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #2b2b2b;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.lt-btn.ghost { background: #161616; }
.name { font-weight: 600; }
.hint { color: #8b939e; font-size: 13px; }
.group { display: flex; flex-direction: column; gap: 4px; }
.lt-row { min-height: 44px; display: flex; align-items: center; padding: 0 10px; background: #161616; border-radius: 8px; cursor: pointer; }
.grow { flex: 1; }
.env {
  height: 84px;
  border-radius: 10px;
  background: #161616;
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: ns-resize;
}
.knobs { display: grid; grid-template-columns: repeat(4, minmax(72px, 1fr)); gap: 8px; }
.k { min-height: 56px; background: #243044; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; touch-action: none; }
.kv { color: #f2f5f8; }
.kl { font-size: 10px; color: #9aa6b4; }
.keys { display: flex; height: 72px; gap: 2px; }
.key { flex: 1; background: #e8edf3; border-radius: 0 0 6px 6px; }
.key.black { background: #1b1b1b; flex: 0.6; }
</style>
