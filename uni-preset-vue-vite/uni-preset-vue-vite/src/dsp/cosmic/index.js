export const COSMIC_PLUGIN_ID = 'cosmic-2'
export {
  defaultCosmicState,
  normalizeCosmicState,
  WAVES,
  WT_NAMES,
  WARPS,
  FILTER_TYPES,
  NOISE_TYPES,
  LFO_SHAPES,
  LFO_MODES,
  PLAY_MODES,
  FX_IDS,
  MOD_SOURCES,
  MOD_DESTS,
  SRC_COLORS
} from './dsp.js'
export { COSMIC_PRESETS, cosmicPresetById } from './presets.js'
export { renderCosmicNote } from './voice.js'
export {
  noteOn,
  noteOff,
  cancelPending,
  allNotesOff,
  noteReady,
  preloadNotes,
  applyControllers,
  updateCosmicState,
  renderNoteAt,
  setPerformance,
  setClock,
  setTransportBpm,
  onCosmicScope,
  onCosmicLive,
  watchCosmic
} from './engine.js'
