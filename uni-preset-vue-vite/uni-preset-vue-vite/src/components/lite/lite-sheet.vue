<template>
  <view v-if="open" class="lt lt-mask" @click="emit('close')">
    <view class="lt-sheet" :class="{ wide, full }" @click.stop>
      <view class="lt-sheet-head">
        <view v-if="back" class="lt-hit" aria-label="Back" @click.stop="emit('back')">
          <daw-icon name="back" :size="20" color="currentColor" />
        </view>
        <text class="lt-sheet-title">{{ title }}</text>
        <slot name="actions" />
        <view class="lt-hit" aria-label="Close" @click.stop="emit('close')">
          <daw-icon name="close" :size="18" color="currentColor" />
        </view>
      </view>
      <view class="lt-sheet-body" :class="{ flush }">
        <slot />
      </view>
    </view>
  </view>
</template>

<script setup>
import DawIcon from '../daw-icon.vue'
import './lite-tokens.css'

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  back: { type: Boolean, default: false },
  wide: { type: Boolean, default: false },
  full: { type: Boolean, default: false },
  flush: { type: Boolean, default: false }
})
const emit = defineEmits(['close', 'back'])
</script>

<style scoped>
.lt-mask {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(16px, env(safe-area-inset-top, 0px)) 16px max(16px, env(safe-area-inset-bottom, 0px));
  box-sizing: border-box;
}
.lt-sheet {
  width: min(460px, 100%);
  max-height: min(86vh, 100%);
  display: flex;
  flex-direction: column;
  background: var(--lt-s1);
  border-radius: var(--lt-radius-lg);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--lt-line);
  overflow: hidden;
  animation: lt-rise 160ms ease-out;
  box-sizing: border-box;
}
.lt-sheet.wide { width: min(760px, 100%); }
.lt-sheet.full {
  width: 100%;
  height: 100%;
  max-height: none;
}
.lt-sheet-head {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px 0 16px;
  flex-shrink: 0;
}
.lt-sheet-head .lt-hit:first-child { margin-left: -10px; }
.lt-sheet-title {
  flex: 1;
  min-width: 0;
  font-size: var(--lt-fs-m);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lt-sheet-body {
  flex: 1 1 auto;
  min-height: 0;
  max-height: calc(min(86dvh, 100dvh - 32px) - 56px);
  display: block;
  overflow-x: hidden;
  overflow-y: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0 16px 18px;
  box-sizing: border-box;
}
.lt-sheet-body.flush { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
@keyframes lt-rise {
  from { transform: translateY(12px); opacity: 0; }
  to { transform: none; opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .lt-sheet { animation: none; }
}
</style>
<style>
/* uni-app forces overflow:hidden and flex on every view, which stops a finger
   from scrolling a menu. This rule is stronger than that framework style. */
uni-view.lt-sheet-body:not(.flush) {
  display: block !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
  overscroll-behavior: contain;
}
</style>
