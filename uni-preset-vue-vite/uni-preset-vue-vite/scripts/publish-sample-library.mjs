/**
 * Build and publish an Orchestra V sample library.
 *
 * Reads a folder tree laid out as `<Group>/<Instrument>/<Instrument Articulation>/*.wav`,
 * works out what each file is from its name, encodes it to OGG Vorbis, writes the manifest
 * the browser engine reads, and uploads everything to the library's Supabase bucket.
 *
 * The libraries this targets record one chromatic file per note where the file holds a
 * fixed-length body followed by its own release tail (see SAMPLE_SPEC). That is why the
 * manifest carries `mainSec`: the engine plays the body, loops inside it while a key is
 * held, and crossfades into the tail on release.
 *
 * Usage
 *   node scripts/publish-sample-library.mjs --library=vms-symphonic
 *   node scripts/publish-sample-library.mjs --library=vms-symphonic --upload
 *
 * Flags
 *   --library=<id>   which library in src/audio/orchestra-v/libraries.js to build
 *   --root=<path>    override the source folder
 *   --upload         also push samples and manifest to the bucket
 *   --quality=<n>    libvorbis -qscale:a, default 5
 *   --only=<text>    restrict to packs whose name contains this
 *   --force          re-encode even when a cached OGG is newer than its source
 *
 * Uploading needs a key that may write to storage; the anon key is read-only there:
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "..."
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findLoopPoints } from '../src/audio/m-orchestra/pick.js'
import { playbackFrom } from '../src/audio/m-orchestra/playback.js'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')

// --- library definitions -------------------------------------------------------------

/** Total/body split for the recording conventions we know about. Add a row when a library
 * ships a new take length; anything unmatched falls back to two thirds body and is logged. */
const SAMPLE_SPEC = [
  { totalSec: 6, mainSec: 4 },
  { totalSec: 2, mainSec: 1 }
]

const LIBRARY_TARGETS = {
  'vms-symphonic': {
    bucket: 'vms-symphonic',
    displayName: 'VMS Symphonic Orchestra',
    defaultRoot: 'D:\\FL Plugin\\Sample library\\Xvert Sounds - Virtual Modelling Symphonic Orchestra',
    manifestOut: join(appRoot, 'src', 'audio', 'orchestra-v', 'vms-symphonic-manifest.json'),
    /**
     * Octave numbers in these filenames run from C0 = MIDI 0, so `_C5_` is middle C. The
     * giveaway is 1st Violins starting at `G4`, which lands on MIDI 55 — the violin's open
     * G string.
     */
    midiOffset: 0,
    playback: {
      // One chromatic sample per semitone, so the only stretching is across the two notes
      // the library ships empty.
      maxStretchSemitones: 2,
      dynamicsVelocityMix: 0.35,
      minCrossfadeMs: 120,
      // Fractions of the body, not of the whole file: the loop search only ever sees the
      // part before the release tail.
      loopSearchStart: 0.15,
      loopSearchEnd: 0.99,
      loopWindowSec: 1.8,
      minLoopSec: 1.0,
      maxLoopSec: 2.6,
      minLoopCorrelation: 0.28,
      releaseLongSec: 0.55,
      releaseShortSec: 0.12,
      releaseHitSec: 0.08,
      cutoffMinHz: 8000,
      cutoffSpanHz: 11000,
      vibratoDepthSemis: 0.10,
      vibratoGate: 0.12
    }
  }
}

// --- arguments -----------------------------------------------------------------------

function flag (name, fallback = null) {
  const hit = process.argv.find((arg) => arg.startsWith('--' + name + '='))
  return hit ? hit.slice(name.length + 3) : fallback
}

const libraryId = flag('library', 'vms-symphonic')
const target = LIBRARY_TARGETS[libraryId]
if (!target) throw new Error('unknown library: ' + libraryId + ' (known: ' + Object.keys(LIBRARY_TARGETS).join(', ') + ')')

const sampleRoot = flag('root', process.env.DAWWEB_LIBRARY_ROOT || target.defaultRoot)
const upload = process.argv.includes('--upload')
const force = process.argv.includes('--force')
const quality = Number(flag('quality', '5'))
const only = (flag('only', '') || '').toLowerCase()
const cacheDir = join(appRoot, '.sample-cache', libraryId)
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://igfixjydwobvukwfxveq.supabase.co'
const writeKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.DAWWEB_SUPABASE_KEY || ''
const encodeConcurrency = Math.max(1, Math.min(8, availableParallelism ? availableParallelism() : 4))
const uploadConcurrency = Math.max(1, Number(process.env.DAWWEB_UPLOAD_CONCURRENCY) || 6)

// --- note names ----------------------------------------------------------------------

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** `Horns Long_A#2_127.wav` -> { midi, velocity }. Returns null when the name does not fit. */
function parseName (fileName, midiOffset) {
  const stem = fileName.replace(/\.[^.]+$/, '')
  const match = /_([A-G])(#|b)?(-?\d+)(?:_(\d+))?$/.exec(stem)
  if (!match) return null
  let semitone = SEMITONE[match[1]]
  if (semitone == null) return null
  if (match[2] === '#') semitone += 1
  else if (match[2] === 'b') semitone -= 1
  const midi = semitone + 12 * parseInt(match[3], 10) + midiOffset
  if (!Number.isFinite(midi) || midi < 0 || midi > 127) return null
  return { midi, velocity: match[4] ? parseInt(match[4], 10) : 127 }
}

/** The leaf folder names the articulation: "1st Violins Spiccato" -> short. */
function classifyArticulation (leafFolder, packName) {
  const tail = String(leafFolder || '').toLowerCase().replace(String(packName || '').toLowerCase(), '').trim()
  if (tail.includes('pizz')) return 'pluck'
  if (tail.includes('spicc') || tail.includes('stacc') || tail.includes('marcato')) return 'short'
  if (tail.includes('trem')) return 'sustain'
  if (tail.includes('long') || tail.includes('sustain') || tail.includes('legato')) return 'long'
  // A folder that just repeats the instrument name (Piano/Piano) is the plain sustained take.
  return 'long'
}

/**
 * Object names a URL can survive.
 *
 * `A#4` is the one that bites: `#` starts a fragment, and neither `encodeURI` nor the
 * Supabase client's `getPublicUrl` escapes it, so both the upload and the later fetch would
 * silently truncate the name at the sharp and collapse five notes an octave onto one object.
 * Spelling it `As4` keeps the path readable and keeps every note distinct; the real pitch
 * travels in the manifest's `rootNote`, so nothing downstream reads the filename.
 */
function objectSafe (name) {
  return String(name)
    .replace(/#/g, 's')
    // Nothing in this library hits these, but they are the rest of the set that changes
    // meaning in a URL path, and a future pack should not be able to reintroduce the bug.
    .replace(/[?%&+]/g, '_')
}

// --- wav reading ---------------------------------------------------------------------

function decodeWav (buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return null
  }
  let offset = 12
  let channels = 1
  let sampleRate = 44100
  let bits = 16
  let float = false
  let dataOffset = 0
  let dataBytes = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const start = offset + 8
    if (id === 'fmt ') {
      float = buffer.readUInt16LE(start) === 3
      channels = buffer.readUInt16LE(start + 2)
      sampleRate = buffer.readUInt32LE(start + 4)
      bits = buffer.readUInt16LE(start + 14)
    } else if (id === 'data') {
      dataOffset = start
      dataBytes = Math.min(size, Math.max(0, buffer.length - start))
      break
    }
    offset = start + size + (size % 2)
  }
  if (!dataBytes || !channels) return null
  const frameBytes = channels * Math.max(1, bits / 8)
  const frames = Math.floor(dataBytes / frameBytes)
  if (frames < 1) return null
  const mono = new Float32Array(frames)
  for (let i = 0; i < frames; i++) {
    let sum = 0
    for (let c = 0; c < channels; c++) {
      const p = dataOffset + i * frameBytes + c * (bits / 8)
      if (float && bits === 32) sum += buffer.readFloatLE(p)
      else if (bits === 16) sum += buffer.readInt16LE(p) / 32768
      else if (bits === 24) {
        let v = buffer[p] | (buffer[p + 1] << 8) | (buffer[p + 2] << 16)
        if (v & 0x800000) v -= 0x1000000
        sum += v / 8388608
      } else if (bits === 32) sum += buffer.readInt32LE(p) / 2147483648
      else return null
    }
    mono[i] = sum / channels
  }
  return { mono, sampleRate, channels, bits, frames, durationSec: frames / sampleRate }
}

function rms (data, from, to) {
  const lo = Math.max(0, Math.floor(from))
  const hi = Math.min(data.length, Math.ceil(to))
  if (hi <= lo) return 0
  let sum = 0
  for (let i = lo; i < hi; i++) sum += data[i] * data[i]
  return Math.sqrt(sum / (hi - lo))
}

/**
 * How much the body fades on its own, in dB from its first third to its last. A piano is
 * strongly negative because it decays from the moment it is struck; a bowed or blown note
 * sits near zero because the player holds it. Measuring this beats matching instrument
 * names, so a new library needs no special casing.
 */
function bodyDecayDb (mono, sampleRate, mainSec) {
  const main = Math.min(mono.length, Math.round(mainSec * sampleRate))
  const attack = Math.round(0.15 * sampleRate)
  const third = Math.floor((main - attack) / 3)
  if (third < sampleRate * 0.1) return 0
  const head = rms(mono, attack, attack + third)
  const tail = rms(mono, main - third, main)
  if (head <= 1e-6 || tail <= 1e-9) return 0
  return 20 * Math.log10(tail / head)
}

// --- ffmpeg --------------------------------------------------------------------------

function ffmpegBinary () {
  if (process.env.FFMPEG) return process.env.FFMPEG
  const local = join(process.env.LOCALAPPDATA || tmpdir(), 'ffmpeg', 'bin', 'ffmpeg.exe')
  if (existsSync(local)) return local
  return 'ffmpeg'
}

const FFMPEG = ffmpegBinary()

function run (bin, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(bin + ' exited ' + code + '\n' + stderr.slice(-800)))
    })
  })
}

async function encodeOgg (source, destination) {
  mkdirSync(dirname(destination), { recursive: true })
  if (!force && existsSync(destination) && statSync(destination).mtimeMs >= statSync(source).mtimeMs) {
    return false
  }
  await run(FFMPEG, [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-i', source,
    '-map_metadata', '-1',
    '-vn',
    '-c:a', 'libvorbis',
    '-qscale:a', String(quality),
    destination
  ])
  return true
}

// --- scanning ------------------------------------------------------------------------

function walkDirs (dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) { out.push(path); walkDirs(path, out) }
  }
  return out
}

/** Leaf folders that actually hold wavs; the folder above one is the instrument pack. */
function samplePacks () {
  const leaves = walkDirs(sampleRoot).filter((dir) => readdirSync(dir).some((n) => n.toLowerCase().endsWith('.wav')))
  const packs = new Map()
  for (const leaf of leaves) {
    const rel = relative(sampleRoot, leaf).split(sep)
    const pack = rel.length >= 2 ? rel[rel.length - 2] : rel[0]
    if (only && !pack.toLowerCase().includes(only)) continue
    if (!packs.has(pack)) packs.set(pack, [])
    packs.get(pack).push(leaf)
  }
  return packs
}

function specFor (durationSec) {
  for (const row of SAMPLE_SPEC) {
    if (Math.abs(durationSec - row.totalSec) < 0.05) return row
  }
  return null
}

const skipped = []

/** One take of one instrument, e.g. `Piano|Piano` or `1st Violins|1st Violins Spiccato`. */
function groupKey (ref) {
  return ref.pack + '|' + ref.entry.slice(0, ref.entry.lastIndexOf('/'))
}

function describeSample (pack, leaf, fileName, rules) {
  const absolute = join(leaf, fileName)
  const bytes = statSync(absolute).size
  const leafName = relative(sampleRoot, leaf).split(sep).pop()
  const note = parseName(fileName, target.midiOffset)
  if (!note) {
    skipped.push(pack + '/' + fileName + ' — filename has no note')
    return null
  }
  const wav = decodeWav(readFileSync(absolute))
  if (!wav || wav.frames < wav.sampleRate * 0.1) {
    skipped.push(pack + '/' + fileName + ' — empty or unreadable (' + bytes + ' bytes)')
    return null
  }

  const articulation = classifyArticulation(leafName, pack)
  const spec = specFor(wav.durationSec)
  const mainSec = spec ? spec.mainSec : Math.round(wav.durationSec * 0.66 * 1000) / 1000
  if (!spec) {
    console.warn('  ! ' + fileName + ' is ' + wav.durationSec.toFixed(3) + 's, not in SAMPLE_SPEC; '
      + 'assuming a ' + mainSec + 's body')
  }

  // `entry` mirrors the source tree so the encode cache lines up with it; the bucket gets a
  // URL-safe spelling of the same name.
  const entry = leafName + '/' + fileName.replace(/\.wav$/i, '.ogg')
  const ref = {
    pack,
    entry,
    objectPath: objectSafe('samples/' + pack + '/' + entry),
    bytes: 0,
    unpitched: false,
    rootNote: note.midi,
    minNote: note.midi,
    maxNote: note.midi,
    dynamicLayer: note.velocity,
    articulation,
    // Declared rather than guessed from the filename, so the region compiler does not have
    // to know this library's naming.
    tier: 1,
    durationSec: Math.round(wav.durationSec * 1000) / 1000,
    mainSec,
    releaseSec: Math.round((wav.durationSec - mainSec) * 1000) / 1000,
    releaseCrossfadeSec: articulation === 'long' || articulation === 'sustain' ? 0.04 : 0.02,
    decays: false,
    loop: false
  }
  return { ref, absolute, decayDb: bodyDecayDb(wav.mono, wav.sampleRate, mainSec) }
}

/**
 * Decide looping one take at a time rather than one file at a time.
 *
 * A piano is a piano across all 96 of its notes, so the decay verdict is a majority vote
 * over the whole take. Getting this wrong on a single sample would make one key on the
 * keyboard sustain forever while its neighbours died away.
 */
function resolveLoops (samples, rules) {
  const groups = new Map()
  for (const sample of samples) {
    const key = groupKey(sample.ref)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(sample)
  }

  const report = []
  for (const [key, group] of groups) {
    const artic = group[0].ref.articulation
    const decayed = group.filter((s) => s.decayDb < -8).length
    const decays = decayed * 2 > group.length
    group.forEach((s) => { s.ref.decays = decays })

    // Only a held articulation that keeps its level needs a loop. Struck and plucked notes
    // play through and stop, which is what they do in the room.
    if (decays || (artic !== 'long' && artic !== 'sustain')) {
      report.push('  ' + key.padEnd(44) + artic.padEnd(8) + (decays ? 'decays, plays through' : 'one-shot'))
      continue
    }

    let analysed = 0
    for (const sample of group) {
      const wav = decodeWav(readFileSync(sample.absolute))
      if (!wav) continue
      const body = Math.min(wav.mono.length, Math.round(sample.ref.mainSec * wav.sampleRate))
      const found = findLoopPoints(wav.mono.subarray(0, body), wav.sampleRate, rules)
      if (found.loop && found.loopEnd > found.loopStart) {
        sample.ref.loop = true
        sample.ref.loopStart = Math.round(found.loopStart * 1000) / 1000
        sample.ref.loopEnd = Math.round(found.loopEnd * 1000) / 1000
        sample.ref.crossfadeSec = Math.round((found.crossfade || 0.12) * 1000) / 1000
        sample.ref.loopScore = Math.round((found.score || 0) * 1000) / 1000
        sample.ref.loopSource = 'analysed'
        analysed++
      } else {
        // A held note that outlives its body has to loop somehow, so fall back to a fixed
        // window late in the body with a crossfade long enough to hide a seam the
        // correlation search would not accept.
        const main = sample.ref.mainSec
        sample.ref.loop = true
        sample.ref.loopStart = Math.round(main * 0.35 * 1000) / 1000
        sample.ref.loopEnd = Math.round(main * 0.97 * 1000) / 1000
        sample.ref.crossfadeSec = 0.25
        sample.ref.loopSource = 'fallback'
      }
    }
    report.push('  ' + key.padEnd(44) + artic.padEnd(8) + 'looped: ' + analysed + ' analysed, '
      + (group.length - analysed) + ' crossfade fallback')
  }
  console.log('loop plan')
  report.sort().forEach((line) => console.log(line))
}

/** Neighbouring root notes meet at the midpoint, so a missing note is covered by its
 * neighbour instead of leaving a silent key. */
function tightenPitchRanges (samples, rules) {
  const groups = new Map()
  for (const { ref } of samples) {
    const folder = ref.entry.slice(0, ref.entry.lastIndexOf('/'))
    const key = ref.pack + '|' + folder + '|' + ref.articulation + '|' + ref.dynamicLayer
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(ref)
  }
  const stretch = rules.maxStretchSemitones || 2
  groups.forEach((group) => {
    const roots = [...new Set(group.map((ref) => ref.rootNote))].sort((a, b) => a - b)
    group.forEach((ref) => {
      const index = roots.indexOf(ref.rootNote)
      const previous = roots[index - 1]
      const next = roots[index + 1]
      ref.minNote = previous == null
        ? Math.max(0, ref.rootNote - stretch)
        : Math.max(ref.rootNote - stretch, Math.floor((previous + ref.rootNote) / 2) + 1)
      ref.maxNote = next == null
        ? Math.min(127, ref.rootNote + stretch)
        : Math.min(ref.rootNote + stretch, Math.floor((ref.rootNote + next) / 2))
    })
  })
}

// --- upload --------------------------------------------------------------------------

async function putObject (path, body, contentType) {
  const url = supabaseUrl + '/storage/v1/object/' + target.bucket + '/' + encodeURI(path)
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + writeKey,
        apikey: writeKey,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body
    })
    if (res.ok) return
    const text = await res.text()
    if (res.status === 401 || res.status === 403) {
      throw new Error('upload ' + path + ' rejected (' + res.status + '). Storage writes need '
        + 'SUPABASE_SERVICE_ROLE_KEY; the anon key is read-only.\n' + text)
    }
    if (res.status < 500 && res.status !== 429) throw new Error('upload ' + path + ' failed: ' + res.status + ' ' + text)
    if (attempt === 4) throw new Error('upload ' + path + ' failed after retries: ' + res.status + ' ' + text)
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)))
  }
}

async function pool (items, limit, worker) {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index], index)
    }
  })
  await Promise.all(runners)
}

// --- main ----------------------------------------------------------------------------

async function main () {
  if (!existsSync(sampleRoot)) throw new Error('sample root missing: ' + sampleRoot)
  if (upload && !writeKey) {
    throw new Error('--upload needs SUPABASE_SERVICE_ROLE_KEY in the environment '
      + '(storage RLS only grants the anon key read access)')
  }

  const rules = playbackFrom({ playback: target.playback })
  const packs = samplePacks()
  const samples = []
  console.log('library ' + libraryId + '  root ' + sampleRoot)

  for (const [pack, leaves] of [...packs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const before = samples.length
    for (const leaf of leaves.sort()) {
      const files = readdirSync(leaf).filter((n) => n.toLowerCase().endsWith('.wav')).sort()
      for (const fileName of files) {
        const described = describeSample(pack, leaf, fileName, rules)
        if (described) samples.push(described)
      }
    }
    const mine = samples.slice(before)
    const notes = mine.map((s) => s.ref.rootNote)
    const takes = [...new Set(mine.map((s) => s.ref.articulation))].sort().join('/')
    console.log('  ' + pack.padEnd(16) + String(mine.length).padStart(3) + ' samples  keys '
      + Math.min(...notes) + '-' + Math.max(...notes) + '  ' + takes)
  }

  if (!samples.length) throw new Error('no samples matched')
  resolveLoops(samples, rules)
  tightenPitchRanges(samples, rules)

  console.log('encoding ' + samples.length + ' files to OGG q' + quality + ' with ' + encodeConcurrency + ' workers')
  let encoded = 0
  let reused = 0
  await pool(samples, encodeConcurrency, async (sample) => {
    const cached = join(cacheDir, sample.ref.pack, sample.ref.entry)
    const fresh = await encodeOgg(sample.absolute, cached)
    if (fresh) encoded++
    else reused++
    sample.encoded = cached
    sample.ref.bytes = statSync(cached).size
  })
  const totalBytes = samples.reduce((sum, s) => sum + s.ref.bytes, 0)
  console.log('  encoded ' + encoded + ', reused ' + reused + ', total '
    + (totalBytes / 1048576).toFixed(1) + ' MB')

  const manifest = {
    id: libraryId,
    displayName: target.displayName,
    formatVersion: 4,
    sampleLayout: 'objects',
    layout: 'body-plus-release',
    cacheBudgetMb: 128,
    globalMaxVoices: 96,
    playback: target.playback,
    packs: [...new Set(samples.map((s) => s.ref.pack))].sort(),
    sampleCount: samples.length,
    samples: samples.map((s) => s.ref)
  }
  // Enforce what objectSafe promises: a name that survives a URL, and one object per sample.
  const unsafe = samples.filter((s) => /[#?%&+]/.test(s.ref.objectPath))
  if (unsafe.length) throw new Error('unsafe object path: ' + unsafe[0].ref.objectPath)
  const byPath = new Map()
  for (const s of samples) {
    const clash = byPath.get(s.ref.objectPath)
    if (clash) throw new Error('two samples map to ' + s.ref.objectPath + ': ' + clash + ' and ' + s.ref.entry)
    byPath.set(s.ref.objectPath, s.ref.entry)
  }

  writeFileSync(target.manifestOut, JSON.stringify(manifest))
  console.log('wrote ' + relative(appRoot, target.manifestOut) + '  ('
    + (statSync(target.manifestOut).size / 1024).toFixed(0) + ' KB)')

  if (skipped.length) {
    console.log('skipped ' + skipped.length + ' file(s):')
    skipped.forEach((line) => console.log('  - ' + line))
  }

  if (!upload) {
    console.log('done (dry run; pass --upload to publish)')
    return
  }

  console.log('uploading to bucket ' + target.bucket)
  let done = 0
  await pool(samples, uploadConcurrency, async (sample) => {
    await putObject(sample.ref.objectPath, readFileSync(sample.encoded), 'audio/ogg')
    done++
    if (done % 25 === 0 || done === samples.length) console.log('  ' + done + ' / ' + samples.length)
  })
  await putObject('manifest.json', JSON.stringify(manifest), 'application/json')
  console.log('upload complete')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
