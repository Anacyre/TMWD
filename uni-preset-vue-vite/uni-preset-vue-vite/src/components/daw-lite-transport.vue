<template>
  <view class="bar">
    <view class="left">
      <view class="hit" @click.stop="saveProjectLocal">
        <daw-icon name="save" />
      </view>
    </view>
    <view class="center">
      <view class="hit" :class="{ dim: !session.canUndo }" @click.stop="undoEdit">
        <daw-icon name="undo" />
      </view>
      <view class="hit" :class="{ dim: !session.canRedo }" @click.stop="redoEdit">
        <daw-icon name="redo" />
      </view>
      <view class="hit play" :class="{ on: session.playing }" @click.stop="togglePlay">
        <view class="glyph">
          <daw-icon
            :name="session.playing ? 'pause' : 'play'"
            :active="session.playing"
            :color="session.playing ? '#2ea44f' : '#e6e6e6'"
          />
        </view>
      </view>
      <view class="hit" @click.stop="stop">
        <daw-icon name="stop" />
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
      <view class="hit" @click.stop="openSettings">
        <daw-icon name="settings" />
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
  saveProjectLocal
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
.left { width: 48px; }
.right { width: 72px; justify-content: flex-end; }
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
.glyph {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  position: relative;
}
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
