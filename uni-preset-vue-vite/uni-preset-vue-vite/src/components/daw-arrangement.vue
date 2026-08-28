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
        <view class="playhead-top" :class="{ live: session.playing }" :style="{ left: playX + 'px' }" />
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
          :style="{ top: (t * session.trackHeight) + 'px', height: session.trackHeight + 'px' }"
        />
        <view
          v-for="clip in session.clips"
          :key="clip.id"
          class="clip"
          :class="{ on: session.clips[session.selectedClip] && session.clips[session.selectedClip].id === clip.id }"
          :style="clipStyle(clip)"
          @mousedown.stop="startDragClip(clip, $event)"
          @dblclick.stop="openClip(clip)"
          @contextmenu.prevent="openClipMenu(clip, $event)"
        >
          <text class="clip-name">{{ clip.name }}</text>
          <view class="handle left" @mousedown.stop="startResize(clip, 'left', $event)" />
          <view class="handle right" @mousedown.stop="startResize(clip, 'right', $event)" />
          <view v-if="clip.midi && clip.notes && clip.notes.length" class="notes">
            <view
              v-for="note in notePreview(clip)"
              :key="note.id"
              class="mini-note"
              :style="miniNoteStyle(clip, note)"
            />
          </view>
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
        <view class="playhead" :class="{ live: session.playing }" :style="{ left: playX + 'px' }" />
        <view v-if="session.openMenu === 'clip-menu'" class="clip-menu" :style="clipMenuStyle" @click.stop>
          <view class="drop-item" @click="openSelectedClip">Open Piano Roll</view>
          <view class="drop-item" @click="dupSelected">Duplicate</view>
          <view class="drop-item" @click="loopToSelected">Set Loop to Clip</view>
          <view class="drop-item" @click="deleteSelected">Delete</view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  session,
  snapBeat,
  setPositionBeats,
  setPixelsPerBeat,
  toggleSnap,
  addClipFromFile,
  addMidiClip,
  isSupportedFile,
  moveClip,
  resizeClip,
  deleteClip,
  duplicateClip,
  setLoopRange,
  selectClip,
  selectTrack,
  setEditorTab,
  isTrackAudible,
  closeMenus
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
const clipMenuStyle = ref({ left: '0px', top: '0px' })
const menuClipId = ref(-1)

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
  height: Math.max(session.tracks.length * session.trackHeight, 400) + 'px'
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
  const audible = isTrackAudible(clip.trackIndex)
  return {
    left: clip.startBeat * session.pixelsPerBeat + 'px',
    top: clip.trackIndex * session.trackHeight + 6 + 'px',
    width: clip.lengthBeats * session.pixelsPerBeat + 'px',
    height: session.trackHeight - 12 + 'px',
    background: clip.colour,
    opacity: audible ? 1 : 0.45
  }
}

function notePreview (clip) {
  return (clip.notes || []).slice(0, 64)
}

function miniNoteStyle (clip, note) {
  const notes = clip.notes || []
  const pitches = notes.map((item) => item.pitch)
  const lo = Math.min.apply(null, pitches)
  const hi = Math.max.apply(null, pitches)
  const span = Math.max(1, hi - lo)
    const start = note.start != null ? note.start : ((note.startTick || 0) / 960)
    const duration = note.duration != null ? note.duration : ((note.durationTick || 240) / 960)
    const bodyH = session.trackHeight - 26
    return {
      left: (start / Math.max(0.01, clip.lengthBeats) * 100) + '%',
      width: (duration / Math.max(0.01, clip.lengthBeats) * 100) + '%',
      bottom: ((note.pitch - lo) / span * (bodyH - 3)) + 'px',
      height: '3px'
    }
}

function openClip (clip) {
  const index = session.clips.findIndex((item) => item.id === clip.id)
  selectClip(index)
  setEditorTab('piano')
}

function openClipMenu (clip, e) {
  const index = session.clips.findIndex((item) => item.id === clip.id)
  selectClip(index)
  menuClipId.value = clip.id
  const canvas = (e.currentTarget && e.currentTarget.closest && e.currentTarget.closest('.canvas')) || e.currentTarget
  const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 }
  clipMenuStyle.value = { left: (e.clientX - rect.left) + 'px', top: (e.clientY - rect.top) + 'px' }
  session.openMenu = 'clip-menu'
}

function menuClip () {
  return session.clips.find((item) => item.id === menuClipId.value)
}

function openSelectedClip () {
  const clip = menuClip()
  closeMenus()
  if (clip) openClip(clip)
}

function dupSelected () {
  const clip = menuClip()
  closeMenus()
  duplicateClip(clip)
}

function deleteSelected () {
  const clip = menuClip()
  closeMenus()
  deleteClip(clip)
}

function loopToSelected () {
  const clip = menuClip()
  closeMenus()
  if (clip) setLoopRange(clip.startBeat, clip.startBeat + clip.lengthBeats)
}

function startResize (clip, edge, e) {
  const origStart = clip.startBeat
  const origLength = clip.lengthBeats
  const startX = e.clientX
  const move = (ev) => {
    const delta = (ev.clientX - startX) / session.pixelsPerBeat
    if (edge === 'left') {
      const nextStart = snapBeat(origStart + delta)
      const nextLength = origLength + (origStart - nextStart)
      if (nextLength >= 0.25) {
        clip.startBeat = Math.max(0, nextStart)
        clip.lengthBeats = nextLength
      }
    } else {
      clip.lengthBeats = Math.max(0.25, snapBeat(origLength + delta) || origLength + delta)
    }
  }
  const up = () => {
    resizeClip(clip, clip.startBeat, clip.lengthBeats)
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onRulerDown (e) {
  const rect = e.currentTarget.getBoundingClientRect()
  const beatAt = (clientX) => snapBeat((clientX - rect.left + scrollX.value) / session.pixelsPerBeat)
  if (e.altKey) {
    const start = beatAt(e.clientX)
    const move = (ev) => setLoopRange(start, beatAt(ev.clientX))
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return
  }
  setPositionBeats(beatAt(e.clientX))
  const move = (ev) => setPositionBeats(beatAt(ev.clientX))
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
  const y = e.clientY - rect.top
  setPositionBeats(snapBeat(x / session.pixelsPerBeat))
  const track = Math.min(session.tracks.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
  selectTrack(track)
  if (e.detail === 2 && track > 0) addMidiClip(track, snapBeat(x / session.pixelsPerBeat))
}

function startDragClip (clip, e) {
  const index = session.clips.findIndex((item) => item.id === clip.id)
  selectClip(index)
  draggingClip.value = clip.id
  dragStartBeat.value = clip.startBeat
  dragStartX.value = e.clientX
  const startTrack = clip.trackIndex
  const startY = e.clientY
  const move = (ev) => {
    const found = session.clips.find((c) => c.id === clip.id)
    if (!found) return
    found.startBeat = snapBeat(dragStartBeat.value + (ev.clientX - dragStartX.value) / session.pixelsPerBeat)
    const track = Math.min(session.tracks.length - 1, Math.max(1, startTrack + Math.round((ev.clientY - startY) / session.trackHeight)))
    if (session.tracks[track] && session.tracks[track].type !== 'master') found.trackIndex = track
  }
  const up = () => {
    draggingClip.value = -1
    const found = session.clips.find((c) => c.id === clip.id)
    if (found) moveClip(found, found.startBeat, found.trackIndex)
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
  const track = Math.min(session.tracks.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
  ghost.value = {
    left: beat * session.pixelsPerBeat + 'px',
    top: track * session.trackHeight + 6 + 'px',
    width: 4 * session.pixelsPerBeat + 'px',
    height: session.trackHeight - 12 + 'px'
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
  let track = Math.min(session.tracks.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
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
  pointer-events: none;
}
.playhead-top.live {
  box-shadow: 0 0 10px 2px rgba(77, 163, 255, 0.55);
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
  color: #fff;
  font-size: 12px;
  cursor: grab;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.16);
  overflow: hidden;
  white-space: nowrap;
}
.clip.on { box-shadow: inset 0 0 0 1.6px #fff; }
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: ew-resize;
  z-index: 3;
}
.handle.left { left: 0; }
.handle.right { right: 0; }
.clip-menu {
  position: absolute;
  min-width: 160px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  z-index: 20;
}
.drop-item { padding: 6px 12px; color: #e6e6e6; font-size: 12px; cursor: pointer; }
.drop-item:hover { background: #3a3a3a; }
.clip-name {
  position: absolute;
  left: 6px;
  top: 1px;
  font-size: 10.5px;
  z-index: 1;
}
.notes {
  position: absolute;
  left: 2px;
  right: 2px;
  top: 14px;
  bottom: 2px;
}
.mini-note {
  position: absolute;
  background: rgba(255,255,255,0.7);
  border-radius: 1px;
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
  z-index: 6;
}
.playhead.live {
  box-shadow: 0 0 12px 3px rgba(77, 163, 255, 0.4);
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
