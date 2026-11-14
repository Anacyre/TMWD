/**
 * Media library state: sources, the folder being browsed, file preview and the
 * library-to-arrangement drag. Arrangements register drop targets so the library never
 * needs to know their layout.
 */

import { reactive } from 'vue'
import {
  session,
  getSelectedTrack,
  previewNoteOn,
  previewNoteOff,
  addClipFromFile,
  showToast
} from './session.js'
import {
  walkDirectory,
  entriesFromFileList,
  listSources,
  putSource,
  deleteSource,
  listImportedFiles,
  putImportedFile,
  deleteImportedFile,
  importedEntry,
  mediaKind,
  canPickFolders
} from '../lib/media-library.js'
import { parseMidiBlob } from '../lib/midi-import.js'

export const media = reactive({
  sources: [],
  sourceId: '',
  dir: '',
  search: '',
  kind: 'all',
  entries: [],
  loading: false,
  needsPermission: false,
  truncated: false,
  previewId: '',
  drag: null
})

/* Session-only sources (directory input fallback) cannot be stored. */
const sessionEntries = new Map()
const IMPORTED = { id: 'imported', kind: 'imported', name: 'Imported files' }

export function libraryCanPickFolders () {
  return canPickFolders()
}

export async function loadSources () {
  const stored = await listSources().catch(() => [])
  const imported = await listImportedFiles().catch(() => [])
  const list = stored.slice()
  for (const [id, item] of sessionEntries) list.push({ id, kind: 'session', name: item.name })
  if (imported.length || !canPickFolders()) list.push(IMPORTED)
  media.sources = list
  if (!media.sourceId || !list.some((s) => s.id === media.sourceId)) media.sourceId = list.length ? list[0].id : ''
  await openSource(media.sourceId)
}

export async function openSource (id) {
  media.sourceId = id
  media.dir = ''
  media.entries = []
  media.needsPermission = false
  media.truncated = false
  const source = media.sources.find((s) => s.id === id)
  if (!source) return
  media.loading = true
  try {
    if (source.kind === 'imported') {
      media.entries = (await listImportedFiles()).map(importedEntry).filter((e) => e.kind)
    } else if (source.kind === 'session') {
      media.entries = (sessionEntries.get(id) || {}).entries || []
    } else if (source.handle) {
      const state = typeof source.handle.queryPermission === 'function'
        ? await source.handle.queryPermission({ mode: 'read' })
        : 'granted'
      if (state !== 'granted') {
        media.needsPermission = true
        return
      }
      const result = await walkDirectory(source.handle, { sourceId: id })
      media.entries = result.entries
      media.truncated = result.truncated
    }
  } catch (err) {
    showToast('Could not read this folder')
  } finally {
    media.loading = false
  }
}

/** Needs a user gesture: browsers only re-grant folder access from a click. */
export async function reconnectSource () {
  const source = media.sources.find((s) => s.id === media.sourceId)
  if (!source || !source.handle || typeof source.handle.requestPermission !== 'function') return
  const state = await source.handle.requestPermission({ mode: 'read' }).catch(() => 'denied')
  if (state === 'granted') await openSource(source.id)
  else showToast('Folder access was not allowed')
}

export async function addFolder () {
  if (canPickFolders()) {
    let handle
    try {
      handle = await window.showDirectoryPicker({ id: 'dawweb-media', mode: 'read' })
    } catch (err) {
      return
    }
    const id = 'f_' + Date.now().toString(36)
    await putSource({ id, kind: 'folder', name: handle.name, handle, addedAt: Date.now() })
    media.sourceId = id
    await loadSources()
    return
  }
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.setAttribute('webkitdirectory', '')
  input.onchange = async () => {
    const files = input.files ? Array.from(input.files) : []
    if (!files.length) return
    const id = 's_' + Date.now().toString(36)
    const rel = String(files[0].webkitRelativePath || '')
    const name = rel.split('/')[0] || 'Folder'
    sessionEntries.set(id, { name, entries: entriesFromFileList(files, id) })
    media.sourceId = id
    await loadSources()
  }
  input.click()
}

/** iPad and other browsers without folder access: copy files into the browser. */
export function addFiles () {
  if (typeof document === 'undefined') return
  const input = document.createElement('input')
  input.type = 'file'
  input.multiple = true
  input.accept = 'audio/*,.wav,.mp3,.ogg,.flac,.m4a,.aac,.aif,.aiff,.mid,.midi,audio/midi'
  input.onchange = async () => {
    const files = input.files ? Array.from(input.files) : []
    let added = 0
    for (const file of files) {
      if (!mediaKind(file.name)) continue
      await putImportedFile({
        id: 'i_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7),
        name: file.name,
        type: file.type || '',
        size: file.size || 0,
        blob: file,
        addedAt: Date.now()
      })
      added++
    }
    if (!added) {
      if (files.length) showToast('Only audio and MIDI files can be added')
      return
    }
    media.sourceId = 'imported'
    await loadSources()
    showToast(added === 1 ? 'Added 1 file' : 'Added ' + added + ' files')
  }
  input.click()
}

export async function removeSource (id) {
  if (id === 'imported') return
  if (sessionEntries.has(id)) sessionEntries.delete(id)
  else await deleteSource(id)
  if (media.sourceId === id) media.sourceId = ''
  await loadSources()
}

export async function removeImported (entry) {
  if (!entry || !entry.rowId) return
  await deleteImportedFile(entry.rowId)
  media.entries = media.entries.filter((e) => e.id !== entry.id)
}

/* ── preview ──────────────────────────────────────────────────────── */

let audioEl = null
let audioUrl = ''
let midiTimers = []
let midiHeld = []
let midiTrack = null

export function stopFilePreview () {
  if (audioEl) {
    audioEl.pause()
    audioEl.src = ''
    audioEl = null
  }
  if (audioUrl) {
    URL.revokeObjectURL(audioUrl)
    audioUrl = ''
  }
  midiTimers.forEach(clearTimeout)
  midiTimers = []
  midiHeld.forEach((pitch) => previewNoteOff(midiTrack, pitch))
  midiHeld = []
  media.previewId = ''
}

function previewTrack () {
  const track = getSelectedTrack()
  if (track && track.type !== 'master' && track.type !== 'group' && track.type !== 'audio') return track
  return (session.tracks || []).find((t) => t && t.type === 'midi') || null
}

/** Toggle: tapping the playing file stops it. MIDI plays its first 12 seconds on the
 * selected instrument track. */
export async function previewEntry (entry) {
  if (media.previewId === entry.id) {
    stopFilePreview()
    return
  }
  stopFilePreview()
  media.previewId = entry.id
  try {
    const file = await entry.getFile()
    if (media.previewId !== entry.id) return
    if (entry.kind === 'audio') {
      audioUrl = URL.createObjectURL(file)
      audioEl = new Audio(audioUrl)
      audioEl.onended = () => { if (media.previewId === entry.id) stopFilePreview() }
      await audioEl.play()
      return
    }
    const track = previewTrack()
    if (!track) {
      showToast('Add an instrument track to hear MIDI files')
      stopFilePreview()
      return
    }
    const parsed = await parseMidiBlob(file)
    if (media.previewId !== entry.id) return
    midiTrack = track
    const secPerBeat = 60 / (session.bpm || 120)
    const limit = 12
    let last = 0
    for (const note of parsed.notes) {
      const at = note.start * secPerBeat
      if (at > limit) break
      const end = Math.min(limit, (note.start + note.duration) * secPerBeat)
      last = Math.max(last, end)
      midiTimers.push(setTimeout(() => {
        previewNoteOn(track, note.pitch, (note.velocity || 100) / 127)
        midiHeld.push(note.pitch)
      }, at * 1000))
      midiTimers.push(setTimeout(() => {
        previewNoteOff(track, note.pitch)
        midiHeld = midiHeld.filter((p) => p !== note.pitch)
      }, end * 1000))
    }
    midiTimers.push(setTimeout(() => { if (media.previewId === entry.id) stopFilePreview() }, last * 1000 + 200))
  } catch (err) {
    showToast(entry.kind === 'audio' ? 'This audio file cannot be played here' : 'This MIDI file cannot be read')
    stopFilePreview()
  }
}

/* ── drag into the arrangement ────────────────────────────────────── */

const targets = new Set()

/**
 * `target = { el, describe(clientX, clientY) -> label | '', drop(clientX, clientY, file) }`.
 * Returns an unregister function.
 */
export function registerMediaDropTarget (target) {
  targets.add(target)
  return () => targets.delete(target)
}

function targetAt (x, y) {
  for (const target of targets) {
    const el = target.el && (target.el.$el || target.el)
    if (!el || !el.getBoundingClientRect) continue
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return target
  }
  return null
}

let hovered = null

function leaveHovered () {
  if (hovered && hovered.leave) hovered.leave()
  hovered = null
}

export function startMediaDrag (entry, x, y) {
  stopFilePreview()
  media.drag = { entry, x, y, label: '', over: false }
}

export function moveMediaDrag (x, y) {
  if (!media.drag) return
  media.drag.x = x
  media.drag.y = y
  const target = targetAt(x, y)
  if (target !== hovered) leaveHovered()
  hovered = target
  media.drag.over = !!target
  media.drag.label = target && target.describe ? target.describe(x, y, media.drag.entry) : ''
}

export async function endMediaDrag (x, y) {
  const drag = media.drag
  media.drag = null
  leaveHovered()
  if (!drag) return false
  const target = targetAt(x, y)
  if (!target) return false
  try {
    const file = await drag.entry.getFile()
    await target.drop(x, y, file)
    return true
  } catch (err) {
    showToast('Could not add “' + drag.entry.name + '”')
    return false
  }
}

export function cancelMediaDrag () {
  media.drag = null
  leaveHovered()
}

/** The "+" on a row: add at the playhead on the selected track. */
export async function addEntryAtPlayhead (entry) {
  try {
    const file = await entry.getFile()
    await addClipFromFile(file, session.selectedTrack, session.positionBeats)
  } catch (err) {
    showToast('Could not add “' + entry.name + '”')
  }
}
