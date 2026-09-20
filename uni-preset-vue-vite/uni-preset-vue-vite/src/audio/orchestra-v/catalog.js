/** Orchestra V instrument catalogue, grouped by sample library.
 *
 * VMS Solo Orchestra mirrors the Orchestra Sampler line-up from
 * Source/Resources/instruments.json so the two samplers offer the same instruments, backed
 * by the M Orchestra packs instead of a hosted VST3. Entries that library has no samples for
 * stay in the grid with `available: false` rather than disappearing.
 *
 * VMS Symphonic Orchestra is chromatically sampled: one file per semitone holding a body
 * plus its own release tail, so those instruments need no velocity crossfade and no
 * round-robin. Its entries are deliberately named after what was recorded (1st Violins,
 * Tutti Strings) rather than mirroring the Orchestra Sampler names.
 *
 * Shape is constrained by src/schema/orchestra-v-instrument.schema.json.
 */

import { DEFAULT_LIBRARY_ID, findLibrary } from './libraries.js'

const NO_SAMPLES = 'No samples in the cloud library yet'

const STRING_SECTION = { detuneCents: 2.0, noise: 'bow', vibrato: true }
const WIND_SECTION = { detuneCents: 2.0, noise: 'breath', vibrato: true }
const BRASS_SECTION = { detuneCents: 2.0, noise: 'air', vibrato: false }

/** The large drums and cymbals, laid out from C2 upwards. */
const UNTUNED_KEYMAP = [
  { key: 36, folder: 'bass drum', name: 'Bass Drum' },
  { key: 38, folder: 'snare drum', name: 'Snare Drum' },
  { key: 41, folder: 'tom-toms', name: 'Tom-toms' },
  { key: 43, folder: 'surdo', name: 'Surdo' },
  { key: 45, folder: 'djembe', name: 'Djembe' },
  { key: 47, folder: 'djundjun', name: 'Djundjun' },
  { key: 49, folder: 'clash cymbals', name: 'Clash Cymbals' },
  { key: 51, folder: 'suspended cymbal', name: 'Suspended Cymbal' },
  { key: 52, folder: 'Chinese cymbal', name: 'Chinese Cymbal' },
  { key: 53, folder: 'sizzle cymbal', name: 'Sizzle Cymbal' },
  { key: 55, folder: 'tam-tam', name: 'Tam-tam' },
  { key: 57, folder: 'Thai gong', name: 'Thai Gong' }
]

/** Hand percussion, shakers and effects, laid out from C4 upwards. */
const SMALL_KEYMAP = [
  { key: 60, folder: 'triangle', name: 'Triangle' },
  { key: 61, folder: 'tambourine', name: 'Tambourine' },
  { key: 62, folder: 'castanets', name: 'Castanets' },
  { key: 63, folder: 'woodblock', name: 'Woodblock' },
  { key: 64, folder: 'cowbell', name: 'Cowbell' },
  { key: 65, folder: 'agogo bells', name: 'Agogo Bells' },
  { key: 66, folder: 'sleigh bells', name: 'Sleigh Bells' },
  { key: 67, folder: 'bell tree', name: 'Bell Tree' },
  { key: 68, folder: 'wind chimes', name: 'Wind Chimes' },
  { key: 69, folder: 'guiro', name: 'Guiro' },
  { key: 70, folder: 'cabasa', name: 'Cabasa' },
  { key: 71, folder: 'banana shaker', name: 'Banana Shaker' },
  { key: 72, folder: 'lemon shaker', name: 'Lemon Shaker' },
  { key: 73, folder: 'strawberry shaker', name: 'Strawberry Shaker' },
  { key: 74, folder: 'spring coil', name: 'Spring Coil' },
  { key: 75, folder: 'ratchet', name: 'Ratchet' },
  { key: 76, folder: 'whip', name: 'Whip' },
  { key: 77, folder: 'vibraslap', name: 'Vibraslap' },
  { key: 78, folder: 'flexatone', name: 'Flexatone' },
  { key: 79, folder: 'washboard', name: 'Washboard' },
  { key: 80, folder: 'squeaker', name: 'Squeaker' },
  { key: 81, folder: 'swanee whistle', name: 'Swanee Whistle' },
  { key: 82, folder: 'train whistle', name: 'Train Whistle' },
  { key: 83, folder: 'motor horn', name: 'Motor Horn' },
  { key: 84, folder: 'sheeps toenails', name: 'Sheeps Toenails' },
  { key: 85, folder: 'Chinese hand cymbals', name: 'Chinese Hand Cymbals' }
]

const SOLO_ORCHESTRA = [
  // --- Keyboard -----------------------------------------------------------
  {
    id: 'ov_piano',
    displayName: 'Piano',
    family: 'keyboard',
    icon: 'piano',
    mirrors: 'piano_bbcso',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_soft_imperial',
    displayName: 'Soft Imperial',
    family: 'keyboard',
    icon: 'piano',
    mirrors: 'soft_imperial',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_celeste',
    displayName: 'Celeste',
    family: 'keyboard',
    icon: 'celesta',
    mirrors: 'bbcso_celeste',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_tubular_bells',
    displayName: 'Tubular Bells',
    family: 'keyboard',
    icon: 'bells',
    mirrors: 'bbcso_tubular_bells',
    available: false,
    unavailableReason: NO_SAMPLES
  },

  // --- Strings ------------------------------------------------------------
  {
    id: 'ov_violin_1',
    displayName: 'Violins 1',
    family: 'strings',
    icon: 'violin',
    mirrors: 'bbcso_violin_1',
    available: true,
    sourcePack: 'violin',
    keyRange: [55, 103],
    articulations: ['long', 'short', 'pluck', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...STRING_SECTION, sectionSize: 16, maxVoices: 20, gamma: 1.35 }
  },
  {
    id: 'ov_violin_2',
    displayName: 'Violins 2',
    family: 'strings',
    icon: 'violin',
    mirrors: 'bbcso_violin_2',
    available: true,
    sourcePack: 'violin',
    keyRange: [55, 103],
    articulations: ['long', 'short', 'pluck', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...STRING_SECTION, sectionSize: 12, maxVoices: 18, gamma: 1.32 }
  },
  {
    id: 'ov_viola',
    displayName: 'Violas',
    family: 'strings',
    icon: 'viola',
    mirrors: 'bbcso_viola',
    available: true,
    sourcePack: 'viola',
    keyRange: [48, 98],
    articulations: ['long', 'short', 'pluck'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...STRING_SECTION, sectionSize: 8, maxVoices: 16, gamma: 1.3 }
  },
  {
    id: 'ov_cello',
    displayName: 'Cellos',
    family: 'strings',
    icon: 'cello',
    mirrors: 'bbcso_cello',
    available: true,
    sourcePack: 'cello',
    keyRange: [36, 84],
    articulations: ['long', 'short'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...STRING_SECTION, sectionSize: 8, maxVoices: 16, gamma: 1.28 }
  },
  {
    id: 'ov_bass',
    displayName: 'Double Basses',
    family: 'strings',
    icon: 'bass',
    mirrors: 'bbcso_bass',
    available: true,
    sourcePack: 'double bass',
    keyRange: [24, 67],
    articulations: ['long', 'short', 'pluck'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...STRING_SECTION, sectionSize: 6, maxVoices: 12, gamma: 1.25 }
  },
  {
    id: 'ov_celestial_strings',
    displayName: 'Celestial Strings',
    family: 'strings',
    icon: 'violin',
    mirrors: 'celestial_strings',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_harp',
    displayName: 'Harp',
    family: 'strings',
    icon: 'harp',
    mirrors: 'bbcso_harp',
    available: false,
    unavailableReason: NO_SAMPLES
  },

  // --- Woodwinds ----------------------------------------------------------
  {
    id: 'ov_piccolo',
    displayName: 'Piccolo',
    family: 'woodwinds',
    icon: 'flute',
    mirrors: 'bbcso_piccolo',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_flute',
    displayName: 'Flute',
    family: 'woodwinds',
    icon: 'flute',
    mirrors: 'bbcso_flute',
    available: true,
    sourcePack: 'flute',
    keyRange: [60, 101],
    articulations: ['long', 'short', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...WIND_SECTION, sectionSize: 2, maxVoices: 8, gamma: 1.4 }
  },
  {
    id: 'ov_oboe',
    displayName: 'Oboe',
    family: 'woodwinds',
    icon: 'oboe',
    mirrors: 'bbcso_oboe',
    available: true,
    sourcePack: 'oboe',
    keyRange: [58, 94],
    // The two oboe tremolo recordings are one-shots, so they cannot carry a sustain.
    articulations: ['long', 'short'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...WIND_SECTION, sectionSize: 2, maxVoices: 8, gamma: 1.38 }
  },
  {
    id: 'ov_clarinet',
    displayName: 'Clarinet',
    family: 'woodwinds',
    icon: 'clarinet',
    mirrors: 'bbcso_clarinet',
    available: true,
    sourcePack: 'clarinet',
    keyRange: [50, 96],
    articulations: ['long', 'short'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...WIND_SECTION, sectionSize: 2, maxVoices: 8, gamma: 1.36 }
  },
  {
    id: 'ov_bassoon',
    displayName: 'Bassoon',
    family: 'woodwinds',
    icon: 'bassoon',
    mirrors: 'bbcso_bassoon',
    available: true,
    sourcePack: 'bassoon',
    keyRange: [34, 79],
    articulations: ['long', 'short', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...WIND_SECTION, sectionSize: 2, maxVoices: 8, gamma: 1.3 }
  },

  // --- Brass --------------------------------------------------------------
  {
    id: 'ov_horn',
    displayName: 'Horn',
    family: 'brass',
    icon: 'horn',
    mirrors: 'bbcso_horn',
    available: true,
    sourcePack: 'french horn',
    keyRange: [34, 77],
    articulations: ['long', 'short'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...BRASS_SECTION, sectionSize: 4, maxVoices: 12, gamma: 1.42 }
  },
  {
    id: 'ov_trumpet',
    displayName: 'Trumpet',
    family: 'brass',
    icon: 'trumpet',
    mirrors: 'bbcso_trumpet',
    available: true,
    sourcePack: 'trumpet',
    keyRange: [40, 88],
    articulations: ['long', 'short'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...BRASS_SECTION, sectionSize: 6, maxVoices: 14, gamma: 1.45 }
  },
  {
    id: 'ov_tenor_trombone',
    displayName: 'Tenor Trombone',
    family: 'brass',
    icon: 'trombone',
    mirrors: 'bbcso_tenor_trombone',
    available: true,
    sourcePack: 'trombone',
    keyRange: [40, 88],
    articulations: ['long', 'short', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...BRASS_SECTION, sectionSize: 4, maxVoices: 12, gamma: 1.35 }
  },
  {
    id: 'ov_bass_trombone',
    displayName: 'Bass Trombone',
    family: 'brass',
    icon: 'trombone',
    mirrors: 'bbcso_bass_trombone',
    available: true,
    sourcePack: 'trombone',
    keyRange: [40, 72],
    articulations: ['long', 'short', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...BRASS_SECTION, sectionSize: 4, maxVoices: 10, gamma: 1.22 }
  },
  {
    id: 'ov_tuba',
    displayName: 'Tuba',
    family: 'brass',
    icon: 'tuba',
    mirrors: 'bbcso_tuba',
    available: true,
    sourcePack: 'tuba',
    keyRange: [22, 65],
    articulations: ['long', 'short', 'sustain'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { ...BRASS_SECTION, sectionSize: 2, maxVoices: 8, gamma: 1.2 }
  },

  // --- Percussion ---------------------------------------------------------
  {
    id: 'ov_timpani',
    displayName: 'Timpani',
    family: 'percussion',
    icon: 'timpani',
    mirrors: 'bbcso_timpani',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_untuned_percussion',
    displayName: 'Untuned Percussion',
    family: 'percussion',
    icon: 'bassdrum',
    mirrors: 'bbcso_untuned_percussion',
    available: true,
    sourcePack: 'percussion',
    keymap: UNTUNED_KEYMAP,
    articulations: ['hit'],
    velocityLayers: { crossfadeWidth: 8 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { sectionSize: 1, maxVoices: 12, detuneCents: 0, gamma: 1.1, noise: 'none', vibrato: false }
  },
  {
    id: 'ov_small_percussion',
    displayName: 'Small Percussion',
    family: 'percussion',
    icon: 'triangle',
    mirrors: 'small_percussion',
    available: true,
    sourcePack: 'percussion',
    keymap: SMALL_KEYMAP,
    articulations: ['hit'],
    velocityLayers: { crossfadeWidth: 8 },
    roundRobin: { enabled: true, maxVariations: 4 },
    voiceModel: { sectionSize: 1, maxVoices: 12, detuneCents: 0, gamma: 1.05, noise: 'none', vibrato: false }
  },
  {
    id: 'ov_marimba',
    displayName: 'Marimba',
    family: 'percussion',
    icon: 'marimba',
    mirrors: 'bbcso_marimba',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_xylophone',
    displayName: 'Xylophone',
    family: 'percussion',
    icon: 'marimba',
    mirrors: 'bbcso_xylophone',
    available: false,
    unavailableReason: NO_SAMPLES
  },
  {
    id: 'ov_glockenspiel',
    displayName: 'Glockenspiel',
    family: 'percussion',
    icon: 'glock',
    mirrors: 'bbcso_glockenspiel',
    available: false,
    unavailableReason: NO_SAMPLES
  },

  // --- Others -------------------------------------------------------------
  {
    id: 'ov_angelic_choir',
    displayName: 'Angelic Choir',
    family: 'others',
    icon: 'choir',
    mirrors: 'angelic_choir',
    available: false,
    unavailableReason: NO_SAMPLES
  }
]

/** Recorded ensembles, so the engine must not synthesise one by stacking detuned copies:
 * `sectionSize: 1` and no detune, and the gain trim that compensates for that stacking is
 * lifted back to unity. */
const ENSEMBLE = {
  sectionSize: 1,
  detuneCents: 0,
  gainTrim: 0.9
}

const SYMPHONIC_ORCHESTRA = [
  {
    id: 'ov_sym_violins_1',
    displayName: '1st Violins',
    family: 'strings',
    icon: 'violin',
    available: true,
    sourcePack: '1st Violins',
    keyRange: [55, 96],
    articulations: ['long', 'short', 'pluck'],
    velocityLayers: { crossfadeWidth: 0 },
    roundRobin: { enabled: false },
    voiceModel: { ...ENSEMBLE, maxVoices: 20, gamma: 1.3, noise: 'bow', vibrato: true }
  },
  {
    id: 'ov_sym_celli',
    displayName: 'Celli',
    family: 'strings',
    icon: 'cello',
    available: true,
    sourcePack: 'Celli',
    keyRange: [36, 82],
    articulations: ['long'],
    velocityLayers: { crossfadeWidth: 0 },
    roundRobin: { enabled: false },
    voiceModel: { ...ENSEMBLE, maxVoices: 16, gamma: 1.28, noise: 'bow', vibrato: true }
  },
  {
    id: 'ov_sym_tutti_strings',
    displayName: 'Tutti Strings',
    family: 'strings',
    icon: 'violin',
    available: true,
    sourcePack: 'Tutti Strings',
    keyRange: [23, 98],
    articulations: ['long'],
    velocityLayers: { crossfadeWidth: 0 },
    roundRobin: { enabled: false },
    voiceModel: { ...ENSEMBLE, maxVoices: 24, gamma: 1.32, noise: 'bow', vibrato: true }
  },
  {
    id: 'ov_sym_horns',
    displayName: 'Horns',
    family: 'brass',
    icon: 'horn',
    available: true,
    sourcePack: 'Horns',
    keyRange: [33, 77],
    articulations: ['long'],
    velocityLayers: { crossfadeWidth: 0 },
    roundRobin: { enabled: false },
    voiceModel: { ...ENSEMBLE, maxVoices: 16, gamma: 1.4, noise: 'air', vibrato: false }
  },
  {
    id: 'ov_sym_piano',
    displayName: 'Piano',
    family: 'keyboard',
    icon: 'piano',
    available: true,
    sourcePack: 'Piano',
    keyRange: [12, 108],
    articulations: ['long'],
    velocityLayers: { crossfadeWidth: 0 },
    roundRobin: { enabled: false },
    pedal: true,
    // Only one dynamic was recorded, so velocity has to carry the whole range on its own;
    // 0.85 spans roughly 16 dB instead of the 5 dB a layered library needs.
    voiceModel: {
      ...ENSEMBLE,
      maxVoices: 32,
      gamma: 1.15,
      velocityTrack: 0.85,
      noise: 'none',
      vibrato: false
    }
  }
]

function stamp (library, list) {
  return list.map((item) => ({ library, ...item }))
}

export const CATALOG = [
  ...stamp('vms-solo', SOLO_ORCHESTRA),
  ...stamp('vms-symphonic', SYMPHONIC_ORCHESTRA)
]

export const DEFAULT_INSTRUMENT_ID = 'ov_violin_1'

const BY_ID = new Map(CATALOG.map((item) => [item.id, item]))

export function findDefinition (id) {
  return BY_ID.get(String(id || '')) || null
}

export function isOrchestraVDefinition (id) {
  return String(id || '').startsWith('ov_')
}

export function availableDefinitions () {
  return CATALOG.filter((item) => item.available)
}

/** Which library holds this instrument's samples. */
export function libraryOf (def) {
  const entry = typeof def === 'string' ? findDefinition(def) : def
  const id = entry && entry.library
  return findLibrary(id) ? id : DEFAULT_LIBRARY_ID
}

export function definitionsInLibrary (libraryId) {
  return CATALOG.filter((item) => libraryOf(item) === libraryId)
}

/** Velocity crossfade half-width for an instrument, in MIDI velocity units. */
export function crossfadeWidth (def) {
  const raw = def && def.velocityLayers && def.velocityLayers.crossfadeWidth
  return raw == null ? 10 : Math.max(0, Math.min(32, raw | 0))
}

/** How many samples may share one key/layer slot as round-robin variations. */
export function maxVariations (def) {
  const rr = def && def.roundRobin
  if (rr && rr.enabled === false) return 1
  const raw = rr && rr.maxVariations
  return raw == null ? 4 : Math.max(1, Math.min(16, raw | 0))
}
