<template>
  <view class="shell">
    <view class="bar">
      <view class="brand">
        <view class="heart" />
        <text class="name">{{ name }}</text>
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
      <view class="drop-item" @click="doReset">Reset</view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  modelValue: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  enabled: { type: Boolean, default: true }
})
const emit = defineEmits(['update:modelValue', 'update:enabled', 'reset'])
const open = ref(false)
const menu = ref(false)
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
  height: 52px;
  display: grid;
  grid-template-columns: minmax(140px, 1fr) auto minmax(140px, 1fr);
  align-items: center;
  gap: 12px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.heart {
  width: 11px;
  height: 11px;
  transform: rotate(-45deg);
  background: var(--dsp-accent);
  opacity: 0.7;
  box-shadow: 0 0 10px var(--dsp-glow);
  flex-shrink: 0;
}
.heart::before,
.heart::after {
  content: '';
  position: absolute;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: var(--dsp-accent);
}
.heart::before { left: 5px; top: 0; }
.heart::after { left: 0; top: -5px; }
.name {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--dsp-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preset-row {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-self: center;
}
.preset {
  min-width: 168px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--dsp-line);
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.28);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}
.preset:hover { border-color: rgba(255,255,255,0.16); }
.preset-label {
  font-size: 12px;
  color: var(--dsp-text);
}
.caret { color: var(--dsp-muted); font-size: 9px; }
.ico {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--dsp-muted);
  font-size: 18px;
  cursor: pointer;
  position: relative;
}
.ico:hover { color: var(--dsp-text); }
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
.power.on { color: var(--dsp-accent); }
.power.on .pwr-ring,
.power.on .pwr-stem {
  box-shadow: 0 0 10px var(--dsp-glow);
}
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
  top: 48px;
  min-width: 180px;
  background: #10131A;
  border: 1px solid var(--dsp-line);
  border-radius: 6px;
  z-index: 8;
  max-height: 240px;
  overflow: auto;
  box-shadow: 0 16px 40px rgba(0,0,0,0.5);
}
.preset-drop { left: 50%; transform: translateX(-50%); min-width: 200px; }
.menu-drop { right: 0; }
.drop-item {
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  color: var(--dsp-muted);
  cursor: pointer;
}
.drop-item:hover { background: rgba(255,255,255,0.04); color: var(--dsp-text); }
.drop-item.on { color: var(--dsp-text); }

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
  .preset { min-width: 0; flex: 1; height: 36px; }
  .ico { width: 36px; height: 36px; }
}
</style>
