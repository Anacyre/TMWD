/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * This file is a derivative of Vital (https://github.com/mtytel/vital)
 * and is licensed under the GNU General Public License v3.0 or later.
 * See src/dsp/vital-lite/LICENSE.
 */

/** Worklet-safe primitives shared by every VitalLite processor. No nested templates. */
export const VITAL_LITE_SHIM_SOURCE = `
function vlMidiToHz (m) { return 440 * Math.pow(2, (m - 69) / 12) }
function vlClamp (x, a, b) { return x < a ? a : (x > b ? b : x) }
function vlDbLin (db) { return Math.pow(10, db / 20) }
function vlEqWet (w) { return Math.sin(vlClamp(w, 0, 1) * 1.5707963267948966) }
function vlEqDry (w) { return Math.cos(vlClamp(w, 0, 1) * 1.5707963267948966) }
function vlOnePoleCoeff (hz, sr) {
  var dp = Math.max(0, hz) * 3.141592653589793 / sr
  return Math.tan(dp / (dp + 1))
}
function vlCubic (y0, y1, y2, y3, t) {
  var a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3
  var a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3
  var a2 = -0.5 * y0 + 0.5 * y2
  return ((a0 * t + a1) * t + a2) * t + y1
}
function vlTanh (x) {
  var y = vlClamp(x, -4, 4)
  return y * (27 + y * y) / (27 + 9 * y * y)
}
function vlSat (x) {
  var x2 = x * x
  return x / (1 + x2 / (3 + x2))
}
function vlSyncHz (bpm, tempo, sync) {
  var ratios = [0, 0.0078125, 0.015625, 0.03125, 0.0625, 0.125, 0.25, 0.5, 1, 2, 4, 8, 16]
  var i = tempo | 0
  if (i < 0) i = 0
  if (i > 12) i = 12
  var hz = (ratios[i] || 1) * (Math.max(20, bpm || 120) / 60)
  if (sync === 2) hz *= 0.6666666667
  if (sync === 3) hz *= 1.5
  return Math.max(0.01, hz)
}

function VlOnePole () { this.s = 0; this.y = 0; this.sat = 0 }
VlOnePole.prototype.reset = function () { this.s = 0; this.y = 0; this.sat = 0 }
VlOnePole.prototype.tickBasic = function (x, c) {
  var d = c * (x - this.s)
  this.s += d
  this.y = this.s
  this.s += d
  return this.y
}
VlOnePole.prototype.tickSat = function (x, c) {
  var d = c * (x - this.sat)
  this.s += d
  this.y = vlSat(this.s)
  this.s += d
  this.sat = vlSat(this.s)
  return this.y
}

function VlDelay (n) {
  var size = 1
  var need = Math.max(64, n | 0)
  while (size < need) size <<= 1
  this.b = new Float32Array(size)
  this.mask = size - 1
  this.w = 0
}
VlDelay.prototype.reset = function () { this.b.fill(0); this.w = 0 }
VlDelay.prototype.write = function (x) {
  this.b[this.w] = x
  this.w = (this.w + 1) & this.mask
}
VlDelay.prototype.read = function (d) {
  var r = this.w - d
  var i1 = Math.floor(r)
  var f = r - i1
  var m = this.mask
  var b = this.b
  return vlCubic(b[(i1 - 1) & m], b[i1 & m], b[(i1 + 1) & m], b[(i1 + 2) & m], f)
}
VlDelay.prototype.readInt = function (d) {
  return this.b[(this.w - (d | 0)) & this.mask]
}

function VlSvf () {
  this.s1 = 0
  this.s2 = 0
}
VlSvf.prototype.reset = function () { this.s1 = 0; this.s2 = 0 }
VlSvf.prototype.tick = function (x, g, k) {
  var hp = (x - this.s1 * k - this.s2) / (1 + g * (g + k))
  var bp = hp * g + this.s1
  var lp = bp * g + this.s2
  this.s1 = hp * g + bp
  this.s2 = bp * g + lp
  return { hp: hp, bp: bp, lp: lp, notch: hp + lp }
}

function VlLr4 (hz, sr) {
  this.lp1 = new VlSvf()
  this.lp2 = new VlSvf()
  this.g = Math.tan(Math.PI * vlClamp(hz, 20, sr * 0.45) / sr)
  this.k = Math.SQRT2
}
VlLr4.prototype.reset = function () { this.lp1.reset(); this.lp2.reset() }
VlLr4.prototype.split = function (x) {
  var a = this.lp1.tick(x, this.g, this.k)
  var b = this.lp2.tick(a.lp, this.g, this.k)
  return { lo: b.lp, hi: x - b.lp }
}
`
