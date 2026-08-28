<template>
  <view class="meter">
    <view class="fill" :style="{ height: percent + '%' }" />
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  level: { type: Number, default: 0 }
})

const percent = computed(() => Math.min(100, Math.max(0, Math.pow(Math.max(0, props.level), 0.55) * 100)))
</script>

<style scoped>
.meter {
  width: 5px;
  height: 100%;
  background: #1a1a1a;
  border-radius: 1px;
  overflow: hidden;
  position: relative;
  flex-shrink: 0;
}
.fill {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(#e74c3c, #2ea44f);
  transition: height 90ms linear;
}
</style>
