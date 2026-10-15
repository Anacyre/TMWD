<template>
  <orchestra-panel
    :title="currentName"
    :status="statusText"
    :status-tone="statusTone"
    :families="FAMILIES"
    :family-id="familyId"
    :instruments="INSTRUMENTS"
    :selected-id="selectedId"
    :techniques="techniques"
    :technique-id="techniqueId"
    :dynamics="controllerValue('dynamics')"
    :expression="controllerValue('expression')"
    :show-change="false"
    @family="familyId = $event"
    @select="selectInstrument"
    @technique="onTechnique"
    @controller="onController"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import OrchestraPanel from '../orchestra-panel.vue'
import {
  FAMILIES,
  INSTRUMENTS,
  familyOf,
  mOrchestraInstrument,
  cloudTechniquesFor
} from '../../model/m-orchestra-ui.js'
import { getSelectedTrack, loadInstrument, setController, setTechnique } from '../../store/session.js'

const familyId = ref(FAMILIES[0].id)
const track = computed(() => getSelectedTrack())
const selectedId = computed(() => (track.value && track.value.definitionId) || '')
const techniques = computed(() => cloudTechniquesFor(selectedId.value))
const techniqueId = computed(() => (track.value && track.value.techniqueId) || '')

watch(selectedId, (id) => {
  if (id) familyId.value = familyOf(id)
}, { immediate: true })

const currentName = computed(() => {
  const item = mOrchestraInstrument(selectedId.value)
  return item ? item.name : ((track.value && track.value.instrument) || 'M Orchestra')
})
const loadState = computed(() => String((track.value && track.value.instrumentLoadState) || '').toLowerCase())
const statusTone = computed(() => (loadState.value === 'error' ? 'err' : ''))
const statusText = computed(() => {
  if (!track.value) return ''
  return ['M Orchestra', track.value.instrumentLoadMessage].filter(Boolean).join(' · ')
})

function controllerValue (id) {
  const raw = ((track.value && track.value.controllerValues) || {})[id]
  if (raw == null || !Number.isFinite(Number(raw))) return 100 / 127
  const value = Number(raw)
  return Math.max(0, Math.min(1, value > 1 ? value / 127 : value))
}

function onController (id, value) {
  if (track.value) setController(track.value, id, value)
}

function onTechnique (id) {
  if (track.value) setTechnique(track.value, id)
}

function selectInstrument (id) {
  if (!track.value || id === selectedId.value) return
  loadInstrument(track.value, id)
}
</script>
