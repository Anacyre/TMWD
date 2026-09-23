import assert from 'node:assert/strict'
import { releasePlan } from './release.js'

/** A voice as `engine.js` builds it, reduced to the fields the decision reads. */
function voice (over = {}) {
  const decoded = Object.assign({
    audio: { duration: 6 },
    releaseStart: 4,
    loop: true,
    loopStart: 1.5,
    loopEnd: 3.8
  }, over.decoded || {})
  return Object.assign({
    baseRate: 1,
    release: 0.55,
    releaseMode: 'segment',
    pedal: false,
    releasing: false
  }, over, { decoded })
}

const plan = (v, o) => releasePlan(v, o).action

// --- a held sustain pedal keeps the note sounding ------------------------------
{
  const piano = voice({ pedal: true, decays: true, decoded: { loop: false } })

  assert.equal(plan(piano, { pedalDown: true, elapsedSec: 0.5 }), 'hold',
    'with the pedal down the key lifting must not damp the string')
  assert.equal(plan(piano, { pedalDown: false, elapsedSec: 0.5 }), 'envelope',
    'with the pedal up a piano key damps from the current playback, not a jump to the tail')
  assert.equal(plan(piano, { pedalDown: true, elapsedSec: 0.5, force: true }), 'envelope',
    'lifting the pedal, voice capping and all-notes-off force a damper envelope')

  const strings = voice({ pedal: false })
  assert.equal(plan(strings, { pedalDown: true, elapsedSec: 0.5 }), 'segment',
    'an instrument with no pedal ignores CC64 entirely')
}

// --- a pedalled note still resolves once the pedal is lifted -------------------
{
  // The hold is a decision, not a state change: nothing is consumed, so re-asking after the
  // pedal comes up yields the real release. This is what liftPedal relies on.
  const piano = voice({ pedal: true, decays: true, decoded: { loop: false } })
  assert.equal(plan(piano, { pedalDown: true, elapsedSec: 1 }), 'hold')
  assert.equal(plan(piano, { pedalDown: false, elapsedSec: 1 }), 'envelope')
}

// --- one-shots are never cut short --------------------------------------------
{
  // Pizzicato and spiccato are 1s body + 1s decay. The whole point is that the recording is
  // already complete, so note-off must not impose a release of its own.
  const pizz = voice({ releaseMode: 'free', decoded: { audio: { duration: 2 }, releaseStart: 1, loop: false } })
  assert.equal(plan(pizz, { elapsedSec: 0.1 }), 'free', 'a short note-off lets the pluck ring out')
  assert.equal(plan(pizz, { elapsedSec: 1.9 }), 'free', 'still free near the end of the buffer')
  assert.equal(plan(pizz, { pedalDown: true, elapsedSec: 0.1 }), 'free',
    'pizzicato declares no pedal, so CC64 does not reach it')
}

// --- past the splice point there is nothing left to crossfade to ---------------
{
  // Piano does not loop, so a long-held note walks into its own release tail unaided. Firing
  // the segment again at that point would restart audio the ear has already moved past.
  const piano = voice({ pedal: true, decays: true, decoded: { loop: false } })
  assert.equal(plan(piano, { elapsedSec: 0.3 }), 'envelope', 'early in the body, fade from here')
  assert.equal(plan(piano, { elapsedSec: 3.9 }), 'envelope', 'just before the splice, still a damper fade')
  assert.equal(plan(piano, { elapsedSec: 4.0 }), 'envelope', 'at the splice the tail is already playing')
  assert.equal(plan(piano, { elapsedSec: 5.5 }), 'envelope', 'deep into the tail, just fade out')

  // A looped body never advances past the splice no matter how long the key is held, which is
  // exactly why sustained strings can hold for longer than the 6s file.
  const tutti = voice({ decoded: { loop: true } })
  assert.equal(plan(tutti, { elapsedSec: 30 }), 'segment',
    'a looping body can always reach for its release tail')
}

// --- playback rate rescales elapsed time into buffer position ------------------
{
  // Two semitones up runs the buffer ~12% fast, so the splice arrives sooner in wall clock.
  const fast = voice({ baseRate: 2, decoded: { loop: false } })
  assert.equal(plan(fast, { elapsedSec: 1.9 }), 'segment', 'at double rate 1.9s is still inside the body')
  assert.equal(plan(fast, { elapsedSec: 2.1 }), 'envelope', 'at double rate 2.1s is already past the 4s splice')

  const slow = voice({ baseRate: 0.5, decoded: { loop: false } })
  assert.equal(plan(slow, { elapsedSec: 7 }), 'segment', 'at half rate the body lasts 8s')
}

// --- degenerate manifests fall back instead of throwing -----------------------
{
  assert.equal(plan(voice({ decoded: { releaseStart: 0 } }), { elapsedSec: 1 }), 'envelope',
    'no release tail recorded, so use a gain ramp')
  assert.equal(plan(voice({ decoded: { releaseStart: 5.99, audio: { duration: 6 } } }), { elapsedSec: 1 }), 'envelope',
    'a tail thinner than a crossfade is not worth splicing')
  assert.equal(plan(voice({ decoded: { audio: null } }), { elapsedSec: 1 }), 'envelope',
    'an undecoded voice does not throw')
  assert.equal(releasePlan(null, {}).action, 'none', 'a missing voice is a no-op')
  assert.equal(plan(voice({ releasing: true }), { elapsedSec: 1 }), 'none',
    'a voice already releasing is not released twice')
}

console.log('orchestra-v release ok')
