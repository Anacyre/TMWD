import {
  PPQ,
  MIN_DURATION_TICKS,
  normalizeNote,
  serializeNote,
  parseClipboard,
  serializeClipboard,
  quantizeTick,
  quantizeNotes,
  duplicateNotes,
  shiftVelocity,
  expandRepeats,
  visibleNotes,
  createStressNotes,
  midiVelocity,
  snapTick,
  ticksPerBar,
  timeSignatureAtTick,
  isScalePitch,
  snapPitchToScale
} from './note-model.js'
import { hitNote, xToTick, defaultView, viewportTicks, iterateGridLines } from './piano-roll-engine.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

const legacy = normalizeNote({ id: 7, pitch: 64, startBeat: 1, lengthBeats: 0.5, velocity: 0.8 })
assert(legacy.startTick === PPQ, 'startBeat 1 migrates to 960 ticks')
assert(legacy.durationTick === PPQ / 2, 'lengthBeats 0.5 migrates to 480 ticks')
assert(legacy.velocity === 102, 'normalized velocity 0.8 becomes MIDI 102')
assert(legacy.start === 1, 'derived start beats')

const engine = normalizeNote({ noteId: 3, pitch: 60, start: 0.25, duration: 0.25, velocity: 100 })
assert(engine.id === 3 && engine.startTick === PPQ / 4, 'engine start/duration beats migrate')
assert(midiVelocity(100) === 100 && midiVelocity(0.5) === 64, 'velocity midi vs norm')

const roundTrip = normalizeNote(serializeNote(legacy))
assert(roundTrip.startTick === legacy.startTick && roundTrip.pitchOffset === 0, 'serialize round-trip')

assert(snapTick(100, 240) === 0 || snapTick(100, 240) === 240, 'snap chooses a grid')
assert(snapTick(120, 240) === 240 || snapTick(120, 240) === 0, 'nearest grid')
assert(quantizeTick(100, 240, 0) === 100, 'quantize 0% keeps time')
assert(quantizeTick(100, 240, 1) === snapTick(100, 240), 'quantize 100% snaps')
assert(quantizeTick(100, 240, 0.5) === Math.round(100 + 0.5 * (snapTick(100, 240) - 100)), 'partial quantize')

const notes = [
  normalizeNote({ id: 1, pitch: 60, startTick: 0, durationTick: 480, velocity: 80 }),
  normalizeNote({ id: 2, pitch: 64, startTick: 240, durationTick: 240, velocity: 90 })
]
const copies = duplicateNotes(notes)
assert(copies[0].startTick === 480, 'duplicate shifts by selection length')
assert(copies[0].velocity === 80 && copies[0].id === 0, 'duplicate keeps controllers, clears id')

const vel = shiftVelocity(notes, 10)
assert(vel[0].velocity === 90 && vel[1].velocity === 100, 'relative velocity')
const abs = shiftVelocity(notes, 100, true)
assert(abs[0].velocity === 100 && abs[1].velocity === 100, 'absolute velocity only when requested')

const q = quantizeNotes([normalizeNote({ startTick: 100, durationTick: 200 })], 240, { strength: 1 })
assert(q[0].startTick === snapTick(100, 240), 'quantize start')

const repeated = expandRepeats(normalizeNote({ startTick: 0, durationTick: PPQ, repeatMode: 7 }))
assert(repeated.length === 4, '1/16 repeats inside a quarter')

assert(ticksPerBar(4, 4) === PPQ * 4, '4/4 bar')
assert(ticksPerBar(6, 8) === PPQ * 3, '6/8 bar in quarter ticks')
const sig = timeSignatureAtTick([
  { timeTick: 0, numerator: 4, denominator: 4 },
  { timeTick: PPQ * 8, numerator: 3, denominator: 4 }
], PPQ * 9)
assert(sig.numerator === 3, 'time signature at tick')

assert(isScalePitch(60, 'C', 'major'), 'C is in C major')
assert(!isScalePitch(61, 'C', 'major'), 'C# is out of C major')
assert(snapPitchToScale(61, 'C', 'major') === 60 || snapPitchToScale(61, 'C', 'major') === 62, 'C# snaps to a C major pitch')

const clip = serializeClipboard(notes)
assert(parseClipboard(clip).length === 2, 'clipboard round-trip')
assert(parseClipboard('not json').length === 0, 'bad clipboard is empty')

const thousands = createStressNotes(10000)
assert(thousands.length === 10000, '10k generator')
const vis = visibleNotes(thousands, { startTick: 0, endTick: PPQ * 4, minPitch: 36, maxPitch: 48 })
assert(vis.length < 10000, 'viewport culls 10k notes')
assert(vis.length > 0, 'viewport still finds notes')

const bars = []
iterateGridLines(0, PPQ * 8, 48, [
  { timeTick: 0, numerator: 4, denominator: 4 },
  { timeTick: PPQ * 8, numerator: 3, denominator: 4 }
], { numerator: 4, denominator: 4 }, (tick, kind) => { if (kind === 'bar') bars.push(tick) })
assert(bars.includes(0) && bars.includes(PPQ * 4), 'bar lines follow 4/4 origin')

const view = defaultView()
const hit = hitNote(notes, 4, 14 * (127 - 60) + 4, { ...view, scrollY: 0, pixelsPerSemitone: 14, pixelsPerBeat: 48, scrollX: 0 })
assert(hit && hit.note.id === 1, 'hit-test finds note')
const ticks = viewportTicks(400, view)
assert(ticks.endTick > ticks.startTick, 'viewport ticks')
assert(xToTick(0, { ...view, scrollX: 0 }, { snap: false }) === 0, 'x 0 is tick 0')
assert(MIN_DURATION_TICKS === 15, '1/64 at PPQ 960')

console.log('note-model tests passed')
