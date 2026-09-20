/** Orchestra V sample libraries.
 *
 * Orchestra V owns no samples of its own; it plays whatever libraries are registered here.
 * Each library is one Supabase storage bucket holding a `manifest.json` plus the sample
 * objects it lists, which is what lets the sampler work with the PC switched off.
 *
 * This module deliberately imports nothing: the UI needs the library names long before
 * anyone wants to pay for parsing a multi-megabyte manifest. Manifest loading lives in
 * library.js instead.
 */

/** Recording conventions a library follows, so the compiler does not have to guess. */
export const LAYOUT = {
  /** M Orchestra style: one file per articulation take, dynamics spread across files,
   * loop points and release tails discovered by analysing the audio. */
  MULTI_DYNAMIC: 'multi-dynamic',
  /** VMS Symphonic style: one chromatic file per note at full dynamic, each file holding
   * a fixed-length body followed by its own release tail. */
  BODY_PLUS_RELEASE: 'body-plus-release'
}

export const LIBRARIES = [
  {
    id: 'vms-solo',
    displayName: 'VMS Solo Orchestra',
    detail: 'Solo and small-section instruments, multiple dynamic layers',
    bucket: 'm-orchestra',
    layout: LAYOUT.MULTI_DYNAMIC
  },
  {
    id: 'vms-symphonic',
    displayName: 'VMS Symphonic Orchestra',
    detail: 'Large ensembles and piano, chromatic sampling',
    bucket: 'vms-symphonic',
    layout: LAYOUT.BODY_PLUS_RELEASE
  }
]

export const DEFAULT_LIBRARY_ID = 'vms-solo'

const BY_ID = new Map(LIBRARIES.map((item) => [item.id, item]))

export function findLibrary (id) {
  return BY_ID.get(String(id || '')) || null
}

export function libraryIds () {
  return LIBRARIES.map((item) => item.id)
}
