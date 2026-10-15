import { createTapGuard } from './tap-guard.js'

let t = 1000
const allow = createTapGuard(400, () => t)
let inserted = 0
const choose = () => { if (allow()) inserted++ }

// Synthetic click and uni-app tap arrive a few ms apart from one finger.
choose()
t += 8
choose()
if (inserted !== 1) throw new Error('one tap must insert one plugin, got ' + inserted)

t += 500
choose()
if (inserted !== 2) throw new Error('a later deliberate tap must still work')

console.log('tap-guard ok')
