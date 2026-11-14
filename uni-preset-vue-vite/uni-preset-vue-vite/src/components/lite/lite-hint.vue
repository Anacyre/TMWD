<template>
  <view v-if="!session.liteHintDismissed" class="hint">
    <view class="lines">
      <text class="main">{{ touch ? 'One finger scrolls · Pinch to zoom' : 'Drag to select · Scroll wheel moves, Ctrl zooms' }}</text>
      <text class="sub">{{ touch ? 'Drag a clip to move it. Double-tap a clip to open it.' : 'Double-click an empty lane to add a clip, or a clip to open it. Right-click a clip for more.' }}</text>
    </view>
    <view class="ok" @click.stop="dismissLiteHint">Got it</view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, dismissLiteHint, isTouchInput } from '../../store/session.js'

const touch = computed(() => isTouchInput())
</script>

<style scoped>
.hint {
  position: absolute;
  left: 50%;
  bottom: calc(20px + env(safe-area-inset-bottom, 0px));
  transform: translateX(-50%);
  width: min(560px, calc(100% - 32px));
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 14px 14px 18px;
  border-radius: var(--lt-radius-lg);
  background: var(--lt-s2);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45), 0 0 0 1px var(--lt-line);
  z-index: 40;
  box-sizing: border-box;
}
.lines { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.main { font-size: var(--lt-fs-m); font-weight: 600; }
.sub { font-size: var(--lt-fs-s); color: var(--lt-ink-2); }
.ok {
  height: 40px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  border-radius: var(--lt-radius);
  background: var(--lt-ink);
  color: var(--lt-bg);
  font-size: var(--lt-fs-s);
  font-weight: 600;
  flex-shrink: 0;
  cursor: pointer;
}
</style>
