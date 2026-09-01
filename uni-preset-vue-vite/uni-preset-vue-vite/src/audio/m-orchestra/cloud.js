/** Lazy M Orchestra engine. Parsing the 2.5MB manifest waits until first use. */

let engine = null
let loading = null

export async function loadOrchestraEngine () {
  if (engine) return engine
  if (!loading) loading = import('./engine.js').then((mod) => { engine = mod; return mod })
  return loading
}

function sync (name, ...args) {
  if (!engine) return
  return engine[name](...args)
}

export async function noteOn (...args) {
  const mod = await loadOrchestraEngine()
  return mod.noteOn(...args)
}

export async function preloadInstrument (...args) {
  const mod = await loadOrchestraEngine()
  return mod.preloadInstrument(...args)
}

export async function preloadNotes (...args) {
  const mod = await loadOrchestraEngine()
  return mod.preloadNotes(...args)
}

export function noteOff (...args) { return sync('noteOff', ...args) }
export function allNotesOff (...args) { return sync('allNotesOff', ...args) }
export function cancelPending (...args) { return sync('cancelPending', ...args) }
export function applyControllers (...args) { return sync('applyControllers', ...args) }
export function findInstrument (...args) { return engine ? engine.findInstrument(...args) : null }
export function sampleCount () { return engine ? engine.sampleCount() : 0 }
export function ensureManifest () {
  return loadOrchestraEngine().then((mod) => mod.ensureManifest())
}
