'use strict';
/* Password hashing (scrypt) and session cookies. Node stdlib only. */
const crypto = require('node:crypto');
const { q } = require('./db');

const SESSION_DAYS = 14;

function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
}

function createUser({ email, name, password, role = 'subscriber' }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const id = 'usr_' + crypto.randomBytes(8).toString('hex');
  q.insUser.run(id, email.toLowerCase().trim(), name, hash(password, salt), salt,
                role, 'Fleet', 12, '[]', Date.now());
  return q.userById.get(id);
}

function verify(email, password) {
  const u = q.userByEmail.get(String(email || '').toLowerCase().trim());
  if (!u) return null;
  const given = Buffer.from(hash(password, u.salt), 'hex');
  const known = Buffer.from(u.pass_hash, 'hex');
  if (given.length !== known.length) return null;
  return crypto.timingSafeEqual(given, known) ? u : null;
}

function startSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  q.insSession.run(token, userId, now, now + SESSION_DAYS * 864e5);
  return token;
}

function userFromReq(req) {
  const raw = req.headers.cookie || '';
  const m = raw.match(/(?:^|;\s*)de_session=([a-f0-9]+)/);
  if (!m) return null;
  const s = q.session.get(m[1], Date.now());
  return s ? q.userById.get(s.user_id) : null;
}

function cookie(token) {
  const secure = process.env.COOKIE_SECURE === 'true' ? '; Secure' : '';
  return `de_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86400}${secure}`;
}
const clearCookie = () => 'de_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

module.exports = { createUser, verify, startSession, userFromReq, cookie, clearCookie, hash };
