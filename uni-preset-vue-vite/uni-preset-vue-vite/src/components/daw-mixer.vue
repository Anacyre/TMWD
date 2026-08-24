<template>
  <view class="mixer">
    <view class="head">
      <text>MIXER</text>
      <view class="icon-btn" @click.stop="toggleMixer">×</view>
    </view>
    <scroll-view class="rack" scroll-x>
      <view class="strips">
        <view
          v-for="(track, index) in channelTracks"
          :key="track.id"
          class="strip"
          :class="{ on: session.selectedTrack === session.tracks.indexOf(track) }"
          @click="selectTrack(session.tracks.indexOf(track))"
        >
          <view class="tab" :style="{ background: track.colour }" />
          <text class="name">{{ track.name }}</text>
          <text class="inst">{{ track.instrument || (track.type === 'midi' ? 'Empty' : 'Audio') }}</text>
          <view class="insert" v-for="slot in displayInserts(track)" :key="slot.name + slot.i">
            {{ slot.name }}
          </view>
          <daw-knob :model-value="track.pan" @update:model-value="onPan(track, $event)" />
          <view class="fader-row">
            <daw-fader
              orientation="vertical"
              :model-value="track.volume"
              @update:model-value="onVol(track, $event)"
            />
            <daw-meter :level="track.meterLevel || 0" />
          </view>
          <text class="db">{{ formatDb(track.volume) }}</text>
          <view class="toggles">
            <view class="tiny" :class="{ on: track.mute, mute: track.mute }" @click.stop="toggle(track, 'mute')">M</view>
            <view class="tiny" :class="{ on: track.solo, solo: track.solo }" @click.stop="toggle(track, 'solo')">S</view>
          </view>
        </view>
        <view
          v-if="master"
          class="strip master"
          :class="{ on: session.selectedTrack === 0 }"
          @click="selectTrack(0)"
        >
          <view class="tab" style="background:#8a8a8a" />
          <text class="name">Master</text>
          <text class="inst">Stereo Out</text>
          <daw-knob :model-value="master.pan" @update:model-value="onPan(master, $event)" />
          <view class="fader-row">
            <daw-fader
              orientation="vertical"
              :model-value="master.volume"
              @update:model-value="onVol(master, $event)"
            />
            <daw-meter :level="master.meterLevel || 0" />
          </view>
          <text class="db">{{ formatDb(master.volume) }}</text>
          <view class="toggles">
            <view class="tiny" :class="{ on: master.mute, mute: master.mute }" @click.stop="toggle(master, 'mute')">M</view>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import DawFader from './daw-fader.vue'
import DawKnob from './daw-knob.vue'
import DawMeter from './daw-meter.vue'
import { session, setTrackParameter, selectTrack, toggleMixer } from '../store/session.js'

const channelTracks = computed(() => session.tracks.filter((track) => track.type !== 'master'))
const master = computed(() => session.tracks.find((track) => track.type === 'master'))

function displayInserts (track) {
  const slots = (track.inserts || []).slice(0, 2)
  while (slots.length < 2) slots.push({ name: '—', i: slots.length })
  return slots.map((slot, i) => ({ name: slot.name || '—', i }))
}

function formatDb (volume) {
  const db = 20 * Math.log10(Math.max(0.0001, Math.pow(volume, 2)))
  return (db > -0.05 ? '0.0' : db.toFixed(1)) + ' dB'
}

function onVol (track, value) {
  setTrackParameter(track, 'volume', value)
}

function onPan (track, value) {
  setTrackParameter(track, 'pan', value)
}

function toggle (track, parameter) {
  setTrackParameter(track, parameter, !track[parameter])
}
</script>

<style scoped>
.mixer {
  height: 100%;
  background: #161616;
  border-top: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
}
.head {
  height: 24px;
  background: #1a1a1a;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  color: #8d8d8d;
  font-size: 10px;
  font-weight: 700;
}
.rack { flex: 1; height: 0; }
.strips { display: flex; height: 100%; min-width: 100%; }
.strip {
  width: 78px;
  flex-shrink: 0;
  border-right: 1px solid #202020;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 6px 8px;
  position: relative;
}
.strip.on { background: #1c1c1c; }
.strip.master { width: 92px; background: #141414; }
.tab { position: absolute; top: 0; left: 6px; right: 6px; height: 3px; border-radius: 0 0 2px 2px; }
.name { color: #e6e6e6; font-size: 11px; font-weight: 700; margin-top: 6px; text-align: center; }
.inst { color: #6a6a6a; font-size: 9px; text-align: center; min-height: 12px; }
.insert {
  width: 100%;
  height: 15px;
  margin-top: 3px;
  background: #222;
  color: #8d8d8d;
  font-size: 9px;
  text-align: center;
  line-height: 15px;
  border-radius: 2px;
}
.fader-row {
  flex: 1;
  display: flex;
  gap: 6px;
  width: 100%;
  justify-content: center;
  margin: 6px 0 4px;
  min-height: 70px;
}
.db { color: #8d8d8d; font-size: 9.5px; }
.toggles { display: flex; gap: 4px; margin-top: 4px; }
.tiny {
  width: 18px;
  height: 16px;
  border-radius: 3px;
  background: #2b2b2b;
  color: #8d8d8d;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.tiny.on.mute { background: #c45c26; color: #fff; }
.tiny.on.solo { background: #2ea44f; color: #fff; }
.icon-btn { cursor: pointer; padding: 0 4px; }
</style>
