"use client"

// ─── PRIME · SENSOR LINK hub (R20-b — Vitals tab, section 04) ─────────────────
// The app's first real hardware layer, one panel: BLE chest-strap HR (Web
// Bluetooth GATT 0x180D → live BPM + 5-zone readout + R22-b live HRV: the
// RR-intervals the 0x2A37 payload carries feed a rolling RMSSD estimate —
// the short-window HRV number Oura/Whoop ship), the FASTRACK WATCH bridge
// (R31-c — live wrist HR through the SAME GATT 0x180D pipe when the watch
// broadcasts the standard Heart Rate Service, plus the honest WATCH DAY
// SYNC lane that commits the Fastrack phone app's daily numbers into Body
// Metrics), the MAX HR override
// (persisted — wins over 220−age everywhere zones are computed), GPS link
// (read-only watchPosition) + ROUTE RECORDER (R21-c — the GPS watch feeds a
// store-backed recorder: live distance/pace/elapsed, auto-pause, stop →
// summary → one-tap LOG AS RAID through /api/gps-log, or EXPORT ROUTE · GPX
// — the universal track interchange, R30-b), and device
// battery/network telemetry. Every capability gap renders as an HONEST state
// (iOS Safari → unsupported note, denied geolocation → permission note,
// absent Battery API → "—", wrist device with no RR → the no-RR note), never
// a fake reading. The section mark (04 · LINK) is mounted by vitals-tab;
// this component owns the panel body.
//
// LIVE BPM: direct render, no count-up — live beats glide. The pulsing heart
// glyph's beat duration tracks the actual BPM (60/bpm seconds per cycle,
// framer-motion loop) and goes STATIC under reduced motion. Store writes are
// throttled to ≥1/s, so this panel re-renders at most once a second.
//
// R22-b HRV: the readout row is its own scoped component (StrapHrvReadout)
// so the 1 Hz no-RR watchdog tick re-renders ONLY that row — the hub's
// render cadence is untouched.
//
// R21-c RECORDER: state lives in the sensor store, so a recording SURVIVES
// tab switches (the hub unmounts, the track doesn't); points are in-memory
// only (see sensor-store persist discipline). Wake Lock is held while armed
// and re-requested on visibilitychange — best-effort, silent failure.
//
// R53-b (DECLUTTER — the R52 recipe): pairing/lane prose compressed to one
// sentence-case line each or folded into title attributes; the watch-sync
// field hints and the science citations ride titles; every flow (pairing,
// day sync, GPS, recorder, GPX export, telemetry) stays fully functional.
// R55-b (DECLUTTER ROUND 2 — the density bar): second pass — card headers
// keep their short names (CHEST LINK / GATT / BRIDGE · 2 LANES / lane labels
// ride titles), the long unsupported/idle prose folds to titles with one
// short honest line left, and the route-recorder intro rides the START
// RECORDING button's title. Same contract: merge & hide, zero flows touched.

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import {
  BatteryCharging,
  Bluetooth,
  BluetoothOff,
  CheckCircle2,
  Download,
  HeartPulse,
  Loader2,
  MapPin,
  Minus,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Signal,
  Square,
  Swords,
  Trash2,
  Upload,
  Watch,
} from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { FLOW_EASE } from "@/components/system/motion"
import { useSensors } from "@/store/sensor-store"
import { useSystem } from "@/store/system-store"
import { api } from "@/hooks/use-api"
import { OfflineQueuedError } from "@/lib/offline-queue"
import {
  WATCH_SYNC_FIELDS,
  clampSyncValue,
  isFastrackDevice,
  type WatchSyncField,
} from "@/lib/sensors/fastrack"
import { hrMaxFromBirthYear, zoneBounds, zoneFor } from "@/lib/sensors/hr-zones"
import { ema, formatDistance, formatElapsed, formatPace, paceMinPerKm, segmentSpeedMps } from "@/lib/sensors/gps-route"
import { formatHrv, HRV_MIN_INTERVALS } from "@/lib/sensors/hrv"
import { downloadTextFile } from "@/lib/export/csv"
import { cn } from "@/lib/utils"

// ── R30-b · GPX export button (route summary card) ─────────────────────

/**
 * "EXPORT ROUTE · GPX" — the route summary card's interchange artifact.
 * Enabled only when the frozen summary carries a real GPX track (2+ fixes);
 * a degenerate route renders the button DISABLED with the honest muted note —
 * never a file that pretends to be a route. Byte-honest size rides the label
 * (the export-center `{kb} KB` idiom — Blob-sized, not char-counted); the
 * download goes through the shared downloadTextFile helper (Blob →
 * objectURL → anchor, revoked on its 4s timeout — the export-center cleanup
 * discipline, reused verbatim). Scoped component: it re-renders on nothing —
 * the gpx string is frozen at stop.
 */
function GpxExportButton({ gpx, onDownload }: { gpx: string | null | undefined; onDownload: () => void }) {
  const sizeKb = typeof gpx === "string" ? `${(new Blob([gpx]).size / 1024).toFixed(1)} KB` : null
  const disabled = gpx == null
  return (
    <div>
      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        title={disabled ? "Route too short to export — needs 2+ GPS fixes" : undefined}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-400/60 bg-teal-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/35 hover:shadow-[0_0_22px_rgba(20,184,166,0.3)] active:bg-teal-500/50 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-teal-500/15 disabled:hover:shadow-none"
      >
        <Download className="h-3.5 w-3.5" aria-hidden />
        EXPORT ROUTE · GPX{sizeKb !== null ? ` · ${sizeKb}` : ""}
      </button>
      {/* R53-b declutter — the disabled note rides the button's title. */}
    </div>
  )
}

// ── Ambient minimal Screen Wake Lock typings (lib.dom ships none) ────────────

type ScreenWakeLockSentinel = { release: () => Promise<void> }
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<ScreenWakeLockSentinel> }
}

// ── R22-b · strap HRV readout (scoped: watchdog ticks re-render only this) ────

/** Grace before the honest no-RR note: BPM flowing this long with zero RR. */
const NO_RR_GRACE_MS = 10_000

/**
 * Live HRV · RMSSD row for the HR STRAP card. Reads hr.hrvMs (RMSSD over the
 * last 30 RR-intervals) + hr.hrvSamples off the sensor store — "—" until the
 * 5-interval honest floor is met (formatHrv, never a fake number). While the
 * link is live and NO RR-interval has arrived (most wrist devices never set
 * flags bit 4), a self-extinguishing 1 Hz watchdog ticks HERE — after the
 * grace window the zinc-500 honest-gap note lands ("NO RR FROM STRAP — HRV
 * NEEDS A CHEST SENSOR"), and the instant RR flows the ticker dies. This is a
 * readout, not a flow: nothing interactive, no new buttons.
 */
function StrapHrvReadout() {
  const hr = useSensors((s) => s.hr)
  const watching = hr.state === "live" && !hr.rrSeen
  const [watchTick, setWatchTick] = useState(() => Date.now())
  useEffect(() => {
    if (!watching) return
    const id = setInterval(() => setWatchTick(Date.now()), 1000)
    return () => clearInterval(id)
  }, [watching])
  const noRr = watching && hr.liveSinceAt !== null && watchTick - hr.liveSinceAt >= NO_RR_GRACE_MS
  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="sys-label text-[8px] text-violet-300/70">HRV · RMSSD</p>
          <p className="mt-1 font-mono text-3xl font-bold leading-none tabular-nums text-violet-200 text-glow-violet">
            {formatHrv(hr.hrvMs)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-[8px] tracking-[0.25em] text-zinc-400">MS</span>
          <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">{hr.hrvSamples} SAMPLES</span>
        </div>
      </div>
      {noRr ? (
        <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-500">
          No RR from strap — HRV needs a chest sensor.
        </p>
      ) : (
        hr.rrSeen &&
        hr.hrvSamples < HRV_MIN_INTERVALS && (
          <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-400">
            Collecting RR intervals — RMSSD floor {HRV_MIN_INTERVALS}.
          </p>
        )
      )}
    </div>
  )
}

// ── R31-c · Fastrack watch bridge (scoped card — form keystrokes re-render
//    only this component, never the whole hub) ────────────────────────────────

/** POST /api/metrics response shape the WATCH DAY SYNC lane consumes. */
type MetricPostRes = {
  metric: { day: string; type: string; value: number; unit: string }
  /** True when a sleep ≥ 7h POST auto-verified today's sleep directive. */
  questCompleted?: boolean
  /** Present when the first check-in vital of the day paid its +5 XP. */
  xpGranted?: number
}

/** Trimmed-string → finite-number parser (the vitals-tab parseNumeric idiom,
 * copied locally — the hub keeps its module boundary). */
function parseSyncValue(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * FASTRACK WATCH · WRIST LINK — the honest bridge, two lanes (violet family
 * where the strap card is rose):
 * · LIVE WRIST LINK — the store's ONE Web-Bluetooth HR pipe, shared with the
 *   chest-strap card above (connecting there reflects here too). While live:
 *   a compact BPM + zone line, the device name, and the Fastrack verdict —
 *   violet "FASTRACK LINKED" when the name carries Fastrack evidence, zinc
 *   "STANDARD HR LINK" otherwise (the pipe links ANY standard-HR wearable —
 *   said so, never faked).
 * · WATCH DAY SYNC — independent of Bluetooth, works everywhere: the four
 *   daily numbers the Fastrack app shows (steps / sleep / resting HR / SpO₂)
 *   typed by the hunter and committed as BodyMetric rows, from where
 *   readiness, health score and trends already consume them. Values start
 *   EMPTY — an unset row renders its placeholder, never a fabricated 0.
 */
function FastrackWatchCard({ birthYear }: { birthYear: number | null }) {
  const hr = useSensors((s) => s.hr)
  const maxHrOverride = useSensors((s) => s.maxHrOverride)
  const lastDeviceName = useSensors((s) => s.lastDeviceName)
  const connectStrap = useSensors((s) => s.connectStrap)
  const disconnectStrap = useSensors((s) => s.disconnectStrap)
  const retryStrap = useSensors((s) => s.retryStrap)
  const { pushNotice, bumpRefresh } = useSystem()

  // WATCH DAY SYNC form — strings while editing (free typing, NumRow idiom);
  // a field is FILLED once it parses to a finite number
  const [syncForm, setSyncForm] = useState<Record<string, string>>(() =>
    Object.fromEntries(WATCH_SYNC_FIELDS.map((f) => [f.metricId, ""])),
  )
  const [syncing, setSyncing] = useState(false)
  /** Out-of-range / server-error line — rose, in-card (the strap error idiom). */
  const [syncError, setSyncError] = useState<string | null>(null)

  const hrMax = maxHrOverride ?? hrMaxFromBirthYear(birthYear)
  const zone = hr.bpm !== null ? zoneFor(hr.bpm, hrMax) : null
  const fastrackLinked = isFastrackDevice(hr.deviceName, lastDeviceName)
  const filledCount = WATCH_SYNC_FIELDS.filter((f) => parseSyncValue(syncForm[f.metricId] ?? "") !== null).length

  const bumpField = (field: WatchSyncField, delta: number) => {
    const cur = parseSyncValue(syncForm[field.metricId] ?? "")
    if (cur === null) {
      // unset: a tap enters AT THE FLOOR — stepping starts from the range
      // bottom and the user adjusts up (or types the exact number)
      setSyncForm((s) => ({ ...s, [field.metricId]: String(field.min) }))
      setSyncError(null)
      return
    }
    const next = Math.min(field.max, Math.max(field.min, cur + delta))
    setSyncForm((s) => ({ ...s, [field.metricId]: String(next) }))
    setSyncError(null)
  }

  const commitSync = async () => {
    if (syncing || filledCount === 0) return
    // client-side mirror of the server's METRIC_RANGES — out-of-range → rose
    // hint, no request; the UI never sends a POST the server would reject
    const posts: { type: string; value: number }[] = []
    for (const f of WATCH_SYNC_FIELDS) {
      const v = parseSyncValue(syncForm[f.metricId] ?? "")
      if (v === null) continue
      const checked = clampSyncValue(f.metricId, v)
      if (checked === null) {
        setSyncError(`${f.label} OUT OF RANGE — ${f.min}–${f.max} ${f.unit}.`)
        return
      }
      posts.push({ type: f.metricId, value: checked })
    }
    if (posts.length === 0) return // belt — the button is disabled at zero
    setSyncing(true)
    setSyncError(null)
    try {
      // parallel is fine — the metrics route serializes its own XP decision.
      // No `day` in the body: a watch DAY sync lands on today, server-defaulted
      const responses = await Promise.all(
        posts.map((p) =>
          api<MetricPostRes>("/api/metrics", {
            method: "POST",
            body: JSON.stringify({ type: p.type, value: p.value }),
          }),
        ),
      )
      const sleepQuestCleared = responses.some((r) => r.questCompleted === true)
      const xp = responses.find((r) => r.xpGranted)?.xpGranted
      setSyncForm(Object.fromEntries(WATCH_SYNC_FIELDS.map((f) => [f.metricId, ""])))
      bumpRefresh()
      pushNotice({
        kind: "info",
        title: `WATCH DAY SYNCED · ${posts.length} METRIC${posts.length === 1 ? "" : "S"}`,
        body: sleepQuestCleared
          ? "SLEEP ≥ 7H — TODAY'S SLEEP DIRECTIVE CLEARED."
          : "FASTRACK APP NUMBERS → BODY METRICS · READINESS · TRENDS.",
      })
      if (xp) pushNotice({ kind: "xp", title: `+${xp} XP`, body: "Vitals check-in" })
    } catch (e) {
      if (e instanceof OfflineQueuedError) {
        // every POST was parked BEFORE the throw — the queue replays them FIFO
        // on reconnect, so the form resets honestly (the data is committed to
        // the queue, not lost)
        setSyncForm(Object.fromEntries(WATCH_SYNC_FIELDS.map((f) => [f.metricId, ""])))
        pushNotice({
          kind: "warn",
          title: "OFFLINE — SYNC QUEUED",
          body: "POSTS REPLAY AUTOMATICALLY WHEN THE LINK RETURNS.",
        })
      } else {
        // server message, rose, in-card — the strap-card error-line idiom
        setSyncError((e as Error).message.toUpperCase())
      }
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div
      className="rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5"
      title="Bridge your Fastrack — live HR from the wrist, daily numbers from the Fastrack app. Data flow: the Fastrack watch syncs to the Fastrack phone app over Bluetooth, and its daily numbers are committed into PRIME body metrics."
    >
      {/* R55-b declutter — "WRIST LINK" + "BRIDGE · 2 LANES" chrome stood down:
          the bridge prose + the FASTRACK_PIPELINE diagram line already ride
          this card's title attribute, and each lane labels itself below. */}
      <span className="sys-label text-violet-300/90">FASTRACK WATCH</span>

      {/* ── lane 1 · LIVE WRIST LINK (the shared BLE pipe) ─────────────── */}
      {/* R55-b declutter — the lane's own label stood down; its meaning rides
          the lane div's title and the LINK WRIST DEVICE button below. */}
      <div
        className="mt-3"
        title="Live wrist link — the shared Bluetooth HR pipe (connecting the chest strap reflects here too)"
      >
        {hr.state === "unsupported" && (
          <div className="mt-2 flex items-start gap-2.5">
            <BluetoothOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
            <p
              className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-400"
              title="Live link needs Chrome, Edge or Samsung Internet — Safari on iOS can’t link a watch. Day sync below works everywhere."
            >
              Live link unsupported — day sync below.
            </p>
          </div>
        )}

        {hr.state === "idle" && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => void connectStrap()}
              title="Links watches that broadcast the standard Bluetooth HR service — one live link, shared with the chest strap above. Many Fastrack Reflex models broadcast it during workout mode."
              className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Watch className="h-4 w-4" aria-hidden />
              LINK WRIST DEVICE
            </button>
          </div>
        )}

        {hr.state === "connecting" && (
          <div className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/40 bg-violet-500/10 font-mono text-xs font-bold tracking-[0.25em] text-violet-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> LINKING…
          </div>
        )}

        {hr.state === "live" && (
          <div className="mt-2">
            <p className="font-mono text-sm tabular-nums tracking-[0.08em] text-violet-100">
              LIVE · {hr.bpm ?? "—"} BPM
              {zone && (
                <>
                  {" · "}
                  <span className={zone.colorClass}>{zone.id}</span>
                </>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              {hr.deviceName && (
                <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                  {hr.deviceName.toUpperCase()}
                </span>
              )}
              <span
                className={cn(
                  "rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                  fastrackLinked
                    ? "border-violet-400/50 bg-violet-500/10 text-violet-200"
                    : "border-zinc-600/60 bg-zinc-800/40 text-zinc-400",
                )}
              >
                {fastrackLinked ? "FASTRACK LINKED" : "STANDARD HR LINK"}
              </span>
            </div>
            <button
              type="button"
              onClick={disconnectStrap}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/50 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-violet-500/50 hover:text-violet-300 active:border-violet-500/70 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              DISCONNECT
            </button>
          </div>
        )}

        {hr.state === "error" && (
          <div className="mt-2">
            <p
              role="alert"
              title="Web Bluetooth requires a user gesture for every reconnect."
              className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-rose-300/90"
            >
              {hr.error ?? "LINK FAILED"} — tap retry to reconnect.
            </p>
            <button
              type="button"
              onClick={() => void retryStrap()}
              className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-rose-400/60 bg-rose-500/20 font-mono text-xs font-bold tracking-[0.25em] text-rose-100 uppercase transition-all hover:bg-rose-500/40 active:bg-rose-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              RETRY LINK
            </button>
          </div>
        )}
      </div>

      {/* ── lane 2 · WATCH DAY SYNC (Bluetooth-free, works everywhere) ─── */}
      <div className="mt-3 border-t border-zinc-700/40 pt-3">
        <p
          className="sys-label text-[8px] text-violet-300/70"
          title="Type today's numbers from the Fastrack app — they land in Body Metrics and feed readiness, health score and trends."
        >
          WATCH DAY SYNC
        </p>

        <div className="mt-2.5 space-y-2.5">
          {WATCH_SYNC_FIELDS.map((f) => {
            const raw = syncForm[f.metricId] ?? ""
            const cur = parseSyncValue(raw)
            const atMin = cur !== null && cur <= f.min
            const atMax = cur !== null && cur >= f.max
            return (
              <div key={f.metricId} title={f.hint}>
                <div className="flex items-center gap-2">
                  <span className="w-20 shrink-0 font-mono text-[9px] tracking-[0.2em] text-zinc-400">{f.label}</span>
                  <button
                    type="button"
                    aria-label={`Decrease ${f.label}`}
                    onClick={() => bumpField(f, -f.step)}
                    disabled={cur === null || atMin}
                    className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-zinc-700/60 disabled:hover:text-zinc-400"
                  >
                    <Minus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={raw}
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    aria-label={`${f.label} in ${f.unit}`}
                    placeholder={f.placeholder}
                    onChange={(e) => {
                      setSyncForm((s) => ({ ...s, [f.metricId]: e.target.value }))
                      setSyncError(null)
                    }}
                    className="h-11 min-w-0 flex-1 rounded-sm border border-zinc-700/60 bg-zinc-950/70 px-1 text-center font-mono text-sm tabular-nums text-violet-100 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
                  />
                  <button
                    type="button"
                    aria-label={`Increase ${f.label}`}
                    onClick={() => bumpField(f, f.step)}
                    disabled={atMax}
                    className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-zinc-700/60 disabled:hover:text-zinc-400"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  {f.unit.toUpperCase() !== f.label.toUpperCase() && (
                    <span className="w-8 shrink-0 font-mono text-[9px] tracking-wider text-zinc-400">{f.unit}</span>
                  )}
                </div>
                {/* R53-b declutter — the per-field Fastrack-app hint rides the
                    row's title attribute above. */}
              </div>
            )
          })}
        </div>

        {syncError && (
          <p role="alert" className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-rose-300/90">
            {syncError}
          </p>
        )}

        <button
          type="button"
          onClick={() => void commitSync()}
          disabled={syncing || filledCount === 0}
          title="Sleep ≥ 7h also clears today's sleep directive. Steps/sleep do not grant check-in XP — no double-counting."
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-violet-500/20 disabled:hover:shadow-none"
        >
          {syncing ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> SYNCING…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden /> COMMIT SYNC
            </>
          )}
        </button>
        {/* R53-b declutter — the sleep-directive / no-double-count note rides
            the commit button's title above. */}
      </div>
    </div>
  )
}

export function SensorHub({ birthYear }: { birthYear: number | null }) {
  const reduce = useReducedMotion()
  const hr = useSensors((s) => s.hr)
  const gps = useSensors((s) => s.gps)
  const device = useSensors((s) => s.device)
  const maxHrOverride = useSensors((s) => s.maxHrOverride)
  const lastDeviceName = useSensors((s) => s.lastDeviceName)
  const probe = useSensors((s) => s.probe)
  const connectStrap = useSensors((s) => s.connectStrap)
  const disconnectStrap = useSensors((s) => s.disconnectStrap)
  const retryStrap = useSensors((s) => s.retryStrap)
  const refreshDeviceTelemetry = useSensors((s) => s.refreshDeviceTelemetry)
  const startGps = useSensors((s) => s.startGps)
  const stopGps = useSensors((s) => s.stopGps)
  const setMaxHrOverride = useSensors((s) => s.setMaxHrOverride)

  // R21-c — route recorder (store-backed: survives tab switches by design)
  const route = useSensors((s) => s.route)
  const routeSummary = useSensors((s) => s.routeSummary)
  const startRoute = useSensors((s) => s.startRoute)
  const stopRoute = useSensors((s) => s.stopRoute)
  const resetRoute = useSensors((s) => s.resetRoute)

  // local recorder UI state (log flow, inline discard confirm, live tick)
  const [tickMs, setTickMs] = useState(() => Date.now())
  const [logPhase, setLogPhase] = useState<"idle" | "logging" | "done" | "error">("idle")
  const [logError, setLogError] = useState<string | null>(null)
  const [loggedXp, setLoggedXp] = useState<number | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const wakeLockRef = useRef<ScreenWakeLockSentinel | null>(null)

  // capability truth + persist rehydrate + telemetry refresh (house
  // hydrate-after-mount pattern — SSR markup stays stable)
  useEffect(() => {
    probe()
  }, [probe])

  const hrMax = maxHrOverride ?? hrMaxFromBirthYear(birthYear)
  const age = birthYear !== null ? new Date().getFullYear() - birthYear : null
  const segments = useMemo(() => zoneBounds(hrMax), [hrMax])
  const zone = hr.bpm !== null ? zoneFor(hr.bpm, hrMax) : null

  const bumpMaxHr = (delta: number) => {
    // the stepper always writes the OVERRIDE (seeding from the derived max)
    setMaxHrOverride(hrMax + delta)
  }

  // ── R21-c route recorder wiring ────────────────────────────────────────────

  /** Best-effort haptic tick — no-op where vibration is unsupported. */
  const vibrate = (pattern: number) => {
    try {
      ;(navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(pattern)
    } catch {
      // vibration unsupported — silent no-op
    }
  }

  const startRecording = () => {
    if (gps.state === "denied" || gps.state === "unsupported") return
    vibrate(30)
    setLogPhase("idle")
    setLogError(null)
    setLoggedXp(null)
    setConfirmDiscard(false)
    // the recorder rides the SAME watchPosition the card already owns — arming
    // it here (re)starts the watch if the read-only link wasn't live yet
    if (gps.state !== "live") startGps()
    startRoute()
  }

  const stopRecording = () => {
    if (route.state === "idle") return
    vibrate(30)
    setConfirmDiscard(false)
    // the read-only GPS watch keeps running — it's the user's link, not ours
    stopRoute()
  }

  const discardRoute = () => {
    vibrate(30)
    setConfirmDiscard(false)
    setLogPhase("idle")
    setLogError(null)
    resetRoute()
  }

  // R30-b — GPX download: the filename carries the ROUTE's own start moment
  // (prime-route-YYYYMMDD-HHmm.gpx — the artifact is of that run, not of the
  // export tap); the shared downloadTextFile helper does the Blob →
  // objectURL → anchor dance and revokes the URL on its 4s timeout.
  const downloadGpx = () => {
    if (routeSummary === null || routeSummary.gpx == null) return // belt — the button is disabled
    const d = new Date(routeSummary.startedAt)
    const pad = (n: number) => String(n).padStart(2, "0")
    const filename = `prime-route-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.gpx`
    vibrate(30)
    downloadTextFile(filename, routeSummary.gpx, "application/gpx+xml")
  }

  const logAsRaid = async () => {
    if (routeSummary === null || logPhase === "logging") return
    setLogPhase("logging")
    setLogError(null)
    try {
      const res = await fetch("/api/gps-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startedAt: new Date(routeSummary.startedAt).toISOString(),
          durationMin: Math.max(1, Math.round(routeSummary.elapsedMs / 60000)),
          distanceM: Math.round(routeSummary.distanceM),
          paceLabel: formatPace(paceMinPerKm(routeSummary.distanceM, routeSummary.elapsedMs)),
        }),
      })
      const data = (await res.json().catch(() => null)) as { ok?: boolean; xp?: number; error?: string } | null
      if (!res.ok || !data?.ok) {
        throw new Error(typeof data?.error === "string" && data.error !== "" ? data.error : "LOG FAILED")
      }
      setLoggedXp(typeof data.xp === "number" ? data.xp : null)
      setLogPhase("done")
      resetRoute()
      vibrate(30)
    } catch (e) {
      setLogPhase("error")
      setLogError((e as Error).message.toUpperCase())
    }
  }

  // live elapsed ticks once a second while armed — the STORE value is the
  // honest moving-time; this only adds the wall-time tail since the last fix
  useEffect(() => {
    if (route.state !== "recording") return
    const id = setInterval(() => setTickMs(Date.now()), 1000)
    return () => clearInterval(id)
  }, [route.state])

  // Wake Lock while a route is armed: request on arm, release on stop/unmount,
  // re-request when the tab becomes visible again — every step best-effort
  // and silent (a browser that refuses wake lock still records the route).
  const routeActive = route.state !== "idle"
  useEffect(() => {
    if (!routeActive) return
    let cancelled = false
    const request = async () => {
      try {
        const nav = navigator as WakeLockNavigator
        if (!nav.wakeLock) return
        const sentinel = await nav.wakeLock.request("screen")
        if (cancelled) {
          void sentinel.release().catch(() => {})
          return
        }
        wakeLockRef.current = sentinel
      } catch {
        // wake lock refused — silent, the recorder doesn't need it
      }
    }
    void request()
    const onVisibility = () => {
      if (document.visibilityState === "visible" && useSensors.getState().route.state !== "idle") void request()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", onVisibility)
      const sentinel = wakeLockRef.current
      wakeLockRef.current = null
      if (sentinel) void sentinel.release().catch(() => {})
    }
  }, [routeActive])

  // live derivations (store numbers + the ticking tail)
  const lastFixT = route.points.length > 0 ? route.points[route.points.length - 1].t : route.startedAt
  const liveElapsedMs =
    route.elapsedMs + (route.state === "recording" && lastFixT !== null ? Math.max(0, tickMs - lastFixT) : 0)
  const livePace = paceMinPerKm(route.distanceM, liveElapsedMs)
  // EMA-smoothed speed (α≈0.3) over the derived segment speeds — recomputed
  // from the fix log each render, so it is always fresh and deterministic
  const liveSpeed = useMemo(() => {
    let smoothed: number | null = null
    for (let i = 1; i < route.points.length; i++) {
      const v = segmentSpeedMps(route.points[i - 1], route.points[i])
      if (v !== null) smoothed = ema(smoothed, v)
    }
    return smoothed
  }, [route.points])
  const summaryPace = routeSummary !== null ? paceMinPerKm(routeSummary.distanceM, routeSummary.elapsedMs) : null
  const loggable = routeSummary !== null && routeSummary.pointCount > 0 && routeSummary.distanceM >= 10

  return (
    <SystemPanel
      label="Sensor Link"
      labelAccent={
        hr.state === "live" ? (
          <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-rose-300">
            <span className="sys-pulse h-1.5 w-1.5 rounded-full bg-rose-400" aria-hidden /> LIVE
          </span>
        ) : undefined
      }
    >
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* ── HR STRAP · BLE chest link ─────────────────────────────────── */}
        <div className="rounded-sm border border-rose-400/25 bg-rose-500/5 p-3.5">
          {/* R55-b declutter — "CHEST LINK" + "GATT 0x180D" chrome rides the
              label's title; the card keeps its short name. */}
          <span
            className="sys-label text-rose-200/90"
            title="Chest-strap link — Bluetooth GATT heart-rate service 0x180D"
          >
            HR STRAP
          </span>

          {hr.state === "unsupported" && (
            <div className="mt-2.5 flex items-start gap-2.5">
              <BluetoothOff className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              <p
                className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-400"
                title="Needs a Web-Bluetooth browser (Chrome, Edge or Samsung Internet) — Safari on iOS can’t link chest straps."
              >
                Needs Chrome, Edge or Samsung Internet.
              </p>
            </div>
          )}

          {hr.state === "idle" && (
            <div className="mt-2.5">
              <button
                type="button"
                onClick={() => void connectStrap()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Bluetooth className="h-4 w-4" aria-hidden />
                CONNECT STRAP
              </button>
              {lastDeviceName && (
                <p className="mt-2 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                  LAST LINK: {lastDeviceName.toUpperCase()}
                </p>
              )}
            </div>
          )}

          {hr.state === "connecting" && (
            <div className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/40 bg-violet-500/10 font-mono text-xs font-bold tracking-[0.25em] text-violet-200">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> LINKING…
            </div>
          )}

          {hr.state === "live" && (
            <div className="mt-3">
              <div className="flex items-center gap-3">
                {/* the beat tracks the real BPM — one pulse per cardiac cycle
                    (60/bpm seconds); static under reduced motion */}
                <motion.span
                  aria-hidden
                  animate={reduce ? undefined : { scale: [1, 1.16, 1] }}
                  transition={
                    reduce
                      ? undefined
                      : {
                          duration: hr.bpm && hr.bpm > 0 ? 60 / hr.bpm : 1.2,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }
                  }
                  className="inline-flex"
                >
                  <HeartPulse className="h-8 w-8 text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                </motion.span>
                <p className="font-mono text-5xl font-bold leading-none tabular-nums text-rose-100 text-glow-rose">
                  {hr.bpm ?? "—"}
                </p>
                <div className="ml-auto flex flex-col items-end gap-1.5">
                  <span className="font-mono text-[8px] tracking-[0.25em] text-zinc-400">BPM</span>
                  {zone && (
                    <span
                      className={cn(
                        "rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                        zone.chipClass,
                      )}
                    >
                      {zone.id} · {zone.label}
                    </span>
                  )}
                </div>
              </div>

              {/* 5-segment zone bar — segments sized by the %HRmax bounds,
                  the active zone lit in its color, the rest zinc-700 */}
              <div
                className="mt-3 flex h-1.5 gap-1"
                role="img"
                aria-label={`Heart-rate zone bar — 5 zones from ${segments[0].lo} to ${segments[segments.length - 1].hi} beats per minute${zone ? `, currently ${zone.id} ${zone.label}` : ""}`}
              >
                {segments.map((seg) => (
                  <span
                    key={seg.zone.id}
                    style={{ flexGrow: seg.weight }}
                    className={cn(
                      "h-full flex-1 rounded-[1px] transition-colors duration-500",
                      zone && zone.id === seg.zone.id ? seg.zone.barClass : "bg-zinc-700",
                    )}
                  />
                ))}
              </div>
              <div className="mt-1.5 flex gap-1">
                {segments.map((seg) => (
                  <span
                    key={seg.zone.id}
                    style={{ flexGrow: seg.weight }}
                    className={cn(
                      "flex-1 text-center font-mono text-[8px] tracking-[0.12em]",
                      zone && zone.id === seg.zone.id ? seg.zone.colorClass : "text-zinc-400",
                    )}
                  >
                    {seg.zone.id}
                  </span>
                ))}
              </div>

              {/* R22-b — live HRV (RMSSD) from the strap's RR-intervals:
                  scoped row, own watchdog, zero new interactive elements */}
              <div className="mt-3 border-t border-zinc-700/40 pt-3">
                <StrapHrvReadout />
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {hr.deviceName && (
                  <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">{hr.deviceName.toUpperCase()}</span>
                )}
                {hr.battery !== null && (
                  <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">BATT {hr.battery}%</span>
                )}
                {hr.battery === null && (
                  <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">BATT —</span>
                )}
              </div>

              <button
                type="button"
                onClick={disconnectStrap}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/50 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-rose-500/50 hover:text-rose-300 active:border-rose-500/70 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                DISCONNECT
              </button>
            </div>
          )}

          {hr.state === "error" && (
            <div className="mt-2.5">
              <p
                role="alert"
                title="Web Bluetooth requires a user gesture for every reconnect."
                className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-rose-300/90"
              >
                {hr.error ?? "LINK FAILED"} — tap retry to reconnect.
              </p>
              <button
                type="button"
                onClick={() => void retryStrap()}
                className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-rose-400/60 bg-rose-500/20 font-mono text-xs font-bold tracking-[0.25em] text-rose-100 uppercase transition-all hover:bg-rose-500/40 active:bg-rose-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                RETRY LINK
              </button>
            </div>
          )}
        </div>

        {/* ── FASTRACK WATCH · wrist link + day sync bridge (R31-c) ─────── */}
        <FastrackWatchCard birthYear={birthYear} />

        {/* ── MAX HR · zone math base — R53-b: the "zones compute off …" line
            AND the hub's science citations ride this card's title ─────────── */}
        <div
          className="rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5"
          title={`Zones compute off ${maxHrOverride !== null ? `the override (${maxHrOverride})` : `220−age (${hrMax})`}. 220−age (Fox 1971) · %HRmax 5-zone (Edwards) · RMSSD short-window HRV · Tanaka disclosed in code.`}
        >
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <p className="sys-label text-violet-300/90">MAX HR</p>
              <p className="mt-1 font-mono text-xs tabular-nums tracking-[0.08em] text-zinc-300">
                {maxHrOverride !== null ? `OVERRIDE ${maxHrOverride} BPM` : `${hrMax} BPM${age !== null ? ` · AGE ${age}` : " · AGE —"}`}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Decrease max heart rate override by 5 beats per minute"
                onClick={() => bumpMaxHr(-5)}
                className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Minus className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="w-12 text-center font-mono text-sm font-bold tabular-nums text-violet-200">{hrMax}</span>
              <button
                type="button"
                aria-label="Increase max heart rate override by 5 beats per minute"
                onClick={() => bumpMaxHr(5)}
                className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
              </button>
              {maxHrOverride !== null && (
                <button
                  type="button"
                  aria-label="Reset max heart rate override"
                  onClick={() => setMaxHrOverride(null)}
                  className="grid h-11 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-amber-400/50 hover:text-amber-300 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── GPS LINK · position + route recorder (R21-c) ───────────────── */}
        <div className="rounded-sm border border-teal-500/25 bg-teal-500/5 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="sys-label text-teal-300/90" title="Read-only GPS position link">
              GPS LINK
            </span>
            <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">
              {route.state === "recording"
                ? `RECORDING · ${formatDistance(route.distanceM)}`
                : route.state === "paused"
                  ? `PAUSED · ${formatDistance(route.distanceM)}`
                  : gps.state === "live"
                    ? "WATCHING"
                    : gps.state === "denied"
                      ? "DENIED"
                      : "READ-ONLY"}
            </span>
          </div>

          {(gps.state === "idle" || gps.state === "unsupported") && route.state === "idle" && routeSummary === null && (
            <div className="mt-2.5">
              {gps.state === "unsupported" ? (
                <p
                  className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-400"
                  title="No geolocation API in this browser — position link and recorder unavailable."
                >
                  No geolocation API in this browser.
                </p>
              ) : (
                <button
                  type="button"
                  onClick={startGps}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-400/60 bg-teal-500/20 font-mono text-xs font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/40 hover:shadow-[0_0_22px_rgba(45,212,191,0.3)] active:bg-teal-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  START GPS
                </button>
              )}
            </div>
          )}

          {gps.state === "denied" && route.state === "idle" && routeSummary === null && (
            <p
              className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-amber-300/90"
              title="Location permission denied — enable it in site settings to use the recorder."
            >
              Location permission denied.
            </p>
          )}

          {gps.state === "live" && gps.coords && route.state === "idle" && routeSummary === null && (
            <div className="mt-2.5">
              <p className="font-mono text-sm tabular-nums tracking-[0.08em] text-teal-100">
                {gps.coords.lat.toFixed(4)} · {gps.coords.lng.toFixed(4)}
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="sys-label text-[8px] text-zinc-400">ACCURACY</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">
                    ±{gps.accuracyM !== null ? `${Math.round(gps.accuracyM)} M` : "—"}
                  </p>
                </div>
                <div>
                  <p className="sys-label text-[8px] text-zinc-400">SPEED</p>
                  <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">
                    {gps.speedMps !== null ? `${gps.speedMps.toFixed(1)} M/S` : "—"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={stopGps}
                className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/50 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-teal-500/50 hover:text-teal-300 active:border-teal-500/70 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                STOP GPS
              </button>
            </div>
          )}

          {/* recorder entry — armed only when geolocation exists and isn't denied */}
          {route.state === "idle" && routeSummary === null && gps.state !== "unsupported" && gps.state !== "denied" && (
            <div className={gps.state === "live" ? "mt-3 border-t border-zinc-700/40 pt-3" : "mt-2.5"}>
              {/* R55-b declutter — the ROUTE RECORDER label + its intro prose
                  ride the START RECORDING button's title below. */}
              <button
                type="button"
                onClick={startRecording}
                title="Route recorder — outdoor run → live distance and pace → one-tap cleared raid. GPS straight-line math, auto-pause honest."
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-400/60 bg-teal-500/20 font-mono text-xs font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/40 hover:shadow-[0_0_22px_rgba(45,212,191,0.3)] active:bg-teal-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <RouteIcon className="h-4 w-4" aria-hidden />
                START RECORDING
              </button>
              {logPhase === "done" && (
                <p className="mt-2 flex items-center gap-1.5 font-mono text-[9px] tracking-[0.15em] text-emerald-300">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  RAID LOGGED{loggedXp !== null ? ` · +${loggedXp} XP` : ""} · GALE FIELDS CLEARED
                </p>
              )}
            </div>
          )}

          {/* live recording — store-backed, survives tab switches */}
          {route.state !== "idle" && (
            <motion.div
              initial={reduce ? undefined : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? undefined : { duration: 0.35, ease: FLOW_EASE }}
              className="mt-2.5"
            >
              {route.points.length === 0 && (
                <div>
                  <p className="flex items-center gap-2 font-mono text-[9px] tracking-[0.15em] text-teal-200">
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                    GPS acquiring — first fix pending
                  </p>
                  {gps.state === "denied" && (
                    <p className="mt-1.5 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-amber-300/90">
                      Permission denied — stop, enable location in site settings, retry.
                    </p>
                  )}
                </div>
              )}
              {route.points.length > 0 && (
                <div>
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <p className="sys-label text-[8px] text-zinc-400">DISTANCE</p>
                      <p className="mt-1 font-mono text-4xl font-bold leading-none tabular-nums text-teal-100 text-glow-teal">
                        {formatDistance(route.distanceM)}
                      </p>
                    </div>
                    {route.state === "paused" ? (
                      <span className="mb-1 flex shrink-0 items-center gap-1.5 rounded-sm border border-amber-400/50 bg-amber-500/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em] text-amber-200">
                        <span className="sys-pulse h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden /> PAUSED
                      </span>
                    ) : (
                      <span className="mb-1 flex shrink-0 items-center gap-1.5 rounded-sm border border-teal-400/50 bg-teal-500/10 px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em] text-teal-200">
                        <span className="sys-pulse h-1.5 w-1.5 rounded-full bg-teal-400" aria-hidden /> REC
                      </span>
                    )}
                  </div>
                  <div
                className="mt-2.5 grid grid-cols-2 gap-2"
                title="Auto-pause below 0.5 m/s · distance advances on movement only."
              >
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">PACE</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">{formatPace(livePace)}</p>
                    </div>
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">SPEED</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">
                        {liveSpeed !== null ? `${liveSpeed.toFixed(1)} M/S` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">ELAPSED</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">{formatElapsed(liveElapsedMs)}</p>
                    </div>
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">POINTS</p>
                      <p className="mt-0.5 font-mono text-xs tabular-nums text-teal-200">{route.points.length}</p>
                    </div>
                  </div>
                  {/* R53-b declutter — the auto-pause note rides the stats
                      grid's title attribute above. */}
                </div>
              )}
              {/* STOP lives outside the acquire/live split — a route with zero
                  fixes must still be stoppable (the honest zero-fix path) */}
              <button
                type="button"
                onClick={stopRecording}
                className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-amber-400/60 bg-amber-500/20 font-mono text-xs font-bold tracking-[0.25em] text-amber-100 uppercase transition-all hover:bg-amber-500/40 hover:shadow-[0_0_22px_rgba(245,158,11,0.3)] active:bg-amber-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Square className="h-3.5 w-3.5" aria-hidden />
                STOP RECORDING
              </button>
            </motion.div>
          )}

          {/* stopped → summary → LOG AS RAID / DISCARD */}
          {routeSummary !== null && (
            <motion.div
              initial={reduce ? undefined : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? undefined : { duration: 0.35, ease: FLOW_EASE }}
              className="mt-2.5"
            >
              {routeSummary.pointCount === 0 ? (
                <div>
                  <p className="font-mono text-[9px] leading-relaxed tracking-[0.12em] text-amber-300/90">
                    No GPS fix — nothing logged.
                  </p>
                  <div className="mt-2.5">
                    <GpxExportButton gpx={routeSummary.gpx} onDownload={downloadGpx} />
                  </div>
                  <button
                    type="button"
                    onClick={discardRoute}
                    className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/50 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-rose-500/50 hover:text-rose-300 active:border-rose-500/70 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    DISCARD ROUTE
                  </button>
                </div>
              ) : (
                <div>
                  <p className="sys-label text-[8px] text-zinc-400">ROUTE SUMMARY</p>
                  <p className="mt-1 font-mono text-3xl font-bold leading-none tabular-nums text-teal-100 text-glow-teal">
                    {formatDistance(routeSummary.distanceM)}
                  </p>
                  <div className="mt-2.5 grid grid-cols-3 gap-2">
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">ELAPSED</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-teal-200">
                        {formatElapsed(routeSummary.elapsedMs)}
                      </p>
                    </div>
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">AVG PACE</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-teal-200">{formatPace(summaryPace)}</p>
                    </div>
                    <div>
                      <p className="sys-label text-[8px] text-zinc-400">POINTS</p>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-teal-200">{routeSummary.pointCount}</p>
                    </div>
                  </div>

                  {!loggable && (
                    <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-amber-300/90">
                      Under 10 m — below the loggable floor.
                    </p>
                  )}
                  {logPhase === "error" && logError && (
                    <p role="alert" className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-rose-300/90">
                      {logError} — tap LOG AS RAID to retry.
                    </p>
                  )}

                  {/* R53-b declutter — the "one cardio log · Gale Fields · notes
                      carry distance + pace" note and the hub's science
                      citations ride titles: the stack's title here, the MAX HR
                      card's title above. R55-b also folds the visible footer
                      line below into that same title. */}
                  <div
                    className="mt-2.5 space-y-2"
                    title="One cardio log · Gale Fields · notes carry distance + pace."
                  >
                    <button
                      type="button"
                      onClick={() => void logAsRaid()}
                      disabled={logPhase === "logging" || !loggable}
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-violet-500/20 disabled:hover:shadow-none"
                    >
                      {logPhase === "logging" ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> LOGGING…
                        </>
                      ) : (
                        <>
                          <Swords className="h-4 w-4" aria-hidden /> LOG AS RAID
                        </>
                      )}
                    </button>
                    {/* R30-b — the track interchange export: independent of the
                        raid log (a short route is still a real GPS track). */}
                    <GpxExportButton gpx={routeSummary.gpx} onDownload={downloadGpx} />
                    {confirmDiscard ? (
                      <div className="rounded-sm border border-amber-400/30 bg-amber-500/5 p-2.5">
                        <p className="font-mono text-[9px] tracking-[0.12em] text-amber-200">DISCARD THIS ROUTE?</p>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmDiscard(false)}
                            className="flex h-11 w-full items-center justify-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-300 uppercase transition-colors hover:border-zinc-500/60 hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
                          >
                            CANCEL
                          </button>
                          <button
                            type="button"
                            onClick={discardRoute}
                            className="flex h-11 w-full items-center justify-center rounded-sm border border-rose-400/60 bg-rose-500/20 font-mono text-[10px] font-bold tracking-[0.2em] text-rose-100 uppercase transition-all hover:bg-rose-500/40 active:bg-rose-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
                          >
                            CONFIRM
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDiscard(true)}
                        disabled={logPhase === "logging"}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-zinc-700/60 bg-zinc-900/50 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-rose-500/50 hover:text-rose-300 active:border-rose-500/70 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        DISCARD
                      </button>
                    )}
                  </div>
                  {/* R55-b declutter — the route-summary footer line stands down;
                      its text rides the stack's title attribute above. */}
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* ── DEVICE TELEMETRY · battery + network ──────────────────────── */}
        <div className="rounded-sm border border-zinc-700/50 bg-zinc-950/40 px-3.5 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
              <BatteryCharging className="h-3.5 w-3.5 text-teal-400" aria-hidden />
              BATT {device.batteryPct !== null ? `${device.batteryPct}%${device.charging ? " · CHARGING" : ""}` : "—"}
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
              <Signal className="h-3.5 w-3.5 text-violet-400" aria-hidden />
              NETWORK {device.networkType ?? "—"}
            </span>
            <button
              type="button"
              aria-label="Refresh device telemetry"
              onClick={() => void refreshDeviceTelemetry()}
              className="ml-auto grid h-9 w-9 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>

        {/* R53-b declutter — the citations footer (220−AGE (FOX 1971) · …)
            folded into the MAX HR card's title above. */}
      </div>
    </SystemPanel>
  )
}
