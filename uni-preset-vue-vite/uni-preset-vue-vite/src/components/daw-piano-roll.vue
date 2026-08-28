<template>
  <view class="roll" :class="{ phone: isPhone, pad: isTablet, lite: lite }" @click.stop>
    <view v-if="!embedded" class="head">
      <text>PIANO ROLL</text>
      <text class="sub">{{ clip ? clip.name : 'No clip selected' }}</text>
      <view class="spacer" />
      <view class="icon-btn" @click.stop="closeEditor" @tap.stop="closeEditor">×</view>
    </view>

    <view class="tools" :class="{ lite: lite }">
      <view v-if="!lite" class="chip" :class="{ on: tool === 'draw' }" @click="tool = 'draw'">Draw</view>
      <view v-if="!lite" class="chip" :class="{ on: tool === 'select' }" @click="tool = 'select'">Select</view>
      <view v-if="!lite" class="chip" :class="{ on: tool === 'erase' }" @click="tool = 'erase'">Erase</view>
      <view v-if="!lite" class="chip" :class="{ on: snapId !== 'off' }" @click="cycleSnap">Snap {{ snapLabel }}</view>
      <view v-if="!lite" class="chip" @click="quantizeSelected">Quantize</view>
      <view class="chip" @click="undoEdit">Undo</view>
      <view class="chip" @click="redoEdit">Redo</view>
      <view v-if="lite" class="chip" :class="{ on: scaleGuide }" @click="scaleGuide = !scaleGuide">Scale</view>
      <view v-if="lite" class="chip" @click="cycleScaleKey">{{ scaleKey }} {{ scaleName }}</view>
      <view class="spacer" />
      <view v-if="isPhone && !lite" class="chip" :class="{ on: keyboardOpen }" @click="keyboardOpen = !keyboardOpen">Keys</view>
      <view v-if="!lite" class="chip" :class="{ on: velocityOpen }" @click="velocityOpen = !velocityOpen">Vel</view>
      <view v-if="lite" class="chip" :class="{ on: session.expressionOpen }" @click="toggleExpression">Expression</view>
      <view v-if="!lite" class="more" @click.stop="showMore = !showMore">⋯</view>
    </view>

    <view v-if="lite && session.expressionOpen" class="expr-bar">
      <view
        v-for="ctrl in expressionControllers"
        :key="ctrl.id"
        class="chip"
        :class="{ on: session.expressionCc === ctrlCc(ctrl) }"
        @click="setExpressionOpen(true, ctrlCc(ctrl))"
      >{{ ctrl.displayName || ctrl.id }}</view>
    </view>

    <view v-if="showMore" class="more-row">
      <text>Key</text>
      <select class="sel" :value="scaleKey" @change="scaleKey = $event.target.value">
        <option v-for="key in keyNames" :key="key" :value="key">{{ key }}</option>
      </select>
      <text>Scale</text>
      <select class="sel" :value="scaleName" @change="scaleName = $event.target.value">
        <option v-for="name in scaleNames" :key="name" :value="name">{{ name }}</option>
      </select>
      <view class="chip" :class="{ on: scaleGuide }" @click="scaleGuide = !scaleGuide">Guide</view>
      <view class="chip" @click="groupSelected">Group</view>
      <view class="chip" @click="ungroupSelected">Ungroup</view>
      <text class="hint">{{ quantizeStrength }}%</text>
      <input class="range" type="range" min="0" max="100" :value="quantizeStrength" @input="quantizeStrength = Number($event.target.value)">
    </view>

    <view v-if="!lite && track" class="context">
      <text class="inst">{{ track.name }}</text>
      <text v-if="techniqueLabel">{{ techniqueLabel }}</text>
      <text v-if="legatoVisible" class="legato">Legato {{ track.legato ? 'ON' : 'off' }}</text>
    </view>

    <view v-if="!clip || !clip.midi" class="empty">
      <text>Select a MIDI clip to edit notes. Touching a key previews the instrument and does not create a note.</text>
    </view>

    <view v-else class="body">
      <view ref="host" class="canvas-host" />
      <view v-if="lite && selectedNotes.length" class="note-bar">
        <text class="note-lab">{{ pitchLabel }}</text>
        <text class="note-lab">Vel {{ velocityLabel }}</text>
        <input
          class="range"
          type="range"
          min="1"
          max="127"
          :value="selectedNotes[0] ? selectedNotes[0].velocity : 100"
          @input="patchVelocity"
        >
        <view class="chip" @click="openInspector">Advanced</view>
      </view>
      <view v-if="inspectorOpen && selectedNotes.length && (!lite || advancedOpen)" class="inspector" :class="{ advanced: advancedOpen }">
        <text class="i-title">Note</text>
        <view class="i-row"><text>Pitch</text><text>{{ pitchLabel }}</text></view>
        <view class="i-row"><text>Start</text><text>{{ startLabel }}</text></view>
        <view class="i-row"><text>Length</text><text>{{ lengthLabel }}</text></view>
        <view class="i-row"><text>Velocity</text><text>{{ velocityLabel }}</text></view>
        <view class="chip" @click="advancedOpen = !advancedOpen">{{ advancedOpen ? 'Less' : 'Advanced' }}</view>
        <view v-if="advancedOpen" class="adv">
          <view class="i-row"><text>Release</text><input class="num" type="number" min="1" max="127" :value="adv.releaseVelocity" @change="patchAdv('releaseVelocity', $event)"></view>
          <view class="i-row"><text>Pan</text><input class="num" type="number" min="0" max="127" :value="adv.pan" @change="patchAdv('pan', $event)"></view>
          <view class="i-row"><text>Fine</text><input class="num" type="number" min="-120" max="120" :value="adv.pitchOffset" @change="patchAdv('pitchOffset', $event)"></view>
          <view class="i-row"><text>Color</text><input class="num" type="number" min="0" max="15" :value="adv.color" @change="patchAdv('color', $event)"></view>
          <view class="i-row"><text>Group</text><input class="num" type="number" min="0" max="999" :value="adv.group" @change="patchAdv('group', $event)"></view>
          <view class="i-row"><text>Mute</text><view class="chip" :class="{ on: adv.muted }" @click="toggleMute">{{ adv.muted ? 'On' : 'Off' }}</view></view>
          <view class="i-row"><text>Slide</text><text>{{ slideLabel }}</text></view>
          <view class="i-row"><text>Porta</text><text>{{ portaLabel }}</text></view>
          <view class="i-row">
            <text>Repeat</text>
            <select class="sel" :value="adv.repeatMode" @change="patchAdv('repeatMode', $event)">
              <option v-for="mode in repeatModes" :key="mode.id" :value="mode.id">{{ mode.label }}</option>
            </select>
          </view>
          <view class="i-row"><text>Mod X</text><input class="num" type="number" min="0" max="127" :value="adv.modX" @change="patchAdv('modX', $event)"></view>
          <view class="i-row"><text>Mod Y</text><input class="num" type="number" min="0" max="127" :value="adv.modY" @change="patchAdv('modY', $event)"></view>
        </view>
      </view>
      <view v-if="menu" class="menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
        <view class="item" @click="openInspector">Edit</view>
        <view class="item" @click="duplicateSelected">Duplicate</view>
        <view class="item" @click="toggleMute">Mute</view>
        <view class="item" @click="deleteSelected">Delete</view>
        <view class="item" @click="cycleRepeat">Repeat</view>
        <view class="item" @click="advancedOpen = true; inspectorOpen = true; menu = null">Advanced</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import {
  session,
  getSelectedClip,
  getSelectedTrack,
  closeEditor,
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
  undoEdit,
  redoEdit,
  setPositionBeats,
  setLoopRange,
  updateMarker,
  isLite,
  setExpressionOpen,
  paintClipExpression,
  eraseClipExpression
} from '../store/session.js'
import {
  SNAP_PRESETS,
  KEY_NAMES,
  SCALE_NAMES,
  REPEAT_MODES,
  PPQ,
  pitchNameFull,
  defaultNote,
  cloneNote,
  duplicateNotes,
  quantizeNotes,
  serializeClipboard,
  parseClipboard,
  MIN_DURATION_TICKS,
  midiVelocity,
  normalizeNote,
  ticksToBeats,
  snapTick
} from '../model/note-model.js'
import {
  defaultView,
  clampZoom,
  clampScroll,
  zoomAt,
  xToTick,
  yToPitch,
  hitNote,
  notesInRect,
  defaultDurationTicks,
  gridTicksForView,
  fitViewToNotes,
  MIN_PX_PER_BEAT,
  MAX_PX_PER_BEAT,
  MIN_PX_PER_SEMITONE,
  MAX_PX_PER_SEMITONE
} from '../model/piano-roll-engine.js'
import { drawPianoRoll, resizeCanvas } from '../model/piano-roll-render.js'
import { interpolateBeats } from '../model/timeline.js'
import { ensureExpression, laneKey, mappedExpressionControllers } from '../model/expression-lane.js'

defineProps({
  embedded: { type: Boolean, default: false }
})

const host = ref(null)
const tool = ref('draw')
const snapId = ref('1/16')
const velocityOpen = ref(!isLite())
const keyboardOpen = ref(true)
const scaleGuide = ref(true)
const scaleKey = ref('C')
const scaleName = ref('major')
const showMore = ref(false)
const inspectorOpen = ref(false)
const advancedOpen = ref(false)
const quantizeStrength = ref(100)
const selectedIds = reactive(new Set())
const menu = ref(null)

const snapPresets = SNAP_PRESETS
const keyNames = KEY_NAMES
const scaleNames = SCALE_NAMES
const repeatModes = REPEAT_MODES

const clip = computed(() => getSelectedClip())
const track = computed(() => getSelectedTrack())
const notes = computed(() => ((clip.value && clip.value.notes) || []).map((note) => normalizeNote(note)))
const isPhone = computed(() => typeof window !== 'undefined' && window.innerWidth < 700)
const isTablet = computed(() => typeof window !== 'undefined' && window.innerWidth >= 700 && window.innerWidth < 1100)
const lite = computed(() => isLite())
const ghostNotes = computed(() => {
  const active = clip.value
  if (!active || !lite.value || active.virtual) return []
  const ids = session.selectedClipIds || []
  const ghosts = []
  session.clips.forEach((item) => {
    if (!item.midi || item.id === active.id) return
    if (!ids.includes(item.id)) return
    const shift = ((item.startBeat || 0) - (active.startBeat || 0)) * PPQ
    ;(item.notes || []).forEach((note) => {
      ghosts.push(normalizeNote({
        ...note,
        id: 'g-' + item.id + '-' + note.id,
        startTick: (note.startTick || 0) + shift
      }))
    })
  })
  return ghosts
})
const expressionPoints = computed(() => {
  if (!lite.value || !session.expressionOpen || !clip.value) return null
  const expr = ensureExpression(clip.value)
  return expr[laneKey(session.expressionCc)] || []
})
const expressionControllers = computed(() => {
  const def = (session.catalogue.instruments || []).find((item) => (
    track.value && (item.id === track.value.definitionId || item.id === track.value.instrumentId)
  ))
  const mapped = mappedExpressionControllers(def, session.catalogue.controllers)
  if (mapped.length) return mapped
  return [
    { id: 'dynamics', displayName: 'Dynamics', midiCC: 1 },
    { id: 'expression', displayName: 'Expression', midiCC: 11 }
  ]
})

function ctrlCc (ctrl) {
  return ctrl && (ctrl.midiCC != null ? ctrl.midiCC : ctrl.cc) === 11 ? 11 : 1
}

const techniqueLabel = computed(() => {
  const id = track.value && track.value.techniqueId
  if (!id) return ''
  const found = (session.catalogue.techniques || []).find((item) => item.id === id)
  return found ? found.displayName || found.name : id
})
const legatoVisible = computed(() => {
  const id = (track.value && track.value.techniqueId) || ''
  return /long/i.test(id)
})
const selectedNotes = computed(() => notes.value.filter((note) => selectedIds.has(note.id)))
const adv = computed(() => selectedNotes.value[0] || defaultNote())
const pitchLabel = computed(() => selectedNotes.value.length ? pitchNameFull(selectedNotes.value[0].pitch) : '–')
const startLabel = computed(() => selectedNotes.value.length ? ticksToBeats(selectedNotes.value[0].startTick).toFixed(3) : '–')
const lengthLabel = computed(() => selectedNotes.value.length ? ticksToBeats(selectedNotes.value[0].durationTick).toFixed(3) : '–')
const velocityLabel = computed(() => selectedNotes.value.length ? String(midiVelocity(selectedNotes.value[0].velocity)) : '–')
const lengthHint = computed(() => snapPresets.find((item) => item.id === snapId.value)?.label || '1/16')
const snapLabel = computed(() => snapPresets.find((item) => item.id === snapId.value)?.label || '1/16')
const slideLabel = computed(() => instrumentFlag('slide'))
const portaLabel = computed(() => instrumentFlag('porta'))

function instrumentFlag (name) {
  const caps = session.catalogue && session.catalogue.instruments
  const id = track.value && (track.value.definitionId || track.value.instrumentId)
  const found = (caps || []).find((item) => item.id === id || item.instrumentId === id)
  const supported = found && (found[name] || (found.capabilities && found.capabilities[name]))
  if (!supported) return 'Unsupported'
  return adv.value[name] ? 'On' : 'Off'
}

const view = defaultView()
view.snapId = '1/16'
let canvasEl = null
let layout = { gridX: 68, gridY: 40, gridW: 100, gridH: 100, velY: 0, velH: 56, keyW: 68 }
let raf = 0
let hoverPitch = -1
let previewPitch = -1
let rubber = null
let gesture = null
let clipboard = ''
let longPressTimer = 0
let lastTap = { at: 0, noteId: 0 }
const pointers = new Map()

function resolveHost () {
  let el = host.value
  if (!el) return null
  if (el.nodeType === 1) return el
  if (el.$el && el.$el.nodeType === 1) return el.$el
  return null
}

function mountCanvas (tries = 0) {
  if (canvasEl) return true
  const parent = resolveHost()
  if (!parent || typeof document === 'undefined') {
    if (tries < 30) requestAnimationFrame(() => mountCanvas(tries + 1))
    return false
  }
  const el = document.createElement('canvas')
  el.className = 'roll-canvas'
  el.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;position:absolute;inset:0;'
  parent.style.position = 'relative'
  parent.appendChild(el)
  canvasEl = el
  el.addEventListener('pointerdown', onPointerDown)
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerUp)
  el.addEventListener('pointercancel', onPointerUp)
  el.addEventListener('wheel', onWheel, { passive: false })
  el.addEventListener('contextmenu', (e) => e.preventDefault())
  startLoop()
  return true
}

function viewportSize () {
  const parent = canvasEl ? canvasEl.parentNode : resolveHost()
  if (!parent) return { width: 1, height: 1 }
  return {
    width: parent.clientWidth || 1,
    height: parent.clientHeight || 1
  }
}

function fitViewToClip () {
  const c = clip.value
  if (!c || !c.midi) return
  const { width, height } = viewportSize()
  view.keyboardWidth = isPhone.value ? (keyboardOpen.value ? 48 : 12) : (isTablet.value ? 60 : 68)
  view.velocityHeight = velocityOpen.value ? (isPhone.value ? 44 : 56) : 0
  const markerH = 16
  const timelineH = view.timelineHeight || 22
  const velH = view.velocityHeight || 0
  const gridW = Math.max(1, width - view.keyboardWidth)
  const gridH = Math.max(1, height - markerH - timelineH - velH)
  fitViewToNotes(view, notes.value, gridW, gridH, c.lengthBeats || 8)
}

function startLoop () {
  cancelAnimationFrame(raf)
  const frame = () => {
    paint()
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
}

function currentPlayhead () {
  return interpolateBeats(session.clockStamp || session, typeof performance !== 'undefined' ? performance.now() : Date.now(), session.bpm)
}

function paint () {
  if (!canvasEl) return
  const parent = canvasEl.parentNode
  const width = parent.clientWidth || 1
  const height = parent.clientHeight || 1
  view.snapId = snapId.value
  view.lastDurationTicks = session.lastNoteDurationTicks || PPQ
  view.keyboardWidth = isPhone.value ? (keyboardOpen.value ? 48 : 12) : (isTablet.value ? 60 : 68)
  view.velocityHeight = velocityOpen.value ? (isPhone.value ? 44 : 56) : 0
  clampZoom(view)
  const contentW = Math.max(width, ((clip.value && clip.value.lengthBeats) || 8) * view.pixelsPerBeat + 80)
  const gridY = 16 + (view.timelineHeight || 22)
  const velH = view.velocityHeight || 0
  const gridH = Math.max(1, height - gridY - velH)
  clampScroll(view, contentW, Math.max(1, width - view.keyboardWidth), gridH)
  const dpr = resizeCanvas(canvasEl, width, height)
  const ctx = canvasEl.getContext('2d')
  layout = drawPianoRoll(ctx, {
    width,
    height,
    dpr,
    view,
    notes: notes.value,
    ghostNotes: ghostNotes.value,
    selectedIds,
    clip: clip.value,
    timeSignatures: session.timeSignatures,
    timeSig: { numerator: session.timeSigNum, denominator: session.timeSigDen },
    markers: session.markers,
    loopStart: session.loopStart,
    loopEnd: session.loopEnd,
    playheadBeat: currentPlayhead(),
    clipStartBeat: clip.value ? clip.value.startBeat : 0,
    scaleKey: scaleKey.value,
    scaleName: scaleName.value,
    scaleGuide: scaleGuide.value,
    velocityOpen: velocityOpen.value,
    keyboardOpen: keyboardOpen.value,
    rubber,
    hoverPitch,
    expressionPoints: expressionPoints.value
  })
}

function localPoint (e) {
  const rect = canvasEl.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function gridPoint (p) {
  return { x: p.x - layout.gridX, y: p.y - layout.gridY }
}

function onPointerDown (e) {
  if (!clip.value) return
  canvasEl.setPointerCapture(e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  session.pianoRollFocus = true
  menu.value = null
  const p = localPoint(e)
  if (pointers.size === 2) {
    gesture = { type: 'pinch', start: pinchState() }
    return
  }
  if (p.y < layout.gridY) {
    const beat = (clip.value.startBeat || 0) + xToTick(p.x - layout.gridX, view, { snap: false }) / PPQ
    const loopStartX = layout.gridX + ((session.loopStart - (clip.value.startBeat || 0)) * view.pixelsPerBeat) - view.scrollX
    const loopEndX = layout.gridX + ((session.loopEnd - (clip.value.startBeat || 0)) * view.pixelsPerBeat) - view.scrollX
    const handle = e.pointerType === 'touch' ? 22 : 10
    if (Math.abs(p.x - loopStartX) <= handle) {
      gesture = { type: 'loop', which: 'start' }
      return
    }
    if (Math.abs(p.x - loopEndX) <= handle) {
      gesture = { type: 'loop', which: 'end' }
      return
    }
    const marker = (session.markers || []).find((item) => Math.abs((item.startBeat || 0) - beat) < 0.35)
    if (marker && e.detail > 1) {
      const name = typeof window !== 'undefined' ? window.prompt('Marker', marker.name) : marker.name
      if (name) updateMarker(marker, { name })
    } else {
      setPositionBeats(Math.max(0, beat))
    }
    return
  }
  if (p.x < layout.gridX) {
    const pitch = yToPitch(p.y - layout.gridY, view)
    startPreview(pitch)
    gesture = { type: 'preview' }
    return
  }
  if (layout.velH > 0 && p.y >= layout.velY) {
    if (lite.value && session.expressionOpen) {
      applyExpression(p, e.detail > 1)
      gesture = { type: 'expression', erase: e.detail > 1 }
      return
    }
    beginEdit('Velocity')
    setPianoDragActive(clip.value.id)
    gesture = { type: 'velocity', originY: p.y, originals: captureSelected() }
    if (!gesture.originals.length) {
      const hit = hitVelocity(p.x)
      if (hit) selectOnly(hit.id)
      gesture.originals = captureSelected()
    }
    return
  }
  const g = gridPoint(p)
  const edge = e.pointerType === 'touch' ? 22 : 8
  const hit = hitNote(notes.value, g.x, g.y, view, edge)
  const right = e.button === 2 || e.ctrlKey
  if (right && hit) {
    if (!selectedIds.has(hit.note.id)) selectOnly(hit.note.id)
    menu.value = { x: p.x, y: p.y }
    startLongPress(p, hit)
    return
  }
  if (e.pointerType === 'touch') startLongPress(p, hit)
  if (right && !hit) return
  if (tool.value === 'erase' || (lite.value && hit && e.detail > 1)) {
    if (hit) {
      beginEdit('Delete notes')
      deleteNotes(clip.value, [hit.note])
      endEdit()
    }
    return
  }
  if (!hit) {
    if (lite.value) {
      const pitch = yToPitch(g.y, view)
      const startTick = xToTick(g.x, view, { snap: true, free: e.ctrlKey || e.metaKey || e.altKey })
      gesture = {
        type: 'lite-empty',
        originX: p.x,
        originY: p.y,
        pitch,
        startTick,
        free: e.ctrlKey || e.metaKey || e.altKey,
        scrollX: view.scrollX,
        scrollY: view.scrollY
      }
      return
    }
    if (tool.value === 'select' || e.shiftKey) {
      rubber = { x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y }
      gesture = {
        type: 'rubber',
        additive: !!e.shiftKey,
        originIds: e.shiftKey ? new Set(selectedIds) : new Set()
      }
      if (!e.shiftKey) selectedIds.clear()
      return
    }
    beginEdit('Create note')
    const pitch = yToPitch(g.y, view)
    const startTick = xToTick(g.x, view, { snap: true, free: e.ctrlKey || e.metaKey || e.altKey })
    const note = createNote(clip.value, pitch, startTick / PPQ, defaultDurationTicks(view) / PPQ, 100)
    selectOnly(note.id)
    startPreview(pitch)
    gesture = {
      type: 'create',
      note,
      originX: p.x,
      startTick,
      free: e.ctrlKey || e.metaKey || e.altKey
    }
    setPianoDragActive(clip.value.id)
    return
  }
  if (!e.shiftKey && !selectedIds.has(hit.note.id)) {
    if (hit.note.group) selectGroup(hit.note.group)
    else selectOnly(hit.note.id)
  } else if (e.shiftKey) {
    if (selectedIds.has(hit.note.id)) selectedIds.delete(hit.note.id)
    else selectedIds.add(hit.note.id)
  }
  inspectorOpen.value = selectedIds.size === 1 && e.pointerType === 'mouse'
  beginEdit(hit.resize ? 'Resize notes' : 'Move notes')
  setPianoDragActive(clip.value.id)
  startPreview(hit.note.pitch, hit.note.velocity / 127)
  gesture = {
    type: hit.resize ? 'resize' : 'move',
    originX: p.x,
    originY: p.y,
    originals: captureSelected(),
    free: e.ctrlKey || e.metaKey || e.altKey
  }
}

function onPointerMove (e) {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  const p = canvasEl ? localPoint(e) : { x: 0, y: 0 }
  if (pointers.size === 2 && gesture && gesture.type === 'pinch') {
    applyPinch()
    return
  }
  if (!gesture) {
    if (p.x < layout.gridX) hoverPitch = yToPitch(p.y - layout.gridY, view)
    return
  }
  if (gesture.type === 'preview') {
    startPreview(yToPitch(p.y - layout.gridY, view))
    return
  }
  if (gesture.type === 'lite-empty') {
    const dx = p.x - gesture.originX
    const dy = p.y - gesture.originY
    if (Math.hypot(dx, dy) > 8) {
      gesture.cancelled = true
      gesture.panning = true
      clearTimeout(longPressTimer)
      view.scrollX = gesture.scrollX - dx
      view.scrollY = gesture.scrollY - dy
    }
    return
  }
  if (gesture.type === 'move' || gesture.type === 'resize' || gesture.type === 'create') {
    clearTimeout(longPressTimer)
  }
  if (gesture.type === 'expression') {
    applyExpression(p, gesture.erase)
    return
  }
  if (gesture.type === 'rubber') {
    rubber.w = p.x - rubber.ox
    rubber.h = p.y - rubber.oy
    rubber.x = rubber.w < 0 ? p.x : rubber.ox
    rubber.y = rubber.h < 0 ? p.y : rubber.oy
    rubber.w = Math.abs(rubber.w)
    rubber.h = Math.abs(rubber.h)
    selectedIds.clear()
    Array.from(gesture.originIds || []).forEach((id) => selectedIds.add(id))
    notesInRect(notes.value, { x: rubber.x - layout.gridX, y: rubber.y - layout.gridY, w: rubber.w, h: rubber.h }, view)
      .forEach((note) => selectedIds.add(note.id))
    return
  }
  if (gesture.type === 'loop') {
    const beat = Math.max(0, (clip.value.startBeat || 0) + xToTick(p.x - layout.gridX, view, { snap: false }) / PPQ)
    if (gesture.which === 'start') setLoopRange(Math.min(beat, session.loopEnd - 0.25), session.loopEnd)
    else setLoopRange(session.loopStart, Math.max(beat, session.loopStart + 0.25))
    return
  }
  if (gesture.type === 'create' && gesture.note) {
    const tick = xToTick(p.x - layout.gridX, view, { snap: true, free: gesture.free })
    const durationTick = Math.max(MIN_DURATION_TICKS, snapTick(tick, gridTicksForView(view), gesture.free) - gesture.startTick)
    setNote(clip.value, gesture.note, { durationTick })
    return
  }
  if (gesture.type === 'move' || gesture.type === 'resize') {
    const dTick = xToTick(p.x - layout.gridX, view, { snap: false }) - xToTick(gesture.originX - layout.gridX, view, { snap: false })
    const dPitch = yToPitch(p.y - layout.gridY, view) - yToPitch(gesture.originY - layout.gridY, view)
    gesture.originals.forEach((orig) => {
      const live = (clip.value.notes || []).find((item) => item.id === orig.id)
      if (!live) return
      if (gesture.type === 'resize') {
        const grid = gridTicksForView(view)
        const end = snapTick(orig.startTick + orig.durationTick + dTick, grid, gesture.free)
        setNote(clip.value, live, {
          durationTick: Math.max(MIN_DURATION_TICKS, end - orig.startTick),
          startTick: orig.startTick
        })
      } else {
        setNote(clip.value, live, {
          startTick: snapTick(orig.startTick + dTick, gridTicksForView(view), gesture.free),
          pitch: orig.pitch + dPitch
        })
        startPreview(live.pitch, live.velocity / 127)
      }
    })
    return
  }
  if (gesture.type === 'velocity') {
    const delta = Math.round((gesture.originY - p.y) / 2)
    gesture.originals.forEach((orig) => {
      const note = notes.value.find((item) => item.id === orig.id)
      if (note) setNote(clip.value, note, { velocity: orig.velocity + delta })
    })
  }
}

function onPointerUp (e) {
  pointers.delete(e.pointerId)
  clearTimeout(longPressTimer)
  const p = canvasEl ? localPoint(e) : { x: 0, y: 0 }
  if (gesture && gesture.type === 'lite-empty' && !gesture.cancelled && clip.value) {
    beginEdit('Create note')
    const note = createNote(clip.value, gesture.pitch, gesture.startTick / PPQ, (view.lastDurationTicks || PPQ) / PPQ, 100)
    selectOnly(note.id)
    endEdit()
  }
  if (gesture && gesture.type === 'move' && lite.value && gesture.originals && gesture.originals.length === 1) {
    const moved = Math.hypot(p.x - (gesture.originX || p.x), p.y - (gesture.originY || p.y))
    const id = gesture.originals[0].id
    if (moved < 6 && Date.now() - lastTap.at < 340 && lastTap.noteId === id) {
      const note = notes.value.find((item) => item.id === id)
      if (note) {
        beginEdit('Delete notes')
        deleteNotes(clip.value, [note])
        selectedIds.clear()
        endEdit()
      }
      lastTap = { at: 0, noteId: 0 }
    } else {
      lastTap = { at: Date.now(), noteId: id }
    }
  }
  if (gesture && (gesture.type === 'move' || gesture.type === 'resize' || gesture.type === 'create' || gesture.type === 'velocity')) {
    flushNotePatches()
    endEdit()
  }
  setPianoDragActive(0)
  stopPreview()
  rubber = null
  gesture = null
}

function pinchState () {
  const pts = Array.from(pointers.values())
  if (pts.length < 2) return null
  const dx = pts[1].x - pts[0].x
  const dy = pts[1].y - pts[0].y
  return { dist: Math.hypot(dx, dy), cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2, ppb: view.pixelsPerBeat, pps: view.pixelsPerSemitone }
}

function applyPinch () {
  const now = pinchState()
  if (!now || !gesture.start || !gesture.start.dist) return
  const start = gesture.start
  const scale = now.dist / start.dist
  const moved = Math.hypot(now.cx - start.cx, now.cy - start.cy)
  if (Math.abs(scale - 1) < 0.08 && moved > 8) {
    const lastX = gesture.lastCx != null ? gesture.lastCx : start.cx
    const lastY = gesture.lastCy != null ? gesture.lastCy : start.cy
    view.scrollX -= now.cx - lastX
    view.scrollY -= now.cy - lastY
    gesture.lastCx = now.cx
    gesture.lastCy = now.cy
    return
  }
  const rect = canvasEl.getBoundingClientRect()
  zoomAt(view, { h: scale, v: scale, anchorX: now.cx - rect.left - layout.gridX, anchorY: now.cy - rect.top - layout.gridY })
  view.pixelsPerBeat = Math.min(MAX_PX_PER_BEAT, Math.max(MIN_PX_PER_BEAT, start.ppb * scale))
  view.pixelsPerSemitone = Math.min(MAX_PX_PER_SEMITONE, Math.max(MIN_PX_PER_SEMITONE, start.pps * scale))
}

function onWheel (e) {
  e.preventDefault()
  const p = localPoint(e)
  if (e.ctrlKey || e.metaKey) {
    zoomAt(view, { h: e.deltaY < 0 ? 1.12 : 0.9, v: 1, anchorX: p.x - layout.gridX, anchorY: p.y - layout.gridY })
    return
  }
  if (e.shiftKey) {
    view.pixelsPerSemitone += e.deltaY < 0 ? 1 : -1
    clampZoom(view)
    return
  }
  if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) view.scrollX += e.deltaX
  else view.scrollY += e.deltaY
}

function cycleSnap () {
  const index = Math.max(0, snapPresets.findIndex((item) => item.id === snapId.value))
  snapId.value = snapPresets[(index + 1) % snapPresets.length].id
}

function cycleScaleKey () {
  const ki = Math.max(0, keyNames.indexOf(scaleKey.value))
  if (ki === keyNames.length - 1) {
    scaleKey.value = keyNames[0]
    const si = Math.max(0, scaleNames.indexOf(scaleName.value))
    scaleName.value = scaleNames[(si + 1) % scaleNames.length]
  } else {
    scaleKey.value = keyNames[ki + 1]
  }
}

function hitVelocity (x) {
  const g = x - layout.gridX
  const pad = 12
  return notes.value.find((note) => {
    const nx = (note.startTick / PPQ) * view.pixelsPerBeat - view.scrollX
    return g >= nx - pad && g <= nx + pad + 8
  })
}

function captureSelected () {
  return selectedNotes.value.map((note) => ({
    id: note.id,
    startTick: note.startTick,
    durationTick: note.durationTick,
    pitch: note.pitch,
    velocity: midiVelocity(note.velocity)
  }))
}

function selectOnly (id) {
  selectedIds.clear()
  if (id) selectedIds.add(id)
}

function selectGroup (group) {
  selectedIds.clear()
  notes.value.forEach((note) => {
    if (note.group === group) selectedIds.add(note.id)
  })
}

function startPreview (pitch, velocity = 0.85) {
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
}

function startLongPress (p, hit) {
  clearTimeout(longPressTimer)
  longPressTimer = setTimeout(() => {
    if (lite.value && !hit) {
      rubber = { x: p.x, y: p.y, w: 0, h: 0, ox: p.x, oy: p.y }
      gesture = { type: 'rubber', additive: false, originIds: new Set() }
      selectedIds.clear()
      return
    }
    menu.value = { x: p.x, y: p.y }
  }, 320)
}

function toggleExpression () {
  const next = !session.expressionOpen
  setExpressionOpen(next)
  velocityOpen.value = next
}

function applyExpression (p, erase) {
  if (!clip.value) return
  const t = Math.max(0, xToTick(p.x - layout.gridX, view, { snap: false }) / PPQ)
  const v = 127 * (1 - Math.min(1, Math.max(0, (p.y - layout.velY) / Math.max(1, layout.velH))))
  if (erase) eraseClipExpression(clip.value, session.expressionCc, t)
  else paintClipExpression(clip.value, session.expressionCc, t, v)
}

function deleteSelected () {
  if (!selectedNotes.value.length) return
  beginEdit('Delete notes')
  deleteNotes(clip.value, selectedNotes.value)
  selectedIds.clear()
  endEdit()
  menu.value = null
}

function duplicateSelected () {
  if (!selectedNotes.value.length) return
  beginEdit('Duplicate notes')
  const copies = duplicateNotes(selectedNotes.value)
  const created = createNotes(clip.value, copies)
  selectedIds.clear()
  created.forEach((note) => selectedIds.add(note.id))
  endEdit()
  menu.value = null
}

function quantizeSelected () {
  const list = selectedNotes.value.length ? selectedNotes.value : notes.value
  if (!list.length) return
  beginEdit('Quantize')
  const grid = SNAP_PRESETS.find((item) => item.id === snapId.value)?.ticks || PPQ / 4
  const next = quantizeNotes(list, grid, { strength: quantizeStrength.value / 100, lengths: false })
  next.forEach((note, i) => setNote(clip.value, list[i], { startTick: note.startTick }))
  flushNotePatches()
  endEdit()
}

function toggleMute () {
  const on = !selectedNotes.value.every((note) => note.muted)
  beginEdit('Mute notes')
  selectedNotes.value.forEach((note) => setNote(clip.value, note, { muted: on }))
  flushNotePatches()
  endEdit()
  menu.value = null
}

function groupSelected () {
  if (selectedNotes.value.length < 2) return
  const group = Math.max(0, ...notes.value.map((note) => note.group || 0)) + 1
  beginEdit('Group notes')
  selectedNotes.value.forEach((note) => setNote(clip.value, note, { group }))
  flushNotePatches()
  endEdit()
}

function ungroupSelected () {
  beginEdit('Ungroup notes')
  selectedNotes.value.forEach((note) => setNote(clip.value, note, { group: 0 }))
  flushNotePatches()
  endEdit()
}

function cycleRepeat () {
  const next = ((adv.value.repeatMode || 0) + 1) % REPEAT_MODES.length
  beginEdit('Repeat')
  selectedNotes.value.forEach((note) => setNote(clip.value, note, { repeatMode: next }))
  flushNotePatches()
  endEdit()
  menu.value = null
}

function patchAdv (key, event) {
  const value = event.target.type === 'number' || key === 'repeatMode' ? Number(event.target.value) : event.target.value
  beginEdit('Note details')
  selectedNotes.value.forEach((note) => setNote(clip.value, note, { [key]: value }))
  flushNotePatches()
  endEdit()
}

function openInspector () {
  inspectorOpen.value = true
  if (lite.value) advancedOpen.value = true
  menu.value = null
}

function patchVelocity (event) {
  patchAdv('velocity', event)
}

function copySelected () {
  clipboard = serializeClipboard(selectedNotes.value)
  if (typeof navigator !== 'undefined' && navigator.clipboard && clipboard) navigator.clipboard.writeText(clipboard).catch(() => {})
}

function pasteClipboard (text) {
  const list = parseClipboard(text || clipboard)
  if (!list.length) return
  beginEdit('Paste notes')
  const created = createNotes(clip.value, list.map((note) => cloneNote(note, { id: 0 })))
  selectedIds.clear()
  created.forEach((note) => selectedIds.add(note.id))
  endEdit()
}

function onKey (e) {
  if (!session.pianoRollFocus && session.editorTab !== 'piano') return
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (e.code === 'Delete' || e.code === 'Backspace') {
    e.preventDefault()
    e.stopPropagation()
    deleteSelected()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault()
    e.stopPropagation()
    duplicateSelected()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    copySelected()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault()
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.readText().then(pasteClipboard).catch(() => pasteClipboard())
    } else pasteClipboard()
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault()
    notes.value.forEach((note) => selectedIds.add(note.id))
  } else if (e.key === '1') tool.value = 'draw'
  else if (e.key === '2') tool.value = 'select'
  else if (e.key === '3') tool.value = 'erase'
  else if (e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey) quantizeSelected()
}

watch(clip, (c, prev) => {
  selectedIds.clear()
  inspectorOpen.value = false
  if (!c || !c.midi) return
  nextTick(() => {
    mountCanvas()
    if (!prev || prev.id !== c.id) fitViewToClip()
  })
})

watch(() => (notes.value || []).length, (len, prevLen) => {
  if (len > 0 && !prevLen && clip.value) fitViewToClip()
})

watch([scaleKey, scaleName], () => {
  if (!session.score) return
  session.score.key = scaleKey.value
  session.score.scale = scaleName.value
})

watch(isPhone, (phone) => {
  if (phone && !session.expressionOpen) {
    velocityOpen.value = false
    keyboardOpen.value = false
  }
})

watch(() => session.expressionOpen, (open) => {
  if (lite.value) velocityOpen.value = !!open
})

onMounted(() => {
  nextTick(() => {
    if (mountCanvas() && clip.value && clip.value.midi) fitViewToClip()
  })
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKey, true)
  session.pianoRollFocus = true
  if (session.score) {
    if (session.score.key) scaleKey.value = session.score.key
    if (session.score.scale) scaleName.value = session.score.scale
  }
})

onUnmounted(() => {
  session.pianoRollFocus = false
  cancelAnimationFrame(raf)
  stopPreview()
  flushNotePatches()
  if (typeof window !== 'undefined') window.removeEventListener('keydown', onKey, true)
  if (canvasEl) {
    canvasEl.removeEventListener('pointerdown', onPointerDown)
    canvasEl.removeEventListener('pointermove', onPointerMove)
    canvasEl.removeEventListener('pointerup', onPointerUp)
    canvasEl.removeEventListener('wheel', onWheel)
    if (canvasEl.parentNode) canvasEl.parentNode.removeChild(canvasEl)
  }
  canvasEl = null
})
</script>

<style scoped>
.roll {
  height: 100%;
  min-height: 0;
  background: #141414;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tools, .more-row, .context, .head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  color: #8d8d8d;
  font-size: 11px;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.tools { height: 28px; }
.tools.lite { height: 44px; overflow-x: auto; }
.expr-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.note-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #161616;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
}
.note-lab { color: #e6e6e6; font-size: 12px; min-width: 52px; }
.tools.lite .chip, .expr-bar .chip, .note-bar .chip {
  min-height: 40px;
  display: flex;
  align-items: center;
}
.more-row { height: 28px; }
.context { height: 22px; color: #b0b0b0; }
.head { height: 26px; font-weight: 700; font-size: 10px; }
.sub { font-weight: 400; color: #b0b0b0; }
.inst { color: #e6e6e6; font-weight: 700; }
.legato { color: #8d8d8d; }
.chip {
  padding: 3px 7px;
  background: #2b2b2b;
  border-radius: 3px;
  cursor: pointer;
  min-height: 22px;
}
.chip.on { color: #e8e8e8; background: rgba(77,163,255,0.2); }
.chip.dim { opacity: 0.45; }
.sep { margin-left: 6px; }
.spacer { flex: 1; }
.more, .icon-btn { cursor: pointer; padding: 0 6px; }
.empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6a6a6a;
  padding: 16px;
  text-align: center;
}
.body { flex: 1; min-height: 0; position: relative; display: flex; flex-direction: column; }
.canvas-host { flex: 1; min-height: 0; position: relative; }
.sel, .num, .range {
  background: #1c1c1c;
  color: #e6e6e6;
  border: 1px solid #2a2a2a;
  border-radius: 3px;
}
.sel { height: 22px; }
.num { width: 54px; height: 22px; }
.range { width: 90px; }
.hint { color: #6a6a6a; }
.inspector {
  position: absolute;
  right: 10px;
  top: 10px;
  width: 168px;
  background: #161616;
  border: 1px solid #2a2a2a;
  padding: 8px;
  color: #b0b0b0;
  font-size: 11px;
  z-index: 3;
}
.i-title { color: #e6e6e6; font-weight: 700; display: block; margin-bottom: 6px; }
.i-row { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; gap: 8px; }
.menu {
  position: absolute;
  z-index: 4;
  background: #1a1a1a;
  border: 1px solid #2a2a2a;
  min-width: 120px;
}
.item { padding: 8px 12px; cursor: pointer; color: #d0d0d0; min-height: 36px; }
.item:hover { background: #232323; }
.phone .tools { overflow-x: auto; }
@media (max-width: 700px) {
  .inspector { width: 148px; }
  .chip { min-height: 40px; display: flex; align-items: center; }
}
</style>
