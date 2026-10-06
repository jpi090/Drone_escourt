# Drone Escorts — Software Requirements Specification

**Version:** 1.0 (Phase 1 / MVP scope, with Phase 2–4 architecture provisions)
**Date:** 5 October 2026
**Status:** Draft for investor and engineering review

---

## 1. Introduction

### 1.1 Purpose
This document specifies the requirements for **Drone Escorts**, a Drone-as-a-Service (DaaS)
platform providing supervised aerial escort and route surveillance for people and vehicles on a
journey. It defines scope, actors, functional and non-functional requirements, the data model,
external interfaces, and the regulatory constraints that bound the product.

### 1.2 Scope of this release
Phase 1 (MVP) delivers an **operator-supervised, visual-line-of-sight (VLOS) escort** launched
from a vehicle-mounted or fixed dock, with live video, GPS follow-me, route recording, an
emergency SOS workflow, and automatic notification of a security operations centre (SOC).

Autonomous target lock-on, facial recognition, computer-vision threat detection, and multi-drone
coordination are **explicitly out of scope for Phase 1** and appear here only as architectural
provisions (§9), because each depends on regulatory authorisation that cannot be assumed at launch (§3).

### 1.3 Definitions
| Term | Meaning |
|---|---|
| Escort / Mission | One authorised flight accompanying a subject on a journey |
| Subject | The subscriber or vehicle being escorted |
| Dock | Charging and launch enclosure: vehicle-mounted, home, or hub |
| RPIC | Remote Pilot In Command — the legally responsible human pilot |
| SOC | Security Operations Centre staffed by operators |
| VLOS / BVLOS | Visual / Beyond Visual Line Of Sight |
| Lock-on | Continuous automated tracking of an identified subject |
| Mission Record | Immutable evidential bundle produced by a mission |

---

## 2. Overall description

### 2.1 Product perspective
Four products share one backend:

1. **Escorts Personal** — consumer and family mobile app.
2. **Escorts Fleet** — vehicle-mounted escorts for logistics, cash-in-transit, executives.
3. **Escorts Command** — SOC web dashboard for security companies and operators.
4. **Escorts Cloud** — flight management, telemetry, video, analytics, evidence custody.

### 2.2 Actors
| Actor | Description |
|---|---|
| **Subscriber** | Requests escorts, views live feed, triggers SOS |
| **Dependant** | A person escorted under another's account (child, elderly parent) |
| **Driver** | Operates a vehicle with a mounted dock; may launch |
| **Remote Pilot (RPIC)** | Legally accountable pilot; can assume manual control at any time |
| **SOC Operator** | Monitors missions, triages alerts, dispatches response |
| **Fleet Manager** | Corporate admin: vehicles, drivers, entitlements |
| **Maintenance Technician** | Airworthiness, firmware, battery cycle management |
| **Platform Admin** | Tenants, billing, roles, audit |
| **External Responder** | Police / EMS / private response; receives a scoped alert package |

### 2.3 Operating assumptions
- LTE/5G coverage along the escorted route, with graceful degradation when it drops.
- A qualified RPIC is assigned to every mission in Phase 1 and Phase 2.
- The drone **observes and records**; it never confronts, intercepts, or engages.

---

## 3. Regulatory and legal constraints (binding requirements)

These are requirements, not disclaimers. They shape the architecture.

- **RC-1** Every mission SHALL have a named RPIC on record before takeoff, and the RPIC SHALL be
  able to take manual control and terminate the flight within 2 seconds of input.
- **RC-2** The system SHALL NOT permit takeoff where the geofence engine cannot confirm that the
  launch point and projected route lie within airspace authorised for the mission's flight mode.
- **RC-3** BVLOS flight SHALL be gated behind a per-jurisdiction, per-operator authorisation
  record. Absent a valid record, the platform SHALL restrict missions to VLOS.
- **RC-4** Biometric identification of persons SHALL be disabled by default, SHALL be enabled only
  in jurisdictions where it is lawful, SHALL apply only to the consenting subscriber for
  self-identification, and SHALL NEVER be used to identify third parties.
- **RC-5** The system SHALL NOT autonomously classify a person as a criminal or a suspect. Any risk
  indication involving a person SHALL be presented to a human operator as an unverified
  observation requiring confirmation.
- **RC-6** Pursuit or persistent observation of a third party SHALL require an explicit, logged
  authorisation from law enforcement or a contracted security principal, with a hard time limit.
- **RC-7** Bystander footage SHALL be minimised: faces and plates of non-subjects SHALL be blurred
  in exported or shared media unless lawfully preserved as evidence.
- **RC-8** Subjects SHALL be able to see, export, and request deletion of their own mission data,
  subject to evidential and statutory retention holds.
- **RC-9** All data disclosure to third parties (including police) SHALL be logged with requester
  identity, legal basis, scope, and timestamp.
- **RC-10** Flight logs and mission records SHALL be retained for the period required by the
  governing civil aviation authority, and SHALL be tamper-evident.

---

## 4. Functional requirements — Phase 1 (MVP)

### 4.1 Identity and accounts
- **FR-1.1** Registration and sign-in via email, phone (OTP), Google, and Apple.
- **FR-1.2** Mandatory MFA for SOC Operator, Fleet Manager, RPIC, and Admin roles.
- **FR-1.3** Role-based access control; a user may hold roles in multiple tenants.
- **FR-1.4** Subscriber profile: identity, photo, vehicles, emergency contacts, optional encrypted
  medical notes, notification preferences, jurisdiction of residence.
- **FR-1.5** Dependant profiles managed by a guardian, with a consent record for escorting a minor.

### 4.2 Subscription and entitlement
- **FR-2.1** Plans with monthly escort allowances, overage pricing, and concurrency limits.
- **FR-2.2** Entitlement check SHALL run before mission creation; insufficient entitlement returns
  a priced upgrade or single-mission purchase option.
- **FR-2.3** Fleet plans attach entitlements to vehicles, not individuals.

### 4.3 Journey planning
- **FR-3.1** Create a journey: origin, destination, waypoints, mode (walk, bicycle, motorcycle,
  car, convoy), departure time (now or scheduled), notes.
- **FR-3.2** Return route options annotated with a **Route Advisory**: daylight remaining, weather,
  and any airspace restrictions crossed. (Crime-risk scoring is Phase 2.)
- **FR-3.3** Flag route segments where escort is not legally available, and show escort coverage as
  a per-segment overlay rather than an all-or-nothing promise.
- **FR-3.4** Share journey with chosen contacts: live link, ETA, arrival notification.

### 4.4 Drone assignment and launch
- **FR-4.1** Assignment considers dock proximity, battery state, airworthiness status, RPIC
  availability, geofence clearance, weather minima, and entitlement.
- **FR-4.2** Pre-flight checklist SHALL be completed and recorded: battery ≥ threshold, GNSS fix
  quality, compass/IMU health, camera, link quality, wind within limits, RPIC acknowledgement.
- **FR-4.3** One-tap **Launch Escort** from the subscriber app or the vehicle dock control, creating
  the mission in `pending_authorisation`; RPIC confirmation is required to arm.
- **FR-4.4** Launch SHALL be refused, with a human-readable reason, on any failed check.
- **FR-4.5** Vehicle dock: automatic charging, weatherproof lock, launch-when-safe interlock
  (refuse launch above a configured ground speed), auto-land and re-dock on return.

### 4.5 Escort flight and tracking
- **FR-5.1** Follow-me using the subject device's GNSS stream, with configurable stand-off distance
  and altitude, bounded by jurisdiction limits.
- **FR-5.2** Telemetry at ≥ 1 Hz: position, altitude, speed, heading, battery, link quality, GNSS
  satellite count, flight mode, camera state.
- **FR-5.3** Obstacle avoidance and altitude floor/ceiling enforcement.
- **FR-5.4** On link loss: hold, then Return-To-Dock after a configurable timeout; subject and SOC
  notified; mission state reflects the degradation.
- **FR-5.5** Battery-aware planning: continuously compute energy-to-return and SHALL initiate return
  before the reserve threshold is breached, regardless of mission state.
- **FR-5.6** RPIC manual override available at all times (RC-1).
- **FR-5.7** Pause / Resume / Return-To-Dock / Return-To-Vehicle commands.

### 4.6 Live video
- **FR-6.1** Low-latency live video to the subscriber app, vehicle display, and SOC (target < 1.5 s
  glass-to-glass at 720p).
- **FR-6.2** Adaptive bitrate; fall back to still frames at low bandwidth rather than dropping.
- **FR-6.3** Split view: video + map + telemetry.
- **FR-6.4** Stream access SHALL be access-controlled and logged (who watched, when).

### 4.7 Emergency SOS
- **FR-7.1** SOS available from the app, a lock-screen widget, the dock button, and a voice phrase.
- **FR-7.2** Two-stage trigger with a 5-second cancel window to limit false alarms; a long-press
  "silent SOS" bypasses confirmation and suppresses on-device audio and visual cues.
- **FR-7.3** On activation the system SHALL, within 10 seconds: persist an SOS record; begin
  continuous high-rate location reporting; start protected recording; notify SOC operators with an
  audible queue alert; notify emergency contacts; surface the live feed in Command.
- **FR-7.4** If no drone is airborne, attempt immediate launch where lawful and feasible, and
  escalate on the non-aerial path regardless.
- **FR-7.5** The drone SHALL maintain a safe stand-off, prioritise wide-area recording, and SHALL
  NOT descend into or illuminate a confrontation in a way that escalates risk.
- **FR-7.6** Operator acknowledgement, escalation, and resolution SHALL be timestamped. An
  unacknowledged SOS SHALL auto-escalate to the next operator tier after a configured interval.
- **FR-7.7** Cancellation requires subscriber authentication to prevent coerced cancellation; a
  duress code SHALL appear to cancel to the holder while keeping the alert live.

### 4.8 Alerts and notifications
- **FR-8.1** Push, SMS, and voice-call channels; SOS uses all channels with retry.
- **FR-8.2** Events: drone launched, escort started, battery threshold, route deviation, geofence
  breach, link loss, advisory raised, arrival, mission complete, SOS raised, responder dispatched,
  mission aborted.
- **FR-8.3** Delivery receipts SHALL be tracked; an undelivered SOS notification SHALL escalate.
- **FR-8.4** Alert-fatigue control: advisory-level events are rate-limited and digestible;
  safety-critical events are never suppressed.

### 4.9 Route advisories (Phase 1: data-driven, not vision-driven)
- **FR-9.1** Advisory levels **Green / Yellow / Orange / Red**, each with a defined meaning, a
  required operator action, and a required subscriber-facing recommendation.
- **FR-9.2** Phase 1 inputs: operator-reported incidents, published road and traffic data, weather,
  time of day, geofence and airspace notices, subscriber-reported events.
- **FR-9.3** Every advisory SHALL carry provenance: source, confidence, age, and whether a human
  confirmed it. Unconfirmed machine observations SHALL be visually distinct from confirmed ones.
- **FR-9.4** Safe-haven routing: nearest police post, hospital, fuel station, or partner safe point,
  with one-tap navigation.

### 4.10 Mission record, replay, and reporting
- **FR-10.1** Each mission produces a Mission Record: flight path, telemetry series, video, stills,
  advisories, alerts, operator actions, and a state timeline.
- **FR-10.2** Chain of custody: content-addressed media, append-only event log, signed manifest.
- **FR-10.3** Replay with synchronised map, telemetry, and video scrub.
- **FR-10.4** Post-mission report: route map, duration, distance, advisory summary, incident
  narrative, flight statistics, exportable evidence bundle.
- **FR-10.5** Bystander minimisation applied on export (RC-7).

### 4.11 Command (SOC) dashboard
- **FR-11.1** Live board: active missions, drones, subjects, advisories, open SOS, with map.
- **FR-11.2** Triage queue with SLA timers; acknowledge, escalate, assign, resolve, and notes.
- **FR-11.3** Drone health: battery, cycles, firmware, airworthiness, maintenance due.
- **FR-11.4** Scoped responder hand-off package: location, live link, subject description, consented
  medical note — and nothing beyond what the hand-off requires.
- **FR-11.5** Every operator action SHALL be attributed and logged.

### 4.12 Fleet and vehicle management
- **FR-12.1** Register vehicles: plate, make, model, colour, dock ID, assigned drivers.
- **FR-12.2** Driver launch permissions and per-vehicle escort policy.
- **FR-12.3** Convoy grouping: one mission covering multiple vehicles (single drone in Phase 1).

### 4.13 Administration
- **FR-13.1** Tenants, users, roles, entitlements, billing, and pricing configuration.
- **FR-13.2** Jurisdiction configuration: altitude limits, VLOS/BVLOS authorisation, biometric
  permissibility, retention periods, responder integrations.
- **FR-13.3** Immutable audit log with export, covering access to media and personal data.

---

## 5. Non-functional requirements

### 5.1 Safety
- **NFR-S1** Fail-safe default: on any ambiguity, the drone returns to dock.
- **NFR-S2** Independent geofence and battery-reserve enforcement on the airframe, not only in the
  cloud — a cloud outage SHALL NOT produce an unsafe aircraft.
- **NFR-S3** Flight-critical commands SHALL never depend on a single network path.
- **NFR-S4** Documented hazard analysis per airframe type before commercial deployment.

### 5.2 Performance
- **NFR-P1** Telemetry ingest-to-display ≤ 1 s p95; video ≤ 1.5 s p95 at 720p.
- **NFR-P2** SOS activation to operator audible alert ≤ 10 s p99.
- **NFR-P3** Launch decision (assignment + checks) ≤ 15 s p95.
- **NFR-P4** Command dashboard responsive at 500 concurrent missions per tenant.

### 5.3 Availability and resilience
- **NFR-A1** 99.9% monthly availability for mission-critical paths (SOS, telemetry, video).
- **NFR-A2** The mobile app SHALL queue SOS and location data offline and transmit on reconnect.
- **NFR-A3** Regional failover with no loss of in-flight mission state.
- **NFR-A4** Degraded mode: if video fails, telemetry and SOS SHALL continue to function.

### 5.4 Security
- **NFR-SE1** TLS 1.3 in transit; AES-256 at rest; per-tenant key separation.
- **NFR-SE2** Zero-trust service-to-service auth with short-lived credentials.
- **NFR-SE3** Drone command channel authenticated and replay-protected; no unauthenticated command
  acceptance under any fallback path.
- **NFR-SE4** Media access via short-lived, scoped, single-use URLs.
- **NFR-SE5** Annual third-party penetration test and airframe link-security review.
- **NFR-SE6** Secrets in a managed vault; no credentials in source or client bundles.

### 5.5 Privacy
- **NFR-PR1** Data minimisation and purpose limitation by design.
- **NFR-PR2** Default retention: telemetry 24 months, video 30 days unless flagged as incident
  evidence or under legal hold; configurable per jurisdiction.
- **NFR-PR3** Transparency: subscribers can see every mission in which they were recorded and every
  access to that media.
- **NFR-PR4** A privacy impact assessment is maintained per jurisdiction before launching there.

### 5.6 Usability and accessibility
- **NFR-U1** SOS reachable in one action from any screen, and without unlocking the phone.
- **NFR-U2** WCAG 2.2 AA for web; platform accessibility APIs honoured on mobile.
- **NFR-U3** Readable in direct sunlight and usable one-handed while moving; no critical control
  requires precise aim.
- **NFR-U4** Localisation-ready; English at launch.

### 5.7 Observability
- **NFR-O1** Distributed tracing across app, cloud, and telemetry pipeline.
- **NFR-O2** Operational SLOs with alerting on SOS-path latency and video health.
- **NFR-O3** Flight-data review workflow for every abort, link loss, and emergency landing.

---

## 6. Data model (core entities)

```
Tenant(id, name, type[personal|fleet|security_co|gov], jurisdiction, plan, status)
User(id, tenant_id, name, email, phone, photo, roles[], mfa_enabled, locale, created_at)
Subscriber(user_id, plan_id, escorts_remaining, emergency_contacts[], medical_note_enc,
           biometric_optin, consent_records[])
Dependant(id, guardian_user_id, name, device_id, consent_record_id)
Vehicle(id, tenant_id, plate, make, model, colour, dock_id, drivers[], beacon_id)
Dock(id, tenant_id, type[vehicle|home|hub], location, capacity, power_state, status)
Drone(id, tenant_id, model, serial, firmware, battery_cycles, airworthiness_status,
      home_dock_id, status[idle|preflight|airborne|returning|charging|maintenance|grounded])
Pilot(user_id, licence_no, licence_expiry, ratings[], jurisdictions[], on_duty)
Authorisation(id, tenant_id, jurisdiction, kind[vlos|bvlos|biometric|observation],
              reference, valid_from, valid_to, issued_by, document_uri)
Journey(id, subscriber_id, origin, destination, waypoints[], mode, scheduled_for,
        route_geom, eta, share_tokens[], status)
Mission(id, journey_id, drone_id, dock_id, rpic_user_id, state, flight_mode,
        started_at, ended_at, abort_reason, authorisation_id)
Telemetry(mission_id, ts, lat, lon, alt_m, speed_mps, heading, battery_pct, link_dbm,
          gnss_sats, mode)                                   # time-series store
MediaAsset(id, mission_id, kind[video|still], uri, content_hash, started_at, duration_s,
           redaction_state, retention_until, legal_hold)
Advisory(id, mission_id, level[green|yellow|orange|red], category, description, geom,
         source, confidence, human_confirmed_by, created_at, cleared_at)
SosAlert(id, mission_id, subscriber_id, location, triggered_at, trigger_source, silent,
         acknowledged_by, acknowledged_at, escalations[], resolved_at, outcome)
Notification(id, recipient_id, channel, event_type, payload, sent_at, delivered_at, read_at)
ResponderHandoff(id, sos_id, responder_org, scope[], legal_basis, shared_at, shared_by)
AuditEvent(id, tenant_id, actor_id, action, subject_ref, ip, ts, metadata)      # append-only
Subscription(id, tenant_id, plan, seats, price, billing_period, status, provider_ref)
```

Mission state machine:

```
requested -> pending_authorisation -> preflight -> launching -> escorting
          -> (paused | degraded) -> returning -> landed -> completed
          | rejected | aborted
```

Geospatial columns use PostGIS geography types. Telemetry is written to a time-series store
(TimescaleDB or equivalent) and summarised into the Mission Record on completion.

---

## 7. External interfaces

### 7.1 API surface (REST + WebSocket)
```
POST   /v1/journeys                      create journey, get route options + advisory
POST   /v1/journeys/{id}/escort          request escort -> mission in pending_authorisation
POST   /v1/missions/{id}/authorise       RPIC arms the mission
POST   /v1/missions/{id}/launch          commit launch after checklist
POST   /v1/missions/{id}/command         pause | resume | rtd | rtv | manual_handover
GET    /v1/missions/{id}                 mission detail + current state
GET    /v1/missions/{id}/record          mission record / evidence manifest
WS     /v1/missions/{id}/telemetry       1 Hz telemetry stream
GET    /v1/missions/{id}/stream-token    short-lived WebRTC token
POST   /v1/sos                           raise SOS (idempotency-key required)
POST   /v1/sos/{id}/ack                  operator acknowledge
POST   /v1/sos/{id}/escalate             escalate / hand off to responder
POST   /v1/sos/{id}/resolve              resolve with outcome
GET    /v1/fleet/drones                  fleet state
GET    /v1/advisories?bbox=              area advisories
POST   /v1/vehicles                      register vehicle + dock
GET    /v1/audit?from=&to=               audit export
```

Conventions: OAuth 2.1 bearer tokens, tenant scoping on every request, idempotency keys on all
state-changing calls, RFC 9457 problem details for errors, cursor pagination.

### 7.2 Drone and hardware interfaces
MAVLink 2 over a secured transport for PX4/ArduPilot airframes; vendor SDK adapters (e.g. DJI)
behind a common `FlightController` interface exposing `preflight()`, `arm()`, `takeoff()`,
`followTarget()`, `holdPosition()`, `returnToDock()`, `land()`, `abort()`, `telemetryStream()`,
`videoStream()`. MQTT for dock and telemetry transport. WebRTC for video.

### 7.3 Third-party services
Maps and routing; weather; push (FCM/APNs); SMS and voice; payments (Stripe, Paystack); object
storage; identity provider. Each sits behind an internal interface so a provider can be replaced
without touching domain logic.

---

## 8. Architecture (target production state)

```
 Mobile (Flutter)   Command Web (Next.js)   Vehicle Display
        \                   |                    /
         \------------ API Gateway -------------/
                            |
   +------------+-----------+------------+--------------+
 Identity   Journey &    Mission &    Advisory &    Notification
 & Billing  Routing      Flight Ops   Intelligence  & Escalation
   +------------+-----------+------------+--------------+
                            |
             Telemetry / Video / Evidence plane
          (MQTT ingest, TimescaleDB, WebRTC SFU, object store)
                            |
                 Drone Gateway  <--MAVLink/SDK-->  Airframes & Docks
```

An event backbone (Kafka or NATS) carries domain events. The audit log and Mission Record are built
from that stream — which is what makes the evidence trail tamper-evident rather than reconstructed.

---

## 9. Phase 2–4 provisions (not in Phase 1 scope)

| Capability | Phase | Gate that must clear first |
|---|---|---|
| CV object detection, operator-reviewed | 2 | Model validation; false-positive budget agreed with SOC |
| Vehicle recognition (plate/beacon) for lock-on | 2 | Lawful basis per jurisdiction; subscriber vehicles only |
| Crime-data risk scoring of routes | 2 | Data licensing; bias review; no per-person inference |
| Autonomous takeoff / land / RTD without RPIC input | 3 | Airframe reliability evidence; regulator sign-off |
| Autonomous target lock-on | 3 | BVLOS or extended-VLOS authorisation (RC-3) |
| Multi-drone coordination | 3 | Airspace deconfliction approval |
| Subscriber facial recognition (self-ID only) | 3 | RC-4 satisfied in that jurisdiction |
| City dock network, DaaS marketplace | 4 | Unit economics at target utilisation |
| Emergency-dispatch integration | 4 | Formal agreements with each authority |

Each sits behind a feature flag keyed to `Authorisation` records, so capability follows paperwork
automatically rather than by code change.

---

## 10. Acceptance criteria for Phase 1

The MVP is accepted when, on a closed test route with a licensed RPIC:

1. A subscriber launches an escort from a vehicle dock and sees live video and drone position on a
   map within 30 seconds of tap.
2. The drone holds follow-me on a vehicle at up to 60 km/h for 20 minutes at the configured
   stand-off, and re-acquires after a 15-second deliberate GPS dropout.
3. Battery reserve logic triggers return-to-dock unprompted and lands the aircraft safely.
4. SOS from a locked phone produces an audible SOC alert and delivered contact notifications within
   10 seconds, with the live feed on the Command board.
5. The operator acknowledges, escalates, and resolves the alert, and every action appears attributed
   in the audit log.
6. A launch is correctly refused when the dock sits inside a restricted geofence, with a clear
   reason shown to the user.
7. The Mission Record replays with synchronised map, telemetry, and video, and exports an evidence
   bundle whose manifest verifies against the stored media hashes.
8. Bystander faces and plates are blurred in the exported bundle.

---

## 11. Open questions

1. Launch jurisdiction and its specific VLOS rules — this sets the Phase 1 flight envelope.
2. Own the drones, or operate through licensed partner security companies at launch?
3. Airframe choice: COTS (faster, less control over the link) vs a PX4-based integration.
4. Insurance: liability per mission and hull cover — a material line in the unit economics.
5. Who employs the RPIC in the partner model, and therefore holds the legal liability.
