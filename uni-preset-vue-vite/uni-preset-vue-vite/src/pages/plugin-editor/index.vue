<template>
  <view class="page dsp-skin" :class="skinClass">
    <view v-if="loadError" class="missing">
      <text class="missing-title">Plugin UI unavailable</text>
      <text class="missing-id">{{ loadError }}</text>
    </view>
    <template v-else-if="insert">
      <plugin-reverb-x v-if="insert.pluginId === 'reverb-x'" :insert="insert" :meters="meters" @change="onChange" />
      <plugin-equalizer-x
        v-else-if="insert.pluginId === 'equalizer-x'"
        :insert="insert"
        :spectrum="spectrum"
        :meters="meters"
        @change="onChange"
      />
      <plugin-boost-x
        v-else-if="insert.pluginId === 'boost-x'"
        :insert="insert"
        :meters="meters"
        @change="onChange"
      />
      <plugin-dynamic-x
        v-else-if="insert.pluginId === 'dynamic-x'"
        :insert="insert"
        :meters="meters"
        :spectrum="spectrum"
        @change="onChange"
      />
      <plugin-limiter-x
        v-else-if="insert.pluginId === 'limiter-x'"
        :insert="insert"
        :meters="meters"
        @change="onChange"
      />
      <view v-else class="missing">
        <text class="missing-title">Unsupported plugin</text>
        <text class="missing-id">{{ insert.pluginId }}</text>
      </view>
    </template>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import PluginReverbX from '../../components/dsp/plugin-reverb-x.vue'
import PluginEqualizerX from '../../components/dsp/plugin-equalizer-x.vue'
import PluginBoostX from '../../components/dsp/plugin-boost-x.vue'
import PluginDynamicX from '../../components/dsp/plugin-dynamic-x.vue'
import PluginLimiterX from '../../components/dsp/plugin-limiter-x.vue'
import { createInsert } from '../../dsp/plugin.js'
import { plugins } from '../../dsp/registry.js'
import { session, getFxAnalyser, persistWebMixer } from '../../store/session.js'
import { resolveOpenInsert, syncNativeInsertsToWebMixer, fxMeterLaneKey } from '../../model/web-mixer.js'
import { pickPluginSpectrum, metersForInsert } from '../../dsp/runtime.js'
import '../../components/dsp/dsp-theme.css'

const insert = ref(null)
const loadError = ref('')
const liveMeters = ref({})
const liveSpectrum = ref([])
const meters = liveMeters
const spectrum = liveSpectrum

const skinClass = computed(() => {
  const id = insert.value && insert.value.pluginId
  if (id === 'equalizer-x') return 'skin-eq'
  if (id === 'reverb-x') return 'skin-rev'
  if (id === 'dynamic-x') return 'skin-dyn'
  if (id === 'boost-x') return 'skin-boost'
  if (id === 'limiter-x') return 'skin-lim'
  return ''
})

function readPluginIdFromLocation () {
  if (typeof window === 'undefined') return ''
  const search = window.location.search || ''
  if (search.includes('pluginId=') || search.includes('id=')) {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    return params.get('pluginId') || params.get('id') || ''
  }
  const hash = window.location.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex >= 0) {
    const params = new URLSearchParams(hash.slice(qIndex + 1))
    return params.get('pluginId') || params.get('id') || ''
  }
  return ''
}

function laneFromQuery (query) {
  const trackIndex = Number(query.trackIndex)
  if (Number.isNaN(trackIndex) || trackIndex < 0) return null
  const track = session.tracks[trackIndex]
  if (!track) return null
  if (track.type === 'master') return { type: 'master' }
  return { type: 'track', id: track.id }
}

function bindInsert (pluginId, query = {}) {
  const id = pluginId || readPluginIdFromLocation()
  const lane = laneFromQuery(query)
  const slotIndex = Number(query.slotIndex)
  if (lane && !Number.isNaN(slotIndex) && slotIndex >= 0) {
    syncNativeInsertsToWebMixer(session.webMixer, session.tracks)
    const resolved = resolveOpenInsert(session.webMixer, {
      lane,
      index: slotIndex,
      laneType: lane.type,
      laneId: lane.id
    }, session.tracks)
    if (resolved) {
      loadError.value = ''
      insert.value = resolved
      return
    }
  }
  const def = plugins[id]
  if (!def) {
    loadError.value = 'Unknown plugin: ' + (id || '(empty)')
    insert.value = null
    return
  }
  loadError.value = ''
  insert.value = createInsert(id, plugins)
}

function pushNativeState () {
  if (!insert.value || typeof window === 'undefined') return
  const backend = window.__JUCE__ && window.__JUCE__.backend
  if (!backend || typeof backend.emitEvent !== 'function') return
  backend.emitEvent('nativeFxState', {
    pluginId: insert.value.pluginId,
    enabled: insert.value.enabled !== false,
    state: insert.value.state || {}
  })
}

function onChange () {
  persistWebMixer()
  pushNativeState()
}

function meterKey () {
  if (session.openPlugin) {
    return fxMeterLaneKey(session.openPlugin, session.tracks, {
      localPlayback: !session.remoteAudioOn
    })
  }
  if (session.fxMeters.master && session.fxMeters.master.outPeak != null) return 'master'
  return 'remote'
}

let raf = 0
function tick () {
  const key = meterKey()
  const posted = session.fxMeters[key] || {}
  liveMeters.value = metersForInsert(posted, insert.value)
  liveSpectrum.value = pickPluginSpectrum(posted, getFxAnalyser(key), insert.value)
  raf = requestAnimationFrame(tick)
}

onLoad((query) => {
  bindInsert(query.pluginId || query.id || readPluginIdFromLocation(), query)
  pushNativeState()
})

onShow(() => {
  if (!insert.value) bindInsert(readPluginIdFromLocation())
})

onMounted(() => { raf = requestAnimationFrame(tick) })
onUnmounted(() => cancelAnimationFrame(raf))
</script>

<style scoped>
.page {
  height: 100vh;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse at 50% -8%, rgba(80, 70, 130, 0.16), transparent 46%),
    #080A0F;
  padding: 4px 8px 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.page > :deep(.x-plug) {
  flex: 1;
  min-height: 0;
  height: auto;
  overflow: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.missing {
  padding: 40px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}
.missing-title { font-size: 16px; color: #e8e4dc; }
.missing-id { font-size: 13px; color: #8a8680; text-align: center; line-height: 1.45; }
</style>
