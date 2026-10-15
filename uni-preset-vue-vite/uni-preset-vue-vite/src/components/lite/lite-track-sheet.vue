<template>
  <lite-sheet
    :open="open"
    :title="title"
    :wide="kind === 'instrument'"
    :flush="kind === 'instrument'"
    @close="closeLiteSheet"
  >
    <template v-if="kind === 'instrument'" #actions>
      <view class="change" @click.stop="changeInstrument">Change</view>
    </template>

    <view v-if="kind === 'track-menu' && track">
      <text class="lt-cap">Name</text>
      <input
        class="rename"
        :value="track.name"
        maxlength="40"
        @focus="setTyping(true)"
        @blur="commitName"
        @confirm="commitName"
      >
      <text class="lt-cap">Colour</text>
      <view class="swatches">
        <view
          v-for="colour in COLOURS"
          :key="colour"
          class="swatch"
          :class="{ on: sameColour(track.colour, colour) }"
          :style="{ background: colour }"
          @click.stop="setColour(colour)"
        />
      </view>
      <view class="lt-cap" />
      <view v-if="!isGroup" class="lt-row" @click.stop="openInstrument">
        <daw-icon name="piano" :size="18" color="currentColor" />
        <text class="grow">Instrument</text>
        <text class="sub">{{ track.instrument || 'None' }}</text>
      </view>
      <view v-if="!isGroup" class="lt-row" @click.stop="duplicate">
        <daw-icon name="copy" :size="18" color="currentColor" />
        <text class="grow">Duplicate</text>
      </view>
      <view class="lt-row danger" @click.stop="remove">
        <daw-icon name="trash" :size="18" color="currentColor" />
        <text class="grow">Delete track</text>
      </view>
    </view>

    <view v-else-if="kind === 'instrument' && track" class="inst">
      <daw-orchestra-v v-if="orchestraV" lite />
      <daw-m-orchestra-lite v-else-if="mOrchestra" />
      <daw-orchestra-sampler v-else />
    </view>

    <view v-else-if="kind === 'fx'" class="fx">
      <view
        v-for="group in pluginGroups"
        :key="group.label"
        class="fx-group"
      >
        <text class="lt-cap">{{ group.label }}</text>
        <view
          v-for="plugin in group.items"
          :key="plugin.id"
          class="lt-row"
          @click.stop="choose(plugin.id)"
        >
          <text class="grow">{{ plugin.name }}</text>
          <text class="sub">{{ plugin.detail }}</text>
        </view>
      </view>
    </view>
  </lite-sheet>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import LiteSheet from './lite-sheet.vue'
import DawIcon from '../daw-icon.vue'
import {
  session,
  closeLiteSheet,
  renameTrack,
  setTrackParameter,
  setTyping,
  duplicateTrack,
  removeTrackWithUndo,
  onTrackInstrumentClick,
  openPluginPicker,
  addInsert,
  replaceInsert,
  listPlugins
} from '../../store/session.js'
import { isGroupTrack } from '../../model/playlist-model.js'
import { createTapGuard } from '../../lib/tap-guard.js'
import { isMOrchestraTrack } from '../../model/m-orchestra-ui.js'
import { isOrchestraVTrack } from '../../model/orchestra-v-ui.js'

const DawOrchestraV = defineAsyncComponent(() => import('../daw-orchestra-v.vue'))
const DawMOrchestraLite = defineAsyncComponent(() => import('./lite-m-orchestra.vue'))
const DawOrchestraSampler = defineAsyncComponent(() => import('../daw-orchestra-sampler.vue'))

const COLOURS = ['#6aa8ff', '#5bc4c9', '#4cc38a', '#b7cf5a', '#e0b341', '#f08a4b', '#ef6a6a', '#e46aa8', '#a77df0', '#8b8e96']

const sheet = computed(() => session.liteSheet)
const kind = computed(() => {
  const s = sheet.value
  if (!s) return ''
  if (s.kind === 'track-menu') return 'track-menu'
  if (s.kind === 'fx') return 'fx'
  if (s.kind === 'track' && s.tab === 'sampler') return 'instrument'
  return ''
})
const open = computed(() => !!kind.value)
const track = computed(() => {
  const s = sheet.value
  const index = s && s.trackIndex != null ? s.trackIndex : session.selectedTrack
  return session.tracks[index] || null
})
const trackIndex = computed(() => session.tracks.indexOf(track.value))
const isGroup = computed(() => isGroupTrack(track.value))
const orchestraV = computed(() => isOrchestraVTrack(track.value))
const mOrchestra = computed(() => !orchestraV.value && isMOrchestraTrack(track.value))
const title = computed(() => {
  if (kind.value === 'fx') return 'Add effect'
  if (kind.value === 'instrument') return (track.value && track.value.name) || 'Instrument'
  return (track.value && track.value.name) || 'Track'
})

const GROUPS = [
  { label: 'Tone', ids: ['equalizer-x', 'boost-x'] },
  { label: 'Dynamics', ids: ['dynamic-x', 'limiter-x'] },
  { label: 'Space', ids: ['reverb-x'] }
]
const pluginGroups = computed(() => {
  const all = listPlugins()
  const used = new Set()
  const groups = GROUPS.map((group) => {
    const items = group.ids.map((id) => all.find((plugin) => plugin.id === id)).filter(Boolean)
    items.forEach((item) => used.add(item.id))
    return { label: group.label, items: items.map(describe) }
  }).filter((group) => group.items.length)
  const rest = all.filter((plugin) => !used.has(plugin.id))
  if (rest.length) groups.push({ label: 'More', items: rest.map(describe) })
  return groups
})

const DETAIL = {
  'equalizer-x': 'EQ',
  'boost-x': 'Drive, width, chorus',
  'dynamic-x': 'Compressor',
  'limiter-x': 'Limiter',
  'reverb-x': 'Reverb'
}

function describe (plugin) {
  return { id: plugin.id, name: plugin.name, detail: DETAIL[plugin.id] || '' }
}

function sameColour (a, b) { return String(a || '').toLowerCase() === String(b).toLowerCase() }

function commitName (e) {
  const value = String((e && e.detail && e.detail.value) || (e && e.target && e.target.value) || '').trim()
  setTyping(false)
  if (value && track.value && value !== track.value.name) renameTrack(trackIndex.value, value)
}

function setColour (colour) {
  const t = track.value
  if (!t) return
  const old = t.colour
  setTrackParameter(t, 'colour', colour)
  session.clips.forEach((clip) => {
    if (clip.trackIndex === trackIndex.value && (!clip.colour || sameColour(clip.colour, old))) clip.colour = colour
  })
}

function openInstrument () {
  const index = trackIndex.value
  closeLiteSheet()
  if (index >= 0) onTrackInstrumentClick(index)
}

function duplicate () {
  const index = trackIndex.value
  closeLiteSheet()
  if (index >= 0) duplicateTrack(index)
}

function remove () {
  const index = trackIndex.value
  closeLiteSheet()
  if (index >= 0) removeTrackWithUndo(index)
}

function changeInstrument () {
  const index = trackIndex.value
  closeLiteSheet()
  if (index >= 0) openPluginPicker(index)
}

const allowChoose = createTapGuard()
function choose (pluginId) {
  const s = sheet.value
  if (!s || !allowChoose()) return
  const lane = s.lane
  if (s.slot != null && s.replace) replaceInsert(lane, s.slot, pluginId)
  else addInsert(lane, pluginId, s.slot != null ? s.slot : 0)
  closeLiteSheet()
}
</script>

<style scoped>
.change {
  height: 36px;
  padding: 0 14px;
  margin-right: 4px;
  display: flex;
  align-items: center;
  border-radius: 18px;
  background: var(--lt-s2);
  font-size: var(--lt-fs-s);
  font-weight: 500;
  cursor: pointer;
}
.rename {
  height: 46px;
  width: 100%;
  padding: 0 14px;
  border-radius: var(--lt-radius);
  background: var(--lt-s2);
  color: var(--lt-ink);
  font-size: var(--lt-fs-m);
  box-sizing: border-box;
}
.swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  box-sizing: border-box;
}
.swatch.on { box-shadow: 0 0 0 2px var(--lt-s1), 0 0 0 4px var(--lt-ink); }
.inst {
  height: min(620px, calc(86vh - 56px));
  min-height: 360px;
  display: flex;
  flex-direction: column;
}
.inst > * { flex: 1; min-height: 0; }
.inst :deep(.orch) { background: transparent; }
.inst :deep(.orch .head) { box-shadow: inset 0 -1px 0 var(--lt-line), inset 0 1px 0 var(--lt-line); }
.fx-group + .fx-group { margin-top: 6px; }
</style>
