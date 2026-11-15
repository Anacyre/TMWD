import assert from 'node:assert/strict'
import { swRoute } from './sw-routes.mjs'

const scope = 'https://daw.example.com/app/'
const at = (path, req) => swRoute('https://daw.example.com/app/' + path, scope, req)

assert.equal(at('', { mode: 'navigate' }), 'shell')
assert.equal(at('index.html'), 'shell')
assert.equal(at('assets/index-abc123.js'), 'static')
assert.equal(at('assets/..-node_modules-@wasm-audio-decoders-ogg-vorbis-index.DOUdk1BI.js'), '', 'an @ chunk is not intercepted')
assert.equal(swRoute('https://daw.example.com/app/assets/..-node_modules-%40wasm-audio-decoders-ogg-vorbis-index.DOUdk1BI.js', scope), '', 'a percent-encoded @ chunk is not intercepted')
assert.equal(at('assets/ogg-vorbis-index.DOUdk1BI.js'), 'static')
assert.equal(at('assets/index-abc123.css'), 'static')
assert.equal(at('daw-fx-chain.js'), 'shell', 'worklets stay fresh but work offline')
assert.equal(at('daw-cosmic.js'), 'shell')
assert.equal(at('manifest.webmanifest'), 'shell')
assert.equal(at('icon-512.png'), 'shell')

assert.equal(at('vms-symphonic/violin_C4.ogg'), '', 'staged samples are never cached')
assert.equal(at('assets/click.wav'), '', 'audio is never cached')
assert.equal(at('assets/index.js', { method: 'POST' }), '')
assert.equal(at('assets/index.js', { range: true }), '', 'range requests pass through')
assert.equal(at('api/anything'), '', 'unknown paths pass through')

assert.equal(swRoute('https://igfixjydwobvukwfxveq.supabase.co/storage/v1/object/public/x.json', scope), '', 'Supabase is never cached')
assert.equal(swRoute('https://cdn.example.com/lib.js', scope), '', 'other origins are never cached')
assert.equal(swRoute('https://daw.example.com/other/assets/a.js', scope), '', 'outside the scope')
assert.equal(swRoute('not a url', scope), '')

console.log('sw-routes tests passed')
