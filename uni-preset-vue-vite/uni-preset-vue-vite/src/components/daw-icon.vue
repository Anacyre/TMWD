<template>
  <view class="icon" :class="{ on: active }" :style="boxStyle" :aria-hidden="true">
    <view class="glyph">
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
      <view v-else-if="name === 'wave'" class="wave">
        <view /><view /><view /><view />
      </view>
      <view v-else-if="name === 'bell'" class="bell" />
      <view v-else-if="name === 'save'" class="save" />
      <view v-else-if="name === 'folder'" class="folder" />
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
      <view v-else-if="name === 'trash'" class="trash" />
      <view v-else-if="name === 'copy'" class="copy">
        <view class="back" /><view class="front" />
      </view>
      <view v-else-if="name === 'swap'" class="swap">
        <view class="up" /><view class="down" />
      </view>
      <view v-else-if="name === 'download'" class="download" />
      <view v-else-if="name === 'upload'" class="download up" />
      <view v-else-if="name === 'power'" class="power" />
      <view v-else-if="name === 'dot'" class="status-dot" />
      <view v-else-if="name === 'scale'" class="scale-icon">
        <view /><view /><view /><view /><view />
      </view>
      <view v-else-if="name === 'cloud'" class="cloud">
        <view class="puff" /><view class="base" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  active: { type: Boolean, default: false },
  color: { type: String, default: 'currentColor' },
  /* Pixels of ink, normally 16 / 20 / 24. The parent owns the hit target (32 or
     44 px); the glyph never inherits it, which is what made icons look
     mismatched between a 22 px row button and a 44 px transport button. */
  size: { type: [Number, String], default: 20 }
})

const boxStyle = computed(() => {
  const px = Number(props.size)
  return {
    color: props.color,
    fontSize: (Number.isFinite(px) && px > 0 ? px : 20) + 'px'
  }
})
</script>

<style scoped>
.icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #8d8d8d;
  pointer-events: none;
}
/* Every glyph is drawn inside this 1em square, so all metrics below are a
   fraction of the requested icon size rather than of the button. */
.glyph {
  position: relative;
  width: 1em;
  height: 1em;
  flex: none;
}
.glyph > view { position: absolute; }

.play {
  left: 56%;
  top: 50%;
  width: 0;
  height: 0;
  border-top: 0.3em solid transparent;
  border-bottom: 0.3em solid transparent;
  border-left: 0.52em solid currentColor;
  transform: translate(-50%, -50%);
}
.pause {
  left: 50%;
  top: 50%;
  width: 0.6em;
  height: 0.72em;
  transform: translate(-50%, -50%);
}
.pause view {
  position: absolute;
  top: 0;
  width: 0.2em;
  height: 100%;
  border-radius: 0.05em;
  background: currentColor;
}
.pause view:first-child { left: 0; }
.pause view:last-child { right: 0; }
.stop {
  left: 50%;
  top: 50%;
  width: 0.58em;
  height: 0.58em;
  border-radius: 0.08em;
  background: currentColor;
  transform: translate(-50%, -50%);
}
.record {
  left: 50%;
  top: 50%;
  width: 0.6em;
  height: 0.6em;
  border-radius: 50%;
  background: currentColor;
  transform: translate(-50%, -50%);
}
.to-start { left: 50%; top: 50%; width: 0.7em; height: 0.6em; transform: translate(-50%, -50%); }
.to-start .bar {
  position: absolute;
  left: 0;
  top: 0;
  width: 0.11em;
  height: 100%;
  border-radius: 0.05em;
  background: currentColor;
}
.to-start .tri {
  position: absolute;
  right: 0;
  top: 50%;
  width: 0;
  height: 0;
  border-top: 0.3em solid transparent;
  border-bottom: 0.3em solid transparent;
  border-right: 0.5em solid currentColor;
  transform: translateY(-50%);
}
.loop {
  left: 50%;
  top: 50%;
  width: 0.62em;
  height: 0.62em;
  border: 0.1em solid currentColor;
  border-radius: 0.18em;
  transform: translate(-50%, -50%);
}
.metronome {
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  border-left: 0.36em solid transparent;
  border-right: 0.36em solid transparent;
  border-bottom: 0.72em solid currentColor;
  transform: translate(-50%, -50%);
}
.speaker { left: 50%; top: 50%; width: 0.72em; height: 0.6em; transform: translate(-50%, -50%); }
.speaker .box {
  position: absolute;
  left: 0;
  top: 30%;
  width: 0.24em;
  height: 40%;
  border-radius: 0.04em;
  background: currentColor;
}
.speaker .horn {
  position: absolute;
  left: 0.2em;
  top: 50%;
  width: 0;
  height: 0;
  border-top: 0.3em solid transparent;
  border-bottom: 0.3em solid transparent;
  border-left: 0.34em solid currentColor;
  transform: translateY(-50%);
}
.magnet {
  left: 50%;
  top: 50%;
  width: 0.56em;
  height: 0.5em;
  border: 0.1em solid currentColor;
  border-top: none;
  border-radius: 0 0 0.28em 0.28em;
  transform: translate(-50%, -50%);
}
.plus { left: 50%; top: 50%; width: 0.64em; height: 0.64em; transform: translate(-50%, -50%); }
.plus::before,
.plus::after {
  content: '';
  position: absolute;
  background: currentColor;
  left: 50%;
  top: 50%;
  border-radius: 0.05em;
  transform: translate(-50%, -50%);
}
.plus::before { width: 100%; height: 0.11em; }
.plus::after { width: 0.11em; height: 100%; }
.wave { left: 50%; top: 50%; width: 0.76em; height: 0.62em; transform: translate(-50%, -50%); }
.wave view {
  position: absolute;
  bottom: 0;
  width: 0.11em;
  border-radius: 0.05em;
  background: currentColor;
}
.wave view:nth-child(1) { left: 0; height: 45%; }
.wave view:nth-child(2) { left: 0.22em; height: 100%; }
.wave view:nth-child(3) { left: 0.44em; height: 62%; }
.wave view:nth-child(4) { left: 0.66em; height: 30%; }
.bell {
  left: 50%;
  top: 42%;
  width: 0.5em;
  height: 0.46em;
  border: 0.1em solid currentColor;
  border-bottom: none;
  border-radius: 0.26em 0.26em 0 0;
  transform: translate(-50%, -50%);
}
.bell::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: -0.24em;
  width: 0.16em;
  height: 0.16em;
  border-radius: 50%;
  background: currentColor;
  transform: translateX(-50%);
}
.save {
  left: 50%;
  top: 50%;
  width: 0.6em;
  height: 0.6em;
  transform: translate(-50%, -50%);
}
.save::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  width: 0.11em;
  height: 0.4em;
  background: currentColor;
  transform: translateX(-50%);
}
.save::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 0;
  height: 0;
  border-left: 0.22em solid transparent;
  border-right: 0.22em solid transparent;
  border-top: 0.26em solid currentColor;
  transform: translateX(-50%);
}
.folder {
  left: 50%;
  top: 52%;
  width: 0.68em;
  height: 0.5em;
  border: 0.1em solid currentColor;
  border-radius: 0.06em;
  transform: translate(-50%, -50%);
}
.folder::before {
  content: '';
  position: absolute;
  left: -0.02em;
  top: -0.2em;
  width: 0.3em;
  height: 0.12em;
  border: 0.1em solid currentColor;
  border-bottom: none;
  border-radius: 0.06em 0.06em 0 0;
}
.grid {
  left: 50%;
  top: 50%;
  width: 0.6em;
  height: 0.6em;
  border: 0.07em solid currentColor;
  transform: translate(-50%, -50%);
  background:
    linear-gradient(currentColor, currentColor) center / 0.07em 100% no-repeat,
    linear-gradient(currentColor, currentColor) center / 100% 0.07em no-repeat;
}
.piano {
  left: 50%;
  top: 50%;
  width: 0.68em;
  height: 0.54em;
  border: 0.07em solid currentColor;
  transform: translate(-50%, -50%);
  background:
    linear-gradient(currentColor, currentColor) 25% / 0.07em 100% no-repeat,
    linear-gradient(currentColor, currentColor) 50% / 0.07em 100% no-repeat,
    linear-gradient(currentColor, currentColor) 75% / 0.07em 100% no-repeat;
}
.hamburger { left: 50%; top: 50%; width: 0.66em; height: 0.5em; transform: translate(-50%, -50%); }
.hamburger view {
  position: absolute;
  left: 0;
  width: 100%;
  height: 0.1em;
  border-radius: 0.05em;
  background: currentColor;
}
.hamburger view:nth-child(1) { top: 0; }
.hamburger view:nth-child(2) { top: 50%; transform: translateY(-50%); }
.hamburger view:nth-child(3) { bottom: 0; }
.win {
  left: 50%;
  top: 50%;
  width: 0.56em;
  height: 0.1em;
  background: currentColor;
  transform: translate(-50%, -50%);
}
.max {
  height: 0.5em;
  background: transparent;
  border: 0.08em solid currentColor;
  border-radius: 0.04em;
}
.close { transform: translate(-50%, -50%) rotate(45deg); }
.close::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  background: currentColor;
  transform: rotate(90deg);
}
.undo, .redo {
  left: 50%;
  top: 50%;
  width: 0.56em;
  height: 0.5em;
  border: 0.09em solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
}
.undo { transform: translate(-50%, -50%) rotate(-28deg); border-right-color: transparent; }
.redo { transform: translate(-50%, -50%) rotate(28deg); border-left-color: transparent; }
.undo::after, .redo::after {
  content: '';
  position: absolute;
  width: 0;
  height: 0;
  border-top: 0.16em solid transparent;
  border-bottom: 0.16em solid transparent;
}
.undo::after {
  left: -0.04em;
  bottom: -0.04em;
  border-right: 0.28em solid currentColor;
}
.redo::after {
  right: -0.04em;
  bottom: -0.04em;
  border-left: 0.28em solid currentColor;
}
.settings {
  left: 50%;
  top: 50%;
  width: 0.48em;
  height: 0.48em;
  border: 0.09em solid currentColor;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.settings::before {
  content: '';
  position: absolute;
  left: -20%;
  top: 34%;
  width: 140%;
  height: 32%;
  background: currentColor;
  clip-path: polygon(18% 0, 82% 0, 100% 50%, 82% 100%, 18% 100%, 0 50%);
}
.chevron {
  left: 50%;
  top: 46%;
  width: 0.36em;
  height: 0.36em;
  border-right: 0.1em solid currentColor;
  border-bottom: 0.1em solid currentColor;
  transform: translate(-50%, -50%) rotate(45deg);
}
.chevron.right {
  top: 50%;
  transform: translate(-50%, -50%) rotate(-45deg);
}
.more { left: 50%; top: 50%; width: 0.16em; height: 0.62em; transform: translate(-50%, -50%); }
.more view {
  position: absolute;
  left: 0;
  width: 0.16em;
  height: 0.16em;
  border-radius: 50%;
  background: currentColor;
}
.more view:nth-child(1) { top: 0; }
.more view:nth-child(2) { top: 50%; transform: translateY(-50%); }
.more view:nth-child(3) { bottom: 0; }
.arrange { left: 50%; top: 50%; width: 0.66em; height: 0.5em; transform: translate(-50%, -50%); }
.arrange view {
  position: absolute;
  height: 0.1em;
  border-radius: 0.05em;
  background: currentColor;
}
.arrange view:nth-child(1) { top: 0; left: 0; width: 100%; }
.arrange view:nth-child(2) { top: 50%; left: 18%; width: 64%; transform: translateY(-50%); }
.arrange view:nth-child(3) { bottom: 0; left: 0; width: 82%; }
.note {
  left: 50%;
  top: 50%;
  width: 0.52em;
  height: 0.62em;
  transform: translate(-50%, -50%);
}
.note .head {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0.28em;
  height: 0.22em;
  border-radius: 50%;
  background: currentColor;
  transform: rotate(-18deg);
}
.note .stem {
  position: absolute;
  right: 0.08em;
  top: 0;
  width: 0.08em;
  height: 0.5em;
  background: currentColor;
}
.note .flag {
  position: absolute;
  right: 0;
  top: 0;
  width: 0.2em;
  height: 0.18em;
  border-right: 0.08em solid currentColor;
  border-bottom: 0.08em solid currentColor;
  border-radius: 0 0 0.08em 0;
}
.mixer {
  left: 50%;
  top: 50%;
  width: 0.66em;
  height: 0.56em;
  transform: translate(-50%, -50%);
}
.mixer view {
  position: absolute;
  top: 0;
  width: 0.12em;
  height: 100%;
  background: currentColor;
  border-radius: 0.06em;
}
.mixer view:nth-child(1) { left: 0; height: 58%; top: 22%; }
.mixer view:nth-child(2) { left: 50%; height: 100%; transform: translateX(-50%); }
.mixer view:nth-child(3) { right: 0; height: 70%; top: 8%; }
.inspector {
  left: 50%;
  top: 50%;
  width: 0.62em;
  height: 0.5em;
  transform: translate(-50%, -50%);
}
.inspector .pane {
  position: absolute;
  top: 0;
  bottom: 0;
  border: 0.08em solid currentColor;
  border-radius: 0.05em;
  box-sizing: border-box;
}
.inspector .pane.left { left: 0; width: 36%; }
.inspector .pane.right { right: 0; width: 52%; }
.trash {
  left: 50%;
  top: 54%;
  width: 0.46em;
  height: 0.5em;
  border: 0.09em solid currentColor;
  border-top: none;
  border-radius: 0 0 0.08em 0.08em;
  transform: translate(-50%, -50%);
}
.trash::before {
  content: '';
  position: absolute;
  left: -0.12em;
  top: -0.16em;
  width: 0.7em;
  height: 0.09em;
  background: currentColor;
  border-radius: 0.05em;
}
.copy { left: 50%; top: 50%; width: 0.62em; height: 0.62em; transform: translate(-50%, -50%); }
.copy .back, .copy .front {
  position: absolute;
  width: 0.42em;
  height: 0.42em;
  border: 0.09em solid currentColor;
  border-radius: 0.06em;
}
.copy .back { left: 0; top: 0; }
.copy .front { right: 0; bottom: 0; background: currentColor; opacity: 0.28; }
.swap {
  left: 50%;
  top: 50%;
  width: 0.62em;
  height: 0.56em;
  transform: translate(-50%, -50%);
}
.swap .up, .swap .down {
  position: absolute;
  width: 0.22em;
  height: 0.22em;
  border-top: 0.09em solid currentColor;
  border-right: 0.09em solid currentColor;
}
.swap .up { left: 0.04em; top: 0.06em; transform: rotate(-45deg); }
.swap .down { right: 0.04em; bottom: 0.06em; transform: rotate(135deg); }
.download { left: 50%; top: 50%; width: 0.56em; height: 0.62em; transform: translate(-50%, -50%); }
.download::before {
  content: '';
  position: absolute;
  left: 50%;
  top: 0;
  width: 0.1em;
  height: 0.36em;
  background: currentColor;
  transform: translateX(-50%);
}
.download::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0.06em;
  width: 0;
  height: 0;
  border-left: 0.2em solid transparent;
  border-right: 0.2em solid transparent;
  border-top: 0.24em solid currentColor;
  transform: translateX(-50%);
}
.download.up { transform: translate(-50%, -50%) rotate(180deg); }
.power {
  left: 50%;
  top: 52%;
  width: 0.5em;
  height: 0.5em;
  border: 0.09em solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  transform: translate(-50%, -50%);
}
.power::after {
  content: '';
  position: absolute;
  left: 50%;
  top: -0.22em;
  width: 0.09em;
  height: 0.3em;
  background: currentColor;
  transform: translateX(-50%);
}
.scale-icon {
  left: 50%;
  top: 50%;
  width: 0.7em;
  height: 0.58em;
  transform: translate(-50%, -50%);
}
.scale-icon view {
  position: absolute;
  left: 0;
  right: 0;
  height: 0.045em;
  background: currentColor;
  opacity: 0.85;
}
.scale-icon view:nth-child(1) { top: 0; }
.scale-icon view:nth-child(2) { top: 0.12em; }
.scale-icon view:nth-child(3) { top: 0.24em; }
.scale-icon view:nth-child(4) { top: 0.36em; }
.scale-icon view:nth-child(5) { top: 0.48em; }
.scale-icon::after {
  content: '';
  position: absolute;
  left: 0.28em;
  bottom: 0.04em;
  width: 0.16em;
  height: 0.16em;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0.12em -0.22em 0 -0.04em currentColor;
}
.cloud {
  left: 50%;
  top: 50%;
  width: 0.86em;
  height: 0.56em;
  transform: translate(-50%, -50%);
}
.cloud .puff {
  left: 0.16em;
  top: 0;
  width: 0.44em;
  height: 0.44em;
  border-radius: 50%;
  background: currentColor;
}
.cloud .base {
  left: 0;
  bottom: 0.02em;
  width: 0.86em;
  height: 0.28em;
  border-radius: 0.14em;
  background: currentColor;
}
.status-dot {
  left: 50%;
  top: 50%;
  width: 0.4em;
  height: 0.4em;
  border-radius: 50%;
  background: currentColor;
  transform: translate(-50%, -50%);
}
</style>
