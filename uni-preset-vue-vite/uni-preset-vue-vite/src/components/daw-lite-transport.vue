<template>
  <view class="bar">
    <view class="left">
      <view class="hit" title="Save project" aria-label="Save project" @click.stop="saveProjectLocal">
        <daw-icon name="save" :size="24" />
      </view>
      <view class="hit" title="Projects" aria-label="Projects" @click.stop="openProjects">
        <daw-icon name="folder" :size="24" />
      </view>
    </view>
    <view class="center">
      <view class="hit" :class="{ dim: !session.canUndo }" title="Undo" aria-label="Undo" @click.stop="undoEdit">
        <daw-icon name="undo" :size="24" />
      </view>
      <view class="hit" :class="{ dim: !session.canRedo }" title="Redo" aria-label="Redo" @click.stop="redoEdit">
        <daw-icon name="redo" :size="24" />
      </view>
      <view
        class="hit play"
        :class="{ on: session.playing }"
        :title="session.playing ? 'Pause' : 'Play'"
        :aria-label="session.playing ? 'Pause' : 'Play'"
        @click.stop="togglePlay"
      >
        <daw-icon
          :name="session.playing ? 'pause' : 'play'"
          :active="session.playing"
          :size="26"
          :color="session.playing ? '#2ea44f' : '#e6e6e6'"
        />
      </view>
      <view class="hit" title="Stop" aria-label="Stop" @click.stop="stop">
        <daw-icon name="stop" :size="24" />
      </view>
      <view class="read" @click.stop="toggleFormat">
        <text class="pos">{{ positionDisplay }}</text>
        <text class="bpm">{{ Math.round(session.bpm) }}</text>
      </view>
    </view>
    <view class="right">
      <view
        class="hit"
        :class="{ on: session.scaleSnap }"
        title="Scale"
        aria-label="Scale"
        @click.stop="onScaleTap"
      >
        <daw-icon name="scale" :size="22" :active="session.scaleSnap" />
      </view>
      <view class="status" @click.stop="openSettings">
        <view class="led" :class="engineState()" />
      </view>
      <view class="hit" title="Audio settings" aria-label="Audio settings" @click.stop="openSettings">
        <daw-icon name="settings" :size="24" />
      </view>
    </view>
    <view v-if="session.audioBlocked" class="unlock" @click.stop="unlockAudioForUser">
      <text>Tap to enable sound</text>
    </view>
    <view v-if="session.scaleMenuOpen" class="scale-menu" @click.stop>
      <view
        v-for="key in KEY_NAMES"
        :key="key"
        class="item"
        :class="{ on: session.scaleKey === key }"
        @click="setScaleKeyName(key, session.scaleName)"
      >{{ key }}</view>
      <view
        v-for="name in SCALE_NAMES"
        :key="name"
        class="item"
        :class="{ on: session.scaleName === name }"
        @click="setScaleKeyName(session.scaleKey, name)"
      >{{ name }}</view>
      <view class="item" :class="{ on: session.scaleSnap }" @click="toggleScaleSnap">
        {{ session.scaleSnap ? 'Snap on' : 'Highlight only' }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  session,
  positionText,
  secondsText,
  togglePlay,
  stop,
  undoEdit,
  redoEdit,
  setPositionFormat,
  openSettings,
  engineState,
  saveProjectLocal,
  openProjects,
  toggleScaleSnap,
  setScaleKeyName,
  unlockAudioForUser
} from '../store/session.js'
import { KEY_NAMES, SCALE_NAMES } from '../model/note-model.js'

const positionDisplay = computed(() => (
  session.positionFormat === 'time' ? secondsText.value : positionText.value
))

function toggleFormat () {
  setPositionFormat(session.positionFormat === 'time' ? 'musical' : 'time')
}

function onScaleTap () {
  session.scaleMenuOpen = !session.scaleMenuOpen
}
</script>

<style scoped>
.bar {
  height: calc(52px + env(safe-area-inset-top, 0));
  padding: env(safe-area-inset-top, 0) 4px 0;
  display: flex;
  align-items: center;
  background: #161616;
  border-bottom: 1px solid #2a2a2a;
  flex-shrink: 0;
  box-sizing: border-box;
  position: relative;
}
.left, .right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  z-index: 1;
}
.left { width: 92px; }
.right { width: 112px; justify-content: flex-end; }
.hit.on { color: #4da3ff; }
.unlock {
  position: absolute;
  left: 50%;
  top: calc(100% + 4px);
  transform: translateX(-50%);
  z-index: 8;
  background: #2b2b2b;
  color: #e6e6e6;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
}
.scale-menu {
  position: absolute;
  right: 8px;
  top: calc(100% + 4px);
  z-index: 9;
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  max-height: 240px;
  overflow: auto;
  min-width: 88px;
}
.scale-menu .item { padding: 8px 12px; color: #e6e6e6; font-size: 12px; }
.scale-menu .item.on { background: #2b2b2b; }
.center {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0;
}
.hit {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.hit.dim { opacity: 0.35; }
.hit.play :deep(.icon) { color: #e6e6e6; }
.read {
  min-width: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
}
.pos { color: #e6e6e6; font-size: 13px; font-variant-numeric: tabular-nums; }
.bpm { color: #8d8d8d; font-size: 10px; letter-spacing: 0.06em; }
.status { width: 28px; display: flex; align-items: center; justify-content: center; }
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #5a5a5a;
}
.led.connected { background: #4da3ff; }
.led.loading { background: #c4a026; }
.led.error { background: #c45c26; }
.led.offline { background: #5a5a5a; }
</style>
