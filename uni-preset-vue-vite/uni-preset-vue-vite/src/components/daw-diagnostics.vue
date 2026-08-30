<template>
  <view v-if="session.diagnosticsVisible" class="diag" @click.self="close">
    <view class="sheet">
      <view class="head">
        <text class="title">Diagnostics</text>
        <text class="done" @click="close">Close</text>
      </view>
      <text class="note">Not real-time until measured. Same UI on localhost and LAN.</text>

      <view class="grid">
        <view class="cell"><text class="k">Control RTT</text><text class="v">{{ fmt(metrics.controlRttMs) }}</text></view>
        <view class="cell"><text class="k">PC render</text><text class="v">{{ fmt(metrics.renderLatencyMs) }}</text></view>
        <view class="cell"><text class="k">Audio path</text><text class="v">{{ fmt(metrics.audioPathMs) }}</text></view>
        <view class="cell"><text class="k">MIDI→audio</text><text class="v">{{ fmt(metrics.midiToAudibleMs) }}</text></view>
        <view class="cell"><text class="k">Jitter</text><text class="v">{{ fmt(metrics.jitterMs) }}</text></view>
        <view class="cell"><text class="k">Underruns</text><text class="v">{{ metrics.underruns }}</text></view>
      </view>

      <view class="grid">
        <view class="cell"><text class="k">PC CPU</text><text class="v">{{ pct(metrics.cpuPercent) }}</text></view>
        <view class="cell"><text class="k">PC audio CPU</text><text class="v">{{ pct(metrics.audioCpuPercent) }}</text></view>
        <view class="cell"><text class="k">PC RAM</text><text class="v">{{ mb(metrics.workingSetMb) }}</text></view>
        <view class="cell"><text class="k">VST plugins</text><text class="v">{{ metrics.pluginCount }}</text></view>
        <view class="cell"><text class="k">Browser FX</text><text class="v">{{ metrics.browserPlugins || 0 }}</text></view>
        <view class="cell"><text class="k">FX chain</text><text class="v">{{ metrics.browserFxAttached ? 'On' : 'Off' }}</text></view>
        <view class="cell"><text class="k">Routing</text><text class="v">{{ metrics.routingMode || '—' }}</text></view>
        <view class="cell"><text class="k">FX error</text><text class="v">{{ metrics.browserFxError || metrics.bypassReason || '—' }}</text></view>
        <view class="cell"><text class="k">Worklet block</text><text class="v">{{ metrics.browserCpuMs == null ? '—' : Number(metrics.browserCpuMs).toFixed(2) + ' ms' }}</text></view>
        <view class="cell"><text class="k">Limiter X</text><text class="v">{{ limiterCpu }}</text></view>
        <view class="cell"><text class="k">M Orchestra CPU</text><text class="v">{{ orchCpu }}</text></view>
        <view class="cell"><text class="k">M Orch voices</text><text class="v">{{ orchVoices }}</text></view>
        <view class="cell"><text class="k">M Orch cache</text><text class="v">{{ orchCache }}</text></view>
      </view>

      <text class="hint">Device: {{ deviceLabel }} · Session {{ engineLink.sessionId.slice(0, 8) || 'offline' }} · Reconnects {{ engineLink.reconnectCount }} · Buffer {{ metrics.bufferDepthMs }} ms</text>
      <view class="actions">
        <view class="btn" @click="runMeasure">Measure</view>
        <view class="btn ghost" @click="toggleRemoteAudio">{{ session.remoteAudioOn ? 'Stop audio' : 'Start audio' }}</view>
      </view>
      <text class="log">{{ session.diagnosticsLog }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, engineLink, runLatencyMeasure, toggleRemoteAudio } from '../store/session.js'

const metrics = computed(() => session.diagnostics || {})
const deviceLabel = computed(() => {
  if (typeof navigator === 'undefined') return 'unknown'
  return /iPad|iPhone|Android/i.test(navigator.userAgent) ? 'mobile' : 'desktop'
})

function fmt (value) {
  if (value == null || value === '') return 'unmeasured'
  return Number(value).toFixed(1) + ' ms'
}

function pct (value) {
  if (value == null) return '—'
  return Number(value).toFixed(1) + '%'
}

function mb (value) {
  if (value == null) return '—'
  return Number(value).toFixed(0) + ' MB'
}

const limiterCpu = computed(() => {
  const ns = metrics.value && metrics.value.limiterNsPerSample
  if (ns == null || ns === '') return '—'
  return Number(ns).toFixed(1) + ' ns/smp'
})

const orch = computed(() => (metrics.value && metrics.value.mOrchestra) || {})
const orchCpu = computed(() => orch.value.cpuPercent == null ? '—' : Number(orch.value.cpuPercent).toFixed(1) + '%')
const orchVoices = computed(() => {
  if (orch.value.activeVoices == null) return '—'
  return orch.value.activeVoices + ' / smp ' + (orch.value.sampleVoices || 0)
})
const orchCache = computed(() => orch.value.cacheMb == null ? '—' : Number(orch.value.cacheMb).toFixed(1) + ' MB')

function close () {
  session.diagnosticsVisible = false
}

function runMeasure () {
  runLatencyMeasure()
}
</script>

<style scoped>
.diag {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
}
.sheet {
  width: min(520px, calc(100% - 48px));
  background: #161616;
  border: 1px solid #2a2a2a;
  border-radius: 14px;
  padding: 18px 18px 22px;
  color: #e8e4dc;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}
.head { display: flex; justify-content: space-between; align-items: center; }
.title { letter-spacing: 0.16em; text-transform: uppercase; font-size: 12px; color: #8a8680; }
.done { height: 44px; display: flex; align-items: center; }
.note { color: #8a8680; font-size: 12px; margin: 8px 0 14px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
.cell { border: 1px solid #262626; border-radius: 10px; padding: 10px 12px; }
.k { display: block; font-size: 11px; color: #8a8680; }
.v { font-size: 16px; }
.hint { font-size: 12px; color: #6a6a6a; }
.actions { display: flex; gap: 10px; margin-top: 14px; }
.btn {
  flex: 1;
  height: 44px;
  border: 1px solid #d8d2c8;
  border-radius: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.btn.ghost { border-color: #333; color: #b8b4ac; }
.log { margin-top: 12px; font-size: 12px; color: #8a8680; white-space: pre-wrap; }
</style>
