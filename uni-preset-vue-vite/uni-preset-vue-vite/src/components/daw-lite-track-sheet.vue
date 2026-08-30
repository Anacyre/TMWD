<template>
  <daw-lite-sheet
    :open="!!session.liteSheet"
    :title="title"
    :tall="tab === 'sampler'"
    @close="closeLiteSheet"
  >
    <view v-if="tab === 'sampler'" class="os noscroll">
      <view class="icon-row">
        <view class="icon-hit" aria-label="Change plugin" @click.stop="changeInstrument">
          <daw-icon name="copy" :size="18" />
        </view>
      </view>
      <daw-m-orchestra v-if="mOrchestra" />
      <daw-orchestra-sampler v-else />
    </view>

    <view v-else class="fx">
      <template v-if="!picker">
        <view
          v-for="(slot, index) in slots"
          :key="'s' + index"
          class="fx-row"
        >
          <view class="fx-main" @click.stop="onSlot(index, slot)">
            <text class="fx-name">{{ slotLabel(slot) }}</text>
            <view v-if="!slot" class="icon-hit" aria-label="Add effect">
              <daw-icon name="plus" :size="16" />
            </view>
            <view v-else class="icon-hit" aria-label="Open effect">
              <daw-icon name="chevron-right" :size="16" />
            </view>
          </view>
          <view
            v-if="slot"
            class="icon-hit"
            :class="{ dim: slot.enabled === false }"
            aria-label="Bypass"
            @click.stop="toggleInsertEnabled(lane, index)"
          >
            <daw-icon name="power" :size="16" :active="slot.enabled !== false" />
          </view>
        </view>
      </template>
      <view v-else class="picks">
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
import DawIcon from './daw-icon.vue'
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
  listPlugins,
  toggleInsertEnabled
} from '../store/session.js'
import { laneInserts, MIXER_INSERT_SLOTS } from '../model/web-mixer.js'
import { PLUGIN_SHORT } from '../model/mixer-model.js'
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
  if (!slot) return 'Empty'
  return PLUGIN_SHORT[slot.pluginId] || (plugins[slot.pluginId] && plugins[slot.pluginId].name) || 'FX'
}

function onSlot (index, slot) {
  if (!slot) {
    picker.value = true
    if (session.liteSheet) session.liteSheet.replaceIndex = index
    return
  }
  closeLiteSheet()
  openPlugin(lane.value, index)
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
  gap: 8px;
  padding: 0 4px;
  border-bottom: 1px solid #242424;
  color: #e6e6e6;
  font-size: 15px;
}
.fx-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.fx-name { flex: 1; min-width: 0; }
.icon-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
.icon-hit {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #c8c8c8;
  background: #2b2b2b;
  border-radius: 8px;
  flex-shrink: 0;
}
.icon-hit.dim { opacity: 0.35; }
.picks { margin-top: 0; }
.os { min-height: 320px; }
</style>
