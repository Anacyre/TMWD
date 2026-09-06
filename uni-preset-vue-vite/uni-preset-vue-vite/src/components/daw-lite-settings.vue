<template>
  <daw-lite-sheet :open="session.settingsOpen" title="Settings" @close="closeSettings">
    <text class="cap">Interface Mode</text>
    <view class="radios">
      <view class="radio" :class="{ on: !lite }" @click="setInterfaceMode('professional')">
        <view class="dot" />
        <view class="copy">
          <text class="lab">Professional</text>
          <text class="sub">Full desktop layout</text>
        </view>
      </view>
      <view class="radio" :class="{ on: lite }" @click="setInterfaceMode('lite')">
        <view class="dot" />
        <view class="copy">
          <text class="lab">Lite</text>
          <text class="sub">Mobile-first arrangement, piano roll, mixer</text>
        </view>
      </view>
    </view>
    <text class="note">Both modes edit the same project. Switching does not reload.</text>
    <view class="row">
      <text>Snap</text>
      <view class="chip" @click="toggleSnap">{{ session.snap ? 'On' : 'Off' }}</view>
    </view>
    <view class="row">
      <text>Metronome</text>
      <view class="chip" @click="toggleMetronome">{{ session.metronome ? 'On' : 'Off' }}</view>
    </view>
    <text class="cap host-cap">Playback engine</text>
    <view class="mode" :class="cloud ? 'cloud' : 'local'">
      <view class="mode-head">
        <view class="led" :class="engineState()" />
        <text class="mode-name">{{ cloud ? 'Cloud (browser)' : 'PC engine' }}</text>
        <text class="mode-state">{{ engineStateLabel() }}</text>
      </view>
      <text class="mode-sub">{{ modeDetail }}</text>
    </view>
    <text class="cap host-cap">Engine host</text>
    <input
      class="host"
      :value="host"
      placeholder="engine.example.com or 192.168.1.10:17890"
      @change="onHost"
    >
    <text class="note">{{ hostHint }}</text>
  </daw-lite-sheet>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawLiteSheet from './daw-lite-sheet.vue'
import {
  session,
  closeSettings,
  setInterfaceMode,
  isLite,
  toggleSnap,
  toggleMetronome,
  engineState,
  engineStateLabel,
  engineHostValue,
  setEngineHost,
  isCloudMode
} from '../store/session.js'
import { engineHostHintText, parseEngineHost } from '../bridge/engine.js'

const lite = computed(() => isLite())
const host = ref(engineHostValue())
const hostHint = computed(() => engineHostHintText({ parsed: parseEngineHost(host.value) }))
const cloud = computed(() => isCloudMode())
const modeDetail = computed(() => (cloud.value
  ? 'M Orchestra, mixing and effects run in this browser. BBCSO / Synchron need NewProject.exe running on your PC.'
  : 'Connected to the PC engine — BBCSO and Synchron Player are available on this device.'
))

function onHost (e) {
  const value = (e.target && e.target.value) || ''
  host.value = value
  setEngineHost(value)
}
</script>

<style scoped>
.cap {
  display: block;
  color: #8d8d8d;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.radios { display: flex; flex-direction: column; gap: 8px; }
.radio {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-height: 48px;
  padding: 10px 12px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
}
.radio.on { border-color: #4da3ff; background: #1a1a1a; }
.dot {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid #6a6a6a;
  margin-top: 2px;
  flex-shrink: 0;
}
.radio.on .dot {
  border-color: #4da3ff;
  box-shadow: inset 0 0 0 4px #4da3ff;
}
.copy { display: flex; flex-direction: column; gap: 2px; }
.lab { color: #e6e6e6; font-size: 15px; }
.sub { color: #8d8d8d; font-size: 12px; }
.note {
  display: block;
  color: #6a6a6a;
  font-size: 12px;
  margin: 14px 0 16px;
  line-height: 1.4;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  color: #e6e6e6;
  font-size: 14px;
}
.chip {
  min-width: 48px;
  min-height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2b2b2b;
  color: #e6e6e6;
  border-radius: 6px;
  font-size: 13px;
}
.mode {
  margin-top: 6px;
  padding: 10px 12px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: #161616;
}
.mode.cloud { border-color: #21414f; background: #14212a; }
.mode-head { display: flex; align-items: center; gap: 8px; }
.mode-name { color: #e6e6e6; font-size: 14px; flex: 1; min-width: 0; }
.mode-state { color: #8d8d8d; font-size: 11px; }
.mode-sub {
  display: block;
  margin-top: 6px;
  color: #8d8d8d;
  font-size: 12px;
  line-height: 1.4;
}
.mode.cloud .mode-name { color: #cfe8f2; }
.mode.cloud .mode-sub { color: #8fb4c4; }
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5a5a5a;
}
.led.connected { background: #4da3ff; }
.led.loading { background: #c4a026; }
.led.error { background: #c45c26; }
.led.offline { background: #5a5a5a; }
.host-cap { margin-top: 18px; }
.host {
  width: 100%;
  min-height: 40px;
  margin-top: 6px;
  padding: 8px 10px;
  border: 1px solid #3a3a3a;
  border-radius: 8px;
  background: #161616;
  color: #e6e6e6;
  font-size: 14px;
}
</style>
