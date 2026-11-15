export const TICKS_PER_BEAT = 960

export const SNAP_OPTIONS = [
  { name: 'Bar', beats: 4, id: 'bar' },
  { name: '1/2', beats: 2, id: '1/2' },
  { name: '1/4', beats: 1, id: '1/4' },
  { name: '1/8', beats: 0.5, id: '1/8' },
  { name: '1/16', beats: 0.25, id: '1/16' },
  { name: '1/32', beats: 0.125, id: '1/32' },
  { name: 'Triplet', beats: 1 / 3, id: 'triplet' },
  { name: 'Off', beats: 0, id: 'off' }
]

export function beatsToTicks (beats) {
  return Math.round((beats || 0) * TICKS_PER_BEAT)
}

export function ticksToBeats (ticks) {
  return (ticks || 0) / TICKS_PER_BEAT
}

export function snapBeat (beat, snap, gridBeats) {
  if (!snap || !gridBeats || gridBeats <= 0) return Math.max(0, beat)
  return Math.max(0, Math.round(beat / gridBeats) * gridBeats)
}

/** Quarter-note length of one bar. 6/8 is three quarters, not six. */
export function quarterBeatsPerBar (numerator, denominator) {
  const num = Math.max(1, Number(numerator) || 4)
  const den = Math.max(1, Number(denominator) || 4)
  return (num * 4) / den
}

export function barBeatTick (positionBeats, timeSigNum, ticksPerBeat = TICKS_PER_BEAT, timeSigDen = 4) {
  const den = Math.max(1, Number(timeSigDen) || 4)
  const beatUnit = 4 / den
  const beatsPerBar = quarterBeatsPerBar(timeSigNum, den)
  const total = Math.max(0, positionBeats || 0)
  const barIndex = Math.floor(total / beatsPerBar + 1e-9)
  const into = total - barIndex * beatsPerBar
  const beat = Math.floor(into / beatUnit + 1e-9) + 1
  const frac = into / beatUnit - (beat - 1)
  const tick = Math.floor(frac * ticksPerBeat + 1e-9)
  return { bar: barIndex + 1, beat, tick }
}

export function formatMusical (positionBeats, timeSigNum, timeSigDen = 4) {
  const { bar, beat, tick } = barBeatTick(positionBeats, timeSigNum, TICKS_PER_BEAT, timeSigDen)
  return bar + ' : ' + beat + ' : ' + String(tick).padStart(3, '0')
}

export function formatTime (positionBeats, bpm) {
  const seconds = Math.max(0, positionBeats || 0) * 60 / Math.max(1, bpm || 120)
  const mins = Math.floor(seconds / 60)
  const secs = seconds - mins * 60
  return mins + ':' + secs.toFixed(3).padStart(6, '0')
}

export function interpolateBeats (clock, nowMs, bpm) {
  if (!clock) return 0
  if (!clock.playing) return Math.max(0, clock.positionBeats || 0)
  const elapsed = Math.max(0, (nowMs - (clock.receivedAt || nowMs)) / 1000)
  return Math.max(0, (clock.positionBeats || 0) + elapsed * Math.max(1, bpm || clock.bpm || 120) / 60)
}
