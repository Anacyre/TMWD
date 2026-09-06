import { createInsert } from '../dsp/plugin.js'
import { plugins } from '../dsp/registry.js'
import { BUS_REVERB, BUS_DELAY, defaultSends, dbFromFader } from './mixer-model.js'
import { defaultWebMixer, ensureInsertSlots } from './web-mixer.js'
import { DEMO_BPM, DEMO_LENGTH_BEATS, DEMO_RETIME_NOTES } from './demo-retime-data.js'

const demoTracks = [
  {
    id: 'imperial',
    name: 'Soft Imperial',
    section: 'Keys',
    colour: '#cfc4a8',
    volume: 0.74,
    pan: 0,
    send: 0.18,
    instrumentId: 'soft_imperial',
    techniqueId: ''
  },
  {
    id: 'celestial',
    name: 'Viola Long',
    section: 'Strings',
    colour: '#d9a04a',
    volume: 0.72,
    pan: 0.16,
    send: 0.34,
    instrumentId: 'bbcso_viola',
    techniqueId: 'bbcso_long'
  },
  {
    id: 'cello',
    name: 'Cello Long',
    section: 'Strings',
    colour: '#b87038',
    volume: 0.80,
    pan: 0.40,
    send: 0.22,
    instrumentId: 'bbcso_cello',
    techniqueId: 'bbcso_long'
  },
  {
    id: 'violins',
    name: 'Violins Long',
    section: 'Strings',
    colour: '#d18f45',
    volume: 0.78,
    pan: -0.38,
    send: 0.28,
    instrumentId: 'bbcso_violin_1',
    techniqueId: 'bbcso_long'
  },
  {
    id: 'horn',
    name: 'Horn Long',
    section: 'Brass',
    colour: '#4a90d9',
    volume: 0.70,
    pan: -0.16,
    send: 0.30,
    instrumentId: 'bbcso_horn',
    techniqueId: 'bbcso_long'
  }
]

function emptyInserts () {
  return [
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false }
  ]
}

function reverbSend (level) {
  return [
    { id: 'send_a', name: 'A', destination: BUS_REVERB, level, enabled: true, preFader: false },
    { id: 'send_b', name: 'B', destination: BUS_DELAY, level: 0, enabled: false, preFader: false },
    { id: 'send_c', name: 'C', destination: BUS_REVERB, level: 0, enabled: false, preFader: false }
  ]
}

function notesFromPacked (rows) {
  return (rows || []).map((row, index) => ({
    id: index + 1,
    pitch: row[0],
    start: row[1],
    duration: row[2],
    velocity: row[3]
  }))
}

function buildDemoMixer (tracks) {
  const mixer = defaultWebMixer()
  tracks.forEach((track) => {
    if (track.type !== 'midi') return
    const spec = demoTracks.find((item) => item.name === track.name)
    mixer.tracks[String(track.id)] = {
      volumeDb: dbFromFader(track.volume),
      pan: track.pan,
      mute: false,
      solo: false,
      inserts: [null, null, null, null, null],
      sends: reverbSend(spec ? spec.send : 0.22)
    }
  })
  mixer.buses[0].inserts = ensureInsertSlots([
    createInsert('reverb-x', plugins, { presetId: 'concert-hall', state: { returnOnly: true, amount: 1, decay: 3.4, size: 0.82 } })
  ])
  mixer.buses[0].volumeDb = -4
  mixer.master.inserts = ensureInsertSlots([
    createInsert('equalizer-x', plugins, { presetId: 'master-clean' }),
    createInsert('dynamic-x', plugins, { presetId: 'master' }),
    createInsert('limiter-x', plugins, { presetId: 'orchestral' })
  ])
  return mixer
}

export function createDemoProject () {
  const tracks = [{
    id: 1,
    name: 'Master',
    type: 'master',
    colour: '#8a8a8a',
    volume: 0.8,
    pan: 0,
    mute: false,
    solo: false,
    recordArm: false,
    instrument: 'Stereo Output',
    definitionId: '',
    techniqueId: '',
    section: 'Output',
    controllerValues: {},
    inserts: emptyInserts(),
    sends: defaultSends(),
    source: 'empty',
    meterLevel: 0
  }]

  const clips = []
  let clipId = 1
  let nextTrackId = 2
  let currentSection = ''
  let sectionParent = 0
  let noteId = 1

  demoTracks.forEach((spec) => {
    if (spec.section !== currentSection) {
      currentSection = spec.section
      sectionParent = nextTrackId++
      tracks.push({
        id: sectionParent,
        parentId: 0,
        collapsed: false,
        name: spec.section,
        type: 'group',
        colour: '#3a3a3a',
        volume: 0.8,
        pan: 0,
        mute: false,
        solo: false,
        recordArm: false,
        instrument: '',
        definitionId: '',
        techniqueId: '',
        section: spec.section,
        controllerValues: {},
        inserts: emptyInserts(),
        sends: defaultSends(),
        source: 'empty',
        meterLevel: 0
      })
    }

    const trackIndex = tracks.length
    const id = nextTrackId++
    tracks.push({
      id,
      parentId: sectionParent,
      collapsed: false,
      name: spec.name,
      type: 'midi',
      colour: spec.colour,
      volume: spec.volume,
      pan: spec.pan,
      mute: false,
      solo: false,
      recordArm: false,
      instrument: spec.name,
      instrumentId: spec.instrumentId,
      definitionId: spec.instrumentId,
      techniqueId: spec.techniqueId,
      section: spec.section,
      loadState: 'unavailable',
      loadMessage: 'Requires PC engine',
      instrumentLoadState: 'unavailable',
      instrumentLoadMessage: 'Requires PC engine',
      controllerValues: { dynamics: 100, expression: 100, vibrato: 28 },
      inserts: emptyInserts(),
      sends: reverbSend(spec.send),
      source: 'remote-vst',
      meterLevel: 0
    })

    const packed = DEMO_RETIME_NOTES[spec.id] || []
    const notes = notesFromPacked(packed).map((note) => ({ ...note, id: noteId++ }))
    clips.push({
      id: clipId++,
      trackIndex,
      startBeat: 0,
      lengthBeats: DEMO_LENGTH_BEATS,
      name: spec.name,
      colour: spec.colour,
      midi: true,
      kind: 'midi',
      loopLengthBeats: DEMO_LENGTH_BEATS,
      notes
    })
  })

  return {
    projectName: 'Re-Time',
    bpm: DEMO_BPM,
    timeSigNum: 4,
    timeSigDen: 4,
    loopStart: 0,
    loopEnd: DEMO_LENGTH_BEATS,
    masterGain: 0.8,
    tracks,
    clips,
    webMixer: buildDemoMixer(tracks),
    markers: [
      { id: 1, name: 'Intro', startBeat: 0, section: 'A' },
      { id: 2, name: 'Theme', startBeat: 48, section: 'B' }
    ]
  }
}
