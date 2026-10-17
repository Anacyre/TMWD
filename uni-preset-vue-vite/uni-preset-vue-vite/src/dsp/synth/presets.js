import { defaultTwinState } from './params.js'

function patch (name, edits) {
  const state = defaultTwinState()
  const apply = (target, src) => {
    Object.keys(src).forEach((key) => {
      if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
        target[key] = { ...(target[key] || {}), ...src[key] }
      } else target[key] = src[key]
    })
  }
  apply(state, edits)
  return { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, state }
}

export const TWIN_PRESETS = [
  patch('Init', {}),
  patch('Poly Saw', { osc1: { wave: 'saw', unison: 3, detune: 14, level: 0.8 }, osc2: { wave: 'saw', level: 0.2, detune: 6 }, filter1: { cutoff: 3800, res: 0.18 } }),
  patch('Soft Pad', { osc1: { wave: 'wt6', level: 0.6, unison: 4, detune: 18 }, osc2: { wave: 'sine', level: 0.35 }, env1: { attack: 0.35, release: 1.4 }, filter1: { cutoff: 2200 }, chorus: 0.4, reverb: 0.35 }),
  patch('Glass Keys', { osc1: { wave: 'sine', level: 0.7 }, osc2: { wave: 'wt7', level: 0.4 }, env1: { attack: 0.004, decay: 0.4, sustain: 0.35, release: 0.8 }, filter1: { cutoff: 6500 } }),
  patch('Bass Pluck', { osc1: { wave: 'saw', unison: 1, level: 0.9 }, osc2: { wave: 'square', level: 0.25 }, env1: { attack: 0.004, decay: 0.22, sustain: 0.15, release: 0.12 }, filter1: { type: 'lowpass', cutoff: 900, res: 0.4 } }),
  patch('Reese', { osc1: { wave: 'saw', unison: 2, detune: 28, level: 0.8 }, osc2: { wave: 'saw', unison: 2, detune: 22, level: 0.7, pan: -0.3 }, filter1: { cutoff: 700, res: 0.35 } }),
  patch('PWM Lead', { osc1: { wave: 'square', unison: 1, level: 0.75 }, osc2: { wave: 'square', level: 0.4, detune: 7 }, lfo1: { rate: 5.5, amount: 0.25 }, mods: [{ src: 'lfo1', dst: 'osc2Level', amount: 0.4 }], filter1: { cutoff: 3200 } }),
  patch('Analog Brass', { osc1: { wave: 'saw', unison: 3, detune: 10, level: 0.7 }, osc2: { wave: 'wt5', level: 0.4 }, env1: { attack: 0.08, decay: 0.3, sustain: 0.7, release: 0.4 }, filter1: { cutoff: 1800, res: 0.2 } }),
  patch('Choir Air', { osc1: { wave: 'wt6', unison: 5, detune: 22, level: 0.55 }, osc3: { wave: 'noise', level: 0.06 }, env1: { attack: 0.5, release: 1.8 }, reverb: 0.45, chorus: 0.3 }),
  patch('Pluck Guitar', { osc1: { wave: 'tri', level: 0.7 }, osc2: { wave: 'saw', level: 0.2 }, env1: { attack: 0.003, decay: 0.35, sustain: 0.1, release: 0.25 }, filter1: { cutoff: 2800 } }),
  patch('FM Bell-ish', { osc1: { wave: 'sine', level: 0.55 }, osc2: { wave: 'sine', level: 0.4, detune: 19 }, env1: { decay: 0.9, sustain: 0.2, release: 1.1 }, filter1: { cutoff: 5000 } }),
  patch('Dark Pad', { osc1: { wave: 'wt4', unison: 4, detune: 16, level: 0.6 }, osc2: { wave: 'saw', level: 0.25 }, filter1: { cutoff: 1100, res: 0.28 }, env1: { attack: 0.6, release: 2 }, reverb: 0.4 }),
  patch('Staccato', { osc1: { wave: 'square', level: 0.7 }, env1: { attack: 0.002, decay: 0.12, sustain: 0.05, release: 0.08 }, filter1: { cutoff: 2400 } }),
  patch('Wide Super', { osc1: { wave: 'saw', unison: 7, detune: 22, level: 0.75 }, osc2: { wave: 'saw', unison: 5, detune: 18, level: 0.4, pan: 0.4 }, chorus: 0.25, filter1: { cutoff: 5000 } }),
  patch('Sub Sine', { osc1: { wave: 'sine', level: 1 }, osc2: { wave: 'sine', level: 0.2, detune: 2 }, filter1: { cutoff: 400 }, env1: { attack: 0.01, sustain: 1, release: 0.2 } }),
  patch('Noise Hit', { osc1: { wave: 'noise', level: 0.8 }, osc2: { wave: 'sine', level: 0.1 }, env1: { attack: 0.001, decay: 0.18, sustain: 0, release: 0.08 }, filter1: { type: 'bandpass', cutoff: 1800, res: 0.5 } }),
  patch('Organ', { osc1: { wave: 'wt4', level: 0.7 }, osc2: { wave: 'sine', level: 0.4 }, osc3: { wave: 'sine', level: 0.2 }, env1: { attack: 0.02, sustain: 1, release: 0.12 }, chorus: 0.15 }),
  patch('Fifth Stack', { osc1: { wave: 'saw', level: 0.7 }, osc2: { wave: 'saw', level: 0.55, detune: 700 }, filter1: { cutoff: 2600 } }),
  patch('Slow Sweep', { osc1: { wave: 'saw', unison: 2, level: 0.7 }, env2: { attack: 1.4, decay: 1.2, sustain: 0.2, release: 1 }, mods: [{ src: 'env2', dst: 'cutoff', amount: 0.8 }], filter1: { cutoff: 600, res: 0.3 } }),
  patch('Arp Bright', { osc1: { wave: 'square', level: 0.65, unison: 2, detune: 6 }, osc2: { wave: 'wt7', level: 0.25 }, env1: { decay: 0.2, sustain: 0.2, release: 0.15 }, filter1: { cutoff: 7000 }, delay: 0.22 }),
  patch('Velvet Keys', { osc1: { wave: 'tri', level: 0.7 }, osc2: { wave: 'sine', level: 0.35 }, env1: { attack: 0.008, decay: 0.5, sustain: 0.55, release: 0.4 }, filter1: { cutoff: 3400 }, chorus: 0.2 }),
  patch('Grit Lead', { osc1: { wave: 'saw', unison: 2, detune: 9, level: 0.8 }, filter1: { cutoff: 1600, res: 0.45, drive: 6 }, env1: { attack: 0.03, sustain: 0.8, release: 0.25 } }),
  patch('Night Pad', { osc1: { wave: 'wt2', unison: 6, detune: 20, level: 0.5 }, osc2: { wave: 'wt6', level: 0.35, pan: -0.4 }, lfo1: { rate: 0.18, amount: 0.3 }, mods: [{ src: 'lfo1', dst: 'pan', amount: 0.5 }], reverb: 0.5, chorus: 0.35, env1: { attack: 0.8, release: 2.2 } }),
  patch('Click Bass', { osc1: { wave: 'sine', level: 0.85 }, osc3: { wave: 'noise', level: 0.12 }, env1: { attack: 0.001, decay: 0.16, sustain: 0.4, release: 0.1 }, filter1: { cutoff: 500, res: 0.25 } }),
  patch('Twin Init+', { osc1: { wave: 'saw', unison: 2, detune: 8, level: 0.7 }, osc2: { wave: 'wt1', level: 0.3 }, filter1: { cutoff: 4800 }, delay: 0.1, reverb: 0.12 })
]

export function twinPresetById (id) {
  return TWIN_PRESETS.find((p) => p.id === id) || TWIN_PRESETS[0]
}
