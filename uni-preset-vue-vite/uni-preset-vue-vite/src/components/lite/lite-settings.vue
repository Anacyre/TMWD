<template>
  <lite-sheet :open="session.settingsOpen" title="Settings" @close="closeSettings">
    <text class="lt-cap">Account</text>
    <view v-if="cloudAuth.user" class="account">
      <view class="avatar">{{ initial }}</view>
      <view class="account-meta">
        <text class="account-name">{{ usageName }}</text>
        <text class="account-mail">{{ cloudAuth.user.email }}</text>
        <view class="quota">
          <view class="quota-fill" :style="{ width: (quotaRatio * 100) + '%' }" />
        </view>
        <text class="account-mail">{{ quotaLabel }}</text>
      </view>
      <view class="lt-btn ghost" @click="cloudSignOut">Sign out</view>
    </view>
    <view v-else class="account-form">
      <input class="rename" type="email" placeholder="Email" :value="cloudAuth.email" @input="cloudAuth.email = $event.target.value" @focus="setTyping(true)" @blur="setTyping(false)">
      <input class="rename" type="password" placeholder="Password" :value="cloudAuth.password" @input="cloudAuth.password = $event.target.value" @focus="setTyping(true)" @blur="setTyping(false)">
      <view class="cta-row">
        <view class="lt-btn" :class="{ off: cloudAuth.busy }" @click="cloudSignIn">Sign in</view>
        <view class="lt-btn ghost" :class="{ off: cloudAuth.busy }" @click="cloudSignUp">Create</view>
      </view>
      <view class="lt-row" @click="cloudSendLink">
        <text class="grow">Email me a sign-in link</text>
      </view>
      <text v-if="cloudAuth.error" class="hint err">{{ cloudAuth.error }}</text>
      <text v-else-if="cloudAuth.notice" class="hint">{{ cloudAuth.notice }}</text>
    </view>

    <text class="lt-cap">Interface</text>
    <view class="lt-seg modes">
      <view
        v-for="mode in MODES"
        :key="mode.id"
        class="lt-seg-item"
        :class="{ on: shell === mode.id }"
        @click="setInterfaceMode(mode.id)"
      >{{ mode.label }}</view>
    </view>
    <text class="hint">{{ modeHint }}</text>

    <text class="lt-cap">Pointer</text>
    <view class="lt-seg modes">
      <view
        v-for="mode in INPUTS"
        :key="mode.id"
        class="lt-seg-item"
        :class="{ on: session.inputMode === mode.id }"
        @click="setInputMode(mode.id)"
      >{{ mode.label }}</view>
    </view>
    <text class="hint">{{ inputHint }}</text>

    <text class="lt-cap">Editing</text>
    <view class="lt-row plain">
      <text class="grow">Snap</text>
      <view class="lt-seg snaps">
        <view
          v-for="option in SNAPS"
          :key="option.id"
          class="lt-seg-item"
          :class="{ on: snapOn(option) }"
          @click="setSnapGrid(option.beats)"
        >{{ option.name }}</view>
      </view>
    </view>
    <view class="lt-row" @click="toggleMetronome">
      <text class="grow">Metronome</text>
      <view class="switch" :class="{ on: session.metronome }"><view class="knob" /></view>
    </view>
  </lite-sheet>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import LiteSheet from './lite-sheet.vue'
import {
  session,
  SNAP_OPTIONS,
  closeSettings,
  setInterfaceMode,
  setInputMode,
  interfaceShell,
  setSnapGrid,
  toggleMetronome,
  setTyping
} from '../../store/session.js'
import {
  cloudAuth,
  watchCloudAuth,
  cloudSignIn,
  cloudSignUp,
  cloudSendLink,
  cloudSignOut,
  accountInitial
} from '../../store/cloud-auth.js'
import { formatBytes } from '../../lib/cloud-projects.js'

const MODES = [
  { id: 'lite', label: 'Lite', hint: 'Touch layout for tablets.' },
  { id: 'le', label: 'LE', hint: 'The previous touch layout.' },
  { id: 'professional', label: 'Pro', hint: 'Full desktop layout.' }
]
const INPUTS = [
  { id: 'touch', label: 'Touch', hint: 'One finger scrolls. Drag a clip to move it. Pinch to zoom.' },
  { id: 'pc', label: 'PC', hint: 'One finger edits. Two fingers move and zoom.' }
]
const SNAP_IDS = ['off', '1/4', '1/8', '1/16', '1/32']
const SNAPS = SNAP_IDS.map((id) => SNAP_OPTIONS.find((option) => option.id === id)).filter(Boolean)

const shell = computed(() => interfaceShell())
const modeHint = computed(() => {
  const mode = MODES.find((item) => item.id === shell.value)
  return (mode ? mode.hint + ' ' : '') + 'All layouts edit the same project.'
})
const inputHint = computed(() => {
  const mode = INPUTS.find((item) => item.id === session.inputMode) || INPUTS[1]
  return mode.hint
})

function snapOn (option) {
  if (!option.beats) return !session.snap
  return session.snap && Math.abs(session.snapGridBeats - option.beats) < 1e-6
}

const initial = computed(() => accountInitial(cloudAuth.user, cloudAuth.usage))
const usageName = computed(() => (cloudAuth.usage && cloudAuth.usage.displayName) || 'Account')
const quotaRatio = computed(() => (cloudAuth.usage && cloudAuth.usage.ratio) || 0)
const quotaLabel = computed(() => {
  const usage = cloudAuth.usage
  if (!usage) return ''
  return formatBytes(usage.usedBytes) + ' of ' + formatBytes(usage.quotaBytes)
})

onMounted(() => watchCloudAuth())

</script>

<style scoped>
.modes .lt-seg-item { flex: 1; }
.hint {
  display: block;
  margin-top: 8px;
  color: var(--lt-ink-2);
  font-size: var(--lt-fs-s);
}
.lt-row.plain { cursor: default; }
.snaps .lt-seg-item { min-width: 48px; padding: 0 10px; }
.switch {
  width: 46px;
  height: 28px;
  border-radius: 14px;
  background: var(--lt-s3);
  position: relative;
  transition: background 140ms ease;
}
.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--lt-ink);
  transition: transform 140ms ease;
}
.switch.on { background: var(--lt-accent); }
.switch.on .knob { transform: translateX(18px); }
.account {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 12px;
}
.avatar {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: var(--lt-accent-soft, rgba(106, 168, 255, 0.2));
  color: var(--lt-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  flex: none;
}
.account-meta { flex: 1; min-width: 0; }
.account-name { display: block; font-weight: 600; }
.account-mail { display: block; font-size: 12px; color: var(--lt-ink-2); }
.quota {
  height: 6px;
  border-radius: 3px;
  background: var(--lt-s3);
  margin: 6px 0 4px;
  overflow: hidden;
}
.quota-fill { height: 100%; background: var(--lt-accent); }
.account-form { display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; }
.account-form .rename {
  height: 44px;
  border-radius: 10px;
  border: 0;
  background: var(--lt-s2);
  color: var(--lt-ink);
  padding: 0 12px;
}
.cta-row { display: flex; gap: 8px; }
.lt-btn {
  height: 44px;
  border-radius: 12px;
  background: var(--lt-accent);
  color: #0b0c0e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  cursor: pointer;
}
.lt-btn.ghost { background: var(--lt-s2); color: var(--lt-ink); }
.lt-btn.off { opacity: 0.4; pointer-events: none; }
.cta-row .lt-btn { flex: 1; text-align: center; }
.hint.err { color: #ff6b5e; }
</style>
