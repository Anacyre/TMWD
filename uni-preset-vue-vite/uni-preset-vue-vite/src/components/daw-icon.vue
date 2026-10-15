<template>
  <view class="icon" :class="{ on: active }" :style="boxStyle" :aria-hidden="true">
    <svg
      class="glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path
        v-for="(part, i) in parts"
        :key="i"
        :d="part.d"
        :fill="part.fill ? 'currentColor' : 'none'"
        :stroke="part.fill && !part.stroke ? 'none' : 'currentColor'"
      />
    </svg>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { iconParts } from './icon-paths.js'

const props = defineProps({
  name: { type: String, required: true },
  active: { type: Boolean, default: false },
  color: { type: String, default: 'currentColor' },
  /* Pixels of ink, normally 16 / 20 / 24. The parent owns the hit target (32 or
     44 px); the glyph never inherits it. */
  size: { type: [Number, String], default: 20 },
  stroke: { type: Number, default: 1.75 }
})

const px = computed(() => {
  const n = Number(props.size)
  return Number.isFinite(n) && n > 0 ? n : 20
})
const parts = computed(() => iconParts(props.name))
/* Keep the rendered line close to 1.5px at every size instead of scaling with it. */
const strokeWidth = computed(() => Math.max(1.25, Math.min(2.2, props.stroke * 20 / px.value)))
const boxStyle = computed(() => ({
  color: props.color,
  fontSize: px.value + 'px'
}))
</script>

<style scoped>
.icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8d8d8d;
  pointer-events: none;
}
.glyph {
  width: 1em;
  height: 1em;
  flex: none;
  display: block;
  overflow: visible;
}
</style>
