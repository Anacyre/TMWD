import { FX_WORKLET_SOURCE } from './fx-worklet.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
  console.log('  ok - ' + message)
}

assert(/class\s+ReverbXProcessor/.test(FX_WORKLET_SOURCE), 'worklet source keeps a named ReverbXProcessor class')
assert(/function\s+dampCoeff/.test(FX_WORKLET_SOURCE) || /const\s+dampCoeff/.test(FX_WORKLET_SOURCE),
  'dampCoeff is injected so compileReverbNetwork can run in the worklet')
assert(/function\s+reverbSoftSat/.test(FX_WORKLET_SOURCE) || /const\s+reverbSoftSat/.test(FX_WORKLET_SOURCE),
  'reverbSoftSat is injected')
assert(/function\s+venueDampingHz/.test(FX_WORKLET_SOURCE) || /const\s+venueDampingHz/.test(FX_WORKLET_SOURCE),
  'venueDampingHz is injected')

const minifiedClass = 'class{constructor(){this.x=1}}'
const named = minifiedClass.replace(/^class\s*[\w$]*/, 'class ReverbXProcessor').replace(/^class\s*\{/, 'class ReverbXProcessor {')
assert(/class\s+ReverbXProcessor/.test(named), 'a minified anonymous class statement can be renamed')

new Function(FX_WORKLET_SOURCE)
assert(true, 'FX worklet source parses as a script')

console.log('fx-worklet named class ok')
