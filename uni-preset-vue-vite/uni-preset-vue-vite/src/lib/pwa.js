/** Installable app + offline shell. Builds only: in dev a worker would fight Vite's HMR.
 * The JUCE host serves its own copy of the UI and never gets a worker. */
export function registerServiceWorker () {
  if (!import.meta.env.PROD) return
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return
  if (window.__JUCE__ || /juce/i.test(location.hostname)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  }, { once: true })
}
