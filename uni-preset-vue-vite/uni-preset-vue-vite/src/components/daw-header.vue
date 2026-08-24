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
          <input
            v-if="editName"
            class="proj-input"
            :value="session.projectName"
            @blur="commitName"
            @keyup.enter="commitName"
          >
          <text v-else class="proj" @dblclick.stop="editName = true">{{ session.projectName }}</text>
          <text class="uname">{{ session.userName }}</text>
        </view>
        <view class="engine" :class="{ on: engineLink.connected }" :title="engineLink.url || 'Engine'">
          <view class="dot" />
          <text>{{ engineLink.connected ? 'Engine' : 'Local' }}</text>
        </view>
        <view class="icon-btn" title="Save" @click.stop="saveProject">
          <daw-icon name="save" />
        </view>
      </view>
    </view>

    <view class="center">
      <view class="icon-btn" title="New" @click.stop="newProject"><daw-icon name="plus" /></view>
        <view class="icon-btn" title="Open" @click.stop="openProject"><daw-icon name="grid" /></view>
      <view class="icon-btn" title="Save" @click.stop="saveProject"><daw-icon name="save" /></view>
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
  engineLink,
  addTrack,
  setMasterGain,
  closeMenus,
  showToast,
  newProject,
  toggleEditor,
  toggleMixer,
  toggleInspector,
  toggleSnap,
  toggleMetronome,
  togglePlay,
  stop,
  returnToStart,
  toggleRecord,
  toggleLoop,
  setEditorTab,
  setTrackHeight,
  duplicateClip,
  duplicateTrack,
  deleteClip,
  getSelectedClip,
  exportProject,
  importProjectJson,
  setProjectName,
  TRACK_HEIGHTS
} from '../store/session.js'

const emit = defineEmits(['audio-settings'])
const editName = ref(false)

const menus = computed(() => [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Project', action: 'new' },
      { label: 'Open...', action: 'open' },
      { sep: true },
      { label: 'Save', action: 'save' },
      { label: 'Save As...', action: 'save' },
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
      { label: 'Duplicate Clip', action: 'dupClip' },
      { label: 'Delete Clip', action: 'delClip' },
      { sep: true },
      { label: 'Duplicate Track', action: 'dupTrack' }
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
      { label: 'Metronome', action: 'metro', checked: session.metronome },
      { sep: true },
      { label: 'Editor', action: 'editor', checked: session.editorVisible },
      { label: 'Mixer', action: 'mixer', checked: session.mixerVisible },
      { label: 'Inspector', action: 'inspector', checked: session.inspectorVisible },
      { sep: true },
      { label: 'Piano Roll', action: 'piano', checked: session.editorTab === 'piano' },
      { label: 'Automation', action: 'automation', checked: session.editorTab === 'automation' },
      { label: 'Track Info', action: 'info', checked: session.editorTab === 'info' },
      { sep: true },
      ...TRACK_HEIGHTS.map((item) => ({
        label: 'Track Height ' + item.name,
        action: 'height',
        value: item.value,
        checked: session.trackHeight === item.value
      }))
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
      { label: 'Shortcuts: Space play, Esc stop, E/M/I panels, L loop, Del clip', action: 'about' },
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
    new: newProject,
    open: openProject,
    save: saveProject,
    audio: () => emit('audio-settings'),
    exit: closeWin,
    audioTrack: () => addTrack('audio'),
    midiTrack: () => addTrack('midi'),
    snap: toggleSnap,
    metro: toggleMetronome,
    editor: toggleEditor,
    mixer: toggleMixer,
    inspector: toggleInspector,
    piano: () => setEditorTab('piano'),
    automation: () => setEditorTab('automation'),
    info: () => setEditorTab('info'),
    height: () => setTrackHeight(entry.value),
    play: togglePlay,
    stop,
    home: returnToStart,
    rec: toggleRecord,
    loop: toggleLoop,
    dupClip: () => duplicateClip(getSelectedClip()),
    delClip: () => deleteClip(getSelectedClip()),
    dupTrack: () => duplicateTrack(session.selectedTrack),
    about: () => showToast('DawWeb 1.0.0  路  Vue3 + C++ engine')
  }
  map[entry.action] && map[entry.action]()
}

function saveProject () {
  exportProject()
}

function openProject () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.dawweb,.json,application/json'
  input.onchange = async () => {
    const file = input.files && input.files[0]
    if (!file) return
    importProjectJson(await file.text())
  }
  input.click()
}

function notify () {
  showToast('No new notifications.')
}

function minimize () {
  showToast('Window chrome is decorative on H5.')
}

function commitName (e) {
  const value = (e && e.target && e.target.value) || session.projectName
  setProjectName(value)
  editName.value = false
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
  height: 44px;
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
.drop-item.checked::after { content: ' *'; color: #4da3ff; }
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
.engine {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8d8d8d;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 999px;
  border: 1px solid #2a2a2a;
}
.engine .dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6a6a6a;
}
.engine.on {
  color: #cfe6ff;
  border-color: rgba(77,163,255,0.4);
}
.engine.on .dot { background: #4da3ff; }
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
.proj-input {
  width: 140px;
  background: #0e0e0e;
  color: #e6e6e6;
  border: 1px solid #4da3ff;
  font-size: 13px;
  font-weight: 600;
}
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
.panel-toggles { display: flex; gap: 2px; margin-left: 8px; }
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
