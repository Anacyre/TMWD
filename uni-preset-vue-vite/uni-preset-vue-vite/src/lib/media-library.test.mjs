import assert from 'node:assert/strict'
import {
  mediaKind,
  baseName,
  formatSize,
  walkDirectory,
  entriesFromFileList,
  listDir,
  searchEntries,
  breadcrumb,
  listSources,
  putSource,
  deleteSource,
  listImportedFiles,
  putImportedFile,
  deleteImportedFile,
  importedEntry,
  resetMediaMemory
} from './media-library.js'

function file (name) {
  return { kind: 'file', name, getFile: async () => ({ name }) }
}
function dir (name, children) {
  return {
    kind: 'directory',
    name,
    async * values () { for (const c of children) yield c }
  }
}

assert.equal(mediaKind('Kick.WAV'), 'audio')
assert.equal(mediaKind('song.mid'), 'midi')
assert.equal(mediaKind('song.midi'), 'midi')
assert.equal(mediaKind('notes.txt'), '')
assert.equal(mediaKind('noext'), '')
assert.equal(baseName('Loop 01.flac'), 'Loop 01')
assert.equal(formatSize(512), '512 B')
assert.equal(formatSize(2048), '2 KB')
assert.equal(formatSize(3 * 1024 * 1024), '3.0 MB')

const root = dir('Samples', [
  file('readme.txt'),
  file('.hidden.wav'),
  file('Pad.wav'),
  dir('Drums', [file('Kick 2.wav'), file('Kick 10.wav'), dir('Fills', [file('fill.mid')])]),
  dir('.git', [file('x.wav')]),
  dir('Keys', [file('chords.mid')])
])

const walked = await walkDirectory(root, { sourceId: 'f1' })
assert.equal(walked.truncated, false)
assert.deepEqual(walked.entries.map((e) => e.id).sort(), [
  'f1:Drums/Fills/fill.mid',
  'f1:Drums/Kick 10.wav',
  'f1:Drums/Kick 2.wav',
  'f1:Keys/chords.mid',
  'f1:Pad.wav'
])
const fill = walked.entries.find((e) => e.name === 'fill.mid')
assert.equal(fill.kind, 'midi')
assert.equal(fill.dir, 'Drums/Fills')
assert.equal((await fill.getFile()).name, 'fill.mid')

const capped = await walkDirectory(root, { sourceId: 'f1', maxEntries: 2 })
assert.equal(capped.entries.length, 2)
assert.equal(capped.truncated, true)
const shallow = await walkDirectory(root, { sourceId: 'f1', maxDepth: 0 })
assert.deepEqual(shallow.entries.map((e) => e.name), ['Pad.wav'])

const top = listDir(walked.entries, '')
assert.deepEqual(top.folders.map((f) => [f.name, f.count]), [['Drums', 3], ['Keys', 1]])
assert.deepEqual(top.files.map((f) => f.name), ['Pad.wav'])
const drums = listDir(walked.entries, 'Drums')
assert.deepEqual(drums.folders.map((f) => f.path), ['Drums/Fills'])
assert.deepEqual(drums.files.map((f) => f.name), ['Kick 2.wav', 'Kick 10.wav'], 'numeric sort')

assert.deepEqual(searchEntries(walked.entries, 'kick', 'all').length, 2)
assert.deepEqual(searchEntries(walked.entries, 'fills', 'all').map((e) => e.name), ['fill.mid'], 'matches folder path')
assert.deepEqual(searchEntries(walked.entries, '', 'midi').map((e) => e.name).sort(), ['chords.mid', 'fill.mid'])

assert.deepEqual(breadcrumb('Drums/Fills'), [{ name: 'Drums', path: 'Drums' }, { name: 'Fills', path: 'Drums/Fills' }])
assert.deepEqual(breadcrumb(''), [])

const listed = entriesFromFileList([
  { name: 'a.wav', webkitRelativePath: 'Lib/a.wav', size: 10 },
  { name: 'b.mid', webkitRelativePath: 'Lib/Sub/b.mid', size: 5 },
  { name: 'c.pdf', webkitRelativePath: 'Lib/c.pdf', size: 5 }
], 's1')
assert.deepEqual(listed.map((e) => [e.name, e.dir, e.kind]), [['a.wav', '', 'audio'], ['b.mid', 'Sub', 'midi']])

resetMediaMemory()
await putSource({ id: 'b', name: 'B', addedAt: 2 })
await putSource({ id: 'a', name: 'A', addedAt: 1 })
assert.deepEqual((await listSources()).map((s) => s.id), ['a', 'b'])
await deleteSource('a')
assert.deepEqual((await listSources()).map((s) => s.id), ['b'])

await putImportedFile({ id: 'i1', name: 'Snare.wav', size: 3, blob: new Blob(['x']) })
const rows = await listImportedFiles()
assert.equal(rows.length, 1)
const entry = importedEntry(rows[0])
assert.equal(entry.kind, 'audio')
assert.equal(entry.rowId, 'i1')
assert.equal((await entry.getFile()).name, 'Snare.wav')
await deleteImportedFile('i1')
assert.equal((await listImportedFiles()).length, 0)

console.log('media-library tests passed')
