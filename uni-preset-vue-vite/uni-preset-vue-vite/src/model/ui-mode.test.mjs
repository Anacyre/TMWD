import {
  INTERFACE_LE,
  INTERFACE_LITE,
  INTERFACE_MODE_KEY,
  INTERFACE_PROFESSIONAL,
  interfaceShellOf,
  isLiteMode,
  normalizeInterfaceMode,
  readInterfaceMode,
  writeInterfaceMode
} from './ui-mode.js'

const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)) }
}

for (const mode of [INTERFACE_PROFESSIONAL, INTERFACE_LITE, INTERFACE_LE]) {
  if (normalizeInterfaceMode(mode) !== mode) throw new Error('mode should survive normalize: ' + mode)
  if (interfaceShellOf(mode) !== mode) throw new Error('each mode mounts its own shell: ' + mode)
  writeInterfaceMode(mode)
  if (store.get(INTERFACE_MODE_KEY) !== mode) throw new Error('mode not persisted: ' + mode)
  if (readInterfaceMode() !== mode) throw new Error('mode not read back: ' + mode)
}

if (normalizeInterfaceMode('tablet') !== INTERFACE_LITE) throw new Error('unknown modes fall back to lite')
if (normalizeInterfaceMode(null) !== INTERFACE_LITE) throw new Error('missing mode falls back to lite')
if (isLiteMode(INTERFACE_PROFESSIONAL)) throw new Error('professional is not a touch shell')
if (!isLiteMode(INTERFACE_LITE) || !isLiteMode(INTERFACE_LE)) throw new Error('lite and LE are both touch shells')

store.set(INTERFACE_MODE_KEY, 'garbage')
if (readInterfaceMode() !== INTERFACE_LITE) throw new Error('a corrupt stored mode reads as lite')

console.log('ui-mode ok')
