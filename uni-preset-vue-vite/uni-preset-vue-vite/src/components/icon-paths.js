/**
 * One stroke icon set on a 24px grid. Parts marked `fill` are solid shapes
 * (transport glyphs, dots); everything else is a round-capped line. Several
 * outlines follow Lucide (ISC licence).
 */

const s = (d) => ({ d })
const f = (d) => ({ d, fill: true })
const fs = (d) => ({ d, fill: true, stroke: true })
const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`

const ICONS = {
  play: [fs('M8 5.5v13l10.5-6.5z')],
  pause: [fs('M7 5.5h2.5v13H7z'), fs('M14.5 5.5H17v13h-2.5z')],
  stop: [fs('M8 6.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 16V8A1.5 1.5 0 0 1 8 6.5z')],
  record: [f(circle(12, 12, 6))],
  'to-start': [s('M6 5.5v13'), fs('M18 6.5l-8.5 5.5 8.5 5.5z')],
  loop: [s('M17 2.5l3 3-3 3'), s('M4 11V9.5a4 4 0 0 1 4-4h12'), s('M7 21.5l-3-3 3-3'), s('M20 13v1.5a4 4 0 0 1-4 4H4')],
  metronome: [s('M9.8 3.5h4.4l4.3 17H5.5z'), s('M12 15.5l5-8.5'), s('M8.2 16.5h7.6')],
  speaker: [s('M11 5L6 9H3v6h3l5 4z'), s('M15.5 8.5a5 5 0 0 1 0 7'), s('M18.5 5.5a9 9 0 0 1 0 13')],
  magnet: [s('M5 4h4v8a3 3 0 0 0 6 0V4h4v8a7 7 0 0 1-14 0z'), s('M5 8h4'), s('M15 8h4')],
  plus: [s('M12 5v14'), s('M5 12h14')],
  wave: [s('M4 10v4'), s('M8 6.5v11'), s('M12 3.5v17'), s('M16 7.5v9'), s('M20 10v4')],
  bell: [s('M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9'), s('M10.3 21a1.94 1.94 0 0 0 3.4 0')],
  save: [s('M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z'), s('M17 21v-8H7v8'), s('M7 3v5h8')],
  folder: [s('M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z')],
  grid: [s('M4 4h6v6H4z'), s('M14 4h6v6h-6z'), s('M4 14h6v6H4z'), s('M14 14h6v6h-6z')],
  piano: [s('M4 4.5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z'), s('M9 13.5v6'), s('M15 13.5v6'), fs('M7.5 4.5h3v9h-3z'), fs('M13.5 4.5h3v9h-3z')],
  menu: [s('M4 6h16'), s('M4 12h16'), s('M4 18h16')],
  min: [s('M5 12h14')],
  max: [s('M6 5h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z')],
  close: [s('M6 6l12 12'), s('M18 6L6 18')],
  undo: [s('M9 14L4 9l5-5'), s('M4 9h10.5a5.5 5.5 0 0 1 0 11H11')],
  redo: [s('M15 14l5-5-5-5'), s('M20 9H9.5a5.5 5.5 0 0 0 0 11H13')],
  settings: [
    s('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'),
    s(circle(12, 12, 3))
  ],
  note: [s('M9 18V5l12-2v13'), s(circle(6, 18, 3)), s(circle(18, 16, 3))],
  mixer: [s('M6 4v5'), s('M6 13v7'), s('M12 4v11'), s('M12 19v1'), s('M18 4v1'), s('M18 9v11'), s('M4 11h4'), s('M10 17h4'), s('M16 7h4')],
  inspector: [s('M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'), s('M15 4v16')],
  chevron: [s('M6 9l6 6 6-6')],
  'chevron-right': [s('M9 6l6 6-6 6')],
  back: [s('M15 6l-6 6 6 6')],
  more: [f(circle(12, 5, 1.6)), f(circle(12, 12, 1.6)), f(circle(12, 19, 1.6))],
  'more-h': [f(circle(5, 12, 1.6)), f(circle(12, 12, 1.6)), f(circle(19, 12, 1.6))],
  arrange: [s('M3.5 6h9'), s('M8.5 12h12'), s('M3.5 18h11')],
  trash: [s('M3 6h18'), s('M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6'), s('M19 6l-.9 13.1A2 2 0 0 1 16.1 21H7.9a2 2 0 0 1-2-1.9L5 6'), s('M10 11v5.5'), s('M14 11v5.5')],
  copy: [s('M10 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z'), s('M5 15a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1')],
  swap: [s('M7 4L3 8l4 4'), s('M3 8h14'), s('M17 20l4-4-4-4'), s('M21 16H7')],
  download: [s('M12 4v11'), s('M7 10l5 5 5-5'), s('M5 20h14')],
  upload: [s('M12 15V4'), s('M7 9l5-5 5 5'), s('M5 20h14')],
  power: [s('M12 3v8'), s('M6.4 6.6a8 8 0 1 0 11.2 0')],
  dot: [f(circle(12, 12, 4))],
  scale: [s('M4 19h4v-4h4v-4h4V7h4')],
  cloud: [s('M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z')],
  pencil: [s('M12 20h9'), s('M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z')],
  pointer: [s('M5 3.5l6.5 16.5 2.3-6.7 6.7-2.3z')],
  quantize: [s('M4 4v16'), s('M20 4v16'), s('M12 4v3'), s('M12 17v3'), fs('M8 9.5h8v5H8z')],
  check: [s('M5 12.5l4.5 4.5L19 7.5')],
  search: [s(circle(11, 11, 7)), s('M20 20l-4-4')],
  'family-strings': [
    s('M12 3c-2 0-3 1.5-3 3 0 1 .7 1.6.7 2.4 0 .9-2.2 1.3-2.2 4.3C7.5 16 9.5 21 12 21s4.5-5 4.5-8.3c0-3-2.2-3.4-2.2-4.3 0-.8.7-1.4.7-2.4 0-1.5-1-3-3-3z'),
    s('M12 8v8')
  ],
  'family-woodwinds': [s('M10 3h4'), s('M11 3v14.5l-2 3.5h6l-2-3.5V3'), f(circle(12, 7.5, 0.9)), f(circle(12, 10.5, 0.9)), f(circle(12, 13.5, 0.9))],
  'family-brass': [s('M3 10v4'), s('M3 12h10'), s('M13 12l8-5.5v11z'), s('M6.5 12V8.5'), s('M9.5 12V8.5')],
  'family-percussion': [
    s('M4 10c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z'),
    s('M4 10v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V10'),
    s('M8 3.5l3 4.5'),
    s('M16 3.5l-3 4.5')
  ],
  'family-keyboard': [s('M4 4.5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z'), s('M9 13.5v6'), s('M15 13.5v6'), fs('M7.5 4.5h3v9h-3z'), fs('M13.5 4.5h3v9h-3z')],
  'family-solo': [s(circle(12, 7.5, 3.5)), s('M5 20c1-4 3.8-6 7-6s6 2 7 6')],
  'family-others': [s('M12 4l2.2 5.8L20 12l-5.8 2.2L12 20l-2.2-5.8L4 12l5.8-2.2z')]
}

export const ICON_NAMES = Object.keys(ICONS)

export function iconParts (name) {
  return ICONS[name] || ICONS.dot
}
