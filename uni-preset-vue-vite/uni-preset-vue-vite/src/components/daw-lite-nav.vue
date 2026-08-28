<template>
  <view class="nav">
    <view class="item" :class="{ on: session.workspaceView === 'arrangement' }" @click.stop="go('arrangement')">
      <daw-icon name="arrange" :color="session.workspaceView === 'arrangement' ? '#e6e6e6' : ''" />
      <text>Arrange</text>
    </view>
    <view class="item" :class="{ on: session.workspaceView === 'piano' }" @click.stop="go('piano')">
      <daw-icon name="piano" :color="session.workspaceView === 'piano' ? '#e6e6e6' : ''" />
      <text>Piano</text>
    </view>
    <view class="item" :class="{ on: session.workspaceView === 'mixer' }" @click.stop="go('mixer')">
      <daw-icon name="mixer" :color="session.workspaceView === 'mixer' ? '#e6e6e6' : ''" />
      <text>Mixer</text>
    </view>
  </view>
</template>

<script setup>
import DawIcon from './daw-icon.vue'
import { session, setWorkspaceView } from '../store/session.js'

function go (view) {
  setWorkspaceView(view)
}
</script>

<style scoped>
.nav {
  display: flex;
  height: calc(56px + env(safe-area-inset-bottom, 0));
  padding-bottom: env(safe-area-inset-bottom, 0);
  background: #161616;
  border-top: 1px solid #2a2a2a;
  flex-shrink: 0;
  box-sizing: border-box;
}
.item {
  flex: 1;
  min-height: 48px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  color: #8d8d8d;
  font-size: 10px;
  letter-spacing: 0.04em;
  padding: 4px 0;
  box-sizing: border-box;
}
.item.on { color: #e6e6e6; }
.item :deep(.icon) { width: 22px; height: 22px; flex-shrink: 0; }
.item text { line-height: 1; }
</style>
