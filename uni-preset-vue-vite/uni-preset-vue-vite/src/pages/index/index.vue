<template>
  <view class="daw" @click="closeMenus">
    <daw-header @audio-settings="onAudioSettings" />
    <view class="body">
      <view class="side" :style="{ width: trackListWidth + 'px' }">
        <daw-track-list :scroll-top="scrollY" @scroll="onTrackScroll" />
      </view>
      <view
        class="split"
        @mousedown.stop="dragSplit"
      />
      <daw-arrangement :scroll-top="scrollY" @scroll="onArrScroll" />
    </view>
    <view v-if="session.toast" class="toast">{{ session.toast }}</view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import DawHeader from '../../components/daw-header.vue'
import DawTrackList from '../../components/daw-track-list.vue'
import DawArrangement from '../../components/daw-arrangement.vue'
import {
  session,
  closeMenus,
  togglePlay,
  stop,
  returnToStart,
  toggleLoop,
  toggleRecord,
  showToast
} from '../../store/session.js'

const trackListWidth = ref(310)
const scrollY = ref(0)
let syncing = false

function onTrackScroll (y) {
  if (syncing) return
  syncing = true
  scrollY.value = y
  syncing = false
}

function onArrScroll (y) {
  if (syncing) return
  syncing = true
  scrollY.value = y
  syncing = false
}

function dragSplit (e) {
  const startX = e.clientX
  const startW = trackListWidth.value
  const move = (ev) => {
    trackListWidth.value = Math.min(Math.max(220, startW + ev.clientX - startX), 520)
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onAudioSettings () {
  showToast('Use the JUCE host Audio Settings for device I/O.')
}

function onKey (e) {
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.code === 'Escape') {
    stop()
  } else if (e.code === 'Home') {
    returnToStart()
  } else if (e.key === 'l' || e.key === 'L') {
    toggleLoop()
  } else if (e.key === 'r' || e.key === 'R') {
    toggleRecord()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.daw {
  height: 100vh;
  width: 100%;
  background: #121212;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.side {
  flex-shrink: 0;
  height: 100%;
}
.split {
  width: 5px;
  cursor: ew-resize;
  background: transparent;
  position: relative;
  z-index: 5;
}
.split::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #2a2a2a;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #e6e6e6;
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  z-index: 80;
}
</style>
