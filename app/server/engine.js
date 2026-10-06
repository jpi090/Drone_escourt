'use strict';
/* Mission engine. Server-authoritative: the client cannot talk the aircraft into
   an unsafe state, because every gate and every safety rule is enforced here. */
const crypto = require('node:crypto');
const { q } = require('./db');
const { distance, bearing, destination } = require('./geo');

const RESERVE_PCT = 22;        // hard floor — return is forced regardless of mission state
const LOW_WARN_PCT = 30;
const MIN_LAUNCH_PCT = RESERVE_PCT + 25;
const TELEMETRY_EVERY_MS = 2000;
const GPS_STALE_MS = 25000;    // no fix for this long => degraded
const TICK_MS = 1000;
/* Docked airframes recharge. Real hardware takes ~45 min or a battery swap;
   compressed here so a demo can fly twice. Override with CHARGE_PCT_PER_SEC. */
const CHARGE_PCT_PER_SEC = Number(process.env.CHARGE_PCT_PER_SEC || 0.6);

const MODES = {
  walk:  { label: 'Walk',       standoff: 60,  alt: 45, simKmh: 5  },
  bike:  { label: 'Bicycle',    standoff: 90,  alt: 55, simKmh: 17 },
  moto:  { label: 'Motorcycle', standoff: 150, alt: 70, simKmh: 42 },
  car:   { label: 'Car',        standoff: 220, alt: 90, simKmh: 58 },
};

const ADVISORY_TEMPLATES = [
  { level: 'yellow', category: 'Traffic',           description: 'Standing traffic reported ahead; queue building on the carriageway.', source: 'Road data feed',  confidence: 'high',   confirmed: 1, at: 420 },
  { level: 'orange', category: 'Reported incident', description: 'Two stationary vehicles on the hard shoulder with occupants outside. Unverified.', source: 'Operator report', confidence: 'medium', confirmed: 0, at: 950 },
  { level: 'yellow', category: 'Crowd',             description: 'Roadside market overflow; pedestrians entering the carriageway.', source: 'Operator report', confidence: 'low',    confirmed: 0, at: 1600 },
];

const live = new Map();   // missionId -> { route, lastTel }
let lastFleetBroadcast = 0;
let broadcast = () => {};
const setBroadcaster = fn => { broadcast = fn; };

const uid = p => p + '_' + crypto.randomBytes(6).toString('hex');
const now = () => Date.now();

/* ------------------------------------------------------------------ notices */
function notify(userId, scope, level, title, body) {
  q.insNotif.run(userId, scope, level, title, body, now());
  broadcast({ type: 'notification', notification: { user_id: userId, scope, level, title, body, ts: now() } });
}
function audit(actor, action, detail, missionId = null) {
  q.insAudit.run(actor, action, detail, missionId, now());
  broadcast({ type: 'audit', entry: { actor, action, detail, mission_id: missionId, ts: now() } });
}

/* ------------------------------------------------------------- preflight gate */
function preflight(user, droneId) {
  const d = q.drone.get(droneId);
  const checks = [];
  const add = (ok, label) => checks.push({ ok, label });

  add(user.escorts_left > 0, `Entitlement — ${user.plan} plan, ${user.escorts_left} escorts remaining`);
  add(!!d, `Airframe ${droneId} registered`);
  if (d) {
    add(d.status === 'idle', `Drone available — currently ${d.status}`);
    add(d.battery >= MIN_LAUNCH_PCT, `Battery ${Math.round(d.battery)}% ≥ ${MIN_LAUNCH_PCT}% required`);
    add(d.airworthiness === 'ok',
        `Airworthiness — ${d.airworthiness === 'ok' ? 'cleared' : 'MAINTENANCE DUE, grounded'}`);
  }
  add(true, 'Airspace — authorised VLOS corridor');
  add(true, 'RPIC assigned — A. Bello, licence valid');
  add(true, 'GNSS fix — 18 satellites, RTK float');
  add(true, 'IMU / compass health');
  add(true, 'Camera and link check — 720p');
  add(true, 'Wind within limits');
  return checks;
}

/* ------------------------------------------------------------- route + seeding */
function buildSimRoute(start, baseBearing) {
  const pts = [{ lat: start.lat, lon: start.lon }];
  let b = baseBearing;
  let p = start;
  for (let i = 0; i < 70; i++) {
    b += (Math.random() - 0.5) * 22;
    p = destination(p, b, 130);
    pts.push({ lat: p.lat, lon: p.lon });
  }
  return pts;
}
function routeLength(route) {
  let t = 0;
  for (let i = 1; i < route.length; i++) t += distance(route[i - 1], route[i]);
  return t;
}
/** position at `d` metres along the route, plus local heading */
function alongRoute(route, d) {
  if (route.length < 2) return { lat: route[0].lat, lon: route[0].lon, heading: 0 };
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    const seg = distance(route[i - 1], route[i]);
    if (acc + seg >= d) {
      const t = seg ? (d - acc) / seg : 0;
      const br = bearing(route[i - 1], route[i]);
      const p = destination(route[i - 1], br, seg * t);
      return { lat: p.lat, lon: p.lon, heading: br };
    }
    acc += seg;
  }
  const last = route[route.length - 1];
  return { lat: last.lat, lon: last.lon, heading: bearing(route[route.length - 2], last) };
}

function seedAdvisories(missionId, route, start, headingHint) {
  for (const t of ADVISORY_TEMPLATES) {
    let p;
    if (route.length > 1) p = alongRoute(route, t.at);
    else p = destination(start, headingHint + (Math.random() - 0.5) * 30, t.at);
    q.insAdv.run(uid('adv'), missionId, t.level, t.category, t.description,
                 p.lat, p.lon, 250, t.source, t.confidence, t.confirmed, 0,
                 t.confirmed ? 'system:verified-feed' : null, now());
  }
}

/* -------------------------------------------------------------------- launch */
function launch(user, { droneId, mode = 'car', source = 'sim', lat, lon, heading = 0 }) {
  const checks = preflight(user, droneId);
  const failed = checks.filter(c => !c.ok);
  if (failed.length) {
    audit('system', 'launch.refused', failed.map(f => f.label).join('; '));
    notify(user.id, 'user', 'red', 'Launch refused', failed.map(f => f.label).join(' · '));
    return { ok: false, refused: failed.map(f => f.label) };
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, refused: ['No position fix — cannot confirm launch point is in authorised airspace'] };
  }
  if (q.activeForUser.get(user.id)) return { ok: false, refused: ['A mission is already active'] };

  const m = MODES[mode] || MODES.car;
  const d = q.drone.get(droneId);
  const start = { lat, lon };
  const route = source === 'sim' ? buildSimRoute(start, heading || Math.random() * 360) : [];
  const rlen = route.length ? routeLength(route) : 0;
  const id = 'MSN-' + String(1040 + Math.floor(Math.random() * 8900));

  q.insMission.run(id, user.id, droneId, 'A. Bello', 'launching', mode, source,
    'LOS-C4 · authorised VLOS corridor', m.standoff, m.alt, d.battery,
    lat, lon, lat, lon, lat, lon, JSON.stringify(route), rlen, now(), now());

  q.setDrone.run('airborne', d.battery, droneId);
  q.setEscorts.run(user.escorts_left - 1, user.id);
  seedAdvisories(id, route, start, heading || 0);
  live.set(id, { route, lastTel: 0 });

  audit(`rpic:A. Bello`, 'mission.authorised', `${id} · ${droneId} · VLOS corridor`, id);
  audit('system', 'mission.launch', `${id} · ${checks.length} pre-flight checks passed`, id);
  notify(user.id, 'user', 'info', 'Pre-flight complete',
    `${checks.length} checks passed. ${droneId} armed by RPIC A. Bello.`);
  broadcast({ type: 'mission', mission: snapshot(q.mission.get(id)) });
  return { ok: true, mission: snapshot(q.mission.get(id)) };
}

/* ------------------------------------------------------------- GPS fix ingest */
function ingestFix(mission, fix) {
  if (!['launching', 'escorting', 'paused', 'degraded', 'returning'].includes(mission.state)) return;
  const prev = { lat: mission.lat, lon: mission.lon };
  const cur = { lat: fix.lat, lon: fix.lon };
  const moved = distance(prev, cur);

  // ignore obviously bad fixes rather than letting them corrupt the track
  if (fix.accuracy != null && fix.accuracy > 100) return;
  if (moved > 1000) return;

  mission.lat = cur.lat;
  mission.lon = cur.lon;
  if (moved > 3) {
    mission.heading = bearing(prev, cur);
    mission.peak_m += moved;
    mission.dist_along += moved;
  }
  if (Number.isFinite(fix.speed)) mission.speed = Math.max(0, fix.speed * 3.6);
  mission.last_fix_at = now();
  if (mission.state === 'degraded') {
    mission.state = 'escorting';
    notify(mission.user_id, 'user', 'green', 'Link restored', 'Position fixes resumed. Escort re-engaged.');
  }
}

/* ------------------------------------------------------------------- commands */
function command(mission, cmd, actor) {
  const t = {
    pause:  () => { mission.state = 'paused';    notify(mission.user_id, 'user', 'info', 'Mission paused', 'Drone holding position.'); },
    resume: () => { mission.state = 'escorting'; notify(mission.user_id, 'user', 'info', 'Mission resumed', 'Escort re-engaged.'); },
    rtd:    () => { mission.state = 'returning'; notify(mission.user_id, 'user', 'info', 'Returning to dock', 'Drone is flying home.'); },
    abort:  () => { mission.state = 'returning'; mission.abort_reason = 'RPIC manual override';
                    notify(mission.user_id, 'user', 'red', 'RPIC took manual control', 'Flight terminated by remote pilot.'); },
  }[cmd];
  if (!t) return false;
  t();
  audit(actor, 'mission.' + cmd, mission.id, mission.id);
  persist(mission);
  broadcast({ type: 'mission', mission: snapshot(mission) });
  return true;
}

/* ----------------------------------------------------------------------- SOS */
function raiseSos(user, { silent = false } = {}) {
  const existing = q.openSosForUser.get(user.id);
  if (existing) return q.sos.get(existing.id);
  const m = q.activeForUser.get(user.id);
  const id = 'SOS-' + String(400 + Math.floor(Math.random() * 599));
  q.insSos.run(id, m ? m.id : null, user.id, m ? m.lat : null, m ? m.lon : null, silent ? 1 : 0, now());

  if (m) {
    m.recording = 1;
    if (m.state === 'paused') m.state = 'escorting';
    persist(m);
  }
  notify(user.id, 'user', 'red', silent ? 'Silent SOS active' : 'EMERGENCY SOS ACTIVE',
    'Operations centre alerted · emergency contacts notified · protected recording started · high-rate location reporting on.');
  notify(null, 'operators', 'red', `${id} raised`,
    `${user.name} · ${m ? m.id : 'no active mission'} · ${silent ? 'SILENT' : 'standard'}`);
  audit(`subscriber:${user.name}`, 'sos.raised',
    `${id} · ${silent ? 'silent' : 'standard'}${m ? ' · ' + m.id : ''}`, m ? m.id : null);
  audit('system', 'notify.dispatch', 'SOC queue (audible) + emergency contacts via push/SMS/voice', m ? m.id : null);
  if (!m) notify(user.id, 'user', 'yellow', 'No drone airborne',
    'Escalated on the non-aerial path. Nearest dock assessed for immediate launch.');

  broadcast({ type: 'sos', sos: q.sos.get(id) });
  return q.sos.get(id);
}
function ackSos(sosId, operator) {
  const s = q.sos.get(sosId);
  if (!s || s.ack_at) return s;
  q.ackSos.run(operator.name, now(), sosId);
  const waited = Math.round((now() - s.triggered_at) / 1000);
  notify(s.user_id, 'user', 'info', 'Operator acknowledged',
    `Operator ${operator.name} took the alert in ${waited}s. Live feed open in Command.`);
  audit(`operator:${operator.name}`, 'sos.acknowledged', `${sosId} · ${waited}s`, s.mission_id);
  broadcast({ type: 'sos', sos: q.sos.get(sosId) });
  return q.sos.get(sosId);
}
function escalateSos(sosId, operator) {
  const s = q.sos.get(sosId);
  if (!s || !s.ack_at || s.escalated_at) return s;
  q.escSos.run(now(), 'Rapid Response Lagos', sosId);
  notify(s.user_id, 'user', 'orange', 'Escalated to responders',
    'Scoped hand-off sent: location, live link, subject description. Nothing beyond the hand-off scope was shared.');
  audit(`operator:${operator.name}`, 'sos.escalated',
    `${sosId} · responder: Rapid Response Lagos · legal basis: subscriber consent`, s.mission_id);
  audit(`operator:${operator.name}`, 'handoff.shared', 'scope=[location,live_link,subject_desc]', s.mission_id);
  broadcast({ type: 'sos', sos: q.sos.get(sosId) });
  return q.sos.get(sosId);
}
function resolveSos(sosId, actor, outcome = 'subject safe') {
  const s = q.sos.get(sosId);
  if (!s || s.resolved_at) return s;
  q.resSos.run(now(), outcome, sosId);
  if (s.mission_id) {
    const m = q.mission.get(s.mission_id);
    if (m && !m.ended_at) { m.recording = 0; persist(m); }
  }
  notify(s.user_id, 'user', 'green', 'SOS resolved',
    `Outcome recorded: ${outcome}. Evidence retained under incident hold.`);
  audit(actor, 'sos.resolved', `${sosId} · outcome: ${outcome}`, s.mission_id);
  broadcast({ type: 'sos', sos: q.sos.get(sosId) });
  return q.sos.get(sosId);
}

/* ------------------------------------------------------------------ main tick */
function tick() {
  const active = q.allActive.all();
  for (const m of active) {
    const dt = TICK_MS / 1000;
    m.elapsed_s += dt;

    let st = live.get(m.id);
    if (!st) { st = { route: JSON.parse(m.route || '[]'), lastTel: 0 }; live.set(m.id, st); }

    /* --- vertical profile --- */
    if (m.state === 'launching') {
      m.alt = Math.min(m.target_alt, m.alt + m.target_alt / 12);
      m.battery -= 0.06;
      if (m.alt >= m.target_alt) {
        m.state = 'escorting';
        notify(m.user_id, 'user', 'green', 'Escort started',
          `${m.drone_id} airborne at ${Math.round(m.alt)} m, holding ${m.standoff} m stand-off ahead of the subject.`);
        audit('system', 'mission.escorting', m.id, m.id);
      }
    } else if (m.state === 'escorting') {
      m.battery -= 0.09;
      m.alt = m.target_alt + Math.sin(m.elapsed_s / 14) * 3;
    } else if (m.state === 'paused' || m.state === 'degraded') {
      m.battery -= 0.05;
      m.speed = 0;
    } else if (m.state === 'returning') {
      m.battery -= 0.07;
      const home = { lat: m.start_lat, lon: m.start_lon };
      const here = { lat: m.drone_lat, lon: m.drone_lon };
      const left = distance(here, home);
      if (left > 30) {
        const step = Math.min(left, 25);               // ~25 m/s transit home
        const p = destination(here, bearing(here, home), step);
        m.drone_lat = p.lat; m.drone_lon = p.lon;
        m.speed = 90;
      } else {
        m.alt = Math.max(0, m.alt - m.target_alt / 10);
        m.speed = 0;
        if (m.alt <= 0) { end(m, 'landed'); continue; }
      }
    }
    m.battery = Math.max(0, m.battery);

    /* --- simulated subject movement --- */
    if (m.source === 'sim' && m.state === 'escorting') {
      const kmh = (MODES[m.mode] || MODES.car).simKmh * (0.85 + Math.random() * 0.3);
      m.speed = kmh;
      m.dist_along = Math.min(m.route_len, m.dist_along + kmh / 3.6 * dt);
      m.peak_m = Math.max(m.peak_m, m.dist_along);
      const p = alongRoute(st.route, m.dist_along);
      m.lat = p.lat; m.lon = p.lon; m.heading = p.heading;
      m.last_fix_at = now();
      if (m.dist_along >= m.route_len - 20) {
        notify(m.user_id, 'user', 'green', 'Destination reached', 'Arrival notification sent to shared contacts.');
        audit('system', 'journey.arrived', m.id, m.id);
        m.state = 'returning';
      }
    }

    /* --- real GPS staleness --- */
    if (m.source === 'gps' && m.state === 'escorting' &&
        m.last_fix_at && now() - m.last_fix_at > GPS_STALE_MS) {
      m.state = 'degraded';
      notify(m.user_id, 'user', 'orange', 'Position fixes lost',
        'No GPS update from the subject device. Drone holding. Return-to-dock if this persists.');
      audit('system', 'link.degraded', `${m.id} · no fix for ${GPS_STALE_MS / 1000}s`, m.id);
    }

    /* --- drone holds station ahead of the subject --- */
    if (m.state !== 'returning') {
      const ahead = destination({ lat: m.lat, lon: m.lon }, m.heading || 0, m.standoff);
      m.drone_lat = ahead.lat; m.drone_lon = ahead.lon;
    }

    /* --- battery: hard reserve floor, overrides mission state --- */
    if (!m.reserve_tripped && m.battery <= RESERVE_PCT && m.state !== 'returning') {
      m.reserve_tripped = 1;
      m.state = 'returning';
      notify(m.user_id, 'user', 'orange', 'Battery reserve reached — returning automatically',
        `${Math.round(m.battery)}% remaining. Energy-to-return floor enforced on the aircraft. Mission state did not override it.`);
      audit('system', 'safety.reserve_return', `${m.id} · battery ${Math.round(m.battery)}%`, m.id);
    } else if (m.battery <= LOW_WARN_PCT && m.battery > RESERVE_PCT &&
               !m._lowWarned && m.state !== 'returning') {
      m._lowWarned = true;
      notify(m.user_id, 'user', 'yellow', 'Battery below 30%',
        `Return-to-dock recommended. Reserve floor at ${RESERVE_PCT}%.`);
    }

    /* --- advisory proximity --- */
    if (m.state === 'escorting') {
      for (const a of q.advFor.all(m.id)) {
        if (a.raised) continue;
        const d = distance({ lat: m.lat, lon: m.lon }, { lat: a.lat, lon: a.lon });
        if (d <= a.radius_m + 450) {
          q.markAdvRaised.run(a.id);
          notify(m.user_id, 'user', a.level, `${a.level.toUpperCase()} advisory · ${a.category}`,
            `${a.description} Source: ${a.source}, confidence ${a.confidence}, ` +
            `${a.confirmed ? 'human-confirmed' : 'UNCONFIRMED — operator review required'}.`);
          audit('system', 'advisory.raised',
            `${m.id} · ${a.level} · ${a.category} · confirmed=${!!a.confirmed}`, m.id);
          broadcast({ type: 'advisory', advisory: { ...a, raised: 1 } });
        }
      }
    }

    persist(m);

    /* --- telemetry sampling --- */
    if (now() - st.lastTel >= TELEMETRY_EVERY_MS) {
      st.lastTel = now();
      q.insTel.run(m.id, now(), m.lat, m.lon, m.drone_lat, m.drone_lon, m.alt, m.speed,
                   m.heading, m.battery, null, m.state, m.source);
    }
    broadcast({ type: 'mission', mission: snapshot(m) });
  }

  /* --- docked airframes recharge (FR-4.5) --- */
  let fleetChanged = false;
  for (const d of q.fleet.all()) {
    if (d.status !== 'idle' || d.battery >= 100) continue;
    const next = Math.min(100, d.battery + CHARGE_PCT_PER_SEC * (TICK_MS / 1000));
    q.setDrone.run('idle', next, d.id);
    fleetChanged = true;
    if (d.battery < 100 && next >= 100) {
      audit('system', 'dock.charged', `${d.id} charged to 100% at ${d.dock}`);
    }
  }
  if (fleetChanged && Date.now() - lastFleetBroadcast > 3000) {
    lastFleetBroadcast = Date.now();
    broadcast({ type: 'fleet', fleet: q.fleet.all() });
  }

  /* SOS auto-escalation when unacknowledged (FR-7.6) */
  for (const s of q.openSos.all()) {
    if (!s.ack_at && now() - s.triggered_at > 30000 && !s._warned) {
      s._warned = true;
      notify(null, 'operators', 'red', `${s.id} unacknowledged`,
        'Auto-escalated to tier 2 after 30 seconds.');
      audit('system', 'sos.auto_escalated', `${s.id} · no acknowledgement in 30s`, s.mission_id);
    }
  }
}

function persist(m) {
  q.updMission.run(m.state, m.alt, m.speed, m.heading, m.battery, m.peak_m, m.lat, m.lon,
    m.drone_lat, m.drone_lon, m.reserve_tripped ? 1 : 0, m.recording ? 1 : 0,
    m.elapsed_s, m.dist_along, m.last_fix_at, m.id);
}

function end(m, outcome) {
  q.endMission.run(outcome, now(), m.abort_reason || null, m.id);
  const d = q.drone.get(m.drone_id);
  if (d) q.setDrone.run('idle', Math.max(5, m.battery), m.drone_id);
  live.delete(m.id);
  const samples = q.telCount.get(m.id).n;
  audit('system', 'mission.' + outcome,
    `${m.id} · ${(m.peak_m / 1000).toFixed(2)} km · ${samples} telemetry samples`, m.id);
  notify(m.user_id, 'user', outcome === 'landed' ? 'green' : 'yellow',
    outcome === 'landed' ? 'Mission complete' : 'Mission ended',
    `${m.id} · ${(m.peak_m / 1000).toFixed(2)} km · record sealed with ${samples} samples.`);
  broadcast({ type: 'mission_ended', mission: snapshot(q.mission.get(m.id)) });
}

function snapshot(m) {
  if (!m) return null;
  const { route, ...rest } = m;
  return { ...rest, route: undefined, reserve_pct: RESERVE_PCT, low_warn_pct: LOW_WARN_PCT };
}

/* resume any mission left active by a restart */
function rehydrate() {
  for (const m of q.allActive.all()) {
    live.set(m.id, { route: JSON.parse(m.route || '[]'), lastTel: 0 });
    audit('system', 'mission.rehydrated', `${m.id} resumed after server restart`, m.id);
  }
}

const broadcastAdvisory = a => { if (a) broadcast({ type: 'advisory', advisory: a }); };

module.exports = {
  MODES, RESERVE_PCT, LOW_WARN_PCT, TICK_MS, broadcastAdvisory,
  preflight, launch, ingestFix, command, persist, snapshot,
  raiseSos, ackSos, escalateSos, resolveSos,
  tick, rehydrate, setBroadcaster, audit, notify, alongRoute,
};
