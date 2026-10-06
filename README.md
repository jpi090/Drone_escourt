# Drone Escorts

Investor package and Phase 1 prototype for an AI-assisted aerial escort platform.

```
drone escort/
├── README.md
├── docs/
│   ├── SRS.md             Software requirements specification
│   ├── BUSINESS-MODEL.md  Unit economics, pricing, 3-year model
│   └── PITCH-DECK.md      14 slides with speaker notes
├── app/                   ◀ the functional application (start here)
│   ├── server/            Node backend: API, SSE, SQLite, mission engine
│   ├── public/            Client app
│   ├── test/              39 API integration tests
│   └── README.md
└── prototype/
    └── index.html         Original single-file demo (no install, no backend)
```

## Two versions

**`app/` — the functional application.** Real accounts, a database, server-authoritative mission
logic, live multi-user sync between subscriber and operator, and real GPS tracking from a phone.
Zero npm dependencies; Docker config included.

```bash
cd app && npm start      # then open http://localhost:3000
```

Create a subscriber account and an operator account, and open the operator in a second browser or
a private window — alerts cross between them live. `cd app && npm test` runs the test suite.
See [app/README.md](app/README.md) for the API, deployment, and an honest list of what is still
simulated.

**`prototype/index.html` — the original single-file demo.** No backend, no accounts, state resets
on reload. Double-click to open it. Still useful as a zero-setup demo on a laptop with no Node
installed, but `app/` supersedes it.

Both need an internet connection for map tiles (OpenStreetMap) and Leaflet.

## What is real, what is simulated

**Flight dynamics are simulated. The application logic is real.** Say this out loud in any demo.
In `app/` the logic additionally runs on a real server with a real database — the table below
describes both versions.

| Real | Simulated |
|---|---|
| Mission state machine and transitions | Aircraft physics and GPS |
| Pre-flight gate — launch is refused, not warned | Camera feed (synthetic renderer) |
| Battery-reserve enforcement overriding mission state | Battery discharge curve |
| Two-stage SOS with cancel window, and silent SOS | Weather and traffic inputs |
| Operator triage: acknowledge, escalate, resolve, SLA timer | Responder dispatch |
| Advisory provenance — source, confidence, confirmed vs not | Advisory detection |
| Append-only audit log attributing every action | |
| Mission record sealing and synchronised replay | |

### Demo script — 90 seconds

Steps below match `app/`; the single-file prototype follows the same flow without accounts.

1. **Subscriber** view. Pick a transport mode and position source. Note the pre-flight gate: switch
   the drone to `DE-203` and Launch is **disabled** — the airframe is due maintenance. The server
   refuses the request, not just the button. Switch back to `DE-114`.
2. **Launch Escort.** Pre-flight runs, the RPIC arms it, the drone lifts to altitude and takes a
   stand-off position ahead of the vehicle. Telemetry and live feed come up.
3. **Advisories fire** along the route. Open one: it carries its source, confidence, and whether a
   human confirmed it. The unconfirmed one is visually distinct and dashed on the map — the system
   never auto-classifies a person.
4. **Press SOS.** Five-second cancel window, then the alert goes out: operations centre, emergency
   contacts, protected recording, high-rate location.
5. **Switch to the operator window.** The alert is in the triage queue with an SLA timer running.
   Acknowledge → escalate. The hand-off is scoped, and the audit log shows every action attributed.
   Raise an advisory from the operator side and watch it reach the subscriber.
6. **Let it finish.** When battery reaches the 22% reserve floor the drone returns automatically,
   overriding the mission. The record seals; replay it from the Subscriber view.

The strongest moment in the demo is step 5: two different accounts, in two different browsers,
updating live off one server. That is the thing a slide cannot show.

## Reading the documents

Start with `PITCH-DECK.md`. The argument it makes:

> This market's economics are gated by two measurable variables — **utilisation** and
> **supervision span**. Gross margin runs 12% at launch, 34% at operational maturity, and 43% once
> autonomy raises drones-per-pilot. **Autonomy is not a feature, it is the margin**, and every
> phase of the roadmap is one step up that curve.

The corollary, in `BUSINESS-MODEL.md` §4.6: one white-label security-company account earns more
gross profit than eleven owned drones, at zero capex. That argues for an asset-light,
partner-first strategy rather than owning a fleet.

`SRS.md` §3 holds the regulatory constraints as **binding requirements** rather than disclaimers —
no autonomous criminal classification, biometrics off by default, an RPIC on every mission,
bystander redaction. These shape the architecture, and stating them unprompted is what makes the
product credible to an investor who knows the sector.

## Caveats

- Every financial figure is a stated **assumption**, not a forecast. The sensitivity table in
  `BUSINESS-MODEL.md` §4.5 exists so an investor can push on any input. Replace them with pilot data.
- Scope was deliberately cut from the original concept. Autonomous lock-on, facial recognition, and
  CV threat detection are specified as Phase 2–4 provisions behind authorisation-keyed feature
  flags, because none can be lawfully flown at launch in most jurisdictions.
- **No real drone is connected.** There is no MAVLink or DJI integration in either version. Flight
  is modelled in software. `app/README.md` lists every simulated part.
- `app/` is a working application but is not hardened for the open internet: no rate limiting, no
  CSRF tokens, no MFA, single-tenant, single-process. See its limitations section.

## Next steps

1. Fix the launch jurisdiction. It sets the Phase 1 flight envelope and unblocks everything else.
2. Get two logistics pilot LOIs — the beachhead case in `PITCH-DECK.md` slide 9.
3. Decide owned fleet vs partner-operated. The economics in §4.6 argue strongly for partner-first.
4. Scope the real build: Flutter client, NestJS + PostGIS backend, MAVLink drone gateway.
