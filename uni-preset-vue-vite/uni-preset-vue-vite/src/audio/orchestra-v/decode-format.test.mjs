import assert from 'node:assert/strict'
import { isOggPayload, playableOffset, safeLoopRange } from './decode-format.js'

{
  const ogg = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 0])
  const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46])
  assert.equal(isOggPayload(ogg), true)
  assert.equal(isOggPayload(ogg.buffer), true)
  assert.equal(isOggPayload(wav), false)
  assert.equal(isOggPayload(new Uint8Array([0x4f, 0x67])), false)
}

{
  const loop = safeLoopRange(1.12, 2.16, 2.2)
  assert.ok(loop && loop.loopEnd < 2.2 && loop.loopEnd - loop.loopStart > 0.4)

  // The published sustain sits in the second half. A buffer that only kept the
  // first half must not enable a loop crushed onto its last sample.
  assert.equal(safeLoopRange(1.12, 2.16, 1.1), null)
  assert.equal(safeLoopRange(0.35, 0.97, 1.01) != null, true)
  assert.equal(safeLoopRange(0, 2.5, 2.2).loopEnd < 2.2, true)
}

{
  assert.equal(playableOffset(0, 2), 0)
  assert.equal(playableOffset(1.9, 2), 1.9)
  assert.equal(playableOffset(2, 2), -1)
  assert.equal(playableOffset(4, 2), -1)
}

console.log('decode-format ok')
