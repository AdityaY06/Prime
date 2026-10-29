"use client"

// ── PRIME · Guided awakening — calibration steps 2 + 3 (R33-a) ───────────────
// The AwakeningScreen state machine swaps between these steps. The PURE
// calibration contract lives at the top (no framework deps): the bounds
// byte-mirror the set-profile action in /api/nutrition — reject-don't-clamp,
// an invalid draft surfaces the server's own message, never a silently
// corrected value — and the payload builder emits exactly the shape that
// action consumes. The primary-goal chip is a LOCAL-ONLY preference (no API
// field exists and none is added): it persists under ONBOARDING_GOAL_KEY for
// the ASCENT advisor on the DIRECTIVES tab to read later.

import { Check, Minus, Plus, TrendingDown, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { DEFAULT_PROFILE, GOALS, calcTargets, type NutritionTargets } from "@/lib/nutrition"

// ── PURE CONTRACT ────────────────────────────────────────────────────────────

/** Number of guided steps the AwakeningScreen walks through. */
export const STEP_COUNT = 3

/** Validation bounds — byte-mirrors /api/nutrition set-profile (L491–532). */
export const BODY_BOUNDS = {
  weight: { min: 25, max: 300, message: "Weight must be between 25 and 300 kg." },
  height: { min: 100, max: 250, message: "Height must be between 100 and 250 cm." },
} as const

export const BIRTH_YEAR_MIN = 1920
export const BIRTH_YEAR_MESSAGE = "Birth year must be between 1920 and the current year."

/** The server accepts 1920…currentYear (a live ceiling, not a fixed max). */
export function birthYearMax(): number {
  return new Date().getFullYear()
}

/** The exact goal enum set-profile accepts (nutrition.ts GOALS ids). */
export const GOAL_IDS: readonly string[] = GOALS.map((g) => g.id)

export const NAME_ERROR = "Name must be 2–24 characters."

/** Name gate — mirrors the POST /api/hunter 400 message verbatim. */
export function nameError(name: string): string | null {
  const n = name.trim()
  return n.length < 2 || n.length > 24 ? NAME_ERROR : null
}

export type SexId = "male" | "female"
export const SEX_IDS: readonly SexId[] = ["male", "female"]

/** Step-2 draft — string fields so typing is never lossy; "" means unfilled. */
export type BodyDraft = {
  weight: string
  height: string
  birthYear: string
  sex: "" | SexId
}

export const EMPTY_BODY_DRAFT: BodyDraft = { weight: "", height: "", birthYear: "", sex: "" }

/** House parseNumeric — "" → null, non-finite → null (field reads as unfilled). */
export function parseNum(s: string): number | null {
  const t = s.trim()
  if (t === "") return null
  const v = Number(t)
  return Number.isFinite(v) ? v : null
}

/** round1, exactly like the server's own field rounding. */
function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function inBounds(v: number, min: number, max: number, integer = false): boolean {
  if (v < min || v > max) return false
  if (integer && !Number.isInteger(v)) return false
  return true
}

/** First invalid FILLED body field's server-verbatim message (null = clean). */
export function bodyFieldError(d: BodyDraft): string | null {
  const w = parseNum(d.weight)
  if (w !== null && !inBounds(w, BODY_BOUNDS.weight.min, BODY_BOUNDS.weight.max)) {
    return BODY_BOUNDS.weight.message
  }
  const h = parseNum(d.height)
  if (h !== null && !inBounds(h, BODY_BOUNDS.height.min, BODY_BOUNDS.height.max)) {
    return BODY_BOUNDS.height.message
  }
  const y = parseNum(d.birthYear)
  if (y !== null && !inBounds(y, BIRTH_YEAR_MIN, birthYearMax(), true)) {
    return BIRTH_YEAR_MESSAGE
  }
  return null
}

/** The set-profile POST body fields (spread AFTER `action: "set-profile"`). */
export type ProfilePayload = {
  heightCm?: number
  weightKg?: number
  birthYear?: number
  sex?: string
  goal?: string
}

/**
 * Only the fields the user actually filled — omitted keys keep their
 * null/default server-side (the documented library-default fallback).
 * Weight/height are round1'd exactly like the server. An invalid FILLED
 * value is dropped: the state machine gates commit on bodyFieldError, so
 * that branch is a fence, not behavior.
 */
export function buildProfilePayload(d: BodyDraft, goal: string): ProfilePayload {
  const out: ProfilePayload = {}
  const w = parseNum(d.weight)
  if (w !== null && inBounds(w, BODY_BOUNDS.weight.min, BODY_BOUNDS.weight.max)) out.weightKg = round1(w)
  const h = parseNum(d.height)
  if (h !== null && inBounds(h, BODY_BOUNDS.height.min, BODY_BOUNDS.height.max)) out.heightCm = round1(h)
  const y = parseNum(d.birthYear)
  if (y !== null && inBounds(y, BIRTH_YEAR_MIN, birthYearMax(), true)) out.birthYear = y
  if (d.sex === "male" || d.sex === "female") out.sex = d.sex
  if (GOAL_IDS.includes(goal)) out.goal = goal
  return out
}

/**
 * Live macro preview — the exact math the server will run post-awaken:
 * unfilled (or, as a fence, invalid) fields pass null and calcTargets
 * applies DEFAULT_PROFILE, so the readout never lies about the fallback.
 */
export function previewTargets(d: BodyDraft, goal: string): NutritionTargets {
  const w = parseNum(d.weight)
  const h = parseNum(d.height)
  const y = parseNum(d.birthYear)
  return calcTargets({
    heightCm: h !== null && inBounds(h, BODY_BOUNDS.height.min, BODY_BOUNDS.height.max) ? h : null,
    weightKg: w !== null && inBounds(w, BODY_BOUNDS.weight.min, BODY_BOUNDS.weight.max) ? w : null,
    birthYear: y !== null && inBounds(y, BIRTH_YEAR_MIN, birthYearMax(), true) ? y : null,
    sex: d.sex === "" ? null : d.sex,
    activityLevel: null,
    goal: GOAL_IDS.includes(goal) ? goal : null,
    macroSplit: null,
  })
}

// ── LOCAL-ONLY directive preference ──────────────────────────────────────────
// The primary-goal chip has no API field (and none is added this round): it
// persists in localStorage and the ASCENT advisor (DIRECTIVES tab) reads it
// when suggesting protocols. Guarded — a storage-less context drops it
// silently; the preference is cosmetic, never load-bearing.

export const ONBOARDING_GOAL_KEY = "prime-onboarding-goal"

export type PrimaryGoal = "strength" | "endurance" | "mobility"

export const PRIMARY_GOALS: readonly { id: PrimaryGoal; label: string; desc: string }[] = [
  { id: "strength", label: "Strength", desc: "Iron numbers first — load, tension, recovery." },
  { id: "endurance", label: "Endurance", desc: "Engine work — pace, volume, steady output." },
  { id: "mobility", label: "Mobility", desc: "Range and flow — joints, positions, control." },
]

function isPrimaryGoal(v: unknown): v is PrimaryGoal {
  return v === "strength" || v === "endurance" || v === "mobility"
}

/** Persists the preference; invalid values are ignored (never throws). */
export function writeOnboardingGoal(v: string): void {
  if (!isPrimaryGoal(v)) return
  try {
    window.localStorage.setItem(ONBOARDING_GOAL_KEY, v)
  } catch {
    /* storage unavailable — local-only preference, safe to drop */
  }
}

/** Reads the preference back; corrupt values read as absent. */
export function readOnboardingGoal(): PrimaryGoal | null {
  try {
    const v = window.localStorage.getItem(ONBOARDING_GOAL_KEY)
    return isPrimaryGoal(v) ? v : null
  } catch {
    return null
  }
}

// ── STEP 2 · BODY BASELINE ───────────────────────────────────────────────────

/** −/+ stepper with a center numeric input (house NumRow idiom, green accent). */
function CalibStepper({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  step,
  fallback,
}: {
  label: string
  unit: string
  value: string
  onChange: (v: string) => void
  min: number
  max: number
  step: number
  /** Library default — the placeholder AND the first-bump base (empty field). */
  fallback: number
}) {
  const bump = (delta: number) => {
    const cur = parseNum(value)
    const base = cur === null ? fallback : cur
    const next = Math.min(max, Math.max(min, base + delta))
    onChange(String(next))
  }
  return (
    <div>
      {/* visual label; the input carries its own aria-label (house NumRow idiom) */}
      <span className="block text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">{label}</span>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => bump(-step)}
          className="grid h-12 w-11 shrink-0 place-items-center rounded-xl border-2 border-[#e5e5e5] bg-white text-[#777] shadow-[0_3px_0_0_#e5e5e5] transition-colors duration-150 hover:border-[#c9e8a6] hover:text-[#46a302] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02] active:translate-y-[3px] active:shadow-none"
        >
          <Minus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={`${label} in ${unit}`}
          placeholder={String(fallback)}
          onChange={(e) => onChange(e.target.value)}
          className="h-12 min-w-0 flex-1 rounded-xl border-2 border-[#e5e5e5] bg-white px-1 text-center text-sm font-bold tabular-nums text-[#3c3c3c] placeholder:text-[#8f8f8f] focus:border-[#58cc02] focus:outline-none transition-colors duration-150"
        />
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => bump(step)}
          className="grid h-12 w-11 shrink-0 place-items-center rounded-xl border-2 border-[#e5e5e5] bg-white text-[#777] shadow-[0_3px_0_0_#e5e5e5] transition-colors duration-150 hover:border-[#c9e8a6] hover:text-[#46a302] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02] active:translate-y-[3px] active:shadow-none"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="w-9 shrink-0 text-[10px] font-bold tracking-wider text-[#8a8a8a]">{unit}</span>
      </div>
    </div>
  )
}

/** STEP 2 — body baseline: weight / height / birth year steppers + sex chips. */
export function BodyBaselineStep({ draft, onDraft }: { draft: BodyDraft; onDraft: (next: BodyDraft) => void }) {
  const fieldError = bodyFieldError(draft)
  return (
    <div>
      <p className="text-sm leading-relaxed font-semibold text-[#3c3c3c]">
        Feed the System your <span className="font-extrabold text-[#46a302]">physical baseline</span>.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#777]">
        Every field is optional — unfilled fields fall back to library defaults, and your
        macro targets recompute the moment a real number lands.
      </p>

      <div className="mt-6 space-y-4">
        <CalibStepper
          label="Weight"
          unit="KG"
          value={draft.weight}
          onChange={(weight) => onDraft({ ...draft, weight })}
          min={BODY_BOUNDS.weight.min}
          max={BODY_BOUNDS.weight.max}
          step={0.5}
          fallback={DEFAULT_PROFILE.weightKg}
        />
        <CalibStepper
          label="Height"
          unit="CM"
          value={draft.height}
          onChange={(height) => onDraft({ ...draft, height })}
          min={BODY_BOUNDS.height.min}
          max={BODY_BOUNDS.height.max}
          step={1}
          fallback={DEFAULT_PROFILE.heightCm}
        />
        <CalibStepper
          label="Birth Year"
          unit="YEAR"
          value={draft.birthYear}
          onChange={(birthYear) => onDraft({ ...draft, birthYear })}
          min={BIRTH_YEAR_MIN}
          max={birthYearMax()}
          step={1}
          fallback={DEFAULT_PROFILE.birthYear}
        />

        <div>
          <span className="block text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">Sex</span>
          <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Sex">
            {SEX_IDS.map((s) => {
              const active = draft.sex === s
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onDraft({ ...draft, sex: active ? "" : s })}
                  className={cn(
                    "h-12 rounded-xl border-2 font-mono text-[10px] font-bold tracking-[0.22em] uppercase",
                    "transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                    active
                      ? "border-[#58cc02] bg-[#e8f8d8] text-[#46a302]"
                      : "border-[#e5e5e5] bg-white text-[#777] hover:border-[#c9e8a6]"
                  )}
                >
                  {s}
                </button>
              )
            })}
          </div>
          <p className="mt-2 text-[9px] font-bold tracking-[0.15em] text-[#8a8a8a]">
            MIFFLIN-ST JEOR PARITY — DRIVES BMR / TDEE · TAP AGAIN TO CLEAR
          </p>
        </div>
      </div>

      {fieldError && (
        <div
          role="alert"
          className="mt-5 flex items-center gap-2 rounded-xl border-2 border-[#ffd7d7] bg-[#ffe5e5] px-3 py-2 text-xs font-semibold text-[#c63636]"
        >
          <span aria-hidden className="shrink-0 font-mono text-[10px] font-bold tracking-widest">
            × REJECTED
          </span>
          {fieldError}
        </div>
      )}

      <p className="mt-5 text-[9px] font-bold leading-relaxed tracking-[0.18em] text-[#8a8a8a]">
        SKIPPED FIELDS → LIBRARY DEFAULTS · {DEFAULT_PROFILE.weightKg} KG · {DEFAULT_PROFILE.heightCm} CM ·{" "}
        {DEFAULT_PROFILE.birthYear} · {DEFAULT_PROFILE.sex.toUpperCase()} · {DEFAULT_PROFILE.activityLevel.toUpperCase()}
      </p>
    </div>
  )
}

// ── STEP 3 · DIRECTIVE ───────────────────────────────────────────────────────

/** STEP 3 — nutrition directive + local-only primary focus + the on-awaken readout. */
export function DirectiveStep({
  goal,
  onGoal,
  primary,
  onPrimary,
  name,
  archetypeName,
  body,
}: {
  goal: string
  onGoal: (next: string) => void
  primary: string | null
  onPrimary: (next: string | null) => void
  name: string
  archetypeName: string
  body: BodyDraft
}) {
  const t = previewTargets(body, goal)
  const p = buildProfilePayload(body, goal)
  const personalized =
    p.heightCm !== undefined || p.weightKg !== undefined || p.birthYear !== undefined || p.sex !== undefined
  const goalWord =
    GOALS.find((g) => g.id === (p.goal ?? DEFAULT_PROFILE.goal))?.label.split("—")[0]?.trim().toUpperCase() ??
    "MAINTAIN"

  return (
    <div>
      <p className="text-sm leading-relaxed font-semibold text-[#3c3c3c]">
        Set your <span className="font-extrabold text-[#46a302]">nutrition directive</span>.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[#777]">
        Optional — no directive means the System holds MAINTAIN. This syncs to your profile
        (FUEL · BODY PROFILE) and steers your calorie target.
      </p>

      <div className="mt-5 space-y-2" role="group" aria-label="Nutrition directive">
        {GOALS.map((g) => {
          const active = goal === g.id
          const Icon = g.kcalAdj < 0 ? TrendingDown : g.kcalAdj > 0 ? TrendingUp : Minus
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={active}
              onClick={() => onGoal(active ? "" : g.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left",
                "transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                active
                  ? "border-[#58cc02] bg-[#f3fdea]"
                  : "border-[#e5e5e5] bg-white hover:border-[#c9e8a6] hover:bg-[#fafcf6]"
              )}
            >
              <span
                className={cn(
                  "grid h-9 w-9 shrink-0 place-items-center rounded-xl border-2",
                  active
                    ? "border-[#58cc02]/40 bg-[#e8f8d8] text-[#46a302]"
                    : "border-transparent bg-[#f7f7f4] text-[#6f6f6f]"
                )}
                aria-hidden
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs font-extrabold uppercase tracking-[0.15em] text-[#3c3c3c]">
                  {g.label.split("—")[0]?.trim()}
                </span>
                <span className="mt-0.5 block text-xs leading-snug text-[#777]">
                  {g.label.split("—")[1]?.trim() ?? "Hold the line"}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold",
                  g.kcalAdj > 0
                    ? "bg-[#fff4cc] text-[#9a7500]"
                    : g.kcalAdj < 0
                      ? "bg-[#d6f5f1] text-[#0d7d74]"
                      : "bg-[#f2f2ee] text-[#5c5c5c]"
                )}
              >
                {g.kcalAdj === 0 ? "±0" : g.kcalAdj > 0 ? `+${g.kcalAdj}` : g.kcalAdj} KCAL/DAY
              </span>
              {active && <Check className="h-4 w-4 shrink-0 text-[#46a302]" aria-hidden />}
            </button>
          )
        })}
      </div>

      {/* primary focus — LOCAL-ONLY preference, no API field */}
      <div className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#8a8a8a]">Primary Focus</span>
          <span className="text-[9px] font-bold tracking-[0.18em] text-[#8a8a8a]">OPTIONAL · LOCAL-ONLY</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="Primary training focus">
          {PRIMARY_GOALS.map((pg) => {
            const active = primary === pg.id
            return (
              <button
                key={pg.id}
                type="button"
                aria-pressed={active}
                onClick={() => onPrimary(active ? null : pg.id)}
                className={cn(
                  "h-11 rounded-xl border-2 font-mono text-[9px] font-bold tracking-[0.15em] uppercase",
                  "transition-[transform,border-color,background-color] duration-150 active:scale-[0.98]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
                  active
                    ? "border-[#0faf9a] bg-[#d6f5f1] text-[#0d7d74]"
                    : "border-[#e5e5e5] bg-white text-[#777] hover:border-[#aee8e1]"
                )}
              >
                {pg.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[#777]">
          Stored on this device only — feeds the <span className="font-bold text-[#0d7d74]">ASCENT advisor&apos;s</span> protocol
          suggestions on the DIRECTIVES tab.
        </p>
      </div>

      {/* the on-awaken readout — the empty-state promise, stated up front */}
      <div className="mt-6 rounded-xl border-2 border-[#c9e8a6] bg-[#f3fdea] p-3.5">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#46a302]">ON AWAKEN</p>
        <p className="mt-2 font-mono text-[11px] font-bold tracking-[0.15em] text-[#3c3c3c]">
          {name.trim() ? name.trim().toUpperCase() : "UNNAMED"} · {archetypeName.toUpperCase()} · F-RANK L1
        </p>
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.15em] text-[#5c5c5c]">
          {personalized
            ? `${p.weightKg ?? DEFAULT_PROFILE.weightKg} KG · ${p.heightCm ?? DEFAULT_PROFILE.heightCm} CM · ${
                p.birthYear ?? DEFAULT_PROFILE.birthYear
              } · ${(p.sex ?? DEFAULT_PROFILE.sex).toUpperCase()}`
            : `BODY — LIBRARY DEFAULTS (${DEFAULT_PROFILE.weightKg} KG · ${DEFAULT_PROFILE.heightCm} CM)`}
        </p>
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.15em] text-[#3c3c3c]">
          {goalWord} · TARGETS ≈ {t.calories} KCAL · {t.protein}P / {t.carbs}C / {t.fat}F · {t.waterMl} ML H₂O
        </p>
        {!personalized && (
          <p className="mt-2 font-mono text-[9px] tracking-[0.18em] text-[#777]">
            * CALIBRATE ANY TIME — FUEL TAB → BODY PROFILE
          </p>
        )}
      </div>
    </div>
  )
}
