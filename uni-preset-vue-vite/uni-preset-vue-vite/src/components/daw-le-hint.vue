<template>
  <view v-if="!session.liteHintDismissed && isLite()" class="hint" @click="dismissLiteHint">
    <text>Double tap empty space to create a pattern</text>
    <text>Long press and drag to select</text>
    <text>Drag to move · pinch to zoom</text>
    <text class="ok">Got it</text>
  </view>
</template>

<script setup>
import { session, isLite, dismissLiteHint } from '../store/session.js'
</script>

<style scoped>
.hint {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(56px + env(safe-area-inset-bottom, 0) + 8px);
  background: #1c1c1c;
  border: 1px solid #2a2a2a;
  border-radius: 10px;
  padding: 14px 16px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #c8c8c8;
  font-size: 13px;
  line-height: 1.35;
}
.ok {
  margin-top: 6px;
  color: #e6e6e6;
  font-size: 13px;
  font-weight: 600;
}
</style>
