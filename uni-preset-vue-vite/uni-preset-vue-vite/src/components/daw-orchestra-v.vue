<template>
  <view class="ov" :class="{ dense }">
    <view class="top">
      <view class="brand" @click.stop="dense && (libOpen = !libOpen)">
        <text class="logo">{{ dense ? currentName : 'Orchestra V' }}</text>
        <text class="sub" :class="{ err: isError }">{{ subText }}</text>
      </view>
      <text class="status" :class="{ ok: isReady, err: isError }">{{ statusText }}</text>
      <view
        v-if="dense"
        class="tool"
        :class="{ on: libOpen }"
        title="Browse instruments"
        aria-label="Browse instruments"
        @click.stop="libOpen = !libOpen"
      >
        <daw-icon name="grid" :size="16" />
      </view>
      <view class="tool" title="Change instrument" aria-label="Change instrument" @click.stop="changePlugin">
        <daw-icon name="swap" :size="16" />
      </view>
    </view>

    <view class="body">
      <view class="families">
        <view class="fam" :class="{ on: familyId === 'all' }" @click="onFamilyTap('all')">
          <text class="fam-ico">✦</text>
          <text class="fam-lab">All</text>
        </view>
        <view
          v-for="family in FAMILIES"
          :key="family.id"
          class="fam"
          :class="{ on: familyId === family.id, empty: !familyInLibrary(family.id) }"
          :title="familyInLibrary(family.id) ? family.label : family.label + ' — nothing in this library'"
          @click="onFamilyTap(family.id)"
        >
          <text class="fam-ico">{{ family.mark }}</text>
          <text class="fam-lab">{{ family.label }}</text>
        </view>
      </view>

      <view class="stage">
        <view v-if="!dense" class="hero">
          <view class="ring">
            <view class="halo" />
            <text class="fam-name">{{ currentFamilyLabel }}</text>
            <text class="inst-name">{{ currentName }}</text>
            <text class="art-name">{{ techniqueLabel }}</text>
            <text class="lib-name">{{ currentLibraryLabel }}</text>
          </view>
        </view>

        <view v-if="techniques.length" class="arts">
          <view
            v-for="item in techniques"
            :key="item.id"
            class="art"
            :class="{ on: currentTechniqueId === item.id, dim: !item.available }"
            :title="item.available ? item.displayName : item.displayName + ' — no samples in the cloud library'"
            @click="item.available && onTechnique(item.id)"
          >{{ item.displayName }}</view>
        </view>

        <view class="knobs">
          <view v-for="ctrl in CONTROLLERS" :key="ctrl.id" class="knob-cell">
            <dsp-knob
              :model-value="controllerValue(ctrl)"
              :default-value="ctrl.defaultValue"
              :label="ctrl.displayName"
              :size="dense ? 'sm' : 'md'"
              :format="formatPercent"
              accent="#c8a86a"
              @update:model-value="onKnob(ctrl, $event)"
            />
          </view>
        </view>

        <view class="scope-row">
          <view class="scope">
            <svg class="wave" viewBox="0 0 300 64" preserveAspectRatio="none">
              <polyline class="wave-line" :points="wavePoints" />
            </svg>
            <text class="scope-name">{{ techniqueLabel }}</text>
            <text class="scope-note">{{ scopeNote }}</text>
          </view>
          <view class="mics">
            <text class="mics-cap">Mic Mix</text>
            <view class="mic-row">
              <view v-for="mic in MIC_MIX" :key="mic.id" class="mic">
                <view
                  class="mic-track"
                  :ref="(el) => setFaderRef(mic.id, el)"
                  @pointerdown.prevent.stop="onFader(mic, $event)"
                >
                  <view class="mic-fill" :style="{ height: (controllerValue(mic) * 100) + '%' }" />
                  <view class="mic-cap" :style="{ bottom: 'calc(' + (controllerValue(mic) * 100) + '% - 5px)' }" />
                </view>
                <text class="mic-lab">{{ mic.displayName }}</text>
              </view>
            </view>
          </view>
        </view>

        <view class="play">
          <view class="wheels">
            <view
              v-if="usesPedal"
              class="ped"
              :class="{ on: pedalDown }"
              title="Sustain pedal (CC64) — held notes keep sounding until it is released"
              @click="togglePedal"
            >
              <view class="ped-body" />
              <text class="wheel-lab">Ped</text>
            </view>
            <view v-for="wheel in WHEELS" :key="wheel.id" class="wheel">
              <view
                class="wheel-track"
                :ref="(el) => setFaderRef(wheel.id, el)"
                @pointerdown.prevent.stop="onFader(wheel, $event)"
                @pointerup="onWheelRelease(wheel)"
                @pointercancel="onWheelRelease(wheel)"
              >
                <view class="wheel-cap" :style="{ bottom: 'calc(' + (controllerValue(wheel) * 100) + '% - 6px)' }" />
              </view>
              <text class="wheel-lab">{{ wheel.displayName }}</text>
            </view>
          </view>
          <view class="keys" @pointerleave="allOff">
            <view
              v-for="key in keys"
              :key="key.pitch"
              class="key"
              :class="{ black: key.black, down: held[key.pitch], lit: key.inRange }"
              :style="{ left: key.left + '%', width: key.width + '%' }"
              @pointerdown.prevent="noteOn(key.pitch)"
              @pointerup="noteOff(key.pitch)"
              @pointercancel="noteOff(key.pitch)"
            />
          </view>
        </view>
      </view>

      <view v-if="!dense || libOpen" class="library">
        <view class="lib-pick">
          <view
            v-for="option in LIBRARY_OPTIONS"
            :key="option.id"
            class="lib-tab"
            :class="{ on: libraryId === option.id }"
            :title="option.detail"
            @click="libraryId = option.id"
          >
            <text class="lib-tab-name">{{ option.label }}</text>
            <text class="lib-tab-count">{{ option.available }} / {{ option.total }}</text>
          </view>
        </view>
        <view v-for="group in visibleGroups" :key="group.id" class="lib-group">
          <text class="lib-cap">{{ group.label }}</text>
          <view class="grid">
            <view
              v-for="item in group.items"
              :key="item.id"
              class="card"
              :class="{ on: selectedId === item.id, dim: !item.available }"
              :title="item.available ? item.name : item.name + ' — ' + item.detail"
              @click="selectInstrument(item)"
            >
              <text class="card-ico">{{ iconMark(item.icon) }}</text>
              <text class="card-name">{{ item.name }}</text>
              <text v-if="!item.available" class="card-miss">No samples</text>
            </view>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import DspKnob from './dsp/dsp-knob.vue'
import DawIcon from './daw-icon.vue'
import { beginPointerDrag, trackRatio } from '../lib/pointer-drag.js'
import {
  CONTROLLERS,
  DEFAULT_LIBRARY_ID,
  FAMILIES,
  INSTRUMENTS,
  LIBRARY_OPTIONS,
  MIC_MIX,
  WHEELS,
  familyOf,
  libraryIdFor,
  orchestraVInstrument,
  orchestraVUsesPedal,
  techniquesFor
} from '../model/orchestra-v-ui.js'
import { regionMapFor } from '../audio/orchestra-v/cloud.js'
import {
  getSelectedTrack,
  loadInstrument,
  setController,
  setTechnique,
  previewNoteOn,
  previewNoteOff,
  openPluginPicker,
  isLite
} from '../store/session.js'

const props = defineProps({
  compact: { type: Boolean, default: false }
})

const familyId = ref('all')
const libraryId = ref(DEFAULT_LIBRARY_ID)
const held = reactive({})
const libOpen = ref(false)
const narrow = ref(false)
const faderRefs = {}

const dense = computed(() => props.compact || isLite() || narrow.value)

function measure () {
  narrow.value = typeof window !== 'undefined' && window.innerWidth < 720
}

measure()

onMounted(() => {
  if (typeof window !== 'undefined') window.addEventListener('resize', measure)
})

onUnmounted(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', measure)
  allOff()
})

const track = computed(() => getSelectedTrack())
const selectedId = computed(() => (track.value && track.value.definitionId) || '')
const current = computed(() => orchestraVInstrument(selectedId.value))
const techniques = computed(() => techniquesFor(selectedId.value))
const currentTechniqueId = computed(() => (track.value && track.value.techniqueId) || '')

watch(() => selectedId.value, (id) => {
  const next = familyOf(id)
  if (next && familyId.value !== 'all') familyId.value = next
  // Follow the track into its own library, otherwise the grid would be showing a different
  // one than the instrument the panel is driving.
  if (id) libraryId.value = libraryIdFor(id)
}, { immediate: true })

const currentName = computed(() => {
  if (current.value) return current.value.name
  return (track.value && track.value.instrument) || 'Orchestra V'
})

const currentFamilyLabel = computed(() => {
  const family = FAMILIES.find((item) => item.id === familyOf(selectedId.value))
  return family ? family.label.toUpperCase() : 'STRINGS'
})

const techniqueLabel = computed(() => {
  const item = techniques.value.find((entry) => entry.id === currentTechniqueId.value)
  return (item ? item.displayName : 'Long').toUpperCase()
})

const usesPedal = computed(() => orchestraVUsesPedal(selectedId.value))
const pedalDown = computed(() => controllerValue({ id: 'pedal', defaultValue: 0 }) >= 0.5)

const currentLibraryLabel = computed(() => {
  const option = LIBRARY_OPTIONS.find((item) => item.id === libraryIdFor(selectedId.value))
  return option ? option.label : ''
})

const visibleGroups = computed(() => FAMILIES
  .filter((family) => familyId.value === 'all' || familyId.value === family.id)
  .map((family) => ({
    id: family.id,
    label: family.label.toUpperCase(),
    items: INSTRUMENTS.filter((item) => item.family === family.id && item.library === libraryId.value)
  }))
  .filter((group) => group.items.length))

const statusText = computed(() => {
  if (!track.value || track.value.type === 'master') return ''
  return track.value.instrumentLoadMessage || track.value.instrumentLoadState || ''
})

const isError = computed(() => {
  const state = (track.value && (track.value.instrumentLoadState || '')).toLowerCase()
  return state === 'error' || state === 'unavailable'
})

const isReady = computed(() => {
  const state = (track.value && (track.value.instrumentLoadState || '')).toLowerCase()
  return state === 'loaded' || state === 'ready' || state === 'active'
})

const subText = computed(() => {
  if (dense.value) return currentFamilyLabel.value + ' · ' + techniqueLabel.value
  return 'Orchestral sampler'
})

// --- compiled region map, used to describe what will actually sound ----------

const regionMap = computed(() => regionMapFor(selectedId.value))

const activeBank = computed(() => {
  const map = regionMap.value
  if (!map) return null
  const item = techniques.value.find((entry) => entry.id === currentTechniqueId.value)
  const artic = item ? item.articulation : 'long'
  return map.byArticulation[artic] || map.byArticulation[map.articulations[0]] || null
})

const scopeNote = computed(() => {
  const bank = activeBank.value
  if (!bank) return 'Cloud samples stream on first note'
  const looped = bank.byKey.flat().filter(Boolean).some((zone) => zone.loopMode === 'loop_continuous')
  return `${bank.zoneCount} zones · keys ${bank.keyLo}-${bank.keyHi}${looped ? ' · looped' : ''}`
})

/** A representative amplitude envelope for the current technique, drawn from the
 * compiled zone rather than a stock picture. */
const wavePoints = computed(() => {
  const bank = activeBank.value
  const zone = bank ? (bank.byKey[Math.round((bank.keyLo + bank.keyHi) / 2)] || [])[0] : null
  const sustained = !zone || zone.loopMode === 'loop_continuous' || zone.articulation === 'long'
  const attack = sustained ? 0.16 : 0.02
  const decay = sustained ? 0.9 : 0.34
  const points = []
  for (let i = 0; i <= 150; i++) {
    const t = i / 150
    let amp
    if (t < attack) amp = t / attack
    else if (t < decay) amp = sustained ? 0.82 + 0.1 * Math.sin(t * 34) : Math.exp(-(t - attack) * 9)
    else amp = Math.max(0, (1 - (t - decay) / (1 - decay))) * (sustained ? 0.8 : 0.12)
    const wobble = Math.sin(t * 190) * amp
    points.push(`${(t * 300).toFixed(1)},${(32 - wobble * 28).toFixed(1)}`)
  }
  return points.join(' ')
})

// --- keyboard ----------------------------------------------------------------

const keys = computed(() => {
  const bank = activeBank.value
  const lo = dense.value ? 48 : 48
  const hi = dense.value ? 72 : 84
  const whites = []
  const blacks = []
  let whiteIndex = 0
  for (let pitch = lo; pitch <= hi; pitch++) {
    const pc = pitch % 12
    const black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    const inRange = !!(bank && bank.byKey[pitch])
    if (black) blacks.push({ pitch, black: true, whiteIndex, inRange })
    else {
      whites.push({ pitch, black: false, whiteIndex, inRange })
      whiteIndex += 1
    }
  }
  const step = 100 / Math.max(1, whiteIndex)
  return whites.map((key) => ({ ...key, left: key.whiteIndex * step, width: step }))
    .concat(blacks.map((key) => ({
      ...key,
      left: (key.whiteIndex - 0.34) * step,
      width: step * 0.68
    })))
})

// --- controls -----------------------------------------------------------------

function controllerValue (ctrl) {
  const values = (track.value && track.value.controllerValues) || {}
  const raw = values[ctrl.id]
  if (raw == null || !Number.isFinite(Number(raw))) return ctrl.defaultValue
  const value = Number(raw)
  return Math.max(0, Math.min(1, value > 1 ? value / 127 : value))
}

function formatPercent (value) {
  return Math.round(value * 100) + '%'
}

function onKnob (ctrl, value) {
  if (!track.value) return
  setController(track.value, ctrl.id, value)
}

function setFaderRef (id, el) {
  faderRefs[id] = el && el.$el ? el.$el : el
}

function onFader (ctrl, event) {
  if (!track.value) return
  const element = faderRefs[ctrl.id]
  const apply = (ev) => {
    const ratio = trackRatio(ev, element, 'vertical')
    if (ratio != null) setController(track.value, ctrl.id, ratio)
  }
  apply(event)
  beginPointerDrag(event, { onMove: apply })
}

/** The pitch wheel springs back to centre, the way a real one does. */
function onWheelRelease (wheel) {
  if (wheel.centred && track.value) setController(track.value, wheel.id, wheel.defaultValue)
}

function onTechnique (id) {
  if (track.value) setTechnique(track.value, id)
}

function togglePedal () {
  if (!track.value) return
  setController(track.value, 'pedal', pedalDown.value ? 0 : 1)
}

function familyInLibrary (id) {
  return INSTRUMENTS.some((item) => item.family === id && item.library === libraryId.value)
}

function onFamilyTap (id) {
  familyId.value = id
  if (dense.value && id !== 'all') libOpen.value = true
}

function selectInstrument (item) {
  if (!item.available || !track.value) return
  if (dense.value) libOpen.value = false
  if (item.id === selectedId.value) return
  loadInstrument(track.value, item.id)
}

function iconMark (icon) {
  return ({
    violin: '🎻', viola: '🎻', cello: '🎻', bass: '🎻', harp: '🎼',
    flute: '♫', oboe: '♫', clarinet: '♫', bassoon: '♫',
    horn: '📯', trumpet: '📯', trombone: '📯', tuba: '📯',
    timpani: '🥁', snare: '🥁', bassdrum: '🥁', cymbal: '♧', triangle: '△',
    marimba: '▦', glock: '✦', piano: '🎹', celesta: '🎹', bells: '🔔', choir: '👥'
  })[icon] || '•'
}

function noteOn (pitch) {
  if (!track.value) return
  held[pitch] = true
  previewNoteOn(track.value, pitch, 0.8)
}

function noteOff (pitch) {
  held[pitch] = false
  if (track.value) previewNoteOff(track.value, pitch)
}

function allOff () {
  Object.keys(held).forEach((pitch) => {
    if (held[pitch]) noteOff(Number(pitch))
  })
}

function changePlugin () {
  if (!track.value) return
  openPluginPicker(track.value)
}
</script>

<style scoped>
.ov {
  height: 100%;
  max-height: 100%;
  background: linear-gradient(180deg, #0d1220 0%, #0a0e18 100%);
  color: #e8e6e1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.top {
  height: 44px;
  border-bottom: 1px solid #1e2637;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;
}
.brand { min-width: 0; }
.logo {
  font-size: 13px;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: #c8a86a;
  font-weight: 700;
}
.sub { display: block; font-size: 10px; color: #7d8798; margin-top: 1px; letter-spacing: 0.1em; }
.sub.err { color: #d08a8a; }
.status { font-size: 11px; color: #7d8798; }
.status.ok { color: #9db89a; }
.status.err { color: #d08a8a; }
.tool {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #b9c2d0;
  border: 1px solid #27314a;
  border-radius: 6px;
  margin-left: 8px;
}
.tool.on { border-color: #c8a86a; color: #c8a86a; }

.body { flex: 1; display: flex; min-height: 0; }

.families {
  width: 84px;
  border-right: 1px solid #1e2637;
  padding: 8px 6px;
  overflow: auto;
  flex-shrink: 0;
}
.fam {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  border-radius: 8px;
  cursor: pointer;
  color: #7d8798;
}
.fam.on { background: #151c2c; color: #c8a86a; box-shadow: inset 2px 0 #c8a86a; }
.fam.empty { opacity: 0.32; }
.fam-ico { font-size: 16px; }
.fam-lab { font-size: 9px; letter-spacing: 0.08em; text-transform: uppercase; }

.stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 18px 10px;
  gap: 8px;
  overflow: auto;
}
.hero { display: flex; justify-content: center; }
.ring {
  width: min(210px, 62%);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 1px solid #c8a86a55;
  background: radial-gradient(circle at 50% 40%, #16203a 0%, #0b1020 72%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.halo { position: absolute; inset: 16%; border-radius: 50%; border: 1px solid #c8a86a2e; pointer-events: none; }
.fam-name { font-size: 10px; letter-spacing: 0.24em; color: #c8a86a; }
.inst-name { font-size: 19px; font-weight: 700; letter-spacing: 0.1em; margin-top: 6px; text-transform: uppercase; }
.art-name { font-size: 11px; color: #7d8798; margin-top: 4px; letter-spacing: 0.18em; }
.lib-name { font-size: 9px; color: #5d6779; margin-top: 8px; letter-spacing: 0.14em; text-transform: uppercase; }

.arts { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; }
.art {
  padding: 5px 14px;
  border: 1px solid #27314a;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #b9c2d0;
  cursor: pointer;
}
.art.on { border-color: #c8a86a; color: #c8a86a; background: #151c2c; }
.art.dim { opacity: 0.3; pointer-events: none; }

.knobs { display: flex; justify-content: center; flex-wrap: wrap; gap: 14px; }
.knob-cell { min-width: 80px; }
/* The shared knob ships a light body; darken it to sit on the navy panel. */
.knobs :deep(.body) { fill: #131b2c; stroke: #2b364f; }
.knobs :deep(.tick) { stroke: #3a4763; }
.knobs :deep(.track) { stroke: #26314a; }
.knobs :deep(.needle) { stroke: #e8e6e1; }
.knobs :deep(.lab) { color: #7d8798; }
.knobs :deep(.val) { color: #c8a86a; }

.scope-row { display: flex; gap: 12px; align-items: stretch; }
.scope {
  flex: 1;
  min-width: 0;
  position: relative;
  border: 1px solid #1e2637;
  border-radius: 8px;
  background: #0b1020;
  padding: 8px 10px 20px;
}
.wave { width: 100%; height: 56px; display: block; }
.wave-line { fill: none; stroke: #c8a86a; stroke-width: 1; opacity: 0.85; }
.scope-name {
  position: absolute; left: 10px; bottom: 5px;
  font-size: 10px; letter-spacing: 0.16em; color: #c8a86a;
}
.scope-note { position: absolute; right: 10px; bottom: 5px; font-size: 9px; color: #6b7588; }

.mics {
  width: 132px;
  flex-shrink: 0;
  border: 1px solid #1e2637;
  border-radius: 8px;
  background: #0b1020;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
}
.mics-cap { font-size: 9px; letter-spacing: 0.18em; color: #7d8798; text-transform: uppercase; text-align: center; }
.mic-row { flex: 1; display: flex; justify-content: space-around; align-items: flex-end; gap: 6px; margin-top: 4px; }
.mic { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.mic-track {
  position: relative;
  width: 6px;
  height: 52px;
  background: #1a2235;
  border-radius: 3px;
  cursor: ns-resize;
  touch-action: none;
}
.mic-fill { position: absolute; left: 0; right: 0; bottom: 0; background: #7a6436; border-radius: 3px; }
.mic-cap {
  position: absolute; left: -4px; right: -4px; height: 10px;
  background: #c8a86a; border-radius: 2px;
}
.mic-lab { font-size: 8px; letter-spacing: 0.1em; color: #7d8798; text-transform: uppercase; }

.play { display: flex; gap: 10px; align-items: flex-end; }
.wheels { display: flex; gap: 8px; flex-shrink: 0; }
.wheel { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.wheel-track {
  position: relative;
  width: 16px;
  height: 64px;
  border-radius: 8px;
  background: linear-gradient(90deg, #0a0e18 0%, #222c42 50%, #0a0e18 100%);
  border: 1px solid #27314a;
  cursor: ns-resize;
  touch-action: none;
}
.wheel-cap {
  position: absolute; left: 1px; right: 1px; height: 12px;
  background: #c8a86a; border-radius: 3px;
}
.wheel-lab { font-size: 8px; letter-spacing: 0.1em; color: #7d8798; text-transform: uppercase; }

.ped { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; }
.ped-body {
  width: 22px;
  height: 64px;
  border-radius: 8px 8px 4px 4px;
  background: linear-gradient(180deg, #2a3450 0%, #141b2b 100%);
  border: 1px solid #27314a;
  box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.05);
}
.ped.on .ped-body {
  background: linear-gradient(180deg, #c8a86a 0%, #8a7343 100%);
  border-color: #c8a86a;
  /* Reads as physically pressed, not merely highlighted. */
  transform: translateY(3px) scaleY(0.94);
}
.ped.on .wheel-lab { color: #c8a86a; }

.keys {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 72px;
  background: #060911;
  border: 1px solid #1e2637;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
}
.key { position: absolute; top: 0; bottom: 0; background: #2a3145; border: 1px solid #10151f; }
.key.lit { background: #ece6dc; border-color: #b9b3a8; }
.key.black { height: 48%; background: #10151f; z-index: 2; border-color: #000; }
.key.black.lit { background: #1b2233; }
.key.down { background: #c8a86a; }
.key.black.down { background: #8a7349; }

.library {
  width: 268px;
  border-left: 1px solid #1e2637;
  padding: 10px;
  overflow: auto;
  flex-shrink: 0;
  background: #0b1020;
}
.lib-pick { display: flex; gap: 6px; margin-bottom: 12px; }
.lib-tab {
  flex: 1;
  min-width: 0;
  padding: 7px 6px;
  border: 1px solid #1e2637;
  border-radius: 8px;
  background: #101728;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.lib-tab.on { border-color: #c8a86a; background: #16203a; }
.lib-tab-name {
  font-size: 9px;
  letter-spacing: 0.04em;
  color: #e8e6e1;
  text-align: center;
  line-height: 1.25;
}
.lib-tab.on .lib-tab-name { color: #c8a86a; }
.lib-tab-count { font-size: 8px; color: #6b7588; letter-spacing: 0.06em; }

.lib-group { margin-bottom: 12px; }
.lib-cap {
  display: block;
  font-size: 9px;
  letter-spacing: 0.22em;
  color: #c8a86a;
  margin-bottom: 6px;
  text-align: center;
  border-bottom: 1px solid #1a2235;
  padding-bottom: 4px;
}
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; }
.card {
  min-height: 66px;
  border: 1px solid #1e2637;
  border-radius: 8px;
  background: #101728;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  cursor: pointer;
  padding: 6px 3px;
}
.card.on { border-color: #c8a86a; background: #16203a; }
.card.dim { opacity: 0.34; cursor: default; }
.card-ico { font-size: 17px; }
.card-name { font-size: 9px; letter-spacing: 0.02em; text-align: center; color: #e8e6e1; line-height: 1.2; }
.card-miss { font-size: 8px; color: #6b7588; }

/* Dense layout for the lite track sheet and narrow windows. */
.ov.dense .top { height: 48px; padding: 0 10px; }
.ov.dense .logo { font-size: 14px; letter-spacing: 0.04em; text-transform: none; color: #e8e6e1; }
.ov.dense .brand { flex: 1; }
.ov.dense .status { display: none; }
.ov.dense .tool { width: 40px; height: 40px; }
.ov.dense .body { flex-direction: column; }
.ov.dense .families {
  width: auto;
  display: flex;
  flex-direction: row;
  gap: 6px;
  border-right: 0;
  border-bottom: 1px solid #1e2637;
  padding: 6px 8px;
  overflow-x: auto;
  overflow-y: hidden;
}
.ov.dense .fam {
  flex-direction: row;
  align-items: center;
  gap: 5px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid #27314a;
  border-radius: 999px;
  flex-shrink: 0;
}
.ov.dense .fam.on { box-shadow: none; }
.ov.dense .stage { padding: 8px 10px 6px; gap: 6px; }
.ov.dense .art { min-height: 36px; display: flex; align-items: center; }
.ov.dense .knobs { gap: 6px; }
.ov.dense .knob-cell { min-width: 62px; }
.ov.dense .scope { display: none; }
.ov.dense .mics { width: auto; flex: 1; }
.ov.dense .wheels { display: none; }
.ov.dense .keys { height: 56px; }
.ov.dense .key.black { height: 54%; }
.ov.dense .library {
  width: auto;
  max-height: 46%;
  border-left: 0;
  border-top: 1px solid #1e2637;
}
.ov.dense .grid { grid-template-columns: 1fr 1fr; }

@media (max-width: 700px) {
  .body { flex-direction: column; }
  .families { width: auto; height: 64px; flex-direction: row; border-right: 0; border-bottom: 1px solid #1e2637; }
  .library { width: auto; border-left: 0; border-top: 1px solid #1e2637; max-height: 40%; }
  .ring { width: 160px; }
  .inst-name { font-size: 15px; }
}
</style>
