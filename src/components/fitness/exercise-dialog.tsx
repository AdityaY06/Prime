"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { FlaskConical, Minus, Plus, Sparkles, TrendingUp, Trophy } from "lucide-react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FLOW_EASE, PopIn, SPRING_SNAPPY, tapMotion, useCountUp } from "@/components/system/motion"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { exerciseXp, formatDayLabel, type ExerciseType } from "@/lib/game"
import { epleyE1rm, parseBumpKg, progressionKey, rirVerdictLine, validE1rmSet, type ProgressionEntryDTO } from "@/lib/progression"
import { WARMUP_RAMP } from "@/lib/strength-science"
import { describeRpe } from "@/lib/rpe"
import type { ExerciseTemplate, GateDef } from "@/lib/gates"
import {
  EXERCISE_LIBRARY,
  MUSCLE_BY_ID,
  mapExerciseToMuscles,
  normalizeName,
  variantsFor,
  type ExerciseDef,
  type ExerciseEquipment,
} from "@/lib/muscles"
import { EXERCISES } from "@/lib/exercises"
import type { ExerciseLogDTO, HunterDTO, PersonalBestDTO, PrInfo } from "@/lib/types"
import { cn } from "@/lib/utils"

/** One per-exercise intelligence row from /api/progression (R1-c). */
type ProgressionEntry = ProgressionEntryDTO

/** R7-b: log-sheet template with the additive reps-are-seconds flag — timed
 *  holds (session-raid plan blocks with unit "sec") keep their hold seconds
 *  in the reps field, so the sheet labels the field "SECS / SET" instead of
 *  "REPS / SET". ExerciseTemplate itself stays untouched for every other
 *  producer (gate quick-deploy, custom). */
type SheetTemplate = ExerciseTemplate & { repsAreSeconds?: boolean }

/** Compact kg number (1 decimal max, no trailing-zero noise). */
const fmtKg = (n: number) => String(Math.round(n * 10) / 10)

/** Compact 2-decimal kg — quarter-plate per-side sums (1.25 kg steps) can
 *  need the extra digit that fmtKg would round into a dishonest "2×1.3". */
const fmtKg2 = (n: number) => String(+n.toFixed(2))

// R69-a — the R68-deliberately-skipped I2 warm-up-ramp harmonization, NOW
// SANCTIONED ("build and add science" round): the presets come from the ONE
// shared strength-science.WARMUP_RAMP constant — 50/70/85% × 8/5/3 — instead
// of this file's old inline 40/60/80 × 5/3/1. McGowan et al. 2015 (Sports Med
// 45(11)) ramped-intensity window ≈40-60% → ≈70% → ≈80-90% with decreasing
// volume covers BOTH voices; one voice now. lifting-math.warmupSets and the
// oracle attack-plan ramp read the same constant — drift is impossible.

// ── R19-a: plate calculator (Strong/Hevy bar-loading parity) ─────────────────
// Gating + math are pure and file-local. The typed exercise name resolves
// against the EXERCISES catalog with the same normalized name-match the
// muscle targeting uses; the row renders ONLY for catalog entries carrying
// equipment "barbell" AND type "strength" (checked against the live form
// class too — the weight stepper only exists for strength, so the
// calculator never appears without its input).
// Math: Olympic bar fixed at 20 kg (IWF men's bar — the app's kg-only
// world; lighter technique bars are out of scope, documented default).
// Per-side target = (weight − 20) / 2 at cent precision, greedy-descending
// over the standard inventory [25, 20, 15, 10, 5, 2.5, 1.25]. The greedy
// floor is honest about what physically fits the sleeve: any remainder
// (odd grams / sub-1.25 fractions) surfaces as an ODD LOAD note + one-tap
// SNAP to the nearest loadable total (floor to inventory granularity —
// exactly the build the stack shows), never silently swallowed
// (zero-is-data idiom). weight ≤ 20 → EMPTY BAR.

const EXERCISES_BY_NAME = new Map(EXERCISES.map((e) => [normalizeName(e.name), e] as const))

const BAR_KG = 20
const PLATE_INVENTORY = [25, 20, 15, 10, 5, 2.5, 1.25]
/** View cap — max plate glyphs rendered per side before the "+N" repeat
 *  token takes over (the 500 kg form max builds 10 plates/side worst case:
 *  capped glyphs + token, never a wrap — zero layout shift). */
const MAX_GLYPHS = 8

type PlateCalc = {
  /** per-side greedy breakdown, heaviest denomination first */
  plates: { plate: number; count: number }[]
  /** per-side glyph sequence (heaviest-first), capped for the view */
  glyphStack: number[]
  /** glyphs beyond the view cap (0 when the whole stack fits) */
  overflow: number
  /** per-side kg actually loadable (greedy floor) */
  perSideKg: number
  /** total kg on the bar when loaded as shown (bar + 2 × per-side) */
  loadedKg: number
  /** TOTAL unbuildable kg (both sides) — 0 when perfectly loadable */
  oddKg: number
  /** nearest loadable total (floor to inventory granularity); null when loadable */
  nearestKg: number | null
}

function computePlateLoad(weightKg: number): PlateCalc {
  const perSide = Math.max(0, Math.round(((weightKg - BAR_KG) / 2) * 100) / 100)
  let remaining = perSide
  const plates: { plate: number; count: number }[] = []
  for (const p of PLATE_INVENTORY) {
    const count = Math.floor(remaining / p + 1e-9)
    if (count > 0) {
      plates.push({ plate: p, count })
      remaining = Math.round((remaining - count * p) * 100) / 100
    }
  }
  const perSideKg = Math.round((perSide - remaining) * 100) / 100
  const loadedKg = Math.round((BAR_KG + 2 * perSideKg) * 100) / 100
  // exact difference (input − loaded) beats 2 × per-side remainder: the
  // cent-rounded target can only shrink the arithmetic, never the honesty
  const oddKg = Math.max(0, Math.round((weightKg - loadedKg) * 100) / 100)
  const flat: number[] = []
  for (const p of plates) {
    for (let i = 0; i < p.count; i++) flat.push(p.plate)
  }
  const glyphStack = flat.length > MAX_GLYPHS ? flat.slice(0, MAX_GLYPHS - 1) : flat
  return {
    plates,
    glyphStack,
    overflow: flat.length - glyphStack.length,
    perSideKg,
    loadedKg,
    oddKg,
    nearestKg: oddKg > 0.005 ? loadedKg : null,
  }
}

/** R17-D: the sessions API appends `notes` to each log row on the wire
 *  (engine's shared sessionDTO predates the column and stays untouched), so
 *  the edit target is read through this local structural widen — prefill
 *  needs no shared-type change and degrades to "" when notes are absent. */
type EditableLog = ExerciseLogDTO & { notes?: string | null }

type FormState = {
  name: string
  type: ExerciseType
  sets: number
  reps: number
  weightKg: number
  durationMin: number
}

const TYPE_LABEL: Record<ExerciseType, string> = {
  strength: "Weighted",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
  mobility: "Mobility",
}

// ── Library picker helpers ────────────────────────────────────────────────────

type EquipFilter = "ALL" | "BW" | "BARBELL" | "DB" | "KB" | "MACHINE" | "CABLE" | "BAND"

const EQUIP_FILTERS: { key: EquipFilter; label: string; equipment: ExerciseEquipment[] }[] = [
  { key: "ALL", label: "ALL", equipment: [] },
  { key: "BW", label: "BW", equipment: ["bodyweight", "none"] },
  { key: "BARBELL", label: "BARBELL", equipment: ["barbell"] },
  { key: "DB", label: "DB", equipment: ["dumbbell"] },
  { key: "KB", label: "KB", equipment: ["kettlebell"] },
  { key: "MACHINE", label: "MACHINE", equipment: ["machine", "cardio-machine"] },
  { key: "CABLE", label: "CABLE", equipment: ["cable"] },
  { key: "BAND", label: "BAND", equipment: ["band"] },
]

const FILTER_BY_KEY: Record<EquipFilter, ExerciseEquipment[]> = Object.fromEntries(
  EQUIP_FILTERS.map((f) => [f.key, f.equipment])
) as Record<EquipFilter, ExerciseEquipment[]>

const EQUIP_SHORT: Record<ExerciseEquipment, string> = {
  barbell: "BARBELL",
  dumbbell: "DB",
  machine: "MACHINE",
  cable: "CABLE",
  kettlebell: "KB",
  band: "BAND",
  bodyweight: "BW",
  "cardio-machine": "CARDIO",
  none: "NONE",
}

const TYPE_SHORT: Record<ExerciseType, string> = {
  strength: "STR",
  bodyweight: "BODY",
  cardio: "CARD",
  mobility: "MOB",
}

const TYPE_CHIP: Record<ExerciseType, string> = {
  strength: "border-violet-400/50 bg-violet-500/15 text-violet-200",
  bodyweight: "border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-200",
  cardio: "border-teal-400/40 bg-teal-500/10 text-teal-200",
  mobility: "border-amber-400/40 bg-amber-500/10 text-amber-200",
}

const DIFF_LABEL: Record<1 | 2 | 3, string> = {
  1: "NOVICE",
  2: "INTERMEDIATE",
  3: "ADVANCED",
}

const NO_EQUIPMENT_COUNT = EXERCISE_LIBRARY.filter(
  (e) => e.equipment === "bodyweight" || e.equipment === "none"
).length

/**
 * One step of the dialog-open cascade (R5-c flow language) — a self-animating
 * block that rises 12px on the signature ease, staggered by section index
 * (0.05s + i × 0.06s). Radix unmounts dialog content on close, so plain
 * initial/animate replays the cascade on every open. Reduced motion →
 * renders at rest instantly.
 */
function cascadeStep(reduce: boolean, i: number): HTMLMotionProps<"div"> {
  if (reduce) return { initial: false }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + i * 0.06 },
  }
}

/** Relevance score of a library entry against the typed query (higher = better). */
function scoreEntry(ex: ExerciseDef, q: string): number {
  const name = normalizeName(ex.name)
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  for (const a of ex.aliases) {
    const na = normalizeName(a)
    if (na === q) return 50
    if (na.startsWith(q)) return 45
    if (na.includes(q)) return 40
    if (na.length >= 4 && q.includes(na)) return 30
  }
  if (name.length >= 4 && q.includes(name)) return 30
  return 0
}

/** Add/update-exercise window with live XP estimate and searchable exercise library.
 *  R13-a: pass `editLog` to open it in EDIT mode — the form prefills from the
 *  existing log (incl. its captured RIR) and submit POSTs `update-log` instead
 *  of `add-log`. */
export function ExerciseDialog({
  gate,
  template,
  editLog = null,
  hunter,
  sessionId,
  open,
  onOpenChange,
  onAdded,
}: {
  gate: GateDef
  template: ExerciseTemplate | null
  /** R13-a: the log being corrected — null = classic add mode. */
  editLog?: ExerciseLogDTO | null
  hunter: HunterDTO
  sessionId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  onAdded: () => void
}) {
  const { pushNotice } = useSystem()
  const reduce = useReducedMotion() ?? false
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ExerciseDef | null>(null)
  const [equipFilter, setEquipFilter] = useState<EquipFilter>("ALL")
  // R8-a: reps-in-reserve on the last set — null = SKIP (the default; never
  // force users to lie about effort). Only shipped for strength/bodyweight.
  const [rir, setRir] = useState<number | null>(null)
  // R17-D: Strong-style set notes — free-form, optional, ships as string|null.
  // The prefill value is latched so an UNCHANGED field can be omitted from
  // the PATCH body (undefined = keep existing server-side): an edit that
  // never touched notes can never wipe them — which also guards the case
  // where the wire rows don't carry notes yet (shared sessionDTO predates
  // the column).
  const [notes, setNotes] = useState("")
  const notesPrefillRef = useRef("")
  const [form, setForm] = useState<FormState>({
    name: "",
    type: "bodyweight",
    sets: 3,
    reps: 10,
    weightKg: 0,
    durationMin: 0,
  })

  // prefill — R13-a edit path wins when an editLog target is present (the
  // template is null on that path, so the two never fight); otherwise the
  // template prefill / blank-open reset runs exactly as before. The dependency
  // array includes editLog so a stale edit prefill is reset when the parent
  // clears the target on dialog close.
  useEffect(() => {
    if (editLog) {
      setForm({
        name: editLog.name,
        type: (Object.keys(TYPE_LABEL) as ExerciseType[]).find((t) => t === editLog.type) ?? "bodyweight",
        sets: editLog.sets,
        reps: editLog.reps,
        weightKg: editLog.weightKg,
        durationMin: editLog.durationMin,
      })
      // edit path restores the captured effort — the add path's reset-to-SKIP
      // below must not eat it, so it returns early here
      setRir(editLog.rir)
      // R17-D: notes prefill rides the same edit-path block (rir pattern) —
      // the add path's reset below must not eat it either.
      setNotes((editLog as EditableLog).notes ?? "")
      notesPrefillRef.current = (editLog as EditableLog).notes ?? ""
      setSelected(null)
      setEquipFilter("ALL")
      setError(null)
      return
    }
    if (template) {
      setForm({
        name: template.name,
        type: template.type,
        sets: template.defaultSets,
        reps: template.defaultReps,
        weightKg: template.defaultWeight,
        durationMin: template.defaultMinutes,
      })
    } else if (open) {
      setForm({ name: "", type: "bodyweight", sets: 3, reps: 10, weightKg: 0, durationMin: 0 })
    }
    setSelected(null)
    setEquipFilter("ALL")
    setRir(null)
    setNotes("")
    notesPrefillRef.current = ""
    setError(null)
  }, [template, open, editLog])

  const xpPreview = useMemo(
    () =>
      exerciseXp(form.type, form.sets, Math.max(0, form.reps), Math.max(0, form.weightKg), Math.max(0, form.durationMin), {
        str: hunter.stats.str,
        vit: hunter.stats.vit,
        endur: hunter.stats.endur,
        agi: hunter.stats.agi,
        flex: hunter.stats.flex,
      }),
    [form, hunter]
  )

  // live XP numeral — eases between values as the form changes
  const xpLive = useCountUp(xpPreview, 0.6)

  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }))

  const pick = (ex: ExerciseDef) => {
    setSelected(ex)
    setForm((f) => ({ ...f, name: ex.name, type: ex.type }))
  }

  // R6-a — same-pattern equipment alternatives for the picked exercise
  const variantEntries = useMemo(() => (selected ? variantsFor(selected.id) : []), [selected])

  // library suggestions — name + alias match against the typed query,
  // optionally narrowed by the equipment filter chips
  const query = useMemo(() => normalizeName(form.name), [form.name])
  const suggestions = useMemo(() => {
    const allowed = FILTER_BY_KEY[equipFilter]
    const scored: { ex: ExerciseDef; score: number }[] = []
    for (const ex of EXERCISE_LIBRARY) {
      if (allowed.length > 0 && !allowed.includes(ex.equipment)) continue
      const score = query.length >= 2 ? scoreEntry(ex, query) : equipFilter !== "ALL" ? 1 : 0
      if (score > 0) scored.push({ ex, score })
    }
    // stable sort — equal scores keep library order
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, 8).map((s) => s.ex)
  }, [query, equipFilter])

  const showSuggestions = query.length >= 2 || equipFilter !== "ALL"

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      // R8-a: effort ships only for strength/bodyweight classes — cardio and
      // mobility never render the stepper, so their body stays rir:null.
      const rirOut = form.type === "strength" || form.type === "bodyweight" ? rir : null
      // R17-D: notes ship for every class (Strong's exercise notes are
      // class-agnostic). An UNCHANGED field ships undefined — JSON.stringify
      // omits it, the PATCH handler reads that as keep-existing — while a
      // changed field ships trimmed (empty → null = clear). The textarea's
      // maxLength 140 sits under the server's 200-char clamp.
      const notesOut: string | null | undefined =
        notes === notesPrefillRef.current ? undefined : notes.trim() === "" ? null : notes.trim()
      if (editLog) {
        // R13-a edit mode — in-place correction via update-log. The response
        // carries no `pr` (PR bonus XP is a one-time mint on add; an edit
        // recomputes base XP only), so a plain xp notice is pushed.
        // R32-a: `rpe` is deliberately NOT in this body — update-log's rpe is
        // keep-on-omit (the R17-D notes precedent), so omitting preserves the
        // stored rating. The sheet has no RPE input (rating happens on the
        // raid console's stepper) and echoing editLog.rpe would ship an
        // explicit value from a possibly-stale wire row — explicit null
        // CLEARS server-side, so the echo form would be the one leg that
        // could wipe a just-captured rating mid-refetch. The stored-RPE line
        // below surfaces the rating read-only instead.
        await api<{ session: unknown }>(`/api/sessions/${sessionId}`, {
          method: "POST",
          body: JSON.stringify({ action: "update-log", logId: editLog.id, ...form, rir: rirOut, notes: notesOut }),
        })
        pushNotice({ kind: "xp", title: "Exercise updated", body: `${form.name} · +${xpPreview} XP pending` })
      } else {
        const res = await api<{ session: unknown; pr: PrInfo | null }>(`/api/sessions/${sessionId}`, {
          method: "POST",
          body: JSON.stringify({ action: "add-log", ...form, rir: rirOut, notes: notesOut }),
        })
        if (res.pr) {
          const prev = res.pr.previous > 0 ? ` · WAS ${res.pr.previous} ${res.pr.unit}` : " · FIRST ENTRY"
          pushNotice({
            kind: "title",
            title: "NEW PERSONAL RECORD",
            body: `${res.pr.displayName} — ${res.pr.value} ${res.pr.unit}${prev} · +${res.pr.bonusXp} BONUS XP`,
          })
        } else {
          pushNotice({ kind: "xp", title: "Exercise logged", body: `${form.name} · +${xpPreview} XP pending` })
        }
      }
      onAdded()
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const timeBased = form.type === "cardio" || form.type === "mobility"
  // R7-b: timed-hold template — the reps field carries hold seconds
  const repsAreSeconds = (template as SheetTemplate | null)?.repsAreSeconds === true
  // R8-a: contextual effort coaching for the selected RIR (teal science accent)
  const rirHint = rirVerdictLine(rir)

  // live muscle targeting — resolves as the user types or picks a template
  const muscleInfo = useMemo(
    () => (form.name.trim().length >= 2 ? mapExerciseToMuscles(form.name) : null),
    [form.name]
  )

  // ── R1-c: progression + PR context for the current exercise name ──────────
  const { data: progData } = useApi<{ entries: ProgressionEntry[] }>("/api/progression")
  const { data: prData } = useApi<{ records: PersonalBestDTO[] }>("/api/prs")

  const progKey = progressionKey(form.name)
  const historyEntry = useMemo(
    () => (progData?.entries ?? []).find((e) => e.key === progKey || progressionKey(e.name) === progKey) ?? null,
    [progData, progKey]
  )
  const matchedPb = useMemo(
    () => (prData?.records ?? []).find((r) => r.name === progKey) ?? null,
    [prData, progKey]
  )

  // LAST TIME — last logged working set for this exercise
  const lastTimeText = useMemo(() => {
    const ll = historyEntry?.lastLog
    if (!ll) return null
    if (ll.weightKg > 0 && ll.reps > 0) {
      // R68 — the e1RM segment rides only honest Epley-domain sets: the route
      // sends 0 for 13+ rep sets (no fabricated extrapolation — just no segment)
      const e1 = ll.e1rm > 0 ? ` · e1RM ${fmtKg(ll.e1rm)} KG` : ""
      return `${ll.sets}×${ll.reps} @ ${fmtKg(ll.weightKg)} KG${e1} · ${formatDayLabel(ll.day)}`
    }
    if ((ll.durationMin ?? 0) > 0) return `${ll.durationMin} MIN · ${formatDayLabel(ll.day)}`
    if (ll.reps > 0) return `${ll.sets}×${ll.reps} REPS · ${formatDayLabel(ll.day)}`
    return null
  }, [historyEntry])

  // SUGGESTED — next load on a BUMP LOAD verdict
  const suggestedLine = useMemo(() => {
    const e = historyEntry
    if (!e || e.suggestion.action !== "BUMP LOAD") return null
    const from = e.lastLog.weightKg
    if (from <= 0) return null
    const to = +(from + parseBumpKg(e.suggestion.detail)).toFixed(1)
    return `${fmtKg(to)} KG (${e.suggestion.detail})`
  }, [historyEntry])

  // PERSONAL BEST — record + context (+ derived Epley e1RM)
  const pbContextText = useMemo(() => {
    const ctx = matchedPb?.context
    if (!ctx || !matchedPb) return null
    if (matchedPb.unit === "kg" && ctx.weightKg > 0) return `${ctx.sets}×${ctx.reps} @ ${fmtKg(ctx.weightKg)} KG`
    if (matchedPb.unit === "min") return ctx.durationMin > 0 ? `${ctx.durationMin} MIN` : `${ctx.sets}×${ctx.reps}`
    return `${ctx.sets}×${ctx.reps}`
  }, [matchedPb])
  const pbE1rm = useMemo(() => {
    const ctx = matchedPb?.context
    // R68 — Epley's 1-12 rep domain only: a 13+ rep record context has no
    // honest e1RM, and the segment honestly stays unrendered (the null path)
    if (!ctx || !validE1rmSet(ctx.reps, ctx.weightKg)) return null
    return epleyE1rm(ctx.weightKg, ctx.reps)
  }, [matchedPb])

  // LAST 2 SESSIONS mini-list — top set per session from the progression trend
  const lastTwoSessions = useMemo(() => (historyEntry?.trend ?? []).slice(-2), [historyEntry])

  // ── R17-D: warm-up ramp presets (Strong/Hevy auto warm-up) ─────────────
  // The base ("working") weight is latched per dialog open from the three
  // known sources — the plan block's prescription (template.defaultWeight),
  // the edit target's captured weight, or the last logged working set —
  // NEVER the live form field (tapping the 50% preset would rebase the chips
  // to 25% of themselves). Percentages round to the nearest 2.5 kg plate; a preset
  // that rounds to a zero load drops out, and the whole row stays hidden for
  // non-strength classes or unknown weights — no dead chips.
  const warmupBase = useMemo(() => {
    if (editLog) return Math.max(0, editLog.weightKg)
    const prescribed = template?.defaultWeight ?? 0
    if (prescribed > 0) return prescribed
    const ll = historyEntry?.lastLog
    return ll && ll.weightKg > 0 ? ll.weightKg : 0
  }, [editLog, template, historyEntry])

  const warmupPresets = useMemo(() => {
    if (form.type !== "strength" || warmupBase <= 0) return []
    return WARMUP_RAMP.flatMap(({ pct, reps }) => {
      const weight = Math.round((warmupBase * pct) / 100 / 2.5) * 2.5
      return weight > 0 ? [{ pct, reps, weight }] : []
    })
  }, [form.type, warmupBase])

  // R17-D: one-tap warm-up fill — weight + reps snap to the preset (and SETS
  // drops to 1 so the logged entry is genuinely a single warm-up set).
  const applyWarmup = (weight: number, reps: number) => {
    set({ weightKg: weight, reps, sets: 1 })
  }

  // ── R19-a: plate calculator — derived purely from the live form, so the
  // stack re-builds on every weight keystroke, warm-up chip tap and SNAP
  // (the warm-up chips snap WEIGHT through set(); this memo just re-reads
  // it). Text lines (per-side breakdown + verification sum) precompute
  // here so the JSX stays declarative.
  const plateCalc = useMemo(() => {
    if (form.type !== "strength") return null
    const name = form.name.trim()
    if (name.length < 2) return null
    const def = EXERCISES_BY_NAME.get(normalizeName(name))
    if (!def || def.equipment !== "barbell" || def.type !== "strength") return null
    const w = Number.isFinite(form.weightKg) ? Math.max(0, form.weightKg) : 0
    const load = computePlateLoad(w)
    const sideText =
      load.plates.length > 0 ? `${load.plates.map((p) => `${p.plate}×${p.count}`).join(" · ")} / SIDE` : "EMPTY BAR"
    const sumText =
      load.plates.length > 0 || w >= BAR_KG
        ? `20 + 2×${fmtKg2(load.perSideKg)} = ${fmtKg(load.loadedKg)} KG`
        : w > 0
          ? `${fmtKg(w)} KG < 20 KG BAR`
          : "20 KG BAR"
    return { ...load, sideText, sumText }
  }, [form.type, form.name, form.weightKg])

  // PR PACE — live e1RM of the editing form beating the matched record
  const prPace = useMemo(() => {
    if (form.type !== "strength" || !matchedPb) return null
    if (matchedPb.unit === "reps") {
      const total = Math.max(0, form.sets) * Math.max(0, form.reps)
      return total > matchedPb.bestValue
        ? { label: `PR PACE · ${total} > ${fmtKg(matchedPb.bestValue)} REPS`, aria: `Current entry ${total} reps — on record pace` }
        : null
    }
    // R68/B4 — record baseline: the exact record set when it sits inside
    // Epley's 1-12 rep domain, else the heaviest-set weight itself — already
    // a lower bound on e1RM, used directly (never wrapped in a synthetic
    // 1-rep Epley that would fabricate +3.3%).
    const ctx = matchedPb.context
    const pbVal = ctx && validE1rmSet(ctx.reps, ctx.weightKg) ? epleyE1rm(ctx.weightKg, ctx.reps) : matchedPb.bestValue
    // R68 — pace exists only for honest Epley-domain entries (1-12 reps,
    // loaded); a 13+ rep entry has no e1RM to race → no pace line, honestly.
    if (!validE1rmSet(form.reps, form.weightKg)) return null
    const cur = epleyE1rm(form.weightKg, form.reps)
    return cur > pbVal
      ? { label: `PR PACE · ${fmtKg(cur)} > ${fmtKg(pbVal)} KG E1RM`, aria: `Current entry e1RM ${fmtKg(cur)} kg — on record pace` }
      : null
  }, [form.type, form.sets, form.reps, form.weightKg, matchedPb])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sys-panel max-w-md rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl">
        {/* R5-c — open cascade: header → context → library → form → xp → submit */}
        <motion.div {...cascadeStep(reduce, 0)}>
          <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
            <DialogTitle className="sys-label text-violet-300/80">
              {editLog ? "Update Log" : "Log Exercise"} · {gate.name}
            </DialogTitle>
          </DialogHeader>
        </motion.div>

        <div className="scroll-sys max-h-[70vh] overflow-y-auto px-5 py-4">
          {/* name + progression context */}
          <motion.div {...cascadeStep(reduce, 1)}>
          <label className="sys-label block text-zinc-400" htmlFor="ex-name">
            Exercise
          </label>
          <input
            id="ex-name"
            value={form.name}
            onChange={(e) => {
              setSelected(null)
              set({ name: e.target.value })
            }}
            placeholder="e.g. Push-ups"
            className="mt-1.5 h-10 w-full rounded-sm border border-violet-500/25 bg-zinc-950/70 px-3 font-mono text-sm text-violet-100 placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
            autoComplete="off"
          />

          {/* R1-c: last time / suggested load / personal-best context */}
          {lastTimeText && (
            <p className="mt-2.5 font-mono text-[10px] tracking-[0.15em] text-zinc-400">LAST TIME: {lastTimeText}</p>
          )}
          {suggestedLine && (
            <p className="mt-1 flex items-center gap-1.5 font-mono text-[10px] tracking-[0.15em] text-amber-300">
              <TrendingUp className="h-3 w-3 shrink-0" aria-hidden /> SUGGESTED: {suggestedLine}
            </p>
          )}
          </motion.div>
          {matchedPb && (
            <motion.div
              {...cascadeStep(reduce, 2)}
              whileHover={reduce ? undefined : { y: -1, transition: { duration: 0.18, ease: FLOW_EASE } }}
              className="mt-2.5 rounded-sm border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
            >
              <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-amber-300">
                <Trophy className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />
                PERSONAL BEST · {fmtKg(matchedPb.bestValue)} {matchedPb.unit.toUpperCase()}
                {pbContextText ? ` · ${pbContextText}` : ""}
                {pbE1rm !== null ? ` · E1RM ${fmtKg(pbE1rm)} KG` : ""}
              </p>
              {lastTwoSessions.length > 0 && (
                <div className="mt-2">
                  <p className="sys-label text-zinc-400">Last 2 sessions</p>
                  <ul className="mt-1 space-y-0.5">
                    {lastTwoSessions.map((t, i) => (
                      <li
                        key={`${t.day}-${i}`}
                        className="flex items-center justify-between gap-2 font-mono text-[9px] tracking-[0.12em] text-zinc-400"
                      >
                        <span className="shrink-0">{formatDayLabel(t.day).toUpperCase()}</span>
                        <span className="min-w-0 truncate tabular-nums">
                          {(t.reps ?? 0) > 0 && (t.weightKg ?? 0) > 0 && `${t.sets}×${t.reps} @ ${fmtKg(t.weightKg ?? 0)} KG`}
                          {(t.reps ?? 0) > 0 && (t.weightKg ?? 0) <= 0 && `${t.sets}×${t.reps} REPS`}
                          {(t.reps ?? 0) <= 0 && `${t.sets ?? 0} SETS`}
                          {t.e1rm > 0 ? ` · e1RM ${fmtKg(t.e1rm)}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* library picker: filters + live suggestions */}
          <motion.div {...cascadeStep(reduce, 3)} className="mt-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="sys-label text-zinc-400">Library</p>
              <button
                type="button"
                onClick={() => setEquipFilter((f) => (f === "BW" ? "ALL" : "BW"))}
                aria-pressed={equipFilter === "BW"}
                className={cn(
                  "shrink-0 rounded-sm border px-2 py-1 font-mono text-[9px] font-bold tracking-widest uppercase transition-all",
                  "focus-visible:outline focus-visible:outline-violet-400/70",
                  equipFilter === "BW"
                    ? "border-teal-400/60 bg-teal-500/15 text-teal-200"
                    : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-teal-400/40 hover:text-teal-300"
                )}
              >
                NO EQUIPMENT · {NO_EQUIPMENT_COUNT}
              </button>
            </div>
            <div
              className="scroll-sys -mx-1 mt-1.5 flex gap-1.5 overflow-x-auto px-1 pb-1"
              role="group"
              aria-label="Equipment filter"
            >
              {EQUIP_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setEquipFilter(f.key)}
                  aria-pressed={equipFilter === f.key}
                  className={cn(
                    "min-h-7 shrink-0 rounded-sm border px-2.5 font-mono text-[9px] tracking-widest uppercase transition-all",
                    "focus-visible:outline focus-visible:outline-violet-400/70",
                    equipFilter === f.key
                      ? "border-violet-400/70 bg-violet-500/20 text-violet-200"
                      : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-violet-500/40"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {showSuggestions &&
              (suggestions.length > 0 ? (
                <div
                  className="scroll-sys mt-1.5 max-h-56 space-y-1.5 overflow-y-auto pr-0.5"
                  role="listbox"
                  aria-label="Matching exercises"
                >
                  {suggestions.map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      role="option"
                      aria-selected={selected?.id === ex.id}
                      onClick={() => pick(ex)}
                      className={cn(
                        "flex min-h-11 w-full flex-col gap-1.5 rounded-sm border px-3 py-2.5 text-left transition-colors",
                        "focus-visible:outline focus-visible:outline-violet-400/70",
                        selected?.id === ex.id
                          ? "border-violet-400/70 bg-violet-500/15"
                          : "border-zinc-800/80 bg-zinc-950/60 hover:border-violet-500/40 hover:bg-violet-500/10"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-violet-100">{ex.name}</span>
                        <span
                          className={cn(
                            "shrink-0 rounded-sm border px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase",
                            TYPE_CHIP[ex.type]
                          )}
                        >
                          {TYPE_SHORT[ex.type]}
                        </span>
                        <span className="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-zinc-400">
                          {EQUIP_SHORT[ex.equipment]}
                        </span>
                        <span
                          className="flex shrink-0 items-center gap-0.5"
                          aria-label={`Difficulty ${ex.difficulty} of 3`}
                          title={`Difficulty ${ex.difficulty} of 3`}
                        >
                          {[1, 2, 3].map((d) => (
                            <span
                              key={d}
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                d <= ex.difficulty ? "bg-amber-400/80" : "bg-zinc-700/70"
                              )}
                            />
                          ))}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-1">
                        {ex.muscles.primary.length === 0 ? (
                          <span className="font-mono text-[9px] tracking-widest text-zinc-400 uppercase">
                            Full-body · conditioning
                          </span>
                        ) : (
                          ex.muscles.primary.map((m) => (
                            <span
                              key={m}
                              className="rounded-sm border border-violet-400/40 bg-violet-500/10 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-violet-200/90 uppercase"
                            >
                              {MUSCLE_BY_ID[m]?.name ?? m}
                            </span>
                          ))
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 rounded-sm border border-zinc-800/80 bg-zinc-950/50 px-3 py-2.5 text-center font-mono text-[10px] tracking-wider text-zinc-400">
                  No library match — logging custom exercise
                </p>
              ))}
          </motion.div>

          {/* selected entry: cues + evidence + swaps + difficulty — snappy reveal on pick */}
          {selected && (
            <motion.div
              key={selected.id}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE }}
              className="mt-2.5 rounded-sm border border-violet-500/25 bg-violet-500/5 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold tracking-wider text-violet-200">{selected.name}</span>
                <span className="flex items-center gap-1.5">
                  {[1, 2, 3].map((d) => (
                    <span
                      key={d}
                      className={cn("h-1.5 w-1.5 rounded-full", d <= selected.difficulty ? "bg-amber-400/80" : "bg-zinc-700/70")}
                      aria-hidden
                    />
                  ))}
                  <span className="font-mono text-[9px] tracking-widest text-amber-300/80 uppercase">
                    {DIFF_LABEL[selected.difficulty]}
                  </span>
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {selected.cues.slice(0, 3).map((c) => (
                  <li key={c} className="flex gap-1.5 text-[11px] leading-snug text-zinc-400">
                    <span aria-hidden className="mt-px font-mono text-[9px] text-violet-400/70">
                      ▸
                    </span>
                    {c}
                  </li>
                ))}
              </ul>
              {selected.science && (
                <p className="mt-2 flex items-start gap-1.5 rounded-sm border border-teal-500/25 bg-teal-500/10 px-2 py-1.5 font-mono text-[10px] leading-snug text-teal-300/90">
                  <FlaskConical className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {selected.science}
                </p>
              )}
              {/* R6-a — same-pattern swaps across equipment classes; tapping swaps the selection */}
              {variantEntries.length > 0 && (
                <div className="mt-2">
                  <p className="sys-label text-zinc-400">Equipment Swaps</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {variantEntries.map((v) => (
                      <motion.button
                        key={v.id}
                        type="button"
                        onClick={() => pick(v)}
                        {...tapMotion}
                        aria-label={`Swap to ${v.name} — ${v.equipment} alternative, same movement pattern`}
                        className="inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-sm border border-zinc-700 bg-zinc-950/50 px-3 py-1.5 text-left transition-colors hover:border-violet-400/60 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        <span className="min-w-0 truncate font-mono text-[10px] tracking-wider text-zinc-300">{v.name}</span>
                        <span className="shrink-0 rounded-sm border border-zinc-700/60 bg-zinc-900/60 px-1 py-0.5 font-mono text-[8px] font-bold tracking-widest text-zinc-400">
                          {EQUIP_SHORT[v.equipment]}
                        </span>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* live muscle targeting — snappy reveal while typing */}
          {muscleInfo && (muscleInfo.primary.length > 0 || muscleInfo.secondary.length > 0) && (
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.28, ease: FLOW_EASE }}
              className="mt-2.5"
            >
              <p className="sys-label text-zinc-400">Targets</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {muscleInfo.primary.map((m) => (
                  <span
                    key={`p-${m}`}
                    className="rounded-sm border border-violet-400/50 bg-violet-500/15 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-widest text-violet-200 uppercase"
                  >
                    {MUSCLE_BY_ID[m]?.name ?? m}
                  </span>
                ))}
                {muscleInfo.secondary.map((m) => (
                  <span
                    key={`s-${m}`}
                    className="rounded-sm border border-zinc-700/60 bg-zinc-900/40 px-1.5 py-0.5 font-mono text-[9px] tracking-widest text-zinc-400 uppercase"
                  >
                    {MUSCLE_BY_ID[m]?.name ?? m}
                  </span>
                ))}
              </div>
            </motion.div>
          )}
          {!template && (
            <motion.div {...cascadeStep(reduce, 4)}>
              <p className="sys-label mt-4 text-zinc-400">Class</p>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {(Object.keys(TYPE_LABEL) as ExerciseType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => set({ type: t })}
                    aria-pressed={form.type === t}
                    className={cn(
                      "rounded-sm border px-1 py-2 font-mono text-[10px] tracking-wider transition-all",
                      "focus-visible:outline focus-visible:outline-violet-400/70",
                      form.type === t
                        ? "border-violet-400/70 bg-violet-500/20 text-violet-200"
                        : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-violet-500/40"
                    )}
                  >
                    {TYPE_LABEL[t].toUpperCase()}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* numeric fields */}
          <motion.div {...cascadeStep(reduce, 5)} className="mt-4 space-y-3">
            <NumRow
              label="SETS"
              value={form.sets}
              min={1}
              max={50}
              onChange={(v) => set({ sets: v })}
            />
            {!timeBased && (
              <NumRow
                label={repsAreSeconds ? "SECS / SET" : "REPS / SET"}
                value={form.reps}
                min={1}
                max={2000}
                onChange={(v) => set({ reps: v })}
              />
            )}
            {form.type === "cardio" && (
              <NumRow
                label="REPS (OPTIONAL)"
                value={form.reps}
                min={0}
                max={2000}
                onChange={(v) => set({ reps: v })}
              />
            )}
            {form.type === "strength" && (
              <NumRow
                label="WEIGHT (KG)"
                value={form.weightKg}
                min={0}
                max={500}
                step={2.5}
                unit
                onChange={(v) => set({ weightKg: v })}
              />
            )}
            {timeBased && (
              <NumRow
                label="MINUTES"
                value={form.durationMin}
                min={0}
                max={300}
                onChange={(v) => set({ durationMin: v })}
              />
            )}
          </motion.div>

          {/* R17-D: WARM-UP RAMP — Strong/Hevy-style presets off the known
              working weight (plan prescription > edit target > last logged).
              One tap fills WEIGHT + REPS for a single warm-up set; hidden
              entirely when no base weight is known. Teal = science/utility. */}
          {warmupPresets.length > 0 && (
            <motion.div {...cascadeStep(reduce, 6)} className="mt-4">
              <div role="group" aria-label="Warm-up ramp presets">
                <p className="sys-label text-zinc-400">Warm-up Ramp</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {warmupPresets.map((p) => (
                    <motion.button
                      key={p.pct}
                      type="button"
                      onClick={() => applyWarmup(p.weight, p.reps)}
                      whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}
                      aria-label={`Warm-up preset: ${p.pct} percent of ${fmtKg(warmupBase)} kg — ${fmtKg(p.weight)} kg for ${p.reps} reps`}
                      className={cn(
                        "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-sm border border-teal-500/40 bg-teal-500/10 px-1 py-2 transition-colors",
                        "hover:border-teal-400/60 hover:bg-teal-500/20",
                        "focus-visible:outline focus-visible:outline-violet-400/70"
                      )}
                    >
                      <span className="sys-label text-teal-200">{p.pct}% ×{p.reps}</span>
                      <span className="font-mono text-[9px] tabular-nums text-zinc-400">{fmtKg(p.weight)} KG</span>
                    </motion.button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* R19-a: PLATE CALCULATOR — Strong/Hevy-style bar-loading breakdown
              for barbell strength lifts. Tactile per-side stack (glyphs sized
              by mass, violet family + amber 25 kg) riding a zinc sleeve; the
              text line carries the per-side breakdown + bar-inclusive
              verification sum. Odd loads surface an amber note + one-tap SNAP
              (floor to inventory granularity) instead of being silently
              swallowed; weight ≤ 20 → EMPTY BAR. Hidden entirely for
              non-barbell exercises (warm-up ramp idiom). */}
          {plateCalc && (
            <motion.div {...cascadeStep(reduce, 7)} className="mt-4">
              <div role="group" aria-label="Bar load plate calculator">
                <p className="sys-label text-zinc-400">Bar Load · 20 KG Bar</p>
                <div className="mt-1.5 rounded-sm border border-zinc-800/80 bg-zinc-950/60 px-3 py-3">
                  {/* sleeve collar + plate glyphs + sleeve running toward the
                      bar center — decorative; the text lines carry the data */}
                  <div className="flex items-center gap-[3px]" aria-hidden>
                    <span className="h-4 w-0.5 shrink-0 rounded-full bg-zinc-600" />
                    {plateCalc.glyphStack.map((plate, i) => {
                      // occurrence index of this denomination keeps keys stable
                      // as the stack grows — existing plates never re-pop
                      const nth = plateCalc.glyphStack.slice(0, i).filter((p) => p === plate).length
                      return <PlateGlyph key={`${plate}-${nth}`} plate={plate} />
                    })}
                    {plateCalc.overflow > 0 && (
                      <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums text-zinc-400">
                        +{plateCalc.overflow}
                      </span>
                    )}
                    <span className="h-1.5 min-w-6 flex-1 rounded-full bg-zinc-700/90" />
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <p className="font-mono text-[9px] tracking-[0.12em] text-zinc-400">{plateCalc.sideText}</p>
                    <p className="text-right font-mono text-[9px] tracking-[0.12em] tabular-nums text-zinc-400">
                      {plateCalc.sumText}
                    </p>
                  </div>
                  {plateCalc.nearestKg !== null && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <p className="min-w-0 flex-1 font-mono text-[9px] tracking-[0.12em] text-amber-300/90">
                        ODD {plateCalc.oddKg.toFixed(2)} KG — NEAREST LOADABLE {fmtKg(plateCalc.nearestKg)} KG
                      </p>
                      <motion.button
                        type="button"
                        onClick={() => {
                          // local narrow — TS can't carry memo-property
                          // narrowing across the closure boundary
                          const snapTo = plateCalc.nearestKg
                          if (snapTo !== null) set({ weightKg: snapTo })
                        }}
                        whileTap={reduce ? undefined : { scale: 0.96, transition: SPRING_SNAPPY }}
                        aria-label={`Snap weight to ${fmtKg(plateCalc.nearestKg)} kg — nearest loadable bar load`}
                        className="flex min-h-11 shrink-0 items-center rounded-sm border border-amber-400/60 bg-amber-500/10 px-4 font-mono text-[10px] font-bold tracking-[0.2em] text-amber-200 transition-colors hover:border-amber-300/80 hover:bg-amber-500/20 focus-visible:outline focus-visible:outline-violet-400/70"
                      >
                        SNAP
                      </motion.button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* R8-a: EFFORT · RIR — optional capture, strength/bodyweight only.
              Default SKIP/null; selecting a digit highlights it violet and the
              teal line coaches the zone (shared rirVerdictLine mapping). */}
          {!timeBased && (
            <motion.div {...cascadeStep(reduce, 8)} className="mt-4">
              <div role="group" aria-label="Reps in reserve">
                <p className="sys-label text-zinc-400">RIR · REPS IN RESERVE</p>
                <div className="mt-1.5 grid grid-cols-6 gap-1.5">
                  {[0, 1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRir(rir === v ? null : v)}
                      aria-pressed={rir === v}
                      aria-label={`${v} reps in reserve`}
                      className={cn(
                        "min-h-11 rounded-sm border font-mono text-sm font-bold tabular-nums transition-all",
                        "focus-visible:outline focus-visible:outline-violet-400/70",
                        rir === v
                          ? "border-violet-400/70 bg-violet-500/20 text-violet-200"
                          : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-violet-500/40 hover:text-violet-300"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setRir(null)}
                  aria-pressed={rir === null}
                  className={cn(
                    "mt-1.5 flex min-h-11 w-full items-center justify-center rounded-sm border font-mono text-[10px] font-bold tracking-[0.25em] transition-all",
                    "focus-visible:outline focus-visible:outline-violet-400/70",
                    rir === null
                      ? "border-zinc-500/70 bg-zinc-800/60 text-zinc-300"
                      : "border-zinc-700/60 bg-zinc-950/50 text-zinc-400 hover:border-zinc-500/50 hover:text-zinc-400"
                  )}
                >
                  SKIP
                </button>
                <p className="mt-1.5 font-mono text-[9px] tracking-[0.15em] text-zinc-400">
                  0 = NOTHING LEFT · 2-3 = PRODUCTIVE ZONE · ROBINSON 2024
                </p>
                {rirHint && (
                  <p role="status" className="mt-1 font-mono text-[9px] tracking-[0.15em] text-teal-400/80">
                    {rirHint}
                  </p>
                )}
                {/* R32-a — STORED RPE (read-only): rating a set happens on the
                    raid console's CR10 stepper, not in this sheet — but an
                    edit must SHOW the persisted rating (the RIR stepper's
                    sibling surface) so correcting reps/weight never reads as
                    an unrated set. Legacy rows get the honest zinc dash —
                    NEVER a fabricated rating. Edit path only; the add path
                    has nothing to show (new logs start unrated). */}
                {editLog && (
                  <p
                    title={editLog.rpe != null ? describeRpe(editLog.rpe) : undefined}
                    className={cn(
                      "mt-1.5 font-mono text-[9px] tracking-[0.15em]",
                      editLog.rpe != null ? "text-zinc-400" : "text-zinc-500"
                    )}
                  >
                    {editLog.rpe != null
                      ? `RATED RPE ${editLog.rpe} · KEPT — RATE ON THE RAID CONSOLE`
                      : "RPE — · RATE ON THE RAID CONSOLE"}
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* R17-D: NOTES — Strong-style free-form per-exercise notes
              (optional, every class). EDIT mode prefills from the log's
              stored notes (same prefill block as RIR); an empty submit ships
              null, which clears on edit. */}
          <motion.div {...cascadeStep(reduce, 9)} className="mt-4">
            <label className="sys-label block text-zinc-400" htmlFor="ex-notes">
              Notes
            </label>
            <textarea
              id="ex-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={140}
              rows={2}
              placeholder="BAR PATH / CUES / FEELINGS…"
              aria-describedby="ex-notes-count"
              className="mt-1.5 w-full resize-none rounded-sm border border-violet-500/25 bg-zinc-950/70 px-3 py-2 font-mono text-xs leading-relaxed text-violet-100 placeholder:text-zinc-600 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
            />
            <p
              id="ex-notes-count"
              className="mt-1 text-right font-mono text-[9px] tracking-widest tabular-nums text-zinc-400"
            >
              {notes.length}/140
            </p>
          </motion.div>

          {/* xp preview */}
          <motion.div
            {...cascadeStep(reduce, 10)}
            className="mt-5 flex items-center justify-between rounded-sm border border-violet-500/30 bg-violet-500/10 px-4 py-3"
          >
            <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-violet-300/80">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> ESTIMATED XP
            </span>
            <span className="font-mono text-lg font-bold tabular-nums text-glow-violet">+{Math.round(xpLive)} XP</span>
          </motion.div>

          {error && (
            <p className="mt-3 rounded-sm border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300" role="alert">
              {error}
            </p>
          )}

          {/* R1-c: live PR pace chip — pulses while the editing entry beats the record */}
          {prPace && (
            <motion.p
              role="status"
              aria-label={prPace.aria}
              animate={reduce ? { scale: 1, opacity: 1 } : { scale: [1, 1.05, 1], opacity: [1, 0.7, 1] }}
              transition={reduce ? { duration: 0 } : { duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              className="mt-3 flex items-center justify-center gap-1.5 rounded-sm border border-amber-400/60 bg-amber-500/15 px-3 py-2 font-mono text-[9px] font-bold tracking-[0.2em] text-amber-300"
            >
              <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />
              {prPace.label}
            </motion.p>
          )}

          {/* submit — last cascade step */}
          <motion.div {...cascadeStep(reduce, 11)}>
            <button
              onClick={submit}
              disabled={busy || form.name.trim().length < 2}
              className="mt-4 h-11 w-full rounded-sm border border-violet-400/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(139,92,246,0.45)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              {editLog
                ? busy
                  ? "Updating…"
                  : "Update Log"
                : busy
                  ? "Logging…"
                  : "Log Exercise"}
            </button>
          </motion.div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function NumRow({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  unit?: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 font-mono text-[10px] tracking-[0.2em] text-zinc-400">{label}</span>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        onClick={() => onChange(Math.max(min, +(value - step).toFixed(1)))}
        className="grid h-8 w-8 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Minus className="h-3.5 w-3.5" aria-hidden />
      </button>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
        className="h-8 min-w-0 flex-1 rounded-sm border border-zinc-700/60 bg-zinc-950/70 px-2 text-center font-mono text-sm tabular-nums text-violet-100 focus:border-violet-400/60 focus:outline-none focus-visible:outline focus-visible:outline-violet-400/70"
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(Math.min(max, +(value + step).toFixed(1)))}
        className="grid h-8 w-8 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-violet-400/50 hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Plus className="h-3.5 w-3.5" aria-hidden />
      </button>
      {unit && <span className="w-4 shrink-0" />}
    </div>
  )
}

/** R19-a: one plate glyph — a pure-div barbell plate sized proportionally to
 *  its mass: height = 12 + (m/25)×40, width = 5 + (m/25)×8 → the 25 kg is
 *  tallest/widest, the 1.25 kg smallest. Violet-family skins descend with
 *  mass; the 25 kg carries the amber accent (the heaviest plate is the
 *  milestone load). Inner detail: plates ≥ 15 kg get a hollow hub ring,
 *  smaller ones a hub dot. Mounts on the PopIn spring so a growing stack
 *  lands physically; reduced motion → static div (PopIn self-gates). */
const PLATE_SKIN: Record<number, { frame: string; hub: string }> = {
  25: { frame: "border-amber-400/70 bg-amber-500/20", hub: "border-amber-300/80" },
  20: { frame: "border-violet-400/70 bg-violet-500/25", hub: "border-violet-300/70" },
  15: { frame: "border-violet-400/60 bg-violet-500/20", hub: "border-violet-300/60" },
  10: { frame: "border-violet-400/50 bg-violet-500/15", hub: "bg-violet-300/60" },
  5: { frame: "border-violet-400/40 bg-violet-500/10", hub: "bg-violet-300/50" },
  2.5: { frame: "border-violet-300/40 bg-violet-400/10", hub: "bg-violet-300/40" },
  1.25: { frame: "border-violet-300/30 bg-violet-400/10", hub: "bg-violet-300/30" },
}

function PlateGlyph({ plate }: { plate: number }) {
  const skin = PLATE_SKIN[plate] ?? { frame: "border-zinc-500/40 bg-zinc-500/10", hub: "bg-zinc-400/60" }
  const ring = plate >= 15
  const hub = ring ? 5 : plate >= 10 ? 3 : 2
  return (
    <PopIn
      className={cn("flex shrink-0 items-center justify-center rounded-sm border", skin.frame)}
      style={{ height: Math.round(12 + (plate / 25) * 40), width: Math.round(5 + (plate / 25) * 8) }}
    >
      <span style={{ height: hub, width: hub }} className={cn("rounded-full", ring ? "border" : "", skin.hub)} />
    </PopIn>
  )
}
