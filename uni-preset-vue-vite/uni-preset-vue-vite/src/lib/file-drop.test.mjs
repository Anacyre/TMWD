import assert from 'node:assert/strict'
import { isFileDrag, filesFromDrop } from './file-drop.js'

function dragEvent (patch = {}) {
  return {
    dataTransfer: {
      types: [],
      files: [],
      effectAllowed: 'uninitialized',
      dropEffect: 'none',
      ...patch
    }
  }
}

assert.equal(isFileDrag(dragEvent({ types: ['Files'], effectAllowed: 'copy' })), true)
assert.equal(isFileDrag(dragEvent({ types: ['files'], effectAllowed: 'copy' })), true)
assert.equal(isFileDrag(dragEvent({ types: ['application/x-moz-file'] })), true)
assert.equal(isFileDrag(dragEvent({ effectAllowed: 'copy' })), true)
assert.equal(isFileDrag(dragEvent({ effectAllowed: 'copyMove' })), true)
assert.equal(isFileDrag(dragEvent({ types: ['text/plain'] })), false)
assert.equal(isFileDrag(dragEvent({ files: [{ name: 'a.mid' }] })), true)

const dropped = filesFromDrop({
  dataTransfer: { files: [{ name: 'test.mid' }] }
})
assert.equal(dropped.length, 1)
assert.equal(dropped[0].name, 'test.mid')

console.log('file-drop.test.mjs OK')
