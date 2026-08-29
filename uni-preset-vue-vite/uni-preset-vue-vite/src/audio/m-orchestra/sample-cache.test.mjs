import assert from 'node:assert/strict'
import { AsyncLimiter, AudioBufferLru, readEncodedSample, writeEncodedSample } from './sample-cache.js'

async function testLimiter () {
  const limiter = new AsyncLimiter(2)
  let active = 0
  let peak = 0
  const completed = []
  await Promise.all(Array.from({ length: 8 }, (_, index) => limiter.run(async () => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise((resolve) => setTimeout(resolve, 3))
    completed.push(index)
    active -= 1
  })))
  assert.equal(peak, 2)
  assert.equal(completed.length, 8)
  console.log('ok  AsyncLimiter caps decode concurrency')
}

function fakeDecoded (samples) {
  return {
    audio: {
      length: samples,
      numberOfChannels: 2
    }
  }
}

function testLru () {
  const lru = new AudioBufferLru(1700)
  lru.set('a', fakeDecoded(100))
  lru.set('b', fakeDecoded(100))
  assert.ok(lru.get('a'))
  lru.set('c', fakeDecoded(100))
  assert.equal(lru.get('b'), null)
  assert.ok(lru.get('a'))
  assert.ok(lru.get('c'))
  console.log('ok  AudioBufferLru evicts least-recently-used buffers')
}

async function testNoIndexedDbFallback () {
  assert.equal(await readEncodedSample('missing'), null)
  assert.equal(await writeEncodedSample('missing', new ArrayBuffer(4)), false)
  console.log('ok  IndexedDB cache degrades safely outside browsers')
}

await testLimiter()
testLru()
await testNoIndexedDbFallback()
console.log('3 passed')
