/** Minimal SoundFont 2 parser: RIFF → pdta (phdr/pbag/pgen/inst/ibag/igen/shdr) + sdta/smpl.
 * Generators we honour: key/vel range, root key, loop, attenuation, pan, tune, volume ADSR. */

const GEN = {
  startAddrsOffset: 0,
  endAddrsOffset: 1,
  startloopAddrsOffset: 2,
  endloopAddrsOffset: 3,
  startAddrsCoarseOffset: 4,
  modLfoToPitch: 5,
  pan: 17,
  delayVolEnv: 33,
  attackVolEnv: 34,
  holdVolEnv: 35,
  decayVolEnv: 36,
  sustainVolEnv: 37,
  releaseVolEnv: 38,
  instrument: 41,
  keyRange: 43,
  velRange: 44,
  startloopAddrsCoarseOffset: 45,
  keynum: 46,
  velocity: 47,
  initialAttenuation: 48,
  endloopAddrsCoarseOffset: 50,
  coarseTune: 51,
  fineTune: 52,
  sampleID: 53,
  sampleModes: 54,
  overridingRootKey: 58,
  endOper: 60
}

function u16 (view, offset) { return view.getUint16(offset, true) }
function i16 (view, offset) { return view.getInt16(offset, true) }
function u32 (view, offset) { return view.getUint32(offset, true) }

function cstr (bytes, start, len) {
  let out = ''
  for (let i = 0; i < len; i++) {
    const c = bytes[start + i]
    if (!c) break
    out += String.fromCharCode(c)
  }
  return out.trim()
}

function fourcc (bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3])
}

function readChunks (buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (fourcc(bytes, 0) !== 'RIFF' || fourcc(bytes, 8) !== 'sfbk') {
    throw new Error('Not a SoundFont (sfbk) file')
  }
  const chunks = {}
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const id = fourcc(bytes, offset)
    const size = u32(view, offset + 4)
    const start = offset + 8
    if (id === 'LIST') {
      const list = fourcc(bytes, start)
      let inner = start + 4
      const end = start + size
      while (inner + 8 <= end) {
        const sid = fourcc(bytes, inner)
        const ssize = u32(view, inner + 4)
        chunks[list + '/' + sid] = { offset: inner + 8, size: ssize }
        inner += 8 + ssize + (ssize & 1)
      }
    } else {
      chunks[id] = { offset: start, size }
    }
    offset += 8 + size + (size & 1)
  }
  return { bytes, view, chunks }
}

function timecentsToSec (tc) {
  if (tc <= -32768 || tc <= -12000) return 0
  return Math.pow(2, tc / 1200)
}

function attenuationToGain (cb) {
  const n = Number(cb) || 0
  return Math.pow(10, -Math.max(0, n) / 200)
}

function parseRange (amount) {
  return { lo: amount & 0xff, hi: (amount >> 8) & 0xff }
}

function parseGens (view, offset, count) {
  const gens = []
  for (let i = 0; i < count; i++) {
    const op = u16(view, offset + i * 4)
    const amount = i16(view, offset + i * 4 + 2)
    gens.push({ op, amount: amount & 0xffff, signed: amount })
  }
  return gens
}

function applyGens (target, gens) {
  gens.forEach((gen) => {
    const op = gen.op
    const amount = gen.amount
    const signed = gen.signed
    if (op === GEN.keyRange) {
      const r = parseRange(amount)
      target.keyLo = r.lo
      target.keyHi = r.hi
    } else if (op === GEN.velRange) {
      const r = parseRange(amount)
      target.velLo = r.lo
      target.velHi = r.hi
    } else if (op === GEN.overridingRootKey && amount >= 0 && amount <= 127) {
      target.rootKey = amount
    } else if (op === GEN.instrument) {
      target.instrumentIndex = amount
    } else if (op === GEN.sampleID) {
      target.sampleIndex = amount
    } else if (op === GEN.sampleModes) {
      target.loop = (amount & 1) === 1
    } else if (op === GEN.initialAttenuation) {
      target.attenuation = signed
    } else if (op === GEN.pan) {
      target.pan = Math.max(-1, Math.min(1, signed / 500))
    } else if (op === GEN.coarseTune) {
      target.coarseTune = signed
    } else if (op === GEN.fineTune) {
      target.fineTune = signed
    } else if (op === GEN.attackVolEnv) {
      target.attack = timecentsToSec(signed)
    } else if (op === GEN.holdVolEnv) {
      target.hold = timecentsToSec(signed)
    } else if (op === GEN.decayVolEnv) {
      target.decay = timecentsToSec(signed)
    } else if (op === GEN.sustainVolEnv) {
      target.sustain = Math.max(0, Math.min(1, 1 - signed / 1000))
    } else if (op === GEN.releaseVolEnv) {
      target.release = timecentsToSec(signed)
    } else if (op === GEN.startAddrsOffset) {
      target.startOff = (target.startOff || 0) + signed
    } else if (op === GEN.endAddrsOffset) {
      target.endOff = (target.endOff || 0) + signed
    } else if (op === GEN.startloopAddrsOffset) {
      target.loopStartOff = (target.loopStartOff || 0) + signed
    } else if (op === GEN.endloopAddrsOffset) {
      target.loopEndOff = (target.loopEndOff || 0) + signed
    } else if (op === GEN.startAddrsCoarseOffset) {
      target.startOff = (target.startOff || 0) + signed * 32768
    } else if (op === GEN.endAddrsCoarseOffset) {
      target.endOff = (target.endOff || 0) + signed * 32768
    }
  })
  return target
}

function readPhdr (view, bytes, chunk) {
  const n = Math.floor(chunk.size / 38)
  const list = []
  for (let i = 0; i < n; i++) {
    const o = chunk.offset + i * 38
    list.push({
      name: cstr(bytes, o, 20),
      preset: u16(view, o + 20),
      bank: u16(view, o + 22),
      bagIndex: u16(view, o + 24)
    })
  }
  return list
}

function readBags (view, chunk) {
  const n = Math.floor(chunk.size / 4)
  const list = []
  for (let i = 0; i < n; i++) {
    list.push({ genIndex: u16(view, chunk.offset + i * 4), modIndex: u16(view, chunk.offset + i * 4 + 2) })
  }
  return list
}

function readInst (view, bytes, chunk) {
  const n = Math.floor(chunk.size / 22)
  const list = []
  for (let i = 0; i < n; i++) {
    const o = chunk.offset + i * 22
    list.push({ name: cstr(bytes, o, 20), bagIndex: u16(view, o + 20) })
  }
  return list
}

function readShdr (view, bytes, chunk) {
  const n = Math.floor(chunk.size / 46)
  const list = []
  for (let i = 0; i < n; i++) {
    const o = chunk.offset + i * 46
    list.push({
      name: cstr(bytes, o, 20),
      start: u32(view, o + 20),
      end: u32(view, o + 24),
      loopStart: u32(view, o + 28),
      loopEnd: u32(view, o + 32),
      sampleRate: u32(view, o + 36),
      originalPitch: bytes[o + 40],
      pitchCorrection: (bytes[o + 41] << 24) >> 24,
      sampleLink: u16(view, o + 42),
      sampleType: u16(view, o + 44)
    })
  }
  return list
}

function bagSlice (bags, index, nextIndex, gens) {
  const start = bags[index] && bags[index].genIndex
  const end = bags[nextIndex] ? bags[nextIndex].genIndex : gens.length
  if (start == null) return []
  return gens.slice(start, end)
}

function readPcm16 (view, offset, count) {
  const samples = new Float32Array(count)
  for (let i = 0; i < count; i++) samples[i] = view.getInt16(offset + i * 2, true) / 32768
  return samples
}

export function parseSf2 (buffer) {
  const { bytes, view, chunks } = readChunks(buffer)
  const phdr = readPhdr(view, bytes, chunks['pdta/phdr'] || { offset: 0, size: 0 })
  const pbag = readBags(view, chunks['pdta/pbag'] || { offset: 0, size: 0 })
  const pgen = parseGens(view, (chunks['pdta/pgen'] || {}).offset || 0, Math.floor(((chunks['pdta/pgen'] || {}).size || 0) / 4))
  const inst = readInst(view, bytes, chunks['pdta/inst'] || { offset: 0, size: 0 })
  const ibag = readBags(view, chunks['pdta/ibag'] || { offset: 0, size: 0 })
  const igen = parseGens(view, (chunks['pdta/igen'] || {}).offset || 0, Math.floor(((chunks['pdta/igen'] || {}).size || 0) / 4))
  const shdr = readShdr(view, bytes, chunks['pdta/shdr'] || { offset: 0, size: 0 })
  const smpl = chunks['sdta/smpl'] || chunks.smpl

  const instruments = inst.slice(0, Math.max(0, inst.length - 1)).map((item, i) => {
    const next = inst[i + 1]
    const bags = []
    for (let b = item.bagIndex; b < next.bagIndex; b++) bags.push(bagSlice(ibag, b, b + 1, igen))
    return { name: item.name, bags }
  })

  const presets = phdr.slice(0, Math.max(0, phdr.length - 1)).map((item, i) => {
    const next = phdr[i + 1]
    const bags = []
    for (let b = item.bagIndex; b < next.bagIndex; b++) bags.push(bagSlice(pbag, b, b + 1, pgen))
    return { name: item.name, preset: item.preset, bank: item.bank, bags }
  })

  const zones = []
  presets.forEach((preset) => {
    let pglob = { keyLo: 0, keyHi: 127, velLo: 0, velHi: 127, attenuation: 0, pan: 0, coarseTune: 0, fineTune: 0, attack: 0.005, hold: 0, decay: 0.2, sustain: 0.7, release: 0.3 }
    preset.bags.forEach((gens) => {
      const pg = applyGens({ ...pglob }, gens)
      if (pg.instrumentIndex == null) {
        pglob = pg
        return
      }
      const instrument = instruments[pg.instrumentIndex]
      if (!instrument) return
      let iglob = {}
      instrument.bags.forEach((igens) => {
        const ig = applyGens({ ...iglob }, igens)
        if (ig.sampleIndex == null) {
          iglob = ig
          return
        }
        const sample = shdr[ig.sampleIndex]
        if (!sample || (sample.sampleType & 0x8000)) return
        const start = sample.start + (ig.startOff || 0) + (pg.startOff || 0)
        const end = sample.end + (ig.endOff || 0) + (pg.endOff || 0)
        const loopStart = sample.loopStart + (ig.loopStartOff || 0)
        const loopEnd = sample.loopEnd + (ig.loopEndOff || 0)
        const pcm = smpl ? readPcm16(view, smpl.offset + start * 2, Math.max(0, end - start)) : new Float32Array(0)
        zones.push({
          preset: preset.name,
          bank: preset.bank,
          program: preset.preset,
          instrument: instrument.name,
          sample: sample.name,
          keyLo: ig.keyLo != null ? ig.keyLo : (pg.keyLo != null ? pg.keyLo : 0),
          keyHi: ig.keyHi != null ? ig.keyHi : (pg.keyHi != null ? pg.keyHi : 127),
          velLo: ig.velLo != null ? ig.velLo : (pg.velLo != null ? pg.velLo : 0),
          velHi: ig.velHi != null ? ig.velHi : (pg.velHi != null ? pg.velHi : 127),
          rootKey: ig.rootKey != null ? ig.rootKey : sample.originalPitch,
          loop: ig.loop === true && loopEnd > loopStart + 8,
          loopStart: Math.max(0, loopStart - start),
          loopEnd: Math.max(0, loopEnd - start),
          sampleRate: sample.sampleRate || 44100,
          gain: attenuationToGain((ig.attenuation || 0) + (pg.attenuation || 0)),
          pan: ig.pan != null ? ig.pan : (pg.pan || 0),
          coarseTune: (ig.coarseTune || 0) + (pg.coarseTune || 0),
          fineTune: (ig.fineTune || 0) + (pg.fineTune || 0) + (sample.pitchCorrection || 0),
          attack: ig.attack != null ? ig.attack : (pg.attack || 0.005),
          hold: ig.hold != null ? ig.hold : (pg.hold || 0),
          decay: ig.decay != null ? ig.decay : (pg.decay || 0.2),
          sustain: ig.sustain != null ? ig.sustain : (pg.sustain != null ? pg.sustain : 0.7),
          release: ig.release != null ? ig.release : (pg.release || 0.3),
          pcm
        })
      })
    })
  })

  return {
    name: (phdr[0] && phdr[0].name) || 'SoundFont',
    presets: presets.map((p) => ({ name: p.name, bank: p.bank, program: p.preset })),
    zones
  }
}

export function zoneFromBuffer (pcm, options = {}) {
  const data = pcm instanceof Float32Array ? pcm : new Float32Array(pcm || [])
  return {
    preset: options.name || 'Sample',
    bank: 0,
    program: 0,
    instrument: options.name || 'Sample',
    sample: options.name || 'sample',
    keyLo: 0,
    keyHi: 127,
    velLo: 0,
    velHi: 127,
    rootKey: options.rootKey == null ? 60 : options.rootKey,
    loop: false,
    loopStart: 0,
    loopEnd: 0,
    sampleRate: options.sampleRate || 44100,
    gain: 1,
    pan: 0,
    coarseTune: 0,
    fineTune: 0,
    attack: 0.005,
    hold: 0,
    decay: 0.12,
    sustain: 0.85,
    release: 0.18,
    pcm: data
  }
}

export function selectSf2Zone (zones, pitch, velocityMidi = 100) {
  const vel = Math.max(0, Math.min(127, Math.round(velocityMidi)))
  const key = Math.max(0, Math.min(127, Math.round(pitch)))
  const hits = (zones || []).filter((z) => key >= z.keyLo && key <= z.keyHi && vel >= z.velLo && vel <= z.velHi && z.pcm && z.pcm.length)
  if (!hits.length) return null
  hits.sort((a, b) => (a.keyHi - a.keyLo) - (b.keyHi - b.keyLo))
  return hits[0]
}

function padName (name, len) {
  const out = new Uint8Array(len)
  const text = String(name || '')
  for (let i = 0; i < Math.min(len, text.length); i++) out[i] = text.charCodeAt(i)
  return out
}

function writeStr (view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i))
}

/** Tiny valid SF2 used by tests: one looping sine-ish sample, one preset, one instrument. */
export function buildMinimalSf2 (options = {}) {
  const frames = options.frames || 64
  const pcm = new Int16Array(frames)
  for (let i = 0; i < frames; i++) pcm[i] = Math.round(Math.sin(i / frames * Math.PI * 2) * 16000)
  const smplBytes = pcm.byteLength
  const shdrCount = 2
  const shdrSize = shdrCount * 46
  const igenCount = 8
  const pgenCount = 3
  const pdta = 4 +
    8 + 38 * 2 +
    8 + 4 * 2 +
    8 + 4 * pgenCount +
    8 + 22 * 2 +
    8 + 4 * 2 +
    8 + 4 * igenCount +
    8 + shdrSize
  const sdta = 4 + 8 + smplBytes
  const riffSize = 4 + 8 + sdta + 8 + pdta
  const buffer = new ArrayBuffer(12 + riffSize - 4)
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  writeStr(view, 0, 'RIFF')
  view.setUint32(4, riffSize, true)
  writeStr(view, 8, 'sfbk')
  let o = 12
  writeStr(view, o, 'LIST'); o += 4
  view.setUint32(o, sdta, true); o += 4
  writeStr(view, o, 'sdta'); o += 4
  writeStr(view, o, 'smpl'); o += 4
  view.setUint32(o, smplBytes, true); o += 4
  new Uint8Array(buffer, o, smplBytes).set(new Uint8Array(pcm.buffer))
  o += smplBytes
  writeStr(view, o, 'LIST'); o += 4
  view.setUint32(o, pdta, true); o += 4
  writeStr(view, o, 'pdta'); o += 4

  function chunk (id, size, fill) {
    writeStr(view, o, id); o += 4
    view.setUint32(o, size, true); o += 4
    fill(o)
    o += size
  }

  chunk('phdr', 38 * 2, (base) => {
    bytes.set(padName(options.name || 'Sine', 20), base)
    view.setUint16(base + 20, 0, true)
    view.setUint16(base + 22, 0, true)
    view.setUint16(base + 24, 0, true)
    bytes.set(padName('EOP', 20), base + 38)
    view.setUint16(base + 38 + 24, 1, true)
  })
  chunk('pbag', 8, (base) => {
    view.setUint16(base, 0, true)
    view.setUint16(base + 4, 2, true)
  })
  chunk('pgen', 4 * pgenCount, (base) => {
    view.setUint16(base, GEN.instrument, true)
    view.setUint16(base + 2, 0, true)
    view.setUint16(base + 4, GEN.endOper, true)
    view.setUint16(base + 8, GEN.endOper, true)
  })
  chunk('inst', 44, (base) => {
    bytes.set(padName('Tone', 20), base)
    view.setUint16(base + 20, 0, true)
    bytes.set(padName('EOI', 20), base + 22)
    view.setUint16(base + 42, 1, true)
  })
  chunk('ibag', 8, (base) => {
    view.setUint16(base, 0, true)
    view.setUint16(base + 4, 7, true)
  })
  chunk('igen', 4 * igenCount, (base) => {
    const gens = [
      [GEN.keyRange, 0 | (127 << 8)],
      [GEN.velRange, 0 | (127 << 8)],
      [GEN.overridingRootKey, options.rootKey == null ? 60 : options.rootKey],
      [GEN.sampleModes, 1],
      [GEN.initialAttenuation, 0],
      [GEN.sampleID, 0],
      [GEN.endOper, 0]
    ]
    gens.forEach((g, i) => {
      view.setUint16(base + i * 4, g[0], true)
      view.setUint16(base + i * 4 + 2, g[1], true)
    })
  })
  chunk('shdr', shdrSize, (base) => {
    bytes.set(padName('sine', 20), base)
    view.setUint32(base + 20, 0, true)
    view.setUint32(base + 24, frames, true)
    view.setUint32(base + 28, 0, true)
    view.setUint32(base + 32, frames, true)
    view.setUint32(base + 36, options.sampleRate || 44100, true)
    bytes[base + 40] = options.rootKey == null ? 60 : options.rootKey
    bytes.set(padName('EOS', 20), base + 46)
  })
  return buffer
}
