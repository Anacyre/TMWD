<template>
  <view class="tracks">
    <view class="tools">
      <text class="count">TRACKS {{ Math.max(0, session.tracks.length - 1) }}</text>
      <view class="icon-btn" title="Add track" @click.stop="toggleAdd">
        <daw-icon name="plus" />
      </view>
      <view v-if="session.openMenu === 'add-track'" class="dropdown">
        <view class="drop-item" @click="add('audio')">Audio Track</view>
        <view class="drop-item" @click="add('midi')">MIDI Track</view>
      </view>
      <view class="spacer" />
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
        :class="{ on: session.selectedTrack === index }"
        :style="{ height: session.trackHeight + 'px' }"
        @click="selectTrack(index)"
      >
        <view class="accent" :style="{ background: track.colour, opacity: isTrackAudible(index) ? 1 : 0.4 }" />
        <daw-meter :level="track.meterLevel || 0" />
        <view class="type-icon">
          <daw-icon :name="track.type === 'master' ? 'speaker' : (track.type === 'midi' ? 'piano' : 'wave')" />
        </view>
        <view class="meta">
          <input
            v-if="editing === index"
            class="name-input"
            :value="track.name"
            @blur="rename(index, $event)"
            @confirm="rename(index, $event)"
          >
          <text v-else class="name" @dblclick="editing = index">{{ track.name }}</text>
          <text
            v-if="track.type !== 'master'"
            class="inst"
            @click.stop="openInstrumentPicker(index)"
          >{{ track.instrument || (track.type === 'midi' ? 'Empty slot' : 'Audio') }}</text>
        </view>
        <daw-fader :model-value="track.volume" @update:model-value="onVol(index, $event)" />
        <view class="tiny" :class="{ on: track.mute, mute: track.mute }" @click="toggleFlag(index, 'mute')">M</view>
        <view
          v-if="track.type !== 'master'"
          class="tiny"
          :class="{ on: track.solo, solo: track.solo }"
          @click="toggleFlag(index, 'solo')"
        >S</view>
        <view
          v-if="track.type !== 'master'"
          class="tiny"
          :class="{ on: track.recordArm, arm: track.recordArm }"
          @click="toggleFlag(index, 'recordArm')"
        >R</view>
        <daw-knob :model-value="track.pan" @update:model-value="onPan(index, $event)" />
        <view class="icon-btn menu" @click.stop="openTrackMenu(index)">
          <daw-icon name="menu" />
        </view>
        <view v-if="session.openMenu === 'track-' + index" class="track-menu" @click.stop>
          <view class="drop-item" @click="editing = index; closeMenus()">Rename</view>
          <view v-if="track.type !== 'master'" class="drop-item" @click="openInstrumentPicker(index); closeMenus()">Browse Instruments...</view>
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
import { session, addTrack, removeTrack, duplicateTrack, moveTrack, addMidiClip, setTrackParameter, renameTrack, closeMenus, selectTrack, isTrackAudible, openInstrumentPicker, setTrackHeight, TRACK_HEIGHTS } from '../store/session.js'

defineProps({
  scrollTop: { type: Number, default: 0 }
})
const emit = defineEmits(['scroll'])
const editing = ref(-1)

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
  padding: 0 6px;
  border-bottom: 1px solid #2a2a2a;
  position: relative;
}
.spacer { flex: 1; }
.icon-btn {
  width: 26px;
  height: 26px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.icon-btn:hover { background: #353535; }
.icon-btn.on { background: rgba(77,163,255,0.16); }
.dropdown {
  position: absolute;
  top: 30px;
  left: 6px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  min-width: 140px;
  z-index: 30;
  padding: 6px 0;
}
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
  align-items: center;
  gap: 6px;
  padding: 0 8px 0 0;
  border-bottom: 1px solid #202020;
  box-sizing: border-box;
  position: relative;
}
.strip.on { background: #1c2430; }
.accent { width: 4px; height: 100%; flex-shrink: 0; }
.type-icon { width: 22px; height: 22px; flex-shrink: 0; }
.count {
  color: #6a6a6a;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  margin-right: 4px;
}
.height-menu { left: auto; right: 6px; }
.meta {
  width: 86px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.name, .name-input {
  width: 100%;
  color: #e6e6e6;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inst {
  color: #6a6a6a;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.name-input {
  background: #1e1e1e;
  border: 1px solid #4da3ff;
  border-radius: 3px;
  height: 22px;
  padding: 0 4px;
}
.tiny {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  background: #2b2b2b;
  color: #8d8d8d;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}
.tiny.on.mute { background: #c45c26; color: #fff; }
.tiny.on.solo { background: #2ea44f; color: #fff; }
.tiny.on.arm { background: #d23b3b; color: #fff; }
.menu { width: 22px; height: 22px; }
.track-menu {
  position: absolute;
  right: 8px;
  top: 40px;
  background: #242424;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  min-width: 140px;
  z-index: 40;
  padding: 6px 0;
}
</style>
