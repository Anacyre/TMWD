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

/** A page or an error body must never be decoded or kept as a sample. */
export function isHtmlPayload (bytes) {
  if (!bytes || bytes.byteLength < 5) return false
  const head = new Uint8Array(bytes, 0, Math.min(32, bytes.byteLength))
  let text = ''
  for (let i = 0; i < head.length; i++) text += String.fromCharCode(head[i])
  return /^\s*</.test(text)
}

/** Ogg, WAV, FLAC and MP3. Anything else is a page, a JSON error, or an empty body. */
export function isAudioPayload (bytes) {
  if (!bytes || bytes.byteLength < 4) return false
  const head = new Uint8Array(bytes, 0, Math.min(12, bytes.byteLength))
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) return true
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46) return true
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) return true
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return true
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) return true
  return false
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
