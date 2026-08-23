<template>
  <view class="tracks">
    <view class="tools">
      <view class="icon-btn" title="Add track" @click.stop="toggleAdd">
        <daw-icon name="plus" />
      </view>
      <view v-if="session.openMenu === 'add-track'" class="dropdown">
        <view class="drop-item" @click="add('audio')">Audio Track</view>
        <view class="drop-item" @click="add('midi')">MIDI Track</view>
      </view>
      <view class="spacer" />
      <view class="icon-btn on">
        <daw-icon name="wave" color="#4da3ff" />
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
        :style="{ height: TRACK_HEIGHT + 'px' }"
      >
        <view class="accent" :style="{ background: track.colour }" />
        <view class="type-icon">
          <daw-icon :name="track.type === 'master' ? 'speaker' : (track.type === 'midi' ? 'piano' : 'wave')" />
        </view>
        <input
          v-if="editing === index"
          class="name-input"
          :value="track.name"
          @blur="rename(index, $event)"
          @confirm="rename(index, $event)"
        >
        <text v-else class="name" @dblclick="editing = index">{{ track.name }}</text>
        <daw-fader v-model="track.volume" @update:model-value="onVol(index, $event)" />
        <view class="tiny" :class="{ on: track.mute, mute: track.mute }" @click="track.mute = !track.mute">M</view>
        <view
          v-if="track.type !== 'master'"
          class="tiny"
          :class="{ on: track.solo, solo: track.solo }"
          @click="track.solo = !track.solo"
        >S</view>
        <view
          v-if="track.type !== 'master'"
          class="tiny"
          :class="{ on: track.recordArm, arm: track.recordArm }"
          @click="track.recordArm = !track.recordArm"
        >R</view>
        <daw-knob v-model="track.pan" />
        <view class="icon-btn menu" @click.stop="openTrackMenu(index)">
          <daw-icon name="menu" />
        </view>
        <view v-if="session.openMenu === 'track-' + index" class="track-menu" @click.stop>
          <view class="drop-item" @click="editing = index; closeMenus()">Rename</view>
          <view class="drop-item" @click="removeTrack(index); closeMenus()">Delete Track</view>
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
import { session, TRACK_HEIGHT, addTrack, removeTrack, setMasterGain, closeMenus } from '../store/session.js'

defineProps({
  scrollTop: { type: Number, default: 0 }
})
const emit = defineEmits(['scroll'])
const editing = ref(-1)

function toggleAdd () {
  session.openMenu = session.openMenu === 'add-track' ? '' : 'add-track'
}

function add (type) {
  addTrack(type)
  closeMenus()
}

function onVol (index, value) {
  if (index === 0) setMasterGain(value)
}

function rename (index, e) {
  const value = (e && e.detail && e.detail.value) || (e && e.target && e.target.value)
  if (value) session.tracks[index].name = value
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
.accent { width: 4px; height: 100%; flex-shrink: 0; }
.type-icon { width: 22px; height: 22px; flex-shrink: 0; }
.name, .name-input {
  width: 72px;
  flex-shrink: 0;
  color: #e6e6e6;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
