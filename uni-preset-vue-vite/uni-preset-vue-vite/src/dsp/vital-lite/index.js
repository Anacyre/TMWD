/* Copyright 2013-2019 Matt Tytel
 * Copyright 2026 DawWebMain contributors (JavaScript AudioWorklet port)
 *
 * Licensed under GNU GPL v3.0 or later. See src/dsp/vital-lite/LICENSE.
 */

import { VITAL_LITE_SHIM_SOURCE } from './shim-source.js'
import { VITAL_LITE_REVERB_PROCESSOR_SOURCE } from './reverb.js'
import { VITAL_LITE_CHORUS_PROCESSOR_SOURCE } from './chorus.js'
import { VITAL_LITE_FLANGER_PROCESSOR_SOURCE } from './flanger.js'
import { VITAL_LITE_PHASER_PROCESSOR_SOURCE } from './phaser.js'
import { VITAL_LITE_DELAY_PROCESSOR_SOURCE } from './delay.js'
import { VITAL_LITE_DISTORTION_PROCESSOR_SOURCE } from './distortion.js'
import { VITAL_LITE_COMPRESSOR_PROCESSOR_SOURCE } from './compressor.js'
import { VITAL_LITE_EQUALIZER_PROCESSOR_SOURCE } from './equalizer.js'
import { VITAL_LITE_FILTER_PROCESSOR_SOURCE } from './filter.js'

import { defaultReverbLiteState, normalizeReverbLiteState, REVERB_LITE_FACTORY_PRESETS, REVERB_LITE_PARAMETERS } from './reverb.js'
import { defaultChorusLiteState, normalizeChorusLiteState, CHORUS_LITE_FACTORY_PRESETS, CHORUS_LITE_PARAMETERS } from './chorus.js'
import { defaultFlangerLiteState, normalizeFlangerLiteState, FLANGER_LITE_FACTORY_PRESETS, FLANGER_LITE_PARAMETERS } from './flanger.js'
import { defaultPhaserLiteState, normalizePhaserLiteState, PHASER_LITE_FACTORY_PRESETS, PHASER_LITE_PARAMETERS } from './phaser.js'
import { defaultDelayLiteState, normalizeDelayLiteState, DELAY_LITE_FACTORY_PRESETS, DELAY_LITE_PARAMETERS } from './delay.js'
import { defaultDistortionLiteState, normalizeDistortionLiteState, DISTORTION_LITE_FACTORY_PRESETS, DISTORTION_LITE_PARAMETERS } from './distortion.js'
import { defaultCompressorLiteState, normalizeCompressorLiteState, COMPRESSOR_LITE_FACTORY_PRESETS, COMPRESSOR_LITE_PARAMETERS } from './compressor.js'
import { defaultEqualizerLiteState, normalizeEqualizerLiteState, EQUALIZER_LITE_FACTORY_PRESETS, EQUALIZER_LITE_PARAMETERS } from './equalizer.js'
import { defaultFilterLiteState, normalizeFilterLiteState, FILTER_LITE_FACTORY_PRESETS, FILTER_LITE_PARAMETERS } from './filter.js'

import {
  DELAY_STYLES, DISTORTION_TYPES, FILTER_ORDERS, COMPRESSOR_BANDS,
  EQ_LOW_MODES, EQ_BAND_MODES, EQ_HIGH_MODES, FILTER_MODELS, FILTER_STYLES
} from './params.js'

export const VITAL_LITE_PROCESSOR_SOURCE = VITAL_LITE_SHIM_SOURCE +
  VITAL_LITE_REVERB_PROCESSOR_SOURCE +
  VITAL_LITE_CHORUS_PROCESSOR_SOURCE +
  VITAL_LITE_FLANGER_PROCESSOR_SOURCE +
  VITAL_LITE_PHASER_PROCESSOR_SOURCE +
  VITAL_LITE_DELAY_PROCESSOR_SOURCE +
  VITAL_LITE_DISTORTION_PROCESSOR_SOURCE +
  VITAL_LITE_COMPRESSOR_PROCESSOR_SOURCE +
  VITAL_LITE_EQUALIZER_PROCESSOR_SOURCE +
  VITAL_LITE_FILTER_PROCESSOR_SOURCE + `
var VITAL_LITE_CTORS = {
  'reverb-lite': VitalLiteReverbProcessor,
  'chorus-lite': VitalLiteChorusProcessor,
  'flanger-lite': VitalLiteFlangerProcessor,
  'phaser-lite': VitalLitePhaserProcessor,
  'delay-lite': VitalLiteDelayProcessor,
  'distortion-lite': VitalLiteDistortionProcessor,
  'compressor-lite': VitalLiteCompressorProcessor,
  'equalizer-lite': VitalLiteEqualizerProcessor,
  'filter-lite': VitalLiteFilterProcessor
};
`

export const VITAL_LITE_IDS = [
  'reverb-lite', 'chorus-lite', 'compressor-lite', 'delay-lite',
  'distortion-lite', 'equalizer-lite', 'filter-lite', 'flanger-lite', 'phaser-lite'
]

export const VITAL_LITE_SHORT = {
  'reverb-lite': 'RVL',
  'chorus-lite': 'CHS',
  'compressor-lite': 'CMP',
  'delay-lite': 'DLY',
  'distortion-lite': 'DST',
  'equalizer-lite': 'EQL',
  'filter-lite': 'FLT',
  'flanger-lite': 'FLG',
  'phaser-lite': 'PHS'
}

export const VITAL_LITE_SUBTITLE = {
  'reverb-lite': 'Reverb Lite',
  'chorus-lite': 'Chorus Lite',
  'compressor-lite': 'Compressor Lite',
  'delay-lite': 'Delay Lite',
  'distortion-lite': 'Distortion Lite',
  'equalizer-lite': 'Equalizer Lite',
  'filter-lite': 'Filter Lite',
  'flanger-lite': 'Flanger Lite',
  'phaser-lite': 'Phaser Lite'
}

function entry (id, name, category, defaultPreset, createState, normalize, presets, parameters) {
  return { id, name, version: 1, category, defaultPreset, parameters, createState, normalize, presets }
}

export const VITAL_LITE_PLUGINS = {
  'reverb-lite': entry('reverb-lite', 'VitalLite Reverb', 'space', 'default', defaultReverbLiteState, normalizeReverbLiteState, REVERB_LITE_FACTORY_PRESETS, REVERB_LITE_PARAMETERS),
  'chorus-lite': entry('chorus-lite', 'VitalLite Chorus', 'modulation', 'default', defaultChorusLiteState, normalizeChorusLiteState, CHORUS_LITE_FACTORY_PRESETS, CHORUS_LITE_PARAMETERS),
  'flanger-lite': entry('flanger-lite', 'VitalLite Flanger', 'modulation', 'default', defaultFlangerLiteState, normalizeFlangerLiteState, FLANGER_LITE_FACTORY_PRESETS, FLANGER_LITE_PARAMETERS),
  'phaser-lite': entry('phaser-lite', 'VitalLite Phaser', 'modulation', 'default', defaultPhaserLiteState, normalizePhaserLiteState, PHASER_LITE_FACTORY_PRESETS, PHASER_LITE_PARAMETERS),
  'delay-lite': entry('delay-lite', 'VitalLite Delay', 'space', 'default', defaultDelayLiteState, normalizeDelayLiteState, DELAY_LITE_FACTORY_PRESETS, DELAY_LITE_PARAMETERS),
  'distortion-lite': entry('distortion-lite', 'VitalLite Distortion', 'color', 'default', defaultDistortionLiteState, normalizeDistortionLiteState, DISTORTION_LITE_FACTORY_PRESETS, DISTORTION_LITE_PARAMETERS),
  'compressor-lite': entry('compressor-lite', 'VitalLite Compressor', 'dynamics', 'default', defaultCompressorLiteState, normalizeCompressorLiteState, COMPRESSOR_LITE_FACTORY_PRESETS, COMPRESSOR_LITE_PARAMETERS),
  'equalizer-lite': entry('equalizer-lite', 'VitalLite Equalizer', 'eq', 'default', defaultEqualizerLiteState, normalizeEqualizerLiteState, EQUALIZER_LITE_FACTORY_PRESETS, EQUALIZER_LITE_PARAMETERS),
  'filter-lite': entry('filter-lite', 'VitalLite Filter', 'filter', 'default', defaultFilterLiteState, normalizeFilterLiteState, FILTER_LITE_FACTORY_PRESETS, FILTER_LITE_PARAMETERS)
}

const midiKnob = (key, label, d) => ({ key, label, min: 8, max: 136, defaultValue: d, format: 'midi' })
const mixKnob = (d = 0.5) => ({ key: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: d, format: 'pct' })
const hzKnob = (key, label, min, max, d) => ({ key, label, min, max, defaultValue: d, scale: 'log', format: 'hz' })

export const VITAL_LITE_PANELS = {
  'reverb-lite': {
    knobs: [
      mixKnob(0.25),
      { key: 'decayTime', label: 'Decay', min: 0.1, max: 64, defaultValue: 1, scale: 'log', format: 'sec' },
      { key: 'size', label: 'Size', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'delay', label: 'Pre-Delay', min: 0, max: 0.3, defaultValue: 0, format: 'sec' },
      { key: 'preLowMidi', label: 'Pre Low', min: 0, max: 128, defaultValue: 0, format: 'midi' },
      { key: 'preHighMidi', label: 'Pre High', min: 0, max: 128, defaultValue: 110, format: 'midi' },
      { key: 'lowShelfMidi', label: 'Low Cut', min: 0, max: 128, defaultValue: 0, format: 'midi' },
      { key: 'lowShelfDb', label: 'Low Gain', min: -6, max: 0, defaultValue: 0, format: 'db' },
      { key: 'highShelfMidi', label: 'High Cut', min: 0, max: 128, defaultValue: 90, format: 'midi' },
      { key: 'highShelfDb', label: 'High Gain', min: -6, max: 0, defaultValue: -1, format: 'db' },
      { key: 'chorusAmount', label: 'Chorus', min: 0, max: 1, defaultValue: 0.223607, format: 'pct' },
      hzKnob('chorusFrequency', 'Chorus Hz', 0.0039, 8, 0.25)
    ]
  },
  'chorus-lite': {
    knobs: [
      mixKnob(0.5),
      { key: 'feedback', label: 'Feedback', min: -0.95, max: 0.95, defaultValue: 0.4, format: 'pct' },
      { key: 'voices', label: 'Voices', min: 1, max: 4, defaultValue: 4, format: 'int' },
      hzKnob('frequency', 'Rate', 0.0156, 8, 0.125),
      { key: 'modDepth', label: 'Depth', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'delay1', label: 'Delay 1', min: 0.00097, max: 0.02, defaultValue: 0.00195, scale: 'log', format: 'ms' },
      { key: 'delay2', label: 'Delay 2', min: 0.00097, max: 0.02, defaultValue: 0.0078, scale: 'log', format: 'ms' },
      midiKnob('cutoffMidi', 'Cutoff', 60),
      { key: 'spread', label: 'Spread', min: 0, max: 1, defaultValue: 1, format: 'pct' }
    ]
  },
  'flanger-lite': {
    knobs: [
      { key: 'mix', label: 'Mix', min: 0, max: 0.5, defaultValue: 0.5, format: 'pct' },
      { key: 'feedback', label: 'Feedback', min: -1, max: 1, defaultValue: 0.5, format: 'pct' },
      hzKnob('frequency', 'Rate', 0.03125, 4, 4),
      midiKnob('centerMidi', 'Center', 64),
      { key: 'modDepth', label: 'Depth', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'phaseOffset', label: 'Offset', min: 0, max: 1, defaultValue: 0.333, format: 'pct' }
    ]
  },
  'phaser-lite': {
    knobs: [
      mixKnob(1),
      { key: 'feedback', label: 'Feedback', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      hzKnob('frequency', 'Rate', 0.03125, 4, 0.125),
      midiKnob('centerMidi', 'Center', 80),
      { key: 'modDepth', label: 'Depth', min: 0, max: 48, defaultValue: 24, format: 'st' },
      { key: 'blend', label: 'Blend', min: 0, max: 2, defaultValue: 1, format: 'num' },
      { key: 'phaseOffset', label: 'Offset', min: 0, max: 1, defaultValue: 0.333, format: 'pct' }
    ]
  },
  'delay-lite': {
    selects: [
      { key: 'style', label: 'Style', options: DELAY_STYLES }
    ],
    knobs: [
      mixKnob(0.3334),
      { key: 'feedback', label: 'Feedback', min: -1, max: 1, defaultValue: 0.5, format: 'pct' },
      hzKnob('frequency', 'Freq', 0.25, 512, 4),
      hzKnob('auxFrequency', 'Aux Freq', 0.25, 512, 4),
      midiKnob('cutoffMidi', 'Cutoff', 60),
      { key: 'spread', label: 'Spread', min: 0, max: 1, defaultValue: 1, format: 'pct' }
    ]
  },
  'distortion-lite': {
    selects: [
      { key: 'type', label: 'Type', options: DISTORTION_TYPES },
      { key: 'filterOrder', label: 'Filter', options: FILTER_ORDERS }
    ],
    knobs: [
      { key: 'drive', label: 'Drive', min: -30, max: 30, defaultValue: 0, format: 'db' },
      mixKnob(1),
      midiKnob('cutoffMidi', 'Cutoff', 80),
      { key: 'resonance', label: 'Resonance', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'blend', label: 'Blend', min: 0, max: 2, defaultValue: 0, format: 'num' }
    ]
  },
  'compressor-lite': {
    selects: [
      { key: 'bands', label: 'Bands', options: COMPRESSOR_BANDS }
    ],
    knobs: [
      mixKnob(1),
      { key: 'attack', label: 'Attack', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'release', label: 'Release', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'lowGainDb', label: 'Low Gain', min: -30, max: 30, defaultValue: 16.3, format: 'db' },
      { key: 'bandGainDb', label: 'Band Gain', min: -30, max: 30, defaultValue: 11.7, format: 'db' },
      { key: 'highGainDb', label: 'High Gain', min: -30, max: 30, defaultValue: 16.3, format: 'db' },
      { key: 'lowUpperDb', label: 'Low Thresh', min: -80, max: 0, defaultValue: -28, format: 'db' },
      { key: 'bandUpperDb', label: 'Band Thresh', min: -80, max: 0, defaultValue: -25, format: 'db' },
      { key: 'highUpperDb', label: 'High Thresh', min: -80, max: 0, defaultValue: -30, format: 'db' }
    ]
  },
  'equalizer-lite': {
    selects: [
      { key: 'lowMode', label: 'Low', options: EQ_LOW_MODES },
      { key: 'bandMode', label: 'Band', options: EQ_BAND_MODES },
      { key: 'highMode', label: 'High', options: EQ_HIGH_MODES }
    ],
    knobs: [
      midiKnob('lowMidi', 'Low Freq', 40),
      { key: 'lowGainDb', label: 'Low Gain', min: -15, max: 15, defaultValue: 0, format: 'db' },
      { key: 'lowRes', label: 'Low Res', min: 0, max: 1, defaultValue: 0.3163, format: 'pct' },
      midiKnob('bandMidi', 'Band Freq', 80),
      { key: 'bandGainDb', label: 'Band Gain', min: -15, max: 15, defaultValue: 0, format: 'db' },
      { key: 'bandRes', label: 'Band Res', min: 0, max: 1, defaultValue: 0.4473, format: 'pct' },
      midiKnob('highMidi', 'High Freq', 100),
      { key: 'highGainDb', label: 'High Gain', min: -15, max: 15, defaultValue: 0, format: 'db' },
      { key: 'highRes', label: 'High Res', min: 0, max: 1, defaultValue: 0.3163, format: 'pct' }
    ]
  },
  'filter-lite': {
    selects: [
      { key: 'model', label: 'Model', options: FILTER_MODELS },
      { key: 'style', label: 'Style', options: FILTER_STYLES }
    ],
    knobs: [
      mixKnob(1),
      midiKnob('cutoffMidi', 'Cutoff', 60),
      { key: 'resonance', label: 'Resonance', min: 0, max: 1, defaultValue: 0.5, format: 'pct' },
      { key: 'drive', label: 'Drive', min: 0, max: 20, defaultValue: 0, format: 'db' },
      { key: 'blend', label: 'Blend', min: 0, max: 2, defaultValue: 0, format: 'num' }
    ]
  }
}

export function isVitalLiteId (id) {
  return !!VITAL_LITE_PLUGINS[id]
}
