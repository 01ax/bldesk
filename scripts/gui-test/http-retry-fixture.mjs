// Manual native-HTTP replay checks. Loopback only; use fictitious data. See README.md.
import http from 'node:http'
import https from 'node:https'
import http2 from 'node:http2'
import { appendFileSync, readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'

export async function startRetryFixture({ port = 8446, apiPort, cert, key, log } = {}) {
  const cases = new Map(), connections = new WeakMap(), sockets = new Set(), sessions = new Set(), servers = []
  let nextConnection = 0
  const json = (res, status, value, headers = {}) => {
    const body = [204, 205, 304].includes(status) ? '' : JSON.stringify(value)
    res.writeHead(status, { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
    res.end(body)
  }
  const drop = req => {
    if (req.httpVersionMajor === 2) req.stream.session.destroy()
    else if (req.fixtureClose === 'rst' && !req.socket.encrypted) req.socket.resetAndDestroy()
    else if (req.fixtureClose === 'rst') req.socket.destroy()
    else req.socket.end()
  }
  const handle = async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const bytes = Buffer.concat(chunks), body = bytes.toString('utf8')
    if (url.pathname === '/__fault/state') return json(res, 200, Object.fromEntries(cases))
    if (url.pathname === '/__fault/config') {
      let config
      try { config = JSON.parse(body) } catch { return json(res, 400, { message: 'Expected JSON fixture configuration' }) }
      if (!config || typeof config.id !== 'string' || !['first', 'always', 'never'].includes(config.drop) || !['before', 'after'].includes(config.when)) {
        return json(res, 400, { message: 'Expected id, drop (first/always/never), and when (before/after)' })
      }
      cases.set(config.id, { ...config, requests: 0, executions: 0, events: [] })
      return json(res, 200, { ready: true })
    }
    if (!connections.has(req.socket)) connections.set(req.socket, ++nextConnection)
    if (url.pathname === '/warm') {
      const socket = req.socket
      json(res, 200, { warm: true, connection: connections.get(socket), protocol: req.httpVersion })
      if (url.searchParams.has('expire')) setTimeout(() => socket.end(), 10)
      return
    }
    const probe = url.pathname === '/probe'
    const state = probe ? cases.get(url.searchParams.get('id'))
      : [...cases.values()].find(item => item.path === url.pathname && (item.method || 'POST') === req.method)
    if (probe && !state) return json(res, 400, { message: 'No configured fixture case' })
    const lose = state && (state.drop === 'always' || (state.drop === 'first' && state.requests === 0))
    const event = state && {
      method: req.method, connection: connections.get(req.socket), protocol: req.httpVersion,
      body, drop: !!lose, execution: false,
      headers: Object.fromEntries(['content-length', 'transfer-encoding', 'content-type']
        .filter(name => req.headers[name] !== undefined).map(name => [name, req.headers[name]]))
    }
    if (state) { state.requests++; state.events.push(event) }
    req.fixtureClose = state?.close || 'fin'
    const record = () => { if (log && state) appendFileSync(log, JSON.stringify({ id: state.id, ...event }) + '\n') }
    if (lose && state.when === 'before') { record(); drop(req); return }
    if (state) { state.executions++; event.execution = true }
    if (probe) {
      record()
      if (lose) return drop(req)
      return json(res, state.status || 200, { id: state.id, executions: state.executions, received: body }, state.responseHeaders)
    }
    if (!apiPort || !url.pathname.startsWith('/v2/')) return json(res, 404, { message: 'Fixture route not found' })
    const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) => !name.startsWith(':') && !['host', 'transfer-encoding', 'connection'].includes(name)))
    const upstream = http.request({ hostname: '127.0.0.1', port: apiPort, path: req.url, method: req.method,
      headers: { ...headers, host: `127.0.0.1:${apiPort}`, 'content-length': bytes.length }
    }, incoming => {
      const response = []
      incoming.on('data', chunk => response.push(chunk))
      incoming.on('end', () => {
        if (event) event.responseStatus = incoming.statusCode
        record()
        if (lose) return drop(req)
        const data = Buffer.concat(response)
        res.writeHead(incoming.statusCode, { 'content-type': incoming.headers['content-type'] || 'application/json', 'content-length': data.length })
        res.end(data)
      })
    })
    upstream.on('error', () => json(res, 502, { message: 'Local fixture backend unavailable' }))
    upstream.end(bytes)
  }
  const serve = (req, res) => { void handle(req, res).catch(() => {
    if (res.destroyed) return
    if (res.headersSent) res.destroy()
    else json(res, 400, { message: 'Invalid fixture request' })
  }) }
  const listen = async (server, listenPort) => {
    servers.push(server)
    server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
    server.on('session', session => { sessions.add(session); session.on('close', () => sessions.delete(session)) })
    server.keepAliveTimeout = 60000
    server.headersTimeout = 65000
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, '127.0.0.1', resolve) })
    return server.address().port
  }
  const close = async () => {
    for (const session of sessions) session.destroy()
    for (const socket of sockets) socket.destroy()
    await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  }
  try {
    const httpPort = await listen(http.createServer(serve), port)
    const ports = { http: httpPort }
    if (cert && key) {
      const tls = { cert: readFileSync(cert), key: readFileSync(key) }
      ports.https = await listen(https.createServer({ ...tls, ALPNProtocols: ['http/1.1'] }, serve), httpPort + 2)
      ports.http2 = await listen(http2.createSecureServer({ ...tls, allowHTTP1: false }, serve), httpPort + 3)
    }
    return { ports, close }
  } catch (error) { await close(); throw error }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { values } = parseArgs({ options: { port: { type: 'string' }, 'api-port': { type: 'string' }, cert: { type: 'string' }, key: { type: 'string' }, log: { type: 'string' } } })
  const fixture = await startRetryFixture({ port: Number(values.port || 8446), apiPort: values['api-port'] ? Number(values['api-port']) : undefined, cert: values.cert, key: values.key, log: values.log })
  process.stdout.write(JSON.stringify(fixture.ports) + '\n')
}
