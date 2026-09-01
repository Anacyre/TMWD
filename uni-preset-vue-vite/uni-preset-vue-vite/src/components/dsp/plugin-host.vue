<template>
  <view v-if="session.openPlugin" class="host" :class="{ lite: lite }" @click.self="close" @pointerdown="onHostDown">
      <view class="sheet" :class="[skinClass, { 'lite-plugin-surface': lite }]" @click.stop @pointerdown="onHostDown">
        <view class="grab" :class="{ 'head-lite': lite }">
          <view class="grab-btn" title="Change plugin" aria-label="Change plugin" @click="changePlugin">
            <daw-icon name="swap" :size="18" />
          </view>
          <view
            v-if="session.openPlugin"
            class="grab-btn danger"
            title="Remove plugin"
            aria-label="Remove plugin"
            @click="remove"
          >
            <daw-icon name="trash" :size="18" />
          </view>
          <text v-if="visNotice" class="grab-state">{{ visNotice }}</text>
          <view class="grab-btn close" title="Close" aria-label="Close" @click="close">
            <daw-icon name="close" :size="18" />
          </view>
        </view>
        <plugin-reverb-x
          v-if="insert && insert.pluginId === 'reverb-x'"
          :insert="insert"
          :meters="meters"
          :vis-state="visState"
          :vis-notice="visNotice"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-equalizer-x
          v-else-if="insert && insert.pluginId === 'equalizer-x'"
          :insert="insert"
          :spectrum="spectrum"
          :pre-spectrum="preSpectrum"
          :meters="meters"
          :vis-state="visState"
          :vis-notice="visNotice"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-boost-x
          v-else-if="insert && insert.pluginId === 'boost-x'"
          :insert="insert"
          :meters="meters"
          :vis-state="visState"
          :vis-notice="visNotice"
          @change="onChange"
        />
        <plugin-dynamic-x
          v-else-if="insert && insert.pluginId === 'dynamic-x'"
          :insert="insert"
          :meters="meters"
          :spectrum="spectrum"
          :vis-state="visState"
          :vis-notice="visNotice"
          @change="onChange"
          @change-plugin="changePlugin"
        />
        <plugin-limiter-x
          v-else-if="insert && insert.pluginId === 'limiter-x'"
          :insert="insert"
          :meters="meters"
          :vis-state="visState"
          :vis-notice="visNotice"
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
import DawIcon from '../daw-icon.vue'
import { session, closePlugin, persistWebMixer, getFxAnalyser, getFxMeterPayload, removeInsert, openLiteSheet, isLite } from '../../store/session.js'
import { resolveOpenInsert, fxMeterLaneKey, laneFromOpen } from '../../model/web-mixer.js'
import { pickPluginSpectrum, pickPreSpectrum, metersForInsert, visualState, visualStateLabel } from '../../dsp/runtime.js'
import PluginReverbX from './plugin-reverb-x.vue'
import PluginEqualizerX from './plugin-equalizer-x.vue'
import PluginBoostX from './plugin-boost-x.vue'
import PluginDynamicX from './plugin-dynamic-x.vue'
import PluginLimiterX from './plugin-limiter-x.vue'
import './dsp-theme.css'
import './lite-plugin-surface.css'

const lite = computed(() => isLite())
const liveSpectrum = ref([])
const livePreSpectrum = ref([])
const liveMeters = ref({})
const liveState = ref('')
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
const preSpectrum = computed(() => livePreSpectrum.value)
const visState = computed(() => liveState.value)
const visNotice = computed(() => visualStateLabel(liveState.value))

let raf = 0
function tick () {
  const key = meterKey.value
  const posted = getFxMeterPayload(key)
  liveMeters.value = metersForInsert(posted, insert.value)
  liveSpectrum.value = pickPluginSpectrum(posted, getFxAnalyser(key), insert.value)
  livePreSpectrum.value = pickPreSpectrum(posted, insert.value)
  liveState.value = visualState(posted, insert.value, {
    attached: !!session.diagnostics.browserFxAttached,
    error: session.diagnostics.browserFxError
  })
  raf = requestAnimationFrame(tick)
}

function stopTick () {
  cancelAnimationFrame(raf)
  raf = 0
}

function startTick () {
  if (raf || !session.openPlugin) return
  raf = requestAnimationFrame(tick)
}

watch(() => session.openPlugin, (open) => {
  stopTick()
  liveSpectrum.value = []
  livePreSpectrum.value = []
  liveMeters.value = {}
  liveState.value = ''
  if (open) startTick()
}, { immediate: true })

// A hidden tab must not keep burning RAF frames and battery on FFT redraws.
function onVisibility () {
  if (typeof document === 'undefined') return
  if (document.hidden) stopTick()
  else startTick()
}

onMounted(() => {
  startTick()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
})
onUnmounted(() => {
  stopTick()
  if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
})

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
  // Header buttons own their own gestures; a long press there must not swap the
  // plugin out from under the tap.
  const target = e.target
  if (target && typeof target.closest === 'function' && target.closest('.grab')) return
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
  /* ~3/4 of viewport area: sqrt(0.75) ? 0.866 on each axis */
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
.grab {
  height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  color: #8E939C;
  flex-shrink: 0;
}
.grab-btn {
  /* 32 px hit target with 18 px of ink, matching the rest of the app. */
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #5A5E66;
  flex-shrink: 0;
}
.grab-btn:hover { background: rgba(38, 40, 44, 0.06); }
.grab-btn.danger { color: #C4503C; }
.grab-btn.close { margin-left: auto; }
/* Why a graph may be empty, spelled out next to the controls that caused it. */
.grab-state {
  margin-left: auto;
  padding: 0 8px;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: #B0764A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.grab-state + .grab-btn.close { margin-left: 0; }
.head-lite { height: 44px; padding: 0 8px; }
.head-lite .grab-btn { width: 44px; height: 44px; }
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
