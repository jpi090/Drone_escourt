const BASE = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? (pass++, console.log('  PASS', m)) : (fail++, console.log('  FAIL', m)); };

function client() {
  let cookie = '';
  return async (path, method = 'GET', body) => {
    const res = await fetch(BASE + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const sc = res.headers.getSetCookie?.() || [];
    for (const c of sc) { const m = c.match(/de_session=([a-f0-9]*)/); if (m) cookie = 'de_session=' + m[1]; }
    let data = {}; try { data = await res.json(); } catch {}
    return { status: res.status, data };
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = Math.random().toString(16).slice(2, 8);

(async () => {
  const sub = client(), ops = client(), anon = client();

  console.log('\n[1] auth');
  let r = await sub('/api/auth/register', 'POST', { name: 'Test Subscriber', email: `sub${rnd}@t.io`, password: 'password123' });
  ok(r.status === 200 && r.data.user.role === 'subscriber', 'subscriber registers');
  r = await ops('/api/auth/register', 'POST', { name: 'K. Eze', email: `ops${rnd}@t.io`, password: 'password123', role: 'operator' });
  ok(r.status === 200 && r.data.user.role === 'operator', 'operator registers');
  r = await anon('/api/state');
  ok(r.status === 401, 'unauthenticated request is rejected');
  r = await sub('/api/auth/register', 'POST', { name: 'Dup', email: `sub${rnd}@t.io`, password: 'password123' });
  ok(r.status === 409, 'duplicate email rejected');
  r = await anon('/api/auth/login', 'POST', { email: `sub${rnd}@t.io`, password: 'wrongpass1' });
  ok(r.status === 401, 'wrong password rejected');

  /* A previous run leaves DE-114 flat and charging, so wait for the gate to clear.
     Otherwise the refusal assertions below match the wrong refusal reason. */
  process.stdout.write('\n  waiting for DE-114 to be flight-ready');
  for (let i = 0; i < 180; i++) {
    const g = await sub('/api/preflight?drone=DE-114');
    if (g.data.checks.every(c => c.ok)) break;
    process.stdout.write('.');
    await sleep(1000);
  }
  console.log('');

  console.log('\n[2] preflight gate');
  r = await sub('/api/preflight?drone=DE-203');
  ok(r.data.checks.some(c => !c.ok && /MAINTENANCE/.test(c.label)), 'grounded airframe fails the gate');
  r = await sub('/api/missions', 'POST', { droneId: 'DE-203', mode: 'car', source: 'sim', lat: 6.4478, lon: 3.4372 });
  ok(r.status === 422 && r.data.refused?.length, 'server refuses launch on a grounded airframe');
  r = await sub('/api/missions', 'POST', { droneId: 'DE-114', mode: 'car', source: 'gps' });
  ok(r.status === 422 && /airspace|position/i.test(r.data.refused.join()), 'launch without a position fix is refused');

  console.log('\n[3] launch + flight');
  r = await sub('/api/missions', 'POST', { droneId: 'DE-114', mode: 'car', source: 'sim', lat: 6.4478, lon: 3.4372, heading: 90 });
  ok(r.status === 200 && r.data.mission, 'launch accepted');
  const mid = r.data.mission.id;
  r = await sub('/api/missions', 'POST', { droneId: 'DE-087', mode: 'car', source: 'sim', lat: 6.4478, lon: 3.4372 });
  ok(r.status === 422, 'second concurrent mission refused');

  // wait for the climb to finish, then give it real travel time
  for (let i = 0; i < 40; i++) {
    r = await sub('/api/state');
    if (r.data.mission?.state === 'escorting') break;
    await sleep(1000);
  }
  await sleep(6000);
  r = await sub('/api/state');
  const m = r.data.mission;
  ok(m && m.state === 'escorting', `reached escorting (state=${m && m.state})`);
  ok(m.alt > 80, `climbed to altitude (${Math.round(m.alt)}m)`);
  ok(m.peak_m > 50, `subject moved (${Math.round(m.peak_m)}m)`);
  ok(m.drone_lat !== m.lat, 'drone holds stand-off ahead of subject');
  ok(r.data.advisories.length === 3, 'advisories seeded around the route');
  ok(r.data.advisories.some(a => a.confirmed === 0), 'an unconfirmed advisory exists');

  console.log('\n[4] operator visibility');
  r = await ops('/api/state');
  ok(r.data.activeMissions?.some(x => x.id === mid), 'operator sees the active mission');
  ok(Array.isArray(r.data.audit) && r.data.audit.length > 0, 'operator sees the audit log');
  r = await sub('/api/state');
  ok(r.data.audit === undefined, 'subscriber does NOT receive the audit log');

  console.log('\n[5] SOS');
  r = await sub('/api/sos', 'POST', { silent: false });
  const sosId = r.data.sos.id;
  ok(r.status === 200 && sosId, 'SOS raised');
  r = await sub(`/api/sos/${sosId}/ack`, 'POST');
  ok(r.status === 403, 'subscriber cannot acknowledge their own alert');
  r = await ops(`/api/sos/${sosId}/escalate`, 'POST');
  ok(!r.data.sos.escalated_at, 'cannot escalate before acknowledgement');
  r = await ops(`/api/sos/${sosId}/ack`, 'POST');
  ok(!!r.data.sos.ack_at, 'operator acknowledges');
  r = await ops(`/api/sos/${sosId}/escalate`, 'POST');
  ok(!!r.data.sos.escalated_at, 'operator escalates after ack');
  r = await ops(`/api/sos/${sosId}/resolve`, 'POST');
  ok(!!r.data.sos.resolved_at, 'operator resolves');

  console.log('\n[6] commands + authorisation');
  r = await sub(`/api/missions/${mid}/command`, 'POST', { command: 'pause' });
  ok(r.data.mission.state === 'paused', 'pause works');
  r = await sub(`/api/missions/${mid}/command`, 'POST', { command: 'resume' });
  ok(r.data.mission.state === 'escorting', 'resume works');
  r = await sub(`/api/missions/${mid}/command`, 'POST', { command: 'nonsense' });
  ok(r.status === 400, 'unknown command rejected');
  const other = client();
  await other('/api/auth/register', 'POST', { name: 'Nosy', email: `x${rnd}@t.io`, password: 'password123' });
  r = await other(`/api/missions/${mid}`);
  ok(r.status === 403, "another subscriber cannot read someone else's mission");
  r = await other(`/api/missions/${mid}/telemetry`, 'POST', { lat: 1, lon: 1 });
  ok(r.status === 403, 'only the subject device can post fixes');

  console.log('\n[7] telemetry + sealed record');
  r = await sub(`/api/missions/${mid}/record`);
  ok(r.data.telemetry.length > 3, `telemetry persisted (${r.data.telemetry.length} samples)`);
  ok(r.data.audit.length > 0, 'per-mission audit trail persisted');
  const t0 = r.data.telemetry[0];
  ok(t0.lat && t0.lon && t0.battery, 'telemetry rows carry position and battery');

  console.log('\n[8] battery reserve hard floor');
  const { q } = require('../server/db.js');
  const cur = q.mission.get(mid);
  q.updMission.run(cur.state, cur.alt, cur.speed, cur.heading, 22.3, cur.peak_m, cur.lat, cur.lon,
    cur.drone_lat, cur.drone_lon, 0, cur.recording, cur.elapsed_s, cur.dist_along, cur.last_fix_at, mid);
  await sleep(6000);
  r = await sub(`/api/missions/${mid}`);
  ok(r.data.mission.reserve_tripped === 1, 'reserve floor tripped');
  ok(r.data.mission.state === 'returning', 'reserve forced return regardless of mission state');

  console.log('\n[9] landing + record sealing');
  for (let i = 0; i < 40; i++) {
    r = await sub(`/api/missions/${mid}`);
    if (['landed', 'completed', 'aborted'].includes(r.data.mission.state)) break;
    await sleep(1000);
  }
  ok(['landed', 'completed'].includes(r.data.mission.state), `mission landed (state=${r.data.mission.state})`);
  r = await sub('/api/state');
  ok(r.data.mission === null, 'no active mission after landing');
  ok(r.data.history.some(h => h.id === mid), 'mission appears in history');
  r = await ops('/api/state');
  ok(!r.data.activeMissions.some(x => x.id === mid), 'operator board cleared the mission');

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH', e); process.exit(1); });
