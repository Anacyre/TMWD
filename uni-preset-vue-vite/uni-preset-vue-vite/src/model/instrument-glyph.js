/** Shared instrument glyph language used by Playlist, Mixer and Orchestra Sampler. */

export function glyphLetter (name) {
  const text = String(name || '').trim()
  return text ? text.charAt(0).toUpperCase() : '?'
}

export function glyphClass (track, definition) {
  const hay = [
    track && track.name,
    track && track.instrument,
    track && track.section,
    definition && definition.category,
    definition && definition.displayName
  ].filter(Boolean).join(' ').toLowerCase()

  if (!hay) return 'generic'
  if (hay.includes('choir') || hay.includes('vocal') || hay.includes('voice')) return 'choir'
  if (hay.includes('piano') || hay.includes('harp') || hay.includes('keys')) return 'piano'
  if (hay.includes('perc') || hay.includes('timp') || hay.includes('drum')) return 'perc'
  if (hay.includes('violin') || hay.includes('viola') || hay.includes('cello')
      || hay.includes('bass') || hay.includes('string')) return 'strings'
  if (hay.includes('flute') || hay.includes('oboe') || hay.includes('clarinet')
      || hay.includes('bassoon') || hay.includes('wood')) return 'wood'
  if (hay.includes('horn') || hay.includes('trumpet') || hay.includes('trombone')
      || hay.includes('tuba') || hay.includes('brass')) return 'brass'
  if (hay.includes('group') || (track && track.type === 'group')) return 'group'
  return 'generic'
}
