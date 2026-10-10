<template>
  <view class="face" :style="accentStyle">
    <view class="rail">
      <view class="led" />
      <text>{{ rail }}</text>
    </view>
    <view class="board" :class="'board-' + kind">
      <template v-if="kind === 'reverb'">
        <vital-ctrl class="c-pre-low" :spec="specAs('preLowMidi', 'Low Cut')" :model-value="state.preLowMidi" @update:model-value="set('preLowMidi', $event)" />
        <vital-ctrl class="c-pre-high" :spec="specAs('preHighMidi', 'High Cut')" :model-value="state.preHighMidi" @update:model-value="set('preHighMidi', $event)" />
        <view class="plot plot-reverb">
          <view class="tabs">
            <text :class="{ on: shelf === 'low' }" @click="shelf = 'low'">Low</text>
            <text :class="{ on: shelf === 'high' }" @click="shelf = 'high'">High</text>
          </view>
          <vital-graph plugin-id="reverb-lite" :state="state" :band="shelf" @set="set" />
        </view>
        <view class="knob-row row-a">
          <vital-ctrl :spec="specAs(shelf === 'low' ? 'lowShelfMidi' : 'highShelfMidi', 'Cutoff')" :model-value="shelf === 'low' ? state.lowShelfMidi : state.highShelfMidi" @update:model-value="set(shelf === 'low' ? 'lowShelfMidi' : 'highShelfMidi', $event)" />
          <vital-ctrl :spec="specAs('chorusAmount', 'Chor Amt')" :model-value="state.chorusAmount" @update:model-value="set('chorusAmount', $event)" />
          <vital-ctrl :spec="specAs('delay', 'Delay')" :model-value="state.delay" @update:model-value="set('delay', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row row-b">
          <vital-ctrl :spec="specAs(shelf === 'low' ? 'lowShelfDb' : 'highShelfDb', 'Gain')" :model-value="shelf === 'low' ? state.lowShelfDb : state.highShelfDb" @update:model-value="set(shelf === 'low' ? 'lowShelfDb' : 'highShelfDb', $event)" />
          <vital-ctrl :spec="specAs('chorusFrequency', 'Chor Freq')" :model-value="state.chorusFrequency" @update:model-value="set('chorusFrequency', $event)" />
          <vital-ctrl :spec="spec('size')" :model-value="state.size" @update:model-value="set('size', $event)" />
          <vital-ctrl :spec="specAs('decayTime', 'Time')" :model-value="state.decayTime" @update:model-value="set('decayTime', $event)" />
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
          <vital-ctrl :spec="specAs(band + 'GainDb', 'Gain')" :model-value="state[band + 'GainDb']" :disabled="gainOff" @update:model-value="set(band + 'GainDb', $event)" />
          <vital-ctrl :spec="specAs(band + 'Midi', 'Cutoff')" :model-value="state[band + 'Midi']" @update:model-value="set(band + 'Midi', $event)" />
          <vital-ctrl :spec="specAs(band + 'Res', 'Resonance')" :model-value="state[band + 'Res']" @update:model-value="set(band + 'Res', $event)" />
        </view>
        <vital-graph class="plot-eq" plugin-id="equalizer-lite" :state="state" :band="band" @set="set" />
      </template>

      <template v-else-if="kind === 'filter'">
        <view class="filter-head">
          <text class="chev" @click="cycleSelect('model', -1)">‹</text>
          <text class="filter-name">{{ modelName }} : {{ state.style }}</text>
          <text class="chev" @click="cycleSelect('style', 1)">›</text>
        </view>
        <vital-ctrl class="res-fader" linear="y" :spec="spec('resonance')" :model-value="state.resonance" @update:model-value="set('resonance', $event)" />
        <vital-graph class="plot-filter" plugin-id="filter-lite" :state="state" @set="set" />
        <vital-ctrl class="cut-fader" linear="x" :spec="spec('cutoffMidi')" :model-value="state.cutoffMidi" @update:model-value="set('cutoffMidi', $event)" />
        <view class="knob-row filter-knobs">
          <vital-ctrl :spec="spec('drive')" :model-value="state.drive" @update:model-value="set('drive', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
          <vital-ctrl :spec="spec('blend')" :model-value="state.blend" @update:model-value="set('blend', $event)" />
        </view>
      </template>

      <template v-else-if="kind === 'delay'">
        <vital-ctrl class="style-box" :spec="specAs('style', 'Mode')" :model-value="state.style" @update:model-value="set('style', $event)" />
        <view class="freq-box">
          <vital-ctrl :spec="specAs('frequency', 'Tempo')" :model-value="state.frequency" @update:model-value="set('frequency', $event)" />
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
        <vital-ctrl class="type-box" :spec="specAs('type', 'Type')" :model-value="state.type" @update:model-value="set('type', $event)" />
        <vital-ctrl class="order-box" :spec="specAs('filterOrder', 'Filter')" :model-value="state.filterOrder" @update:model-value="set('filterOrder', $event)" />
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
        <view class="comp-left">
          <view class="comp-head">
            <vital-ctrl class="mode-box" :spec="specAs('bands', 'Mode')" :model-value="state.bands" @update:model-value="set('bands', $event)" />
            <vital-ctrl class="mix-box" :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
          </view>
          <view class="knob-row comp-gains">
            <vital-ctrl :spec="specAs('lowGainDb', 'Low')" :model-value="state.lowGainDb" :disabled="!bandOn('low')" @update:model-value="set('lowGainDb', $event)" />
            <vital-ctrl :spec="specAs('bandGainDb', 'Band')" :model-value="state.bandGainDb" :disabled="!bandOn('band')" @update:model-value="set('bandGainDb', $event)" />
            <vital-ctrl :spec="specAs('highGainDb', 'High')" :model-value="state.highGainDb" :disabled="!bandOn('high')" @update:model-value="set('highGainDb', $event)" />
          </view>
          <view class="knob-row comp-thresh">
            <vital-ctrl :spec="specAs('lowUpperDb', 'Low Thr')" :model-value="state.lowUpperDb" :disabled="!bandOn('low')" @update:model-value="set('lowUpperDb', $event)" />
            <vital-ctrl :spec="specAs('bandUpperDb', 'Band Thr')" :model-value="state.bandUpperDb" :disabled="!bandOn('band')" @update:model-value="set('bandUpperDb', $event)" />
            <vital-ctrl :spec="specAs('highUpperDb', 'High Thr')" :model-value="state.highUpperDb" :disabled="!bandOn('high')" @update:model-value="set('highUpperDb', $event)" />
          </view>
        </view>
        <vital-graph class="plot-comp" plugin-id="compressor-lite" :state="state" />
        <vital-ctrl class="atk-box" :spec="spec('attack')" :model-value="state.attack" @update:model-value="set('attack', $event)" />
        <vital-ctrl class="rel-box" :spec="spec('release')" :model-value="state.release" @update:model-value="set('release', $event)" />
      </template>

      <template v-else-if="kind === 'chorus'">
        <view class="chorus-head">
          <vital-ctrl class="voices-box" :spec="spec('voices')" :model-value="state.voices" @update:model-value="set('voices', $event)" />
          <vital-ctrl class="rate-box" :spec="specAs('frequency', 'Tempo')" :model-value="state.frequency" @update:model-value="set('frequency', $event)" />
        </view>
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

      <template v-else-if="kind === 'flanger' || kind === 'phaser'">
        <view class="mod-side">
          <vital-ctrl class="mod-rate" :spec="specAs('frequency', 'Tempo')" :model-value="state.frequency" @update:model-value="set('frequency', $event)" />
          <view class="mod-side-knobs">
            <vital-ctrl class="mod-offset" :spec="specAs('phaseOffset', 'Offset')" :model-value="state.phaseOffset" @update:model-value="set('phaseOffset', $event)" />
            <vital-ctrl v-if="kind === 'phaser'" :spec="spec('blend')" :model-value="state.blend" @update:model-value="set('blend', $event)" />
          </view>
        </view>
        <vital-graph class="plot-mod" :plugin-id="pluginId" :state="state" />
        <view class="knob-row mod-top">
          <vital-ctrl :spec="spec('feedback')" :model-value="state.feedback" @update:model-value="set('feedback', $event)" />
          <vital-ctrl :spec="spec('mix')" :model-value="state.mix" @update:model-value="set('mix', $event)" />
        </view>
        <view class="knob-row mod-bot">
          <vital-ctrl :spec="specAs('centerMidi', 'Center')" :model-value="state.centerMidi" @update:model-value="set('centerMidi', $event)" />
          <vital-ctrl :spec="specAs('modDepth', 'Depth')" :model-value="state.modDepth" @update:model-value="set('modDepth', $event)" />
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

const ACCENT = {
  chorus: '#6aa2ff',
  compressor: '#f0b429',
  delay: '#3ec6ff',
  distortion: '#ff6b8a',
  equalizer: '#b388ff',
  filter: '#3dff8a',
  flanger: '#d6ff4a',
  phaser: '#3dffe0',
  reverb: '#e070ff'
}
const kind = computed(() => (props.pluginId || '').replace(/-lite$/, ''))
const rail = computed(() => (VITAL_LITE_SUBTITLE[props.pluginId] || 'Lite').replace(/\s+Lite$/, '').toUpperCase())
const accentStyle = computed(() => ({ '--vital-accent': ACCENT[kind.value] || '#d5dee6' }))
const modelName = computed(() => {
  const raw = String(props.state.model || 'analog')
  return raw.charAt(0).toUpperCase() + raw.slice(1)
})
const lookup = computed(() => {
  const map = {}
  for (const knob of (props.panel && props.panel.knobs) || []) map[knob.key] = knob
  for (const sel of (props.panel && props.panel.selects) || []) map[sel.key] = sel
  return map
})
const filterOff = computed(() => props.state.filterOrder === 'off')
const gainOff = computed(() => {
  const mode = props.state[band.value + 'Mode']
  return mode === 'highpass' || mode === 'notch' || mode === 'lowpass'
})

function spec (key) {
  return lookup.value[key] || null
}
function specAs (key, label) {
  const base = spec(key)
  if (!base || !label) return base
  return { ...base, label }
}
function cycleSelect (key, dir) {
  const item = spec(key)
  if (!item || !item.options) return
  const options = item.options
  const i = options.indexOf(props.state[key])
  set(key, options[(i + dir + options.length) % options.length])
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
  min-height: 280px;
  display: flex;
  gap: 8px;
  color: #e7eaee;
  background: #1a2330;
  border-radius: 10px;
  padding: 8px 8px 8px 4px;
  --vital-accent: #6aa2ff;
}
.rail {
  width: 26px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--vital-accent);
  box-shadow: 0 0 8px var(--vital-accent);
  flex-shrink: 0;
}
.rail text {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
  letter-spacing: 0.32em;
  font-size: 11px;
  font-weight: 600;
  color: #d5dee6;
}
.board {
  flex: 1;
  min-width: 0;
  min-height: 260px;
  display: grid;
  gap: 8px;
  align-items: stretch;
}
.knob-row { display: flex; flex-wrap: wrap; justify-content: space-around; align-items: flex-end; gap: 4px; }
.tabs, .modes { display: flex; gap: 6px; }
.tabs text, .modes text {
  flex: 1;
  text-align: center;
  padding: 8px 4px 6px;
  border-radius: 6px;
  background: #243044;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8b939e;
  cursor: pointer;
}
.tabs text.on, .modes text.on {
  color: var(--vital-accent);
  border-bottom-color: var(--vital-accent);
  background: #2a384c;
}
.face :deep(.k.tone-vital) { width: 64px; }
.face :deep(.k.tone-vital .body) {
  fill: transparent;
  stroke: var(--vital-accent);
  stroke-width: 1.4;
}
.face :deep(.k.tone-vital .arc),
.face :deep(.k.tone-vital .needle) { stroke: var(--vital-accent); }
.face :deep(.k.tone-vital .track) { stroke: rgba(255, 255, 255, 0.1); }
.face :deep(.k.tone-vital .lab),
.face :deep(.k.tone-vital .val) { color: #c5ced6; }
.face :deep(.txt),
.face :deep(.lin) {
  background: #243044;
  border: none;
  border-radius: 8px;
  min-width: 72px;
}
.face :deep(.txt-val) { color: #f2f5f8; font-size: 16px; font-weight: 500; order: -1; }
.face :deep(.txt-lab) { color: #9aa6b4; }
.face :deep(.lin-fill) { background: var(--vital-accent); box-shadow: 0 0 8px var(--vital-accent); }
.face :deep(.well) {
  background: #141c28;
  border: none;
  border-radius: 8px;
  color: var(--vital-accent);
}

.board-reverb {
  grid-template-columns: 88px minmax(120px, 1fr) minmax(220px, 1.35fr);
  grid-template-rows: 1fr 1fr;
}
.c-pre-low { grid-column: 1; grid-row: 1; align-self: center; }
.c-pre-high { grid-column: 1; grid-row: 2; align-self: center; }
.plot-reverb { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-direction: column; min-height: 160px; }
.row-a { grid-column: 3; grid-row: 1; }
.row-b { grid-column: 3; grid-row: 2; }

.board-equalizer {
  grid-template-columns: minmax(200px, 0.85fr) minmax(180px, 1.15fr);
  grid-template-rows: auto auto 1fr;
}
.modes { grid-column: 1; grid-row: 1; }
.tabs-eq { grid-column: 1; grid-row: 2; }
.eq-knobs { grid-column: 1; grid-row: 3; align-self: end; }
.plot-eq { grid-column: 2; grid-row: 1 / span 3; min-height: 180px; }

.board-filter {
  grid-template-columns: minmax(180px, 0.7fr) minmax(160px, 1fr) 28px;
  grid-template-rows: auto minmax(120px, 1fr) auto;
}
.filter-head {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #243044;
  border-radius: 8px;
  padding: 8px 10px;
}
.filter-name {
  flex: 1;
  text-align: center;
  font-size: 13px;
  letter-spacing: 0.04em;
  color: #f2f5f8;
}
.chev { color: #9aa6b4; font-size: 18px; padding: 0 6px; cursor: pointer; }
.filter-knobs { grid-column: 1; grid-row: 2 / span 2; align-self: end; }
.plot-filter { grid-column: 2; grid-row: 1 / span 2; min-height: 120px; }
.res-fader { grid-column: 3; grid-row: 1 / span 2; }
.cut-fader { grid-column: 2 / span 2; grid-row: 3; }

.board-delay, .board-chorus, .board-flanger, .board-phaser {
  grid-template-columns: minmax(150px, 0.85fr) minmax(130px, 1fr) minmax(140px, 0.8fr);
  grid-template-rows: auto minmax(100px, 1fr);
}
.chorus-head, .freq-box, .mod-side { grid-column: 1; grid-row: 1; display: flex; gap: 6px; }
.chorus-head > * { flex: 1; }
.freq-box > * { flex: 1; }
.mod-side { flex-direction: column; }
.mod-side-knobs { display: flex; justify-content: space-around; }
.chorus-delays, .style-box { grid-column: 1; grid-row: 2; align-self: end; }
.plot-delay, .plot-chorus, .plot-mod { grid-column: 2; grid-row: 1; min-height: 72px; }
.plot-delay-filter, .plot-chorus-filter { grid-column: 2; grid-row: 2; min-height: 88px; }
.plot-mod { grid-row: 1 / span 2; min-height: 140px; }
.delay-top, .chorus-top, .mod-top { grid-column: 3; grid-row: 1; }
.delay-bot, .chorus-bot, .mod-bot { grid-column: 3; grid-row: 2; align-self: end; }

.board-distortion {
  grid-template-columns: minmax(110px, 0.5fr) minmax(140px, 1fr) minmax(180px, 0.95fr);
  grid-template-rows: minmax(96px, 1fr) minmax(96px, 1fr);
}
.type-box { grid-column: 1; grid-row: 1; }
.order-box { grid-column: 1; grid-row: 2; }
.plot-shape { grid-column: 2; grid-row: 1; }
.plot-dfilter { grid-column: 2; grid-row: 2; }
.dist-top { grid-column: 3; grid-row: 1; }
.dist-bot { grid-column: 3; grid-row: 2; align-self: end; }

.board-compressor {
  grid-template-columns: minmax(210px, 1.15fr) minmax(120px, 0.85fr) 84px;
  grid-template-rows: 1fr 1fr;
}
.comp-left {
  grid-column: 1;
  grid-row: 1 / span 2;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
}
.comp-head { display: flex; align-items: center; gap: 8px; }
.mode-box { flex: 1; }
.plot-comp { grid-column: 2; grid-row: 1 / span 2; min-height: 140px; }
.atk-box { grid-column: 3; grid-row: 1; align-self: start; }
.rel-box { grid-column: 3; grid-row: 2; align-self: end; }

@media (max-width: 860px) {
  .face { min-height: 0; padding: 6px; }
  .board-reverb,
  .board-equalizer,
  .board-filter,
  .board-delay,
  .board-chorus,
  .board-distortion,
  .board-compressor,
  .board-flanger,
  .board-phaser {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
  .board-reverb > *,
  .board-equalizer > *,
  .board-filter > *,
  .board-delay > *,
  .board-chorus > *,
  .board-distortion > *,
  .board-compressor > *,
  .board-flanger > *,
  .board-phaser > * {
    grid-column: 1;
    grid-row: auto;
  }
  .plot-mod { grid-row: auto; min-height: 120px; }
  .plot-reverb, .plot-eq, .plot-filter, .plot-delay, .plot-chorus, .plot-shape, .plot-comp, .plot-mod {
    min-height: 120px;
    order: -1;
  }
  .chorus-head, .freq-box { flex-wrap: wrap; }
  .filter-head { grid-column: 1; }
  .cut-fader, .res-fader, .filter-knobs { grid-column: 1; }
}
</style>
