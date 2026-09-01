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
    <view class="engine">
      <view class="led" :class="engineState()" />
      <text>{{ engineStateLabel() }}</text>
    </view>
    <text class="cap host-cap">Engine host</text>
    <input
      class="host"
      :value="host"
      placeholder="192.168.1.10:17890"
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
  setEngineHost
} from '../store/session.js'
import { mixedContentHint } from '../bridge/engine.js'

const lite = computed(() => isLite())
const host = ref(engineHostValue())
const hostHint = computed(() => mixedContentHint()
  || 'BBCSO / Synchron need DawWeb.exe on the PC. Enter that machine’s LAN IP:port. M Orchestra is browser cloud samples and does not use this.')

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
.engine {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #8d8d8d;
  font-size: 12px;
}
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
