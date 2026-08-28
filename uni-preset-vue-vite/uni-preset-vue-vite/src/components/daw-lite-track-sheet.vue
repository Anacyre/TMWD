<template>
  <daw-lite-sheet
    :open="!!session.liteSheet"
    :title="title"
    :tall="tab === 'sampler'"
    @close="closeLiteSheet"
  >
    <view v-if="tab === 'sampler'" class="os noscroll">
      <view class="swap" @click.stop="changeInstrument">Change plugin</view>
      <daw-m-orchestra v-if="mOrchestra" />
      <daw-orchestra-sampler v-else />
    </view>

    <view v-else class="fx">
      <template v-if="!picker">
        <view
          v-for="(slot, index) in slots"
          :key="'s' + index"
          class="fx-row"
          @click.stop="onSlot(index, slot)"
          @pointerdown.stop="onFxHold(index, slot, $event)"
        >
          <text class="fx-name">{{ slotLabel(slot) }}</text>
          <text class="fx-go">{{ slot ? 'Open' : '+' }}</text>
        </view>
        <view v-if="canAdd" class="fx-row add" @click.stop="showPicker">
          <text class="fx-name">+</text>
        </view>
      </template>
      <view v-else class="picks">
        <view class="fx-row add" @click.stop="picker = false">
          <text class="fx-name">Back</text>
        </view>
        <view
          v-for="plugin in catalogue"
          :key="plugin.id"
          class="pick"
          @click.stop="choose(plugin.id)"
        >
          <text class="fx-name">{{ plugin.name }}</text>
        </view>
      </view>
    </view>
  </daw-lite-sheet>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import DawLiteSheet from './daw-lite-sheet.vue'
import DawOrchestraSampler from './daw-orchestra-sampler.vue'
import DawMOrchestra from './daw-m-orchestra.vue'
import {
  session,
  closeLiteSheet,
  getSelectedTrack,
  addInsert,
  replaceInsert,
  openPlugin,
  openPluginPicker,
  listPlugins
} from '../store/session.js'
import { laneInserts, MIXER_INSERT_SLOTS } from '../model/web-mixer.js'
import { PLUGIN_SHORT, canAddInsert } from '../model/mixer-model.js'
import { plugins } from '../dsp/registry.js'
import { isMOrchestraTrack } from '../model/m-orchestra-ui.js'

const picker = ref(false)
const tab = ref('fx')

const track = computed(() => {
  const index = session.liteSheet && session.liteSheet.trackIndex != null
    ? session.liteSheet.trackIndex
    : session.selectedTrack
  return session.tracks[index] || getSelectedTrack()
})

const lane = computed(() => {
  if (!track.value || track.value.type === 'master') return { type: 'master' }
  return { type: 'track', id: track.value.id }
})

const slots = computed(() => {
  const list = laneInserts(session.webMixer, lane.value)
  return Array.from({ length: MIXER_INSERT_SLOTS }, (_, i) => list[i] || null)
})

const canAdd = computed(() => canAddInsert(slots.value))
const catalogue = computed(() => listPlugins())
const mOrchestra = computed(() => isMOrchestraTrack(track.value))
const title = computed(() => {
  if (tab.value === 'sampler') return (track.value && (track.value.instrument || track.value.name)) || 'Instrument'
  return (track.value && track.value.name) || 'Track'
})

watch(() => session.liteSheet, (sheet) => {
  picker.value = !!(sheet && sheet.picker)
  tab.value = (sheet && sheet.tab) || 'fx'
}, { immediate: true })

function slotLabel (slot) {
  if (!slot) return '+'
  return PLUGIN_SHORT[slot.pluginId] || (plugins[slot.pluginId] && plugins[slot.pluginId].name) || 'FX'
}

function showPicker () {
  picker.value = true
}

function onSlot (index, slot) {
  if (!slot) {
    showPicker()
    return
  }
  closeLiteSheet()
  openPlugin(lane.value, index)
}

function onFxHold (index, slot, e) {
  if (!slot) return
  const timer = setTimeout(() => {
    picker.value = true
    session.liteSheet = { ...(session.liteSheet || {}), picker: true, replaceIndex: index, tab: 'fx' }
  }, 450)
  const clear = () => {
    clearTimeout(timer)
    window.removeEventListener('pointerup', clear)
    window.removeEventListener('pointermove', clear)
  }
  window.addEventListener('pointerup', clear)
  window.addEventListener('pointermove', clear)
}

function choose (pluginId) {
  if (!pluginId) return
  picker.value = false
  const replaceIndex = session.liteSheet && session.liteSheet.replaceIndex
  if (replaceIndex != null && replaceIndex >= 0) replaceInsert(lane.value, replaceIndex, pluginId)
  else addInsert(lane.value, pluginId)
  if (session.liteSheet) session.liteSheet.replaceIndex = null
  closeLiteSheet()
}

function changeInstrument () {
  const index = session.tracks.indexOf(track.value)
  closeLiteSheet()
  if (index >= 0) openPluginPicker(index)
}
</script>

<style scoped>
.fx-row, .pick {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
  border-bottom: 1px solid #242424;
  color: #e6e6e6;
  font-size: 15px;
}
.fx-row.add { color: #c8c8c8; }
.fx-go { color: #8d8d8d; font-size: 18px; }
.picks { margin-top: 0; }
.os { min-height: 320px; }
.swap {
  min-height: 40px;
  margin-bottom: 8px;
  border-radius: 8px;
  background: #2a2a2a;
  color: #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
}
</style>
