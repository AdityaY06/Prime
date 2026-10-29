# PRIME — Adaptive Training System

PRIME is a gamified adaptive training system — an RPG-style strength and endurance
coach wrapped around real training science. Workouts are raids. Progress is XP,
levels, and essence. The load model, recovery math, and nutrient panel are the
real thing.

## At a glance

- **App type:** single-page installable PWA (works offline, no account required)
- **Platform:** web / Android (TWA-ready) / add-to-home-screen iOS
- **Data:** local-first — everything lives in the user's own database; nothing is
  uploaded or tracked

## What it does

| Tab | Purpose |
| --- | --- |
| STATUS | Command console: level, XP, streak, readiness briefing, AI coach tip |
| GOALS | Daily quests, streaks, claims, essence payouts |
| TRAINING | Session raids: 6 gates, strength-standard grades, supersets, RIR, plate calculator, live BLE HR zones |
| BODY | Weight / body-fat / measurement history, muscle freshness model |
| FUEL | Macro + 39-nutrient micronutrition logging with completeness scoring |
| VITALS | Sleep, resting HR, HRV, BP (ACC/AHA zones), SpO2, readiness check-in |
| PROGRESS | PRs, progression, Foster AU / ACWR / CTL-ATL-TSB load console, deload advisor, CSV import & export |
| REWARDS | Essence vault, perk forge, badges |

## Training science inside

- Foster session load (RPE × minutes), acute:chronic workload ratio,
  fitness-fatigue impulse response (CTL / ATL / TSB)
- Strength-standard grade tables per lift, adjusted for bodyweight
- Readiness from sleep debt + resting-HR deviation vs 7-day baseline
- Deload advisor with evidence-based volume cut percentages
- 5-zone heart-rate model fed by Web Bluetooth chest straps (GATT 0x180D)

## Talking to other fitness apps

- **Import:** Strong / Hevy / PRIME CSV → dry-run preview → confirmed sessions
- **Export:** full archive or per-session CSV via Web Share API
- **Sensors:** BLE HR straps, GPS route recorder (haversine + auto-pause),
  battery and network telemetry

## For LLMs and crawlers

This markdown index exists so automated agents can understand the app without
rendering it. See `llms.txt` for the structured version. The application itself
is a single interactive page at `/` — there are no other HTML routes.

*Health content is educational, not medical advice. One reading is not a
diagnosis.*
