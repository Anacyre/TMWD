import { cloudTechniqueFor, cloudTechniquesFor, keyboardStartFor } from './m-orchestra-ui.js'
// A technique the new instrument cannot play resets to its first one.
if (cloudTechniqueFor('m_orch_flute', 'm_orch_pizz') !== 'm_orch_long') throw new Error('flute has no pizzicato; reset to long')
if (cloudTechniqueFor('m_orch_violin_1', 'm_orch_pizz') !== 'm_orch_pizz') throw new Error('violins keep pizzicato')
if (cloudTechniqueFor('m_orch_flute', 'm_orch_short') !== 'm_orch_short') throw new Error('a shared technique is kept')
if (cloudTechniqueFor('m_orch_flute', '') !== 'm_orch_long') throw new Error('no technique defaults to the first')

const woodwind = cloudTechniquesFor('m_orch_clarinet').map((item) => item.id)
if (woodwind.includes('m_orch_pizz') || woodwind.includes('m_orch_trem')) throw new Error('woodwinds offer string techniques')

if (keyboardStartFor('m_orch_flute') <= 48) throw new Error('flute keyboard should start above its lowest silent range')
if (keyboardStartFor('m_orch_violin_1') !== 48) throw new Error('default keyboard starts at C3')

console.log('m-orchestra-ui ok')
