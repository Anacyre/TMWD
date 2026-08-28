/** Interface presentation mode. Not a project format. */

export const INTERFACE_MODE_KEY = 'dawweb.interfaceMode'
export const LITE_HINT_KEY = 'dawweb.liteHintDismissed'

export const INTERFACE_PROFESSIONAL = 'professional'
export const INTERFACE_LITE = 'lite'

export function readInterfaceMode () {
  if (typeof localStorage === 'undefined') return INTERFACE_LITE
  try {
    const value = localStorage.getItem(INTERFACE_MODE_KEY)
    if (value === INTERFACE_PROFESSIONAL) return INTERFACE_PROFESSIONAL
    return INTERFACE_LITE
  } catch (err) {
    return INTERFACE_LITE
  }
}

export function writeInterfaceMode (mode) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(INTERFACE_MODE_KEY, mode === INTERFACE_PROFESSIONAL ? INTERFACE_PROFESSIONAL : INTERFACE_LITE)
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

export function isLiteMode (mode) {
  return mode !== INTERFACE_PROFESSIONAL
}
