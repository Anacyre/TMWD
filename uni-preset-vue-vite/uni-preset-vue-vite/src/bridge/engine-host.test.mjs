import {
  parseEngineHost,
  usesSecureEngineTransport,
  engineHealthUrl,
  engineSocketUrls,
  engineHostHintText,
  isPrivateOrLoopbackHost
} from './engine-host.js'

function assert (ok, message) {
  if (!ok) throw new Error(message)
}

assert(isPrivateOrLoopbackHost('127.0.0.1'), 'loopback is private')
assert(isPrivateOrLoopbackHost('192.168.1.10'), 'RFC1918 is private')
assert(!isPrivateOrLoopbackHost('engine.example.com'), 'a tunnel hostname is public')
assert(!usesSecureEngineTransport('192.168.1.10', true), 'LAN IPs stay on http/ws even on HTTPS pages')
assert(usesSecureEngineTransport('engine.example.com', true), 'public hosts on HTTPS use TLS')
assert(!usesSecureEngineTransport('engine.example.com', false), 'HTTP pages keep LAN discovery')

{
  const lan = parseEngineHost('192.168.1.10:17890', { httpsPage: true })
  assert(lan.host === '192.168.1.10' && lan.port === 17890 && !lan.secure, 'LAN host on HTTPS is not treated as a tunnel')
  assert(engineHealthUrl(lan.host, lan.port, lan.secure) === 'http://192.168.1.10:17890/health', 'LAN probe stays http')
}

{
  const tunnel = parseEngineHost('engine.example.com', { httpsPage: true })
  assert(tunnel.host === 'engine.example.com' && tunnel.port === 443 && tunnel.secure, 'bare hostname on HTTPS defaults to 443')
  assert(engineHealthUrl(tunnel.host, tunnel.port, tunnel.secure) === 'https://engine.example.com/health', 'tunnel probe uses https without :443')
  const urls = engineSocketUrls({
    host: tunnel.host,
    port: tunnel.port,
    secure: true,
    ws: 'ws://127.0.0.1:17890',
    audioWs: 'ws://127.0.0.1:17890/audio'
  })
  assert(urls.ws === 'wss://engine.example.com', 'advertised LAN ws is rewritten to wss on 443')
  assert(urls.audioWs === 'wss://engine.example.com/audio', 'audio channel follows the tunnel origin')
}

{
  const parsed = parseEngineHost('https://engine.example.com/health', { httpsPage: false })
  assert(parsed.secure && parsed.port === 443, 'https:// prefix forces TLS and 443')
}

{
  const hint = engineHostHintText({ httpsPage: true, parsed: null })
  assert(/Tunnel/.test(hint) && /LAN HTTP/.test(hint), 'HTTPS without a tunnel host explains both paths')
  const tunnelHint = engineHostHintText({ httpsPage: true, parsed: { secure: true } })
  assert(/wss/.test(tunnelHint), 'configured tunnel host mentions wss')
}

console.log('engine-host ok')
