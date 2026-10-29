# R26-a — full-stack-developer — PLAY STORE ASSETS DROP

Work record for the Play Store submission-kit round (assets + docs only).
House rules honored: DB purity (read-only navigation), zero src/public/prisma changes,
single tsc discipline not applicable (no source edits), honest-UI in every written claim.

## Ground truth on arrival
- Worklog tail read (R20-a PWA, R21 import/GPS, R22 health-CSV + HRV, R23 GPX + coach,
  R24 HRV 4th pillar + coach strip, R25 session share card + deselect).
- `public/llms.txt` = the honest self-description (read first, matched in the listing).
- `src/app/manifest.ts` = Play-grade manifest (id/scope/start_url/display standalone/
  orientation portrait-primary/categories/3 shortcuts/3 icons incl. any+maskable).
- Baseline DB (read-only Prisma): KAEL L11 / xp 118 / totalXp 2943 / essence 356 / 77.5 kg,
  12 sessions / 11 logs / 31 metrics / 15 xpEvents. Dev server healthy on :3000.

## Deliverables (all NEW, nothing else touched)
1. `play-assets/screenshots/01-status.png … 08-rewards.png` — 8 real captures,
   390×844, 24-bit RGB PNG (no alpha — Play-native), 198–281 KB each, VLM 8/8 PASS.
   Captured via agent-browser session `r26a`: viewport set before load; bottom-nav
   navigation (`.grid-cols-8` uppercase text match); per-tab content polls before every
   shot (KAEL / DAILY ORDERS / gate names / BIOMASS / INTAKE / SIGNALS / EXPORT / VAULT);
   aria-current="page" verified per tab; +2 s settle; screenshot; close session.
   Eval lesson: `const` declarations persist across `eval` calls in one page world —
   use IIFEs (`(() => { … })()`) for every repeat script.
2. `play-assets/play-listing.md` — title (23 ch) / short (66 ch) / full (2,173 ch)
   description; claim-audit table (every bullet → disk evidence); category Health &
   Fitness; content rating Everyone + IARC reasoning; data-safety draft answers
   (no collection/sharing/ads/analytics verified by grep; AI-feature request-text
   nuance disclosed; deletion = user's own deployment DB; CSV/GPX/JSON/PNG exports);
   What's New v1.0; screenshot mapping table + upload order.
3. `play-assets/twa-packaging.md` — deploy prerequisite (+ honest SQLite persistence
   caveat: VPS/volume vs ephemeral hosts); manifest readiness audit (12 rows, ALL
   ✅ VERIFIED with live curl evidence; the assetlinks placeholder fingerprint is the
   one BY-DESIGN release step, not a gap); PWABuilder path; bubblewrap path (exact
   commands + prompt answers); Digital Asset Links (keytool SHA-256, exact JSON
   template, package-name sync rule — disk default com.prime.ascendant); Play Console
   checklist; closed-test reality (documented 20 testers / 14 days continuous for
   post-Nov-2023 personal accounts — the brief's "12" is not the documented number);
   post-release loop (same manifest id "/" → browser install + Play entry never fork).
4. `play-assets/README.md` — one-page index + deploy callout + upload order + provenance.

## Findings (documented, NOT fixed — constraints forbid edits)
- **llms.txt gate-count error:** `public/llms.txt` says "6 training gates"; `src/lib/gates.ts`
  ships exactly **5** (Cardio ×1.1, Strength ×1.25, Calisthenics ×1.2, Mobility ×1.0,
  Full Body ×1.6). The Play listing says FIVE (disk truth wins). One-word llms.txt fix
  owed to a future docs round.
- **Package-id fork risk:** brief suggested `com.prime.training`, disk assetlinks +
  README-TWA say `com.prime.ascendant`. Guide states the rule: pick one, mirror it in
  bubblewrap init AND assetlinks.json together.
- **Closed-test figure:** brief said 12 testers; documented Play policy is 20 testers
  / 14 days. Guide states 20/14 + "trust the Console panel".
- **DB file md5 shift** (e72868d8 → 02325d9f, same 274432 B): the R20-c-documented
  Prisma read-connection filesystem touch. Data level proven unchanged: counts
  12/11/31/15, hunter row byte-identical, Σ xpEvent.amount = 2943 = totalXp, latest
  session 2026-09-29, zero POSTs in dev.log during the round, no -wal/-shm.

## Verification ladder (as applicable to an assets round)
- Screenshots: dimensions/entropy/PNG-colorType scripted checks + VLM audit 8/8 PASS
  + per-tab DOM content probes + aria-current verification.
- Console during captures: only React DevTools info, HMR/Fast Refresh, documented
  THREE.Clock + recharts warnings; ZERO page errors. Session closed afterward.
- dev.log: capture window = GETs only, all 200; zero non-200s in the tail.
- Final curls: `/`, `/manifest.webmanifest`, `/sw.js`, all icons, assetlinks → 200.
- DB purity: read-only counts + hunter row + aggregates before AND after — identical.
- No tsc/eslint (no source changes, per spec). Git-tracked files untouched.

## Hand-off notes for the next round
- Compose the 1,024×500 feature graphic at release time from 01-status + the maskable
  icon (never fabricate now).
- Fix llms.txt "6 gates" → "5 gates" (one word) when a public/ round is authorized.
- After deploy: re-run the twa-packaging §1 audit curls against the real origin.
