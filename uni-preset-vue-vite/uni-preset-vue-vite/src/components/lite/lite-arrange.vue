<template>
  <view class="arr">
    <view class="top">
      <view class="corner" :style="{ width: headW + 'px' }">
        <view class="add" aria-label="Add track" @click.stop="addLiteInstrumentTrack">
          <daw-icon name="plus" :size="16" color="currentColor" />
          <text>Track</text>
        </view>
      </view>
      <view ref="rulerRef" class="ruler">
        <view class="ruler-inner" :style="{ transform: 'translateX(' + (-scrollX) + 'px)' }">
          <view
            v-if="session.looping"
            class="loop"
            :style="{ left: session.loopStart * ppb + 'px', width: Math.max(6, (session.loopEnd - session.loopStart) * ppb) + 'px' }"
          />
          <text
            v-for="bar in visibleBars"
            :key="bar"
            class="bar-lab"
            :style="{ left: bar * beatsPerBar * ppb + 'px' }"
          >{{ bar + 1 }}</text>
          <view ref="rulerHeadRef" class="ruler-head" />
        </view>
      </view>
    </view>

    <view ref="bodyRef" class="body">
      <view ref="headsRef" class="heads" :class="{ reordering: !!lift }" :style="{ width: headW + 'px' }">
        <view class="heads-inner" :style="{ transform: 'translateY(' + (-scrollY) + 'px)' }">
          <view
            v-for="(row, visual) in rows"
            :key="row.track.id"
            class="head"
            :class="{ sel: row.index === session.selectedTrack, group: isGroup(row.track), child: row.depth > 0, muted: !isTrackAudible(row.index), lift: lift && lift.visual === visual }"
            :style="headStyle(row, visual)"
            :data-row="visual"
          >
            <view v-if="row.depth" class="nest" :style="{ background: groupColour(row), width: (8 + (row.depth - 1) * 10) + 'px' }" />
            <view class="swatch" :style="{ background: row.track.colour || '#6aa8ff', left: (row.depth ? 10 + row.depth * 14 : 0) + 'px' }" />
            <view class="head-text">
              <view class="name-row" @click.stop="openTrackMenu(row)">
                <view v-if="isGroup(row.track)" class="fold" @click.stop="toggleFold(row.track)">
                  <daw-icon :name="row.track.collapsed ? 'chevron-right' : 'chevron'" :size="14" color="currentColor" />
                </view>
                <text class="name">{{ row.track.name }}</text>
              </view>
              <view v-if="!isGroup(row.track)" class="inst" @click.stop="openInstrument(row)">
                <text class="inst-name">{{ rowLabel(row) }}</text>
              </view>
              <text v-else class="inst-name dim">{{ childCount(row.track) }} {{ childCount(row.track) === 1 ? 'track' : 'tracks' }}</text>
            </view>
            <view class="ms">
              <view class="flag" :class="{ on: row.track.mute }" aria-label="Mute" @click.stop="toggleFlag(row.index, 'mute')">M</view>
              <view class="flag solo" :class="{ on: row.track.solo }" aria-label="Solo" @click.stop="toggleFlag(row.index, 'solo')">S</view>
            </view>
          </view>
          <view v-if="lift && lift.dropAt != null" class="drop-line" :style="{ top: lift.dropAt * rowH + 'px' }" />
        </view>
      </view>

      <view ref="lanesRef" class="lanes">
        <view
          class="content"
          :style="contentStyle"
        >
          <view class="grid" :style="gridStyle" />
          <view
            v-for="(row, visual) in rows"
            :key="'lane-' + row.track.id"
            class="lane-bg"
            :class="{ child: row.depth > 0, group: isGroup(row.track) }"
            :style="laneStyle(row, visual)"
          />
          <view
            v-for="clip in visibleClips"
            :key="clip.id"
            class="clip"
            :class="{ sel: isSelected(clip), muted: clip.muted || !isTrackAudible(clip.trackIndex), virtual: clip.virtual }"
            :style="clipStyle(clip)"
            :data-clip="String(clip.id)"
          >
            <text class="clip-name">{{ clip.name || 'Pattern' }}{{ repeatLabel(clip) }}</text>
            <daw-clip-preview :clip="clip" :revision="session.clipPreviewRevision" />
            <view v-if="clipIsAudio(clip) && !clip.virtual && (clip.fadeInBeats || 0) > 0.01" class="fade in" :style="{ width: fadeHandlePx(clip, 'in') + 'px' }" />
            <view v-if="clipIsAudio(clip) && !clip.virtual && (clip.fadeOutBeats || 0) > 0.01" class="fade out" :style="{ width: (clipWidthPx(clip) - fadeHandlePx(clip, 'out')) + 'px' }" />
            <view v-if="clipIsAudio(clip) && isSelected(clip) && !clip.virtual" class="env">
              <view v-if="(clip.fadeInBeats || 0) > 0.01" class="env-seg" :style="envLine(0, 58, fadeHandlePx(clip, 'in'), gainY(clip))" />
              <view class="env-seg" :style="envLine(fadeHandlePx(clip, 'in'), gainY(clip), fadeHandlePx(clip, 'out'), gainY(clip))" />
              <view v-if="(clip.fadeOutBeats || 0) > 0.01" class="env-seg" :style="envLine(fadeHandlePx(clip, 'out'), gainY(clip), clipWidthPx(clip), 58)" />
              <text class="env-db" :style="{ top: (gainY(clip) - 14) + 'px' }">{{ formatDb(clip.gainDb) }}</text>
              <view class="env-dot" :style="{ left: fadeHandlePx(clip, 'in') + 'px', top: gainY(clip) + 'px' }" />
              <view class="env-dot" :style="{ left: fadeHandlePx(clip, 'out') + 'px', top: gainY(clip) + 'px' }" />
              <view class="env-hit in" :style="{ left: fadeHandlePx(clip, 'in') + 'px', top: gainY(clip) + 'px' }" @pointerdown.stop="startFade(clip, 'in', $event)" />
              <view class="env-hit out" :style="{ left: fadeHandlePx(clip, 'out') + 'px', top: gainY(clip) + 'px' }" @pointerdown.stop="startFade(clip, 'out', $event)" />
              <view class="env-hit level" :style="levelHitStyle(clip)" @pointerdown.stop="startGain(clip, $event)" />
            </view>
            <view v-if="isSelected(clip) && !clip.virtual" class="grip left"><view class="grip-bar" /></view>
            <view v-if="isSelected(clip) && !clip.virtual" class="grip right" :class="{ trim: clipIsAudio(clip) }"><view class="grip-bar" /></view>
            <view v-if="isSelected(clip) && !clip.virtual && clipIsAudio(clip)" class="grip stretch"><view class="grip-bar" /></view>
          </view>
          <view v-if="band" class="band" :style="bandStyle" />
          <view ref="playheadRef" class="playhead" :style="{ height: Math.max(lanesH, rows.length * rowH) + 'px' }" />
        </view>
        <view v-if="emptyProject" class="empty">
          <text class="empty-title">Start with a track</text>
          <view class="empty-btn" @click.stop="addLiteInstrumentTrack">Add track</view>
        </view>
        <view
          v-if="menuOpen && selection.length"
          class="clip-menu"
          :style="menuStyle"
          @pointerdown.stop
          @click.stop
        >
          <view class="menu-head">
            <input
              v-if="selection.length === 1 && !selection[0].virtual"
              class="clip-rename"
              :value="selection[0].name || ''"
              @input="renameSelection($event)"
              @focus="setTyping(true)"
              @blur="setTyping(false)"
            >
            <text v-else class="count">{{ selection.length }} clips</text>
            <view class="act icon" aria-label="Deselect" @click.stop="clearSelection">
              <daw-icon name="close" :size="16" color="currentColor" />
            </view>
          </view>
          <view v-if="!primaryAudio" class="act" @click.stop="openSelected">Edit notes</view>
          <view v-if="canMerge" class="act" @click.stop="mergeSelection">Merge</view>
          <view class="act" @click.stop="duplicateSelection">Duplicate</view>
          <view class="act" @click.stop="loopSelection">Loop</view>
          <view class="act" @click.stop="muteSelection">{{ allMuted ? 'Unmute' : 'Mute' }}</view>
          <view class="act danger" @click.stop="deleteSelection">Delete</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import DawIcon from '../daw-icon.vue'
import DawClipPreview from '../daw-clip-preview.vue'
import {
  session,
  barLengthBeats,
  snapBeat,
  setPositionBeats,
  setPixelsPerBeat,
  setLoopRange,
  addMidiClip,
  moveClip,
  resizeClip,
  selectTrack,
  selectClip,
  setEditorTab,
  setWorkspaceView,
  setTrackParameter,
  setTrackCollapsed,
  isTrackAudible,
  isPlayableTrack,
  beginEdit,
  endEdit,
  queueClipMoves,
  flushClipMoves,
  selectedClips,
  duplicateSelectedClips,
  mergeSelectedClips,
  deleteSelectedClips,
  loopClip,
  muteClips,
  undoEdit,
  showUndoToast,
  openVirtualClip,
  addLiteInstrumentTrack,
  isTouchInput,
  onTrackInstrumentClick,
  openLiteSheet,
  reorderTracks,
  addClipFromFile,
  setAudioClipField,
  renameClip,
  setTyping,
  loadSf2File,
  loadSf2Wav
} from '../../store/session.js'
import { beginPointerDrag, pointerCoord } from '../../lib/pointer-drag.js'
import { visibleTrackRows, clipSourceLength, isGroupTrack, buildCollapsedGroupClip } from '../../model/playlist-model.js'
import { bindFileDropZone } from '../../lib/file-drop.js'
import { registerMediaDropTarget } from '../../store/media-library.js'
import { applyClipDrag, clipEdgeAt, clipsInBand, pinchView, snapTo, RULER_SNAP_BEATS } from '../../model/arrange-gestures.js'
import { interpolateBeats } from '../../model/timeline.js'
import { audioFileBeats, audioSourceBeats, audioStretch, audioTrim, clipMatchesTrack } from '../../audio/audio-clips.js'
const ROW_H = 76
const DOUBLE_TAP_MS = 320
const DRAG_SLOP = 8
const TAP_SLOP = 22
const CLIP_MENU_MS = 480
/** Hold a track head this long to lift it for reordering. */
const LIFT_MS = 480

const bodyRef = ref(null)
const headsRef = ref(null)
/** Live reorder gesture: which visual row is lifted, how far it has moved, where it will drop. */
const lift = ref(null)
const lanesRef = ref(null)
const rulerRef = ref(null)
const playheadRef = ref(null)
const rulerHeadRef = ref(null)
const scrollX = ref(0)
const scrollY = ref(0)
const lanesW = ref(800)
const lanesH = ref(600)
const viewportW = ref(1180)
const band = ref(null)
const menuOpen = ref(false)

const rowH = ROW_H
const ppb = computed(() => session.pixelsPerBeat)
const headW = computed(() => (viewportW.value < 900 ? 176 : 200))
const beatsPerBar = computed(() => Math.max(0.25, barLengthBeats.value || 4))
const rows = computed(() => visibleTrackRows(session.tracks))
const rowByTrack = computed(() => {
  const map = new Map()
  rows.value.forEach((row, visual) => map.set(row.index, visual))
  return map
})
const emptyProject = computed(() => !session.tracks.some((track) => isPlayableTrack(track)))

const contentBeats = computed(() => {
  let end = Math.max(64, session.loopEnd + 8)
  session.clips.forEach((clip) => { end = Math.max(end, (clip.startBeat || 0) + (clip.lengthBeats || 0) + 16) })
  return Math.max(end, (scrollX.value + lanesW.value) / ppb.value + 8)
})
const contentH = computed(() => Math.max(lanesH.value, rows.value.length * ROW_H + 120))
const contentStyle = computed(() => ({
  width: Math.ceil(contentBeats.value * ppb.value) + 'px',
  height: contentH.value + 'px',
  transform: 'translate(' + (-scrollX.value) + 'px,' + (-scrollY.value) + 'px)'
}))
const gridStyle = computed(() => {
  const bar = beatsPerBar.value * ppb.value
  const beat = ppb.value
  const layers = [
    'linear-gradient(to bottom, transparent ' + (ROW_H - 1) + 'px, rgba(255,255,255,0.05) ' + (ROW_H - 1) + 'px)',
    'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)'
  ]
  const sizes = ['100% ' + ROW_H + 'px', bar + 'px 100%']
  if (beat >= 14) {
    layers.push('linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)')
    sizes.push(beat + 'px 100%')
  }
  return {
    height: rows.value.length * ROW_H + 'px',
    backgroundImage: layers.join(','),
    backgroundSize: sizes.join(',')
  }
})
const barStep = computed(() => Math.max(1, Math.ceil(44 / Math.max(1, beatsPerBar.value * ppb.value))))
const visibleBars = computed(() => {
  const barPx = beatsPerBar.value * ppb.value
  const first = Math.max(0, Math.floor(scrollX.value / barPx))
  const last = Math.ceil((scrollX.value + lanesW.value) / barPx)
  const out = []
  for (let bar = first - (first % barStep.value); bar <= last; bar += barStep.value) out.push(bar)
  return out
})

const visibleClips = computed(() => {
  const start = scrollX.value / ppb.value - 4
  const end = (scrollX.value + lanesW.value) / ppb.value + 4
  const shown = new Set(rows.value.map((row) => row.index))
  const groups = []
  session.tracks.forEach((track, index) => {
    if (!isGroupTrack(track) || !track.collapsed || !shown.has(index)) return
    const built = buildCollapsedGroupClip(session.tracks, session.clips, track.id)
    if (built) groups.push(built)
  })
  return session.clips.filter((clip) => {
    if (!shown.has(clip.trackIndex)) return false
    return clipMatchesTrack(session.tracks[clip.trackIndex], clip)
  }).concat(groups).filter((clip) => {
    const s = clip.startBeat || 0
    return s + (clip.lengthBeats || 0) >= start && s <= end
  })
})

const selection = computed(() => session.clips.filter((clip) => session.selectedClipIds.includes(clip.id)))
const allMuted = computed(() => selection.value.length > 0 && selection.value.every((clip) => clip.muted))
const primaryAudio = computed(() => {
  const clip = selection.value[0]
  return !!clip && clipIsAudio(clip) && selection.value.every((item) => clipIsAudio(item))
})
const canMerge = computed(() => {
  const clips = selection.value.filter((clip) => !clip.virtual && !clipIsAudio(clip))
  if (clips.length < 2 || clips.length !== selection.value.length) return false
  const track = clips[0].trackIndex
  return clips.every((clip) => clip.trackIndex === track)
})
const menuStyle = computed(() => {
  const clips = selection.value
  if (!clips.length) return {}
  let left = Infinity
  let right = -Infinity
  let top = Infinity
  clips.forEach((clip) => {
    const row = rowByTrack.value.get(clip.trackIndex)
    if (row == null) return
    const x = (clip.startBeat || 0) * ppb.value - scrollX.value
    const w = Math.max(10, (clip.lengthBeats || 1) * ppb.value)
    const y = row * ROW_H - scrollY.value
    if (x < left) left = x
    if (x + w > right) right = x + w
    if (y < top) top = y
  })
  if (!Number.isFinite(left)) return { left: '8px', top: '8px' }
  const menuW = 188
  const menuH = 332
  const viewW = Math.max(200, lanesW.value || 400)
  const viewH = Math.max(200, lanesH.value || 400)
  const visRight = Math.min(viewW - 8, right)
  let x = visRight + 8
  if (x + menuW > viewW - 8) x = Math.max(8, visRight - menuW)
  let y = Math.max(8, top)
  if (y + menuH > viewH - 8) y = Math.max(8, viewH - menuH - 8)
  return { left: Math.round(x) + 'px', top: Math.round(y) + 'px' }
})
const bandStyle = computed(() => {
  const b = band.value
  if (!b) return {}
  return {
    left: Math.min(b.x0, b.x1) + 'px',
    top: Math.min(b.y0, b.y1) + 'px',
    width: Math.abs(b.x1 - b.x0) + 'px',
    height: Math.abs(b.y1 - b.y0) + 'px'
  }
})

function isGroup (track) { return isGroupTrack(track) }
function childCount (group) { return session.tracks.filter((track) => track.parentId === group.id).length }
function instrumentLabel (track) {
  if (isAudioTrack(track)) {
    const index = session.tracks.indexOf(track)
    return session.clips.some((clip) => clip.trackIndex === index) ? 'Audio' : 'Add audio'
  }
  if (!track.definitionId && !track.instrument) return 'Choose instrument'
  return track.instrument || 'Instrument'
}
function parentTrack (track) {
  if (!track || !track.parentId) return null
  return session.tracks.find((item) => item.id === track.parentId) || null
}
function groupColour (row) {
  const parent = parentTrack(row.track)
  return (parent && parent.colour) || 'rgba(255,255,255,0.4)'
}
function rowLabel (row) {
  const parent = row.depth ? parentTrack(row.track) : null
  if (parent) return 'in ' + parent.name
  return instrumentLabel(row.track)
}
function laneStyle (row, visual) {
  return {
    top: visual * ROW_H + 'px',
    height: ROW_H + 'px',
    boxShadow: row.depth ? 'inset 4px 0 0 ' + groupColour(row) : ''
  }
}
function isAudioTrack (track) {
  return !!track && (track.type === 'audio' || track.source === 'audio')
}
function isSelected (clip) { return session.selectedClipIds.includes(clip.id) }
function repeatLabel (clip) {
  const source = clipSourceLength(clip)
  if ((clip.lengthBeats || 0) <= source * 1.05) return ''
  return '  ×' + Math.max(2, Math.round((clip.lengthBeats || source) / source))
}
function tint (colour) {
  const hex = String(colour || '#6aa8ff')
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex + '38' : hex
}
function clipStyle (clip) {
  const visual = rowByTrack.value.get(clip.trackIndex)
  if (visual == null) return { display: 'none' }
  const colour = clip.colour || (session.tracks[clip.trackIndex] && session.tracks[clip.trackIndex].colour) || '#6aa8ff'
  return {
    left: (clip.startBeat || 0) * ppb.value + 'px',
    top: visual * ROW_H + 6 + 'px',
    width: Math.max(10, (clip.lengthBeats || 1) * ppb.value - 1) + 'px',
    height: ROW_H - 12 + 'px',
    background: tint(colour),
    '--clip': colour
  }
}

function headStyle (row, visual) {
  const inset = row.depth ? 22 + row.depth * 16 : 14
  const style = { height: rowH + 'px', paddingLeft: inset + 'px' }
  if (lift.value && lift.value.visual === visual) style.transform = 'translateY(' + lift.value.dy + 'px)'
  return style
}

/* ── track head: long-press lifts the row, drag to reorder ───────── */

let headPress = null

function onHeadDown (e) {
  if (!Number.isFinite(e.clientY) || (e.button != null && e.button !== 0)) return
  const target = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement)
  if (target && target.closest && target.closest('.modes, .flag, .fold')) return
  const head = target && target.closest && target.closest('.head')
  if (!head) return
  const visual = Number(head.getAttribute('data-row'))
  if (!Number.isFinite(visual) || !rows.value[visual]) return
  cancelHeadPress()
  headPress = {
    pointerId: e.pointerId,
    visual,
    x0: e.clientX,
    y0: e.clientY,
    timer: setTimeout(() => {
      if (!headPress) return
      headPress.timer = 0
      beginLift(headPress)
    }, LIFT_MS)
  }
}

function cancelHeadPress () {
  if (headPress && headPress.timer) clearTimeout(headPress.timer)
  headPress = null
}

function beginLift (press) {
  const el = dom(headsRef)
  if (el && el.setPointerCapture) {
    try { el.setPointerCapture(press.pointerId) } catch (err) { /* pointer already gone */ }
  }
  const row = rows.value[press.visual]
  if (row) selectTrack(row.index)
  lift.value = { visual: press.visual, dy: 0, dropAt: null, pointerId: press.pointerId }
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(12) } catch (err) { /* not allowed */ }
  }
}

function onHeadMove (e) {
  if (headPress && !lift.value) {
    // Moving before the hold completes is a scroll, not a lift.
    if (Math.hypot(e.clientX - headPress.x0, e.clientY - headPress.y0) > DRAG_SLOP) cancelHeadPress()
    return
  }
  const live = lift.value
  if (!live || e.pointerId !== live.pointerId || !headPress) return
  if (e.cancelable) e.preventDefault()
  const dy = e.clientY - headPress.y0
  const count = rows.value.length
  // The gap the lifted row would fall into, measured from its own centre.
  const centre = live.visual * ROW_H + ROW_H / 2 + dy
  let slot = Math.round(centre / ROW_H)
  slot = Math.max(0, Math.min(count, slot))
  lift.value = { ...live, dy, dropAt: slot }
}

function onHeadUp (e) {
  const live = lift.value
  if (live && e.pointerId === live.pointerId) {
    const from = rows.value[live.visual]
    const slot = live.dropAt
    lift.value = null
    cancelHeadPress()
    liftedUntil = Date.now() + 500
    if (from && slot != null && slot !== live.visual && slot !== live.visual + 1) {
      // Dropping into the gap above row `slot`: that row's index when moving up, the row
      // just above the gap when moving down.
      const targetRow = slot > live.visual ? rows.value[slot - 1] : rows.value[slot]
      if (targetRow) reorderTracks(from.index, targetRow.index)
    }
    return
  }
  cancelHeadPress()
}

function toggleFlag (index, parameter) {
  const track = session.tracks[index]
  if (track) setTrackParameter(track, parameter, !track[parameter])
}
/** A finished lift must not also count as the tap that opens a menu. */
let liftedUntil = 0
function justLifted () { return Date.now() < liftedUntil }

function toggleFold (track) {
  if (justLifted()) return
  setTrackCollapsed(track, !track.collapsed)
}
function openTrackMenu (row) {
  if (justLifted()) return
  selectTrack(row.index)
  openLiteSheet({ kind: 'track-menu', trackIndex: row.index })
}
function openInstrument (row) {
  if (justLifted()) return
  selectTrack(row.index)
  if (isAudioTrack(row.track)) {
    pickAudio(row.index, session.positionBeats || 0)
    return
  }
  onTrackInstrumentClick(row.index)
}

function openClip (clip) {
  if (clip.virtual) {
    openVirtualClip(clip)
  } else {
    selectClip(session.clips.findIndex((item) => item.id === clip.id), true)
    session.selectedClipIds = [clip.id]
  }
  if (clipIsAudio(clip)) return
  setEditorTab('piano')
  setWorkspaceView('piano')
}
function openSelected () { if (selection.value[0]) openClip(selection.value[0]) }
function formatDb (db) {
  const n = Number(db) || 0
  return (n > 0 ? '+' : '') + n.toFixed(1) + ' dB'
}
function clipIsAudio (clip) {
  if (!clip) return false
  return clip.kind === 'audio' || clip.midi === false
}
function renameSelection (event) {
  const clip = selection.value[0]
  if (!clip) return
  const raw = event && event.detail && event.detail.value != null
    ? event.detail.value
    : (event && event.target && event.target.value)
  renameClip(clip, raw)
}
function gainY (clip) {
  const db = Number(clip && clip.gainDb) || 0
  const ratio = Math.min(1, Math.max(0, (db + 24) / 36))
  return 22 + (1 - ratio) * 32
}
function clipWidthPx (clip) {
  return Math.max(10, (clip.lengthBeats || 1) * ppb.value)
}
function envLine (x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.max(1, Math.hypot(dx, dy))
  const ang = Math.atan2(dy, dx) * 180 / Math.PI
  return {
    left: x1 + 'px',
    top: y1 + 'px',
    width: len + 'px',
    transform: 'rotate(' + ang + 'deg)'
  }
}
function levelHitStyle (clip) {
  const x1 = fadeHandlePx(clip, 'in')
  const x2 = fadeHandlePx(clip, 'out')
  return {
    left: (x1 + 16) + 'px',
    width: Math.max(24, x2 - x1 - 32) + 'px',
    top: gainY(clip) + 'px'
  }
}
function fadeHandlePx (clip, edge) {
  const beats = edge === 'in' ? Number(clip.fadeInBeats) || 0 : Number(clip.fadeOutBeats) || 0
  const length = Math.max(0.25, clip.lengthBeats || 1)
  const width = Math.max(10, length * ppb.value)
  const used = Math.min(length * 0.49, Math.max(0, beats))
  const px = used * ppb.value
  if (edge === 'in') return Math.max(0, Math.min(width, px))
  return Math.max(0, Math.min(width, width - px))
}
function startFade (clip, edge, event) {
  const origin = pointerCoord(event)
  const key = edge === 'in' ? 'fadeInBeats' : 'fadeOutBeats'
  const start = Number(clip[key]) || 0
  beginPointerDrag(event, {
    onMove: (ev) => {
      const at = pointerCoord(ev)
      if (!at || !origin) return
      const delta = (at.x - origin.x) / ppb.value
      const cap = Math.max(0, (clip.lengthBeats || 1) * 0.49)
      const next = edge === 'in' ? start + delta : start - delta
      setAudioClipField(clip, key, Math.min(cap, Math.max(0, next)))
    }
  })
}
function startGain (clip, event) {
  const origin = pointerCoord(event)
  const start = Number(clip.gainDb) || 0
  beginPointerDrag(event, {
    onMove: (ev) => {
      const at = pointerCoord(ev)
      if (!at || !origin) return
      setAudioClipField(clip, 'gainDb', start + (origin.y - at.y) / 3)
    }
  })
}
function pickAudio (trackIndex, beat) {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.aif,.aiff'
  input.onchange = () => {
    const file = input.files && input.files[0]
    if (file) addClipFromFile(file, trackIndex, beat || 0)
  }
  input.click()
}
function clearSelection () {
  menuOpen.value = false
  session.selectedClipIds = []
}
function duplicateSelection () { duplicateSelectedClips() }
function mergeSelection () {
  if (!mergeSelectedClips()) return
  showUndoToast('Merged patterns', () => undoEdit())
}
function loopSelection () { selection.value.forEach((clip) => loopClip(clip)) }
function muteSelection () { muteClips(selection.value, !allMuted.value) }
function deleteSelection () {
  const count = selection.value.length
  if (!count) return
  beginEdit('Delete clips')
  deleteSelectedClips()
  endEdit()
  showUndoToast(count === 1 ? 'Deleted clip' : 'Deleted ' + count + ' clips', () => undoEdit())
}

/* ── pointer gestures ─────────────────────────────────────────────── */

const pointers = new Map()
let gesture = null
let pinch = null
let lastTap = { at: 0, x: 0, y: 0, clipId: null }

function dom (r) {
  const el = r && r.value
  if (!el) return null
  return el.$el || el
}
function lanesRect () {
  const el = dom(lanesRef)
  return el ? el.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 }
}
function contentPoint (clientX, clientY) {
  const rect = lanesRect()
  return { x: clientX - rect.left + scrollX.value, y: clientY - rect.top + scrollY.value }
}
/** Topmost pattern under a content point. Later clips paint above earlier ones. */
function clipUnder (x, y) {
  const beat = x / ppb.value
  const row = Math.floor(y / ROW_H)
  const list = visibleClips.value
  for (let i = list.length - 1; i >= 0; i--) {
    const clip = list[i]
    if (rowByTrack.value.get(clip.trackIndex) !== row) continue
    const start = clip.startBeat || 0
    if (beat >= start && beat < start + (clip.lengthBeats || 0)) return clip
  }
  return null
}
function rowAtY (y) {
  const visual = Math.floor(y / ROW_H)
  return rows.value[visual] || null
}
function clampScroll () {
  const maxY = Math.max(0, rows.value.length * ROW_H + 120 - lanesH.value)
  scrollY.value = Math.min(maxY, Math.max(0, scrollY.value))
  scrollX.value = Math.max(0, scrollX.value)
}

function startPinch () {
  const [a, b] = Array.from(pointers.values())
  const rect = lanesRect()
  pinch = {
    x0: a.x, y0: a.y, x1: b.x, y1: b.y,
    left: rect.left,
    ppb: ppb.value,
    scrollX: scrollX.value,
    scrollY: scrollY.value
  }
}

function rowAcceptsClip (row) {
  const track = rows.value[row] && rows.value[row].track
  if (!track || !isPlayableTrack(track)) return false
  const clips = (gesture && gesture.originals || []).map((orig) => session.clips.find((item) => item.id === orig.id)).filter(Boolean)
  if (!clips.length) return false
  const audioTrack = track.type === 'audio' || track.source === 'audio'
  if (clips.every((clip) => clipIsAudio(clip))) return audioTrack
  if (clips.every((clip) => !clipIsAudio(clip))) return !audioTrack
  return false
}

function clearHold () {
  if (gesture && gesture.hold) {
    clearTimeout(gesture.hold)
    gesture.hold = 0
  }
}

function cancelGesture () {
  clearHold()
  if (gesture && gesture.type === 'clip' && gesture.armed) {
    gesture.originals.forEach((orig) => {
      const clip = session.clips.find((item) => item.id === orig.id)
      if (!clip) return
      clip.startBeat = orig.start
      clip.lengthBeats = orig.length
      clip.trackIndex = orig.track
      if (orig.offset != null) clip.audioOffsetBeats = orig.offset
      if (orig.source != null) clip.audioSourceBeats = orig.source
    })
  }
  if (gesture && gesture.type === 'clip') endEdit()
  gesture = null
  band.value = null
}

/** Right-click: the same clip menu a long press opens. */
function openClipMenuAt (clientX, clientY) {
  const point = contentPoint(clientX, clientY)
  const clip = clipUnder(point.x, point.y)
  if (!clip || clip.virtual) {
    menuOpen.value = false
    return
  }
  const ids = session.selectedClipIds.includes(clip.id) ? session.selectedClipIds.slice() : [clip.id]
  selectTrack(clip.trackIndex, { keepClips: true })
  session.selectedClipIds = ids
  const index = session.clips.findIndex((item) => item.id === clip.id)
  if (index >= 0) session.selectedClip = index
  menuOpen.value = true
}

function onDown (e) {
  const target = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement)
  const inLanes = target && target.closest && target.closest('.lanes')
  // Only fingers on the timeline count. A thumb resting on a track head must not turn a
  // one-finger drag into a pinch.
  if (!inLanes || !Number.isFinite(e.clientX)) return
  if (target.closest('.clip-menu, .env-hit')) return
  if (e.button === 2) {
    openClipMenuAt(e.clientX, e.clientY)
    return
  }
  if (e.isPrimary) {
    // First finger of a new sequence: forget any pointer whose lift we never saw.
    pointers.clear()
    pinch = null
  }
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    cancelGesture()
    startPinch()
    capture(e)
    return
  }
  if (pointers.size > 2) return
  capture(e)
  const point = contentPoint(e.clientX, e.clientY)
  const geom = clipUnder(point.x, point.y)
  const now = Date.now()
  if (geom) {
    const clip = geom
    const id = String(clip.id)
    const again = lastTap.clipId === id && now - lastTap.at < DOUBLE_TAP_MS
    lastTap = { at: now, x: e.clientX, y: e.clientY, clipId: id }
    if (again) {
      lastTap = { at: 0, x: 0, y: 0, clipId: null }
      menuOpen.value = false
      openClip(clip)
      return
    }
    if (clip.virtual) return
    const already = session.selectedClipIds.includes(clip.id)
    const covered = session.clips.some((item) => (
      item.id !== clip.id
      && session.selectedClipIds.includes(item.id)
      && item.trackIndex === clip.trackIndex
      && (item.startBeat || 0) < (clip.startBeat || 0) + (clip.lengthBeats || 0)
      && (clip.startBeat || 0) < (item.startBeat || 0) + (item.lengthBeats || 0)
    ))
    if (e.shiftKey) {
      const ids = session.selectedClipIds.filter((id) => id !== clip.id)
      if (!already) ids.push(clip.id)
      session.selectedClipIds = ids.length ? ids : [clip.id]
    } else if (!already || covered) {
      session.selectedClipIds = [clip.id]
    }
    const kept = session.selectedClipIds.slice()
    selectTrack(clip.trackIndex, { keepClips: true })
    session.selectedClipIds = kept
    const index = session.clips.findIndex((item) => item.id === clip.id)
    if (index >= 0) session.selectedClip = index
    const width = Math.max(10, (clip.lengthBeats || 1) * ppb.value)
    const localX = point.x - (clip.startBeat || 0) * ppb.value
    const grip = target && target.closest && target.closest('.grip')
    let edge = 'move'
    if (session.selectedClipIds.length === 1 && clipIsAudio(clip)) {
      if (grip && grip.classList.contains('stretch')) edge = 'stretch'
      else if (grip && grip.classList.contains('left')) edge = 'left'
      else if (grip && grip.classList.contains('right')) edge = 'right'
    } else if (session.selectedClipIds.length === 1) {
      edge = clipEdgeAt(localX, width, 22)
    }
    menuOpen.value = false
    gesture = {
      type: 'clip',
      edge,
      startX: e.clientX,
      startY: e.clientY,
      armed: false,
      menu: false,
      originals: selectedClips().map((item) => ({
        id: item.id,
        start: item.startBeat,
        length: item.lengthBeats,
        track: item.trackIndex,
        offset: Number(item.audioOffsetBeats) || 0,
        source: audioSourceBeats(item),
        file: audioFileBeats(item, session.bpm)
      })),
      hold: clip.virtual ? 0 : setTimeout(() => {
        if (!gesture || gesture.type !== 'clip' || gesture.armed) return
        gesture.menu = true
        menuOpen.value = true
      }, CLIP_MENU_MS)
    }
    beginEdit(edge === 'stretch' ? 'Stretch audio' : (edge === 'move' ? 'Move clips' : 'Resize clip'))
    return
  }
  const again = lastTap.clipId == null && now - lastTap.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28
  lastTap = { at: now, x: e.clientX, y: e.clientY, clipId: null }
  const row = rowAtY(point.y)
  if (again) {
    lastTap = { at: 0, x: 0, y: 0, clipId: null }
    if (row && isPlayableTrack(row.track)) {
      const beat = snapBeat(Math.floor(point.x / ppb.value / beatsPerBar.value) * beatsPerBar.value)
      if (isAudioTrack(row.track)) pickAudio(row.index, beat)
      else addMidiClip(row.index, beat)
    }
    return
  }
  if (isTouchInput(e)) {
    gesture = {
      type: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      scrollX: scrollX.value,
      scrollY: scrollY.value,
      origin: point,
      row,
      travel: 0,
      hold: setTimeout(() => {
        if (gesture && gesture.type === 'pan') gesture.type = 'band'
      }, 450)
    }
    return
  }
  gesture = { type: 'empty', startX: e.clientX, startY: e.clientY, origin: point, row }
}

function onMove (e) {
  if (!pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pinch && pointers.size >= 2) {
    const [a, b] = Array.from(pointers.values())
    const next = pinchView(pinch, { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, { minPpb: 6, maxPpb: 240 })
    setPixelsPerBeat(next.ppb)
    scrollX.value = next.scrollX
    scrollY.value = next.scrollY
    clampScroll()
    return
  }
  if (!gesture) return
  const dx = e.clientX - gesture.startX
  const dy = e.clientY - gesture.startY
  if (gesture.type === 'clip') {
    if (gesture.menu) return
    if (!gesture.armed) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return
      gesture.armed = true
      clearHold()
      menuOpen.value = false
    }
    const placed = applyClipDrag(gesture.originals.map((orig) => ({ ...orig, row: rowByTrack.value.get(orig.track) })), {
      edge: gesture.edge === 'stretch' ? 'right' : gesture.edge,
      deltaBeats: dx / ppb.value,
      deltaRows: Math.round(dy / ROW_H),
      snap: snapBeat,
      rowCount: rows.value.length,
      canDrop: (row) => rowAcceptsClip(row)
    })
    placed.forEach((next) => {
      const clip = session.clips.find((item) => item.id === next.id)
      const orig = gesture.originals.find((item) => item.id === next.id)
      if (!clip || !orig) return
      if (clipIsAudio(clip) && gesture.edge === 'stretch') {
        const shaped = audioStretch(orig, next.length)
        clip.startBeat = shaped.start
        clip.lengthBeats = shaped.length
        clip.audioOffsetBeats = shaped.offset
        clip.audioSourceBeats = shaped.source
        return
      }
      if (clipIsAudio(clip) && gesture.edge !== 'move') {
        const shaped = audioTrim(orig, next.start, next.length, orig.file)
        clip.startBeat = shaped.start
        clip.lengthBeats = shaped.length
        clip.audioOffsetBeats = shaped.offset
        clip.audioSourceBeats = shaped.source
        return
      }
      clip.startBeat = next.start
      clip.lengthBeats = next.length
      if (gesture.edge === 'move' && next.row != null && rows.value[next.row]) clip.trackIndex = rows.value[next.row].index
    })
    queueClipMoves(selectedClips())
    return
  }
  if (gesture.type === 'pan') {
    const travel = Math.hypot(dx, dy)
    if (Number.isFinite(travel)) gesture.travel = travel
    if (travel >= TAP_SLOP) {
      clearHold()
      scrollX.value = gesture.scrollX - dx
      scrollY.value = gesture.scrollY - dy
      clampScroll()
    }
    return
  }
  if (gesture.type === 'empty' && Math.hypot(dx, dy) >= DRAG_SLOP) {
    gesture.type = 'band'
  }
  if (gesture.type === 'band') {
    const point = contentPoint(e.clientX, e.clientY)
    band.value = { x0: gesture.origin.x, y0: gesture.origin.y, x1: point.x, y1: point.y }
    session.selectedClipIds = clipsInBand(session.clips.filter((clip) => clipMatchesTrack(session.tracks[clip.trackIndex], clip)), band.value, {
      pixelsPerBeat: ppb.value,
      rowHeight: ROW_H,
      rowOf: (clip) => rowByTrack.value.get(clip.trackIndex)
    })
  }
}

function onLost (e) {
  if (pointers.has(e.pointerId)) onUp(e)
}

function onUp (e) {
  pointers.delete(e.pointerId)
  if (pinch) {
    if (pointers.size < 2) {
      pinch = null
      pointers.clear()
    }
    return
  }
  if (!gesture) return
  clearHold()
  if (gesture.type === 'pan') {
    if (!Number.isFinite(gesture.travel) || gesture.travel < TAP_SLOP) {
      scrollX.value = gesture.scrollX
      scrollY.value = gesture.scrollY
      session.selectedClipIds = []
      menuOpen.value = false
      if (gesture.row) selectTrack(gesture.row.index, { keepClips: true })
    }
  } else if (gesture.type === 'clip') {
    if (gesture.armed) {
      flushClipMoves()
      selectedClips().forEach((clip) => {
        if (gesture.edge === 'move') moveClip(clip, clip.startBeat, clip.trackIndex)
        else resizeClip(clip, clip.startBeat, clip.lengthBeats)
      })
    }
    endEdit()
  } else if (gesture.type === 'empty') {
    session.selectedClipIds = []
    menuOpen.value = false
    if (gesture.row) selectTrack(gesture.row.index, { keepClips: true })
  }
  gesture = null
  band.value = null
}

function capture (e) {
  const el = dom(bodyRef)
  if (el && el.setPointerCapture) {
    try { el.setPointerCapture(e.pointerId) } catch (err) { /* pointer already gone */ }
  }
}

/* Ruler: drag the playhead, always on 1/32 notes. With loop on, the loop edges drag. */
function onRulerDown (e) {
  const el = dom(rulerRef)
  if (!el) return
  const rect = el.getBoundingClientRect()
  const beatAt = (clientX) => snapTo((clientX - rect.left + scrollX.value) / ppb.value, RULER_SNAP_BEATS)
  const x = e.clientX - rect.left + scrollX.value
  let mode = 'seek'
  if (session.looping) {
    if (Math.abs(x - session.loopStart * ppb.value) < 16) mode = 'loop-start'
    else if (Math.abs(x - session.loopEnd * ppb.value) < 16) mode = 'loop-end'
  }
  const apply = (clientX) => {
    const beat = beatAt(clientX)
    if (mode === 'loop-start') setLoopRange(Math.min(beat, session.loopEnd - RULER_SNAP_BEATS), session.loopEnd)
    else if (mode === 'loop-end') setLoopRange(session.loopStart, Math.max(beat, session.loopStart + RULER_SNAP_BEATS))
    else setPositionBeats(beat)
  }
  apply(e.clientX)
  try { el.setPointerCapture(e.pointerId) } catch (err) { /* ignore */ }
  const move = (ev) => apply(ev.clientX)
  const up = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', up)
    el.removeEventListener('pointercancel', up)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
}

function onWheel (e) {
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const rect = lanesRect()
    const anchor = (e.clientX - rect.left + scrollX.value) / ppb.value
    setPixelsPerBeat(ppb.value * (e.deltaY < 0 ? 1.1 : 0.91))
    scrollX.value = anchor * ppb.value - (e.clientX - rect.left)
  } else if (e.shiftKey) {
    scrollX.value += e.deltaY
  } else {
    scrollX.value += e.deltaX
    scrollY.value += e.deltaY
  }
  clampScroll()
}

/* ── playhead ─────────────────────────────────────────────────────── */

let raf = 0
function drawPlayhead () {
  raf = 0
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const beats = session.playing && session.clockStamp && session.clockStamp.playing
    ? interpolateBeats(session.clockStamp, now, session.bpm)
    : session.positionBeats
  const x = beats * ppb.value
  const line = dom(playheadRef)
  const head = dom(rulerHeadRef)
  if (line && line.style) line.style.transform = 'translateX(' + x + 'px)'
  if (head && head.style) head.style.transform = 'translateX(' + x + 'px)'
  if (session.playing && !pointers.size) {
    const right = scrollX.value + lanesW.value
    if (x > right - 40 || x < scrollX.value) scrollX.value = Math.max(0, x - 80)
  }
  if (session.playing) raf = requestAnimationFrame(drawPlayhead)
}
function kickPlayhead () {
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(drawPlayhead)
}
watch(() => [session.playing, session.positionBeats, ppb.value], kickPlayhead)

watch(() => session.scrollRequest, () => {
  const visual = rowByTrack.value.get(session.selectedTrack)
  if (visual == null) return
  const y = visual * ROW_H
  if (y < scrollY.value || y > scrollY.value + lanesH.value - ROW_H) {
    scrollY.value = Math.max(0, y - ROW_H)
    clampScroll()
  }
})

let resizeObserver = null
function measure () {
  const el = dom(lanesRef)
  if (el) {
    lanesW.value = el.clientWidth || lanesW.value
    lanesH.value = el.clientHeight || lanesH.value
  }
  if (typeof window !== 'undefined') viewportW.value = window.innerWidth
  clampScroll()
}

function onContextMenu (e) {
  const target = e.target && e.target.closest ? e.target : null
  if (target && target.closest('input, textarea')) return
  e.preventDefault()
}

const listeners = { body: null, ruler: null, lanes: null, heads: null }
let unbindDrop = () => {}
let unbindMediaDrop = () => {}
onMounted(() => {
  const body = dom(bodyRef)
  const ruler = dom(rulerRef)
  const lanes = dom(lanesRef)
  const heads = dom(headsRef)
  if (heads) {
    heads.addEventListener('pointerdown', onHeadDown)
    heads.addEventListener('pointermove', onHeadMove)
    heads.addEventListener('pointerup', onHeadUp)
    heads.addEventListener('pointercancel', onHeadUp)
    heads.addEventListener('contextmenu', (ev) => { if (lift.value) ev.preventDefault() })
    listeners.heads = heads
  }
  if (body) {
    body.addEventListener('pointerdown', onDown)
    body.addEventListener('pointermove', onMove)
    body.addEventListener('pointerup', onUp)
    body.addEventListener('pointercancel', onUp)
    body.addEventListener('lostpointercapture', onLost)
    body.addEventListener('contextmenu', onContextMenu)
    listeners.body = body
  }
  if (lanes) {
    lanes.addEventListener('wheel', onWheel, { passive: false })
    listeners.lanes = lanes
    unbindMediaDrop = registerMediaDropTarget({
      el: lanes,
      describe: (x, y, entry) => {
        const point = contentPoint(x, y)
        const row = rowAtY(point.y)
        const bar = Math.floor(snapBeat(point.x / ppb.value) / beatsPerBar.value) + 1
        const fits = row && row.track && isPlayableTrack(row.track) &&
          (entry.kind === 'midi' ? row.track.type === 'midi' : (row.track.type === 'audio' || row.track.source === 'audio'))
        return (fits ? row.track.name : 'New ' + (entry.kind === 'midi' ? 'MIDI' : 'audio') + ' track') + ' · bar ' + bar
      },
      drop: async (x, y, file) => {
        const point = contentPoint(x, y)
        const row = rowAtY(point.y)
        await addClipFromFile(file, row ? row.index : -1, snapBeat(point.x / ppb.value))
      }
    })
    unbindDrop = bindFileDropZone(lanes, {
      onDrop: async (e, files) => {
        const point = contentPoint(e.clientX, e.clientY)
        const row = rowAtY(point.y)
        const trackIndex = row ? row.index : session.selectedTrack
        const beat = snapBeat(point.x / ppb.value)
        const track = session.tracks[trackIndex]
        for (const file of files || []) {
          const name = file.name || ''
          if (/\.sf2$/i.test(name) && track) await loadSf2File(track, file)
          else if (/\.(wav|mp3|ogg)$/i.test(name) && track && (track.source === 'sf2' || track.definitionId === 'sf2_sampler')) await loadSf2Wav(track, file)
          else await addClipFromFile(file, trackIndex, beat)
        }
      }
    })
  }
  if (ruler) {
    ruler.addEventListener('pointerdown', onRulerDown)
    listeners.ruler = ruler
  }
  if (typeof ResizeObserver === 'function' && lanes) {
    resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(lanes)
  }
  if (typeof window !== 'undefined') window.addEventListener('resize', measure)
  measure()
  kickPlayhead()
})
onUnmounted(() => {
  const { body, ruler, lanes, heads } = listeners
  cancelHeadPress()
  if (heads) {
    heads.removeEventListener('pointerdown', onHeadDown)
    heads.removeEventListener('pointermove', onHeadMove)
    heads.removeEventListener('pointerup', onHeadUp)
    heads.removeEventListener('pointercancel', onHeadUp)
  }
  if (body) {
    body.removeEventListener('pointerdown', onDown)
    body.removeEventListener('pointermove', onMove)
    body.removeEventListener('pointerup', onUp)
    body.removeEventListener('pointercancel', onUp)
    body.removeEventListener('lostpointercapture', onLost)
    body.removeEventListener('contextmenu', onContextMenu)
  }
  if (lanes) lanes.removeEventListener('wheel', onWheel)
  if (ruler) ruler.removeEventListener('pointerdown', onRulerDown)
  if (resizeObserver) resizeObserver.disconnect()
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure)
  unbindDrop()
  unbindMediaDrop()
  if (raf) cancelAnimationFrame(raf)
  raf = 0
})
</script>

<style scoped>
.arr {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--lt-bg);
  position: relative;
}
.top {
  height: 36px;
  display: flex;
  flex-shrink: 0;
  box-shadow: inset 0 -1px 0 var(--lt-line);
}
.corner {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-left: 8px;
  box-sizing: border-box;
  box-shadow: inset -1px 0 0 var(--lt-line);
}
.add {
  height: 30px;
  padding: 0 12px 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  color: var(--lt-ink-2);
  font-size: var(--lt-fs-s);
  cursor: pointer;
}
.add:active { background: var(--lt-s2); }
.ruler {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: pointer;
}
.ruler-inner { position: absolute; inset: 0 auto 0 0; width: 100000px; }
.bar-lab {
  position: absolute;
  top: 10px;
  margin-left: 5px;
  font-size: 11px;
  color: var(--lt-ink-2);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}
.loop {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 6px;
  background: var(--lt-accent-soft);
  box-shadow: inset 2px 0 0 var(--lt-accent), inset -2px 0 0 var(--lt-accent);
  pointer-events: none;
}
.ruler-head {
  position: absolute;
  left: -6px;
  bottom: 0;
  width: 0;
  height: 0;
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-top: 8px solid var(--lt-ink);
  pointer-events: none;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  touch-action: none;
}
.heads {
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  background: var(--lt-bg);
  box-shadow: inset -1px 0 0 var(--lt-line);
  z-index: 2;
}
.head {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 8px;
  box-sizing: border-box;
  box-shadow: inset 0 -1px 0 var(--lt-line);
}
.head.sel { background: var(--lt-s1); }
.head.group { background: var(--lt-s1); }
.head.child { background: rgba(255, 255, 255, 0.035); }
.nest {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  pointer-events: none;
  opacity: 0.9;
}
.head.muted .head-text { opacity: 0.45; }
/* Lifted row rides above its neighbours while it is being dragged. */
.head.lift {
  z-index: 3;
  background: var(--lt-s2);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45), inset 0 -1px 0 var(--lt-line);
  transition: box-shadow 160ms ease;
}
.heads.reordering .head:not(.lift) { transition: transform 160ms ease; }
.drop-line {
  position: absolute;
  left: 8px;
  right: 8px;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  background: var(--lt-accent);
  box-shadow: 0 0 8px var(--lt-accent);
  pointer-events: none;
  z-index: 4;
}
@media (prefers-reduced-motion: reduce) {
  .head.lift, .heads.reordering .head:not(.lift) { transition: none; }
}
.swatch {
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  border-radius: 0 2px 2px 0;
}
.head-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.name-row {
  min-height: 28px;
  display: flex;
  align-items: center;
  gap: 2px;
  cursor: pointer;
}
.fold {
  width: 28px;
  height: 28px;
  margin-left: -6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lt-ink-2);
}
.name {
  font-size: var(--lt-fs-m);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inst {
  min-height: 26px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.inst-name {
  font-size: var(--lt-fs-s);
  color: var(--lt-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inst:active .inst-name { color: var(--lt-ink); }
.inst-name.dim { opacity: 0.7; }
.ms { display: flex; flex-direction: column; gap: 4px; }
.flag {
  width: 32px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: var(--lt-s2);
  color: var(--lt-ink-2);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}
.flag.on { background: #e0b341; color: #0b0c0e; }
.flag.solo.on { background: var(--lt-accent); }
.lanes {
  flex: 1;
  min-width: 0;
  position: relative;
  overflow: hidden;
}
.content { position: absolute; left: 0; top: 0; will-change: transform; }
.grid { position: absolute; left: 0; right: 0; top: 0; pointer-events: none; }
.lane-bg {
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
}
.lane-bg.child { background: rgba(255, 255, 255, 0.028); }
.lane-bg.group { background: rgba(255, 255, 255, 0.045); }
.clip {
  position: absolute;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06), inset 0 2px 0 var(--clip);
  box-sizing: border-box;
}
.clip.sel { box-shadow: inset 0 0 0 2px var(--lt-ink), inset 0 2px 0 var(--clip); }
.clip.muted { opacity: 0.4; }
.clip.virtual { box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12); }
.clip-name {
  position: absolute;
  left: 8px;
  top: 5px;
  right: 8px;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}
.clip :deep(.preview) { top: 22px; left: 6px; right: 6px; bottom: 6px; opacity: 0.85; }
.grip {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 28px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
}
.grip-bar {
  width: 4px;
  height: 22px;
  border-radius: 2px;
  background: var(--lt-ink);
  opacity: 0.85;
  pointer-events: none;
}
.grip.left { left: 0; }
.grip.right { right: 0; }
.grip.right.trim { top: 0; bottom: 26px; }
.grip.stretch {
  top: auto;
  right: 0;
  bottom: 0;
  width: 34px;
  height: 30px;
}
.grip.stretch .grip-bar {
  width: 12px;
  height: 12px;
  background: transparent;
  box-shadow: inset 0 0 0 2px var(--lt-ink);
  opacity: 1;
}
.band {
  position: absolute;
  border-radius: 4px;
  background: var(--lt-accent-soft);
  box-shadow: inset 0 0 0 1px var(--lt-accent);
  pointer-events: none;
}
.playhead {
  position: absolute;
  left: 0;
  top: 0;
  width: 1px;
  background: var(--lt-ink);
  opacity: 0.85;
  pointer-events: none;
}
.empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.empty-title { font-size: var(--lt-fs-l); font-weight: 600; }
.empty-btn {
  height: 44px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  border-radius: 22px;
  background: var(--lt-ink);
  color: var(--lt-bg);
  font-size: var(--lt-fs-m);
  font-weight: 600;
}
.clip-menu {
  position: absolute;
  z-index: 6;
  width: 188px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px;
  border-radius: 14px;
  background: var(--lt-s2);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--lt-line);
  box-sizing: border-box;
}
.menu-head {
  display: flex;
  align-items: center;
  gap: 4px;
}
.clip-rename {
  flex: 1;
  min-width: 0;
  height: 36px;
  margin: 0;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: var(--lt-s3);
  color: var(--lt-ink);
  font-size: 14px;
  font-weight: 600;
}
.count {
  font-size: var(--lt-fs-s);
  color: var(--lt-ink-2);
  margin-right: 8px;
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.act {
  height: 40px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-radius: 20px;
  font-size: var(--lt-fs-s);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
}
.act:active { background: var(--lt-s3); }
.act.danger { color: var(--lt-warn); }
.act.icon { width: 40px; padding: 0; justify-content: center; color: var(--lt-ink-2); }
.clip-menu .count { flex: 1; margin: 0 0 0 8px; max-width: none; }
.clip-menu .act { justify-content: flex-start; }
.fade {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 1;
}
.fade.in {
  left: 0;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.5), transparent);
}
.fade.out {
  right: 0;
  background: linear-gradient(270deg, rgba(0, 0, 0, 0.5), transparent);
}
.env-dot {
  position: absolute;
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45);
  pointer-events: none;
  z-index: 5;
}
.env-seg {
  position: absolute;
  height: 2px;
  margin-top: -1px;
  border-radius: 1px;
  background: #fff;
  transform-origin: 0 50%;
  pointer-events: none;
  z-index: 3;
}
.env-db {
  position: absolute;
  left: 8px;
  font-size: 10px;
  color: #fff;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
  z-index: 3;
}
.env-hit {
  position: absolute;
  width: 28px;
  height: 28px;
  margin: -14px 0 0 -14px;
  z-index: 7;
  touch-action: none;
}
.env-hit.level {
  margin-left: 0;
  height: 28px;
}
</style>
