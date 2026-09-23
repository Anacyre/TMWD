/** Orchestra V region compiler.
 *
 * M Orchestra scores the whole flat sample list on every note-on. Orchestra V instead
 * compiles the cloud samples for one instrument into an SFZ-style zone table once, at
 * load time, so playing a note is a table lookup plus an equal-power velocity crossfade
 * and a deterministic round-robin step.
 *
 * Zone fields follow SFZ opcode names (lokey, hikey, pitch_keycenter, lovel, hivel, the
 * xfin and xfout velocity pairs, seq_length, seq_position, loop_mode, ampeg_release) so a
 * compiled map can be dumped to a real .sfz file with toSfzText for debugging.
 */

import { acceptManifestLoop, durationQuality, isOneShotDuration, playbackFrom } from '../m-orchestra/playback.js'
import { crossfadeWidth, maxVariations } from './catalog.js'

const ARTICULATION_FALLBACK = {
  long: ['long', 'sustain'],
  sustain: ['sustain', 'long'],
  short: ['short', 'pluck', 'long'],
  pluck: ['pluck', 'short', 'long'],
  hit: ['hit']
}

/** Ordered articulations to try when the requested one has no zone for a key. */
export function articulationChain (articulation) {
  const id = String(articulation || 'long')
  return ARTICULATION_FALLBACK[id] || [id, 'long']
}

function clampKey (value) {
  return Math.max(0, Math.min(127, Math.round(value)))
}

function releaseFor (artic, rules) {
  if (artic === 'hit') return rules.releaseHitSec
  if (artic === 'short' || artic === 'pluck') return rules.releaseShortSec
  return rules.releaseLongSec
}

/**
 * Can this sample carry this articulation?
 *
 * A library that publishes a `tier` has already answered the question when it was built,
 * which is the only way a library whose filenames say nothing about take length can work.
 * The M Orchestra packs predate that, so their duration tokens still get read back.
 */
function eligible (sample, artic) {
  if (!sample || sample.articulation !== artic) return false
  if (sample.tier != null) return true
  if (artic === 'long' || artic === 'sustain') return !isOneShotDuration(sample.entry)
  if (artic === 'short') return durationQuality(sample.entry, 'short') >= 2
  return true
}

/** Higher means a longer-sounding take of the same note. */
function tierOf (sample, artic) {
  return sample.tier != null ? sample.tier : durationQuality(sample.entry, artic)
}

/**
 * What note-off should do with this zone.
 *
 * - `segment` the file holds its own release tail after `mainSec`; crossfade into it.
 * - `free`    a struck or plucked take that already contains its whole decay; let it ring.
 * - `tail`    no published tail, so the runtime splits one out of the recording.
 * - `envelope` nothing to play, so fall back to a gain ramp.
 */
function releaseModeFor (sample, artic) {
  const oneShot = artic === 'short' || artic === 'pluck' || artic === 'hit'
  const hasSegment = sample.mainSec > 0 && sample.releaseSec > 0.05
  // Struck decaying bodies (piano) fade from the current playback position. The recorded
  // tail is the rest of the same decay, not a damper sample worth jumping to.
  if (sample.decays && !oneShot) return 'envelope'
  if (hasSegment) return oneShot ? 'free' : 'segment'
  if (oneShot) return 'envelope'
  return 'tail'
}

function folderPrefix (folder) {
  return String(folder || '').toLowerCase() + '/'
}

function inFolder (sample, folder) {
  if (!folder) return true
  return String(sample.entry || '').toLowerCase().startsWith(folderPrefix(folder))
}

function samplePath (sample) {
  return sample.objectPath || `samples/${sample.pack}/${sample.entry}`
}

/** Round-robin pool for one key/layer slot.
 *
 * Pitched articulations keep only the longest-sounding tier, because mixing a 1.5s and a
 * 1.0s recording of the same note would make note lengths jump between repeats. Percussion
 * strokes have no such tier, so every sample in the layer becomes a variation. */
function variationPool (list, artic, cap) {
  const sorted = list.slice().sort((a, b) => String(a.entry).localeCompare(String(b.entry)))
  if (artic === 'hit') return sorted.slice(0, cap)
  let best = -Infinity
  for (const sample of sorted) best = Math.max(best, tierOf(sample, artic))
  return sorted.filter((sample) => tierOf(sample, artic) === best).slice(0, cap)
}

/** One shared fade window per layer boundary, so the two neighbours are exactly equal-power. */
function layerBoundaries (layers, halfWidth) {
  const at = []
  for (let i = 0; i < layers.length - 1; i++) at.push(Math.floor((layers[i] + layers[i + 1]) / 2))
  return at.map((value, i) => {
    const below = i > 0 ? Math.floor((value - at[i - 1]) / 2) : halfWidth
    const above = i < at.length - 1 ? Math.floor((at[i + 1] - value) / 2) : halfWidth
    const half = Math.max(0, Math.min(halfWidth, below, above))
    return { at: value, lo: Math.max(0, value - half), hi: Math.min(127, value + half) }
  })
}

function makeZone (sample, artic, span, band, seqPosition, seqLength, rules) {
  const looped = acceptManifestLoop(sample, rules)
  return {
    sample: samplePath(sample),
    pack: sample.pack,
    entry: sample.entry,
    articulation: artic,
    group: band.group,
    loKey: span.loKey,
    hiKey: span.hiKey,
    pitchKeycenter: span.pitchKeycenter,
    unpitched: !!sample.unpitched,
    dynamicLayer: band.dynamicLayer,
    loVel: band.loVel,
    hiVel: band.hiVel,
    xfinLoVel: band.xfinLoVel,
    xfinHiVel: band.xfinHiVel,
    xfoutLoVel: band.xfoutLoVel,
    xfoutHiVel: band.xfoutHiVel,
    seqLength,
    seqPosition,
    loopMode: looped ? 'loop_continuous' : 'no_loop',
    loopStart: looped ? sample.loopStart : 0,
    loopEnd: looped ? sample.loopEnd : 0,
    crossfadeSec: looped ? (sample.crossfadeSec || 0) : 0,
    ampegRelease: releaseFor(artic, rules),
    durationSec: sample.durationSec || 0,
    // Where the recording stops being the held body and becomes its release tail. Zero for
    // libraries that do not record the two together.
    mainSec: sample.mainSec > 0 ? sample.mainSec : 0,
    releaseSec: sample.releaseSec > 0 ? sample.releaseSec : 0,
    releaseCrossfadeSec: sample.releaseCrossfadeSec > 0 ? sample.releaseCrossfadeSec : 0.04,
    releaseMode: releaseModeFor(sample, artic),
    decays: !!sample.decays
  }
}

/** Split one key slot into velocity layers and emit a zone per round-robin variation. */
function pushLayers (out, group, def, artic, span, rules) {
  const byLayer = new Map()
  for (const sample of group) {
    const layer = sample.dynamicLayer == null ? 64 : sample.dynamicLayer
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer).push(sample)
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b)
  const bounds = layerBoundaries(layers, crossfadeWidth(def))
  const cap = maxVariations(def)

  layers.forEach((layer, i) => {
    const below = i > 0 ? bounds[i - 1] : null
    const above = i < layers.length - 1 ? bounds[i] : null
    const pool = variationPool(byLayer.get(layer), artic, cap)
    if (!pool.length) return
    const band = {
      dynamicLayer: layer,
      group: `${artic}|${span.pitchKeycenter}|${layer}`,
      loVel: below ? below.at + 1 : 1,
      hiVel: above ? above.at : 127,
      xfinLoVel: below ? below.lo : 0,
      xfinHiVel: below ? below.hi : 0,
      xfoutLoVel: above ? above.lo : 128,
      xfoutHiVel: above ? above.hi : 128
    }
    pool.forEach((sample, seqPosition) => {
      out.push(makeZone(sample, artic, span, band, seqPosition, pool.length, rules))
    })
  })
}

/** Pitched instruments: key spans meet at the midpoint between neighbouring root notes. */
function compilePitched (list, def, artic, rules) {
  const stretch = rules.maxStretchSemitones || 4
  const byRoot = new Map()
  for (const sample of list) {
    const root = sample.rootNote == null ? 60 : sample.rootNote
    if (!byRoot.has(root)) byRoot.set(root, [])
    byRoot.get(root).push(sample)
  }
  const roots = [...byRoot.keys()].sort((a, b) => a - b)
  const zones = []
  roots.forEach((root, i) => {
    const prev = i > 0 ? roots[i - 1] : null
    const next = i < roots.length - 1 ? roots[i + 1] : null
    const loKey = clampKey(prev == null ? root - stretch : Math.max(root - stretch, Math.floor((prev + root) / 2) + 1))
    const hiKey = clampKey(next == null ? root + stretch : Math.min(root + stretch, Math.floor((root + next) / 2)))
    if (hiKey < loKey) return
    pushLayers(zones, byRoot.get(root), def, artic, { loKey, hiKey, pitchKeycenter: root }, rules)
  })
  return zones
}

/** Percussion: every keymap entry pins one sample folder to one key, played untransposed. */
function compileKeymap (list, def, artic, rules) {
  const zones = []
  for (const slot of def.keymap || []) {
    const group = list.filter((sample) => inFolder(sample, slot.folder))
    if (!group.length) continue
    const key = clampKey(slot.key)
    pushLayers(zones, group, def, artic, { loKey: key, hiKey: key, pitchKeycenter: key }, rules)
  }
  return zones
}

/** Trim key spans to the instrument's playable range. Two instruments can share a pack
 * and still differ: tenor and bass trombone both read `trombone` but cover different keys. */
function clampToRange (zones, keyRange) {
  if (!Array.isArray(keyRange) || keyRange.length !== 2) return zones
  const lo = clampKey(Math.min(keyRange[0], keyRange[1]))
  const hi = clampKey(Math.max(keyRange[0], keyRange[1]))
  const out = []
  for (const zone of zones) {
    const loKey = Math.max(zone.loKey, lo)
    const hiKey = Math.min(zone.hiKey, hi)
    if (hiKey < loKey) continue
    out.push(loKey === zone.loKey && hiKey === zone.hiKey ? zone : { ...zone, loKey, hiKey })
  }
  return out
}

function indexZones (zones) {
  const byKey = new Array(128).fill(null)
  let keyLo = 128
  let keyHi = -1
  for (const zone of zones) {
    for (let key = zone.loKey; key <= zone.hiKey; key++) {
      if (!byKey[key]) byKey[key] = []
      byKey[key].push(zone)
    }
    keyLo = Math.min(keyLo, zone.loKey)
    keyHi = Math.max(keyHi, zone.hiKey)
  }
  return { byKey, keyLo, keyHi, zoneCount: zones.length }
}

/**
 * Compile the cloud samples for one instrument into a zone table.
 *
 * @param {Array} samples flat manifest sample list
 * @param {object} def catalogue entry, see orchestra-v-instrument.schema.json
 * @param {object} manifest cloud manifest, only read for its playback rules
 */
export function compileRegions (samples, def, manifest) {
  const rules = playbackFrom(manifest)
  const map = {
    id: def && def.id,
    rules,
    zones: [],
    articulations: [],
    byArticulation: Object.create(null)
  }
  if (!def || !def.sourcePack) return map

  const pool = (samples || []).filter((sample) => sample
    && sample.pack === def.sourcePack
    && inFolder(sample, def.percFolder))

  for (const artic of def.articulations || []) {
    const list = pool.filter((sample) => eligible(sample, artic))
    if (!list.length) continue
    const zones = def.keymap
      ? compileKeymap(list, def, artic, rules)
      : clampToRange(compilePitched(list, def, artic, rules), def.keyRange)
    if (!zones.length) continue
    map.byArticulation[artic] = indexZones(zones)
    map.articulations.push(artic)
    map.zones.push(...zones)
  }
  return map
}

/** Equal-power gain of one zone at a velocity; 0 means the zone is silent there. */
export function velocityGain (zone, velocity) {
  if (!zone) return 0
  const v = Math.max(1, Math.min(127, Math.round(velocity)))
  let gain = 1
  if (zone.xfinHiVel > zone.xfinLoVel) {
    if (v <= zone.xfinLoVel) return 0
    if (v < zone.xfinHiVel) {
      gain *= Math.sin(((v - zone.xfinLoVel) / (zone.xfinHiVel - zone.xfinLoVel)) * Math.PI * 0.5)
    }
  }
  if (zone.xfoutHiVel > zone.xfoutLoVel) {
    if (v >= zone.xfoutHiVel) return 0
    if (v > zone.xfoutLoVel) {
      gain *= Math.cos(((v - zone.xfoutLoVel) / (zone.xfoutHiVel - zone.xfoutLoVel)) * Math.PI * 0.5)
    }
  }
  return gain
}

function nextSeq (seqState, group, length) {
  if (!seqState || length <= 1) return 0
  const current = seqState.get(group) || 0
  seqState.set(group, (current + 1) % length)
  return current
}

/**
 * Pick the zones that sound for one note.
 *
 * @param {object} map result of compileRegions
 * @param {number} pitch MIDI note
 * @param {number} velocity MIDI velocity 1..127
 * @param {string|string[]} articulation requested technique, or an ordered fallback chain
 * @param {Map} [seqState] round-robin counters, one Map per track
 * @returns {Array<{zone: object, gain: number}>} one entry per active velocity layer
 */
export function selectZone (map, pitch, velocity, articulation, seqState) {
  if (!map) return []
  const chain = Array.isArray(articulation) ? articulation : articulationChain(articulation)
  const key = clampKey(pitch)
  for (const artic of chain) {
    const bank = artic && map.byArticulation[artic]
    if (!bank) continue
    const candidates = bank.byKey[key]
    if (!candidates || !candidates.length) continue

    const pools = new Map()
    for (const zone of candidates) {
      const gain = velocityGain(zone, velocity)
      if (gain <= 0) continue
      let pool = pools.get(zone.group)
      if (!pool) {
        pool = { gain, zones: [] }
        pools.set(zone.group, pool)
      }
      pool.zones.push(zone)
    }
    if (!pools.size) continue

    const picked = []
    pools.forEach((pool, group) => {
      const list = pool.zones.sort((a, b) => a.seqPosition - b.seqPosition)
      const index = nextSeq(seqState, group, list.length)
      picked.push({ zone: list[Math.min(index, list.length - 1)], gain: pool.gain })
    })
    return picked
  }
  return []
}

function opcode (name, value) {
  return `${name}=${value}`
}

/** Render a compiled map as a real .sfz file. Loop points stay in seconds as a comment
 * because the manifest never carries frame counts. */
export function toSfzText (map, options = {}) {
  const zones = Array.isArray(map) ? map : (map && map.zones) || []
  const basePath = options.basePath || ''
  const lines = []
  lines.push('// Orchestra V compiled region map')
  if (map && map.id) lines.push(`// instrument: ${map.id}`)
  lines.push(`// zones: ${zones.length}`)
  if (basePath) lines.push(opcode('default_path', basePath))
  lines.push('')

  const groups = new Map()
  for (const zone of zones) {
    if (!groups.has(zone.group)) groups.set(zone.group, [])
    groups.get(zone.group).push(zone)
  }

  groups.forEach((list, group) => {
    const first = list[0]
    lines.push('<group>')
    lines.push(`// ${group}`)
    lines.push('  ' + [
      opcode('group_label', group.replace(/\|/g, '_')),
      opcode('seq_length', first.seqLength),
      opcode('ampeg_release', first.ampegRelease.toFixed(3))
    ].join(' '))
    list
      .slice()
      .sort((a, b) => a.seqPosition - b.seqPosition)
      .forEach((zone) => {
        const parts = [
          opcode('sample', zone.sample),
          opcode('lokey', zone.loKey),
          opcode('hikey', zone.hiKey),
          opcode('pitch_keycenter', zone.pitchKeycenter),
          opcode('lovel', zone.loVel),
          opcode('hivel', zone.hiVel),
          opcode('xfin_lovel', zone.xfinLoVel),
          opcode('xfin_hivel', zone.xfinHiVel),
          opcode('xfout_lovel', zone.xfoutLoVel),
          opcode('xfout_hivel', zone.xfoutHiVel),
          opcode('seq_position', zone.seqPosition + 1),
          opcode('loop_mode', zone.loopMode)
        ]
        lines.push('<region>')
        lines.push('  ' + parts.join(' '))
        if (zone.loopMode === 'loop_continuous') {
          lines.push(`  // loop_sec=${zone.loopStart.toFixed(4)},${zone.loopEnd.toFixed(4)} crossfade_sec=${zone.crossfadeSec.toFixed(4)}`)
        }
        if (zone.mainSec > 0) {
          lines.push(`  // release_mode=${zone.releaseMode} body_sec=${zone.mainSec.toFixed(4)} tail_sec=${zone.releaseSec.toFixed(4)}`)
        }
      })
    lines.push('')
  })

  return lines.join('\n')
}
