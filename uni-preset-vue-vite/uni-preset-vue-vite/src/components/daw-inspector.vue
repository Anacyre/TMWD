<template>
  <view class="inspector">
    <view class="head">
      <text>INSPECTOR</text>
      <view class="icon-btn" @click.stop="toggleInspector">×</view>
    </view>
    <scroll-view class="body" scroll-y>
      <view class="title-row">
        <view class="swatch" :style="{ background: track ? track.colour : '#3a3a3a' }" />
        <text class="title">{{ track ? track.name : 'No track selected' }}</text>
      </view>

      <text class="cap">Instrument</text>
      <view
        class="inst-btn"
        :class="{ off: !track || track.type === 'master' }"
        @click.stop="openPicker"
      >
        <text>{{ instrumentLabel }}</text>
      </view>
      <text class="status" :class="{ err: isError }">{{ loadText }}</text>
      <view v-if="track && track.type !== 'master' && track.instrument" class="link" @click="unload">Remove Instrument</view>

      <view v-if="definition && track && track.type === 'midi'" class="inst-block">
        <text class="src">{{ pluginName }}</text>
        <view v-if="techniques.length" class="field">
          <text class="cap">TECHNIQUE</text>
          <view class="select-wrap">
            <text
              v-for="item in techniques"
              :key="item.id"
              class="chip"
              :class="{ on: track.techniqueId === item.id, dim: !item.mapped }"
              @click="setTechnique(track, item.id)"
            >{{ item.displayName }}</text>
          </view>
        </view>
        <view v-for="group in controllerGroups" :key="group.name" class="field">
          <text class="cap">{{ group.name }}</text>
          <view v-for="ctrl in group.items" :key="ctrl.id" class="ctrl">
            <text class="ctrl-name" :class="{ dim: !ctrl.mapped }">{{ ctrl.displayName }}</text>
            <daw-fader
              :model-value="controllerValue(ctrl)"
              @update:model-value="onController(ctrl, $event)"
            />
            <text class="ctrl-val">{{ controllerDisplay(ctrl) }}</text>
          </view>
        </view>
      </view>

      <text class="cap">Track</text>
      <view class="row"><text>Type</text><text>{{ typeLabel }}</text></view>
      <view class="row"><text>Section</text><text>{{ track && track.section ? track.section : '-' }}</text></view>
      <view class="row"><text>Volume</text><text>{{ volumeText }}</text></view>
      <view class="row"><text>Pan</text><text>{{ panText }}</text></view>
      <view class="row"><text>MIDI Channel</text><text>{{ track && track.type === 'midi' ? ('Channel ' + track.midiChannel) : '-' }}</text></view>
      <view class="row"><text>State</text><text>{{ stateText }}</text></view>
      <view class="row"><text>Output</text><text>{{ track && track.type === 'master' ? 'Stereo Out' : 'Master' }}</text></view>

      <text class="cap">Clip</text>
      <view class="row"><text>Name</text><text>{{ clip ? clip.name : '-' }}</text></view>
      <view class="row"><text>Track</text><text>{{ clipTrackName }}</text></view>
      <view class="row"><text>Start</text><text>{{ clipStart }}</text></view>
      <view class="row"><text>Length</text><text>{{ clipLength }}</text></view>
      <view class="row"><text>Notes</text><text>{{ clip ? (clip.notes || []).length : '-' }}</text></view>
      <view class="row"><text>Source</text><text>{{ clip ? (clip.midi ? 'MIDI' : 'Audio') : '-' }}</text></view>

      <text class="cap">Project</text>
      <view class="row"><text>Name</text><text>{{ session.projectName }}</text></view>
      <view class="row"><text>Tempo</text><text>{{ Math.round(session.bpm * 10) / 10 }} BPM</text></view>
      <view class="row"><text>Time Signature</text><text>{{ session.timeSigNum }}/{{ session.timeSigDen }}</text></view>
      <view class="row"><text>Tracks</text><text>{{ Math.max(0, session.tracks.length - 1) }}</text></view>
      <view class="row"><text>Clips</text><text>{{ session.clips.length }}</text></view>
      <view class="row"><text>Engine</text><text>{{ session.engineStatus || engineLink.status }}</text></view>
      <view v-if="session.catalogue.startupStatus" class="note">{{ session.catalogue.startupStatus }}</view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import DawFader from './daw-fader.vue'
import {
  session,
  engineLink,
  getSelectedTrack,
  getSelectedClip,
  toggleInspector,
  definitionById,
  techniqueById,
  controllerById,
  pluginById,
  unloadInstrument,
  setTechnique,
  openInstrumentPicker
} from '../store/session.js'
import { setController } from '../store/session.js'

const track = computed(() => getSelectedTrack())
const clip = computed(() => getSelectedClip())
const definition = computed(() => track.value ? definitionById(track.value.definitionId) : null)

const instrumentLabel = computed(() => {
  if (!track.value || track.value.type === 'master') return '-'
  return track.value.instrument || 'Empty slot'
})

const pluginName = computed(() => {
  if (!definition.value) return ''
  const plugin = pluginById(definition.value.sourcePlugin)
  return plugin ? plugin.displayName : definition.value.sourcePlugin
})

const techniques = computed(() => {
  if (!definition.value) return []
  return (definition.value.techniques || []).map((id) => techniqueById(id) || { id, displayName: id, mapped: false })
})

const controllerGroups = computed(() => {
  if (!definition.value) return []
  const grouped = []
  const seen = new Map()
  ;(definition.value.controllers || []).forEach((id) => {
    const ctrl = controllerById(id)
    if (!ctrl) return
    const name = (ctrl.group || 'Performance').toUpperCase()
    if (!seen.has(name)) {
      seen.set(name, [])
      grouped.push({ name, items: seen.get(name) })
    }
    seen.get(name).push(ctrl)
  })
  return grouped
})

const loadText = computed(() => {
  if (!track.value || track.value.type === 'master') return ''
  return track.value.loadMessage || track.value.loadState || ''
})
const isError = computed(() => {
  const state = track.value && track.value.loadState
  return state === 'Error' || state === 'Unavailable'
})
const typeLabel = computed(() => {
  if (!track.value) return '-'
  if (track.value.type === 'master') return 'Master'
  return track.value.type === 'midi' ? 'Instrument' : 'Audio'
})
const volumeText = computed(() => {
  if (!track.value) return '-'
  const db = 20 * Math.log10(Math.max(0.0001, Math.pow(track.value.volume, 2)))
  return (db > -0.05 ? '0.0' : db.toFixed(1)) + ' dB'
})
const panText = computed(() => {
  if (!track.value) return '-'
  const pan = track.value.pan
  if (Math.abs(pan) < 0.01) return 'C'
  return pan < 0 ? `${Math.round(-pan * 100)} L` : `${Math.round(pan * 100)} R`
})
const stateText = computed(() => {
  if (!track.value) return '-'
  const flags = []
  if (track.value.mute) flags.push('Mute')
  if (track.value.solo) flags.push('Solo')
  if (track.value.recordArm) flags.push('Armed')
  return flags.length ? flags.join(', ') : 'Active'
})
const clipTrackName = computed(() => {
  if (!clip.value) return '-'
  const t = session.tracks[clip.value.trackIndex]
  return t ? t.name : '-'
})
const clipStart = computed(() => clip.value ? `Bar ${(clip.value.startBeat / session.timeSigNum + 1).toFixed(2)}` : '-')
const clipLength = computed(() => clip.value ? `${(clip.value.lengthBeats / session.timeSigNum).toFixed(2)} bars` : '-')

function openPicker () {
  if (!track.value || track.value.type === 'master') return
  openInstrumentPicker(session.selectedTrack)
}

function unload () {
  unloadInstrument(track.value)
}

function controllerValue (ctrl) {
  const values = track.value && track.value.controllerValues
  if (values && values[ctrl.id] != null) return values[ctrl.id]
  if (ctrl.max > ctrl.min) return (ctrl.defaultValue - ctrl.min) / (ctrl.max - ctrl.min)
  return 0
}

function controllerDisplay (ctrl) {
  if (!ctrl.mapped) return 'n/a'
  const t = controllerValue(ctrl)
  return String(Math.round(ctrl.min + t * (ctrl.max - ctrl.min)))
}

function onController (ctrl, value) {
  if (!ctrl.mapped) return
  setController(track.value, ctrl.id, value)
}
</script>

<style scoped>
.inspector {
  width: 100%;
  height: 100%;
  background: #161616;
  border-left: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  position: relative;
}
.head {
  height: 26px;
  background: #1a1a1a;
  border-bottom: 1px solid #2a2a2a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  color: #8d8d8d;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.6px;
}
.body { flex: 1; height: 0; padding: 10px 12px 20px; }
.title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.swatch { width: 10px; height: 10px; border-radius: 2px; }
.title { color: #e6e6e6; font-size: 15px; font-weight: 700; }
.cap {
  display: block;
  color: #6a6a6a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin: 14px 0 6px;
  border-bottom: 1px solid #2a2a2a;
  padding-bottom: 3px;
}
.inst-btn {
  background: #242424;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #e6e6e6;
  padding: 6px 8px;
  font-size: 12px;
  cursor: pointer;
}
.inst-btn.off { color: #6a6a6a; cursor: default; }
.status { display: block; color: #8d8d8d; font-size: 11px; margin-top: 4px; }
.status.err { color: #c45c26; }
.link { color: #8d8d8d; font-size: 11px; margin-top: 4px; cursor: pointer; }
.src { color: #8d8d8d; font-size: 11px; }
.chip {
  display: inline-block;
  margin: 0 6px 6px 0;
  padding: 3px 7px;
  border-radius: 3px;
  background: #2b2b2b;
  color: #c8c8c8;
  font-size: 11px;
  cursor: pointer;
}
.chip.on { background: rgba(77,163,255,0.2); color: #4da3ff; }
.chip.dim { color: #6a6a6a; }
.ctrl { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.ctrl-name { width: 78px; color: #b0b0b0; font-size: 11px; flex-shrink: 0; }
.ctrl-val { width: 28px; text-align: right; color: #6a6a6a; font-size: 10px; }
.dim { color: #6a6a6a; }
.row {
  display: flex;
  justify-content: space-between;
  color: #b0b0b0;
  font-size: 12px;
  padding: 3px 0;
}
.row text:last-child { color: #e6e6e6; }
.note { color: #8d8d8d; font-size: 11px; margin-top: 8px; }
.icon-btn {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #8d8d8d;
}
.browser {
  position: absolute;
  left: 12px;
  right: 12px;
  top: 92px;
  max-height: 280px;
  overflow: auto;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  z-index: 40;
  padding: 6px 0;
}
.drop-item { padding: 6px 12px; color: #e6e6e6; font-size: 12px; cursor: pointer; }
.drop-item:hover { background: #3a3a3a; }
.drop-item.on { color: #4da3ff; }
.drop-item.dim { color: #6a6a6a; }
.group { display: block; color: #6a6a6a; font-size: 10px; padding: 6px 12px 2px; }
.sep { height: 1px; background: #2a2a2a; margin: 6px 10px; }
</style>
