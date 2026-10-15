<template>
  <view class="lt lite-app">
    <lite-topbar />
    <view class="work">
      <lite-mixer v-if="view === 'mixer'" />
      <lite-arrange v-else />
    </view>
    <lite-piano-roll v-if="view === 'piano'" />
    <lite-track-sheet />
    <lite-settings />
    <daw-instrument-browser />
    <plugin-host />
    <daw-project-manager />
    <lite-hint />
    <lite-toast />
  </view>
</template>

<script setup>
import { computed, defineAsyncComponent } from 'vue'
import LiteTopbar from './lite-topbar.vue'
import LiteArrange from './lite-arrange.vue'
import LiteHint from './lite-hint.vue'
import LiteToast from './lite-toast.vue'
import { session } from '../../store/session.js'
import './lite-tokens.css'

/* Everything below appears only after a view switch or a tap, so it loads after
   the arrangement is on screen. */
const LiteMixer = defineAsyncComponent(() => import('./lite-mixer.vue'))
const LitePianoRoll = defineAsyncComponent(() => import('./lite-piano-roll.vue'))
const LiteTrackSheet = defineAsyncComponent(() => import('./lite-track-sheet.vue'))
const LiteSettings = defineAsyncComponent(() => import('./lite-settings.vue'))
const DawInstrumentBrowser = defineAsyncComponent(() => import('../daw-instrument-browser.vue'))
const PluginHost = defineAsyncComponent(() => import('../dsp/plugin-host.vue'))
const DawProjectManager = defineAsyncComponent(() => import('../daw-project-manager.vue'))

const view = computed(() => session.workspaceView)
</script>

<style scoped>
.lite-app {
  height: 100vh;
  height: 100dvh;
  width: 100%;
  display: flex;
  flex-direction: column;
  background: var(--lt-bg);
  overflow: hidden;
  position: relative;
  box-sizing: border-box;
}
.work {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.work > * { flex: 1 1 auto; min-height: 0; width: 100%; }
</style>
<style>
html.daw-pointer-lock, html.daw-pointer-lock body {
  overflow: hidden;
  touch-action: none;
}
</style>
