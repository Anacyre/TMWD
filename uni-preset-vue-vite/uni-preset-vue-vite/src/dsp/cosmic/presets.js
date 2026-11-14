import { defaultCosmicState, normalizeCosmicState } from './dsp.js'

function edit (name, category, mutate) {
  const state = defaultCosmicState()
  mutate(state)
  const id = 'factory:' + name.toLowerCase().replace(/\s+/g, '-')
  state.meta = { id: id, name: name, category: category }
  return { id: id, name: name, category: category, state: normalizeCosmicState(state) }
}

export const COSMIC_PRESETS = [
  edit('Init', 'Init', () => {}),
  edit('Cosmic Pad', 'Pad', (s) => {
    s.osc[0].unison = 5
    s.osc[0].detune = 18
    s.osc[0].spread = 0.8
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 4
    s.osc[0].level = 0.55
    s.osc[1].wave = 'wt'
    s.osc[1].wt = 2
    s.osc[1].level = 0.35
    s.osc[1].frame = 0.4
    s.env[0].attack = 0.45
    s.env[0].release = 1.4
    s.env[0].sustain = 0.8
    s.filters[0].cutoff = 1800
    s.fx.find((fx) => fx.id === 'reverb').mix = 0.42
    s.fx.find((fx) => fx.id === 'chorus').mix = 0.35
    s.mods.push({ src: 'lfo2', dst: 'f0.cutoff', amount: 0.35, bipolar: true, curve: 0 })
  }),
  edit('Glass Lead', 'Lead', (s) => {
    s.osc[0].wave = 'saw'
    s.osc[0].warp = 'sync'
    s.osc[0].warpAmt = 0.42
    s.osc[0].level = 0.7
    s.osc[1].level = 0.15
    s.osc[2].level = 0
    s.env[0].attack = 0.005
    s.env[0].decay = 0.18
    s.env[0].sustain = 0.65
    s.filters[0].cutoff = 2400
    s.filters[0].res = 0.35
    s.global.mode = 'mono'
    s.global.glide = 0.08
    s.mods.push({ src: 'env2', dst: 'f0.cutoff', amount: 0.55, bipolar: false, curve: -0.3 })
  }),
  edit('Deep Bass', 'Bass', (s) => {
    s.osc[0].wave = 'saw'
    s.osc[0].oct = -1
    s.osc[0].level = 0.8
    s.osc[1].wave = 'square'
    s.osc[1].oct = -1
    s.osc[1].level = 0.35
    s.osc[2].level = 0
    s.sub.on = true
    s.sub.level = 0.7
    s.sub.oct = -1
    s.env[0].attack = 0.004
    s.env[0].decay = 0.18
    s.env[0].sustain = 0.35
    s.filters[0].cutoff = 420
    s.filters[0].res = 0.4
    s.filters[0].drive = 0.25
    s.global.mode = 'mono'
    s.global.poly = 1
    s.fx.find((fx) => fx.id === 'reverb').on = false
    s.fx.find((fx) => fx.id === 'distortion').on = true
    s.fx.find((fx) => fx.id === 'distortion').mix = 0.22
  }),
  edit('Star Keys', 'Keys', (s) => {
    s.osc[0].wave = 'sine'
    s.osc[0].level = 0.65
    s.osc[1].wave = 'wt'
    s.osc[1].wt = 3
    s.osc[1].level = 0.4
    s.osc[2].wave = 'tri'
    s.osc[2].level = 0.18
    s.env[0].attack = 0.004
    s.env[0].decay = 0.45
    s.env[0].sustain = 0.25
    s.env[0].release = 0.55
    s.filters[0].cutoff = 5200
    s.fx.find((fx) => fx.id === 'chorus').mix = 0.22
  }),
  edit('Drift Pluck', 'Pluck', (s) => {
    s.osc[0].wave = 'saw'
    s.osc[0].level = 0.75
    s.osc[1].level = 0.2
    s.osc[2].level = 0
    s.env[0].attack = 0.002
    s.env[0].decay = 0.22
    s.env[0].sustain = 0
    s.env[0].release = 0.18
    s.env[1].attack = 0.002
    s.env[1].decay = 0.28
    s.env[1].sustain = 0
    s.filters[0].cutoff = 900
    s.mods.push({ src: 'env2', dst: 'f0.cutoff', amount: 0.8, bipolar: false, curve: 0.2 })
    s.fx.find((fx) => fx.id === 'delay').on = true
    s.fx.find((fx) => fx.id === 'delay').mix = 0.22
  }),
  edit('Orbit', 'Motion', (s) => {
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 0
    s.osc[0].unison = 3
    s.osc[0].frame = 0.2
    s.lfo[0].rate = 0.15
    s.lfo[0].shape = 'tri'
    s.lfo[1].sync = true
    s.lfo[1].beats = 0.5
    s.mods.push({ src: 'lfo1', dst: 'osc0.frame', amount: 0.7, bipolar: true, curve: 0 })
    s.mods.push({ src: 'lfo2', dst: 'f0.cutoff', amount: 0.4, bipolar: true, curve: 0 })
    s.fx.find((fx) => fx.id === 'phaser').on = true
    s.fx.find((fx) => fx.id === 'phaser').mix = 0.28
  }),
  edit('Dust', 'Texture', (s) => {
    s.osc[0].level = 0.2
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 5
    s.osc[1].level = 0
    s.osc[2].level = 0
    s.noise.on = true
    s.noise.type = 'pink'
    s.noise.level = 0.45
    s.env[0].attack = 0.3
    s.env[0].sustain = 0.7
    s.env[0].release = 1.6
    s.filters[0].type = 'bp'
    s.filters[0].cutoff = 1400
    s.filters[0].res = 0.45
    s.fx.find((fx) => fx.id === 'reverb').mix = 0.55
    s.fx.find((fx) => fx.id === 'reverb').size = 0.8
  }),
  edit('Neon Pulse', 'Lead', (s) => {
    s.osc[0].wave = 'square'
    s.osc[0].warp = 'pwm'
    s.osc[0].warpAmt = 0.55
    s.osc[0].level = 0.7
    s.osc[1].wave = 'saw'
    s.osc[1].oct = 1
    s.osc[1].level = 0.22
    s.osc[2].level = 0
    s.env[0].attack = 0.008
    s.env[0].decay = 0.2
    s.env[0].sustain = 0.55
    s.filters[0].type = 'ladder'
    s.filters[0].cutoff = 1600
    s.filters[0].res = 0.42
    s.filters[0].drive = 0.2
    s.lfo[0].rate = 5.5
    s.mods.push({ src: 'lfo1', dst: 'osc0.warp', amount: 0.35, bipolar: true, curve: 0 })
    s.fx.find((fx) => fx.id === 'delay').on = true
    s.fx.find((fx) => fx.id === 'delay').mix = 0.18
  }),
  edit('Void Bass', 'Bass', (s) => {
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 5
    s.osc[0].frame = 0.35
    s.osc[0].oct = -1
    s.osc[0].level = 0.78
    s.osc[1].wave = 'saw'
    s.osc[1].oct = -1
    s.osc[1].level = 0.28
    s.osc[2].level = 0
    s.sub.on = true
    s.sub.wave = 'square'
    s.sub.level = 0.55
    s.env[0].attack = 0.003
    s.env[0].decay = 0.28
    s.env[0].sustain = 0.4
    s.filters[0].type = 'ladder'
    s.filters[0].slope = 24
    s.filters[0].cutoff = 280
    s.filters[0].res = 0.55
    s.filters[0].drive = 0.4
    s.global.mode = 'mono'
    s.global.glide = 0.05
    s.fx.find((fx) => fx.id === 'reverb').on = false
    s.fx.find((fx) => fx.id === 'distortion').on = true
    s.fx.find((fx) => fx.id === 'distortion').mix = 0.28
  }),
  edit('Aurora', 'Pad', (s) => {
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 2
    s.osc[0].unison = 6
    s.osc[0].detune = 22
    s.osc[0].spread = 0.9
    s.osc[0].level = 0.48
    s.osc[1].wave = 'wt'
    s.osc[1].wt = 3
    s.osc[1].frame = 0.6
    s.osc[1].level = 0.38
    s.osc[2].wave = 'sine'
    s.osc[2].oct = 1
    s.osc[2].level = 0.16
    s.env[0].attack = 0.9
    s.env[0].release = 2.2
    s.env[0].sustain = 0.85
    s.filters[0].cutoff = 2200
    s.filters[0].res = 0.12
    s.lfo[1].rate = 0.08
    s.mods.push({ src: 'lfo1', dst: 'osc0.frame', amount: 0.45, bipolar: true, curve: 0 })
    s.mods.push({ src: 'lfo2', dst: 'osc1.pan', amount: 0.5, bipolar: true, curve: 0 })
    s.fx.find((fx) => fx.id === 'reverb').mix = 0.48
    s.fx.find((fx) => fx.id === 'chorus').mix = 0.4
  }),
  edit('Crystal', 'Keys', (s) => {
    s.osc[0].wave = 'sine'
    s.osc[0].level = 0.55
    s.osc[1].wave = 'wt'
    s.osc[1].wt = 3
    s.osc[1].frame = 0.25
    s.osc[1].level = 0.42
    s.osc[2].wave = 'tri'
    s.osc[2].oct = 1
    s.osc[2].level = 0.2
    s.env[0].attack = 0.002
    s.env[0].decay = 1.1
    s.env[0].sustain = 0.15
    s.env[0].release = 0.9
    s.filters[0].cutoff = 6800
    s.filters[0].res = 0.18
    s.fx.find((fx) => fx.id === 'reverb').mix = 0.32
    s.fx.find((fx) => fx.id === 'delay').on = true
    s.fx.find((fx) => fx.id === 'delay').mix = 0.16
    s.fx.find((fx) => fx.id === 'delay').beats = 0.5
  }),
  edit('Wire', 'Pluck', (s) => {
    s.osc[0].wave = 'saw'
    s.osc[0].warp = 'sync'
    s.osc[0].warpAmt = 0.28
    s.osc[0].level = 0.7
    s.osc[1].wave = 'square'
    s.osc[1].level = 0.25
    s.osc[2].level = 0
    s.env[0].attack = 0.001
    s.env[0].decay = 0.16
    s.env[0].sustain = 0
    s.env[0].release = 0.12
    s.env[1].attack = 0.001
    s.env[1].decay = 0.2
    s.env[1].sustain = 0
    s.filters[0].type = 'bp'
    s.filters[0].cutoff = 1800
    s.filters[0].res = 0.5
    s.mods.push({ src: 'env2', dst: 'f0.cutoff', amount: 0.7, bipolar: false, curve: 0.15 })
    s.mods.push({ src: 'env2', dst: 'osc0.warp', amount: 0.4, bipolar: false, curve: 0 })
  }),
  edit('Tide', 'Motion', (s) => {
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 4
    s.osc[0].unison = 4
    s.osc[0].frame = 0.1
    s.osc[0].level = 0.55
    s.osc[1].wave = 'saw'
    s.osc[1].level = 0.3
    s.osc[2].wave = 'sine'
    s.osc[2].level = 0.18
    s.env[0].attack = 0.25
    s.env[0].release = 1.1
    s.lfo[0].sync = true
    s.lfo[0].beats = 1
    s.lfo[0].shape = 'sine'
    s.lfo[1].sync = true
    s.lfo[1].beats = 0.5
    s.mods.push({ src: 'lfo1', dst: 'osc0.frame', amount: 0.8, bipolar: true, curve: 0 })
    s.mods.push({ src: 'lfo2', dst: 'f0.cutoff', amount: 0.5, bipolar: true, curve: 0 })
    s.filters[0].cutoff = 2400
    s.fx.find((fx) => fx.id === 'flanger').on = true
    s.fx.find((fx) => fx.id === 'flanger').mix = 0.25
  }),
  edit('Ember', 'Lead', (s) => {
    s.osc[0].wave = 'saw'
    s.osc[0].unison = 3
    s.osc[0].detune = 14
    s.osc[0].level = 0.68
    s.osc[1].wave = 'wt'
    s.osc[1].wt = 0
    s.osc[1].frame = 0.55
    s.osc[1].level = 0.32
    s.osc[2].level = 0
    s.env[0].attack = 0.02
    s.env[0].decay = 0.35
    s.env[0].sustain = 0.7
    s.filters[0].type = 'ladder'
    s.filters[0].cutoff = 1100
    s.filters[0].res = 0.48
    s.filters[0].drive = 0.3
    s.mods.push({ src: 'env2', dst: 'f0.cutoff', amount: 0.6, bipolar: false, curve: -0.2 })
    s.fx.find((fx) => fx.id === 'distortion').on = true
    s.fx.find((fx) => fx.id === 'distortion').mix = 0.18
    s.fx.find((fx) => fx.id === 'delay').on = true
    s.fx.find((fx) => fx.id === 'delay').mix = 0.2
  }),
  edit('Halo', 'Texture', (s) => {
    s.osc[0].wave = 'wt'
    s.osc[0].wt = 1
    s.osc[0].level = 0.35
    s.osc[0].unison = 5
    s.osc[1].wave = 'sine'
    s.osc[1].oct = 1
    s.osc[1].level = 0.25
    s.osc[2].level = 0.12
    s.noise.on = true
    s.noise.type = 'white'
    s.noise.level = 0.18
    s.env[0].attack = 0.5
    s.env[0].sustain = 0.75
    s.env[0].release = 1.8
    s.filters[0].type = 'bp'
    s.filters[0].cutoff = 900
    s.filters[0].res = 0.35
    s.filters[1].type = 'hp'
    s.filters[1].cutoff = 180
    s.lfo[0].rate = 0.2
    s.mods.push({ src: 'lfo1', dst: 'noise.level', amount: 0.4, bipolar: false, curve: 0 })
    s.fx.find((fx) => fx.id === 'reverb').mix = 0.6
    s.fx.find((fx) => fx.id === 'reverb').size = 0.85
    s.fx.find((fx) => fx.id === 'phaser').on = true
    s.fx.find((fx) => fx.id === 'phaser').mix = 0.22
  })
]

export function cosmicPresetById (id) {
  return COSMIC_PRESETS.find((preset) => preset.id === id) || null
}
