export const DSP_THEME = {
  bg: '#080A0F',
  panel: '#10131A',
  grid: 'rgba(255,255,255,0.09)',
  axis: 'rgba(255,255,255,0.14)',
  muted: '#6B7380',
  text: '#E8ECF4',
  eq: {
    accent: '#C084FC',
    accent2: '#38BDF8',
    fill: 'rgba(192,132,252,0.10)',
    spec: 'rgba(168, 198, 235, 0.72)'
  },
  rev: {
    accent: '#B794F6',
    fill: 'rgba(167,139,250,0.12)'
  },
  dyn: {
    accent: '#5CE1FF',
    fill: 'rgba(92,225,255,0.10)',
    gr: 'rgba(92,225,255,0.45)'
  },
  boost: {
    accent: '#C8F542',
    in: '#C8F542',
    out: '#A78BFA'
  },
  lim: {
    accent: '#E8B84A',
    fill: 'rgba(232,184,74,0.12)',
    gr: 'rgba(232,184,74,0.45)'
  }
}

export const EQ_BAND_COLORS = ['#C084FC', '#38BDF8', '#C084FC', '#38BDF8', '#A78BFA', '#67E8F9', '#E879F9']

export function eqBandColor (index) {
  return EQ_BAND_COLORS[index % EQ_BAND_COLORS.length]
}

export function fmtHz (freq) {
  const f = Number(freq) || 0
  if (f >= 10000) return Math.round(f / 1000) + ' kHz'
  if (f >= 1000) return (f / 1000).toFixed(1) + ' kHz'
  return Math.round(f) + ' Hz'
}

export function fmtDb (db, digits = 1) {
  const n = Number(db) || 0
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(digits) + ' dB'
}

export function fmtMs (sec) {
  const ms = (Number(sec) || 0) * 1000
  if (ms < 10) return ms.toFixed(1) + ' ms'
  return Math.round(ms) + ' ms'
}

export function peakToDb (peak) {
  const p = Math.max(1e-5, Number(peak) || 0)
  return 20 * Math.log10(p)
}

export function peakToMeterT (peak, minDb = -60, maxDb = 6) {
  const db = peakToDb(peak)
  return Math.min(1, Math.max(0, (db - minDb) / (maxDb - minDb)))
}

export const SHAPE_LABELS = {
  lowcut: 'Low Cut',
  lowshelf: 'Low Shelf',
  bell: 'Peak',
  notch: 'Notch',
  highshelf: 'High Shelf',
  highcut: 'High Cut',
  bandpass: 'Band Pass'
}

export function strokeGlow (ctx, color, blur, draw) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  draw()
  ctx.shadowBlur = 0
  draw()
  ctx.restore()
}

export function fillGlow (ctx, color, blur, draw) {
  ctx.save()
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = blur
  draw()
  ctx.restore()
}

export function freqToX (freq, width) {
  const t = (Math.log(Math.max(20, freq)) - Math.log(20)) / (Math.log(20000) - Math.log(20))
  return t * width
}

export function drawFreqGrid (ctx, w, h, labels = true) {
  const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  ctx.save()
  ctx.lineWidth = 1
  freqs.forEach((freq) => {
    const x = freqToX(freq, w)
    const major = freq === 20 || freq === 100 || freq === 1000 || freq === 10000 || freq === 20000
    ctx.strokeStyle = major ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
    if (labels && major) {
      ctx.fillStyle = DSP_THEME.muted
      ctx.font = '9px Inter, Segoe UI, sans-serif'
      ctx.textAlign = freq === 20000 ? 'right' : 'left'
      ctx.fillText(fmtHz(freq), x + (freq === 20000 ? -4 : 4), h - 6)
    }
  })
  ctx.restore()
}

export function drawDbGrid (ctx, w, h, minDb, maxDb, ticks) {
  ctx.save()
  ctx.lineWidth = 1
  ticks.forEach((db) => {
    const t = 1 - (db - minDb) / (maxDb - minDb)
    const y = t * h
    ctx.strokeStyle = db === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.07)'
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    ctx.fillStyle = DSP_THEME.muted
    ctx.font = '9px Inter, Segoe UI, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    const label = (db > 0 ? '+' : '') + db
    ctx.fillText(label, 6, y)
  })
  ctx.restore()
}

export function drawSpectrum (ctx, spectrum, w, h, color) {
  const spec = spectrum || []
  if (!spec.length) return
  let max = 0
  for (let i = 0; i < spec.length; i++) {
    const v = Number(spec[i]) || 0
    if (v > max) max = v
  }
  if (max < 0.0008) return
  const boost = max < 0.14 ? 0.14 / max : 1
  const n = spec.length
  const gap = n > 72 ? 0.35 : 0.7
  const barW = Math.max(1.2, w / n - gap)
  ctx.save()
  for (let i = 0; i < n; i++) {
    const v = Math.min(1, Math.pow(Math.max(0, Number(spec[i]) || 0) * boost, 0.58))
    const bh = v * h * 0.9
    if (bh < 0.8) continue
    const x = (i / n) * w
    const g = ctx.createLinearGradient(0, h - bh, 0, h)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(255,255,255,0.04)')
    ctx.fillStyle = g
    ctx.fillRect(x, h - bh, barW, bh)
  }
  ctx.restore()
}
