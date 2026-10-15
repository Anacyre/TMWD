<template>
  <view v-if="open" class="mask" @click="onMask">
    <view
      class="sheet lite-plugin-surface"
      :class="{ tall, centered }"
      @click.stop
    >
      <view class="head">
        <view class="head-row">
          <text v-if="title" class="title">{{ title }}</text>
          <view class="close-x" aria-label="Dismiss" @click.stop="emit('close')">×</view>
        </view>
      </view>
      <slot />
    </view>
  </view>
</template>

<script setup>
import { onUnmounted } from 'vue'
import './dsp/lite-plugin-surface.css'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  tall: { type: Boolean, default: false },
  centered: { type: Boolean, default: true }
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
  align-items: center;
  justify-content: center;
  padding:
    max(16px, env(safe-area-inset-top, 0px))
    16px
    max(16px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.sheet {
  width: min(400px, 100%);
  max-height: calc(100vh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 12px;
  padding: 8px 16px 20px;
  overflow: auto;
  animation: up 180ms ease-out;
  box-sizing: border-box;
}
.sheet.tall { max-height: min(78vh, calc(100vh - 32px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))); }
.sheet.centered { margin: 0 auto; }
.head {
  margin-bottom: 8px;
}
.handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: #3a3a3a;
  margin: 4px auto 10px;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.title {
  color: #e6e6e6;
  font-size: 15px;
  font-weight: 600;
  min-width: 0;
  flex: 1;
}
@keyframes up {
  from { transform: translateY(18px); opacity: 0.6; }
  to { transform: translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet { animation: none; }
}
</style>
