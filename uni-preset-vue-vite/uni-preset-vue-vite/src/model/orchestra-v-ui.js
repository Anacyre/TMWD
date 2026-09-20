/** Orchestra V presentation model.
 *
 * Reads the same catalogue the region compiler uses, so the grid can never offer an
 * instrument the engine cannot build. Technique names follow the Orchestra Sampler
 * wording (Spiccato for strings, Staccatissimo for winds and brass) even though both
 * resolve to the same short cloud articulation.
 */

import { CATALOG, DEFAULT_INSTRUMENT_ID, findDefinition, isOrchestraVDefinition, libraryOf } from '../audio/orchestra-v/catalog.js'
import { LIBRARIES, DEFAULT_LIBRARY_ID } from '../audio/orchestra-v/libraries.js'

export const ORCHESTRA_V_PLUGIN_ID = 'orchestra_v'
export const ORCHESTRA_V_DEFAULT_ID = DEFAULT_INSTRUMENT_ID

export { isOrchestraVDefinition, DEFAULT_LIBRARY_ID }

export const FAMILIES = [
  { id: 'strings', label: 'Strings', mark: '🎻' },
  { id: 'woodwinds', label: 'Woodwinds', mark: '🎶' },
  { id: 'brass', label: 'Brass', mark: '📯' },
  { id: 'percussion', label: 'Percussion', mark: '🥁' },
  { id: 'keyboard', label: 'Keyboard', mark: '🎹' },
  { id: 'others', label: 'Others', mark: '◇' }
]

export const INSTRUMENTS = CATALOG.map((item) => ({
  id: item.id,
  name: item.displayName,
  library: libraryOf(item),
  family: item.family,
  icon: item.icon || 'violin',
  available: !!item.available,
  pedal: !!item.pedal,
  detail: item.unavailableReason || ''
}))

/** Library picker rows, each with how many of its instruments can actually play. */
export const LIBRARY_OPTIONS = LIBRARIES.map((library) => {
  const mine = INSTRUMENTS.filter((item) => item.library === library.id)
  return {
    id: library.id,
    label: library.displayName,
    detail: library.detail,
    total: mine.length,
    available: mine.filter((item) => item.available).length
  }
})

export function orchestraVInstrument (definitionId) {
  return INSTRUMENTS.find((item) => item.id === definitionId) || null
}

export function instrumentsInLibrary (libraryId) {
  return INSTRUMENTS.filter((item) => item.library === libraryId)
}

export function libraryIdFor (definitionId) {
  const item = orchestraVInstrument(definitionId)
  return item ? item.library : DEFAULT_LIBRARY_ID
}

export function orchestraVUsesPedal (definitionId) {
  const item = orchestraVInstrument(definitionId)
  return !!(item && item.pedal)
}

export function familyOf (definitionId) {
  const item = orchestraVInstrument(definitionId)
  return item ? item.family : 'strings'
}

export function isOrchestraVTrack (track) {
  if (!track) return false
  return track.source === 'orchestra-v' || isOrchestraVDefinition(track.definitionId)
}

export const TECHNIQUES = {
  long: { id: 'ov_long', displayName: 'Long', articulation: 'long' },
  short: { id: 'ov_short', displayName: 'Short', articulation: 'short' },
  pluck: { id: 'ov_pizz', displayName: 'Pizzicato', articulation: 'pluck' },
  sustain: { id: 'ov_trem', displayName: 'Tremolo', articulation: 'sustain' },
  hit: { id: 'ov_hit', displayName: 'Hit', articulation: 'hit' }
}

export const DEFAULT_TECHNIQUE_ID = TECHNIQUES.long.id

/** Strings call the short articulation Spiccato; winds and brass call it Staccatissimo. */
function shortNameFor (family) {
  if (family === 'strings') return 'Spiccato'
  if (family === 'woodwinds' || family === 'brass') return 'Staccatissimo'
  return 'Short'
}

/**
 * Technique chips for an instrument. Everything the Orchestra Sampler offers is listed;
 * the ones the cloud library cannot cover come back with `available: false` so the UI
 * greys them out instead of hiding them.
 */
export function techniquesFor (definitionId) {
  const def = findDefinition(definitionId)
  if (!def) return []
  const supported = new Set(def.articulations || [])
  if (def.family === 'percussion' && supported.has('hit')) {
    return [{ ...TECHNIQUES.hit, available: def.available }]
  }
  // A keyboard has no articulation to choose; the pedal is what shapes the note.
  if (def.family === 'keyboard') {
    return [{ ...TECHNIQUES.long, displayName: 'Sustain', available: def.available }]
  }
  const offered = def.family === 'strings'
    ? ['long', 'short', 'pluck', 'sustain']
    : ['long', 'short']
  return offered.map((artic) => {
    const base = TECHNIQUES[artic]
    const displayName = artic === 'short' ? shortNameFor(def.family) : base.displayName
    return { ...base, displayName, available: def.available && supported.has(artic) }
  })
}

export function defaultTechniqueFor (definitionId) {
  const list = techniquesFor(definitionId)
  const first = list.find((item) => item.available) || list[0]
  return first ? first.id : DEFAULT_TECHNIQUE_ID
}

/** The four performance knobs from the Orchestra V panel. */
export const CONTROLLERS = [
  { id: 'dynamics', displayName: 'Dynamics', defaultValue: 100 / 127 },
  { id: 'expression', displayName: 'Expression', defaultValue: 100 / 127 },
  { id: 'reverb', displayName: 'Reverb', defaultValue: 30 / 127 },
  { id: 'release', displayName: 'Release', defaultValue: 50 / 127 }
]

/** The cloud library is single-mic, so these blend dry signal, early reflections and
 * tail rather than three real microphone positions. */
export const MIC_MIX = [
  { id: 'micClose', displayName: 'Close', defaultValue: 1 },
  { id: 'micDecca', displayName: 'Decca', defaultValue: 45 / 127 },
  { id: 'micHall', displayName: 'Hall', defaultValue: 25 / 127 }
]

export const WHEELS = [
  { id: 'mod', displayName: 'Mod', defaultValue: 40 / 127 },
  { id: 'pitch', displayName: 'Pitch', defaultValue: 0.5, centred: true }
]

export function defaultControllerValues () {
  const values = {}
  for (const ctrl of [...CONTROLLERS, ...MIC_MIX, ...WHEELS]) values[ctrl.id] = ctrl.defaultValue
  return values
}
