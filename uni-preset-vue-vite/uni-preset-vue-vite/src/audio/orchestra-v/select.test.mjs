import { articulationChain, compileRegions, selectZone, velocityGain } from './sfz.js'
import { PLAYBACK } from '../m-orchestra/playback.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const MANIFEST = { playback: PLAYBACK }

function sample (entry, rootNote, dynamicLayer, extra = {}) {
  return {
    pack: 'testpack',
    entry,
    objectPath: `samples/testpack/${entry}`,
    unpitched: false,
    rootNote,
    dynamicLayer,
    articulation: 'long',
    loop: false,
    ...extra
  }
}

function def (overrides = {}) {
  return {
    id: 'ov_test',
    displayName: 'Test',
    family: 'strings',
    available: true,
    sourcePack: 'testpack',
    articulations: ['long'],
    velocityLayers: { crossfadeWidth: 10 },
    roundRobin: { enabled: true, maxVariations: 4 },
    ...overrides
  }
}

// --- the right layer answers for a velocity in the middle of its band -------
{
  const map = compileRegions(
    [16, 64, 120].map((layer) => sample(`t_60_15_l${layer}.mp3`, 60, layer)),
    def(),
    MANIFEST
  )
  const soft = selectZone(map, 60, 5, 'long', new Map())
  const mid = selectZone(map, 60, 64, 'long', new Map())
  const loud = selectZone(map, 60, 127, 'long', new Map())
  assert(soft.length === 1 && soft[0].zone.dynamicLayer === 16, 'a whisper plays the softest layer alone')
  assert(mid.length === 1 && mid[0].zone.dynamicLayer === 64, 'a mid velocity plays the middle layer alone')
  assert(loud.length === 1 && loud[0].zone.dynamicLayer === 120, 'full velocity plays the loudest layer alone')
  assert(soft[0].gain === 1 && mid[0].gain === 1 && loud[0].gain === 1, 'a lone layer plays at unity gain')
}

// --- layer boundaries hand over with two zones at equal power ---------------
{
  const map = compileRegions(
    [32, 96].map((layer) => sample(`t_60_15_l${layer}.mp3`, 60, layer)),
    def(),
    MANIFEST
  )
  const zones = map.zones
  const boundary = zones.find((zone) => zone.dynamicLayer === 32).hiVel
  const pair = selectZone(map, 60, boundary, 'long', new Map())
  assert(pair.length === 2, 'both layers sound while crossing a layer boundary')
  assert(Math.abs(pair[0].gain - pair[1].gain) < 1e-9, 'the two layers meet at equal gain')

  for (let velocity = 1; velocity <= 127; velocity++) {
    const active = selectZone(map, 60, velocity, 'long', new Map())
    assert(active.length >= 1, `velocity ${velocity} has no zone`)
    const power = active.reduce((sum, item) => sum + item.gain * item.gain, 0)
    assert(Math.abs(power - 1) < 1e-9, `velocity ${velocity} is not equal-power (got ${power})`)
  }
}

// --- three layers stay equal-power too, thanks to the narrowed fade windows --
{
  const map = compileRegions(
    [64, 72, 96].map((layer) => sample(`t_60_15_l${layer}.mp3`, 60, layer)),
    def(),
    MANIFEST
  )
  for (let velocity = 1; velocity <= 127; velocity++) {
    const active = selectZone(map, 60, velocity, 'long', new Map())
    const power = active.reduce((sum, item) => sum + item.gain * item.gain, 0)
    assert(active.length <= 2, `velocity ${velocity} activates more than two layers`)
    assert(Math.abs(power - 1) < 1e-9, `velocity ${velocity} is not equal-power (got ${power})`)
  }
}

// --- round-robin walks the pool and wraps -----------------------------------
{
  const map = compileRegions(
    ['a', 'b', 'c'].map((tag) => sample(`t_60_15_forte_${tag}.mp3`, 60, 96)),
    def(),
    MANIFEST
  )
  const state = new Map()
  const played = []
  for (let i = 0; i < 7; i++) played.push(selectZone(map, 60, 100, 'long', state)[0].zone.seqPosition)
  assert(played.join(',') === '0,1,2,0,1,2,0', 'repeats cycle through the variations and wrap')

  const fresh = selectZone(map, 60, 100, 'long', new Map())
  assert(fresh[0].zone.seqPosition === 0, 'a fresh counter starts at the first variation')
}

// --- each key and layer keeps its own counter -------------------------------
{
  const samples = []
  for (const root of [60, 67]) {
    for (const tag of ['a', 'b']) samples.push(sample(`t_${root}_15_forte_${tag}.mp3`, root, 96))
  }
  const map = compileRegions(samples, def(), MANIFEST)
  const state = new Map()
  assert(selectZone(map, 60, 100, 'long', state)[0].zone.seqPosition === 0, 'first note on key 60')
  assert(selectZone(map, 67, 100, 'long', state)[0].zone.seqPosition === 0, 'key 67 has its own counter')
  assert(selectZone(map, 60, 100, 'long', state)[0].zone.seqPosition === 1, 'key 60 advanced independently')
}

// --- articulations fall back when the requested one is incomplete -----------
{
  const samples = [
    sample('t_60_15_forte.mp3', 60, 96),
    sample('t_60_15_forte_trem.mp3', 60, 96, { articulation: 'sustain' })
  ]
  const map = compileRegions(samples, def({ articulations: ['long', 'sustain'] }), MANIFEST)
  assert(selectZone(map, 60, 100, 'sustain', new Map())[0].zone.articulation === 'sustain',
    'a complete articulation is used as asked')

  const longOnly = compileRegions([samples[0]], def({ articulations: ['long', 'sustain'] }), MANIFEST)
  const fallen = selectZone(longOnly, 60, 100, 'sustain', new Map())
  assert(fallen.length === 1 && fallen[0].zone.articulation === 'long',
    'tremolo falls back to long rather than going silent')

  assert(articulationChain('short')[0] === 'short', 'a chain always starts with what was asked for')
  assert(articulationChain('hit').length === 1, 'percussion hits never fall back to a pitched articulation')
}

// --- keys outside the map stay silent ---------------------------------------
{
  const map = compileRegions([sample('t_60_15_forte.mp3', 60, 96)], def(), MANIFEST)
  assert(selectZone(map, 60, 100, 'long', new Map()).length === 1, 'the mapped key sounds')
  assert(selectZone(map, 90, 100, 'long', new Map()).length === 0, 'a key past the stretch limit returns nothing')
  assert(selectZone(null, 60, 100, 'long', new Map()).length === 0, 'a missing map is handled')
}

// --- percussion keys reach their own folder ---------------------------------
{
  const samples = [
    sample('bass drum/bd__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' }),
    sample('bass drum/bd__025_forte_alt.mp3', 60, 96, { unpitched: true, articulation: 'hit' }),
    sample('triangle/tri__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' })
  ].map((entry) => ({ ...entry, pack: 'perc', objectPath: `samples/perc/${entry.entry}` }))
  const map = compileRegions(samples, def({
    sourcePack: 'perc',
    articulations: ['hit'],
    keymap: [
      { key: 36, folder: 'bass drum', name: 'Bass Drum' },
      { key: 38, folder: 'triangle', name: 'Triangle' }
    ]
  }), MANIFEST)

  const state = new Map()
  const first = selectZone(map, 36, 100, 'hit', state)[0].zone
  const second = selectZone(map, 36, 100, 'hit', state)[0].zone
  assert(first.entry.startsWith('bass drum/') && second.entry.startsWith('bass drum/'), 'key 36 is the bass drum')
  assert(first.entry !== second.entry, 'two strokes on the same drum use different recordings')
  assert(selectZone(map, 38, 100, 'hit', state)[0].zone.entry.startsWith('triangle/'), 'key 38 is the triangle')
  assert(selectZone(map, 37, 100, 'hit', state).length === 0, 'unmapped keys stay silent')
}

// --- gain curve edges --------------------------------------------------------
{
  const zone = { xfinLoVel: 50, xfinHiVel: 70, xfoutLoVel: 128, xfoutHiVel: 128 }
  assert(velocityGain(zone, 50) === 0, 'the zone is silent at the bottom of its fade-in')
  assert(velocityGain(zone, 70) === 1, 'the zone is at full gain once the fade-in completes')
  assert(Math.abs(velocityGain(zone, 60) - Math.SQRT1_2) < 1e-9, 'the halfway point sits at -3 dB')
  assert(velocityGain(null, 60) === 0, 'a missing zone contributes nothing')
}

console.log('orchestra-v select ok')
