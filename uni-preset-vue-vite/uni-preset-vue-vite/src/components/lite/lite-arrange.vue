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
      <view class="heads" :style="{ width: headW + 'px' }">
        <view class="heads-inner" :style="{ transform: 'translateY(' + (-scrollY) + 'px)' }">
          <view
            v-for="row in rows"
            :key="row.track.id"
            class="head"
            :class="{ sel: row.index === session.selectedTrack, group: isGroup(row.track), muted: !isTrackAudible(row.index) }"
            :style="{ height: rowH + 'px', paddingLeft: 14 + row.depth * 12 + 'px' }"
          >
            <view class="swatch" :style="{ background: row.track.colour || '#6aa8ff' }" />
            <view class="head-text">
              <view class="name-row" @click.stop="openTrackMenu(row)">
                <view v-if="isGroup(row.track)" class="fold" @click.stop="toggleFold(row.track)">
                  <daw-icon :name="row.track.collapsed ? 'chevron-right' : 'chevron'" :size="14" color="currentColor" />
                </view>
                <text class="name">{{ row.track.name }}</text>
              </view>
              <view v-if="!isGroup(row.track)" class="inst" @click.stop="openInstrument(row)">
                <text class="inst-name">{{ instrumentLabel(row.track) }}</text>
              </view>
              <text v-else class="inst-name dim">{{ childCount(row.track) }} {{ childCount(row.track) === 1 ? 'track' : 'tracks' }}</text>
            </view>
            <view class="ms">
              <view class="flag" :class="{ on: row.track.mute }" aria-label="Mute" @click.stop="toggleFlag(row.index, 'mute')">M</view>
              <view class="flag solo" :class="{ on: row.track.solo }" aria-label="Solo" @click.stop="toggleFlag(row.index, 'solo')">S</view>
            </view>
          </view>
        </view>
      </view>

      <view ref="lanesRef" class="lanes">
        <view
          class="content"
          :style="contentStyle"
        >
          <view class="grid" :style="gridStyle" />
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
            <view v-if="isSelected(clip) && !clip.virtual" class="grip left" />
            <view v-if="isSelected(clip) && !clip.virtual" class="grip right" />
          </view>
          <view v-if="band" class="band" :style="bandStyle" />
          <view ref="playheadRef" class="playhead" :style="{ height: Math.max(lanesH, rows.length * rowH) + 'px' }" />
        </view>
        <view v-if="emptyProject" class="empty">
          <text class="empty-title">Start with a track</text>
          <view class="empty-btn" @click.stop="addLiteInstrumentTrack">Add track</view>
        </view>
      </view>
    </view>

    <view v-if="selection.length" class="actions">
      <text class="count">{{ selection.length === 1 ? (selection[0].name || 'Pattern') : selection.length + ' clips' }}</text>
      <view class="act" @click.stop="openSelected">Edit notes</view>
      <view class="act" @click.stop="duplicateSelection">Duplicate</view>
      <view class="act" @click.stop="loopSelection">Loop</view>
      <view class="act" @click.stop="muteSelection">{{ allMuted ? 'Unmute' : 'Mute' }}</view>
      <view class="act danger" @click.stop="deleteSelection">Delete</view>
      <view class="act icon" aria-label="Deselect" @click.stop="clearSelection">
        <daw-icon name="close" :size="16" color="currentColor" />
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
  deleteSelectedClips,
  loopClip,
  muteClips,
  undoEdit,
  showUndoToast,
  openVirtualClip,
  addLiteInstrumentTrack,
  isTouchInput,
  onTrackInstrumentClick,
  openLiteSheet
} from '../../store/session.js'
import { visibleTrackRows, clipSourceLength, isGroupTrack, buildCollapsedGroupClip } from '../../model/playlist-model.js'
import { applyClipDrag, clipEdgeAt, clipsInBand, pinchView, snapTo, RULER_SNAP_BEATS } from '../../model/arrange-gestures.js'
import { interpolateBeats } from '../../model/timeline.js'

const ROW_H = 76
const DOUBLE_TAP_MS = 320
const DRAG_SLOP = 8
const TAP_SLOP = 22

const bodyRef = ref(null)
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

const rowH = ROW_H
const ppb = computed(() => session.pixelsPerBeat)
const headW = computed(() => (viewportW.value < 900 ? 176 : 200))
const beatsPerBar = computed(() => Math.max(1, session.timeSigNum || 4))
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
  return session.clips.filter((clip) => shown.has(clip.trackIndex)).concat(groups).filter((clip) => {
    const s = clip.startBeat || 0
    return s + (clip.lengthBeats || 0) >= start && s <= end
  })
})

const selection = computed(() => session.clips.filter((clip) => session.selectedClipIds.includes(clip.id)))
const allMuted = computed(() => selection.value.length > 0 && selection.value.every((clip) => clip.muted))
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
  if (!track.definitionId && !track.instrument) return 'Choose instrument'
  return track.instrument || 'Instrument'
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

function toggleFlag (index, parameter) {
  const track = session.tracks[index]
  if (track) setTrackParameter(track, parameter, !track[parameter])
}
function toggleFold (track) { setTrackCollapsed(track, !track.collapsed) }
function openTrackMenu (row) {
  selectTrack(row.index)
  openLiteSheet({ kind: 'track-menu', trackIndex: row.index })
}
function openInstrument (row) {
  selectTrack(row.index)
  onTrackInstrumentClick(row.index)
}

function openClip (clip) {
  if (clip.virtual) {
    openVirtualClip(clip)
  } else {
    selectClip(session.clips.findIndex((item) => item.id === clip.id), true)
    session.selectedClipIds = [clip.id]
  }
  setEditorTab('piano')
  setWorkspaceView('piano')
}
function openSelected () { if (selection.value[0]) openClip(selection.value[0]) }
function clearSelection () { session.selectedClipIds = [] }
function duplicateSelection () { duplicateSelectedClips() }
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
    })
  }
  if (gesture && gesture.type === 'clip') endEdit()
  gesture = null
  band.value = null
}

function onDown (e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) {
    cancelGesture()
    startPinch()
    capture(e)
    return
  }
  if (pointers.size > 2) return
  const target = e.target && e.target.nodeType === 1 ? e.target : (e.target && e.target.parentElement)
  const inLanes = target && target.closest && target.closest('.lanes')
  if (!inLanes) return
  capture(e)
  const clipEl = target.closest('[data-clip]')
  const point = contentPoint(e.clientX, e.clientY)
  const now = Date.now()
  if (clipEl) {
    const id = clipEl.getAttribute('data-clip')
    const clip = visibleClips.value.find((item) => String(item.id) === id)
    if (!clip) return
    const again = lastTap.clipId === id && now - lastTap.at < DOUBLE_TAP_MS
    lastTap = { at: now, x: e.clientX, y: e.clientY, clipId: id }
    if (again) {
      lastTap = { at: 0, x: 0, y: 0, clipId: null }
      openClip(clip)
      return
    }
    if (clip.virtual) return
    if (!isSelected(clip)) session.selectedClipIds = [clip.id]
    const index = session.clips.findIndex((item) => item.id === clip.id)
    if (index >= 0) session.selectedClip = index
    selectTrack(clip.trackIndex)
    const rect = clipEl.getBoundingClientRect()
    const edge = selection.value.length === 1 ? clipEdgeAt(e.clientX - rect.left, rect.width, 22) : 'move'
    gesture = {
      type: 'clip',
      edge,
      startX: e.clientX,
      startY: e.clientY,
      armed: false,
      originals: selectedClips().map((item) => ({ id: item.id, start: item.startBeat, length: item.lengthBeats, track: item.trackIndex }))
    }
    beginEdit(edge === 'move' ? 'Move clips' : 'Resize clip')
    return
  }
  const again = lastTap.clipId == null && now - lastTap.at < DOUBLE_TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 28
  lastTap = { at: now, x: e.clientX, y: e.clientY, clipId: null }
  const row = rowAtY(point.y)
  if (again) {
    lastTap = { at: 0, x: 0, y: 0, clipId: null }
    if (row && isPlayableTrack(row.track)) {
      addMidiClip(row.index, snapBeat(Math.floor(point.x / ppb.value / beatsPerBar.value) * beatsPerBar.value))
    }
    return
  }
  if (isTouchInput()) {
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
    if (!gesture.armed) {
      if (Math.hypot(dx, dy) < DRAG_SLOP) return
      gesture.armed = true
    }
    const placed = applyClipDrag(gesture.originals.map((orig) => ({ ...orig, row: rowByTrack.value.get(orig.track) })), {
      edge: gesture.edge,
      deltaBeats: dx / ppb.value,
      deltaRows: Math.round(dy / ROW_H),
      snap: snapBeat,
      rowCount: rows.value.length,
      canDrop: (row) => !!rows.value[row] && isPlayableTrack(rows.value[row].track)
    })
    placed.forEach((next) => {
      const clip = session.clips.find((item) => item.id === next.id)
      if (!clip) return
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
    session.selectedClipIds = clipsInBand(session.clips, band.value, {
      pixelsPerBeat: ppb.value,
      rowHeight: ROW_H,
      rowOf: (clip) => rowByTrack.value.get(clip.trackIndex)
    })
  }
}

function onUp (e) {
  pointers.delete(e.pointerId)
  if (pinch) {
    if (pointers.size < 2) pinch = null
    return
  }
  if (!gesture) return
  clearHold()
  if (gesture.type === 'pan') {
    if (!Number.isFinite(gesture.travel) || gesture.travel < TAP_SLOP) {
      scrollX.value = gesture.scrollX
      scrollY.value = gesture.scrollY
      session.selectedClipIds = []
      if (gesture.row) selectTrack(gesture.row.index)
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
    if (gesture.row) selectTrack(gesture.row.index)
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

const listeners = { body: null, ruler: null, lanes: null }
onMounted(() => {
  const body = dom(bodyRef)
  const ruler = dom(rulerRef)
  const lanes = dom(lanesRef)
  if (body) {
    body.addEventListener('pointerdown', onDown)
    body.addEventListener('pointermove', onMove)
    body.addEventListener('pointerup', onUp)
    body.addEventListener('pointercancel', onUp)
    listeners.body = body
  }
  if (lanes) {
    lanes.addEventListener('wheel', onWheel, { passive: false })
    listeners.lanes = lanes
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
  const { body, ruler, lanes } = listeners
  if (body) {
    body.removeEventListener('pointerdown', onDown)
    body.removeEventListener('pointermove', onMove)
    body.removeEventListener('pointerup', onUp)
    body.removeEventListener('pointercancel', onUp)
  }
  if (lanes) lanes.removeEventListener('wheel', onWheel)
  if (ruler) ruler.removeEventListener('pointerdown', onRulerDown)
  if (resizeObserver) resizeObserver.disconnect()
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure)
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
.head.muted .head-text { opacity: 0.45; }
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
  top: 50%;
  width: 4px;
  height: 22px;
  margin-top: -11px;
  border-radius: 2px;
  background: var(--lt-ink);
  opacity: 0.8;
  pointer-events: none;
}
.grip.left { left: 4px; }
.grip.right { right: 4px; }
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
.actions {
  position: absolute;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  height: 52px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px 0 16px;
  border-radius: 26px;
  background: var(--lt-s2);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--lt-line);
  z-index: 30;
  max-width: calc(100% - 24px);
  box-sizing: border-box;
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
</style>
