<template>
  <view class="editor">
    <view class="tabs">
      <text class="tab" :class="{ on: session.editorTab === 'piano' }" @click="setEditorTab('piano')">Piano Roll</text>
      <text class="tab" :class="{ on: pluginTabOn }" @click="openPluginTab">{{ pluginTabLabel }}</text>
      <text class="tab" :class="{ on: session.editorTab === 'automation' }" @click="setEditorTab('automation')">Automation</text>
      <text class="tab" :class="{ on: session.editorTab === 'info' }" @click="setEditorTab('info')">Track Info</text>
      <view class="spacer" />
      <view class="icon-btn" @click.stop="closeEditor" @tap.stop="closeEditor">×</view>
    </view>
    <daw-piano-roll v-if="session.editorTab === 'piano'" embedded />
    <daw-m-orchestra v-else-if="pluginTabOn && (session.editorTab === 'm-orchestra' || mOrchestra)" />
    <daw-orchestra-sampler v-else-if="pluginTabOn" />
    <view v-else-if="session.editorTab === 'automation'" class="info">
      <text class="note">Automation lanes are visual only, matching the native editor. Volume, pan, expression and send are not yet played by the engine.</text>
    </view>
    <view v-else class="info">
      <text class="title">{{ track ? track.name : 'No track selected' }}</text>
      <view class="row"><text>Type</text><text>{{ track ? track.type : '-' }}</text></view>
      <view class="row"><text>Instrument</text><text>{{ track && track.instrument ? track.instrument : '-' }}</text></view>
      <view class="row"><text>Section</text><text>{{ track && track.section ? track.section : '-' }}</text></view>
      <view class="row"><text>MIDI</text><text>{{ track && track.type === 'midi' ? ('Channel ' + track.midiChannel) : '-' }}</text></view>
      <view class="row"><text>Volume</text><text>{{ track ? track.volume.toFixed(2) : '-' }}</text></view>
      <view class="row"><text>Pan</text><text>{{ track ? track.pan.toFixed(2) : '-' }}</text></view>
      <view class="row"><text>Output</text><text>{{ track && track.type === 'master' ? 'Stereo Out' : 'Master' }}</text></view>
      <view class="btn" v-if="track && track.type !== 'master'" @click="openPluginPicker(session.selectedTrack)">Insert Plugin…</view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import DawPianoRoll from './daw-piano-roll.vue'
import DawOrchestraSampler from './daw-orchestra-sampler.vue'
import DawMOrchestra from './daw-m-orchestra.vue'
import { session, getSelectedTrack, setEditorTab, closeEditor, openPluginPicker } from '../store/session.js'
import { isMOrchestraTrack } from '../model/m-orchestra-ui.js'

const track = computed(() => getSelectedTrack())
const mOrchestra = computed(() => isMOrchestraTrack(track.value))
const pluginTabOn = computed(() => session.editorTab === 'sampler' || session.editorTab === 'm-orchestra')
const pluginTabLabel = computed(() => mOrchestra.value ? 'M Orchestra' : 'Orchestra Sampler')

function openPluginTab () {
  setEditorTab(mOrchestra.value ? 'm-orchestra' : 'sampler')
}
</script>

<style scoped>
.editor {
  height: 100%;
  background: #141414;
  border-top: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
}
.tabs {
  height: 28px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
}
.tab {
  padding: 4px 10px;
  color: #8d8d8d;
  font-size: 11px;
  font-weight: 700;
  border-radius: 3px;
  cursor: pointer;
}
.tab.on { background: #232323; color: #e6e6e6; }
.spacer { flex: 1; }
.icon-btn { width: 22px; color: #8d8d8d; cursor: pointer; text-align: center; }
.info { padding: 16px 18px; color: #b0b0b0; font-size: 13px; }
.title { display: block; color: #e6e6e6; font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.row { display: flex; justify-content: space-between; max-width: 360px; padding: 4px 0; }
.row text:last-child { color: #e6e6e6; }
.note { color: #8d8d8d; }
.btn {
  margin-top: 16px;
  display: inline-block;
  background: #2b2b2b;
  border: 1px solid #3a3a3a;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  color: #e6e6e6;
}
</style>
