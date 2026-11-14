import { buildChord, chordName } from './chords.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const same = (a, b) => a.length === b.length && a.every((n, i) => n === b[i])

// In key: C major diatonic triads.
assert(same(buildChord(60, { key: 'C', scale: 'major' }), [60, 64, 67]), 'I in C is C E G')
assert(same(buildChord(62, { key: 'C', scale: 'major' }), [62, 65, 69]), 'ii in C is D F A')
assert(same(buildChord(71, { key: 'C', scale: 'major' }), [71, 74, 77]), 'vii in C is B D F')
assert(same(buildChord(61, { key: 'C', scale: 'major' }), [60, 64, 67]) || same(buildChord(61, { key: 'C', scale: 'major' }), [62, 65, 69]), 'off-key roots snap into the key')
assert(same(buildChord(57, { key: 'A', scale: 'minor' }), [57, 60, 64]), 'i in A minor is A C E')

// Diatonic sevenths and extensions.
assert(same(buildChord(60, { key: 'C', scale: 'major', size: '7' }), [60, 64, 67, 71]), 'Cmaj7 in key')
assert(same(buildChord(67, { key: 'C', scale: 'major', size: '7' }), [67, 71, 74, 77]), 'G7 in key')
assert(same(buildChord(60, { key: 'C', scale: 'major', size: '13' }), [60, 64, 67, 71, 74, 77, 81]), 'diatonic 13 stacks seven thirds')
assert(buildChord(62, { key: 'C', scale: 'major', size: '9' }).length === 5, 'a 9th chord has five notes')

// Fixed qualities.
assert(same(buildChord(60, { quality: 'maj' }), [60, 64, 67]), 'major triad')
assert(same(buildChord(60, { quality: 'min', size: '7' }), [60, 63, 67, 70]), 'minor 7')
assert(same(buildChord(60, { quality: 'dom', size: '9' }), [60, 64, 67, 70, 74]), 'dominant 9')
assert(same(buildChord(60, { quality: 'dim', size: '7' }), [60, 63, 66, 69]), 'diminished 7')
assert(same(buildChord(60, { quality: 'aug' }), [60, 64, 68]), 'augmented triad')
assert(same(buildChord(60, { quality: 'sus4' }), [60, 65, 67]), 'sus4')
assert(!buildChord(60, { quality: 'maj', size: '13' }).includes(77), 'major 13 drops the clashing 11th')
assert(buildChord(60, { quality: 'min', size: '11' }).includes(77), 'minor 11 keeps the 11th')

// Inversions and range.
assert(same(buildChord(60, { quality: 'maj', inversion: 1 }), [64, 67, 72]), 'first inversion')
assert(same(buildChord(60, { quality: 'maj', inversion: 2 }), [67, 72, 76]), 'second inversion')
assert(buildChord(125, { quality: 'maj', size: '13' }).every((p) => p <= 127), 'chords stay inside MIDI range')
assert(buildChord(0, { quality: 'min' }).every((p) => p >= 0), 'low roots stay valid')

// Pentatonic / chromatic keys fall back to a plain triad.
assert(buildChord(60, { key: 'C', scale: 'pentatonic' }).length === 3, 'pentatonic still makes a triad')
assert(same(buildChord(60, { key: 'C', scale: 'chromatic' }), [60, 64, 67]), 'chromatic falls back to major')

// Names.
assert(chordName(60, { key: 'C', scale: 'major' }) === 'C', 'C')
assert(chordName(62, { key: 'C', scale: 'major' }) === 'Dm', 'Dm')
assert(chordName(71, { key: 'C', scale: 'major' }) === 'Bdim', 'Bdim')
assert(chordName(60, { key: 'C', scale: 'major', size: '7' }) === 'Cmaj7', 'Cmaj7')
assert(chordName(67, { key: 'C', scale: 'major', size: '7' }) === 'G7', 'G7')
assert(chordName(62, { key: 'C', scale: 'major', size: '9' }) === 'Dm9', 'Dm9')
assert(chordName(71, { key: 'C', scale: 'major', size: '7' }) === 'Bm7♭5', 'Bm7b5')
assert(chordName(60, { quality: 'dim', size: '7' }) === 'Cdim7', 'Cdim7')
assert(chordName(60, { quality: 'sus4' }) === 'Csus4', 'Csus4')
assert(chordName(60, { quality: 'aug' }) === 'Caug', 'Caug')

console.log('chords ok')
