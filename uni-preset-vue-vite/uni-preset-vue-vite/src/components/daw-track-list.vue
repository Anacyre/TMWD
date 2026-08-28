<template>
  <view class="tracks">
    <view class="tools">
      <text class="count">TRACKS {{ Math.max(0, session.tracks.length - 1) }}</text>
      <view class="spacer" />
      <view class="icon-btn" title="Add track" @click.stop="toggleAdd">
        <daw-icon name="plus" />
      </view>
      <view v-if="session.openMenu === 'add-track'" class="dropdown">
        <view class="drop-item" @click="add('midi')">Instrument Track</view>
        <view class="drop-item" @click="add('audio')">Audio Track</view>
      </view>
      <view class="icon-btn" title="Track height" @click.stop="toggleHeight">
        <daw-icon name="wave" :color="session.openMenu === 'track-height' ? '#4da3ff' : ''" />
      </view>
      <view v-if="session.openMenu === 'track-height'" class="dropdown height-menu">
        <view
          v-for="item in TRACK_HEIGHTS"
          :key="item.value"
          class="drop-item"
          :class="{ checked: session.trackHeight === item.value }"
          @click="setTrackHeight(item.value); closeMenus()"
        >{{ item.name }}</view>
      </view>
    </view>

    <scroll-view
      class="list"
      scroll-y
      :scroll-top="scrollTop"
      :show-scrollbar="true"
      @scroll="onScroll"
    >
      <view
        v-for="(track, index) in session.tracks"
        :key="track.id"
        class="strip"
        :class="{ on: session.selectedTrack === index, compact: session.trackHeight < 44, roomy: session.trackHeight >= 72 }"
        :style="{ height: session.trackHeight + 'px' }"
        @click="selectTrack(index)"
      >
        <view class="accent" :style="{ background: track.colour, opacity: isTrackAudible(index) ? 1 : 0.4 }" />
        <daw-meter :level="track.meterLevel || 0" />
        <view class="body">
          <view class="top">
            <text class="num">{{ track.type === 'master' ? 'M' : pad(index) }}</text>
            <input
              v-if="editing === index"
              class="name-input"
              :value="track.name"
              @blur="rename(index, $event)"
              @confirm="rename(index, $event)"
            >
            <text v-else class="name" @dblclick="editing = index">{{ track.name }}</text>
            <view class="tiny" :class="{ on: track.mute, mute: track.mute }" @click.stop="toggleFlag(index, 'mute')">M</view>
            <view
              v-if="track.type !== 'master'"
              class="tiny"
              :class="{ on: track.solo, solo: track.solo }"
              @click.stop="toggleFlag(index, 'solo')"
            >S</view>
            <view
              v-if="track.type !== 'master'"
              class="tiny"
              :class="{ on: track.recordArm, arm: track.recordArm }"
              @click.stop="toggleFlag(index, 'recordArm')"
            >R</view>
            <view class="icon-btn menu" @click.stop="openTrackMenu(index)">
              <daw-icon name="menu" />
            </view>
          </view>
          <text
            v-if="track.type !== 'master' && session.trackHeight >= 72"
            class="inst"
            @click.stop="onTrackInstrumentClick(index)"
          >{{ track.instrument || 'No instrument' }}</text>
          <view v-if="session.trackHeight >= 44" class="bottom">
            <daw-fader :model-value="track.volume" @update:model-value="onVol(index, $event)" />
            <daw-knob :model-value="track.pan" @update:model-value="onPan(index, $event)" />
          </view>
        </view>
        <view v-if="session.openMenu === 'track-' + index" class="track-menu" @click.stop>
          <view class="drop-item" @click="editing = index; closeMenus()">Rename</view>
          <view v-if="track.type !== 'master'" class="drop-item" @click="openPluginPicker(index); closeMenus()">Insert Plugin...</view>
          <view v-if="track.type !== 'master' && track.definitionId" class="drop-item" @click="openPluginUI(index); closeMenus()">Open Plugin</view>
          <view v-if="track.type !== 'master'" class="drop-item" @click="addMidiClip(index); closeMenus()">Add MIDI Clip at Playhead</view>
          <view v-if="index > 1" class="drop-item" @click="moveTrack(index, index - 1); closeMenus()">Move Up</view>
          <view v-if="track.type !== 'master' && index < session.tracks.length - 1" class="drop-item" @click="moveTrack(index, index + 1); closeMenus()">Move Down</view>
          <view v-if="track.type !== 'master'" class="drop-item" @click="duplicateTrack(index); closeMenus()">Duplicate Track</view>
          <view v-if="track.type !== 'master'" class="drop-item" @click="removeTrack(index); closeMenus()">Delete Track</view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import DawIcon from './daw-icon.vue'
import DawFader from './daw-fader.vue'
import DawKnob from './daw-knob.vue'
import DawMeter from './daw-meter.vue'
import { session, addTrack, removeTrack, duplicateTrack, moveTrack, addMidiClip, setTrackParameter, renameTrack, closeMenus, selectTrack, isTrackAudible, openPluginPicker, openPluginUI, onTrackInstrumentClick, setTrackHeight, TRACK_HEIGHTS } from '../store/session.js'

defineProps({
  scrollTop: { type: Number, default: 0 }
})
const emit = defineEmits(['scroll'])
const editing = ref(-1)

function pad (index) {
  return index < 10 ? '0' + index : String(index)
}

function toggleAdd () {
  session.openMenu = session.openMenu === 'add-track' ? '' : 'add-track'
}

function toggleHeight () {
  session.openMenu = session.openMenu === 'track-height' ? '' : 'track-height'
}

function add (type) {
  addTrack(type)
  closeMenus()
}

function onVol (index, value) {
  setTrackParameter(session.tracks[index], 'volume', value)
}

function onPan (index, value) {
  setTrackParameter(session.tracks[index], 'pan', value)
}

function toggleFlag (index, parameter) {
  const track = session.tracks[index]
  if (!track) return
  setTrackParameter(track, parameter, !track[parameter])
}

function rename (index, e) {
  const value = (e && e.detail && e.detail.value) || (e && e.target && e.target.value)
  if (value) renameTrack(index, value)
  editing.value = -1
}

function openTrackMenu (index) {
  if (index <= 0) {
    editing.value = 0
    return
  }
  session.openMenu = session.openMenu === 'track-' + index ? '' : 'track-' + index
}

function onScroll (e) {
  const top = (e.detail && e.detail.scrollTop) || 0
  emit('scroll', top)
}
</script>

<style scoped>
.tracks {
  width: 100%;
  height: 100%;
  background: #161616;
  border-right: 1px solid #2a2a2a;
  display: flex;
  flex-direction: column;
  position: relative;
}
.tools {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 8px 0 9px;
  background: #2a2a2a;
  border-bottom: 1px solid #2a2a2a;
  position: relative;
  flex-shrink: 0;
}
.spacer { flex: 1; }
.icon-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.icon-btn:hover { background: #353535; }
.dropdown {
  position: absolute;
  top: 30px;
  right: 34px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  min-width: 160px;
  z-index: 30;
  padding: 6px 0;
}
.height-menu { right: 8px; }
.drop-item {
  padding: 7px 12px;
  color: #e6e6e6;
  font-size: 13px;
  cursor: pointer;
}
.drop-item:hover { background: #3a3a3a; }
.drop-item.checked::after { content: ' ✓'; color: #4da3ff; }
.list { flex: 1; height: 0; }
.strip {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid #202020;
  box-sizing: border-box;
  position: relative;
  background: #161616;
}
.strip.on { background: #232323; }
.accent { width: 3px; flex-shrink: 0; }
.body {
  flex: 1;
  min-width: 0;
  padding: 5px 7px 5px 7px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.top, .bottom {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.num {
  width: 20px;
  flex-shrink: 0;
  color: #6a6a6a;
  font-size: 10px;
}
.strip.on .num { color: #8d8d8d; }
.count {
  color: #6a6a6a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.name, .name-input {
  flex: 1;
  min-width: 0;
  color: #e6e6e6;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inst {
  color: #6a6a6a;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  padding-left: 24px;
}
.name-input {
  background: #1e1e1e;
  border: 1px solid #4da3ff;
  border-radius: 3px;
  height: 18px;
  padding: 0 4px;
}
.tiny {
  width: 17px;
  height: 17px;
  border-radius: 3px;
  background: #2b2b2b;
  color: #8d8d8d;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.tiny.on.mute { background: #c45c26; color: #fff; }
.tiny.on.solo { background: #2ea44f; color: #fff; }
.tiny.on.arm { background: #d23b3b; color: #fff; }
.menu { width: 18px; height: 18px; }
.bottom { padding-left: 24px; }
.bottom :deep(.knob) { width: 20px; height: 20px; }
.track-menu {
  position: absolute;
  right: 10px;
  top: 28px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  min-width: 168px;
  z-index: 40;
  padding: 6px 0;
}
</style>
