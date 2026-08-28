<template>
  <view v-if="session.openPlugin" class="host" @click.self="close">
      <view class="sheet" :class="skinClass" @click.stop>
        <view class="grab">
          <text v-if="session.openPlugin" class="grab-remove" @click="remove">Remove</text>
          <text class="grab-close" @click="close">Close</text>
        </view>
        <plugin-reverb-x
          v-if="insert && insert.pluginId === 'reverb-x'"
          :insert="insert"
          :meters="meters"
          @change="onChange"
        />
        <plugin-equalizer-x
          v-else-if="insert && insert.pluginId === 'equalizer-x'"
          :insert="insert"
          :spectrum="spectrum"
          :meters="meters"
          @change="onChange"
        />
        <plugin-boost-x v-else-if="insert && insert.pluginId === 'boost-x'" :insert="insert" :meters="meters" @change="onChange" />
        <plugin-dynamic-x
          v-else-if="insert && insert.pluginId === 'dynamic-x'"
          :insert="insert"
          :meters="meters"
          :spectrum="spectrum"
          @change="onChange"
        />
        <plugin-limiter-x
          v-else-if="insert && insert.pluginId === 'limiter-x'"
          :insert="insert"
          :meters="meters"
          @change="onChange"
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
import { session, closePlugin, persistWebMixer, getFxAnalyser, removeInsert } from '../../store/session.js'
import { resolveOpenInsert, fxMeterLaneKey, laneFromOpen } from '../../model/web-mixer.js'
import { pickPluginSpectrum, metersForInsert } from '../../dsp/runtime.js'
import PluginReverbX from './plugin-reverb-x.vue'
import PluginEqualizerX from './plugin-equalizer-x.vue'
import PluginBoostX from './plugin-boost-x.vue'
import PluginDynamicX from './plugin-dynamic-x.vue'
import PluginLimiterX from './plugin-limiter-x.vue'
import './dsp-theme.css'

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
function onChange () { persistWebMixer() }
</script>

<style scoped>
.host {
  position: fixed;
  inset: 0;
  background: rgba(4, 6, 10, 0.72);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(6px, env(safe-area-inset-top, 0px)) 8px max(8px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
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
  background:
    radial-gradient(ellipse at 50% -8%, rgba(80, 70, 130, 0.16), transparent 46%),
    #080A0F;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  padding: 4px 4px 10px;
  box-shadow: 0 28px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04);
}
.sheet > :deep(.x-plug) {
  flex: 1;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.grab {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  padding: 0 14px;
  color: #6B7380;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  font-size: 10px;
  flex-shrink: 0;
}
.grab-remove, .grab-close { min-height: 32px; display: flex; align-items: center; cursor: pointer; }
.grab-remove { color: #a87870; }
.missing {
  padding: 24px 16px 40px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.missing-title { font-size: 16px; color: #e8e4dc; }
.missing-id { font-size: 13px; color: #8a8680; text-align: center; line-height: 1.45; }
</style>
