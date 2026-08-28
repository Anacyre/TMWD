/** Generic Web DSP plugin contract. UI never processes samples. */

export function uid (prefix = 'fx') {
  return prefix + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
}

export function clamp (value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function lerp (a, b, t) {
  return a + (b - a) * t
}

export function dbToGain (db) {
  return Math.pow(10, db / 20)
}

export function gainToDb (gain) {
  return 20 * Math.log10(Math.max(1e-8, gain))
}

export function freqToNorm (hz, min = 20, max = 20000) {
  const a = Math.log(min)
  const b = Math.log(max)
  return clamp((Math.log(Math.max(min, hz)) - a) / (b - a), 0, 1)
}

export function normToFreq (t, min = 20, max = 20000) {
  return Math.exp(Math.log(min) + clamp(t, 0, 1) * (Math.log(max) - Math.log(min)))
}

export function paramNorm (param, value) {
  const min = param.min
  const max = param.max
  if (param.scale === 'log') {
    const lo = Math.log(Math.max(1e-8, min))
    const hi = Math.log(Math.max(1e-7, max))
    return clamp((Math.log(Math.max(1e-8, value)) - lo) / (hi - lo), 0, 1)
  }
  return clamp((value - min) / (max - min || 1), 0, 1)
}

export function paramFromNorm (param, t) {
  const min = param.min
  const max = param.max
  const x = clamp(t, 0, 1)
  if (param.scale === 'log') {
    return Math.exp(Math.log(Math.max(1e-8, min)) + x * (Math.log(Math.max(1e-7, max)) - Math.log(Math.max(1e-8, min))))
  }
  return min + x * (max - min)
}

export function clone (value) {
  return JSON.parse(JSON.stringify(value))
}

export function mergeState (defaults, incoming) {
  if (!incoming || typeof incoming !== 'object') return clone(defaults)
  const next = clone(defaults)
  Object.keys(incoming).forEach((key) => {
    if (incoming[key] && typeof incoming[key] === 'object' && !Array.isArray(incoming[key])
        && next[key] && typeof next[key] === 'object' && !Array.isArray(next[key])) {
      next[key] = mergeState(next[key], incoming[key])
    } else if (incoming[key] !== undefined) {
      next[key] = clone(incoming[key])
    }
  })
  return next
}

export function createInsert (pluginId, registry, extra = {}) {
  const def = registry[pluginId]
  if (!def) throw new Error('Unknown plugin: ' + pluginId)
  const presetId = extra.presetId || def.defaultPreset
  const preset = (def.presets || []).find((item) => item.id === presetId)
  return {
    instanceId: extra.instanceId || uid(pluginId),
    pluginId,
    version: def.version,
    enabled: extra.enabled !== false,
    presetId,
    state: mergeState(def.createState(), extra.state || (preset && preset.state) || {})
  }
}

export function serializeInsert (insert) {
  return {
    pluginId: insert.pluginId,
    version: insert.version || 1,
    enabled: insert.enabled !== false,
    presetId: insert.presetId || '',
    state: clone(insert.state || {}),
    instanceId: insert.instanceId
  }
}
