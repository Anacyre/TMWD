<template>
  <view class="header" @click="closeMenus">
    <view class="left">
      <view v-for="item in menus" :key="item.id" class="menu-wrap">
        <text class="menu-label" @click.stop="toggleMenu(item.id)">{{ item.label }}</text>
        <view v-if="session.openMenu === item.id" class="dropdown" @click.stop>
          <template v-for="(entry, idx) in item.items" :key="idx">
            <view v-if="entry.sep" class="drop-item sep" />
            <view
              v-else-if="entry.sub"
              class="drop-item has-sub"
              @mouseenter="hoverSub = entry.sub"
              @mouseleave="hoverSub = ''"
            >
              <text>{{ entry.label }}</text>
              <text class="arrow">›</text>
              <view v-if="hoverSub === entry.sub" class="submenu">
                <view
                  v-for="sub in subMenus[entry.sub]"
                  :key="sub.action"
                  class="drop-item"
                  @click="runMenu(sub)"
                >{{ sub.label }}</view>
              </view>
            </view>
            <view
              v-else
              class="drop-item"
              :class="{ disabled: entry.disabled, checked: entry.checked }"
              @click="runMenu(entry)"
            >
              <text>{{ entry.label }}</text>
            </view>
          </template>
        </view>
      </view>

      <view class="rule" />

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
          <text class="uname">{{ userLine }}</text>
        </view>
      </view>

      <view class="rule" />

      <view class="icon-btn" title="New project" @click.stop="handleNew"><daw-icon name="plus" /></view>
      <view class="icon-btn" title="Open project" @click.stop="openProject"><daw-icon name="grid" /></view>
      <view class="icon-btn" title="Save project" @click.stop="saveProject"><daw-icon name="save" /></view>
      <view class="gap" />
      <view class="icon-btn dim" title="Undo"><daw-icon name="undo" /></view>
      <view class="icon-btn dim" title="Redo"><daw-icon name="redo" /></view>
    </view>

    <view class="right">
      <text v-if="showInfo" class="info">{{ projectInfo }}</text>
      <view class="vol">
        <view class="icon-btn static">
          <daw-icon name="speaker" />
        </view>
        <daw-fader :model-value="session.masterGain" @update:model-value="setMasterGain" />
      </view>
      <view class="icon-btn" title="Audio settings" @click.stop="emit('audio-settings')">
        <daw-icon name="settings" />
      </view>
      <view class="icon-btn" title="Notifications" @click.stop="notify">
        <daw-icon name="bell" />
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
  addTrack,
  setMasterGain,
  closeMenus,
  showToast,
  newProject,
  loadDemoProject,
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
  removeTrack,
  getSelectedClip,
  addMidiClip,
  exportProject,
  importProjectJson,
  saveCurrentProject,
  saveProjectAs,
  openProjectManager,
  setProjectName,
  setLoopRange,
  openPluginPicker,
  openPluginUI,
  TRACK_HEIGHTS
} from '../store/session.js'

const emit = defineEmits(['audio-settings'])
const editName = ref(false)
const hoverSub = ref('')

const showInfo = computed(() => typeof window === 'undefined' || window.innerWidth >= 900)

const userLine = computed(() => {
  const base = session.userName || 'User'
  return session.unsaved ? base + '  ·  unsaved' : base
})

const projectInfo = computed(() => {
  const tracks = Math.max(0, session.tracks.filter((track) => track.type !== 'master').length)
  return tracks + ' tracks   ' + session.clips.length + ' clips   '
    + Math.round(session.bpm) + ' BPM   ' + session.timeSigNum + '/' + session.timeSigDen
})

const subMenus = {
  sections: [
    { label: 'Strings Section', action: 'secStrings' },
    { label: 'Woodwinds Section', action: 'secWoodwinds' },
    { label: 'Brass Section', action: 'secBrass' }
  ],
  heights: TRACK_HEIGHTS.map((item) => ({
    label: item.name,
    action: 'height',
    value: item.value
  }))
}

const menus = computed(() => [
  {
    id: 'file',
    label: 'File',
    items: [
      { label: 'New Project', action: 'new' },
      { label: 'Open...', action: 'open' },
      { sep: true },
      { label: 'Save', action: 'save' },
      { label: 'Save As...', action: 'saveAs' },
      { sep: true },
      { label: 'Export Audio...', action: 'exportAudio' },
      { label: 'Export MIDI...', action: 'exportMidi' },
      { sep: true },
      { label: 'Load Demo Project', action: 'demo' },
      { label: 'Audio Settings...', action: 'audio' },
      { sep: true },
      { label: 'Exit', action: 'exit' }
    ]
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { label: 'Undo', action: 'undo', disabled: true },
      { label: 'Redo', action: 'redo', disabled: true },
      { sep: true },
      { label: 'Duplicate Selected Clip', action: 'dupClip', disabled: getSelectedClip() == null },
      { label: 'Delete Selected Clip', action: 'delClip', disabled: getSelectedClip() == null },
      { sep: true },
      { label: 'Duplicate Selected Track', action: 'dupTrack', disabled: session.selectedTrack <= 0 },
      { label: 'Delete Selected Track', action: 'delTrack', disabled: session.selectedTrack <= 0 }
    ]
  },
  {
    id: 'insert',
    label: 'Insert',
    items: [
      { label: 'Instrument Track', action: 'midiTrack' },
      { label: 'Audio Track', action: 'audioTrack' },
      { sep: true },
      { label: 'MIDI Clip on Selected Track', action: 'addClip', disabled: session.selectedTrack <= 0 },
      { label: 'Insert Plugin...', action: 'insertPlugin', disabled: session.selectedTrack <= 0 },
      { label: 'Add Section', sub: 'sections' }
    ]
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { label: 'Editor Panel', action: 'editor', checked: session.editorVisible },
      { label: 'Mixer', action: 'mixer', checked: session.mixerVisible },
      { label: 'Inspector', action: 'inspector', checked: session.inspectorVisible },
      { sep: true },
      { label: 'Piano Roll', action: 'piano', checked: session.editorTab === 'piano' },
      { label: 'Orchestra Sampler', action: 'sampler', checked: session.editorTab === 'sampler' || session.editorTab === 'm-orchestra' },
      { label: 'Automation', action: 'automation', checked: session.editorTab === 'automation' },
      { label: 'Track Info', action: 'info', checked: session.editorTab === 'info' },
      { sep: true },
      { label: 'Snap to Grid', action: 'snap', checked: session.snap },
      { label: 'Track Height', sub: 'heights' }
    ]
  },
  {
    id: 'transport',
    label: 'Transport',
    items: [
      { label: session.playing ? 'Pause' : 'Play', action: 'play' },
      { label: 'Stop', action: 'stop' },
      { label: 'Return to Start', action: 'home' },
      { sep: true },
      { label: 'Record', action: 'rec', checked: session.recording },
      { label: 'Loop', action: 'loop', checked: session.looping },
      { label: 'Metronome', action: 'metro', checked: session.metronome },
      { sep: true },
      { label: 'Set Loop to Project Length', action: 'loopProject' }
    ]
  },
  {
    id: 'help',
    label: 'Help',
    items: [
      { label: 'Keyboard Shortcuts', action: 'shortcuts' },
      { label: 'About DawWeb', action: 'about' },
      { sep: true },
      { label: 'Capture / Verify Plugin State...', action: 'capture' }
    ]
  }
])

function toggleMenu (id) {
  session.openMenu = session.openMenu === id ? '' : id
  hoverSub.value = ''
}

async function handleNew () {
  await newProject()
  await addTrack('midi', 'Instrument 1')
}

async function addSection (names) {
  for (const name of names) await addTrack('midi', name)
}

function loopToProjectLength () {
  let end = 32
  session.clips.forEach((clip) => {
    const clipEnd = (clip.startBeat || 0) + (clip.lengthBeats || 0)
    if (clipEnd > end) end = clipEnd
  })
  setLoopRange(0, end)
  showToast('Loop range set to project length.')
}

function runMenu (entry) {
  if (!entry || entry.sep || entry.disabled) return
  closeMenus()
  hoverSub.value = ''
  const map = {
    new: handleNew,
    demo: loadDemoProject,
    open: openProject,
    save: saveCurrentProject,
    saveAs: async () => {
      const name = typeof window !== 'undefined'
        ? window.prompt('Save project as', session.projectName || 'Untitled')
        : session.projectName
      if (name != null) await saveProjectAs(name)
    },
    exportAudio: () => showToast('Offline rendering needs the audio engine.'),
    exportMidi: () => showToast('MIDI export needs the sequencer back end.'),
    audio: () => emit('audio-settings'),
    exit: () => showToast('Exit is handled by the browser / host window.'),
    audioTrack: () => addTrack('audio'),
    midiTrack: () => addTrack('midi'),
    addClip: () => addMidiClip(session.selectedTrack),
    secStrings: () => addSection(['Violin I', 'Violin II', 'Viola', 'Cello', 'Bass']),
    secWoodwinds: () => addSection(['Flute', 'Oboe', 'Clarinet', 'Bassoon']),
    secBrass: () => addSection(['Horn', 'Trumpet', 'Trombone', 'Tuba']),
    snap: toggleSnap,
    metro: toggleMetronome,
    editor: toggleEditor,
    mixer: toggleMixer,
    inspector: toggleInspector,
    piano: () => { toggleEditor(); setEditorTab('piano') },
    sampler: () => openPluginUI(session.selectedTrack),
    insertPlugin: () => openPluginPicker(session.selectedTrack),
    automation: () => { toggleEditor(); setEditorTab('automation') },
    info: () => { toggleEditor(); setEditorTab('info') },
    height: () => setTrackHeight(entry.value),
    play: togglePlay,
    stop,
    home: returnToStart,
    rec: toggleRecord,
    loop: toggleLoop,
    loopProject: loopToProjectLength,
    dupClip: () => duplicateClip(getSelectedClip()),
    delClip: () => deleteClip(getSelectedClip()),
    dupTrack: () => duplicateTrack(session.selectedTrack),
    delTrack: () => removeTrack(session.selectedTrack),
    shortcuts: () => showToast('Space play · Esc stop · E/M/I panels · L loop · Ctrl+S save'),
    about: () => showToast('DawWeb 1.0.0 · Vue3 + C++ engine'),
    capture: () => showToast('State capture runs in the native desktop app.')
  }
  map[entry.action] && map[entry.action]()
}

function saveProject () {
  saveCurrentProject()
}

function openProject () {
  openProjectManager()
}

function notify () {
  showToast('No new notifications.')
}

function commitName (e) {
  const value = (e && e.target && e.target.value) || session.projectName
  setProjectName(value)
  editName.value = false
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
  padding: 0 12px 0 10px;
  position: relative;
  z-index: 20;
  user-select: none;
  flex-shrink: 0;
}
.left, .right {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.left { flex: 1; }
.right { flex-shrink: 0; gap: 4px; }
.rule {
  width: 1px;
  height: 24px;
  background: #2a2a2a;
  margin: 0 10px;
  flex-shrink: 0;
}
.gap { width: 8px; flex-shrink: 0; }
.menu-wrap { position: relative; }
.menu-label {
  color: #8d8d8d;
  font-size: 13px;
  padding: 6px 8px;
  cursor: pointer;
  line-height: 20px;
}
.menu-label:hover { color: #e6e6e6; }
.dropdown {
  position: absolute;
  top: 30px;
  left: 0;
  min-width: 220px;
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
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
.has-sub .arrow { color: #6a6a6a; margin-left: 12px; }
.submenu {
  position: absolute;
  left: 100%;
  top: -6px;
  min-width: 180px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.user {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 170px;
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #3a3a3a;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.avatar .head {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #c8c8c8;
  position: absolute;
  left: 8px;
  top: 5px;
}
.avatar .body {
  width: 18px;
  height: 14px;
  border-radius: 9px 9px 0 0;
  background: #c8c8c8;
  position: absolute;
  left: 4px;
  top: 15px;
}
.names { display: flex; flex-direction: column; min-width: 0; }
.proj {
  color: #e6e6e6;
  font-size: 14px;
  font-weight: 700;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.proj-input {
  width: 140px;
  background: #0e0e0e;
  color: #e6e6e6;
  border: 1px solid #4da3ff;
  font-size: 13px;
  font-weight: 600;
}
.uname {
  color: #8d8d8d;
  font-size: 11px;
  line-height: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn:hover { background: #353535; }
.icon-btn.static:hover { background: transparent; cursor: default; }
.icon-btn.dim { opacity: 0.38; cursor: default; }
.icon-btn.dim:hover { background: transparent; }
.info {
  color: #6a6a6a;
  font-size: 11.5px;
  margin-right: 14px;
  white-space: nowrap;
}
.vol {
  width: 150px;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-right: 4px;
}
</style>
