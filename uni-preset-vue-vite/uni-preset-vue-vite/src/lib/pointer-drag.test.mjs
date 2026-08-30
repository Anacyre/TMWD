/* Pointer drag contract: capture, filtering by pointer id, and zero-size guards. */

import { beginPointerDrag, trackRatio, clamp } from './pointer-drag.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

class FakeWindow {
  constructor () { this.listeners = new Map() }
  addEventListener (type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(fn)
  }
  removeEventListener (type, fn) {
    const list = this.listeners.get(type) || []
    const at = list.indexOf(fn)
    if (at >= 0) list.splice(at, 1)
  }
  emit (type, event) {
    ;(this.listeners.get(type) || []).slice().forEach((fn) => fn(event))
  }
  count (type) { return (this.listeners.get(type) || []).length }
}

function fakeTarget (rect) {
  return {
    captured: [],
    released: [],
    setPointerCapture (id) { this.captured.push(id) },
    releasePointerCapture (id) { this.released.push(id) },
    getBoundingClientRect: () => rect
  }
}

const win = new FakeWindow()
globalThis.window = win

// Capture starts, moves are delivered, and teardown removes every listener.
{
  const target = fakeTarget({ left: 0, top: 0, width: 100, height: 100 })
  const moves = []
  let ended = 0
  beginPointerDrag(
    { currentTarget: target, pointerId: 7, clientX: 0, clientY: 0 },
    { onMove: (ev) => moves.push(ev.clientX), onEnd: () => { ended++ } }
  )
  assert(target.captured[0] === 7, 'pointer is captured so the gesture survives leaving the control')
  win.emit('pointermove', { pointerId: 7, clientX: 42, cancelable: true, preventDefault () {} })
  assert(moves.length === 1 && moves[0] === 42, 'matching pointer moves are delivered')
  win.emit('pointermove', { pointerId: 9, clientX: 99, cancelable: false })
  assert(moves.length === 1, 'a second finger does not hijack the drag')
  win.emit('pointerup', { pointerId: 7 })
  assert(ended === 1, 'pointerup ends the drag')
  assert(target.released[0] === 7, 'capture is released')
  assert(win.count('pointermove') === 0 && win.count('pointerup') === 0 && win.count('pointercancel') === 0,
    'all listeners are removed')
  win.emit('pointerup', { pointerId: 7 })
  assert(ended === 1, 'end fires only once')
}

// pointercancel must also tear down, otherwise a fader stays latched.
{
  const target = fakeTarget({ left: 0, top: 0, width: 10, height: 10 })
  let ended = 0
  beginPointerDrag({ currentTarget: target, pointerId: 1 }, { onEnd: () => { ended++ } })
  win.emit('pointercancel', { pointerId: 1 })
  assert(ended === 1 && win.count('pointermove') === 0, 'pointercancel releases the drag')
}

// trackRatio: orientation, clamping and the zero-size guard.
{
  const horizontal = { left: 100, top: 0, width: 200, height: 20 }
  assert(trackRatio({ clientX: 150, clientY: 5 }, fakeTarget(horizontal), 'horizontal') === 0.25,
    'horizontal ratio measures from the left edge')
  assert(trackRatio({ clientX: 400, clientY: 5 }, fakeTarget(horizontal), 'horizontal') === 1,
    'past the right edge clamps to full')
  assert(trackRatio({ clientX: 0, clientY: 5 }, fakeTarget(horizontal), 'horizontal') === 0,
    'past the left edge clamps to zero')

  const vertical = { left: 0, top: 50, width: 20, height: 100 }
  assert(trackRatio({ clientX: 5, clientY: 150 }, fakeTarget(vertical), 'vertical') === 0,
    'vertical bottom is zero')
  assert(trackRatio({ clientX: 5, clientY: 50 }, fakeTarget(vertical), 'vertical') === 1,
    'vertical top is full')
  assert(trackRatio({ clientX: 5, clientY: 100 }, fakeTarget(vertical), 'vertical') === 0.5,
    'vertical midpoint is half')

  // This is the case that used to leave the mixer fader frozen.
  assert(trackRatio({ clientX: 5, clientY: 5 }, fakeTarget({ left: 0, top: 0, width: 20, height: 0 }), 'vertical') === null,
    'a zero-height track reports null instead of NaN')
  assert(trackRatio({ clientX: 5, clientY: 5 }, null, 'vertical') === null, 'a missing element reports null')
}

// clamp rejects NaN so a bad rect can never poison the model value.
{
  assert(clamp(NaN, 0, 1) === 0, 'NaN clamps to the minimum')
  assert(clamp(2, 0, 1) === 1, 'above range clamps to max')
  assert(clamp(-2, 0, 1) === 0, 'below range clamps to min')
  assert(clamp(0.4, 0, 1) === 0.4, 'in-range values pass through')
}

console.log('pointer-drag ok')
