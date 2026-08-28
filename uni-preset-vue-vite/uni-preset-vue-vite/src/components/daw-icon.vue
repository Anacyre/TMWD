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
    <view v-else-if="name === 'undo'" class="undo" />
    <view v-else-if="name === 'redo'" class="redo" />
    <view v-else-if="name === 'settings'" class="settings" />
    <view v-else-if="name === 'note'" class="note">
      <view class="head" /><view class="stem" /><view class="flag" />
    </view>
    <view v-else-if="name === 'mixer'" class="mixer">
      <view /><view /><view />
    </view>
    <view v-else-if="name === 'inspector'" class="inspector">
      <view class="pane left" /><view class="pane right" />
    </view>
    <view v-else-if="name === 'chevron'" class="chevron" />
    <view v-else-if="name === 'chevron-right'" class="chevron right" />
    <view v-else-if="name === 'more'" class="more">
      <view /><view /><view />
    </view>
    <view v-else-if="name === 'arrange'" class="arrange">
      <view /><view /><view />
    </view>
    <view v-else-if="name === 'dot'" class="status-dot" />
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
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 12px solid currentColor;
  transform: translate(-30%, -50%);
}
.pause {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 14px;
  height: 16px;
  transform: translate(-50%, -50%);
}
.pause view {
  position: absolute;
  top: 0;
  width: 4px;
  height: 16px;
  border-radius: 1px;
  background: currentColor;
}
.pause view:first-child { left: 0; }
.pause view:last-child { left: auto; right: 0; }
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
.undo, .redo {
  position: absolute;
  left: 22%;
  top: 28%;
  width: 52%;
  height: 44%;
  border: 1.6px solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
}
.undo { transform: rotate(-28deg); border-right-color: transparent; }
.redo { transform: rotate(28deg); border-left-color: transparent; }
.undo::after, .redo::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border-top: 3.5px solid transparent;
  border-bottom: 3.5px solid transparent;
}
.undo::after {
  left: -1px;
  bottom: -1px;
  border-right: 6px solid currentColor;
}
.redo::after {
  right: -1px;
  bottom: -1px;
  border-left: 6px solid currentColor;
}
.settings {
  position: absolute;
  left: 28%;
  top: 28%;
  width: 44%;
  height: 44%;
  border: 1.6px solid currentColor;
  border-radius: 50%;
}
.settings::before {
  content: '';
  position: absolute;
  left: -18%;
  top: 38%;
  width: 136%;
  height: 24%;
  background: currentColor;
  clip-path: polygon(18% 0, 82% 0, 100% 50%, 82% 100%, 18% 100%, 0 50%);
}
.chevron {
  position: absolute;
  left: 32%;
  top: 38%;
  width: 36%;
  height: 36%;
  border-right: 1.8px solid currentColor;
  border-bottom: 1.8px solid currentColor;
  transform: rotate(45deg);
}
.chevron.right {
  left: 28%;
  top: 30%;
  transform: rotate(-45deg);
}
.more view {
  position: absolute;
  left: 50%;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  transform: translateX(-50%);
}
.more view:nth-child(1) { top: 26%; }
.more view:nth-child(2) { top: 48%; }
.more view:nth-child(3) { top: 70%; }
.arrange view {
  position: absolute;
  left: 22%;
  right: 22%;
  height: 2px;
  background: currentColor;
}
.arrange view:nth-child(1) { top: 30%; width: 56%; }
.arrange view:nth-child(2) { top: 48%; width: 40%; left: 30%; }
.arrange view:nth-child(3) { top: 66%; width: 50%; }
.status-dot {
  position: absolute;
  left: 34%;
  top: 34%;
  width: 32%;
  height: 32%;
  border-radius: 50%;
  background: currentColor;
}
.note .head {
  position: absolute;
  left: 24%;
  bottom: 22%;
  width: 42%;
  height: 34%;
  border-radius: 50%;
  background: currentColor;
}
.note .stem {
  position: absolute;
  left: 58%;
  top: 18%;
  width: 2px;
  height: 62%;
  background: currentColor;
}
.note .flag {
  position: absolute;
  left: 60%;
  top: 18%;
  width: 28%;
  height: 2px;
  background: currentColor;
}
.mixer view {
  position: absolute;
  top: 18%;
  bottom: 18%;
  width: 1.5px;
  background: currentColor;
}
.mixer view:nth-child(1) { left: 28%; }
.mixer view:nth-child(2) { left: 50%; }
.mixer view:nth-child(3) { left: 72%; }
.mixer view::after {
  content: '';
  position: absolute;
  left: -2.5px;
  top: 38%;
  width: 6px;
  height: 3px;
  border-radius: 1px;
  background: currentColor;
}
.inspector .pane {
  position: absolute;
  top: 22%;
  bottom: 22%;
  border: 1.5px solid currentColor;
}
.inspector .left {
  left: 22%;
  width: 34%;
  border-right: none;
  border-radius: 1px 0 0 1px;
}
.inspector .right {
  right: 22%;
  width: 34%;
  border-left: none;
  border-radius: 0 1px 1px 0;
}
</style>
