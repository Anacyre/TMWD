<template>
  <view class="top" :class="{ phone: isPhone, rec: session.recording }" @click="closeMenus">
    <view class="row primary">
      <view class="left">
        <view v-if="isPhone" class="hit" title="View" @click.stop="toggleMenu('view')">
          <daw-icon name="menu" />
        </view>
        <view class="project" @click.stop="toggleMenu('project')">
          <text class="proj-name">{{ session.projectName }}</text>
          <text v-if="!isPhone && session.saveStatus" class="save-cap">{{ session.saveStatus }}</text>
        </view>
        <view v-if="!isPhone" class="hit" title="Undo" :class="{ dim: !session.canUndo }" @click.stop="undoEdit">
          <daw-icon name="undo" />
        </view>
        <view v-if="!isPhone" class="hit" title="Redo" :class="{ dim: !session.canRedo }" @click.stop="redoEdit">
          <daw-icon name="redo" />
        </view>
      </view>

      <view class="center">
        <view v-if="!isPhone" class="hit" title="Return to start" @click.stop="returnToStart">
          <daw-icon name="to-start" />
        </view>
        <view
          class="hit play"
          :class="{ on: session.playing }"
          title="Play  (Space)"
          @click.stop="togglePlay"
        >
          <daw-icon
            :name="session.playing ? 'pause' : 'play'"
            :active="session.playing"
            :color="session.playing ? '#2ea44f' : '#e6e6e6'"
          />
        </view>
        <view v-if="!isPhone" class="hit" title="Stop" @click.stop="stop">
          <daw-icon name="stop" />
        </view>
        <view
          v-if="!isPhone"
          class="hit rec"
          :class="{ on: session.recording }"
          title="Record  (R)"
          @click.stop="toggleRecord"
        >
          <daw-icon name="record" color="#e74c3c" />
        </view>
        <view
          v-if="!isPhone"
          class="hit"
          :class="{ on: session.looping }"
          title="Loop  (L)"
          @click.stop="toggleLoop"
        >
          <daw-icon name="loop" :active="session.looping" :color="session.looping ? '#4da3ff' : ''" />
        </view>
        <view
          v-if="!isPhone"
          class="readout"
          :class="{ recording: session.recording }"
          @click.stop="toggleFormat"
        >
          <text class="pos">{{ positionDisplay }}</text>
          <view v-if="session.recording" class="rec-dot" />
        </view>
      </view>

      <view class="right">
        <view v-if="!isPhone" class="tempo" @pointerdown.stop="dragBpm" @dblclick.stop="editBpm = true">
          <input
            v-if="editBpm"
            class="bpm-input"
            type="number"
            :value="session.bpm"
            @blur="commitBpm"
            @keyup.enter="commitBpm"
            @focus="setTyping(true)"
          >
          <text v-else>{{ bpmText }} <text class="unit">BPM</text></text>
        </view>
        <view v-if="!isPhone" class="sig" @click.stop="toggleMenu('timesig')">
          {{ session.timeSigNum }}/{{ session.timeSigDen }}
        </view>
        <view class="status" @click.stop="toggleDiagnostics">
          <view class="led" :class="engineState()" />
          <text v-if="!isPhone">{{ engineStateLabel() }}</text>
        </view>
        <view v-if="!isPhone" class="nav">
          <view class="hit" :class="{ on: session.workspaceView === 'arrangement' }" title="Arrangement" @click.stop="setWorkspaceView('arrangement')">
            <daw-icon name="arrange" :color="session.workspaceView === 'arrangement' ? '#e6e6e6' : ''" />
          </view>
          <view class="hit" :class="{ on: session.workspaceView === 'piano' || session.editorTab === 'piano' && session.editorVisible }" title="Piano Roll" @click.stop="setWorkspaceView('piano')">
            <daw-icon name="piano" :color="session.editorVisible && session.editorTab === 'piano' ? '#e6e6e6' : ''" />
          </view>
          <view class="hit" :class="{ on: session.mixerVisible }" title="Mixer" @click.stop="setWorkspaceView('mixer')">
            <daw-icon name="mixer" :color="session.mixerVisible ? '#e6e6e6' : ''" />
          </view>
        </view>
        <view class="hit" title="More" @click.stop="toggleMenu('more')">
          <daw-icon name="more" />
        </view>
      </view>
    </view>

    <view v-if="isPhone" class="row secondary">
      <text class="pos phone-pos" @click.stop="toggleFormat">{{ positionDisplay }}</text>
      <view v-if="session.recording" class="rec-dot" />
    </view>

    <view v-if="session.openMenu === 'project'" class="menu left-menu" @click.stop>
      <view class="item" @click="run('manager')">Projects…</view>
      <view class="item" @click="run('new')">New</view>
      <view class="item" @click="run('open')">Open</view>
      <view class="item" @click="run('save')">Save</view>
      <view class="item" @click="run('saveAs')">Save As</view>
      <view class="item" @click="run('autosave')">Restore Autosave</view>
      <view v-if="session.recentProjects && session.recentProjects.length" class="sep" />
      <view
        v-for="item in session.recentProjects"
        :key="item.id || item.at"
        class="item muted"
        @click="openRecent(item)"
      >{{ item.name }}</view>
      <view class="sep" />
      <view class="item" @click="run('demo')">Load Demo</view>
      <view class="sep" />
      <view class="item" @click="run('export')">Export</view>
    </view>

    <view v-if="session.openMenu === 'timesig'" class="menu sig-menu" @click.stop>
      <view
        v-for="sig in TIME_SIGNATURES"
        :key="sig"
        class="item"
        :class="{ on: sig === session.timeSigNum + '/' + session.timeSigDen }"
        @click="pickSig(sig)"
      >{{ sig }}</view>
    </view>

    <view v-if="session.openMenu === 'more'" class="menu right-menu" @click.stop>
      <view v-if="isPhone" class="item" @click="run('undo')">Undo</view>
      <view v-if="isPhone" class="item" @click="run('redo')">Redo</view>
      <view v-if="isPhone" class="item" @click="run('stop')">Stop</view>
      <view v-if="isPhone" class="item" @click="run('record')">{{ session.recording ? 'Stop Record' : 'Record' }}</view>
      <view v-if="isPhone" class="item" @click="run('loop')">{{ session.looping ? 'Loop Off' : 'Loop On' }}</view>
      <view v-if="isPhone" class="item" @click="editBpm = true; closeMenus()">Tempo {{ Math.round(session.bpm) }}</view>
      <view v-if="isPhone" class="item" @click="toggleMenu('timesig')">Meter {{ session.timeSigNum }}/{{ session.timeSigDen }}</view>
      <view v-if="isPhone" class="sep" />
      <view class="item" @click="run('metro')">Metronome {{ session.metronome ? 'On' : 'Off' }}</view>
      <view class="item" @click="run('snap')">Snap {{ session.snap ? 'On' : 'Off' }}</view>
      <view class="item" @click="toggleFormat">Position {{ session.positionFormat === 'time' ? 'Time' : 'Musical' }}</view>
      <view class="sep" />
      <view class="item" @click="run('sampler')">Orchestra Sampler</view>
      <view class="item" @click="run('diag')">Diagnostics</view>
      <view class="item" @click="openInterfaceSettings">Interface Mode</view>
      <view class="item" @click="emit('audio-settings')">Audio Settings</view>
    </view>

    <view v-if="isPhone && editBpm" class="bpm-overlay" @click.stop>
      <input
        class="bpm-input phone-bpm"
        type="number"
        :value="session.bpm"
        @blur="commitBpm"
        @keyup.enter="commitBpm"
        @focus="setTyping(true)"
      >
    </view>

    <view v-if="session.openMenu === 'view'" class="menu left-menu" @click.stop>
      <view class="item" @click="run('arrangement')">Arrangement</view>
      <view class="item" @click="run('piano')">Piano Roll</view>
      <view class="item" @click="run('mixer')">Mixer</view>
      <view class="item" @click="run('sampler')">Orchestra Sampler</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  session,
  TIME_SIGNATURES,
  positionText,
  secondsText,
  closeMenus,
  togglePlay,
  stop,
  returnToStart,
  toggleRecord,
  toggleLoop,
  toggleMetronome,
  toggleSnap,
  setBpm,
  setTimeSignature,
  newProject,
  loadDemoProject,
  addTrack,
  exportProject,
  importProjectJson,
  saveCurrentProject,
  saveProjectAs,
  openStoredProject,
  openProjectManager,
  toggleDiagnostics,
  setWorkspaceView,
  setPositionFormat,
  setTyping,
  undoEdit,
  redoEdit,
  engineState,
  engineStateLabel,
  setEditorTab,
  toggleEditor,
  openPluginUI,
  restoreAutosave,
  openSettings
} from '../store/session.js'

const emit = defineEmits(['audio-settings'])
const editBpm = ref(false)
const isPhone = ref(false)

const bpmText = computed(() => {
  const value = session.bpm
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
})

const positionDisplay = computed(() => (
  session.positionFormat === 'time' ? secondsText.value : positionText.value
))

function measure () {
  isPhone.value = typeof window !== 'undefined' && window.innerWidth < 720
}

function toggleMenu (id) {
  session.openMenu = session.openMenu === id ? '' : id
}

function toggleFormat () {
  setPositionFormat(session.positionFormat === 'time' ? 'musical' : 'time')
}

function openInterfaceSettings () {
  closeMenus()
  openSettings()
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
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function commitBpm (e) {
  setBpm(Number((e && e.target && e.target.value) || session.bpm))
  editBpm.value = false
  setTyping(false)
}

function openProject () {
  openProjectManager()
}

function openRecent (item) {
  closeMenus()
  if (item && item.id) openStoredProject(item.id)
  else openProjectManager()
}

async function run (action) {
  closeMenus()
  const map = {
    manager: openProjectManager,
    new: async () => { await newProject(); await addTrack('midi', 'Instrument 1') },
    open: openProject,
    save: saveCurrentProject,
    saveAs: async () => {
      const name = typeof window !== 'undefined'
        ? window.prompt('Save project as', session.projectName || 'Untitled')
        : session.projectName
      if (name != null) await saveProjectAs(name)
    },
    demo: loadDemoProject,
    autosave: restoreAutosave,
    export: exportProject,
    undo: undoEdit,
    redo: redoEdit,
    stop,
    record: toggleRecord,
    loop: toggleLoop,
    metro: toggleMetronome,
    snap: toggleSnap,
    diag: toggleDiagnostics,
    arrangement: () => setWorkspaceView('arrangement'),
    piano: () => setWorkspaceView('piano'),
    mixer: () => setWorkspaceView('mixer'),
    sampler: () => openPluginUI(session.selectedTrack)
  }
  if (map[action]) map[action]()
}

onMounted(() => {
  measure()
  if (typeof window !== 'undefined') window.addEventListener('resize', measure)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure)
})
</script>

<style scoped>
.top {
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  position: relative;
  z-index: 30;
  user-select: none;
}
.row {
  display: flex;
  align-items: center;
  min-height: 48px;
  padding: 0 10px;
}
.row.secondary {
  min-height: 32px;
  justify-content: center;
  border-top: 1px solid #222;
  padding-bottom: 4px;
}
.left, .center, .right {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}
.left { flex: 1; }
.center { justify-content: center; }
.right { flex: 1; justify-content: flex-end; gap: 6px; }
.hit {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.hit:hover { background: #353535; }
.hit.on { background: rgba(77,163,255,0.16); }
.hit.play { width: 32px; }
.hit.play.on { background: rgba(46,164,79,0.16); }
.hit.rec.on { background: rgba(231,76,60,0.18); }
.hit.dim { opacity: 0.35; }
.project {
  min-width: 0;
  max-width: 180px;
  padding: 4px 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}
.proj-name {
  color: #e6e6e6;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.save-cap {
  color: #6a6a6a;
  font-size: 10px;
  line-height: 12px;
}
.readout {
  min-width: 132px;
  height: 28px;
  margin-left: 8px;
  padding: 0 10px;
  border-radius: 3px;
  background: #0e0e0e;
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}
.readout.recording { box-shadow: inset 0 0 0 1px rgba(231,76,60,0.55); }
.pos {
  color: #e6e6e6;
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
}
.phone-pos { font-size: 20px; }
.rec-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #e74c3c;
  flex-shrink: 0;
}
.tempo, .sig {
  min-width: 52px;
  height: 22px;
  color: #e6e6e6;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tempo { cursor: ns-resize; }
.unit { color: #6a6a6a; font-size: 9px; font-weight: 700; margin-left: 3px; }
.bpm-input {
  width: 48px;
  background: #0e0e0e;
  color: #e6e6e6;
  border: 1px solid #4da3ff;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  border-radius: 3px;
}
.status {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #8d8d8d;
  font-size: 11px;
  cursor: pointer;
  padding: 0 4px;
}
.led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #6a6a6a;
}
.led.connected { background: #7a9e78; }
.led.loading { background: #c8b06a; }
.led.error { background: #c45c5c; }
.led.offline { background: #6a6a6a; }
.nav { display: flex; gap: 1px; }
.menu {
  position: absolute;
  top: 46px;
  min-width: 180px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  z-index: 50;
  box-shadow: 0 8px 24px rgba(0,0,0,0.45);
}
.left-menu { left: 10px; }
.right-menu, .sig-menu { right: 10px; }
.item {
  padding: 8px 14px;
  color: #e6e6e6;
  font-size: 13px;
  cursor: pointer;
}
.item:hover { background: #3a3a3a; }
.item.on::after { content: ' ✓'; color: #4da3ff; }
.sep { height: 1px; margin: 6px 10px; background: #2a2a2a; }
.item.muted { color: #8d8d8d; cursor: default; }
.bpm-sheet {
  position: absolute;
  left: 50%;
  top: 52px;
  transform: translateX(-50%);
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 12px 16px;
  z-index: 60;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sheet-cap { color: #8d8d8d; font-size: 11px; }
.phone-bpm { width: 88px; height: 36px; font-size: 18px; }
.bpm-overlay {
  position: absolute;
  left: 50%;
  top: 52px;
  transform: translateX(-50%);
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  padding: 12px 16px;
  z-index: 60;
}
.phone .project { max-width: 42vw; }
.phone .center { flex: 0; }
.phone .left, .phone .right { flex: 1; }
</style>
