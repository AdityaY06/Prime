"use client"

/**
 * R57 · CLEAN SLATE — LOG, the quick-log facade.
 *
 * Three honest cards — Food / Body / Vitals — each carrying today's real
 * numbers and ONE quick action that POSTs the exact endpoint the legacy
 * console uses:
 *
 *  · Food — /api/food-parse (the real AI describe-meal estimator, local
 *    database fallback) feeding a /api/nutrition "log-food-batch" POST,
 *    plus the one-tap "log-water" +250 ml. The water goal is the real
 *    targets.waterMl from /api/nutrition — never a fabricated number.
 *  · Body — /api/metrics { type: "weight", value } — the same upsert the
 *    atlas weight logger hits (25–300 kg, server-side rounding to 0.1).
 *  · Vitals — /api/metrics { type, value } per filled field (sleep /
 *    restingHr, the daily check-in's core). The day key is omitted on
 *    purpose: the server defaults it to the hunter's timezone today (R38).
 *
 * Summary numbers come from /api/nutrition (today, hunter tz) and
 * /api/destinations (the same honest snapshot the Home strip reads).
 * The three 56-round consoles ride below, mounted untouched behind
 * ShowEverything (merge & hide — never delete).
 *
 * R58 · FLOW — motion pass, zero new visible characters: the real numerals
 * count up (kit StatTile countTo), and every genuine quick-log success fires
 * a ConfettiBurst (decoration only — the toast still carries the words).
 */

import { useState } from "react"
import dynamic from "next/dynamic"
import { Check, Droplet, HeartPulse, Moon, Plus, Scale, Utensils } from "lucide-react"
import { api, useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import { formatDayLabel } from "@/lib/game"
import { MAX_PARSE_CHARS, type ParsedFoodItem } from "@/lib/food-parse"
import type { DestinationsDTO, HunterDTO } from "@/lib/types"
import {
  BigButton,
  Card,
  Chip,
  Flourish,
  ProgressBar,
  Reveal,
  ShowEverything,
  Skeleton,
  StatTile,
  fmt,
  type Tone,
} from "./kit"
import { ConfettiBurst } from "./confetti"

const FuelTab = dynamic(
  () => import("@/components/fitness/fuel-tab").then((m) => m.FuelTab),
  { ssr: false },
)
const BodyAtlasTab = dynamic(
  () => import("@/components/fitness/body-atlas-tab").then((m) => m.BodyAtlasTab),
  { ssr: false },
)
const VitalsTab = dynamic(
  () => import("@/components/fitness/vitals-tab").then((m) => m.VitalsTab),
  { ssr: false },
)

// ── local contract types (subsets of the real routes) ────────────────────────

/** GET /api/nutrition (no ?date → the hunter's today). */
type NutritionDayView = {
  date: string
  targets: { calories: number; protein: number; carbs: number; fat: number; waterMl: number }
  consumed: { calories: number; protein: number; carbs: number; fat: number }
  waterMl: number
  meals: { id: string }[]
}

/** POST /api/metrics → { metric, questCompleted?, xpGranted? }. */
type MetricPostRes = {
  metric: { day: string; type: string; value: number; unit: string }
  questCompleted?: boolean
  xpGranted?: number
}

// ── pure helpers ─────────────────────────────────────────────────────────────

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

// R68 · nutrition-audit B2 — the qty storage grid is 2 decimals: round HERE,
// derive per-serving from the SAME rounded q, and the server (now round2)
// reproduces the reviewed total byte-exactly (was: server round1'd 0.75 → 0.8,
// silently +7% on quarter servings, +20% on ⅛).
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Meal bucket by wall-clock hour — the quick-add's honest default bucket. */
function mealByHour(h: number = new Date().getHours()): "breakfast" | "lunch" | "dinner" | "snack" {
  if (h < 11) return "breakfast"
  if (h < 16) return "lunch"
  if (h < 21) return "dinner"
  return "snack"
}

/** READINESS_BAND_META's four bands, mapped to the light-era kit tones. */
function bandTone(band: string): Tone {
  if (band === "PRIMED") return "green"
  if (band === "READY") return "teal"
  if (band === "MODERATE") return "orange"
  return "red" // "BACK OFF"
}

/** Sentence-case band name for the chip. */
function bandLabel(band: string): string {
  if (band === "PRIMED") return "Primed"
  if (band === "READY") return "Ready"
  if (band === "MODERATE") return "Moderate"
  return "Back off"
}

/** The shared 44px input skin (kit primitives + Tailwind only). */
const INPUT_CLS =
  "h-11 w-full min-w-0 rounded-xl border-2 border-[#e5e5e5] bg-white px-3 text-sm font-bold text-[#3c3c3c] " +
  "placeholder:font-semibold placeholder:text-[#9a9a9a] " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]"

// ── the facade ───────────────────────────────────────────────────────────────

export function LogTab({ hunter }: { hunter: HunterDTO }) {
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)

  // today's honest numbers (both hooks are refreshKey-aware — bumpRefresh
  // silently refetches after every write below)
  const nutrition = useApi<NutritionDayView>("/api/nutrition")
  const dest = useApi<DestinationsDTO>("/api/destinations")

  // food quick-add (describe it → real parse flow → batch log)
  const [foodText, setFoodText] = useState("")
  const [foodBusy, setFoodBusy] = useState(false)

  // one-tap water
  const [waterBusy, setWaterBusy] = useState(false)

  // weight quick log
  const [weight, setWeight] = useState("")
  const [weightBusy, setWeightBusy] = useState(false)

  // vitals mini check-in
  const [sleep, setSleep] = useState("")
  const [rhr, setRhr] = useState("")
  const [checkBusy, setCheckBusy] = useState(false)

  // R58 — the celebration key: a genuine quick-log success bumps it (never
  // errors, never the no-estimate early return)
  const [burst, setBurst] = useState(0)

  // ── FOOD: describe → /api/food-parse → "log-food-batch" ──

  const addFood = async () => {
    const text = foodText.trim().slice(0, MAX_PARSE_CHARS)
    if (foodBusy || text.length < 3) return
    setFoodBusy(true)
    try {
      const meal = mealByHour()
      // step 1 — the REAL describe-meal estimator (AI first, FOODS-db fallback)
      const parsed = await api<{ source: "ai" | "local"; items: ParsedFoodItem[] }>("/api/food-parse", {
        method: "POST",
        body: JSON.stringify({ text }),
      })
      // only estimable items ride a one-tap flow — the legacy dialog reviews
      // the rest; here an unverifiable item stays unlogged (honest > silent 0)
      const known = parsed.items.filter((it) => it.calories != null && it.qty > 0)
      // R68 · nutrition-audit B7 — the quick flow used to drop non-estimable
      // items WITHOUT NAMING THEM ("2 rotis and pizza" logged only the rotis,
      // toast said 1 item). The skipped names now ride the notice so nothing
      // vanishes unmentioned.
      const skippedNames = parsed.items
        .filter((it) => it.calories == null || it.qty <= 0)
        .map((it) => it.name)
        .slice(0, 3)
      const kcal = Math.round(known.reduce((sum, it) => sum + (it.calories ?? 0), 0))
      if (known.length === 0 || kcal <= 0) {
        pushNotice({
          kind: "warn",
          title: "No estimate for that",
          body: "Add a little detail, or open the full food log below.",
        })
        return
      }
      // step 2 — batch-log. The parser reports totals for the stated qty; the
      // endpoint wants per-serving values (qty-multiplied back server-side).
      // R68 · B2 — per-serving derives from round2(qty), the exact value the
      // server stores, so the stored row equals the reviewed row.
      const items = known.map((it) => {
        const q = round2(it.qty)
        const per = (v: number) => round1(v / q)
        return {
          name: it.name,
          qty: q,
          unit: it.unit.trim() || "serving",
          calories: per(it.calories ?? 0),
          protein: per(it.protein ?? 0),
          carbs: per(it.carbs ?? 0),
          fat: per(it.fat ?? 0),
          ...(it.fiber != null && { fiber: per(it.fiber) }),
          ...(it.sodium != null && { sodium: per(it.sodium) }),
          ...(it.sugar != null && { sugar: per(it.sugar) }),
        }
      })
      const res = await api<{ logged: number; xpGranted?: number }>("/api/nutrition", {
        method: "POST",
        body: JSON.stringify({ action: "log-food-batch", mealType: meal, items }),
      })
      setFoodText("")
      pushNotice({
        kind: res.xpGranted ? "xp" : "info",
        title: `${res.logged} item${res.logged === 1 ? "" : "s"} logged${res.xpGranted ? ` · +${res.xpGranted} XP` : ""}`,
        body:
          `≈ ${kcal} kcal · ${meal}` +
          (skippedNames.length > 0 ? ` · no estimate: ${skippedNames.join(", ")}` : ""),
      })
      setBurst((k) => k + 1) // R58 — the log celebrates
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Couldn't log that", body: (e as Error).message })
    } finally {
      setFoodBusy(false)
    }
  }

  // ── WATER: one-tap "log-water" +250 ml (date omitted → hunter's today) ──

  const addWater = async () => {
    if (waterBusy) return
    setWaterBusy(true)
    try {
      const res = await api<{ waterMl: number; questCompleted?: boolean; xpGranted?: number }>(
        "/api/nutrition",
        {
          method: "POST",
          body: JSON.stringify({ action: "log-water", ml: 250 }),
        },
      )
      if (res.xpGranted) {
        pushNotice({ kind: "xp", title: `+${res.xpGranted} XP`, body: "2 liters crossed — nice." })
      } else if (res.questCompleted) {
        pushNotice({ kind: "info", title: "Hydration goal complete", body: "Claim your reward in Goals." })
      } else {
        pushNotice({ kind: "info", title: "Water logged", body: `${fmt(res.waterMl)} ml today` })
      }
      setBurst((k) => k + 1) // R58 — the log celebrates
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Couldn't log water", body: (e as Error).message })
    } finally {
      setWaterBusy(false)
    }
  }

  // ── BODY: /api/metrics { type: "weight", value } upsert ──

  const saveWeight = async () => {
    const v = Number(weight)
    if (weightBusy || weight.trim() === "" || !Number.isFinite(v)) return
    if (v < 25 || v > 300) {
      pushNotice({ kind: "warn", title: "Weight looks off", body: "Enter kilograms between 25 and 300." })
      return
    }
    setWeightBusy(true)
    try {
      await api<MetricPostRes>("/api/metrics", {
        method: "POST",
        body: JSON.stringify({ type: "weight", value: v }),
      })
      setWeight("")
      pushNotice({ kind: "info", title: "Weight logged", body: `${round1(v)} kg` })
      setBurst((k) => k + 1) // R58 — the log celebrates
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Couldn't log weight", body: (e as Error).message })
    } finally {
      setWeightBusy(false)
    }
  }

  // ── VITALS: one POST per filled field (sleep / restingHr check-in) ──

  const checkIn = async () => {
    if (checkBusy) return
    const posts: { type: string; value: number }[] = []
    if (sleep.trim() !== "") {
      const v = Number(sleep)
      if (!Number.isFinite(v) || v < 0 || v > 16) {
        pushNotice({ kind: "warn", title: "Sleep looks off", body: "Enter hours between 0 and 16." })
        return
      }
      posts.push({ type: "sleep", value: v })
    }
    if (rhr.trim() !== "") {
      const v = Number(rhr)
      if (!Number.isFinite(v) || v < 30 || v > 120) {
        pushNotice({ kind: "warn", title: "Heart rate looks off", body: "Enter bpm between 30 and 120." })
        return
      }
      posts.push({ type: "restingHr", value: v })
    }
    if (posts.length === 0) {
      pushNotice({ kind: "warn", title: "Nothing to save", body: "Enter sleep hours, or resting HR." })
      return
    }
    setCheckBusy(true)
    try {
      const responses = await Promise.all(
        posts.map((p) =>
          api<MetricPostRes>("/api/metrics", {
            method: "POST",
            body: JSON.stringify(p),
          }),
        ),
      )
      const xp = responses.find((r) => r.xpGranted)?.xpGranted
      const quest = responses.some((r) => r.questCompleted)
      setSleep("")
      setRhr("")
      if (xp) pushNotice({ kind: "xp", title: `+${xp} XP`, body: "Vitals check-in" })
      else pushNotice({ kind: "info", title: "Check-in saved" })
      if (quest) {
        pushNotice({ kind: "info", title: "Sleep goal complete", body: "Claim your reward in Goals." })
      }
      setBurst((k) => k + 1) // R58 — the log celebrates
      bumpRefresh()
    } catch (e) {
      pushNotice({ kind: "warn", title: "Check-in failed", body: (e as Error).message })
    } finally {
      setCheckBusy(false)
    }
  }

  // ── derived view state (honest: null → "—", loading → "…") ──

  const n = nutrition.data
  const d = dest.data
  const meals = n?.meals.length ?? 0
  const massKg = d?.body.latestMassKg ?? null
  const massDay = d?.body.latestMassDay ?? null
  const readiness = d?.vitals.readiness ?? null

  return (
    <div className="prime-rise space-y-4">
      {/* hero — the ten-second promise */}
      <section aria-label="Quick log">
        <h1 className="text-2xl font-black tracking-tight text-[#46a302] md:text-3xl">Quick log</h1>
        <Flourish />
        <p className="mt-2 text-sm font-semibold text-[#777]">
          Food, weight, and sleep — ten seconds, done.
        </p>
      </section>

      {/* ── FOOD ── */}
      <Card className="p-4 transition-transform hover:-translate-y-0.5" aria-label="Food today">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#e8f8d8]" aria-hidden>
            <Utensils className="h-5 w-5 text-[#58cc02]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-[#3c3c3c]">Food</h2>
            <p className="truncate text-xs font-semibold text-[#777]">
              {n ? (meals > 0 ? `${meals} meal${meals === 1 ? "" : "s"} today` : "Nothing logged yet") : "…"}
            </p>
          </div>
        </div>

        {n ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile
                value={meals > 0 ? fmt(n.consumed.calories) : "—"}
                countTo={meals > 0 ? n.consumed.calories : null}
                label="Kcal"
                tone="orange"
                title={n.targets.calories > 0 ? `Daily target ${fmt(n.targets.calories)} kcal` : undefined}
              />
              <StatTile
                value={meals > 0 ? `${fmt(n.consumed.protein)} g` : "—"}
                label="Protein"
                tone="green"
                title={n.targets.protein > 0 ? `Daily target ${fmt(n.targets.protein)} g protein` : undefined}
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <Droplet className="h-4 w-4 shrink-0 text-[#0d9488]" aria-hidden />
              <p className="shrink-0 text-xs font-extrabold uppercase tracking-wide text-[#8a8a8a]">Water</p>
              {n.targets.waterMl > 0 ? (
                <ProgressBar
                  value={n.waterMl}
                  target={n.targets.waterMl}
                  tone="teal"
                  label
                  className="min-w-0 flex-1"
                />
              ) : (
                <p className="truncate text-sm font-bold tabular-nums text-[#3c3c3c]">
                  {fmt(n.waterMl)} ml
                </p>
              )}
            </div>
            <div className="mt-2 flex justify-end">
              <BigButton
                variant="outline"
                size="md"
                onClick={() => void addWater()}
                loading={waterBusy}
                aria-label="Add 250 ml of water"
              >
                <Plus className="h-4 w-4" aria-hidden />
                250 ml
              </BigButton>
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-9 w-2/3" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        )}

        {/* the one green action on this screen — describe it, we estimate it */}
        <p className="mt-3 text-xs font-bold text-[#777]">What did you eat?</p>
        <div className="mt-1.5 flex gap-2">
          <label htmlFor="log-food-desc" className="sr-only">
            Describe what you ate
          </label>
          <input
            id="log-food-desc"
            type="text"
            value={foodText}
            onChange={(e) => setFoodText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addFood()
            }}
            maxLength={MAX_PARSE_CHARS}
            placeholder="2 rotis, dal, coffee"
            className={INPUT_CLS}
          />
          <BigButton
            variant="green"
            size="md"
            className="shrink-0"
            onClick={() => void addFood()}
            loading={foodBusy}
            disabled={foodText.trim().length < 3}
            aria-label="Add food"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add
          </BigButton>
        </div>
      </Card>

      {/* ── BODY ── */}
      <Reveal>
        <Card className="p-4 transition-transform hover:-translate-y-0.5" aria-label="Body">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#ffefdd]" aria-hidden>
              <Scale className="h-5 w-5 text-[#e08600]" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold text-[#3c3c3c]">Body</h2>
              <p className="truncate text-xs font-semibold text-[#777]">
                {d ? (massDay ? `Last read ${formatDayLabel(massDay)}` : "No reading yet") : "…"}
              </p>
            </div>
          </div>

        <div className="mt-3">
          <StatTile
            value={d ? (massKg != null ? fmt(massKg) : "—") : "…"}
            countTo={massKg}
            label={massDay ? `Weight kg · ${formatDayLabel(massDay)}` : "Weight kg"}
            tone="teal"
            title={
              massKg != null && massDay
                ? `Latest reading ${fmt(massKg)} kg on ${massDay}`
                : "Log your first weight — it also calibrates your food targets."
            }
          />
        </div>

        <p className="mt-3 text-xs font-bold text-[#777]">Log today's weight</p>
        <div className="mt-1.5 flex gap-2">
          <label htmlFor="log-weight" className="sr-only">
            Today's weight in kilograms
          </label>
          <input
            id="log-weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            min={25}
            max={300}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveWeight()
            }}
            placeholder="72.5"
            className={INPUT_CLS}
          />
          <BigButton
            variant="outline"
            size="md"
            className="shrink-0"
            onClick={() => void saveWeight()}
            loading={weightBusy}
            disabled={weight.trim() === ""}
            aria-label="Save weight"
          >
            <Check className="h-4 w-4" aria-hidden />
            Save
          </BigButton>
        </div>
        </Card>
      </Reveal>

      {/* ── VITALS ── */}
      <Reveal>
        <Card className="p-4" aria-label="Vitals">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#d6f5f1]" aria-hidden>
              <HeartPulse className="h-5 w-5 text-[#0d9488]" />
            </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold text-[#3c3c3c]">Vitals</h2>
            <p className="flex items-center gap-1 truncate text-xs font-semibold text-[#777]">
              {d?.vitals.checkedInToday && (
                <Check className="h-3.5 w-3.5 shrink-0 text-[#46a302]" aria-hidden />
              )}
              {d ? (d.vitals.checkedInToday ? "Checked in today" : "No check-in yet today") : "…"}
            </p>
          </div>
          {readiness && <Chip tone={bandTone(readiness.band)}>{bandLabel(readiness.band)}</Chip>}
        </div>

        <div className="mt-3">
          <StatTile
            value={readiness ? `${readiness.score}` : d ? "—" : "…"}
            countTo={readiness ? readiness.score : null}
            label="Readiness"
            tone={readiness ? bandTone(readiness.band) : "ink"}
            title={
              readiness
                ? `Readiness ${readiness.score} of 100 — ${bandLabel(readiness.band)}`
                : "Log sleep or resting HR to score it"
            }
          />
        </div>

        <p className="mt-3 text-xs font-bold text-[#777]">How did you sleep?</p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          <label htmlFor="log-sleep" className="sr-only">
            Sleep hours
          </label>
          <input
            id="log-sleep"
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            max={16}
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void checkIn()
            }}
            placeholder="7.5 h"
            className={INPUT_CLS}
          />
          <label htmlFor="log-rhr" className="sr-only">
            Resting heart rate in bpm, optional
          </label>
          <input
            id="log-rhr"
            type="number"
            inputMode="numeric"
            step={1}
            min={30}
            max={120}
            value={rhr}
            onChange={(e) => setRhr(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void checkIn()
            }}
            placeholder="60 bpm"
            title="Resting heart rate — optional"
            className={INPUT_CLS}
          />
        </div>
        <BigButton
          variant="outline"
          size="md"
          full
          className="mt-2"
          onClick={() => void checkIn()}
          loading={checkBusy}
        >
          <Moon className="h-4 w-4" aria-hidden />
          Check in
        </BigButton>
        </Card>
      </Reveal>

      {/* the three 56-round consoles, one tap away — lore untouched */}
      <Reveal>
        <ShowEverything label="Show full food log">
          <FuelTab hunter={hunter} />
        </ShowEverything>
      </Reveal>
      <Reveal>
        <ShowEverything label="Show full body log">
          <BodyAtlasTab hunter={hunter} />
        </ShowEverything>
      </Reveal>
      <Reveal>
        <ShowEverything label="Show full vitals log">
          <VitalsTab hunter={hunter} />
        </ShowEverything>
      </Reveal>

      {/* R58 — the quick-log celebration (pure decoration, aria-hidden) */}
      <ConfettiBurst fire={burst} count={20} />
    </div>
  )
}
