import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

const here = dirname(fileURLToPath(import.meta.url))
const appRoot = join(here, '..')
const repoRoot = join(appRoot, '..', '..')
const libraryPath = join(repoRoot, 'Source', 'Resources', 'm-orchestra', 'library.json')
const outDir = join(appRoot, 'src', 'audio', 'm-orchestra')
const defaultRoot = 'D:\\Daw\\We chat\\xwechat_files\\wxid_iwpym6w3qj7522_8be0\\msg\\file\\2026-08\\all-samples\\all-samples'
const sampleRoot = process.env.DAWWEB_M_ORCHESTRA_ROOT || defaultRoot
const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://igfixjydwobvukwfxveq.supabase.co'
const anonKey = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnZml4anlkd29idnVrd2Z4dmVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0NjgxODIsImV4cCI6MjEwMzA0NDE4Mn0.YOr859zCxuCteYLIdW1ScLHTjzN8XiKjPm64eUzwJ3E'
const bucket = 'm-orchestra'
const upload = process.argv.includes('--upload')

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

function isPrimaryArtic (artic) {
  const a = String(artic || '').toLowerCase()
  return a === 'arco-normal' || a === 'normal' || a === 'struck-singly'
    || a.includes('mallet') || a.includes('stick') || a.includes('beater')
}

function classifyArticulation (duration, percussion) {
  if (percussion) return 'hit'
  const d = String(duration || '').toLowerCase()
  if (d === '025' || d === '05') return 'short'
  return 'long'
}

async function scanZip (pack, zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath))
  const samples = []
  const names = Object.keys(zip.files)
  for (const raw of names) {
    const path = raw.replace(/\\/g, '/')
    const lower = path.toLowerCase()
    if (!lower.endsWith('.mp3') && !lower.endsWith('.wav')) continue
    const fileName = path.slice(path.lastIndexOf('/') + 1)
    const stem = fileName.replace(/\.[^.]+$/, '')
    const tokens = stem.split('_').filter(Boolean)
    const slash = path.indexOf('/')
    const percussion = pack.toLowerCase() === 'percussion' || slash >= 0
    const ref = { pack, entry: path, unpitched: false, rootNote: 60, minNote: 0, maxNote: 127, dynamicLayer: 64, articulation: 'long', loop: false }
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
    if (d === 'phrase' || d === 'rhythm') continue
    if (artic.toLowerCase().includes('rhythm') || artic.toLowerCase().includes('phrase') || artic.toLowerCase().includes('roll')) continue
    if (!percussion && artic && !isPrimaryArtic(artic)) continue
    ref.dynamicLayer = dynamicToLayer(dynamic)
    ref.articulation = classifyArticulation(duration, percussion || ref.unpitched)
    ref.loop = ref.articulation === 'long'
    samples.push(ref)
  }
  return samples
}

async function putObject (path, body, contentType) {
  const url = `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURI(path)}`
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
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`upload ${path} failed: ${res.status} ${text}`)
  }
}

async function main () {
  if (!existsSync(libraryPath)) throw new Error('library.json missing: ' + libraryPath)
  if (!existsSync(sampleRoot)) throw new Error('sample root missing: ' + sampleRoot)
  const library = JSON.parse(readFileSync(libraryPath, 'utf8'))
  const zips = readdirSync(sampleRoot).filter((name) => name.toLowerCase().endsWith('.zip'))
  const samples = []
  for (const name of zips) {
    const pack = name.replace(/\.zip$/i, '')
    const found = await scanZip(pack, join(sampleRoot, name))
    console.log(name, found.length, 'samples')
    samples.push(...found)
  }
  const manifest = {
    id: library.id,
    displayName: library.displayName,
    cacheBudgetMb: library.cacheBudgetMb,
    globalMaxVoices: library.globalMaxVoices,
    missing: library.missing || [],
    instruments: library.instruments || [],
    packs: zips.map((name) => name.replace(/\.zip$/i, '')),
    sampleCount: samples.length,
    samples
  }
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest))
  console.log('wrote manifest', samples.length, 'samples')
  if (!upload) return
  for (const name of zips) {
    const pack = name.replace(/\.zip$/i, '')
    const zipPath = join(sampleRoot, name)
    console.log('uploading', name)
    await putObject(`${pack}.zip`, readFileSync(zipPath), 'application/zip')
  }
  await putObject('manifest.json', JSON.stringify(manifest), 'application/json')
  console.log('upload complete')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
