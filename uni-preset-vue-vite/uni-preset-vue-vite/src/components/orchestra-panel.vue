<template>
  <view ref="root" class="orch" :class="{ stacked }">
    <view class="head">
      <view class="title-block">
        <text class="title">{{ title }}</text>
        <text class="status" :class="statusTone">{{ status }}</text>
      </view>
      <view v-if="libraries.length > 1" class="seg libs">
        <view
          v-for="lib in libraries"
          :key="lib.id"
          class="seg-item"
          :class="{ on: lib.id === libraryId }"
          @click="$emit('library', lib.id)"
        >{{ lib.label }}</view>
      </view>
      <view v-if="showChange" class="change" title="Change instrument" @click="$emit('change')">
        <daw-icon name="swap" :size="18" color="currentColor" />
      </view>
    </view>

    <view class="body">
      <view class="browse">
        <view class="families">
          <view
            v-for="family in families"
            :key="family.id"
            class="family"
            :class="{ on: family.id === familyId, empty: !hasFamily(family.id) }"
            @click="$emit('family', family.id)"
          >
            <daw-icon :name="family.icon" :size="18" color="currentColor" />
            <text>{{ family.label }}</text>
          </view>
        </view>
        <view class="list">
          <view
            v-for="item in familyInstruments"
            :key="item.id"
            class="inst"
            :class="{ on: item.id === selectedId, off: !item.available }"
            @click="item.available && $emit('select', item.id)"
          >
            <text class="inst-name">{{ item.name }}</text>
            <daw-icon v-if="item.id === selectedId" name="check" :size="16" color="currentColor" />
            <text v-else-if="!item.available" class="inst-miss">No samples</text>
          </view>
          <text v-if="!familyInstruments.length" class="none">Nothing in this family yet.</text>
        </view>
      </view>

      <view class="play">
        <text class="cap">Technique</text>
        <view class="techs">
          <view
            v-for="tech in techniques"
            :key="tech.id"
            class="tech"
            :class="{ on: tech.id === techniqueId, off: tech.available === false }"
            @click="tech.available !== false && $emit('technique', tech.id)"
          >{{ tech.displayName }}</view>
          <text v-if="!techniques.length" class="none">Pick an instrument first.</text>
        </view>

        <view v-for="ctrl in sliders" :key="ctrl.id" class="slider-block">
          <view class="slider-head">
            <text class="cap">{{ ctrl.label }}</text>
            <text class="value">{{ Math.round(ctrl.value * 100) }}</text>
          </view>
          <view
            class="slider"
            :data-slider="ctrl.id"
            @pointerdown.stop.prevent="onSlider(ctrl.id, $event)"
          >
            <view class="slider-fill" :style="{ width: (ctrl.value * 100) + '%' }" />
            <view class="slider-thumb" :style="{ left: 'calc(' + (ctrl.value * 100) + '% - 3px)' }" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import DawIcon from './daw-icon.vue'
import { beginPointerDrag, trackRatio } from '../lib/pointer-drag.js'

const props = defineProps({
  title: { type: String, default: '' },
  status: { type: String, default: '' },
  statusTone: { type: String, default: '' },
  families: { type: Array, default: () => [] },
  familyId: { type: String, default: '' },
  instruments: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  libraries: { type: Array, default: () => [] },
  libraryId: { type: String, default: '' },
  techniques: { type: Array, default: () => [] },
  techniqueId: { type: String, default: '' },
  dynamics: { type: Number, default: 0.8 },
  expression: { type: Number, default: 0.8 },
  showChange: { type: Boolean, default: true },
  stacked: { type: Boolean, default: false }
})
const emit = defineEmits(['family', 'library', 'select', 'technique', 'controller', 'change'])

const root = ref(null)
const familyInstruments = computed(() => props.instruments.filter((item) => item.family === props.familyId))
const sliders = computed(() => [
  { id: 'dynamics', label: 'Dynamics', value: clamp01(props.dynamics) },
  { id: 'expression', label: 'Expression', value: clamp01(props.expression) }
])

function clamp01 (v) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0
}

function hasFamily (id) {
  return props.instruments.some((item) => item.family === id)
}

function sliderEl (id) {
  const r = root.value
  const el = r && (r.nodeType === 1 ? r : r.$el)
  return el && el.querySelector ? el.querySelector('[data-slider="' + id + '"]') : null
}

function onSlider (id, event) {
  const el = sliderEl(id)
  const apply = (ev) => {
    const ratio = trackRatio(ev, el, 'horizontal')
    if (ratio != null) emit('controller', id, Math.round(ratio * 100) / 100)
  }
  apply(event)
  beginPointerDrag(event, { onMove: apply, onEnd: apply })
}
</script>

<style scoped>
.orch {
  --o-bg: var(--lt-bg, #0b0c0e);
  --o-s1: var(--lt-s1, #131418);
  --o-s2: var(--lt-s2, #1a1c21);
  --o-s3: var(--lt-s3, #23262c);
  --o-line: var(--lt-line, rgba(255, 255, 255, 0.06));
  --o-ink: var(--lt-ink, #ececee);
  --o-ink-2: var(--lt-ink-2, #8b8e96);
  --o-accent: var(--lt-accent, #6aa8ff);
  --o-accent-soft: var(--lt-accent-soft, rgba(106, 168, 255, 0.16));
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--o-bg);
  color: var(--o-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  overflow: hidden;
}
.head {
  min-height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  box-shadow: inset 0 -1px 0 var(--o-line);
}
.title-block {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.title {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status { font-size: 12px; color: var(--o-ink-2); }
.status.ok { color: #4cc38a; }
.status.err { color: #ff6b5e; }
.seg {
  display: flex;
  padding: 3px;
  gap: 2px;
  border-radius: 10px;
  background: var(--o-s2);
  flex-shrink: 0;
}
.seg-item {
  height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  border-radius: 8px;
  font-size: 13px;
  color: var(--o-ink-2);
  cursor: pointer;
  white-space: nowrap;
}
.seg-item.on { background: var(--o-s3); color: var(--o-ink); }
.change {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--o-ink-2);
  cursor: pointer;
  flex-shrink: 0;
}
.change:active { background: var(--o-s2); }
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.browse {
  flex: 1 1 56%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-shadow: inset -1px 0 0 var(--o-line);
}
.families {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 12px 16px;
}
.family {
  height: 40px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 20px;
  background: var(--o-s2);
  color: var(--o-ink-2);
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
}
.family .icon { width: auto; height: auto; }
.family.on { background: var(--o-accent-soft); color: var(--o-accent); }
.family.empty { opacity: 0.35; }
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 16px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  align-content: start;
  gap: 6px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.inst {
  height: 52px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  background: var(--o-s2);
  cursor: pointer;
}
.inst:active { background: var(--o-s3); }
.inst.on { background: var(--o-accent-soft); color: var(--o-accent); }
.inst.off { opacity: 0.4; cursor: default; }
.inst .icon { width: auto; height: auto; }
.inst-name {
  flex: 1;
  min-width: 0;
  font-size: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inst-miss { font-size: 11px; color: var(--o-ink-2); }
.none { font-size: 13px; color: var(--o-ink-2); padding: 8px 0; }
.play {
  flex: 1 1 44%;
  min-width: 280px;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 18px 18px;
  overflow-y: auto;
}
.cap {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--o-ink-2);
}
.techs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.tech {
  min-width: 72px;
  height: 44px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--o-s2);
  font-size: 15px;
  cursor: pointer;
}
.tech.on { background: var(--o-accent); color: #0b0c0e; font-weight: 600; }
.tech.off { opacity: 0.3; cursor: default; }
.slider-block { display: flex; flex-direction: column; gap: 10px; margin-bottom: 10px; }
.slider-head { display: flex; justify-content: space-between; align-items: baseline; }
.value {
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  color: var(--o-ink);
}
.slider {
  height: 48px;
  border-radius: 12px;
  background: var(--o-s2);
  position: relative;
  overflow: hidden;
  touch-action: none;
  cursor: ew-resize;
}
.slider-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--o-accent-soft);
}
.slider-thumb {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 6px;
  border-radius: 3px;
  background: var(--o-accent);
}
.orch.stacked .head { flex-wrap: wrap; }
.orch.stacked .libs { order: 3; flex-basis: 100%; }
.orch.stacked .libs .seg-item { flex: 1; justify-content: center; }
.orch.stacked .body { flex-direction: column; overflow-y: auto; }
.orch.stacked .browse { box-shadow: inset 0 -1px 0 var(--o-line); flex: 0 0 auto; }
.orch.stacked .list { max-height: 260px; }
.orch.stacked .play { max-width: none; min-width: 0; }
@media (max-width: 760px) {
  .head { flex-wrap: wrap; }
  .libs { order: 3; flex-basis: 100%; }
  .libs .seg-item { flex: 1; justify-content: center; }
  .body { flex-direction: column; overflow-y: auto; }
  .browse { flex: 0 0 auto; box-shadow: inset 0 -1px 0 var(--o-line); }
  .list { max-height: 280px; }
  .play { max-width: none; min-width: 0; }
}
</style>
