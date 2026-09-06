<template>
  <view v-if="visible" class="band" :class="{ compact, connecting: engineLink.connecting }">
    <view class="badge">
      <daw-icon name="cloud" :size="16" />
      <text v-if="!compact">Cloud</text>
    </view>
    <view class="copy">
      <text class="title">{{ headline }}</text>
      <text class="sub">{{ detail }}</text>
    </view>
    <view class="act" @click.stop="onConnect">{{ engineLink.connecting ? 'Retry' : 'Connect PC' }}</view>
    <view class="close" aria-label="Hide cloud notice" @click.stop="dismissCloudBanner">
      <daw-icon name="close" :size="14" />
    </view>
  </view>
</template>

<script setup>
import { computed, watch } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  engineLink,
  cloudBannerVisible,
  dismissCloudBanner,
  openSettings,
  session
} from '../store/session.js'

defineProps({
  compact: { type: Boolean, default: false }
})

const visible = computed(() => cloudBannerVisible())

const headline = computed(() => (
  engineLink.connecting ? 'Looking for the PC engine…' : 'Cloud mode — playing in your browser'
))

const detail = computed(() => (
  'M Orchestra, mixing and effects work here. BBCSO / Synchron need NewProject.exe running on your PC.'
))

// Show the notice again if the engine drops after a successful connection.
watch(() => engineLink.connected, (connected) => {
  if (connected) session.cloudBannerDismissed = false
})

function onConnect () {
  openSettings()
}
</script>

<style scoped>
.band {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  flex-shrink: 0;
  background: linear-gradient(90deg, #16303c 0%, #17252f 60%, #161c22 100%);
  border-bottom: 1px solid #21414f;
  color: #cfe8f2;
  box-sizing: border-box;
}
.badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(77, 199, 255, 0.14);
  border: 1px solid rgba(77, 199, 255, 0.35);
  color: #6fd0f5;
  font-size: 11px;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}
.copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.title { font-size: 12px; color: #e6f4fa; }
.sub {
  font-size: 11px;
  color: #8fb4c4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.act {
  flex-shrink: 0;
  min-height: 30px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border-radius: 8px;
  background: rgba(77, 199, 255, 0.16);
  border: 1px solid rgba(77, 199, 255, 0.4);
  color: #9fe0fb;
  font-size: 12px;
}
.close {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6f95a5;
}
.band.connecting .badge { border-color: rgba(196, 160, 38, 0.5); color: #d9bd58; }
.band.compact { padding: 6px 8px; gap: 8px; }
.band.compact .sub { font-size: 10px; }
.band.compact .act { padding: 0 10px; min-height: 32px; }
</style>
