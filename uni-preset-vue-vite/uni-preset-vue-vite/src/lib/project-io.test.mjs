import { migrateProject, serializeSession, stripRuntime, collectAssetRefs, mergeNativeExport, SCHEMA_VERSION } from './project-io.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

{
  const v1 = {
    version: 1,
    name: 'Old',
    bpm: 96,
    tracks: [{ trackId: 2, name: 'Violin', type: 'midi', definitionId: 'm_orch_violin', meterLevel: 0.9, loadState: 'ready' }],
    clips: [{ clipId: 7, start: 1, length: 4, notes: [] }]
  }
  const migrated = migrateProject(v1)
  assert(migrated.schemaVersion === SCHEMA_VERSION, 'migrates onto schema v6')
  assert(migrated.tempo === 96 && migrated.bpm === 96, 'bpm becomes tempo')
  assert(migrated.tracks[0].id === 2 && migrated.tracks[0].trackId === 2, 'trackId aliases to id')
  assert(migrated.tracks[0].source === 'm-orchestra', 'infers m-orchestra from definitionId')
  assert(migrated.tracks[0].meterLevel == null && migrated.tracks[0].loadState == null, 'runtime fields stripped')
  assert(migrated.clips[0].id === 7 && migrated.clips[0].startBeat === 1, 'clip aliases normalized')
}

{
  const session = {
    projectId: 'p_test',
    projectName: 'Session',
    bpm: 128,
    timeSigNum: 3,
    timeSigDen: 4,
    masterGain: 0.7,
    positionBeats: 2,
    looping: true,
    loopStart: 0,
    loopEnd: 8,
    metronome: true,
    tracks: [{ id: 1, type: 'master', name: 'Master', volume: 0.7, webSampler: { sampleUrl: 'blob:abc', sampleName: 'x.wav', assetHash: 'h1' } }],
    clips: [],
    markers: [],
    timeSignatures: [],
    score: { key: 'C' },
    webMixer: { version: 2 },
    pixelsPerBeat: 24,
    trackHeight: 56
  }
  const data = serializeSession(session)
  assert(data.schemaVersion === 6, 'session serialize writes schema 6')
  assert(data.tempo === 128, 'session tempo from bpm')
  assert(data.tracks[0].webSampler.sampleUrl === '', 'blob URLs are not persisted')
  assert(collectAssetRefs(data)[0].hash === 'h1', 'asset refs survive the strip')
}

{
  const stripped = stripRuntime({
    version: 1,
    bpm: 100,
    tracks: [{ id: 3, name: 'Pad', meterLevel: 1, instrumentLoadMessage: 'x' }]
  })
  assert(!stripped.tracks[0].meterLevel, 'stripRuntime drops meters')
}

{
  const browser = migrateProject({
    id: 'keep',
    bpm: 90,
    tracks: [{ id: 4, source: 'web-sampler', webSampler: { assetHash: 'aa' } }],
    webMixer: { remote: { inserts: [] } }
  })
  const merged = mergeNativeExport(browser, {
    schemaVersion: 6,
    tempo: 110,
    tracks: [{ id: 4, name: 'Native', source: 'empty' }],
    webMixer: null
  })
  assert(merged.tempo === 110, 'native tempo wins on merge')
  assert(merged.id === 'keep', 'browser project id is preserved')
  assert(merged.tracks[0].source === 'web-sampler', 'browser source survives native merge')
  assert(merged.webMixer && merged.webMixer.remote, 'browser webMixer survives native merge')
}

console.log('project-io ok')
