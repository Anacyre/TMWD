/** Parse engine host strings and pick http/ws vs https/wss. */

export const ENGINE_FIRST_PORT = 17890
export const ENGINE_LAST_PORT = 17899

export function pageIsHttps (locationLike) {
  const loc = locationLike || (typeof location !== 'undefined' ? location : null)
  return !!(loc && loc.protocol === 'https:')
}

export function isLoopbackHost (host) {
  const h = String(host || '').toLowerCase().replace(/^\[|\]$/g, '')
  return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0:0:0:0:0:0:0:1'
}

export function isPrivateOrLoopbackHost (host) {
  if (isLoopbackHost(host)) return true
  const h = String(host || '')
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

/** Public hostnames on an HTTPS page must use TLS (Cloudflare Tunnel). LAN/loopback stay http/ws. */
export function usesSecureEngineTransport (host, httpsPage) {
  const https = httpsPage != null ? !!httpsPage : pageIsHttps()
  if (!https) return false
  return !isPrivateOrLoopbackHost(host)
}

export function parseEngineHost (text, options = {}) {
  let raw = String(text || '').trim()
  if (!raw) return null
  let scheme = ''
  const schemeMatch = raw.match(/^(https?|wss?):\/\//i)
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase()
    raw = raw.slice(schemeMatch[0].length)
  }
  const cut = raw.search(/[/?#]/)
  if (cut >= 0) raw = raw.slice(0, cut)
  if (!raw) return null

  let host = ''
  let port = null
  if (raw.startsWith('[')) {
    const end = raw.indexOf(']')
    if (end < 0) return null
    host = raw.slice(1, end)
    if (raw[end + 1] === ':') port = Number(raw.slice(end + 2))
  } else {
    const colon = raw.lastIndexOf(':')
    if (colon > 0 && /^\d+$/.test(raw.slice(colon + 1))) {
      host = raw.slice(0, colon)
      port = Number(raw.slice(colon + 1))
    } else {
      host = raw
    }
  }
  if (!host) return null
  const httpsPage = options.httpsPage != null ? !!options.httpsPage : pageIsHttps()
  const secure = scheme === 'https' || scheme === 'wss' || usesSecureEngineTransport(host, httpsPage)
  if (port == null || !Number.isFinite(port) || port <= 0) {
    port = secure ? 443 : ENGINE_FIRST_PORT
  }
  return { host, port, secure }
}

export function engineHealthUrl (host, port, secure) {
  if (secure) {
    return (Number(port) === 443 ? 'https://' + host : 'https://' + host + ':' + port) + '/health'
  }
  return 'http://' + host + ':' + port + '/health'
}

function origin (proto, host, port, secure) {
  const p = Number(port)
  if ((secure && p === 443) || (!secure && p === 80) || !p) return proto + '://' + host
  return proto + '://' + host + ':' + p
}

/** Build control/audio WebSocket URLs. Secure tunnels ignore the engine's advertised :17890. */
export function engineSocketUrls ({ host, port, secure, ws, audioWs }) {
  const p = Number(port) || (secure ? 443 : ENGINE_FIRST_PORT)
  if (secure) {
    const base = origin('wss', host, p, true)
    return { ws: base, audioWs: base + '/audio' }
  }
  const replaceLocal = (url) => String(url || '')
    .replace(/127\.0\.0\.1/g, host)
    .replace(/localhost/gi, host)
  let control = replaceLocal(ws)
  let audio = replaceLocal(audioWs)
  const base = origin('ws', host, p, false)
  if (!control) control = base
  if (!audio) audio = base + '/audio'
  return { ws: control, audioWs: audio }
}

export function engineHostHintText (options = {}) {
  const https = options.httpsPage != null ? !!options.httpsPage : pageIsHttps()
  const parsed = options.parsed || null
  if (!https) {
    return 'BBCSO / Synchron need DawWeb.exe on the PC. Enter that machine’s LAN IP:port (same Wi-Fi). M Orchestra is browser cloud samples and does not use this.'
  }
  if (parsed && parsed.secure) {
    return 'This HTTPS page will use https/wss to that hostname (Cloudflare Tunnel). BBCSO / Synchron still run on the PC. Same Wi-Fi without a tunnel: open DawWeb’s LAN HTTP address instead. M Orchestra does not need the engine.'
  }
  return 'This HTTPS page cannot mix-connect to localhost or a LAN IP. Same Wi-Fi: open the LAN HTTP address shown in DawWeb. From Cloudflare: expose DawWeb with a Tunnel and enter that hostname here (https/wss), not 192.168.x.x. M Orchestra does not need the engine.'
}
