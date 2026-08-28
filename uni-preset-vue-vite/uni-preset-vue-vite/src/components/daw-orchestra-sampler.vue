<template>
  <view class="os">
    <view class="hero" :class="{ flip: flipping }">
        <view class="glyph" :class="glyphClass">{{ glyphLetterValue }}</view>
      <view class="hero-copy">
        <text class="name">{{ track && track.instrument ? track.instrument : 'No instrument' }}</text>
        <text class="src">{{ pluginLabel }}</text>
        <text class="st" :class="{ err: isError, ok: isReady }">{{ statusText }}</text>
      </view>
      <view class="browse" @click="openOrchestraPatchPicker(session.selectedTrack)">Browse</view>
    </view>

    <view v-if="techniques.length" class="block">
      <text class="cap">Technique</text>
      <view class="chips">
        <view
          v-for="item in techniques"
          :key="item.id"
          class="chip"
          :class="{ on: track && track.techniqueId === item.id, dim: !item.available }"
          @click="item.available && setTechnique(track, item.id)"
        >{{ item.displayName }}</view>
      </view>
    </view>

    <view class="block">
      <text class="cap">Performance</text>
      <view class="knobs">
        <view v-for="ctrl in knobs" :key="ctrl.id" class="knob-wrap">
          <dsp-knob
            :model-value="controllerValue(ctrl)"
            :disabled="!ctrl.mapped"
            :label="ctrl.displayName"
            size="sm"
            @update:model-value="onKnob(ctrl, $event)"
          />
          <text class="map">{{ ctrl.mapped ? mapLabel(ctrl) : 'N/A' }}</text>
        </view>
        <view v-if="pedal" class="toggle" :class="{ on: pedalOn, dim: !pedal.mapped }" @click="togglePedal">
          <text>Pedal</text>
          <text class="map">{{ pedal.mapped ? 'CC64' : 'N/A' }}</text>
        </view>
        <view
          v-if="showLegato"
          class="toggle"
          :class="{ on: track && track.legato }"
          @click="setLegato(track, !(track && track.legato))"
        >
          <text>Legato</text>
          <text class="map">+1/8</text>
        </view>
      </view>
    </view>

    <view class="block keys-block">
      <text class="cap">Keyboard</text>
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
  </view>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue'
import DspKnob from './dsp/dsp-knob.vue'
import { glyphClass as instrumentGlyphClass, glyphLetter } from '../model/instrument-glyph.js'
import {
  session,
  getSelectedTrack,
  definitionById,
  techniqueById,
  controllerById,
  pluginById,
  setTechnique,
  setController,
  setLegato,
  previewNoteOn,
  previewNoteOff,
  openOrchestraPatchPicker
} from '../store/session.js'

const flipping = ref(false)
const lastInstrument = ref('')
const held = reactive({})

const track = computed(() => getSelectedTrack())
const definition = computed(() => track.value ? definitionById(track.value.definitionId) : null)

const pluginLabel = computed(() => {
  if (!definition.value) return 'Assign an instrument'
  const plugin = pluginById(definition.value.sourcePlugin)
  return plugin ? plugin.displayName : definition.value.sourcePlugin
})

const statusText = computed(() => {
  if (!track.value || track.value.type === 'master') return ''
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
  if (!definition.value) return []
  return (definition.value.techniques || []).map((id) => {
    const item = techniqueById(id) || { id, displayName: id, mapped: false }
    const presets = session.catalogue.presets || []
    const presetId = definition.value.techniquePresets && definition.value.techniquePresets[id]
    const preset = presetId ? presets.find((p) => p.id === presetId) : null
    const available = preset ? !!preset.stateAvailable : !!item.mapped
    return { ...item, available }
  })
})

const controllers = computed(() => {
  if (!definition.value) return []
  return (definition.value.controllers || []).map((id) => controllerById(id) || { id, displayName: id, mapped: false })
})

const knobs = computed(() => controllers.value.filter((c) => c.id !== 'pedal'))
const pedal = computed(() => controllers.value.find((c) => c.id === 'pedal'))
const pedalOn = computed(() => controllerValue(pedal.value) > 0.5)
const showLegato = computed(() => {
  const id = track.value && track.value.techniqueId
  return id && String(id).toLowerCase().includes('long')
})

const glyphLetterValue = computed(() => glyphLetter(track.value && track.value.instrument))

const glyphClass = computed(() => instrumentGlyphClass(track.value, definition.value))

watch(() => track.value && track.value.definitionId, (id) => {
  if (id && lastInstrument.value && lastInstrument.value !== id) {
    flipping.value = true
    setTimeout(() => { flipping.value = false }, 280)
  }
  lastInstrument.value = id || ''
})

const keys = computed(() => {
  const whites = []
  const blacks = []
  let whiteIndex = 0
  for (let pitch = 48; pitch <= 72; pitch++) {
    const pc = pitch % 12
    const black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10
    if (black) {
      blacks.push({ pitch, black: true, left: (whiteIndex - 0.35) * (100 / 15) })
    } else {
      whites.push({ pitch, black: false })
      whiteIndex += 1
    }
  }
  return whites.concat(blacks)
})

function controllerValue (ctrl) {
  if (!ctrl || !track.value) return 0
  const values = track.value.controllerValues || {}
  if (values[ctrl.id] != null) return values[ctrl.id]
  if (ctrl.defaultValue != null && ctrl.max != null && ctrl.min != null && ctrl.max !== ctrl.min) {
    return (ctrl.defaultValue - ctrl.min) / (ctrl.max - ctrl.min)
  }
  return ctrl.mapped ? 0.8 : 0
}

function mapLabel (ctrl) {
  if (ctrl.id === 'velocity') return 'Velocity'
  if (ctrl.midiCC != null && ctrl.midiCC >= 0) return 'CC' + ctrl.midiCC
  return ctrl.target || 'Mapped'
}

function onKnob (ctrl, value) {
  if (!ctrl.mapped) return
  setController(track.value, ctrl.id, value)
}

function togglePedal () {
  if (!pedal.value || !pedal.value.mapped) return
  setController(track.value, 'pedal', pedalOn.value ? 0 : 1)
}

function noteOn (pitch) {
  if (!track.value) return
  held[pitch] = true
  previewNoteOn(track.value, pitch, controllerValue(knobs.value.find((c) => c.id === 'velocity') || { mapped: true, id: 'velocity' }) || 0.8)
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
</script>

<style scoped>
.os { height: 100%; overflow: auto; padding: 12px 16px 18px; background: #141414; }
.hero { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; transition: transform 0.28s ease; }
.hero.flip { transform: rotateY(12deg); }
.glyph {
  width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: 700; color: #e6e6e6; background: #1e1e1e; flex-shrink: 0;
}
.glyph.choir { background: #2a2430; }
.glyph.strings { background: #1f2a24; }
.glyph.piano { background: #242428; }
.glyph.wood { background: #1e2a22; }
.glyph.brass { background: #242018; }
.hero-copy { flex: 1; min-width: 0; }
.name { display: block; color: #e6e6e6; font-size: 16px; font-weight: 700; }
.src { display: block; color: #8d8d8d; font-size: 11px; margin-top: 2px; }
.st { display: block; font-size: 11px; color: #8d8d8d; margin-top: 4px; }
.st.ok { color: #9db89a; }
.st.err { color: #d08a8a; }
.browse {
  padding: 6px 10px; border: 1px solid #3a3a3a; border-radius: 6px; color: #e6e6e6; font-size: 12px; cursor: pointer;
}
.block { margin-bottom: 16px; }
.cap { display: block; font-size: 10px; letter-spacing: 0.12em; color: #8d8d8d; font-weight: 700; margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.chip {
  padding: 6px 10px; border-radius: 999px; background: #1e1e1e; color: #b0b0b0; font-size: 12px; cursor: pointer;
}
.chip.on { background: #2b2b2b; color: #e6e6e6; }
.chip.dim { opacity: 0.4; pointer-events: none; }
.knobs { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.knob-wrap, .toggle { min-width: 72px; text-align: center; }
.map { display: block; font-size: 10px; color: #8d8d8d; margin-top: 4px; }
.toggle {
  height: 72px; border-radius: 10px; background: #1e1e1e; display: flex; flex-direction: column;
  align-items: center; justify-content: center; cursor: pointer; color: #b0b0b0; font-size: 12px;
}
.toggle.on { color: #e6e6e6; background: #2b2b2b; }
.toggle.dim { opacity: 0.4; pointer-events: none; }
.keys-block { margin-top: 8px; }
.keys {
  position: relative; height: 78px; background: #101010; border-radius: 8px; overflow: hidden;
  touch-action: none;
}
.key {
  position: absolute; top: 0; bottom: 0; width: calc(100% / 15); background: #ece6dc; border: 1px solid #c8c2b8;
}
.key.black { height: 48%; width: calc(100% / 22); background: #161616; z-index: 2; border-color: #000; }
.key.down { background: #cfc6b8; }
.key.black.down { background: #3a3a3a; }
@media (max-width: 720px) {
  .glyph { width: 48px; height: 48px; }
  .keys { height: 88px; }
}
</style>
