<template>
  <view class="mo">
    <view class="top">
      <view class="brand">
        <text class="logo">M Orchestra</text>
        <text class="sub">Cloud orchestral plugin</text>
      </view>
      <text class="status" :class="{ ok: isReady, err: isError }">{{ statusText }}</text>
      <view class="swap" title="Change instrument" aria-label="Change instrument" @click.stop="changePlugin">
        <daw-icon name="copy" :size="16" />
      </view>
    </view>

    <view class="body">
      <view class="families">
        <view
          v-for="family in FAMILIES"
          :key="family.id"
          class="fam"
          :class="{ on: familyId === family.id }"
          @click="familyId = family.id"
        >
          <text class="fam-ico">{{ familyMark(family.id) }}</text>
          <text class="fam-lab">{{ family.label }}</text>
        </view>
      </view>

      <view class="stage">
        <view class="hero">
          <view class="ring">
            <view class="halo" />
            <text class="fam-name">{{ currentFamilyLabel }}</text>
            <text class="inst-name">{{ currentName }}</text>
            <text class="art-name">{{ techniqueLabel }}</text>
          </view>
        </view>

        <view v-if="techniques.length" class="arts">
          <view
            v-for="item in techniques"
            :key="item.id"
            class="art"
            :class="{ on: track && track.techniqueId === item.id, dim: !item.available }"
            @click="item.available && setTechnique(track, item.id)"
          >{{ item.displayName }}</view>
        </view>

        <view class="knobs">
          <view v-for="ctrl in knobs" :key="ctrl.id" class="knob-cell">
            <dsp-knob
              :model-value="controllerValue(ctrl)"
              :disabled="!ctrl.mapped"
              :label="ctrl.displayName"
              size="md"
              accent="#c9a46c"
              @update:model-value="onKnob(ctrl, $event)"
            />
          </view>
        </view>

        <view class="keys" @pointerleave="allOff">
          <view
            v-for="key in keys"
            :key="key.pitch"
            class="key"
            :class="{ black: key.black, down: held[key.pitch] }"
            :style="key.black ? { left: key.left + '%' } : null"
            @pointerdown.prevent="noteOn(key.pitch)"
            @pointerup="noteOff(key.pitch)"
            @pointercancel="noteOff(key.pitch)"
          />
        </view>
      </view>

      <view class="library">
        <text class="lib-cap">{{ currentFamilyLabel }}</text>
        <view class="grid">
          <view
            v-for="item in visibleInstruments"
            :key="item.id"
            class="card"
            :class="{ on: selectedId === item.id, dim: !item.available }"
            @click="selectInstrument(item)"
          >
            <text class="card-ico">{{ iconMark(item.icon) }}</text>
            <text class="card-name">{{ item.name }}</text>
            <text v-if="!item.available" class="card-miss">No sample</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import DspKnob from './dsp/dsp-knob.vue'
import DawIcon from './daw-icon.vue'
import {
  FAMILIES,
  INSTRUMENTS,
  familyOf,
  mOrchestraInstrument,
  cloudTechniquesFor,
  CLOUD_CONTROLLERS,
  isMOrchestraTrack
} from '../model/m-orchestra-ui.js'
import {
  session,
  getSelectedTrack,
  definitionById,
  techniqueById,
  controllerById,
  loadInstrument,
  setTechnique,
  setController,
  previewNoteOn,
  previewNoteOff,
  openPluginPicker
} from '../store/session.js'

const familyId = ref('strings')
const held = reactive({})
const track = computed(() => getSelectedTrack())
const definition = computed(() => track.value ? definitionById(track.value.definitionId) : null)
const selectedId = computed(() => (track.value && track.value.definitionId) || '')
const current = computed(() => mOrchestraInstrument(selectedId.value))

watch(() => selectedId.value, (id) => {
  const next = familyOf(id)
  if (next) familyId.value = next
}, { immediate: true })

const currentName = computed(() => {
  if (current.value) return current.value.name
  return (track.value && track.value.instrument) || 'M Orchestra'
})

const currentFamilyLabel = computed(() => {
  const family = FAMILIES.find((item) => item.id === familyId.value)
  return family ? family.label.toUpperCase() : 'STRINGS'
})

const visibleInstruments = computed(() => INSTRUMENTS.filter((item) => item.family === familyId.value))

const statusText = computed(() => {
  if (!track.value || track.value.type === 'master') return ''
  if (isMOrchestraTrack(track.value)) return track.value.instrumentLoadMessage || 'Cloud library'
  return track.value.instrumentLoadMessage || track.value.instrumentLoadState || ''
})
const isError = computed(() => {
  const s = (track.value && (track.value.instrumentLoadState || '')).toLowerCase()
  return s === 'error' || s === 'unavailable'
})
const isReady = computed(() => {
  const s = (track.value && (track.value.instrumentLoadState || '')).toLowerCase()
  return s === 'loaded' || s === 'ready' || s === 'active'
})

const techniques = computed(() => {
  if (track.value && isMOrchestraTrack(track.value)) {
    const cloud = cloudTechniquesFor(selectedId.value)
    if (!definition.value) return cloud
    return cloud
  }
  if (!definition.value) return []
  return (definition.value.techniques || []).map((id) => {
    const item = techniqueById(id) || { id, displayName: id, mapped: false }
    const presets = session.catalogue.presets || []
    const presetId = definition.value.techniquePresets && definition.value.techniquePresets[id]
    const preset = presetId ? presets.find((entry) => entry.id === presetId) : null
    const available = preset ? !!preset.stateAvailable : !!item.mapped
    return { ...item, available }
  })
})

const techniqueLabel = computed(() => {
  const id = track.value && track.value.techniqueId
  const item = techniques.value.find((entry) => entry.id === id)
  return item ? item.displayName.toUpperCase() : 'LONG'
})

const knobs = computed(() => {
  if (track.value && isMOrchestraTrack(track.value)) {
    const fromDef = definition.value
      ? (definition.value.controllers || []).map((id) => controllerById(id) || { id, displayName: id, mapped: true })
      : []
    return (fromDef.length ? fromDef : CLOUD_CONTROLLERS).filter((ctrl) => ctrl.id !== 'pedal' && ctrl.id !== 'velocity')
  }
  if (!definition.value) return []
  return (definition.value.controllers || [])
    .map((id) => controllerById(id) || { id, displayName: id, mapped: false })
    .filter((ctrl) => ctrl.id !== 'pedal')
})

const keys = computed(() => {
  const whites = []
  const blacks = []
  let whiteIndex = 0
  for (let pitch = 48; pitch <= 72; pitch++) {
    const pc = pitch % 12
    const black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    if (black) blacks.push({ pitch, black: true, left: (whiteIndex - 0.35) * (100 / 15) })
    else {
      whites.push({ pitch, black: false })
      whiteIndex += 1
    }
  }
  return whites.concat(blacks)
})

function familyMark (id) {
  return ({ strings: '🎻', woodwinds: '🎶', brass: '📯', percussion: '🥁', solo: '◇', keyboard: '🎹' })[id] || '•'
}

function iconMark (icon) {
  return ({
    violin: '🎻', viola: '🎻', cello: '🎻', bass: '🎻', harp: '🎼',
    flute: '♫', oboe: '♫', clarinet: '♫', bassoon: '♫',
    horn: '📯', trumpet: '📯', trombone: '📯', tuba: '📯',
    timpani: '🥁', snare: '🥁', bassdrum: '🥁', cymbal: '♧', tom: '🥁', triangle: '△', glock: '✦',
    piano: '🎹', bells: '🔔'
  })[icon] || '•'
}

function controllerValue (ctrl) {
  if (!ctrl || !track.value) return 0
  const values = track.value.controllerValues || {}
  if (values[ctrl.id] != null) return values[ctrl.id]
  if (ctrl.defaultValue != null && ctrl.max != null && ctrl.min != null && ctrl.max !== ctrl.min) {
    return (ctrl.defaultValue - ctrl.min) / (ctrl.max - ctrl.min)
  }
  return ctrl.mapped ? 0.8 : 0
}

function onKnob (ctrl, value) {
  if (!ctrl.mapped || !track.value) return
  setController(track.value, ctrl.id, value)
}

function selectInstrument (item) {
  if (!item.available || !track.value) return
  if (item.id === selectedId.value) return
  loadInstrument(track.value, item.id)
}

function velocity () {
  return controllerValue(knobs.value.find((ctrl) => ctrl.id === 'velocity') || { mapped: true }) || 0.8
}

function noteOn (pitch) {
  if (!track.value) return
  held[pitch] = true
  previewNoteOn(track.value, pitch, velocity())
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
.mo {
  height: 100%;
  background: #121212;
  color: #e6e6e6;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.top {
  height: 44px;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  flex-shrink: 0;
}
.logo {
  font-size: 13px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #c9a46c;
  font-weight: 700;
}
.sub { display: block; font-size: 10px; color: #8d8d8d; margin-top: 1px; }
.status { font-size: 11px; color: #8d8d8d; }
.status.ok { color: #9db89a; }
.status.err { color: #d08a8a; }
.swap {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #cfcfcf;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
}
.body { flex: 1; display: flex; min-height: 0; }
.families {
  width: 76px;
  border-right: 1px solid #2a2a2a;
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
  color: #8d8d8d;
}
.fam.on { background: #1c1c1c; color: #c9a46c; }
.fam-ico { font-size: 16px; }
.fam-lab { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; }
.stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 12px 16px 10px;
}
.hero { display: flex; justify-content: center; padding: 6px 0 10px; }
.ring {
  width: min(220px, 42vw);
  height: min(220px, 42vw);
  border-radius: 50%;
  border: 1px solid #c9a46c66;
  background: radial-gradient(circle at 50% 42%, #1b1b1b 0%, #101010 70%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.halo {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  border: 1px solid #c9a46c33;
  pointer-events: none;
}
.fam-name { font-size: 10px; letter-spacing: 0.22em; color: #c9a46c; }
.inst-name { font-size: 18px; font-weight: 700; letter-spacing: 0.08em; margin-top: 6px; text-transform: uppercase; }
.art-name { font-size: 11px; color: #8d8d8d; margin-top: 4px; letter-spacing: 0.16em; }
.arts { display: flex; justify-content: center; gap: 8px; margin-bottom: 8px; }
.art {
  padding: 5px 12px;
  border: 1px solid #3a3a3a;
  border-radius: 999px;
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #b0b0b0;
  cursor: pointer;
}
.art.on { border-color: #c9a46c; color: #c9a46c; }
.art.dim { opacity: 0.35; pointer-events: none; }
.knobs { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; margin: 4px 0 10px; }
.knob-cell { min-width: 84px; }
.keys {
  position: relative;
  height: 72px;
  background: #0e0e0e;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
  margin-top: auto;
}
.key {
  position: absolute; top: 0; bottom: 0; width: calc(100% / 15);
  background: #ece6dc; border: 1px solid #c8c2b8;
}
.key.black { height: 48%; width: calc(100% / 22); background: #161616; z-index: 2; border-color: #000; }
.key.down { background: #c9a46c; }
.key.black.down { background: #8a7349; }
.library {
  width: 240px;
  border-left: 1px solid #2a2a2a;
  padding: 10px;
  overflow: auto;
  flex-shrink: 0;
  background: #141414;
}
.lib-cap {
  display: block;
  font-size: 10px;
  letter-spacing: 0.16em;
  color: #c9a46c;
  margin-bottom: 8px;
}
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card {
  min-height: 72px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  background: #161616;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  padding: 8px 4px;
}
.card.on { border-color: #c9a46c; }
.card.dim { opacity: 0.38; cursor: default; }
.card-ico { font-size: 18px; filter: grayscale(0.2); }
.card-name { font-size: 10px; letter-spacing: 0.04em; text-align: center; color: #e6e6e6; }
.card-miss { font-size: 9px; color: #8d8d8d; }
@media (max-width: 860px) {
  .body { flex-direction: column; }
  .families {
    width: auto; height: 64px; display: flex; flex-direction: row; border-right: 0;
    border-bottom: 1px solid #2a2a2a; overflow: auto;
  }
  .fam { min-width: 68px; }
  .library { width: auto; border-left: 0; border-top: 1px solid #2a2a2a; max-height: 38%; }
  .grid { grid-template-columns: repeat(3, 1fr); }
  .ring { width: 160px; height: 160px; }
  .inst-name { font-size: 15px; }
}
</style>
