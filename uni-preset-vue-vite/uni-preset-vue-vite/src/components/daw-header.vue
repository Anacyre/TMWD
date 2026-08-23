<template>
  <view class="header" @click="closeMenus">
    <view class="left">
      <view
        v-for="item in menus"
        :key="item.id"
        class="menu-wrap"
      >
        <text
          class="menu-label"
          @click.stop="toggleMenu(item.id)"
        >{{ item.label }}</text>
        <view v-if="session.openMenu === item.id" class="dropdown" @click.stop>
          <view
            v-for="(entry, idx) in item.items"
            :key="idx"
            class="drop-item"
            :class="{ sep: entry.sep, disabled: entry.disabled, checked: entry.checked }"
            @click="runMenu(entry)"
          >
            <text v-if="!entry.sep">{{ entry.label }}</text>
          </view>
        </view>
      </view>

      <view class="user">
        <view class="avatar">
          <view class="head" /><view class="body" />
        </view>
        <view class="names">
          <text class="proj">{{ session.projectName }}</text>
          <text class="uname">{{ session.userName }}</text>
        </view>
        <view class="icon-btn" title="Save" @click.stop="saveProject">
          <daw-icon name="save" />
        </view>
      </view>
    </view>

    <view class="center">
      <view
        class="icon-btn"
        :class="{ on: session.metronome }"
        title="Metronome"
        @click.stop="toggleMetronome"
      >
        <daw-icon name="metronome" :active="session.metronome" :color="session.metronome ? '#4da3ff' : ''" />
      </view>
      <view
        class="bpm"
        @mousedown.stop="dragBpm"
        @dblclick.stop="editBpm = true"
      >
        <input
          v-if="editBpm"
          class="bpm-input"
          type="number"
          :value="session.bpm"
          @blur="commitBpm"
          @confirm="commitBpm"
          @keyup.enter="commitBpm"
        >
        <text v-else>{{ Math.round(session.bpm) }}</text>
      </view>
      <view class="transport">
        <view class="icon-btn" :class="{ on: session.looping }" title="Loop" @click.stop="toggleLoop">
          <daw-icon name="loop" :active="session.looping" :color="session.looping ? '#4da3ff' : ''" />
        </view>
        <view class="icon-btn" title="Return to start" @click.stop="returnToStart">
          <daw-icon name="to-start" />
        </view>
        <view class="icon-btn play" :class="{ on: session.playing }" title="Play / Pause" @click.stop="togglePlay">
          <daw-icon :name="session.playing ? 'pause' : 'play'" :active="session.playing" :color="session.playing ? '#4da3ff' : '#e6e6e6'" />
        </view>
        <view class="icon-btn" title="Stop" @click.stop="stop">
          <daw-icon name="stop" />
        </view>
        <view class="icon-btn rec" :class="{ on: session.recording }" title="Record" @click.stop="toggleRecord">
          <daw-icon name="record" :color="session.recording ? '#e74c3c' : '#e74c3c'" />
        </view>
      </view>
      <text class="time">{{ positionText }}</text>
    </view>

    <view class="right">
      <view class="vol">
        <view class="icon-btn static">
          <daw-icon name="speaker" />
        </view>
        <daw-fader :model-value="session.masterGain" @update:model-value="setMasterGain" />
      </view>
      <view class="icon-btn" title="Notifications" @click.stop="notify">
        <daw-icon name="bell" />
      </view>
      <view class="win-btns">
        <view class="icon-btn" @click.stop="minimize"><daw-icon name="min" /></view>
        <view class="icon-btn" @click.stop="maximize"><daw-icon name="max" /></view>
        <view class="icon-btn close" @click.stop="closeWin"><daw-icon name="close" /></view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import DawFader from './daw-fader.vue'
import {
  session,
  positionText,
  togglePlay,
  stop,
  returnToStart,
  toggleRecord,
  toggleLoop,
  toggleMetronome,
  toggleSnap,
  addTrack,
  setBpm,
  setMasterGain,
  closeMenus,
  showToast
} from '../store/session.js'

const editBpm = ref(false)
const emit = defineEmits(['audio-settings'])

const menus = computed(() => [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Project', action: 'new' },
      { label: 'Open...', disabled: true },
      { sep: true },
      { label: 'Save', action: 'save' },
      { label: 'Save As...', disabled: true },
      { sep: true },
      { label: 'Audio Settings...', action: 'audio' },
      { sep: true },
      { label: 'Exit', action: 'exit' }
    ]
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', disabled: true },
      { label: 'Redo', disabled: true },
      { sep: true },
      { label: 'Cut', disabled: true },
      { label: 'Copy', disabled: true },
      { label: 'Paste', disabled: true }
    ]
  },
  {
    id: 'insert',
    label: 'Insert',
    items: [
      { label: 'Audio Track', action: 'audioTrack' },
      { label: 'MIDI Track', action: 'midiTrack' }
    ]
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Snap to Grid', action: 'snap', checked: session.snap },
      { label: 'Metronome', action: 'metro', checked: session.metronome }
    ]
  },
  {
    id: 'transport',
    label: 'Transport',
    items: [
      { label: session.playing ? 'Pause' : 'Play', action: 'play' },
      { label: 'Stop', action: 'stop' },
      { label: 'Return to Start', action: 'home' },
      { label: 'Record', action: 'rec', checked: session.recording },
      { label: 'Loop', action: 'loop', checked: session.looping }
    ]
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'About DawWeb', action: 'about' }
    ]
  }
])

function toggleMenu (id) {
  session.openMenu = session.openMenu === id ? '' : id
}

function runMenu (entry) {
  if (!entry || entry.sep || entry.disabled) return
  closeMenus()
  const map = {
    new: () => {
      session.projectName = 'New Project'
      stop()
      returnToStart()
    },
    save: saveProject,
    audio: () => emit('audio-settings'),
    exit: closeWin,
    audioTrack: () => addTrack('audio'),
    midiTrack: () => addTrack('midi'),
    snap: toggleSnap,
    metro: toggleMetronome,
    play: togglePlay,
    stop,
    home: returnToStart,
    rec: toggleRecord,
    loop: toggleLoop,
    about: () => showToast('DawWeb 1.0.0  ·  Vue3 H5 + JUCE shell')
  }
  map[entry.action] && map[entry.action]()
}

function saveProject () {
  showToast('Project saving will be added later.')
}

function notify () {
  showToast('No new notifications.')
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
  setBpm(Number((e && e.detail && e.detail.value) || (e && e.target && e.target.value) || session.bpm))
  editBpm.value = false
}

function minimize () {
  showToast('Window chrome is decorative on H5.')
}

async function maximize () {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
    else await document.exitFullscreen()
  } catch (err) {
    showToast('Fullscreen is not available.')
  }
}

function closeWin () {
  showToast('Close is handled by the browser / host window.')
}
</script>

<style scoped>
.header {
  height: 56px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  position: relative;
  z-index: 20;
  user-select: none;
}
.left, .center, .right {
  display: flex;
  align-items: center;
  gap: 4px;
}
.left { flex: 1; min-width: 0; }
.right { flex: 1; justify-content: flex-end; }
.center { gap: 8px; }
.menu-wrap { position: relative; }
.menu-label {
  color: #8d8d8d;
  font-size: 13px;
  padding: 6px 8px;
  cursor: pointer;
}
.menu-label:hover { color: #e6e6e6; }
.dropdown {
  position: absolute;
  top: 28px;
  left: 0;
  min-width: 180px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  z-index: 50;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.drop-item {
  padding: 6px 14px;
  color: #e6e6e6;
  font-size: 13px;
  cursor: pointer;
}
.drop-item:hover:not(.sep):not(.disabled) { background: #3a3a3a; }
.drop-item.disabled { color: #6a6a6a; cursor: default; }
.drop-item.checked::after { content: ' ✓'; color: #4da3ff; }
.drop-item.sep {
  height: 1px;
  padding: 0;
  margin: 6px 10px;
  background: #2a2a2a;
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #3a3a3a;
  position: relative;
  overflow: hidden;
}
.avatar .head {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c8c8c8;
  position: absolute;
  left: 9px;
  top: 5px;
}
.avatar .body {
  width: 18px;
  height: 14px;
  border-radius: 9px 9px 0 0;
  background: #c8c8c8;
  position: absolute;
  left: 5px;
  top: 16px;
}
.names { display: flex; flex-direction: column; }
.proj { color: #e6e6e6; font-size: 13px; font-weight: 600; line-height: 16px; }
.uname { color: #8d8d8d; font-size: 11px; line-height: 14px; }
.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover { background: #353535; }
.icon-btn.on { background: rgba(77,163,255,0.18); }
.icon-btn.rec.on { background: rgba(231,76,60,0.2); }
.icon-btn.play { width: 34px; }
.icon-btn.static:hover { background: transparent; cursor: default; }
.bpm {
  width: 50px;
  height: 26px;
  background: #2b2b2b;
  border-radius: 4px;
  color: #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: ns-resize;
}
.bpm-input {
  width: 46px;
  height: 22px;
  background: transparent;
  color: #e6e6e6;
  text-align: center;
  border: none;
  font-size: 14px;
}
.transport { display: flex; align-items: center; gap: 2px; margin-left: 8px; }
.time {
  min-width: 110px;
  text-align: center;
  color: #e6e6e6;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.5px;
  font-variant-numeric: tabular-nums;
}
.vol {
  width: 150px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 8px;
}
.win-btns { display: flex; margin-left: 4px; }
.win-btns .close:hover { background: #c42b1c; }
</style>
