import assert from 'node:assert/strict'
import { parseMidiFile } from './midi-import.js'

function u32 (n) { return Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]) }
function u16 (n) { return Buffer.from([(n >>> 8) & 255, n & 255]) }
function varLen (n) {
  const b = []
  do { b.unshift(n & 127); n >>>= 7 } while (n > 0)
  for (let i = 0; i < b.length - 1; i++) b[i] |= 128
  return Buffer.from(b)
}

function buildMidi (tracks) {
  const chunks = tracks.map((track) => Buffer.concat([Buffer.from('MTrk'), u32(track.length), track]))
  const mthd = Buffer.concat([Buffer.from('MThd'), u32(6), u16(1), u16(tracks.length), u16(480)])
  return Buffer.concat([mthd, ...chunks])
}

// Simple type-0: one note C4
const t0 = Buffer.concat([
  varLen(0), Buffer.from([0x90, 60, 100]),
  varLen(480), Buffer.from([0x80, 60, 0]),
  varLen(0), Buffer.from([0xff, 0x2f, 0x00])
])
const mid0 = buildMidi([t0])
const p0 = parseMidiFile(mid0.buffer.slice(mid0.byteOffset, mid0.byteOffset + mid0.byteLength))
assert.equal(p0.notes.length, 1)
assert.equal(p0.notes[0].pitch, 60)

// Format-1 style: meta track + note track (tempo meta before notes)
const metaTrack = Buffer.concat([
  varLen(0), Buffer.from([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]),
  varLen(0), Buffer.from([0xff, 0x2f, 0x00])
])
const noteTrack = Buffer.concat([
  varLen(0), Buffer.from([0x90, 62, 90]),
  varLen(240), Buffer.from([0x90, 64, 90]),
  varLen(240), Buffer.from([0x80, 62, 0]),
  varLen(0), Buffer.from([0x80, 64, 0]),
  varLen(0), Buffer.from([0xff, 0x2f, 0x00])
])
const mid1 = buildMidi([metaTrack, noteTrack])
const p1 = parseMidiFile(mid1.buffer.slice(mid1.byteOffset, mid1.byteOffset + mid1.byteLength))
assert.equal(p1.notes.length, 2)
assert.deepEqual(p1.notes.map((n) => n.pitch), [62, 64])

// Track-name meta before the first note (FL Studio / format-1 exports).
const namedTrack = Buffer.concat([
  varLen(0), Buffer.from([0xff, 0x03, 0x05, 0x43, 0x65, 0x6c, 0x6c, 0x6f]),
  varLen(0), Buffer.from([0x90, 50, 88]),
  varLen(480), Buffer.from([0x80, 50, 0]),
  varLen(0), Buffer.from([0xff, 0x2f, 0x00])
])
const namedMidi = buildMidi([namedTrack])
const named = parseMidiFile(namedMidi.buffer.slice(namedMidi.byteOffset, namedMidi.byteOffset + namedMidi.byteLength))
assert.equal(named.notes.length, 1, 'track-name meta must not drop notes')
assert.equal(named.notes[0].pitch, 50)

// Different pitches => different content
const noteTrack2 = Buffer.concat([
  varLen(0), Buffer.from([0x90, 48, 80]),
  varLen(960), Buffer.from([0x80, 48, 0]),
  varLen(0), Buffer.from([0xff, 0x2f, 0x00])
])
const mid2 = buildMidi([noteTrack2])
const p2 = parseMidiFile(mid2.buffer.slice(mid2.byteOffset, mid2.byteOffset + mid2.byteLength))
assert.equal(p2.notes[0].pitch, 48)
assert.notDeepEqual(p1.notes.map((n) => n.pitch), p2.notes.map((n) => n.pitch))

console.log('midi-import.test.mjs OK')
