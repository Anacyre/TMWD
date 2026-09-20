import { compileRegions, toSfzText } from './sfz.js'
import { PLAYBACK } from '../m-orchestra/playback.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const MANIFEST = { playback: PLAYBACK }

/** Build a manifest-shaped sample. `entry` carries the duration token the compiler reads. */
function sample (pack, entry, rootNote, dynamicLayer, extra = {}) {
  return {
    pack,
    entry,
    objectPath: `samples/${pack}/${entry}`,
    unpitched: false,
    rootNote,
    minNote: rootNote,
    maxNote: rootNote,
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

function zonesFor (map, artic = 'long') {
  return map.zones.filter((zone) => zone.articulation === artic)
}

// --- key spans meet at root midpoints, never overlap -------------------------
{
  const samples = [60, 67, 74].map((root) => sample('testpack', `t_${root}_15_forte.mp3`, root, 96))
  const map = compileRegions(samples, def(), MANIFEST)
  const zones = zonesFor(map).sort((a, b) => a.loKey - b.loKey)
  assert(zones.length === 3, 'one zone per root when there is a single dynamic layer')

  const covered = new Map()
  for (const zone of zones) {
    for (let key = zone.loKey; key <= zone.hiKey; key++) {
      assert(!covered.has(key), `key ${key} is claimed by two zones`)
      covered.set(key, zone)
    }
  }

  assert(zones[0].loKey === 56 && zones[0].hiKey === 63, 'first root reaches down by maxStretch and up to the midpoint')
  assert(zones[1].loKey === 64 && zones[1].hiKey === 70, 'middle root is bounded by both midpoints')
  assert(zones[2].loKey === 71 && zones[2].hiKey === 78, 'last root reaches up by maxStretch')

  for (let key = 56; key <= 78; key++) assert(covered.has(key), `key ${key} has no zone`)
  for (const zone of zones) {
    const reach = Math.max(zone.pitchKeycenter - zone.loKey, zone.hiKey - zone.pitchKeycenter)
    assert(reach <= PLAYBACK.maxStretchSemitones, 'no zone stretches further than maxStretchSemitones')
  }
}

// --- roots further apart than the stretch budget leave an honest hole --------
{
  const samples = [60, 80].map((root) => sample('testpack', `t_${root}_15_forte.mp3`, root, 96))
  const map = compileRegions(samples, def(), MANIFEST)
  const bank = map.byArticulation.long
  assert(bank.byKey[64] && bank.byKey[64].length, 'the low root still covers up to its stretch limit')
  assert(!bank.byKey[70], 'a gap wider than twice maxStretch is left empty rather than over-stretched')
  assert(bank.byKey[76] && bank.byKey[76].length, 'the high root covers down to its stretch limit')
}

// --- dynamic layers partition velocity 1..127 with no gap or overlap ---------
{
  const samples = [16, 64, 120].map((layer) => sample('testpack', `t_60_15_l${layer}.mp3`, 60, layer))
  const map = compileRegions(samples, def(), MANIFEST)
  const zones = zonesFor(map).sort((a, b) => a.dynamicLayer - b.dynamicLayer)
  assert(zones.length === 3, 'one zone per dynamic layer')
  assert(zones[0].loVel === 1, 'the softest layer starts at velocity 1')
  assert(zones[2].hiVel === 127, 'the loudest layer runs to velocity 127')
  for (let i = 1; i < zones.length; i++) {
    assert(zones[i].loVel === zones[i - 1].hiVel + 1, 'velocity bands are contiguous')
  }
  assert(zones[0].xfoutLoVel === zones[1].xfinLoVel && zones[0].xfoutHiVel === zones[1].xfinHiVel,
    'neighbouring layers share one fade window so the crossfade is exactly equal-power')
  assert(zones[0].xfinHiVel === zones[0].xfinLoVel, 'the softest layer has no fade-in')
  assert(zones[2].xfoutHiVel === zones[2].xfoutLoVel, 'the loudest layer has no fade-out')
}

// --- fade windows never overlap, even when layers sit close together --------
{
  const samples = [64, 72, 96].map((layer) => sample('testpack', `t_60_15_l${layer}.mp3`, 60, layer))
  const map = compileRegions(samples, def(), MANIFEST)
  const zones = zonesFor(map).sort((a, b) => a.dynamicLayer - b.dynamicLayer)
  assert(zones[0].xfoutHiVel <= zones[1].xfoutLoVel,
    'the fade window is narrowed so only two layers are ever active at once')
}

// --- round-robin numbering ---------------------------------------------------
{
  const samples = ['a', 'b', 'c'].map((tag) => sample('testpack', `t_60_15_forte_${tag}.mp3`, 60, 96))
  const map = compileRegions(samples, def(), MANIFEST)
  const zones = zonesFor(map).sort((a, b) => a.seqPosition - b.seqPosition)
  assert(zones.length === 3, 'same-quality siblings all become variations')
  assert(zones.every((zone) => zone.seqLength === 3), 'every variation knows the pool size')
  assert(zones.map((zone) => zone.seqPosition).join(',') === '0,1,2', 'variations are numbered from zero')
  assert(new Set(zones.map((zone) => zone.group)).size === 1, 'variations share one round-robin group')
}

// --- a shorter recording never joins the round-robin of a longer one ---------
{
  const samples = [
    sample('testpack', 't_60_1_forte.mp3', 60, 96),
    sample('testpack', 't_60_15_forte.mp3', 60, 96)
  ]
  const zones = zonesFor(compileRegions(samples, def(), MANIFEST))
  assert(zones.length === 1 && zones[0].entry.includes('_15_'),
    'only the longest-sounding tier is kept, so repeats keep the same note length')
}

// --- one-shots are not usable as sustains ------------------------------------
{
  const samples = [sample('testpack', 't_60_1_forte.mp3', 60, 96)]
  const map = compileRegions(samples, def({ articulations: ['long'] }), MANIFEST)
  assert(!map.articulations.length, 'an instrument with only one-shots compiles no long zones')
}

// --- loop metadata survives compilation --------------------------------------
{
  const looped = sample('testpack', 't_60_15_forte.mp3', 60, 96, {
    loop: true,
    loopStart: 0.5,
    loopEnd: 2.2,
    crossfadeSec: 0.12
  })
  const short = sample('testpack', 't_67_15_forte.mp3', 67, 96, {
    loop: true,
    loopStart: 0.5,
    loopEnd: 0.9,
    crossfadeSec: 0.12
  })
  const zones = zonesFor(compileRegions([looped, short], def(), MANIFEST))
  const good = zones.find((zone) => zone.pitchKeycenter === 60)
  const bad = zones.find((zone) => zone.pitchKeycenter === 67)
  assert(good.loopMode === 'loop_continuous', 'a long enough published loop is kept')
  assert(good.loopStart === 0.5 && good.loopEnd === 2.2 && good.crossfadeSec === 0.12, 'loop points carry through verbatim')
  assert(bad.loopMode === 'no_loop' && bad.loopStart === 0, 'a loop shorter than minLoopSec is dropped')
  assert(good.ampegRelease === PLAYBACK.releaseLongSec, 'long zones take the long release time')
}

// --- keyRange keeps two instruments on the same pack distinct ----------------
{
  const samples = [40, 60, 80].map((root) => sample('testpack', `t_${root}_15_forte.mp3`, root, 96))
  const wide = compileRegions(samples, def(), MANIFEST)
  const narrow = compileRegions(samples, def({ keyRange: [40, 62] }), MANIFEST)
  assert(wide.byArticulation.long.keyHi === 84, 'without a keyRange the zones follow the samples')
  assert(narrow.byArticulation.long.keyHi === 62, 'keyRange trims the top of the map')
  assert(!narrow.byArticulation.long.byKey[70], 'keys above the range have no zone')
  assert(narrow.byArticulation.long.byKey[60].length, 'keys inside the range are untouched')
}

// --- percussion keymaps pin one folder per key -------------------------------
{
  const samples = [
    sample('perc', 'bass drum/bd__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' }),
    sample('perc', 'bass drum/bd__025_piano.mp3', 60, 32, { unpitched: true, articulation: 'hit' }),
    sample('perc', 'triangle/tri__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' }),
    sample('perc', 'tam-tam/tam__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' })
  ]
  const map = compileRegions(samples, def({
    sourcePack: 'perc',
    articulations: ['hit'],
    keymap: [
      { key: 36, folder: 'bass drum', name: 'Bass Drum' },
      { key: 38, folder: 'triangle', name: 'Triangle' }
    ]
  }), MANIFEST)
  const bank = map.byArticulation.hit
  assert(bank.byKey[36].every((zone) => zone.entry.startsWith('bass drum/')), 'key 36 only plays the bass drum folder')
  assert(bank.byKey[36].length === 2, 'both bass drum dynamic layers land on key 36')
  assert(bank.byKey[38].length === 1 && bank.byKey[38][0].entry.startsWith('triangle/'), 'key 38 plays the triangle')
  assert(!bank.byKey[37], 'keys with no mapping stay silent')
  assert(!map.zones.some((zone) => zone.entry.startsWith('tam-tam/')), 'folders outside the keymap are not compiled')
  assert(bank.byKey[36].every((zone) => zone.unpitched), 'percussion zones stay untransposed')
  assert(bank.byKey[36][0].ampegRelease === PLAYBACK.releaseHitSec, 'hit zones take the short hit release')
}

// --- toSfzText emits parsable SFZ --------------------------------------------
{
  const samples = [
    sample('perc', 'bass drum/bd__025_forte.mp3', 60, 96, { unpitched: true, articulation: 'hit' }),
    sample('perc', 'bass drum/bd__025_forte_alt.mp3', 60, 96, { unpitched: true, articulation: 'hit' })
  ]
  const map = compileRegions(samples, def({
    sourcePack: 'perc',
    articulations: ['hit'],
    keymap: [{ key: 36, folder: 'bass drum', name: 'Bass Drum' }]
  }), MANIFEST)
  const text = toSfzText(map)

  const regions = new Map()
  for (const block of text.split('<region>').slice(1)) {
    const body = block.split('\n').find((line) => line.trim().startsWith('sample='))
    const parsed = {}
    for (const match of body.matchAll(/([a-z_]+)=(.*?)(?=\s+[a-z_]+=|$)/g)) parsed[match[1]] = match[2]
    regions.set(parsed.sample, parsed)
  }

  assert(regions.size === map.zones.length, 'every zone is emitted as a region')
  assert(text.includes('<group>'), 'round-robin pools are emitted as groups')
  assert(regions.has('samples/perc/bass drum/bd__025_forte.mp3'),
    'sample paths survive even though they contain spaces')
  map.zones.forEach((zone) => {
    const region = regions.get(zone.sample)
    assert(region, 'each zone is found again by its sample path')
    assert(Number(region.lokey) === zone.loKey, 'lokey round-trips')
    assert(Number(region.hikey) === zone.hiKey, 'hikey round-trips')
    assert(Number(region.pitch_keycenter) === zone.pitchKeycenter, 'pitch_keycenter round-trips')
    assert(Number(region.lovel) === zone.loVel, 'lovel round-trips')
    assert(Number(region.hivel) === zone.hiVel, 'hivel round-trips')
    assert(Number(region.xfin_lovel) === zone.xfinLoVel, 'xfin_lovel round-trips')
    assert(Number(region.xfout_hivel) === zone.xfoutHiVel, 'xfout_hivel round-trips')
    assert(Number(region.seq_position) === zone.seqPosition + 1, 'seq_position is emitted one-based')
    assert(region.loop_mode === zone.loopMode, 'loop_mode round-trips')
  })
}

console.log('orchestra-v sfz ok')
