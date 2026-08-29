import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const repoRoot = join(appRoot, '..', '..')
const libraryPath = join(repoRoot, 'Source', 'Resources', 'm-orchestra', 'library.json')
const outDir = join(appRoot, 'src', 'audio', 'm-orchestra')
const defaultRoot = 'D:\\FL Plugin\\Sample library\\M Orchestra'
const sampleRoot = process.env.DAWWEB_M_ORCHESTRA_ROOT || defaultRoot
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://igfixjydwobvukwfxveq.supabase.co'
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZml4anlkd29idnVrd2Z4dmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjgxODIsImV4cCI6MjEwMzA0NDE4Mn0.YOr859zCxuCteYLIdW1ScLHTjzN8XiKjPm64eUzwJ3E'
const bucket = 'm-orchestra'
const upload = process.argv.includes('--upload')
const uploadConcurrency = Math.max(1, Number(process.env.DAWWEB_M_ORCHESTRA_UPLOAD_CONCURRENCY) || 6)
const startArg = process.argv.find((arg) => arg.startsWith('--start='))
const uploadStart = Math.max(0, startArg ? Number(startArg.slice('--start='.length)) || 0 : 0)

function isNoteToken (token) {
  if (!token || token.length < 2) return false
  const first = token[0]
  if (first < 'A' || first > 'G') return false
  return /[0-9]/.test(token)
}

function parseMidiNote (token) {
  if (!token || token.length < 2) return 60
  const map = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  let semitone = map[token[0]]
  if (semitone == null) return 60
  let index = 1
  if (token[index] === 's' || token[index] === '#') { semitone += 1; index += 1 }
  else if (token[index] === 'b' || token[index] === 'f') { semitone -= 1; index += 1 }
  const octave = parseInt(token.slice(index), 10)
  return Math.max(0, Math.min(127, (octave + 1) * 12 + semitone))
}

function dynamicToLayer (token) {
  const t = String(token || '').toLowerCase()
  if (t.includes('fortissimo') || t === 'ff') return 120
  if (t.includes('pianissimo') || t === 'pp') return 16
  if (t === 'forte' || t === 'f') return 96
  if (t === 'piano' || t === 'p') return 32
  if (t.includes('mezzo-forte') || t === 'mf') return 72
  if (t.includes('mezzo-piano') || t === 'mp') return 48
  return 64
}

function isAllowedArtic (artic) {
  const a = String(artic || '').toLowerCase()
  if (a.includes('gliss')) return false
  if (!a || a === 'arco-normal' || a === 'normal' || a === 'struck-singly'
      || a.includes('mallet') || a.includes('stick') || a.includes('beater')) return true
  if (a.includes('pizz') || a.includes('tremolo') || a.includes('stacc') || a.includes('spicc')) return true
  return false
}

function classifyArticulation (duration, artic, percussion) {
  if (percussion) return 'hit'
  const a = String(artic || '').toLowerCase()
  if (a.includes('pizz') && !a.includes('gliss')) return 'pluck'
  if (a.includes('tremolo')) return 'sustain'
  if (a.includes('stacc') || a.includes('spicc')) return 'short'
  const d = String(duration || '').toLowerCase()
  if (d === '025' || d === '05') return 'short'
  return 'long'
}

function walkFiles (root) {
  const result = []
  const stack = [root]
  while (stack.length) {
    const current = stack.pop()
    for (const name of readdirSync(current)) {
      const path = join(current, name)
      const stat = statSync(path)
      if (stat.isDirectory()) stack.push(path)
      else result.push(path)
    }
  }
  return result
}

function readSyncSafeInt (buffer, offset) {
  return ((buffer[offset] & 0x7f) << 21)
    | ((buffer[offset + 1] & 0x7f) << 14)
    | ((buffer[offset + 2] & 0x7f) << 7)
    | (buffer[offset + 3] & 0x7f)
}

/** MP3 duration without a decoder. Walking frame headers is fast and handles VBR files. */
function mp3DurationSec (buffer) {
  let offset = 0
  if (buffer.length >= 10 && buffer.toString('ascii', 0, 3) === 'ID3') {
    offset = Math.min(buffer.length, 10 + readSyncSafeInt(buffer, 6))
  }
  const bitrateTable = {
    '1-1': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    '1-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    '1-3': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    '2-1': [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    '2-2': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    '2-3': [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
  }
  let samples = 0
  let sampleRate = 0
  while (offset + 4 <= buffer.length) {
    const h = buffer.readUInt32BE(offset)
    if ((h >>> 21) !== 0x7ff) { offset += 1; continue }
    const versionBits = (h >>> 19) & 3
    const layerBits = (h >>> 17) & 3
    const bitrateIndex = (h >>> 12) & 15
    const rateIndex = (h >>> 10) & 3
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
      offset += 1
      continue
    }
    const version = versionBits === 3 ? 1 : 2
    const layer = 4 - layerBits
    const rates = versionBits === 3 ? [44100, 48000, 32000]
      : versionBits === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000]
    const sr = rates[rateIndex]
    const table = bitrateTable[`${version}-${layer}`]
    const bitrate = table && table[bitrateIndex]
    if (!bitrate || !sr) { offset += 1; continue }
    const padding = (h >>> 9) & 1
    const samplesPerFrame = layer === 1 ? 384 : (layer === 3 && version !== 1 ? 576 : 1152)
    const frameLength = layer === 1
      ? Math.floor((12 * bitrate * 1000 / sr) + padding) * 4
      : Math.floor(((layer === 3 && version !== 1 ? 72 : 144) * bitrate * 1000 / sr) + padding)
    if (frameLength < 4 || offset + frameLength > buffer.length + 4) { offset += 1; continue }
    samples += samplesPerFrame
    sampleRate = sr
    offset += frameLength
  }
  return sampleRate > 0 ? samples / sampleRate : 0
}

function parseSample (pack, absolutePath, packRoot) {
    const path = relative(packRoot, absolutePath).split(sep).join('/')
    const lower = path.toLowerCase()
    if (!lower.endsWith('.mp3') && !lower.endsWith('.wav')) return null
    const fileName = path.slice(path.lastIndexOf('/') + 1)
    const stem = fileName.replace(/\.[^.]+$/, '')
    const tokens = stem.split('_').filter(Boolean)
    const slash = path.indexOf('/')
    const percussion = pack.toLowerCase() === 'percussion' || slash >= 0
    const bytes = statSync(absolutePath).size
    const ref = {
      pack,
      entry: path,
      objectPath: `samples/${pack}/${path}`,
      bytes,
      unpitched: false,
      rootNote: 60,
      minNote: 0,
      maxNote: 127,
      dynamicLayer: 64,
      articulation: 'long',
      loop: false
    }
    let noteIndex = -1
    for (let t = 0; t < tokens.length; t++) {
      if (isNoteToken(tokens[t])) { noteIndex = t; break }
    }
    let duration = ''
    let dynamic = ''
    let artic = ''
    if (noteIndex >= 0 && noteIndex + 1 < tokens.length) {
      ref.rootNote = parseMidiNote(tokens[noteIndex])
      ref.minNote = Math.max(0, ref.rootNote - 4)
      ref.maxNote = Math.min(127, ref.rootNote + 4)
      duration = tokens[noteIndex + 1]
      if (noteIndex + 2 < tokens.length) dynamic = tokens[noteIndex + 2]
      if (noteIndex + 3 < tokens.length) artic = tokens.slice(noteIndex + 3).join('_')
      ref.unpitched = false
    } else {
      ref.unpitched = true
      if (tokens.length >= 2) duration = tokens[1]
      if (tokens.length >= 3) dynamic = tokens[2]
      if (tokens.length >= 4) artic = tokens.slice(3).join('_')
    }
    const d = duration.toLowerCase()
    if (d === 'phrase' || d === 'rhythm') return null
    const dyn = String(dynamic || '').toLowerCase()
    if (dyn.includes('crescendo') || dyn.includes('diminuendo') || dyn.includes('decrescendo')) return null
    if (artic.toLowerCase().includes('rhythm') || artic.toLowerCase().includes('phrase') || artic.toLowerCase().includes('roll')) return null
    if (!percussion && artic && !isAllowedArtic(artic)) return null
    ref.dynamicLayer = dynamicToLayer(dynamic)
    ref.articulation = classifyArticulation(duration, artic, percussion || ref.unpitched)
    ref.loop = ref.articulation === 'long' || ref.articulation === 'sustain'
    if (ref.loop && extname(absolutePath).toLowerCase() === '.mp3') {
      const durationSec = mp3DurationSec(readFileSync(absolutePath))
      ref.durationSec = Math.round(durationSec * 1000) / 1000
      const crossfadeSec = 0.12
      const loopStart = Math.max(0.18, durationSec * 0.28)
      const loopEnd = Math.min(durationSec - 0.08, loopStart + Math.min(3.2, Math.max(1.15, durationSec * 0.52)))
      if (loopEnd - loopStart >= 0.8) {
        ref.loopStart = Math.round(loopStart * 1000) / 1000
        ref.loopEnd = Math.round(loopEnd * 1000) / 1000
        ref.crossfadeSec = Math.min(crossfadeSec, (loopEnd - loopStart) * 0.1)
      } else {
        ref.loop = false
      }
    }
    return { ref, absolutePath }
}

function tightenPitchRanges (samples) {
  const groups = new Map()
  for (const sample of samples) {
    if (sample.ref.unpitched) continue
    const folder = sample.ref.entry.includes('/') ? sample.ref.entry.slice(0, sample.ref.entry.lastIndexOf('/')) : ''
    const key = `${sample.ref.pack}|${folder}|${sample.ref.articulation}|${sample.ref.dynamicLayer}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(sample.ref)
  }
  groups.forEach((group) => {
    const roots = [...new Set(group.map((sample) => sample.rootNote))].sort((a, b) => a - b)
    group.forEach((sample) => {
      const index = roots.indexOf(sample.rootNote)
      const previous = roots[index - 1]
      const next = roots[index + 1]
      sample.minNote = previous == null ? Math.max(0, sample.rootNote - 4) : Math.floor((previous + sample.rootNote) / 2) + 1
      sample.maxNote = next == null ? Math.min(127, sample.rootNote + 4) : Math.floor((sample.rootNote + next) / 2)
    })
  })
}

function scanDirectories () {
  const packs = readdirSync(sampleRoot)
    .filter((name) => statSync(join(sampleRoot, name)).isDirectory())
    .sort()
  const samples = []
  for (const pack of packs) {
    const packRoot = join(sampleRoot, pack)
    const found = walkFiles(packRoot)
      .map((path) => parseSample(pack, path, packRoot))
      .filter(Boolean)
    console.log(pack, found.length, 'samples')
    samples.push(...found)
  }
  tightenPitchRanges(samples)
  return { packs, samples }
}

async function putObject (path, body, contentType) {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${anonKey}`,
        apikey: anonKey,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body
    })
    if (res.ok) return
    const text = await res.text()
    if (res.status < 500 && res.status !== 429) {
      throw new Error(`upload ${path} failed: ${res.status} ${text}`)
    }
    if (attempt === 4) throw new Error(`upload ${path} failed after retries: ${res.status} ${text}`)
    await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)))
  }
}

async function main () {
  if (!existsSync(libraryPath)) throw new Error('library.json missing: ' + libraryPath)
  if (!existsSync(sampleRoot)) throw new Error('sample root missing: ' + sampleRoot)
  const library = JSON.parse(readFileSync(libraryPath, 'utf8'))
  const { packs, samples } = scanDirectories()
  const manifest = {
    id: library.id,
    displayName: library.displayName,
    cacheBudgetMb: library.cacheBudgetMb,
    globalMaxVoices: library.globalMaxVoices,
    playback: library.playback || {},
    missing: library.missing || [],
    instruments: library.instruments || [],
    formatVersion: 2,
    sampleLayout: 'objects',
    packs,
    sampleCount: samples.length,
    samples: samples.map(({ ref }) => ref)
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  console.log('wrote manifest', samples.length, 'samples')
  if (!upload) return
  let cursor = Math.min(uploadStart, samples.length)
  async function worker () {
    while (cursor < samples.length) {
      const index = cursor++
      const sample = samples[index]
      const type = sample.ref.entry.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
      await putObject(sample.ref.objectPath, readFileSync(sample.absolutePath), type)
      if ((index + 1) % 100 === 0 || index + 1 === samples.length) {
        console.log('uploaded', index + 1, '/', samples.length)
      }
    }
  }
  await Promise.all(Array.from({ length: uploadConcurrency }, () => worker()))
  await putObject('manifest.json', JSON.stringify(manifest), 'application/json')
  console.log('upload complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
