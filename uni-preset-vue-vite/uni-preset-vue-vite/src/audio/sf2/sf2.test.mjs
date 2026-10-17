import { parseSf2, selectSf2Zone, buildMinimalSf2, zoneFromBuffer } from './parse.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

{
  const buf = buildMinimalSf2({ name: 'Sine', rootKey: 60, frames: 48 })
  const parsed = parseSf2(buf)
  assert(parsed.zones.length >= 1, 'minimal SF2 parses at least one zone')
  assert(parsed.zones[0].pcm.length === 48, 'sample frames match the smpl chunk')
  assert(parsed.zones[0].rootKey === 60, 'overriding root key is 60')
  assert(parsed.zones[0].keyLo === 0 && parsed.zones[0].keyHi === 127, 'key range covers the keyboard')
  const zone = selectSf2Zone(parsed.zones, 64, 90)
  assert(zone && zone.pcm.length > 0, 'selectZone finds a playable region')
}

{
  const pcm = new Float32Array([0, 0.5, -0.5, 0])
  const zone = zoneFromBuffer(pcm, { name: 'hit', rootKey: 48, sampleRate: 22050 })
  assert(zone.rootKey === 48 && zone.pcm.length === 4, 'dropped WAV becomes a single zone')
  assert(selectSf2Zone([zone], 60, 100) === zone, 'a full-range zone answers every key')
}

console.log('sf2 ok')
