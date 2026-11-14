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
  INPUT_AUTO,
  detectInputMode,
  resolveInputMode,
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
if (normalizeInputMode('tablet') !== INPUT_AUTO) throw new Error('unknown pointer modes fall back to auto')
if (readInputMode() !== INPUT_AUTO) throw new Error('nothing stored reads as auto')
writeInputMode(INPUT_TOUCH)
if (store.get(INPUT_MODE_KEY) !== INPUT_TOUCH) throw new Error('touch mode was not stored')
if (readInputMode() !== INPUT_TOUCH) throw new Error('touch mode was not read back')
writeInputMode(INPUT_PC)
if (readInputMode() !== INPUT_PC) throw new Error('PC mode was not read back')

const ipad = { coarse: true, fine: false, hover: false, maxTouchPoints: 5, platform: 'MacIntel' }
const mac = { coarse: false, fine: true, hover: true, maxTouchPoints: 0, platform: 'MacIntel' }
const touchLaptop = { coarse: false, fine: true, hover: true, maxTouchPoints: 10, platform: 'Win32' }
const phone = { coarse: true, fine: false, hover: false, maxTouchPoints: 5, platform: 'Linux armv8l' }
const ipadWithMouse = { coarse: false, fine: true, hover: true, maxTouchPoints: 5, platform: 'MacIntel' }
if (detectInputMode(ipad) !== INPUT_TOUCH) throw new Error('iPad is touch')
if (detectInputMode(ipadWithMouse) !== INPUT_TOUCH) throw new Error('iPad presenting as a Mac is still touch')
if (detectInputMode(mac) !== INPUT_PC) throw new Error('Mac is PC')
if (detectInputMode(touchLaptop) !== INPUT_PC) throw new Error('a touchscreen laptop leads with its trackpad')
if (detectInputMode(phone) !== INPUT_TOUCH) throw new Error('phone is touch')
if (detectInputMode({}) !== INPUT_PC) throw new Error('unknown devices are PC')

if (resolveInputMode(INPUT_AUTO, 'touch', INPUT_PC) !== INPUT_TOUCH) throw new Error('auto: a finger is touch')
if (resolveInputMode(INPUT_AUTO, 'mouse', INPUT_TOUCH) !== INPUT_PC) throw new Error('auto: a mouse on an iPad is PC')
if (resolveInputMode(INPUT_AUTO, 'pen', INPUT_TOUCH) !== INPUT_PC) throw new Error('auto: a pen edits precisely')
if (resolveInputMode(INPUT_AUTO, '', INPUT_TOUCH) !== INPUT_TOUCH) throw new Error('auto without a pointer follows the device')
if (resolveInputMode(INPUT_PC, 'touch', INPUT_TOUCH) !== INPUT_PC) throw new Error('explicit PC wins')
if (resolveInputMode(INPUT_TOUCH, 'mouse', INPUT_PC) !== INPUT_TOUCH) throw new Error('explicit touch wins')

console.log('ui-mode ok')
