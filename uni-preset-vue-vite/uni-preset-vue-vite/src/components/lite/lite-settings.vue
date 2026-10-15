<template>
  <lite-sheet :open="session.settingsOpen" title="Settings" @close="closeSettings">
    <text class="lt-cap">Interface</text>
    <view class="lt-seg modes">
      <view
        v-for="mode in MODES"
        :key="mode.id"
        class="lt-seg-item"
        :class="{ on: shell === mode.id }"
        @click="setInterfaceMode(mode.id)"
      >{{ mode.label }}</view>
    </view>
    <text class="hint">{{ modeHint }}</text>

    <text class="lt-cap">Editing</text>
    <view class="lt-row plain">
      <text class="grow">Snap</text>
      <view class="lt-seg snaps">
        <view
          v-for="option in SNAPS"
          :key="option.id"
          class="lt-seg-item"
          :class="{ on: snapOn(option) }"
          @click="setSnapGrid(option.beats)"
        >{{ option.name }}</view>
      </view>
    </view>
    <view class="lt-row" @click="toggleMetronome">
      <text class="grow">Metronome</text>
      <view class="switch" :class="{ on: session.metronome }"><view class="knob" /></view>
    </view>

    <text class="lt-cap">Engine</text>
    <view class="engine">
      <view class="engine-head">
        <view class="led" :class="cloud ? 'browser' : engineState()" />
        <text class="grow">{{ cloud ? 'Browser' : 'PC engine' }}</text>
        <text class="state">{{ cloud ? 'PC not connected' : engineStateLabel() }}</text>
      </view>
      <text class="engine-sub">{{ modeDetail }}</text>
      <input
        class="host"
        :value="host"
        placeholder="PC address, e.g. 192.168.1.10:17890"
        @change="onHost"
      >
      <text class="engine-sub">{{ hostHint }}</text>
    </view>
  </lite-sheet>
</template>

<script setup>
import { computed, ref } from 'vue'
import LiteSheet from './lite-sheet.vue'
import {
  session,
  SNAP_OPTIONS,
  closeSettings,
  setInterfaceMode,
  interfaceShell,
  setSnapGrid,
  toggleMetronome,
  engineState,
  engineStateLabel,
  engineHostValue,
  setEngineHost,
  isCloudMode
} from '../../store/session.js'
import { engineHostHintText, parseEngineHost } from '../../bridge/engine.js'

const MODES = [
  { id: 'lite', label: 'Lite', hint: 'Touch layout for tablets.' },
  { id: 'le', label: 'LE', hint: 'The previous touch layout.' },
  { id: 'professional', label: 'Pro', hint: 'Full desktop layout.' }
]
const SNAP_IDS = ['off', '1/4', '1/8', '1/16', '1/32']
const SNAPS = SNAP_IDS.map((id) => SNAP_OPTIONS.find((option) => option.id === id)).filter(Boolean)

const shell = computed(() => interfaceShell())
const modeHint = computed(() => {
  const mode = MODES.find((item) => item.id === shell.value)
  return (mode ? mode.hint + ' ' : '') + 'All layouts edit the same project.'
})
const host = ref(engineHostValue())
const hostHint = computed(() => engineHostHintText({ parsed: parseEngineHost(host.value) }))
const cloud = computed(() => isCloudMode())
const modeDetail = computed(() => (cloud.value
  ? 'M Orchestra, Orchestra V, mixing and effects play in this browser. BBCSO and Synchron need the DawWeb engine on your PC.'
  : 'Connected to the DawWeb engine on your PC.'
))

function snapOn (option) {
  if (!option.beats) return !session.snap
  return session.snap && Math.abs(session.snapGridBeats - option.beats) < 1e-6
}

function onHost (e) {
  const value = (e.target && e.target.value) || ''
  host.value = value
  setEngineHost(value)
}
</script>

<style scoped>
.modes .lt-seg-item { flex: 1; }
.hint {
  display: block;
  margin-top: 8px;
  color: var(--lt-ink-2);
  font-size: var(--lt-fs-s);
}
.lt-row.plain { cursor: default; }
.snaps .lt-seg-item { min-width: 48px; padding: 0 10px; }
.switch {
  width: 46px;
  height: 28px;
  border-radius: 14px;
  background: var(--lt-s3);
  position: relative;
  transition: background 140ms ease;
}
.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--lt-ink);
  transition: transform 140ms ease;
}
.switch.on { background: var(--lt-accent); }
.switch.on .knob { transform: translateX(18px); }
.engine {
  background: var(--lt-s2);
  border-radius: var(--lt-radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.engine-head { display: flex; align-items: center; gap: 10px; font-size: var(--lt-fs-m); }
.engine-head .grow { flex: 1; }
.state { color: var(--lt-ink-2); font-size: var(--lt-fs-s); }
.engine-sub { color: var(--lt-ink-2); font-size: var(--lt-fs-s); line-height: 1.45; }
.led { width: 8px; height: 8px; border-radius: 50%; background: #5a5d63; }
.led.connected { background: var(--lt-ok); }
.led.loading { background: #e0b341; }
.led.error { background: var(--lt-warn); }
.led.browser { background: var(--lt-accent); }
.host {
  height: 44px;
  padding: 0 12px;
  border-radius: var(--lt-radius);
  background: var(--lt-s1);
  color: var(--lt-ink);
  font-size: var(--lt-fs-m);
  box-sizing: border-box;
}
</style>
