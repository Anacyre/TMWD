<template>
  <view class="roll">
    <view v-if="!embedded" class="head">
      <text>PIANO ROLL</text>
      <text class="sub">{{ clip ? clip.name : 'No clip selected' }}</text>
      <view class="spacer" />
      <view class="icon-btn" @click.stop="toggleEditor">×</view>
    </view>
    <view v-if="clip && clip.midi" class="tools">
      <text>Draw {{ durationLabel }}</text>
      <view class="chip" v-for="d in durations" :key="d.label" :class="{ on: drawDuration === d.beats }" @click="drawDuration = d.beats">{{ d.label }}</view>
      <text class="vel">Vel {{ drawVelocity }}</text>
      <input class="vel-input" type="range" min="1" max="127" :value="drawVelocity" @input="drawVelocity = Number($event.target.value)">
    </view>
    <view v-if="!clip || !clip.midi" class="empty">
      <text>Select a MIDI clip to edit notes. Loaded VST instruments preview from the keyboard.</text>
    </view>
    <view v-else class="body">
      <view class="keys">
        <view
          v-for="pitch in pitches"
          :key="'k' + pitch"
          class="key"
          :class="{ black: isBlack(pitch), held: held === pitch }"
          :style="{ height: NOTE_H + 'px' }"
          @mousedown.stop="startPreview(pitch)"
          @mouseup="stopPreview"
          @mouseleave="stopPreview"
        >
          <text v-if="pitch % 12 === 0">{{ pitchName(pitch) }}</text>
        </view>
      </view>
      <scroll-view class="grid-view" scroll-x scroll-y>
        <view
          class="grid"
          :style="gridStyle"
          @mousedown="onGridDown"
        >
          <view
            v-for="beat in beats"
            :key="'b' + beat"
            class="vline"
            :class="{ bar: beat % session.timeSigNum === 0 }"
            :style="{ left: (beat * session.pixelsPerBeat) + 'px' }"
          />
          <view
            v-for="pitch in pitches"
            :key="'r' + pitch"
            class="hline"
            :class="{ black: isBlack(pitch) }"
            :style="{ top: ((MAX_PITCH - pitch) * NOTE_H) + 'px', height: NOTE_H + 'px' }"
          />
          <view
            v-for="note in clip.notes"
            :key="note.id"
            class="note"
            :class="{ on: selectedNote === note.id }"
            :style="noteStyle(note)"
            @mousedown.stop="startDragNote(note, $event)"
          />
          <view class="playhead" :style="{ left: playX + 'px' }" />
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref } from 'vue'
import {
  session,
  getSelectedClip,
  getSelectedTrack,
  toggleEditor,
  createNote,
  deleteNote,
  setNote,
  previewNoteOn,
  previewNoteOff,
  snapBeat
} from '../store/session.js'

defineProps({
  embedded: { type: Boolean, default: false }
})

const NOTE_H = 12
const MAX_PITCH = 96
const MIN_PITCH = 36
const pitches = Array.from({ length: MAX_PITCH - MIN_PITCH + 1 }, (_, i) => MAX_PITCH - i)
const durations = [
  { label: '1/1', beats: 4 },
  { label: '1/2', beats: 2 },
  { label: '1/4', beats: 1 },
  { label: '1/8', beats: 0.5 },
  { label: '1/16', beats: 0.25 }
]
const drawDuration = ref(0.25)
const drawVelocity = ref(100)
const durationLabel = computed(() => durations.find((item) => item.beats === drawDuration.value)?.label || '1/16')

const clip = computed(() => getSelectedClip())
const track = computed(() => getSelectedTrack())
const held = ref(-1)
const selectedNote = ref(-1)

const beats = computed(() => {
  const length = clip.value ? Math.max(8, Math.ceil(clip.value.lengthBeats) + 1) : 8
  return Array.from({ length }, (_, i) => i)
})

const gridStyle = computed(() => ({
  width: ((clip.value ? Math.max(8, clip.value.lengthBeats) : 8) * session.pixelsPerBeat) + 'px',
  height: ((MAX_PITCH - MIN_PITCH + 1) * NOTE_H) + 'px'
}))

const playX = computed(() => {
  if (!clip.value) return 0
  return Math.max(0, (session.positionBeats - clip.value.startBeat) * session.pixelsPerBeat)
})

function isBlack (pitch) {
  return [1, 3, 6, 8, 10].includes(pitch % 12)
}

function pitchName (pitch) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return names[pitch % 12] + (Math.floor(pitch / 12) - 1)
}

function noteStyle (note) {
  return {
    left: (note.start * session.pixelsPerBeat) + 'px',
    top: ((MAX_PITCH - note.pitch) * NOTE_H + 1) + 'px',
    width: Math.max(4, note.duration * session.pixelsPerBeat) + 'px',
    height: (NOTE_H - 2) + 'px'
  }
}

function startPreview (pitch) {
  held.value = pitch
  previewNoteOn(track.value, pitch, 0.85)
}

function stopPreview () {
  if (held.value >= 0) previewNoteOff(track.value, held.value)
  held.value = -1
}

function onGridDown (e) {
  if (!clip.value) return
  const rect = e.currentTarget.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const start = snapBeat(x / session.pixelsPerBeat)
  const pitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, MAX_PITCH - Math.floor(y / NOTE_H)))
  createNote(clip.value, pitch, start, drawDuration.value, drawVelocity.value)
}

function startDragNote (note, e) {
  selectedNote.value = note.id
  if (e.altKey || e.button === 2) {
    deleteNote(clip.value, note)
    return
  }
  const startX = e.clientX
  const startY = e.clientY
  const origStart = note.start
  const origPitch = note.pitch
  const move = (ev) => {
    const nextStart = snapBeat(origStart + (ev.clientX - startX) / session.pixelsPerBeat)
    const nextPitch = Math.min(MAX_PITCH, Math.max(MIN_PITCH, origPitch - Math.round((ev.clientY - startY) / NOTE_H)))
    note.start = Math.max(0, nextStart)
    note.pitch = nextPitch
  }
  const up = () => {
    setNote(clip.value, note, { start: note.start, pitch: note.pitch, duration: note.duration, velocity: note.velocity })
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onKey (e) {
  if (e.code === 'Delete' || e.code === 'Backspace') {
    const found = clip.value && (clip.value.notes || []).find((note) => note.id === selectedNote.value)
    if (found) deleteNote(clip.value, found)
  }
}

if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
  stopPreview()
})
</script>

<style scoped>
.roll {
  height: 100%;
  background: #141414;
  display: flex;
  flex-direction: column;
}
.tools {
  height: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  color: #8d8d8d;
  font-size: 11px;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
}
.chip { padding: 2px 6px; background: #2b2b2b; border-radius: 3px; cursor: pointer; }
.chip.on { color: #4da3ff; background: rgba(77,163,255,0.18); }
.vel { margin-left: 8px; }
.vel-input { width: 90px; }
.head {
  height: 26px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  color: #8d8d8d;
  font-size: 10px;
  font-weight: 700;
}
.sub { color: #b0b0b0; font-weight: 400; font-size: 11px; }
.spacer { flex: 1; }
.icon-btn { cursor: pointer; padding: 0 4px; }
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6a6a6a;
  font-size: 13px;
  padding: 16px;
  text-align: center;
}
.body { flex: 1; display: flex; min-height: 0; }
.keys {
  width: 56px;
  overflow: hidden;
  background: #101010;
  border-right: 1px solid #2a2a2a;
}
.key {
  box-sizing: border-box;
  border-bottom: 1px solid #202020;
  color: #6a6a6a;
  font-size: 9px;
  padding-right: 4px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  background: #ececec;
}
.key.black { background: #1a1a1a; width: 62%; }
.key.held { background: #4da3ff; color: #fff; }
.grid-view { flex: 1; }
.grid { position: relative; background: #101010; }
.vline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #1c1c1c;
}
.vline.bar { background: #2c2c2c; }
.hline { position: absolute; left: 0; right: 0; }
.hline.black { background: rgba(255,255,255,0.03); }
.note {
  position: absolute;
  background: #4da3ff;
  border-radius: 2px;
  cursor: grab;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.2);
}
.note.on { background: #7ec0ff; }
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #fff;
  pointer-events: none;
}
</style>
