<template>
  <view class="lite-mixer">
    <view class="rack">
      <view
        v-for="strip in strips"
        :key="strip.key"
        class="strip"
        :class="{ on: strip.selected, dim: strip.dim }"
      >
        <view class="accent" :style="{ background: strip.colour }" />
        <view class="name" @click="selectStrip(strip)">
          <text class="name-text">{{ strip.name }}</text>
        </view>
        <view class="inserts">
          <template v-for="(slot, i) in strip.slots" :key="i">
            <view v-if="slot" class="insert" :class="{ off: slot.enabled === false }">
              <view class="power" @click.stop="toggleInsertEnabled(strip.lane, i)">
                <view class="power-dot" />
              </view>
              <text class="insert-name" @click.stop="openPlugin(strip.lane, i)">{{ pluginName(slot) }}</text>
            </view>
            <view v-else-if="i === strip.firstEmpty" class="insert add" @click.stop="addEffect(strip, i)">
              <daw-icon name="plus" :size="14" color="currentColor" />
              <text>Effect</text>
            </view>
            <view v-else class="insert blank" />
          </template>
        </view>
        <view v-if="strip.kind === 'track'" class="sends">
          <view class="send" @pointerdown.stop.prevent="onSendDown(strip, 'bus_reverb', $event)">
            <text class="send-name">Reverb</text>
            <view class="send-track"><view class="send-fill" :style="{ width: (strip.reverb * 100) + '%' }" /></view>
          </view>
          <view class="send" @pointerdown.stop.prevent="onSendDown(strip, 'bus_delay', $event)">
            <text class="send-name">Delay</text>
            <view class="send-track"><view class="send-fill" :style="{ width: (strip.delay * 100) + '%' }" /></view>
          </view>
        </view>
        <view
          v-if="strip.pan != null"
          class="pan"
          @pointerdown.stop.prevent="onPanDown(strip, $event)"
        >
          <view class="pan-track">
            <view class="pan-fill" :style="panFill(strip.pan)" />
            <view class="pan-centre" />
          </view>
          <text class="pan-label">{{ formatPan(strip.pan) }}</text>
        </view>
        <view v-else class="pan ghost"><text class="pan-label">{{ strip.kind === 'master' ? 'Master' : 'Return' }}</text></view>
        <view class="level">
          <daw-fader
            class="fader"
            orientation="vertical"
            :label="strip.name + ' volume'"
            :model-value="strip.volume"
            @update:model-value="setVolume(strip, $event)"
            @drag-start="dragStart(strip)"
            @drag-end="dragEnd(strip)"
          />
          <daw-meter class="meter" :level="strip.meter" />
        </view>
        <text class="db">{{ strip.db }}</text>
        <view class="toggles">
          <view class="tog" :class="{ mute: strip.mute }" @click.stop="toggleMute(strip)">M</view>
          <view v-if="strip.kind === 'track'" class="tog" :class="{ solo: strip.solo }" @click.stop="toggleSolo(strip)">S</view>
        </view>
      </view>
    </view>
    <view v-if="masterStrip" class="dock">
      <view class="strip master" :class="{ on: masterStrip.selected }">
        <view class="name">
          <text class="name-text">Master</text>
        </view>
        <view class="inserts">
          <template v-for="(slot, i) in masterStrip.slots" :key="i">
            <view v-if="slot" class="insert" :class="{ off: slot.enabled === false }">
              <view class="power" @click.stop="toggleInsertEnabled(masterStrip.lane, i)">
                <view class="power-dot" />
              </view>
              <text class="insert-name" @click.stop="openPlugin(masterStrip.lane, i)">{{ pluginName(slot) }}</text>
            </view>
            <view v-else-if="i === masterStrip.firstEmpty" class="insert add" @click.stop="addEffect(masterStrip, i)">
              <daw-icon name="plus" :size="14" color="currentColor" />
              <text>Effect</text>
            </view>
            <view v-else class="insert blank" />
          </template>
        </view>
        <view class="pan ghost" />
        <view class="level">
          <daw-fader
            class="fader"
            orientation="vertical"
            label="Master volume"
            :model-value="masterStrip.volume"
            @update:model-value="setVolume(masterStrip, $event)"
          />
          <daw-meter class="meter" :level="masterStrip.meter" />
        </view>
        <text class="db">{{ masterStrip.db }}</text>
        <view class="toggles">
          <view class="tog" :class="{ mute: masterStrip.mute }" @click.stop="toggleMute(masterStrip)">M</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import DawFader from '../daw-fader.vue'
import DawMeter from '../daw-meter.vue'
import DawIcon from '../daw-icon.vue'
import {
  session,
  selectTrack,
  setTrackParameter,
  flushTrackMix,
  beginMixDrag,
  endMixDrag,
  isTrackAudible,
  openLiteSheet,
  openPlugin,
  setTrackSend,
  toggleInsertEnabled,
  ensureMixerAttached,
  persistWebMixer
} from '../../store/session.js'
import { plugins } from '../../dsp/registry.js'
import { formatVolumeDb, formatPan, dbFromFader, faderFromDb, normalizeSends, BUS_REVERB, BUS_DELAY } from '../../model/mixer-model.js'
import { fxMeterLaneKey, laneInserts } from '../../model/web-mixer.js'
import { beginPointerDrag, pointerCoord } from '../../lib/pointer-drag.js'

const PAN_TRAVEL_PX = 140

function lanePeak (key) {
  const posted = (session.fxMeters || {})[key]
  return posted ? (posted.outPeak || posted.inPeak || 0) : 0
}

function slotsOf (lane) {
  const list = laneInserts(session.webMixer, lane).slice(0, 5)
  while (list.length < 5) list.push(null)
  return list.map((slot) => (slot && slot.pluginId ? slot : null))
}

function sendAmount (track, busId) {
  return normalizeSends(track && track.sends)
    .filter((send) => send.destination === busId && send.enabled)
    .reduce((sum, send) => sum + (Number(send.level) || 0), 0)
}

function trackStrip (track, index) {
  const master = track.type === 'master'
  const group = track.type === 'group'
  const lane = master ? { type: 'master' } : { type: 'track', id: track.id }
  const slots = slotsOf(lane)
  const db = track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume)
  const meterKey = master
    ? 'master'
    : fxMeterLaneKey({ laneType: 'track', laneId: track.id }, session.tracks, { localPlayback: !session.remoteAudioOn })
  return {
    key: 't' + track.id,
    kind: master ? 'master' : (group ? 'group' : 'track'),
    reverb: group || master ? 0 : Math.min(1, sendAmount(track, BUS_REVERB)),
    delay: group || master ? 0 : Math.min(1, sendAmount(track, BUS_DELAY)),
    track,
    index,
    lane,
    slots,
    firstEmpty: slots.findIndex((slot) => !slot),
    name: track.name,
    colour: track.colour || '#3a3d44',
    selected: session.selectedTrack === index,
    dim: !master && !isTrackAudible(index),
    volume: track.volume,
    db: formatVolumeDb(db),
    pan: master ? null : (track.pan || 0),
    mute: !!track.mute,
    solo: !!track.solo,
    meter: Math.max(track.meterLevel || 0, lanePeak(meterKey))
  }
}

function busStrip (bus) {
  const lane = { type: 'bus', id: bus.id }
  const slots = slotsOf(lane)
  const volume = bus.volumeDb != null ? faderFromDb(bus.volumeDb) : (bus.volume == null ? 0.8 : bus.volume)
  const db = bus.volumeDb != null ? bus.volumeDb : dbFromFader(volume)
  return {
    key: 'b' + bus.id,
    kind: 'bus',
    bus,
    lane,
    slots,
    firstEmpty: slots.findIndex((slot) => !slot),
    name: bus.name,
    colour: '#4a5a6e',
    selected: false,
    dim: !!bus.mute,
    volume,
    db: formatVolumeDb(db),
    pan: null,
    mute: !!bus.mute,
    solo: false,
    meter: lanePeak(bus.id === 'bus_delay' ? 'delay' : 'bus')
  }
}

const strips = computed(() => {
  const list = []
  session.tracks.forEach((track, index) => {
    if (track.type !== 'master') list.push(trackStrip(track, index))
  })
  ;(session.webMixer.buses || []).forEach((bus) => list.push(busStrip(bus)))
  return list
})

const masterStrip = computed(() => {
  const index = session.tracks.findIndex((track) => track.type === 'master')
  return index >= 0 ? trackStrip(session.tracks[index], index) : null
})

function pluginName (slot) {
  const def = plugins[slot.pluginId]
  return (def && def.name) || slot.name || slot.pluginId
}

function selectStrip (strip) {
  if (strip.index != null) selectTrack(strip.index)
}

function addEffect (strip, slot) {
  openLiteSheet({ kind: 'fx', lane: strip.lane, slot, replace: false })
}

function setVolume (strip, value) {
  if (strip.kind === 'bus') {
    strip.bus.volume = value
    strip.bus.volumeDb = dbFromFader(value)
    persistWebMixer()
    return
  }
  setTrackParameter(strip.track, 'volume', value)
  flushTrackMix()
}

function dragStart (strip) {
  if (strip.track) beginMixDrag(strip.track, 'volume')
}

function dragEnd (strip) {
  if (strip.track) endMixDrag(strip.track, 'volume')
}

function toggleMute (strip) {
  if (strip.kind === 'bus') {
    strip.bus.mute = !strip.bus.mute
    persistWebMixer()
    return
  }
  setTrackParameter(strip.track, 'mute', !strip.track.mute)
}

function toggleSolo (strip) {
  setTrackParameter(strip.track, 'solo', !strip.track.solo)
}

function panFill (pan) {
  const p = Math.max(-1, Math.min(1, pan || 0))
  const left = 50 + Math.min(0, p) * 50
  const width = Math.abs(p) * 50
  return { left: left + '%', width: width + '%' }
}

let lastPanTap = { key: '', at: 0 }

function sendNode (event) {
  const raw = event && event.target
  const node = raw && raw.nodeType === 1 ? raw : (raw && raw.parentElement)
  return node && node.closest ? node.closest('.send') : null
}

function onSendDown (strip, busId, event) {
  const el = sendNode(event)
  const apply = (ev) => {
    if (!el || !el.getBoundingClientRect) return
    const at = pointerCoord(ev)
    if (!at) return
    const rect = el.getBoundingClientRect()
    const bar = el.querySelector('.send-track')
    const box = bar && bar.getBoundingClientRect ? bar.getBoundingClientRect() : rect
    const level = Math.min(1, Math.max(0, (at.x - box.left) / Math.max(8, box.width)))
    setTrackSend(strip.track, busId, level < 0.02 ? 0 : level)
  }
  apply(event)
  beginPointerDrag(event, { onMove: apply })
}

function onPanDown (strip, event) {
  const now = Date.now()
  if (lastPanTap.key === strip.key && now - lastPanTap.at < 320) {
    setTrackParameter(strip.track, 'pan', 0)
    flushTrackMix()
    lastPanTap = { key: '', at: 0 }
    return
  }
  lastPanTap = { key: strip.key, at: now }
  let start = pointerCoord(event)
  const startPan = strip.track.pan || 0
  beginMixDrag(strip.track, 'pan')
  beginPointerDrag(event, {
    onMove: (ev) => {
      const at = pointerCoord(ev)
      if (!at) return
      if (!start) {
        start = at
        return
      }
      const next = Math.max(-1, Math.min(1, startPan + ((at.x - start.x) / PAN_TRAVEL_PX) * 2))
      setTrackParameter(strip.track, 'pan', Math.abs(next) < 0.03 ? 0 : next)
      flushTrackMix()
    },
    onEnd: () => endMixDrag(strip.track, 'pan')
  })
}

onMounted(() => {
  ensureMixerAttached().catch(() => {})
})
</script>

<style scoped>
.lite-mixer {
  flex: 1;
  min-height: 0;
  display: flex;
  background: var(--lt-bg);
  overflow: hidden;
}
.rack {
  flex: 1;
  min-width: 0;
  display: flex;
  gap: 8px;
  padding: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  box-sizing: border-box;
}
.rack::-webkit-scrollbar { display: none; }
.dock {
  flex-shrink: 0;
  padding: 12px 12px 12px 4px;
  box-shadow: -1px 0 0 var(--lt-line);
  display: flex;
  box-sizing: border-box;
}
.strip {
  width: 112px;
  flex: 0 0 112px;
  display: flex;
  flex-direction: column;
  background: var(--lt-s1);
  border-radius: var(--lt-radius-lg);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}
.strip.on { background: var(--lt-s2); }
.strip.dim .level, .strip.dim .db { opacity: 0.4; }
.strip.master { background: var(--lt-s2); }
.accent {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 3px;
}
.name {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 10px;
  cursor: pointer;
}
.name-text {
  font-size: var(--lt-fs-s);
  font-weight: 600;
  color: var(--lt-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inserts {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 0 6px 8px;
  box-shadow: inset 0 -1px 0 var(--lt-line);
}
.insert {
  height: 30px;
  display: flex;
  align-items: center;
  border-radius: 7px;
  background: var(--lt-s3);
  font-size: 12px;
  color: var(--lt-ink);
  overflow: hidden;
}
.insert.blank { background: transparent; }
.insert.add {
  background: transparent;
  color: var(--lt-ink-2);
  justify-content: center;
  gap: 4px;
  box-shadow: inset 0 0 0 1px var(--lt-line-2);
  cursor: pointer;
}
.insert.add .icon { width: auto; height: auto; }
.power {
  width: 28px;
  height: 30px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.power-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--lt-ok);
  box-shadow: 0 0 6px rgba(76, 195, 138, 0.6);
}
.insert.off .power-dot { background: transparent; box-shadow: inset 0 0 0 1.5px var(--lt-ink-2); }
.insert.off .insert-name { color: var(--lt-ink-2); text-decoration: line-through; text-decoration-color: rgba(139, 142, 150, 0.5); }
.insert-name {
  flex: 1;
  min-width: 0;
  height: 30px;
  line-height: 30px;
  padding-right: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.sends {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 8px 2px;
}
.send {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 18px;
  touch-action: none;
  cursor: pointer;
}
.send-name {
  width: 42px;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--lt-ink-2);
}
.send-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--lt-s3);
  position: relative;
}
.send-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  border-radius: 2px;
  background: var(--lt-accent);
}
.pan {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px;
  touch-action: none;
  cursor: ew-resize;
}
.pan.ghost { cursor: default; }
.pan-track {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--lt-s3);
  position: relative;
}
.pan-fill {
  position: absolute;
  top: 0;
  bottom: 0;
  background: var(--lt-accent);
  border-radius: 2px;
}
.pan-centre {
  position: absolute;
  left: 50%;
  top: -3px;
  width: 2px;
  height: 10px;
  margin-left: -1px;
  border-radius: 1px;
  background: var(--lt-ink-2);
}
.pan-label {
  font-size: 11px;
  color: var(--lt-ink-2);
  font-variant-numeric: tabular-nums;
}
.level {
  flex: 1;
  min-height: 80px;
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 6px 0;
}
.fader { height: 100%; width: 36px; min-width: 36px; }
.fader :deep(.track) { width: 4px; background: var(--lt-s3); border-radius: 2px; }
.fader :deep(.fill) { background: var(--lt-ink-2); border-radius: 2px; }
.fader :deep(.cap) {
  width: 32px;
  height: 18px;
  border-radius: 5px;
  background: #e8e9ec;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}
.meter { width: 4px; height: 100%; border-radius: 2px; background: var(--lt-s3); }
.meter :deep(.fill) { background: linear-gradient(#ff6b5e, #f2c94c 22%, #4cc38a 45%); }
.db {
  text-align: center;
  font-size: 11px;
  color: var(--lt-ink-2);
  font-variant-numeric: tabular-nums;
  padding-bottom: 6px;
}
.toggles {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  gap: 6px;
  padding: 0 8px 10px;
}
.tog {
  flex: 1;
  max-width: 44px;
  height: 36px;
  border-radius: 8px;
  background: var(--lt-s3);
  color: var(--lt-ink-2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.tog.mute { background: #e0873a; color: #fff; }
.tog.solo { background: #f2c94c; color: #1a1a1a; }
@media (max-height: 700px) {
  .insert, .insert-name, .power { height: 26px; line-height: 26px; }
}
</style>

<style>
/* uni-app forces overflow:hidden on every view; the strip rack must scroll sideways. A
 * vertical fader only owns vertical travel, so a sideways swipe over it scrolls the rack. */
uni-view.lite-mixer uni-view.rack {
  display: flex !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch;
}
uni-view.lite-mixer uni-view.rack .fader.vertical { touch-action: pan-x; }
uni-view.lite-mixer uni-view.rack .send,
uni-view.lite-mixer uni-view.rack .pan { touch-action: none; }
uni-view.lite-mixer uni-view.rack .pan.ghost { touch-action: pan-x; }
</style>
