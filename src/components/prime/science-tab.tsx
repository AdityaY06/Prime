"use client"

/**
 * R70-a · SCIENCE — the sixth facade: the app's formula/citation ledger
 * made browsable.
 *
 * Everything here is served by GET /api/research (requireHunter → registry +
 * manifesto + personalized digest — lib/research.ts's pure data, R69-c).
 * The facade is strictly read-only: no POST, no local math — a number only
 * appears if the digest shipped it, and the digest only ships numbers the
 * profile honestly supports (the honest-null doctrine: a default-derived
 * number is never presented as the user's).
 *
 * Layout (the prime/train-tab register — white cards, 2px soft borders, kit
 * typography):
 *  1. Header — "Science" + a one-sentence manifesto standfirst, with the
 *     full manifesto behind a max-height expander (ChevronDown rotate).
 *  2. "Your numbers today" — the personalized digest: hydration (with its
 *     35 ml/kg basis), BMI + category, then BMR/TDEE/macros. Missing
 *     profile inputs render as amber chips + a one-line hint and a jump to
 *     the surface that actually edits the profile (the food log's Calibrate
 *     profile dialog — verified location: fuel-tab behind the Log facade's
 *     "Show full food log" expander), never a fabricated number.
 *  3. Registry browser — category filter chips (All + the eight families,
 *     with counts) above a capped, thin-scrollbar list of entry cards:
 *     name / mono expression / honest domain / quoted citation / live
 *     surface chips / notes.
 *
 * Contrast law (R68 doctrine): body text ≥ #777, tinted-card labels ≥
 * #757575, secondary icons/labels ≥ #8a8a8a — no ghost grays anywhere.
 */

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useSystem } from "@/store/system-store"
import type { ResearchCategory, ResearchDigest, ResearchEntry } from "@/lib/research"
import type { HunterDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import { BigButton, Card, Chip, EmptyNote, Flourish, Reveal, SectionLabel, Skeleton, StatTile, fmt } from "./kit"

/** GET /api/research — the registry + manifesto + this hunter's digest. */
type ResearchRes = {
  registry: ResearchEntry[]
  manifesto: string
  digest: ResearchDigest
}

// ── pure display helpers (module-level, probe-locked in r70-science-probe) ──

/** Sentence-boundary slice for the manifesto standfirst. A period may sit
 *  inside closing parens/quotes ("…never invented or upgraded)."), so a
 *  sentence ends at punctuation + optional closers + trailing space. */
export function standfirstOf(text: string, maxSentences = 1): string {
  const sentences = text.match(/[^.!?]+[.!?]+[)\]"''”]*\s*/g)
  if (!sentences) return text.trim()
  return sentences.slice(0, maxSentences).join("").trim()
}

const CATEGORY_LABELS: Record<string, string> = {
  strength: "Strength",
  nutrition: "Nutrition",
  recovery: "Recovery",
  cardio: "Cardio",
  "body-comp": "Body comp",
  vitals: "Vitals",
  readiness: "Readiness",
  energy: "Energy",
}

/** Chip-friendly category name ("body-comp" → "Body comp"). */
export function categoryLabel(cat: string): string {
  return CATEGORY_LABELS[cat] ?? cat.replace(/-/g, " ")
}

const INPUT_LABELS: Record<string, string> = {
  weightKg: "Weight",
  heightCm: "Height",
  age: "Age",
  sex: "Sex",
  activityLevel: "Activity level",
  goal: "Goal",
}

/** Human label for a digest input key ("activityLevel" → "Activity level"). */
export function inputLabel(key: string): string {
  if (INPUT_LABELS[key]) return INPUT_LABELS[key]
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
}

const INPUT_UNITS: Record<string, string> = { weightKg: "kg", heightCm: "cm", age: "y" }

/** Chip text for an inputsUsed value ("weightKg", 77.5 → "77.5 kg"). */
export function inputValueChip(key: string, value: number | string): string {
  const unit = INPUT_UNITS[key]
  if (unit && typeof value === "number") return `${fmt(value)} ${unit}`
  return String(value)
}

// ── the facade ───────────────────────────────────────────────────────────────

export function ScienceTab({ hunter }: { hunter: HunterDTO }) {
  const setTab = useSystem((s) => s.setTab)
  const research = useApi<ResearchRes>("/api/research")
  const [manifestoOpen, setManifestoOpen] = useState(false)
  const [cat, setCat] = useState<ResearchCategory | null>(null)

  const registry = research.data?.registry ?? []
  const manifesto = research.data?.manifesto ?? null
  const digest = research.data?.digest ?? null

  // category order + counts, derived from the fetched registry itself (the
  // registry is authored in RESEARCH_CATEGORIES order — first appearance
  // preserves it without importing the lib's data into the client bundle)
  const counts = new Map<string, number>()
  const catOrder: string[] = []
  for (const e of registry) {
    if (!counts.has(e.category)) catOrder.push(e.category)
    counts.set(e.category, (counts.get(e.category) ?? 0) + 1)
  }
  const filtered = cat == null ? registry : registry.filter((e) => e.category === cat)

  const loading = research.loading && !research.data
  const errored = research.error != null && research.data == null

  return (
    <div className="prime-rise space-y-4">
      {/* header — the science page's voice, in the manifesto's own words */}
      <section aria-label="Science">
        <h1 className="text-2xl font-black tracking-tight text-[#46a302] md:text-3xl">Science</h1>
        <Flourish />
        {loading || !manifesto ? (
          <Skeleton className="mt-3 h-12 w-full" />
        ) : (
          <>
            <p className="mt-2 text-sm font-semibold text-[#777]">
              {standfirstOf(manifesto, 1)}
            </p>
            <button
              type="button"
              onClick={() => setManifestoOpen((v) => !v)}
              aria-expanded={manifestoOpen}
              aria-controls="science-manifesto"
              className={cn(
                "mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-extrabold",
                "text-[#5c5c5c] transition-colors hover:text-[#3c3c3c]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
              )}
            >
              {manifestoOpen ? "Hide the full manifesto" : "Read the full manifesto"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform duration-200", manifestoOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            <div
              id="science-manifesto"
              className={cn(
                "overflow-hidden transition-[max-height] duration-300 ease-out",
                manifestoOpen ? "max-h-[40rem]" : "max-h-0",
              )}
            >
              <p className="mt-1 rounded-2xl border-2 border-[#e5e5e5] bg-white p-4 text-xs font-medium leading-relaxed text-[#777]">
                {manifesto}
              </p>
            </div>
          </>
        )}
      </section>

      {/* your numbers today — the personalized digest, honest nulls and all */}
      <section aria-label="Your numbers today">
        <SectionLabel>Your numbers today</SectionLabel>
        {loading ? (
          <Card className="p-4" aria-label="Your numbers today">
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
            <Skeleton className="mt-3 h-12 w-full" />
          </Card>
        ) : errored ? (
          <Card className="p-4" aria-label="Your numbers today">
            <p className="text-sm font-semibold text-[#777]" title={research.error ?? undefined}>
              Couldn't load your numbers right now.
            </p>
          </Card>
        ) : digest ? (
          <DigestCard digest={digest} onOpenFoodLog={() => setTab("log")} />
        ) : null}
      </section>

      {/* the registry browser — every formula the app actually runs */}
      <Reveal>
        <section aria-label="Formula registry">
          <SectionLabel
            right={
              registry.length > 0 ? (
                <Chip tone="ink" title="Entries in view">
                  {filtered.length} of {registry.length}
                </Chip>
              ) : undefined
            }
          >
            Formula registry
          </SectionLabel>

          {loading ? (
            <Card className="p-4">
              <Skeleton className="h-10 w-full" />
              <div className="mt-3 space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </Card>
          ) : errored ? (
            <Card className="p-4" title={research.error ?? undefined}>
              <EmptyNote>Couldn't load the science registry right now.</EmptyNote>
            </Card>
          ) : registry.length === 0 ? (
            <Card className="p-4">
              <EmptyNote>The registry came back empty.</EmptyNote>
            </Card>
          ) : (
            <>
              {/* filter row — All + the eight families, scrollable on mobile */}
              <div
                role="group"
                aria-label="Filter by category"
                className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                <FilterChip
                  active={cat == null}
                  pressedLabel="Showing all categories"
                  onClick={() => setCat(null)}
                >
                  All · {registry.length}
                </FilterChip>
                {catOrder.map((c) => (
                  <FilterChip
                    key={c}
                    active={cat === c}
                    pressedLabel={`Showing ${categoryLabel(c)}`}
                    onClick={() => setCat(c as ResearchCategory)}
                  >
                    {categoryLabel(c)} · {counts.get(c) ?? 0}
                  </FilterChip>
                ))}
              </div>

              {/* the long-list idiom: capped height, thin neutral scrollbar */}
              <div
                role="list"
                aria-label="Registry entries"
                className={cn(
                  "max-h-96 space-y-2.5 overflow-y-auto pr-1 md:max-h-[36rem]",
                  "[scrollbar-width:thin] [scrollbar-color:#d4d4d4_transparent]",
                  "[&::-webkit-scrollbar]:w-1.5",
                  "[&::-webkit-scrollbar-track]:bg-transparent",
                  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-300",
                  "[&::-webkit-scrollbar-thumb:hover]:bg-neutral-400",
                )}
              >
                {filtered.map((entry) => (
                  <EntryCard key={entry.id} entry={entry} />
                ))}
              </div>
            </>
          )}
        </section>
      </Reveal>

      {/* quiet honest footer line — the registry counts what runs, for {hunter} */}
      <p className="px-1 text-xs font-semibold text-[#777]">
        {registry.length > 0
          ? `${registry.length} formula families run by this app — ${hunter.name}'s numbers above use the ones your profile supports.`
          : ""}
      </p>
    </div>
  )
}

// ── digest card ──────────────────────────────────────────────────────────────

function DigestCard({ digest, onOpenFoodLog }: { digest: ResearchDigest; onOpenFoodLog: () => void }) {
  const n = digest.nutrition
  const water = n.targets.waterMl
  const bmi = digest.bodyComp.bmi
  const bmiCategory = digest.bodyComp.bmiCategory
  const energyReady = n.bmr != null

  // inputs actually powering today's numbers (values first, honest order)
  const usedChips: { key: string; value: number | string }[] = (
    [
      ["weightKg", n.inputsUsed.weightKg],
      ["heightCm", n.inputsUsed.heightCm],
      ["age", n.inputsUsed.age],
      ["sex", n.inputsUsed.sex],
      ["activityLevel", n.inputsUsed.activityLevel],
      ["goal", n.inputsUsed.goal],
    ] as [string, number | string | null][]
  ).flatMap(([key, value]) => (value != null ? [{ key, value }] : []))

  return (
    <Card className="p-4" aria-label="Your numbers today">
      {/* headline numbers — hydration + body composition */}
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          value={water != null ? fmt(water) : "—"}
          countTo={water}
          label="Water ml / day"
          tone="teal"
          title={
            water != null
              ? `Hydration goal — 35 ml × ${fmt(n.inputsUsed.weightKg)} kg (rounded to 50, clamped 2000–4000)`
              : "Needs a logged weight"
          }
        />
        <StatTile
          value={bmi != null ? bmi.toFixed(1) : "—"}
          label={bmiCategory ? `BMI · ${bmiCategory}` : "BMI"}
          tone="ink"
          title={
            bmi != null
              ? "Latest logged weight × profile height (bmiFor) — see the registry's body-comp rows"
              : "Needs a logged weight and a profile height"
          }
        />
      </div>
      {n.inputsUsed.weightKg != null && (
        <p className="mt-2 px-1 text-xs font-semibold text-[#777]">
          Water basis: 35 ml × {fmt(n.inputsUsed.weightKg)} kg, rounded to 50, clamped 2000–4000 ml.
        </p>
      )}

      {/* energy numbers — only what the profile honestly supports */}
      <div className="mt-3 border-t-2 border-[#f2f2ee] pt-3">
        {energyReady ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatTile
                value={fmt(n.bmr)}
                countTo={n.bmr}
                label="BMR kcal"
                tone="green"
                title={`${n.model} — 10×kg + 6.25×cm − 5×age + sex offset`}
              />
              <StatTile
                value={n.tdee != null ? fmt(n.tdee) : "—"}
                countTo={n.tdee}
                label="TDEE kcal"
                tone="orange"
                title="BMR × activity multiplier"
              />
              <StatTile
                value={n.targets.calories != null ? fmt(n.targets.calories) : "—"}
                countTo={n.targets.calories}
                label="Kcal goal"
                tone="gold"
                title="TDEE + goal adjustment"
              />
            </div>
            {n.targets.calories != null && (
              <div
                className="mt-3 grid grid-cols-3 gap-3 rounded-xl bg-[#f7f7f4] px-3 py-2.5"
                title="Goal macro dosing — protein g/kg by goal, fat % of calories, carbs the remainder"
              >
                <MacroNum label="Protein g" value={n.targets.protein} />
                <MacroNum label="Carbs g" value={n.targets.carbs} />
                <MacroNum label="Fat g" value={n.targets.fat} />
              </div>
            )}
            <p className="mt-3 px-1 text-xs font-bold text-[#777]">
              {n.model} — from your profile:
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
              {usedChips.map(({ key, value }) => (
                <Chip key={key} tone="ink" title={inputLabel(key)}>
                  {inputValueChip(key, value)}
                </Chip>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="px-1 text-xs font-extrabold uppercase tracking-wide text-[#757575]">
              BMR · TDEE · macros
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 px-1">
              {n.missingInputs.map((k) => (
                <Chip key={k} tone="orange" title={`Missing profile input: ${inputLabel(k)}`}>
                  {inputLabel(k)}
                </Chip>
              ))}
            </div>
            <p className="mt-2 px-1 text-xs font-semibold text-[#777]">
              Fill these in your profile to light up BMR/TDEE — Log → full food log → Calibrate profile.
            </p>
            <BigButton variant="outline" size="md" className="mt-3" onClick={onOpenFoodLog}>
              Open the food log
            </BigButton>
          </>
        )}
      </div>
    </Card>
  )
}

/** Compact macro numeral (the small sibling of StatTile on tinted rows). */
function MacroNum({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0" title={value != null ? `${label} target` : "Needs your goal set"}>
      <p className="truncate text-base font-extrabold tabular-nums leading-tight text-[#3c3c3c]">
        {fmt(value)}
      </p>
      <p className="mt-0.5 truncate text-[11px] font-bold uppercase tracking-wide text-[#757575]">
        {label}
      </p>
    </div>
  )
}

// ── registry browser pieces ──────────────────────────────────────────────────

function FilterChip({
  active,
  pressedLabel,
  onClick,
  children,
}: {
  active: boolean
  pressedLabel: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={pressedLabel}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border-2 px-3.5",
        "text-xs font-extrabold tabular-nums transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#58cc02]",
        active
          ? "border-[#9fe25e] bg-[#e8f8d8] text-[#2f7a00]"
          : "border-[#e5e5e5] bg-white text-[#5c5c5c] hover:bg-[#f7f7f4]",
      )}
    >
      {children}
    </button>
  )
}

function EntryCard({ entry }: { entry: ResearchEntry }) {
  return (
    <article
      role="listitem"
      className="prime-card rounded-2xl border-2 border-[#e5e5e5] bg-white p-3.5"
      aria-label={entry.name}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 text-sm font-semibold leading-snug text-[#3c3c3c]">{entry.name}</h3>
        <Chip tone="ink" className="shrink-0" title={`Category: ${categoryLabel(entry.category)}`}>
          {categoryLabel(entry.category)}
        </Chip>
      </div>

      {/* the formula itself — mono, on the quiet ink tint */}
      <p className="mt-2 break-words rounded-xl bg-[#f7f7f4] px-3 py-2 font-mono text-xs font-semibold leading-relaxed text-[#5c5c5c]">
        {entry.expression}
      </p>

      {entry.validityDomain && (
        <p className="mt-1.5 text-xs font-semibold text-[#777]">
          <span className="font-bold text-[#757575]">Domain:</span> {entry.validityDomain}
        </p>
      )}

      {/* the citation — quoted, exactly as the code documents it */}
      <blockquote className="mt-2 border-l-2 border-[#dcdcd6] pl-2.5 text-xs italic leading-relaxed text-[#777]">
        “{entry.citation}”
      </blockquote>

      {/* where the formula actually lives */}
      <div className="mt-2 flex flex-wrap gap-1">
        {entry.liveSurfaces.map((s) => (
          <span
            key={s}
            title={s}
            className="inline-flex max-w-full items-center overflow-hidden rounded-full bg-[#f2f2ee] px-2 py-0.5 text-[10px] font-bold text-[#5c5c5c]"
          >
            <span className="truncate">{s}</span>
          </span>
        ))}
      </div>

      {entry.notes && (
        <p className="mt-2 text-[11px] font-medium leading-relaxed text-[#777]">{entry.notes}</p>
      )}
    </article>
  )
}
