<template>
  <lite-sheet :open="session.interfacePickerOpen" title="Interface Mode" @close="closeInterfacePicker">
    <view class="modes">
      <view
        v-for="mode in MODES"
        :key="mode.id"
        class="mode"
        :class="{ on: shell === mode.id }"
        @click="setInterfaceMode(mode.id)"
      >
        <text class="lab">{{ mode.label }}</text>
        <text class="sub">{{ mode.hint }}</text>
      </view>
    </view>
    <text class="note">All modes edit the same project. Switching does not reload.</text>
  </lite-sheet>
</template>

<script setup>
import { computed } from 'vue'
import LiteSheet from './lite/lite-sheet.vue'
import {
  session,
  closeInterfacePicker,
  setInterfaceMode,
  interfaceShell
} from '../store/session.js'

const MODES = [
  { id: 'professional', label: 'Professional', hint: 'Full desktop layout' },
  { id: 'lite', label: 'Lite', hint: 'Tablet layout' },
  { id: 'le', label: 'LE', hint: 'Previous mobile layout' }
]

const shell = computed(() => interfaceShell())
</script>

<style scoped>
.modes { display: flex; flex-direction: column; gap: 8px; }
.mode {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--lt-s2, #1e2024);
  cursor: pointer;
}
.mode.on { box-shadow: inset 0 0 0 1px var(--lt-accent, #6aa8ff); }
.lab { font-weight: 650; }
.sub { font-size: 12px; color: var(--lt-ink-2, #a2a5ae); }
.note {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--lt-ink-2, #a2a5ae);
}
</style>
