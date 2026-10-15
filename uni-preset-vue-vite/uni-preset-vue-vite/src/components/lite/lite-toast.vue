<template>
  <view v-if="session.undoToast" :key="session.undoToast.id" class="toast">
    <text class="text">{{ session.undoToast.text }}</text>
    <view class="undo" @click.stop="runUndoToast">Undo</view>
  </view>
  <view v-else-if="session.toast" class="toast plain">
    <text class="text">{{ session.toast }}</text>
  </view>
</template>

<script setup>
import { session, runUndoToast } from '../../store/session.js'
</script>

<style scoped>
.toast {
  position: absolute;
  left: 50%;
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  max-width: min(560px, calc(100% - 32px));
  min-height: 48px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 18px;
  border-radius: 24px;
  background: var(--lt-ink);
  color: var(--lt-bg);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  z-index: 90;
  box-sizing: border-box;
  animation: lt-toast 160ms ease-out;
}
.toast.plain { padding-right: 18px; }
.text {
  font-size: var(--lt-fs-s);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.undo {
  height: 36px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  border-radius: 18px;
  color: #1d5fd1;
  font-size: var(--lt-fs-s);
  font-weight: 700;
  cursor: pointer;
  flex-shrink: 0;
}
.undo:active { background: rgba(0, 0, 0, 0.08); }
@keyframes lt-toast {
  from { transform: translate(-50%, 8px); opacity: 0; }
  to { transform: translate(-50%, 0); opacity: 1; }
}
</style>
