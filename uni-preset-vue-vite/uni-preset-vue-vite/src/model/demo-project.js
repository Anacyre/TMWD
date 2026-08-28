import { defaultSends } from './mixer.js'

const CHORD_LENGTH = 8
const DEMO_LENGTH = 64

const progression = [
  { tones: [2, 5, 9], bass: 2 },
  { tones: [10, 2, 5], bass: 10 },
  { tones: [5, 9, 0], bass: 5 },
  { tones: [0, 4, 7], bass: 0 },
  { tones: [2, 5, 9], bass: 2 },
  { tones: [7, 10, 2], bass: 7 },
  { tones: [9, 1, 4], bass: 9 },
  { tones: [2, 5, 9], bass: 2 }
]

const demoTracks = [
  { name: 'Violin I', section: 'Strings', colour: '#d9a04a', basePitch: 74, volume: 0.80, pan: -0.55, role: 'pad', voice: 2, entryBeat: 0, exitBeat: 64 },
  { name: 'Violin II', section: 'Strings', colour: '#d18f45', basePitch: 69, volume: 0.78, pan: -0.30, role: 'pad', voice: 1, entryBeat: 0, exitBeat: 64 },
  { name: 'Viola', section: 'Strings', colour: '#c47f3f', basePitch: 62, volume: 0.76, pan: 0.18, role: 'pad', voice: 0, entryBeat: 0, exitBeat: 64 },
  { name: 'Cello', section: 'Strings', colour: '#b87038', basePitch: 50, volume: 0.78, pan: 0.42, role: 'bass', voice: 0, entryBeat: 8, exitBeat: 64 },
  { name: 'Bass', section: 'Strings', colour: '#a66232', basePitch: 38, volume: 0.74, pan: 0.60, role: 'bass', voice: 0, entryBeat: 8, exitBeat: 64 },
  { name: 'Flute', section: 'Woodwinds', colour: '#6dbf8a', basePitch: 81, volume: 0.68, pan: -0.22, role: 'moving', voice: 2, entryBeat: 16, exitBeat: 64 },
  { name: 'Oboe', section: 'Woodwinds', colour: '#5faf7d', basePitch: 74, volume: 0.66, pan: -0.08, role: 'moving', voice: 1, entryBeat: 16, exitBeat: 48 },
  { name: 'Clarinet', section: 'Woodwinds', colour: '#53a071', basePitch: 69, volume: 0.68, pan: 0.08, role: 'moving', voice: 0, entryBeat: 24, exitBeat: 64 },
  { name: 'Bassoon', section: 'Woodwinds', colour: '#479065', basePitch: 50, volume: 0.66, pan: 0.22, role: 'pad', voice: 1, entryBeat: 32, exitBeat: 64 },
  { name: 'Horn', section: 'Brass', colour: '#4a90d9', basePitch: 57, volume: 0.70, pan: -0.35, role: 'brass', voice: 0, entryBeat: 32, exitBeat: 64 },
  { name: 'Trumpet', section: 'Brass', colour: '#4283c4', basePitch: 69, volume: 0.66, pan: 0.14, role: 'brass', voice: 2, entryBeat: 48, exitBeat: 64 },
  { name: 'Trombone', section: 'Brass', colour: '#3a76b0', basePitch: 52, volume: 0.68, pan: 0.30, role: 'brass', voice: 1, entryBeat: 48, exitBeat: 64 },
  { name: 'Tuba', section: 'Brass', colour: '#33699c', basePitch: 38, volume: 0.66, pan: 0.45, role: 'bass', voice: 0, entryBeat: 48, exitBeat: 64 },
  { name: 'Timpani', section: 'Percussion', colour: '#c46bb3', basePitch: 38, volume: 0.72, pan: 0.00, role: 'percussion', voice: 0, entryBeat: 0, exitBeat: 64 },
  { name: 'Percussion', section: 'Percussion', colour: '#ab5c9e', basePitch: 60, volume: 0.62, pan: 0.10, role: 'percussion', voice: 0, entryBeat: 32, exitBeat: 64 }
]

function nearestPitch (pitchClass, reference) {
  const offset = ((pitchClass - reference) % 12 + 18) % 12 - 6
  return Math.min(108, Math.max(21, reference + offset))
}

function velByte (value) {
  return Math.min(127, Math.max(1, Math.round(value * 127)))
}

function appendNote (notes, pitch, startBeat, lengthBeats, velocity, clipLength) {
  if (startBeat < -0.001 || startBeat >= clipLength - 0.001) return
  notes.push({
    pitch,
    start: startBeat,
    duration: Math.min(lengthBeats, clipLength - startBeat),
    velocity: velByte(Math.min(1, Math.max(0.1, velocity)))
  })
}

function fillChordNotes (spec, clipStart, clipLength) {
  const notes = []
  for (let chordIndex = 0; chordIndex < progression.length * 2; chordIndex++) {
    const chordStart = chordIndex * CHORD_LENGTH
    if (chordStart >= clipStart + clipLength || chordStart + CHORD_LENGTH <= clipStart) continue
    const chord = progression[chordIndex % progression.length]
    const localStart = chordStart - clipStart
    const emphasis = chordIndex % 4 === 0 ? 0.06 : 0
    if (spec.role === 'pad') {
      appendNote(notes, nearestPitch(chord.tones[spec.voice % 3], spec.basePitch), localStart, CHORD_LENGTH - 0.4, 0.62 + emphasis, clipLength)
    } else if (spec.role === 'bass') {
      const pitch = nearestPitch(chord.bass, spec.basePitch)
      appendNote(notes, pitch, localStart, CHORD_LENGTH * 0.5 - 0.2, 0.72 + emphasis, clipLength)
      appendNote(notes, pitch, localStart + CHORD_LENGTH * 0.5, CHORD_LENGTH * 0.5 - 0.3, 0.64, clipLength)
    } else if (spec.role === 'moving') {
      const order = [0, 1, 2, 1]
      for (let step = 0; step < 4; step++) {
        const tone = chord.tones[(spec.voice + order[step]) % 3]
        appendNote(notes, nearestPitch(tone, spec.basePitch), localStart + step * 2.0, 1.7, 0.58 + emphasis, clipLength)
      }
    } else if (spec.role === 'brass') {
      const pitch = nearestPitch(chord.tones[spec.voice % 3], spec.basePitch)
      appendNote(notes, pitch, localStart + 0.5, 3.2, 0.66 + emphasis, clipLength)
      appendNote(notes, pitch, localStart + 4.5, 3.2, 0.60, clipLength)
    } else {
      const pitch = nearestPitch(chord.bass, spec.basePitch)
      appendNote(notes, pitch, localStart, 0.6, 0.78, clipLength)
      appendNote(notes, pitch, localStart + 4.0, 0.4, 0.58, clipLength)
    }
  }
  return notes
}

function emptyInserts () {
  return [
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false },
    { name: '', bypassed: false }
  ]
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
  let noteId = 1
  let nextTrackId = 2
  let currentSection = ''
  let sectionParent = 0

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
      instrument: 'Test Synth',
      instrumentId: 'test_synth',
      definitionId: 'test_synth',
      techniqueId: '',
      section: spec.section,
      loadState: 'Ready',
      loadMessage: 'Ready',
      controllerValues: {},
      inserts: emptyInserts(),
      sends: defaultSends(),
      source: 'remote-vst',
      meterLevel: 0
    })

    for (let sectionStart = 0; sectionStart < DEMO_LENGTH; sectionStart += 32) {
      const start = Math.max(sectionStart, spec.entryBeat)
      const end = Math.min(sectionStart + 32, spec.exitBeat)
      if (end - start < 1) continue
      const notes = fillChordNotes(spec, start, end - start).map((note) => ({
        ...note,
        id: noteId++
      }))
      clips.push({
        id: clipId++,
        trackIndex,
        startBeat: start,
        lengthBeats: end - start,
        name: spec.name + (sectionStart < 1 ? ' A' : ' B'),
        colour: spec.colour,
        midi: true,
        kind: 'midi',
        loopLengthBeats: end - start,
        notes
      })
    }
  })

  return {
    projectName: 'Untitled Orchestra',
    bpm: 96,
    timeSigNum: 4,
    timeSigDen: 4,
    loopStart: 0,
    loopEnd: DEMO_LENGTH,
    masterGain: 0.8,
    tracks,
    clips,
    markers: [
      { id: 1, name: 'Intro', startBeat: 0, section: 'A' },
      { id: 2, name: 'Climax', startBeat: 32, section: 'B' }
    ]
  }
}
