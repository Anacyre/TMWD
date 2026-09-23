/** Lazy Orchestra V engine. The store imports this so the 2.5MB sample manifest and the
 * region compiler are only parsed once a track actually uses the sampler. Mirrors the
 * shape of m-orchestra/cloud.js so session.js wires both samplers the same way. */

let engine = null
let loading = null

export async function loadOrchestraVEngine () {
  if (engine) return engine
  if (!loading) loading = import('./engine.js').then((mod) => { engine = mod; return mod })
  return loading
}

function sync (name, ...args) {
  if (!engine) return undefined
  return engine[name](...args)
}

export async function noteOn (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.noteOn(...args)
}

export async function loadInstrument (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.loadInstrument(...args)
}

export async function preloadInstrument (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.preloadInstrument(...args)
}

export async function preloadNotes (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.preloadNotes(...args)
}

export function decodeBacklog () {
  return engine ? engine.decodeBacklog() : 0
}

export async function zonesForPitches (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.zonesForPitches(...args)
}

export async function warmEncoded (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.warmEncoded(...args)
}

export async function availableArticulations (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.availableArticulations(...args)
}

export async function ensureManifest (...args) {
  const mod = await loadOrchestraVEngine()
  return mod.ensureManifest(...args)
}

export function noteOff (...args) { return sync('noteOff', ...args) }
export function allNotesOff (...args) { return sync('allNotesOff', ...args) }
export function cancelPending (...args) { return sync('cancelPending', ...args) }
export function applyControllers (...args) { return sync('applyControllers', ...args) }
export function regionMapFor (...args) { return engine ? engine.regionMapFor(...args) : null }
export function sampleCount (...args) { return engine ? engine.sampleCount(...args) : 0 }
export function getLoadDiagnostics () { return engine ? engine.getLoadDiagnostics() : null }
