<template>
  <view ref="root" class="orch" :class="{ stacked }">
    <view class="head">
      <view class="title-block">
        <text class="title">{{ title }}</text>
        <text class="status" :class="statusTone">{{ status }}</text>
      </view>
      <view v-if="libraries.length > 1" class="seg libs">
        <view
          v-for="lib in libraries"
          :key="lib.id"
          class="seg-item"
          :class="{ on: lib.id === libraryId }"
          @click="$emit('library', lib.id)"
        >{{ lib.label }}</view>
      </view>
      <view v-if="showChange" class="change" title="Change instrument" @click="$emit('change')">
        <daw-icon name="swap" :size="18" color="currentColor" />
      </view>
    </view>

    <view class="body">
      <view class="browse">
        <view class="families">
          <view
            v-for="family in families"
            :key="family.id"
            class="family"
            :class="{ on: family.id === familyId, empty: !hasFamily(family.id) }"
            @click="$emit('family', family.id)"
          >
            <daw-icon :name="family.icon" :size="18" color="currentColor" />
            <text>{{ family.label }}</text>
          </view>
        </view>
        <view class="list">
          <view
            v-for="item in familyInstruments"
            :key="item.id"
            class="inst"
            :class="{ on: item.id === selectedId, off: !item.available }"
            @click="item.available && $emit('select', item.id)"
          >
            <text class="inst-name">{{ item.name }}</text>
            <daw-icon v-if="item.id === selectedId" name="check" :size="16" color="currentColor" />
            <text v-else-if="!item.available" class="inst-miss">No samples</text>
          </view>
          <text v-if="!familyInstruments.length" class="none">Nothing in this family yet.</text>
        </view>
      </view>

      <view class="play">
        <text class="cap">Technique</text>
        <view class="techs">
          <view
            v-for="tech in techniques"
            :key="tech.id"
            class="tech"
            :class="{ on: tech.id === techniqueId, off: tech.available === false }"
            @click="tech.available !== false && $emit('technique', tech.id)"
          >{{ tech.displayName }}</view>
          <text v-if="!techniques.length" class="none">Pick an instrument first.</text>
        </view>

        <view v-for="ctrl in sliders" :key="ctrl.id" class="slider-block">
          <view class="slider-head">
            <text class="cap">{{ ctrl.label }}</text>
            <text class="value">{{ Math.round(ctrl.value * 100) }}</text>
          </view>
          <view
            class="slider"
            :data-slider="ctrl.id"
            @pointerdown.stop.prevent="onSlider(ctrl.id, $event)"
          >
            <view class="slider-fill" :style="{ width: (ctrl.value * 100) + '%' }" />
            <view class="slider-thumb" :style="{ left: 'calc(' + (ctrl.value * 100) + '% - 3px)' }" />
          </view>
        </view>
      </view>
    </view>

    <view v-if="keyboard" class="keys-wrap">
      <view class="keys-label">
        <text class="cap">Keyboard</text>
        <text class="range">{{ rangeLabel }}</text>
      </view>
      <view class="keys" data-keys @pointerdown.stop.prevent="onKeys" @pointerup="silence" @pointercancel="silence" @lostpointercapture="silence">
        <view class="bed" data-bed :style="{ width: model.width + 'px' }">
          <view
            v-for="key in model.whites"
            :key="'w' + key.pitch"
            class="key"
            :class="{ on: sounding === key.pitch, out: !key.playable }"
            :style="{ left: key.left + 'px', width: key.width + 'px' }"
          />
          <view
            v-for="key in model.blacks"
            :key="'b' + key.pitch"
            class="key black"
            :class="{ on: sounding === key.pitch, out: !key.playable }"
            :style="{ left: key.left + 'px', width: key.width + 'px' }"
          />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import DawIcon from './daw-icon.vue'
import { beginPointerDrag, pointerCoord, trackRatio } from '../lib/pointer-drag.js'

const props = defineProps({
  title: { type: String, default: '' },
  status: { type: String, default: '' },
  statusTone: { type: String, default: '' },
  families: { type: Array, default: () => [] },
  familyId: { type: String, default: '' },
  instruments: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  libraries: { type: Array, default: () => [] },
  libraryId: { type: String, default: '' },
  techniques: { type: Array, default: () => [] },
  techniqueId: { type: String, default: '' },
  dynamics: { type: Number, default: 0.8 },
  expression: { type: Number, default: 0.8 },
  showChange: { type: Boolean, default: true },
  stacked: { type: Boolean, default: false },
  keyboard: { type: Boolean, default: false },
  keyLow: { type: Number, default: 21 },
  keyHigh: { type: Number, default: 108 }
})
const emit = defineEmits(['family', 'library', 'select', 'technique', 'controller', 'change', 'note-on', 'note-off'])

const WHITE = 36
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const root = ref(null)
const sounding = ref(-1)
const familyInstruments = computed(() => props.instruments.filter((item) => item.family === props.familyId))
const sliders = computed(() => [
  { id: 'dynamics', label: 'Dynamics', value: clamp01(props.dynamics) },
  { id: 'expression', label: 'Expression', value: clamp01(props.expression) }
])

function clamp01 (v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

function hasFamily (id) {
  return props.instruments.some((item) => item.family === id)
}

function noteName (pitch) {
  const pc = ((pitch % 12) + 12) % 12
  return NOTE_NAMES[pc] + (Math.floor(pitch / 12) - 1)
}

const model = computed(() => {
  const playLo = clamp01Key(props.keyLow)
  const playHi = Math.max(playLo, clamp01Key(props.keyHigh))
  const from = whiteFloor(moveWhites(playLo, -5))
  const to = Math.max(from, moveWhites(playHi, 5))
  const whites = []
  const blacks = []
  let count = 0
  for (let pitch = from; pitch <= to; pitch++) {
    const playable = pitch >= playLo && pitch <= playHi
    const black = isBlackPitch(pitch)
    if (black) {
      const width = Math.round(WHITE * 0.58)
      blacks.push({ pitch, playable, left: count * WHITE - Math.round(width / 2), width })
    } else {
      whites.push({ pitch, playable, left: count * WHITE + 1, width: WHITE - 2 })
      count += 1
    }
  }
  return { whites, blacks, width: Math.max(WHITE, count * WHITE), playLo, playHi }
})

const rangeLabel = computed(() => noteName(model.value.playLo) + ' – ' + noteName(model.value.playHi))

function clamp01Key (value) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) ? Math.min(127, Math.max(0, n)) : 60
}

function isBlackPitch (pitch) {
  return pitch % 12 === 1 || pitch % 12 === 3 || pitch % 12 === 6 || pitch % 12 === 8 || pitch % 12 === 10
}

function whiteFloor (pitch) {
  let n = pitch
  while (n > 0 && isBlackPitch(n)) n -= 1
  return n
}

function moveWhites (pitch, count) {
  let n = pitch
  let left = Math.abs(count)
  const dir = count < 0 ? -1 : 1
  while (left > 0) {
    const next = n + dir
    if (next < 0 || next > 127) break
    n = next
    if (!isBlackPitch(n)) left -= 1
  }
  return n
}

function keysEl () {
  const r = root.value
  const el = r && (r.nodeType === 1 ? r : r.$el)
  return el && el.querySelector ? el.querySelector('[data-keys]') : null
}

function pitchAt (x, y) {
  const el = keysEl()
  if (!el || typeof el.getBoundingClientRect !== 'function') return -1
  const rect = el.getBoundingClientRect()
  if (y < rect.top || y > rect.bottom || x < rect.left || x > rect.right) return -1
  const localX = x - rect.left + (el.scrollLeft || 0)
  const localY = y - rect.top
  if (localY < rect.height * 0.58) {
    const black = model.value.blacks.find((key) => localX >= key.left && localX <= key.left + key.width)
    if (black) return black.pitch
  }
  const white = model.value.whites[Math.floor(localX / WHITE)]
  return white ? white.pitch : -1
}

function playable (pitch) {
  return pitch >= model.value.playLo && pitch <= model.value.playHi
}

function sound (pitch) {
  if (pitch === sounding.value) return
  if (sounding.value >= 0) emit('note-off', sounding.value)
  sounding.value = pitch
  if (pitch >= 0) emit('note-on', pitch)
}

function silence () {
  if (sounding.value >= 0) emit('note-off', sounding.value)
  sounding.value = -1
}

function onKeys (event) {
  const el = keysEl()
  let mode = 'play'
  let origin = pointerCoord(event)
  const startScroll = el ? el.scrollLeft || 0 : 0
  const step = (ev) => {
    const at = pointerCoord(ev)
    if (!at) return
    if (!origin) origin = at
    const dx = at.x - origin.x
    const dy = at.y - origin.y
    if (mode === 'play' && Math.abs(dx) > 16 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      mode = 'scroll'
      silence()
    }
    if (mode === 'scroll') {
      if (el) el.scrollLeft = Math.max(0, startScroll - dx)
      return
    }
    const pitch = pitchAt(at.x, at.y)
    if (!playable(pitch)) {
      silence()
      return
    }
    sound(pitch)
  }
  step(event)
  beginPointerDrag(event, {
    onMove: step,
    onEnd: (ev) => {
      if (mode === 'play' && sounding.value < 0) {
        step(ev)
        setTimeout(silence, 140)
        return
      }
      silence()
    }
  })
}

function revealRange () {
  const el = keysEl()
  if (!el || !props.keyboard) return
  const playableKeys = model.value.whites.filter((key) => key.playable)
  const first = playableKeys[0]
  const last = playableKeys[playableKeys.length - 1]
  if (!first || !last) return
  const span = last.left + last.width - first.left
  const view = el.clientWidth || 0
  const pad = 36 * 4
  const target = span + pad * 2 < view
    ? first.left - pad - (view - span - pad * 2) / 2
    : first.left - pad
  el.scrollLeft = Math.max(0, target)
}

watch(() => [props.keyLow, props.keyHigh, props.keyboard], () => nextTick(silence))
watch(() => [props.keyLow, props.keyHigh, props.keyboard], () => nextTick(revealRange))

/* A finger that leaves with the tab (app switch, notification shade) never sends
 * pointerup; the key must still stop sounding. */
function onHidden () {
  if (typeof document !== 'undefined' && document.hidden) silence()
}
onMounted(() => {
  nextTick(revealRange)
  setTimeout(revealRange, 80)
  if (typeof window !== 'undefined') {
    window.addEventListener('blur', silence)
    document.addEventListener('visibilitychange', onHidden)
  }
})
onUnmounted(() => {
  silence()
  if (typeof window !== 'undefined') {
    window.removeEventListener('blur', silence)
    document.removeEventListener('visibilitychange', onHidden)
  }
})

function sliderEl (id) {
  const r = root.value
  const el = r && (r.nodeType === 1 ? r : r.$el)
  return el && el.querySelector ? el.querySelector('[data-slider="' + id + '"]') : null
}

function onSlider (id, event) {
  const el = sliderEl(id)
  const apply = (ev) => {
    const ratio = trackRatio(ev, el, 'horizontal')
    if (ratio != null) emit('controller', id, Math.round(ratio * 100) / 100)
  }
  apply(event)
  beginPointerDrag(event, { onMove: apply, onEnd: apply })
}
</script>

<style scoped>
.orch {
  --o-bg: var(--lt-bg, #0b0c0e);
  --o-s1: var(--lt-s1, #131418);
  --o-s2: var(--lt-s2, #1a1c21);
  --o-s3: var(--lt-s3, #23262c);
  --o-line: var(--lt-line, rgba(255, 255, 255, 0.06));
  --o-ink: var(--lt-ink, #ececee);
  --o-ink-2: var(--lt-ink-2, #8b8e96);
  --o-accent: var(--lt-accent, #6aa8ff);
  --o-accent-soft: var(--lt-accent-soft, rgba(106, 168, 255, 0.16));
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--o-bg);
  color: var(--o-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}
.head {
  min-height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  box-shadow: inset 0 -1px 0 var(--o-line);
}
.title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status { font-size: 12px; color: var(--o-ink-2); }
.status.ok { color: #4cc38a; }
.status.err { color: #ff6b5e; }
.seg {
  display: flex;
  padding: 3px;
  gap: 2px;
  border-radius: 10px;
  background: var(--o-s2);
  flex-shrink: 0;
}
.seg-item {
  height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  font-size: 13px;
  color: var(--o-ink-2);
  cursor: pointer;
  white-space: nowrap;
}
.seg-item.on { background: var(--o-s3); color: var(--o-ink); }
.change {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--o-ink-2);
  cursor: pointer;
  flex-shrink: 0;
}
.change:active { background: var(--o-s2); }
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.browse {
  flex: 1 1 56%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow: inset -1px 0 0 var(--o-line);
}
.families {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 12px 16px;
}
.family {
  height: 40px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 20px;
  background: var(--o-s2);
  color: var(--o-ink-2);
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.family .icon { width: auto; height: auto; }
.family.on { background: var(--o-accent-soft); color: var(--o-accent); }
.family.empty { opacity: 0.35; }
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  align-content: start;
  gap: 6px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
.inst {
  height: 52px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--o-s2);
  cursor: pointer;
}
.inst:active { background: var(--o-s3); }
.inst.on { background: var(--o-accent-soft); color: var(--o-accent); }
.inst.off { opacity: 0.4; cursor: default; }
.inst .icon { width: auto; height: auto; }
.inst-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inst-miss { font-size: 11px; color: var(--o-ink-2); }
.none { font-size: 13px; color: var(--o-ink-2); padding: 8px 0; }
.play {
  flex: 1 1 44%;
  min-width: 280px;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 18px;
  overflow-y: auto;
}
.cap {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--o-ink-2);
}
.techs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.tech {
  min-width: 72px;
  height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--o-s2);
  font-size: 15px;
  cursor: pointer;
}
.tech.on { background: var(--o-accent); color: #0b0c0e; font-weight: 600; }
.tech.off { opacity: 0.3; cursor: default; }
.slider-block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.slider-head { display: flex; justify-content: space-between; align-items: baseline; }
.value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--o-ink);
}
.slider {
  height: 48px;
  border-radius: 12px;
  background: var(--o-s2);
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: ew-resize;
}
.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--o-accent-soft);
}
.slider-thumb {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 6px;
  border-radius: 3px;
  background: var(--o-accent);
}
.orch.stacked .head { flex-wrap: wrap; }
.orch.stacked .libs { order: 3; flex-basis: 100%; }
.orch.stacked .libs .seg-item { flex: 1; justify-content: center; }
.orch.stacked .body { flex-direction: column; overflow-y: auto; touch-action: pan-y; }
.orch.stacked .browse { box-shadow: inset 0 -1px 0 var(--o-line); flex: 0 0 auto; }
.orch.stacked .list { max-height: 260px; }
.orch.stacked .play { max-width: none; min-width: 0; }
.keys-wrap {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px 14px;
  box-shadow: inset 0 1px 0 var(--o-line);
}
.keys-label { display: flex; align-items: baseline; justify-content: space-between; }
.keys-label .cap { margin: 0; }
.range { font-size: 12px; color: var(--o-ink-2); font-variant-numeric: tabular-nums; }
.keys {
  height: 96px;
  border-radius: 12px;
  background: #090a0c;
  overflow-x: auto;
  overflow-y: hidden;
  touch-action: none;
  overscroll-behavior: contain;
}
.bed { position: relative; height: 100%; }
.key {
  position: absolute;
  top: 0;
  bottom: 0;
  background: #e6e7ea;
  border-radius: 0 0 5px 5px;
  box-sizing: border-box;
}
.key.out { background: #2c2f36; opacity: 0.38; }
.key.on { background: var(--o-accent); }
.key.black {
  bottom: 42%;
  background: #101114;
  border-radius: 0 0 4px 4px;
  z-index: 2;
}
.key.black.out { background: #181a1e; }
.key.black.on { background: #9ec0ff; }
@media (max-width: 760px) {
  .head { flex-wrap: wrap; }
  .libs { order: 3; flex-basis: 100%; }
  .libs .seg-item { flex: 1; justify-content: center; }
  .body { flex-direction: column; overflow-y: auto; }
  .browse { flex: 0 0 auto; box-shadow: inset 0 -1px 0 var(--o-line); }
  .list { max-height: 280px; }
  .play { max-width: none; min-width: 0; }
}
</style>
<style>
.orch uni-view.list,
.orch.stacked > uni-view.body,
.orch.stacked uni-view.body {
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  overscroll-behavior: contain;
}
</style>
