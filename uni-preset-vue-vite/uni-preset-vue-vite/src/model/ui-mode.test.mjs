import {
  INTERFACE_LE,
  INTERFACE_LITE,
  INTERFACE_MODE_KEY,
  INTERFACE_PROFESSIONAL,
  interfaceShellOf,
  isLiteMode,
  normalizeInterfaceMode,
  readInterfaceMode,
  writeInterfaceMode,
  INPUT_MODE_KEY,
  INPUT_PC,
  INPUT_TOUCH,
  normalizeInputMode,
  readInputMode,
  writeInputMode
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

if (normalizeInputMode('touch') !== INPUT_TOUCH) throw new Error('touch is a pointer mode')
if (normalizeInputMode('pc') !== INPUT_PC) throw new Error('pc is a pointer mode')
if (normalizeInputMode('tablet') !== INPUT_PC) throw new Error('unknown pointer modes stay on PC')
writeInputMode(INPUT_TOUCH)
if (store.get(INPUT_MODE_KEY) !== INPUT_TOUCH) throw new Error('touch mode was not stored')
if (readInputMode() !== INPUT_TOUCH) throw new Error('touch mode was not read back')
writeInputMode(INPUT_PC)
if (readInputMode() !== INPUT_PC) throw new Error('PC mode was not read back')

console.log('ui-mode ok')
