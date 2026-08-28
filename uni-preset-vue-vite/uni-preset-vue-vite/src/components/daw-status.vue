<template>
  <view class="status">
    <view class="dot" :class="dotClass" />
    <text class="sel">{{ selectionText }}</text>
      <text class="hint">Space play   Esc stop   Enter piano roll</text>
    <text class="eng">{{ engineText }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, engineLink, getSelectedTrack, getSelectedClip } from '../store/session.js'

const dotClass = computed(() => {
  if (session.recording) return 'rec'
  if (session.playing) return 'play'
  return ''
})

const selectionText = computed(() => {
  const track = getSelectedTrack()
  const clip = getSelectedClip()
  let text = track ? `Track ${String(session.selectedTrack).padStart(2, '0')}  ${track.name}` : 'No track selected'
  if (clip) text += `   -   ${clip.name}  (${(clip.notes || []).length} notes)`
  if (track && track.loadMessage && track.loadState && track.loadState !== 'Ready') {
    text += `   -   ${track.loadMessage}`
  }
  return text
})

const engineText = computed(() => {
  const state = session.recording ? 'Recording' : (session.playing ? 'Playing' : 'Stopped')
  return `${state}   -   ${session.engineStatus || engineLink.status}`
})
</script>

<style scoped>
.status {
  height: 24px;
  background: #1a1a1a;
  border-top: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  flex-shrink: 0;
  font-size: 11px;
  color: #8d8d8d;
}
.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6a6a6a;
  flex-shrink: 0;
}
.dot.play { background: #2ea44f; }
.dot.rec { background: #e74c3c; }
.sel { color: #b0b0b0; min-width: 220px; }
.hint { flex: 1; text-align: center; color: #6a6a6a; }
.eng { color: #6a6a6a; }
</style>
