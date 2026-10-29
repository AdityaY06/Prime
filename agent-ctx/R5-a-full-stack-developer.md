# R5-a — Client-side offline mutation queue

Task: Build the offline queue system (localStorage persistence, FIFO replay on reconnect, floating queue-state badge) — the last unshipped R2 candidate.

## Files (strict 3-file ownership, respected)

1. **src/lib/offline-queue.ts** (NEW, plain TS — no "use client", every window/localStorage access guarded)
   - `QUEUE_STORAGE_KEY = "prime.offline-queue"`; `QueuedMutation { id, path, method, body, queuedAt }` (id via `crypto.randomUUID()` with timestamp+random fallback)
   - `getQueue()` — safe read/parse: corrupt JSON, non-array or wrong-shaped rows → empty/filtered out
   - `enqueueMutation(path, method, body)` → appends, persists, notifies subscribers, returns queue length
   - `subscribe(cb)` — listener registry + window "storage" event bridge (multi-tab count sync); returns unsubscribe
   - `removeById(id)` — no-op-safe drop used by the flush loop
   - `flushQueue()` → `{ synced, rejected }` — FIFO replay with `fetch(path, { method, headers: JSON, body })`; per item: 2xx → drop+count, 4xx → drop+collect server error message (parses `{error}` bodies like `api()` does, falls back to `SERVER REJECTED (status)`), fetch-throw or ≥500 → KEEP item + stop the round; per-item membership re-check + a localStorage flush lease (`prime.offline-queue.lock`, 12s TTL, per-item heartbeat) so two tabs never double-replay
   - `class OfflineQueuedError extends Error` — `readonly queued = true`, default message "OFFLINE — SAVED TO QUEUE, WILL AUTO-SYNC"

2. **src/hooks/use-api.ts** (MODIFIED — only `api()`, `useApi` byte-identical)
   - Mutating methods (`/^(POST|PUT|PATCH|DELETE)$/i`) + `navigator.onLine === false` → `enqueueMutation(...)` + `throw new OfflineQueuedError("OFFLINE — SAVED TO QUEUE (N PENDING), WILL AUTO-SYNC")` — the message rides callers' existing catch/toast paths. GETs pass through untouched (fail naturally).

3. **src/components/system/offline-indicator.tsx** (NEW, "use client", self-contained floating badge — NOT yet mounted; orchestrator adds it to page.tsx)
   - Position `fixed bottom-24 left-4 z-50 md:bottom-6` (above mobile bottom nav), `max-w-[calc(100vw-2rem)]`, `sys-label text-[10px]`, `rounded-sm border bg-black/70 backdrop-blur-sm`, `tabular-nums` counts, `role="status"` + `aria-live="polite"`, `min-h-11 min-w-11` button with `focus-visible:outline-violet-400/70`
   - State machine (priority syncing > offline > synced-flash > queued > hidden): OFFLINE amber "OFFLINE · N QUEUED" · QUEUED violet "N QUEUED — TAP TO SYNC" (whole badge is the button, enabled only when online+queued+idle → manual flush) · SYNCING teal "SYNCING N OPS…" + reduced-motion-guarded pulsing dot · SYNCED emerald flash "QUEUE SYNCED ✓" ~2.4s with rose "N REJECTED" second line when 4xx ops were dropped
   - Mount effects: "online"/"offline" listeners (useState, adopted in effect for hydration safety — `mounted` gate renders null pre-mount, badge enters via slide-in so nothing visible is lost); auto-flush on mount AND on "online" when count > 0; after flush → `bumpRefresh()` (system-store refreshKey, same as every panel) so data reloads; 4xx drops additionally push a `warn` notice with the server's first rejection message
   - Multi-tab: subscribe() storage events update the count; a cross-tab DECREASE while idle+online mirrors the emerald flash + bumps refresh in the watching tab too
   - framer-motion `AnimatePresence` entrance/exit slide+fade x −16↔0 on `FLOW_EASE` (imported from system/motion.tsx), `useReducedMotion` → duration 0 / no transform; tint rendered as an absolute overlay span over the black/70 base so bg layering never depends on CSS order

## Verification

- `/tmp`-style throwaway harness (run from /home/z, outside repo, deleted after): 21/21 checks PASS — corrupt JSON → [], FIFO order, verbatim body replay with JSON headers, 200/400/throw round (synced 1, rejected 1 msg, kept 4, stopped at throw), 500-first round (keeps all, 1 call), all-2xx drains, flush lease blocks + release drains, OfflineQueuedError message/queued flag, removeById no-op + wrong-shape filtering
- `bunx tsc --noEmit` → **0 errors in src/** (only pre-existing errors in `examples/` + `skills/`, untouched)
- `bunx eslint src/hooks/use-api.ts src/lib/offline-queue.ts src/components/system/offline-indicator.tsx` → **exit 0**, zero errors/warnings
- dev.log tail: clean compiles after my writes; the pr-drilldown `components/ui/dialog` module-not-found entries are historical (pre-R5, since fixed)
- No E2E possible for the badge itself (page.tsx mounting is the orchestrator's job, per strict ownership) — hence the harness above

## Deviations from spec (all deliberate, minimal)

- **Flush lease** (`prime.offline-queue.lock`) added inside `flushQueue()`: spec's storage-event multi-tab sync would otherwise let two tabs replay the same mutation twice on the same "online" event → double logs. Invisible to the API contract (`{synced, rejected}` unchanged).
- **"QUEUED — TAP TO SYNC" violet state**: spec's state machine didn't name the online+parked+idle state (reachable when a 5xx keeps items for retry, or when another tab holds the flush lease); violet = the app's interactive accent, and this is the only state where the badge is an enabled button.
- **`mounted` gate + `useState(true)` initial online**: literal `useState(navigator.onLine)` crashes on SSR (Next SSRs client components); the gate also guarantees hydration-safe null output — spec's intent (online/offline via useState + events) preserved.
- **Cross-tab flash/refresh mirror** (count-decrease handler): implements the spec's "so all tabs reload fresh data" for tabs that didn't run the flush themselves (bumpRefresh is per-tab zustand state).
- SYNCING shows the flush-start snapshot count ("SYNCING 5 OPS…") rather than live remaining — avoids a transient "SYNCING 0 OPS…" frame when the queue drains mid-round.
- 4xx rejections additionally surface as one system notice (`pushNotice` warn, first server message) — the toast mechanism the spec told me to study; the rose "N REJECTED" chip line remains the primary surface.
