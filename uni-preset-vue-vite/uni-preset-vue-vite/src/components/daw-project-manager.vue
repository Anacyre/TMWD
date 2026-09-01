<template>
  <view v-if="session.projectManagerOpen" class="overlay" @click.self="close">
    <view class="sheet" @click.stop>
      <view class="head">
        <text class="title">Projects</text>
        <view class="hit" title="Close" aria-label="Close" @click="close">
          <daw-icon name="close" :size="18" />
        </view>
      </view>
      <view class="actions">
        <view class="btn" @click="onNew">New</view>
        <view class="btn" @click="onOpenFile">Open file</view>
        <view class="btn" @click="onImportMidi">Import MIDI</view>
        <view class="btn" @click="onSave">Save</view>
        <view class="btn" @click="onSaveAs">Save as</view>
        <view class="btn" @click="onExport">Export WAV</view>
        <view class="btn" @click="onShare">Share project</view>
      </view>
      <view v-if="!rows.length" class="empty">No local projects yet. Save creates one here.</view>
      <view v-for="row in rows" :key="row.id" class="row" :class="{ on: row.id === session.projectId }">
        <view class="meta" @click="onOpen(row)">
          <text class="name">{{ row.name || 'Untitled' }}</text>
          <text class="when">{{ when(row.updatedAt) }}</text>
        </view>
        <view class="row-actions">
          <view class="mini" title="Rename" @click.stop="onRename(row)">Rename</view>
          <view class="mini" title="Duplicate" @click.stop="onDuplicate(row)">Copy</view>
          <view class="mini danger" title="Delete" @click.stop="onDelete(row)">Delete</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import DawIcon from './daw-icon.vue'
import {
  session,
  closeProjectManager,
  newProject,
  addTrack,
  saveCurrentProject,
  saveProjectAs,
  exportProjectWav,
  shareProjectFile,
  importProjectJson,
  openMidiFilePicker,
  openStoredProject,
  listStoredProjects,
  deleteStoredProject,
  duplicateStoredProject,
  renameStoredProject,
  showToast
} from '../store/session.js'

const rows = ref([])

async function refresh () {
  rows.value = await listStoredProjects()
}

function close () {
  closeProjectManager()
}

async function onNew () {
  await newProject()
  await addTrack('midi', 'Instrument 1')
  close()
}

function onOpenFile () {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.dawweb,.json,application/json'
  input.onchange = async () => {
    const file = input.files && input.files[0]
    if (!file) return
    await importProjectJson(await file.text())
    await refresh()
    close()
  }
  input.click()
}

async function onImportMidi () {
  const count = await openMidiFilePicker()
  if (count > 0) close()
}

async function onSave () {
  await saveCurrentProject()
  await refresh()
}

async function onSaveAs () {
  const name = typeof window !== 'undefined'
    ? window.prompt('Save project as', session.projectName || 'Untitled')
    : session.projectName
  if (name == null) return
  await saveProjectAs(name)
  await refresh()
}

async function onExport () {
  await exportProjectWav()
}

async function onShare () {
  await shareProjectFile()
}

async function onOpen (row) {
  await openStoredProject(row.id)
  close()
}

async function onRename (row) {
  const name = typeof window !== 'undefined'
    ? window.prompt('Rename project', row.name || 'Untitled')
    : row.name
  if (!name) return
  await renameStoredProject(row.id, name)
  await refresh()
}

async function onDuplicate (row) {
  await duplicateStoredProject(row.id)
  await refresh()
  showToast('Project copied')
}

async function onDelete (row) {
  const ok = typeof window === 'undefined' || window.confirm('Delete “' + (row.name || 'Untitled') + '”?')
  if (!ok) return
  await deleteStoredProject(row.id)
  await refresh()
}

function when (stamp) {
  if (!stamp) return ''
  const date = new Date(stamp)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

watch(() => session.projectManagerOpen, (open) => {
  if (open) refresh()
})

onMounted(() => {
  if (session.projectManagerOpen) refresh()
})
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.46);
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.sheet {
  width: min(560px, 100%);
  max-height: min(80vh, 640px);
  overflow: auto;
  background: #1c1c1c;
  border: 1px solid #333;
  border-radius: 10px;
  padding: 14px 14px 18px;
  color: #e6e6e6;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.title { font-size: 16px; font-weight: 600; }
.hit {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}
.btn, .mini {
  padding: 6px 10px;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}
.btn:hover, .mini:hover { background: #2a2a2a; }
.empty { font-size: 12px; color: #888; padding: 12px 0; }
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 4px;
  border-top: 1px solid #2a2a2a;
}
.row.on { background: #242424; }
.meta { flex: 1; min-width: 0; cursor: pointer; }
.name { display: block; font-size: 13px; }
.when { display: block; font-size: 11px; color: #888; }
.row-actions { display: flex; gap: 6px; }
.mini.danger { color: #d96a6a; }
</style>
