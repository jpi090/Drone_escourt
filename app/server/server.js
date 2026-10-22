'use strict';
/* HTTP + SSE server. Node stdlib only — no express, no ws, no npm install. */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { q } = require('./db');
const auth = require('./auth');
const E = require('./engine');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };

/* ------------------------------------------------------------------ SSE hub */
const clients = new Set();   // { res, user }

E.setBroadcaster(evt => {
  const payload = `data: ${JSON.stringify(evt)}\n\n`;
  for (const c of clients) {
    if (!visibleTo(evt, c.user)) continue;
    try { c.res.write(payload); } catch { clients.delete(c); }
  }
});

/** Operators see everything in their tenant; subscribers see only their own. */
function visibleTo(evt, user) {
  if (user.role === 'operator') return true;
  if (evt.type === 'notification') {
    return evt.notification.scope === 'user'
      ? evt.notification.user_id === user.id
      : false;
  }
  if (evt.type === 'audit') return false;
  const m = evt.mission;
  if (m) return m.user_id === user.id;
  if (evt.type === 'sos') return evt.sos.user_id === user.id;
  if (evt.type === 'advisory') {
    const mi = evt.advisory.mission_id && q.mission.get(evt.advisory.mission_id);
    return mi ? mi.user_id === user.id : false;
  }
  return true;
}

/* --------------------------------------------------------------- helpers */
const json = (res, code, obj) => {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8',
                        'Content-Length': Buffer.byteLength(b), 'Cache-Control': 'no-store' });
  res.end(b);
};
function body(req) {
  return new Promise((resolve, reject) => {
    let d = '', n = 0;
    req.on('data', c => { n += c.length; if (n > 1e6) { reject(new Error('too large')); req.destroy(); } d += c; });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/* ----------------------------------------------------------------- routes */
async function api(req, res, url) {
  const p = url.pathname;
  const method = req.method;
  const user = auth.userFromReq(req);

  /* ---- auth ---- */
  if (p === '/api/auth/register' && method === 'POST') {
    const b = await body(req);
    if (!b.email || !b.password || !b.name) return json(res, 400, { error: 'name, email and password required' });
    if (String(b.password).length < 8) return json(res, 400, { error: 'password must be at least 8 characters' });
    if (q.userByEmail.get(String(b.email).toLowerCase().trim()))
      return json(res, 409, { error: 'that email is already registered' });
    const role = b.role === 'operator' ? 'operator' : 'subscriber';
    const u = auth.createUser({ email: b.email, name: b.name, password: b.password, role });
    const token = auth.startSession(u.id);
    E.audit(`user:${u.name}`, 'account.created', `${u.email} · role ${role}`);
    res.setHeader('Set-Cookie', auth.cookie(token));
    return json(res, 200, { user: safeUser(u) });
  }
  if (p === '/api/auth/login' && method === 'POST') {
    const b = await body(req);
    const u = auth.verify(b.email, b.password);
    if (!u) return json(res, 401, { error: 'incorrect email or password' });
    const token = auth.startSession(u.id);
    E.audit(`user:${u.name}`, 'auth.login', u.email);
    res.setHeader('Set-Cookie', auth.cookie(token));
    return json(res, 200, { user: safeUser(u) });
  }
  if (p === '/api/auth/logout' && method === 'POST') {
    const raw = (req.headers.cookie || '').match(/de_session=([a-f0-9]+)/);
    if (raw) q.delSession.run(raw[1]);
    res.setHeader('Set-Cookie', auth.clearCookie());
    return json(res, 200, { ok: true });
  }

  if (!user) return json(res, 401, { error: 'not signed in' });

  if (p === '/api/me' && method === 'GET') return json(res, 200, { user: safeUser(user) });

  /* ---- live stream ---- */
  if (p === '/api/stream' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform',
                         Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const c = { res, user };
    clients.add(c);
    const ka = setInterval(() => { try { res.write(': ka\n\n'); } catch {} }, 20000);
    req.on('close', () => { clearInterval(ka); clients.delete(c); });
    return;
  }

  /* ---- state bootstrap ---- */
  if (p === '/api/state' && method === 'GET') {
    const mine = q.activeForUser.get(user.id);
    const out = {
      user: safeUser(user),
      fleet: q.fleet.all(),
      mission: E.snapshot(mine),
      advisories: mine ? q.advFor.all(mine.id) : [],
      sos: q.openSosForUser.get(user.id) || null,
      notifications: q.notifsFor.all(user.id),
      history: q.historyForUser.all(user.id).map(E.snapshot),
      modes: E.MODES, reserve_pct: E.RESERVE_PCT,
    };
    if (user.role === 'operator') {
      out.activeMissions = q.allActive.all().map(E.snapshot);
      out.openSos = q.openSos.all();
      out.audit = q.auditRecent.all();
      out.opsNotifications = q.notifsOps.all();
      out.allAdvisories = out.activeMissions.flatMap(m => q.advFor.all(m.id));
    }
    return json(res, 200, out);
  }

  /* ---- preflight ---- */
  if (p === '/api/preflight' && method === 'GET') {
    const droneId = url.searchParams.get('drone') || 'DE-114';
    return json(res, 200, { checks: E.preflight(user, droneId) });
  }

  /* ---- missions ---- */
  if (p === '/api/missions' && method === 'POST') {
    const b = await body(req);
    const r = E.launch(user, { droneId: b.droneId, mode: b.mode, source: b.source,
      lat: num(b.lat), lon: num(b.lon), heading: num(b.heading) || 0 });
    return json(res, r.ok ? 200 : 422, r);
  }
  const mMatch = p.match(/^\/api\/missions\/([\w-]+)(\/[a-z]+)?$/);
  if (mMatch) {
    const m = q.mission.get(mMatch[1]);
    if (!m) return json(res, 404, { error: 'no such mission' });
    if (m.user_id !== user.id && user.role !== 'operator')
      return json(res, 403, { error: 'not your mission' });
    const sub = mMatch[2];

    if (!sub && method === 'GET') return json(res, 200, { mission: E.snapshot(m) });

    if (sub === '/telemetry' && method === 'POST') {
      if (m.user_id !== user.id) return json(res, 403, { error: 'only the subject device reports fixes' });
      const b = await body(req);
      if (!Number.isFinite(b.lat) || !Number.isFinite(b.lon))
        return json(res, 400, { error: 'lat and lon required' });
      E.ingestFix(m, { lat: b.lat, lon: b.lon, accuracy: num(b.accuracy),
                       speed: num(b.speed), heading: num(b.heading) });
      E.persist(m);
      return json(res, 200, { mission: E.snapshot(m) });
    }
    if (sub === '/command' && method === 'POST') {
      const b = await body(req);
      if (b.command === 'abort' && user.role !== 'operator' && m.user_id !== user.id)
        return json(res, 403, { error: 'not permitted' });
      const actor = user.role === 'operator' ? `operator:${user.name}` : `subscriber:${user.name}`;
      const ok = E.command(m, b.command, actor);
      return json(res, ok ? 200 : 400, ok ? { mission: E.snapshot(m) } : { error: 'unknown command' });
    }
    if (sub === '/record' && method === 'GET') {
      return json(res, 200, {
        mission: E.snapshot(m),
        telemetry: q.telFor.all(m.id),
        advisories: q.advFor.all(m.id),
        sos: q.sosFor.all(m.id),
        audit: q.auditFor.all(m.id),
      });
    }
  }

  /* ---- SOS ---- */
  if (p === '/api/sos' && method === 'POST') {
    const b = await body(req);
    return json(res, 200, { sos: E.raiseSos(user, { silent: !!b.silent }) });
  }
  const sMatch = p.match(/^\/api\/sos\/([\w-]+)\/(ack|escalate|resolve)$/);
  if (sMatch && method === 'POST') {
    const [, sosId, act] = sMatch;
    const s = q.sos.get(sosId);
    if (!s) return json(res, 404, { error: 'no such alert' });
    if (act !== 'resolve' && user.role !== 'operator')
      return json(res, 403, { error: 'operator role required' });
    if (act === 'resolve' && user.role !== 'operator' && s.user_id !== user.id)
      return json(res, 403, { error: 'not permitted' });
    const actor = user.role === 'operator' ? `operator:${user.name}` : `subscriber:${user.name}`;
    const out = act === 'ack' ? E.ackSos(sosId, user)
              : act === 'escalate' ? E.escalateSos(sosId, user)
              : E.resolveSos(sosId, actor);
    return json(res, 200, { sos: out });
  }

  /* ---- operator-only ---- */
  if (p === '/api/ops/advisories' && method === 'POST') {
    if (user.role !== 'operator') return json(res, 403, { error: 'operator role required' });
    const b = await body(req);
    const m = q.mission.get(b.missionId);
    if (!m) return json(res, 404, { error: 'no such mission' });
    const crypto = require('node:crypto');
    const id = 'adv_' + crypto.randomBytes(6).toString('hex');
    q.insAdv.run(id, m.id, b.level || 'orange', b.category || 'Operator advisory',
      b.description || 'Reported by operations centre.', num(b.lat) ?? m.lat, num(b.lon) ?? m.lon,
      250, `Operator ${user.name}`, 'medium', 1, 1, user.name, Date.now());
    E.notify(m.user_id, 'user', b.level || 'orange',
      `${(b.level || 'orange').toUpperCase()} advisory · ${b.category || 'Operator advisory'}`,
      `${b.description || 'Reported by operations centre.'} Source: Operator ${user.name}, human-confirmed.`);
    E.audit(`operator:${user.name}`, 'advisory.created', `${m.id} · ${b.level} · ${b.category}`, m.id);
    E.broadcastAdvisory(q.advFor.all(m.id).find(a => a.id === id));
    return json(res, 200, { ok: true });
  }
  if (p === '/api/ops/audit' && method === 'GET') {
    if (user.role !== 'operator') return json(res, 403, { error: 'operator role required' });
    return json(res, 200, { audit: q.auditRecent.all() });
  }

  return json(res, 404, { error: 'unknown endpoint' });
}

const safeUser = u => ({ id: u.id, name: u.name, email: u.email, role: u.role,
                         plan: u.plan, escorts_left: u.escorts_left });

/* ------------------------------------------------------------ static files */
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    api(req, res, url).catch(err => {
      console.error('API error', url.pathname, err);
      if (!res.headersSent) json(res, 500, { error: err.message || 'server error' });
    });
  } else {
    serveStatic(req, res, url);
  }
});

server.headersTimeout = 0;
server.requestTimeout = 0;

E.rehydrate();
setInterval(() => { try { E.tick(); } catch (e) { console.error('tick error', e); } }, E.TICK_MS);

server.listen(PORT, () => {
  console.log(`Drone Escorts listening on http://localhost:${PORT}`);
  console.log(`Database: ${require('./db').DB_PATH}`);
});
