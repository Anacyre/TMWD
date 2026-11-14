/** Bytes Safari must not be asked to decode with decodeAudioData.
 *
 * iPad's decoder rejects some Ogg Vorbis files and never settles on others. Waiting
 * on that call burns the note's deadline, so the wasm decoder never runs and the
 * instrument stays silent. MP3 and WAV still go through decodeAudioData.
 */
export function isOggPayload (bytes) {
  if (!bytes || bytes.byteLength < 4) return false
  const head = bytes instanceof Uint8Array
    ? bytes
    : new Uint8Array(bytes, 0, 4)
  return head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53
}

/** A loop WebKit will accept. loopEnd past the buffer throws, and a loop crushed
 * onto the final sample is not a sustain. */
export function safeLoopRange (loopStart, loopEnd, duration) {
  const dur = Number(duration) || 0
  if (!(dur > 0.4)) return null
  const end = Math.min(Number(loopEnd) || 0, dur - 0.001)
  const start = Math.max(0, Math.min(Number(loopStart) || 0, end))
  if (!(end - start > 0.4) || !(start < dur)) return null
  return { loopStart: start, loopEnd: end }
}

/** Offset for BufferSource.start. WebKit throws when it is past the buffer. */
export function playableOffset (offset, duration) {
  const from = Number(offset) || 0
  const dur = Number(duration) || 0
  if (from < dur - 0.03) return from
  return -1
}
