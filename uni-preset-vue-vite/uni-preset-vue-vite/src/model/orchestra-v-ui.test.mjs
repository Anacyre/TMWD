import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { CATALOG, definitionsInLibrary, findDefinition, libraryOf } from '../audio/orchestra-v/catalog.js'
import { LIBRARIES, findLibrary } from '../audio/orchestra-v/libraries.js'
import { compileRegions, selectZone } from '../audio/orchestra-v/sfz.js'
import { createDemoProject } from './demo-project.js'
import {
  CONTROLLERS,
  FAMILIES,
  INSTRUMENTS,
  LIBRARY_OPTIONS,
  MIC_MIX,
  ORCHESTRA_V_DEFAULT_ID,
  WHEELS,
  defaultControllerValues,
  defaultTechniqueFor,
  instrumentsInLibrary,
  isOrchestraVTrack,
  orchestraVUsesPedal,
  techniquesFor
} from './orchestra-v-ui.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const here = dirname(fileURLToPath(import.meta.url))
const readJson = (path) => JSON.parse(readFileSync(resolve(here, path), 'utf8'))

const manifests = {
  'vms-solo': readJson('../audio/m-orchestra/manifest.json'),
  'vms-symphonic': readJson('../audio/orchestra-v/vms-symphonic-manifest.json')
}
const manifest = manifests['vms-solo']
const schema = readJson('../schema/orchestra-v-instrument.schema.json')
const samplerCatalogue = readJson('../../../../Source/Resources/instruments.json')

const manifestFor = (def) => manifests[libraryOf(def)]

/** Focused structural check against the data contract: required keys, unknown keys and
 * the enums the compiler and UI switch on. */
function validate (value, spec, path) {
  const problems = []
  if (spec.enum && !spec.enum.includes(value)) problems.push(`${path} is not one of ${spec.enum.join('/')}`)
  if (spec.type === 'object' && value && typeof value === 'object') {
    for (const key of spec.required || []) {
      if (value[key] === undefined) problems.push(`${path} is missing required "${key}"`)
    }
    for (const key of Object.keys(value)) {
      const child = (spec.properties || {})[key]
      if (!child) {
        if (spec.additionalProperties === false) problems.push(`${path} has unknown key "${key}"`)
        continue
      }
      problems.push(...validate(value[key], child, `${path}.${key}`))
    }
  }
  if (spec.type === 'array' && Array.isArray(value)) {
    value.forEach((item, i) => problems.push(...validate(item, spec.items || {}, `${path}[${i}]`)))
  }
  if (spec.type === 'integer' && value !== undefined) {
    if (!Number.isInteger(value)) problems.push(`${path} is not an integer`)
    if (spec.minimum != null && value < spec.minimum) problems.push(`${path} is below ${spec.minimum}`)
    if (spec.maximum != null && value > spec.maximum) problems.push(`${path} is above ${spec.maximum}`)
  }
  if (spec.pattern && typeof value === 'string' && !new RegExp(spec.pattern).test(value)) {
    problems.push(`${path} does not match ${spec.pattern}`)
  }
  return problems
}

// --- the catalogue honours its own schema ------------------------------------
{
  const problems = CATALOG.flatMap((def) => validate(def, schema, def.id || '<unnamed>'))
  assert(!problems.length, 'catalogue breaks the data contract:\n  ' + problems.join('\n  '))

  const ids = CATALOG.map((def) => def.id)
  assert(new Set(ids).size === ids.length, 'instrument ids are unique')
  assert(ids.every((id) => id.startsWith('ov_')), 'every id carries the ov_ prefix')
  assert(findDefinition(ORCHESTRA_V_DEFAULT_ID), 'the default instrument exists in the catalogue')
}

// --- VMS Solo mirrors the Orchestra Sampler line-up one for one --------------
// Only that library stands in for the PC sampler. Libraries added later are named after
// what was actually recorded, so they carry no `mirrors`.
{
  const samplerIds = new Set((samplerCatalogue.instruments || [])
    .map((item) => String(item.id))
    .filter((id) => id !== 'test_synth' && !id.startsWith('m_orch_')))

  const solo = definitionsInLibrary('vms-solo')
  assert(solo.length === samplerIds.size,
    `VMS Solo has ${solo.length} entries but Orchestra Sampler offers ${samplerIds.size}`)
  for (const def of solo) {
    assert(def.mirrors, `${def.id} does not say which Orchestra Sampler entry it stands in for`)
    assert(samplerIds.has(def.mirrors), `${def.id} mirrors "${def.mirrors}", which is not in the sampler catalogue`)
  }
  const mirrored = solo.map((def) => def.mirrors)
  assert(new Set(mirrored).size === mirrored.length, 'no two Orchestra V instruments mirror the same entry')
}

// --- every instrument belongs to a registered library ------------------------
{
  for (const def of CATALOG) {
    assert(findLibrary(def.library), `${def.id} claims unknown library "${def.library}"`)
  }
  for (const library of LIBRARIES) {
    assert(definitionsInLibrary(library.id).length, `library "${library.id}" has no instruments`)
    assert(library.bucket, `library "${library.id}" has no storage bucket`)
  }
  const buckets = LIBRARIES.map((library) => library.bucket)
  assert(new Set(buckets).size === buckets.length, 'two libraries share one storage bucket')

  assert(LIBRARY_OPTIONS.length === LIBRARIES.length, 'the picker lists every library')
  for (const option of LIBRARY_OPTIONS) {
    assert(option.available > 0, `library "${option.id}" offers nothing playable`)
    assert(option.total === instrumentsInLibrary(option.id).length, `library "${option.id}" miscounts its instruments`)
  }
}

// --- every playable instrument really resolves samples ----------------------
{
  const available = CATALOG.filter((def) => def.available)
  assert(available.length >= 20, `expected at least 20 playable instruments, found ${available.length}`)

  for (const def of available) {
    const own = manifestFor(def)
    const map = compileRegions(own.samples, def, own)
    assert(map.zones.length, `${def.id} is marked available but compiles no zones`)

    for (const artic of def.articulations || []) {
      const bank = map.byArticulation[artic]
      assert(bank && bank.zoneCount, `${def.id} declares "${artic}" but no samples cover it`)
    }

    // A note in the middle of the advertised range must sound at a normal velocity.
    const bank = map.byArticulation[def.articulations[0]]
    const middle = Math.round((bank.keyLo + bank.keyHi) / 2)
    const sounding = selectZone(map, middle, 96, def.articulations[0], new Map())
    assert(sounding.length, `${def.id} is silent on key ${middle}`)
    assert(sounding.every((item) => item.gain > 0), `${def.id} returns a silent zone`)
  }
}

// --- percussion keymaps point at folders that exist -------------------------
{
  const folders = new Set(manifest.samples
    .filter((sample) => sample.pack === 'percussion')
    .map((sample) => String(sample.entry).split('/')[0].toLowerCase()))

  const claimed = new Set()
  for (const def of CATALOG.filter((item) => item.keymap)) {
    const keys = new Set()
    for (const slot of def.keymap) {
      assert(folders.has(slot.folder.toLowerCase()), `${def.id} maps missing folder "${slot.folder}"`)
      assert(!keys.has(slot.key), `${def.id} maps two folders onto key ${slot.key}`)
      keys.add(slot.key)
      assert(!claimed.has(slot.folder.toLowerCase()), `folder "${slot.folder}" is claimed by two instruments`)
      claimed.add(slot.folder.toLowerCase())
    }
  }
  assert(claimed.size === folders.size,
    `${folders.size - claimed.size} percussion folders are not reachable from any key`)
}

// --- techniques are offered honestly ----------------------------------------
{
  const violin = techniquesFor('ov_violin_1')
  assert(violin.find((item) => item.displayName === 'Spiccato'), 'strings call the short articulation Spiccato')
  assert(violin.find((item) => item.id === 'ov_pizz').available, 'the violins can play pizzicato')

  const flute = techniquesFor('ov_flute')
  assert(flute.find((item) => item.displayName === 'Staccatissimo'), 'winds call it Staccatissimo')
  assert(!flute.some((item) => item.id === 'ov_pizz'), 'a flute is never offered pizzicato')

  const cello = techniquesFor('ov_cello')
  assert(cello.find((item) => item.id === 'ov_pizz') && !cello.find((item) => item.id === 'ov_pizz').available,
    'cello pizzicato is listed but greyed out, because the cloud library has none')

  const perc = techniquesFor('ov_untuned_percussion')
  assert(perc.length === 1 && perc[0].id === 'ov_hit', 'percussion only offers Hit')

  const piano = techniquesFor('ov_sym_piano')
  assert(piano.length === 1 && piano[0].available, 'a keyboard offers one technique, not Long and Short')

  for (const def of CATALOG.filter((item) => !item.available)) {
    assert(techniquesFor(def.id).every((item) => !item.available),
      `${def.id} has no samples, so no technique may look playable`)
  }

  for (const def of CATALOG.filter((item) => item.available)) {
    const fallback = defaultTechniqueFor(def.id)
    const chosen = techniquesFor(def.id).find((item) => item.id === fallback)
    assert(chosen && chosen.available, `${def.id} defaults to a technique it cannot play`)
  }
}

// --- presentation model stays in step with the catalogue --------------------
{
  assert(INSTRUMENTS.length === CATALOG.length, 'the grid lists every catalogue entry')
  const familyIds = new Set(FAMILIES.map((family) => family.id))
  for (const item of INSTRUMENTS) assert(familyIds.has(item.family), `${item.id} sits in unknown family "${item.family}"`)
  for (const family of FAMILIES) {
    assert(INSTRUMENTS.some((item) => item.family === family.id), `family "${family.id}" has no instruments`)
  }

  const defaults = defaultControllerValues()
  for (const ctrl of [...CONTROLLERS, ...MIC_MIX, ...WHEELS]) {
    const value = defaults[ctrl.id]
    assert(value >= 0 && value <= 1, `${ctrl.id} default ${value} is outside the 0..1 range the engine reads`)
  }
  assert(defaults.pitch === 0.5, 'the pitch wheel rests at centre')
}

// --- VMS Symphonic records a body followed by its own release ----------------
{
  const own = manifests['vms-symphonic']
  const symphonic = definitionsInLibrary('vms-symphonic').filter((def) => def.available)
  assert(symphonic.length === 5, `expected 5 symphonic instruments, found ${symphonic.length}`)

  for (const def of symphonic) {
    const map = compileRegions(own.samples, def, own)
    for (const zone of map.zones) {
      assert(zone.mainSec > 0, `${def.id} zone ${zone.entry} has no body length`)
      assert(zone.releaseSec > 0.05, `${def.id} zone ${zone.entry} has no release tail`)
      assert(zone.mainSec + zone.releaseSec <= zone.durationSec + 0.01,
        `${def.id} zone ${zone.entry} claims a body plus tail longer than the file`)
      // Looping across the splice point would drop the decay into a held note.
      if (zone.loopMode === 'loop_continuous') {
        assert(zone.loopEnd <= zone.mainSec,
          `${def.id} loops to ${zone.loopEnd}s, past the ${zone.mainSec}s body`)
        assert(zone.loopEnd - zone.loopStart >= 1,
          `${def.id} loop of ${(zone.loopEnd - zone.loopStart).toFixed(2)}s is too short to hide`)
      }
    }

    // Chromatic sampling: every key in the declared range sounds, and all but the notes the
    // library ships empty play at their own pitch.
    const [lo, hi] = def.keyRange
    const bank = map.byArticulation[def.articulations[0]]
    let stretched = 0
    for (let key = lo; key <= hi; key++) {
      const picked = selectZone(map, key, 100, def.articulations[0], new Map())
      assert(picked.length, `${def.id} is silent on key ${key}`)
      if (picked[0].zone.pitchKeycenter !== key) stretched++
    }
    assert(bank.keyLo <= lo && bank.keyHi >= hi, `${def.id} does not cover its advertised range`)
    assert(stretched <= 1, `${def.id} transposes ${stretched} keys; the library should be chromatic`)
  }
}

// --- struck and plucked takes ring out; held takes loop and then damp --------
{
  const own = manifests['vms-symphonic']

  const piano = compileRegions(own.samples, findDefinition('ov_sym_piano'), own)
  assert(piano.zones.length, 'the piano compiles zones')
  assert(piano.zones.every((zone) => zone.loopMode === 'no_loop'),
    'a piano must never loop, or a held key would sustain forever')
  assert(piano.zones.every((zone) => zone.releaseMode === 'envelope'),
    'releasing a piano key damps with an envelope from the current playback')
  assert(piano.zones.every((zone) => zone.decays), 'the piano body is measured as decaying')

  const violins = compileRegions(own.samples, findDefinition('ov_sym_violins_1'), own)
  const longZones = violins.zones.filter((zone) => zone.articulation === 'long')
  assert(longZones.length && longZones.every((zone) => zone.loopMode === 'loop_continuous'),
    'every held violin note can loop, so a note longer than the body does not cut out')
  assert(longZones.every((zone) => zone.releaseMode === 'segment'),
    'releasing a held violin note crossfades into its recorded tail')

  for (const artic of ['short', 'pluck']) {
    const zones = violins.zones.filter((zone) => zone.articulation === artic)
    assert(zones.length, `the violins compile ${artic} zones`)
    assert(zones.every((zone) => zone.releaseMode === 'free'),
      `a ${artic} take already contains its decay, so note-off must not cut it short`)
    assert(zones.every((zone) => zone.loopMode === 'no_loop'), `a ${artic} take never loops`)
  }
}

// --- only a keyboard responds to the sustain pedal ---------------------------
{
  assert(orchestraVUsesPedal('ov_sym_piano'), 'the piano damps on pedal release')
  assert(!orchestraVUsesPedal('ov_sym_violins_1'), 'a string section has no dampers')
  const pedalled = INSTRUMENTS.filter((item) => item.pedal)
  assert(pedalled.every((item) => item.family === 'keyboard'), 'only keyboards claim a pedal')
}

// --- the demo project plays in a browser with no PC engine -------------------
{
  const demo = createDemoProject()
  const instrumentTracks = demo.tracks.filter((track) => track.type === 'midi')
  assert(instrumentTracks.length === 5, `expected 5 demo instrument tracks, found ${instrumentTracks.length}`)

  for (const track of instrumentTracks) {
    assert(isOrchestraVTrack(track), `${track.name} must be an Orchestra V track, not a remote VST`)
    const def = findDefinition(track.definitionId)
    assert(def, `${track.name} points at a real definition (${track.definitionId})`)
    assert(def.available !== false, `${track.name} points at a playable instrument`)
    assert(manifestFor(def), `${track.name} belongs to a library with a manifest`)

    const index = demo.tracks.indexOf(track)
    const notes = demo.clips
      .filter((clip) => clip.trackIndex === index)
      .flatMap((clip) => clip.notes.map((note) => note.pitch))
    assert(notes.length, `${track.name} has notes`)

    // The whole reason to check: the demo used to play BBCSO instruments whose ranges differ
    // from the VMS sections, and a note outside keyRange is simply silent.
    const [lo, hi] = def.keyRange
    const strays = notes.filter((pitch) => pitch < lo || pitch > hi)
    assert(!strays.length,
      `${track.name} has ${strays.length} note(s) outside ${def.displayName}'s range ${lo}-${hi}`)

    const own = manifestFor(def)
    const map = compileRegions(own.samples, def, own)
    const artic = track.techniqueId === 'ov_long' ? 'long' : def.articulations[0]
    assert(map.byArticulation[artic], `${track.name} compiles regions for its technique`)
    for (const pitch of new Set(notes)) {
      assert(selectZone(map, pitch, 100, artic, new Map()),
        `${track.name} maps a sample onto note ${pitch}`)
    }
  }

  const piano = instrumentTracks.find((track) => track.definitionId === 'ov_sym_piano')
  assert(piano, 'the demo keys track is the Orchestra V piano')
  assert(piano.pedal && piano.pedal.mapped, 'the piano track exposes a sustain lane in the piano roll')
  const strings = instrumentTracks.find((track) => track.definitionId === 'ov_sym_tutti_strings')
  assert(strings && !(strings.pedal && strings.pedal.mapped), 'a string section gets no sustain lane')
}

// --- track ownership ---------------------------------------------------------
{
  assert(isOrchestraVTrack({ source: 'orchestra-v' }), 'the source marks a track as ours')
  assert(isOrchestraVTrack({ definitionId: 'ov_violin_1' }), 'an ov_ definition marks a track as ours')
  assert(!isOrchestraVTrack({ source: 'm-orchestra', definitionId: 'm_orch_violin_1' }), 'M Orchestra tracks are not ours')
  assert(!isOrchestraVTrack(null), 'a missing track is not ours')
}

console.log('orchestra-v ui ok')
