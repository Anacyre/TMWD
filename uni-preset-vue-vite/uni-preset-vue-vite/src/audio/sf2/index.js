import { supabase, SOUNDFONT_BUCKET, publicAssetUrl } from '../../lib/supabase.js'

export const SF2_PLUGIN_ID = 'sf2_sampler'
export const SF2_DEFAULT_ID = 'sf2_default'

export async function listPublicSoundfonts () {
  try {
    const { data, error } = await supabase.storage.from(SOUNDFONT_BUCKET).list('', { limit: 40 })
    if (error) return []
    return (data || []).filter((row) => row && /\.sf2$/i.test(row.name || '')).map((row) => ({
      name: row.name,
      url: publicAssetUrl(row.name, SOUNDFONT_BUCKET)
    }))
  } catch (err) {
    return []
  }
}

export {
  parseSf2,
  zoneFromBuffer,
  selectSf2Zone,
  buildMinimalSf2
} from './parse.js'

export * from './engine.js'
