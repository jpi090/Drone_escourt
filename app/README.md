# Drone Escorts — functional Phase 1 application

A real client/server application: accounts, a database, server-authoritative mission logic, live
multi-user sync, and real GPS tracking from a phone.

**Zero npm dependencies.** Node's standard library, its built-in SQLite, and Server-Sent Events.
There is nothing to install and no native build step.

## Run it

```bash
npm start
```

Open <http://localhost:3000>. Requires **Node 22.5 or newer** (for `node:sqlite`); built on 24.

Create one **subscriber** account and one **operator** account. Open the operator account in a
different browser or a private window — the two sessions are live-linked, so an alert raised by the
subscriber appears on the operator's board immediately.

```bash
npm test     # 39 API integration tests against a running server
```

## What is real

| | |
|---|---|
| **Accounts** | Registration, sign-in, scrypt-hashed passwords, HttpOnly session cookies, roles |
| **Database** | SQLite. Missions, telemetry, advisories, alerts, notifications, append-only audit |
| **Server-authoritative logic** | Every gate and safety rule lives on the server. The client cannot talk the aircraft into an unsafe state |
| **Pre-flight gate** | Entitlement, airframe availability, battery minimum, airworthiness. The server **refuses** the request — the disabled button is a courtesy, not the gate |
| **Battery reserve** | A hard 22% floor that forces return-to-dock and overrides mission state |
| **Real GPS** | `watchPosition` streams fixes to the server, which rejects implausible ones (>100 m accuracy, >1 km jumps) and marks the mission *degraded* after 25 s without a fix |
| **Live sync** | SSE push, scoped by role. Subscribers see only their own data; operators see the fleet |
| **SOS** | Two-stage with cancel window, silent variant, operator ack → escalate → resolve, SLA timing, 30 s auto-escalation |
| **Advisories** | Seeded along the route with provenance; operators can raise confirmed ones live |
| **Mission records** | Telemetry persisted and replayed from the server, not from browser memory |
| **Restart safety** | An in-flight mission is rehydrated and continues after a server restart |
| **Dock charging** | Docked airframes recharge; grounded ones do not |

## What is still simulated

Be straightforward about this in any demo.

- **The aircraft.** No airframe, no MAVLink, no DJI SDK. Flight dynamics are modelled server-side.
  Drone position is computed as a stand-off point ahead of the subject.
- **The camera.** A canvas renderer stands in for the video feed. WebRTC or RTSP drops into the
  same slot without touching mission logic.
- **Advisory detection.** Advisories are seeded and operator-raised, not detected by computer
  vision. This is deliberate — see RC-5 in the SRS.
- **Notifications** are in-app. No SMS, push, or voice provider is wired up.

### Position source

- **Simulated** — the server moves the subject along a generated route from your start point. Use
  this to demo on a desk.
- **Real GPS** — your device's actual position drives the mission. Use this in a vehicle or walking.

## Using real GPS on a phone

Browsers only expose geolocation on **HTTPS** or on `localhost`. Over plain HTTP on a LAN address
the browser will silently refuse, and the app will show "Location permission denied".

For a field demo, put it behind HTTPS:

```bash
# simplest: a tunnel with a public HTTPS URL
npx localtunnel --port 3000
```

Or deploy behind a reverse proxy (Caddy, nginx) with a certificate and set `COOKIE_SECURE=true`.

## Deploy

```bash
docker compose up --build
```

The database persists in the `escort-data` volume. Environment variables (`.env.example`):

| | |
|---|---|
| `PORT` | default 3000 |
| `DB_PATH` | default `./data/escorts.db` |
| `COOKIE_SECURE` | set `true` when serving over HTTPS |
| `CHARGE_PCT_PER_SEC` | dock charge rate, default 0.6 (full in ~3 min for demos) |

## API

```
POST /api/auth/register | /login | /logout        GET /api/me
GET  /api/state                                   bootstrap for the signed-in role
GET  /api/stream                                  SSE live events, role-scoped
GET  /api/preflight?drone=ID                      gate evaluation
POST /api/missions                                launch (runs the gate server-side)
GET  /api/missions/:id                            mission detail
POST /api/missions/:id/telemetry                  subject device posts a GPS fix
POST /api/missions/:id/command                    pause | resume | rtd | abort
GET  /api/missions/:id/record                     sealed record: telemetry, advisories, audit
POST /api/sos                                     raise (silent optional)
POST /api/sos/:id/ack | /escalate | /resolve      operator triage
POST /api/ops/advisories                          operator raises a confirmed advisory
GET  /api/ops/audit                               audit export
```

## Layout

```
app/
├── server/
│   ├── server.js    HTTP, REST, SSE hub, static hosting, role-scoped event filtering
│   ├── engine.js    mission state machine, safety rules, advisories, SOS, 1 Hz tick
│   ├── db.js        SQLite schema and prepared statements
│   ├── auth.js      scrypt passwords, sessions, cookies
│   └── geo.js       haversine, bearing, destination
├── public/          client: index.html, app.js, styles.css
├── test/            39 API integration tests
└── Dockerfile, docker-compose.yml
```

## Honest limitations

- **Single-process.** The mission tick runs in one Node process. Horizontal scaling needs the tick
  moved to a leader or a job runner; SSE clients would need a shared bus.
- **No rate limiting or CSRF tokens.** Sessions are `SameSite=Lax`, which covers the common case,
  but this is not hardened for the open internet.
- **No email verification, password reset, or MFA.** The SRS requires MFA for operator roles
  (FR-1.2); it is not implemented here.
- **Video and media storage** are not implemented, so the evidence chain of custody in the SRS
  (FR-10.2) is represented by the audit log and telemetry only.
- **One tenant.** Multi-tenancy is in the SRS data model but not enforced in code.

These are the gaps between a working prototype and a production system. Each is listed so nobody
discovers them in a demo.
