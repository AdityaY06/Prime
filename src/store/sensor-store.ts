"use client"

// ─── PRIME · Sensor store (R20-b hub · R21-c route · R22-b strap HRV · R30-b GPX) ─
// The single transient+persisted source of truth for the hardware link layer:
// BLE chest-strap HR (via lib/sensors/bluetooth-hr), GPS watch + ROUTE
// RECORDER (R21-c — fixes feed lib/sensors/gps-route math), and device
// battery/network telemetry. All of these are read-only client APIs — this
// store never touches the database.
//
// RENDER DISCIPLINE: BPM writes are throttled to ≥1s apart (leading edge,
// trailing flush) so a strap that notifies faster than 1Hz cannot storm the
// React tree — only components that select hr.bpm re-render, once a second.
// R22-b: the live HRV snapshot (RMSSD + sample count) rides the SAME throttled
// write — bpm + hrv land in one set() per second, never two. Route pushes
// re-render only the recorder consumers (points/distance change together —
// one set() per fix, no more).
//
// PERSIST DISCIPLINE: only maxHrOverride + lastDeviceName persist (the
// "remembered strap" UX + the zone math override). The ROUTE RECORDER state
// is DELIBERATELY NEVER PERSISTED: a long track is thousands of points and
// would bloat localStorage — points live in memory only, so a reload mid-run
// honestly loses the track (documented, not silently truncated). R22-b: the
// RR-interval HRV state follows the same precedent — the rolling buffer is a
// module-level in-memory object, hrvMs/hrvSamples/rrSeen/liveSinceAt are
// transient slice fields, and the partialize below keeps excluding them.
// skipHydration + an explicit rehydrate() inside probe() keeps SSR markup
// stable (the house hydrate-after-mount pattern; system-store's voice pref
// is the precedent).

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  connectHeartRateStrap,
  isBluetoothSupported,
  type HeartRateStrapController,
} from "@/lib/sensors/bluetooth-hr"
import {
  cumulativeDistanceM,
  formatDistance,
  isPaused,
  movingTimeMs,
  segmentSpeedMps,
  type RoutePoint,
} from "@/lib/sensors/gps-route"
import { routeToGpx } from "@/lib/sensors/gpx"
import { createHrvTracker } from "@/lib/sensors/hrv"

// ── Link state machines ───────────────────────────────────────────────────────

export type HrLinkState = "unsupported" | "idle" | "connecting" | "live" | "error"
export type GpsLinkState = "idle" | "live" | "denied" | "unsupported"

export type HrLink = {
  state: HrLinkState
  bpm: number | null
  /** Strap battery percent — null when the strap omits Battery Service (honest). */
  battery: number | null
  deviceName: string | null
  lastContactAt: number | null
  error: string | null
  /** R22-b — live RMSSD HRV estimate (ms) from strap RR-intervals; null below the 5-interval floor. */
  hrvMs: number | null
  /** R22-b — valid RR-intervals in the in-memory rolling buffer (transient, never persisted). */
  hrvSamples: number
  /** R22-b — true once THIS link delivered at least one RR-interval (chest straps do; most wrist devices don't). */
  rrSeen: boolean
  /** R22-b — epoch ms when this link went live; drives the honest no-RR watchdog. */
  liveSinceAt: number | null
}

export type GpsLink = {
  state: GpsLinkState
  coords: { lat: number; lng: number } | null
  accuracyM: number | null
  speedMps: number | null
}

export type DeviceTelemetry = {
  batteryPct: number | null
  charging: boolean | null
  networkType: string | null
}

// ── Route recorder (R21-c) — in-memory only, never persisted ─────────────────

/** Live recorder state machine + the fix log it derives from. */
export type RouteRecorder = {
  state: "idle" | "recording" | "paused"
  /** Raw fixes (accuracy gate + jitter filter live in the math, not here). */
  points: RoutePoint[]
  startedAt: number | null
  /** Filtered straight-line distance (lib/sensors/gps-route). */
  distanceM: number
  /** Moving time — segments count only above the pause threshold. */
  elapsedMs: number
}

/** Frozen final numbers of the last stopped route (cleared by reset/start). */
export type RouteSummary = {
  startedAt: number
  endedAt: number
  distanceM: number
  elapsedMs: number
  pointCount: number
  /** R30-b — GPX 1.1 track frozen at stop (null when <2 fixes: nothing to
   * export). Rides the summary so the export survives the point release;
   * TRANSIENT like the rest of the recorder — never persisted. */
  gpx?: string | null
}

const IDLE_HR: HrLink = {
  state: "idle",
  bpm: null,
  battery: null,
  deviceName: null,
  lastContactAt: null,
  error: null,
  hrvMs: null,
  hrvSamples: 0,
  rrSeen: false,
  liveSinceAt: null,
}

const IDLE_GPS: GpsLink = { state: "idle", coords: null, accuracyM: null, speedMps: null }

const IDLE_ROUTE: RouteRecorder = {
  state: "idle",
  points: [],
  startedAt: null,
  distanceM: 0,
  elapsedMs: 0,
}

// ── Module-level imperative refs (never in React state) ──────────────────────

let strapCtl: HeartRateStrapController | null = null
/** True while the USER asked for the disconnect — the drop must not read as an error. */
let strapUserDisconnect = false
let gpsWatchId: number | null = null

/** R22-b — RR-interval rolling tracker (RMSSD window). IN-MEMORY ONLY, the R21-c
 * gps-route precedent: high-frequency data never touches localStorage. */
const hrv = createHrvTracker()

// ── Store ─────────────────────────────────────────────────────────────────────

export type SensorState = {
  hr: HrLink
  gps: GpsLink
  device: DeviceTelemetry

  /** Persisted — pinned HRmax for zone math (overrides 220−age everywhere). */
  maxHrOverride: number | null
  /** Persisted — the last strap's name, for the "LAST LINK: POLAR H10" copy. */
  lastDeviceName: string | null

  /** R21-c — live route recorder (TRANSIENT: in-memory points only). */
  route: RouteRecorder
  /** R21-c — final numbers of the last stopped route, until reset. */
  routeSummary: RouteSummary | null

  /** Client capability probe + persist rehydrate + telemetry refresh (call once on hub mount). */
  probe: () => void
  /** Open the BLE chooser and link a strap (MUST be invoked from a user gesture). */
  connectStrap: () => Promise<void>
  /** Sever the strap link (user-initiated — a clean return to idle). */
  disconnectStrap: () => void
  /** Retry after an error/drop: silent GATT reconnect when possible, else a fresh chooser. */
  retryStrap: () => Promise<void>
  /** Refresh battery + network telemetry (Battery & Network Information APIs). */
  refreshDeviceTelemetry: () => Promise<void>
  /** Start the GPS watch (read-only — no DB writes). */
  startGps: () => void
  /** Stop the GPS watch. */
  stopGps: () => void
  /** Set the persisted HRmax override (clamped 150–210; null = follow 220−age). */
  setMaxHrOverride: (v: number | null) => void
  /** R21-c — arm the route recorder (points accumulate from the GPS watch). */
  startRoute: () => void
  /** R21-c — freeze the recorder and snapshot its summary (points released). */
  stopRoute: () => void
  /** R21-c — wipe recorder + summary (after LOG AS RAID or DISCARD). */
  resetRoute: () => void
  /** R21-c — append one GPS fix while armed (no-op when idle). */
  pushRoutePoint: (p: RoutePoint, speedMps?: number | null) => void
  /** R21-c — recompute distance + moving time from the current fixes. */
  recomputeRoute: () => void
}

export const useSensors = create<SensorState>()(
  persist(
    (set, get) => {
      // BPM writes are ≥1s apart: leading edge writes immediately, calls
      // inside the window reschedule ONE trailing flush carrying the freshest
      // value — the readout never lags by more than a second, and never storms.
      // R22-b: every write also carries the CURRENT hrv snapshot — bpm and
      // hrv land together in one set(), so RR never adds a second render.
      let bpmLastWriteAt = 0
      let bpmFlushTimer: ReturnType<typeof setTimeout> | null = null
      const BPM_MIN_INTERVAL_MS = 1000
      const hrvFields = (): Pick<HrLink, "hrvMs" | "hrvSamples"> => {
        const snap = hrv.snapshot()
        return { hrvMs: snap.rmssdMs, hrvSamples: snap.sampleCount }
      }
      const writeBpm = (bpm: number): void => {
        const now = Date.now()
        const elapsed = now - bpmLastWriteAt
        if (elapsed >= BPM_MIN_INTERVAL_MS) {
          bpmLastWriteAt = now
          set((s) => ({ hr: { ...s.hr, ...hrvFields(), bpm, lastContactAt: now } }))
          return
        }
        if (bpmFlushTimer !== null) clearTimeout(bpmFlushTimer)
        bpmFlushTimer = setTimeout(() => {
          bpmFlushTimer = null
          bpmLastWriteAt = Date.now()
          set((s) => ({ hr: { ...s.hr, ...hrvFields(), bpm, lastContactAt: Date.now() } }))
        }, BPM_MIN_INTERVAL_MS - elapsed)
      }

      return {
        hr: { ...IDLE_HR },
        gps: { ...IDLE_GPS },
        device: { batteryPct: null, charging: null, networkType: null },
        maxHrOverride: null,
        lastDeviceName: null,
        route: { ...IDLE_ROUTE },
        routeSummary: null,

        probe: () => {
          if (typeof navigator === "undefined") return
          void useSensors.persist.rehydrate()
          set((s) => ({
            // capability truth, never clobbering an in-flight link
            hr:
              s.hr.state === "live" || s.hr.state === "connecting"
                ? s.hr
                : { ...s.hr, state: isBluetoothSupported() ? "idle" : "unsupported" },
            gps: s.gps.state === "live" ? s.gps : { ...s.gps, state: navigator.geolocation ? "idle" : "unsupported" },
          }))
          void get().refreshDeviceTelemetry()
        },

        connectStrap: async () => {
          if (!isBluetoothSupported()) {
            set((s) => ({ hr: { ...s.hr, state: "unsupported" } }))
            return
          }
          if (get().hr.state === "connecting") return
          strapUserDisconnect = false
          hrv.reset() // R22-b — a fresh link starts with an empty HRV window
          set((s) => ({ hr: { ...IDLE_HR, state: "connecting" } }))
          try {
            strapCtl = await connectHeartRateStrap({
              onBpm: writeBpm,
              onRr: (rrs) => {
                // in-memory only — the store fields ride the throttled BPM
                // write; the FIRST RR also gets its own write so the no-RR
                // honest-gap note clears the instant RR starts flowing
                hrv.push(rrs)
                if (!useSensors.getState().hr.rrSeen) {
                  set((s) => ({ hr: { ...s.hr, rrSeen: true, ...hrvFields() } }))
                }
              },
              onBattery: (battery) => set((s) => ({ hr: { ...s.hr, battery } })),
              onDeviceName: (deviceName) =>
                set((s) => ({ hr: { ...s.hr, deviceName }, lastDeviceName: deviceName })),
              onDisconnect: () => {
                // the controller SURVIVES a drop (reconnect() reuses the same
                // device — no chooser); only a user severance retires it
                const userSevered = strapUserDisconnect
                hrv.reset() // R22-b — a dead link's HRV window is stale, not data
                set((s) => ({
                  hr: userSevered
                    ? { ...IDLE_HR }
                    : {
                        ...s.hr,
                        state: "error",
                        bpm: null,
                        error: "LINK LOST — STRAP OUT OF RANGE OR ASLEEP",
                        hrvMs: null,
                        hrvSamples: 0,
                        rrSeen: false,
                        liveSinceAt: null,
                      },
                }))
              },
              onError: (message) => set((s) => ({ hr: { ...s.hr, state: "error", error: message.toUpperCase() } })),
            })
            set((s) => ({
              // preserve any bpm/battery that raced in during the enrichment reads
              hr: {
                ...s.hr,
                state: "live",
                error: null,
                deviceName: strapCtl?.deviceName ?? s.hr.deviceName,
                liveSinceAt: Date.now(),
              },
              lastDeviceName: strapCtl?.deviceName ?? s.lastDeviceName,
            }))
            void get().refreshDeviceTelemetry()
          } catch (e) {
            const err = e as Error
            // a cancelled chooser is a return, not a failure — back to idle
            const cancelled = err.name === "NotFoundError" || /cancel|no device|no devices/i.test(err.message)
            set((s) => ({
              hr: cancelled ? { ...IDLE_HR } : { ...IDLE_HR, state: "error", error: err.message.toUpperCase() },
            }))
          }
        },

        disconnectStrap: () => {
          strapUserDisconnect = true
          hrv.reset() // R22-b — the HRV window dies with the link
          const ctl = strapCtl
          strapCtl = null
          try {
            ctl?.disconnect()
          } catch {
            // already gone — the idle state below is the truth
          }
          set((s) => ({ hr: { ...IDLE_HR } }))
        },

        retryStrap: async () => {
          strapUserDisconnect = false
          hrv.reset() // R22-b — reconnect starts a fresh HRV window
          const ctl = strapCtl
          if (ctl) {
            set((s) => ({
              hr: { ...s.hr, state: "connecting", error: null, hrvMs: null, hrvSamples: 0, rrSeen: false },
            }))
            try {
              // same device, no chooser — Web Bluetooth allows gatt.connect()
              // on a previously granted device outside a chooser prompt
              await ctl.reconnect()
              set((s) => ({ hr: { ...s.hr, state: "live", error: null, liveSinceAt: Date.now() } }))
              void get().refreshDeviceTelemetry()
              return
            } catch {
              strapCtl = null // device is gone — a fresh chooser is the honest path
            }
          }
          await get().connectStrap()
        },

        refreshDeviceTelemetry: async () => {
          // Battery API — Chrome/Edge/Samsung; absent in Safari & Firefox.
          // Absence is honest: the hub renders "—" rather than a guess.
          try {
            const nav = navigator as Navigator & {
              getBattery?: () => Promise<{ level: number; charging: boolean }>
            }
            if (typeof nav.getBattery === "function") {
              const b = await nav.getBattery()
              set((s) => ({ device: { ...s.device, batteryPct: Math.round(b.level * 100), charging: b.charging } }))
            } else {
              set((s) => ({ device: { ...s.device, batteryPct: null, charging: null } }))
            }
          } catch {
            set((s) => ({ device: { ...s.device, batteryPct: null, charging: null } }))
          }
          // Network Information API — effectiveType is "slow-2g"…"4g".
          try {
            const nav = navigator as Navigator & { connection?: { effectiveType?: string } }
            set((s) => ({ device: { ...s.device, networkType: nav.connection?.effectiveType?.toUpperCase() ?? null } }))
          } catch {
            set((s) => ({ device: { ...s.device, networkType: null } }))
          }
        },

        startGps: () => {
          if (typeof navigator === "undefined" || !navigator.geolocation) {
            set((s) => ({ gps: { ...s.gps, state: "unsupported" } }))
            return
          }
          if (gpsWatchId !== null) return
          gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
              set(() => ({
                gps: {
                  state: "live",
                  coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
                  accuracyM: pos.coords.accuracy ?? null,
                  speedMps: pos.coords.speed ?? null,
                },
              }))
              // R21-c: the same watch feeds the route recorder when armed —
              // one fix, one push; the accuracy/jitter math lives in
              // lib/sensors/gps-route, so this stays a dumb pipe. R30-b: the
              // fix's altitude rides along as an optional structural extra
              // (RoutePoint doesn't declare it — pure math never needed
              // height; gpx.ts reads it tolerantly for <ele>).
              if (get().route.state !== "idle") {
                const fix: RoutePoint & { alt?: number } = {
                  lat: pos.coords.latitude,
                  lon: pos.coords.longitude,
                  accuracy: pos.coords.accuracy ?? undefined,
                  t: pos.timestamp,
                  alt: pos.coords.altitude ?? undefined,
                }
                get().pushRoutePoint(fix, pos.coords.speed ?? null)
              }
            },
            (err) => {
              if (gpsWatchId !== null) {
                navigator.geolocation.clearWatch(gpsWatchId)
                gpsWatchId = null
              }
              set((s) => ({ gps: { ...s.gps, state: err.code === err.PERMISSION_DENIED ? "denied" : "idle" } }))
            },
            { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
          )
        },

        stopGps: () => {
          if (gpsWatchId !== null) {
            navigator.geolocation.clearWatch(gpsWatchId)
            gpsWatchId = null
          }
          set((s) => ({ gps: { ...IDLE_GPS } }))
        },

        setMaxHrOverride: (v) => {
          set({ maxHrOverride: v === null ? null : Math.min(210, Math.max(150, Math.round(v))) })
        },

        // ── Route recorder (R21-c) ──────────────────────────────────────────

        startRoute: () => {
          if (get().route.state !== "idle") return
          set({
            route: { state: "recording", points: [], startedAt: Date.now(), distanceM: 0, elapsedMs: 0 },
            routeSummary: null,
          })
        },

        pushRoutePoint: (p, speedMps) => {
          const r = get().route
          if (r.state === "idle") return
          const points = [...r.points, p]
          // Pause decision: the GPS-reported speed when it says one, else the
          // segment speed derived from the last raw fix (first fix can't pause —
          // no segment exists, and absence of data is not a pause).
          const prev = r.points.length > 0 ? r.points[r.points.length - 1] : null
          const derived = prev !== null ? segmentSpeedMps(prev, p) : null
          const speed = typeof speedMps === "number" && Number.isFinite(speedMps) ? speedMps : derived
          set({
            route: {
              state: isPaused(speed) ? "paused" : "recording",
              points,
              startedAt: r.startedAt,
              distanceM: cumulativeDistanceM(points),
              elapsedMs: movingTimeMs(points),
            },
          })
        },

        recomputeRoute: () => {
          const r = get().route
          if (r.state === "idle") return
          set({ route: { ...r, distanceM: cumulativeDistanceM(r.points), elapsedMs: movingTimeMs(r.points) } })
        },

        stopRoute: () => {
          const r = get().route
          if (r.state === "idle") return
          const startedAt = r.startedAt ?? Date.now()
          // R30-b: the GPX artifact is frozen BEFORE the points are released —
          // built once, at stop, from the full fix log; afterwards the summary
          // carries the interchange string and the points die exactly as
          // before (memory discipline unchanged). Name is the honest facts:
          // PRIME + the filtered distance + the start date.
          const gpx = routeToGpx(r.points, {
            name: `PRIME ${formatDistance(r.distanceM)} ${new Date(startedAt).toISOString().slice(0, 10)}`,
            startedAt: new Date(startedAt).toISOString(),
            distanceM: r.distanceM,
            movingMs: r.elapsedMs,
          })
          set({
            routeSummary: {
              startedAt,
              endedAt: Date.now(),
              distanceM: r.distanceM,
              elapsedMs: r.elapsedMs,
              pointCount: r.points.length,
              gpx,
            },
            // points are released here — the summary carries the final numbers
            route: { ...IDLE_ROUTE },
          })
        },

        resetRoute: () => {
          set({ route: { ...IDLE_ROUTE }, routeSummary: null })
        },
      }
    },
    {
      name: "prime-sensor-link",
      // SSR-safe: nothing hydrates at module load; probe() rehydrates on the
      // client after mount (no hydration-mismatch flicker)
      skipHydration: true,
      // ROUTE RECORDER + R22-b HRV STATE + R30-b GPX ARTIFACT DELIBERATELY
      // EXCLUDED: route points, the RR-interval buffer and the frozen GPX
      // string are in-memory only (high-frequency/bulk data would bloat
      // localStorage); maxHrOverride + lastDeviceName remain the ONLY
      // persisted fields — shape untouched by R22-b and R30-b.
      partialize: (s) => ({ maxHrOverride: s.maxHrOverride, lastDeviceName: s.lastDeviceName }),
    },
  ),
)
