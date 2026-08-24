<template>
  <view class="daw" @click="closeMenus">
    <daw-header @audio-settings="onAudioSettings" />
    <daw-transport />
    <view class="workspace">
      <view class="arrange">
        <view class="side" :style="{ width: trackListWidth + 'px' }">
          <daw-track-list :scroll-top="scrollY" @scroll="onTrackScroll" />
        </view>
        <view class="split" @mousedown.stop="dragSplit('track', $event)" />
        <daw-arrangement :scroll-top="scrollY" @scroll="onArrScroll" />
        <view
          v-if="session.inspectorVisible"
          class="split"
          @mousedown.stop="dragSplit('inspector', $event)"
        />
        <view
          v-if="session.inspectorVisible"
          class="inspector-wrap"
          :style="{ width: inspectorWidth + 'px' }"
        >
          <daw-inspector />
        </view>
      </view>
      <view
        v-if="session.editorVisible"
        class="hsplit"
        @mousedown.stop="dragSplit('editor', $event)"
      />
      <view
        v-if="session.editorVisible"
        class="editor-wrap"
        :style="{ height: editorHeight + 'px' }"
      >
        <daw-editor />
      </view>
      <view
        v-if="session.mixerVisible"
        class="hsplit"
        @mousedown.stop="dragSplit('mixer', $event)"
      />
      <view
        v-if="session.mixerVisible"
        class="mixer-wrap"
        :style="{ height: mixerHeight + 'px' }"
      >
        <daw-mixer />
      </view>
    </view>
    <daw-status />
    <daw-instrument-browser />
    <view v-if="session.toast" class="toast">{{ session.toast }}</view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import DawHeader from '../../components/daw-header.vue'
import DawTransport from '../../components/daw-transport.vue'
import DawTrackList from '../../components/daw-track-list.vue'
import DawArrangement from '../../components/daw-arrangement.vue'
import DawInspector from '../../components/daw-inspector.vue'
import DawEditor from '../../components/daw-editor.vue'
import DawMixer from '../../components/daw-mixer.vue'
import DawStatus from '../../components/daw-status.vue'
import DawInstrumentBrowser from '../../components/daw-instrument-browser.vue'
import {
  session,
  closeMenus,
  togglePlay,
  stop,
  returnToStart,
  toggleLoop,
  toggleRecord,
  toggleEditor,
  toggleMixer,
  toggleInspector,
  deleteClip,
  duplicateClip,
  getSelectedClip,
  exportProject,
  showToast,
  startEngineBridge,
  stopEngineBridge,
  engineLink
} from '../../store/session.js'

const trackListWidth = ref(258)
const inspectorWidth = ref(250)
const editorHeight = ref(268)
const mixerHeight = ref(236)
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

function dragSplit (kind, e) {
  const startX = e.clientX
  const startY = e.clientY
  const start = {
    track: trackListWidth.value,
    inspector: inspectorWidth.value,
    editor: editorHeight.value,
    mixer: mixerHeight.value
  }
  const move = (ev) => {
    if (kind === 'track') {
      trackListWidth.value = Math.min(Math.max(180, start.track + ev.clientX - startX), 520)
    } else if (kind === 'inspector') {
      inspectorWidth.value = Math.min(Math.max(190, start.inspector - (ev.clientX - startX)), 420)
    } else if (kind === 'editor') {
      editorHeight.value = Math.min(Math.max(150, start.editor - (ev.clientY - startY)), 480)
    } else if (kind === 'mixer') {
      mixerHeight.value = Math.min(Math.max(150, start.mixer - (ev.clientY - startY)), 420)
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
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
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
  } else if (e.key === 'e' || e.key === 'E') {
    toggleEditor()
  } else if (e.key === 'm' || e.key === 'M') {
    toggleMixer()
  } else if (e.key === 'i' || e.key === 'I') {
    toggleInspector()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
    e.preventDefault()
    exportProject()
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
    e.preventDefault()
    duplicateClip(getSelectedClip())
  } else if (e.code === 'Delete' || e.code === 'Backspace') {
    if (getSelectedClip()) deleteClip(getSelectedClip())
  }
}

watch(() => engineLink.connected, (connected) => {
  showToast(connected ? 'Connected to DawWeb engine' : 'Engine offline — local preview')
})

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)
  startEngineBridge()
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey)
  stopEngineBridge()
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
.side, .inspector-wrap, .editor-wrap, .mixer-wrap {
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
