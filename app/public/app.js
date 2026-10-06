'use strict';
/* Drone Escorts client. Talks to the API; the server owns all mission state.
   Structural HTML is rebuilt only when a signature changes so inputs survive updates. */

const $ = s => document.querySelector(s);
const el = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const hhmmss = d => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const mmss = s => `${pad(Math.floor(s / 60))}:${pad(Math.floor(s % 60))}`;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const S = {
  user: null, view: 'sub', mission: null, advisories: [], sos: null,
  notifications: [], history: [], fleet: [], modes: {}, reserve: 22,
  activeMissions: [], openSos: [], audit: [], allAdvisories: [],
  droneId: 'DE-114', mode: 'car', source: 'sim',
  checks: [], watchId: null, lastFix: null, gpsErr: null,
  sosCountdown: 0, sosTimer: null, replay: null, sig: '', es: null, linkOk: false,
};

/* ------------------------------------------------------------------ fetch */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { data, status: res.status });
  return data;
}
function toast(msg, ms = 3800) {
  const prev = $('.toast'); if (prev) prev.remove();
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

/* ------------------------------------------------------------------ auth UI */
let authMode = 'login', authRole = 'subscriber';
function setAuthMode(m) {
  authMode = m;
  el('tabLogin').setAttribute('aria-pressed', m === 'login');
  el('tabRegister').setAttribute('aria-pressed', m === 'register');
  el('nameRow').hidden = m === 'login';
  el('roleRow').hidden = m === 'login';
  el('aPass').autocomplete = m === 'login' ? 'current-password' : 'new-password';
  el('authGo').textContent = m === 'login' ? 'Sign in' : 'Create account';
  el('authErr').textContent = '';
}
el('tabLogin').onclick = () => setAuthMode('login');
el('tabRegister').onclick = () => setAuthMode('register');
document.querySelectorAll('[data-role]').forEach(b => b.onclick = () => {
  authRole = b.dataset.role;
  document.querySelectorAll('[data-role]').forEach(x => x.setAttribute('aria-pressed', x === b));
});
el('authForm').onsubmit = async e => {
  e.preventDefault();
  el('authErr').textContent = '';
  const body = { email: el('aEmail').value, password: el('aPass').value };
  if (authMode === 'register') { body.name = el('aName').value; body.role = authRole; }
  try {
    const r = await api(`/api/auth/${authMode}`, { method: 'POST', body });
    S.user = r.user;
    await start();
  } catch (err) { el('authErr').textContent = err.message; }
};
el('btnLogout').onclick = async () => {
  stopGps();
  if (S.es) S.es.close();
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  location.reload();
};

/* ------------------------------------------------------------------ map */
let map, layers = { track: null, veh: null, drone: null, leash: null, adv: [], sos: null, ghost: null, others: [] };
const icon = (html, cls, size) => L.divIcon({ html, className: 'mk ' + cls, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });

function initMap() {
  if (map) return;
  map = L.map('map', { zoomControl: false }).setView([6.456, 3.51], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  layers.track = L.polyline([], { color: '#2ad4ff', weight: 4.5, opacity: .95 }).addTo(map);
}
const drop = k => { if (layers[k]) { map.removeLayer(layers[k]); layers[k] = null; } };
function dropAll(k) { layers[k].forEach(l => map.removeLayer(l)); layers[k] = []; }

let followedOnce = false;
function paintMap() {
  if (!map) return;
  const m = S.mission;

  if (m && m.lat != null) {
    const subj = [m.lat, m.lon], dr = [m.drone_lat ?? m.lat, m.drone_lon ?? m.lon];
    if (!layers.veh) layers.veh = L.marker(subj, { icon: icon('▮', 'mk-veh', 20) }).addTo(map);
    else layers.veh.setLatLng(subj);
    if (!layers.drone) layers.drone = L.marker(dr, { icon: icon('✛', 'mk-drone', 22) }).addTo(map);
    else layers.drone.setLatLng(dr);
    if (!layers.leash) layers.leash = L.polyline([subj, dr], { color: '#2ad4ff', weight: 1, opacity: .4, dashArray: '3 4' }).addTo(map);
    else layers.leash.setLatLngs([subj, dr]);

    const pts = layers.track.getLatLngs();
    const last = pts[pts.length - 1];
    if (!last || map.distance(last, subj) > 8) layers.track.addLatLng(subj);
    if (!followedOnce) { map.setView(subj, 15); followedOnce = true; }
  } else {
    drop('veh'); drop('drone'); drop('leash');
    if (layers.track) layers.track.setLatLngs([]);
    followedOnce = false;
  }

  dropAll('adv');
  const advs = S.view === 'ops' ? S.allAdvisories : S.advisories;
  for (const a of advs) {
    const col = { yellow: '#f5c84b', orange: '#ff9340', red: '#ff4d5e', green: '#26d07c' }[a.level] || '#8fa3c8';
    const c = L.circle([a.lat, a.lon], {
      radius: a.radius_m || 250, color: col, weight: 1.5, fillColor: col,
      fillOpacity: a.raised ? .16 : .06, dashArray: a.confirmed ? null : '4 5',
    }).addTo(map);
    c.bindPopup(`<b>${esc(a.category)}</b><br>${esc(a.description)}<br>
      <small>${esc(a.source)} · ${a.confirmed ? 'confirmed' : 'UNCONFIRMED'}</small>`);
    layers.adv.push(c);
  }

  dropAll('others');
  if (S.view === 'ops') {
    for (const om of S.activeMissions) {
      if (om.lat == null) continue;
      const mk = L.marker([om.lat, om.lon], { icon: icon('▮', 'mk-veh', 18) }).addTo(map);
      mk.bindPopup(`<b>${esc(om.id)}</b><br>${esc(om.drone_id)} · ${esc(om.state)}`);
      layers.others.push(mk);
      if (om.drone_lat != null) {
        const dm = L.marker([om.drone_lat, om.drone_lon], { icon: icon('✛', 'mk-drone', 20) }).addTo(map);
        layers.others.push(dm);
      }
    }
    if (!followedOnce && S.activeMissions[0]?.lat != null) {
      map.setView([S.activeMissions[0].lat, S.activeMissions[0].lon], 14); followedOnce = true;
    }
  }

  const s = S.sos || S.openSos.find(x => !x.resolved_at);
  if (s && s.lat != null && !s.resolved_at) {
    const at = S.mission && S.mission.lat != null ? [S.mission.lat, S.mission.lon] : [s.lat, s.lon];
    if (!layers.sos) layers.sos = L.marker(at, { icon: L.divIcon({ html: '<div class="ring"></div>', className: '', iconSize: [38, 38], iconAnchor: [19, 19] }) }).addTo(map);
    else layers.sos.setLatLng(at);
  } else drop('sos');
}

/* ------------------------------------------------------------------ GPS */
function startGps() {
  if (!('geolocation' in navigator)) { S.gpsErr = 'This browser has no geolocation API.'; return; }
  if (S.watchId != null) return;
  S.watchId = navigator.geolocation.watchPosition(
    pos => {
      S.gpsErr = null;
      const c = pos.coords;
      S.lastFix = { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy,
                    speed: c.speed, heading: c.heading, at: Date.now() };
      if (S.mission && S.mission.source === 'gps' &&
          !['landed', 'completed', 'aborted'].includes(S.mission.state)) {
        api(`/api/missions/${S.mission.id}/telemetry`, {
          method: 'POST',
          body: { lat: c.latitude, lon: c.longitude, accuracy: c.accuracy,
                  speed: c.speed, heading: c.heading },
        }).catch(() => {});
      }
      render();
    },
    err => {
      S.gpsErr = err.code === 1
        ? 'Location permission denied. Allow it in the browser, or use Simulated mode.'
        : err.code === 3 ? 'Location timed out — no fix yet.' : 'Location unavailable.';
      render();
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
  );
}
function stopGps() {
  if (S.watchId != null) { navigator.geolocation.clearWatch(S.watchId); S.watchId = null; }
}

/* ------------------------------------------------------------------ stream */
function connectStream() {
  if (S.es) S.es.close();
  const es = new EventSource('/api/stream');
  S.es = es;
  es.onopen = () => { S.linkOk = true; render(); };
  es.onerror = () => { S.linkOk = false; render(); };
  es.onmessage = ev => {
    let evt; try { evt = JSON.parse(ev.data); } catch { return; }
    applyEvent(evt);
    render();
  };
}
function applyEvent(evt) {
  switch (evt.type) {
    case 'mission': {
      const m = evt.mission;
      if (S.user.role === 'operator') {
        const i = S.activeMissions.findIndex(x => x.id === m.id);
        i >= 0 ? S.activeMissions[i] = m : S.activeMissions.push(m);
      }
      if (m.user_id === S.user.id) S.mission = m;
      break;
    }
    case 'mission_ended': {
      const m = evt.mission;
      S.activeMissions = S.activeMissions.filter(x => x.id !== m.id);
      if (m.user_id === S.user.id) { S.mission = null; refresh(); }
      break;
    }
    case 'notification':
      S.notifications.unshift(evt.notification);
      if (S.notifications.length > 40) S.notifications.pop();
      break;
    case 'advisory': {
      const a = evt.advisory;
      const put = arr => { const i = arr.findIndex(x => x.id === a.id); i >= 0 ? arr[i] = a : arr.push(a); };
      put(S.advisories); put(S.allAdvisories);
      break;
    }
    case 'sos': {
      const s = evt.sos;
      if (s.user_id === S.user.id) S.sos = s.resolved_at ? null : s;
      const i = S.openSos.findIndex(x => x.id === s.id);
      if (s.resolved_at) { if (i >= 0) S.openSos.splice(i, 1); }
      else i >= 0 ? S.openSos[i] = s : S.openSos.push(s);
      if (s.resolved_at) refresh();
      break;
    }
    case 'audit':
      S.audit.unshift(evt.entry);
      if (S.audit.length > 60) S.audit.pop();
      break;
    case 'fleet': {
      S.fleet = evt.fleet;
      // the gate depends on battery, so re-check while a docked drone charges.
      // render() rebuilds only if the blocked-check count changed, so an open
      // dropdown is not torn down on every charge tick.
      if (!S.mission) loadChecks().then(render);
      break;
    }
  }
}

/* ------------------------------------------------------------------ state */
async function refresh() {
  const st = await api('/api/state');
  Object.assign(S, {
    user: st.user, mission: st.mission, advisories: st.advisories || [], sos: st.sos,
    notifications: st.notifications || [], history: st.history || [], fleet: st.fleet || [],
    modes: st.modes || {}, reserve: st.reserve_pct ?? 22,
    activeMissions: st.activeMissions || [], openSos: st.openSos || [],
    audit: st.audit || [], allAdvisories: st.allAdvisories || [],
  });
  if (S.mission) { S.droneId = S.mission.drone_id; S.mode = S.mission.mode; S.source = S.mission.source; }
  await loadChecks();
}
async function loadChecks() {
  try { S.checks = (await api(`/api/preflight?drone=${encodeURIComponent(S.droneId)}`)).checks; }
  catch { S.checks = []; }
}

/* ------------------------------------------------------------------ actions */
async function launch() {
  const fix = S.source === 'gps' ? S.lastFix : (S.lastFix || { lat: 6.4478, lon: 3.4372 });
  if (S.source === 'gps' && !fix) { toast('Waiting for a GPS fix — allow location access first.'); return; }
  try {
    const r = await api('/api/missions', {
      method: 'POST',
      body: { droneId: S.droneId, mode: S.mode, source: S.source,
              lat: fix.lat, lon: fix.lon, heading: fix.heading || Math.random() * 360 },
    });
    S.mission = r.mission;
    followedOnce = false;
    await refresh();
  } catch (err) {
    toast((err.data && err.data.refused) ? 'Launch refused — ' + err.data.refused.join('; ') : err.message, 6000);
  }
  render();
}
async function cmd(c) {
  if (!S.mission) return;
  try { await api(`/api/missions/${S.mission.id}/command`, { method: 'POST', body: { command: c } }); }
  catch (e) { toast(e.message); }
}
function sosArm(silent) {
  if (silent) return sosFire(true);
  if (S.sosCountdown > 0) return;
  S.sosCountdown = 5;
  el('sosModal').hidden = false;
  el('sosCount').textContent = '5';
  S.sosTimer = setInterval(() => {
    S.sosCountdown--;
    el('sosCount').textContent = S.sosCountdown;
    if (S.sosCountdown <= 0) sosFire(false);
  }, 1000);
}
function sosAbort() {
  clearInterval(S.sosTimer); S.sosCountdown = 0; el('sosModal').hidden = true;
  toast('SOS cancelled. No alert was sent.');
}
async function sosFire(silent) {
  clearInterval(S.sosTimer); S.sosCountdown = 0; el('sosModal').hidden = true;
  try { const r = await api('/api/sos', { method: 'POST', body: { silent } }); S.sos = r.sos; }
  catch (e) { toast(e.message); }
  render();
}
const sosAct = (id, act) => api(`/api/sos/${id}/${act}`, { method: 'POST' }).catch(e => toast(e.message));

el('sosCancel').onclick = sosAbort;
el('sosNow').onclick = () => sosFire(false);

/* ------------------------------------------------------------------ video */
function paintVideo(cv, m) {
  const ctx = cv.getContext('2d');
  const W = cv.width = Math.max(120, cv.clientWidth * .75);
  const H = cv.height = Math.max(80, cv.clientHeight * .75);
  const t = m ? m.elapsed_s : 0;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#15213a'); g.addColorStop(1, '#0a1120');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, H * .55);
  ctx.fillStyle = '#1d2740';
  ctx.beginPath(); ctx.moveTo(-W * .14, -H * .55); ctx.lineTo(W * .14, -H * .55);
  ctx.lineTo(W * .46, H * .45); ctx.lineTo(-W * .46, H * .45); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(220,230,255,.3)'; ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const o = ((t * 22) % 46) + i * 46 - 46, k = o / (H * .9);
    if (k < 0 || k > 1) continue;
    ctx.globalAlpha = .1 + k * .5;
    ctx.beginPath(); ctx.moveTo(0, -H * .55 + o * .9); ctx.lineTo(0, -H * .55 + o * .9 + 14 * (.4 + k)); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();
  if (m && m.state !== 'launching') {
    const vy = H * .62, vw = W * .07, vh = vw * 1.7;
    ctx.fillStyle = '#2ad4ff'; ctx.globalAlpha = .9;
    ctx.fillRect(W / 2 - vw / 2, vy - vh / 2, vw, vh); ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2ad4ff'; ctx.lineWidth = 1.5;
    ctx.strokeRect(W / 2 - vw * .9, vy - vh * .85, vw * 1.8, vh * 1.7);
    ctx.font = '9px ui-monospace,monospace'; ctx.fillStyle = '#2ad4ff';
    ctx.fillText('SUBJECT · LOCKED', W / 2 - vw * .9, vy - vh * .85 - 5);
  }
  for (let i = 0; i < 4; i++) {
    const bx = W * (.12 + i * .24) + Math.sin(t / 6 + i) * 10;
    const by = H * (.3 + ((t * 8 + i * 70) % 100) / 100 * .6);
    ctx.save(); ctx.filter = 'blur(4px)'; ctx.fillStyle = 'rgba(180,195,230,.5)';
    ctx.beginPath(); ctx.arc(bx, by, 5, 0, 7); ctx.fill(); ctx.restore();
  }
  ctx.font = '8px ui-monospace,monospace'; ctx.fillStyle = 'rgba(143,163,200,.75)';
  ctx.fillText('bystanders auto-blurred (RC-7)', 8, H - 8);
}

/* ------------------------------------------------------------------ render */
function statePill(m) {
  if (!m) return '<span class="pill p-idle">Idle · docked</span>';
  const c = { launching: 'p-yellow', escorting: 'p-green', paused: 'p-yellow',
              returning: 'p-yellow', degraded: 'p-orange' }[m.state] || 'p-idle';
  const l = { launching: 'Launching', escorting: 'Escorting', paused: 'Paused · holding',
              returning: 'Returning to dock', degraded: 'Degraded · no fix' }[m.state] || m.state;
  return `<span class="pill ${c}">${l}</span>`;
}
function advPill() {
  const raised = S.advisories.filter(a => a.raised);
  if (!raised.length) return '<span class="pill p-green">Green · nothing reported</span>';
  const worst = ['red', 'orange', 'yellow'].find(l => raised.some(a => a.level === l)) || 'green';
  return `<span class="pill p-${worst}">${worst[0].toUpperCase() + worst.slice(1)} · ${raised.length} advisory</span>`;
}
const feedHtml = (list, emptyMsg) => list.length
  ? list.map(n => `<div class="item i-${esc(n.level)}"><b>${esc(n.title)}</b>
      <small>${hhmmss(new Date(n.ts))}</small><p>${esc(n.body)}</p></div>`).join('')
  : `<div class="empty">${emptyMsg}</div>`;

function render() {
  if (!S.user) return;
  const m = S.mission, s = S.sos;
  el('whoName').textContent = `${S.user.name} · ${S.user.role}`;
  el('roleSwitch').hidden = S.user.role !== 'operator';
  el('rSub')?.setAttribute('aria-pressed', S.view === 'sub');
  el('rOps')?.setAttribute('aria-pressed', S.view === 'ops');
  el('sosFrame').hidden = !(s && !s.silent && !s.resolved_at);

  const src = el('srcChip');
  if (S.view === 'ops') { src.textContent = 'COMMAND'; src.className = 'tagchip tag-live'; }
  else if (S.source === 'gps') {
    src.textContent = S.lastFix ? `REAL GPS · ±${Math.round(S.lastFix.accuracy)}m` : 'REAL GPS · waiting';
    src.className = 'tagchip ' + (S.lastFix ? 'tag-gps' : 'tag-sim');
  } else { src.textContent = 'SIMULATED MOVEMENT'; src.className = 'tagchip tag-sim'; }
  const link = el('linkChip');
  link.textContent = S.linkOk ? 'LIVE' : 'RECONNECTING';
  link.className = 'tagchip ' + (S.linkOk ? 'tag-live' : 'tag-off');

  const sig = [S.view, S.user.role, S.droneId, S.mode, S.source,
    m ? `${m.id}|${m.state}|${m.recording}` : 'none',
    s ? `${s.id}|${!!s.ack_at}|${!!s.escalated_at}` : 'nosos',
    S.notifications.length, S.audit.length, S.history.length,
    S.advisories.filter(a => a.raised).length, S.allAdvisories.filter(a => a.raised).length,
    S.activeMissions.map(x => x.id + x.state).join(','),
    // per-alert triage state, so Acknowledge/Escalate/Resolve re-enable as it changes
    S.openSos.map(x => `${x.id}${!!x.ack_at}${!!x.escalated_at}`).join(','),
    S.checks.filter(c => !c.ok).length, S.replay ? S.replay.id : '-', !!S.gpsErr, !!S.lastFix,
  ].join('~');
  if (sig !== S.sig) { S.sig = sig; S.view === 'ops' ? renderOps() : renderSub(); }
  tickDom();
  paintMap();
}

/* --------------------------- subscriber --------------------------- */
function renderSub() {
  const m = S.mission, s = S.sos;
  const blocked = S.checks.filter(c => !c.ok);
  const drone = S.fleet.find(d => d.id === S.droneId);

  el('colLeft').innerHTML = `
    <div class="card">
      <h3>Journey</h3>
      <label class="fld">Position source</label>
      <div class="seg" role="group">
        <button data-src="sim" aria-pressed="${S.source === 'sim'}" ${m ? 'disabled' : ''}>Simulated</button>
        <button data-src="gps" aria-pressed="${S.source === 'gps'}" ${m ? 'disabled' : ''}>Real GPS</button>
      </div>
      ${S.source === 'gps' ? `<div class="note">${S.gpsErr
          ? `<span style="color:var(--red)">${esc(S.gpsErr)}</span>`
          : S.lastFix
            ? `Fix: ${S.lastFix.lat.toFixed(5)}, ${S.lastFix.lon.toFixed(5)} · ±${Math.round(S.lastFix.accuracy)} m`
            : 'Waiting for a fix… allow location access when prompted.'}</div>`
        : `<div class="note">The server moves the subject along a generated route from your start point. Use this to demo on a desk.</div>`}
      <label class="fld">Transport</label>
      <div class="modes" role="group">${Object.entries(S.modes).map(([k, v]) =>
        `<button data-mode="${k}" aria-pressed="${k === S.mode}" ${m ? 'disabled' : ''}>${esc(v.label)}</button>`).join('')}</div>
      <label class="fld" for="droneSel">Drone / dock</label>
      <select id="droneSel" ${m ? 'disabled' : ''}>${S.fleet.map(d =>
        `<option value="${esc(d.id)}" ${d.id === S.droneId ? 'selected' : ''}>${esc(d.id)} · ${Math.round(d.battery)}% · ${esc(d.dock)}</option>`).join('')}</select>
      <div class="prov"><span>VLOS only</span><span>RPIC supervised</span><span>${esc(S.user.plan)} · ${S.user.escorts_left} left</span></div>
    </div>

    <div class="card">
      <h3>Pre-flight gate · enforced server-side</h3>
      <div class="chk">${S.checks.map(c =>
        `<div class="${c.ok ? 'ok' : 'no'}"><i>${c.ok ? '✓' : '✕'}</i>${esc(c.label)}</div>`).join('')}</div>
      ${blocked.length ? `<div class="note" style="color:var(--red)">Launch is blocked until these clear. The server refuses the request — the button is not the gate.</div>` : ''}
    </div>

    <div class="card">
      <h3>Escort control</h3>
      ${!m ? `<button class="btn btn-primary" id="bLaunch" ${blocked.length ? 'disabled' : ''}>⬆ Launch Escort</button>
              <div class="note">Creates the mission, runs the gate, and requires RPIC arming before the aircraft moves.</div>`
           : `<div class="btn-row">
                ${m.state === 'paused'
                  ? `<button class="btn-sm" id="bResume">▶ Resume</button>`
                  : `<button class="btn-sm" id="bPause" ${m.state === 'returning' ? 'disabled' : ''}>⏸ Pause</button>`}
                <button class="btn-sm" id="bRtd" ${m.state === 'returning' ? 'disabled' : ''}>⌂ Return to dock</button>
              </div>
              <div class="btn-row"><button class="btn-sm" id="bAbort" style="grid-column:span 2;color:var(--red)">⚑ RPIC manual override — terminate</button></div>`}
    </div>

    <div class="card" style="border-color:rgba(255,77,94,.35)">
      <h3 style="color:var(--red)">Emergency</h3>
      ${s && !s.resolved_at
        ? `<div class="row" style="justify-content:space-between;margin-bottom:10px">
             <span class="pill p-red">${esc(s.id)} active</span><span class="sla" id="sSla"></span></div>
           <div class="note">${s.ack_at ? `Acknowledged by ${esc(s.ack_by)}.` : 'Waiting for operator acknowledgement.'}
             ${s.escalated_at ? ` Escalated to ${esc(s.escalated_to)}.` : ''}</div>
           <button class="btn btn-ghost" id="bResolve" style="margin-top:9px">Mark resolved — I'm safe</button>`
        : `<button class="btn btn-sos" id="bSos">SOS</button>
           <button class="btn-sm" id="bSilent" style="margin-top:8px;width:100%">Silent SOS — no sound or screen change</button>
           <div class="note">Two-stage with a 5-second cancel window. The operations centre is alerted in under 10 seconds.</div>`}
    </div>`;

  el('colRight').innerHTML = `
    <div class="card">
      <h3>Live feed</h3>
      <div class="video"><canvas id="cv"></canvas>
        ${m ? `<div class="hud">
            <div class="row" style="justify-content:space-between">
              <span>${esc(m.drone_id)}</span>
              <span>${m.recording ? '<span class="rec">REC · PROTECTED</span>' : '720p'}</span></div>
            <div class="row" style="justify-content:space-between">
              <span id="hAlt">ALT —</span><span id="hClock"></span></div></div>`
          : `<div class="off">FEED OFFLINE · DOCKED</div>`}
      </div>
      <div class="note">Placeholder renderer. WebRTC or RTSP drops in here without touching mission logic.</div>
    </div>

    <div class="card">
      <h3>Status</h3>
      <div class="row" style="justify-content:space-between;margin-bottom:11px">${statePill(m)}${advPill()}</div>
      <div class="stats">
        <div class="stat"><b id="sAlt">—</b><span>Alt m</span></div>
        <div class="stat"><b id="sSpd">—</b><span>km/h</span></div>
        <div class="stat"><b id="sElapsed">—</b><span>Elapsed</span></div>
      </div>
      <dl class="kv" style="margin-top:12px"><dt>Battery</dt><dd id="sBat">—</dd></dl>
      <div class="bar"><i id="sBatBar" style="width:0%"></i></div>
      <dl class="kv" style="margin-top:11px">
        <dt>Distance covered</dt><dd id="sDist">—</dd>
        <dt>Stand-off</dt><dd>${m ? Math.round(m.standoff) + ' m ahead' : '—'}</dd>
        <dt>Reserve floor</dt><dd>${S.reserve}%</dd>
        <dt>RPIC</dt><dd>${m ? esc(m.rpic) : '—'}</dd>
      </dl>
    </div>

    <div class="card">
      <h3>Advisories</h3>
      <div class="feed">${S.advisories.filter(a => a.raised).length
        ? S.advisories.filter(a => a.raised).map(a => `
          <div class="item i-${esc(a.level)}"><b>${esc(a.category)}</b><small>${esc(a.source)}</small>
          <p>${esc(a.description)}</p>
          <div class="prov"><span>conf: ${esc(a.confidence)}</span>
            <span class="${a.confirmed ? '' : 'unconf'}">${a.confirmed ? 'human-confirmed' : 'UNCONFIRMED'}</span></div></div>`).join('')
        : '<div class="empty">No advisories raised on this route.</div>'}</div>
    </div>

    <div class="card">
      <h3>Notifications</h3>
      <div class="feed">${feedHtml(S.notifications, 'No alerts yet. Launch an escort to begin.')}</div>
    </div>

    ${S.history.length ? `<div class="card">
      <h3>Mission records</h3>
      <div class="feed">${S.history.map(h => `
        <div class="item i-info"><b>${esc(h.id)} · ${(h.peak_m / 1000).toFixed(2)} km</b>
        <small>${hhmmss(new Date(h.started_at))} → ${h.ended_at ? hhmmss(new Date(h.ended_at)) : '—'} · ${esc(h.state)}</small>
        <p>${h.reserve_tripped ? 'Reserve return · ' : ''}${esc(h.source)} positioning${h.abort_reason ? ' · ' + esc(h.abort_reason) : ''}</p>
        <button class="btn-sm" data-replay="${esc(h.id)}" style="margin-top:7px">▶ Replay</button></div>`).join('')}</div>
      <div id="replayBox"></div>
    </div>` : ''}`;

  if (m) paintVideo(el('cv'), m);
  wireSub();
  if (S.replay) drawReplay();
}

function wireSub() {
  document.querySelectorAll('[data-src]').forEach(b => b.onclick = async () => {
    S.source = b.dataset.src;
    S.source === 'gps' ? startGps() : stopGps();
    S.sig = ''; render();
  });
  document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; S.sig = ''; render(); });
  const ds = el('droneSel');
  if (ds) ds.onchange = async e => { S.droneId = e.target.value; await loadChecks(); S.sig = ''; render(); };
  el('bLaunch') && (el('bLaunch').onclick = launch);
  el('bPause') && (el('bPause').onclick = () => cmd('pause'));
  el('bResume') && (el('bResume').onclick = () => cmd('resume'));
  el('bRtd') && (el('bRtd').onclick = () => cmd('rtd'));
  el('bAbort') && (el('bAbort').onclick = () => cmd('abort'));
  el('bSos') && (el('bSos').onclick = () => sosArm(false));
  el('bSilent') && (el('bSilent').onclick = () => sosArm(true));
  el('bResolve') && (el('bResolve').onclick = () => sosAct(S.sos.id, 'resolve'));
  document.querySelectorAll('[data-replay]').forEach(b => b.onclick = () => openReplay(b.dataset.replay));
}

/* --------------------------- replay --------------------------- */
async function openReplay(id) {
  try {
    const r = await api(`/api/missions/${id}/record`);
    S.replay = { id, i: 0, telemetry: r.telemetry, mission: r.mission, audit: r.audit };
    S.sig = ''; render();
  } catch (e) { toast(e.message); }
}
function drawReplay() {
  const box = el('replayBox');
  if (!box || !S.replay) return;
  const t = S.replay.telemetry;
  if (!t.length) { box.innerHTML = '<div class="note">No telemetry samples in this record.</div>'; return; }
  const sm = t[Math.min(S.replay.i, t.length - 1)];
  box.innerHTML = `
    <div style="margin-top:11px;border-top:1px solid var(--line);padding-top:11px">
      <div class="row" style="justify-content:space-between;font-size:11.5px">
        <b>${esc(S.replay.id)} replay</b>
        <span style="font-family:var(--mono);color:var(--dim)">${t.length} samples</span></div>
      <input type="range" id="scrub" min="0" max="${t.length - 1}" value="${S.replay.i}">
      <dl class="kv" style="margin-top:7px">
        <dt>Time</dt><dd id="rT">${hhmmss(new Date(sm.ts))}</dd>
        <dt>State</dt><dd id="rState">${esc(sm.state)}</dd>
        <dt>Alt / speed</dt><dd id="rAlt">${Math.round(sm.alt)}m · ${Math.round(sm.speed)}km/h</dd>
        <dt>Battery</dt><dd id="rBat">${Math.round(sm.battery)}%</dd>
      </dl>
      <div class="note">Replayed from the sealed record on the server, not from this browser's memory.</div>
      <button class="btn-sm" id="closeReplay" style="margin-top:8px">Close replay</button>
    </div>`;
  if (!layers.ghost) layers.ghost = L.marker([sm.lat, sm.lon], { icon: icon('✛', 'mk-drone', 20) }).addTo(map);
  else layers.ghost.setLatLng([sm.lat, sm.lon]);
  if (!S.replay.path) {
    S.replay.path = L.polyline(t.map(x => [x.lat, x.lon]), { color: '#6b8cff', weight: 3, opacity: .7, dashArray: '5 6' }).addTo(map);
    map.fitBounds(S.replay.path.getBounds(), { padding: [40, 40] });
  }
  el('scrub').oninput = e => {
    S.replay.i = +e.target.value;
    const p = S.replay.telemetry[S.replay.i];
    layers.ghost.setLatLng([p.lat, p.lon]);
    el('rT').textContent = hhmmss(new Date(p.ts));
    el('rState').textContent = p.state;
    el('rAlt').textContent = `${Math.round(p.alt)}m · ${Math.round(p.speed)}km/h`;
    el('rBat').textContent = `${Math.round(p.battery)}%`;
  };
  el('closeReplay').onclick = () => {
    if (S.replay.path) map.removeLayer(S.replay.path);
    drop('ghost'); S.replay = null; S.sig = ''; render();
  };
}

/* --------------------------- operator --------------------------- */
function renderOps() {
  const open = S.openSos.filter(s => !s.resolved_at);
  el('colLeft').innerHTML = `
    <div class="card">
      <h3>SOS triage queue · ${open.length}</h3>
      ${open.length ? open.map(s => `
        <div class="mission sos">
          <div class="top"><span class="nm">${esc(s.id)}</span>
            <span class="sla" data-sla="${esc(s.id)}" data-at="${s.triggered_at}">—</span></div>
          <div class="meta">${esc(s.mission_id || 'no active mission')} · ${s.silent ? 'SILENT' : 'standard'}</div>
          <div class="meta" style="margin-top:4px">raised ${hhmmss(new Date(s.triggered_at))}${
            s.ack_at ? ` · ack ${hhmmss(new Date(s.ack_at))} by ${esc(s.ack_by)}` : ''}${
            s.escalated_at ? ` · escalated ${hhmmss(new Date(s.escalated_at))}` : ''}</div>
          <div class="btn-row">
            <button class="btn-sm" data-ack="${esc(s.id)}" ${s.ack_at ? 'disabled' : ''}>${s.ack_at ? '✓ Acknowledged' : 'Acknowledge'}</button>
            <button class="btn-sm" data-esc="${esc(s.id)}" ${!s.ack_at || s.escalated_at ? 'disabled' : ''}>${s.escalated_at ? '✓ Escalated' : 'Escalate'}</button>
          </div>
          <div class="btn-row"><button class="btn-sm" data-res="${esc(s.id)}" ${!s.ack_at ? 'disabled' : ''} style="grid-column:span 2">Resolve</button></div>
        </div>`).join('')
      : '<div class="empty">Queue clear. No open alerts.</div>'}
    </div>

    <div class="card">
      <h3>Active missions · ${S.activeMissions.length}</h3>
      ${S.activeMissions.length ? S.activeMissions.map(m => `
        <div class="mission ${open.some(s => s.mission_id === m.id) ? 'sos' : ''}">
          <div class="top"><span class="nm">${esc(m.id)}</span>${statePill(m)}</div>
          <div class="meta">${esc(m.drone_id)} · RPIC ${esc(m.rpic)} · ${esc(m.source)} positioning</div>
          <div class="meta" data-mm="${esc(m.id)}" style="margin-top:4px">—</div>
          <div class="bar"><i data-mbar="${esc(m.id)}" style="width:${m.battery}%"></i></div>
          <div class="btn-row">
            <button class="btn-sm" data-adv="${esc(m.id)}">+ Raise advisory</button>
            <button class="btn-sm" data-focus="${esc(m.id)}">Centre map</button>
          </div>
        </div>`).join('')
      : '<div class="empty">No missions airborne.</div>'}
    </div>

    <div class="card">
      <h3>Fleet health</h3>
      ${S.fleet.map(d => `<div class="mission">
        <div class="top"><span class="nm">${esc(d.id)}</span>
          <span class="pill ${d.airworthiness === 'ok' ? (d.status === 'airborne' ? 'p-green' : 'p-idle') : 'p-orange'}">${
            d.airworthiness === 'ok' ? (d.status === 'airborne' ? 'Airborne' : 'Docked') : 'Maintenance'}</span></div>
        <div class="meta">${esc(d.model)} · fw ${esc(d.firmware)} · ${d.cycles} cycles</div>
        <div class="meta" style="margin-top:3px">${esc(d.dock)}</div>
        <div class="bar"><i style="width:${d.battery}%;background:var(--green)"></i></div>
      </div>`).join('')}
    </div>`;

  el('colRight').innerHTML = `
    <div class="card">
      <h3>Subject feed</h3>
      <div class="video"><canvas id="cv"></canvas>
        ${S.activeMissions[0] ? `<div class="hud">
            <div class="row" style="justify-content:space-between">
              <span>${esc(S.activeMissions[0].id)}</span>
              <span>${S.activeMissions[0].recording ? '<span class="rec">REC</span>' : 'MONITOR'}</span></div>
            <div class="row" style="justify-content:space-between">
              <span>operator: ${esc(S.user.name)}</span><span id="hClock"></span></div></div>`
          : '<div class="off">NO ACTIVE FEED</div>'}
      </div>
      <div class="note">Stream access is logged: who watched, when (FR-6.4).</div>
    </div>

    <div class="card">
      <h3>Advisories across active missions</h3>
      <div class="feed">${S.allAdvisories.filter(a => a.raised).length
        ? S.allAdvisories.filter(a => a.raised).map(a => `
          <div class="item i-${esc(a.level)}"><b>${esc(a.category)}</b>
          <small>${esc(a.source)} · ${esc(a.mission_id)}</small><p>${esc(a.description)}</p>
          <div class="prov"><span>conf: ${esc(a.confidence)}</span>
            <span class="${a.confirmed ? '' : 'unconf'}">${a.confirmed ? 'human-confirmed' : 'UNCONFIRMED'}</span></div></div>`).join('')
        : '<div class="empty">No advisories raised.</div>'}</div>
      <div class="note">Unconfirmed machine observations stay visually distinct and never auto-classify a person (RC-5).</div>
    </div>

    <div class="card">
      <h3>Audit log · append-only</h3>
      <div class="audit">${S.audit.length ? S.audit.map(a =>
        `<div><b>${esc(a.actor)}</b> ${esc(a.action)}<br>${hhmmss(new Date(a.ts))} · ${esc(a.detail)}</div>`).join('')
        : '<div class="empty">No events yet.</div>'}</div>
    </div>`;

  if (S.activeMissions[0]) paintVideo(el('cv'), S.activeMissions[0]);
  wireOps();
}
function wireOps() {
  document.querySelectorAll('[data-ack]').forEach(b => b.onclick = () => sosAct(b.dataset.ack, 'ack'));
  document.querySelectorAll('[data-esc]').forEach(b => b.onclick = () => sosAct(b.dataset.esc, 'escalate'));
  document.querySelectorAll('[data-res]').forEach(b => b.onclick = () => sosAct(b.dataset.res, 'resolve'));
  document.querySelectorAll('[data-focus]').forEach(b => b.onclick = () => {
    const m = S.activeMissions.find(x => x.id === b.dataset.focus);
    if (m && m.lat != null) map.setView([m.lat, m.lon], 15);
  });
  document.querySelectorAll('[data-adv]').forEach(b => b.onclick = async () => {
    const description = prompt('Advisory description (sent to the subscriber, marked human-confirmed):');
    if (!description) return;
    try {
      await api('/api/ops/advisories', { method: 'POST',
        body: { missionId: b.dataset.adv, level: 'orange', category: 'Operator advisory', description } });
      toast('Advisory sent to the subscriber.');
    } catch (e) { toast(e.message); }
  });
}

/* --------------------------- volatile patch --------------------------- */
function tickDom() {
  const set = (id, v) => { const n = el(id); if (n && n.textContent !== String(v)) n.textContent = v; };
  const m = S.mission;
  if (m) {
    set('sAlt', Math.round(m.alt)); set('sSpd', Math.round(m.speed));
    set('sElapsed', mmss(m.elapsed_s)); set('sBat', Math.round(m.battery) + '%');
    set('sDist', (m.peak_m / 1000).toFixed(2) + ' km');
    set('hAlt', `ALT ${Math.round(m.alt)}m · ${Math.round(m.speed)}km/h`);
    const b = el('sBatBar');
    if (b) {
      b.style.width = m.battery + '%';
      b.style.background = m.battery <= S.reserve ? 'var(--red)' : m.battery <= 30 ? 'var(--yellow)' : 'var(--green)';
    }
  }
  set('hClock', hhmmss(new Date()));
  if (S.sos && !S.sos.resolved_at) {
    const w = Math.round((Date.now() - S.sos.triggered_at) / 1000);
    set('sSla', S.sos.ack_at ? 'ACK' : `waiting ${w}s`);
  }
  document.querySelectorAll('[data-sla]').forEach(n => {
    const s = S.openSos.find(x => x.id === n.dataset.sla);
    if (!s) return;
    n.textContent = s.ack_at ? 'ACK' : `UNACK ${Math.round((Date.now() - s.triggered_at) / 1000)}s`;
  });
  document.querySelectorAll('[data-mm]').forEach(n => {
    const mm = S.activeMissions.find(x => x.id === n.dataset.mm);
    if (!mm) return;
    n.textContent = `${(mm.peak_m / 1000).toFixed(2)} km · ${Math.round(mm.alt)}m · ${Math.round(mm.speed)}km/h · bat ${Math.round(mm.battery)}%`;
  });
  document.querySelectorAll('[data-mbar]').forEach(n => {
    const mm = S.activeMissions.find(x => x.id === n.dataset.mbar);
    if (!mm) return;
    n.style.width = mm.battery + '%';
    n.style.background = mm.battery <= S.reserve ? 'var(--red)' : mm.battery <= 30 ? 'var(--yellow)' : 'var(--green)';
  });
  const cv = el('cv');
  const vm = S.view === 'ops' ? S.activeMissions[0] : S.mission;
  if (cv && vm) paintVideo(cv, vm);
}

/* ------------------------------------------------------------------ boot */
el('rSub') && (el('rSub').onclick = () => { S.view = 'sub'; S.sig = ''; followedOnce = false; render(); });
el('rOps') && (el('rOps').onclick = () => { S.view = 'ops'; S.sig = ''; followedOnce = false; render(); });
window.addEventListener('resize', () => { map && map.invalidateSize(); render(); });

async function start() {
  el('auth').hidden = true;
  el('chrome').hidden = false;
  el('app').hidden = false;
  initMap();
  setTimeout(() => map.invalidateSize(), 60);
  await refresh();
  S.view = S.user.role === 'operator' ? 'ops' : 'sub';
  connectStream();
  if (S.source === 'gps') startGps();
  setInterval(() => { el('clock').textContent = hhmmss(new Date()); tickDom(); }, 500);
  setInterval(() => { if (!S.linkOk) refresh().then(render).catch(() => {}); }, 5000);
  S.sig = ''; render();
}

(async () => {
  try { const r = await api('/api/me'); S.user = r.user; await start(); }
  catch { setAuthMode('login'); }
})();
