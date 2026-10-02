/** How much Orchestra V audio Play decodes before the transport starts.
 * Everything outside this window is fetched as encoded bytes only. */

export const PREPARE_WINDOW_BEATS = 4
export const PREPARE_ZONE_CAP = 6
export const PREPARE_DEADLINE_MS = 8000

export function noteInPrepareWindow (startBeat, fromBeat, windowBeats = PREPARE_WINDOW_BEATS) {
  const start = Number(startBeat)
  const from = Number(fromBeat) || 0
  const span = Number(windowBeats) > 0 ? Number(windowBeats) : PREPARE_WINDOW_BEATS
  return start >= from - 0.05 && start < from + span
}

/** First `cap` unique samples block Play. The rest are warm-only. */
export function selectPrepareZones (zones, cap = PREPARE_ZONE_CAP) {
  const immediate = []
  const warm = []
  const seen = new Set()
  const limit = Math.max(0, cap | 0)
  for (const item of zones || []) {
    if (!item || !item.sample) continue
    const id = (item.library || '') + '/' + item.sample
    if (seen.has(id)) continue
    seen.add(id)
    if (immediate.length < limit) immediate.push(item)
    else warm.push(item)
  }
  return { immediate, warm }
}
