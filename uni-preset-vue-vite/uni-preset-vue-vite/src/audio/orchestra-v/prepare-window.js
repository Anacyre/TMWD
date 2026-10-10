/** How much Orchestra V audio Play decodes before the transport starts.
 * A chord across several desks is one zone per note, so this window is not capped:
 * dropping the 7th zone is what left part of a chord silent. The clock also
 * refuses to pass a note whose body is still undecoded. */

export const PREPARE_WINDOW_BEATS = 32
/** Network / decode abort for a single object. Not the Play gate. */
export const SAMPLE_DEADLINE_MS = 8000
/** Give up holding the playhead if one sample never arrives. */
export const STALL_GIVE_UP_MS = 12000

export function noteInPrepareWindow (startBeat, fromBeat, windowBeats = PREPARE_WINDOW_BEATS) {
  const start = Number(startBeat)
  const from = Number(fromBeat) || 0
  const span = Number(windowBeats) > 0 ? Number(windowBeats) : PREPARE_WINDOW_BEATS
  return start >= from - 0.05 && start < from + span
}

/** Every unique sample in the lead window blocks Play. Nothing is left for later. */
export function selectPrepareZones (zones) {
  const immediate = []
  const seen = new Set()
  for (const item of zones || []) {
    if (!item || !item.sample) continue
    const id = (item.library || '') + '/' + item.sample
    if (seen.has(id)) continue
    seen.add(id)
    immediate.push(item)
  }
  return { immediate, warm: [] }
}

/** Hold the playhead on the earliest note whose sample is not ready yet.
 * `pendingStarts` lists only those not-ready note starts. */
export function gatePlayhead (fromBeat, toBeat, pendingStarts) {
  const from = Number(fromBeat) || 0
  const to = Number(toBeat)
  if (!Number.isFinite(to) || to <= from) return from
  let gate = to
  let waiting = false
  for (const start of pendingStarts || []) {
    const at = Number(start)
    if (!Number.isFinite(at) || at < from - 0.001 || at > to + 0.02) continue
    waiting = true
    if (at < gate) gate = at
  }
  if (waiting && gate <= from + 1e-4) return from
  return Math.min(to, gate)
}
