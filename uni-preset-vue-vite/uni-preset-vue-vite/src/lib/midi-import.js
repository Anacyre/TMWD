import { PPQ } from '../model/note-model.js'

function readStr (bytes, offset, len) {
  let out = ''
  for (let i = 0; i < len; i++) out += String.fromCharCode(bytes[offset + i] || 0)
  return out
}

function readU32 (bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0
}

function readU16 (bytes, offset) {
  return ((bytes[offset] << 8) | bytes[offset + 1]) >>> 0
}

function readVarLen (bytes, offset) {
  let value = 0
  let pos = offset
  while (pos < bytes.length) {
    const b = bytes[pos++]
    value = (value << 7) | (b & 0x7f)
    if ((b & 0x80) === 0) break
  }
  return { value, offset: pos }
}

function flushActive (active, notesOut, endTick, ppq) {
  active.forEach((on, key) => {
    const pitch = Number(key.split(':')[1])
    notesOut.push({
      pitch,
      startTick: on.startTick,
      durationTick: Math.max(PPQ / 4, endTick - on.startTick),
      velocity: on.velocity
    })
  })
  active.clear()
}

function parseTrackEvents (bytes, start, end, notesOut) {
  let pos = start
  let tick = 0
  let runningStatus = 0
  const active = new Map()

  while (pos < end) {
    const delta = readVarLen(bytes, pos)
    tick += delta.value
    pos = delta.offset
    if (pos >= end) break

    let status = bytes[pos]

    if (status >= 0xf0 && status <= 0xf7) {
      if (status === 0xf0 || status === 0xf7) {
        runningStatus = 0
        if (status === 0xf0) pos += 1
        const lenInfo = readVarLen(bytes, pos)
        pos = lenInfo.offset + lenInfo.value
        continue
      }
      runningStatus = 0
      if (status === 0xf2) pos += 3
      else if (status === 0xf1 || status === 0xf3) pos += 2
      else pos += 1
      continue
    }

    if (status >= 0xf8) {
      pos += 1
      continue
    }

    if (status >= 0x80) {
      runningStatus = status
      pos += 1
      status = runningStatus
    } else {
      status = runningStatus
      if (!status) break
    }

    const hi = status & 0xf0

    if (hi === 0x80 || hi === 0x90) {
      if (pos + 1 >= end) break
      const pitch = bytes[pos]
      const velocity = bytes[pos + 1]
      pos += 2
      const key = (status & 0x0f) + ':' + pitch
      if (hi === 0x90 && velocity > 0) {
        active.set(key, { startTick: tick, velocity })
      } else {
        const on = active.get(key)
        if (on) {
          notesOut.push({
            pitch,
            startTick: on.startTick,
            durationTick: Math.max(1, tick - on.startTick),
            velocity: on.velocity
          })
          active.delete(key)
        }
      }
      continue
    }

    if (status === 0xff) {
      if (pos >= end) break
      runningStatus = 0
      const meta = bytes[pos++]
      const lenInfo = readVarLen(bytes, pos)
      pos = lenInfo.offset
      const metaEnd = Math.min(end, pos + lenInfo.value)
      if (meta === 0x2f) {
        flushActive(active, notesOut, tick, PPQ)
        break
      }
      pos = metaEnd
      continue
    }

    if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) {
      pos = Math.min(end, pos + 2)
      continue
    }
    if (hi === 0xc0 || hi === 0xd0) {
      pos = Math.min(end, pos + 1)
      continue
    }

    pos += 1
  }

  flushActive(active, notesOut, tick + PPQ, PPQ)
}

/**
 * Parse a Standard MIDI File into clip-relative notes (beats from 0).
 * @returns {{ ppq: number, lengthBeats: number, notes: Array<{pitch:number,start:number,duration:number,velocity:number}> }}
 */
export function parseMidiFile (arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer || [])
  if (bytes.length < 14 || readStr(bytes, 0, 4) !== 'MThd') {
    throw new Error('Not a MIDI file')
  }

  const headerLen = readU32(bytes, 4)
  if (headerLen < 6 || 8 + headerLen > bytes.length) throw new Error('Invalid MIDI header')

  const trackCount = readU16(bytes, 10)
  const division = readU16(bytes, 12)
  let ppq = (division & 0x8000) ? 480 : division
  if (!ppq || ppq <= 0) ppq = 480

  let pos = 8 + headerLen
  const rawNotes = []

  for (let t = 0; t < trackCount && pos + 8 <= bytes.length; t++) {
    if (readStr(bytes, pos, 4) !== 'MTrk') break
    const len = readU32(bytes, pos + 4)
    const start = pos + 8
    const end = Math.min(bytes.length, start + len)
    parseTrackEvents(bytes, start, end, rawNotes)
    pos = start + len
  }

  if (!rawNotes.length) {
    return { ppq, lengthBeats: 4, notes: [] }
  }

  let minTick = Infinity
  let maxTick = 0
  rawNotes.forEach((note) => {
    minTick = Math.min(minTick, note.startTick)
    maxTick = Math.max(maxTick, note.startTick + note.durationTick)
  })

  const notes = rawNotes.map((note) => ({
    pitch: note.pitch,
    start: (note.startTick - minTick) / ppq,
    duration: Math.max(1 / PPQ, note.durationTick / ppq),
    velocity: note.velocity
  }))

  const lengthBeats = Math.max(1, Math.ceil(((maxTick - minTick) / ppq) * 4) / 4)

  return { ppq, lengthBeats, notes }
}

export async function parseMidiBlob (file) {
  const buffer = await file.arrayBuffer()
  return parseMidiFile(buffer.slice(0))
}
