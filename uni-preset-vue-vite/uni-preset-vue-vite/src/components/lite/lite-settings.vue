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

    <text class="lt-cap">Pointer</text>
    <view class="lt-seg modes">
      <view
        v-for="mode in INPUTS"
        :key="mode.id"
        class="lt-seg-item"
        :class="{ on: session.inputMode === mode.id }"
        @click="setInputMode(mode.id)"
      >{{ mode.label }}</view>
    </view>
    <text class="hint">{{ inputHint }}</text>

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
  </lite-sheet>
</template>

<script setup>
import { computed } from 'vue'
import LiteSheet from './lite-sheet.vue'
import {
  session,
  SNAP_OPTIONS,
  closeSettings,
  setInterfaceMode,
  setInputMode,
  interfaceShell,
  setSnapGrid,
  toggleMetronome
} from '../../store/session.js'

const MODES = [
  { id: 'lite', label: 'Lite', hint: 'Touch layout for tablets.' },
  { id: 'le', label: 'LE', hint: 'The previous touch layout.' },
  { id: 'professional', label: 'Pro', hint: 'Full desktop layout.' }
]
const INPUTS = [
  { id: 'touch', label: 'Touch', hint: 'One finger scrolls. Drag a clip to move it. Pinch to zoom.' },
  { id: 'pc', label: 'PC', hint: 'One finger edits. Two fingers move and zoom.' }
]
const SNAP_IDS = ['off', '1/4', '1/8', '1/16', '1/32']
const SNAPS = SNAP_IDS.map((id) => SNAP_OPTIONS.find((option) => option.id === id)).filter(Boolean)

const shell = computed(() => interfaceShell())
const modeHint = computed(() => {
  const mode = MODES.find((item) => item.id === shell.value)
  return (mode ? mode.hint + ' ' : '') + 'All layouts edit the same project.'
})
const inputHint = computed(() => {
  const mode = INPUTS.find((item) => item.id === session.inputMode) || INPUTS[1]
  return mode.hint
})

function snapOn (option) {
  if (!option.beats) return !session.snap
  return session.snap && Math.abs(session.snapGridBeats - option.beats) < 1e-6
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
</style>
