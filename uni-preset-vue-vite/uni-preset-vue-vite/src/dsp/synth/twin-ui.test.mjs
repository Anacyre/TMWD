import {
  freqToX, xToFreq, nodeY, yToRes, filterCurve, envPoints, toPath, xToSec
} from './twin-ui.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

function almost (a, b, eps, message) {
  assert(Math.abs(a - b) <= eps, (message || 'almost') + ': ' + a + ' vs ' + b)
}

{
  almost(xToFreq(freqToX(440)), 440, 0.5, 'freq roundtrip')
  almost(xToFreq(freqToX(40)), 40, 0.2, 'low freq')
  almost(xToFreq(freqToX(8000)), 8000, 8, 'high freq')
  almost(yToRes(nodeY(0.4)), 0.4, 0.02, 'resonance roundtrip')
  almost(yToRes(nodeY(0)), 0, 0.02, 'zero resonance')
}

{
  const pts = filterCurve({ type: 'lowpass', cutoff: 1200, res: 0.5 })
  assert(pts.length > 16, 'filter samples')
  assert(pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), 'filter finite')
  assert(!toPath(pts).includes('NaN'), 'filter path')
}

{
  const env = { attack: 0.2, decay: 0.4, sustain: 0.5, release: 0.8 }
  const p = envPoints(env)
  assert(p.a.x < p.d.x && p.d.x < p.h.x && p.h.x <= p.r.x + 0.01, 'envelope order')
  almost(xToSec(p.a.x), 0.2, 0.05, 'attack position')
  assert(p.d.y > p.a.y, 'sustain sits below the attack peak')
}

console.log('twin-ui ok')
