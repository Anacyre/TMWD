<template>
  <view class="icon" :class="{ on: active }" :style="{ color: color }">
    <view v-if="name === 'play'" class="play" />
    <view v-else-if="name === 'pause'" class="pause">
      <view /><view />
    </view>
    <view v-else-if="name === 'stop'" class="stop" />
    <view v-else-if="name === 'record'" class="record" />
    <view v-else-if="name === 'to-start'" class="to-start">
      <view class="bar" /><view class="tri" />
    </view>
    <view v-else-if="name === 'loop'" class="loop" />
    <view v-else-if="name === 'metronome'" class="metronome" />
    <view v-else-if="name === 'speaker'" class="speaker">
      <view class="box" /><view class="horn" />
    </view>
    <view v-else-if="name === 'magnet'" class="magnet" />
    <view v-else-if="name === 'plus'" class="plus" />
    <view v-else-if="name === 'wave'" class="wave" />
    <view v-else-if="name === 'bell'" class="bell" />
    <view v-else-if="name === 'save'" class="save" />
    <view v-else-if="name === 'grid'" class="grid" />
    <view v-else-if="name === 'piano'" class="piano" />
    <view v-else-if="name === 'menu'" class="hamburger">
      <view /><view /><view />
    </view>
    <view v-else-if="name === 'min'" class="win min" />
    <view v-else-if="name === 'max'" class="win max" />
    <view v-else-if="name === 'close'" class="win close" />
  </view>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
  active: { type: Boolean, default: false },
  color: { type: String, default: 'currentColor' }
})
</script>

<style scoped>
.icon {
  width: 100%;
  height: 100%;
  position: relative;
  color: #8d8d8d;
}
.play {
  position: absolute;
  left: 28%;
  top: 24%;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 13px solid currentColor;
}
.pause view {
  position: absolute;
  top: 24%;
  width: 4px;
  height: 52%;
  border-radius: 1px;
  background: currentColor;
}
.pause view:first-child { left: 30%; }
.pause view:last-child { right: 30%; }
.stop {
  position: absolute;
  left: 28%;
  top: 28%;
  width: 44%;
  height: 44%;
  border-radius: 2px;
  background: currentColor;
}
.record {
  position: absolute;
  left: 24%;
  top: 24%;
  width: 52%;
  height: 52%;
  border-radius: 50%;
  background: currentColor;
}
.to-start .bar {
  position: absolute;
  left: 24%;
  top: 24%;
  width: 2px;
  height: 52%;
  background: currentColor;
}
.to-start .tri {
  position: absolute;
  left: 30%;
  top: 24%;
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-right: 12px solid currentColor;
}
.loop {
  position: absolute;
  left: 22%;
  top: 22%;
  width: 56%;
  height: 56%;
  border: 2px solid currentColor;
  border-radius: 4px;
}
.metronome {
  position: absolute;
  left: 50%;
  top: 18%;
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 18px solid currentColor;
  transform: translateX(-50%);
  opacity: 0.9;
}
.speaker .box {
  position: absolute;
  left: 22%;
  top: 36%;
  width: 22%;
  height: 28%;
  border-radius: 1px;
  background: currentColor;
}
.speaker .horn {
  position: absolute;
  left: 42%;
  top: 24%;
  width: 0;
  height: 0;
  border-top: 10px solid transparent;
  border-bottom: 10px solid transparent;
  border-left: 10px solid currentColor;
}
.magnet {
  position: absolute;
  left: 28%;
  top: 28%;
  width: 44%;
  height: 40%;
  border: 2px solid currentColor;
  border-top: none;
  border-radius: 0 0 10px 10px;
}
.plus::before,
.plus::after {
  content: '';
  position: absolute;
  background: currentColor;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
}
.plus::before { width: 12px; height: 2px; }
.plus::after { width: 2px; height: 12px; }
.wave {
  position: absolute;
  left: 18%;
  right: 18%;
  top: 48%;
  height: 2px;
  background: currentColor;
  box-shadow: 4px -6px 0 currentColor, 8px 5px 0 currentColor, 12px -4px 0 currentColor;
}
.bell {
  position: absolute;
  left: 30%;
  top: 22%;
  width: 40%;
  height: 42%;
  border: 2px solid currentColor;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
}
.bell::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -6px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  transform: translateX(-50%);
}
.save::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 22%;
  width: 2px;
  height: 10px;
  background: currentColor;
  transform: translateX(-50%);
}
.save::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 28%;
  width: 0;
  height: 0;
  border-left: 5px solid transparent;
  border-right: 5px solid transparent;
  border-top: 6px solid currentColor;
  transform: translateX(-50%);
}
.grid {
  position: absolute;
  left: 24%;
  top: 24%;
  width: 52%;
  height: 52%;
  border: 1px solid currentColor;
  background:
    linear-gradient(currentColor, currentColor) center / 1px 100% no-repeat,
    linear-gradient(currentColor, currentColor) center / 100% 1px no-repeat;
}
.piano {
  position: absolute;
  left: 20%;
  top: 26%;
  width: 60%;
  height: 48%;
  border: 1px solid currentColor;
  background:
    linear-gradient(currentColor, currentColor) 25% / 1px 100% no-repeat,
    linear-gradient(currentColor, currentColor) 50% / 1px 100% no-repeat,
    linear-gradient(currentColor, currentColor) 75% / 1px 100% no-repeat;
}
.hamburger view {
  position: absolute;
  left: 26%;
  right: 26%;
  height: 2px;
  background: currentColor;
}
.hamburger view:nth-child(1) { top: 30%; }
.hamburger view:nth-child(2) { top: 48%; }
.hamburger view:nth-child(3) { top: 66%; }
.win {
  position: absolute;
  left: 28%;
  top: 42%;
  width: 44%;
  height: 2px;
  background: currentColor;
}
.max {
  top: 30%;
  height: 40%;
  background: transparent;
  border: 1.5px solid currentColor;
}
.close {
  top: 48%;
  transform: rotate(45deg);
}
.close::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 2px;
  background: currentColor;
  transform: rotate(90deg);
}
</style>
