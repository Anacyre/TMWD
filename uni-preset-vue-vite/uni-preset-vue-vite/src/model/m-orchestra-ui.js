/** M Orchestra plugin catalogue for the dedicated plugin UI (not the DAW instrument browser). */

export const M_ORCHESTRA_PLUGIN_ID = 'm_orchestra'
export const M_ORCHESTRA_DEFAULT_ID = 'm_orch_violin_1'
export const ORCHESTRA_SAMPLER_PLUGIN_ID = 'orchestra_sampler'
export const TEST_SYNTH_PLUGIN_ID = 'test_synth'
export const WEB_SAMPLER_PLUGIN_ID = 'web_sampler'

export const FAMILIES = [
  { id: 'strings', label: 'Strings' },
  { id: 'woodwinds', label: 'Woodwinds' },
  { id: 'brass', label: 'Brass' },
  { id: 'percussion', label: 'Percussion' },
  { id: 'solo', label: 'Solo' },
  { id: 'keyboard', label: 'Keyboard' }
]

export const INSTRUMENTS = [
  { id: 'm_orch_violin_1', name: 'Violins 1', family: 'strings', available: true, icon: 'violin' },
  { id: 'm_orch_violin_2', name: 'Violins 2', family: 'strings', available: true, icon: 'violin' },
  { id: 'm_orch_viola', name: 'Violas', family: 'strings', available: true, icon: 'viola' },
  { id: 'm_orch_cello', name: 'Cellos', family: 'strings', available: true, icon: 'cello' },
  { id: 'm_orch_bass', name: 'Double Basses', family: 'strings', available: true, icon: 'bass' },
  { id: 'm_orch_harp', name: 'Harp', family: 'strings', available: false, icon: 'harp' },

  { id: 'm_orch_piccolo', name: 'Piccolo', family: 'woodwinds', available: false, icon: 'flute' },
  { id: 'm_orch_flute', name: 'Flute', family: 'woodwinds', available: true, icon: 'flute' },
  { id: 'm_orch_oboe', name: 'Oboe', family: 'woodwinds', available: true, icon: 'oboe' },
  { id: 'm_orch_clarinet', name: 'Clarinet', family: 'woodwinds', available: true, icon: 'clarinet' },
  { id: 'm_orch_bassoon', name: 'Bassoon', family: 'woodwinds', available: true, icon: 'bassoon' },
  { id: 'm_orch_contra_bassoon', name: 'Contra Bassoon', family: 'woodwinds', available: false, icon: 'bassoon' },

  { id: 'm_orch_horn', name: 'Horn', family: 'brass', available: true, icon: 'horn' },
  { id: 'm_orch_trumpet', name: 'Trumpet', family: 'brass', available: true, icon: 'trumpet' },
  { id: 'm_orch_trombone', name: 'Trombone', family: 'brass', available: true, icon: 'trombone' },
  { id: 'm_orch_bass_trombone', name: 'Bass Trombone', family: 'brass', available: true, icon: 'trombone' },
  { id: 'm_orch_tuba', name: 'Tuba', family: 'brass', available: true, icon: 'tuba' },

  { id: 'm_orch_timpani', name: 'Timpani', family: 'percussion', available: false, icon: 'timpani' },
  { id: 'm_orch_snare', name: 'Snare Drum', family: 'percussion', available: true, icon: 'snare' },
  { id: 'm_orch_bass_drum', name: 'Bass Drum', family: 'percussion', available: true, icon: 'bassdrum' },
  { id: 'm_orch_cymbals', name: 'Cymbals', family: 'percussion', available: true, icon: 'cymbal' },
  { id: 'm_orch_suspended_cymbal', name: 'Sus. Cymbal', family: 'percussion', available: true, icon: 'cymbal' },
  { id: 'm_orch_tom', name: 'Tom', family: 'percussion', available: true, icon: 'tom' },
  { id: 'm_orch_triangle', name: 'Triangle', family: 'percussion', available: true, icon: 'triangle' },
  { id: 'm_orch_glock', name: 'Glockenspiel', family: 'percussion', available: false, icon: 'glock' },

  { id: 'm_orch_solo_violin', name: 'Solo Violin', family: 'solo', available: true, icon: 'violin' },
  { id: 'm_orch_solo_cello', name: 'Solo Cello', family: 'solo', available: true, icon: 'cello' },
  { id: 'm_orch_solo_flute', name: 'Solo Flute', family: 'solo', available: true, icon: 'flute' },
  { id: 'm_orch_solo_clarinet', name: 'Solo Clarinet', family: 'solo', available: true, icon: 'clarinet' },
  { id: 'm_orch_solo_horn', name: 'Solo Horn', family: 'solo', available: true, icon: 'horn' },

  { id: 'm_orch_piano', name: 'Piano', family: 'keyboard', available: false, icon: 'piano' },
  { id: 'm_orch_celesta', name: 'Celesta', family: 'keyboard', available: false, icon: 'piano' },
  { id: 'm_orch_tubular_bells', name: 'Tubular Bells', family: 'keyboard', available: false, icon: 'bells' }
]

export function familyOf (definitionId) {
  const item = INSTRUMENTS.find((entry) => entry.id === definitionId)
  return item ? item.family : 'strings'
}

export function isMOrchestraDefinition (definitionId) {
  return String(definitionId || '').startsWith('m_orch_')
}

export function isMOrchestraTrack (track) {
  if (!track) return false
  return track.source === 'm-orchestra' || isMOrchestraDefinition(track.definitionId)
}

export function mOrchestraInstrument (definitionId) {
  return INSTRUMENTS.find((entry) => entry.id === definitionId) || null
}

export const CLOUD_TECHNIQUES = {
  long: { id: 'm_orch_long', displayName: 'Long', mapped: true, available: true },
  short: { id: 'm_orch_short', displayName: 'Short', mapped: true, available: true },
  hit: { id: 'm_orch_hit', displayName: 'Hit', mapped: true, available: true },
  pizz: { id: 'm_orch_pizz', displayName: 'Pizz', mapped: true, available: true },
  trem: { id: 'm_orch_trem', displayName: 'Trem', mapped: true, available: true }
}

const PIZZ_IDS = new Set([
  'm_orch_violin_1',
  'm_orch_violin_2',
  'm_orch_viola',
  'm_orch_bass',
  'm_orch_solo_violin'
])

const TREM_IDS = new Set([
  'm_orch_violin_1',
  'm_orch_violin_2',
  'm_orch_solo_violin'
])

export function cloudTechniquesFor (definitionId) {
  const item = mOrchestraInstrument(definitionId)
  if (item && item.family === 'percussion') return [CLOUD_TECHNIQUES.hit]
  const list = [CLOUD_TECHNIQUES.long, CLOUD_TECHNIQUES.short]
  if (PIZZ_IDS.has(definitionId)) list.push(CLOUD_TECHNIQUES.pizz)
  if (TREM_IDS.has(definitionId)) list.push(CLOUD_TECHNIQUES.trem)
  return list
}

export const CLOUD_CONTROLLERS = [
  { id: 'dynamics', displayName: 'Dynamics', mapped: true },
  { id: 'expression', displayName: 'Expression', mapped: true },
  { id: 'vibrato', displayName: 'Vibrato', mapped: true }
]

export function insertablePlugins (options = {}) {
  const engine = !!options.engineConnected
  const list = [
    { id: M_ORCHESTRA_PLUGIN_ID, displayName: 'M Orchestra', detail: 'Browser cloud samples', available: true },
    {
      id: ORCHESTRA_SAMPLER_PLUGIN_ID,
      displayName: 'Orchestra Sampler',
      detail: engine
        ? 'BBCSO Discover / Synchron Player'
        : 'Needs DawWeb.exe on the PC (LAN HTTP). Cloudflare HTTPS cannot reach localhost.',
      available: engine,
      requiresEngine: true
    },
    { id: TEST_SYNTH_PLUGIN_ID, displayName: 'Test Synth', detail: 'Built-in', available: true }
  ]
  if (options.includeWebSampler !== false) {
    list.push({ id: WEB_SAMPLER_PLUGIN_ID, displayName: 'Web Sampler', detail: 'Browser WAV sampler', available: true })
  }
  return list
}
