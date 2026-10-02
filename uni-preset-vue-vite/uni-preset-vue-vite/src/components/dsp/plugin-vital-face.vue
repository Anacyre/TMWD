<template>
  <view class="face">
    <view class="rail"><text>{{ rail }}</text></view>
    <view class="board" :class="'board-' + kind">
      <template v-if="kind === 'reverb'">
        <vital-ctrl class="c-pre-low" :spec="spec('preLowMidi')" :model-value="state.preLowMidi" @update:model-value="set('preLowMidi', $event)" />
        <vital-ctrl class="c-pre-high" :spec="spec('preHighMidi')" :model-value="state.preHighMidi" @update:model-value="set('preHighMidi', $event)" />
        <view class="plot plot-reverb">
          <view class="tabs">
            <text :class="{ on: shelf === 'low' }" @click="shelf = 'low'">Low</text>
            <text :class="{ on: shelf === 'high' }" @click="shelf = 'high'">High</text>
          </view>
          <vital-graph plugin-id="reverb-lite" :state="state" :band="shelf" @set="set" />
        </view>
        <view class="knob-row row-a">
          <vital-ctrl :spec="shelf === 'low' ? spec('lowShelfMidi') : spec('highShelfMidi')" :model-value="shelf === 'low' ? state.lowShelfMidi : state.highShelfMidi" @update:model-value="set(shelf === 'low' ? 'lowShelfMidi' : 'highShelfMidi', $event)" />
          <vital-ctrl :spec="spec('chorusAmount')" :model-value="state.chorusAmount" @update:model-value="set('chorusAmount', $event)" />
          <vital-ctrl :spec="spec('delay')" :model-value="state.delay" @update:model-value="set('delay', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row row-b">
          <vital-ctrl :spec="shelf === 'low' ? spec('lowShelfDb') : spec('highShelfDb')" :model-value="shelf === 'low' ? state.lowShelfDb : state.highShelfDb" @update:model-value="set(shelf === 'low' ? 'lowShelfDb' : 'highShelfDb', $event)" />
          <vital-ctrl :spec="spec('chorusFrequency')" :model-value="state.chorusFrequency" @update:model-value="set('chorusFrequency', $event)" />
          <vital-ctrl :spec="spec('size')" :model-value="state.size" @update:model-value="set('size', $event)" />
          <vital-ctrl :spec="spec('decayTime')" :model-value="state.decayTime" @update:model-value="set('decayTime', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'equalizer'">
        <view class="modes">
          <text :class="{ on: band === 'low' }" @click="flip('lowMode', eqLow)">{{ state.lowMode }}</text>
          <text :class="{ on: band === 'band' }" @click="flip('bandMode', eqBand)">{{ state.bandMode }}</text>
          <text :class="{ on: band === 'high' }" @click="flip('highMode', eqHigh)">{{ state.highMode }}</text>
        </view>
        <view class="tabs tabs-eq">
          <text :class="{ on: band === 'low' }" @click="pickBand('low')">Low</text>
          <text :class="{ on: band === 'band' }" @click="pickBand('band')">Band</text>
          <text :class="{ on: band === 'high' }" @click="pickBand('high')">High</text>
        </view>
        <view class="knob-row eq-knobs">
          <vital-ctrl :spec="spec(band + 'GainDb')" :model-value="state[band + 'GainDb']" :disabled="gainOff" @update:model-value="set(band + 'GainDb', $event)" />
          <vital-ctrl :spec="spec(band + 'Midi')" :model-value="state[band + 'Midi']" @update:model-value="set(band + 'Midi', $event)" />
          <vital-ctrl :spec="spec(band + 'Res')" :model-value="state[band + 'Res']" @update:model-value="set(band + 'Res', $event)" />
        </view>
        <vital-graph class="plot-eq" plugin-id="equalizer-lite" :state="state" :band="band" @set="set" />
      </template>

      <template v-else-if="kind === 'filter'">
        <view class="filter-head">
          <vital-ctrl :spec="spec('model')" :model-value="state.model" @update:model-value="set('model', $event)" />
          <vital-ctrl :spec="spec('style')" :model-value="state.style" @update:model-value="set('style', $event)" />
        </view>
        <vital-ctrl class="res-fader" linear="y" :spec="spec('resonance')" :model-value="state.resonance" @update:model-value="set('resonance', $event)" />
        <vital-graph class="plot-filter" plugin-id="filter-lite" :state="state" @set="set" />
        <vital-ctrl class="cut-fader" linear="x" :spec="spec('cutoffMidi')" :model-value="state.cutoffMidi" @update:model-value="set('cutoffMidi', $event)" />
        <view class="knob-row filter-knobs">
          <vital-ctrl :spec="spec('drive')" :model-value="state.drive" @update:model-value="set('drive', $event)" />
          <vital-ctrl :spec="spec('blend')" :model-value="state.blend" @update:model-value="set('blend', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'delay'">
        <vital-ctrl class="style-box" :spec="spec('style')" :model-value="state.style" @update:model-value="set('style', $event)" />
        <view class="freq-box">
          <vital-ctrl :spec="spec('frequency')" :model-value="state.frequency" @update:model-value="set('frequency', $event)" />
          <vital-ctrl v-if="state.style !== 'mono'" :spec="spec('auxFrequency')" :model-value="state.auxFrequency" @update:model-value="set('auxFrequency', $event)" />
        </view>
        <vital-graph class="plot-delay" plugin-id="delay-lite" :state="state" @set="set" />
        <vital-graph class="plot-delay-filter" plugin-id="delay-lite" mode="filter" :state="state" @set="set" />
        <view class="knob-row delay-top">
          <vital-ctrl :spec="spec('feedback')" :model-value="state.feedback" @update:model-value="set('feedback', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row delay-bot">
          <vital-ctrl :spec="spec('cutoffMidi')" :model-value="state.cutoffMidi" @update:model-value="set('cutoffMidi', $event)" />
          <vital-ctrl :spec="spec('spread')" :model-value="state.spread" @update:model-value="set('spread', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'distortion'">
        <vital-ctrl class="type-box" :spec="spec('type')" :model-value="state.type" @update:model-value="set('type', $event)" />
        <vital-ctrl class="order-box" :spec="spec('filterOrder')" :model-value="state.filterOrder" @update:model-value="set('filterOrder', $event)" />
        <vital-graph class="plot-shape" plugin-id="distortion-lite" mode="shape" :state="state" @set="set" />
        <vital-graph class="plot-dfilter" plugin-id="distortion-lite" mode="filter" :state="state" @set="set" />
        <view class="knob-row dist-top">
          <vital-ctrl :spec="spec('drive')" :model-value="state.drive" @update:model-value="set('drive', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row dist-bot">
          <vital-ctrl :spec="spec('cutoffMidi')" :model-value="state.cutoffMidi" :disabled="filterOff" @update:model-value="set('cutoffMidi', $event)" />
          <vital-ctrl :spec="spec('resonance')" :model-value="state.resonance" :disabled="filterOff" @update:model-value="set('resonance', $event)" />
          <vital-ctrl :spec="spec('blend')" :model-value="state.blend" :disabled="filterOff" @update:model-value="set('blend', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'compressor'">
        <vital-ctrl class="mode-box" :spec="spec('bands')" :model-value="state.bands" @update:model-value="set('bands', $event)" />
        <vital-ctrl class="mix-box" :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        <vital-graph class="plot-comp" plugin-id="compressor-lite" :state="state" />
        <view class="knob-row comp-gains">
          <vital-ctrl :spec="spec('lowGainDb')" :model-value="state.lowGainDb" :disabled="!bandOn('low')" @update:model-value="set('lowGainDb', $event)" />
          <vital-ctrl :spec="spec('bandGainDb')" :model-value="state.bandGainDb" :disabled="!bandOn('band')" @update:model-value="set('bandGainDb', $event)" />
          <vital-ctrl :spec="spec('highGainDb')" :model-value="state.highGainDb" :disabled="!bandOn('high')" @update:model-value="set('highGainDb', $event)" />
        </view>
        <vital-ctrl class="atk-box" :spec="spec('attack')" :model-value="state.attack" @update:model-value="set('attack', $event)" />
        <vital-ctrl class="rel-box" :spec="spec('release')" :model-value="state.release" @update:model-value="set('release', $event)" />
        <view class="knob-row comp-thresh">
          <vital-ctrl :spec="spec('lowUpperDb')" :model-value="state.lowUpperDb" :disabled="!bandOn('low')" @update:model-value="set('lowUpperDb', $event)" />
          <vital-ctrl :spec="spec('bandUpperDb')" :model-value="state.bandUpperDb" :disabled="!bandOn('band')" @update:model-value="set('bandUpperDb', $event)" />
          <vital-ctrl :spec="spec('highUpperDb')" :model-value="state.highUpperDb" :disabled="!bandOn('high')" @update:model-value="set('highUpperDb', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'chorus'">
        <vital-ctrl class="voices-box" :spec="spec('voices')" :model-value="state.voices" @update:model-value="set('voices', $event)" />
        <vital-ctrl class="rate-box" :spec="spec('frequency')" :model-value="state.frequency" @update:model-value="set('frequency', $event)" />
        <view class="knob-row chorus-delays">
          <vital-ctrl :spec="spec('modDepth')" :model-value="state.modDepth" @update:model-value="set('modDepth', $event)" />
          <vital-ctrl :spec="spec('delay1')" :model-value="state.delay1" @update:model-value="set('delay1', $event)" />
          <vital-ctrl :spec="spec('delay2')" :model-value="state.delay2" @update:model-value="set('delay2', $event)" />
        </view>
        <vital-graph class="plot-chorus" plugin-id="chorus-lite" :state="state" />
        <vital-graph class="plot-chorus-filter" plugin-id="chorus-lite" mode="filter" :state="state" @set="set" />
        <view class="knob-row chorus-top">
          <vital-ctrl :spec="spec('feedback')" :model-value="state.feedback" @update:model-value="set('feedback', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row chorus-bot">
          <vital-ctrl :spec="spec('cutoffMidi')" :model-value="state.cutoffMidi" @update:model-value="set('cutoffMidi', $event)" />
          <vital-ctrl :spec="spec('spread')" :model-value="state.spread" @update:model-value="set('spread', $event)" />
        </view>
      </template>

      <template v-else>
        <vital-graph class="plot-mod" :plugin-id="pluginId" :state="state" />
        <view class="knob-row mod-knobs">
          <vital-ctrl v-for="knob in modKnobs" :key="knob.key" :spec="knob" :model-value="state[knob.key]" @update:model-value="set(knob.key, $event)" />
        </view>
      </template>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import VitalCtrl from './vital-ctrl.vue'
import VitalGraph from './vital-graph.vue'
import { EQ_LOW_MODES, EQ_BAND_MODES, EQ_HIGH_MODES } from '../../dsp/vital-lite/params.js'
import { VITAL_LITE_SUBTITLE } from '../../dsp/vital-lite/index.js'

const props = defineProps({
  pluginId: { type: String, required: true },
  state: { type: Object, required: true },
  panel: { type: Object, required: true }
})
const emit = defineEmits(['set'])

const shelf = ref('low')
const band = ref('low')
const eqLow = EQ_LOW_MODES
const eqBand = EQ_BAND_MODES
const eqHigh = EQ_HIGH_MODES

const kind = computed(() => (props.pluginId || '').replace(/-lite$/, ''))
const rail = computed(() => (VITAL_LITE_SUBTITLE[props.pluginId] || 'Lite').replace(/\s+Lite$/, '').toUpperCase())
const lookup = computed(() => {
  const map = {}
  for (const knob of (props.panel && props.panel.knobs) || []) map[knob.key] = knob
  for (const sel of (props.panel && props.panel.selects) || []) map[sel.key] = sel
  return map
})
const modKnobs = computed(() => (props.panel && props.panel.knobs) || [])
const filterOff = computed(() => props.state.filterOrder === 'off')
const gainOff = computed(() => {
  const mode = props.state[band.value + 'Mode']
  return mode === 'highpass' || mode === 'notch' || mode === 'lowpass'
})

function spec (key) {
  return lookup.value[key] || null
}
function set (key, value) { emit('set', key, value) }
function pickBand (next) { band.value = next }
function flip (key, options) {
  const cur = props.state[key]
  const next = options.find((item) => item !== cur) || options[0]
  if (key === 'lowMode') band.value = 'low'
  else if (key === 'bandMode') band.value = 'band'
  else if (key === 'highMode') band.value = 'high'
  set(key, next)
}
function bandOn (which) {
  const mode = props.state.bands || 'multiband'
  if (mode === 'multiband') return true
  if (mode === 'single') return which === 'band'
  if (mode === 'low-band') return which === 'low'
  if (mode === 'high-band') return which === 'high'
  return true
}
</script>

<style scoped>
.face {
  flex: 1;
  min-height: 320px;
  display: flex;
  gap: 10px;
  color: #e7eaee;
}
.rail {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}
.rail text {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.28em;
  font-size: 11px;
  font-weight: 600;
  color: #d5dee6;
}
.board {
  flex: 1;
  min-width: 0;
  min-height: 300px;
  display: grid;
  gap: 8px;
  align-items: stretch;
}
.knob-row { display: flex; flex-wrap: wrap; justify-content: space-around; align-items: flex-end; gap: 6px; }
.tabs, .modes {
  display: flex;
  gap: 4px;
}
.tabs text, .modes text {
  flex: 1;
  text-align: center;
  padding: 6px 4px;
  border-radius: 4px;
  background: #0c0e11;
  border: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #8b939e;
  cursor: pointer;
}
.tabs text.on, .modes text.on { color: #e7eaee; border-color: rgba(232, 238, 242, 0.45); }

.board-reverb {
  grid-template-columns: 96px minmax(140px, 1fr) minmax(220px, 1.3fr);
  grid-template-rows: auto 1fr auto auto;
}
.c-pre-low { grid-column: 1; grid-row: 1 / span 2; align-self: start; }
.c-pre-high { grid-column: 1; grid-row: 3 / span 2; align-self: end; }
.plot-reverb { grid-column: 2; grid-row: 1 / span 4; display: flex; flex-direction: column; gap: 6px; min-height: 180px; }
.plot-reverb .well, .plot-reverb :deep(.well) { flex: 1; }
.row-a { grid-column: 3; grid-row: 1 / span 2; }
.row-b { grid-column: 3; grid-row: 3 / span 2; }

.board-equalizer {
  grid-template-columns: minmax(220px, 0.9fr) minmax(180px, 1.1fr);
  grid-template-rows: auto auto 1fr;
}
.modes { grid-column: 1; grid-row: 1; }
.tabs-eq { grid-column: 1; grid-row: 2; }
.eq-knobs { grid-column: 1; grid-row: 3; align-self: end; }
.plot-eq { grid-column: 2; grid-row: 1 / span 3; min-height: 180px; }

.board-filter {
  grid-template-columns: 1fr 72px;
  grid-template-rows: auto minmax(120px, 1fr) auto auto;
}
.filter-head { grid-column: 1 / span 2; display: flex; gap: 8px; }
.filter-head > * { flex: 1; }
.plot-filter { grid-column: 1; grid-row: 2; min-height: 140px; }
.res-fader { grid-column: 2; grid-row: 2; }
.cut-fader { grid-column: 1 / span 2; }
.filter-knobs { grid-column: 1 / span 2; }

.board-delay, .board-chorus {
  grid-template-columns: minmax(150px, 0.7fr) minmax(140px, 1fr) minmax(140px, 0.7fr);
  grid-template-rows: auto minmax(90px, 1fr) minmax(90px, 1fr);
}
.style-box, .voices-box { grid-column: 1; grid-row: 3; }
.freq-box, .rate-box { grid-column: 1; grid-row: 1; }
.chorus-delays { grid-column: 1; grid-row: 2; align-self: end; }
.freq-box { display: flex; gap: 6px; }
.plot-delay, .plot-chorus { grid-column: 2; grid-row: 1 / span 2; min-height: 90px; }
.plot-delay-filter, .plot-chorus-filter { grid-column: 2; grid-row: 3; min-height: 80px; }
.delay-top, .chorus-top { grid-column: 3; grid-row: 1; }
.delay-bot, .chorus-bot { grid-column: 3; grid-row: 3; align-self: end; }

.board-distortion {
  grid-template-columns: minmax(120px, 0.55fr) minmax(160px, 1fr) minmax(180px, 0.9fr);
  grid-template-rows: minmax(90px, 1fr) minmax(90px, 1fr);
}
.type-box { grid-column: 1; grid-row: 1; }
.order-box { grid-column: 1; grid-row: 2; }
.plot-shape { grid-column: 2; grid-row: 1; }
.plot-dfilter { grid-column: 2; grid-row: 2; }
.dist-top { grid-column: 3; grid-row: 1; }
.dist-bot { grid-column: 3; grid-row: 2; align-self: end; }

.board-compressor {
  grid-template-columns: minmax(200px, 1.1fr) minmax(160px, 0.8fr) 88px;
  grid-template-rows: auto minmax(100px, 1fr) auto;
}
.mode-box { grid-column: 1; grid-row: 1; }
.mix-box { grid-column: 2; grid-row: 1; justify-self: end; }
.plot-comp { grid-column: 2; grid-row: 2 / span 2; min-height: 120px; }
.comp-gains { grid-column: 1; grid-row: 2; align-self: end; }
.comp-thresh { grid-column: 1; grid-row: 3; }
.atk-box { grid-column: 3; grid-row: 1; }
.rel-box { grid-column: 3; grid-row: 3; }

.board-flanger, .board-phaser {
  grid-template-rows: minmax(120px, 1fr) auto;
}
.plot-mod { min-height: 120px; }
.mod-knobs { align-self: end; }

@media (max-width: 860px) {
  .board-reverb,
  .board-equalizer,
  .board-filter,
  .board-delay,
  .board-chorus,
  .board-distortion,
  .board-compressor {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
  .board-reverb > *,
  .board-equalizer > *,
  .board-filter > *,
  .board-delay > *,
  .board-chorus > *,
  .board-distortion > *,
  .board-compressor > * {
    grid-column: 1;
    grid-row: auto;
  }
  .plot-reverb, .plot-eq, .plot-filter, .plot-delay, .plot-chorus, .plot-shape, .plot-comp {
    min-height: 140px;
  }
}
</style>
