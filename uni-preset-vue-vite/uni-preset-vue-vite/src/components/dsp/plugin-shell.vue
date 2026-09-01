<template>
  <view class="shell">
    <view class="bar">
      <view class="brand">
        <text class="mark">X</text>
        <text class="name">{{ shortName }}</text>
      </view>

      <view class="preset-row">
        <view class="ico" title="Previous preset" @click.stop="step(-1)">‹</view>
        <view class="preset" @click.stop="open = !open">
          <text class="preset-label">{{ currentLabel }}</text>
          <text class="caret">▾</text>
        </view>
        <view class="ico" title="Next preset" @click.stop="step(1)">›</view>
      </view>

      <view class="tools">
        <slot name="actions" />
        <view
          class="ico power"
          :class="{ on: enabled }"
          :title="enabled ? 'Bypass' : 'Enable'"
          @click.stop="$emit('update:enabled', !enabled)"
        >
          <view class="pwr-ring" />
          <view class="pwr-stem" />
        </view>
        <view class="ico menu" title="Menu" @click.stop="menu = !menu">
          <view /><view /><view />
        </view>
      </view>
    </view>

    <view v-if="open" class="drop preset-drop" @click.stop>
      <view
        v-for="item in items"
        :key="item.id"
        class="drop-item"
        :class="{ on: item.id === modelValue }"
        @click="choose(item.id)"
      >{{ item.name }}</view>
    </view>

    <view v-if="menu" class="drop menu-drop" @click.stop>
      <view class="drop-item" title="Reset" aria-label="Reset" @click="doReset">
        <daw-icon name="undo" :size="16" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from '../daw-icon.vue'

const props = defineProps({
  name: { type: String, required: true },
  modelValue: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  enabled: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'update:enabled', 'reset', 'change-plugin'])
const open = ref(false)
const menu = ref(false)
// The script "X" mark carries the series name, so the wordmark drops it: "Reverb X" → "REVERB".
const shortName = computed(() => props.name.replace(/\s*X$/i, ''))
const currentLabel = computed(() => {
  const found = props.items.find((item) => item.id === props.modelValue)
  return found ? found.name : 'Preset'
})
function choose (id) {
  emit('update:modelValue', id)
  open.value = false
  menu.value = false
}
function step (dir) {
  const list = props.items || []
  if (!list.length) return
  const i = list.findIndex((item) => item.id === props.modelValue)
  const next = list[(i + dir + list.length) % list.length]
  if (next) emit('update:modelValue', next.id)
}
function doReset () {
  menu.value = false
  emit('reset')
}
</script>

<style scoped>
.shell { position: relative; flex-shrink: 0; }
.bar {
  height: 46px;
  display: grid;
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr) minmax(110px, auto);
  align-items: center;
  gap: 12px;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 0;
}
.mark {
  font-family: Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 22px;
  line-height: 1;
  color: var(--x-ink-2);
  flex-shrink: 0;
}
.name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--x-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-self: end;
  min-width: 0;
}
.preset {
  min-width: 150px;
  max-width: 220px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--x-line);
  border-radius: 4px;
  background: var(--x-panel);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  box-sizing: border-box;
}
.preset:hover { border-color: rgba(38, 40, 44, 0.24); }
.preset-label {
  font-size: 11px;
  color: var(--x-ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.caret { color: var(--x-ink-3); font-size: 8px; }
.ico {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--x-ink-3);
  font-size: 16px;
  cursor: pointer;
  position: relative;
}
.ico:hover { color: var(--x-ink); }
.tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.power .pwr-ring {
  width: 12px;
  height: 12px;
  border: 1.5px solid currentColor;
  border-radius: 50%;
}
.power .pwr-stem {
  position: absolute;
  top: 6px;
  width: 1.5px;
  height: 7px;
  background: currentColor;
  border-radius: 1px;
}
.power.on { color: var(--x-accent); }
.menu view {
  width: 12px;
  height: 1.4px;
  background: currentColor;
  margin: 1.6px 0;
  border-radius: 1px;
}
.menu { flex-direction: column; }
.drop {
  position: absolute;
  top: 42px;
  min-width: 180px;
  background: var(--x-panel);
  border: 1px solid var(--x-line);
  border-radius: 6px;
  z-index: 8;
  max-height: 260px;
  overflow: auto;
  box-shadow: 0 10px 28px rgba(38, 40, 44, 0.18);
}
.preset-drop { right: 34px; min-width: 190px; }
.menu-drop { right: 0; }
.drop-item {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  font-size: 12px;
  color: var(--x-ink-2);
  cursor: pointer;
  min-width: 44px;
}
.drop-item:hover { background: var(--x-panel-2); color: var(--x-ink); }
.drop-item.on { color: var(--x-accent); }

@media (max-width: 720px) {
  .bar {
    height: auto;
    grid-template-columns: 1fr auto;
    row-gap: 8px;
    padding: 4px 0 8px;
  }
  .preset-row {
    grid-column: 1 / -1;
    justify-self: stretch;
  }
  .preset { min-width: 0; max-width: none; flex: 1; height: 34px; }
  .ico { width: 34px; height: 34px; }
  .preset-drop { right: 0; left: 0; min-width: 0; }
}

@media (max-width: 430px) {
  .name { letter-spacing: 0.1em; font-size: 12px; }
  .ico { width: 40px; height: 40px; }
}

@media (max-width: 390px) {
  .mark { font-size: 20px; }
  .preset { height: 36px; }
}

@media (max-width: 360px) {
  .bar { gap: 8px; }
  .ico { width: 44px; height: 44px; }
}
</style>
