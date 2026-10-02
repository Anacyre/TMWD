/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * This file is a derivative of Vital (https://github.com/mtytel/vital)
 * and is licensed under the GNU General Public License v3.0 or later.
 * See src/dsp/vital-lite/LICENSE.
 */

import { clamp, mergeState } from '../plugin.js'

export { clamp, mergeState }

export const MIDI_A4 = 69
export const HZ_A4 = 440
export const SYNC_RATIOS = [0, 1 / 128, 1 / 64, 1 / 32, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16]
export const DELAY_STYLES = ['mono', 'stereo', 'pingpong', 'mid-pingpong']
export const DISTORTION_TYPES = ['soft', 'hard', 'fold', 'sinfold', 'bitcrush', 'downsample']
export const FILTER_ORDERS = ['off', 'pre', 'post']
export const COMPRESSOR_BANDS = ['multiband', 'low-band', 'high-band', 'single']
export const EQ_LOW_MODES = ['highpass', 'lowshelf']
export const EQ_BAND_MODES = ['notch', 'bell']
export const EQ_HIGH_MODES = ['lowpass', 'highshelf']
export const FILTER_MODELS = ['analog', 'ladder', 'digital']
export const FILTER_STYLES = ['12dB', '24dB']

/** Vital midi-note → Hz. Cutoffs in ValueDetails are stored as MIDI. */
export function midiToHz (midi) {
  return HZ_A4 * Math.pow(2, (Number(midi) - MIDI_A4) / 12)
}

/** Vital kExponential: displayed unit is 2^raw. */
export function exp2 (raw) {
  return Math.pow(2, Number(raw) || 0)
}

export function log2 (value) {
  return Math.log(Math.max(1e-12, Number(value) || 0)) / Math.LN2
}

export function dbToLin (db) {
  return Math.pow(10, db / 20)
}

export function equalPower (wet) {
  const t = clamp(wet, 0, 1) * Math.PI * 0.5
  return { wet: Math.sin(t), dry: Math.cos(t) }
}

export function syncedHz (bpm, tempoIndex, sync) {
  const ratio = SYNC_RATIOS[Math.round(clamp(tempoIndex, 0, SYNC_RATIOS.length - 1))] || 1
  let hz = ratio * (Math.max(20, Number(bpm) || 120) / 60)
  if (sync === 2) hz *= 2 / 3
  if (sync === 3) hz *= 3 / 2
  return Math.max(0.01, hz)
}

export function num (value, fallback, min, max) {
  const n = Number(value)
  const v = Number.isFinite(n) ? n : fallback
  if (min != null && max != null) return clamp(v, min, max)
  return v
}

export function idx (value, fallback, names) {
  if (typeof value === 'string') {
    const i = names.indexOf(value)
    return i >= 0 ? names[i] : names[fallback] || names[0]
  }
  const i = Math.round(Number(value))
  if (Number.isFinite(i) && names[i] != null) return names[i]
  if (names[fallback] != null) return names[fallback]
  return names[0]
}

export function createProcessor (source, className, sampleRate) {
  const Ctor = new Function(source + '\nreturn ' + className + ';')()
  return new Ctor(sampleRate)
}
