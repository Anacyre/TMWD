const HEADER_BYTES = 40
const MAGIC = 0x41574144

function u16 (view, offset) {
  return view.getUint16(offset, true)
}

function u32 (view, offset) {
  return view.getUint32(offset, true)
}

function u64 (view, offset) {
  const lo = view.getUint32(offset, true)
  const hi = view.getUint32(offset + 4, true)
  return hi * 4294967296 + lo
}

export function parseRemoteAudioPacket (buffer) {
  if (!buffer || buffer.byteLength < HEADER_BYTES) return null
  const view = new DataView(buffer)
  if (u32(view, 0) !== MAGIC) return null
  const frameCount = u32(view, 20)
  const payload = new Float32Array(buffer, HEADER_BYTES, frameCount * 2)
  return {
    version: u16(view, 4),
    channels: u16(view, 6),
    sequence: u32(view, 8),
    flags: u32(view, 12),
    sampleRate: u32(view, 16),
    frameCount,
    hostTimeMicros: u64(view, 24),
    clickToken: u64(view, 32),
    samples: payload,
    click: (u32(view, 12) & 4) !== 0
  }
}

const workletSource = `
class RemoteVstPlayer extends AudioWorkletProcessor {
  constructor () {
    super()
    this.queue = []
    this.read = 0
    this.underruns = 0
    this.framesQueued = 0
    this.targetFrames = 2048
    this.started = false
    this.port.onmessage = (event) => {
      const data = event.data
      if (data && data.type === 'packet' && data.samples) {
        this.queue.push(data.samples)
        this.framesQueued += data.samples.length / 2
        while (this.framesQueued > 48000) {
          const dropped = this.queue.shift()
          if (dropped) this.framesQueued -= dropped.length / 2
        }
      }
      if (data && data.type === 'target') this.targetFrames = data.frames || 2048
    }
  }

  process (_, outputs) {
    const output = outputs[0]
    if (!output || !output[0]) return true
    const frames = output[0].length
    if (!this.started) {
      if (this.framesQueued < this.targetFrames) {
        output[0].fill(0)
        if (output[1]) output[1].fill(0)
        return true
      }
      this.started = true
    }
    if (this.framesQueued < frames) {
      this.underruns += 1
      output[0].fill(0)
      if (output[1]) output[1].fill(0)
      this.port.postMessage({ type: 'underrun', underruns: this.underruns, depth: this.framesQueued })
      return true
    }

    for (let i = 0; i < frames; ++i) {
      while (this.queue.length && this.read >= this.queue[0].length) {
        this.framesQueued -= this.queue[0].length / 2
        this.queue.shift()
        this.read = 0
      }
      const current = this.queue[0]
      if (!current) {
        output[0][i] = 0
        if (output[1]) output[1][i] = 0
        continue
      }
      output[0][i] = current[this.read]
      if (output[1]) output[1][i] = current[this.read + 1] || current[this.read]
      this.read += 2
      this.framesQueued -= 1
    }
    return true
  }
}
registerProcessor('remote-vst-player', RemoteVstPlayer)
`

export function createAudioGraph (context) {
  const master = context.createGain()
  master.gain.value = 1
  master.connect(context.destination)

  const remoteGain = context.createGain()
  remoteGain.gain.value = 1
  remoteGain.connect(master)

  const samplerGain = context.createGain()
  samplerGain.gain.value = 1
  samplerGain.connect(master)

  return {
    context,
    master,
    remoteGain,
    samplerGain,
    remoteNode: null
  }
}

export async function attachRemotePlayer (graph, onStatus) {
  if (!graph.context.audioWorklet) throw new Error('AudioWorklet unavailable')
  const blob = new Blob([workletSource], { type: 'application/javascript' })
  const url = URL.createObjectURL(blob)
  await graph.context.audioWorklet.addModule(url)
  URL.revokeObjectURL(url)

  const node = new AudioWorkletNode(graph.context, 'remote-vst-player', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2]
  })
  node.port.onmessage = (event) => {
    if (onStatus) onStatus(event.data)
  }
  node.connect(graph.remoteGain)
  graph.remoteNode = node
  return node
}

export function pushRemotePacket (graph, packet, targetMs = 80) {
  if (!graph.remoteNode || !packet) return
  const frames = Math.round((packet.sampleRate || 44100) * targetMs / 1000)
  graph.remoteNode.port.postMessage({ type: 'target', frames })
  graph.remoteNode.port.postMessage({ type: 'packet', samples: packet.samples })
}
