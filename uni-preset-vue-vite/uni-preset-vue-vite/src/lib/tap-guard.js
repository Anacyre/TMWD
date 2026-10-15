/**
 * One tablet tap can deliver two clicks (synthetic click + uni-app tap). The guard
 * lets the first through and swallows repeats until `windowMs` has passed.
 */
export function createTapGuard (windowMs = 400, now = () => Date.now()) {
  let lastAt = -Infinity
  return function allow () {
    const t = now()
    if (t - lastAt < windowMs) return false
    lastAt = t
    return true
  }
}
