<template>
  <view class="transport" @click="closeMenus">
    <view class="group">
      <view class="icon-btn" :class="{ on: session.metronome }" title="Metronome" @click.stop="toggleMetronome">
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
          <text v-else>{{ Math.round(session.bpm) }}</text>
        </view>
        <text class="cap">BPM</text>
      </view>
      <view class="stack">
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

    <view class="group buttons">
      <view class="icon-btn" title="Return to start" @click.stop="returnToStart"><daw-icon name="to-start" /></view>
      <view class="icon-btn play" :class="{ on: session.playing }" title="Play  (Space)" @click.stop="play">
        <daw-icon name="play" :active="session.playing" :color="session.playing ? '#2ea44f' : '#e6e6e6'" />
      </view>
      <view class="icon-btn" :class="{ on: !session.playing }" title="Pause" @click.stop="pause">
        <daw-icon name="pause" />
      </view>
      <view class="icon-btn" title="Stop  (Esc)" @click.stop="stop"><daw-icon name="stop" /></view>
      <view class="icon-btn rec" :class="{ on: session.recording }" title="Record  (R)" @click.stop="toggleRecord">
        <daw-icon name="record" color="#e74c3c" />
      </view>
      <view class="icon-btn" :class="{ on: session.looping }" title="Loop  (L)" @click.stop="toggleLoop">
        <daw-icon name="loop" :active="session.looping" :color="session.looping ? '#4da3ff' : ''" />
      </view>
    </view>

    <view class="clock">
      <text class="time">{{ positionText }}</text>
      <text class="secs">{{ secondsText }}</text>
    </view>

    <view class="group right">
      <view class="snap" @click.stop="toggleMenu('snap')">{{ snapLabel }}</view>
      <view v-if="session.openMenu === 'snap'" class="dropdown right-drop" @click.stop>
        <view
          v-for="option in SNAP_OPTIONS"
          :key="option.name"
          class="drop-item"
          :class="{ checked: isSnapOption(option) }"
          @click="pickSnap(option)"
        >{{ option.name }}</view>
      </view>
      <view class="letter" :class="{ on: session.editorVisible }" title="Editor panel  (E)" @click.stop="toggleEditor">E</view>
      <view class="letter" :class="{ on: session.mixerVisible }" title="Mixer  (M)" @click.stop="toggleMixer">M</view>
      <view class="letter" :class="{ on: session.inspectorVisible }" title="Inspector  (I)" @click.stop="toggleInspector">I</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
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
  const move = (ev) => setBpm(start - (ev.clientY - startY) * 0.4)
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
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 16px;
  user-select: none;
  flex-shrink: 0;
  z-index: 18;
  position: relative;
}
.group { display: flex; align-items: center; gap: 8px; position: relative; }
.group.right { margin-left: auto; }
.stack { display: flex; flex-direction: column; align-items: center; position: relative; }
.cap { color: #6a6a6a; font-size: 9px; font-weight: 700; letter-spacing: 0.4px; }
.icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover { background: #353535; }
.icon-btn.on { background: rgba(77,163,255,0.18); }
.icon-btn.play.on { background: rgba(46,164,79,0.18); }
.icon-btn.rec.on { background: rgba(231,76,60,0.2); }
.icon-btn.play { width: 34px; }
.bpm, .sig, .snap {
  min-width: 48px;
  height: 22px;
  background: #0e0e0e;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
  color: #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  cursor: pointer;
}
.bpm { cursor: ns-resize; font-weight: 700; }
.bpm-input {
  width: 44px;
  background: transparent;
  color: #e6e6e6;
  border: none;
  text-align: center;
}
.clock { display: flex; flex-direction: column; min-width: 140px; }
.time {
  color: #e6e6e6;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 0.4px;
  font-variant-numeric: tabular-nums;
  line-height: 22px;
}
.secs { color: #8d8d8d; font-size: 12px; }
.letter {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  color: #8d8d8d;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.letter:hover { background: #353535; color: #e6e6e6; }
.letter.on { background: rgba(77,163,255,0.18); color: #4da3ff; }
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
}
.right-drop { right: 70px; left: auto; }
.drop-item { padding: 6px 12px; color: #e6e6e6; font-size: 12px; cursor: pointer; }
.drop-item:hover { background: #3a3a3a; }
.drop-item.checked::after { content: ' ✓'; color: #4da3ff; }
</style>
