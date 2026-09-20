/**
 * What note-off does to a voice, decided without touching an audio graph.
 *
 * This lives apart from `engine.js` so it can be reasoned about and tested on its own: the
 * runtime there owns nodes, timers and an AudioContext, while the choice made here is pure.
 */

/**
 * Decide how to end one voice.
 *
 *   none     already on its way out, or nothing to act on
 *   hold     the sustain pedal is down on an instrument that has one, so do not damp yet
 *   free     the file already contains its entire decay, so cutting it off would chop a
 *            spiccato or pizzicato in half; let it ring and collect it when the buffer ends
 *   segment  crossfade into the release tail baked into the same file
 *   envelope no usable tail left to reach for, so ride the gain down
 *
 * `elapsedSec` is wall-clock since note-on. Scaling it by the voice's playback rate converts
 * it into a position in the buffer, which matters because a pitch-shifted sample runs through
 * its body faster or slower than real time.
 */
export function releasePlan (voice, opts = {}) {
  if (!voice || voice.releasing) return { action: 'none' }
  if (!opts.force && voice.pedal && opts.pedalDown) return { action: 'hold' }
  if (voice.releaseMode === 'free') return { action: 'free' }

  const decoded = voice.decoded
  const duration = decoded && decoded.audio ? decoded.audio.duration : 0
  const start = decoded ? decoded.releaseStart || 0 : 0
  // A splice within a frame of the end has no tail left worth playing.
  const hasSegment = start > 0 && start < duration - 0.04
  // A body that never loops walks into its own tail unaided. Past the splice point that tail
  // is already sounding, so crossfading to it would restart audio the ear has moved beyond.
  const past = !(decoded && decoded.loop)
    && (opts.elapsedSec || 0) * (voice.baseRate || 1) >= start

  if (hasSegment && !past) return { action: 'segment' }
  return { action: 'envelope' }
}
