<template>
  <lite-sheet
    :open="open"
    :title="title"
    :wide="kind === 'instrument'"
    :flush="kind === 'instrument'"
    @close="closeLiteSheet"
  >
    <view v-if="kind === 'track-menu' && track && pick === 'group-with'" class="menu">
      <text class="lt-cap">Choose the tracks to group with {{ track.name }}</text>
      <view class="group">
        <view
          v-for="item in groupCandidates"
          :key="item.id"
          class="lt-row"
          @click.stop="toggleCandidate(item.id)"
        >
          <view class="pick-dot" :style="{ background: item.colour || '#6aa8ff' }" />
          <text class="grow">{{ item.name }}</text>
          <view class="check" :class="{ on: picked.includes(item.id) }">
            <daw-icon v-if="picked.includes(item.id)" name="check" :size="14" color="currentColor" />
          </view>
        </view>
        <text v-if="!groupCandidates.length" class="empty">No other tracks yet</text>
      </view>
      <view class="cta-row">
        <view class="lt-btn ghost" @click.stop="pick = ''">Back</view>
        <view class="lt-btn" :class="{ off: !picked.length }" @click.stop="createGroup">Create group</view>
      </view>
    </view>

    <view v-else-if="kind === 'track-menu' && track && pick === 'add-to'" class="menu">
      <text class="lt-cap">Move {{ track.name }} into</text>
      <view class="group">
        <view
          v-for="item in groupOptions"
          :key="item.id"
          class="lt-row"
          @click.stop="addTo(item)"
        >
          <view class="pick-dot" :style="{ background: item.colour || '#6aa8ff' }" />
          <text class="grow">{{ item.name }}</text>
          <daw-icon name="chevron" :size="16" color="currentColor" />
        </view>
      </view>
      <view class="cta-row">
        <view class="lt-btn ghost" @click.stop="pick = ''">Back</view>
      </view>
    </view>

    <view v-else-if="kind === 'track-menu' && track" class="menu">
      <view class="name-field">
        <view class="name-dot" :style="{ background: track.colour || '#6aa8ff' }" />
        <input
          class="rename"
          :value="track.name"
          maxlength="40"
          @focus="setTyping(true)"
          @blur="commitName"
          @confirm="commitName"
        >
      </view>

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

      <view v-if="!isGroup" class="instrument" @click.stop="openInstrument">
        <view class="instrument-ico">
          <daw-icon name="piano" :size="20" color="currentColor" />
        </view>
        <view class="instrument-text">
          <text class="instrument-k">Instrument</text>
          <text class="instrument-v">{{ track.instrument || 'Choose instrument' }}</text>
        </view>
        <daw-icon name="chevron" :size="16" color="currentColor" />
      </view>

      <text v-if="!isGroup" class="lt-cap">Track type</text>
      <view v-if="!isGroup" class="group">
        <view
          v-for="mode in TRACK_TYPES"
          :key="mode.id"
          class="lt-row"
          :class="{ on: mode.id === activeTrackType }"
          @click.stop="setTrackType(mode.id)"
        >
          <view class="row-ico"><daw-icon :name="mode.icon" :size="18" color="currentColor" /></view>
          <text class="grow">{{ mode.label }}</text>
          <text v-if="mode.id === activeTrackType" class="sub">Current</text>
        </view>
      </view>

      <view class="group">
        <template v-if="isGroup">
          <view class="lt-row" @click.stop="fold">
            <view class="row-ico"><daw-icon :name="track.collapsed ? 'chevron-right' : 'chevron'" :size="18" color="currentColor" /></view>
            <text class="grow">{{ track.collapsed ? 'Unfold' : 'Fold' }}</text>
            <text class="sub">{{ childLabel }}</text>
          </view>
          <view class="lt-row" @click.stop="paintChildren">
            <view class="row-ico"><view class="pick-dot" :style="{ background: track.colour || '#6aa8ff' }" /></view>
            <text class="grow">Colour all tracks in group</text>
          </view>
          <view class="lt-row" @click.stop="ungroup">
            <view class="row-ico"><daw-icon name="close" :size="18" color="currentColor" /></view>
            <text class="grow">Ungroup</text>
          </view>
        </template>
        <template v-else>
          <view class="lt-row" @click.stop="pick = 'group-with'">
            <view class="row-ico"><daw-icon name="plus" :size="18" color="currentColor" /></view>
            <text class="grow">Group with…</text>
          </view>
          <view v-if="groupOptions.length" class="lt-row" @click.stop="pick = 'add-to'">
            <view class="row-ico"><daw-icon name="chevron-right" :size="18" color="currentColor" /></view>
            <text class="grow">Move to group</text>
            <text v-if="parentGroup" class="sub">{{ parentGroup.name }}</text>
          </view>
          <view v-if="parentGroup" class="lt-row" @click.stop="leaveGroup">
            <view class="row-ico"><daw-icon name="close" :size="18" color="currentColor" /></view>
            <text class="grow">Remove from {{ parentGroup.name }}</text>
          </view>
        </template>
      </view>

      <view class="group">
        <view v-if="!isGroup" class="lt-row" @click.stop="duplicate">
          <view class="row-ico"><daw-icon name="copy" :size="18" color="currentColor" /></view>
          <text class="grow">Duplicate</text>
        </view>
        <view class="lt-row danger" @click.stop="remove">
          <view class="row-ico"><daw-icon name="trash" :size="18" color="currentColor" /></view>
          <text class="grow">Delete track</text>
        </view>
      </view>
    </view>

    <view v-else-if="kind === 'new-track'" class="menu">
      <text class="lt-cap">New track</text>
      <view class="group">
        <view class="lt-row" @click.stop="createKind('orchestra')">
          <view class="row-ico"><daw-icon name="piano" :size="18" color="currentColor" /></view>
          <text class="grow">Orchestra V</text>
          <text class="sub">Sampled orchestra</text>
        </view>
        <view class="lt-row" @click.stop="createKind('twin')">
          <view class="row-ico"><daw-icon name="wave" :size="18" color="currentColor" /></view>
          <text class="grow">Twin</text>
          <text class="sub">3-osc synth</text>
        </view>
        <view class="lt-row" @click.stop="createKind('sf2')">
          <view class="row-ico"><daw-icon name="note" :size="18" color="currentColor" /></view>
          <text class="grow">Sampler</text>
          <text class="sub">SoundFont or WAV</text>
        </view>
        <view class="lt-row" @click.stop="createKind('audio')">
          <view class="row-ico"><daw-icon name="wave" :size="18" color="currentColor" /></view>
          <text class="grow">Audio</text>
          <text class="sub">WAV · MP3 · OGG</text>
        </view>
      </view>
    </view>

    <view v-else-if="kind === 'instrument' && track" class="inst">
      <plugin-twin v-if="twin" :track="track" />
      <daw-sf2 v-else-if="sf2" :track="track" />
      <daw-orchestra-v v-else-if="orchestraV" lite />
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
import { computed, defineAsyncComponent, ref, watch } from 'vue'
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
  addInsert,
  replaceInsert,
  listPlugins,
  setTrackCollapsed,
  ungroupSelectedTracks,
  ungroupTrack,
  addTrackToGroup,
  groupTracksById,
  applyGroupColourToChildren,
  addLiteInstrumentTrack,
  loadOrchestraV,
  insertPlugin
} from '../../store/session.js'
import { ORCHESTRA_V_DEFAULT_ID, isOrchestraVTrack } from '../../model/orchestra-v-ui.js'
import { TWIN_PLUGIN_ID, SF2_PLUGIN_ID } from '../../model/m-orchestra-ui.js'
import { isGroupTrack, isPlayableTrack } from '../../model/playlist-model.js'
import { createTapGuard } from '../../lib/tap-guard.js'
import { isMOrchestraTrack, isTwinTrack, isSf2Track } from '../../model/m-orchestra-ui.js'

const DawOrchestraV = defineAsyncComponent(() => import('../daw-orchestra-v.vue'))
const DawMOrchestraLite = defineAsyncComponent(() => import('./lite-m-orchestra.vue'))
const DawOrchestraSampler = defineAsyncComponent(() => import('../daw-orchestra-sampler.vue'))
const PluginTwin = defineAsyncComponent(() => import('../dsp/plugin-twin.vue'))
const DawSf2 = defineAsyncComponent(() => import('../daw-sf2.vue'))

const COLOURS = ['#6aa8ff', '#5bc4c9', '#4cc38a', '#b7cf5a', '#e0b341', '#f08a4b', '#ef6a6a', '#e46aa8', '#a77df0', '#8b8e96']
const TRACK_TYPES = [
  { id: 'orchestra', label: 'Orchestra V', icon: 'piano' },
  { id: 'twin', label: 'Twin synth', icon: 'wave' },
  { id: 'sf2', label: 'Sampler', icon: 'note' },
  { id: 'audio', label: 'Audio', icon: 'wave' }
]

const sheet = computed(() => session.liteSheet)
const kind = computed(() => {
  const s = sheet.value
  if (!s) return ''
  if (s.kind === 'track-menu') return 'track-menu'
  if (s.kind === 'fx' || s.kind === 'bus') return 'fx'
  if (s.kind === 'new-track') return 'new-track'
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
const twin = computed(() => isTwinTrack(track.value))
const sf2 = computed(() => isSf2Track(track.value))
const activeTrackType = computed(() => {
  const t = track.value
  if (!t || t.type === 'audio' || t.source === 'audio') return 'audio'
  if (isOrchestraVTrack(t)) return 'orchestra'
  if (isTwinTrack(t)) return 'twin'
  if (isSf2Track(t)) return 'sf2'
  return ''
})
const title = computed(() => {
  if (kind.value === 'fx') return 'Add effect'
  if (kind.value === 'new-track') return 'New track'
  if (kind.value === 'instrument') return (track.value && track.value.name) || 'Instrument'
  if (pick.value === 'group-with') return 'Group tracks'
  if (pick.value === 'add-to') return 'Move to group'
  return isGroup.value ? 'Group' : 'Track'
})

/* ── grouping ─────────────────────────────────────────────────────── */
const pick = ref('')
const picked = ref([])
watch(open, (isOpen) => { if (!isOpen) { pick.value = ''; picked.value = [] } })
watch(track, () => { pick.value = ''; picked.value = [] })

const parentGroup = computed(() => {
  const t = track.value
  if (!t || !t.parentId) return null
  const parent = session.tracks.find((item) => item.id === t.parentId)
  return parent && isGroupTrack(parent) ? parent : null
})
const groupOptions = computed(() => session.tracks.filter((item) => isGroupTrack(item) && (!track.value || item.id !== track.value.parentId)))
const groupCandidates = computed(() => session.tracks.filter((item) => isPlayableTrack(item) && (!track.value || item.id !== track.value.id)))
const childLabel = computed(() => {
  const n = track.value ? session.tracks.filter((item) => item.parentId === track.value.id).length : 0
  return n + (n === 1 ? ' track' : ' tracks')
})

function toggleCandidate (id) {
  const list = picked.value.slice()
  const at = list.indexOf(id)
  if (at >= 0) list.splice(at, 1)
  else list.push(id)
  picked.value = list
}
function createGroup () {
  if (!track.value || !picked.value.length) return
  const ids = [track.value.id].concat(picked.value)
  closeLiteSheet()
  groupTracksById(ids)
}
function addTo (group) {
  const t = track.value
  closeLiteSheet()
  if (t && group) addTrackToGroup(t, group)
}
function leaveGroup () {
  const t = track.value
  closeLiteSheet()
  if (t) ungroupTrack(t)
}
function fold () {
  const t = track.value
  if (t) setTrackCollapsed(t, !t.collapsed)
}
function paintChildren () {
  const t = track.value
  closeLiteSheet()
  if (t) applyGroupColourToChildren(t)
}
function ungroup () {
  const t = track.value
  closeLiteSheet()
  if (!t) return
  session.selectedTrackIds = [t.id]
  session.selectedTrack = session.tracks.indexOf(t)
  ungroupSelectedTracks()
}

function createKind (kind) {
  addLiteInstrumentTrack(kind)
}

const GROUPS = [
  {
    label: 'Space',
    ids: ['reverb-x', 'reverb-lite', 'delay-lite']
  },
  {
    label: 'Tone',
    ids: ['equalizer-x', 'equalizer-lite', 'filter-lite', 'boost-x', 'chorus-lite', 'flanger-lite', 'phaser-lite', 'distortion-lite']
  },
  {
    label: 'Dynamics',
    ids: ['dynamic-x', 'compressor-lite', 'limiter-x']
  }
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
  'reverb-x': 'Reverb',
  'reverb-lite': 'Reverb',
  'delay-lite': 'Delay',
  'chorus-lite': 'Chorus',
  'flanger-lite': 'Flanger',
  'phaser-lite': 'Phaser',
  'distortion-lite': 'Distortion',
  'equalizer-lite': 'Equalizer',
  'filter-lite': 'Filter',
  'compressor-lite': 'Compressor'
}

function describe (plugin) {
  const name = String(plugin.name || '').replace(/^VitalLite\s+/i, '')
  return { id: plugin.id, name, detail: DETAIL[plugin.id] || '' }
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

function setTrackType (kind) {
  const t = track.value
  const index = trackIndex.value
  if (!t || index < 0 || isGroupTrack(t)) return
  if (kind === 'audio') {
    t.type = 'audio'
    t.source = 'audio'
    t.definitionId = ''
    t.instrument = 'Audio'
    closeLiteSheet()
    return
  }
  t.type = 'midi'
  if (kind === 'orchestra') {
    loadOrchestraV(t, ORCHESTRA_V_DEFAULT_ID)
  } else if (kind === 'twin') {
    insertPlugin(t, TWIN_PLUGIN_ID)
  } else if (kind === 'sf2') {
    insertPlugin(t, SF2_PLUGIN_ID)
  }
  openLiteSheet({ kind: 'track', tab: 'sampler', trackIndex: index })
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

const allowChoose = createTapGuard()
function fxLane (s) {
  if (!s) return null
  if (s.lane) return s.lane
  if (s.kind === 'bus' && s.busId) return { type: 'bus', id: s.busId }
  const t = track.value
  if (!t || t.type === 'master') return { type: 'master' }
  return { type: 'track', id: t.id }
}

function choose (pluginId) {
  const s = sheet.value
  if (!s || !allowChoose()) return
  const lane = fxLane(s)
  if (!lane) return
  if (s.slot != null && s.replace) replaceInsert(lane, s.slot, pluginId)
  else addInsert(lane, pluginId, s.slot != null ? s.slot : 0)
  closeLiteSheet()
}
</script>

<style scoped>
.menu { display: flex; flex-direction: column; }
.name-field {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--lt-s2);
}
.name-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.rename {
  flex: 1;
  min-width: 0;
  height: 100%;
  background: transparent;
  color: var(--lt-ink);
  font-size: 20px;
  font-weight: 600;
}
.swatches { display: flex; justify-content: space-between; gap: 8px; }
.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  box-sizing: border-box;
  flex-shrink: 0;
}
.swatch.on { box-shadow: 0 0 0 2px var(--lt-s1), 0 0 0 4px var(--lt-ink); }
.instrument {
  margin-top: 16px;
  min-height: 72px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  border-radius: 12px;
  background: var(--lt-s2);
  cursor: pointer;
}
.instrument:active { background: var(--lt-s3); }
.instrument-ico {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--lt-accent-soft);
  color: var(--lt-accent);
  flex-shrink: 0;
}
.instrument-ico .icon, .instrument > .icon { width: auto; height: auto; }
.instrument > .icon { color: var(--lt-ink-2); }
.instrument-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.instrument-k { font-size: 12px; color: var(--lt-ink-2); }
.instrument-v {
  font-size: 16px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group {
  margin-top: 16px;
  padding: 4px 14px;
  border-radius: 12px;
  background: var(--lt-s2);
  overflow: hidden;
}
.group + .group { margin-top: 10px; }
.group .lt-row { padding: 0; min-width: 0; }
.row-ico { width: 18px; height: 18px; flex: none; display: flex; align-items: center; justify-content: center; }
.row-ico :deep(.icon) { width: 18px; height: 18px; }
.pick-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.check {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 1.5px solid var(--lt-line-2, var(--lt-line));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.check.on { background: var(--lt-accent); border-color: var(--lt-accent); }
.empty { display: block; padding: 14px 0; font-size: var(--lt-fs-s); color: var(--lt-ink-2); }
.cta-row { display: flex; gap: 10px; margin-top: 16px; }
.lt-btn {
  flex: 1;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  background: var(--lt-accent);
  color: #fff;
  cursor: pointer;
}
.lt-btn:active { opacity: 0.85; }
.lt-btn.off { opacity: 0.4; pointer-events: none; }
.lt-btn.ghost { background: var(--lt-s2); color: var(--lt-ink); }
:deep(.lt-sheet.wide) {
  height: min(880px, calc(100dvh - 32px));
}
.inst {
  flex: 1;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.inst > * { flex: 1; min-height: 0; }
.inst :deep(.orch) { background: transparent; }
.inst :deep(.orch .head) { box-shadow: inset 0 -1px 0 var(--lt-line), inset 0 1px 0 var(--lt-line); }
.fx-group + .fx-group { margin-top: 6px; }
</style>
