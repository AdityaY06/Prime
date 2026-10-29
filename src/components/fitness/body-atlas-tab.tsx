"use client"

// ── PRIME · Body Atlas tab (Task 12-b, rebuilt 14-c) ───────────────────────────
// Three sub-views: ATLAS (interactive 3D muscle scanner over /api/body data),
// LIBRARY (exercise browser over EXERCISE_LIBRARY) and TOOLS (1RM calculator,
// plate loader, rest timer — fully client-side).
//
// The 3D mannequin is sculpted anatomically from primitives (no external model
// files): an ellipsoid torso stack with V-taper, tapered limbs, deltoid caps,
// jaw + cranium head, rendered with MeshPhysicalMaterial under a PMREM studio
// environment. 13 clickable muscle-group overlays hug the anatomy; their colors
// map weekly volume or recovery state. The figure breathes; the scanner ticks
// rotate (both honour prefers-reduced-motion).
//
// R10-a identity pass — the tab now speaks the R9/R10 language: plain root +
// FlowGroup masthead (header · 01/BIOMASS body-weight hero over a read-only
// /api/metrics window · sub-view toggle), numbered SysSection zones per view
// (02 TARGETING / 03 READOUT in ATLAS, 02 LIBRARY / TOOLKIT / TELEMETRY),
// de-boxed sys-accent-row lists keyed to existing state hues, sys-seg meters
// and the below-fold FlowReveal swap zone (R9-c gating pattern).
//
// R16-a flow round — R14/R15 parity for the last untouched tab: the sub-view
// swap rides the rewards-hub veil (0.25s FLOW_EASE, reduce-gated) over fresh
// inner staggers that replay on every switch (scanner zone + tools panels
// rise, library rows wave in capped at 0.4s, the readout re-seats per muscle
// selection with its guideline band sweeping via MeterFlow inView), legend +
// muscle chip rail rise per-slot on scroll-in, the 1RM numerals count up and
// glide on input, and plate discs spring onto the sleeve. The REST TIMER's
// live countdown bar is deliberately untouched (live progress never rides
// MeterFlow) and the WebGL scene internals stay three.js-owned — the scene
// container rises with its panel, nothing inside the Canvas animates here.
// Contrast pass: every text-zinc-500 micro-label (26 sites) → text-zinc-400.
//
// R19-b freshness round — the ATLAS view gains a full-width 04 / RECOVERY
// zone below the scanner/readout row: the muscle freshness map (Fitbod-parity
// per-muscle recovery score from last-trained recency, pure model in
// lib/recovery.ts). The section is ADDITIVE content in the tab's flow — the
// WebGL scene, rest timer, sub-view swap machinery and readout/library/tools
// panels are untouched; the panel owns its /api/sessions fetch (rides the
// global refreshKey → freshness recomputes live when sessions land).
//
// R54-c3 declutter round — merge & hide only (R52/R53 recipe): the eight
// numbered SysSection zone headers and the duplicated masthead banner stood
// down (panels self-label); the RECOVERY_FOOTER citation wall + scanner/editor
// chrome ride title attributes; the freshness meaning lives behind an
// InfoHint; empty-state prose compressed to single quiet lines. Zero
// handlers, data or panels removed.

import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode, RefObject } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { motion, useReducedMotion } from "framer-motion"
import { Activity, ChevronDown, FlaskConical, Pause, PersonStanding, Play, RotateCcw, Search } from "lucide-react"

import { BodyInsights, BodyCompCelebrateBanner } from "./body-insights"
import { BodyMetrics } from "./body-metrics"
import { OracleTip } from "./oracle-tip"

import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { DecodeText, FLOW_EASE, FlowGroup, FlowItem, FlowReveal, MeterFlow, SPRING_SNAPPY, tapMotion, useCountUp } from "@/components/system/motion"
import { InfoHint } from "@/components/system/info-hint"
// R54-c3 declutter — the eight numbered SysSection headers stood down: panels
// carry their own labels (the R52/R53 recipe). section-mark.tsx stays on disk
// for the tabs that still use it.
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import {
  EXERCISE_LIBRARY,
  MUSCLES,
  MUSCLE_BY_ID,
  brzycki1RM,
  epley1RM,
  platesFor,
  repMaxTable,
  variantsFor,
  type BodyDTO,
  type ExerciseDef,
  type ExerciseType,
  type MuscleId,
  type MuscleStat,
} from "@/lib/muscles"
import { formatDayLabel } from "@/lib/game"
import { WARMUP_RAMP } from "@/lib/strength-science"
import { RECOVERY_FOOTER, recoveryView, type FreshnessVerdict, type MuscleFreshness } from "@/lib/recovery"
import type { HunterDTO, InsightsDTO, SessionDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── Shared types & module constants ──────────────────────────────────────────

type AtlasViewMode = "atlas" | "library" | "tools" | "metrics"
type ColorMode = "volume" | "recovery"
type ViewKind = "front" | "back" | "reset"

const SELECTED_EMISSIVE = "#6ee7b7"

const RECOVERY_COLORS: Record<MuscleStat["recovery"], string> = {
  untrained: "#3f3f46",
  fatigued: "#f43f5e",
  recovering: "#f59e0b",
  ready: "#14b8a6",
}

const REC_PILL: Record<MuscleStat["recovery"], { pill: string; dot: string; label: string }> = {
  untrained: { pill: "border-zinc-700 bg-zinc-800/40 text-zinc-400", dot: "bg-zinc-500", label: "UNTRAINED" },
  fatigued: { pill: "border-rose-500/50 bg-rose-500/10 text-rose-300", dot: "bg-rose-400", label: "FATIGUED" },
  recovering: { pill: "border-amber-500/50 bg-amber-500/10 text-amber-300", dot: "bg-amber-400", label: "RECOVERING" },
  ready: { pill: "border-teal-500/50 bg-teal-500/10 text-teal-300", dot: "bg-teal-400", label: "READY" },
}

// ── R10-a accent-row hues — pre-existing palette only (violet/teal/amber/rose/zinc)
const ROW_VIOLET = {
  "--row-accent": "rgba(167,139,250,0.7)",
  "--row-lift": "rgba(167,139,250,0.07)",
} as React.CSSProperties
const ROW_TEAL = {
  "--row-accent": "rgba(45,212,191,0.7)",
  "--row-lift": "rgba(45,212,191,0.07)",
} as React.CSSProperties
const ROW_AMBER = {
  "--row-accent": "rgba(251,191,36,0.7)",
  "--row-lift": "rgba(251,191,36,0.07)",
} as React.CSSProperties
const ROW_ROSE = {
  "--row-accent": "rgba(244,63,94,0.7)",
  "--row-lift": "rgba(244,63,94,0.07)",
} as React.CSSProperties
const ROW_ZINC = {
  "--row-accent": "rgba(113,113,122,0.55)",
  "--row-lift": "rgba(113,113,122,0.06)",
} as React.CSSProperties

function volumeColor(stat: MuscleStat | undefined): string {
  const sets = stat?.weeklySets ?? 0
  const max = stat?.guideline?.[1] ?? 20
  const ratio = max > 0 ? sets / max : 0
  if (sets <= 0) return "#3f3f46"
  if (ratio < 0.5) return "#52525b"
  if (ratio < 1) return "#14b8a6"
  if (ratio <= 1.5) return "#f59e0b"
  return "#f43f5e"
}

function recoveryColor(stat: MuscleStat | undefined): string {
  return RECOVERY_COLORS[stat?.recovery ?? "untrained"]
}

function formatLastTrained(h: number | null): string {
  if (h == null) return "NEVER TRAINED"
  if (h < 1) return `LAST TRAINED ${Math.max(1, Math.round(h * 60))} MIN AGO`
  if (h < 72) return `LAST TRAINED ${h.toFixed(1)}H AGO`
  return `LAST TRAINED ${(h / 24).toFixed(1)}D AGO`
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// ── Small shared UI atoms ─────────────────────────────────────────────────────

/** Mono toggle chip styled like the app's tab buttons (44px touch target). */
function Chip({
  active = false,
  onClick,
  children,
  className,
  title,
  ariaLabel,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
  className?: string
  title?: string
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title}
      aria-label={ariaLabel}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-sm border px-3.5 font-mono text-[10px] font-bold tracking-[0.25em] uppercase transition-all focus-visible:outline focus-visible:outline-violet-400/70 active:scale-[0.98]",
        active
          ? // R10 QA — active state carries a bloom so selection survives
            // stills and small scales (VLM audit: "lacks selected state")
            "border-violet-400/50 bg-violet-500/15 text-violet-200 shadow-[0_0_14px_rgba(139,92,246,0.22)]"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300",
        className
      )}
    >
      {children}
    </button>
  )
}

function SysLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("sys-label text-zinc-400", className)}>{children}</p>
}

// ── R10-a · BIOMASS hero (01 zone) ───────────────────────────────────────────
// Minimal read-only window onto /api/metrics: the tab masthead leads with the
// latest logged body weight as its ONE display numeral (count-up + bloom),
// with height + BMI as borderless accent-row micro-stats. Every value renders
// exactly what the metrics API returns — nothing is fabricated.

type MetricsHeroRes = {
  profile: { weightKg: number | null; heightCm: number | null }
  latest: {
    weight?: { value: number; day: string } | null
    bmi?: { value: number } | null
  }
}

function BiomeHero({ data, loading }: { data: MetricsHeroRes | null; loading: boolean }) {
  const weight = data?.latest.weight?.value ?? data?.profile.weightKg ?? null
  const weightUp = useCountUp(weight ?? 0)
  const bmi = data?.latest.bmi?.value ?? null
  const height = data?.profile.heightCm ?? null
  const day = data?.latest.weight?.day ?? null

  if (!data) {
    return loading ? (
      <div className="px-1">
        <div className="skel-bar h-11 w-40" />
        <div className="skel-bar mt-3 h-3 w-64" />
      </div>
    ) : (
      <p className="px-1 text-[11px] leading-relaxed text-zinc-600">MASS LINK OFFLINE — open the METRICS view to retry.</p>
    )
  }

  if (weight == null) {
    return (
      <div className="px-1">
        <p className="sys-label text-zinc-400">NO MASS LOG</p>
        <p className="mt-2 text-[11px] leading-relaxed text-zinc-600">Log body weight in the METRICS view.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4 px-1">
      <div className="min-w-0">
        <div className="flex items-baseline gap-2.5">
          <span className="sys-display sys-display-lg sys-bloom text-glow-violet text-violet-100">
            {fmtOne(weightUp)}
          </span>
          <span className="sys-label text-zinc-400">KG</span>
        </div>
        <p className="sys-label mt-2.5 text-zinc-600">
          BODY MASS{day ? ` · LOGGED ${formatDayLabel(day).toUpperCase()}` : ""}
        </p>
      </div>
      <div className="ml-auto flex flex-col gap-1.5">
        <div className="sys-accent-row rounded-r-sm px-2.5 py-1.5" style={ROW_VIOLET}>
          <p className="font-mono text-base font-bold tabular-nums leading-none text-zinc-100">
            {height != null ? height : "—"}
            <span className="ml-1.5 text-[9px] font-normal tracking-[0.2em] text-zinc-400">CM</span>
          </p>
          <p className="mt-1 font-mono text-[8px] tracking-[0.22em] text-zinc-600">HEIGHT</p>
        </div>
        <div className="sys-accent-row rounded-r-sm px-2.5 py-1.5" style={ROW_TEAL}>
          <p className="font-mono text-base font-bold tabular-nums leading-none text-teal-200">
            {bmi != null ? bmi.toFixed(1) : "—"}
          </p>
          <p className="mt-1 font-mono text-[8px] tracking-[0.22em] text-zinc-600">BMI</p>
        </div>
      </div>
    </div>
  )
}

// ── WebGL guard + error boundary ──────────────────────────────────────────────

function webglAvailable(): boolean {
  try {
    const probe = document.createElement("canvas")
    return !!(probe.getContext("webgl2") || probe.getContext("webgl"))
  } catch {
    return false
  }
}

/** Catches render-phase failures of the R3F canvas (e.g. context loss). */
class Canvas3DErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }
  render(): ReactNode {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

// ── 3D scene constants ────────────────────────────────────────────────────────

const ARM_TILT = THREE.MathUtils.degToRad(12)
const SHOULDER_X = 0.252
const SHOULDER_Y = 1.455

const TARGET = new THREE.Vector3(0, 1.05, 0)
const TARGET_ARRAY: [number, number, number] = [0, 1.05, 0]
const DEFAULT_PHI = 1.469
const DEFAULT_R = 4.423
const _off = new THREE.Vector3()
const _sph = new THREE.Spherical()

type OverlaySpec = {
  muscle: MuscleId
  geom: "box" | "sphere" | "capsule"
  /** box: w/h/d · sphere: r · capsule: r/length */
  size: [number, number, number]
  pos: [number, number, number]
  rot?: [number, number, number]
  baseScale?: [number, number, number]
}

/** Static torso/leg muscle overlays in world space (front faces +z).
 *  Ellipsoid specs (sphere + non-uniform baseScale) hug the sculpted anatomy. */
const TORSO_OVERLAYS: OverlaySpec[] = [
  // chest — fan-shaped pec plates wrapping the pec shelf
  { muscle: "chest", geom: "sphere", size: [0.105, 0, 0], pos: [0.098, 1.312, 0.068], rot: [0, -0.24, -0.1], baseScale: [1, 0.74, 0.52] },
  { muscle: "chest", geom: "sphere", size: [0.105, 0, 0], pos: [-0.098, 1.312, 0.068], rot: [0, 0.24, 0.1], baseScale: [1, 0.74, 0.52] },
  // core — six-pack column + angled obliques (bumped so the pack reads at distance)
  { muscle: "core", geom: "sphere", size: [0.042, 0, 0], pos: [0.04, 1.183, 0.092], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "sphere", size: [0.042, 0, 0], pos: [-0.04, 1.183, 0.092], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "sphere", size: [0.044, 0, 0], pos: [0.042, 1.103, 0.095], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "sphere", size: [0.044, 0, 0], pos: [-0.042, 1.103, 0.095], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "sphere", size: [0.038, 0, 0], pos: [0.038, 1.023, 0.092], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "sphere", size: [0.038, 0, 0], pos: [-0.038, 1.023, 0.092], baseScale: [1, 0.9, 0.6] },
  { muscle: "core", geom: "capsule", size: [0.036, 0.13, 0], pos: [0.112, 1.10, 0.058], rot: [0, 0, 0.42] },
  { muscle: "core", geom: "capsule", size: [0.036, 0.13, 0], pos: [-0.112, 1.10, 0.058], rot: [0, 0, -0.42] },
  // shoulders — deltoid caps wrapping the joints
  { muscle: "shoulders", geom: "sphere", size: [0.088, 0, 0], pos: [0.252, 1.443, 0.008], baseScale: [1.04, 0.96, 0.96] },
  { muscle: "shoulders", geom: "sphere", size: [0.088, 0, 0], pos: [-0.252, 1.443, 0.008], baseScale: [1.04, 0.96, 0.96] },
  // lats — wings sweeping down toward the spine
  { muscle: "lats", geom: "sphere", size: [0.09, 0, 0], pos: [0.125, 1.222, -0.066], rot: [0.1, -0.26, -0.24], baseScale: [0.92, 1.9, 0.55] },
  { muscle: "lats", geom: "sphere", size: [0.09, 0, 0], pos: [-0.125, 1.222, -0.066], rot: [0.1, 0.26, 0.24], baseScale: [0.92, 1.9, 0.55] },
  // traps — neck plate + sloping straps toward each shoulder
  { muscle: "traps", geom: "box", size: [0.15, 0.13, 0.042], pos: [0, 1.432, -0.06] },
  { muscle: "traps", geom: "capsule", size: [0.036, 0.12, 0], pos: [0.114, 1.452, -0.042], rot: [0, 0, 0.55] },
  { muscle: "traps", geom: "capsule", size: [0.036, 0.12, 0], pos: [-0.114, 1.452, -0.042], rot: [0, 0, -0.55] },
  // lower back — erector columns flanking the spine
  { muscle: "lower-back", geom: "capsule", size: [0.03, 0.15, 0], pos: [0.044, 1.10, -0.086] },
  { muscle: "lower-back", geom: "capsule", size: [0.03, 0.15, 0], pos: [-0.044, 1.10, -0.086] },
  // glutes
  { muscle: "glutes", geom: "sphere", size: [0.088, 0, 0], pos: [0.086, 0.902, -0.06], baseScale: [1, 1.18, 0.82] },
  { muscle: "glutes", geom: "sphere", size: [0.088, 0, 0], pos: [-0.086, 0.902, -0.06], baseScale: [1, 1.18, 0.82] },
  // quads — teardrop fronts riding the thigh taper
  { muscle: "quads", geom: "sphere", size: [0.078, 0, 0], pos: [0.104, 0.70, 0.05], rot: [0, -0.12, -0.06], baseScale: [0.94, 1.78, 0.62] },
  { muscle: "quads", geom: "sphere", size: [0.078, 0, 0], pos: [-0.104, 0.70, 0.05], rot: [0, 0.12, 0.06], baseScale: [0.94, 1.78, 0.62] },
  // hamstrings — under the thigh line
  { muscle: "hamstrings", geom: "capsule", size: [0.047, 0.19, 0], pos: [0.104, 0.66, -0.05] },
  { muscle: "hamstrings", geom: "capsule", size: [0.047, 0.19, 0], pos: [-0.104, 0.66, -0.05] },
  // calves — diamond heads
  { muscle: "calves", geom: "sphere", size: [0.057, 0, 0], pos: [0.103, 0.365, -0.033], baseScale: [0.86, 1.5, 0.82] },
  { muscle: "calves", geom: "sphere", size: [0.057, 0, 0], pos: [-0.103, 0.365, -0.033], baseScale: [0.86, 1.5, 0.82] },
]

/** Arm overlays in arm-local space (arm group tilts ±12° outward). */
const ARM_OVERLAYS: OverlaySpec[] = [
  { muscle: "biceps", geom: "capsule", size: [0.047, 0.12, 0], pos: [0, -0.175, 0.027] },
  { muscle: "triceps", geom: "capsule", size: [0.045, 0.13, 0], pos: [0, -0.195, -0.029] },
  { muscle: "forearms", geom: "capsule", size: [0.042, 0.16, 0], pos: [0, -0.465, 0.006] },
]

// ── 3D building blocks ────────────────────────────────────────────────────────

/** Slow breathing pulse on the chest ellipsoid (skipped for reduced motion). */
function Breath({ children, reducedMotion }: { children: ReactNode; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group | null>(null)
  useFrame(({ clock }) => {
    const g = ref.current
    if (!g || reducedMotion) return
    const phase = Math.sin(clock.elapsedTime * 1.05)
    g.scale.set(1 + phase * 0.008, 1 + phase * 0.002, 1 + phase * 0.006)
  })
  return <group ref={ref}>{children}</group>
}

/** PMREM studio environment — gives the physical materials real reflections.
 *  The texture is baked once per renderer and attached declaratively so the
 *  scene object is never mutated inside the component. */
function StudioEnvironment() {
  const gl = useThree((s) => s.gl)
  const tex = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl)
    const room = new RoomEnvironment()
    const t = pmrem.fromScene(room, 0.04).texture
    room.dispose()
    pmrem.dispose()
    return t
  }, [gl])
  useEffect(() => () => tex.dispose(), [tex])
  return <primitive attach="environment" object={tex} />
}

/** Anatomically sculpted figure built from ellipsoids + tapered limbs.
 *  Silhouette: broad ellipsoid chest → narrower ribcage → waist → pelvis,
 *  deltoid caps at the shoulder joints, jaw + cranium head, teardrop thighs. */
function Mannequin({ mat, reducedMotion }: { mat: THREE.Material; reducedMotion: boolean }) {
  return (
    <group>
      {/* ── head: cranium + jaw ── */}
      <mesh material={mat} position={[0, 1.672, 0]} scale={[1, 1.14, 1.03]}>
        <sphereGeometry args={[0.088, 26, 20]} />
      </mesh>
      <mesh material={mat} position={[0, 1.598, 0.016]} scale={[0.94, 0.86, 1.0]}>
        <sphereGeometry args={[0.076, 22, 16]} />
      </mesh>
      {/* neck — flares down into the traps */}
      <mesh material={mat} position={[0, 1.548, 0]}>
        <cylinderGeometry args={[0.05, 0.066, 0.13, 14]} />
      </mesh>
      {/* ── torso: ellipsoid stack with a V-taper ── */}
      <Breath reducedMotion={reducedMotion}>
        <mesh material={mat} position={[0, 1.285, 0]} scale={[0.222, 0.185, 0.118]}>
          <sphereGeometry args={[1, 30, 22]} />
        </mesh>
      </Breath>
      <mesh material={mat} position={[0, 1.105, 0]} scale={[0.172, 0.135, 0.101]}>
        <sphereGeometry args={[1, 26, 20]} />
      </mesh>
      <mesh material={mat} position={[0, 0.965, 0]} scale={[0.148, 0.09, 0.098]}>
        <sphereGeometry args={[1, 24, 18]} />
      </mesh>
      <mesh material={mat} position={[0, 0.902, 0]} scale={[0.172, 0.115, 0.109]}>
        <sphereGeometry args={[1, 26, 20]} />
      </mesh>
      {/* ── shoulder joints under the delt caps ── */}
      <mesh material={mat} position={[0.244, 1.45, 0]}>
        <sphereGeometry args={[0.062, 18, 14]} />
      </mesh>
      <mesh material={mat} position={[-0.244, 1.45, 0]}>
        <sphereGeometry args={[0.062, 18, 14]} />
      </mesh>
      {/* ── legs: tapered thighs → knees → tapered shins → ankles → feet ── */}
      {[1, -1].map((side) => (
        <group key={side}>
          <mesh material={mat} position={[side * 0.104, 0.68, 0]}>
            <cylinderGeometry args={[0.091, 0.06, 0.37, 18]} />
          </mesh>
          <mesh material={mat} position={[side * 0.104, 0.49, 0.008]}>
            <sphereGeometry args={[0.061, 18, 14]} />
          </mesh>
          <mesh material={mat} position={[side * 0.104, 0.3, -0.006]}>
            <cylinderGeometry args={[0.056, 0.032, 0.35, 16]} />
          </mesh>
          <mesh material={mat} position={[side * 0.104, 0.118, -0.006]}>
            <sphereGeometry args={[0.037, 14, 12]} />
          </mesh>
          {/* foot — capsule laid along +z (toes forward) */}
          <mesh material={mat} position={[side * 0.104, 0.043, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <capsuleGeometry args={[0.045, 0.12, 6, 12]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function ScannerPlatform({ reducedMotion }: { reducedMotion: boolean }) {
  const ticksRef = useRef<THREE.Group | null>(null)
  useFrame((_, dt) => {
    if (ticksRef.current && !reducedMotion) ticksRef.current.rotation.y += dt * 0.22
  })
  return (
    <group position={[0, 0.001, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.9, 48]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0006, 0]}>
        <circleGeometry args={[0.55, 40]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* outer accent ring + radial ticks — scanner calibration feel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.98, 1.0, 64]} />
        <meshBasicMaterial color="#6ee7b7" transparent opacity={0.1} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={ticksRef}>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i / 12) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 1.08, 0.0009, Math.sin(a) * 1.08]}
              rotation={[-Math.PI / 2, 0, -a]}
            >
              <planeGeometry args={[0.07, 0.012]} />
              <meshBasicMaterial
                color={i % 3 === 0 ? "#f59e0b" : "#6ee7b7"}
                transparent
                opacity={i % 3 === 0 ? 0.5 : 0.28}
                side={THREE.DoubleSide}
                depthWrite={false}
              />
            </mesh>
          )
        })}
      </group>
    </group>
  )
}

/** One clickable muscle-group overlay mesh with lerped glow / scale / opacity. */
function MuscleMesh({
  spec,
  statsById,
  mode,
  selectedId,
  anySelected,
  pointerRef,
  onSelect,
}: {
  spec: OverlaySpec
  statsById: Map<MuscleId, MuscleStat>
  mode: ColorMode
  selectedId: MuscleId | null
  anySelected: boolean
  pointerRef: RefObject<{ hovered: MuscleId | null }>
  onSelect: (id: MuscleId) => void
}) {
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const grpRef = useRef<THREE.Group | null>(null)
  const stat = statsById.get(spec.muscle)
  const isSel = selectedId === spec.muscle
  const color = mode === "volume" ? volumeColor(stat) : recoveryColor(stat)
  const emissive = isSel ? SELECTED_EMISSIVE : color
  const bs = spec.baseScale ?? [1, 1, 1]

  useFrame((_, dt) => {
    const mat = matRef.current
    const grp = grpRef.current
    if (!mat || !grp) return
    const hovered = !isSel && pointerRef.current.hovered === spec.muscle
    const k = 1 - Math.exp(-9 * Math.min(dt, 0.1))
    const targetIntensity = isSel ? 1.4 : hovered ? 0.5 : 0.12
    mat.emissiveIntensity += (targetIntensity - mat.emissiveIntensity) * k
    const targetOpacity = isSel ? 0.95 : anySelected ? 0.18 : 0.85
    mat.opacity += (targetOpacity - mat.opacity) * k
    const s = isSel ? 1.06 : 1
    grp.scale.x += (bs[0] * s - grp.scale.x) * k
    grp.scale.y += (bs[1] * s - grp.scale.y) * k
    grp.scale.z += (bs[2] * s - grp.scale.z) * k
  })

  return (
    <group ref={grpRef} position={spec.pos} rotation={spec.rot ?? [0, 0, 0]} scale={spec.baseScale ?? 1}>
      <mesh
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect(spec.muscle)
        }}
        onPointerOver={(e) => {
          e.stopPropagation()
          pointerRef.current.hovered = spec.muscle
          document.body.style.cursor = "pointer"
        }}
        onPointerOut={() => {
          if (pointerRef.current.hovered === spec.muscle) pointerRef.current.hovered = null
          document.body.style.cursor = "auto"
        }}
      >
        {spec.geom === "box" && <boxGeometry args={[spec.size[0], spec.size[1], spec.size[2]]} />}
        {spec.geom === "sphere" && <sphereGeometry args={[spec.size[0], 20, 16]} />}
        {spec.geom === "capsule" && <capsuleGeometry args={[spec.size[0], spec.size[1], 6, 14]} />}
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={emissive}
          emissiveIntensity={0.22}
          transparent
          opacity={0.92}
          depthWrite={false}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
    </group>
  )
}

/** One A-pose arm: base capsules + hand + biceps/triceps/forearm overlays. */
function Arm({
  side,
  mat,
  statsById,
  mode,
  selectedId,
  anySelected,
  pointerRef,
  onSelect,
}: {
  side: 1 | -1
  mat: THREE.Material
  statsById: Map<MuscleId, MuscleStat>
  mode: ColorMode
  selectedId: MuscleId | null
  anySelected: boolean
  pointerRef: RefObject<{ hovered: MuscleId | null }>
  onSelect: (id: MuscleId) => void
}) {
  return (
    <group position={[side * SHOULDER_X, SHOULDER_Y, 0]} rotation={[0, 0, side * ARM_TILT]}>
      {/* upper arm — tapered from the delt to the elbow */}
      <mesh material={mat} position={[0, -0.185, 0]}>
        <cylinderGeometry args={[0.052, 0.04, 0.29, 14]} />
      </mesh>
      {/* elbow */}
      <mesh material={mat} position={[0, -0.335, 0]}>
        <sphereGeometry args={[0.041, 14, 12]} />
      </mesh>
      {/* forearm — tapers hard to the wrist */}
      <mesh material={mat} position={[0, -0.465, 0]}>
        <cylinderGeometry args={[0.042, 0.027, 0.26, 14]} />
      </mesh>
      {/* hand */}
      <mesh material={mat} position={[0, -0.635, 0.006]} scale={[0.85, 1.15, 0.6]}>
        <sphereGeometry args={[0.048, 14, 12]} />
      </mesh>
      {ARM_OVERLAYS.map((spec) => (
        <MuscleMesh
          key={spec.muscle}
          spec={spec}
          statsById={statsById}
          mode={mode}
          selectedId={selectedId}
          anySelected={anySelected}
          pointerRef={pointerRef}
          onSelect={onSelect}
        />
      ))}
    </group>
  )
}

/**
 * Orbit controls + camera rig. Handles:
 * - slow auto-rotation (paused on interaction, selection or reduced-motion)
 * - FRONT / BACK / RESET camera flights (lerped along the orbit sphere)
 */
function SceneControls({
  controlsRef,
  viewCmd,
  selectedId,
  reducedMotion,
}: {
  controlsRef: RefObject<OrbitControlsImpl | null>
  viewCmd: { kind: ViewKind; seq: number } | null
  selectedId: MuscleId | null
  reducedMotion: boolean
}) {
  const camera = useThree((s) => s.camera)
  // autorotate is fully derived: allowed unless reduced-motion, a muscle is
  // selected, or the user interacted with the scanner recently
  const [recentInteraction, setRecentInteraction] = useState(false)
  const autoRotate = !reducedMotion && !selectedId && !recentInteraction
  const resumeTimerRef = useRef<number | null>(null)
  const animRef = useRef({ active: false, theta: 0, phi: DEFAULT_PHI, radius: DEFAULT_R })
  const lastSeqRef = useRef(0)

  const scheduleResume = useCallback((ms: number) => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = null
      setRecentInteraction(false)
    }, ms)
  }, [])

  // pause autorotation while the user drags, resume a beat after they stop
  useEffect(() => {
    const c = controlsRef.current
    if (!c) return
    const onStart = () => {
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      setRecentInteraction(true)
    }
    const onEnd = () => {
      setRecentInteraction(true)
      scheduleResume(4000)
    }
    c.addEventListener("start", onStart)
    c.addEventListener("end", onEnd)
    return () => {
      c.removeEventListener("start", onStart)
      c.removeEventListener("end", onEnd)
      if (resumeTimerRef.current) {
        window.clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
    }
  }, [controlsRef, scheduleResume])

  useFrame((_, dt) => {
    const c = controlsRef.current
    if (!c) return
    // consume a new FRONT/BACK/RESET command
    if (viewCmd && viewCmd.seq !== lastSeqRef.current) {
      lastSeqRef.current = viewCmd.seq
      _off.copy(camera.position).sub(TARGET)
      _sph.setFromVector3(_off)
      const baseTheta = viewCmd.kind === "back" ? Math.PI : 0
      let diff = baseTheta - _sph.theta
      diff -= 2 * Math.PI * Math.round(diff / (2 * Math.PI)) // shortest wrap
      animRef.current = {
        active: true,
        theta: _sph.theta + diff,
        phi: viewCmd.kind === "reset" ? DEFAULT_PHI : _sph.phi,
        radius: viewCmd.kind === "reset" ? DEFAULT_R : _sph.radius,
      }
      setRecentInteraction(true)
      scheduleResume(4000)
    }
    // fly the camera along the orbit sphere toward the target angles
    const a = animRef.current
    if (!a.active) return
    _off.copy(camera.position).sub(TARGET)
    _sph.setFromVector3(_off)
    const k = 1 - Math.exp(-7 * Math.min(dt, 0.1))
    _sph.theta += (a.theta - _sph.theta) * k
    _sph.phi += (a.phi - _sph.phi) * k
    _sph.radius += (a.radius - _sph.radius) * k
    _sph.makeSafe()
    _off.setFromSpherical(_sph)
    camera.position.copy(TARGET).add(_off)
    camera.lookAt(TARGET)
    if (Math.abs(a.theta - _sph.theta) < 0.0025 && Math.abs(a.phi - _sph.phi) < 0.0025 && Math.abs(a.radius - _sph.radius) < 0.015) {
      a.active = false
    }
  })

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.2}
      maxDistance={8}
      target={TARGET_ARRAY}
      autoRotate={autoRotate}
      autoRotateSpeed={0.6}
    />
  )
}

function AtlasScene({
  statsById,
  mode,
  selectedId,
  viewCmd,
  reducedMotion,
  onSelect,
}: {
  statsById: Map<MuscleId, MuscleStat>
  mode: ColorMode
  selectedId: MuscleId | null
  viewCmd: { kind: ViewKind; seq: number } | null
  reducedMotion: boolean
  onSelect: (id: MuscleId) => void
}) {
  const pointerRef = useRef<{ hovered: MuscleId | null }>({ hovered: null })
  const controlsRef = useRef<OrbitControlsImpl | null>(null)
  const baseMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#2b2b34",
        roughness: 0.38,
        metalness: 0.55,
        clearcoat: 0.65,
        clearcoatRoughness: 0.3,
        envMapIntensity: 0.55,
        emissive: new THREE.Color("#15151c"),
        emissiveIntensity: 0.45,
      }),
    []
  )
  useEffect(() => {
    return () => {
      baseMat.dispose()
      document.body.style.cursor = "auto"
    }
  }, [baseMat])

  const anySelected = selectedId !== null

  return (
    <>
      <color attach="background" args={["#0a0a12"]} />
      <fog attach="fog" args={["#0a0a12", 7, 14]} />
      <StudioEnvironment />
      {/* three-point rig: warm key, violet fill, fuchsia rim */}
      <ambientLight intensity={0.32} />
      <directionalLight position={[3.5, 4.5, 4]} intensity={1.15} color="#fff1e0" />
      <pointLight position={[-3, 1.9, 2.6]} color="#6ee7b7" intensity={16} distance={12} decay={2} />
      <pointLight position={[0, 2.3, -4.6]} color="#fbbf24" intensity={22} distance={14} decay={2} />
      <pointLight position={[2.6, 0.7, -3]} color="#a7f3d0" intensity={9} distance={10} decay={2} />
      <Mannequin mat={baseMat} reducedMotion={reducedMotion} />
      {TORSO_OVERLAYS.map((spec) => (
        <MuscleMesh
          key={`${spec.muscle}-${spec.pos.join(",")}`}
          spec={spec}
          statsById={statsById}
          mode={mode}
          selectedId={selectedId}
          anySelected={anySelected}
          pointerRef={pointerRef}
          onSelect={onSelect}
        />
      ))}
      <Arm
        side={-1}
        mat={baseMat}
        statsById={statsById}
        mode={mode}
        selectedId={selectedId}
        anySelected={anySelected}
        pointerRef={pointerRef}
        onSelect={onSelect}
      />
      <Arm
        side={1}
        mat={baseMat}
        statsById={statsById}
        mode={mode}
        selectedId={selectedId}
        anySelected={anySelected}
        pointerRef={pointerRef}
        onSelect={onSelect}
      />
      <ScannerPlatform reducedMotion={reducedMotion} />
      <SceneControls controlsRef={controlsRef} viewCmd={viewCmd} selectedId={selectedId} reducedMotion={reducedMotion} />
    </>
  )
}

// ── ATLAS: legend, chip rail, detail panel ────────────────────────────────────

function AtlasLegend({ mode }: { mode: ColorMode }) {
  const reduce = !!useReducedMotion()
  const items =
    mode === "volume"
      ? [
          { c: "#3f3f46", l: "0 SETS" },
          { c: "#52525b", l: "UNDER HALF" },
          { c: "#14b8a6", l: "ON TARGET" },
          { c: "#f59e0b", l: "AT MAX" },
          { c: "#f43f5e", l: "OVER" },
        ]
      : [
          { c: "#3f3f46", l: "UNTRAINED" },
          { c: "#f43f5e", l: "FATIGUED <36H" },
          { c: "#f59e0b", l: "RECOVERING 36-72H" },
          { c: "#14b8a6", l: "READY 72H+" },
        ]
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1">
      <span className="sys-label text-zinc-600">{mode === "volume" ? "VOLUME" : "RECOVERY"}</span>
      {items.map((it, i) => (
        // R16-a — legend rows rise per-slot on scroll-in (once, -8% margin);
        // re-arms on every sub-view switch because AtlasView remounts.
        <motion.span
          key={it.l}
          className="flex items-center gap-1.5"
          initial={reduce ? false : { opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: FLOW_EASE, delay: Math.min(i, 8) * 0.05 } }}
          viewport={{ once: true, margin: "-8% 0px" }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: it.c }} aria-hidden />
          <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">{it.l}</span>
        </motion.span>
      ))}
    </div>
  )
}

function MuscleChipRail({
  statsById,
  mode,
  selectedId,
  onSelect,
}: {
  statsById: Map<MuscleId, MuscleStat>
  mode: ColorMode
  selectedId: MuscleId | null
  onSelect: (id: MuscleId) => void
}) {
  const reduce = !!useReducedMotion()
  return (
    <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Muscle group selector">
      {MUSCLES.map((m, i) => {
        const stat = statsById.get(m.id)
        const c = mode === "volume" ? volumeColor(stat) : recoveryColor(stat)
        const active = selectedId === m.id
        return (
          // R16-a — chips rise per-slot when the rail scrolls into view
          // (once; re-arms on every sub-view switch because AtlasView
          // remounts). transition-all is scoped to the color set so CSS never
          // tweens framer's transform/opacity writes, and the press depth
          // moves to tapMotion — framer's resting inline transform would
          // neutralize the old active:scale class (R15-d switch-button
          // recipe; min-h-11 target unchanged).
          <motion.button
            key={m.id}
            type="button"
            onClick={() => onSelect(m.id)}
            aria-pressed={active}
            title={`${m.name} — ${stat ? `${stat.weeklySets} sets this week` : "no data"}`}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: FLOW_EASE, delay: Math.min(i, 8) * 0.05 } }}
            viewport={{ once: true, margin: "-8% 0px" }}
            {...tapMotion}
            className={cn(
              "flex min-h-11 items-center gap-2 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-bold tracking-[0.2em] uppercase transition-[color,background-color,border-color,box-shadow] focus-visible:outline focus-visible:outline-violet-400/70",
              active
                ? "border-violet-400/60 bg-violet-500/15 text-violet-200"
                : "border-zinc-800/80 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
            )}
          >
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: c, boxShadow: active ? `0 0 8px ${c}` : undefined }}
              aria-hidden
            />
            {m.name}
          </motion.button>
        )
      })}
    </div>
  )
}

function DetailPanel({
  stat,
  statsById,
  noData,
  onOpenLibrary,
}: {
  stat: MuscleStat | null
  statsById: Map<MuscleId, MuscleStat>
  noData: boolean
  onOpenLibrary: (m: MuscleId) => void
}) {
  // ── default: no muscle selected ──
  if (!stat) {
    let totalSets = 0
    let fatigued = 0
    for (const s of statsById.values()) {
      totalSets += s.weeklySets
      if (s.recovery === "fatigued") fatigued++
    }
    return (
      <SystemPanel label="MUSCLE DETAIL">
        <div className="p-4 sm:p-5">
          {noData ? (
            <div className="flex flex-col items-center gap-3 py-3 text-center">
              <EmptyGlyph className="h-20 w-20" />
              <p className="text-xs leading-relaxed text-zinc-400">No training data yet — log a session in Training.</p>
            </div>
          ) : (
            <>
              {/* R54-c3 — the empty-state trio stands down to one quiet line */}
              <p className="text-xs leading-relaxed text-zinc-400">Select a muscle to inspect it.</p>
              <div className="mt-4">
                <div className="sys-hairline" aria-hidden />
                <div className="mt-2.5 space-y-1.5">
                  <div
                    className="sys-accent-row flex items-center justify-between gap-3 rounded-r-sm px-2.5 py-1.5"
                    style={ROW_VIOLET}
                  >
                    <span className="font-mono text-[9px] tracking-[0.22em] text-zinc-400">TOTAL WEEKLY SETS</span>
                    <span className="font-mono text-lg font-bold tabular-nums text-zinc-100">{totalSets}</span>
                  </div>
                  <div
                    className="sys-accent-row flex items-center justify-between gap-3 rounded-r-sm px-2.5 py-1.5"
                    style={fatigued > 0 ? ROW_ROSE : ROW_ZINC}
                  >
                    <span className="font-mono text-[9px] tracking-[0.22em] text-zinc-400">FATIGUED MUSCLES</span>
                    <span
                      className={cn(
                        "font-mono text-lg font-bold tabular-nums",
                        fatigued > 0 ? "text-rose-300" : "text-zinc-100"
                      )}
                    >
                      {fatigued}
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </SystemPanel>
    )
  }

  // ── selected muscle ──
  const def = MUSCLE_BY_ID[stat.id]
  const guideline = stat.guideline
  const scaleMax = Math.max(guideline[1] * 1.3, stat.weeklySets * 1.15, 5)
  const markerPct = Math.min(100, (stat.weeklySets / scaleMax) * 100)
  const zoneL = Math.min(100, (guideline[0] / scaleMax) * 100)
  const zoneW = Math.max(0, Math.min(100, (guideline[1] / scaleMax) * 100) - zoneL)
  const trend = [0, 1, 2, 3].map((i) => stat.weeklyTrend[i] ?? 0)
  const trendMax = Math.max(1, ...trend)
  const rec = REC_PILL[stat.recovery]

  // antagonist balance hint
  const oppId = def.opposes
  const opp = oppId ? statsById.get(oppId) : undefined
  let balance: ReactNode = null
  let imbalance = false
  if (oppId && opp) {
    const oppDef = MUSCLE_BY_ID[oppId]
    const a = stat.weeklySets
    const b = opp.weeklySets
    if (a === 0 && b === 0) {
      balance = `Balance: no volume yet for ${def.name.toLowerCase()} / ${oppDef.name.toLowerCase()}.`
    } else if (a >= b * 1.5 && a > 0) {
      imbalance = true
      balance = `Balance: ${def.name.toLowerCase()} ${a} sets vs ${oppDef.name.toLowerCase()} ${b} — add ${
        oppDef.name.toLowerCase()
      } volume.`
    } else if (b >= a * 1.5 && b > 0) {
      imbalance = true
      balance = `Balance: ${def.name.toLowerCase()} ${a} sets vs ${oppDef.name.toLowerCase()} ${b} — add ${
        def.name.toLowerCase()
      } volume.`
    } else {
      balance = `Balance: ${def.name.toLowerCase()} ${a} sets vs ${oppDef.name.toLowerCase()} ${b} — well balanced.`
    }
  }

  return (
    <SystemPanel
      label={stat.name.toUpperCase()}
      labelAccent={
        <span className="rounded-sm border border-zinc-700/70 bg-zinc-900/60 px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] text-zinc-400">
          {stat.region.toUpperCase()}
        </span>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        <p className="text-[11px] leading-relaxed text-zinc-400">{def.function}</p>

        {/* weekly volume vs guideline */}
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <SysLabel>WEEKLY VOLUME</SysLabel>
            <span className="font-mono tabular-nums">
              <span className="text-xl font-bold text-zinc-100">{stat.weeklySets}</span>{" "}
              <span className="text-[10px] text-zinc-400">/ {guideline[0]}-{guideline[1]} SETS</span>
            </span>
          </div>
          <div className="relative mt-2 h-2.5 rounded-sm border border-zinc-800/60 bg-zinc-900/80">
            {/* R16-a — the guideline band sweeps open via MeterFlow inView
                (the readout sits below the fold on mobile, so the sweep waits
                for the reader; it replays on every selection because the
                panel content re-seats keyed). The current-volume marker and
                the track are unchanged. */}
            <MeterFlow
              pct={zoneW}
              duration={0.7}
              inView
              className="absolute inset-y-0 rounded-sm bg-gradient-to-r from-teal-500/50 to-amber-400/50"
              style={{ left: `${zoneL}%` }}
              aria-hidden
            >
              <span className="sys-seg sys-seg-sm" aria-hidden />
            </MeterFlow>
            <div
              className="absolute -top-1 h-[calc(100%+8px)] w-[3px] rounded-full bg-violet-300 shadow-[0_0_8px_rgba(167,139,250,0.8)]"
              style={{ left: `calc(${markerPct}% - 1.5px)` }}
              aria-hidden
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] tracking-[0.15em] text-zinc-600">
            <span>GUIDELINE {guideline[0]}-{guideline[1]}</span>
            {stat.secondarySets > 0 && <span>+{stat.secondarySets} SECONDARY SETS</span>}
          </div>
        </div>

        {/* recovery + last trained */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.2em]",
              rec.pill
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", rec.dot)} aria-hidden />
            {rec.label}
          </span>
          <span className="font-mono text-[10px] tracking-[0.15em] text-zinc-600">{formatLastTrained(stat.lastTrainedHoursAgo)}</span>
        </div>

        {/* 4-week trend */}
        <div>
          <SysLabel>4-WEEK TREND</SysLabel>
          <div className="mt-2 flex items-end gap-2">
            {trend.map((v, i) => (
              <div key={i} className="flex w-8 flex-col items-center gap-1">
                <div
                  className={cn("w-full rounded-sm", i === 3 ? "bg-violet-500" : "bg-zinc-700/70")}
                  style={{ height: `${3 + (v / trendMax) * 36}px` }}
                  aria-hidden
                />
                <span className="font-mono text-[8px] tracking-widest text-zinc-600">
                  {["W-3", "W-2", "W-1", "NOW"][i]}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* top exercises */}
        {stat.topExercises.length > 0 && (
          <div>
            <SysLabel>TOP EXERCISES</SysLabel>
            <div className="mt-2 space-y-1.5">
              {stat.topExercises.slice(0, 3).map((te) => (
                <button
                  key={te.name}
                  type="button"
                  onClick={() => onOpenLibrary(stat.id)}
                  title={`Show ${te.name} in the exercise library`}
                  className="sys-accent-row flex min-h-11 w-full items-center justify-between gap-2 rounded-r-sm px-2.5 py-2 text-left transition-colors hover:bg-violet-500/5 focus-visible:outline focus-visible:outline-violet-400/70"
                  style={ROW_VIOLET}
                >
                  <span className="truncate text-xs text-zinc-300">{te.name}</span>
                  <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums tracking-wider text-violet-300/80">
                    {te.sets} SETS
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* personal records */}
        {stat.prs.length > 0 && (
          <div>
            <SysLabel>PERSONAL BESTS</SysLabel>
            <div className="mt-2 space-y-1.5">
              {stat.prs.slice(0, 4).map((pr) => (
                <div
                  key={pr.name}
                  className="sys-accent-row flex items-center justify-between gap-2 rounded-r-sm px-2.5 py-1.5"
                  style={ROW_AMBER}
                >
                  <span className="truncate text-xs text-zinc-400">{pr.name}</span>
                  <span className="shrink-0 font-mono text-base font-bold tabular-nums text-amber-300">
                    {pr.value} {pr.unit}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* antagonist balance */}
        {balance && (
          <p
            className={cn(
              "border-l-2 pl-3 text-[11px] leading-relaxed",
              imbalance ? "border-amber-500/50 text-amber-200/80" : "border-teal-500/40 text-zinc-400"
            )}
          >
            {balance}
          </p>
        )}
      </div>
    </SystemPanel>
  )
}

// ── ATLAS view ────────────────────────────────────────────────────────────────

function AtlasView({ onOpenLibrary }: { onOpenLibrary: (m: MuscleId) => void }) {
  const { data, error, loading } = useApi<BodyDTO>("/api/body")
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const [mode, setMode] = useState<ColorMode>("volume")
  const [selectedId, setSelectedId] = useState<MuscleId | null>(null)
  const [viewCmd, setViewCmd] = useState<{ kind: ViewKind; seq: number } | null>(null)

  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  )
  const glOk = useMemo(() => typeof window === "undefined" || webglAvailable(), [])

  // stable stat map — keeps the 3D scene from churning on unrelated re-renders
  const statsById = useMemo(() => {
    const m = new Map<MuscleId, MuscleStat>()
    for (const s of data?.muscles ?? []) m.set(s.id, s)
    return m
  }, [data])

  const noTraining =
    !!data && data.muscles.length > 0 && data.muscles.every((s) => s.weeklySets === 0 && s.lastTrainedHoursAgo == null)

  const select = useCallback((id: MuscleId) => setSelectedId((s) => (s === id ? null : id)), [])
  const quickView = useCallback((kind: ViewKind) => {
    setViewCmd((v) => ({ kind, seq: (v?.seq ?? 0) + 1 }))
    if (kind === "reset") setSelectedId(null)
  }, [])

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1">
          <SkeletonPanel label="SCANNING BODY" rows={4} />
        </div>
        <div className="lg:w-[380px]">
          <SkeletonPanel label="SYNCING MUSCLE DATA" rows={3} />
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <SystemPanel label="BODY ATLAS">
        <div className="p-6 text-center">
          <p className="font-mono text-[10px] tracking-[0.25em] text-rose-300">SCAN FAILED — {error}</p>
          <button
            type="button"
            onClick={bumpRefresh}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-sm border border-violet-500/40 bg-violet-500/10 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            RETRY
          </button>
        </div>
      </SystemPanel>
    )
  }

  const canvasFallback = (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
      <p className="sys-label text-amber-300">3D UNAVAILABLE ON THIS DEVICE</p>
      <p className="max-w-[240px] text-xs leading-relaxed text-zinc-400">
        WebGL could not start — use the muscle chips below to inspect each group.
      </p>
    </div>
  )

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* R16-a — the scanner zone orchestrates its own mount stagger (replays
          on every sub-view switch); the WebGL scene internals are untouched —
          only this container-level flow was added. */}
      <FlowGroup className="min-w-0 flex-1 space-y-3">
        {/* scanner zone (violet: operator console) — the 02/TARGETING marker
            stood down; the panel below self-labels (R54-c3) */}
        {/* color mode + camera quick views — the row itself rides a FlowItem */}
        <FlowItem className="flex flex-wrap items-center gap-2">
          <Chip active={mode === "volume"} onClick={() => setMode("volume")} ariaLabel="Color muscles by weekly volume">
            Volume
          </Chip>
          <Chip active={mode === "recovery"} onClick={() => setMode("recovery")} ariaLabel="Color muscles by recovery state">
            Recovery
          </Chip>
          <span className="mx-1 hidden h-5 w-px bg-zinc-800 sm:block" aria-hidden />
          <Chip onClick={() => quickView("front")} ariaLabel="Rotate to front view">
            Front
          </Chip>
          <Chip onClick={() => quickView("back")} ariaLabel="Rotate to back view">
            Back
          </Chip>
          <Chip onClick={() => quickView("reset")} ariaLabel="Reset view and selection">
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reset
          </Chip>
        </FlowItem>

        {/* scene container — rises as the column's second stagger slot; the
            Canvas, mannequin, overlays and camera rig stay three.js-owned */}
        <FlowItem>
          <SystemPanel label="MUSCLE SCANNER">
            <div className="p-2 sm:p-3">
              {/* R54-c3 — the DRAG · SCROLL · TAP chrome line stands down; the
                  affordance rides this container's title (aria lives on the
                  Canvas below) */}
              <div
                className="relative h-[340px] overflow-hidden rounded-sm border border-zinc-800/70 bg-zinc-950 sm:h-[420px] lg:h-[520px]"
                title="Drag to rotate · scroll to zoom · tap a muscle"
              >
                {glOk ? (
                  <Canvas3DErrorBoundary fallback={canvasFallback}>
                    <Canvas
                      camera={{ position: [0, 1.5, 4.4], fov: 38 }}
                      dpr={[1, 1.75]}
                      gl={{ antialias: true, powerPreference: "high-performance" }}
                      onPointerMissed={() => setSelectedId(null)}
                      role="img"
                      aria-label="Interactive 3D body model — select a muscle group"
                    >
                      <AtlasScene
                        statsById={statsById}
                        mode={mode}
                        selectedId={selectedId}
                        viewCmd={viewCmd}
                        reducedMotion={reducedMotion}
                        onSelect={select}
                      />
                    </Canvas>
                  </Canvas3DErrorBoundary>
                ) : (
                  canvasFallback
                )}
              </div>

              <AtlasLegend mode={mode} />

              <MuscleChipRail statsById={statsById} mode={mode} selectedId={selectedId} onSelect={select} />

              {/* unmapped exercise footnote — the "coming from custom logs"
                  caption rides the label's title (R54-c3) */}
              {(data?.unmappedExercises.length ?? 0) > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
                  <span className="sys-label text-zinc-600" title="Coming from custom logs">
                    UNTRACKED
                  </span>
                  {data?.unmappedExercises.map((n) => (
                    <span
                      key={n}
                      className="rounded-sm border border-zinc-800 px-2 py-0.5 font-mono text-[9px] text-zinc-600"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SystemPanel>
        </FlowItem>
      </FlowGroup>

      {/* muscle detail, trends and PRs — scroll-revealed (below the fold on
          mobile, sidebar on desktop); the 03/READOUT marker stood down and the
          panel self-labels (R54-c3) */}
      <div className="w-full shrink-0 lg:w-[380px]">
        <FlowReveal>
          {/* R16-a — the readout re-seats with a rise on every selection change
              (keyed remount); its guideline band then sweeps open via the
              inView MeterFlow inside. */}
          <motion.div
            key={selectedId ?? "overview"}
            initial={reducedMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reducedMotion ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE }}
          >
            <DetailPanel
              stat={selectedId ? statsById.get(selectedId) ?? null : null}
              statsById={statsById}
              noData={noTraining}
              onOpenLibrary={onOpenLibrary}
            />
          </motion.div>
        </FlowReveal>
      </div>
    </div>
  )
}

// ── ATLAS: 04 / RECOVERY — muscle freshness map (R19-b, Fitbod parity) ─────────

/** GET /api/sessions response (gates-tab shape). */
type SessionsRes = { active: SessionDTO | null; history: SessionDTO[] }

/** Verdict skins — semantic hues on the house pill idiom (REC_PILL above). */
const FRESHNESS_SKIN: Record<FreshnessVerdict, { chip: string; numeral: string; bar: string; row: React.CSSProperties }> = {
  FRESH: {
    chip: "border-teal-500/50 bg-teal-500/10 text-teal-300",
    numeral: "text-teal-200",
    bar: "bg-gradient-to-r from-teal-500/70 to-teal-300/90",
    row: ROW_TEAL,
  },
  RECOVERING: {
    chip: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    numeral: "text-amber-200",
    bar: "bg-gradient-to-r from-amber-500/70 to-amber-300/90",
    row: ROW_AMBER,
  },
  FATIGUED: {
    chip: "border-rose-500/50 bg-rose-500/10 text-rose-300",
    numeral: "text-rose-200",
    bar: "bg-gradient-to-r from-rose-500/70 to-rose-300/90",
    row: ROW_ROSE,
  },
}

/** Compact recency line — LAST 30H · 4 SETS (minutes under 1h, days past 100h). */
function fmtFreshnessRecency(h: number | null, sets: number): string {
  if (h == null) return "NEVER TRAINED"
  const unit = h < 1 ? `${Math.max(1, Math.round(h * 60))}M` : h < 100 ? `${Math.round(h)}H` : `${Math.round(h / 24)}D`
  return `LAST ${unit} · ${sets} ${sets === 1 ? "SET" : "SETS"}`
}

/** One freshness cell — label · verdict chip · score numeral · meter · recency. */
function FreshnessCell({ m, index }: { m: MuscleFreshness; index: number }) {
  const reduce = !!useReducedMotion()
  const skin = FRESHNESS_SKIN[m.verdict]
  // R15-a kit count-up — the score numeral resolves with the cell rise and
  // glides on live freshness refetches (instant under reduced motion).
  const score = useCountUp(m.score, 0.7)
  return (
    // R16-a legend idiom — cells rise per-slot when scrolled into view (once,
    // -8% margin; re-arms on every sub-view switch because the atlas view
    // remounts). Non-interactive row: no 44px target required (R8-b spec).
    <motion.div
      role="listitem"
      data-muscle={m.muscleId}
      data-score={String(Math.round(m.score))}
      aria-label={`${m.muscleId} freshness ${Math.round(m.score)} of 100 — ${m.verdict}. ${
        m.hoursSince == null
          ? "Never trained."
          : `Last trained ${Math.round(m.hoursSince)} hours ago, ${m.setsSince} sets that day.`
      }`}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: FLOW_EASE, delay: Math.min(index, 8) * 0.04 } }}
      viewport={{ once: true, margin: "-8% 0px" }}
      className="sys-accent-row min-w-0 rounded-r-sm p-2.5 sm:p-3"
      style={skin.row}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[9px] font-bold tracking-[0.15em] text-zinc-300">{m.label}</span>
        <span
          className={cn("shrink-0 rounded-full border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.12em]", skin.chip)}
        >
          {m.verdict}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={cn("sys-display sys-display-md leading-none tabular-nums", skin.numeral)}>{Math.round(score)}</span>
        <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-400">/ 100</span>
      </div>
      {/* score meter — sweeps open when the reader scrolls the cell into view */}
      <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-zinc-900" aria-hidden>
        <MeterFlow pct={m.score} duration={0.7} inView className={cn("h-full rounded-sm", skin.bar)} />
      </div>
      <p className="mt-1 truncate font-mono text-[8px] tracking-[0.18em] text-zinc-400">
        {fmtFreshnessRecency(m.hoursSince, m.setsSince)}
      </p>
    </motion.div>
  )
}

/**
 * Muscle freshness map (was 04 / RECOVERY). Self-contained sessions fetch
 * (XpHeatmap / R18-d LoadConsole precedent) that rides the global
 * refreshKey: freshness recomputes live whenever sessions land. The pure
 * model + citations live in lib/recovery.ts (R54-c3 — the citation wall
 * rides the panel accent's title attr, not the surface).
 */
function FreshnessPanel({ tz }: { tz?: string | null }) {
  const { data, error, loading } = useApi<SessionsRes>("/api/sessions")
  // frozen at data-arrival — recency granularity is hours, and every
  // refreshKey bump re-fetches (new data object → fresh view + fresh clock).
  // R70 — day attribution rolls with the hunter's timezone (BodyAtlasTab
  // threads hunter.timezone in; lib/recovery's own R70 tz param).
  const view = useMemo(
    () => (data ? recoveryView(data.history, new Date(), tz) : null),
    [data, tz],
  )
  const reduce = !!useReducedMotion()

  if (loading && !data) {
    return <SkeletonPanel label="SYNCING SESSIONS" rows={4} />
  }
  if (!view) {
    return (
      <SystemPanel label="MUSCLE FRESHNESS">
        <div className="p-6 text-center">
          <p className="font-mono text-[10px] tracking-[0.25em] text-rose-300">SYNC FAILED — {error}</p>
        </div>
      </SystemPanel>
    )
  }

  const topReady = view.ready.slice(0, 3)

  return (
    <SystemPanel
      label="MUSCLE FRESHNESS"
      labelAccent={
        /* R54-c3 — the meaning lives behind the freshness hint; the full
           formula/citation wall rides the accent's title attr */
        <span className="inline-flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-widest text-zinc-400" title={RECOVERY_FOOTER}>
            48–72H MODEL
          </span>
          <InfoHint term="freshness" />
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        {view.emptyNote ? (
          <div className="mt-3 flex items-center gap-3 rounded-sm border border-zinc-800/70 bg-zinc-950/40 px-3 py-3">
            <EmptyGlyph className="h-10 w-10 shrink-0" />
            <p className="text-[11px] leading-relaxed text-zinc-400">{view.emptyNote}</p>
          </div>
        ) : (
          <motion.div
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2"
            initial={reduce ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: FLOW_EASE } }}
            viewport={{ once: true, margin: "-8% 0px" }}
          >
            <span className="sys-label text-teal-300">READY TO TRAIN</span>
            <span className="font-mono text-lg font-bold tabular-nums leading-none text-teal-200">
              {view.ready.length}
              <span className="text-[9px] font-normal tracking-[0.15em] text-zinc-400"> / {view.muscles.length}</span>
            </span>
            {topReady.map((id) => (
              <span
                key={id}
                className="rounded-full border border-teal-500/50 bg-teal-500/10 px-2.5 py-1 font-mono text-[9px] font-bold tracking-[0.18em] text-teal-300"
              >
                {id}
              </span>
            ))}
            {view.recovering.length > 0 && (
              <span className="w-full font-mono text-[9px] tracking-[0.18em] text-amber-300/90">
                STILL RECOVERING · {view.recovering.join(" · ")}
              </span>
            )}
          </motion.div>
        )}

        {/* the grid — fatigue-ascending: what to avoid sits on top; the
            steering editorial rides its title (R54-c3) */}
        <div
          className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-2.5"
          role="list"
          aria-label="Muscle freshness — recovery score, verdict and last-trained recency per muscle"
          title="Each muscle's recovery state from last-trained recency — steer toward the fresh, away from the fatigued."
        >
          {view.muscles.map((m, i) => (
            <FreshnessCell key={m.muscleId} m={m} index={i} />
          ))}
        </div>
      </div>
    </SystemPanel>
  )
}

// ── LIBRARY view ──────────────────────────────────────────────────────────────

const TYPE_CHIP: Record<ExerciseType, string> = {
  strength: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  bodyweight: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  cardio: "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-300",
  mobility: "border-teal-500/40 bg-teal-500/10 text-teal-300",
}

// R10-a — de-boxed library rows: the exercise TYPE carries the accent hue
// (same pre-existing palette as TYPE_CHIP above)
const TYPE_ACCENT: Record<ExerciseType, React.CSSProperties> = {
  strength: ROW_AMBER,
  bodyweight: ROW_ROSE,
  cardio: {
    "--row-accent": "rgba(232,121,249,0.65)",
    "--row-lift": "rgba(232,121,249,0.06)",
  } as React.CSSProperties,
  mobility: ROW_TEAL,
}

const MUSCLE_CHIP_PRIMARY =
  "border-violet-500/50 bg-violet-500/10 text-violet-300 hover:border-violet-400/70 hover:text-violet-200"
const MUSCLE_CHIP_SECONDARY =
  "border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"

function ExerciseRow({
  ex,
  index,
  onMuscleClick,
}: {
  ex: ExerciseDef
  index: number
  onMuscleClick: (m: MuscleId) => void
}) {
  const [cuesOpen, setCuesOpen] = useState(false)
  // R6-a — science note + same-pattern equipment swaps, revealed on demand
  const [sciOpen, setSciOpen] = useState(false)
  const reduce = !!useReducedMotion()
  const swapEntries = variantsFor(ex.id)
  return (
    // R16-a — rows wave in on mount (opacity + 10px rise, 0.45s FLOW_EASE,
    // delay min(index,8)·0.05 so long lists queue ≤0.4s). Motion rides the
    // EXISTING row element; keys stay stable across filter changes, so only
    // genuinely-new rows animate.
    <motion.div
      role="listitem"
      className="sys-accent-row rounded-r-sm p-3 sm:p-4"
      style={TYPE_ACCENT[ex.type]}
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.45, ease: FLOW_EASE, delay: Math.min(index, 8) * 0.05 }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold text-zinc-100">{ex.name}</p>
        <span
          className={cn(
            "rounded-sm border px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.2em] uppercase",
            TYPE_CHIP[ex.type]
          )}
        >
          {ex.type}
        </span>
        <span className="rounded-sm border border-zinc-700/70 bg-zinc-900/40 px-2 py-0.5 font-mono text-[9px] tracking-[0.2em] text-zinc-400 uppercase">
          {ex.equipment}
        </span>
        <span className="flex items-center gap-1" title={`Difficulty ${ex.difficulty}/3`}>
          {[1, 2, 3].map((d) => (
            <span
              key={d}
              className={cn("h-1.5 w-1.5 rounded-full", d <= ex.difficulty ? "bg-zinc-400" : "bg-zinc-700")}
              aria-hidden
            />
          ))}
          <span className="sr-only">difficulty {ex.difficulty} of 3</span>
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {ex.muscles.primary.map((id) => (
          <button
            key={`p-${id}`}
            type="button"
            onClick={() => onMuscleClick(id)}
            title={`Filter by ${MUSCLE_BY_ID[id].name}`}
            className={cn(
              "rounded-sm border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.15em] uppercase transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
              MUSCLE_CHIP_PRIMARY
            )}
          >
            {MUSCLE_BY_ID[id].name}
          </button>
        ))}
        {ex.muscles.secondary.length > 0 && <span className="mx-1 h-3 w-px bg-zinc-800" aria-hidden />}
        {ex.muscles.secondary.map((id) => (
          <button
            key={`s-${id}`}
            type="button"
            onClick={() => onMuscleClick(id)}
            title={`Filter by ${MUSCLE_BY_ID[id].name}`}
            className={cn(
              "rounded-sm border px-2 py-1 font-mono text-[9px] font-bold tracking-[0.15em] uppercase transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
              MUSCLE_CHIP_SECONDARY
            )}
          >
            {MUSCLE_BY_ID[id].name}
          </button>
        ))}
      </div>

      <Collapsible open={cuesOpen} onOpenChange={setCuesOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            aria-expanded={cuesOpen}
            className="mt-2.5 flex items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.25em] text-zinc-600 transition-colors hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            FORM CUES
            <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", cuesOpen && "rotate-180")} aria-hidden />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          <ul className="space-y-1.5 border-l border-violet-500/20 pl-3">
            {ex.cues.map((c, i) => (
              <li key={i} className="text-[11px] leading-snug text-zinc-400">
                {c}
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      {/* R6-a — evidence affordance: one 44px toggle reveals the science note + equipment swaps */}
      <Collapsible open={sciOpen} onOpenChange={setSciOpen}>
        <CollapsibleTrigger asChild>
          <motion.button
            type="button"
            aria-expanded={sciOpen}
            {...tapMotion}
            className="mt-1 flex min-h-11 w-full items-center gap-1.5 font-mono text-[9px] font-bold tracking-[0.25em] text-zinc-600 transition-colors hover:text-teal-300 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <FlaskConical className="h-3 w-3 shrink-0 text-teal-400/70" aria-hidden />
            EVIDENCE
            {swapEntries.length > 0 && (
              <span className="text-violet-400/60" aria-hidden>
                · SWAPS
              </span>
            )}
            <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", sciOpen && "rotate-180")} aria-hidden />
          </motion.button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2">
          {ex.science ? (
            <p className="border-l border-teal-500/30 pl-3 text-[11px] leading-snug text-zinc-400">{ex.science}</p>
          ) : null}
          {swapEntries.length > 0 && (
            <p className="mt-1.5 border-l border-violet-500/25 pl-3 font-mono text-[9px] tracking-wider text-zinc-400">
              <span className="text-violet-300/70">SWAPS → </span>
              {swapEntries.map((v) => `${v.name} (${v.equipment})`).join(" · ")}
            </p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </motion.div>
  )
}

function LibrarySelect({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={ariaLabel}
        className="h-11 w-full border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70 sm:w-[150px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
        {options.map((o) => (
          <SelectItem
            key={o.value}
            value={o.value}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200"
          >
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function LibraryView({ focusMuscle }: { focusMuscle: MuscleId | null }) {
  // initialized at mount from an ATLAS "top exercises" jump; the view is
  // unmounted while on other sub-views, so a fresh jump re-mounts with the
 // new filter — no effect needed.
  const [q, setQ] = useState("")
  const [type, setType] = useState<"all" | ExerciseType>("all")
  const [equip, setEquip] = useState<string>("all")
  const [muscle, setMuscle] = useState<"all" | MuscleId>(focusMuscle ?? "all")
  const [diff, setDiff] = useState<"all" | "1" | "2" | "3">("all")

  const equipmentOptions = useMemo(
    () => Array.from(new Set(EXERCISE_LIBRARY.map((e) => e.equipment))).sort(),
    []
  )

  const filtered = useMemo(() => {
    const nq = q.trim().toLowerCase()
    return EXERCISE_LIBRARY.filter((ex) => {
      if (nq) {
        const hay = [ex.name, ...ex.aliases].join(" ").toLowerCase()
        if (!hay.includes(nq)) return false
      }
      if (type !== "all" && ex.type !== type) return false
      if (equip !== "all" && ex.equipment !== equip) return false
      if (muscle !== "all" && !ex.muscles.primary.includes(muscle) && !ex.muscles.secondary.includes(muscle)) return false
      if (diff !== "all" && ex.difficulty !== Number(diff)) return false
      return true
    })
  }, [q, type, equip, muscle, diff])

  return (
    <div>
      {/* exercise science database (teal zone) — the 02/LIBRARY marker stood
          down; the panel self-labels (R54-c3) */}
      <SystemPanel
      label="EXERCISE LIBRARY"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {filtered.length} EXERCISES
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        {/* controls */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" aria-hidden />
            <Input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search exercises…"
              aria-label="Search exercises"
              className="h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 pl-9 font-mono text-xs tracking-wider text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <LibrarySelect
              ariaLabel="Filter by exercise type"
              value={type}
              onChange={(v) => setType(v as "all" | ExerciseType)}
              options={[
                { value: "all", label: "All types" },
                { value: "strength", label: "Strength" },
                { value: "bodyweight", label: "Bodyweight" },
                { value: "cardio", label: "Cardio" },
                { value: "mobility", label: "Mobility" },
              ]}
            />
            <LibrarySelect
              ariaLabel="Filter by equipment"
              value={equip}
              onChange={setEquip}
              options={[
                { value: "all", label: "All equipment" },
                ...equipmentOptions.map((e) => ({ value: e, label: e })),
              ]}
            />
            <LibrarySelect
              ariaLabel="Filter by muscle group"
              value={muscle}
              onChange={(v) => setMuscle(v as "all" | MuscleId)}
              options={[
                { value: "all", label: "All muscles" },
                ...MUSCLES.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
            <LibrarySelect
              ariaLabel="Filter by difficulty"
              value={diff}
              onChange={(v) => setDiff(v as "all" | "1" | "2" | "3")}
              options={[
                { value: "all", label: "All levels" },
                { value: "1", label: "1 · Beginner" },
                { value: "2", label: "2 · Medium" },
                { value: "3", label: "3 · Advanced" },
              ]}
            />
          </div>
        </div>

        {/* results */}
        <div className="scroll-sys mt-4 max-h-[560px] space-y-2 overflow-y-auto pr-1" role="list" aria-label="Exercise results">
          {filtered.map((ex, i) => (
            <ExerciseRow key={ex.id} ex={ex} index={i} onMuscleClick={(m) => setMuscle(m)} />
          ))}
          {filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <EmptyGlyph className="h-16 w-16" />
              <p className="font-mono text-xs tracking-[0.25em] text-zinc-600">NO EXERCISES MATCH</p>
            </div>
          )}
        </div>
      </div>
    </SystemPanel>
    </div>
  )
}

// ── TOOLS view ────────────────────────────────────────────────────────────────

function fmtOne(n: number): string {
  return String(Math.round(n * 10) / 10)
}

function fmtPlate(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2)
}

function OneRmPanel() {
  const [weight, setWeight] = useState(60)
  const [reps, setReps] = useState(5)

  const epley = epley1RM(weight, reps)
  const brzycki = brzycki1RM(weight, reps)
  // R16-a — the two 1RM numerals count up from 0 on mount (replaying on
  // every sub-view switch) and glide between values as the inputs change.
  const epleyShown = useCountUp(epley)
  const brzyckiShown = useCountUp(brzycki)
  const table = useMemo(() => repMaxTable(epley), [epley])
  const warmup = useMemo(() => {
    const r25 = (n: number) => Math.max(0, Math.round(n / 2.5) * 2.5)
    // R69 — the ONE ramp voice (strength-science WARMUP_RAMP, McGowan 2015):
    // this panel was the last inline 40/60/80 × 5/3/1 holdout.
    return WARMUP_RAMP.map(({ pct, reps }) => ({
      pct,
      reps,
      w: r25((epley * pct) / 100),
    }))
  }, [epley])

  const inputCls =
    "mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"

  return (
    <SystemPanel
      label="ONE-REP MAX CALCULATOR"
      labelAccent={
        /* R54-c3 — the "estimates only" safety note stands down into a hint */
        <InfoHint label="1RM estimates" body="Estimates only — stay safe, leave 1–2 reps in reserve." />
      }
    >
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <SysLabel>WEIGHT (KG)</SysLabel>
            <Input
              type="number"
              min={0}
              step={2.5}
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value) || 0)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <SysLabel>REPS (1-12)</SysLabel>
            <Input
              type="number"
              min={1}
              max={12}
              step={1}
              inputMode="numeric"
              value={reps}
              onChange={(e) => {
                const v = Number(e.target.value)
                setReps(Number.isFinite(v) ? Math.min(12, Math.max(0, Math.round(v))) : 0)
              }}
              className={inputCls}
            />
          </label>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-sm border border-violet-500/20 bg-violet-500/5 p-3 text-center">
            <SysLabel>EPLEY 1RM</SysLabel>
            <p className="text-glow-violet sys-display sys-display-md mt-1 text-violet-200">{fmtOne(epleyShown)}</p>
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-zinc-600">KG</p>
          </div>
          <div className="rounded-sm border border-fuchsia-500/20 bg-fuchsia-500/5 p-3 text-center">
            <SysLabel>BRZYCKI 1RM</SysLabel>
            <p className="sys-display sys-display-md mt-1 text-fuchsia-200">{fmtOne(brzyckiShown)}</p>
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.2em] text-zinc-600">KG</p>
          </div>
        </div>

        <div className="mt-4">
          <SysLabel>PERCENTAGES OF EPLEY MAX</SysLabel>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {table.map((row) => {
              const w = Math.round(row.weight / 1.25) * 1.25
              return (
                <div
                  key={row.pct}
                  className="flex items-baseline justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-2.5 py-1.5"
                >
                  <span className="font-mono text-[10px] tabular-nums text-zinc-400">{row.pct}%</span>
                  <span className="font-mono text-xs font-bold tabular-nums text-zinc-200">{fmtPlate(w)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-4 font-mono text-[10px] tracking-wider text-zinc-400">
          WARM-UP: {warmup.map((s) => `${s.pct}% ${fmtPlate(s.w)}KG ×${s.reps}`).join(" · ")}
        </p>
      </div>
    </SystemPanel>
  )
}

const PLATE_COLOR: Record<number, string> = {
  25: "bg-rose-500/80",
  20: "bg-violet-500/80",
  15: "bg-amber-500/80",
  10: "bg-teal-500/80",
  5: "bg-zinc-400/80",
  2.5: "bg-zinc-600",
  1.25: "bg-zinc-600",
}

const BARS = [
  { kg: 20, label: "20 KG OLYMPIC" },
  { kg: 15, label: "15 KG" },
  { kg: 10, label: "10 KG" },
  { kg: 7, label: "7 KG TECHNIQUE" },
]

function perSideText(plates: { plate: number; count: number }[] | null): string {
  if (!plates) return ""
  if (plates.length === 0) return "NO PLATES — BARE BAR"
  return plates.map((p) => `${p.count}×${p.plate}`).join(" · ")
}

function PlateLoaderPanel() {
  const [target, setTarget] = useState(100)
  const [bar, setBar] = useState(20)
  const reduce = !!useReducedMotion()

  const plates = useMemo(() => platesFor(target, bar), [target, bar])

  // nearest reachable total when the exact target can't be loaded
  const nearest = useMemo(() => {
    if (plates !== null) return null
    const step = 2.5
    const base = Math.max(bar, 0)
    if (target < base) return base
    const k = (target - base) / step
    const lo = base + Math.floor(k + 1e-9) * step
    const hi = base + Math.ceil(k - 1e-9) * step
    return target - lo <= hi - target ? lo : hi
  }, [plates, target, bar])
  const nearestPlates = useMemo(
    () => (nearest == null ? null : platesFor(nearest, bar)),
    [nearest, bar]
  )

  const shown = plates ?? nearestPlates ?? []
  const perSide = (plates ? target : nearest ?? bar) - bar > 0 ? ((plates ? target : nearest ?? bar) - bar) / 2 : 0

  // R16-a — flat disc list with stable keys and a load-on ordinal, so discs
  // spring onto the sleeve slot by slot and only genuinely-new discs animate
  // when the target changes (surviving keys keep their identity).
  const discs: { plate: number; key: string; slot: number }[] = []
  for (const entry of shown) {
    for (let i = 0; i < entry.count; i++) {
      discs.push({ plate: entry.plate, key: `${entry.plate}-${i}`, slot: discs.length })
    }
  }

  return (
    <SystemPanel label="BARBELL PLATE LOADER">
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <SysLabel>TARGET (KG)</SysLabel>
            <Input
              type="number"
              min={0}
              step={2.5}
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value) || 0)}
              className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
            />
          </label>
          <div>
            <SysLabel>BAR</SysLabel>
            <Select value={String(bar)} onValueChange={(v) => setBar(Number(v))}>
              <SelectTrigger
                aria-label="Bar weight"
                className="mt-1.5 h-11 w-full rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
                {BARS.map((b) => (
                  <SelectItem
                    key={b.kg}
                    value={String(b.kg)}
                    className="font-mono text-[10px] tracking-[0.15em] text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200"
                  >
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {plates === null && (
          <div className="mt-4 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3">
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-amber-300">CANNOT LOAD EXACTLY</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
              Nearest loadable is <span className="font-mono font-bold text-amber-200">{fmtPlate(nearest ?? bar)} kg</span>
              {nearestPlates && nearestPlates.length > 0 && (
                <>
                  {" "}— per side: {perSideText(nearestPlates)}
                </>
              )}
              .
            </p>
          </div>
        )}

        {/* per-side visual stack */}
        <div className="mt-4">
          <SysLabel>PER SIDE — {plates === null ? `NEAREST ${fmtPlate(nearest ?? bar)} KG` : `${fmtPlate(target)} KG`}</SysLabel>
          <div className="scroll-sys mt-2 flex items-center gap-1.5 overflow-x-auto pb-1">
            <div className="h-2 w-14 shrink-0 rounded-sm bg-gradient-to-r from-zinc-700 to-zinc-600" aria-label="Bar sleeve" />
            {discs.map((d) => (
              <motion.div
                key={d.key}
                className={cn("shrink-0 rounded-full", PLATE_COLOR[d.plate] ?? "bg-zinc-600")}
                style={{
                  width: `${Math.max(14, (d.plate / 25) * 60)}px`,
                  height: `${Math.max(7, (d.plate / 25) * 18)}px`,
                }}
                initial={reduce ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { ...SPRING_SNAPPY, delay: Math.min(d.slot, 8) * 0.04 }}
                title={`${d.plate} kg plate`}
                aria-hidden
              />
            ))}
            <div className="h-2 w-5 shrink-0 rounded-sm bg-zinc-700" aria-hidden />
          </div>
          <p className="mt-2 font-mono text-[10px] tracking-[0.15em] text-zinc-400">
            PER SIDE: {perSideText(shown) || "—"}
            {perSide > 0 && <span className="text-zinc-600"> · {fmtPlate(perSide)} KG/SIDE</span>}
          </p>
        </div>
      </div>
    </SystemPanel>
  )
}

function playBeep(ctx: AudioContext) {
  try {
    const t0 = ctx.currentTime + 0.02
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const t = t0 + i * 0.24
      osc.type = "sine"
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(t)
      osc.stop(t + 0.22)
    }
  } catch {
    /* audio unavailable */
  }
}

const REST_PRESETS = [45, 60, 90, 120, 180]

function RestTimerPanel() {
  const [duration, setDuration] = useState(90)
  const [remaining, setRemaining] = useState(90)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const endAtRef = useRef<number | null>(null)
  const audioRef = useRef<AudioContext | null>(null)

  // cleanup audio context + interval on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.close().catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const endAt = endAtRef.current
      if (endAt == null) return
      const left = (endAt - Date.now()) / 1000
      if (left <= 0) {
        endAtRef.current = null
        setRemaining(0)
        setRunning(false)
        setFinished(true)
        const ctx = audioRef.current
        if (ctx) playBeep(ctx)
      } else {
        setRemaining(left)
      }
    }, 200)
    return () => window.clearInterval(id)
  }, [running])

  // audio context is only created after a user gesture (autoplay policy)
  const ensureAudio = () => {
    try {
      if (!audioRef.current) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!Ctor) return
        audioRef.current = new Ctor()
      }
      void audioRef.current.resume().catch(() => {})
    } catch {
      /* audio unavailable */
    }
  }

  const start = () => {
    ensureAudio()
    if (finished || remaining <= 0) {
      setRemaining(duration)
      setFinished(false)
      endAtRef.current = Date.now() + duration * 1000
    } else {
      endAtRef.current = Date.now() + remaining * 1000
    }
    setRunning(true)
  }

  const pause = () => {
    const endAt = endAtRef.current
    if (endAt != null) setRemaining(Math.max(0, (endAt - Date.now()) / 1000))
    endAtRef.current = null
    setRunning(false)
  }

  const reset = () => {
    endAtRef.current = null
    setRunning(false)
    setFinished(false)
    setRemaining(duration)
  }

  const pick = (s: number) => {
    setDuration(s)
    setFinished(false)
    if (running) endAtRef.current = Date.now() + s * 1000
    setRemaining(s)
  }

  const elapsed = Math.max(0, duration - remaining)
  const pausedMid = !running && !finished && remaining > 0 && remaining < duration
  const startLabel = finished ? "RESTART" : pausedMid ? "RESUME" : "START"

  return (
    <SystemPanel
      label="REST TIMER"
      labelAccent={
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.25em]",
            running ? "text-violet-300" : finished ? "text-teal-300" : "text-zinc-600"
          )}
        >
          {running ? "RUNNING" : finished ? "COMPLETE" : "READY"}
        </span>
      }
      className={finished ? "animate-pulse" : undefined}
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          {REST_PRESETS.map((s) => (
            <Chip key={s} active={duration === s} onClick={() => pick(s)} ariaLabel={`${s} second rest`}>
              {s}S
            </Chip>
          ))}
          <label className="flex items-center gap-2">
            <span className="sys-label text-zinc-600">CUSTOM</span>
            <Input
              type="number"
              min={5}
              max={3600}
              step={5}
              inputMode="numeric"
              value={duration}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v > 0) pick(Math.min(3600, Math.round(v)))
              }}
              aria-label="Custom rest duration in seconds"
              className="h-11 w-24 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
            />
          </label>
        </div>

        <div className="mt-5 text-center">
          {finished && <p className="sys-label text-teal-300">REST COMPLETE — NEXT SET</p>}
          <p
            className={cn(
              "sys-display sys-display-xl",
              finished ? "sys-bloom text-glow-violet text-violet-200" : running ? "text-violet-100" : "text-zinc-300"
            )}
            aria-live="off"
          >
            {fmtClock(Math.ceil(remaining))}
          </p>
          {pausedMid && (
            <p className="mt-2 font-mono text-[10px] tracking-[0.2em] text-zinc-400">
              PAUSED — {fmtClock(elapsed)} ELAPSED
            </p>
          )}
        </div>

        <div className="relative mt-4 h-1.5 overflow-hidden rounded-sm bg-zinc-900">
          <div
            className="h-full rounded-sm bg-gradient-to-r from-violet-700 to-fuchsia-400 transition-[width] duration-200"
            style={{ width: `${Math.min(100, (remaining / Math.max(duration, 1)) * 100)}%` }}
            aria-hidden
          />
          <span className="sys-seg" aria-hidden />
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={running ? pause : start}
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm border border-violet-500/40 bg-violet-500/10 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/20 focus-visible:outline focus-visible:outline-violet-400/70 active:scale-[0.99]"
          >
            {running ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden />
                PAUSE
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden />
                {startLabel}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={reset}
            className="flex min-h-11 items-center justify-center gap-2 rounded-sm border border-zinc-800 bg-zinc-950/60 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 transition-all hover:border-zinc-700 hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70 active:scale-[0.99]"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            RESET
          </button>
        </div>
      </div>
    </SystemPanel>
  )
}

function ToolsView() {
  return (
    // R16-a — the tool panels rise staggered on every sub-view switch
    // (FlowGroup orchestration); the rest timer keeps its below-fold
    // FlowReveal entrance, and its LIVE countdown bar is deliberately
    // untouched — live progress never rides MeterFlow.
    <FlowGroup className="space-y-4">
      {/* client-side calculator bench (violet: operator zone) — the
          02/TOOLKIT marker stood down (R54-c3) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FlowItem>
          <OneRmPanel />
        </FlowItem>
        <FlowItem>
          <PlateLoaderPanel />
        </FlowItem>
      </div>
      <FlowReveal>
        <RestTimerPanel />
      </FlowReveal>
    </FlowGroup>
  )
}

// ── Top-level tab component ───────────────────────────────────────────────────

export function BodyAtlasTab({ hunter: _hunter }: { hunter: HunterDTO }) {
  const [view, setView] = useState<AtlasViewMode>("atlas")
  const [focusMuscle, setFocusMuscle] = useState<MuscleId | null>(null)
  const reduce = !!useReducedMotion()
  // R10-a — read-only window onto /api/metrics for the BIOMASS hero (latest
  // logged body weight + height/BMI micro-stats). GET only; no mutations.
  const metricsApi = useApi<MetricsHeroRes>("/api/metrics")
  // R47 — the LIVE /api/insights consumer. Mount-level on purpose: the route
  // carries two designed side effects (ACWR deload-advised → today's Recovery
  // Directive quest injection; body-fat goal first crossing → achievement +
  // 200 XP + celebrate flag) that had NO live fetcher after the R46 dead-code
  // exorcism — opening BODY now fires them, and the metrics sub-view renders
  // the analysis surfaces below (see body-insights.tsx).
  const insightsApi = useApi<InsightsDTO>("/api/insights")

  const openLibraryFor = useCallback((m: MuscleId) => {
    setFocusMuscle(m)
    setView("library")
  }, [])

  return (
    // Plain root (not a variant node) keeps whileInView in charge of the
    // below-fold reveal; the FlowGroup orchestrates the masthead only (the
    // R9-c gating pattern — see fuel-tab / vitals-tab).
    <div className="space-y-4 sm:space-y-5">
      <FlowGroup className="space-y-4 sm:space-y-5">
        <FlowItem>
          <OracleTip tab="body" />
        </FlowItem>

        {/* tab header */}
        <FlowItem>
          <header className="flex items-center gap-3 sm:gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-violet-400/40 bg-violet-500/10">
              <PersonStanding
                className="h-6 w-6 text-violet-300 drop-shadow-[0_0_6px_rgba(167,139,250,0.5)]"
                aria-hidden
              />
            </div>
            <div className="min-w-0">
              <DecodeText
                text="BODY ATLAS"
                as="h2"
                className="font-mono text-sm font-bold tracking-[0.3em] text-violet-200"
              />
              {/* R54-c3 — the SCANNER · LIBRARY · TOOLS · METRICS banner stood
                  down: the sub-view chips directly below are the controls */}
            </div>
          </header>
        </FlowItem>

        {/* R47 — body-fat goal celebration (side-effect ②'s designed surface;
            renders only while bodyComp.celebrate is live — first crossing +
            2-minute window, per the route's contract) */}
        {insightsApi.data && (
          <FlowItem>
            <BodyCompCelebrateBanner data={insightsApi.data} />
          </FlowItem>
        )}

        {/* the tab's hero numeral moment — the 01/BIOMASS marker stood down
            (the hero self-labels BODY MASS; R54-c3) */}
        <FlowItem>
          <BiomeHero data={metricsApi.data} loading={metricsApi.loading} />
        </FlowItem>

        {/* sub-view toggle */}
        <FlowItem>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Body atlas views">
            <Chip active={view === "atlas"} onClick={() => setView("atlas")} className="px-4">
              Atlas
            </Chip>
            <Chip
              active={view === "library"}
              onClick={() => {
                setFocusMuscle(null) // direct entry starts unfiltered
                setView("library")
              }}
              className="px-4"
            >
              Library
            </Chip>
            <Chip active={view === "tools"} onClick={() => setView("tools")} className="px-4">
              Tools
            </Chip>
            <Chip active={view === "metrics"} onClick={() => setView("metrics")} className="px-4">
              <Activity className="h-3.5 w-3.5" aria-hidden /> Metrics
            </Chip>
          </div>
        </FlowItem>
      </FlowGroup>

      {/* below-fold swap zone — reveals once on scroll, then each sub-view
          swaps through the R15 rewards-hub veil: a 0.25s FLOW_EASE fade-rise
          (reduce-gated) over fresh inner staggers that replay per switch. */}
      <FlowReveal>
        <motion.div
          key={view}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduce ? { duration: 0 } : { duration: 0.25, ease: FLOW_EASE }}
        >
          {view === "atlas" && <AtlasView onOpenLibrary={openLibraryFor} />}
          {view === "atlas" && (
            <FlowReveal className="mt-4">
              {/* muscle freshness map (teal: science zone). R19-b: rendered as a
                  view-gated sibling below the ATLAS scanner/readout row (the
                  tab's muscle-analytics surface) so AtlasView's R16-a flex
                  layout stays byte-untouched. The 04/RECOVERY marker stood down
                  with the other headers (R54-c3). */}
              <FreshnessPanel tz={_hunter.timezone} />
            </FlowReveal>
          )}
          {view === "library" && <LibraryView focusMuscle={focusMuscle} />}
          {view === "tools" && <ToolsView />}
          {view === "metrics" && (
            <>
              {/* body metrics suite (teal: science/data zone) — the
                  02/TELEMETRY marker stood down (R54-c3) */}
              <BodyMetrics hunter={_hunter} />
              {/* R47: the live /api/insights verdict surfaces (body composition
                  + seven domain verdicts). TELEMETRY = the inputs the user
                  logs; ANALYSIS = what the System concludes from them — the
                  03/ANALYSIS marker stood down with the rest (R54-c3). */}
              <div className="mt-5">
                <BodyInsights data={insightsApi.data} loading={insightsApi.loading} />
              </div>
            </>
          )}
        </motion.div>
      </FlowReveal>
    </div>
  )
}
