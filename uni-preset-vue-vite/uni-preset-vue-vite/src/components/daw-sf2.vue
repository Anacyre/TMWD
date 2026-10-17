<template>
  <view class="sf2">
    <view class="row">
      <view class="lt-btn" @click="pickFile">Load SoundFont</view>
      <view class="lt-btn ghost" @click="pickWav">Load WAV</view>
    </view>
    <text v-if="track.sf2Name" class="name">{{ track.sf2Name }}</text>
    <text v-else class="hint">Drop an SF2 or WAV, or pick a cloud SoundFont below.</text>
    <view v-if="cloudFonts.length" class="group">
      <view v-for="item in cloudFonts" :key="item.name" class="lt-row" @click="loadCloud(item)">
        <text class="grow">{{ item.name }}</text>
      </view>
    </view>
    <view class="knobs">
      <view class="k" @pointerdown="drag($event, 'attack')"><text class="kv">{{ n(patch.attack) }}</text><text class="kl">Attack</text></view>
      <view class="k" @pointerdown="drag($event, 'decay')"><text class="kv">{{ n(patch.decay) }}</text><text class="kl">Decay</text></view>
      <view class="k" @pointerdown="drag($event, 'sustain')"><text class="kv">{{ n(patch.sustain) }}</text><text class="kl">Sustain</text></view>
      <view class="k" @pointerdown="drag($event, 'release')"><text class="kv">{{ n(patch.release) }}</text><text class="kl">Release</text></view>
    </view>
    <view class="keys">
      <view
        v-for="key in keys"
        :key="key"
        class="key"
        :class="{ black: isBlack(key) }"
        @pointerdown.prevent="play(key)"
      />
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { loadSf2File, loadSf2Wav, previewNoteOn, previewNoteOff } from '../store/session.js'
import { listPublicSoundfonts } from '../audio/sf2/index.js'

const props = defineProps({ track: { type: Object, required: true } })
const cloudFonts = ref([])
const patch = computed(() => props.track.sf2Patch || { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.25 })
onMounted(() => {
  listPublicSoundfonts().then((rows) => { cloudFonts.value = rows }).catch(() => {})
})
async function loadCloud (item) {
  const res = await fetch(item.url)
  const blob = await res.blob()
  const file = new File([blob], item.name, { type: 'application/octet-stream' })
  await loadSf2File(props.track, file)
}
const keys = computed(() => {
  const out = []
  for (let p = 48; p <= 72; p++) out.push(p)
  return out
})
function isBlack (p) {
  const n = p % 12
  return n === 1 || n === 3 || n === 6 || n === 8 || n === 10
}
function n (v) { return (Number(v) || 0).toFixed(2) }

function pickFile () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.sf2,audio/x-soundfont'
  input.onchange = () => { if (input.files && input.files[0]) loadSf2File(props.track, input.files[0]) }
  input.click()
}
function pickWav () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'audio/wav,audio/x-wav,.wav,.mp3,.ogg'
  input.onchange = () => { if (input.files && input.files[0]) loadSf2Wav(props.track, input.files[0]) }
  input.click()
}
function drag (e, field) {
  const startY = e.clientY
  const start = Number(patch.value[field]) || 0
  const max = field === 'sustain' ? 1 : 2
  const move = (ev) => {
    const next = Math.min(max, Math.max(0.001, start - (ev.clientY - startY) * max / 140))
    props.track.sf2Patch = { ...patch.value, [field]: next }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function play (pitch) {
  previewNoteOn(props.track, pitch, 0.85)
  const up = () => {
    previewNoteOff(props.track, pitch)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointerup', up)
}
</script>

<style scoped>
.sf2 { display: flex; flex-direction: column; gap: 12px; padding: 10px; }
.row { display: flex; gap: 8px; }
.lt-btn {
  min-height: 44px;
  padding: 0 14px;
  border-radius: 10px;
  background: #2b2b2b;
  display: flex;
  align-items: center;
  cursor: pointer;
}
.lt-btn.ghost { background: #161616; }
.name { font-weight: 600; }
.hint { color: #8b939e; font-size: 13px; }
.group { display: flex; flex-direction: column; gap: 4px; }
.lt-row { min-height: 44px; display: flex; align-items: center; padding: 0 10px; background: #161616; border-radius: 8px; cursor: pointer; }
.grow { flex: 1; }
.knobs { display: grid; grid-template-columns: repeat(4, minmax(72px, 1fr)); gap: 8px; }
.k { min-height: 56px; background: #243044; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; touch-action: none; }
.kv { color: #f2f5f8; }
.kl { font-size: 10px; color: #9aa6b4; }
.keys { display: flex; height: 72px; gap: 2px; }
.key { flex: 1; background: #e8edf3; border-radius: 0 0 6px 6px; }
.key.black { background: #1b1b1b; flex: 0.6; }
</style>
