const net = require('net')

// Real client IP for rate limiting. Behind Render's proxies req.ip is an
// internal 10.x address shared by everyone, so the trusted header is chosen
// per deployment (see docs/DEPLOYMENT.md, "Client IP"):
//
//   CLIENT_IP_HEADER=cf-connecting-ip            single-value header
//   CLIENT_IP_HEADER=x-forwarded-for
//   CLIENT_IP_XFF_INDEX=-2                       which hop; negative counts from the right
//
// Only use a header your proxy chain overwrites — anything else is client-controlled.
// Read at call time so the setting can change without code changes (and in tests).

function pickXff(value, indexSetting) {
  const parts = value.split(',').map(s => s.trim()).filter(Boolean)
  const idx = Number.parseInt(indexSetting ?? '-1', 10)
  if (!Number.isInteger(idx)) return undefined
  return idx < 0 ? parts[parts.length + idx] : parts[idx]
}

function normalize(value) {
  if (typeof value !== 'string') return undefined
  let v = value.trim()
  if (v.startsWith('[') && v.includes(']')) v = v.slice(1, v.indexOf(']'))  // [v6]:port
  else if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(v)) v = v.split(':')[0]       // v4:port
  return net.isIP(v) ? v : undefined
}

function clientIp(req) {
  const name = (process.env.CLIENT_IP_HEADER || '').trim().toLowerCase()
  if (name) {
    let raw = req.headers?.[name]
    if (Array.isArray(raw)) raw = raw[0]
    if (typeof raw === 'string') {
      const candidate = name === 'x-forwarded-for'
        ? pickXff(raw, process.env.CLIENT_IP_XFF_INDEX)
        : raw
      const ip = normalize(candidate)
      if (ip) return ip
    }
  }
  return req.ip
}

module.exports = { clientIp }
