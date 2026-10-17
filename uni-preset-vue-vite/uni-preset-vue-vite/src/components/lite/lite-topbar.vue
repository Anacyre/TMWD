<template>
  <view class="bar">
    <view class="side left">
      <view class="project" aria-label="Projects" @click.stop="openProjects">
        <text class="name">{{ session.projectName || 'Untitled' }}</text>
        <daw-icon name="chevron" :size="14" color="currentColor" />
      </view>
    </view>

    <view class="center">
      <view class="lt-seg views">
        <view class="lt-seg-item" :class="{ on: view !== 'mixer' }" @click.stop="setWorkspaceView('arrangement')">Arrange</view>
        <view class="lt-seg-item" :class="{ on: view === 'mixer' }" @click.stop="setWorkspaceView('mixer')">Mix</view>
      </view>
      <view class="transport">
        <view class="lt-hit" aria-label="Return to start" @click.stop="returnToStart">
          <daw-icon name="to-start" :size="18" color="currentColor" />
        </view>
        <view class="lt-hit play" :class="{ on: session.playing }" :aria-label="session.playing ? 'Pause' : 'Play'" @click.stop="togglePlay">
          <daw-icon :name="session.playing ? 'pause' : 'play'" :size="20" color="currentColor" />
        </view>
        <view class="lt-hit" :class="{ on: session.looping }" aria-label="Loop" @click.stop="toggleLoop">
          <daw-icon name="loop" :size="18" color="currentColor" />
        </view>
      </view>
      <view class="readout" @click.stop="toggleFormat">
        <text class="pos">{{ positionDisplay }}</text>
      </view>
      <view v-if="!editingBpm" class="bpm" aria-label="Tempo" @click.stop="editBpm">
        <text class="bpm-val">{{ Math.round(session.bpm) }}</text>
        <text class="bpm-unit">BPM</text>
      </view>
      <input
        v-else
        class="bpm-input"
        type="number"
        :value="Math.round(session.bpm)"
        :focus="true"
        @blur="commitBpm"
        @confirm="commitBpm"
      >
    </view>

    <view class="side right">
      <view class="lt-hit" :class="{ dim: !session.canUndo }" aria-label="Undo" @click.stop="undoEdit">
        <daw-icon name="undo" :size="20" color="currentColor" />
      </view>
      <view class="lt-hit" :class="{ dim: !session.canRedo }" aria-label="Redo" @click.stop="redoEdit">
        <daw-icon name="redo" :size="20" color="currentColor" />
      </view>
      <view class="lt-hit" aria-label="Settings" @click.stop="openSettings">
        <daw-icon name="settings" :size="20" color="currentColor" />
      </view>
    </view>

    <view v-if="busyBar" class="load" :aria-label="busyLabel">
      <view class="load-fill" :style="{ width: sampleLoadPct }" />
    </view>
    <view v-if="session.audioBlocked" class="unlock" @click.stop="unlockAudioForUser">Tap to enable sound</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from '../daw-icon.vue'
import {
  session,
  positionText,
  secondsText,
  togglePlay,
  returnToStart,
  toggleLoop,
  undoEdit,
  redoEdit,
  setBpm,
  setPositionFormat,
  setWorkspaceView,
  setTyping,
  openSettings,
  openProjects,
  unlockAudioForUser
} from '../../store/session.js'
import { cloudAuth } from '../../store/cloud-auth.js'

const editingBpm = ref(false)
const view = computed(() => session.workspaceView)
const positionDisplay = computed(() => (session.positionFormat === 'time' ? secondsText.value : positionText.value))
const busyBar = computed(() => {
  if (session.sampleLoad.active) return true
  const status = String(session.saveStatus || '')
  if (/saving|exporting|loading|upload/i.test(status)) return true
  return !!cloudAuth.busy
})
const busyLabel = computed(() => session.saveStatus || (cloudAuth.busy ? 'Cloud' : 'Loading'))
const sampleLoadPct = computed(() => {
  if (session.sampleLoad.active) {
    const total = session.sampleLoad.total || 0
    if (!total) return '8%'
    return Math.max(8, Math.min(100, Math.round(session.sampleLoad.done / total * 100))) + '%'
  }
  return '36%'
})

function toggleFormat () {
  setPositionFormat(session.positionFormat === 'time' ? 'musical' : 'time')
}

function editBpm () {
  editingBpm.value = true
  setTyping(true)
}

function commitBpm (e) {
  const raw = Number((e && e.detail && e.detail.value) || (e && e.target && e.target.value))
  if (Number.isFinite(raw) && raw >= 20 && raw <= 400) setBpm(raw)
  editingBpm.value = false
  setTyping(false)
}
</script>

<style scoped>
.bar {
  height: calc(56px + env(safe-area-inset-top, 0px));
  padding: env(safe-area-inset-top, 0px) 8px 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--lt-bg);
  box-shadow: inset 0 -1px 0 var(--lt-line);
  position: relative;
  flex-shrink: 0;
  box-sizing: border-box;
  z-index: 5;
}
.side { flex: 1 1 0; min-width: 0; display: flex; align-items: center; }
.right { justify-content: flex-end; gap: 2px; }
.project {
  height: 40px;
  max-width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-radius: var(--lt-radius);
  color: var(--lt-ink-2);
  cursor: pointer;
  box-sizing: border-box;
}
.project:active { background: var(--lt-s2); }
.name {
  display: block;
  flex: none;
  max-width: 220px;
  color: var(--lt-ink);
  font-size: var(--lt-fs-m);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.center {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.views .lt-seg-item { min-width: 76px; }
.transport { display: flex; align-items: center; }
.lt-hit { color: var(--lt-ink-2); }
.lt-hit.on { color: var(--lt-accent); }
.play {
  width: 48px;
  color: var(--lt-ink);
}
.play.on { color: var(--lt-ok); }
.readout {
  min-width: 108px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--lt-radius);
  background: var(--lt-s1);
  cursor: pointer;
}
.pos { font-size: var(--lt-fs-m); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.bpm, .bpm-input {
  width: 72px;
  height: 40px;
  border-radius: var(--lt-radius);
  background: var(--lt-s1);
  box-sizing: border-box;
}
.bpm {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 4px;
  padding-top: 10px;
  cursor: pointer;
}
.bpm-val { font-size: var(--lt-fs-m); font-variant-numeric: tabular-nums; }
.bpm-unit { font-size: 10px; color: var(--lt-ink-2); letter-spacing: 0.06em; }
.bpm-input {
  text-align: center;
  color: var(--lt-ink);
  font-size: var(--lt-fs-m);
  box-shadow: inset 0 0 0 1px var(--lt-accent);
}
.load {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 2px;
  background: var(--lt-line);
}
.load-fill { height: 100%; background: var(--lt-accent); transition: width 200ms ease; }
.unlock {
  position: absolute;
  left: 50%;
  top: calc(100% + 8px);
  transform: translateX(-50%);
  padding: 10px 16px;
  border-radius: 20px;
  background: var(--lt-accent);
  color: #0b0c0e;
  font-size: var(--lt-fs-s);
  font-weight: 600;
  white-space: nowrap;
  z-index: 20;
}
@media (max-width: 900px) {
  .readout { min-width: 92px; }
  .views .lt-seg-item { min-width: 60px; padding: 0 10px; }
}
@media (max-width: 760px) {
  .bpm { display: none; }
}
</style>
