'use strict';
/* Persistence. Uses Node's built-in SQLite — no native build step, no npm install. */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'escorts.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  pass_hash TEXT NOT NULL, salt TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'subscriber',
  plan TEXT NOT NULL DEFAULT 'Fleet', escorts_left INTEGER NOT NULL DEFAULT 12,
  contacts TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);

CREATE TABLE IF NOT EXISTS drones(
  id TEXT PRIMARY KEY, model TEXT NOT NULL, battery REAL NOT NULL, cycles INTEGER NOT NULL,
  firmware TEXT NOT NULL, dock TEXT NOT NULL, airworthiness TEXT NOT NULL DEFAULT 'ok',
  status TEXT NOT NULL DEFAULT 'idle');

CREATE TABLE IF NOT EXISTS missions(
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  drone_id TEXT NOT NULL REFERENCES drones(id), rpic TEXT NOT NULL,
  state TEXT NOT NULL, mode TEXT NOT NULL, source TEXT NOT NULL,
  corridor TEXT NOT NULL, standoff REAL NOT NULL, target_alt REAL NOT NULL,
  alt REAL NOT NULL DEFAULT 0, speed REAL NOT NULL DEFAULT 0, heading REAL NOT NULL DEFAULT 0,
  battery REAL NOT NULL, peak_m REAL NOT NULL DEFAULT 0,
  lat REAL, lon REAL, drone_lat REAL, drone_lon REAL,
  start_lat REAL, start_lon REAL,
  route TEXT NOT NULL DEFAULT '[]', dist_along REAL NOT NULL DEFAULT 0,
  route_len REAL NOT NULL DEFAULT 0,
  reserve_tripped INTEGER NOT NULL DEFAULT 0, recording INTEGER NOT NULL DEFAULT 0,
  abort_reason TEXT, started_at INTEGER NOT NULL, ended_at INTEGER,
  last_fix_at INTEGER, elapsed_s REAL NOT NULL DEFAULT 0);

CREATE TABLE IF NOT EXISTS telemetry(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mission_id TEXT NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  ts INTEGER NOT NULL, lat REAL NOT NULL, lon REAL NOT NULL,
  drone_lat REAL, drone_lon REAL, alt REAL, speed REAL, heading REAL,
  battery REAL, accuracy REAL, state TEXT, src TEXT);
CREATE INDEX IF NOT EXISTS idx_tel_mission ON telemetry(mission_id, ts);

CREATE TABLE IF NOT EXISTS advisories(
  id TEXT PRIMARY KEY, mission_id TEXT REFERENCES missions(id) ON DELETE CASCADE,
  level TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, radius_m REAL NOT NULL DEFAULT 250,
  source TEXT NOT NULL, confidence TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0,
  raised INTEGER NOT NULL DEFAULT 0, confirmed_by TEXT,
  created_at INTEGER NOT NULL, cleared_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_adv_mission ON advisories(mission_id);

CREATE TABLE IF NOT EXISTS sos_alerts(
  id TEXT PRIMARY KEY, mission_id TEXT REFERENCES missions(id) ON DELETE SET NULL,
  user_id TEXT NOT NULL REFERENCES users(id), lat REAL, lon REAL,
  silent INTEGER NOT NULL DEFAULT 0, triggered_at INTEGER NOT NULL,
  ack_by TEXT, ack_at INTEGER, escalated_at INTEGER, escalated_to TEXT,
  resolved_at INTEGER, outcome TEXT);

CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'user', level TEXT NOT NULL, title TEXT NOT NULL,
  body TEXT NOT NULL, ts INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_notif ON notifications(user_id, ts);

-- append-only: no UPDATE or DELETE is ever issued against this table
CREATE TABLE IF NOT EXISTS audit(
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT NOT NULL, action TEXT NOT NULL,
  detail TEXT NOT NULL, mission_id TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit(ts);
`);

/* ---- seed fleet once ---- */
const fleetCount = db.prepare('SELECT COUNT(*) n FROM drones').get().n;
if (!fleetCount) {
  const ins = db.prepare(`INSERT INTO drones(id,model,battery,cycles,firmware,dock,airworthiness,status)
                          VALUES(?,?,?,?,?,?,?,?)`);
  ins.run('DE-114', 'Sentinel X2', 97, 184, '4.2.1', 'Vehicle dock · LAG-4421', 'ok', 'idle');
  ins.run('DE-087', 'Sentinel X2', 62, 402, '4.2.1', 'Hub · Lekki Phase 1', 'ok', 'idle');
  ins.run('DE-203', 'Sentinel X1', 88, 912, '4.1.8', 'Hub · Ikeja', 'maintenance', 'grounded');
}

const q = {
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  insUser: db.prepare(`INSERT INTO users(id,email,name,pass_hash,salt,role,plan,escorts_left,contacts,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?)`),
  setEscorts: db.prepare('UPDATE users SET escorts_left = ? WHERE id = ?'),
  setContacts: db.prepare('UPDATE users SET contacts = ? WHERE id = ?'),

  insSession: db.prepare('INSERT INTO sessions(token,user_id,created_at,expires_at) VALUES(?,?,?,?)'),
  session: db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?'),
  delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),

  fleet: db.prepare('SELECT * FROM drones ORDER BY id'),
  drone: db.prepare('SELECT * FROM drones WHERE id = ?'),
  setDrone: db.prepare('UPDATE drones SET status = ?, battery = ? WHERE id = ?'),

  insMission: db.prepare(`INSERT INTO missions(id,user_id,drone_id,rpic,state,mode,source,corridor,
      standoff,target_alt,battery,lat,lon,drone_lat,drone_lon,start_lat,start_lon,
      route,route_len,started_at,last_fix_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  mission: db.prepare('SELECT * FROM missions WHERE id = ?'),
  activeForUser: db.prepare(`SELECT * FROM missions WHERE user_id = ?
      AND state NOT IN ('completed','landed','aborted','rejected') ORDER BY started_at DESC LIMIT 1`),
  allActive: db.prepare(`SELECT * FROM missions
      WHERE state NOT IN ('completed','landed','aborted','rejected') ORDER BY started_at DESC`),
  historyForUser: db.prepare(`SELECT * FROM missions WHERE user_id = ?
      AND state IN ('completed','landed','aborted') ORDER BY started_at DESC LIMIT 25`),
  updMission: db.prepare(`UPDATE missions SET state=?, alt=?, speed=?, heading=?, battery=?,
      peak_m=?, lat=?, lon=?, drone_lat=?, drone_lon=?, reserve_tripped=?, recording=?,
      elapsed_s=?, dist_along=?, last_fix_at=? WHERE id=?`),
  endMission: db.prepare('UPDATE missions SET state=?, ended_at=?, abort_reason=? WHERE id=?'),

  insTel: db.prepare(`INSERT INTO telemetry(mission_id,ts,lat,lon,drone_lat,drone_lon,alt,speed,
      heading,battery,accuracy,state,src) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  telFor: db.prepare('SELECT * FROM telemetry WHERE mission_id = ? ORDER BY ts'),
  telCount: db.prepare('SELECT COUNT(*) n FROM telemetry WHERE mission_id = ?'),

  insAdv: db.prepare(`INSERT INTO advisories(id,mission_id,level,category,description,lat,lon,
      radius_m,source,confidence,confirmed,raised,confirmed_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  advFor: db.prepare('SELECT * FROM advisories WHERE mission_id = ? ORDER BY created_at'),
  advRaised: db.prepare('SELECT * FROM advisories WHERE mission_id = ? AND raised = 1'),
  markAdvRaised: db.prepare('UPDATE advisories SET raised = 1 WHERE id = ?'),
  confirmAdv: db.prepare('UPDATE advisories SET confirmed = 1, confirmed_by = ? WHERE id = ?'),

  insSos: db.prepare(`INSERT INTO sos_alerts(id,mission_id,user_id,lat,lon,silent,triggered_at)
      VALUES(?,?,?,?,?,?,?)`),
  sos: db.prepare('SELECT * FROM sos_alerts WHERE id = ?'),
  openSos: db.prepare('SELECT * FROM sos_alerts WHERE resolved_at IS NULL ORDER BY triggered_at'),
  openSosForUser: db.prepare(`SELECT * FROM sos_alerts WHERE user_id = ? AND resolved_at IS NULL
      ORDER BY triggered_at DESC LIMIT 1`),
  sosFor: db.prepare('SELECT * FROM sos_alerts WHERE mission_id = ?'),
  ackSos: db.prepare('UPDATE sos_alerts SET ack_by = ?, ack_at = ? WHERE id = ?'),
  escSos: db.prepare('UPDATE sos_alerts SET escalated_at = ?, escalated_to = ? WHERE id = ?'),
  resSos: db.prepare('UPDATE sos_alerts SET resolved_at = ?, outcome = ? WHERE id = ?'),

  insNotif: db.prepare('INSERT INTO notifications(user_id,scope,level,title,body,ts) VALUES(?,?,?,?,?,?)'),
  notifsFor: db.prepare(`SELECT * FROM notifications WHERE user_id = ? OR scope = 'operators'
      ORDER BY ts DESC LIMIT 40`),
  notifsOps: db.prepare(`SELECT * FROM notifications WHERE scope IN ('operators','all')
      ORDER BY ts DESC LIMIT 40`),

  insAudit: db.prepare('INSERT INTO audit(actor,action,detail,mission_id,ts) VALUES(?,?,?,?,?)'),
  auditRecent: db.prepare('SELECT * FROM audit ORDER BY ts DESC, id DESC LIMIT 60'),
  auditFor: db.prepare('SELECT * FROM audit WHERE mission_id = ? ORDER BY ts, id'),
};

module.exports = { db, q, DB_PATH };
