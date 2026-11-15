import violin from './instruments/violin.png'
import viola from './instruments/viola.png'
import cello from './instruments/cello.png'
import basses from './instruments/basses.png'
import piccolo from './instruments/piccolo.png'
import flute from './instruments/flute.png'
import oboe from './instruments/oboe.png'
import clarinet from './instruments/clarinet.png'
import bassoon from './instruments/bassoon.png'
import horn from './instruments/horn.png'
import trumpets from './instruments/trumpets.png'
import trombone from './instruments/trombone.png'
import tuba from './instruments/tuba.png'
import percussion from './instruments/percussion.png'
import piano from './instruments/piano.png'

const BY_ICON = {
  violin,
  viola,
  cello,
  bass: basses,
  piccolo,
  flute,
  oboe,
  clarinet,
  bassoon,
  horn,
  trumpet: trumpets,
  trombone,
  tuba,
  percussion,
  piano,
  celesta: piano
}

const PERCUSSION = new Set(['timpani', 'bassdrum', 'triangle', 'marimba', 'glock', 'bells', 'snare', 'cymbal', 'tom'])

export function instrumentIconUrl (item) {
  if (!item) return ''
  const label = [item.id, item.name, item.displayName, item.icon].filter(Boolean).join(' ')
  if (/piccolo/i.test(label)) return piccolo
  if (BY_ICON[item.icon]) return BY_ICON[item.icon]
  if (PERCUSSION.has(item.icon)) return percussion
  return ''
}
