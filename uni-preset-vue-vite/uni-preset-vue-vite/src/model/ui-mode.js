/** Interface presentation mode. Not a project format. */

export const INTERFACE_MODE_KEY = 'dawweb.interfaceMode'
export const LITE_HINT_KEY = 'dawweb.liteHintDismissed'

export const INTERFACE_PROFESSIONAL = 'professional'
export const INTERFACE_LITE = 'lite'
/** The previous touch shell, kept as-is for users who prefer it. */
export const INTERFACE_LE = 'le'

const MODES = [INTERFACE_PROFESSIONAL, INTERFACE_LITE, INTERFACE_LE]

export function normalizeInterfaceMode (mode) {
  return MODES.includes(mode) ? mode : INTERFACE_LITE
}

export function readInterfaceMode () {
  if (typeof localStorage === 'undefined') return INTERFACE_LITE
  try {
    return normalizeInterfaceMode(localStorage.getItem(INTERFACE_MODE_KEY))
  } catch (err) {
    return INTERFACE_LITE
  }
}

export function writeInterfaceMode (mode) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(INTERFACE_MODE_KEY, normalizeInterfaceMode(mode))
  } catch (err) { /* private mode */ }
}

export function readLiteHintDismissed () {
  if (typeof localStorage === 'undefined') return false
  try {
    return localStorage.getItem(LITE_HINT_KEY) === '1'
  } catch (err) {
    return false
  }
}

export function writeLiteHintDismissed () {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(LITE_HINT_KEY, '1')
  } catch (err) { /* private mode */ }
}

/** True for both touch shells (Lite and LE). Shared components key touch behaviour off this. */
export function isLiteMode (mode) {
  return normalizeInterfaceMode(mode) !== INTERFACE_PROFESSIONAL
}

/** Which shell to mount: 'professional' | 'lite' | 'le'. */
export function interfaceShellOf (mode) {
  return normalizeInterfaceMode(mode)
}

/** How Lite listens to a pointer. Not a project format. */
export const INPUT_MODE_KEY = 'dawweb.inputMode'
export const INPUT_TOUCH = 'touch'
export const INPUT_PC = 'pc'
/** Fingers behave as Touch, mouse and pen as PC; decided per pointer. */
export const INPUT_AUTO = 'auto'

export function normalizeInputMode (mode) {
  return mode === INPUT_TOUCH || mode === INPUT_PC ? mode : INPUT_AUTO
}

export function readInputMode () {
  if (typeof localStorage === 'undefined') return INPUT_AUTO
  try {
    return normalizeInputMode(localStorage.getItem(INPUT_MODE_KEY))
  } catch (err) {
    return INPUT_AUTO
  }
}

/**
 * The device's main pointer, for decisions made without a pointer event (hints, layout).
 * `env = { coarse, fine, hover, maxTouchPoints, platform }`. iPadOS reports a Mac
 * platform, so touch points decide there.
 */
export function detectInputMode (env = {}) {
  const touchPoints = Number(env.maxTouchPoints) || 0
  if (/Mac/i.test(env.platform || '') && touchPoints > 1) return INPUT_TOUCH
  if (env.coarse && !env.fine) return INPUT_TOUCH
  if (env.coarse && touchPoints > 0 && !env.hover) return INPUT_TOUCH
  return INPUT_PC
}

export function readDeviceEnv () {
  if (typeof window === 'undefined') return {}
  const match = (q) => !!(window.matchMedia && window.matchMedia(q).matches)
  const nav = typeof navigator !== 'undefined' ? navigator : {}
  return {
    coarse: match('(pointer: coarse)'),
    fine: match('(any-pointer: fine)'),
    hover: match('(hover: hover)'),
    maxTouchPoints: nav.maxTouchPoints || 0,
    platform: (nav.userAgentData && nav.userAgentData.platform) || nav.platform || ''
  }
}

/** Touch or PC for one interaction. Explicit modes win; Auto follows the pointer type. */
export function resolveInputMode (mode, pointerType, deviceMode) {
  const pref = normalizeInputMode(mode)
  if (pref !== INPUT_AUTO) return pref
  if (pointerType === 'touch') return INPUT_TOUCH
  if (pointerType === 'mouse' || pointerType === 'pen') return INPUT_PC
  return deviceMode === INPUT_TOUCH ? INPUT_TOUCH : INPUT_PC
}

export function writeInputMode (mode) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(INPUT_MODE_KEY, normalizeInputMode(mode))
  } catch (err) { /* private mode */ }
}
