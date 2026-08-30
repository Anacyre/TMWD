/* X Series 2.0 canvas tokens and draw helpers — TMSS "Renaissance" light skin.
   Colour values mirror dsp-theme.css; see docs/x-series-2.0.md section 1. */

export const DSP_THEME = {
  chassis: '#EDECE8',
  chassis2: '#E4E2DD',
  panel: '#FBFAF8',
  panel2: '#F3F1ED',
  ink: '#26282C',
  ink2: '#5A5E66',
  ink3: '#8E939C',
  accent: '#E08B2F',
  accentHi: '#F2A64A',
  accentLo: 'rgba(224,139,47,0.16)',
  cool: '#4E7FA8',
  warn: '#C4503C',
  ok: '#5E8C61',

  grid: 'rgba(38,40,44,0.09)',
  gridMinor: 'rgba(38,40,44,0.045)',
  axis: 'rgba(38,40,44,0.20)',

  // Legacy aliases so 1.x call sites keep resolving to the light palette.
  bg: '#FBFAF8',
  muted: '#8E939C',
  text: '#26282C',

  eq: {
    accent: '#E08B2F',
    accent2: '#4E7FA8',
    fill: 'rgba(224,139,47,0.16)',
    spec: 'rgba(78,127,168,0.34)',
    specLine: 'rgba(78,127,168,0.55)'
  },
  rev: {
    accent: '#E08B2F',
    fill: 'rgba(224,139,47,0.18)',
    early: '#4E7FA8'
  },
  dyn: {
    accent: '#E08B2F',
    fill: 'rgba(224,139,47,0.14)',
    gr: '#4E7FA8',
    over: '#C4503C'
  },
  boost: {
    accent: '#E08B2F',
    in: '#8E939C',
    out: '#E08B2F'
  },
  lim: {
    accent: '#E08B2F',
    fill: 'rgba(224,139,47,0.18)',
    gr: '#E08B2F',
    over: '#C4503C'
  }
}

export const EQ_BAND_COLORS = ['#C4503C', '#D9A227', '#8E939C', '#4E7FA8', '#5E8C61', '#8B5E9C', '#B0703C']

export function eqBandColor (index) {
  return EQ_BAND_COLORS[index % EQ_BAND_COLORS.length]
}

export const AXIS_FONT = '9px Inter, "Segoe UI", sans-serif'
export const LABEL_FONT = '10px Inter, "Segoe UI", sans-serif'

/* Redraw budget. Phones repaint at 25 fps to keep the battery cost of a live
   spectrum reasonable; desktops get 40 fps. */
export function visualFrameMs () {
  if (typeof window === 'undefined') return 25
  const narrow = window.innerWidth && window.innerWidth <= 720
  const coarse = typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches
  return (narrow || coarse) ? 40 : 25
}

/* ── Formatters ──────────────────────────────────────────────────────── */

export function fmtHz (freq) {
  const f = Number(freq) || 0
  if (f >= 10000) return Math.round(f / 1000) + ' kHz'
  if (f >= 1000) return (f / 1000).toFixed(1) + ' kHz'
  return Math.round(f) + ' Hz'
}

export function fmtHzShort (freq) {
  const f = Number(freq) || 0
  if (f >= 1000) return (f % 1000 === 0 ? f / 1000 : (f / 1000).toFixed(1)) + 'k'
  return String(Math.round(f))
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

export function fmtSec (sec) {
  const s = Number(sec) || 0
  if (s < 1) return Math.round(s * 1000) + ' ms'
  return s.toFixed(2) + ' s'
}

export function fmtPercent (value, scale = 100) {
  return Math.round((Number(value) || 0) * scale) + ' %'
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

export const SHAPE_LABELS_SHORT = {
  lowcut: 'LO CUT',
  lowshelf: 'LO SHELF',
  bell: 'PEAK',
  notch: 'NOTCH',
  highshelf: 'HI SHELF',
  highcut: 'HI CUT',
  bandpass: 'BAND PASS'
}

/* ── Stroke helpers ──────────────────────────────────────────────────── */

/* 2.0 replaces the 1.x neon glow with a crisp single stroke. The signature is
   unchanged so existing call sites keep working; `blur` is ignored. */
export function strokeGlow (ctx, color, blur, draw) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.shadowBlur = 0
  draw()
  ctx.restore()
}

export function fillGlow (ctx, color, blur, draw) {
  ctx.save()
  ctx.fillStyle = color
  ctx.shadowBlur = 0
  draw()
  ctx.restore()
}

export function axisText (ctx, text, x, y, align = 'left', color = DSP_THEME.ink3) {
  ctx.save()
  ctx.fillStyle = color
  ctx.font = AXIS_FONT
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x, y)
  ctx.restore()
}

/* ── Frequency axis ──────────────────────────────────────────────────── */

export function freqToX (freq, width, lo = 20, hi = 20000) {
  const t = (Math.log(Math.max(lo, freq)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
  return t * width
}

export function xToFreq (x, width, lo = 20, hi = 20000) {
  const t = Math.min(1, Math.max(0, x / Math.max(1, width)))
  return lo * Math.pow(hi / lo, t)
}

export function drawFreqGrid (ctx, w, h, labels = true) {
  const freqs = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  const majors = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
  ctx.save()
  ctx.lineWidth = 1
  freqs.forEach((freq) => {
    const x = Math.round(freqToX(freq, w)) + 0.5
    ctx.strokeStyle = majors.includes(freq) ? DSP_THEME.grid : DSP_THEME.gridMinor
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
    ctx.stroke()
  })
  if (labels) {
    freqs.forEach((freq) => {
      const x = freqToX(freq, w)
      const align = freq === 20 ? 'left' : freq === 20000 ? 'right' : 'center'
      const dx = freq === 20 ? 3 : freq === 20000 ? -3 : 0
      axisText(ctx, fmtHzShort(freq), x + dx, h - 8, align)
    })
  }
  ctx.restore()
}

/* ── dB axis ─────────────────────────────────────────────────────────── */

export function dbToY (db, h, minDb, maxDb) {
  const t = 1 - (db - minDb) / (maxDb - minDb)
  return t * h
}

export function drawDbGrid (ctx, w, h, minDb, maxDb, ticks, labelSide = 'left') {
  ctx.save()
  ctx.lineWidth = 1
  ticks.forEach((db) => {
    const y = Math.round(dbToY(db, h, minDb, maxDb)) + 0.5
    ctx.strokeStyle = db === 0 ? DSP_THEME.axis : DSP_THEME.grid
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    const label = (db > 0 ? '+' : '') + db
    if (labelSide === 'right') axisText(ctx, label, w - 5, y, 'right')
    else axisText(ctx, label, 5, y, 'left')
  })
  ctx.restore()
}

/* ── Logarithmic time axis (reverb decay envelope) ───────────────────── */

export function timeToX (sec, width, lo = 0.001, hi = 10) {
  const t = (Math.log(Math.max(lo, sec)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))
  return Math.min(1, Math.max(0, t)) * width
}

export function drawLogTimeGrid (ctx, w, h, lo = 0.001, hi = 10) {
  const marks = [
    { t: 0.001, label: '1ms' },
    { t: 0.01, label: '10ms' },
    { t: 0.1, label: '100ms' },
    { t: 0.5, label: '0.5s' },
    { t: 1, label: '1s' },
    { t: 2, label: '2s' },
    { t: 5, label: '5s' },
    { t: 10, label: '10s' }
  ]
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = DSP_THEME.grid
  marks.forEach((mark) => {
    if (mark.t < lo || mark.t > hi) return
    const x = Math.round(timeToX(mark.t, w, lo, hi)) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h - 14)
    ctx.stroke()
    axisText(ctx, mark.label, x, h - 7, 'center')
  })
  ctx.restore()
}

/* Amplitude decades 100 % / 10 % / 1 % / 0.1 %, matching the reference design. */
export function ampToY (amp, h, floorDb = -60) {
  const db = 20 * Math.log10(Math.max(1e-6, amp))
  const t = 1 - Math.min(1, Math.max(0, db / floorDb))
  return (1 - t) * h
}

export function drawDecadeGrid (ctx, w, h, floorDb = -60) {
  const decades = [
    { amp: 1, label: '100%' },
    { amp: 0.1, label: '10%' },
    { amp: 0.01, label: '1%' },
    { amp: 0.001, label: '0.1%' }
  ]
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = DSP_THEME.grid
  decades.forEach((decade) => {
    const y = Math.round(ampToY(decade.amp, h, floorDb)) + 0.5
    if (y < 2 || y > h - 2) return
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    axisText(ctx, decade.label, 4, y + 6, 'left')
  })
  ctx.restore()
}

/* ── Compressor transfer grid ────────────────────────────────────────── */

export function drawTransferGrid (ctx, w, h, minDb = -60, maxDb = 0, outMin = -36, outMax = 12) {
  const inTicks = [-60, -48, -36, -24, -12, 0]
  const outTicks = [12, 0, -12, -24, -36]
  ctx.save()
  ctx.lineWidth = 1
  ctx.strokeStyle = DSP_THEME.grid
  inTicks.forEach((db) => {
    const x = Math.round(((db - minDb) / (maxDb - minDb)) * w) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h - 12)
    ctx.stroke()
    axisText(ctx, String(db), x, h - 6, db === minDb ? 'left' : db === maxDb ? 'right' : 'center')
  })
  outTicks.forEach((db) => {
    const y = Math.round(dbToY(db, h, outMin, outMax)) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
    axisText(ctx, (db > 0 ? '+' : '') + db, w - 4, y, 'right')
  })
  ctx.restore()
}

/* ── Spectrum ────────────────────────────────────────────────────────── */

/* Filled area with a thin top line — reads better on a light panel than the
   1.x bar chart, and costs one path instead of N rects. */
/* Visible at very low level, but never rescaled so far that dither reads as
   full scale: the old unbounded boost turned -100 dBFS into a solid block. */
export const SPEC_DRAW_FLOOR = 2e-5
const SPEC_MAX_BOOST = 8

export function drawSpectrum (ctx, spectrum, w, h, fill, line, options = {}) {
  const spec = spectrum || []
  const n = spec.length
  if (n < 2) return false
  let max = 0
  for (let i = 0; i < n; i++) {
    const v = Number(spec[i]) || 0
    if (v > max) max = v
  }
  const fillStyle = fill || DSP_THEME.eq.spec
  const lineStyle = line || DSP_THEME.eq.specLine
  if (max < SPEC_DRAW_FLOOR) {
    if (options.floor !== false) drawSpectrumFloor(ctx, w, h, lineStyle)
    return false
  }
  const target = options.target || 0.14
  const boost = max < target ? Math.min(SPEC_MAX_BOOST, target / max) : 1
  const top = h * (1 - (options.headroom == null ? 0.1 : options.headroom))
  const yAt = (i) => {
    const v = Math.min(1, Math.pow(Math.max(0, Number(spec[i]) || 0) * boost, 0.58))
    return h - v * top
  }

  ctx.save()
  ctx.beginPath()
  ctx.moveTo(0, h)
  for (let i = 0; i < n; i++) ctx.lineTo((i / (n - 1)) * w, yAt(i))
  ctx.lineTo(w, h)
  ctx.closePath()
  ctx.fillStyle = fillStyle
  ctx.fill()

  ctx.beginPath()
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * w
    const y = yAt(i)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = lineStyle
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.restore()
  return true
}

/* A hairline at the bottom so an idle analyzer still looks connected. */
export function drawSpectrumFloor (ctx, w, h, color) {
  ctx.save()
  ctx.strokeStyle = color || DSP_THEME.eq.specLine
  ctx.globalAlpha = 0.45
  ctx.lineWidth = 1
  const y = Math.round(h - 1) + 0.5
  ctx.beginPath()
  ctx.moveTo(0, y)
  ctx.lineTo(w, y)
  ctx.stroke()
  ctx.restore()
}

/* Say why a graph is empty instead of letting it look broken.
   `cx`/`cy` are the centre of the label, in canvas CSS pixels. */
export function drawVisualNotice (ctx, text, cx, cy) {
  if (!text) return
  ctx.save()
  ctx.fillStyle = DSP_THEME.ink3
  ctx.font = LABEL_FONT
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, cx, cy)
  ctx.restore()
}
