<template>
  <view class="mix" :class="session.mixerMode">
    <view class="head">
      <text class="title">MIX</text>
      <view class="modes">
        <view class="mode" :class="{ on: session.mixerMode === 'compact' }" @click="setMode('compact')" @tap="setMode('compact')">Compact</view>
        <view class="mode" :class="{ on: session.mixerMode === 'detail' }" @click="setMode('detail')" @tap="setMode('detail')">Detail</view>
      </view>
      <view class="head-hits">
        <view class="text-hit" :class="{ on: session.showSends }" @click.stop="toggleSends" @tap.stop="toggleSends">Sends</view>
        <view class="text-hit" @click.stop="loadDemoFxChain" @tap.stop="loadDemoFxChain">Demo</view>
        <view class="icon-close" @click.stop="toggleMixer" @tap.stop="toggleMixer">
          <daw-icon name="chevron" :size="18" />
        </view>
      </view>
    </view>

    <text v-if="routingNotice" class="load-error">{{ routingNotice }}</text>
    <scroll-view class="rack" scroll-x>
      <view class="lane-row">
        <view
          v-for="(track, tIndex) in channelTracks"
          :key="'t' + track.id"
          class="strip"
          :class="{ on: isSelected(track), dim: !isTrackAudible(session.tracks.indexOf(track)) }"
          @click="focusTrack(track)"
          @tap="focusTrack(track)"
        >
          <view class="strip-body">
            <view class="strip-head">
              <view class="accent" :style="{ background: track.colour, opacity: isTrackAudible(session.tracks.indexOf(track)) ? 1 : 0.35 }" />
              <text class="num">{{ trackNum(tIndex) }}</text>
            </view>
            <text class="name">{{ track.name }}</text>
            <text class="inst">{{ instrumentLabel(track) }}</text>
            <view class="slots" :class="{ unrouted: !insertsReachAudio(track) }" :title="insertHint(track)">
              <view
                v-for="slot in MIXER_INSERT_SLOTS"
                :key="'ti' + track.id + slot"
                class="slot"
                :class="slotClass(webTrackInsert(track, slot - 1))"
                @click.stop="onInsert({ type: 'track', id: track.id }, slot - 1, $event)"
                @tap.stop="onInsert({ type: 'track', id: track.id }, slot - 1, $event)"
                @contextmenu.prevent.stop="onSlotMenu({ type: 'track', id: track.id }, slot - 1)"
                @pointerdown.stop="beginSlotDrag({ type: 'track', id: track.id }, slot - 1, $event)"
              >{{ slotLabel(webTrackInsert(track, slot - 1)) }}</view>
            </view>
            <view class="pan-row">
              <daw-knob
                :model-value="track.pan || 0"
                :min="-1"
                :max="1"
                :title="'Pan ' + formatPan(track.pan)"
                @update:model-value="onPan(track, $event)"
                @drag-start="beginMixDrag(track, 'pan')"
                @drag-end="endMixDrag(track, 'pan')"
              />
              <text class="pan-lab">{{ formatPan(track.pan) }}</text>
            </view>
            <view v-if="session.showSends" class="sends">
              <view
                v-for="send in trackSends(track)"
                :key="send.id"
                class="send"
              >
                <text class="send-id">{{ send.name }}</text>
                <view
                  class="send-bar"
                  :class="{ off: !sendsAvailable(track) }"
                  :title="sendsAvailable(track) ? send.name + ' send' : sendHint(track)"
                  @pointerdown.stop.prevent="beginSendLevel(track, send, $event)"
                >
                  <view class="send-fill" :style="{ width: Math.round((send.level || 0) * 100) + '%' }" />
                </view>
              </view>
            </view>
          </view>
          <view class="strip-foot">
            <view class="fader-row">
              <daw-fader
                class="vol"
                orientation="vertical"
                :model-value="track.volume"
                @update:model-value="onVolume(track, $event)"
                @drag-start="beginMixDrag(track, 'volume')"
                @drag-end="endMixDrag(track, 'volume')"
              />
              <view class="meter">
                <view class="meter-fill" :style="meterStyle(trackMeter(track))" />
              </view>
            </view>
            <text class="db">{{ formatVolumeDb(dbFromFader(track.volume)) }}</text>
            <view class="toggles">
              <view class="tog mute" :class="{ on: track.mute }" @click.stop="setTrackParameter(track, 'mute', !track.mute)" @tap.stop="setTrackParameter(track, 'mute', !track.mute)">M</view>
              <view class="tog solo" :class="{ on: track.solo }" @click.stop="setTrackParameter(track, 'solo', !track.solo)" @tap.stop="setTrackParameter(track, 'solo', !track.solo)">S</view>
            </view>
          </view>
        </view>

        <view
          class="strip fx"
          :class="{ on: lane.type === 'remote' }"
          @click="focusLane({ type: 'remote' })"
          @tap="focusLane({ type: 'remote' })"
        >
          <view class="strip-body">
            <text class="name">Mix</text>
            <text class="inst">Orchestra</text>
            <view class="slots">
              <view
                v-for="slot in MIXER_INSERT_SLOTS"
                :key="'ri' + slot"
                class="slot"
                :class="slotClass(remoteInsert(slot - 1))"
                @click.stop="onInsert({ type: 'remote' }, slot - 1, $event)"
                @tap.stop="onInsert({ type: 'remote' }, slot - 1, $event)"
                @contextmenu.prevent.stop="onSlotMenu({ type: 'remote' }, slot - 1)"
                @pointerdown.stop="beginSlotDrag({ type: 'remote' }, slot - 1, $event)"
              >{{ slotLabel(remoteInsert(slot - 1)) }}</view>
            </view>
            <view class="knob dim" />
            <view v-if="session.showSends" class="sends">
              <view v-for="send in remoteSends" :key="send.id" class="send">
                <text class="send-id">{{ send.name }}</text>
                <view class="send-bar" @pointerdown.stop.prevent="beginRemoteSend(send, $event)">
                  <view class="send-fill" :style="{ width: Math.round((send.level || 0) * 100) + '%' }" />
                </view>
              </view>
            </view>
          </view>
          <view class="strip-foot">
            <view class="fader-row">
              <view class="vol ghost" />
              <view class="meter">
                <view class="meter-fill" :style="meterStyle(fxPeak('remote'))" />
              </view>
            </view>
            <text class="db">PC</text>
            <view class="toggles">
              <view class="tog dim">M</view>
              <view class="tog dim">S</view>
            </view>
          </view>
        </view>

        <view
          v-for="bus in session.webMixer.buses"
          :key="bus.id"
          class="strip fx return"
          :class="{ on: lane.type === 'bus' && lane.id === bus.id, dim: bus.mute }"
          @click="focusLane({ type: 'bus', id: bus.id })"
          @tap="focusLane({ type: 'bus', id: bus.id })"
        >
          <view class="strip-body">
            <text class="name">↻ {{ bus.name }}</text>
            <text class="inst">Return</text>
            <view class="slots">
              <view
                v-for="slot in MIXER_INSERT_SLOTS"
                :key="bus.id + 'i' + slot"
                class="slot"
                :class="slotClass(busInsert(bus, slot - 1))"
                @click.stop="onInsert({ type: 'bus', id: bus.id }, slot - 1, $event)"
                @tap.stop="onInsert({ type: 'bus', id: bus.id }, slot - 1, $event)"
                @contextmenu.prevent.stop="onSlotMenu({ type: 'bus', id: bus.id }, slot - 1)"
                @pointerdown.stop="beginSlotDrag({ type: 'bus', id: bus.id }, slot - 1, $event)"
              >{{ slotLabel(busInsert(bus, slot - 1)) }}</view>
            </view>
            <view class="knob dim" />
          </view>
          <view class="strip-foot">
            <view class="fader-row">
              <daw-fader
                class="vol"
                orientation="vertical"
                :model-value="busFader(bus)"
                @update:model-value="setBusVolume(bus, $event)"
              />
              <view class="meter">
                <view class="meter-fill" :style="meterStyle(fxPeak(bus.id === 'bus_delay' ? 'delay' : 'bus'))" />
              </view>
            </view>
            <text class="db">{{ formatVolumeDb(bus.volumeDb != null ? bus.volumeDb : dbFromFader(bus.volume)) }}</text>
            <view class="toggles">
              <view class="tog mute" :class="{ on: bus.mute }" @click.stop="toggleBusMute(bus)" @tap.stop="toggleBusMute(bus)">M</view>
              <view class="tog solo" :class="{ on: bus.solo }" @click.stop="toggleBusSolo(bus)" @tap.stop="toggleBusSolo(bus)">S</view>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view
      v-if="master"
      class="strip master"
      :class="{ on: isSelected(master) || lane.type === 'master', clip: masterClip }"
      @click="focusMaster"
      @tap="focusMaster"
    >
      <view class="strip-body">
        <text class="name">Master</text>
        <text class="inst">Out</text>
        <view class="slots">
          <view
            v-for="slot in MIXER_INSERT_SLOTS"
            :key="'mi' + slot"
            class="slot"
            :class="slotClass(masterInsert(slot - 1))"
            @click.stop="onInsert({ type: 'master' }, slot - 1, $event)"
            @tap.stop="onInsert({ type: 'master' }, slot - 1, $event)"
                @contextmenu.prevent.stop="onSlotMenu({ type: 'master' }, slot - 1)"
                @pointerdown.stop="beginSlotDrag({ type: 'master' }, slot - 1, $event)"
          >{{ slotLabel(masterInsert(slot - 1)) }}</view>
        </view>
      </view>
      <view class="strip-foot">
        <view class="fader-row master-meters">
          <daw-fader
            class="vol"
            orientation="vertical"
            :model-value="master.volume"
            @update:model-value="onVolume(master, $event)"
            @drag-start="beginMixDrag(master, 'volume')"
            @drag-end="endMixDrag(master, 'volume')"
          />
          <view class="meter stereo">
            <view class="meter-fill" :style="meterStyle(master.meterLevel || fxPeak('master'))" />
          </view>
          <view class="meter stereo">
            <view class="meter-fill" :style="meterStyle(fxPeak('master'))" />
          </view>
        </view>
        <text class="db">{{ formatVolumeDb(dbFromFader(master.volume)) }}</text>
        <view class="toggles">
          <view class="tog mute" :class="{ on: master.mute }" @click.stop="setTrackParameter(master, 'mute', !master.mute)" @tap.stop="setTrackParameter(master, 'mute', !master.mute)">M</view>
          <view class="tog clip" :class="{ on: masterClip }">CLIP</view>
        </view>
      </view>
    </view>

    <Teleport to="body">
      <view v-if="picker" class="picker-mask" @click="picker = null" @tap="picker = null">
        <view class="picker" @click.stop @tap.stop>
          <text class="pick-title">{{ picker.insert ? 'Replace' : 'Effect' }}</text>
          <view
            v-for="plugin in catalogue"
            :key="plugin.id"
            class="pick"
            @click="addPlugin(plugin.id)"
            @tap="addPlugin(plugin.id)"
          >
            <text class="pick-short">{{ PLUGIN_SHORT[plugin.id] || plugin.name }}</text>
            <text class="pick-name">{{ plugin.name }}</text>
          </view>
          <view v-if="picker.insert" class="pick remove" aria-label="Remove plugin" @click="removeCurrent" @tap="removeCurrent">
            <daw-icon name="trash" :size="18" />
          </view>
        </view>
      </view>
    </Teleport>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import DawFader from './daw-fader.vue'
import DawKnob from './daw-knob.vue'
import {
  session,
  setTrackParameter,
  selectTrack,
  toggleMixer,
  openPlugin,
  addInsert,
  persistWebMixer,
  loadDemoFxChain,
  setMixerLane,
  listPlugins,
  isTrackAudible,
  flushTrackMix,
  beginMixDrag,
  endMixDrag,
  reorderInserts,
  removeInsert,
  showToast
} from '../store/session.js'
import { laneInserts, MIXER_INSERT_SLOTS, fxMeterLaneKey, isBrowserOwnedTrack } from '../model/web-mixer.js'
import { PLUGIN_SHORT, formatVolumeDb, formatPan, dbFromFader, faderFromDb, canAddInsert, defaultSends } from '../model/mixer-model.js'
import { plugins } from '../dsp/registry.js'
import { beginPointerDrag, pointerCoord } from '../lib/pointer-drag.js'

const picker = ref(null)
const catalogue = computed(() => listPlugins())
const channelTracks = computed(() => session.tracks.filter((track) => track.type !== 'master' && track.type !== 'group'))
const master = computed(() => session.tracks.find((track) => track.type === 'master'))
const lane = computed(() => session.mixerLane || { type: 'remote' })
const remoteSends = computed(() => session.webMixer.remote.sends || defaultSends())
const masterClip = computed(() => !!(session.webMixer.master && session.webMixer.master.clip) || fxPeak('master') >= 1 || (master.value && master.value.meterLevel > 0.99))

/** Never hide a bypass behind an empty UI — say why FX are not being applied. */
const routingNotice = computed(() => {
  if (session.webMixer.loadError) return session.webMixer.loadError
  const warnings = session.diagnostics.routingWarnings || []
  return warnings.length ? warnings[0] : ''
})

function trackNum (index) {
  return String(index + 1).padStart(2, '0')
}

function instrumentLabel (track) {
  if (track.source === 'web-sampler') return 'Sampler'
  if (track.source === 'm-orchestra') return track.instrument || 'M Orchestra'
  if (track.source === 'remote-vst') return track.instrument || 'VST'
  return track.instrument || '—'
}

function isSelected (track) {
  return session.tracks[session.selectedTrack] === track
}

function webTrackInsert (track, index) {
  const key = String(track.id)
  const mix = session.webMixer.tracks[key] || session.webMixer.tracks[track.id]
  return (mix && mix.inserts && mix.inserts[index]) || null
}

function remoteInsert (index) {
  return (session.webMixer.remote.inserts && session.webMixer.remote.inserts[index]) || null
}

function busInsert (bus, index) {
  return (bus.inserts && bus.inserts[index]) || null
}

function masterInsert (index) {
  return (session.webMixer.master.inserts && session.webMixer.master.inserts[index]) || null
}

function slotLabel (slot) {
  if (!slot) return '+'
  return PLUGIN_SHORT[slot.pluginId] || (plugins[slot.pluginId] && plugins[slot.pluginId].name) || '+'
}

function slotClass (slot) {
  return { empty: !slot, off: slot && slot.enabled === false }
}

function meterStyle (level) {
  const amount = Math.min(1, Math.max(0, level || 0))
  const color = amount > 0.99 ? '#c45c4a' : (amount > 0.85 ? '#c4a35a' : '#6a9a6e')
  return { height: Math.round(amount * 100) + '%', background: color }
}

function fxPeak (key) {
  const meters = session.fxMeters[key] || {}
  return meters.outPeak || meters.inPeak || 0
}

function trackMeter (track) {
  const key = fxMeterLaneKey({ laneType: 'track', laneId: track.id }, session.tracks, {
    localPlayback: !session.remoteAudioOn
  })
  const fx = fxPeak(key)
  if (fx > 0) return fx
  return track.meterLevel || 0
}

function trackSends (track) {
  const mix = session.webMixer.tracks[String(track.id)]
  return (mix && mix.sends && mix.sends.length) ? mix.sends : (track.sends && track.sends.length ? track.sends : defaultSends())
}

function busFader (bus) {
  if (bus.volumeDb != null) return faderFromDb(bus.volumeDb)
  return bus.volume == null ? 0.8 : bus.volume
}

function setMode (mode) {
  session.mixerMode = mode
}

function toggleSends () {
  session.showSends = !session.showSends
}

function focusLane (next) {
  setMixerLane(next)
  picker.value = null
}

function focusMaster () {
  setMixerLane({ type: 'master' })
  selectTrack(0)
  picker.value = null
}

function focusTrack (track) {
  setMixerLane({ type: 'track', id: track.id })
  selectTrack(session.tracks.indexOf(track))
  picker.value = null
}

function onInsert (nextLane, index, event) {
  if (event && event.button === 2) return
  const list = laneInserts(session.webMixer, nextLane)
  setMixerLane(nextLane)
  if (list[index]) {
    picker.value = null
    openPlugin(nextLane, index)
    return
  }
  if (!canAddInsert(list)) {
    showToast('Maximum 5 effects on this channel')
    return
  }
  picker.value = { lane: nextLane, index }
}

function onSlotMenu (nextLane, index) {
  const list = laneInserts(session.webMixer, nextLane)
  if (!list[index]) return
  setMixerLane(nextLane)
  picker.value = { lane: nextLane, index, insert: list[index] }
}

function addPlugin (pluginId) {
  if (!picker.value) return
  const { lane, index } = picker.value
  picker.value = null
  addInsert(lane, pluginId, index)
}

function removeCurrent () {
  if (!picker.value) return
  const { lane, index } = picker.value
  picker.value = null
  removeInsert(lane, index)
}

function onVolume (track, value) {
  setTrackParameter(track, 'volume', value)
  flushTrackMix()
}

function onPan (track, value) {
  setTrackParameter(track, 'pan', value)
  flushTrackMix()
}

function setBusVolume (bus, value) {
  bus.volume = value
  bus.volumeDb = dbFromFader(value)
  persistWebMixer()
}

function toggleBusMute (bus) {
  bus.mute = !bus.mute
  persistWebMixer()
}

function toggleBusSolo (bus) {
  bus.solo = !bus.solo
  persistWebMixer()
}

/** A send only does something when the browser owns this track's audio. */
function sendsAvailable (track) {
  return isBrowserOwnedTrack(track, { localPlayback: !session.remoteAudioOn })
}

function sendHint (track) {
  if (sendsAvailable(track)) return ''
  return (track.name || 'This track') + ' plays through the PC engine, which has no send bus yet'
}

function insertsReachAudio (track) {
  if (sendsAvailable(track)) return true
  return !!session.remoteAudioOn
}

function insertHint (track) {
  if (insertsReachAudio(track)) return 'Inserts (5 slots)'
  return 'Connect the PC engine to hear inserts on ' + (track.name || 'this track')
}

function dragSendLevel (send, event, onCommit) {
  const bar = event.currentTarget
  const rect = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect() : null
  const startX = event.clientX
  const start = send.level || 0
  // Prefer absolute positioning inside the bar; fall back to relative dragging
  // when the bar has not been laid out yet.
  const apply = (clientX) => {
    const next = rect && rect.width > 1
      ? (clientX - rect.left) / rect.width
      : start + (clientX - startX) / 90
    send.level = Math.min(1, Math.max(0, next))
    send.enabled = send.level > 0.001
    onCommit()
    persistWebMixer()
  }
  apply(startX)
  beginPointerDrag(event, {
    onMove: (ev) => apply(ev.clientX),
    onEnd: () => flushTrackMix()
  })
}

function beginSendLevel (track, send, event) {
  if (!sendsAvailable(track)) {
    showToast(sendHint(track))
    return
  }
  dragSendLevel(send, event, () => {
    const mix = session.webMixer.tracks[String(track.id)]
    if (mix) mix.sends = trackSends(track)
  })
}

function beginRemoteSend (send, event) {
  dragSendLevel(send, event, () => {})
}

let dragSlot = null
let longPress = 0

function clearSlotDragTimer () {
  if (longPress) {
    clearTimeout(longPress)
    longPress = 0
  }
}

function beginSlotDrag (nextLane, index, event) {
  const list = laneInserts(session.webMixer, nextLane)
  if (!list[index]) return
  const start = pointerCoord(event)
  if (!start) return
  const isMouse = !event.pointerType || event.pointerType === 'mouse'
  const startDrag = () => {
    longPress = 0
    dragSlot = { lane: nextLane, index, startY: start.y }
    beginPointerDrag(event, {
      onMove: (ev) => {
        if (!dragSlot) return
        const now = pointerCoord(ev)
        if (!now) return
        const delta = Math.round((now.y - dragSlot.startY) / 36)
        if (!Number.isFinite(delta) || delta === 0) return
        const target = Math.min(MIXER_INSERT_SLOTS - 1, Math.max(0, dragSlot.index + delta))
        if (target === dragSlot.index) return
        reorderInserts(dragSlot.lane, dragSlot.index, target)
        dragSlot.index = target
        dragSlot.startY = now.y
      },
      onEnd: () => {
        clearSlotDragTimer()
        dragSlot = null
        flushTrackMix()
      }
    })
  }
  // Touch: do not capture the pointer on tap — iPad Safari otherwise swallows
  // click/tap, so preloaded inserts can never be opened. Long-press still reorders.
  if (!isMouse) {
    clearSlotDragTimer()
    longPress = setTimeout(startDrag, 280)
    const cancel = () => {
      clearSlotDragTimer()
      window.removeEventListener('pointerup', cancel)
      window.removeEventListener('pointercancel', cancel)
    }
    window.addEventListener('pointerup', cancel)
    window.addEventListener('pointercancel', cancel)
    return
  }
  startDrag()
}
</script>

<style scoped>
.mix {
  height: 100%;
  background: #141414;
  color: #dedad4;
  display: flex;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  position: relative;
  container-type: size;
  min-height: 0;
}
.head {
  position: absolute;
  left: 0;
  right: 88px;
  top: 0;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  z-index: 2;
  pointer-events: none;
}
.head > * { pointer-events: auto; }
.title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #7a776f;
}
.modes { display: flex; gap: 2px; }
.mode {
  height: 22px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  font-size: 11px;
  color: #8a8680;
  min-width: 48px;
  justify-content: center;
}
.mode.on { color: #dedad4; }
.head-hits { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.text-hit {
  font-size: 11px;
  color: #8a8680;
  height: 28px;
  min-width: 44px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.text-hit.on, .text-hit:active { color: #dedad4; }
.load-error {
  position: absolute;
  left: 10px;
  right: 96px;
  top: 28px;
  z-index: 3;
  font-size: 11px;
  color: #d07060;
  pointer-events: none;
}
.icon-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  margin-top: 28px;
  height: calc(100% - 28px);
}
.lane-row {
  display: flex;
  height: 100%;
  width: max-content;
  min-height: 0;
}
.strip {
  width: 80px;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  padding: 4px 6px 6px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
  overflow: hidden;
}
.strip-body {
  flex: 0 1 auto;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.strip-foot {
  /* Fader (72) + readout (18) + toggles (40) — anything less collapsed the
     vertical fader to zero height and made it undraggable. */
  flex: 1 0 132px;
  min-height: 132px;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.strip.on { background: #1c1c1c; }
.strip.dim { opacity: 0.45; }
.strip-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 2px;
}
.strip-head .accent {
  width: 3px;
  height: 14px;
  border-radius: 1px;
  flex-shrink: 0;
}
.strip-head .num {
  font-size: 9px;
  color: #6a6760;
  letter-spacing: 0.06em;
}
.pan-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 6px 0 4px;
}
.pan-row :deep(.knob) {
  width: 36px;
  height: 36px;
}
.pan-lab {
  font-size: 8px;
  color: #6a6760;
  letter-spacing: 0.04em;
}
.strip.fx { width: 80px; }
.strip.master {
  width: 96px;
  border-left: 1px solid #2a2a2a;
  background: #141414;
  flex-shrink: 0;
  height: 100%;
  min-height: 0;
  padding-top: 32px;
  box-sizing: border-box;
  overflow: hidden;
}
.strip.master.on { background: #1c1c1c; }
.strip.master.clip .name { color: #d07060; }
.name {
  width: 100%;
  text-align: center;
  font-size: 11px;
  font-weight: 650;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inst {
  width: 100%;
  text-align: center;
  font-size: 9px;
  color: #7a776f;
  line-height: 12px;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.slots {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-height: 0;
  overflow: hidden;
  flex: 0 1 auto;
}
.slot {
  width: 100%;
  min-height: 28px;
  height: 28px;
  flex-shrink: 0;
  cursor: pointer;
  background: #222;
  color: #c8c4bc;
  font-size: 10px;
  letter-spacing: 0.04em;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.slot.empty { background: transparent; color: #5a5852; }
.slot.off { color: #5a5852; }
.knob {
  width: 40px;
  height: 40px;
  margin: 8px 0 6px;
  border-radius: 20px;
  background: #222;
  position: relative;
  flex-shrink: 0;
}
.knob::after {
  content: '';
  position: absolute;
  left: 19px;
  top: 6px;
  width: 2px;
  height: 12px;
  background: #dedad4;
}
.knob.dim { opacity: 0.2; }
.sends { width: 100%; display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.send { display: flex; align-items: center; gap: 4px; }
.send-id { font-size: 9px; color: #7a776f; width: 10px; }
.send-bar { flex: 1; height: 12px; background: #1a1a1a; touch-action: none; }
.send-bar.off { opacity: 0.3; }
.send-fill { height: 100%; background: #6a6a64; min-width: 0; }
.slots.unrouted { opacity: 0.5; }
.fader-row {
  flex: 1;
  min-height: 72px;
  width: 100%;
  display: flex;
  gap: 6px;
  padding: 2px 4px 0 8px;
  align-items: stretch;
}
.master-meters { padding-left: 4px; }
.vol { flex: 1; min-width: 22px; min-height: 0; }
.vol.ghost { visibility: hidden; }
.meter {
  width: 8px;
  height: auto;
  min-height: 0;
  align-self: stretch;
  background: #0c0c0c;
  display: flex;
  align-items: flex-end;
  flex-shrink: 0;
}
.meter.stereo { width: 7px; }
.meter-fill { width: 100%; min-height: 1px; }
.db {
  font-size: 10px;
  color: #8a8680;
  line-height: 16px;
  text-align: center;
  width: 100%;
  margin-top: 2px;
  flex-shrink: 0;
}
.toggles {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
}
.tog {
  min-width: 36px;
  height: 36px;
  background: #222;
  color: #8a8680;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.tog.mute.on { color: #141414; background: #c4a07a; }
.tog.solo.on { color: #141414; background: #7aaa7e; }
.tog.clip { min-width: 40px; font-size: 8px; letter-spacing: 0.06em; }
.tog.clip.on { color: #141414; background: #d07060; }
.tog.dim { opacity: 0.28; pointer-events: none; }
.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 1100;
  display: flex;
  align-items: center;
  justify-content: center;
}
.picker {
  width: min(400px, 92vw);
  min-width: 240px;
  background: #1c1c1c;
  padding: 10px 0 8px;
  border-radius: 10px;
}
.pick-title {
  display: block;
  padding: 4px 16px 10px;
  color: #7a776f;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.pick {
  min-height: 48px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.pick-short {
  width: 48px;
  font-size: 11px;
  letter-spacing: 0.06em;
  color: #8a8680;
}
.pick-name { font-size: 14px; color: #dedad4; }
.mix.compact .slot { min-height: 22px; height: 22px; }
.mix.detail .strip { width: 92px; }
.mix.detail .slot { min-height: 36px; height: 36px; font-size: 11px; }
.mix.detail .tog { min-width: 40px; height: 40px; }
@container (max-height: 240px) {
  .inst, .sends { display: none; }
  .pan-row { margin: 2px 0; }
  .pan-row .pan-lab { display: none; }
}
@container (max-height: 190px) {
  /* Last resort: drop pan rather than starve the fader of height. */
  .pan-row, .knob { display: none; }
  .strip-foot { flex-basis: 110px; min-height: 110px; }
  .fader-row { min-height: 56px; }
}
@media (max-width: 720px) {
  .strip, .strip.fx { width: 88px; }
  .strip.master { width: 104px; }
  .slot { min-height: 36px; height: 36px; }
  .tog { min-width: 40px; height: 40px; }
  .toggles { height: 44px; }
  .send-bar { height: 14px; }
  .picker-mask { align-items: center; }
  .picker {
    width: min(400px, 92vw);
    min-width: 0;
    border-radius: 10px;
    padding-bottom: 12px;
  }
  .pick { min-height: 52px; }
}
</style>
