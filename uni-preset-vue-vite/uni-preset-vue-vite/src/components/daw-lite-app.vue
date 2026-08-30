<template>
  <view class="lite">
    <daw-lite-transport />
    <view class="work">
      <daw-playlist v-if="session.workspaceView === 'arrangement'" />
      <daw-piano-roll v-else-if="session.workspaceView === 'piano'" embedded />
      <daw-lite-mixer v-else-if="session.workspaceView === 'mixer'" />
    </view>
    <daw-lite-nav />
    <daw-lite-settings />
    <daw-lite-track-sheet />
    <daw-lite-hint />
    <daw-instrument-browser />
    <plugin-host />
    <daw-project-manager />
    <view v-if="session.toast" class="toast">{{ session.toast }}</view>
  </view>
</template>

<script setup>
import DawLiteTransport from './daw-lite-transport.vue'
import DawLiteNav from './daw-lite-nav.vue'
import DawLiteSettings from './daw-lite-settings.vue'
import DawLiteTrackSheet from './daw-lite-track-sheet.vue'
import DawLiteHint from './daw-lite-hint.vue'
import DawLiteMixer from './daw-lite-mixer.vue'
import DawPlaylist from './daw-playlist.vue'
import DawPianoRoll from './daw-piano-roll.vue'
import DawInstrumentBrowser from './daw-instrument-browser.vue'
import PluginHost from './dsp/plugin-host.vue'
import DawProjectManager from './daw-project-manager.vue'
import { session } from '../store/session.js'
</script>

<style scoped>
.lite {
  height: 100vh;
  height: 100dvh;
  width: 100%;
  background: #121212;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #e6e6e6;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  position: relative;
  box-sizing: border-box;
}
.work {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.work > * {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}
.toast {
  position: absolute;
  left: 50%;
  bottom: calc(56px + env(safe-area-inset-bottom, 0) + 12px);
  transform: translateX(-50%);
  background: #2a2a2a;
  border: 1px solid #3a3a3a;
  color: #e6e6e6;
  padding: 10px 18px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 80;
  max-width: min(520px, calc(100% - 32px));
  text-align: center;
}
</style>
