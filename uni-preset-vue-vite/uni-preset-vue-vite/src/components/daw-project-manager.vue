<template>
  <view v-if="session.projectManagerOpen" class="overlay" @click.self="close">
    <view class="sheet project-sheet" @click.stop>
      <view class="head">
        <text class="title">Projects</text>
        <view class="hit" title="Close" aria-label="Close" @click="close">
          <daw-icon name="close" :size="18" />
        </view>
      </view>
      <view class="tabs">
        <view class="tab" :class="{ on: cloudAuth.tab === 'local' }" @click="cloudAuth.tab = 'local'">Local</view>
        <view class="tab" :class="{ on: cloudAuth.tab === 'cloud' }" @click="openCloud">Cloud</view>
      </view>
      <view class="actions">
        <view class="btn" @click="onNew">New</view>
        <view class="btn" @click="onOpenFile">Open file</view>
        <view class="btn" @click="onImportMidi">Import MIDI</view>
        <view class="btn" @click="onSave">Save</view>
        <view class="btn" @click="onSaveAs">Save as</view>
        <view class="btn" @click="onExport">Export WAV</view>
        <view class="btn" @click="onShare">Share project</view>
        <view v-if="cloudAuth.tab === 'cloud' && cloudAuth.user" class="btn" @click="onUpload">Upload current</view>
      </view>
      <template v-if="cloudAuth.tab === 'cloud'">
        <view v-if="!cloudAuth.user" class="empty">Sign in from Settings to use cloud projects.</view>
        <view v-else-if="!cloudRows.length" class="empty">No cloud projects yet. Upload current saves this one there.</view>
        <view v-for="row in cloudRows" :key="row.cloudId" class="row">
          <view class="meta" @click="onOpenCloud(row)">
            <text class="name">{{ row.name || 'Untitled' }}</text>
            <text class="when">{{ when(row.updatedAt) }} · {{ formatBytes(row.sizeBytes) }}{{ conflictLabel(row) }}</text>
          </view>
          <view class="row-actions">
            <view class="mini" @click.stop="onOpenCloud(row)">Open</view>
            <view class="mini danger" @click.stop="onDeleteCloud(row)">Delete</view>
          </view>
        </view>
      </template>
      <template v-else>
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
      </template>
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
  serializeProject,
  showToast
} from '../store/session.js'
import { cloudAuth, watchCloudAuth, refreshCloudAuth } from '../store/cloud-auth.js'
import {
  listCloudProjects,
  uploadProject,
  downloadProject,
  deleteCloudProject,
  formatBytes,
  compareCopies,
  cloudErrorMessage,
  fitsQuota
} from '../lib/cloud-projects.js'

const rows = ref([])
const cloudRows = ref([])

async function refresh () {
  rows.value = await listStoredProjects()
  if (cloudAuth.user) {
    try { cloudRows.value = await listCloudProjects() } catch (err) {
      showToast(cloudErrorMessage(err))
    }
  } else cloudRows.value = []
}

async function openCloud () {
  cloudAuth.tab = 'cloud'
  await refreshCloudAuth()
  await refresh()
}

function conflictLabel (row) {
  const hint = compareCopies(session.updatedAt || session.savedAt, row.updatedAt)
  if (hint === 'local-newer') return ' · local is newer'
  if (hint === 'cloud-newer') return ' · cloud is newer'
  return ''
}

async function onUpload () {
  try {
    const project = serializeProject()
    const bytes = new Blob([JSON.stringify(project)]).size
    if (!fitsQuota(cloudAuth.usage, bytes)) {
      showToast('Cloud storage is full. Delete a cloud project or free up space.')
      return
    }
    const result = await uploadProject(project, { name: session.projectName, localId: session.projectId, cloudId: session.cloudId })
    session.cloudId = result.cloudId
    await refreshCloudAuth()
    await refresh()
    showToast('Uploaded to cloud')
  } catch (err) {
    showToast(cloudErrorMessage(err, 'Upload failed'))
  }
}

async function onOpenCloud (row) {
  try {
    const data = await downloadProject(row.cloudId)
    await importProjectJson(data)
    session.cloudId = row.cloudId
    close()
  } catch (err) {
    showToast(cloudErrorMessage(err, 'Download failed'))
  }
}

async function onDeleteCloud (row) {
  const ok = typeof window === 'undefined' || window.confirm('Delete cloud copy “' + (row.name || 'Untitled') + '”?')
  if (!ok) return
  try {
    await deleteCloudProject(row.cloudId)
    await refreshCloudAuth()
    await refresh()
  } catch (err) {
    showToast(cloudErrorMessage(err))
  }
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
  watchCloudAuth()
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
  display: block;
  overflow: auto;
  touch-action: pan-y;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
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
.tabs { display: flex; gap: 6px; margin-bottom: 10px; }
.tab {
  flex: 1;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: #161616;
  cursor: pointer;
}
.tab.on { background: #2b2b2b; }
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
<style>
uni-view.project-sheet {
  display: block !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
  touch-action: pan-y;
}
</style>
