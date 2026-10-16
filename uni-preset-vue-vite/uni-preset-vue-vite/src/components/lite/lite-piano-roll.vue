<template>
  <view class="lite-roll">
    <view class="bar">
      <view class="back" @click="goBack">
        <daw-icon name="back" :size="20" color="currentColor" />
        <text>Arrange</text>
      </view>
      <text class="clip-name">{{ clip ? clip.name : '' }}</text>
      <view class="tools">
        <view class="lt-seg">
          <view class="lt-seg-item tool" :class="{ on: tool === 'draw' }" @click="tool = 'draw'">
            <daw-icon name="pencil" :size="16" color="currentColor" />
            <text>Draw</text>
          </view>
          <view class="lt-seg-item tool" :class="{ on: tool === 'select' }" @click="tool = 'select'">
            <daw-icon name="pointer" :size="16" color="currentColor" />
            <text>Select</text>
          </view>
        </view>
        <view class="lt-chip" :class="{ on: session.snap }" @click="cycleSnap">Snap {{ snapLabel }}</view>
        <view class="lt-chip" @click="quantize">
          <daw-icon name="quantize" :size="16" color="currentColor" />
          <text>Quantize</text>
        </view>
        <view class="lt-chip" :class="{ on: session.scaleGuide }" @click="scaleOpen = true">
          <daw-icon name="scale" :size="16" color="currentColor" />
          <text>{{ session.scaleKey }} {{ scaleLabel(session.scaleName) }}</text>
        </view>
      </view>
      <view class="selection" :class="{ show: selectedCount > 0 }">
        <text class="count">{{ selectedCount }} selected</text>
        <view class="lt-hit" @click="duplicateSelected"><daw-icon name="copy" :size="20" color="currentColor" /></view>
        <view class="lt-hit" @click="deleteSelected"><daw-icon name="trash" :size="20" color="currentColor" /></view>
      </view>
    </view>

    <view v-if="!clip || !clip.midi" class="empty">
      <text>Pick a MIDI clip in the arrangement to edit its notes.</text>
    </view>
    <template v-else>
      <view ref="rollHost" class="roll-host" />
      <view class="lane-head">
        <view class="lt-seg">
          <view
            v-for="item in lanes"
            :key="item.id"
            class="lt-seg-item"
            :class="{ on: lane === item.id }"
            @click="lane = item.id"
          >{{ item.label }}</view>
        </view>
        <view
          v-if="lane === 'dynamics' || lane === 'expression'"
          class="lt-chip pen"
          :class="{ on: laneDraw }"
          aria-label="Draw curve"
          @click="laneDraw = !laneDraw"
        >
          <daw-icon name="pencil" :size="16" color="currentColor" />
        </view>
        <text class="lane-hint">{{ laneHint }}</text>
      </view>
      <view ref="laneHost" class="lane-host" />
    </template>

    <lite-sheet :open="scaleOpen" title="Scale" @close="scaleOpen = false">
      <text class="lt-cap">Key</text>
      <view class="keys">
        <view
          v-for="key in keyNames"
          :key="key"
          class="lt-chip key"
          :class="{ on: session.scaleKey === key }"
          @click="setScaleKeyName(key, '')"
        >{{ key }}</view>
      </view>
      <text class="lt-cap">Scale</text>
      <view class="keys">
        <view
          v-for="name in scaleNames"
          :key="name"
          class="lt-chip"
          :class="{ on: session.scaleName === name }"
          @click="setScaleKeyName('', name)"
        >{{ scaleLabel(name) }}</view>
      </view>
      <text class="lt-cap">Options</text>
      <view class="lt-row" @click="session.scaleGuide = !session.scaleGuide">
        <text class="grow">Highlight scale notes</text>
        <view class="switch" :class="{ on: session.scaleGuide }"><view class="knob" /></view>
      </view>
      <view class="lt-row" @click="toggleScaleSnap">
        <text class="grow">Keep new notes in scale</text>
        <view class="switch" :class="{ on: session.scaleSnap }"><view class="knob" /></view>
      </view>
    </lite-sheet>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import DawIcon from '../daw-icon.vue'
import LiteSheet from './lite-sheet.vue'
import {
  session,
  getSelectedClip,
  getSelectedTrack,
  createNote,
  createNotes,
  deleteNotes,
  setNote,
  flushNotePatches,
  setPianoDragActive,
  previewNoteOn,
  previewNoteOff,
  beginEdit,
  endEdit,
  setPositionBeats,
  setSnapGrid,
  setWorkspaceView,
  setScaleKeyName,
  toggleScaleSnap,
  paintClipExpression,
  deleteClipExpressionPoint,
  moveClipExpressionPoint,
  addClipSustain,
  moveClipSustain,
  deleteClipSustain,
  isTouchInput
} from '../../store/session.js'
import {
  PPQ,
  KEY_NAMES,
  SCALE_NAMES,
  MIN_DURATION_TICKS,
  midiVelocity,
  normalizeNote,
  duplicateNotes,
  quantizeNotes,
  snapTick,
  snapPitchToScale
} from '../../model/note-model.js'
import {
  defaultView,
  clampZoom,
  clampScroll,
  zoomAt,
  xToTick,
  yToPitch,
  hitNote,
  notesInRect,
  gridTicksForView,
  fitViewToNotes,
  MIN_PX_PER_BEAT,
  MAX_PX_PER_BEAT,
  MIN_PX_PER_SEMITONE,
  MAX_PX_PER_SEMITONE
} from '../../model/piano-roll-engine.js'
import { drawPianoRoll, resizeCanvas, LITE_THEME, shade } from '../../model/piano-roll-render.js'
import { interpolateBeats } from '../../model/timeline.js'
import { RULER_SNAP_BEATS, snapTo } from '../../model/arrange-gestures.js'
import { ensureExpression, laneKey, hitLanePoint, hitSustainBlock, sortSustain } from '../../model/expression-lane.js'

const SNAP_STEPS = [
  { beats: 0, label: 'Off' },
  { beats: 1, label: '1/4' },
  { beats: 0.5, label: '1/8' },
  { beats: 0.25, label: '1/16' },
  { beats: 0.125, label: '1/32' }
]
const lanes = [
  { id: 'velocity', label: 'Velocity' },
  { id: 'dynamics', label: 'Dynamics', cc: 1 },
  { id: 'expression', label: 'Expression', cc: 11 },
  { id: 'pedal', label: 'Pedal', cc: 64 }
]
const MOVE_SLOP = 6
const SIXTEENTH = 0.25
const LONG_PRESS_MS = 480
const keyNames = KEY_NAMES
const scaleNames = SCALE_NAMES

const rollHost = ref(null)
const laneHost = ref(null)
const tool = ref('draw')
const lane = ref('velocity')
const laneDraw = ref(true)
const scaleOpen = ref(false)
const selectedIds = reactive(new Set())
const laneReadout = ref('')

const clip = computed(() => getSelectedClip())
const track = computed(() => getSelectedTrack())
const notes = computed(() => ((clip.value && clip.value.notes) || []).map((note) => normalizeNote(note)))
const selectedCount = computed(() => notes.value.filter((note) => selectedIds.has(note.id)).length)
const snapLabel = computed(() => {
  if (!session.snap) return 'Off'
  const hit = SNAP_STEPS.find((item) => item.beats && Math.abs(item.beats - session.snapGridBeats) < 1e-6)
  return hit ? hit.label : 'Bar'
})
const laneHint = computed(() => {
  if (laneReadout.value) return laneReadout.value
  if (lane.value === 'velocity') return 'Drag across notes to set how hard they play'
  if (lane.value === 'pedal') return 'Double-tap to add a pedal · drag its edge to change the length · double-tap a pedal to remove it'
  if (lane.value === 'dynamics' || lane.value === 'expression') {
    return laneDraw.value
    ? 'Pen on · drag to draw on 16th notes · drag a point to move it'
    : 'Pen off · drag a point to move it · double-tap to remove'
  }
  return 'Drag to draw · double-tap a point to remove it'
})

const view = defaultView({
  pixelsPerBeat: 72,
  pixelsPerSemitone: 20,
  keyboardWidth: 56,
  timelineHeight: 28
})

let rollCanvas = null
let laneCanvas = null
let layout = { gridX: 56, gridY: 28, gridW: 1, gridH: 1 }
let raf = 0
let dirty = true
let resizeObs = null
let hoverPitch = -1
let previewPitch = -1
let rubber = null
let gesture = null
let laneGesture = null
let lastNoteTap = { at: 0, id: 0 }
let lastPointTap = { at: 0, index: -1 }
let lastPedalTap = { at: 0 }
let fitted = false
const pointers = new Map()

function scaleLabel (name) {
  return String(name || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase())
}

function hostEl (r) {
  const el = r && r.value
  if (!el) return null
  if (el.nodeType === 1) return el
  return el.$el && el.$el.nodeType === 1 ? el.$el : null
}

function capturePointer (el, id) {
  try { el.setPointerCapture(id) } catch (err) { /* pointer already released */ }
}

function makeCanvas (parent) {
  const el = document.createElement('canvas')
  el.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;'
  parent.style.position = 'relative'
  parent.appendChild(el)
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  return el
}

function mount (tries = 0) {
  const rollParent = hostEl(rollHost)
  const laneParent = hostEl(laneHost)
  if (!rollParent || !laneParent) {
    if (tries < 30) requestAnimationFrame(() => mount(tries + 1))
    return
  }
  if (rollCanvas && rollCanvas.parentNode === rollParent) return
  unmount()
  rollCanvas = makeCanvas(rollParent)
  rollCanvas.addEventListener('pointerdown', onRollDown)
  rollCanvas.addEventListener('pointermove', onRollMove)
  rollCanvas.addEventListener('pointerup', onRollUp)
  rollCanvas.addEventListener('pointercancel', onRollUp)
  rollCanvas.addEventListener('wheel', onWheel, { passive: false })
  laneCanvas = makeCanvas(laneParent)
  laneCanvas.addEventListener('pointerdown', onLaneDown)
  laneCanvas.addEventListener('pointermove', onLaneMove)
  laneCanvas.addEventListener('pointerup', onLaneUp)
  laneCanvas.addEventListener('pointercancel', onLaneUp)
  laneCanvas.addEventListener('wheel', onWheel, { passive: false })
  if (typeof ResizeObserver !== 'undefined') {
    resizeObs = new ResizeObserver(() => markDirty())
    resizeObs.observe(rollParent)
    resizeObs.observe(laneParent)
  }
  fitted = false
  markDirty()
}

function unmount () {
  if (resizeObs) resizeObs.disconnect()
  resizeObs = null
  if (rollCanvas) rollCanvas.remove()
  if (laneCanvas) laneCanvas.remove()
  rollCanvas = null
  laneCanvas = null
}

function markDirty () {
  dirty = true
  if (raf || typeof requestAnimationFrame === 'undefined') return
  raf = requestAnimationFrame(frame)
}

function frame () {
  raf = 0
  if (typeof document !== 'undefined' && document.hidden) return
  paint()
  const keep = session.playing || pointers.size > 0
  dirty = false
  if (keep) raf = requestAnimationFrame(frame)
}

function playhead () {
  return interpolateBeats(session.clockStamp || session, performance.now(), session.bpm)
}

function syncSnap () {
  if (!session.snap) {
    view.snapId = 'off'
    return
  }
  const beats = session.snapGridBeats
  const hit = SNAP_STEPS.find((item) => item.beats && Math.abs(item.beats - beats) < 1e-6)
  view.snapId = hit ? hit.label : (beats >= 4 ? 'bar' : '1/16')
}

function gridTicks () {
  return view.snapId === 'off' ? 0 : gridTicksForView(view, session.timeSigNum || 4)
}

function paint () {
  if (!rollCanvas || !clip.value) return
  const parent = rollCanvas.parentNode
  const width = parent.clientWidth || 1
  const height = parent.clientHeight || 1
  syncSnap()
  view.keyboardWidth = width < 700 ? 44 : 56
  const gridW = Math.max(1, width - view.keyboardWidth)
  const gridH = Math.max(1, height - view.timelineHeight)
  if (!fitted && width > 10 && height > 10) {
    const pitches = notes.value.map((note) => note.pitch)
    if (pitches.length) {
      const span = Math.max(...pitches) - Math.min(...pitches) + 7
      view.pixelsPerSemitone = Math.min(24, Math.max(12, gridH / span))
    }
    fitViewToNotes(view, notes.value, gridW, gridH, clip.value.lengthBeats || 8)
    fitted = true
  }
  clampZoom(view)
  const contentW = Math.max(gridW, (clip.value.lengthBeats || 8) * view.pixelsPerBeat + 120)
  clampScroll(view, contentW, gridW, gridH)
  resizeCanvas(rollCanvas, width, height)
  layout = drawPianoRoll(rollCanvas.getContext('2d'), {
    width,
    height,
    view,
    theme: LITE_THEME,
    notes: notes.value,
    ghostNotes: [],
    selectedIds,
    clip: clip.value,
    timeSignatures: session.timeSignatures,
    timeSig: { numerator: session.timeSigNum, denominator: session.timeSigDen },
    markers: [],
    loopStart: session.looping ? session.loopStart : -1,
    loopEnd: session.looping ? session.loopEnd : -1,
    playheadBeat: playhead(),
    clipStartBeat: clip.value.startBeat || 0,
    scaleKey: session.scaleKey,
    scaleName: session.scaleName,
    scaleGuide: session.scaleGuide,
    velocityOpen: false,
    keyboardOpen: true,
    rubber,
    hoverPitch
  })
  paintLane()
}

/* ---------- note grid ---------- */

function local (e, el) {
  const rect = el.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function pinchStart () {
  const pts = Array.from(pointers.values())
  const rect = rollCanvas.getBoundingClientRect()
  return {
    dist: Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y)),
    cx: (pts[0].x + pts[1].x) / 2 - rect.left - layout.gridX,
    cy: (pts[0].y + pts[1].y) / 2 - rect.top - layout.gridY,
    ppb: view.pixelsPerBeat,
    pps: view.pixelsPerSemitone,
    scrollX: view.scrollX,
    scrollY: view.scrollY
  }
}

function applyPinch () {
  const start = gesture.start
  const pts = Array.from(pointers.values())
  if (pts.length < 2) return
  const rect = rollCanvas.getBoundingClientRect()
  const dist = Math.max(1, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y))
  const cx = (pts[0].x + pts[1].x) / 2 - rect.left - layout.gridX
  const cy = (pts[0].y + pts[1].y) / 2 - rect.top - layout.gridY
  const scale = dist / start.dist
  const beat = (start.scrollX + start.cx) / start.ppb
  const row = (start.scrollY + start.cy) / start.pps
  view.pixelsPerBeat = Math.min(MAX_PX_PER_BEAT, Math.max(MIN_PX_PER_BEAT, start.ppb * scale))
  view.pixelsPerSemitone = Math.min(MAX_PX_PER_SEMITONE, Math.max(MIN_PX_PER_SEMITONE, start.pps * Math.sqrt(scale)))
  view.scrollX = beat * view.pixelsPerBeat - cx
  view.scrollY = row * view.pixelsPerSemitone - cy
}

function snapPitch (pitch) {
  return session.scaleSnap ? snapPitchToScale(pitch, session.scaleKey, session.scaleName) : pitch
}

function capture (ids) {
  return notes.value.filter((note) => ids.has(note.id)).map((note) => ({
    id: note.id,
    startTick: note.startTick,
    durationTick: note.durationTick,
    pitch: note.pitch
  }))
}

function onRollDown (e) {
  if (!clip.value) return
  capturePointer(rollCanvas, e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  markDirty()
  if (pointers.size === 2) {
    cancelSingle()
    gesture = { type: 'pinch', start: pinchStart() }
    return
  }
  if (pointers.size > 2) return
  const p = local(e, rollCanvas)
  if (p.y < layout.gridY) {
    gesture = { type: 'seek' }
    seekTo(p.x)
    return
  }
  if (p.x < layout.gridX) {
    gesture = { type: 'keys' }
    startPreview(yToPitch(p.y - layout.gridY, view))
    return
  }
  const g = { x: p.x - layout.gridX, y: p.y - layout.gridY }
  const hit = hitNote(notes.value, g.x, g.y, view, e.pointerType === 'touch' ? 22 : 10)
  gesture = { type: 'pending', origin: p, hit, started: false }
  armSelectHold()
  if (hit) {
    if (!selectedIds.has(hit.note.id)) {
      selectedIds.clear()
      selectedIds.add(hit.note.id)
    }
    startPreview(hit.note.pitch, midiVelocity(hit.note.velocity) / 127)
  }
}

function clearRollHold () {
  if (gesture && gesture.hold) {
    clearTimeout(gesture.hold)
    gesture.hold = 0
  }
}

function armSelectHold () {
  if (!isTouchInput() || !gesture || gesture.type !== 'pending') return
  const origin = gesture.origin
  const hadHit = !!gesture.hit
  gesture.hold = setTimeout(() => {
    if (!gesture || gesture.type !== 'pending') return
    tool.value = 'select'
    if (hadHit) return
    rubber = { x: origin.x, y: origin.y, w: 0, h: 0 }
    gesture = { type: 'rubber', origin, started: true }
    selectedIds.clear()
    markDirty()
  }, LONG_PRESS_MS)
}

function cancelSingle () {
  clearRollHold()
  if (gesture && gesture.started && (gesture.type === 'move' || gesture.type === 'resize' || gesture.type === 'create')) {
    if (gesture.type === 'create' && gesture.note) deleteNotes(clip.value, [gesture.note])
    else restore(gesture.originals)
    flushNotePatches()
    endEdit()
  }
  setPianoDragActive(0)
  stopPreview()
  rubber = null
  gesture = null
}

function restore (originals) {
  ;(originals || []).forEach((orig) => {
    const live = (clip.value.notes || []).find((item) => item.id === orig.id)
    if (live) setNote(clip.value, live, { startTick: orig.startTick, durationTick: orig.durationTick, pitch: orig.pitch })
  })
}

function seekTo (x) {
  const beat = Math.max(0, (x - layout.gridX + view.scrollX) / view.pixelsPerBeat)
  setPositionBeats(snapTo((clip.value.startBeat || 0) + beat, RULER_SNAP_BEATS))
}

function beginDrag () {
  clearRollHold()
  const { hit, origin } = gesture
  const g = { x: origin.x - layout.gridX, y: origin.y - layout.gridY }
  if (hit) {
    const type = hit.resize ? 'resize' : 'move'
    beginEdit(type === 'resize' ? 'Resize notes' : 'Move notes')
    setPianoDragActive(clip.value.id)
    gesture = { type, origin, originals: capture(selectedIds), started: true }
    return
  }
  if (tool.value === 'select') {
    rubber = { x: origin.x, y: origin.y, w: 0, h: 0 }
    gesture = { type: 'rubber', origin, started: true }
    selectedIds.clear()
    return
  }
  if (isTouchInput()) {
    gesture = { type: 'pan', origin, scrollX: view.scrollX, scrollY: view.scrollY, started: true }
    return
  }
  const pitch = snapPitch(yToPitch(g.y, view))
  const grid = gridTicks()
  const raw = xToTick(g.x, view, { snap: false })
  const startTick = grid > 0 ? Math.floor(raw / grid) * grid : raw
  beginEdit('Create note')
  setPianoDragActive(clip.value.id)
  const note = createNote(clip.value, pitch, startTick / PPQ, Math.max(gridTicks(), MIN_DURATION_TICKS) / PPQ, 100)
  selectedIds.clear()
  if (note) selectedIds.add(note.id)
  startPreview(pitch)
  gesture = { type: 'create', origin, note, startTick, started: true }
}

function onRollMove (e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (!gesture || !clip.value) return
  markDirty()
  if (gesture.type === 'pinch') {
    applyPinch()
    return
  }
  const p = local(e, rollCanvas)
  if (gesture.type === 'seek') {
    seekTo(p.x)
    return
  }
  if (gesture.type === 'keys') {
    startPreview(yToPitch(p.y - layout.gridY, view))
    return
  }
  if (gesture.type === 'pending') {
    if (Math.hypot(p.x - gesture.origin.x, p.y - gesture.origin.y) < MOVE_SLOP) return
    beginDrag()
  }
  if (gesture.type === 'pan') {
    view.scrollX = gesture.scrollX - (p.x - gesture.origin.x)
    view.scrollY = gesture.scrollY - (p.y - gesture.origin.y)
    const beats = Math.max(64, ((clip.value && clip.value.lengthBeats) || 0) + 16)
    clampScroll(
      view,
      beats * view.pixelsPerBeat,
      Math.max(1, rollCanvas.clientWidth - layout.gridX),
      Math.max(1, rollCanvas.clientHeight - layout.gridY)
    )
    return
  }
  const grid = gridTicks()
  if (gesture.type === 'rubber') {
    const o = gesture.origin
    rubber = { x: Math.min(o.x, p.x), y: Math.min(o.y, p.y), w: Math.abs(p.x - o.x), h: Math.abs(p.y - o.y) }
    selectedIds.clear()
    notesInRect(notes.value, { x: rubber.x - layout.gridX, y: rubber.y - layout.gridY, w: rubber.w, h: rubber.h }, view)
      .forEach((note) => selectedIds.add(note.id))
    return
  }
  if (gesture.type === 'create' && gesture.note) {
    const end = xToTick(p.x - layout.gridX, view, { snap: false })
    const snapped = snapTick(end, grid, grid <= 0)
    setNote(clip.value, gesture.note, { durationTick: Math.max(grid || MIN_DURATION_TICKS, snapped - gesture.startTick) })
    return
  }
  if (gesture.type === 'move' || gesture.type === 'resize') {
    const dTick = Math.round(((p.x - gesture.origin.x) / view.pixelsPerBeat) * PPQ)
    const dPitch = yToPitch(p.y - layout.gridY, view) - yToPitch(gesture.origin.y - layout.gridY, view)
    gesture.originals.forEach((orig) => {
      const live = (clip.value.notes || []).find((item) => item.id === orig.id)
      if (!live) return
      if (gesture.type === 'resize') {
        const end = snapTick(orig.startTick + orig.durationTick + dTick, grid, grid <= 0)
        setNote(clip.value, live, { durationTick: Math.max(grid || MIN_DURATION_TICKS, end - orig.startTick) })
      } else {
        setNote(clip.value, live, {
          startTick: snapTick(Math.max(0, orig.startTick + dTick), grid, grid <= 0),
          pitch: Math.min(127, Math.max(0, snapPitch(orig.pitch + dPitch)))
        })
      }
    })
    if (gesture.type === 'move' && gesture.originals.length) {
      const first = (clip.value.notes || []).find((item) => item.id === gesture.originals[0].id)
      if (first) startPreview(first.pitch)
    }
  }
}

function onRollUp (e) {
  pointers.delete(e.pointerId)
  markDirty()
  clearRollHold()
  if (!gesture) return
  if (gesture.type === 'pinch') {
    if (!pointers.size) gesture = null
    return
  }
  if (gesture.type === 'pending') tapAt(gesture)
  if (gesture.started && (gesture.type === 'move' || gesture.type === 'resize' || gesture.type === 'create')) {
    flushNotePatches()
    endEdit()
  }
  setPianoDragActive(0)
  stopPreview()
  rubber = null
  gesture = null
}

function tapAt (g) {
  const now = Date.now()
  if (g.hit) {
    const id = g.hit.note.id
    if (now - lastNoteTap.at < 360 && lastNoteTap.id === id) {
      beginEdit('Delete notes')
      deleteNotes(clip.value, [g.hit.note])
      endEdit()
      selectedIds.delete(id)
      lastNoteTap = { at: 0, id: 0 }
      return
    }
    lastNoteTap = { at: now, id }
    selectedIds.clear()
    selectedIds.add(id)
    return
  }
  lastNoteTap = { at: 0, id: 0 }
  if (selectedIds.size || tool.value === 'select') {
    selectedIds.clear()
    return
  }
  const gx = g.origin.x - layout.gridX
  const gy = g.origin.y - layout.gridY
  const grid = gridTicks()
  const pitch = snapPitch(yToPitch(gy, view))
  const raw = xToTick(gx, view, { snap: false })
  const startTick = grid > 0 ? Math.floor(raw / grid) * grid : raw
  const length = Math.max(grid || PPQ / 4, session.lastNoteDurationTicks || PPQ / 4)
  beginEdit('Create note')
  const note = createNote(clip.value, pitch, startTick / PPQ, length / PPQ, 100)
  endEdit()
  if (note) selectedIds.add(note.id)
  startPreview(pitch)
  setTimeout(stopPreview, 180)
}

function onWheel (e) {
  e.preventDefault()
  const p = local(e, rollCanvas)
  if (e.ctrlKey || e.metaKey) {
    zoomAt(view, { h: e.deltaY < 0 ? 1.12 : 0.9, v: 1, anchorX: p.x - layout.gridX, anchorY: p.y - layout.gridY })
  } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    view.scrollX += e.deltaX || e.deltaY
  } else {
    view.scrollY += e.deltaY
  }
  markDirty()
}

function startPreview (pitch, velocity = 0.8) {
  hoverPitch = pitch
  if (pitch === previewPitch) return
  stopPreview()
  previewPitch = pitch
  previewNoteOn(track.value, pitch, velocity)
}

function stopPreview () {
  if (previewPitch >= 0) previewNoteOff(track.value, previewPitch)
  previewPitch = -1
  hoverPitch = -1
  markDirty()
}

/* ---------- toolbar ---------- */

function cycleSnap () {
  const current = session.snap ? session.snapGridBeats : 0
  const index = SNAP_STEPS.findIndex((item) => Math.abs(item.beats - current) < 1e-6)
  setSnapGrid(SNAP_STEPS[(index + 1) % SNAP_STEPS.length].beats)
  markDirty()
}

function quantize () {
  const list = selectedCount.value ? notes.value.filter((note) => selectedIds.has(note.id)) : notes.value
  if (!list.length) return
  const grid = gridTicks() || PPQ / 4
  beginEdit('Quantize')
  const next = quantizeNotes(list, grid, { strength: 1, lengths: false })
  next.forEach((note, i) => {
    const live = (clip.value.notes || []).find((item) => item.id === list[i].id)
    if (live) setNote(clip.value, live, { startTick: note.startTick })
  })
  flushNotePatches()
  endEdit()
  markDirty()
}

function duplicateSelected () {
  const list = notes.value.filter((note) => selectedIds.has(note.id))
  if (!list.length) return
  beginEdit('Duplicate notes')
  const created = createNotes(clip.value, duplicateNotes(list))
  endEdit()
  selectedIds.clear()
  ;(created || []).forEach((note) => selectedIds.add(note.id))
  markDirty()
}

function deleteSelected () {
  const list = notes.value.filter((note) => selectedIds.has(note.id))
  if (!list.length) return
  beginEdit('Delete notes')
  deleteNotes(clip.value, list)
  endEdit()
  selectedIds.clear()
  markDirty()
}

function goBack () {
  flushNotePatches()
  setWorkspaceView('arrangement')
}

/* ---------- velocity / CC lane ---------- */

const LANE_PAD_TOP = 14
const LANE_PAD_BOTTOM = 10

function laneSize () {
  const parent = laneCanvas && laneCanvas.parentNode
  return { width: (parent && parent.clientWidth) || 1, height: (parent && parent.clientHeight) || 1 }
}

function valueToY (v, height) {
  return LANE_PAD_TOP + (1 - v / 127) * (height - LANE_PAD_TOP - LANE_PAD_BOTTOM)
}

function yToValue (y, height) {
  const t = 1 - (y - LANE_PAD_TOP) / Math.max(1, height - LANE_PAD_TOP - LANE_PAD_BOTTOM)
  return Math.round(Math.min(127, Math.max(0, t * 127)))
}

function beatToLaneX (beat) {
  return layout.gridX + beat * view.pixelsPerBeat - view.scrollX
}

function laneXToBeat (x) {
  return Math.max(0, (x - layout.gridX + view.scrollX) / view.pixelsPerBeat)
}

function currentLane () {
  return lanes.find((item) => item.id === lane.value) || lanes[0]
}

function paintLane () {
  if (!laneCanvas) return
  const { width, height } = laneSize()
  resizeCanvas(laneCanvas, width, height)
  const ctx = laneCanvas.getContext('2d')
  const gx = layout.gridX
  ctx.clearRect(0, 0, width, height)
  ctx.fillStyle = '#0e0f12'
  ctx.fillRect(0, 0, width, height)
  ctx.fillStyle = LITE_THEME.keyBg
  ctx.fillRect(0, 0, gx, height)
  ctx.font = '10px ' + LITE_THEME.font
  ctx.fillStyle = '#6f7178'
  ctx.textAlign = 'right'
  ctx.fillText('127', gx - 8, valueToY(127, height) + 4)
  ctx.fillText('0', gx - 8, valueToY(0, height) + 4)
  ctx.textAlign = 'left'
  ctx.save()
  ctx.beginPath()
  ctx.rect(gx, 0, width - gx, height)
  ctx.clip()
  ;[0.25, 0.5, 0.75].forEach((f) => {
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(gx, Math.round(valueToY(127 * f, height)), width - gx, 1)
  })
  const colour = (clip.value && clip.value.colour) || '#6aa8ff'
  const active = currentLane()
  if (active.id === 'velocity') paintVelocity(ctx, height, colour)
  else if (active.id === 'pedal') paintPedal(ctx, height, colour)
  else paintCurve(ctx, width, height, active.cc)
  ctx.restore()
  ctx.fillStyle = 'rgba(255,255,255,0.06)'
  ctx.fillRect(gx - 1, 0, 1, height)
}

function paintVelocity (ctx, height, colour) {
  const base = valueToY(0, height)
  notes.value.forEach((note) => {
    const x = beatToLaneX(note.startTick / PPQ)
    if (x < layout.gridX - 8 || x > layout.gridX + layout.gridW + 8) return
    const vel = midiVelocity(note.velocity)
    const y = valueToY(vel, height)
    const on = selectedIds.has(note.id)
    ctx.globalAlpha = note.muted ? 0.35 : 1
    ctx.fillStyle = on ? '#ffffff' : shade(colour, 1.05)
    ctx.fillRect(Math.round(x), y, 2, base - y)
    ctx.beginPath()
    ctx.arc(x + 1, y, on ? 4.5 : 3.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  })
}

function paintCurve (ctx, width, height, cc) {
  const points = clip.value ? (ensureExpression(clip.value)[laneKey(cc)] || []).slice().sort((a, b) => a.t - b.t) : []
  if (!points.length) return
  const accent = '#6aa8ff'
  const xs = points.map((p) => beatToLaneX(p.t))
  const ys = points.map((p) => valueToY(p.v, height))
  ctx.beginPath()
  ctx.moveTo(layout.gridX, ys[0])
  xs.forEach((x, i) => ctx.lineTo(x, ys[i]))
  ctx.lineTo(width, ys[ys.length - 1])
  ctx.lineTo(width, valueToY(0, height))
  ctx.lineTo(layout.gridX, valueToY(0, height))
  ctx.closePath()
  ctx.fillStyle = 'rgba(106,168,255,0.12)'
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(layout.gridX, ys[0])
  xs.forEach((x, i) => ctx.lineTo(x, ys[i]))
  ctx.lineTo(width, ys[ys.length - 1])
  ctx.strokeStyle = accent
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = accent
  let lastDot = -Infinity
  xs.forEach((x, i) => {
    if (x - lastDot < 18 && i !== xs.length - 1) return
    lastDot = x
    ctx.beginPath()
    ctx.arc(x, ys[i], 3, 0, Math.PI * 2)
    ctx.fill()
  })
}

function paintPedal (ctx, height, colour) {
  const blocks = clip.value ? sortSustain(ensureExpression(clip.value).cc64) : []
  const y = valueToY(127, height)
  const h = valueToY(0, height) - y
  blocks.forEach((block) => {
    const x0 = beatToLaneX(block.startTick / PPQ)
    const x1 = beatToLaneX(block.endTick / PPQ)
    ctx.fillStyle = shade(colour, 0.55)
    ctx.globalAlpha = 0.55
    ctx.fillRect(x0, y, Math.max(2, x1 - x0), h)
    ctx.globalAlpha = 1
    ctx.fillStyle = shade(colour, 1.1)
    ctx.fillRect(x0, y, Math.max(2, x1 - x0), 2)
  })
}

function snapSixteenth (beat) {
  return Math.max(0, Math.round((Number(beat) || 0) / SIXTEENTH) * SIXTEENTH)
}

function drawSixteenths (cc, fromBeat, toBeat, fromValue, toValue) {
  const a = snapSixteenth(fromBeat)
  const b = snapSixteenth(toBeat)
  const dir = b >= a ? 1 : -1
  const count = Math.round(Math.abs(b - a) / SIXTEENTH)
  for (let i = 0; i <= count; i++) {
    const t = a + dir * i * SIXTEENTH
    const u = count === 0 ? 1 : i / count
    paintClipExpression(clip.value, cc, t, fromValue + (toValue - fromValue) * u)
  }
}

function onLaneDown (e) {
  if (!clip.value) return
  capturePointer(laneCanvas, e.pointerId)
  const p = local(e, laneCanvas)
  if (p.x < layout.gridX) return
  const { height } = laneSize()
  const active = currentLane()
  const beat = laneXToBeat(p.x)
  const value = yToValue(p.y, height)
  markDirty()
  if (active.id === 'velocity') {
    beginEdit('Velocity')
    setPianoDragActive(clip.value.id)
    laneGesture = { type: 'velocity', lastX: p.x }
    paintVelocityAt(p.x, p.x, value)
    return
  }
  if (active.id === 'pedal') {
    const tick = beat * PPQ
    const blocks = sortSustain(ensureExpression(clip.value).cc64)
    const hit = hitSustainBlock(blocks, tick, PPQ / 8)
    const now = Date.now()
    if (hit && now - lastPedalTap.at < 360 && lastPedalTap.index === hit.index) {
      beginEdit('Delete pedal')
      deleteClipSustain(clip.value, hit.index)
      endEdit()
      lastPedalTap = { at: 0, index: -1 }
      return
    }
    if (!hit && now - lastPedalTap.at < 360) {
      const length = Math.max(PPQ / 4, session.lastNoteDurationTicks || PPQ)
      const start = Math.round(snapSixteenth(beat) * PPQ)
      beginEdit('Pedal')
      addClipSustain(clip.value, start, start + length)
      endEdit()
      lastPedalTap = { at: 0, index: -1 }
      return
    }
    lastPedalTap = { at: now, index: hit ? hit.index : -1 }
    if (!hit) return
    const block = blocks[hit.index]
    beginEdit('Pedal')
    laneGesture = {
      type: 'pedal',
      edge: hit.edge,
      originBeat: snapSixteenth(beat),
      startTick: block.startTick,
      endTick: block.endTick,
      liveStart: block.startTick,
      liveEnd: block.endTick,
      originX: p.x,
      dragged: false
    }
    return
  }
  const points = ensureExpression(clip.value)[laneKey(active.cc)] || []
  const index = hitLanePoint(points, beat, value, 14 / view.pixelsPerBeat, 12)
  const now = Date.now()
  if (index >= 0 && now - lastPointTap.at < 360 && lastPointTap.index === index) {
    beginEdit('Delete point')
    deleteClipExpressionPoint(clip.value, active.cc, index)
    endEdit()
    lastPointTap = { at: 0, index: -1 }
    return
  }
  if (index >= 0) {
    lastPointTap = { at: now, index }
    const point = points[index]
    beginEdit('Move point')
    laneGesture = {
      type: 'move-point',
      cc: active.cc,
      liveT: point.t,
      originBeat: point.t,
      originValue: point.v,
      grabBeat: beat,
      grabValue: value
    }
    setReadout(active.label, point.v)
    return
  }
  lastPointTap = { at: now, index: -1 }
  if (!laneDraw.value) return
  const snapped = snapSixteenth(beat)
  beginEdit('Draw ' + active.label)
  laneGesture = { type: 'curve', cc: active.cc, lastBeat: snapped, lastValue: value }
  drawSixteenths(active.cc, snapped, snapped, value, value)
  setReadout(active.label, value)
}

function onLaneMove (e) {
  if (!laneGesture || !clip.value) return
  const p = local(e, laneCanvas)
  const { height } = laneSize()
  const value = yToValue(p.y, height)
  markDirty()
  if (laneGesture.type === 'velocity') {
    paintVelocityAt(laneGesture.lastX, p.x, value)
    laneGesture.lastX = p.x
    return
  }
  if (laneGesture.type === 'pedal') {
    if (Math.abs(p.x - laneGesture.originX) > MOVE_SLOP) laneGesture.dragged = true
    const blocks = sortSustain(ensureExpression(clip.value).cc64)
    const index = blocks.findIndex((block) => block.startTick === laneGesture.liveStart && block.endTick === laneGesture.liveEnd)
    if (index < 0) return
    const beat = snapSixteenth(laneXToBeat(p.x))
    const delta = Math.round((beat - laneGesture.originBeat) * PPQ)
    let start = laneGesture.startTick
    let end = laneGesture.endTick
    if (laneGesture.edge === 'end') end = Math.max(start + PPQ / 4, laneGesture.endTick + delta)
    else if (laneGesture.edge === 'start') start = Math.max(0, Math.min(end - PPQ / 4, laneGesture.startTick + delta))
    else {
      const length = Math.max(PPQ / 4, laneGesture.endTick - laneGesture.startTick)
      start = Math.max(0, laneGesture.startTick + delta)
      end = start + length
    }
    moveClipSustain(clip.value, index, start, end)
    laneGesture.liveStart = start
    laneGesture.liveEnd = end
    return
  }
  if (laneGesture.type === 'move-point') {
    const beat = snapSixteenth(laneGesture.originBeat + (laneXToBeat(p.x) - laneGesture.grabBeat))
    const nextValue = Math.max(0, Math.min(127, laneGesture.originValue + (value - laneGesture.grabValue)))
    const points = ensureExpression(clip.value)[laneKey(laneGesture.cc)] || []
    const index = points.findIndex((point) => Math.abs(point.t - laneGesture.liveT) < 1e-4)
    const blocked = points.some((point, i) => i !== index && Math.abs(point.t - beat) < SIXTEENTH * 0.5)
    if (index >= 0 && !blocked) {
      moveClipExpressionPoint(clip.value, laneGesture.cc, index, beat, nextValue)
      laneGesture.liveT = beat
    }
    setReadout(currentLane().label, nextValue)
    return
  }
  const beat = snapSixteenth(laneXToBeat(p.x))
  drawSixteenths(laneGesture.cc, laneGesture.lastBeat, beat, laneGesture.lastValue, value)
  laneGesture.lastBeat = beat
  laneGesture.lastValue = value
  setReadout(currentLane().label, value)
}

function onLaneUp () {
  if (!laneGesture || !clip.value) {
    laneGesture = null
    return
  }
  const g = laneGesture
  laneGesture = null
  if (g.type === 'velocity') {
    flushNotePatches()
    setPianoDragActive(0)
    endEdit()
  } else if (g.type === 'pedal') {
    endEdit()
  } else {
    endEdit()
  }
  laneReadout.value = ''
  markDirty()
}

function paintVelocityAt (x0, x1, value) {
  const lo = Math.min(x0, x1) - 7
  const hi = Math.max(x0, x1) + 7
  const velocity = Math.max(1, value)
  const scope = selectedIds.size ? notes.value.filter((note) => selectedIds.has(note.id)) : notes.value
  let touched = 0
  scope.forEach((note) => {
    const x = beatToLaneX(note.startTick / PPQ)
    if (x < lo || x > hi) return
    const live = (clip.value.notes || []).find((item) => item.id === note.id)
    if (live) {
      setNote(clip.value, live, { velocity })
      touched++
    }
  })
  if (touched) setReadout('Velocity', velocity)
}

function setReadout (label, value) {
  laneReadout.value = label + ' ' + value
}

/* ---------- lifecycle ---------- */

watch(() => clip.value && clip.value.id, () => {
  selectedIds.clear()
  fitted = false
  nextTick(() => mount())
})
watch(lane, () => markDirty())
watch(() => [session.playing, session.looping, session.positionBeats, session.snap, session.snapGridBeats, session.scaleGuide, session.scaleKey, session.scaleName], () => markDirty())
watch(() => clip.value && clip.value.notes, () => markDirty(), { deep: true })
watch(() => clip.value && clip.value.expression, () => markDirty(), { deep: true })

function onKey (e) {
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault()
    deleteSelected()
  } else if (e.key === 'Escape') {
    goBack()
  }
}

onMounted(() => {
  mount()
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (raf) cancelAnimationFrame(raf)
  raf = 0
  stopPreview()
  flushNotePatches()
  unmount()
  window.removeEventListener('keydown', onKey)
})
</script>

<style scoped>
.lite-roll {
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  background: var(--lt-bg);
}
.bar {
  height: 56px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 0 4px;
  box-shadow: inset 0 -1px 0 var(--lt-line);
}
.back {
  height: 44px;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 10px 0 4px;
  color: var(--lt-accent);
  font-size: var(--lt-fs-m);
  border-radius: var(--lt-radius);
  cursor: pointer;
  flex-shrink: 0;
}
.back:active { background: var(--lt-s2); }
.clip-name {
  font-size: var(--lt-fs-m);
  font-weight: 600;
  color: var(--lt-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  flex-shrink: 1;
  min-width: 0;
}
.tools {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}
.tool {
  gap: 6px;
  min-width: 0;
}
.selection {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.selection.show { opacity: 1; pointer-events: auto; }
.count {
  font-size: var(--lt-fs-s);
  color: var(--lt-ink-2);
  margin-right: 6px;
  white-space: nowrap;
}
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--lt-ink-2);
  font-size: var(--lt-fs-m);
}
.roll-host {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
}
.lane-head {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 10px;
  box-shadow: inset 0 1px 0 var(--lt-line);
}
.lane-head .lt-seg-item { min-width: 0; height: 32px; }
.lane-head .pen {
  width: 36px;
  min-width: 36px;
  height: 32px;
  padding: 0;
  justify-content: center;
}
.lane-head .pen :deep(.icon) { width: 16px; height: 16px; }
.lane-hint {
  font-size: var(--lt-fs-s);
  color: var(--lt-ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lane-host {
  height: clamp(110px, 18vh, 170px);
  flex-shrink: 0;
  position: relative;
  overflow: hidden;
}
.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.key { min-width: 48px; }
.switch {
  width: 44px;
  height: 26px;
  border-radius: 13px;
  background: var(--lt-s3);
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}
.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.15s;
}
.switch.on { background: var(--lt-accent); }
.switch.on .knob { transform: translateX(18px); }
@media (max-width: 900px) {
  .tool text, .clip-name { display: none; }
}
</style>
