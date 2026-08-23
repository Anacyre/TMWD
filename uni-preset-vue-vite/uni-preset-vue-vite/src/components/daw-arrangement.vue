<template>
  <view class="arr">
    <view
      class="ruler"
      @mousedown="onRulerDown"
    >
      <text class="sig">{{ session.timeSigNum }}/{{ session.timeSigDen }}</text>
      <view class="ruler-scroll" :style="{ transform: `translateX(${-scrollX}px)` }">
        <view
          v-if="session.looping"
          class="loop-band"
          :style="loopStyle"
        />
        <view
          v-for="bar in bars"
          :key="bar"
          class="bar-mark"
          :style="{ left: (bar * session.timeSigNum * session.pixelsPerBeat) + 'px' }"
        >
          <text>{{ bar + 1 }}</text>
        </view>
        <view class="playhead-top" :style="{ left: playX + 'px' }" />
      </view>
      <view class="ruler-tools">
        <view class="icon-btn" :class="{ on: session.snap }" title="Snap" @click.stop="toggleSnap">
          <daw-icon name="magnet" :color="session.snap ? '#4da3ff' : ''" />
        </view>
        <view class="icon-btn" title="Ctrl + wheel to zoom">
          <daw-icon name="grid" />
        </view>
      </view>
    </view>

    <scroll-view
      class="canvas-view"
      scroll-x
      scroll-y
      :scroll-left="scrollX"
      :scroll-top="scrollTop"
      :show-scrollbar="true"
      @scroll="onScroll"
    >
      <view
        class="canvas"
        :style="canvasStyle"
        @mousedown="onCanvasDown"
        @wheel="onWheel"
        @dragover="onDragOver"
        @drop="onDrop"
        @dragenter="draggingFiles = true"
        @dragleave="onDragLeave"
      >
        <view v-if="session.looping" class="loop-fill" :style="loopFillStyle" />
        <view
          v-for="beat in beats"
          :key="'b'+beat"
          class="vline"
          :class="{ bar: beat % session.timeSigNum === 0 }"
          :style="{ left: (beat * session.pixelsPerBeat) + 'px' }"
        />
        <view
          v-for="(track, t) in session.tracks"
          :key="'t'+track.id"
          class="lane"
          :style="{ top: (t * TRACK_HEIGHT) + 'px', height: TRACK_HEIGHT + 'px' }"
        />
        <view
          v-for="clip in session.clips"
          :key="clip.id"
          class="clip"
          :style="clipStyle(clip)"
          @mousedown.stop="startDragClip(clip, $event)"
        >
          <text>{{ clip.name }}</text>
        </view>
        <view v-if="!session.clips.length" class="hint">
          <text class="hint-title">Drag Media Files Here</text>
          <text class="hint-sub">Supported file types: MP3, MP4, WAV, AAC, OGG, FLAC, MID</text>
        </view>
        <view
          v-if="draggingFiles && ghost"
          class="ghost"
          :style="ghost"
        />
        <view class="playhead" :style="{ left: playX + 'px' }" />
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  session,
  TRACK_HEIGHT,
  snapBeat,
  setPositionBeats,
  setPixelsPerBeat,
  toggleSnap,
  addClipFromFile,
  isSupportedFile
} from '../store/session.js'

defineProps({
  scrollTop: { type: Number, default: 0 }
})
const emit = defineEmits(['scroll'])

const scrollX = ref(0)
const draggingFiles = ref(false)
const draggingClip = ref(-1)
const dragStartBeat = ref(0)
const dragStartX = ref(0)
const ghost = ref(null)

const contentBeats = computed(() => {
  let maxBeat = 64
  maxBeat = Math.max(maxBeat, session.positionBeats + 16, session.loopEnd + 8)
  session.clips.forEach((c) => {
    maxBeat = Math.max(maxBeat, c.startBeat + c.lengthBeats + 8)
  })
  return maxBeat
})

const canvasStyle = computed(() => ({
  width: Math.ceil(contentBeats.value * session.pixelsPerBeat) + 'px',
  height: Math.max(session.tracks.length * TRACK_HEIGHT, 400) + 'px'
}))

const bars = computed(() => {
  const count = Math.ceil(contentBeats.value / session.timeSigNum) + 1
  return Array.from({ length: count }, (_, i) => i)
})
const beats = computed(() => Array.from({ length: Math.ceil(contentBeats.value) + 1 }, (_, i) => i))
const playX = computed(() => session.positionBeats * session.pixelsPerBeat)

const loopStyle = computed(() => ({
  left: session.loopStart * session.pixelsPerBeat + 'px',
  width: Math.max(2, (session.loopEnd - session.loopStart) * session.pixelsPerBeat) + 'px'
}))
const loopFillStyle = computed(() => ({
  left: session.loopStart * session.pixelsPerBeat + 'px',
  width: Math.max(2, (session.loopEnd - session.loopStart) * session.pixelsPerBeat) + 'px'
}))

function clipStyle (clip) {
  return {
    left: clip.startBeat * session.pixelsPerBeat + 'px',
    top: clip.trackIndex * TRACK_HEIGHT + 6 + 'px',
    width: clip.lengthBeats * session.pixelsPerBeat + 'px',
    height: TRACK_HEIGHT - 12 + 'px',
    background: clip.colour
  }
}

function onRulerDown (e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollX.value
  setPositionBeats(snapBeat(x / session.pixelsPerBeat))
  const move = (ev) => {
    const nx = ev.clientX - rect.left + scrollX.value
    setPositionBeats(snapBeat(nx / session.pixelsPerBeat))
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onCanvasDown (e) {
  if (e.target && e.target.closest && e.target.closest('.clip')) return
  const canvas = e.currentTarget
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left + (canvas.scrollLeft || scrollX.value)
  setPositionBeats(snapBeat(x / session.pixelsPerBeat))
}

function startDragClip (clip, e) {
  draggingClip.value = clip.id
  dragStartBeat.value = clip.startBeat
  dragStartX.value = e.clientX
  const startTrack = clip.trackIndex
  const startY = e.clientY
  const move = (ev) => {
    const found = session.clips.find((c) => c.id === clip.id)
    if (!found) return
    found.startBeat = snapBeat(dragStartBeat.value + (ev.clientX - dragStartX.value) / session.pixelsPerBeat)
    const track = Math.min(session.tracks.length - 1, Math.max(1, startTrack + Math.round((ev.clientY - startY) / TRACK_HEIGHT)))
    if (session.tracks[track] && session.tracks[track].type !== 'master') found.trackIndex = track
  }
  const up = () => {
    draggingClip.value = -1
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onScroll (e) {
  scrollX.value = (e.detail && e.detail.scrollLeft) || 0
  emit('scroll', (e.detail && e.detail.scrollTop) || 0)
}

function onWheel (e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.preventDefault) e.preventDefault()
    const old = session.pixelsPerBeat
    setPixelsPerBeat(old * (e.deltaY < 0 ? 1.12 : 0.89))
  }
}

function onDragOver (e) {
  if (e.preventDefault) e.preventDefault()
  draggingFiles.value = true
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollX.value
  const y = e.clientY - rect.top + ((e.currentTarget.scrollTop) || 0)
  const beat = snapBeat(x / session.pixelsPerBeat)
  const track = Math.min(session.tracks.length - 1, Math.max(0, Math.floor(y / TRACK_HEIGHT)))
  ghost.value = {
    left: beat * session.pixelsPerBeat + 'px',
    top: track * TRACK_HEIGHT + 6 + 'px',
    width: 4 * session.pixelsPerBeat + 'px',
    height: TRACK_HEIGHT - 12 + 'px'
  }
}

function onDragLeave () {
  draggingFiles.value = false
  ghost.value = null
}

function onDrop (e) {
  if (e.preventDefault) e.preventDefault()
  draggingFiles.value = false
  ghost.value = null
  const files = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : []
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollX.value
  const y = e.clientY - rect.top + (e.currentTarget.scrollTop || 0)
  const beat = snapBeat(x / session.pixelsPerBeat)
  let track = Math.min(session.tracks.length - 1, Math.max(0, Math.floor(y / TRACK_HEIGHT)))
  files.forEach((file) => {
    if (isSupportedFile(file.name)) addClipFromFile(file, track, beat)
  })
}
</script>

<style scoped>
.arr {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #101010;
  min-width: 0;
  flex: 1;
}
.ruler {
  height: 32px;
  background: #2a2a2a;
  border-bottom: 1px solid #2a2a2a;
  position: relative;
  overflow: hidden;
  cursor: ew-resize;
  user-select: none;
}
.sig {
  position: absolute;
  left: 8px;
  top: 0;
  height: 32px;
  line-height: 32px;
  color: #6a6a6a;
  font-size: 11px;
  z-index: 3;
}
.ruler-scroll { position: absolute; inset: 0 64px 0 0; }
.bar-mark {
  position: absolute;
  top: 8px;
  height: 24px;
  border-left: 1px solid #4a4a4a;
  padding-left: 6px;
  color: #8d8d8d;
  font-size: 12px;
}
.loop-band {
  position: absolute;
  top: 0;
  height: 4px;
  background: rgba(77,163,255,0.35);
}
.playhead-top {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #fff;
}
.ruler-tools {
  position: absolute;
  right: 4px;
  top: 4px;
  display: flex;
  z-index: 4;
}
.icon-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover { background: #353535; }
.icon-btn.on { background: rgba(77,163,255,0.18); }
.canvas-view { flex: 1; height: 0; }
.canvas {
  position: relative;
  min-height: 100%;
  background: #101010;
}
.vline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1c1c1c;
}
.vline.bar { background: #2c2c2c; }
.lane {
  position: absolute;
  left: 0;
  right: 0;
  border-bottom: 1px solid #202020;
  box-sizing: border-box;
}
.loop-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(77,163,255,0.08);
}
.clip {
  position: absolute;
  border-radius: 4px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  color: #fff;
  font-size: 12px;
  cursor: grab;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16);
  overflow: hidden;
  white-space: nowrap;
}
.hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  gap: 8px;
}
.hint-title { color: #6a6a6a; font-size: 16px; }
.hint-sub { color: #6a6a6a; font-size: 13px; }
.ghost {
  position: absolute;
  border-radius: 4px;
  background: rgba(77,163,255,0.2);
  pointer-events: none;
}
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #fff;
  pointer-events: none;
}
.playhead::before {
  content: '';
  position: absolute;
  top: 0;
  left: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}
</style>
