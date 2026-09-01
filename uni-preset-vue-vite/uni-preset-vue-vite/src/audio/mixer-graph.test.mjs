/** Routing contract tests. A mock Web Audio graph is enough to prove the
    topology: every browser-owned track owns its own inserts, gain and pan, and
    nothing reaches the output without passing the master chain. */

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

class MockParam {
  constructor (value) {
    this.value = value
    this.targets = []
  }

  setTargetAtTime (value) {
    this.value = value
    this.targets.push(value)
  }
}

let nodeSeq = 0

class MockNode {
  constructor (kind, context) {
    this.kind = kind
    this.context = context
    this.id = kind + '#' + (++nodeSeq)
    this.outputs = []
  }

  connect (target) {
    assert(target, this.id + ' connected to nothing')
    this.outputs.push(target)
    return target
  }

  disconnect () {
    this.outputs = []
  }
}

class MockGain extends MockNode {
  constructor (context) {
    super('gain', context)
    this.gain = new MockParam(1)
  }
}

class MockPanner extends MockNode {
  constructor (context) {
    super('panner', context)
    this.pan = new MockParam(0)
  }
}

class MockAnalyser extends MockNode {
  constructor (context) {
    super('analyser', context)
    this.fftSize = 2048
    this.frequencyBinCount = 1024
    this.smoothingTimeConstant = 0.5
    this.minDecibels = -90
    this.maxDecibels = -6
  }
}

class MockWorkletNode extends MockNode {
  constructor (context) {
    super('worklet', context)
    this.chain = []
    this.port = {
      onmessage: null,
      setCount: 0,
      postMessage: (message) => {
        if (message && message.type === 'set') {
          this.chain = message.chain
          this.port.setCount++
        }
      }
    }
  }
}

class MockContext {
  constructor () {
    this.sampleRate = 48000
    this.currentTime = 0
    this.state = 'running'
    this.destination = new MockNode('destination', this)
    this.audioWorklet = { addModule: async () => {} }
  }

  createGain () { return new MockGain(this) }
  createStereoPanner () { return new MockPanner(this) }
  createAnalyser () { return new MockAnalyser(this) }
}

globalThis.AudioWorkletNode = class {
  constructor (context) {
    return new MockWorkletNode(context)
  }
}
globalThis.Blob = class { constructor (parts) { this.parts = parts } }
globalThis.URL = { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} }

const { createAudioGraph, ROUTING_MIXER, ROUTING_FALLBACK, ROUTING_INIT } = await import('./graph.js')
const {
  attachMixerGraph,
  syncMixerGraph,
  ensureTrackLane,
  trackInputNode,
  routingSnapshot,
  isWebOwnedTrack,
  mixerHasInserts,
  syncDirectLaneGains,
  ensureOutputRouting,
  setLaneMix
} = await import('./mixer-graph.js')
const { defaultWebMixer, setLaneInserts } = await import('../model/web-mixer.js')
const { createInsert } = await import('../dsp/plugin.js')
const { plugins } = await import('../dsp/registry.js')

function makeGraph () {
  const context = new MockContext()
  return createAudioGraph(context)
}

/** Every node reachable from `start`, following connect() edges. */
function reachable (start) {
  const seen = new Set()
  const stack = [start]
  while (stack.length) {
    const node = stack.pop()
    if (!node || seen.has(node)) continue
    seen.add(node)
    ;(node.outputs || []).forEach((next) => stack.push(next))
  }
  return seen
}

//==============================================================================
// Web-owned classification
{
  assert(isWebOwnedTrack({ id: 1, type: 'midi', source: 'm-orchestra' }), 'orchestra track is web owned')
  assert(isWebOwnedTrack({ id: 2, type: 'midi', source: 'web-sampler' }), 'sampler track is web owned')
  assert(!isWebOwnedTrack({ id: 3, type: 'midi', source: 'remote-vst' }), 'VST track is engine owned')
  assert(!isWebOwnedTrack({ id: 4, type: 'master' }), 'master is not a track strip')
}

//==============================================================================
// Per-track strips exist, are independent, and reach the master chain
{
  const graph = makeGraph()
  const tracks = [
    { id: 1, type: 'midi', source: 'm-orchestra', volumeDb: 0, pan: -0.5, mute: false, solo: false },
    { id: 2, type: 'midi', source: 'm-orchestra', volumeDb: -60, pan: 0.75, mute: false, solo: false },
    { id: 0, type: 'master', volume: 0.8, mute: false }
  ]
  const mixer = defaultWebMixer()
  const eq = createInsert('equalizer-x', plugins)
  setLaneInserts(mixer, { type: 'track', id: 1 }, [eq, null, null, null, null])

  const nodes = await attachMixerGraph(graph, mixer, () => {}, tracks, { localPlayback: true })
  assert(graph.routing.mode === ROUTING_MIXER, 'attach enters mixer mode')
  assert(routingSnapshot(graph).fxAttached, 'snapshot reports FX attached')

  const laneOne = graph.trackLanes.get('1')
  const laneTwo = graph.trackLanes.get('2')
  assert(laneOne && laneTwo, 'both browser tracks own a strip')
  assert(laneOne !== laneTwo, 'strips are not shared')

  assert(laneOne.chain, 'track 1 has an FX chain because it has an insert')
  assert(laneOne.chain.chain.length === 1 && laneOne.chain.chain[0].pluginId === 'equalizer-x',
    'track 1 chain carries only its own insert')
  assert(!laneTwo.chain, 'track 2 stays chain-free while it has no insert')
  assert(nodes.remote.chain.chain.length === 0, 'summed tap did not inherit the track insert')

  // Fader at -60 dB has to be silent, with no unity fallback anywhere.
  assert(Math.abs(laneOne.gain.gain.value - 1) < 1e-9, 'track 1 unity at 0 dB')
  assert(laneTwo.gain.gain.value === 0, 'track 2 fader at -inf is truly silent')
  assert(Math.abs(laneOne.pan.pan.value + 0.5) < 1e-9, 'track 1 pan applied')
  assert(Math.abs(laneTwo.pan.pan.value - 0.75) < 1e-9, 'track 2 pan applied')

  const fromLaneOne = reachable(laneOne.input)
  assert(fromLaneOne.has(nodes.masterChain), 'track audio passes the master chain')
  assert(fromLaneOne.has(graph.context.destination), 'track audio reaches the output')
  assert(!reachable(laneOne.input).has(laneTwo.gain), 'strips do not cross-feed')

  // Exactly one master stage: destination is fed by graph.master only.
  const feedsDestination = []
  const all = reachable(nodes.remote.input)
  reachable(laneOne.input).forEach((node) => all.add(node))
  all.forEach((node) => {
    if ((node.outputs || []).includes(graph.context.destination)) feedsDestination.push(node)
  })
  assert(feedsDestination.length === 1 && feedsDestination[0] === graph.master,
    'only the master gain feeds the output, so master is applied once')
}

//==============================================================================
// Mute and solo
{
  const graph = makeGraph()
  const tracks = [
    { id: 1, type: 'midi', source: 'm-orchestra', volumeDb: 0, mute: true },
    { id: 2, type: 'midi', source: 'm-orchestra', volumeDb: 0, solo: true },
    { id: 3, type: 'midi', source: 'm-orchestra', volumeDb: 0 }
  ]
  const mixer = defaultWebMixer()
  await attachMixerGraph(graph, mixer, () => {}, tracks, { localPlayback: true })
  assert(graph.trackLanes.get('1').gain.gain.value === 0, 'muted track is silent')
  assert(graph.trackLanes.get('2').gain.gain.value > 0, 'soloed track is audible')
  assert(graph.trackLanes.get('3').gain.gain.value === 0, 'non-soloed track is silent while any solo')

  tracks[1].solo = false
  syncMixerGraph(graph, mixer, tracks, { localPlayback: true })
  assert(graph.trackLanes.get('3').gain.gain.value > 0, 'clearing solo restores the other tracks')
}

//==============================================================================
// Sends collapse per destination bus
{
  const graph = makeGraph()
  const tracks = [{ id: 5, type: 'midi', source: 'm-orchestra', volumeDb: 0 }]
  const mixer = defaultWebMixer()
  const nodes = await attachMixerGraph(graph, mixer, () => {}, tracks, { localPlayback: true })
  const lane = graph.trackLanes.get('5')
  mixer.tracks['5'].sends = [
    { id: 'send_a', destination: 'bus_reverb', level: 0.4, enabled: true, preFader: false },
    { id: 'send_b', destination: 'bus_delay', level: 0.25, enabled: true, preFader: true },
    { id: 'send_c', destination: 'bus_reverb', level: 0.1, enabled: true, preFader: false }
  ]
  syncMixerGraph(graph, mixer, tracks, { localPlayback: true })
  assert(Math.abs(lane.postReverb.gain.value - 0.5) < 1e-6, 'post-fader reverb sends sum')
  assert(Math.abs(lane.preDelay.gain.value - 0.25) < 1e-6, 'pre-fader delay send routed pre-fader')
  assert(lane.postDelay.gain.value === 0, 'unused post delay stays closed')
  assert(reachable(lane.preDelay).has(nodes.busDelayChain), 'pre send reaches the delay bus')
  assert(reachable(lane.postReverb).has(nodes.busReverbChain), 'post send reaches the reverb bus')
}

//==============================================================================
// A worklet failure must not silently drop FX
{
  const graph = makeGraph()
  assert(graph.routing.mode === ROUTING_INIT, 'a new graph starts in init, not mixer')
  graph.context.audioWorklet = { addModule: async () => { throw new Error('worklet blocked') } }
  let failed = false
  try {
    await attachMixerGraph(graph, defaultWebMixer(), () => {}, [], { localPlayback: true })
  } catch (err) {
    failed = true
    assert(/worklet blocked/.test(err.message), 'original failure is propagated')
  }
  assert(failed, 'attach rejects instead of silently bypassing')
  assert(graph.routing.mode === ROUTING_FALLBACK, 'graph reports the fallback routing mode')
  assert(graph.routing.error === 'worklet blocked', 'the reason stays available for the UI')
  assert(!graph.routing.fxAttached, 'fallback never claims FX are attached')
  assert(!graph.routing.muted, 'a graph with no inserts may stay audible')
}

//==============================================================================
// Inserts + worklet failure mute the output instead of a dry mix
{
  const graph = makeGraph()
  graph.context.audioWorklet = { addModule: async () => { throw new Error('worklet blocked') } }
  const mixer = defaultWebMixer()
  const eq = createInsert('equalizer-x', plugins)
  setLaneInserts(mixer, { type: 'master' }, [eq, null, null, null, null])
  assert(mixerHasInserts(mixer), 'master insert is detected')
  try {
    await attachMixerGraph(graph, mixer, () => {}, [], { localPlayback: true })
  } catch (err) {
    assert(/worklet blocked/.test(err.message), 'insert failure still throws')
  }
  assert(graph.routing.muted, 'output is muted when inserts cannot attach')
  assert(graph.master.gain.value === 0, 'master gain is held at zero')
  assert(graph.routing.bypassReason === 'fx-attach-failed-inserts', 'the UI can name the mute')
  assert(routingSnapshot(graph).muted, 'snapshot exposes the mute')

  setLaneInserts(mixer, { type: 'master' }, [null, null, null, null, null])
  assert(!mixerHasInserts(mixer), 'inserts are gone')
  ensureOutputRouting(graph, mixer, [], { localPlayback: true })
  assert(!graph.routing.muted, 'removing inserts lifts the mute hold')
  assert(graph.master.gain.value > 0, 'master gain is restored')
  syncDirectLaneGains(graph, [{ id: 1, type: 'midi', source: 'm-orchestra', volumeDb: 0 }], { webMixer: mixer })
  const recovered = ensureTrackLane(graph, 1)
  assert(recovered.gain.gain.value === 1, 'direct-mode fader gain is restored')
}

//==============================================================================
// Voices land on their own strip even before the mixer attaches
{
  const graph = makeGraph()
  const input = trackInputNode(graph, 9)
  assert(input, 'a track input exists in direct mode')
  assert(reachable(input).has(graph.master), 'direct mode still reaches the master gain')
  const lane = ensureTrackLane(graph, 9)
  assert(lane.input === input, 'the same node is reused after attach')
  await attachMixerGraph(graph, defaultWebMixer(), () => {},
    [{ id: 9, type: 'midi', source: 'm-orchestra', volumeDb: 0 }], { localPlayback: true })
  assert(lane.input === trackInputNode(graph, 9), 'attach keeps the voice input stable')
  assert(reachable(lane.input).has(graph.mixerNodes.masterChain), 'the strip is rewired through the mixer')
  assert(trackInputNode(graph, null) === graph.samplerGain, 'unidentified voices use the fallback bus')
}

//==============================================================================
// Fader / pan updates GainNode only — no pushChain
{
  const graph = makeGraph()
  const tracks = [{ id: 4, type: 'midi', source: 'm-orchestra', volumeDb: 0, pan: 0 }]
  const mixer = defaultWebMixer()
  const eq = createInsert('equalizer-x', plugins)
  setLaneInserts(mixer, { type: 'track', id: 4 }, [eq, null, null, null, null])
  await attachMixerGraph(graph, mixer, () => {}, tracks, { localPlayback: true })
  const lane = graph.trackLanes.get('4')
  assert(lane && lane.chain, 'track with an insert owns a chain')
  const sets = lane.chain.port.setCount
  const chainRef = lane.chain.chain
  tracks[0].volumeDb = -12
  tracks[0].pan = -0.4
  assert(setLaneMix(graph, tracks[0], tracks), 'setLaneMix applies')
  assert(lane.chain.port.setCount === sets, 'fader drag does not pushChain')
  assert(lane.chain.chain === chainRef, 'insert chain stays the same object')
  assert(lane.gain.gain.value < 0.3, 'gain node follows the fader')
  assert(Math.abs(lane.pan.pan.value - (-0.4)) < 1e-6, 'pan node follows')
}

console.log('mixer-graph routing ok')
