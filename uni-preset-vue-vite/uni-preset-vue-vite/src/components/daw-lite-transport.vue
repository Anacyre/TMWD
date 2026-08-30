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
      <view class="status" @click.stop="openSettings">
        <view class="led" :class="engineState()" />
      </view>
      <view class="hit" title="Audio settings" aria-label="Audio settings" @click.stop="openSettings">
        <daw-icon name="settings" :size="24" />
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
  openProjects
} from '../store/session.js'

const positionDisplay = computed(() => (
  session.positionFormat === 'time' ? secondsText.value : positionText.value
))

function toggleFormat () {
  setPositionFormat(session.positionFormat === 'time' ? 'musical' : 'time')
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
.right { width: 76px; justify-content: flex-end; }
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
