<template>
  <view class="mlib">
    <view class="mlib-head">
      <text class="mlib-title">Library</text>
      <view class="mlib-icon" title="Add a folder" aria-label="Add a folder" @click="addFolder">
        <daw-icon name="plus" :size="18" />
      </view>
      <view class="mlib-icon" title="Close" aria-label="Close library" @click="$emit('close')">
        <daw-icon name="close" :size="18" />
      </view>
    </view>

    <view class="mlib-sources">
      <view class="mlib-source" :class="{ on: instrumentsOn }" @click="showInstruments">
        <daw-icon name="piano" :size="14" />
        <text class="mlib-source-name">Instruments</text>
      </view>
      <view
        v-for="source in media.sources"
        :key="source.id"
        class="mlib-source"
        :class="{ on: !instrumentsOn && media.sourceId === source.id }"
        @click="pickSource(source.id)"
      >
        <daw-icon :name="source.kind === 'imported' ? 'download' : 'folder'" :size="14" />
        <text class="mlib-source-name">{{ source.name }}</text>
        <view
          v-if="!instrumentsOn && media.sourceId === source.id && source.kind !== 'imported'"
          class="mlib-source-x"
          title="Remove from library"
          aria-label="Remove from library"
          @click.stop="onRemoveSource(source)"
        >
          <daw-icon name="close" :size="12" />
        </view>
      </view>
    </view>

    <view v-if="media.sources.length && !instrumentsOn" class="mlib-tools">
      <view class="mlib-search">
        <daw-icon name="search" :size="14" />
        <input
          class="mlib-search-input"
          type="text"
          placeholder="Search"
          :value="media.search"
          @input="media.search = valueOf($event)"
          @focus="setTyping(true)"
          @blur="setTyping(false)"
        >
      </view>
      <view class="mlib-seg">
        <view v-for="k in kinds" :key="k.id" class="mlib-seg-item" :class="{ on: media.kind === k.id }" @click="media.kind = k.id">{{ k.label }}</view>
      </view>
    </view>

    <view v-if="crumbs.length && !media.search && !instrumentsOn" class="mlib-crumbs">
      <text class="mlib-crumb" @click="media.dir = ''">{{ sourceName }}</text>
      <template v-for="c in crumbs" :key="c.path">
        <daw-icon name="chevron-right" :size="12" />
        <text class="mlib-crumb" @click="media.dir = c.path">{{ c.name }}</text>
      </template>
    </view>

    <view v-show="instrumentsOn" class="mlib-list mlib-scroll">
      <view v-if="!instrumentDownloads || !instrumentDownloads.ready" class="mlib-empty">
        <text class="mlib-muted">Reading instruments…</text>
      </view>
      <template v-else>
        <template v-for="group in instrumentDownloads.groups" :key="group.id">
          <text class="mlib-group">{{ group.name }}</text>
          <view v-for="item in group.items" :key="item.id" class="mlib-row file" @click="onInstrument(item)">
            <view class="mlib-text">
              <text class="mlib-name">{{ item.name }}</text>
              <view v-if="showInstrumentBar(item)" class="mlib-bar">
                <view class="mlib-bar-fill" :style="{ width: instrumentProgress(item) }" />
              </view>
              <text v-if="item.error" class="mlib-meta err">{{ item.error }}</text>
            </view>
            <view class="mlib-act"><text>{{ instrumentAction(item) }}</text></view>
          </view>
        </template>
        <view v-if="!instrumentDownloads.groups.length" class="mlib-empty">
          <text class="mlib-muted">No instruments to download.</text>
        </view>
      </template>
    </view>

    <view v-show="!instrumentsOn" ref="listEl" class="mlib-list mlib-scroll">
      <view v-if="!media.sources.length" class="mlib-empty">
        <text class="mlib-empty-title">Your sounds, one tap away</text>
        <text class="mlib-muted">{{ canFolders
          ? 'Pick a folder with samples, loops and MIDI files. It stays here next time.'
          : 'Add audio and MIDI files. They are kept in this browser.' }}</text>
        <view class="mlib-btn primary" @click="canFolders ? addFolder() : addFiles()">{{ canFolders ? 'Choose a folder' : 'Add files' }}</view>
        <view v-if="canFolders" class="mlib-btn" @click="addFiles">Add files instead</view>
      </view>
      <view v-else-if="media.needsPermission" class="mlib-empty">
        <text class="mlib-muted">The browser needs your permission to read “{{ sourceName }}” again.</text>
        <view class="mlib-btn primary" @click="reconnectSource">Allow access</view>
      </view>
      <view v-else-if="media.loading" class="mlib-empty"><text class="mlib-muted">Reading folder…</text></view>
      <template v-else>
        <view v-for="folder in view.folders" :key="'d:' + folder.path" class="mlib-row folder" @click="media.dir = folder.path">
          <daw-icon name="folder" :size="16" />
          <text class="mlib-name">{{ folder.name }}</text>
          <text class="mlib-meta">{{ folder.count }}</text>
          <daw-icon name="chevron-right" :size="14" />
        </view>
        <view
          v-for="entry in view.files"
          :key="entry.id"
          class="mlib-row file"
          :class="{ playing: media.previewId === entry.id, midi: entry.kind === 'midi' }"
          :data-entry="entry.id"
        >
          <view class="mlib-kind">
            <daw-icon :name="media.previewId === entry.id ? 'stop' : (entry.kind === 'midi' ? 'piano' : 'wave')" :size="14" />
          </view>
          <view class="mlib-text">
            <text class="mlib-name">{{ entry.title }}</text>
            <text v-if="media.search && entry.dir" class="mlib-meta">{{ entry.dir }}</text>
          </view>
          <view class="mlib-add" title="Add at playhead" aria-label="Add at playhead" @click.stop="addEntryAtPlayhead(entry)">
            <daw-icon name="plus" :size="14" />
          </view>
          <view v-if="entry.rowId" class="mlib-add" title="Remove" aria-label="Remove" @click.stop="removeImported(entry)">
            <daw-icon name="trash" :size="14" />
          </view>
        </view>
        <view v-if="!view.folders.length && !view.files.length" class="mlib-empty">
          <text class="mlib-muted">{{ media.search ? 'No files match.' : 'No audio or MIDI files here.' }}</text>
        </view>
        <text v-if="media.truncated" class="mlib-muted mlib-pad">Showing the first 3000 files.</text>
      </template>
    </view>

    <view v-if="instrumentsOn" class="mlib-foot">
      <text class="mlib-muted">Saved in this browser. Playback reads a finished instrument from this device.</text>
    </view>
    <view v-else-if="media.sources.length" class="mlib-foot">
      <text class="mlib-muted">{{ footHint }}</text>
      <view class="mlib-link" @click="addFiles">Add files</view>
    </view>

    <view
      v-if="media.drag"
      class="mlib-ghost"
      :class="{ over: media.drag.over }"
      :style="{ left: media.drag.x + 'px', top: media.drag.y + 'px' }"
    >
      <daw-icon :name="media.drag.entry.kind === 'midi' ? 'piano' : 'wave'" :size="14" />
      <text>{{ media.drag.over ? (media.drag.label || 'Drop to add') : media.drag.entry.title }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import DawIcon from '../daw-icon.vue'
import { setTyping, isTouchInput } from '../../store/session.js'
import {
  media,
  loadSources,
  openSource,
  addFolder,
  addFiles,
  reconnectSource,
  removeSource,
  removeImported,
  previewEntry,
  stopFilePreview,
  startMediaDrag,
  moveMediaDrag,
  endMediaDrag,
  cancelMediaDrag,
  addEntryAtPlayhead,
  libraryCanPickFolders
} from '../../store/media-library.js'
import { listDir, searchEntries, breadcrumb } from '../../lib/media-library.js'

defineEmits(['close'])

const kinds = [
  { id: 'all', label: 'All' },
  { id: 'audio', label: 'Audio' },
  { id: 'midi', label: 'MIDI' }
]
const canFolders = libraryCanPickFolders()
const instrumentsOn = ref(false)
const instrumentApi = shallowRef(null)
const instrumentDownloads = computed(() => instrumentApi.value && instrumentApi.value.downloads)

async function showInstruments () {
  instrumentsOn.value = true
  if (!instrumentApi.value) instrumentApi.value = await import('../../store/instrument-downloads.js')
  await instrumentApi.value.refreshInstrumentDownloads()
}

function pickSource (id) {
  instrumentsOn.value = false
  openSource(id)
}

function instrumentAction (item) {
  return instrumentApi.value ? instrumentApi.value.instrumentAction(item) : ''
}

function instrumentProgress (item) {
  return instrumentApi.value ? instrumentApi.value.instrumentProgress(item) : '0%'
}

function showInstrumentBar (item) {
  return !!(item && (item.state === 'downloading' || item.state === 'ready' || item.state === 'error' || item.done > 0))
}

function onInstrument (item) {
  if (!instrumentApi.value || !item || item.state === 'downloading') return
  if (item.state === 'ready') instrumentApi.value.removeInstrumentDownload(item.id)
  else instrumentApi.value.startInstrumentDownload(item.id)
}

const sourceName = computed(() => {
  const source = media.sources.find((s) => s.id === media.sourceId)
  return source ? source.name : ''
})
const crumbs = computed(() => breadcrumb(media.dir))
const view = computed(() => {
  if (media.search) return { folders: [], files: searchEntries(media.entries, media.search, media.kind) }
  const listed = listDir(media.entries, media.dir)
  return {
    folders: listed.folders,
    files: media.kind === 'all' ? listed.files : listed.files.filter((e) => e.kind === media.kind)
  }
})
const footHint = computed(() => (isTouchInput()
  ? 'Tap to listen · slide onto a track'
  : 'Click to listen · drag onto a track'))

function valueOf (event) {
  if (event && event.detail && event.detail.value != null) return String(event.detail.value)
  return String((event && event.target && event.target.value) || '')
}

async function onRemoveSource (source) {
  const ok = typeof window === 'undefined' || window.confirm('Remove “' + source.name + '” from the library? Files on disk are not touched.')
  if (ok) await removeSource(source.id)
}

/* A row press becomes a preview on release, or a drag once it moves. On touch the list
   scrolls vertically, so a drag starts only on a sideways slide. */
let press = null
const listEl = ref(null)
let listNode = null

function onListDown (e) {
  const target = e && e.target
  if (e.button !== 0 || !target || !target.closest) return
  if (target.closest('.mlib-add')) return
  const row = target.closest('[data-entry]')
  if (!row) return
  const entry = view.value.files.find((f) => f.id === row.getAttribute('data-entry'))
  if (entry) onRowDown(e, entry)
}

function onRowDown (e, entry) {
  press = { entry, x: e.clientX, y: e.clientY, id: e.pointerId, touch: e.pointerType !== 'mouse', dragging: false }
  window.addEventListener('pointermove', onMove, true)
  window.addEventListener('pointerup', onUp, true)
  window.addEventListener('pointercancel', onCancel, true)
}

function onMove (e) {
  if (!press || e.pointerId !== press.id) return
  const dx = e.clientX - press.x
  const dy = e.clientY - press.y
  if (!press.dragging) {
    const far = Math.hypot(dx, dy) > (press.touch ? 12 : 6)
    if (!far) return
    if (press.touch && Math.abs(dx) < Math.abs(dy) * 1.2) {
      release()
      return
    }
    press.dragging = true
    startMediaDrag(press.entry, e.clientX, e.clientY)
  }
  e.preventDefault()
  moveMediaDrag(e.clientX, e.clientY)
}

async function onUp (e) {
  if (!press || e.pointerId !== press.id) return
  const p = press
  release()
  if (p.dragging) await endMediaDrag(e.clientX, e.clientY)
  else previewEntry(p.entry)
}

function onCancel (e) {
  if (!press || e.pointerId !== press.id) return
  if (press.dragging) cancelMediaDrag()
  release()
}

function release () {
  press = null
  window.removeEventListener('pointermove', onMove, true)
  window.removeEventListener('pointerup', onUp, true)
  window.removeEventListener('pointercancel', onCancel, true)
}

onMounted(() => {
  loadSources()
  const el = listEl.value
  listNode = el && (el.$el || el)
  if (listNode && listNode.addEventListener) listNode.addEventListener('pointerdown', onListDown)
})

onUnmounted(() => {
  if (listNode) listNode.removeEventListener('pointerdown', onListDown)
  release()
  stopFilePreview()
  cancelMediaDrag()
})
</script>

<style scoped>
.mlib {
  --ml-bg: #111214;
  --ml-s1: #17181b;
  --ml-s2: #1f2125;
  --ml-line: rgba(255, 255, 255, 0.07);
  --ml-ink: #e9eaee;
  --ml-ink-2: #9da0a9;
  --ml-ink-3: #6b6e78;
  --ml-accent: #6aa8ff;
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  background: var(--ml-bg);
  color: var(--ml-ink);
  font-size: 13px;
  box-shadow: inset 1px 0 0 var(--ml-line), inset -1px 0 0 var(--ml-line);
  user-select: none;
  -webkit-user-select: none;
}
.mlib :deep(.icon) { width: auto; height: auto; flex: none; color: inherit; }
.mlib-head {
  height: 48px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px 0 14px;
}
.mlib-title { flex: 1; font-size: 14px; font-weight: 650; }
.mlib-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--ml-ink-2);
  cursor: pointer;
}
.mlib-icon:hover { background: var(--ml-s2); color: var(--ml-ink); }
.mlib-sources { display: flex; gap: 6px; padding: 0 12px 8px; flex: 0 0 auto; flex-wrap: nowrap; overflow-x: auto; }
.mlib-source {
  max-width: 100%;
  height: 30px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 15px;
  background: var(--ml-s1);
  color: var(--ml-ink-2);
  cursor: pointer;
}
.mlib-source.on { background: rgba(106, 168, 255, 0.16); color: var(--ml-ink); }
.mlib-source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px; }
.mlib-source-x { margin-right: -4px; padding: 4px; border-radius: 50%; color: var(--ml-ink-3); }
.mlib-source-x:hover { color: var(--ml-ink); }
.mlib-tools { display: flex; gap: 6px; padding: 0 12px 8px; }
.mlib-search {
  flex: 1;
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--ml-s1);
  color: var(--ml-ink-3);
}
.mlib-search-input { flex: 1; min-width: 0; height: 30px; border: 0; background: transparent; color: var(--ml-ink); font-size: 13px; text-align: left; }
.mlib-search-input:focus { outline: none; }
.mlib-seg { display: flex; padding: 2px; border-radius: 9px; background: var(--ml-s1); }
.mlib-seg-item { height: 28px; padding: 0 8px; display: flex; align-items: center; border-radius: 7px; color: var(--ml-ink-2); font-size: 12px; cursor: pointer; }
.mlib-seg-item.on { background: var(--ml-s2); color: var(--ml-ink); }
.mlib-crumbs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 0 14px 6px; color: var(--ml-ink-3); font-size: 12px; }
.mlib-crumb { cursor: pointer; color: var(--ml-ink-2); }
.mlib-crumb:hover { color: var(--ml-ink); }
.mlib-list {
  flex: 1;
  min-height: 0;
  padding: 0 6px 8px;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
.mlib-row {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 6px 0 10px;
  border-radius: 9px;
  cursor: pointer;
  color: var(--ml-ink-2);
  touch-action: pan-y;
}
.mlib-row:hover { background: var(--ml-s1); }
.mlib-row.file { color: var(--ml-ink); }
.mlib-row.playing { background: rgba(106, 168, 255, 0.14); }
.mlib-kind {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ml-s2);
  color: #7fd1b9;
}
.mlib-row.midi .mlib-kind { color: #c7a5ff; }
.mlib-row.playing .mlib-kind { background: var(--ml-accent); color: #0a0d12; }
.mlib-text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.mlib-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mlib-meta { font-size: 11px; color: var(--ml-ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mlib-add {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: var(--ml-ink-3);
  opacity: 0;
}
.mlib-row:hover .mlib-add { opacity: 1; }
.mlib-add:hover { background: var(--ml-s2); color: var(--ml-ink); }
.mlib-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px 10px; }
.mlib-empty-title { font-size: 14px; font-weight: 600; }
.mlib-muted { color: var(--ml-ink-2); font-size: 12px; line-height: 1.5; }
.mlib-pad { display: block; padding: 8px 10px; }
.mlib-btn {
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border-radius: 10px;
  background: var(--ml-s2);
  font-weight: 550;
  cursor: pointer;
}
.mlib-btn.primary { background: var(--ml-accent); color: #0a0d12; }
.mlib-group {
  display: block;
  padding: 12px 14px 4px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--ml-ink-3);
}
.mlib-act {
  flex: none;
  min-width: 36px;
  padding: 6px 4px 6px 8px;
  color: var(--ml-accent);
  cursor: pointer;
  font-size: 12px;
  text-align: right;
}
.mlib-meta.err { color: #e07070; }
.mlib-bar { height: 4px; margin-top: 6px; border-radius: 2px; background: var(--ml-s2); overflow: hidden; }
.mlib-bar-fill { height: 100%; width: 0; background: var(--ml-accent); }
.mlib-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px calc(8px + env(safe-area-inset-bottom, 0px));
  box-shadow: inset 0 1px 0 var(--ml-line);
}
.mlib-foot .mlib-muted { flex: 1; font-size: 11px; color: var(--ml-ink-3); }
.mlib-link { color: var(--ml-accent); font-size: 12px; cursor: pointer; }
.mlib-ghost {
  position: fixed;
  z-index: 200;
  transform: translate(-50%, calc(-100% - 14px));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(31, 33, 37, 0.96);
  border: 1px solid var(--ml-line);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  pointer-events: none;
  white-space: nowrap;
  font-size: 12px;
}
.mlib-ghost.over { background: var(--ml-accent); color: #0a0d12; border-color: transparent; }
@media (pointer: coarse) {
  .mlib-row { min-height: 48px; }
  .mlib-add { opacity: 1; width: 40px; height: 40px; }
  .mlib-source { height: 36px; }
}
</style>

<style>
uni-view.mlib-scroll {
  overflow-y: auto !important;
  overflow-x: hidden !important;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
}
</style>
