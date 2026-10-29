"use client"

// ── PRIME · Fuel tab (Task 13-b) ──────────────────────────────────────────────
// Nutrition & hydration tracker over /api/nutrition (Task 13-a backend):
// animated calorie ring + macro bars, one-tap water tracker, four meal
// sections fed by the 202-food database browser (R71-a: the PICK · EXACT
// dropdown-first picker — exact database values, no estimates; plus custom
// foods), a
// body-profile calibration dialog with a live Mifflin-St Jeor target preview,
// and a 7-day calorie + water history chart. MyFitnessPal-caliber logging
// in the SYSTEM-window aesthetic.
// R9 (FLOW & IDENTITY): the kcal ring + protein grams became display moments
// (count-up numerals, segmented macro meters), editorial 01/02/03 section
// headers, accent rows in the logs, and a scroll-revealed science/history tail.
// R11-a (ADOPTION & FINISH): meal-entry rows gained swipe-to-delete — each row
// rides SwipeRow with a rose destructive rail under an opaque sheet; the X
// button stays the accessible path (the gesture self-disables under reduced
// motion).
// R14-c (DAILY LISTS FLOW): every visit now flows — the kcal ring's arc sweeps
// in from empty (motion.circle, activity-rings recipe) with its numerals in
// lockstep, the macro bars ride MeterFlow fills (mount from 0), and the
// meal-entry rows themselves rise in staggered (delay i * 0.05) instead of
// mounting as a static list.
// R17-A (MICROS): Cronometer/MyFitnessPal micronutrient layer — a 02/MICROS
// zone (fiber goal bar + sodium/sugar ceiling bars with amber/rose over-cap
// semantics) under the intake hero; food-search rows and catalog-derived meal
// entries carry FIB/NA/SUG micro sub-lines; manual/custom entries stay
// micro-free (server defaults 0 — hand-typed micros are a follow-up candidate).
// R18-b (MICROS · MANUAL PARITY): the follow-up landed — the Custom tab of the
// add-food dialog gains three compact per-serving micro inputs (FIB g ·
// NA mg · SUG g). Blank/garbage values are omitted from the payload and the
// server fail-open defaults them to 0, so hand-typed manual entries now flow
// into the 02/MICROS panel and earn the meal-row FIB/NA/SUG sub-line exactly
// like catalog rows. Quick-add presets stay micro-free by design (fixed
// one-tap shortcuts, not labeled foods).

import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { ChevronDown, Database, ChevronLeft, ChevronRight, Clock, Cookie, Droplet, Loader2, Minus, Moon, Pencil, Plus, Search, Settings2, Sun, Sunrise, Trash2, UtensilsCrossed, X } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { SystemPanel } from "@/components/system/system-panel"
// R54-c4 declutter — the numbered SysSection marks stood down (R53-a recipe);
// every zone's SystemPanel self-labels, so section-mark is no longer imported.
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { EmptyGlyph } from "@/components/system/empty-glyph"
import { FlowGroup, FlowItem, FlowReveal, DecodeText, useCountUp, FLOW_EASE, MeterFlow } from "@/components/system/motion"
import { SwipeRow, type SwipeRowAction } from "@/components/system/swipe-row"
import { RowHint } from "@/components/system/row-hint"
import { OracleTip } from "./oracle-tip"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { dayKey, formatDayLabel } from "@/lib/game"
import {
  ACTIVITY_LEVELS,
  DEFAULT_PROFILE,
  FOODS,
  FOOD_CATEGORIES,
  GOALS,
  MACRO_SPLITS,
  MEAL_TYPES,
  calcTargets,
  feedingSpacingNote,
  fiberGoalFor,
  mealProteinTarget,
  proteinDoseVerdict,
  searchFoods,
  type FoodItem,
  type MealType,
  type ProteinDoseVerdict,
} from "@/lib/nutrition"
import { scienceFor } from "@/lib/science"
import { MAX_PARSE_CHARS, MAX_PARSE_ITEMS, parseMealLocal, type ParsedFoodItem } from "@/lib/food-parse"
import { OfflineQueuedError } from "@/lib/offline-queue"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"

// ── API contract types (GET /api/nutrition) ───────────────────────────────────

type NutritionProfileOut = {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
  /** Explicit macro-split preset id — null = per-goal default split. */
  macroSplit: string | null
  isDefault: boolean
}

type MealEntry = {
  id: string
  mealType: MealType
  name: string
  qty: number
  unit: string
  calories: number
  protein: number
  carbs: number
  fat: number
  // R17-A micros — qty-multiplied totals persisted with the row. Catalog foods
  // carry values; R18-b manual/custom entries carry hand-typed values (blank
  // fields log as 0 via the server's fail-open default).
  fiber: number
  sodium: number
  sugar: number
  createdAt: string
}

type NutritionDay = {
  date: string
  profile: NutritionProfileOut
  targets: {
    calories: number
    protein: number
    carbs: number
    fat: number
    waterMl: number
    bmr: number
    tdee: number
    // R17-A micro targets — fiber is a floor (14 g/1000 kcal), sodium + sugar
    // are caps (2300 mg AHA/WHO · 10% kcal).
    fiberG: number
    sodiumMg: number
    sugarG: number
  }
  consumed: { calories: number; protein: number; carbs: number; fat: number; fiber: number; sodium: number; sugar: number }
  waterMl: number
  meals: MealEntry[]
  history: { day: string; calories: number; target: number; waterMl: number }[]
}

type HistPoint = { day: string; calories: number; target: number; waterMl: number }

// ── Module constants ──────────────────────────────────────────────────────────

const MEAL_META: readonly { id: MealType; label: string; icon: LucideIcon }[] = [
  { id: "breakfast", label: "Breakfast", icon: Sunrise },
  { id: "lunch", label: "Lunch", icon: Sun },
  { id: "dinner", label: "Dinner", icon: Moon },
  { id: "snack", label: "Snacks", icon: Cookie },
]

const MACRO_META = [
  { key: "protein", label: "PROTEIN", color: "#14b8a6" },
  { key: "carbs", label: "CARBS", color: "#f59e0b" },
  { key: "fat", label: "FAT", color: "#f43f5e" },
] as const

// ── Small pure helpers ────────────────────────────────────────────────────────

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split("-").map(Number)
  return dayKey(new Date(y, m - 1, d + delta))
}

function weekdayShort(day: string): string {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short" })
}

/** "TODAY" / "YESTERDAY" / "SEP 18" headline for the date navigator. */
function dayHeadline(day: string): string {
  const today = dayKey()
  if (day === today) return "TODAY"
  if (day === shiftDay(today, -1)) return "YESTERDAY"
  return formatDayLabel(day).toUpperCase()
}

/** One-decimal display without trailing zero noise (12.6 → "12.6", 12 → "12"). */
function fmt1(n: number): string {
  return String(Math.round(n * 10) / 10)
}

/** One-decimal rounding for arithmetic (mirror of the API routes' round1). */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// R68 · nutrition-audit B2 — two-decimal qty grid, client side of the
// contract: round HERE, derive per-serving from the SAME rounded q, and
// the server (now round2) reproduces the reviewed total byte-exactly.
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function fmtLiters(ml: number): string {
  return (ml / 1000).toFixed(1)
}

/** Number input value → number | null (null = empty / not entered). */
function parseNumeric(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/**
 * R18-b — optional per-serving micro input → payload number. Empty / negative
 * / non-finite → undefined so the key is OMITTED from the payload (the server
 * fail-open defaults absent micros to 0 and qty-multiplies the rest like the
 * macros); finite positives pass through with a client-side mirror of the
 * server's 0–100000 clamp — no error burden either way.
 */
function parseMicro(s: string): number | undefined {
  const t = s.trim()
  if (t === "") return undefined
  const v = Number(t)
  if (!Number.isFinite(v) || v < 0) return undefined
  return Math.min(v, 100000)
}

function mealLabel(id: MealType): string {
  return MEAL_TYPES.find((m) => m.id === id)?.label ?? id
}

// ── Quick-add macro presets (R2-b) — one tap → snack entry, kcal = 4P+4C+9F ───
// R18-b decision: presets stay MICRO-FREE — they are fixed one-tap shortcuts
// (kcal derived from the 4/4/9 factors), not foods with a nutrition label;
// micros belong to the catalog + the hand-typed Custom path only.

const QUICK_PRESETS: { id: string; label: string; name: string; unit: string; protein: number; carbs: number; fat: number }[] = [
  { id: "whey", label: "WHEY SCOOP", name: "Whey Scoop", unit: "scoop", protein: 24, carbs: 3, fat: 2 },
  { id: "chicken", label: "CHICKEN 150G", name: "Chicken 150g", unit: "serving", protein: 46, carbs: 0, fat: 5 },
  { id: "rice", label: "RICE CUP", name: "Rice Cup", unit: "cup", protein: 4, carbs: 45, fat: 1 },
  { id: "banana", label: "BANANA", name: "Banana", unit: "banana", protein: 1, carbs: 27, fat: 0 },
  { id: "eggs", label: "EGGS ×3", name: "Eggs ×3", unit: "serving", protein: 19, carbs: 1, fat: 15 },
  // R68 · nutrition-audit B3 — USDA-corrected macros for the weight on the
  // label: oats 60 g was P4/C54/F1 (C54 implies ~80 g); rolled oats are
  // 379 kcal/100 g → P8/C40/F4. Greek yogurt 170 g (low-fat 2%): P17/C7/F3.2
  // (73 kcal/100 g USDA). Almonds 28 g: F12 → 14.2 (164 kcal USDA serving).
  // kcal still derives from 4P+4C+9F per the R18-b preset doctrine.
  { id: "oats", label: "OATS 60G", name: "Oats 60g", unit: "serving", protein: 8, carbs: 40, fat: 4 },
  { id: "yogurt", label: "GREEK YOG 170G", name: "Greek Yogurt 170g", unit: "serving", protein: 17, carbs: 7, fat: 3.2 },
  { id: "almonds", label: "ALMONDS 28G", name: "Almonds 28g", unit: "serving", protein: 6, carbs: 6, fat: 14.2 },
]

/** Preset kcal via the 4/4/9 macro energy factors. */
function presetKcal(p: { protein: number; carbs: number; fat: number }): number {
  return p.protein * 4 + p.carbs * 4 + p.fat * 9
}

// ── R17-A · micro sub-lines (Cronometer/MyFitnessPal parity) ──────────────────
// FIB/NA/SUG tokens (not F/S — "F" already means FAT in the P/C/F chip idiom).

/** True when a logged entry carries micro data — catalog rows, or manual
 *  entries whose hunter typed FIB/NA/SUG values into the R18-b custom form. */
function entryHasMicro(e: MealEntry): boolean {
  return e.fiber > 0 || e.sodium > 0 || e.sugar > 0
}

/** Compact FIB · NA · SUG sub-line — zinc-400 labels, zinc-300 values (R16 policy). */
function MicroLine({ fiber, sodium, sugar }: { fiber: number; sodium: number; sugar: number }) {
  return (
    <span className="tabular-nums">
      FIB <span className="text-zinc-300">{fmt1(fiber)}G</span>
      <span className="mx-1 text-zinc-700" aria-hidden>
        ·
      </span>
      NA <span className="text-zinc-300">{fmt1(sodium)}MG</span>
      <span className="mx-1 text-zinc-700" aria-hidden>
        ·
      </span>
      SUG <span className="text-zinc-300">{fmt1(sugar)}G</span>
    </span>
  )
}

// ── R9 editorial section headers — R54-c4: the four numbered marks (01/02/03/04)
//    stood down; the SystemPanels below carry their own labels.

// ── Main component ────────────────────────────────────────────────────────────

export function FuelTab({ hunter }: { hunter: HunterDTO }) {
  const { pushNotice, bumpRefresh, speak } = useSystem()
  const reduce = !!useReducedMotion()

  const [date, setDate] = useState<string>(() => dayKey())
  const { data, error, loading, reload } = useApi<NutritionDay>(`/api/nutrition?date=${date}`)

  const [addOpen, setAddOpen] = useState(false)
  const [addMeal, setAddMeal] = useState<MealType>("breakfast")
  const [profileOpen, setProfileOpen] = useState(false)
  // R70-c — the entry being edited (per-entry EDIT sheet); null = closed
  const [editing, setEditing] = useState<MealEntry | null>(null)

  // optimistic water display — overrides data.waterMl until fresh GET data lands
  const [waterOverride, setWaterOverride] = useState<number | null>(null)
  const [waterBusy, setWaterBusy] = useState(false)

  useEffect(() => {
    setWaterOverride(null)
  }, [data])

  const today = dayKey()
  const waterMl = data ? waterOverride ?? data.waterMl : 0

  const openAdd = (meal: MealType) => {
    setAddMeal(meal)
    setAddOpen(true)
  }

  const handleLogged = (xpGranted?: number) => {
    reload()
    bumpRefresh()
    if (xpGranted) pushNotice({ kind: "xp", title: `+${xpGranted} XP`, body: "" })
  }

  const handleProfileSaved = () => {
    reload()
    bumpRefresh()
  }

  const handleWater = async (ml: number) => {
    if (!data || waterBusy) return
    const before = waterOverride ?? data.waterMl
    setWaterBusy(true)
    setWaterOverride(Math.max(0, before + ml))
    try {
      const res = await api<{ waterMl: number; questCompleted?: boolean; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "log-water", date, ml }),
      })
      setWaterOverride(res.waterMl)
      reload()
      bumpRefresh()
      if (res.xpGranted) pushNotice({ kind: "xp", title: `+${res.xpGranted} XP`, body: "" })
      if (res.questCompleted) {
        pushNotice({ kind: "info", title: "HYDRATION GOAL COMPLETE", body: "Claim your reward in the Goals tab." })
        speak("Hydration goal complete.")
      }
    } catch (e) {
      setWaterOverride(null)
      pushNotice({ kind: "warn", title: "WATER LOG FAILED", body: (e as Error).message })
      reload()
    } finally {
      setWaterBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api<{ ok: boolean }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "delete-entry", id }),
      })
      reload()
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "DELETE FAILED", body: (e as Error).message })
    }
  }

  // R70-c — edit-entry saved: refetch the day exactly like handleDelete (no
  // optimistic state — the file's existing refetch pattern), then a quiet
  // confirmation notice. Edits are XP-neutral server-side, so no XP toast.
  const handleEditSaved = () => {
    reload()
    bumpRefresh()
    pushNotice({ kind: "info", title: "ENTRY UPDATED", body: "" })
  }

  // R33-b — cold-start history: a default-profile hunter with nothing logged
  // today AND an all-zero 7-day window gets the designed empty slot instead of
  // a dead chart. A calibrated hunter (KAEL) fails the isDefault conjunct, so
  // the history panel always renders for him, whatever the week holds.
  const historyQuiet =
    !!data &&
    data.profile.isDefault &&
    data.meals.length === 0 &&
    data.history.every((h) => h.calories === 0 && h.waterMl === 0)

  return (
    // R9 flow — the top zone staggers in (FlowGroup); the long tail below the
    // fold reveals on scroll (FlowReveal), so the page keeps moving as you
    // read. Plain root (not a variant node) keeps whileInView in charge.
    <div className={cn("space-y-4 transition-opacity duration-300 sm:space-y-5", loading && data && "opacity-60")}>
      <FlowGroup className="space-y-4 sm:space-y-5">
      <FlowItem>
        <OracleTip tab="fuel" />
      </FlowItem>

      {/* ── date navigator + profile chip ─────────────────────────────────── */}
      <FlowItem>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDate(shiftDay(date, -1))}
            aria-label="Previous day"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-all hover:border-violet-500/50 hover:text-violet-300 active:scale-[0.96] focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-[118px] px-1.5 text-center">
            <DecodeText
              text={dayHeadline(date)}
              as="p"
              className="font-mono text-xs font-bold tracking-[0.3em] text-violet-200"
            />
            <p className="mt-0.5 font-mono text-[9px] tracking-[0.22em] text-zinc-400">
              {weekdayShort(date).toUpperCase()} · {formatDayLabel(date).toUpperCase()}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDate(shiftDay(date, 1))}
            disabled={date >= today}
            aria-label="Next day"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-all hover:border-violet-500/50 hover:text-violet-300 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {date !== today && (
          <button
            type="button"
            onClick={() => setDate(dayKey())}
            className="flex min-h-11 items-center rounded-sm border border-violet-400/50 bg-violet-500/15 px-3 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 transition-all hover:bg-violet-500/25 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
          >
            TODAY
          </button>
        )}

        {data && (
          <div className="ml-auto flex items-center gap-2">
            {data.profile.isDefault ? (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="Calibrate your body profile"
                className="flex min-h-11 items-center rounded-sm border border-amber-400/50 bg-amber-500/10 px-3 font-mono text-[10px] font-bold tracking-[0.2em] text-amber-300 transition-all hover:border-amber-300/70 hover:bg-amber-500/20 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
              >
                CALIBRATE PROFILE
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setProfileOpen(true)}
                title="Body profile"
                className="flex min-h-11 items-center rounded-sm border border-zinc-700/70 bg-zinc-950/60 px-3 font-mono text-[10px] tabular-nums tracking-[0.18em] text-zinc-400 transition-all hover:border-violet-500/50 hover:text-violet-300 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
              >
                {Math.round(data.profile.weightKg ?? DEFAULT_PROFILE.weightKg)} KG · {data.targets.calories} KCAL
              </button>
            )}
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              aria-label="Body profile settings"
              title="Body profile"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-800 bg-zinc-950/60 text-zinc-400 transition-all hover:border-violet-500/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
      </FlowItem>

      {/* ── INTAKE — hero zone: kcal ring + macros + hydration ────────── */}
      {data && (
        <FlowItem>
          <DailyFuelPanel
            data={data}
            waterMl={waterMl}
            waterBusy={waterBusy}
            onWater={handleWater}
            onCalibrate={() => setProfileOpen(true)}
            hunterName={hunter.name}
            reduce={reduce}
          />
        </FlowItem>
      )}
      </FlowGroup>

      {/* ── body states + below-fold zones (scroll-revealed) ────────────────── */}
      {loading && !data ? (
        <SkeletonPanel label="SYNCING FUEL DATA" rows={2}>
          <div className="skel-bar h-40 w-full" style={{ animationDelay: "0.12s" }} />
          <div className="skel-bar h-24 w-full" style={{ animationDelay: "0.24s" }} />
        </SkeletonPanel>
      ) : error && !data ? (
        <SystemPanel label="Fuel">
          <div className="p-8 text-center">
            <p className="font-mono text-xs tracking-[0.25em] text-rose-400/90">FUEL LINK FAILED</p>
            <p className="mt-1.5 break-words font-mono text-[10px] tracking-[0.2em] text-zinc-400">{error.toUpperCase()}</p>
            <button
              type="button"
              onClick={() => reload()}
              className="mt-4 h-11 rounded-sm border border-violet-400/50 bg-violet-500/15 px-5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              RETRY
            </button>
          </div>
        </SystemPanel>
      ) : data ? (
        <>
          {/* ── MICROS — R17-A trace elements: fiber goal + sodium/sugar caps ── */}
          <FlowReveal>
            <MicroPanel data={data} />
          </FlowReveal>

          {/* ── TIMING — science zone (R6-c evidence strip + R8-c doses) ── */}
          <FlowReveal>
            <FuelSciencePanel data={data} waterMl={waterMl} />
          </FlowReveal>

          {/* ── protein timing panel (R8-c) — per-meal dose coverage ── */}
          <FlowReveal>
            <ProteinTimingPanel data={data} />
          </FlowReveal>

          <FlowReveal>
            <QuickAddPanel date={date} onLogged={handleLogged} />
          </FlowReveal>

          {/* R13-b — one-time row-gesture hint (meal-entry rows below) */}
          <RowHint surface="fuel" />

          <FlowReveal>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {MEAL_META.map((m, i) => (
                <MealCard
                  key={m.id}
                  meta={m}
                  entries={data.meals.filter((e) => e.mealType === m.id)}
                  onAdd={() => openAdd(m.id)}
                  onDelete={handleDelete}
                  onEdit={setEditing}
                  reduce={reduce}
                  index={i}
                />
              ))}
            </div>
          </FlowReveal>

          {/* ── HISTORY — 7-day kcal chart + hydration columns ── */}
          <FlowReveal>
            {historyQuiet ? (
              <EmptySurface
                label="FUEL HISTORY"
                line="YOUR LOGGED DAYS WILL CHART HERE"
                hint="7 DAYS OF CALORIES + HYDRATION — LOG A MEAL OR WATER TO BEGIN"
                ctaLabel="LOG YOUR FIRST MEAL"
                onCta={() => openAdd("breakfast")}
              />
            ) : (
              <HistoryPanel data={data} reduce={reduce} />
            )}
          </FlowReveal>
        </>
      ) : null}

      {/* ── dialogs ───────────────────────────────────────────────────────── */}
      <AddFoodDialog open={addOpen} onOpenChange={setAddOpen} presetMeal={addMeal} date={date} onLogged={handleLogged} />
      {/* R70-c — per-entry EDIT sheet (the same dialog idiom as the log-food flow) */}
      <EditEntryDialog entry={editing} onOpenChange={(v) => !v && setEditing(null)} onSaved={handleEditSaved} />
      {data && (
        <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} profile={data.profile} onSaved={handleProfileSaved} />
      )}
    </div>
  )
}

// ── Quick-add preset chips (R2-b) ─────────────────────────────────────────────

function QuickAddPanel({ date, onLogged }: { date: string; onLogged: (xpGranted?: number) => void }) {
  const { pushNotice } = useSystem()
  const [busyId, setBusyId] = useState<string | null>(null)

  const add = async (p: (typeof QUICK_PRESETS)[number]) => {
    if (busyId) return
    setBusyId(p.id)
    try {
      const res = await api<{ entry: MealEntry; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({
          action: "log-food",
          date,
          mealType: "snack",
          name: p.name,
          qty: 1,
          unit: p.unit,
          calories: presetKcal(p),
          protein: p.protein,
          carbs: p.carbs,
          fat: p.fat,
        }),
      })
      onLogged(res.xpGranted)
    } catch (e) {
      pushNotice({ kind: "warn", title: "QUICK ADD FAILED", body: (e as Error).message })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <SystemPanel label="Quick Add · One-Tap Fuel">
      {/* R54-c4 declutter — the "LOGS AS SNACK · KCAL = 4P+4C+9F" helper line
          rides the grid's title attribute (the chips themselves stay: one-tap
          actions are the point of this panel). */}
      <div
        className="grid grid-cols-4 gap-1.5 p-3 sm:p-4"
        role="group"
        aria-label="Quick-add food presets"
        title="Logs as snack · kcal = 4P + 4C + 9F"
      >
        {QUICK_PRESETS.map((p) => {
          const busy = busyId === p.id
          const kcal = presetKcal(p)
          return (
            <motion.button
              key={p.id}
              type="button"
              onClick={() => void add(p)}
              disabled={busyId !== null}
              aria-busy={busy}
              aria-label={`Quick add ${p.label}: protein ${p.protein} g, carbs ${p.carbs} g, fat ${p.fat} g, ${kcal} kcal`}
              title={`${p.name} · P${p.protein} C${p.carbs} F${p.fat} · ${kcal} kcal`}
              whileTap={{ scale: 0.93, transition: { duration: 0.1 } }}
              className="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-sm border border-zinc-800 bg-zinc-950/60 px-1.5 py-1.5 transition-all hover:border-violet-500/50 hover:bg-violet-500/5 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <span className="flex w-full items-center justify-center gap-1 font-mono text-[9px] font-bold tracking-[0.06em] text-zinc-300">
                {busy && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-violet-300" aria-hidden />}
                <span className="truncate">{p.label}</span>
              </span>
              <span className="w-full truncate text-center font-mono text-[8px] tabular-nums tracking-wider text-zinc-400">
                {busy ? "LOGGING…" : `P${p.protein} C${p.carbs} F${p.fat} · ${kcal}`}
              </span>
            </motion.button>
          )
        })}
      </div>
    </SystemPanel>
  )
}

// ── Daily Fuel hero panel ─────────────────────────────────────────────────────

function DailyFuelPanel({
  data,
  waterMl,
  waterBusy,
  onWater,
  onCalibrate,
  hunterName,
  reduce,
}: {
  data: NutritionDay
  waterMl: number
  waterBusy: boolean
  onWater: (ml: number) => void
  onCalibrate: () => void
  hunterName: string
  reduce: boolean
}) {
  const { targets, consumed, profile } = data
  const goalWord = (GOALS.find((g) => g.id === (profile.goal ?? DEFAULT_PROFILE.goal))?.label.split("—")[0] ?? "Maintain")
    .trim()
    .toUpperCase()
  // amber split tag — only for an explicit non-default preset (balanced ≈ null = honest default)
  const splitWord =
    profile.macroSplit && profile.macroSplit !== "balanced"
      ? (MACRO_SPLITS.find((s) => s.id === profile.macroSplit)?.label ?? profile.macroSplit).toUpperCase()
      : null

  return (
    <SystemPanel
      label="Daily Fuel"
      labelAccent={
        <span className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-zinc-400">
          <span className="text-zinc-400">{hunterName.toUpperCase()}</span>
          <span className="text-zinc-700" aria-hidden>
            ·
          </span>
          <span className="text-violet-300/80">{goalWord}</span>
          {splitWord && (
            <span className="rounded-sm border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.18em] text-amber-300">
              SPLIT · {splitWord}
            </span>
          )}
        </span>
      }
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-stretch sm:gap-7 lg:gap-9">
          <CalorieRing consumed={consumed.calories} target={targets.calories} reduce={reduce} />
          <div className="flex w-full flex-1 flex-col justify-center gap-3.5 sm:gap-4">
            {MACRO_META.map((m) => (
              <MacroBar
                key={m.key}
                label={m.label}
                current={consumed[m.key]}
                target={targets[m.key]}
                color={m.color}
                hero={m.key === "protein"}
              />
            ))}
            <p className="mt-1 font-mono text-[9px] tracking-[0.2em] text-zinc-400">
              BMR {targets.bmr} · TDEE {targets.tdee} KCAL
            </p>
          </div>
        </div>

        <WaterRow waterMl={waterMl} targetMl={targets.waterMl} busy={waterBusy} onWater={onWater} />

        {profile.isDefault && (
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3.5 py-2">
            <p className="min-w-0 flex-1 font-mono text-[10px] tracking-[0.16em] text-amber-300">
              TARGETS USE DEFAULT BODY PROFILE — CALIBRATE FOR ACCURACY
            </p>
            <button
              type="button"
              onClick={onCalibrate}
              className="flex min-h-11 items-center rounded-sm border border-amber-400/60 bg-amber-500/15 px-3 font-mono text-[9px] font-bold tracking-[0.22em] text-amber-200 transition-all hover:border-amber-300 hover:bg-amber-500/25 active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70"
            >
              CALIBRATE
            </button>
          </div>
        )}
      </div>
    </SystemPanel>
  )
}

// ── Fuel science strip (R6-c) — evidence rows reacting to the logged day ──────

/** One science row: insight text (+ citation) and an optional right-side data readout. */
type ScienceRow = { text: string; cite?: string; tail?: string }

/**
 * The four evidence lines behind the day's fuel plan. Pure — derived only from
 * the day payload already in scope (targets, meals, profile, water): protein
 * dosing (Areta 2013 / Schoenfeld & Aragon 2018), the 1.6-2.2 g/kg total
 * (Morton 2018; Helms only as a qualitative cut-day note), hydration
 * (ACSM/Sawka + the app's 35 ml/kg rule) and fiber (IOM 14 g / 1000 kcal).
 */
function fuelScienceRows(data: NutritionDay, waterMl: number): ScienceRow[] {
  const { targets, profile, meals } = data
  const weightKg = profile.weightKg ?? DEFAULT_PROFILE.weightKg
  const goal = profile.goal ?? DEFAULT_PROFILE.goal

  // 1 · per-meal protein dosing — concentration flags first (a skewed day must
  //     not read as "on track"), then the ~0.4 g/kg per-meal dose, else the
  //     principle line (also the static no-meals state).
  const byMeal = new Map<MealType, number>()
  for (const e of meals) byMeal.set(e.mealType, (byMeal.get(e.mealType) ?? 0) + e.protein)
  const mealProteins = [...byMeal.values()]
  const totalProtein = mealProteins.reduce((acc, p) => acc + p, 0)
  let dosing: ScienceRow
  if (meals.length === 0) {
    dosing = { text: "SPREAD ~0.4 G/KG PROTEIN ACROSS 3-4 MEALS", cite: "SCHOENFELD & ARAGON 2018" }
  } else if (totalProtein > 0 && Math.max(...mealProteins) > 0.6 * totalProtein) {
    dosing = { text: "EVEN DOSING — SPLIT PROTEIN ~4×/DAY", cite: "ARETA 2013" }
  } else if (mealProteins.some((p) => p >= 0.4 * weightKg)) {
    dosing = { text: "EVEN DOSING ON TRACK — ~0.4 G/KG PER MEAL", cite: "SCHOENFELD & ARAGON 2018" }
  } else {
    dosing = { text: "SCALE EACH MEAL TOWARD ~0.4 G/KG PROTEIN", cite: "SCHOENFELD & ARAGON 2018" }
  }

  // 2 · daily protein target vs the 1.6-2.2 g/kg hypertrophy range —
  //     re-sourced R29-b from the consensus science module: the org-level
  //     ISSN label replaces the R7-era MORTON 2018 study citation.
  const gPerKg = weightKg > 0 ? targets.protein / weightKg : null
  let targetTail: string | null = null
  if (gPerKg !== null) {
    const g = fmt1(gPerKg)
    if (gPerKg >= 1.6 && gPerKg <= 2.2) targetTail = `YOUR TARGET = ${g} G/KG — IN RANGE`
    else if (gPerKg > 2.2 && goal === "cut")
      targetTail = `YOUR TARGET = ${g} G/KG — CUT DOSE, MUSCLE GUARD (HELMS)`
    else targetTail = `YOUR TARGET = ${g} G/KG — ${gPerKg > 2.2 ? "ABOVE" : "BELOW"} RANGE`
  }
  const proteinEntry = scienceFor("issn-protein")
  const proteinRow: ScienceRow = {
    text: (proteinEntry?.body ?? "1.6-2.2 G/KG/DAY PROTEIN COVERS GROWTH")
      .replace(/\.$/, "")
      .toUpperCase(),
    cite: proteinEntry?.source ?? "ISSN",
    tail: targetTail ?? undefined,
  }

  // 3 · hydration — the day's gap vs the 35 ml/kg goal.
  const gap = targets.waterMl - waterMl
  let hydration: ScienceRow
  if (gap <= 0) {
    hydration = { text: "HYDRATION ON TARGET — 35 ML/KG RULE" }
  } else if (gap > 500 && gap > targets.waterMl * 0.5) {
    hydration = { text: "REPLACE SWEAT LOSS — DRINK BEYOND THIRST AFTER TRAINING", cite: "ACSM/SAWKA" }
  } else {
    hydration = { text: "35 ML/KG DAY RULE", tail: `${Math.round(gap)} ML OUTSTANDING` }
  }

  // 4 · fiber — IOM density applied to the calorie target.
  const fiber: ScienceRow = {
    text: "FIBER TARGET — 14 G PER 1000 KCAL",
    cite: "IOM",
    tail: `≈ ${fiberGoalFor(targets.calories)} G/DAY AT ${targets.calories} KCAL`,
  }

  return [dosing, proteinRow, hydration, fiber]
}

/** Compact FUEL SCIENCE panel — R54-c4 declutter (merge & hide): the four
 *  evidence rows still derive live from the day payload, but only the ONE
 *  personalized readout (the protein row's g/kg verdict) stays on the surface;
 *  the full citation wall rides the line's title attribute + an sr-only list,
 *  and the fuelTiming InfoHint on the label carries the plain-language meaning. */
function FuelSciencePanel({ data, waterMl }: { data: NutritionDay; waterMl: number }) {
  const rows = useMemo(() => fuelScienceRows(data, waterMl), [data, waterMl])
  // the ONE surface line — the protein row's personalized g/kg tail (fallback:
  // the row's own text, reachable only with no weight basis at all)
  const proteinRow = rows[1]
  const headline = proteinRow?.tail ?? proteinRow?.text ?? ""
  // the whole wall (rows + citations + data tails) for the title attribute
  const wall = rows
    .map((r) => [r.text, r.cite ? `(${r.cite})` : "", r.tail].filter(Boolean).join(" "))
    .join("\n")
  return (
    <SystemPanel
      label="Fuel Science"
      labelAccent={<InfoHint term="fuelTiming" />}
    >
      <div className="p-3.5 sm:p-4">
        <ul className="sr-only" aria-label="Fuel science insights">
          {rows.map((r) => (
            <li key={r.text}>
              {r.text}
              {r.cite ? ` (${r.cite})` : ""}
              {r.tail ? ` · ${r.tail}` : ""}
            </li>
          ))}
        </ul>
        <p
          className="sys-label text-[9px] tabular-nums text-teal-200/90"
          title={`${wall}\nReacts to today's log.`}
        >
          <span className="mr-1 text-teal-400" aria-hidden>
            »
          </span>
          {headline}
        </p>
      </div>
    </SystemPanel>
  )
}

// ── Protein timing panel (R8-c) — per-meal dose coverage ──────────────────────

/** Dose-chip tints: DOSE teal · LIGHT amber · SKIP zinc. */
const DOSE_CHIP: Record<ProteinDoseVerdict, string> = {
  DOSE: "border-teal-400/50 text-teal-300",
  LIGHT: "border-amber-400/50 text-amber-300",
  SKIP: "border-zinc-700 text-zinc-400",
}

/** R9 left-accent hue per dose verdict — teal hit · amber light · zinc skip. */
const DOSE_ACCENT: Record<ProteinDoseVerdict, string> = {
  DOSE: "rgba(45,212,191,.7)",
  LIGHT: "rgba(251,191,36,.55)",
  SKIP: "rgba(113,113,122,.5)",
}

/**
 * PROTEIN TIMING — the Schoenfeld & Aragon 2018 per-meal dose (~0.4 g/kg,
 * 3-4 h apart, 4+ feedings; Areta 2013 for the frequency signal) applied to
 * the logged day: per-meal target readout + a DOSE/LIGHT/SKIP chip per meal
 * with entries. Static text only — the day payload drives every number.
 */
function ProteinTimingPanel({ data }: { data: NutritionDay }) {
  const { profile, targets, meals } = data
  const weightKnown = profile.weightKg != null
  const weightKg = profile.weightKg ?? DEFAULT_PROFILE.weightKg

  // per-meal protein totals, MEAL_META order, meals with entries only
  const doseRows = useMemo(() => {
    const byMeal = new Map<MealType, number>()
    for (const e of meals) byMeal.set(e.mealType, (byMeal.get(e.mealType) ?? 0) + e.protein)
    return MEAL_META.filter((m) => byMeal.has(m.id)).map((m) => ({
      label: m.label.toUpperCase(),
      protein: byMeal.get(m.id) ?? 0,
    }))
  }, [meals])

  const showCoverage = weightKnown && doseRows.length > 0

  return (
    <SystemPanel
      label="Protein Timing"
      labelAccent={<Clock className="h-3.5 w-3.5 text-teal-300/70" aria-hidden />}
    >
      <div className="space-y-1.5 p-3.5 sm:p-4">
        {/* R54-c4 declutter — the two science stanzas (Schoenfeld & Aragon 2018
            per-meal dosing + Areta 2013 spacing) and the "timing is secondary"
            caveat folded into the target line's title attribute; the
            plain-language meaning lives in the fuelTiming InfoHint on the Fuel
            Science label above. The per-meal rows + verdict chips stay. */}
        {showCoverage ? (
          <>
            <p
              className="sys-label text-[9px] tabular-nums text-teal-200/90"
              title={`~0.4 g/kg per meal · 3-4h apart · 4+ feedings (Schoenfeld & Aragon 2018)\n${feedingSpacingNote()}\nTiming is secondary — hitting the daily target comes first.`}
            >
              TARGET ≈ {mealProteinTarget(weightKg)} G PER MEAL · {targets.protein} G/DAY
            </p>
            <ul className="space-y-1.5 pt-0.5" aria-label="Per-meal protein dose coverage">
              {doseRows.map((r) => {
                const verdict = proteinDoseVerdict(r.protein, weightKg)
                return (
                  <li
                    key={r.label}
                    className="sys-accent-row flex items-center justify-between gap-x-3 rounded-r-sm px-2 py-1"
                    style={{ "--row-accent": DOSE_ACCENT[verdict] } as React.CSSProperties}
                  >
                    <p className="min-w-0 truncate font-mono text-[10px] tracking-[0.15em] text-zinc-400">
                      {r.label} <span className="tabular-nums text-zinc-300">{fmt1(r.protein)} G</span>
                    </p>
                    <span
                      className={cn(
                        "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-[0.18em]",
                        DOSE_CHIP[verdict],
                        verdict === "DOSE" && "sys-bloom-teal"
                      )}
                    >
                      {verdict === "DOSE" ? "✓ " : ""}
                      {verdict}
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p
            className="sys-label text-[9px] text-zinc-400"
            title="~0.4 g/kg per meal · 3-4h apart · 4+ feedings (Schoenfeld & Aragon 2018)"
          >
            Log meals to see dose coverage.
          </p>
        )}
      </div>
    </SystemPanel>
  )
}

/** Big SVG calorie progress ring — violet arc on a zinc track, animated fill. */
function CalorieRing({ consumed, target, reduce }: { consumed: number; target: number; reduce: boolean }) {
  const R = 84
  const CIRC = 2 * Math.PI * R
  const ratio = target > 0 ? Math.min(1, consumed / target) : 0
  const over = consumed > target
  const remaining = Math.round(target - consumed)

  // animated numerals (R4-c → R14-c) — consumed + remaining count up in
  // lockstep with the arc sweep below (same 0.9s envelope), so the ring's
  // number and its arc land together
  const consumedUp = useCountUp(consumed, 0.9)
  const remainingUp = useCountUp(remaining, 0.9)

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative shrink-0"
    >
      <svg
        viewBox="0 0 200 200"
        className="h-44 w-44 sm:h-48 sm:w-48"
        role="img"
        aria-label={`Calories: ${fmt1(consumed)} of ${target} kcal consumed, ${over ? `${Math.abs(remaining)} over target` : `${remaining} kcal remaining`}`}
      >
        <circle cx="100" cy="100" r={R} fill="none" stroke="#27272a" strokeWidth="12" />
        {/* R14-c — arc sweep: the progress circle mounts from empty and draws
            to its offset over 0.9s on the signature curve (activity-rings Ring
            recipe — motion.circle replaces the old arm + CSS-transition trick);
            later value changes glide on the same curve. Reduced motion → the
            final arc instantly. */}
        <motion.circle
          cx="100"
          cy="100"
          r={R}
          fill="none"
          stroke="#2dd4bf"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          initial={{ strokeDashoffset: CIRC }}
          animate={{ strokeDashoffset: CIRC * (1 - ratio) }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: FLOW_EASE }}
          transform="rotate(-90 100 100)"
          style={{ filter: "drop-shadow(0 0 6px rgba(52, 211, 153, 0.55))" }}
        />
        {/* faint calibration ticks inside the track */}
        <circle cx="100" cy="100" r={R - 15} fill="none" stroke="rgba(167,139,250,0.12)" strokeWidth="1" strokeDasharray="1 7" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="sys-label text-[8px] text-zinc-400">{over ? "OVER" : "REMAINING"}</p>
        {/* R9 display moment — the day's remaining kcal as a breathing numeral */}
        <p
          className={cn(
            "sys-display sys-display-md",
            over ? "sys-bloom-amber text-amber-300 text-glow-amber" : "sys-bloom text-violet-100 text-glow-violet"
          )}
        >
          {over ? `+${Math.abs(Math.round(remainingUp))}` : Math.round(remainingUp)}
        </p>
        <p className="sys-label text-[8px] text-zinc-400">KCAL</p>
        <p className="mt-1 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {fmt1(consumedUp)} / {target}
        </p>
      </div>
    </motion.div>
  )
}

/** Single macro meter — segmented hard-stop fill, amber numerals when over target.
 *  R9: protein (the training priority) renders its grams as a teal display
 *  numeral with a count-up; carbs/fat stay smaller but clearly outweigh
 *  their labels. The smooth gradient fill became a solid segmented meter. */
function MacroBar({
  label,
  current,
  target,
  color,
  hero = false,
}: {
  label: string
  current: number
  target: number
  color: string
  /** Display treatment — true for protein only (teal identity, count-up). */
  hero?: boolean
}) {
  const ratio = target > 0 ? current / target : 0
  const over = current > target
  const pct = Math.min(100, Math.max(0, ratio * 100))
  const currentUp = useCountUp(current, 0.9)

  return (
    <div>
      {hero ? (
        <span className="sys-label text-[9px] text-zinc-400">{label}</span>
      ) : (
        <div className="flex items-baseline justify-between gap-2">
          <span className="sys-label text-[9px] text-zinc-400">{label}</span>
          <span
            className={cn(
              "font-mono text-xl font-bold tabular-nums",
              over ? "text-amber-300" : "text-zinc-300"
            )}
          >
            {fmt1(current)}{" "}
            <span className="text-[10px] font-normal tracking-widest text-zinc-400">/ {target} G</span>
          </span>
        </div>
      )}
      {hero && (
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className={cn("sys-display sys-display-md", over ? "text-amber-300" : "text-teal-300")}>
            {fmt1(currentUp)}
          </span>
          <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">/ {target} G</span>
        </p>
      )}
      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-inset ring-zinc-700/40">
        {/* empty-state gauge marker — keeps the bar readable at 0 progress */}
        {pct <= 0 && (
          <span
            className="absolute left-[2px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: `${color}66` }}
            aria-hidden
          />
        )}
        {/* R14-c — MeterFlow fill: mounts from 0% and sweeps to pct on the
            signature curve (0.7s — the old CSS width-transition's pacing);
            later value changes glide on the same curve. Reduced motion → the
            final width instantly. */}
        <MeterFlow
          pct={pct}
          duration={0.7}
          className="h-full rounded-full"
          style={{
            backgroundColor: color,
            boxShadow: pct > 0 ? `0 0 6px ${color}33` : undefined,
          }}
        />
        {/* R9 segmented-meter skin — hard stops over the fill */}
        <span className="sys-seg" aria-hidden />
      </div>
    </div>
  )
}

// ── R17-A · micronutrient meters (Cronometer/MyFitnessPal parity) ────────────

/** Over-cap severity for ceiling rows: safe → accent skin, >100% amber, >120% rose. */
function capTone(current: number, cap: number): "safe" | "over" | "blown" {
  if (current > cap * 1.2) return "blown"
  if (current > cap) return "over"
  return "safe"
}

/**
 * One trace-element meter — the MacroBar idiom applied to micros. Floor rows
 * (fiber) read as plain progress: under is a miss, the bar just shows the fill.
 * Ceiling rows (sodium/sugar) flip semantics at the cap — bar pinned full at
 * 100%, numerals amber >100% / rose >120%, and the CAP hint swaps to an
 * OVER CAP chip. Numerals count up (useCountUp) and the fill rides MeterFlow
 * (mount-from-0 sweep, 0.7s) exactly like the macro bars; both self-gate
 * under reduced motion.
 */
function MicroRow({
  label,
  current,
  target,
  unit,
  color,
  ceiling = false,
  note,
}: {
  label: string
  current: number
  target: number
  unit: string
  color: string
  /** true → over-cap semantics (sodium/sugar); false → goal progress (fiber). */
  ceiling?: boolean
  /** R54-c4 — the row's policy citation rides a title attribute (zero surface text). */
  note?: string
}) {
  const ratio = target > 0 ? current / target : 0
  const pct = Math.min(100, Math.max(0, ratio * 100))
  const tone = ceiling ? capTone(current, target) : "safe"
  const barColor = tone === "blown" ? "#f43f5e" : tone === "over" ? "#f59e0b" : color
  const currentUp = useCountUp(current, 0.9)

  return (
    <div title={note}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="sys-label shrink-0 text-[9px] text-zinc-400">{label}</span>
          {ceiling ? (
            tone === "safe" ? (
              <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">CAP</span>
            ) : (
              <span
                className={cn(
                  "rounded-sm border px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.18em]",
                  tone === "blown"
                    ? "border-rose-400/50 bg-rose-500/10 text-rose-300"
                    : "border-amber-400/50 bg-amber-500/10 text-amber-300"
                )}
              >
                OVER CAP
              </span>
            )
          ) : (
            <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">GOAL</span>
          )}
        </span>
        <span
          className={cn(
            "font-mono text-lg font-bold tabular-nums",
            tone === "blown" ? "text-rose-300" : tone === "over" ? "text-amber-300" : "text-zinc-300"
          )}
        >
          {fmt1(currentUp)}{" "}
          <span className="text-[10px] font-normal tracking-widest text-zinc-400">/ {target} {unit}</span>
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800 ring-1 ring-inset ring-zinc-700/40">
        {/* empty-state gauge marker — keeps the bar readable at 0 progress */}
        {pct <= 0 && (
          <span
            className="absolute left-[2px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: `${color}66` }}
            aria-hidden
          />
        )}
        <MeterFlow
          pct={pct}
          duration={0.7}
          className="h-full rounded-full"
          style={{
            backgroundColor: barColor,
            boxShadow: pct > 0 ? `0 0 6px ${barColor}33` : undefined,
          }}
        />
        <span className="sys-seg" aria-hidden />
      </div>
    </div>
  )
}

/**
 * 02/MICROS — the R17-A trace-element panel: FIBER goal (emerald) vs
 * targets.fiberG, SODIUM (violet) vs the 2300 mg cap and SUGAR (fuchsia) vs
 * the 10%-kcal cap, both with amber/rose over-cap semantics, plus the policy
 * footnote. Every number derives from the day payload — static otherwise.
 */
function MicroPanel({ data }: { data: NutritionDay }) {
  const { targets, consumed } = data
  return (
    <SystemPanel
      label="Micros · Trace Targets"
      labelAccent={<InfoHint term="micros" />}
    >
      {/* R54-c4 declutter — the policy footnote ("FIBER 14G/1000 KCAL (IOM) ·
          SODIUM ≤2300MG/DAY (WHO) · SUGAR <10% KCAL") stood down: the
          per-row citations ride each row's title attribute and the meaning
          lives in the micros InfoHint on the label. */}
      <div className="space-y-3.5 p-3.5 sm:p-4">
        <MicroRow
          label="FIBER"
          current={consumed.fiber}
          target={targets.fiberG}
          unit="G"
          color="#fbbf24"
          note="Fiber goal — 14 g per 1000 kcal (IOM)"
        />
        <MicroRow
          label="SODIUM"
          current={consumed.sodium}
          target={targets.sodiumMg}
          unit="MG"
          color="#e4e4e7"
          ceiling
          note="Sodium ceiling — ≤2300 mg/day (WHO)"
        />
        <MicroRow
          label="SUGAR"
          current={consumed.sugar}
          target={targets.sugarG}
          unit="G"
          color="#f59e0b"
          ceiling
          note="Sugar ceiling — under 10% of calories"
        />
      </div>
    </SystemPanel>
  )
}

/** Water tracker row — droplet gauge, liter readout and quick-log buttons. */
function WaterRow({
  waterMl,
  targetMl,
  busy,
  onWater,
}: {
  waterMl: number
  targetMl: number
  busy: boolean
  onWater: (ml: number) => void
}) {
  const glasses = Math.round(targetMl / 250)
  const shown = Math.min(glasses, 12)
  // R68 · nutrition-audit B8 — the chip tracks the PERSONALIZED target
  // (35 ml/kg, 2000–4000 ml), not the quest's fixed 3000 ml: at a 2.0 L goal
  // the droplets and liters read "done" at 2.0 L — the chip now agrees.
  // The 3 L auto-complete is the daily-hydrate QUEST (server-side), untouched.
  const complete = waterMl >= targetMl
  const reduce = !!useReducedMotion()

  return (
    <div className="mt-5">
      <div className="flex items-baseline justify-between">
        <p className="sys-label text-[9px] text-zinc-400">Hydration</p>
        <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-400">{fmtLiters(targetMl)} L GOAL</p>
      </div>
      <div
        className="mt-2 rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-3 py-3"
        title="3 L auto-completes the daily hydration quest"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="flex items-center gap-[3px]" aria-hidden>
            {Array.from({ length: shown }).map((_, i) => {
              const filled = waterMl >= (i + 1) * 250
              return (
                <motion.span
                  key={i}
                  initial={reduce ? false : { opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: reduce ? 0 : i * 0.05, ease: FLOW_EASE }}
                  className="grid place-items-center"
                >
                  <Droplet
                    className={cn(
                      "h-3.5 w-3.5 transition-colors sm:h-4 sm:w-4",
                      filled ? "fill-teal-500/80 text-teal-400" : "text-zinc-700"
                    )}
                  />
                </motion.span>
              )
            })}
          </div>
          <p className="font-mono text-xs font-bold tabular-nums tracking-widest text-teal-300">
            {fmtLiters(waterMl)} <span className="font-normal text-zinc-400">/ {fmtLiters(targetMl)} L</span>
          </p>
          {complete && (
            <span className="rounded-sm border border-amber-400/50 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.2em] text-amber-300">
              GOAL COMPLETE
            </span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <WaterBtn label="-250" aria="Remove 250 ml of water" disabled={busy || waterMl <= 0} onClick={() => onWater(-250)} />
            <WaterBtn label="+250" aria="Add 250 ml of water" disabled={busy} onClick={() => onWater(250)} />
            <WaterBtn label="+500" aria="Add 500 ml of water" disabled={busy} onClick={() => onWater(500)} />
          </div>
        </div>
        {/* R54-c4 — "3 L AUTO-COMPLETES THE HYDRATION GOAL" rides the row's
            title attribute above (zero surface text). */}
      </div>
    </div>
  )
}

function WaterBtn({
  label,
  aria,
  disabled,
  onClick,
}: {
  label: string
  aria: string
  disabled: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={aria}
      whileTap={{ scale: 0.93, transition: { duration: 0.1 } }}
      className="h-11 min-w-[3.4rem] rounded-sm border border-teal-500/30 bg-teal-500/10 px-2.5 font-mono text-[10px] font-bold tabular-nums tracking-widest text-teal-300 transition-all hover:border-teal-400/60 hover:bg-teal-500/20 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
    >
      {label}
    </motion.button>
  )
}

// ── Meal sections ─────────────────────────────────────────────────────────────

/** R9 left-accent hue for one logged entry — teal when the entry itself carries
 *  a meaningful protein dose (≥ 20 g ≈ visual shorthand for a protein anchor,
 *  near the app-wide ~0.4 g/kg per-meal science), amber for 500+ kcal energy
 *  hits, violet neutral otherwise. Display-only grouping — no text claims. */
/** R33-b — cold-start empty surface: the designed "what will live here" slot
 *  for a brand-new hunter (zero data). One zinc-300 line, one zinc-500 action
 *  hint pointing at the flow that creates the data, and where natural a violet
 *  CTA chip (in FUEL it opens the add-food dialog rather than switching tabs).
 *  Strictly the zero/missing-data path — a calibrated hunter (KAEL regression)
 *  never renders it. */
function EmptySurface({
  label,
  line,
  hint,
  ctaLabel,
  onCta,
  glyph,
}: {
  label: string
  line: string
  hint: string
  ctaLabel?: string
  onCta?: () => void
  glyph?: boolean
}) {
  const reduce = !!useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: FLOW_EASE }}
      role="status"
      aria-label={`${label} — ${line.toLowerCase()} — ${hint.toLowerCase()}`}
      className="rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/30 px-4 py-6 text-center transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:shadow-[0_0_18px_rgba(139,92,246,0.12)] sm:px-5"
    >
      <p className="sys-label text-[9px] tracking-[0.25em] text-zinc-500">{label}</p>
      {glyph && <EmptyGlyph className="mx-auto mt-2 h-16 w-16 opacity-70" />}
      <p className="mt-2 font-mono text-xs tracking-[0.2em] text-zinc-300">{line}</p>
      <p className="mt-1.5 font-mono text-[10px] leading-relaxed tracking-[0.16em] text-zinc-500">{hint}</p>
      {ctaLabel && onCta && (
        <button
          type="button"
          onClick={onCta}
          className="mt-4 inline-flex h-11 items-center gap-1.5 rounded-sm border border-violet-400/50 bg-violet-500/15 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 transition-all hover:bg-violet-500/30 hover:shadow-[0_0_18px_rgba(139,92,246,0.4)] active:bg-violet-500/40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {ctaLabel}
          <ChevronRight className="h-3 w-3" aria-hidden />
        </button>
      )}
    </motion.div>
  )
}

function entryAccent(e: MealEntry): string {
  if (e.protein >= 20) return "rgba(45,212,191,.7)"
  if (e.calories >= 500) return "rgba(251,191,36,.55)"
  return "rgba(167,139,250,.45)"
}

/** R11-a — swipeflow action for meal-entry rows. Rose = the app-wide
 *  destructive semantic: the swipe IS the delete (same onDelete handler as
 *  the X button, which stays as the 44px accessible path). */
const SWIPE_DELETE: SwipeRowAction = { icon: Trash2, tone: "rose", label: "DELETE" }

function MealCard({
  meta,
  entries,
  onAdd,
  onDelete,
  onEdit,
  reduce,
  index,
}: {
  meta: { id: MealType; label: string; icon: LucideIcon }
  entries: MealEntry[]
  onAdd: () => void
  onDelete: (id: string) => void
  onEdit: (entry: MealEntry) => void
  reduce: boolean
  index: number
}) {
  const Icon = meta.icon
  const subtotal = Math.round(entries.reduce((a, e) => a + e.calories, 0))

  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.06 * index, ease: "easeOut" }}
    >
      <SystemPanel
        label={meta.label}
        labelAccent={
          <span className="flex items-center gap-1.5">
            <Icon className="h-3 w-3 text-violet-400/70" aria-hidden />
            <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">{subtotal} KCAL</span>
          </span>
        }
      >
        <div className="p-3 sm:p-4">
          {/* R54-c4 declutter — the four "NO ENTRIES — LOG TO BEGIN" walls
              compressed to a quiet em-dash glyph; the full phrase rides the
              status role's aria-label. ADD FOOD stays the action path. */}
          {entries.length === 0 ? (
            <div className="py-7 text-center" role="status" aria-label="No entries — log to begin">
              <p className="font-mono text-[11px] tracking-[0.25em] text-zinc-600" aria-hidden>
                —
              </p>
            </div>
          ) : (
            <ul className="scroll-sys max-h-72 space-y-1 overflow-y-auto pr-1" role="list" aria-label={`${meta.label} entries`}>
              {entries.map((e, i) => (
                // R11-a — swipe-to-delete: the row's sys-accent-row treatment
                // (spine + entryAccent vars) moves onto the SwipeRow root and
                // the content rides an opaque surface so the rose DELETE rail
                // sleeps beneath at rest (R10 quest-row recipe). The ul stays a
                // native vertical scroller — SwipeRow's touch-action pan-y +
                // horizontal-dominance engage keep this list's pan-y intact.
                // R14-c — per-row flow: entries rise into place staggered
                // (delay i * 0.05, capped at 8 so long snack lists don't queue
                // past ~0.4s) — the same delay recipe as the Goals tab's quest
                // rows. The li is the existing row structure: SwipeRow's root
                // still owns data-no-swipe + the gesture, this wrapper only
                // transforms (zero layout shift).
                <motion.li
                  key={e.id}
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduce
                      ? { duration: 0 }
                      : { delay: Math.min(i, 8) * 0.05, duration: 0.45, ease: FLOW_EASE }
                  }
                >
                  <SwipeRow
                    action={SWIPE_DELETE}
                    onCommit={() => onDelete(e.id)}
                    enabled={!reduce}
                    className="sys-accent-row relative overflow-hidden rounded-r-lg px-2.5 py-1.5 transition-colors"
                    style={
                      {
                        // re-assert pan-y after the spread style (vertical
                        // scrolling inside max-h-72 stays native)
                        touchAction: "pan-y",
                        "--row-accent": entryAccent(e),
                      } as React.CSSProperties
                    }
                  >
                    {/* the dragged sheet surface — opaque (panel-composite
                        approximation) so the rose rail doesn't bleed through
                        at rest; the default --row-lift wash rides on top */}
                    <div
                      className="relative flex items-center gap-2 rounded-r-lg"
                      style={{
                        backgroundImage:
                          "linear-gradient(90deg, var(--row-lift, rgba(167,139,250,0.05)), transparent 68%), linear-gradient(160deg, #17171B, #0B0B0E)",
                      }}
                    >
                      {!reduce && (
                        <span
                          className="sys-row-hint pointer-events-none absolute -left-2 top-1/2 -translate-y-1/2 text-[10px] leading-none text-zinc-600"
                          aria-hidden
                        >
                          «
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-zinc-200">{e.name}</p>
                        <p className="mt-0.5 truncate font-mono text-[9px] tracking-wider text-zinc-400">
                          {e.qty} × {e.unit}
                          {/* R17-A + R18-b — any entry carrying micro data gets
                              the sub-line: catalog rows always, manual rows
                              when the hunter typed values; all-zero rows show
                              nothing extra (clean degradation) */}
                          {entryHasMicro(e) && (
                            <span>
                              <span className="mx-1 text-zinc-700" aria-hidden>
                                ·
                              </span>
                              <MicroLine fiber={e.fiber} sodium={e.sodium} sugar={e.sugar} />
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <p className="font-mono text-sm font-bold tabular-nums leading-none text-violet-200">
                          {Math.round(e.calories)}
                          <span className="ml-1 text-[8px] font-normal text-zinc-400">KCAL</span>
                        </p>
                        <div className="flex gap-1">
                          <span className="rounded-sm border border-teal-500/20 bg-teal-500/10 px-1 py-px font-mono text-[9px] tabular-nums leading-relaxed text-teal-300/90">
                            P{fmt1(e.protein)}
                          </span>
                          <span className="rounded-sm border border-amber-500/20 bg-amber-500/10 px-1 py-px font-mono text-[9px] tabular-nums leading-relaxed text-amber-300/90">
                            C{fmt1(e.carbs)}
                          </span>
                          <span className="rounded-sm border border-rose-500/20 bg-rose-500/10 px-1 py-px font-mono text-[9px] tabular-nums leading-relaxed text-rose-300/90">
                            F{fmt1(e.fat)}
                          </span>
                        </div>
                      </div>
                      {/* R70-c — the per-entry EDIT path: a 44px pencil beside
                          the delete X (both accessible; SwipeRow keeps the
                          swipe-delete gesture). stopPropagation keeps the row's
                          swipe gesture asleep on tap. */}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onEdit(e)
                        }}
                        aria-label="Edit entry"
                        title="Edit entry"
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-zinc-500 transition-colors hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        <Pencil className="h-4 w-4" aria-hidden />
                      </button>
                      {/* the accessible delete path — SwipeRow stands down under
                          reduced motion / disabled, the button never does */}
                      <button
                        type="button"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onDelete(e.id)
                        }}
                        aria-label={`Remove ${e.name}`}
                        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm text-zinc-600 transition-colors hover:text-rose-400 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </SwipeRow>
                </motion.li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={onAdd}
            className="mt-3 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-zinc-700 bg-zinc-950/30 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 transition-all hover:border-violet-400/60 hover:bg-violet-500/5 hover:text-violet-300 active:scale-[0.99] focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden /> ADD FOOD
          </button>
        </div>
      </SystemPanel>
    </motion.div>
  )
}

// ── 7-day history panel ───────────────────────────────────────────────────────

function FuelBarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: HistPoint }[]; label?: string }) {
  if (!active || !payload?.length) return null
  const p = payload[0]
  const d = p.payload
  return (
    <div className="rounded-sm border border-zinc-800 bg-[#18181b] px-3 py-2">
      <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">{label ? formatDayLabel(label).toUpperCase() : ""}</p>
      <p className="mt-1 font-mono text-[10px] font-bold tabular-nums text-violet-300">{Math.round(p.value)} KCAL</p>
      <p className="font-mono text-[10px] tabular-nums text-zinc-400">TARGET {d?.target ?? 0}</p>
      <p className="font-mono text-[10px] tabular-nums text-teal-400/80">WATER {fmtLiters(d?.waterMl ?? 0)} L</p>
    </div>
  )
}

function HistoryPanel({ data, reduce }: { data: NutritionDay; reduce: boolean }) {
  const history = data.history
  const target = data.targets.calories
  const waterTarget = data.targets.waterMl
  const n = history.length || 1
  const yMax = Math.max(100, ...history.map((h) => Math.max(h.calories, h.target))) * 1.08
  const avgKcal = Math.round(history.reduce((a, h) => a + h.calories, 0) / n)
  const avgWaterMl = history.reduce((a, h) => a + h.waterMl, 0) / n

  return (
    <SystemPanel
      label="Calorie History · 7 Days"
      labelAccent={
        <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">TARGET {target} KCAL</span>
      }
    >
      <div className="p-4 sm:p-5">
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.15, ease: "easeOut" }}
          className="h-48 sm:h-52"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 10, right: 4, left: 4, bottom: 0 }} barCategoryGap="32%">
              <XAxis
                dataKey="day"
                tickFormatter={(d: string) => weekdayShort(d)}
                tick={{ fill: "#a1a1aa", fontSize: 9, fontFamily: "var(--font-geist-mono)" }}
                axisLine={{ stroke: "rgba(167,139,250,0.15)" }}
                tickLine={false}
                interval={0}
              />
              <YAxis domain={[0, yMax]} hide />
              <Tooltip content={<FuelBarTooltip />} cursor={{ fill: "rgba(167,139,250,0.08)" }} />
              <ReferenceLine
                y={target}
                stroke="#f59e0b"
                strokeDasharray="4 4"
                strokeOpacity={0.75}
                label={{
                  value: `TARGET ${target}`,
                  position: "insideTopRight",
                  fill: "#f59e0b",
                  fontSize: 9,
                  fontFamily: "var(--font-geist-mono)",
                }}
              />
              <Bar
                dataKey="calories"
                radius={[2, 2, 0, 0]}
                minPointSize={2}
                isAnimationActive={!reduce}
                animationBegin={100}
                animationDuration={600}
                animationEasing="ease-out"
              >
                {history.map((h) => (
                  <Cell key={h.day} fill={h.calories > 0 ? "#fbbf24" : "#27272a"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* hydration mini-bars — 7 tiny teal columns scaled to the water goal */}
        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <p className="sys-label text-[9px] text-zinc-400">HYDRATION · 7 DAYS</p>
            <p className="font-mono text-[9px] tracking-[0.2em] text-zinc-400">{fmtLiters(waterTarget)} L GOAL</p>
          </div>
          <div className="mt-2 flex items-end justify-between gap-1.5 sm:gap-3">
            {history.map((h) => {
              const pct = Math.min(1, h.waterMl / Math.max(1, waterTarget))
              const empty = h.waterMl <= 0
              return (
                <div key={h.day} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-10 w-full items-end justify-center rounded-sm bg-zinc-900/50" aria-hidden>
                    <div
                      className={cn(
                        "w-3.5 rounded-t-sm transition-all duration-500",
                        empty ? "bg-zinc-700/60" : "bg-teal-500"
                      )}
                      style={{ height: `${Math.max(2, pct * 40)}px` }}
                    />
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">{weekdayShort(h.day).charAt(0)}</span>
                </div>
              )
            })}
          </div>
        </div>

        <p className="mt-3 text-center font-mono text-[10px] tabular-nums tracking-[0.2em] text-zinc-400">
          AVG {avgKcal} KCAL · {fmtLiters(avgWaterMl)} L WATER / DAY
        </p>
      </div>
    </SystemPanel>
  )
}

// ── Add-food dialog ───────────────────────────────────────────────────────────

/** Horizontal mono toggle chip for the category filter rail. */
function CatChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center rounded-sm border px-3 font-mono text-[9px] font-bold tracking-[0.18em] uppercase transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70",
        active
          ? "border-violet-400/50 bg-violet-500/15 text-violet-200"
          : "border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-300"
      )}
    >
      {children}
    </button>
  )
}

/** [DATABASE | CUSTOM] internal tab toggle. */
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-11 rounded-sm border px-1 font-mono text-[10px] font-bold tracking-[0.25em] uppercase transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70",
        active
          ? "border-violet-400/60 bg-violet-500/20 text-violet-200"
          : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-violet-500/40 hover:text-zinc-300"
      )}
    >
      {children}
    </button>
  )
}

// ── R71-a · FoodDropdown — the PICK · EXACT combobox ──────────────────────────
// Dropdown-first database picker: a trigger button (chevron, selected food or
// the "N VERIFIED OPTIONS" placeholder) opening an in-dialog panel with the
// autofocus search input, category chips and the scrollable ranked result
// list. The panel IS the database tab's list (selection lands in the same
// `selected` state + pinned-footer contract the old flat list used). Keys:
// ↑/↓ move the active row, Enter selects it, Escape closes the PANEL only
// (the AddFoodDialog guards its own Escape via ddOpenRef so the sheet stays
// open). Rows are role="option" inside role="listbox" with aria-selected.

function FoodDropdown({
  open,
  setOpen,
  query,
  setQuery,
  category,
  selectCategory,
  results,
  selected,
  onSelect,
  onSwitchToDescribe,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  query: string
  setQuery: (v: string) => void
  category: string | null
  selectCategory: (c: string | null) => void
  results: FoodItem[]
  selected: FoodItem | null
  onSelect: (f: FoodItem) => void
  onSwitchToDescribe: () => void
}) {
  const [rawActiveIdx, setRawActiveIdx] = useState(0)
  const listRef = useRef<HTMLDivElement | null>(null)

  // active row: clamped at render (result set can shrink below the stored
  // index — no setState-in-effect cascade, the clamp is pure derivation)
  const activeIdx = Math.min(rawActiveIdx, Math.max(0, results.length - 1))

  // typing / re-filtering resets the active row to the top (ranked best hit) —
  // done in the event handlers, not an effect
  const resetActive = () => setRawActiveIdx(0)

  // keep the active row visible while arrowing through the list (DOM sync only)
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" })
  }, [activeIdx, open])

  const pick = (f: FoodItem) => {
    onSelect(f)
    setOpen(false)
  }

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault()
      setOpen(true)
    }
  }

  const onPanelKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      // closes the PANEL only — the dialog's own Escape guard (ddOpenRef)
      // keeps the AddFoodDialog open behind it
      e.preventDefault()
      e.stopPropagation()
      setOpen(false)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setRawActiveIdx(Math.min(results.length - 1, activeIdx + 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setRawActiveIdx(Math.max(0, activeIdx - 1))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const f = results[activeIdx]
      if (f) pick(f)
    }
  }

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="food-dropdown-list"
        aria-label="Select food from database"
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-sm border px-3 text-left transition-colors focus-visible:outline focus-visible:outline-violet-400/70",
          open || selected
            ? "border-teal-400/50 bg-zinc-950/60"
            : "border-zinc-700/60 bg-zinc-950/60 hover:border-violet-500/40"
        )}
      >
        {selected ? (
          <>
            <span className="min-w-0 flex-1 truncate font-mono text-sm text-zinc-200">{selected.name}</span>
            <span className="shrink-0 font-mono text-[10px] font-bold tabular-nums text-teal-300">
              {selected.calories} <span className="text-[8px] font-normal text-zinc-400">KCAL</span>
            </span>
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] tracking-[0.15em] text-zinc-500 uppercase">
            Select food — {FOODS.length} verified options
          </span>
        )}
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          className="mt-1.5 rounded-sm border border-zinc-800/70 bg-zinc-950/70 p-2"
          onKeyDown={onPanelKeyDown}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                resetActive()
              }}
              placeholder={`SEARCH ${FOODS.length} FOODS…`}
              aria-label="Search food database"
              autoComplete="off"
              className="h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 pl-9 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
            />
          </div>

          <div className="scroll-sys mt-2 flex gap-1.5 overflow-x-auto pb-1.5" role="group" aria-label="Food categories">
            <CatChip
              active={category === null}
              onClick={() => {
                selectCategory(null)
                resetActive()
              }}
            >
              All
            </CatChip>
            {FOOD_CATEGORIES.map((c) => (
              <CatChip
                key={c}
                active={category === c}
                onClick={() => {
                  selectCategory(c)
                  resetActive()
                }}
              >
                {c}
              </CatChip>
            ))}
          </div>

          {results.length === 0 ? (
            <div className="py-4 text-center">
              <p className="font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                NO MATCHES — TRY THE DESCRIBE OR CUSTOM TAB
              </p>
              <button
                type="button"
                onClick={onSwitchToDescribe}
                className="mt-2.5 inline-flex min-h-11 items-center rounded-sm border border-dashed border-zinc-700/70 bg-zinc-950/30 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                ≈ DESCRIBE IT INSTEAD
              </button>
            </div>
          ) : (
            <div
              ref={listRef}
              id="food-dropdown-list"
              role="listbox"
              aria-label="Food options"
              className="scroll-sys mt-1 max-h-80 space-y-1 overflow-y-auto pr-1"
            >
              {results.map((f, i) => {
                const isSel = selected?.id === f.id
                const isActive = i === activeIdx
                return (
                  <button
                    key={f.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    data-active={isActive}
                    tabIndex={-1}
                    onMouseEnter={() => setRawActiveIdx(i)}
                    onClick={() => pick(f)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm border px-3 py-2.5 text-left transition-colors",
                      isActive
                        ? "border-violet-400/60 bg-violet-500/15"
                        : "border-zinc-800/60 bg-zinc-950/40",
                      isSel && "border-teal-400/60 bg-teal-500/10"
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-200">{f.name}</span>
                      <span className="mt-0.5 block truncate font-mono text-[9px] tracking-widest text-zinc-400">
                        {f.servingLabel} · {f.category.toUpperCase()}
                      </span>
                      {/* R17-A micro suffix line — per-serving fiber/sodium/sugar */}
                      <span className="mt-0.5 block truncate font-mono text-[8px] tracking-[0.12em] text-zinc-400">
                        <MicroLine fiber={f.fiber} sodium={f.sodium} sugar={f.sugar} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-mono text-xs font-bold tabular-nums text-violet-200">
                        {f.calories} <span className="text-[8px] font-normal text-zinc-400">KCAL</span>
                      </span>
                      <span className="mt-0.5 block font-mono text-[9px] tabular-nums text-zinc-400">
                        P{f.protein} C{f.carbs} F{f.fat}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <p className="mt-1.5 text-center font-mono text-[8px] tracking-[0.18em] text-zinc-500">
            ↑↓ NAVIGATE · ENTER SELECT · ESC CLOSE PANEL
          </p>
        </div>
      )}
    </div>
  )
}

/** ± stepper showing "× 1.5" — 0.5 steps for serving counts. */
function QtyStepper({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  // R31-b — sub-0.5 steps (the DESCRIBE tab's 0.25 quarter-servings) keep two
  // decimals so × 1.25 stays exact; the 0.5-step DATABASE/CUSTOM behavior is
  // byte-identical to the previous single-decimal rounding
  const fix = (v: number) => +(v.toFixed(step < 0.5 ? 2 : 1))
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={() => onChange(Math.max(min, fix(value - step)))}
        disabled={value <= min}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="min-w-[4.25rem] text-center font-mono text-sm font-bold tabular-nums text-violet-100">× {value}</span>
      <button
        type="button"
        aria-label="Increase quantity"
        onClick={() => onChange(Math.min(max, fix(value + step)))}
        disabled={value >= max}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  )
}

function MealSelect({ value, onChange, className }: { value: MealType; onChange: (v: MealType) => void; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as MealType)}>
      <SelectTrigger
        aria-label="Meal"
        className={cn(
          "h-11 w-full rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70",
          className
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
        {MEAL_TYPES.map((m) => (
          <SelectItem
            key={m.id}
            value={m.id}
            className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200"
          >
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function NumField({
  label,
  value,
  onChange,
  placeholder,
  min,
  max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  min?: number
  max?: number
}) {
  return (
    <label className="block">
      <span className="sys-label text-zinc-400">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
      />
    </label>
  )
}

/**
 * R18-b — compact per-serving micro input (FIB · G / NA · MG / SUG · G) for
 * the custom form's micro row: one-third width, 8px sys-label carrying the
 * unit hint, violet-skinned 44px field in the dialog's input idiom. Blank →
 * the key is omitted from the payload (server defaults 0).
 */
function MicroNumField({
  label,
  aria,
  value,
  onChange,
}: {
  label: string
  aria: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block min-w-0">
      <span className="sys-label text-[8px] text-zinc-400">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step="0.1"
        min={0}
        max={100000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        aria-label={aria}
        className="mt-1 h-11 rounded-sm border-violet-500/25 bg-zinc-950/70 font-mono text-[12px] tabular-nums text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
      />
    </label>
  )
}

/**
 * R31-b — DESCRIBE-MEAL review row. Numeric inputs hold the ROW TOTAL for the
 * current qty (parse output is qty-multiplied); the batch payload divides by
 * qty because the server stores per-serving values × qty like log-food.
 * estCal keeps the original ≈ estimate (also qty-scaled) for the helper line.
 */
type DescRow = {
  name: string
  qty: number
  unit: string
  cal: string
  pro: string
  car: string
  fat: string
  fib: string
  na: string
  sug: string
  estCal: number | null
  matched: boolean
}

const EMPTY_DESC_ROW: DescRow = {
  name: "",
  qty: 1,
  unit: "serving",
  cal: "",
  pro: "",
  car: "",
  fat: "",
  fib: "",
  na: "",
  sug: "",
  estCal: null,
  matched: false,
}

/** ParsedFoodItem → editable review row (totals as display strings). */
function parsedToRow(it: ParsedFoodItem): DescRow {
  const num = (v: number | null) => (v !== null ? String(round1(v)) : "")
  return {
    name: it.name,
    qty: it.qty,
    unit: it.unit,
    cal: num(it.calories),
    pro: num(it.protein),
    car: num(it.carbs),
    fat: num(it.fat),
    fib: num(it.fiber),
    na: num(it.sodium),
    sug: num(it.sugar),
    estCal: it.calories,
    matched: it.matched,
  }
}

function AddFoodDialog({
  open,
  onOpenChange,
  presetMeal,
  date,
  onLogged,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  presetMeal: MealType
  date: string
  onLogged: (xpGranted?: number) => void
}) {
  const { pushNotice } = useSystem()

  // R71-a — the DATABASE tab is the DEFAULT (dropdown-first exact logging);
  // DESCRIBE (≈ estimates) and CUSTOM stay one tap away. Tab ids are stable
  // ("describe" | "database" | "custom") — only the order/labels changed.
  const [tab, setTab] = useState<"describe" | "database" | "custom">("database")
  const [query, setQuery] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [selected, setSelected] = useState<FoodItem | null>(null)
  const [qty, setQty] = useState(1)
  const [meal, setMeal] = useState<MealType>(presetMeal)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // R71-a — FoodDropdown panel open state (lifted here so the DialogContent's
  // Escape guard can read it without re-render churn)
  const [ddOpen, setDdOpen] = useState(false)
  const ddOpenRef = useRef(false)
  useEffect(() => {
    ddOpenRef.current = ddOpen
  }, [ddOpen])

  // R31-b — DESCRIBE tab: the raw description, its parse source, and the
  // editable review rows (own state; DATABASE/CUSTOM state untouched)
  const [dText, setDText] = useState("")
  const [dSource, setDSource] = useState<"ai" | "local" | null>(null)
  const [dOffline, setDOffline] = useState(false)
  const [dItems, setDItems] = useState<DescRow[]>([])
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // custom-food form
  const [cName, setCName] = useState("")
  const [cCal, setCCal] = useState("")
  const [cProtein, setCProtein] = useState("")
  const [cCarbs, setCCarbs] = useState("")
  const [cFat, setCFat] = useState("")
  // R18-b — optional per-serving micros (blank → omitted → server default 0)
  const [cFiber, setCFiber] = useState("")
  const [cSodium, setCSodium] = useState("")
  const [cSugar, setCSugar] = useState("")
  const [cQty, setCQty] = useState(1)
  const [cUnit, setCUnit] = useState("serving")

  // reset the console whenever the dialog opens (and clear DESCRIBE state on
  // close — no stale review rows flash on reopen)
  useEffect(() => {
    if (!open) {
      setDdOpen(false)
      setDText("")
      setDSource(null)
      setDOffline(false)
      setDItems([])
      setParseError(null)
      return
    }
    // R71-a — database picker is the default landing tab on every open
    setTab("database")
    setQuery("")
    setCategory(null)
    setSelected(null)
    setQty(1)
    setMeal(presetMeal)
    setDdOpen(false)
    setCName("")
    setCCal("")
    setCProtein("")
    setCCarbs("")
    setCFat("")
    setCFiber("")
    setCSodium("")
    setCSugar("")
    setCQty(1)
    setCUnit("serving")
    setError(null)
    setDText("")
    setDSource(null)
    setDOffline(false)
    setDItems([])
    setParseError(null)
  }, [open, presetMeal])

  // R71-a — ranked search (exact > word-prefix > word-start > substring,
  // ties alphabetical); limit = FOODS.length so the empty-query dropdown
  // lists every verified option, ranked/bounded as the hunter types
  const results = useMemo(() => searchFoods(query, category, FOODS.length), [query, category])

  const selectFood = (f: FoodItem) => {
    setSelected(f)
    setQty(1)
    setError(null)
  }

  const selectCategory = (c: string | null) => {
    setCategory(c)
    setSelected(null)
  }

  // R71-a — leaving the PICK tab folds the dropdown panel (no stale open state)
  const switchTab = (t: "describe" | "database" | "custom") => {
    setDdOpen(false)
    setTab(t)
  }

  const cCalNum = parseNumeric(cCal)
  const customValid = cName.trim().length >= 1 && cCalNum !== null

  const logFromDatabase = async () => {
    if (!selected || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await api<{ entry: MealEntry; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({
          action: "log-food",
          date,
          mealType: meal,
          name: selected.name,
          qty,
          unit: selected.servingLabel,
          calories: selected.calories,
          protein: selected.protein,
          carbs: selected.carbs,
          fat: selected.fat,
          // R17-A — per-serving micros (server scales by qty like the macros)
          fiber: selected.fiber,
          sodium: selected.sodium,
          sugar: selected.sugar,
        }),
      })
      onOpenChange(false)
      onLogged(res.xpGranted)
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      pushNotice({ kind: "warn", title: "LOG FAILED", body: msg })
    } finally {
      setBusy(false)
    }
  }

  const logCustom = async () => {
    if (busy || !customValid) return
    setBusy(true)
    setError(null)
    // R18-b — optional per-serving micros: undefined (blank / negative /
    // non-finite) OMITS the key — the server fail-open defaults it to 0; the
    // values the hunter did type are qty-multiplied server-side exactly like
    // the macros below.
    const fiber = parseMicro(cFiber)
    const sodium = parseMicro(cSodium)
    const sugar = parseMicro(cSugar)
    try {
      const res = await api<{ entry: MealEntry; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({
          action: "log-food",
          date,
          mealType: meal,
          name: cName.trim(),
          qty: cQty,
          unit: cUnit.trim() || "serving",
          calories: cCalNum ?? 0,
          protein: parseNumeric(cProtein) ?? 0,
          carbs: parseNumeric(cCarbs) ?? 0,
          fat: parseNumeric(cFat) ?? 0,
          ...(fiber !== undefined && { fiber }),
          ...(sodium !== undefined && { sodium }),
          ...(sugar !== undefined && { sugar }),
        }),
      })
      onOpenChange(false)
      onLogged(res.xpGranted)
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      pushNotice({ kind: "warn", title: "LOG FAILED", body: msg })
    } finally {
      setBusy(false)
    }
  }

  // ── R31-b · DESCRIBE tab handlers ──────────────────────────────────────────

  /** POST /api/food-parse → review rows; offline/parse failure → local fallback. */
  const analyzeMeal = async () => {
    if (parsing || dText.trim().length < 3) return
    setParsing(true)
    setParseError(null)
    setDOffline(false)
    try {
      const res = await api<{ source: "ai" | "local"; items: ParsedFoodItem[] }>("/api/food-parse", {
        method: "POST",
        body: JSON.stringify({ text: dText.trim().slice(0, MAX_PARSE_CHARS) }),
      })
      setDSource(res.source)
      setDItems(res.items.map(parsedToRow))
    } catch (e) {
      const err = e as Error
      if (err instanceof OfflineQueuedError || /OFFLINE/i.test(err.message)) {
        // parse never mutates anything — the queued replay is harmless; keep
        // the hunter moving with the client-side local estimator
        setDSource("local")
        setDOffline(true)
        setDItems(parseMealLocal(dText).map(parsedToRow))
      } else {
        setParseError("PARSE FAILED — RETRY OR USE THE DATABASE TAB")
      }
    } finally {
      setParsing(false)
    }
  }

  /** Qty bump → every row value rescales by the ratio (inputs hold totals). */
  const setRowQty = (idx: number, nextQty: number) => {
    setDItems((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r
        const ratio = nextQty / r.qty
        const scale = (s: string): string => {
          if (s.trim() === "") return s
          const v = Number(s)
          return Number.isFinite(v) ? String(round1(v * ratio)) : s
        }
        return {
          ...r,
          qty: nextQty,
          cal: scale(r.cal),
          pro: scale(r.pro),
          car: scale(r.car),
          fat: scale(r.fat),
          fib: scale(r.fib),
          na: scale(r.na),
          sug: scale(r.sug),
          estCal: r.estCal !== null ? round1(r.estCal * ratio) : null,
        }
      })
    )
  }

  const patchRow = (idx: number, patch: Partial<DescRow>) => {
    setDItems((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const removeRow = (idx: number) => {
    setDItems((rows) => rows.filter((_, i) => i !== idx))
  }

  const addRow = () => {
    setDItems((rows) => (rows.length >= MAX_PARSE_ITEMS ? rows : [...rows, { ...EMPTY_DESC_ROW }]))
  }

  const dTotals = useMemo(() => {
    let cal = 0
    let pro = 0
    let car = 0
    let fat = 0
    for (const r of dItems) {
      cal += parseNumeric(r.cal) ?? 0
      pro += parseNumeric(r.pro) ?? 0
      car += parseNumeric(r.car) ?? 0
      fat += parseNumeric(r.fat) ?? 0
    }
    return { cal: Math.round(cal), pro: round1(pro), car: round1(car), fat: round1(fat) }
  }, [dItems])

  /** A row is valid when the name is non-empty, kcal ≥ 0 is entered, qty > 0. */
  const describeValid =
    !parsing &&
    dItems.length > 0 &&
    dItems.every((r) => r.name.trim().length >= 1 && parseNumeric(r.cal) !== null && r.qty > 0)

  /** LOG MEAL → one log-food-batch POST; row totals ÷ qty = per-serving values.
   *  R68 · B2 — per-serving derives from round2(qty), the exact value the
   *  server stores (quarter servings stayed exact, ⅛ rides the 0.13 grid). */
  const logMeal = async () => {
    if (busy || !describeValid) return
    setBusy(true)
    setError(null)
    try {
      const items = dItems.map((r) => {
        const q = round2(r.qty)
        const per = (v: number) => round1(v / q)
        const fib = parseMicro(r.fib)
        const na = parseMicro(r.na)
        const sug = parseMicro(r.sug)
        return {
          name: r.name.trim().slice(0, 60),
          qty: q,
          unit: r.unit.trim().slice(0, 20) || "serving",
          calories: per(parseNumeric(r.cal) ?? 0),
          protein: per(parseNumeric(r.pro) ?? 0),
          carbs: per(parseNumeric(r.car) ?? 0),
          fat: per(parseNumeric(r.fat) ?? 0),
          ...(fib !== undefined && { fiber: per(fib) }),
          ...(na !== undefined && { sodium: per(na) }),
          ...(sug !== undefined && { sugar: per(sug) }),
        }
      })
      const res = await api<{ entries: MealEntry[]; logged: number; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "log-food-batch", date, mealType: meal, items }),
      })
      onOpenChange(false)
      pushNotice({
        kind: res.xpGranted ? "xp" : "info",
        title: `${res.logged} ITEMS LOGGED${res.xpGranted ? ` · +${res.xpGranted} XP` : ""}`,
        body: "",
      })
      // reload + bumpRefresh without a duplicate XP toast — the combined
      // notice above already carries the batch's XP
      onLogged(undefined)
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      pushNotice({ kind: "warn", title: "LOG FAILED", body: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        // R71-a — Escape closes the FoodDropdown panel FIRST; the dialog
        // itself only closes when the panel is already folded
        onEscapeKeyDown={(e) => {
          if (ddOpenRef.current) e.preventDefault()
        }}
        className="sys-panel flex max-h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-center justify-between border-b border-violet-500/10 px-4 py-4 sm:px-5">
          <DialogTitle className="sys-label text-violet-300/80">Add Food · {mealLabel(presetMeal)}</DialogTitle>
          {date !== dayKey() && (
            <span className="font-mono text-[9px] tracking-[0.2em] text-amber-400/80">
              {formatDayLabel(date).toUpperCase()}
            </span>
          )}
        </DialogHeader>

        <div className="scroll-sys min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {/* R71-a — PICK · EXACT (database dropdown) is the FIRST + default
              tab; DESCRIBE is honestly labelled ≈ ESTIMATE; CUSTOM unchanged.
              Tab ids stay stable — only order/labels changed. */}
          <div className="grid grid-cols-3 gap-1.5">
            <TabBtn active={tab === "database"} onClick={() => switchTab("database")}>
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-[9px] tracking-[0.1em]">
                <Database className="h-2.5 w-2.5" aria-hidden />
                Pick · Exact
              </span>
            </TabBtn>
            <TabBtn active={tab === "describe"} onClick={() => switchTab("describe")}>
              <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap text-[9px] tracking-[0.1em]">
                <UtensilsCrossed className="h-2.5 w-2.5" aria-hidden />
                ≈ Estimate
              </span>
            </TabBtn>
            <TabBtn active={tab === "custom"} onClick={() => switchTab("custom")}>
              <span className="whitespace-nowrap text-[9px] tracking-[0.1em]">Custom</span>
            </TabBtn>
          </div>

          {tab === "describe" ? (
            <div className="mt-3.5 space-y-3">
              <p className="font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                DESCRIBE WHAT YOU ATE — EACH ITEM GETS AN ≈ ESTIMATE YOU CAN CORRECT TO YOUR EXACT COUNT.
              </p>
              <label className="block">
                <span className="sys-label text-zinc-400">Meal Description</span>
                <Textarea
                  rows={4}
                  value={dText}
                  onChange={(e) => setDText(e.target.value.slice(0, MAX_PARSE_CHARS))}
                  placeholder="2 rotis, one bowl of dal, a banana and half glass milk…"
                  aria-label="Describe your meal"
                  className="mt-1.5 min-h-[88px] resize-none rounded-sm border-zinc-700/60 bg-zinc-950/60 p-3 font-mono text-sm text-zinc-200 shadow-none placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                />
                <span className="mt-1 block text-right font-mono text-[9px] tabular-nums tracking-widest text-zinc-500">
                  {dText.length}/{MAX_PARSE_CHARS}
                </span>
              </label>
              <button
                type="button"
                onClick={analyzeMeal}
                disabled={parsing || dText.trim().length < 3}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(139,92,246,0.45)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Parsing…
                  </>
                ) : (
                  "Analyze"
                )}
              </button>

              {parseError && (
                <p
                  className="rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-rose-300"
                  role="alert"
                >
                  {parseError}
                </p>
              )}

              {dSource !== null && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded-[2px] border px-1.5 py-px font-mono text-[8px] font-bold tracking-[0.15em] uppercase",
                        dOffline
                          ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                          : dSource === "ai"
                            ? "border-teal-400/50 bg-teal-500/10 text-teal-300"
                            : "border-zinc-700/70 bg-zinc-900/60 text-zinc-400"
                      )}
                    >
                      {dOffline ? "LOCAL DATABASE · OFFLINE" : dSource === "ai" ? "AI ESTIMATE" : "LOCAL DATABASE"}
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.15em] text-zinc-500">
                      APPROXIMATE — VERIFY BEFORE LOGGING
                    </span>
                  </div>

                  {dItems.length === 0 ? (
                    <p className="rounded-sm border border-zinc-800/60 bg-zinc-950/40 px-3 py-2.5 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                      NO ITEMS RECOGNIZED — ADD ROWS BELOW OR USE THE DATABASE TAB
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {dItems.map((r, i) => (
                        <div key={i} className="rounded-sm border border-zinc-800/60 bg-zinc-950/40 p-2.5">
                          <div className="flex items-center gap-2">
                            <Input
                              value={r.name}
                              onChange={(e) => patchRow(i, { name: e.target.value.slice(0, 60) })}
                              placeholder="Food name"
                              aria-label={`Food name for item ${i + 1}`}
                              autoComplete="off"
                              maxLength={60}
                              className="h-11 min-w-0 flex-1 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                            />
                            <button
                              type="button"
                              aria-label={`Remove item ${i + 1}`}
                              onClick={() => removeRow(i)}
                              className="grid h-11 w-11 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 focus-visible:outline focus-visible:outline-rose-400/70"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </button>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <QtyStepper value={r.qty} min={0.25} max={50} step={0.25} onChange={(v) => setRowQty(i, v)} />
                            <span className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-[0.2em] text-zinc-500 uppercase">
                              {r.unit}
                            </span>
                          </div>

                          <label className="mt-2.5 block">
                            <span className="sys-label flex items-center gap-1.5 text-zinc-400">
                              Calories · KCAL
                              {r.estCal !== null && (
                                <span className="rounded-[2px] border border-amber-500/40 bg-amber-500/10 px-1 py-px font-mono text-[8px] font-bold tracking-[0.15em] text-amber-300">
                                  ≈ EST
                                </span>
                              )}
                            </span>
                            <Input
                              type="number"
                              inputMode="decimal"
                              step="0.1"
                              min={0}
                              max={3000}
                              value={r.cal}
                              onChange={(e) => patchRow(i, { cal: e.target.value })}
                              placeholder="0"
                              aria-label={`Calories for item ${i + 1}`}
                              className="mt-1 h-11 rounded-sm border-amber-500/25 bg-zinc-950/70 font-mono text-sm tabular-nums text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                            />
                          </label>
                          <p
                            className={cn(
                              "mt-1 font-mono text-[8px] tracking-[0.12em]",
                              r.estCal !== null ? "text-amber-400/80" : "text-zinc-500"
                            )}
                          >
                            {r.estCal !== null
                              ? `≈ ${fmt1(r.estCal)} KCAL — EDIT TO YOUR EXACT COUNT`
                              : "NO ESTIMATE — ENTER KCAL"}
                          </p>

                          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`Macros for item ${i + 1}`}>
                            <MicroNumField label="P · G" aria={`Protein grams for item ${i + 1}`} value={r.pro} onChange={(v) => patchRow(i, { pro: v })} />
                            <MicroNumField label="C · G" aria={`Carbs grams for item ${i + 1}`} value={r.car} onChange={(v) => patchRow(i, { car: v })} />
                            <MicroNumField label="F · G" aria={`Fat grams for item ${i + 1}`} value={r.fat} onChange={(v) => patchRow(i, { fat: v })} />
                          </div>
                          <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label={`Optional micronutrients for item ${i + 1}`}>
                            <MicroNumField label="FIB · G" aria={`Fiber grams for item ${i + 1}`} value={r.fib} onChange={(v) => patchRow(i, { fib: v })} />
                            <MicroNumField label="NA · MG" aria={`Sodium milligrams for item ${i + 1}`} value={r.na} onChange={(v) => patchRow(i, { na: v })} />
                            <MicroNumField label="SUG · G" aria={`Sugar grams for item ${i + 1}`} value={r.sug} onChange={(v) => patchRow(i, { sug: v })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addRow}
                    disabled={dItems.length >= MAX_PARSE_ITEMS}
                    className="h-11 w-full rounded-sm border border-dashed border-zinc-700/70 bg-zinc-950/30 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:border-violet-400/50 hover:text-violet-300 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    + Add Item
                  </button>
                </div>
              )}
            </div>
          ) : tab === "database" ? (
            <div className="mt-3.5">
              <div className="flex items-baseline justify-between">
                <span className="sys-label text-zinc-400">Pick Food · Exact Match</span>
                <span className="font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                  {results.length} RESULT{results.length === 1 ? "" : "S"}
                </span>
              </div>
              {/* R71-a — the dropdown IS the database list: search + category
                  chips + ranked results live inside the collapsible panel,
                  selection lands in `selected` → pinned footer below */}
              <FoodDropdown
                open={ddOpen}
                setOpen={setDdOpen}
                query={query}
                setQuery={setQuery}
                category={category}
                selectCategory={selectCategory}
                results={results}
                selected={selected}
                onSelect={selectFood}
                onSwitchToDescribe={() => switchTab("describe")}
              />
              <p className="mt-2.5 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                {FOODS.length} VERIFIED FOODS · USDA / IFCT-SOURCED — EVERY VALUE IS AN EXACT DATABASE ENTRY MULTIPLIED BY QUANTITY · NO ESTIMATES.
              </p>
            </div>
          ) : (
            <div className="mt-3.5 space-y-3">
              <label className="block">
                <span className="sys-label text-zinc-400">Food Name</span>
                <Input
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  placeholder="e.g. Homemade protein bowl"
                  autoComplete="off"
                  maxLength={80}
                  className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                />
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <NumField label="Calories (kcal)" value={cCal} onChange={setCCal} placeholder="e.g. 210" min={0} />
                <NumField label="Protein (g)" value={cProtein} onChange={setCProtein} placeholder="0" min={0} />
                <NumField label="Carbs (g)" value={cCarbs} onChange={setCCarbs} placeholder="0" min={0} />
                <NumField label="Fat (g)" value={cFat} onChange={setCFat} placeholder="0" min={0} />
              </div>
              {/* R18-b — optional per-serving micro row (FIB/NA/SUG tokens, the
                  02/MICROS panel's vocabulary); blank fields are omitted from
                  the payload and log as 0 — the server scales by qty */}
              <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Optional micronutrients per serving">
                <MicroNumField label="FIB · G" aria="Fiber grams per serving" value={cFiber} onChange={setCFiber} />
                <MicroNumField label="NA · MG" aria="Sodium milligrams per serving" value={cSodium} onChange={setCSodium} />
                <MicroNumField label="SUG · G" aria="Sugar grams per serving" value={cSugar} onChange={setCSugar} />
              </div>
              <p className="font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                MACROS + MICROS ARE PER SINGLE SERVING — THE SYSTEM MULTIPLIES BY QUANTITY · MICROS OPTIONAL
              </p>
            </div>
          )}

          {error && (
            <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* pinned footer — quantity, meal target and the log action */}
        <div className="shrink-0 border-t border-violet-500/10 px-4 py-3 sm:px-5">
          {tab === "describe" ? (
            <>
              <MealSelect value={meal} onChange={setMeal} />
              {dItems.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-violet-300/80">
                    {dItems.length} ITEM{dItems.length === 1 ? "" : "S"}
                  </span>
                  <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                    Σ <span className="font-bold text-violet-200">{dTotals.cal}</span> KCAL
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    P <span className="text-teal-300">{fmt1(dTotals.pro)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    C <span className="text-amber-300">{fmt1(dTotals.car)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    F <span className="text-rose-300">{fmt1(dTotals.fat)}</span>
                  </span>
                </div>
              ) : (
                <p className="mt-2.5 text-center font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                  ANALYZE YOUR MEAL TO LOG ITEMS
                </p>
              )}
              <button
                type="button"
                onClick={logMeal}
                disabled={busy || !describeValid}
                className="mt-3 h-11 w-full rounded-sm border border-teal-400/60 bg-teal-500/20 font-mono text-xs font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/40 hover:shadow-[0_0_22px_rgba(20,184,166,0.45)] active:bg-teal-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-teal-400/70"
              >
                {busy ? "Logging…" : "Log Meal"}
              </button>
            </>
          ) : tab === "database" ? (
            selected ? (
              <>
                {/* R71-a — the accuracy story at a glance: name + EXACT badge
                    (teal register), serving label + per-serving kcal, then the
                    qty/meal controls and the Σ preview WITH micros below */}
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs font-medium text-zinc-200">{selected.name}</p>
                  <span className="shrink-0 rounded-[2px] border border-teal-400/50 bg-teal-500/10 px-1.5 py-px font-mono text-[8px] font-bold tracking-[0.15em] text-teal-300">
                    EXACT · DATABASE VALUE
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-x-3">
                  <p className="min-w-0 truncate font-mono text-[9px] tracking-widest text-zinc-400">{selected.servingLabel}</p>
                  <p className="shrink-0 font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                    {selected.calories} KCAL / SERVING
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <QtyStepper value={qty} min={0.5} max={50} step={0.5} onChange={setQty} />
                  <div className="min-w-[140px] flex-1">
                    <MealSelect value={meal} onChange={setMeal} />
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-violet-300/80">× {qty} SERVING{qty === 1 ? "" : "S"}</span>
                  <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                    <span className="font-bold text-violet-200">{Math.round(selected.calories * qty)}</span> KCAL
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    P <span className="text-teal-300">{fmt1(selected.protein * qty)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    C <span className="text-amber-300">{fmt1(selected.carbs * qty)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    F <span className="text-rose-300">{fmt1(selected.fat * qty)}</span>
                  </span>
                  {/* R71-a — micros ride the Σ preview (FIB · NA · SUG × qty),
                      the MicroLine zinc idiom */}
                  <span className="w-full font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
                    FIB <span className="text-zinc-300">{fmt1(selected.fiber * qty)}</span>
                    <span className="mx-1 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    NA <span className="text-zinc-300">{fmt1(selected.sodium * qty)}</span>
                    <span className="mx-1 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    SUG <span className="text-zinc-300">{fmt1(selected.sugar * qty)}</span>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={logFromDatabase}
                  disabled={busy}
                  className="mt-3 h-11 w-full rounded-sm border border-teal-400/60 bg-teal-500/20 font-mono text-xs font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/40 hover:shadow-[0_0_22px_rgba(20,184,166,0.45)] active:bg-teal-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-teal-400/70"
                >
                  {busy ? "Logging…" : "Log Exact Food"}
                </button>
              </>
            ) : (
              <p className="py-1.5 text-center font-mono text-[10px] tracking-[0.25em] text-zinc-400">
                SELECT A FOOD TO CONFIGURE THE ENTRY
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <QtyStepper value={cQty} min={0.5} max={50} step={0.5} onChange={setCQty} />
                <Input
                  value={cUnit}
                  onChange={(e) => setCUnit(e.target.value)}
                  placeholder="serving"
                  aria-label="Serving unit"
                  maxLength={60}
                  className="h-11 min-w-[110px] flex-1 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                />
              </div>
              <div className="mt-2">
                <MealSelect value={meal} onChange={setMeal} />
              </div>
              {cCalNum !== null && (
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-sm border border-violet-500/25 bg-violet-500/10 px-3 py-2">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-violet-300/80">× {cQty} SERVING{cQty === 1 ? "" : "S"}</span>
                  <span className="font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
                    <span className="font-bold text-violet-200">{Math.round(cCalNum * cQty)}</span> KCAL
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    P <span className="text-teal-300">{fmt1((parseNumeric(cProtein) ?? 0) * cQty)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    C <span className="text-amber-300">{fmt1((parseNumeric(cCarbs) ?? 0) * cQty)}</span>
                    <span className="mx-1.5 text-zinc-700" aria-hidden>
                      ·
                    </span>
                    F <span className="text-rose-300">{fmt1((parseNumeric(cFat) ?? 0) * cQty)}</span>
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={logCustom}
                disabled={busy || !customValid}
                className="mt-3 h-11 w-full rounded-sm border border-violet-400/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(139,92,246,0.45)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                {busy ? "Logging…" : "Log Custom Food"}
              </button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── R70-c · per-entry edit dialog ─────────────────────────────────────────────

/**
 * R70-c — per-entry EDIT sheet (R69 close-out carry item (d)). Mirrors the
 * AddFoodDialog idiom and input vocabulary, pre-filled with the entry's
 * CURRENT stored values. The contract is WYSIWYG: every field edits the row's
 * STORED TOTAL — log-food multiplied per-serving values by qty at log time,
 * and this sheet re-derives nothing (changing qty does NOT rescale the
 * macros; the hunter edits the totals they see). Save posts the explicit
 * field set to the edit-entry action; the server writes exactly what was
 * reviewed. Client-side validation mirrors the log-food dialog's constraints
 * (non-empty name, kcal entered) plus the server's 0.1–50 qty range so Save
 * can't build a predictable 400; failures surface in the dialog + a warn
 * notice. Edits are XP-neutral server-side — no XP toast.
 */
function EditEntryDialog({
  entry,
  onOpenChange,
  onSaved,
}: {
  /** The entry being edited; null = closed (last entry kept for exit animation). */
  entry: MealEntry | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const { pushNotice } = useSystem()

  const [name, setName] = useState("")
  const [qty, setQty] = useState("1")
  const [unit, setUnit] = useState("serving")
  const [meal, setMeal] = useState<MealType>("snack")
  const [cal, setCal] = useState("")
  const [pro, setPro] = useState("")
  const [car, setCar] = useState("")
  const [fatVal, setFatVal] = useState("")
  const [fib, setFib] = useState("")
  const [na, setNa] = useState("")
  const [sug, setSug] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // last non-null entry — Radix keeps the content mounted through the close
  // animation, so the sheet needs values to render even after entry → null
  const [shown, setShown] = useState<MealEntry | null>(null)
  useEffect(() => {
    if (entry) setShown(entry)
  }, [entry])
  const e = entry ?? shown

  // prefill the console whenever a (new) entry enters the sheet
  useEffect(() => {
    if (!entry) return
    setName(entry.name)
    setQty(String(entry.qty))
    setUnit(entry.unit)
    setMeal(entry.mealType)
    setCal(String(entry.calories))
    setPro(String(entry.protein))
    setCar(String(entry.carbs))
    setFatVal(String(entry.fat))
    setFib(String(entry.fiber))
    setNa(String(entry.sodium))
    setSug(String(entry.sugar))
    setError(null)
  }, [entry])

  const qtyNum = parseNumeric(qty)
  const calNum = parseNumeric(cal)
  const editValid =
    name.trim().length >= 1 &&
    name.trim().length <= 80 &&
    calNum !== null &&
    calNum >= 0 &&
    qtyNum !== null &&
    qtyNum >= 0.1 &&
    qtyNum <= 50

  const save = async () => {
    if (!entry || busy || !editValid) return
    setBusy(true)
    setError(null)
    try {
      // WYSIWYG patch — the full explicit field set, saved EXACTLY as entered.
      // These are the row's stored totals (no per-serving ÷ qty, no
      // re-derivation); optional blanks edit to 0 via the same ?? 0 coercion
      // family the log-food custom path uses (a blank is an explicit clear).
      await api<{ entry: MealEntry }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({
          action: "edit-entry",
          id: entry.id,
          patch: {
            mealType: meal,
            name: name.trim(),
            qty: round2(qtyNum ?? 1),
            unit: unit.trim() || "serving",
            calories: calNum ?? 0,
            protein: parseNumeric(pro) ?? 0,
            carbs: parseNumeric(car) ?? 0,
            fat: parseNumeric(fatVal) ?? 0,
            fiber: parseNumeric(fib) ?? 0,
            sodium: parseNumeric(na) ?? 0,
            sugar: parseNumeric(sug) ?? 0,
          },
        }),
      })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      const msg = (err as Error).message
      setError(msg)
      pushNotice({ kind: "warn", title: "EDIT FAILED", body: msg })
    } finally {
      setBusy(false)
    }
  }

  if (!e) return null

  return (
    <Dialog open={!!entry} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sys-panel flex max-h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl sm:max-w-md"
      >
        <DialogHeader className="flex-row items-center justify-between border-b border-violet-500/10 px-4 py-4 sm:px-5">
          <DialogTitle className="sys-label truncate text-violet-300/80">Edit Entry · {e.name}</DialogTitle>
        </DialogHeader>

        <div className="scroll-sys min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="space-y-3">
            <label className="block">
              <span className="sys-label text-zinc-400">Food Name</span>
              <Input
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                placeholder="e.g. Chicken 150g"
                autoComplete="off"
                maxLength={80}
                aria-label="Food name"
                className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block min-w-0">
                <span className="sys-label text-zinc-400">Quantity (0.1–50)</span>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.1}
                  max={50}
                  value={qty}
                  onChange={(ev) => setQty(ev.target.value)}
                  aria-label="Quantity"
                  className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm tabular-nums text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
                />
              </label>
              <label className="block min-w-0">
                <span className="sys-label text-zinc-400">Serving Unit</span>
                <Input
                  value={unit}
                  onChange={(ev) => setUnit(ev.target.value)}
                  placeholder="serving"
                  autoComplete="off"
                  maxLength={60}
                  aria-label="Serving unit"
                  className="mt-1.5 h-11 rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-sm text-zinc-200 placeholder:text-zinc-600 focus-visible:outline focus-visible:outline-violet-400/70"
                />
              </label>
            </div>

            <MealSelect value={meal} onChange={setMeal} />

            <div className="grid grid-cols-2 gap-2.5" role="group" aria-label="Macros — row totals">
              <NumField label="Calories (kcal)" value={cal} onChange={setCal} placeholder="0" min={0} />
              <NumField label="Protein (g)" value={pro} onChange={setPro} placeholder="0" min={0} />
              <NumField label="Carbs (g)" value={car} onChange={setCar} placeholder="0" min={0} />
              <NumField label="Fat (g)" value={fatVal} onChange={setFatVal} placeholder="0" min={0} />
            </div>
            {/* micro totals — prefilled from the row; blank = explicit 0 */}
            <div className="grid grid-cols-3 gap-2.5" role="group" aria-label="Micronutrients — row totals">
              <MicroNumField label="FIB · G" aria="Fiber grams total" value={fib} onChange={setFib} />
              <MicroNumField label="NA · MG" aria="Sodium milligrams total" value={na} onChange={setNa} />
              <MicroNumField label="SUG · G" aria="Sugar grams total" value={sug} onChange={setSug} />
            </div>

            <p className="font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
              VALUES ARE THE ROW TOTAL — SAVED EXACTLY AS ENTERED, NO AUTO-RESCALING · EDITS ARE XP-NEUTRAL
            </p>
          </div>

          {error && (
            <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="alert">
              {error}
            </p>
          )}
        </div>

        {/* pinned footer — the save action */}
        <div className="shrink-0 border-t border-violet-500/10 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={save}
            disabled={busy || !editValid}
            className="h-11 w-full rounded-sm border border-violet-400/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(139,92,246,0.45)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            {busy ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Body profile dialog ───────────────────────────────────────────────────────

function PreviewTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-sm border border-zinc-800/70 bg-zinc-950/50 px-2 py-2 text-center">
      <p className={cn("font-mono text-sm font-bold tabular-nums", accent)}>{value}</p>
      <p className="mt-0.5 font-mono text-[8px] tracking-[0.2em] text-zinc-400">{label}</p>
    </div>
  )
}

/** Macro-split preset chip — label, description and a live P/C/F gram preview. */
function SplitChip({
  active,
  onClick,
  title,
  desc,
  preview,
}: {
  active: boolean
  onClick: () => void
  title: string
  desc: string
  preview: { protein: number; carbs: number; fat: number }
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-11 flex-col items-start gap-0.5 rounded-sm border px-3 py-2 text-left transition-all active:scale-[0.98] focus-visible:outline focus-visible:outline-violet-400/70",
        active
          ? "border-violet-400/60 bg-violet-500/15 shadow-[0_0_14px_rgba(139,92,246,0.25)]"
          : "border-zinc-800 bg-zinc-950/60 hover:border-violet-500/30 hover:bg-violet-500/5"
      )}
    >
      <span className={cn("font-mono text-[9px] font-bold tracking-[0.22em]", active ? "text-violet-200" : "text-zinc-300")}>
        {title}
      </span>
      <span className="w-full truncate font-mono text-[8px] tracking-[0.08em] text-zinc-400">{desc}</span>
      <span className="font-mono text-[9px] tabular-nums tracking-wider text-zinc-400">
        P <span className="text-teal-300">{preview.protein}</span> · C{" "}
        <span className="text-amber-300">{preview.carbs}</span> · F{" "}
        <span className="text-rose-300">{preview.fat}</span> G
      </span>
    </button>
  )
}

function ProfileDialog({
  open,
  onOpenChange,
  profile,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  profile: NutritionProfileOut
  onSaved: () => void
}) {
  const { pushNotice } = useSystem()
  const currentYear = new Date().getFullYear()

  const [height, setHeight] = useState("")
  const [weight, setWeight] = useState("")
  const [year, setYear] = useState("")
  const [sex, setSex] = useState<string>(DEFAULT_PROFILE.sex)
  const [activity, setActivity] = useState<string>(DEFAULT_PROFILE.activityLevel)
  const [goal, setGoal] = useState<string>(DEFAULT_PROFILE.goal)
  const [split, setSplit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // snapshot the server profile into the form each time the dialog opens
  useEffect(() => {
    if (!open) return
    setHeight(profile.heightCm != null ? String(profile.heightCm) : "")
    setWeight(profile.weightKg != null ? String(profile.weightKg) : "")
    setYear(profile.birthYear != null ? String(profile.birthYear) : "")
    setSex(profile.sex ?? DEFAULT_PROFILE.sex)
    setActivity(profile.activityLevel ?? DEFAULT_PROFILE.activityLevel)
    setGoal(profile.goal ?? DEFAULT_PROFILE.goal)
    setSplit(profile.macroSplit ?? null)
    setError(null)
  }, [open])

  const hNum = parseNumeric(height)
  const wNum = parseNumeric(weight)
  const yNum = parseNumeric(year)
  const heightValid = hNum === null || (hNum >= 100 && hNum <= 250)
  const weightValid = wNum === null || (wNum >= 25 && wNum <= 300)
  const yearValid = yNum === null || (Number.isInteger(yNum) && yNum >= 1920 && yNum <= currentYear)
  const valid = heightValid && weightValid && yearValid

  const preview = useMemo(
    () =>
      calcTargets({
        heightCm: hNum !== null && heightValid ? hNum : null,
        weightKg: wNum !== null && weightValid ? wNum : null,
        birthYear: yNum !== null && yearValid ? yNum : null,
        sex,
        activityLevel: activity,
        goal,
        macroSplit: split,
      }),
    [hNum, wNum, yNum, heightValid, weightValid, yearValid, sex, activity, goal, split]
  )

  // only fields that actually changed are sent — untouched fields stay as-is
  const payload: {
    heightCm?: number
    weightKg?: number
    birthYear?: number
    sex?: string
    activityLevel?: string
    goal?: string
    macroSplit?: string | null
  } = {}
  if (hNum !== null && hNum !== profile.heightCm) payload.heightCm = Math.round(hNum * 10) / 10
  if (wNum !== null && wNum !== profile.weightKg) payload.weightKg = Math.round(wNum * 10) / 10
  if (yNum !== null && yNum !== profile.birthYear) payload.birthYear = Math.round(yNum)
  if (sex !== (profile.sex ?? DEFAULT_PROFILE.sex)) payload.sex = sex
  if (activity !== (profile.activityLevel ?? DEFAULT_PROFILE.activityLevel)) payload.activityLevel = activity
  if (goal !== (profile.goal ?? DEFAULT_PROFILE.goal)) payload.goal = goal
  if (split !== (profile.macroSplit ?? null)) payload.macroSplit = split
  const hasChanges = Object.keys(payload).length > 0

  const save = async () => {
    if (busy || !valid || !hasChanges) return
    setBusy(true)
    setError(null)
    try {
      await api<{ profile: NutritionProfileOut }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "set-profile", ...payload }),
      })
      onOpenChange(false)
      pushNotice({ kind: "info", title: "PROFILE CALIBRATED", body: "Targets recomputed from your body profile." })
      onSaved()
    } catch (e) {
      const msg = (e as Error).message
      setError(msg)
      pushNotice({ kind: "warn", title: "CALIBRATION FAILED", body: msg })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sys-panel flex max-h-[88vh] w-[95vw] max-w-[95vw] flex-col gap-0 overflow-hidden rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl sm:max-w-lg"
      >
        <DialogHeader className="border-b border-violet-500/10 px-4 py-4 sm:px-5">
          <DialogTitle className="sys-label text-violet-300/80">Body Profile · Calibration</DialogTitle>
        </DialogHeader>

        <div className="scroll-sys min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid grid-cols-3 gap-2.5">
            <NumField label="Height (cm)" value={height} onChange={setHeight} placeholder={String(DEFAULT_PROFILE.heightCm)} min={100} max={250} />
            <NumField label="Weight (kg)" value={weight} onChange={setWeight} placeholder={String(DEFAULT_PROFILE.weightKg)} min={25} max={300} />
            <NumField label="Birth Year" value={year} onChange={setYear} placeholder={String(DEFAULT_PROFILE.birthYear)} min={1920} max={currentYear} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <span className="sys-label text-zinc-400">Sex</span>
              <Select value={sex} onValueChange={setSex}>
                <SelectTrigger
                  aria-label="Sex"
                  className="mt-1.5 h-11 w-full rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
                  <SelectItem value="male" className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200">
                    Male
                  </SelectItem>
                  <SelectItem value="female" className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200">
                    Female
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <span className="sys-label text-zinc-400">Goal</span>
              <Select value={goal} onValueChange={setGoal}>
                <SelectTrigger
                  aria-label="Goal"
                  className="mt-1.5 h-11 w-full rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
                  {GOALS.map((g) => (
                    <SelectItem
                      key={g.id}
                      value={g.id}
                      className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200"
                    >
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-2.5">
            <span className="sys-label text-zinc-400">Activity Level</span>
            <Select value={activity} onValueChange={setActivity}>
              <SelectTrigger
                aria-label="Activity level"
                className="mt-1.5 h-11 w-full rounded-sm border-zinc-700/60 bg-zinc-950/60 font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-zinc-700/60 bg-zinc-950/95 backdrop-blur-sm">
                {ACTIVITY_LEVELS.map((a) => (
                  <SelectItem
                    key={a.id}
                    value={a.id}
                    className="font-mono text-[10px] tracking-[0.15em] uppercase text-zinc-300 focus:bg-violet-500/15 focus:text-violet-200"
                  >
                    {a.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* macro split presets (R3-b) — explicit split overrides goal protein + fat */}
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="sys-label text-zinc-400">Macro Split</span>
              <span className="font-mono text-[8px] tracking-[0.18em] text-zinc-400">PREVIEW = DRAFT INPUTS + GOAL</span>
            </div>
            <div className="mt-2 space-y-1.5" role="group" aria-label="Macro split presets">
              <SplitChip
                active={split === null}
                onClick={() => setSplit(null)}
                title="DEFAULT"
                desc="Per-goal split — cut 2.2 · bulk 1.6 · else 1.8 g/kg"
                preview={calcTargets({
                  heightCm: hNum !== null && heightValid ? hNum : null,
                  weightKg: wNum !== null && weightValid ? wNum : null,
                  birthYear: yNum !== null && yearValid ? yNum : null,
                  sex,
                  activityLevel: activity,
                  goal,
                  macroSplit: null,
                })}
              />
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {MACRO_SPLITS.map((s) => (
                  <SplitChip
                    key={s.id}
                    active={split === s.id}
                    onClick={() => setSplit(s.id)}
                    title={s.label.toUpperCase()}
                    desc={s.desc}
                    preview={calcTargets({
                      heightCm: hNum !== null && heightValid ? hNum : null,
                      weightKg: wNum !== null && weightValid ? wNum : null,
                      birthYear: yNum !== null && yearValid ? yNum : null,
                      sex,
                      activityLevel: activity,
                      goal,
                      macroSplit: s.id,
                    })}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* live Mifflin-St Jeor target preview — recomputes as fields change */}
          <div className="mt-4 rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="sys-label text-zinc-400">Live Target Preview</p>
              {split && (
                <span className="rounded-sm border border-amber-400/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-[0.18em] text-amber-300">
                  SPLIT · {(MACRO_SPLITS.find((s) => s.id === split)?.label ?? split).toUpperCase()}
                </span>
              )}
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <PreviewTile label="BMR" value={String(preview.bmr)} accent="text-zinc-200" />
              <PreviewTile label="TDEE" value={String(preview.tdee)} accent="text-zinc-200" />
              <PreviewTile label="DAILY KCAL" value={String(preview.calories)} accent="text-violet-300" />
              <PreviewTile label="WATER" value={`${fmtLiters(preview.waterMl)} L`} accent="text-teal-300" />
              <PreviewTile label="PROTEIN" value={`${preview.protein} G`} accent="text-teal-300" />
              <PreviewTile label="CARBS" value={`${preview.carbs} G`} accent="text-amber-300" />
              <PreviewTile label="FAT" value={`${preview.fat} G`} accent="text-rose-300" />
            </div>
          </div>

          {!valid && (
            <p className="mt-3 font-mono text-[10px] leading-relaxed tracking-[0.15em] text-rose-400/90" role="alert">
              HEIGHT 100–250 CM · WEIGHT 25–300 KG · YEAR 1920–{currentYear}
            </p>
          )}

          {error && (
            <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 border-t border-violet-500/10 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={save}
            disabled={busy || !valid || !hasChanges}
            title={!valid ? "Fix invalid fields first" : !hasChanges ? "No changes to save" : undefined}
            className="h-11 w-full rounded-sm border border-violet-400/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(139,92,246,0.45)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            {busy ? "Calibrating…" : "Save Profile"}
          </button>
          <p className="mt-2 text-center font-mono text-[8px] tracking-[0.22em] text-zinc-400">
            EMPTY FIELDS KEEP CURRENT VALUES · MIFFLIN-ST JEOR + 35 ML/KG WATER
            <span className="mx-1.5 text-zinc-800" aria-hidden>
              ·
            </span>
            SPLIT OVERRIDES PROTEIN G/KG + FAT %
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
