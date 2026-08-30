<template>
  <view class="root">
    <daw-lite-app v-if="lite" />
    <view v-else class="daw" @click="closeMenus">
    <daw-top-bar @audio-settings="onAudioSettings" />
    <view class="workspace" :class="session.workspaceView">
      <view
        v-show="showArrangement"
        class="arrange"
      >
        <daw-playlist />
        <view
          v-if="session.inspectorVisible && !isPhone"
          class="split"
          @mousedown.stop="dragSplit('inspector', $event)"
        />
        <view
          v-if="session.inspectorVisible && !isPhone"
          class="inspector-wrap"
          :style="{ width: inspectorWidth + 'px' }"
        >
          <daw-inspector />
        </view>
      </view>
      <view
        v-if="session.editorVisible && showEditor"
        class="hsplit"
        @mousedown.stop="dragSplit('editor', $event)"
      />
      <view
        v-if="session.editorVisible && showEditor"
        class="editor-wrap"
        :style="{ height: editorHeight + 'px' }"
      >
        <daw-editor />
      </view>
      <view
        v-if="session.mixerVisible && showMixer"
        class="hsplit"
        @mousedown.stop="dragSplit('mixer', $event)"
      />
      <view
        v-if="session.mixerVisible && showMixer"
        class="mixer-wrap"
        :style="{ height: mixerHeight + 'px' }"
      >
        <daw-mixer />
      </view>
    </view>
    <daw-status />
    <daw-instrument-browser />
    <daw-diagnostics />
    <daw-lite-settings />
    <daw-project-manager />
    <view v-if="session.toast" class="toast">{{ session.toast }}</view>
    </view>
    <plugin-host v-if="!lite" />
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import DawTopBar from '../../components/daw-top-bar.vue'
import DawPlaylist from '../../components/daw-playlist.vue'
import DawInspector from '../../components/daw-inspector.vue'
import DawEditor from '../../components/daw-editor.vue'
import DawMixer from '../../components/daw-mixer.vue'
import DawStatus from '../../components/daw-status.vue'
import DawInstrumentBrowser from '../../components/daw-instrument-browser.vue'
import DawDiagnostics from '../../components/daw-diagnostics.vue'
import PluginHost from '../../components/dsp/plugin-host.vue'
import DawLiteApp from '../../components/daw-lite-app.vue'
import DawLiteSettings from '../../components/daw-lite-settings.vue'
import DawProjectManager from '../../components/daw-project-manager.vue'
import {
  session,
  closeMenus,
  togglePlay,
  stop,
  returnToStart,
  toggleLoop,
  toggleRecord,
  getSelectedClip,
  exportProject,
  showToast,
  startEngineBridge,
  stopEngineBridge,
  engineLink,
  undoEdit,
  redoEdit,
  copySelectedClips,
  pasteClips,
  duplicateSelectedClips,
  deleteSelectedClips,
  setWorkspaceView,
  setEditorTab,
  closeEditor,
  isLite
} from '../../store/session.js'

const inspectorWidth = ref(250)
const editorHeight = ref(268)
const mixerHeight = ref(236)
const isPhone = ref(false)
const lite = computed(() => isLite())

const showArrangement = computed(() => !isPhone.value || session.workspaceView === 'arrangement')
const showEditor = computed(() => !isPhone.value || session.workspaceView === 'piano' || session.workspaceView === 'sampler')
const showMixer = computed(() => !isPhone.value || session.workspaceView === 'mixer')

function measure () {
  isPhone.value = typeof window !== 'undefined' && window.innerWidth < 720
  if (isPhone.value) {
    editorHeight.value = Math.min(window.innerHeight - 96, window.innerHeight)
    mixerHeight.value = Math.min(window.innerHeight - 96, window.innerHeight)
  }
}

function dragSplit (kind, e) {
  const startX = e.clientX
  const startY = e.clientY
  const start = {
    inspector: inspectorWidth.value,
    editor: editorHeight.value,
    mixer: mixerHeight.value
  }
  const move = (ev) => {
    if (kind === 'inspector') {
      inspectorWidth.value = Math.min(Math.max(190, start.inspector - (ev.clientX - startX)), 420)
    } else if (kind === 'editor') {
      editorHeight.value = Math.min(Math.max(150, start.editor - (ev.clientY - startY)), 480)
    } else if (kind === 'mixer') {
      mixerHeight.value = Math.min(Math.max(220, start.mixer - (ev.clientY - startY)), 520)
    }
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

function onAudioSettings () {
  showToast(session.engineStatus || 'Open Audio Settings in the DawWeb window.')
}

function onKey (e) {
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || session.typing) return
  if (e.code === 'Space') {
    e.preventDefault()
    togglePlay()
  } else if (e.code === 'Escape') {
    if (session.editorVisible && (session.workspaceView === 'piano' || session.editorTab === 'piano')) {
      closeEditor()
    } else {
      stop()
    }
  } else if (e.code === 'Home') {
    returnToStart()
  } else if (e.code === 'Enter') {
    const clip = getSelectedClip()
    if (clip) {
      setEditorTab('piano')
      setWorkspaceView('piano')
    }
  } else if (e.key === 'l' || e.key === 'L') {
    toggleLoop()
  } else if (e.key === 'r' || e.key === 'R') {
    toggleRecord()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    e.shiftKey ? redoEdit() : undoEdit()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault()
    redoEdit()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    exportProject()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    if (session.pianoRollFocus) return
    e.preventDefault()
    copySelectedClips()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    if (session.pianoRollFocus) return
    e.preventDefault()
    pasteClips()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    if (session.pianoRollFocus) return
    e.preventDefault()
    duplicateSelectedClips()
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    if (session.pianoRollFocus) return
    if (getSelectedClip()) deleteSelectedClips()
  }
}

watch(() => engineLink.connected, (connected) => {
  showToast(connected ? 'Connected to DawWeb engine' : 'Engine offline — local preview')
})

onMounted(() => {
  measure()
  if (lite.value && session.trackHeight < 64) session.trackHeight = 64
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', measure)
  }
  startEngineBridge()
})
onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', measure)
  }
  stopEngineBridge()
})
</script>

<style scoped>
.root {
  height: 100vh;
  height: 100dvh;
  width: 100%;
}
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
.workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.arrange {
  flex: 1;
  display: flex;
  min-height: 0;
}
.inspector-wrap, .editor-wrap, .mixer-wrap {
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
}
.split {
  width: 5px;
  cursor: ew-resize;
  background: transparent;
  position: relative;
  z-index: 5;
  flex-shrink: 0;
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
.hsplit {
  height: 5px;
  cursor: ns-resize;
  position: relative;
  flex-shrink: 0;
}
.hsplit::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 0;
  right: 0;
  height: 1px;
  background: #2a2a2a;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: 48px;
  transform: translateX(-50%);
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #e6e6e6;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 80;
  max-width: min(520px, calc(100% - 48px));
  text-align: center;
}
@media (max-width: 720px) {
  .editor-wrap, .mixer-wrap { height: 100% !important; }
  .toast { bottom: 28px; font-size: 12px; }
}
</style>
