# Drone Escorts — Business Model & Financial Model

**Version:** 1.0 · **Date:** 5 October 2026 · **Currency:** USD

> **Read this first.** Every number below is an **assumption**, not a forecast. They are internally
> consistent and defensible in a pitch, but each one is a hypothesis to be replaced with measured
> data from the pilot. The assumption tables are deliberately explicit so an investor can push on
> any single input and see what it does to the outcome. Do not present these as projections
> without saying what they rest on.

---

## 1. The central insight

Hardware-heavy escort service is **thin-margin at low utilisation and at low operator span of
control.** Everything strategic follows from this.

| Scenario | Utilisation | Drones per operator | Gross margin |
|---|---|---|---|
| Launch reality | 55% | 4 | **12%** |
| Operational maturity | 80% | 4 | **34%** |
| Phase-3 autonomy | 80% | 8 | **43%** |

**Autonomy is not a feature. It is the margin.** The pitch should say exactly this: we are not
raising to build a drone app, we are raising to climb a margin curve, and every phase of the
roadmap is a step up it. Investors reward a company that knows which variable it is optimising.

The second lever is equally important: **subscription revenue is recognised whether or not the
drone flies.** Allowance-based pricing means unflown allowance is pure margin, which is what makes
the blended business work long before autonomy arrives.

---

## 2. Value proposition by segment

| Segment | Pain | What they buy | Willingness to pay |
|---|---|---|---|
| **Individuals / families** | Fear on specific routes: school runs, night travel, rural roads | Peace of mind, a witness, an escalation path | Low per head, high volume |
| **Corporate executives** | Kidnap-for-ransom exposure; close protection is costly | A force multiplier for an existing protection detail | High |
| **Cash-in-transit & logistics** | Cargo loss, ambush on known routes, insurance premiums | Loss reduction and an evidence trail that moves premiums | **Highest and most rational** |
| **Security companies** | Differentiation; limited manpower | A platform they resell under their own brand | High, recurring |
| **Government / NGO convoys** | Election materials, relief supplies, VIP movement | Auditable route assurance | High, procurement-slow |

### The beachhead
**Cash-in-transit and high-value logistics.** Reasons it wins over consumer:

1. They already budget for escort — this displaces a cost line instead of creating one.
2. Routes are **fixed and repeated**, so airspace authorisation is obtainable per corridor rather
   than for the open world. This is the single biggest regulatory unlock.
3. Vehicles are owned fleets, so vehicle-mounted docks are installable at scale.
4. Loss events are measurable in currency, so ROI is arguable with a spreadsheet.
5. One signed contract puts 40 docks in the air; 40 consumers put 40 docks in 40 driveways.

Consumer is the long-term volume story and the brand, not the launch motion. Lead the deck with
logistics and let consumer be the expansion slide.

---

## 3. Revenue model

Four stacked streams — this is what makes it a platform rather than a service company.

### 3.1 Subscription (primary)

| Plan | Price / month | Included escorts | Overage | Target |
|---|---|---|---|---|
| **Personal** | $49 | 2 (≤ 45 min) | $29 | Individuals |
| **Family** | $89 | 5, up to 4 members | $25 | Households, dependants |
| **Business** | $399 / vehicle | 12 | $22 | Executives, SMEs |
| **Fleet** | $299 / vehicle (10+) | 20 | $18 | Logistics, cash-in-transit |
| **Security Co.** | $1,200 platform + $60 / drone | Unlimited (own drones) | — | White-label resellers |
| **Government / Enterprise** | Contract | Contract | — | Convoys, agencies |

Key design choices worth defending in a pitch:
- **Allowance, not unlimited.** Unlimited invites the worst-economics customer and destroys the
  utilisation model.
- **Per-vehicle, not per-seat, for Fleet.** It matches how the customer thinks about risk and it
  scales with the dock hardware.
- **Security Co. is platform-fee plus per-drone.** They supply capital and pilots; we supply
  software. This is the highest-margin line in the business and the fastest route to coverage.

### 3.2 Hardware
Dock and airframe sold or leased. Sold at ~15% margin — deliberately low, because hardware margin
is not the business and cheap docks accelerate network density. Lease at $280/month per vehicle
dock recovers capex in roughly 20 months and keeps the balance sheet cleaner for the customer.

### 3.3 Escorts Command licence
$1,200/month per SOC seat-bundle for security companies running their own operations centre.
Pure software margin; no flight hours consumed.

### 3.4 Evidence and reporting
Certified evidence bundles for insurance and legal use: $40 per incident export, or bundled in
Fleet and Enterprise contracts. Small line, strategically large — it is the hook for the insurance
partnership described in §7.

---

## 4. Unit economics: one drone, one month

### 4.1 Assumptions

| Input | Value | Note |
|---|---|---|
| Airframe + vehicle dock capex | $14,000 | Enterprise-grade, dock included |
| Useful life | 36 months | Straight-line depreciation |
| Missions per day at full use | 2.5 | 45 min average, plus charge and turnaround |
| Operating days per month | 26 | |
| **Capacity** | **65 missions/month** | 2.5 × 26 |
| Blended revenue per mission | $38 | Subscription allowance value + overage mix |
| Operator fully-loaded cost | $1,400/month | RPIC/SOC operator, launch market |
| Drones per operator (Phase 1–2) | 4 | Regulatory: one RPIC supervises a bounded number |

### 4.2 At launch — 55% utilisation, 4 drones per operator

| Line | Amount |
|---|---|
| Revenue (36 missions × $38) | **$1,368** |
| Depreciation ($14,000 / 36) | (389) |
| Operator supervision ($1,400 / 4) | (350) |
| Connectivity, ~20 GB/mission | (120) |
| Cloud: video egress, storage, inference | (95) |
| Maintenance & spares (8% of capex/yr) | (93) |
| Insurance: liability + hull | (110) |
| Regulatory, airspace fees, permits | (45) |
| **Total direct cost** | **(1,202)** |
| **Gross profit** | **$166** |
| **Gross margin** | **12%** |

This is the honest launch picture. Say it out loud in the pitch before an investor finds it.

### 4.3 At maturity — 80% utilisation, 4 drones per operator

| Line | Amount |
|---|---|
| Revenue (52 missions × $38) | **$1,976** |
| Depreciation | (389) |
| Operator supervision | (350) |
| Connectivity | (175) |
| Cloud | (140) |
| Maintenance & spares | (93) |
| Insurance | (110) |
| Regulatory | (45) |
| **Total direct cost** | **(1,302)** |
| **Gross profit** | **$674** |
| **Gross margin** | **34%** |

### 4.4 Phase 3 — 80% utilisation, 8 drones per operator

Autonomous takeoff, landing, return-to-dock and lock-on halve the supervision cost per airframe.

| Line | Amount |
|---|---|
| Revenue | **$1,976** |
| Operator supervision ($1,400 / 8) | (175) |
| All other direct costs (as §4.3) | (952) |
| **Gross profit** | **$849** |
| **Gross margin** | **43%** |

### 4.5 Sensitivity — gross margin by utilisation and span of control

| Drones / operator | 40% util. | 55% | 70% | 80% | 90% |
|---|---|---|---|---|---|
| 3 | (12)% | 4% | 20% | 27% | 32% |
| 4 | (1)% | 12% | 27% | 34% | 38% |
| 6 | 10% | 21% | 34% | 40% | 44% |
| 8 | 15% | 25% | 37% | 43% | 46% |

The two things to manage are therefore **route density** (which drives utilisation) and
**regulatory span of control** (which drives supervision cost). Nothing else in the cost stack
moves the number as much.

### 4.6 Software-only line (Security Co. white-label)

| Line | Amount / month |
|---|---|
| Platform fee | $1,200 |
| Per-drone fee × 20 drones | $1,200 |
| **Revenue** | **$2,400** |
| Cloud, telemetry, video | (310) |
| Support allocation | (240) |
| **Gross profit** | **$1,850** |
| **Gross margin** | **77%** |

One security-company account at 20 drones earns more gross profit than eleven owned drones at
launch utilisation, with zero capex. **This is the slide that should make an investor lean
forward**, and it argues for an asset-light partner-first strategy rather than owning a fleet.

---

## 5. Customer economics

| Metric | Personal | Fleet | Security Co. |
|---|---|---|---|
| ARPA / month | $49 | $299 / vehicle | $2,400 |
| Gross margin | 30% (blended) | 38% | 77% |
| Monthly churn (assumed) | 4.5% | 1.2% | 0.8% |
| Average life | 22 months | 83 months | 125 months |
| **LTV** | **$323** | **$9,432** | **$231,000** |
| CAC (assumed) | $95 | $4,200 | $38,000 |
| **LTV : CAC** | **3.4 : 1** | **2.2 : 1** | **6.1 : 1** |
| Payback | 7 months | 37 months | 21 months |

Note the tension this exposes: Fleet has the best strategic fit but the **worst payback**, because
enterprise sales cycles are long and dock installation is capex-adjacent. The resolution is to
sell Fleet through security companies rather than direct — the partner already owns the customer
relationship, which collapses CAC. That is a strategy conclusion falling directly out of the
numbers, and it is worth saying as such.

---

## 6. Three-year projection

### 6.1 Assumptions
- Single metropolitan launch market, expanding to three cities by end of Year 3.
- Partner-first: security companies are the primary channel from Year 2.
- Owned fleet stays deliberately small — enough for direct accounts and demos.
- Average active subscribers below year-end count because of in-year ramp.

### 6.2 Summary

| | **Year 1** | **Year 2** | **Year 3** |
|---|---|---|---|
| Subscribers (year-end) | 650 | 3,200 | 9,000 |
| Avg. active subscribers | 300 | 1,700 | 5,600 |
| Blended ARPA / month | $72 | $85 | $95 |
| Security-company accounts | 1 | 4 | 14 |
| Owned drones (year-end) | 15 | 70 | 190 |
| Fleet utilisation | 45% | 60% | 72% |
| **Subscription & mission revenue** | **$259k** | **$1.73M** | **$6.38M** |
| Platform / licence revenue | $29k | $115k | $403k |
| Hardware & evidence revenue | $42k | $168k | $512k |
| **Total revenue** | **$330k** | **$2.01M** | **$7.30M** |
| Gross margin | 18% | 31% | 40% |
| **Gross profit** | **$59k** | **$623k** | **$2.92M** |
| Headcount (year-end) | 14 | 34 | 72 |
| Operating expenses | $672k | $1.98M | $3.97M |
| **Net result** | **($613k)** | **($1.36M)** | **($1.05M)** |
| Cash burn / month (avg) | $51k | $113k | $88k |

**Breakeven:** gross profit covers opex during Q3 of Year 4 on these assumptions, driven by
utilisation passing 75% and the partner mix passing 50% of revenue. Do not claim Year 3
profitability — a deck that shows disciplined losses and a credible crossing point is more
believable than a hockey stick, and the crossing point here is defensible.

### 6.3 Operating expense detail (Year 2)

| Category | Annual |
|---|---|
| Engineering (12 people) | $780k |
| Flight operations & RPICs (8) | $310k |
| Sales & partnerships (5) | $290k |
| Regulatory, legal, compliance | $185k |
| G&A, finance, office | $155k |
| Marketing | $140k |
| Insurance (corporate) | $70k |
| Tooling, cloud (non-COGS) | $50k |
| **Total** | **$1.98M** |

Regulatory and legal at $185k is not padding. It is the line that buys the authorisations the
margin curve depends on, and it should be presented as a growth investment rather than overhead.

---

## 7. Strategic moats

Ranked by how hard each is to copy:

1. **Airspace authorisations per corridor.** Slow, expensive, relationship-driven, and therefore
   the most durable asset in the company. Every approved corridor is a competitor's 18-month delay.
2. **Dock network density.** Escort value is a function of how fast a drone reaches you. Density
   compounds and is capital-expensive to replicate.
3. **Insurance partnership.** Negotiate measured premium reductions for escorted cargo. This turns
   the insurer into a distribution channel and makes the product a discount rather than a cost —
   the strongest commercial position available to this business.
4. **Evidence chain of custody.** If mission records are accepted by courts and insurers, the
   platform becomes the system of record, and switching cost becomes institutional.
5. **Operational safety record.** Hours flown without incident is the thing procurement and
   regulators actually ask for, and it cannot be bought.

Notably, the AI models are **not** on this list. Computer vision is commoditising; detection
quality will not be the differentiator. The regulatory and physical network will be.

---

## 8. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Regulator refuses the follow-me flight envelope | **Critical** | Launch on fixed corridors with per-route authorisation; design VLOS-first so the product works without a waiver |
| A drone injures someone | **Critical** | Airframe hazard analysis, hull and liability cover, hard geofence and battery reserve enforced on the aircraft, RPIC always present |
| Platform blamed for failing to prevent a crime | High | Contractual positioning as observation and early warning, never protection; no promise of intervention; clear limitations in onboarding |
| Privacy backlash or ban on aerial recording | High | Biometrics off by default, bystander redaction, published transparency reporting, local engagement before launch |
| Utilisation never reaches 70% | High | Partner-first asset-light model; lease docks instead of buying; let partners carry airframe capex |
| Drone theft or loss | Medium | Dock locking, tracking, insurance, operational routing away from stop-and-wait |
| Jamming or GPS spoofing | Medium | Multi-GNSS, dead-reckoning fallback, link-loss return-to-dock |
| Incumbent security firms build it themselves | Medium | Sell to them instead of competing — the white-label line is the defensive and best-margin play |
| Misuse: a subscriber surveilling someone else | Medium | Escort only a consenting subject or own vehicle; third-party observation requires logged authorisation; abuse monitoring |

---

## 9. The raise

**Seeking $2.5M seed for 24 months of runway.**

| Use of funds | Amount | Share |
|---|---|---|
| Engineering: platform, Command, drone gateway | $900k | 36% |
| Flight operations, airframes, docks (30 units) | $620k | 25% |
| Regulatory, legal, certification, insurance | $380k | 15% |
| Go-to-market: partnerships, pilots | $350k | 14% |
| Working capital and reserve | $250k | 10% |

### Milestones the raise buys

| | Milestone |
|---|---|
| Month 3 | Investor prototype; two signed logistics pilot LOIs |
| Month 6 | First authorised corridor; first real escort flown with a licensed RPIC |
| Month 9 | Command dashboard live; first paying fleet customer |
| Month 12 | 15 drones operating; 650 subscribers; first security-company white-label signed |
| Month 18 | Phase 2 CV advisories in operator-review mode; insurance partnership in pilot |
| Month 24 | Three cities; 70 drones; $2M revenue run-rate; Series A on a 31% gross margin and a demonstrated path to 43% |

### What makes this fundable
The ask is not "fund a drone app." It is: **we have identified that this market's economics are
gated by two measurable variables — utilisation and supervision span — and we have a staged,
regulatorily realistic plan to move both, starting from a segment that already pays for escort
today.** That is a thesis, and a thesis is what gets funded.
