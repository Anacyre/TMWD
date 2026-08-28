<template>
  <view class="mix">
    <view class="head">
      <text class="title">Mixer</text>
      <text class="hint">Swipe for more</text>
      <text class="fx" :class="{ on: session.diagnostics.browserFxAttached }">{{ fxLabel }}</text>
    </view>
    <view class="body">
      <scroll-view
        class="rack"
        scroll-x
        :enable-flex="true"
        :show-scrollbar="true"
      >
        <view class="row" :style="{ minWidth: rowWidth + 'px' }">
          <view
            v-for="track in laneChannels"
            :key="track.id"
            class="ch"
            :class="stripClass(track)"
            @click="selectTrack(trackIndex(track))"
          >
            <view class="accent" :style="{ background: track.colour || '#3a3a3a' }" />
            <text class="name">{{ track.name }}</text>
            <view class="fader-row">
              <daw-meter class="meter" :level="meterOf(track)" />
              <daw-fader
                class="vol"
                orientation="vertical"
                :model-value="track.volume"
                @update:model-value="onVolume(track, $event)"
                @drag-start="beginMixDrag(track, 'volume')"
                @drag-end="endMixDrag(track, 'volume')"
              />
            </view>
            <text class="db">{{ volumeLabel(track) }}</text>
            <view class="pan-block">
              <daw-knob
                class="pan"
                :model-value="track.pan || 0"
                :min="-1"
                :max="1"
                title="Pan"
                @update:model-value="onPan(track, $event)"
                @drag-start="beginMixDrag(track, 'pan')"
                @drag-end="endMixDrag(track, 'pan')"
              />
              <text class="pan-lab">{{ formatPan(track.pan) }}</text>
            </view>
            <view class="togs">
              <view
                class="tog"
                :class="{ on: track.mute, mute: track.mute }"
                @click.stop="setTrackParameter(track, 'mute', !track.mute)"
              >M</view>
              <view
                class="tog"
                :class="{ on: track.solo, solo: track.solo }"
                @click.stop="setTrackParameter(track, 'solo', !track.solo)"
              >S</view>
            </view>
            <view class="fx-btn" @click.stop="openFx(track)">FX</view>
          </view>
        </view>
      </scroll-view>

      <view
        v-if="master"
        class="ch master dock"
        :class="stripClass(master)"
        @click="selectTrack(trackIndex(master))"
      >
        <view class="accent" :style="{ background: master.colour || '#3a3a3a' }" />
        <text class="name">{{ master.name }}</text>
        <view class="fader-row">
          <daw-meter class="meter" :level="meterOf(master)" />
          <daw-fader
            class="vol"
            orientation="vertical"
            :model-value="master.volume"
            @update:model-value="onVolume(master, $event)"
          />
        </view>
        <text class="db">{{ volumeLabel(master) }}</text>
        <view class="pan-block ghost">
          <text class="pan-lab">MST</text>
        </view>
        <view class="togs">
          <view
            class="tog"
            :class="{ on: master.mute, mute: master.mute }"
            @click.stop="setTrackParameter(master, 'mute', !master.mute)"
          >M</view>
        </view>
        <view class="fx-btn" @click.stop="openFx(master)">FX</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import DawFader from './daw-fader.vue'
import DawKnob from './daw-knob.vue'
import DawMeter from './daw-meter.vue'
import {
  session,
  selectTrack,
  setTrackParameter,
  flushTrackMix,
  beginMixDrag,
  endMixDrag,
  isTrackAudible,
  openLiteSheet,
  ensureMixerAttached
} from '../store/session.js'
import { formatVolumeDb, formatPan, dbFromFader } from '../model/mixer-model.js'

const laneChannels = computed(() => (
  session.tracks.filter((track) => track.type !== 'master')
))
const master = computed(() => session.tracks.find((track) => track.type === 'master') || null)
const rowWidth = computed(() => Math.max(320, laneChannels.value.length * 96 + 24))

const fxLabel = computed(() => (
  session.diagnostics.browserFxAttached ? 'FX on' : 'FX off'
))

function trackIndex (track) {
  return session.tracks.indexOf(track)
}

function stripClass (track) {
  return {
    on: session.selectedTrack === trackIndex(track),
    dim: !isTrackAudible(trackIndex(track)),
    group: track.type === 'group'
  }
}

function meterOf (track) {
  const posted = session.fxMeters || {}
  if (!track) return 0
  if (track.type === 'master') {
    return Math.max(track.meterLevel || 0, (posted.master && (posted.master.outPeak || posted.master.inPeak)) || 0)
  }
  const local = !session.remoteAudioOn
  const sampler = Math.max((posted.sampler && (posted.sampler.outPeak || posted.sampler.inPeak)) || 0)
  const remote = Math.max((posted.remote && (posted.remote.outPeak || posted.remote.inPeak)) || 0)
  return Math.max(track.meterLevel || 0, local ? sampler : (track.source === 'web-sampler' ? sampler : remote))
}

function volumeLabel (track) {
  const db = track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume)
  return formatVolumeDb(db)
}

function onVolume (track, value) {
  setTrackParameter(track, 'volume', value)
  flushTrackMix()
}

function onPan (track, value) {
  setTrackParameter(track, 'pan', value)
  flushTrackMix()
}

function openFx (track) {
  const index = trackIndex(track)
  selectTrack(index)
  openLiteSheet({ kind: 'track', tab: track.type === 'master' ? 'fx' : 'fx', trackIndex: index })
}

onMounted(() => {
  ensureMixerAttached().catch(() => {})
})
</script>

<style scoped>
.mix {
  flex: 1;
  min-width: 0;
  min-height: 0;
  width: 100%;
  background: #121212;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
}
.title {
  color: #e6e6e6;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
}
.hint {
  flex: 1;
  min-width: 0;
  color: #6a6a6a;
  font-size: 10px;
  letter-spacing: 0.04em;
}
.fx {
  color: #6a6a6a;
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.fx.on { color: #4da3ff; }
.body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}
.rack {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  width: 0;
}
.row {
  display: inline-flex;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: stretch;
  width: max-content;
  min-height: 100%;
  padding: 10px 10px 12px;
  gap: 8px;
  box-sizing: border-box;
}
.ch {
  width: 88px;
  flex: 0 0 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 8px 6px 10px;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
}
.ch.master {
  width: 92px;
  flex-basis: 92px;
  border-color: #3a3a3a;
}
.ch.dock {
  flex: 0 0 92px;
  height: 100%;
  border-radius: 0;
  border-top: none;
  border-right: none;
  border-bottom: none;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0));
}
.ch.on { border-color: #505050; background: #1a1a1a; }
.ch.group { background: #161616; }
.ch.dim { opacity: 0.42; }
.accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
}
.name {
  width: 100%;
  color: #e6e6e6;
  font-size: 11px;
  font-weight: 650;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 2px;
  box-sizing: border-box;
}
.fader-row {
  flex: 1;
  min-height: 88px;
  max-height: 200px;
  width: 100%;
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 6px;
}
.meter { height: 100%; width: 6px; }
.vol {
  flex: 1;
  max-width: 36px;
  height: 100%;
  min-height: 88px;
}
.db {
  font-size: 9px;
  color: #7a7a7a;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.pan-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 42px;
}
.pan-block.ghost { opacity: 0.7; }
.pan-block :deep(.knob) {
  width: 32px;
  height: 32px;
}
.pan-lab {
  font-size: 8px;
  color: #6a6a6a;
  letter-spacing: 0.03em;
}
.togs {
  display: flex;
  gap: 6px;
  width: 100%;
  justify-content: center;
}
.tog, .fx-btn {
  min-width: 36px;
  min-height: 36px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2b2b2b;
  color: #8d8d8d;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 650;
  box-sizing: border-box;
}
.tog.on.mute { background: #c45c26; color: #fff; }
.tog.on.solo { background: #2ea44f; color: #fff; }
.fx-btn {
  width: 100%;
  color: #c8c8c8;
  min-height: 34px;
}
@media (max-height: 640px) {
  .fader-row { min-height: 72px; max-height: 140px; }
  .vol { min-height: 72px; }
}
@media (max-width: 360px) {
  .ch { width: 80px; flex-basis: 80px; padding: 6px 4px 8px; }
  .ch.master, .ch.dock { width: 84px; flex-basis: 84px; }
}
</style>
