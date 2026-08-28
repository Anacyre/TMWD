import { ensureFxWorklet, createChainNode, pushChain, createAnalyser } from '../dsp/runtime.js'
import { remoteProcessInserts, samplerProcessInserts } from '../model/web-mixer.js'
import { dbToGain, dbFromFader, isTrackAudible, isBusAudible, SMOOTH_SEC, BUS_REVERB, BUS_DELAY } from '../model/mixer-model.js'

function wireDryBypass (graph) {
  try {
    graph.remoteGain.disconnect()
    graph.samplerGain.disconnect()
    graph.master.disconnect()
  } catch (err) { /* already disconnected */ }
  graph.remoteGain.connect(graph.master)
  graph.samplerGain.connect(graph.master)
  graph.master.connect(graph.context.destination)
}

function smoothGain (node, value, context) {
  if (!node) return
  node.gain.setTargetAtTime(value, context.currentTime, SMOOTH_SEC)
}

function makeGain (ctx, value) {
  const node = ctx.createGain()
  node.gain.value = value
  return node
}

function sendAmount (sends, id, preFader, audible) {
  if (!audible) return 0
  const send = (sends || []).find((item) => item.id === id) || null
  if (!send || !send.enabled) return 0
  if (!!send.preFader !== !!preFader) return 0
  return Math.min(1, Math.max(0, Number(send.level) || 0))
}

export async function attachMixerGraph (graph, webMixer, onMeters, tracks = [], options = {}) {
  await ensureFxWorklet(graph.context)
  if (graph.mixerNodes) {
    syncMixerGraph(graph, webMixer, tracks, options)
    return graph.mixerNodes
  }

  const ctx = graph.context
  const remoteChain = createChainNode(ctx, (m) => onMeters && onMeters('remote', m))
  const samplerChain = createChainNode(ctx, (m) => onMeters && onMeters('sampler', m))
  const busReverbChain = createChainNode(ctx, (m) => onMeters && onMeters('bus', m))
  const busDelayChain = createChainNode(ctx, (m) => onMeters && onMeters('delay', m))
  const masterChain = createChainNode(ctx, (m) => onMeters && onMeters('master', m))
  const analyserRemote = createAnalyser(ctx)
  const analyserSampler = createAnalyser(ctx)
  const analyserBus = createAnalyser(ctx)
  const analyserMaster = createAnalyser(ctx)

  const remoteSendAPost = makeGain(ctx, 0)
  const remoteSendBPost = makeGain(ctx, 0)
  const remoteSendCPost = makeGain(ctx, 0)
  const remoteSendAPre = makeGain(ctx, 0)
  const remoteSendBPre = makeGain(ctx, 0)
  const remoteSendCPre = makeGain(ctx, 0)
  const samplerSendAPost = makeGain(ctx, 0)
  const samplerSendBPost = makeGain(ctx, 0)
  const samplerSendCPost = makeGain(ctx, 0)
  const samplerSendAPre = makeGain(ctx, 0)
  const samplerSendBPre = makeGain(ctx, 0)
  const samplerSendCPre = makeGain(ctx, 0)

  const busReverbGain = makeGain(ctx, 1)
  const busDelayGain = makeGain(ctx, 1)
  const samplerMix = makeGain(ctx, 1)
  const samplerPan = ctx.createStereoPanner()
  samplerPan.pan.value = 0
  const sum = makeGain(ctx, 1)
  const remotePreTap = makeGain(ctx, 1)
  const remoteTap = makeGain(ctx, 1)
  const samplerPreTap = makeGain(ctx, 1)
  const samplerTap = makeGain(ctx, 1)

  graph.remoteGain.disconnect()
  graph.samplerGain.disconnect()
  graph.master.disconnect()

  graph.remoteGain.connect(remotePreTap)
  remotePreTap.connect(remoteChain)
  remoteChain.connect(remoteTap)
  remoteTap.connect(analyserRemote)
  analyserRemote.connect(sum)
  analyserRemote.connect(remoteSendAPost)
  analyserRemote.connect(remoteSendBPost)
  analyserRemote.connect(remoteSendCPost)
  remotePreTap.connect(remoteSendAPre)
  remotePreTap.connect(remoteSendBPre)
  remotePreTap.connect(remoteSendCPre)

  graph.samplerGain.connect(samplerPreTap)
  samplerPreTap.connect(samplerChain)
  samplerChain.connect(samplerTap)
  samplerTap.connect(samplerMix)
  samplerMix.connect(samplerPan)
  samplerPan.connect(analyserSampler)
  analyserSampler.connect(sum)
  analyserSampler.connect(samplerSendAPost)
  analyserSampler.connect(samplerSendBPost)
  analyserSampler.connect(samplerSendCPost)
  samplerPreTap.connect(samplerSendAPre)
  samplerPreTap.connect(samplerSendBPre)
  samplerPreTap.connect(samplerSendCPre)

  remoteSendAPost.connect(busReverbChain)
  remoteSendAPre.connect(busReverbChain)
  remoteSendCPost.connect(busReverbChain)
  remoteSendCPre.connect(busReverbChain)
  samplerSendAPost.connect(busReverbChain)
  samplerSendAPre.connect(busReverbChain)
  samplerSendCPost.connect(busReverbChain)
  samplerSendCPre.connect(busReverbChain)
  busReverbChain.connect(analyserBus)
  analyserBus.connect(busReverbGain)
  busReverbGain.connect(sum)

  remoteSendBPost.connect(busDelayChain)
  remoteSendBPre.connect(busDelayChain)
  samplerSendBPost.connect(busDelayChain)
  samplerSendBPre.connect(busDelayChain)
  busDelayChain.connect(busDelayGain)
  busDelayGain.connect(sum)

  sum.connect(masterChain)
  masterChain.connect(analyserMaster)
  analyserMaster.connect(graph.master)
  graph.master.connect(ctx.destination)

  graph.mixerNodes = {
    remoteChain,
    samplerChain,
    busReverbChain,
    busDelayChain,
    masterChain,
    analyserRemote,
    analyserSampler,
    analyserBus,
    analyserMaster,
    remoteSendAPost,
    remoteSendBPost,
    remoteSendCPost,
    remoteSendAPre,
    remoteSendBPre,
    remoteSendCPre,
    samplerSendAPost,
    samplerSendBPost,
    samplerSendCPost,
    samplerSendAPre,
    samplerSendBPre,
    samplerSendCPre,
    busReverbGain,
    busDelayGain,
    samplerMix,
    samplerPan,
    remoteTap,
    samplerTap,
    remotePreTap,
    samplerPreTap,
    sum
  }
  syncMixerGraph(graph, webMixer, tracks, options)
  return graph.mixerNodes
}

export function getLaneAnalyser (graph, laneKey) {
  if (!graph || !graph.mixerNodes) return null
  if (laneKey === 'master' || (typeof laneKey === 'string' && laneKey.startsWith('master'))) {
    return graph.mixerNodes.analyserMaster
  }
  if (laneKey === 'bus' || (typeof laneKey === 'string' && laneKey.startsWith('bus'))) {
    return graph.mixerNodes.analyserBus
  }
  if (laneKey === 'sampler' || laneKey === 'track') {
    return graph.mixerNodes.analyserSampler
  }
  return graph.mixerNodes.analyserRemote
}

export function detachMixerGraph (graph) {
  const nodes = graph.mixerNodes
  if (!nodes) return
  Object.values(nodes).forEach((node) => {
    try { node.disconnect() } catch (err) { /* already disconnected */ }
  })
  graph.mixerNodes = null
  wireDryBypass(graph)
}

export function syncMixerGraph (graph, webMixer, tracks = [], options = {}) {
  if (!graph || !graph.mixerNodes || !webMixer) return
  const ctx = graph.context
  const nodes = graph.mixerNodes
  const localPlayback = !!options.localPlayback
  const chainOpts = { localPlayback }
  const remoteSends = (webMixer.remote && webMixer.remote.sends) || []
  const samplerTrack = (tracks || []).find((track) => track.source === 'web-sampler' && track.type !== 'master')
  const samplerLane = samplerTrack && webMixer.tracks
    ? (webMixer.tracks[String(samplerTrack.id)] || webMixer.tracks[samplerTrack.id])
    : null
  const samplerSends = (samplerLane && samplerLane.sends) || remoteSends

  const remoteAudible = true
  smoothGain(nodes.remoteSendAPost, sendAmount(remoteSends, 'send_a', false, remoteAudible), ctx)
  smoothGain(nodes.remoteSendBPost, sendAmount(remoteSends, 'send_b', false, remoteAudible), ctx)
  smoothGain(nodes.remoteSendCPost, sendAmount(remoteSends, 'send_c', false, remoteAudible), ctx)
  smoothGain(nodes.remoteSendAPre, sendAmount(remoteSends, 'send_a', true, remoteAudible), ctx)
  smoothGain(nodes.remoteSendBPre, sendAmount(remoteSends, 'send_b', true, remoteAudible), ctx)
  smoothGain(nodes.remoteSendCPre, sendAmount(remoteSends, 'send_c', true, remoteAudible), ctx)

  const samplerAudible = samplerTrack ? isTrackAudible(samplerTrack, tracks) : true
  smoothGain(nodes.samplerSendAPost, sendAmount(samplerSends, 'send_a', false, samplerAudible), ctx)
  smoothGain(nodes.samplerSendBPost, sendAmount(samplerSends, 'send_b', false, samplerAudible), ctx)
  smoothGain(nodes.samplerSendCPost, sendAmount(samplerSends, 'send_c', false, samplerAudible), ctx)
  smoothGain(nodes.samplerSendAPre, sendAmount(samplerSends, 'send_a', true, samplerAudible), ctx)
  smoothGain(nodes.samplerSendBPre, sendAmount(samplerSends, 'send_b', true, samplerAudible), ctx)
  smoothGain(nodes.samplerSendCPre, sendAmount(samplerSends, 'send_c', true, samplerAudible), ctx)

  const reverb = (webMixer.buses || []).find((bus) => bus.id === BUS_REVERB) || (webMixer.buses || [])[0]
  const delay = (webMixer.buses || []).find((bus) => bus.id === BUS_DELAY) || (webMixer.buses || [])[1]
  const reverbAudible = isBusAudible(reverb, webMixer.buses)
  const delayAudible = isBusAudible(delay, webMixer.buses)
  const reverbGain = reverbAudible
    ? (reverb.volumeDb != null ? dbToGain(reverb.volumeDb) : (reverb.volume == null ? 1 : reverb.volume))
    : 0
  const delayGain = delayAudible
    ? (delay && delay.volumeDb != null ? dbToGain(delay.volumeDb) : (delay && delay.volume != null ? delay.volume : 1))
    : 0
  smoothGain(nodes.busReverbGain, reverbGain, ctx)
  smoothGain(nodes.busDelayGain, delayGain, ctx)

  if (samplerTrack) {
    const db = samplerTrack.volumeDb != null ? samplerTrack.volumeDb : dbFromFader(samplerTrack.volume)
    smoothGain(nodes.samplerMix, samplerAudible ? dbToGain(db) : 0, ctx)
    const pan = Math.min(1, Math.max(-1, Number(samplerTrack.pan) || 0))
    nodes.samplerPan.pan.setTargetAtTime(pan, ctx.currentTime, SMOOTH_SEC)
  } else {
    smoothGain(nodes.samplerMix, 1, ctx)
  }

  const masterMute = webMixer.master && webMixer.master.mute
  const masterTrack = (tracks || []).find((track) => track.type === 'master')
  const masterDb = webMixer.master && webMixer.master.volumeDb != null
    ? webMixer.master.volumeDb
    : dbFromFader(masterTrack ? masterTrack.volume : 0.8)
  const masterAudible = masterTrack ? !masterTrack.mute && !masterMute : !masterMute
  smoothGain(graph.master, masterAudible ? dbToGain(masterDb) : 0, ctx)

  pushChain(nodes.remoteChain, remoteProcessInserts(webMixer, tracks, chainOpts))
  pushChain(nodes.samplerChain, samplerProcessInserts(webMixer, tracks, chainOpts))
  pushChain(nodes.busReverbChain, reverb ? reverb.inserts : [])
  pushChain(nodes.busDelayChain, delay ? delay.inserts : [])
  pushChain(nodes.masterChain, webMixer.master.inserts)
}
