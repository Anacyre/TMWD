<template>
  <view class="lite" :class="engineModeClass()">
    <daw-lite-transport />
    <daw-cloud-banner compact />
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
import { defineAsyncComponent } from 'vue'
import DawLiteTransport from './daw-lite-transport.vue'
import DawLiteNav from './daw-lite-nav.vue'
import DawLiteHint from './daw-lite-hint.vue'
import DawPlaylist from './daw-playlist.vue'
import DawCloudBanner from './daw-cloud-banner.vue'
import { session, engineModeClass } from '../store/session.js'

/*  Everything below only shows up once a view is switched or a sheet opens, so
    it loads after the arrangement is on screen.
*/
const DawPianoRoll = defineAsyncComponent(() => import('./daw-piano-roll.vue'))
const DawLiteMixer = defineAsyncComponent(() => import('./daw-lite-mixer.vue'))
const DawLiteSettings = defineAsyncComponent(() => import('./daw-lite-settings.vue'))
const DawLiteTrackSheet = defineAsyncComponent(() => import('./daw-lite-track-sheet.vue'))
const DawInstrumentBrowser = defineAsyncComponent(() => import('./daw-instrument-browser.vue'))
const PluginHost = defineAsyncComponent(() => import('./dsp/plugin-host.vue'))
const DawProjectManager = defineAsyncComponent(() => import('./daw-project-manager.vue'))
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
/* Cloud mode is a different skin, not a desaturated one: the shell picks up a
   cool cast so it reads as "browser engine" without dimming the content. */
.lite.daw-cloud { background: #101619; }
.lite.daw-cloud .work { background: #101619; }
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
<style>
html.daw-pointer-lock, html.daw-pointer-lock body {
  overflow: hidden;
  touch-action: none;
}
</style>
