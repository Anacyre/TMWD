<template>
  <view class="plug x-plug dsp-skin skin-lite" :class="{ 'is-off': insert.enabled === false, 'vital-on': showUi }">
    <plugin-shell
      :name="title"
      :model-value="insert.presetId"
      :items="presets"
      :enabled="insert.enabled"
      @update:model-value="onPreset"
      @update:enabled="onEnabled"
      @reset="onReset"
    >
      <template #actions>
        <view
          class="ui-sw"
          :class="{ on: showUi }"
          title="Graphical layout"
          aria-label="Graphical layout"
          @click.stop="toggleUi"
        >UI</view>
      </template>
    </plugin-shell>
    <text v-if="!showUi" class="sub">{{ subtitle }}</text>
    <plugin-vital-face
      v-if="showUi"
      :plugin-id="pluginId"
      :state="state"
      :panel="panel"
      @set="set"
    />
    <view v-if="!showUi && selects.length" class="sels">
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
    <view v-if="!showUi" class="tray x-tray">
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
import { computed, ref } from 'vue'
import PluginShell from './plugin-shell.vue'
import DspKnob from './dsp-knob.vue'
import PluginVitalFace from './plugin-vital-face.vue'
import { plugins, applyPreset, resetInsert } from '../../dsp/registry.js'
import { VITAL_LITE_PANELS, VITAL_LITE_SUBTITLE, VITAL_LITE_PLUGINS } from '../../dsp/vital-lite/index.js'
import { formatVitalValue } from '../../dsp/vital-lite/face-draw.js'
import './dsp-theme.css'

const UI_KEY = 'daw.vitalLite.graphicalUi'
function readUi () {
  try {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(UI_KEY) !== '0'
  } catch (e) {
    return true
  }
}

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
const showUi = ref(readUi())

function toggleUi () {
  showUi.value = !showUi.value
  try { localStorage.setItem(UI_KEY, showUi.value ? '1' : '0') } catch (e) {}
}

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
  return (v) => formatVitalValue(knob.format, v, knob.defaultValue)
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
.ui-sw {
  height: 24px;
  padding: 0 8px;
  border-radius: 4px;
  border: 1px solid var(--x-line);
  background: var(--x-panel);
  color: var(--x-ink-3);
  font-size: 10px;
  letter-spacing: 0.12em;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.ui-sw.on {
  color: #121418;
  background: #d5dee6;
  border-color: #d5dee6;
}
.plug.dsp-skin.vital-on {
  --x-chassis: #1b1e22;
  --x-chassis-2: #14171a;
  --x-panel: #101214;
  --x-panel-2: #1e2226;
  --x-ink: #e7eaee;
  --x-ink-2: #c5ced6;
  --x-ink-3: #8b939e;
  --x-line: rgba(255, 255, 255, 0.1);
  --x-line-2: rgba(255, 255, 255, 0.05);
  --x-accent: #d5dee6;
  --x-accent-hi: #ffffff;
  --x-accent-lo: rgba(213, 222, 230, 0.16);
  --x-cool: #7fd0c4;
  background: #1b1e22;
  min-height: 0;
}
</style>
