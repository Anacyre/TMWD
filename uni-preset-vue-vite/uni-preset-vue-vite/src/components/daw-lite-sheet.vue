<template>
  <view v-if="open" class="mask" @click="onMask">
    <view
      class="sheet"
      :class="{ tall }"
      @click.stop
    >
      <view class="handle" @pointerdown.stop="onDown" />
      <text v-if="title" class="title">{{ title }}</text>
      <slot />
    </view>
  </view>
</template>

<script setup>
import { onUnmounted } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  tall: { type: Boolean, default: false }
})
const emit = defineEmits(['close'])

let startY = 0
let dragging = false

function onMask () {
  emit('close')
}

function onDown (e) {
  if (e.target && e.target.closest && e.target.closest('.noscroll')) return
  startY = e.clientY
  dragging = true
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onMove (e) {
  if (!dragging) return
  if (e.clientY - startY > 72) {
    dragging = false
    emit('close')
  }
}

function onUp () {
  dragging = false
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 60;
  display: flex;
  align-items: flex-end;
  padding-bottom: env(safe-area-inset-bottom, 0);
}
.sheet {
  width: 100%;
  max-height: 78vh;
  background: #161616;
  border-top: 1px solid #2a2a2a;
  border-radius: 12px 12px 0 0;
  padding: 8px 16px 20px;
  overflow: auto;
  animation: up 180ms ease-out;
}
.sheet.tall { max-height: 88vh; }
.handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #3a3a3a;
  margin: 4px auto 12px;
}
.title {
  display: block;
  color: #e6e6e6;
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}
@keyframes up {
  from { transform: translateY(18px); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
}
</style>
