<template>
  <view class="transport" @click="closeMenus">
    <!-- Left: tempo / metre -->
    <view class="left">
      <view
        class="icon-btn"
        :class="{ on: session.metronome }"
        title="Metronome"
        @click.stop="toggleMetronome"
      >
        <daw-icon name="metronome" :active="session.metronome" :color="session.metronome ? '#4da3ff' : ''" />
      </view>
      <view class="stack">
        <view class="bpm" @mousedown.stop="dragBpm" @dblclick.stop="editBpm = true">
          <input
            v-if="editBpm"
            class="bpm-input"
            type="number"
            :value="session.bpm"
            @blur="commitBpm"
            @keyup.enter="commitBpm"
          >
          <text v-else>{{ bpmText }}</text>
        </view>
        <text class="cap">BPM</text>
      </view>
      <view class="stack sig-wrap">
        <view class="sig" @click.stop="toggleMenu('timesig')">{{ session.timeSigNum }}/{{ session.timeSigDen }}</view>
        <text class="cap">SIG</text>
        <view v-if="session.openMenu === 'timesig'" class="dropdown" @click.stop>
          <view
            v-for="sig in TIME_SIGNATURES"
            :key="sig"
            class="drop-item"
            :class="{ checked: sig === session.timeSigNum + '/' + session.timeSigDen }"
            @click="pickSig(sig)"
          >{{ sig }}</view>
        </view>
      </view>
    </view>

    <!-- Centre: transport + readout -->
    <view class="center">
      <view class="cluster">
        <view class="icon-btn" title="Return to start" @click.stop="returnToStart">
          <daw-icon name="to-start" />
        </view>
        <view
          class="icon-btn play"
          :class="{ on: session.playing }"
          title="Play  (Space)"
          @click.stop="play"
        >
          <daw-icon name="play" :active="session.playing" :color="session.playing ? '#2ea44f' : '#e6e6e6'" />
        </view>
        <view
          class="icon-btn"
          :class="{ on: paused }"
          title="Pause"
          @click.stop="pause"
        >
          <daw-icon name="pause" :active="paused" :color="paused ? '#4da3ff' : ''" />
        </view>
        <view class="icon-btn" title="Stop  (Esc)" @click.stop="stop">
          <daw-icon name="stop" />
        </view>
        <view
          class="icon-btn rec"
          :class="{ on: session.recording }"
          title="Record  (R)"
          @click.stop="toggleRecord"
        >
          <daw-icon name="record" color="#e74c3c" />
        </view>
        <view class="spacer" />
        <view
          class="icon-btn"
          :class="{ on: session.looping }"
          title="Loop  (L)"
          @click.stop="toggleLoop"
        >
          <daw-icon name="loop" :active="session.looping" :color="session.looping ? '#4da3ff' : ''" />
        </view>
        <view class="readout" :class="{ recording: session.recording }">
          <text class="time">{{ positionText }}</text>
          <text class="secs">{{ secondsText }}</text>
        </view>
      </view>
    </view>

    <!-- Right: panel toggles + snap + visualizer -->
    <view class="right">
      <view
        class="icon-btn panel"
        :class="{ on: session.editorVisible }"
        title="Editor panel  (E)"
        @click.stop="toggleEditor"
      >
        <daw-icon name="note" :active="session.editorVisible" :color="session.editorVisible ? '#4da3ff' : ''" />
      </view>
      <view
        class="icon-btn panel"
        :class="{ on: session.mixerVisible }"
        title="Mixer  (M)"
        @click.stop="toggleMixer"
      >
        <daw-icon name="mixer" :active="session.mixerVisible" :color="session.mixerVisible ? '#4da3ff' : ''" />
      </view>
      <view
        class="icon-btn panel"
        :class="{ on: session.inspectorVisible }"
        title="Inspector  (I)"
        @click.stop="toggleInspector"
      >
        <daw-icon name="inspector" :active="session.inspectorVisible" :color="session.inspectorVisible ? '#4da3ff' : ''" />
      </view>
      <daw-visualizer />
      <view class="snap-wrap">
        <view class="snap" @click.stop="toggleMenu('snap')">{{ snapLabel }}</view>
        <view v-if="session.openMenu === 'snap'" class="dropdown snap-drop" @click.stop>
          <view
            v-for="option in SNAP_OPTIONS"
            :key="option.name"
            class="drop-item"
            :class="{ checked: isSnapOption(option) }"
            @click="pickSnap(option)"
          >{{ option.name }}</view>
        </view>
      </view>
    </view>
    <view v-if="session.sampleLoad.active" class="sample-load">
      <view class="sample-fill" :style="{ width: sampleLoadPct }" />
      <text class="sample-label">加载采样 {{ session.sampleLoad.done }}/{{ session.sampleLoad.total }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import DawVisualizer from './daw-visualizer.vue'
import {
  session,
  positionText,
  secondsText,
  SNAP_OPTIONS,
  TIME_SIGNATURES,
  play,
  pause,
  stop,
  returnToStart,
  toggleRecord,
  toggleLoop,
  toggleMetronome,
  setBpm,
  setTimeSignature,
  setSnapGrid,
  toggleEditor,
  toggleMixer,
  toggleInspector,
  closeMenus
} from '../store/session.js'

const editBpm = ref(false)

const bpmText = computed(() => {
  const value = session.bpm
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
})

const paused = computed(() => !session.playing && session.positionBeats > 0)

const sampleLoadPct = computed(() => {
  const total = session.sampleLoad.total || 0
  if (!total) return '0%'
  return Math.min(100, Math.round(session.sampleLoad.done / total * 100)) + '%'
})

const snapLabel = computed(() => {
  if (!session.snap) return 'Off'
  const found = SNAP_OPTIONS.find((option) => option.beats > 0 && Math.abs(option.beats - session.snapGridBeats) < 1e-6)
  return found ? found.name : '1/16'
})

function toggleMenu (id) {
  session.openMenu = session.openMenu === id ? '' : id
}

function isSnapOption (option) {
  if (option.beats === 0) return !session.snap
  return session.snap && Math.abs(session.snapGridBeats - option.beats) < 1e-6
}

function pickSnap (option) {
  setSnapGrid(option.beats)
  closeMenus()
}

function pickSig (sig) {
  const parts = sig.split('/')
  setTimeSignature(Number(parts[0]), Number(parts[1]))
  closeMenus()
}

function dragBpm (e) {
  if (editBpm.value) return
  const startY = e.clientY
  const start = session.bpm
  const move = (ev) => setBpm(start - (ev.clientY - startY) * 0.35)
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function commitBpm (e) {
  setBpm(Number((e && e.target && e.target.value) || session.bpm))
  editBpm.value = false
}
</script>

<style scoped>
.transport {
  height: 44px;
  background: #1e1e1e;
  border-bottom: 1px solid #2a2a2a;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  padding: 0 10px;
  user-select: none;
  flex-shrink: 0;
  position: relative;
  z-index: 18;
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-self: start;
}
.center {
  justify-self: center;
  min-width: 0;
}
.right {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: end;
}
.cluster {
  display: flex;
  align-items: center;
  gap: 2px;
}
.spacer { width: 6px; flex-shrink: 0; }
.stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
}
.cap {
  color: #6a6a6a;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  line-height: 10px;
  margin-top: 1px;
}
.icon-btn {
  /* 32 px hit target everywhere; the glyph inside is a fixed 20 px. */
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn.panel { width: 32px; height: 32px; }
.icon-btn:hover { background: #353535; }
.icon-btn.on { background: rgba(77,163,255,0.18); }
.icon-btn.play.on { background: rgba(46,164,79,0.18); }
.icon-btn.rec.on { background: rgba(231,76,60,0.2); }
.icon-btn.play { width: 36px; }
@media (pointer: coarse) {
  .icon-btn, .icon-btn.panel { width: 44px; height: 44px; }
  .icon-btn.play { width: 48px; }
}
.bpm, .sig, .snap {
  min-width: 46px;
  height: 22px;
  background: transparent;
  border: none;
  border-radius: 3px;
  color: #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
.sig {
  min-width: 46px;
  background: #2b2b2b;
  border: 1px solid #2a2a2a;
  font-size: 13px;
  font-weight: 400;
}
.bpm { cursor: ns-resize; }
.bpm-input {
  width: 44px;
  background: #0e0e0e;
  color: #e6e6e6;
  border: 1px solid #4da3ff;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  border-radius: 3px;
}
.readout {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 174px;
  height: 28px;
  margin-left: 10px;
  padding: 0 9px;
  background: #0e0e0e;
  border-radius: 3px;
  box-sizing: border-box;
}
.readout.recording {
  box-shadow: inset 0 0 0 1px rgba(231, 76, 60, 0.6);
}
.time {
  color: #e6e6e6;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.4px;
  font-variant-numeric: tabular-nums;
  line-height: 28px;
  flex: 1;
  min-width: 0;
}
.secs {
  color: #8d8d8d;
  font-size: 12px;
  line-height: 28px;
  flex-shrink: 0;
}
.snap-wrap { position: relative; }
.snap {
  min-width: 46px;
  height: 22px;
  background: #2b2b2b;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  color: #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
}
.dropdown {
  position: absolute;
  top: 36px;
  left: 0;
  min-width: 88px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  z-index: 40;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.snap-drop { right: 0; left: auto; }
.drop-item {
  padding: 6px 12px;
  color: #e6e6e6;
  font-size: 12px;
  cursor: pointer;
}
.drop-item:hover { background: #3a3a3a; }
.drop-item.checked::after { content: ' ✓'; color: #4da3ff; }
.sample-load {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 2px;
  height: 14px;
  border-radius: 7px;
  background: #141414;
  overflow: hidden;
  z-index: 30;
}
.sample-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: #2f6f46;
}
.sample-label {
  position: relative;
  z-index: 1;
  display: block;
  text-align: center;
  color: #e6e6e6;
  font-size: 10px;
  line-height: 14px;
}
</style>
