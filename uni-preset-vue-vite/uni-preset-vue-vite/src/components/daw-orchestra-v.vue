<template>
  <orchestra-panel
    :title="currentName"
    :status="statusText"
    :status-tone="statusTone"
    :families="FAMILIES"
    :family-id="familyId"
    :instruments="libraryInstruments"
    :selected-id="selectedId"
    :libraries="LIBRARY_OPTIONS"
    :library-id="libraryId"
    :techniques="techniques"
    :technique-id="currentTechniqueId"
    :dynamics="controllerValue('dynamics')"
    :expression="controllerValue('expression')"
    :show-change="true"
    :stacked="compact"
    keyboard
    :key-low="range[0]"
    :key-high="range[1]"
    @note-on="onNoteOn"
    @note-off="onNoteOff"
    @family="familyId = $event"
    @library="libraryId = $event"
    @select="selectInstrument"
    @technique="onTechnique"
    @controller="onController"
    @change="changePlugin"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import OrchestraPanel from './orchestra-panel.vue'
import {
  CONTROLLERS,
  DEFAULT_LIBRARY_ID,
  FAMILIES,
  INSTRUMENTS,
  LIBRARY_OPTIONS,
  familyOf,
  libraryIdFor,
  keyRangeFor,
  orchestraVInstrument,
  techniquesFor
} from '../model/orchestra-v-ui.js'
import {
  getSelectedTrack,
  loadInstrument,
  previewNoteOff,
  previewNoteOn,
  setController,
  setTechnique,
  openPluginPicker
} from '../store/session.js'

defineProps({
  compact: { type: Boolean, default: false },
  lite: { type: Boolean, default: false }
})

const familyId = ref(FAMILIES[0].id)
const libraryId = ref(DEFAULT_LIBRARY_ID)

const track = computed(() => getSelectedTrack())
const selectedId = computed(() => (track.value && track.value.definitionId) || '')
const current = computed(() => orchestraVInstrument(selectedId.value))
const techniques = computed(() => techniquesFor(selectedId.value))
const currentTechniqueId = computed(() => (track.value && track.value.techniqueId) || '')
const libraryInstruments = computed(() => INSTRUMENTS.filter((item) => item.library === libraryId.value))

watch(selectedId, (id) => {
  if (!id) return
  libraryId.value = libraryIdFor(id)
  const family = familyOf(id)
  if (family) familyId.value = family
}, { immediate: true })

const range = computed(() => keyRangeFor(selectedId.value))

const currentName = computed(() => {
  if (current.value) return current.value.name
  return (track.value && track.value.instrument) || 'Orchestra V'
})

const loadState = computed(() => String((track.value && track.value.instrumentLoadState) || '').toLowerCase())
const statusTone = computed(() => {
  if (loadState.value === 'error' || loadState.value === 'unavailable') return 'err'
  if (loadState.value === 'loaded' || loadState.value === 'ready' || loadState.value === 'active') return 'ok'
  return ''
})
const statusText = computed(() => {
  if (!track.value || track.value.type === 'master') return ''
  const library = LIBRARY_OPTIONS.find((item) => item.id === libraryIdFor(selectedId.value))
  const message = track.value.instrumentLoadMessage || track.value.instrumentLoadState || ''
  return [library && library.label, message].filter(Boolean).join(' · ')
})

function controllerValue (id) {
  const ctrl = CONTROLLERS.find((item) => item.id === id) || { defaultValue: 0.8 }
  const raw = ((track.value && track.value.controllerValues) || {})[id]
  if (raw == null || !Number.isFinite(Number(raw))) return ctrl.defaultValue
  const value = Number(raw)
  return Math.max(0, Math.min(1, value > 1 ? value / 127 : value))
}

function onController (id, value) {
  if (track.value) setController(track.value, id, value)
}

function onNoteOn (pitch) {
  if (track.value) previewNoteOn(track.value, pitch, controllerValue('dynamics'))
}

function onNoteOff (pitch) {
  if (track.value) previewNoteOff(track.value, pitch)
}

function onTechnique (id) {
  if (track.value) setTechnique(track.value, id)
}

function selectInstrument (id) {
  if (!track.value || id === selectedId.value) return
  loadInstrument(track.value, id)
}

function changePlugin () {
  if (track.value) openPluginPicker(track.value)
}
</script>
