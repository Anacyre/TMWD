<template>
  <view class="twin">
    <view class="bar">
      <text class="mark">TWIN</text>
      <view class="preset">
        <view class="step" @click.stop="stepPreset(-1)">‹</view>
        <text class="preset-name">{{ presetLabel }}</text>
        <view class="step" @click.stop="stepPreset(1)">›</view>
      </view>
      <view class="modes">
        <text class="mode" :class="{ on: panel }" @click.stop="setPanel(true)">Panel</text>
        <text class="mode" :class="{ on: !panel }" @click.stop="setPanel(false)">List</text>
      </view>
      <text class="out">{{ outLabel }}</text>
    </view>
    <plugin-twin-panel v-if="panel" :track="track" />
    <plugin-twin-list v-else :track="track" />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import PluginTwinPanel from './plugin-twin-panel.vue'
import PluginTwinList from './plugin-twin-list.vue'
import { normalizeTwinState } from '../../dsp/synth/params.js'
import { TWIN_PRESETS } from '../../dsp/synth/presets.js'
import { updateTwinPatch } from '../../store/session.js'
import { useTwinPatch } from './twin-patch.js'

const UI_KEY = 'daw.twin.panelUi'
const props = defineProps({ track: { type: Object, required: true } })
const { state } = useTwinPatch(props)
const presetCursor = ref(0)
const panel = ref(readPanel())

function readPanel () {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(UI_KEY) !== '0'
  } catch (e) {
    return true
  }
}
function setPanel (on) {
  panel.value = on
  try { localStorage.setItem(UI_KEY, on ? '1' : '0') } catch (e) {}
}

const presetLabel = computed(() => {
  const cur = JSON.stringify(state.value)
  const found = TWIN_PRESETS.find((p) => JSON.stringify(normalizeTwinState(p.state)) === cur)
  return found ? found.name : 'Edited'
})
const outLabel = computed(() => {
  const g = state.value.gain
  if (g < 0.001) return '-inf'
  const db = 20 * Math.log10(g)
  return (db >= 0 ? '+' : '') + db.toFixed(1) + ' dB'
})

function stepPreset (dir) {
  const cur = JSON.stringify(state.value)
  let i = TWIN_PRESETS.findIndex((p) => JSON.stringify(normalizeTwinState(p.state)) === cur)
  if (i < 0) i = presetCursor.value
  const next = (i + dir + TWIN_PRESETS.length) % TWIN_PRESETS.length
  presetCursor.value = next
  props.track.twinState = normalizeTwinState(TWIN_PRESETS[next].state)
  updateTwinPatch(props.track)
}
</script>

<style scoped>
.twin {
  height: 100%;
  min-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px 10px;
  box-sizing: border-box;
  background: #1f2125;
  color: #d6d9de;
}
.bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 34px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.mark {
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: #f2b13d;
  font-size: 13px;
}
.preset { display: flex; align-items: center; gap: 2px; flex: 1; min-width: 0; justify-content: center; }
.preset-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
  padding: 0 6px;
  color: #e8eaee;
}
.step {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9aa0aa;
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 7px;
  font-size: 15px;
  cursor: pointer;
}
.modes { display: flex; gap: 0; background: #26282d; border: 1px solid rgba(255,255,255,0.06); border-radius: 7px; overflow: hidden; }
.mode {
  padding: 4px 10px;
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8b919b;
  cursor: pointer;
}
.mode.on { color: #1f2125; background: #f2b13d; }
.out { font-size: 11px; color: #9aa0aa; flex-shrink: 0; font-variant-numeric: tabular-nums; }
.twin :deep(.twin-panel) { flex: 1; min-height: 0; }
.twin :deep(.twin-list) { flex: 1; overflow-y: auto; }
</style>
