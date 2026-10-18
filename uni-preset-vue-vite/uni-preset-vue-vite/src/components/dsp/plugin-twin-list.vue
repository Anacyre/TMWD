<template>
  <view class="twin-list">
    <text class="cap">Oscillators</text>
    <view v-for="osc in oscs" :key="osc.key" class="block">
      <view class="row">
        <view class="chip" :class="{ off: osc.level < 0.001 }" @click.stop="toggleOsc(osc)">{{ osc.label }}</view>
        <view class="chip wave" @click.stop="cycleWave(osc.key)">{{ waveName(osc.wave) }}</view>
        <text class="read">{{ pct(osc.level) }}</text>
      </view>
      <daw-fader class="sl" scroll-axis="y" :model-value="osc.level" @update:model-value="setOsc(osc.key, 'level', $event)" />
    </view>
    <text class="cap">Filter &amp; FX</text>
    <daw-fader class="sl" scroll-axis="y" :model-value="logUnit(state.filter1.cutoff, 40, 18000)" @update:model-value="setFilt('filter1', 'cutoff', fromLog($event, 40, 18000))" />
    <daw-fader class="sl" scroll-axis="y" :model-value="state.chorus" @update:model-value="set('chorus', $event)" />
    <daw-fader class="sl" scroll-axis="y" :model-value="state.reverb" @update:model-value="set('reverb', $event)" />
  </view>
</template>

<script setup>
import { computed } from 'vue'
import DawFader from '../daw-fader.vue'
import { useTwinPatch } from './twin-patch.js'

const props = defineProps({ track: { type: Object, required: true } })
const { state, set, setOsc, setFilt, pct, logUnit, fromLog, waveName, toggleOsc, cycleWave } = useTwinPatch(props)
const oscs = computed(() => ['osc1', 'osc2', 'osc3'].map((key, i) => ({ key, label: 'Osc ' + (i + 1), ...state.value[key] })))
</script>

<style scoped>
.twin-list { padding: 0 4px 12px; display: flex; flex-direction: column; gap: 6px; }
.cap { font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: #8b919b; margin-top: 6px; }
.block { display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; align-items: center; gap: 8px; }
.chip {
  min-height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  background: #26282d;
  border: 1px solid rgba(255,255,255,0.055);
  color: #d6d9de;
  font-size: 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.chip.wave { color: #f2b13d; }
.chip.off { opacity: 0.4; }
.read { font-size: 11px; color: #9aa0aa; margin-left: auto; font-variant-numeric: tabular-nums; }
.sl { width: 100%; height: 28px; }
</style>
