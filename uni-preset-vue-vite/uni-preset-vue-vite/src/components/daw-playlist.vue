<template>
  <view class="pl" :class="{ phone: compact, lite }">
    <view v-if="compact && !lite" class="mobile-tools">
      <view class="hit" @click.stop="toggleMenu('add')">
        <daw-icon name="plus" />
      </view>
      <view class="hit" :class="{ on: tool === 'select' }" @click.stop="tool = tool === 'select' ? 'edit' : 'select'">
        <text class="lab">Select</text>
      </view>
      <view class="hit" :class="{ on: session.snap }" @click.stop="toggleMenu('snap')">
        <text class="lab">{{ snapLabel }}</text>
      </view>
      <view class="hit" @click.stop="toggleMenu('tools')">
        <daw-icon name="more" />
      </view>
      <view v-if="session.openMenu === 'add'" class="menu add-menu" @click.stop>
        <view class="item" @click="createTrack('midi')">Instrument</view>
        <view class="item" @click="createTrack('web-sampler')">Web Sampler</view>
        <view class="item" @click="createTrack('audio')">Audio</view>
        <view class="item" @click="createTrack('empty')">Empty Track</view>
        <view class="item" @click="createTrack('group')">Group</view>
        <view v-if="selectedPlayable" class="item" @click="createClipOnSelected()">Create clip</view>
      </view>
      <view v-if="session.openMenu === 'snap'" class="menu snap-menu" @click.stop>
        <view
          v-for="option in SNAP_OPTIONS"
          :key="option.name"
          class="item"
          :class="{ on: isSnapOption(option) }"
          @click="pickSnap(option)"
        >{{ option.name }}</view>
      </view>
      <view v-if="session.openMenu === 'tools'" class="menu tools-menu" @click.stop>
        <view class="item" @click="setTrackHeight(44); closeMenus()">Compact</view>
        <view class="item" @click="setTrackHeight(56); closeMenus()">Normal</view>
        <view class="item" @click="setTrackHeight(84); closeMenus()">Large</view>
        <view class="item" @click="addMarker('Marker'); closeMenus()">Add Marker</view>
        <view class="item" @click="quantizeSelectedClipStarts(); closeMenus()">Quantize starts</view>
      </view>
    </view>

    <view class="board">
      <view class="top">
      <view class="corner">
        <view v-if="!compact && !lite" class="hit" @click.stop="toggleMenu('add')">
          <daw-icon name="plus" />
        </view>
        <view v-if="session.openMenu === 'add' && !compact" class="menu add-menu" @click.stop>
          <view class="item" @click="createTrack('midi')">Instrument</view>
          <view class="item" @click="createTrack('web-sampler')">Web Sampler</view>
          <view class="item" @click="createTrack('audio')">Audio</view>
          <view class="item" @click="createTrack('empty')">Empty Track</view>
          <view class="item" @click="createTrack('group')">Group</view>
          <view v-if="selectedPlayable" class="item" @click="createClipOnSelected()">Create clip</view>
        </view>
      </view>

      <view class="ruler" @pointerdown="onRulerDown">
        <view class="ruler-shift" :style="{ transform: 'translateX(' + (-scrollX) + 'px)' }">
          <view class="loop-lane">
            <view
              v-if="session.looping"
              class="loop-band"
              :style="loopStyle"
            >
              <view class="loop-handle left" />
              <view class="loop-handle right" />
            </view>
          </view>
          <view
            v-for="marker in session.markers"
            :key="'m' + marker.id"
            class="marker"
            :style="{ left: (marker.startBeat * session.pixelsPerBeat) + 'px' }"
            @pointerdown.stop="onMarkerDown(marker, $event)"
            @dblclick.stop="renameMarker(marker)"
          >
            <text>{{ marker.name }}</text>
          </view>
          <view
            v-for="bar in bars"
            :key="'bar' + bar"
            class="bar"
            :style="{ left: (bar * session.timeSigNum * session.pixelsPerBeat) + 'px' }"
          >
            <text v-if="bar % barStep === 0">{{ bar + 1 }}</text>
          </view>
        </view>
      </view>
      </view>

      <scroll-view
        class="vscroll"
        ref="vScrollEl"
        scroll-y
        :enable-flex="true"
        :show-scrollbar="true"
        @scroll="onVScroll"
      >
        <view class="vbody" :style="{ height: tracksHeight + 'px' }">
      <view class="headers">
        <view
          v-for="row in rows"
          :key="'h' + row.track.id"
          class="head"
          :class="{ on: session.selectedTrack === row.index || session.selectedTrackIds.includes(row.track.id), group: isGroup(row.track), master: row.track.type === 'master', 'lite-head': lite }"
          :style="{ height: session.trackHeight + 'px', paddingLeft: lite ? '0' : ((8 + row.depth * 12) + 'px') }"
          @click="onHeaderTap(row)"
          @dblclick="startRename(row.index)"
          @pointerdown="onHeaderPointer(row, $event)"
        >
          <view class="accent" :style="{ background: row.track.colour || '#3a3a3a' }" />
          <view v-if="lite" class="lite-stack" :style="{ paddingLeft: (8 + row.depth * 12) + 'px' }">
            <view class="lite-top">
              <view
                v-if="isGroup(row.track)"
                class="twist"
                @click.stop="setTrackCollapsed(row.track, !row.track.collapsed)"
                @pointerdown.stop
              >{{ row.track.collapsed ? '▸' : '▾' }}</view>
              <input
                v-if="renaming === row.index"
                class="name-input"
                :value="row.track.name"
                @blur="commitRename(row.index, $event)"
                @keyup.enter="commitRename(row.index, $event)"
                @keyup.esc="cancelRename"
                @focus="setTyping(true)"
              >
              <text v-else class="name">{{ row.track.name }}</text>
              <view
                v-if="row.track.type !== 'master'"
                class="tiny"
                :class="{ on: row.track.mute, mute: row.track.mute }"
                @click.stop="toggleFlag(row.index, 'mute')"
                @pointerdown.stop
              >M</view>
              <view
                v-if="row.track.type !== 'master'"
                class="tiny"
                :class="{ on: row.track.solo, solo: row.track.solo }"
                @click.stop="toggleFlag(row.index, 'solo')"
                @pointerdown.stop
              >S</view>
              <view
                v-if="row.track.type !== 'master' && !isGroup(row.track)"
                class="tiny fx"
                @click.stop="openTrackPlugin(row)"
                @pointerdown.stop
              >⋯</view>
            </view>
            <view
              class="lite-mix"
              @click.stop
              @pointerdown.stop
            >
              <daw-fader
                class="lite-vol"
                :model-value="row.track.volume"
                @update:model-value="onLiteVolume(row, $event)"
              />
              <daw-knob
                v-if="row.track.type !== 'master'"
                class="lite-pan"
                :model-value="row.track.pan || 0"
                :min="-1"
                :max="1"
                title="Pan"
                @update:model-value="onLitePan(row, $event)"
              />
            </view>
          </view>
          <template v-else>
            <view
              v-if="isGroup(row.track)"
              class="twist"
              @click.stop="setTrackCollapsed(row.track, !row.track.collapsed)"
              @pointerdown.stop
            >{{ row.track.collapsed ? '▸' : '▾' }}</view>
            <view v-else class="glyph" :class="glyphFor(row.track)">{{ letterFor(row.track) }}</view>
            <input
              v-if="renaming === row.index"
              class="name-input"
              :value="row.track.name"
              @blur="commitRename(row.index, $event)"
              @keyup.enter="commitRename(row.index, $event)"
              @keyup.esc="cancelRename"
              @focus="setTyping(true)"
            >
            <text v-else class="name">{{ row.track.name }}</text>
            <view
              v-if="row.track.type !== 'master'"
              class="tiny"
              :class="{ on: row.track.mute, mute: row.track.mute }"
              @click.stop="toggleFlag(row.index, 'mute')"
              @pointerdown.stop
            >M</view>
            <view
              v-if="row.track.type !== 'master' && !isGroup(row.track)"
              class="tiny"
              :class="{ on: row.track.solo, solo: row.track.solo }"
              @click.stop="toggleFlag(row.index, 'solo')"
              @pointerdown.stop
            >S</view>
          </template>
        </view>
      </view>

      <scroll-view
        class="lanes"
        ref="lanesEl"
        scroll-x
        :enable-flex="true"
        :show-scrollbar="true"
        @scroll="onHScroll"
        @touchstart="onTouchStart"
        @touchmove="onTouchMove"
        @pointerdown="onLaneDown"
        @dblclick="onLaneDbl"
        @contextmenu.prevent="onLaneMenu"
      >
        <view class="canvas" :style="canvasStyle">
          <view class="grid" :style="gridStyle" />
          <view v-if="session.looping" class="loop-fill" :style="loopStyle" />
          <view
            v-for="clip in visibleClips"
            :key="'c' + clip.id"
            class="clip"
            :class="{ on: isClipSelected(clip), muted: clip.muted }"
            :style="clipStyle(clip)"
            @pointerdown.stop="onClipDown(clip, $event)"
            @dblclick.stop="openClip(clip)"
            @contextmenu.prevent.stop="openClipMenu(clip, $event)"
          >
            <text class="clip-name">{{ clip.name }}{{ clipRepeatLabel(clip) }}</text>
            <view class="preview">
              <view
                v-for="(col, x) in previewOf(clip)"
                :key="x"
                class="col"
              >
                <view
                  v-for="(cell, y) in col"
                  :key="y"
                  v-show="cell > 0"
                  class="cell"
                  :style="{ opacity: cell, bottom: (y * 12.5) + '%' }"
                />
              </view>
            </view>
            <view class="edge left" />
            <view class="edge right" />
          </view>
          <view v-if="marquee" class="marquee" :style="marquee" />
          <view class="playhead" ref="playheadEl">
            <view class="cap" />
          </view>
          <view v-if="empty" class="empty">
            <text class="empty-title">Start your arrangement</text>
            <view class="empty-actions">
              <view class="empty-btn" @click.stop="createTrack('midi')">+ Instrument</view>
              <view class="empty-btn" @click.stop="createTrack('web-sampler')">+ Web Sampler</view>
              <view class="empty-btn" @click.stop="createTrack('empty')">+ Empty Track</view>
            </view>
          </view>
        </view>
      </scroll-view>
        </view>
      </scroll-view>
    </view>

    <view v-if="lite && groupBar" class="group-bar">
      <view v-if="canGroup" class="gbtn" @click.stop="groupSelectedTracks">Group</view>
      <view v-if="canUngroup" class="gbtn" @click.stop="ungroupSelectedTracks">Ungroup</view>
      <text class="ghint">{{ groupHint }}</text>
    </view>

    <view v-if="context" class="menu ctx" :style="context.style" @click.stop>
      <view v-for="item in context.items" :key="item.label" class="item" @click="runContext(item)">{{ item.label }}</view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import DawIcon from './daw-icon.vue'
import DawFader from './daw-fader.vue'
import DawKnob from './daw-knob.vue'
import {
  session,
  SNAP_OPTIONS,
  snapBeat,
  setPositionBeats,
  setPixelsPerBeat,
  setTrackHeight,
  setSnapGrid,
  addTrack,
  addMidiClip,
  moveClip,
  resizeClip,
  deleteClip,
  duplicateClip,
  setLoopRange,
  selectTrack,
  selectClip,
  setEditorTab,
  setTrackParameter,
  flushTrackMix,
  renameTrack,
  removeTrack,
  duplicateTrack,
  closeMenus,
  isTrackAudible,
  setTyping,
  beginEdit,
  endEdit,
  queueClipMoves,
  flushClipMoves,
  toggleClipSelection,
  selectedClips,
  loopClip,
  muteClips,
  addMarker,
  updateMarker,
  deleteMarker,
  setTrackCollapsed,
  setWorkspaceView,
  groupSelectedTracks,
  ungroupSelectedTracks,
  toggleTrackInSelection,
  moveTrack,
  quantizeSelectedClipStarts,
  isPlayableTrack,
  isLite,
  onTrackInstrumentClick,
  openPluginPicker,
  openVirtualClip
} from '../store/session.js'
import { visibleTrackRows, buildClipPreview, clipSourceLength, isGroupTrack, buildCollapsedGroupClip } from '../model/playlist-model.js'
import { interpolateBeats } from '../model/timeline.js'
import { glyphClass, glyphLetter } from '../model/instrument-glyph.js'

const compact = ref(false)
const lite = computed(() => isLite())
const scrollX = ref(0)
const scrollY = ref(0)
const lanesEl = ref(null)
const vScrollEl = ref(null)
const playheadEl = ref(null)
const renaming = ref(-1)
const tool = ref('edit')
const marquee = ref(null)
const context = ref(null)
const follow = ref(true)
const viewportW = ref(1600)
let raf = 0
let gesture = null
let longPress = 0
let lastUserScroll = 0
let lastEmptyTap = { at: 0, x: 0, y: 0 }
let lastClipTap = { at: 0, id: 0, x: 0, y: 0 }

const rows = computed(() => visibleTrackRows(session.tracks))
const tracksHeight = computed(() => Math.max(session.trackHeight, rows.value.length * session.trackHeight))
const empty = computed(() => session.tracks.filter((track) => track.type !== 'master' && track.type !== 'group').length === 0)

const contentBeats = computed(() => {
  let maxBeat = 64
  maxBeat = Math.max(maxBeat, session.positionBeats + 16, session.loopEnd + 8)
  session.clips.forEach((clip) => {
    maxBeat = Math.max(maxBeat, (clip.startBeat || 0) + (clip.lengthBeats || 0) + 8)
  })
  return maxBeat
})

const canvasStyle = computed(() => ({
  width: Math.ceil(contentBeats.value * session.pixelsPerBeat) + 'px',
  height: tracksHeight.value + 'px',
  '--bar': (session.timeSigNum * session.pixelsPerBeat) + 'px',
  '--beat': session.pixelsPerBeat + 'px'
}))

const gridStyle = computed(() => ({
  backgroundSize: canvasStyle.value['--bar'] + ' 100%, ' + canvasStyle.value['--beat'] + ' 100%'
}))

const bars = computed(() => {
  const count = Math.ceil(contentBeats.value / session.timeSigNum) + 1
  return Array.from({ length: count }, (_, i) => i)
})

const barStep = computed(() => {
  const width = session.pixelsPerBeat * session.timeSigNum
  return Math.max(1, Math.ceil(48 / Math.max(1, width)))
})

const loopStyle = computed(() => ({
  left: session.loopStart * session.pixelsPerBeat + 'px',
  width: Math.max(8, (session.loopEnd - session.loopStart) * session.pixelsPerBeat) + 'px'
}))

const snapLabel = computed(() => {
  if (!session.snap) return 'Off'
  const found = SNAP_OPTIONS.find((option) => option.beats > 0 && Math.abs(option.beats - session.snapGridBeats) < 1e-6)
  return found ? found.name : '1/16'
})

const rowIndexByTrack = computed(() => {
  const map = new Map()
  rows.value.forEach((row, visual) => map.set(row.index, visual))
  return map
})

const selectedPlayable = computed(() => isPlayableTrack(session.tracks[session.selectedTrack]))

const visibleClips = computed(() => {
  const start = scrollX.value / session.pixelsPerBeat - 4
  const end = (scrollX.value + viewportW.value) / session.pixelsPerBeat + 4
  const visibleTracks = new Set(rows.value.map((row) => row.index))
  const extras = []
  session.tracks.forEach((track, index) => {
    if (!isGroup(track) || !track.collapsed || !visibleTracks.has(index)) return
    const built = buildCollapsedGroupClip(session.tracks, session.clips, track.id)
    if (built) extras.push(built)
  })
  return session.clips.filter((clip) => {
    if (!visibleTracks.has(clip.trackIndex)) return false
    const clipEnd = (clip.startBeat || 0) + (clip.lengthBeats || 0)
    return clipEnd >= start && (clip.startBeat || 0) <= end
  }).concat(extras.filter((clip) => {
    const clipEnd = (clip.startBeat || 0) + (clip.lengthBeats || 0)
    return clipEnd >= start && (clip.startBeat || 0) <= end
  }))
})

const canGroup = computed(() => session.selectedTrackIds.filter((id) => {
  const track = session.tracks.find((item) => item.id === id)
  return track && isPlayableTrack(track)
}).length >= 2)
const canUngroup = computed(() => session.tracks.some((track) => isGroup(track) && session.selectedTrackIds.includes(track.id)))
const groupBar = computed(() => lite.value && (canGroup.value || canUngroup.value || session.selectedTrackIds.length > 1))
const groupHint = computed(() => {
  if (canGroup.value) return 'Hold a header to add tracks'
  if (canUngroup.value) return 'Ungroup selected folder'
  return session.selectedTrackIds.length + ' selected'
})

function isGroup (track) {
  return isGroupTrack(track)
}

function glyphFor (track) {
  return glyphClass(track)
}

function letterFor (track) {
  return glyphLetter(track.instrument || track.name)
}

function isClipSelected (clip) {
  return session.selectedClipIds.includes(clip.id) || (session.clips[session.selectedClip] && session.clips[session.selectedClip].id === clip.id)
}

function clipRepeatLabel (clip) {
  const source = clipSourceLength(clip)
  if ((clip.lengthBeats || 0) <= source * 1.05) return ''
  return '  ×' + Math.max(2, Math.round((clip.lengthBeats || source) / source))
}

function previewOf (clip) {
  return buildClipPreview(clip)
}

function clipStyle (clip) {
  const visual = rowIndexByTrack.value.get(clip.trackIndex)
  if (visual == null) return { display: 'none' }
  const audible = isTrackAudible(clip.trackIndex)
  return {
    left: (clip.startBeat || 0) * session.pixelsPerBeat + 'px',
    top: visual * session.trackHeight + 6 + 'px',
    width: Math.max(8, (clip.lengthBeats || 1) * session.pixelsPerBeat) + 'px',
    height: session.trackHeight - 12 + 'px',
    background: clip.colour || '#4a90d9',
    opacity: clip.muted || !audible ? 0.42 : 1
  }
}

function toggleMenu (id) {
  session.openMenu = session.openMenu === id ? '' : id
}

function isSnapOption (option) {
  if (option.beats === 0) return !session.snap
  return session.snap && Math.abs(session.snapGridBeats - option.beats) < 1e-6
}

function pickSnap (option) {
  setSnapGrid(option.beats)
  closeMenus()
}

async function createTrack (kind) {
  closeMenus()
  if (kind === 'empty') await addTrack('midi', 'Track')
  else if (kind === 'web-sampler') await addTrack('web-sampler')
  else if (kind === 'group') await addTrack('group', 'Group')
  else await addTrack(kind === 'audio' ? 'audio' : 'midi')
}

function createClipOnSelected () {
  closeMenus()
  const track = session.tracks[session.selectedTrack]
  if (!isPlayableTrack(track)) return
  addMidiClip(session.selectedTrack, session.positionBeats)
}

function toggleFlag (index, parameter) {
  const track = session.tracks[index]
  if (!track) return
  setTrackParameter(track, parameter, !track[parameter])
}

function onLiteVolume (row, value) {
  setTrackParameter(row.track, 'volume', value)
  flushTrackMix()
}

function onLitePan (row, value) {
  setTrackParameter(row.track, 'pan', value)
  flushTrackMix()
}

function startRename (index) {
  renaming.value = index
  setTyping(true)
}

function commitRename (index, e) {
  const value = (e && e.target && e.target.value) || ''
  if (value) renameTrack(index, value)
  renaming.value = -1
  setTyping(false)
}

function cancelRename () {
  renaming.value = -1
  setTyping(false)
}

function openTrackPlugin (row) {
  selectTrack(row.index)
  onTrackInstrumentClick(row.index)
}

function onHeaderTap (row) {
  if (lite.value && session.selectedTrackIds.length && session.selectedTrackIds.includes(row.track.id) === false && session.selectedTrackIds.length >= 1) {
    /* keep multi-select only via long-press */
  }
  selectTrack(row.index)
  if (!session.selectedTrackIds.includes(row.track.id) || session.selectedTrackIds.length <= 1) {
    session.selectedTrackIds = [row.track.id]
  }
}

function onHeaderPointer (row, e) {
  if (e.button === 2) {
    openTrackMenu(row, e)
    return
  }
  if (lite.value) {
    const ox = e.clientX
    const oy = e.clientY
    longPress = setTimeout(() => openTrackMenu(row, e), 420)
    const moved = (ev) => {
      if (Math.hypot(ev.clientX - ox, ev.clientY - oy) > 12) clearTimeout(longPress)
    }
    const up = () => {
      clearTimeout(longPress)
      window.removeEventListener('pointermove', moved)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', moved)
    window.addEventListener('pointerup', up)
    return
  }
  if (e.pointerType === 'touch') {
    longPress = setTimeout(() => openTrackMenu(row, e), 420)
  }
  const startY = e.clientY
  const trackId = row.track.id
  const originVisual = rows.value.findIndex((item) => item.index === row.index)
  const move = (ev) => {
    if (Math.abs(ev.clientY - startY) < 10) return
    const visual = Math.max(0, Math.min(rows.value.length - 1,
      originVisual + Math.round((ev.clientY - startY) / session.trackHeight)))
    const dest = rows.value[visual]
    const from = session.tracks.findIndex((item) => item.id === trackId)
    if (from >= 0 && dest && dest.index !== from && dest.track.type !== 'master') {
      moveTrack(from, dest.index)
    }
  }
  const up = () => {
    clearTimeout(longPress)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function openClip (clip) {
  if (clip.virtual) {
    openVirtualClip(clip)
    setEditorTab('piano')
    setWorkspaceView('piano')
    return
  }
  const index = session.clips.findIndex((item) => item.id === clip.id)
  const keep = session.selectedClipIds.includes(clip.id) && session.selectedClipIds.length > 1
  selectClip(index, !keep)
  setEditorTab('piano')
  setWorkspaceView('piano')
}

function openClipMenu (clip, e) {
  toggleClipSelection(clip, false, false)
  context.value = {
    style: { left: e.clientX + 'px', top: e.clientY + 'px' },
    items: [
      { label: 'Open Piano Roll', run: () => openClip(clip) },
      { label: 'Duplicate', run: () => duplicateClip(clip) },
      { label: 'Loop', run: () => loopClip(clip) },
      { label: 'Mute', run: () => muteClips([clip], !clip.muted) },
      { label: 'Delete', run: () => deleteClip(clip) }
    ]
  }
}

function beatAt (clientX, el) {
  const rect = el.getBoundingClientRect()
  return snapBeat((clientX - rect.left + scrollX.value) / session.pixelsPerBeat)
}

function onRulerDown (e) {
  const el = e.currentTarget
  const y = e.clientY - el.getBoundingClientRect().top
  const beat = beatAt(e.clientX, el)
  const x = e.clientX - el.getBoundingClientRect().left + scrollX.value
  const inLoopLane = y < 14 || e.altKey

  if (inLoopLane) {
    let mode = 'draw'
    const origS = session.loopStart
    const origE = session.loopEnd
    if (session.looping) {
      const left = origS * session.pixelsPerBeat
      const right = origE * session.pixelsPerBeat
      if (Math.abs(x - left) <= 16) mode = 'left'
      else if (Math.abs(x - right) <= 16) mode = 'right'
      else if (x > left && x < right) mode = 'move'
    }
    const anchor = beat
    const move = (ev) => {
      const next = beatAt(ev.clientX, el)
      if (mode === 'left') setLoopRange(next, origE)
      else if (mode === 'right') setLoopRange(origS, next)
      else if (mode === 'move') {
        const delta = next - anchor
        setLoopRange(Math.max(0, origS + delta), Math.max(0.25, origE + delta))
      } else setLoopRange(anchor, next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return
  }
  follow.value = true
  setPositionBeats(beat)
  const move = (ev) => setPositionBeats(beatAt(ev.clientX, el))
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function onMarkerDown (marker, e) {
  if (e.detail === 2) return
  setPositionBeats(marker.startBeat)
  const start = marker.startBeat
  const origin = e.clientX
  const move = (ev) => updateMarker(marker, { startBeat: snapBeat(start + (ev.clientX - origin) / session.pixelsPerBeat) })
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function renameMarker (marker) {
  const next = typeof window !== 'undefined' ? window.prompt('Marker name', marker.name) : marker.name
  if (next) updateMarker(marker, { name: next })
}

function onLaneDown (e) {
  if (e.target && e.target.closest && e.target.closest('.clip')) return
  const canvas = e.currentTarget.querySelector('.canvas') || e.currentTarget
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollX.value
  const y = e.clientY - rect.top
  const trackVisual = Math.min(rows.value.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
  const row = rows.value[trackVisual]
  if (row) selectTrack(row.index)
  closeMenus()
  context.value = null

  const startMarquee = () => {
    const ox = x
    const oy = y
    const move = (ev) => {
      const nx = ev.clientX - rect.left + scrollX.value
      const ny = ev.clientY - rect.top
      marquee.value = {
        left: Math.min(ox, nx) + 'px',
        top: Math.min(oy, ny) + 'px',
        width: Math.abs(nx - ox) + 'px',
        height: Math.abs(ny - oy) + 'px'
      }
    }
    const up = (ev) => {
      const nx = ev.clientX - rect.left + scrollX.value
      const ny = ev.clientY - rect.top
      const left = Math.min(ox, nx) / session.pixelsPerBeat
      const right = Math.max(ox, nx) / session.pixelsPerBeat
      const top = Math.min(oy, ny)
      const bottom = Math.max(oy, ny)
      session.selectedClipIds = session.clips.filter((clip) => {
        const visual = rowIndexByTrack.value.get(clip.trackIndex)
        if (visual == null) return false
        const cy = visual * session.trackHeight
        return clip.startBeat < right && clip.startBeat + clip.lengthBeats > left
          && cy < bottom && cy + session.trackHeight > top
      }).map((clip) => clip.id)
      marquee.value = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (tool.value === 'select' || e.shiftKey) {
    startMarquee()
    return
  }

  if (lite.value) {
    const now = Date.now()
    if (now - lastEmptyTap.at < 340 && Math.hypot(x - lastEmptyTap.x, y - lastEmptyTap.y) < 28) {
      if (row && row.track.type !== 'master' && !isGroup(row.track)) {
        addMidiClip(row.index, snapBeat(x / session.pixelsPerBeat))
      }
      lastEmptyTap = { at: 0, x: 0, y: 0 }
      return
    }
    lastEmptyTap = { at: now, x, y }
    const originX = e.clientX
    const originY = e.clientY
    longPress = setTimeout(() => startMarquee(), 320)
    const cancel = (ev) => {
      if (ev.type === 'pointermove' && Math.hypot(ev.clientX - originX, ev.clientY - originY) < 12) return
      clearTimeout(longPress)
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointermove', cancel)
    }
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointermove', cancel)
    return
  }

  longPress = setTimeout(() => {
    if (row && row.track.type !== 'master' && !isGroup(row.track)) {
      context.value = {
        style: { left: e.clientX + 'px', top: e.clientY + 'px' },
        items: [
          { label: 'Create clip', run: () => addMidiClip(row.index, snapBeat(x / session.pixelsPerBeat)) }
        ]
      }
    }
  }, 420)
  const cancel = () => {
    clearTimeout(longPress)
    window.removeEventListener('pointerup', cancel)
    window.removeEventListener('pointermove', cancel)
  }
  window.addEventListener('pointerup', cancel)
  window.addEventListener('pointermove', cancel)
}

function onLaneDbl (e) {
  if (lite.value) return
  if (e.target && e.target.closest && e.target.closest('.clip')) return
  if (compact.value) return
  const canvas = e.currentTarget.querySelector('.canvas') || e.currentTarget
  const rect = canvas.getBoundingClientRect()
  const x = e.clientX - rect.left + scrollX.value
  const y = e.clientY - rect.top
  const trackVisual = Math.min(rows.value.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
  const row = rows.value[trackVisual]
  if (row && row.track.type !== 'master' && !isGroup(row.track)) {
    addMidiClip(row.index, snapBeat(x / session.pixelsPerBeat))
  }
}

function onLaneMenu (e) {
  const canvas = e.currentTarget.querySelector('.canvas') || e.currentTarget
  const rect = canvas.getBoundingClientRect()
  const y = e.clientY - rect.top
  const trackVisual = Math.min(rows.value.length - 1, Math.max(0, Math.floor(y / session.trackHeight)))
  const row = rows.value[trackVisual]
  if (row) openTrackMenu(row, e)
}

function openTrackMenu (row, e) {
  const track = row.track
  const items = [
    { label: 'Change instrument', run: () => openPluginPicker(row.index) },
    { label: 'Rename', run: () => startRename(row.index) },
    { label: 'Mute', run: () => toggleFlag(row.index, 'mute') },
    { label: 'Solo', run: () => toggleFlag(row.index, 'solo') },
    { label: 'Duplicate', run: () => duplicateTrack(row.index) },
    { label: 'Group', run: () => groupSelectedTracks() },
    { label: 'Ungroup', run: () => ungroupSelectedTracks() },
    { label: 'Delete', run: () => removeTrack(row.index) }
  ]
  if (!lite.value) {
    items.splice(6, 0,
      { label: 'Open Piano Roll', run: () => { selectTrack(row.index); setWorkspaceView('piano') } },
      { label: 'Open Mixer', run: () => { selectTrack(row.index); setWorkspaceView('mixer') } }
    )
  }
  context.value = {
    style: { left: Math.min((e.clientX || 12), (typeof window !== 'undefined' ? window.innerWidth - 180 : 12)) + 'px', top: Math.min((e.clientY || 48), (typeof window !== 'undefined' ? window.innerHeight - 220 : 48)) + 'px' },
    items: items.filter((item) => {
      if (track.type === 'master') return item.label === 'Rename'
      if (isGroup(track) && item.label === 'Change instrument') return false
      return true
    })
  }
}

function onClipDown (clip, e) {
  if (clip.virtual) {
    if (lite.value) {
      const now = Date.now()
      if (now - lastClipTap.at < 340 && lastClipTap.id === clip.id) {
        lastClipTap = { at: 0, id: 0, x: 0, y: 0 }
        openClip(clip)
        return
      }
      lastClipTap = { at: now, id: clip.id, x: e.clientX, y: e.clientY }
    }
    return
  }
  if (lite.value) {
    const now = Date.now()
    if (now - lastClipTap.at < 340 && lastClipTap.id === clip.id && Math.hypot(e.clientX - lastClipTap.x, e.clientY - lastClipTap.y) < 28) {
      lastClipTap = { at: 0, id: 0, x: 0, y: 0 }
      openClip(clip)
      return
    }
    lastClipTap = { at: now, id: clip.id, x: e.clientX, y: e.clientY }
  }
  const rect = e.currentTarget.getBoundingClientRect()
  const localX = e.clientX - rect.left
  const edgePad = lite.value || compact.value ? 22 : 18
  const edge = localX < edgePad ? 'left' : (localX > rect.width - edgePad ? 'right' : 'move')
  toggleClipSelection(clip, e.ctrlKey || e.metaKey, e.shiftKey)
  beginEdit(edge === 'move' ? 'Move clips' : 'Resize clip')
  const originals = selectedClips().map((item) => ({
    id: item.id,
    start: item.startBeat,
    length: item.lengthBeats,
    track: item.trackIndex
  }))
  const startX = e.clientX
  const startY = e.clientY
  gesture = { edge, originals, armed: false }
  const move = (ev) => {
    const dx = ev.clientX - startX
    const dy = ev.clientY - startY
    if (!gesture || !gesture.armed) {
      if (Math.hypot(dx, dy) < 10) return
      if (lite.value && edge === 'move' && Math.abs(dy) > Math.abs(dx) * 1.25) {
        gesture = null
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        endEdit()
        return
      }
      if (gesture) gesture.armed = true
    }
    if (!gesture) return
    const deltaBeats = dx / session.pixelsPerBeat
    const deltaTracks = Math.round(dy / session.trackHeight)
    originals.forEach((orig) => {
      const found = session.clips.find((item) => item.id === orig.id)
      if (!found) return
      if (edge === 'right') {
        const end = orig.start + orig.length + deltaBeats
        const snappedEnd = session.snap ? snapBeat(end) : end
        found.lengthBeats = Math.max(0.25, snappedEnd - orig.start)
      } else if (edge === 'left') {
        const rawStart = orig.start + deltaBeats
        const nextStart = Math.max(0, session.snap ? snapBeat(rawStart) : rawStart)
        const end = orig.start + orig.length
        if (end - nextStart >= 0.25) {
          found.startBeat = nextStart
          found.lengthBeats = end - nextStart
        }
      } else {
        found.startBeat = Math.max(0, snapBeat(orig.start + deltaBeats))
        const nextTrack = Math.min(session.tracks.length - 1, Math.max(1, orig.track + deltaTracks))
        const dest = session.tracks[nextTrack]
        if (dest && dest.type !== 'master' && dest.type !== 'group') found.trackIndex = nextTrack
      }
    })
    queueClipMoves(selectedClips())
  }
  const up = () => {
    if (gesture && gesture.armed) {
      flushClipMoves()
      selectedClips().forEach((item) => {
        if (edge === 'move') moveClip(item, item.startBeat, item.trackIndex)
        else resizeClip(item, item.startBeat, item.lengthBeats)
      })
    }
    endEdit()
    gesture = null
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}

function runContext (item) {
  context.value = null
  closeMenus()
  if (item && item.run) item.run()
}

function onHScroll (e) {
  const detail = e && e.detail
  const el = e && (e.currentTarget.$el || e.currentTarget)
  scrollX.value = (detail && detail.scrollLeft != null) ? detail.scrollLeft : (el && el.scrollLeft) || 0
  viewportW.value = (el && el.clientWidth) || viewportW.value || 1600
  if (Date.now() - lastUserScroll < 32) follow.value = false
  lastUserScroll = Date.now()
}

function onVScroll (e) {
  const detail = e && e.detail
  const el = e && (e.currentTarget.$el || e.currentTarget)
  scrollY.value = (detail && detail.scrollTop != null) ? detail.scrollTop : (el && el.scrollTop) || 0
}

function onScroll (e) {
  onHScroll(e)
  onVScroll(e)
}

function onWheel (e) {
  if (e.ctrlKey || e.metaKey) {
    if (e.preventDefault) e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const localX = e.clientX - rect.left + scrollX.value
    const beat = localX / session.pixelsPerBeat
    const old = session.pixelsPerBeat
    setPixelsPerBeat(old * (e.deltaY < 0 ? 1.12 : 0.89))
    const el = lanesEl.value
    if (el && el.scrollLeft != null) el.scrollLeft = Math.max(0, beat * session.pixelsPerBeat - (e.clientX - rect.left))
  }
}

let pinchStart = 0
let pinchPpb = 21
function onTouchStart (e) {
  const touches = e.touches || (e.detail && e.detail.touches)
  if (touches && touches.length === 2) {
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    pinchStart = Math.hypot(dx, dy)
    pinchPpb = session.pixelsPerBeat
  }
}
function onTouchMove (e) {
  const touches = e.touches || (e.detail && e.detail.touches)
  if (!touches || touches.length !== 2 || !pinchStart) return
  if (e.preventDefault) e.preventDefault()
  const dx = touches[0].clientX - touches[1].clientX
  const dy = touches[0].clientY - touches[1].clientY
  const dist = Math.hypot(dx, dy)
  const midX = (touches[0].clientX + touches[1].clientX) / 2
  const el = lanesEl.value && (lanesEl.value.$el || lanesEl.value)
  const rect = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0 }
  const beat = (midX - rect.left + scrollX.value) / session.pixelsPerBeat
  setPixelsPerBeat(pinchPpb * (dist / pinchStart))
  if (el && el.scrollLeft != null) el.scrollLeft = Math.max(0, beat * session.pixelsPerBeat - (midX - rect.left))
}

function updatePlayhead () {
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const beats = interpolateBeats(session.clockStamp || session, now, session.bpm)
  if (!session.remoteAudioOn && session.playing) {
    /* local clock already advances session.positionBeats */
  }
  const x = (session.playing && session.clockStamp && session.clockStamp.playing ? beats : session.positionBeats) * session.pixelsPerBeat
  const node = playheadEl.value
  const el = node && (node.$el || node)
  if (el && el.style) el.style.transform = 'translateX(' + x + 'px)'
  if (session.playing && follow.value) {
    const scroller = lanesEl.value && (lanesEl.value.$el || lanesEl.value)
    if (scroller && scroller.clientWidth) {
      const viewRight = scroller.scrollLeft + scroller.clientWidth
      if (x > viewRight - 48 && x < viewRight + 200) scroller.scrollLeft += Math.min(24, x - (viewRight - 80))
    }
  }
  raf = requestAnimationFrame(updatePlayhead)
}

function measure () {
  compact.value = typeof window !== 'undefined' && window.innerWidth < 720
}

watch(() => session.scrollRequest, () => {
  const row = rows.value.find((item) => item.index === session.selectedTrack)
  if (!row) return
  const scroller = vScrollEl.value && (vScrollEl.value.$el || vScrollEl.value)
  if (!scroller) return
  const y = rows.value.indexOf(row) * session.trackHeight
  if (y < scroller.scrollTop || y > scroller.scrollTop + scroller.clientHeight - session.trackHeight) {
    scroller.scrollTop = Math.max(0, y - session.trackHeight)
  }
})

onMounted(() => {
  measure()
  if (typeof window !== 'undefined') window.addEventListener('resize', measure)
  const scroller = lanesEl.value && (lanesEl.value.$el || lanesEl.value)
  if (scroller && scroller.addEventListener) {
    scroller.addEventListener('wheel', onWheel, { passive: false })
    viewportW.value = scroller.clientWidth || 1600
  }
  raf = requestAnimationFrame(updatePlayhead)
})
onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure)
  const scroller = lanesEl.value && (lanesEl.value.$el || lanesEl.value)
  if (scroller && scroller.removeEventListener) scroller.removeEventListener('wheel', onWheel)
  if (raf) cancelAnimationFrame(raf)
})
</script>

<style scoped>
.pl {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #101010;
  position: relative;
}
.mobile-tools {
  height: 40px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
  position: relative;
  flex-shrink: 0;
}
.group-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 10px;
  background: #181818;
  border-top: 1px solid #2a2a2a;
}
.gbtn {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 8px;
  background: #2a2a2a;
  color: #e6e6e6;
  font-size: 13px;
  display: flex;
  align-items: center;
}
.ghint { color: #8d8d8d; font-size: 12px; }
.lab { color: #8d8d8d; font-size: 11px; }
.board {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.top {
  display: flex;
  height: 36px;
  flex-shrink: 0;
  min-width: 0;
}
.top .corner { width: 128px; flex-shrink: 0; }
.top .ruler { flex: 1; min-width: 0; }
.phone .top .corner { width: 112px; }
.lite .top .corner { width: 168px; }
.vscroll {
  flex: 1 1 auto;
  min-height: 0;
  height: 0;
  width: 100%;
}
.vscroll :deep(.uni-scroll-view) {
  height: 100%;
}
.vbody {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  box-sizing: border-box;
}
.lite .name { font-size: 12px; font-weight: 650; flex: 1; min-width: 0; }
.lite .tiny { width: 28px; height: 28px; min-width: 28px; font-size: 10px; }
.lite .tiny.fx { width: 28px; letter-spacing: 0.02em; font-size: 14px; line-height: 1; }
.lite-head {
  flex-direction: column;
  align-items: stretch;
  justify-content: center;
  padding-right: 4px;
  gap: 0;
  box-sizing: border-box;
  overflow: hidden;
}
.lite-stack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding-right: 2px;
}
.lite-top {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  flex-shrink: 0;
}
.lite-mix {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex-shrink: 0;
}
.lite-vol {
  flex: 1;
  height: 18px;
  min-width: 0;
}
.lite-pan { flex-shrink: 0; }
.lite-head :deep(.knob) {
  width: 24px;
  height: 24px;
}
.lite-head :deep(.knob .disc) {
  width: 24px;
  height: 24px;
}
@media (max-width: 360px) {
  .lite .top .corner, .lite .headers { width: 148px; }
  .lite .name { font-size: 11px; }
  .lite .tiny { width: 26px; height: 26px; min-width: 26px; }
  .lite-vol { height: 16px; }
}
.corner {
  background: #2a2a2a;
  border-right: 1px solid #2a2a2a;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  padding: 0 6px;
  position: relative;
  z-index: 4;
}
.ruler {
  background: #2a2a2a;
  overflow: hidden;
  position: relative;
  cursor: ew-resize;
  user-select: none;
}
.ruler-shift { position: absolute; inset: 0; }
.loop-lane { height: 8px; position: relative; }
.loop-band {
  position: absolute;
  top: 1px;
  height: 6px;
  background: rgba(77,163,255,0.45);
  border-radius: 2px;
}
.loop-handle {
  position: absolute;
  top: -8px;
  width: 20px;
  height: 20px;
}
.loop-handle.left { left: -10px; }
.loop-handle.right { right: -10px; }
.marker {
  position: absolute;
  top: 10px;
  color: #8d8d8d;
  font-size: 10px;
  padding-left: 6px;
  border-left: 1px solid #6a6a6a;
  cursor: pointer;
  white-space: nowrap;
}
.bar {
  position: absolute;
  top: 18px;
  height: 18px;
  border-left: 1px solid #4a4a4a;
  padding-left: 6px;
  color: #8d8d8d;
  font-size: 11px;
}
.headers {
  background: #161616;
  border-right: 1px solid #2a2a2a;
  width: 128px;
  flex-shrink: 0;
  overflow: visible;
}
.phone .headers { width: 112px; }
.lite .headers { width: 168px; }
.head {
  display: flex;
  align-items: center;
  gap: 6px;
  border-bottom: 1px solid #202020;
  box-sizing: border-box;
  padding-right: 6px;
  position: relative;
  overflow: hidden;
}
.head.on { background: #232323; }
.head.group { background: #141414; }
.accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 2px;
}
.glyph {
  width: 22px;
  height: 22px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #e6e6e6;
  background: #1e1e1e;
  flex-shrink: 0;
}
.glyph.strings { background: #1f2a24; }
.glyph.piano { background: #242428; }
.glyph.perc { background: #2a261f; }
.glyph.choir { background: #2a2430; }
.glyph.wood { background: #1e2a22; }
.glyph.brass { background: #242018; }
.glyph.group { background: transparent; }
.twist { width: 16px; color: #8d8d8d; font-size: 11px; text-align: center; }
.name, .name-input {
  flex: 1;
  min-width: 0;
  color: #e6e6e6;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-input {
  background: #0e0e0e;
  border: 1px solid #4da3ff;
  border-radius: 3px;
  height: 20px;
}
.tiny {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  background: #2b2b2b;
  color: #8d8d8d;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.tiny.on.mute { background: #c45c26; color: #fff; }
.tiny.on.solo { background: #2ea44f; color: #fff; }
.phone .tiny { width: 24px; height: 24px; }
.phone .edge { width: 22px; }
.lanes {
  flex: 1;
  min-width: 0;
  height: 100%;
  width: 0;
  overflow: hidden;
}
.canvas { position: relative; height: 100%; }
.grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(90deg, #2c2c2c 1px, transparent 1px),
    linear-gradient(90deg, #1c1c1c 1px, transparent 1px);
}
.loop-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: rgba(77,163,255,0.07);
  pointer-events: none;
}
.clip {
  position: absolute;
  border-radius: 4px;
  overflow: hidden;
  cursor: grab;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.14);
  touch-action: pan-y;
}
.clip.on { box-shadow: inset 0 0 0 1.6px #e8e8e8; outline: 1px solid rgba(255,255,255,0.35); }
.clip.muted { filter: grayscale(0.4); }
.clip-name {
  position: absolute;
  left: 6px;
  top: 2px;
  font-size: 10px;
  color: #fff;
  z-index: 1;
}
.preview {
  position: absolute;
  left: 2px;
  right: 2px;
  top: 14px;
  bottom: 2px;
  display: flex;
}
.col { flex: 1; position: relative; }
.cell {
  position: absolute;
  left: 10%;
  width: 80%;
  height: 10%;
  background: rgba(255,255,255,0.7);
  border-radius: 1px;
}
.edge {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 16px;
  cursor: ew-resize;
}
.edge.left { left: 0; }
.edge.right { right: 0; }
.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: #fff;
  pointer-events: none;
  z-index: 8;
  will-change: transform;
}
.playhead .cap {
  position: absolute;
  top: 0;
  left: -4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
}
.marquee {
  position: absolute;
  border: 1px solid rgba(77,163,255,0.7);
  background: rgba(77,163,255,0.12);
  pointer-events: none;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
}
.empty-title { color: #6a6a6a; font-size: 15px; }
.empty-actions { display: flex; gap: 8px; pointer-events: auto; }
.empty-btn {
  padding: 7px 10px;
  background: #1e1e1e;
  color: #e6e6e6;
  font-size: 12px;
  border-radius: 6px;
  cursor: pointer;
}
.hit {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.hit:hover { background: #353535; }
.hit.on { background: rgba(77,163,255,0.16); }
.menu {
  position: absolute;
  min-width: 160px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 6px 0;
  z-index: 40;
}
.add-menu { top: 30px; left: 6px; }
.snap-menu, .tools-menu { top: 36px; right: 8px; }
.ctx {
  position: fixed;
  z-index: 60;
  min-width: 180px;
}
.item { padding: 10px 14px; color: #e6e6e6; font-size: 14px; cursor: pointer; min-height: 40px; display: flex; align-items: center; box-sizing: border-box; }
.item:hover { background: #3a3a3a; }
.item.on::after { content: ' ✓'; color: #4da3ff; }
</style>
