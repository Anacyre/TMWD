<template>
  <view class="plug x-plug dsp-skin skin-lite" :class="{ 'is-off': insert.enabled === false }">
    <plugin-shell
      :name="title"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    />
    <text class="sub">{{ subtitle }}</text>
    <view v-if="selects.length" class="sels">
      <view v-for="sel in selects" :key="sel.key" class="sel">
        <text class="dsp-lab">{{ sel.label }}</text>
        <view class="x-seg">
          <view
            v-for="opt in sel.options"
            :key="opt"
            class="x-chip"
            :class="{ on: state[sel.key] === opt }"
            @click="set(sel.key, opt)"
          >{{ opt }}</view>
        </view>
      </view>
    </view>
    <view class="tray x-tray">
      <dsp-knob
        v-for="knob in knobs"
        :key="knob.key"
        :model-value="num(state[knob.key], knob.defaultValue)"
        :min="knob.min"
        :max="knob.max"
        :default-value="knob.defaultValue"
        :scale="knob.scale || 'lin'"
        :label="knob.label"
        :format="formatter(knob)"
        @update:model-value="set(knob.key, $event)"
      />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import { plugins, applyPreset, resetInsert } from '../../dsp/registry.js'
import { VITAL_LITE_PANELS, VITAL_LITE_SUBTITLE, VITAL_LITE_PLUGINS } from '../../dsp/vital-lite/index.js'
import { midiToHz } from '../../dsp/vital-lite/params.js'
import './dsp-theme.css'

const props = defineProps({
  insert: { type: Object, required: true }
})
const emit = defineEmits(['change'])
const state = computed(() => props.insert.state || {})
const pluginId = computed(() => props.insert.pluginId)
const title = computed(() => (VITAL_LITE_PLUGINS[pluginId.value] && VITAL_LITE_PLUGINS[pluginId.value].name) || 'VitalLite')
const subtitle = computed(() => VITAL_LITE_SUBTITLE[pluginId.value] || 'Lite')
const panel = computed(() => VITAL_LITE_PANELS[pluginId.value] || { knobs: [] })
const knobs = computed(() => panel.value.knobs || [])
const selects = computed(() => panel.value.selects || [])
const presets = computed(() => (plugins[pluginId.value] && plugins[pluginId.value].presets) || [])

function num (value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
function commit () { emit('change', props.insert) }
function onPreset (id) { applyPreset(props.insert, id); commit() }
function onEnabled (v) { props.insert.enabled = v; commit() }
function onReset () { resetInsert(props.insert); commit() }
function set (key, value) { props.insert.state[key] = value; commit() }

function formatter (knob) {
  const kind = knob.format
  return (v) => {
    const n = num(v, knob.defaultValue)
    if (kind === 'pct') return Math.round(n * 100) + '%'
    if (kind === 'db') return (n >= 0 ? '+' : '') + n.toFixed(1) + ' dB'
    if (kind === 'sec') return n < 1 ? Math.round(n * 1000) + ' ms' : n.toFixed(2) + ' s'
    if (kind === 'ms') return (n * 1000).toFixed(1) + ' ms'
    if (kind === 'hz') return n < 10 ? n.toFixed(2) + ' Hz' : Math.round(n) + ' Hz'
    if (kind === 'midi') return Math.round(midiToHz(n)) + ' Hz'
    if (kind === 'int') return String(Math.round(n))
    if (kind === 'st') return n.toFixed(1) + ' st'
    return n.toFixed(2)
  }
}
</script>

<style scoped>
.plug { display: flex; flex-direction: column; min-height: 280px; padding: 8px 14px 16px; }
.sub {
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--x-ink-3);
  margin: 2px 0 10px;
}
.sels { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
.sel { display: flex; align-items: center; gap: 10px; }
.sel .dsp-lab { width: 64px; flex-shrink: 0; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--x-ink-3); }
.x-seg { display: flex; flex-wrap: wrap; gap: 4px; }
.x-chip {
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--x-line);
  font-size: 10px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--x-ink-2);
  background: var(--x-panel);
  cursor: pointer;
}
.x-chip.on { border-color: var(--x-cool); color: var(--x-cool); background: rgba(78, 127, 168, 0.12); }
.tray { display: flex; flex-wrap: wrap; gap: 10px 14px; }
</style>
