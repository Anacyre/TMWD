<template>
  <view v-if="session.openPlugin" class="host" :class="{ lite: lite }" @click.self="close" @pointerdown="onHostDown">
      <view class="sheet" :class="[skinClass, { 'lite-plugin-surface': lite }]" @click.stop @pointerdown="onHostDown">
        <view v-if="lite" class="head-lite">
          <text class="grab-change" @click="changePlugin">Change</text>
          <text v-if="session.openPlugin" class="grab-remove" @click="remove">Remove</text>
          <view class="close-x" aria-label="Dismiss" @click="close">×</view>
        </view>
        <view v-else class="grab">
          <text class="grab-change" @click="changePlugin">Change</text>
          <text v-if="session.openPlugin" class="grab-remove" @click="remove">Remove</text>
          <text class="grab-close" @click="close">Close</text>
        </view>
        <plugin-reverb-x
          v-if="insert && insert.pluginId === 'reverb-x'"
          :insert="insert"
          :meters="meters"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-equalizer-x
          v-else-if="insert && insert.pluginId === 'equalizer-x'"
          :insert="insert"
          :spectrum="spectrum"
          :meters="meters"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-boost-x v-else-if="insert && insert.pluginId === 'boost-x'" :insert="insert" :meters="meters" @change="onChange" />
        <plugin-dynamic-x
          v-else-if="insert && insert.pluginId === 'dynamic-x'"
          :insert="insert"
          :meters="meters"
          :spectrum="spectrum"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-limiter-x
          v-else-if="insert && insert.pluginId === 'limiter-x'"
          :insert="insert"
          :meters="meters"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <view v-else-if="insert" class="missing">
          <text class="missing-title">Unsupported plugin</text>
          <text class="missing-id">{{ insert.pluginId }}</text>
        </view>
        <view v-else class="missing">
          <text class="missing-title">Plugin slot is empty</text>
          <text class="missing-id">Re-open the insert from the Mix panel.</text>
        </view>
      </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { session, closePlugin, persistWebMixer, getFxAnalyser, removeInsert, openLiteSheet, isLite } from '../../store/session.js'
import { resolveOpenInsert, fxMeterLaneKey, laneFromOpen } from '../../model/web-mixer.js'
import { pickPluginSpectrum, metersForInsert } from '../../dsp/runtime.js'
import PluginReverbX from './plugin-reverb-x.vue'
import PluginEqualizerX from './plugin-equalizer-x.vue'
import PluginBoostX from './plugin-boost-x.vue'
import PluginDynamicX from './plugin-dynamic-x.vue'
import PluginLimiterX from './plugin-limiter-x.vue'
import './dsp-theme.css'
import './lite-plugin-surface.css'

const lite = computed(() => isLite())
const liveSpectrum = ref([])
const liveMeters = ref({})
const insert = computed(() => resolveOpenInsert(session.webMixer, session.openPlugin, session.tracks))
const skinClass = computed(() => {
  const id = insert.value && insert.value.pluginId
  if (id === 'equalizer-x') return 'dsp-skin skin-eq'
  if (id === 'reverb-x') return 'dsp-skin skin-rev'
  if (id === 'dynamic-x') return 'dsp-skin skin-dyn'
  if (id === 'boost-x') return 'dsp-skin skin-boost'
  if (id === 'limiter-x') return 'dsp-skin skin-lim'
  return 'dsp-skin'
})
const meterKey = computed(() => fxMeterLaneKey(session.openPlugin, session.tracks, {
  localPlayback: !session.remoteAudioOn
}))
const meters = computed(() => liveMeters.value)
const spectrum = computed(() => liveSpectrum.value)

let raf = 0
function tick () {
  const key = meterKey.value
  const posted = session.fxMeters[key] || {}
  liveMeters.value = metersForInsert(posted, insert.value)
  liveSpectrum.value = pickPluginSpectrum(posted, getFxAnalyser(key), insert.value)
  raf = requestAnimationFrame(tick)
}

watch(() => session.openPlugin, (open) => {
  cancelAnimationFrame(raf)
  liveSpectrum.value = []
  liveMeters.value = {}
  if (open) raf = requestAnimationFrame(tick)
}, { immediate: true })

onMounted(() => { if (session.openPlugin) raf = requestAnimationFrame(tick) })
onUnmounted(() => cancelAnimationFrame(raf))

function close () { closePlugin() }
function remove () {
  const open = session.openPlugin
  if (!open) return
  removeInsert(laneFromOpen(open), open.index)
  closePlugin()
}
function changePlugin () {
  const open = session.openPlugin
  if (!open) return
  const lane = laneFromOpen(open)
  const trackIndex = lane && lane.type === 'track'
    ? session.tracks.findIndex((track) => String(track.id) === String(lane.id))
    : session.tracks.findIndex((track) => track.type === 'master')
  closePlugin()
  if (isLite()) {
    openLiteSheet({
      kind: 'track',
      tab: 'fx',
      picker: true,
      replaceIndex: open.index,
      trackIndex: trackIndex >= 0 ? trackIndex : session.selectedTrack
    })
  }
}
let holdTimer = 0
function onHostDown (e) {
  const cls = (e.target && (e.target.className || e.target.classList && e.target.classList.value)) || ''
  const clsStr = String(cls)
  if (clsStr.indexOf('grab') >= 0 || clsStr.indexOf('head-lite') >= 0 || clsStr.indexOf('close-x') >= 0) return
  clearTimeout(holdTimer)
  holdTimer = setTimeout(() => changePlugin(), 480)
  const up = () => {
    clearTimeout(holdTimer)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointermove', up)
  }
  window.addEventListener('pointerup', up)
  window.addEventListener('pointermove', up)
}
function onChange () { persistWebMixer() }
</script>

<style scoped>
.host {
  position: fixed;
  inset: 0;
  background: rgba(18, 20, 24, 0.58);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(6px, env(safe-area-inset-top, 0px)) 8px max(8px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.host.lite {
  padding:
    max(16px, env(safe-area-inset-top, 0px))
    16px
    max(16px, env(safe-area-inset-bottom, 0px));
}
.sheet {
  /* ~3/4 of viewport area: sqrt(0.75) ≈ 0.866 on each axis */
  width: min(86.6vw, calc(100vw - 12px));
  height: min(86.6vh, calc(100vh - 12px));
  max-width: calc(100vw - 12px);
  max-height: calc(100vh - 12px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #F4F3F0 0%, #EDECE8 38%, #E4E2DD 100%);
  border: 1px solid rgba(38, 40, 44, 0.16);
  border-radius: 10px;
  padding: 4px 4px 10px;
  box-shadow: 0 24px 64px rgba(24, 26, 30, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.sheet > :deep(.x-plug) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.host.lite .sheet {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
}
.head-lite {
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 0 8px 0 12px;
  flex-shrink: 0;
  position: relative;
}
.head-lite .close-x {
  margin-left: auto;
}
.grab {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 0 14px;
  color: #8E939C;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-size: 9px;
  flex-shrink: 0;
}
.grab-remove, .grab-close, .grab-change { min-height: 32px; display: flex; align-items: center; cursor: pointer; }
.grab-remove { color: #C4503C; }
.grab-change { color: #5A5E66; margin-right: auto; }
.head-lite { color: #8E939C; }
.head-lite .grab-change { margin-right: 0; }
.missing {
  padding: 24px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.missing-title { font-size: 16px; color: #26282C; }
.missing-id { font-size: 13px; color: #8E939C; text-align: center; line-height: 1.45; }
</style>
