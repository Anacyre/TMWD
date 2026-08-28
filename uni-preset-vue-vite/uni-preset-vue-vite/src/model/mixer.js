/** Compatibility helpers wrapping MixerModel 2.0. */

import { defaultSends, dbFromFader } from './mixer-model.js'

export { defaultSends } from './mixer-model.js'

export function mixerTrackFromProject (track) {
  return {
    id: track.id || track.trackId,
    name: track.name || 'Track',
    volume: track.volume == null ? 0.8 : track.volume,
    volumeDb: track.volumeDb != null ? track.volumeDb : dbFromFader(track.volume == null ? 0.8 : track.volume),
    pan: track.pan || 0,
    mute: !!track.mute,
    solo: !!track.solo,
    sends: (track.sends && track.sends.length) ? track.sends : defaultSends(),
    inserts: track.inserts || [],
    meter: track.meterLevel || track.meter || 0,
    source: track.source || 'empty',
    colour: track.colour || '#cfc6b8'
  }
}

export function mixerStateFromProject (project) {
  const tracks = (project.tracks || []).map(mixerTrackFromProject)
  const masterTrack = tracks.find((track) => track.name === 'Master') || tracks[0]
  return {
    tracks,
    master: {
      volume: project.masterGain != null ? project.masterGain : (masterTrack ? masterTrack.volume : 0.8),
      volumeDb: masterTrack ? masterTrack.volumeDb : 0,
      inserts: [],
      limiterEnabled: false,
      meter: masterTrack ? masterTrack.meter : 0
    }
  }
}
