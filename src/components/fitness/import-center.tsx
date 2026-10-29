"use client"

// ─── PRIME · Import Center (R21-a workouts · R22-a + health metrics) ──────────
// The bridge into PRIME, both halves: Strong/Hevy/PRIME WORKOUT CSV → sessions
// (R21-a) and Cronometer/Whoop/Oura/Apple-Health/generic HEALTH CSV → BodyMetric
// history (R22-a). One panel, two modes — the MODE SWITCH at the top toggles
// between them; the default stays WORKOUTS and that flow is untouched.
//
// Both flows share the same two-step honesty contract, vault-restore shaped —
// PARSE (a server dry-run that NEVER writes) renders a full preview (totals
// chips, per-day cards, skipped-row reasons), CONFIRM IMPORT is the only write
// path (one transaction). Re-importing the same file is a no-op — entries
// already in the archive are skipped, never duplicated.
//
// HEALTH mode honestly lands daily weight / sleep / resting HR (+ optional
// mood / energy / body measurements) into the BodyMetric rows that feed the
// vitals history charts, readiness score and the RHR baseline — nothing else
// is fabricated, and every skipped row carries its reason.
//
// Input is a file picker (FileReader → text, name + KB readout) AND a paste
// textarea fallback. Empty/garbage CSV surfaces a rose error from the server's
// honest codes — no fake data, no fabricated counts.

import { useRef, useState } from "react"
import { motion, useReducedMotion } from "framer-motion"
import { Check, ChevronDown, FileUp, Loader2, TriangleAlert, Upload } from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { InfoHint } from "@/components/system/info-hint"
import { useSystem } from "@/store/system-store"
import { api } from "@/hooks/use-api"
import { FLOW_EASE } from "@/components/system/motion"
import { HEALTH_METRIC_LABELS, type HealthMetricType } from "@/lib/import/health-csv"
import { cn } from "@/lib/utils"

// ── wire shapes (the /api/import/sessions DTOs) ──────────────────────────────

type PreviewWorkout = {
  startedAt: string
  gateName: string
  logCount: number
  sets: number
  volumeKg: number
  estXp: number
}

type PreviewDTO = {
  ok: true
  totals: { workouts: number; logs: number; sets: number; volumeKg: number; estXp: number; skippedRows: number }
  workouts: PreviewWorkout[]
  skipped: { line: number; reason: string }[]
  dateRange: { from: string | null; to: string | null }
  duplicates: number
}

type CreatedDTO = {
  ok: true
  created: { sessions: number; logs: number; xp: number; level: number; levelUps: number }
}

// ── wire shapes (the /api/import/health DTOs) ────────────────────────────────

type HealthPreviewDay = {
  day: string
  metrics: { type: string; value: number; unit: string }[]
}

type HealthPreviewDTO = {
  ok: true
  totals: {
    days: number
    entries: number
    byType: Record<string, number>
    firstDay: string | null
    lastDay: string | null
    skippedRows: number
    fileDuplicates: number
  }
  days: HealthPreviewDay[]
  skipped: { line: number; reason: string }[]
  duplicates: number
}

type HealthCreatedDTO = {
  ok: true
  created: {
    entries: number
    days: number
    byType: Record<string, number>
    profileWeightSynced: boolean
    unlocks: { readinessDays: number; rhrDays: number; sleepDays: number; weightDays: number }
  }
}

// ── helpers (pure) ────────────────────────────────────────────────────────────

/** KB size of the held CSV as it will hit the wire (byte-honest). */
const kb = (contents: string) => (new Blob([contents]).size / 1024).toFixed(1)

const dayOf = (iso: string) => iso.slice(0, 10)

/** 62 → "62" · 77.5 → "77.5" (no trailing-zero theater). */
const fmtVal = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** "77.5 kg" · "7.5 h" · "3/5" — units joined the way the app displays them. */
const fmtMetric = (value: number, unit: string) => (unit === "/5" ? `${fmtVal(value)}/5` : `${fmtVal(value)} ${unit}`)

const metricLabel = (type: string) => HEALTH_METRIC_LABELS[type as HealthMetricType] ?? type.toUpperCase()

/** COLLAPSED / EXPANDED chevron shared by both skipped-row toggles. */
const SkippedToggle = ({
  open,
  count,
  onToggle,
}: {
  open: boolean
  count: number
  onToggle: () => void
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={open}
    className="flex h-11 w-full items-center justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-3 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-300 uppercase transition-colors hover:border-amber-400/40 hover:text-amber-200 focus-visible:outline focus-visible:outline-violet-400/70"
  >
    <span>SKIPPED ROWS · {count}</span>
    <ChevronDown
      className={cn("h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")}
      aria-hidden
    />
  </button>
)

/** The collapsible skipped-rows list (≤20 shown, "+N MORE" when capped). */
const SkippedList = ({
  skipped,
  total,
}: {
  skipped: { line: number; reason: string }[]
  total: number
}) => (
  <div className="scroll-sys mt-1.5 max-h-48 space-y-1 overflow-y-auto rounded-sm border border-rose-500/20 bg-rose-500/[0.04] p-2.5">
    {skipped.map((s) => (
      <p key={s.line} className="font-mono text-[9px] leading-relaxed tracking-[0.08em] text-zinc-300">
        <span className="text-zinc-500">LINE {s.line}</span> — {s.reason}
      </p>
    ))}
    {total > skipped.length && (
      <p className="font-mono text-[9px] tracking-[0.08em] text-zinc-500">
        + {total - skipped.length} MORE — FIRST 20 SHOWN
      </p>
    )}
  </div>
)

// ── WORKOUTS panel (R21-a flow, behavior unchanged) ──────────────────────────

function WorkoutImportPanel() {
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const reduce = useReducedMotion()
  const fileRef = useRef<HTMLInputElement>(null)

  /** The held CSV text — from file or paste, whichever was set last. */
  const [csv, setCsv] = useState("")
  const [meta, setMeta] = useState<{ label: string; size: string } | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)

  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<PreviewDTO | null>(null)
  const [created, setCreated] = useState<CreatedDTO["created"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  const busy = parsing || committing

  const resetResults = () => {
    setPreview(null)
    setCreated(null)
    setError(null)
    setShowSkipped(false)
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      setCsv(text)
      setMeta({ label: file.name.toUpperCase(), size: `${kb(text)} KB` })
      setPasteOpen(false)
      resetResults()
    }
    reader.readAsText(file)
  }

  const onPaste = (text: string) => {
    setCsv(text)
    setMeta(text.trim() ? { label: "PASTED CSV", size: `${kb(text)} KB` } : null)
    resetResults()
  }

  const discard = () => {
    setCsv("")
    setMeta(null)
    setPasteOpen(false)
    resetResults()
    if (fileRef.current) fileRef.current.value = ""
  }

  const runPreview = async () => {
    if (!csv.trim() || busy) return
    setParsing(true)
    setError(null)
    try {
      const res = await api<PreviewDTO>("/api/import/sessions", {
        method: "POST",
        body: JSON.stringify({ csv, dryRun: true }),
      })
      setPreview(res)
    } catch (e) {
      setPreview(null)
      setError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const runConfirm = async () => {
    if (!csv.trim() || busy || !preview || preview.totals.workouts === 0) return
    setCommitting(true)
    setError(null)
    try {
      const res = await api<CreatedDTO>("/api/import/sessions", {
        method: "POST",
        body: JSON.stringify({ csv, confirm: true }),
      })
      setCreated(res.created)
      pushNotice({
        kind: "info",
        title: "CSV imported",
        body: `${res.created.sessions} SESSIONS · ${res.created.logs} LOGS · +${res.created.xp} XP · LEVEL ${res.created.level}`,
      })
      bumpRefresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const importAnother = () => {
    discard()
  }

  const dateLine = preview
    ? preview.dateRange.from && preview.dateRange.to
      ? `RANGE ${dayOf(preview.dateRange.from)} → ${dayOf(preview.dateRange.to)}`
      : null
    : null

  return (
    <>
      {/* ── IMPORT CSV · the intake zone ─────────────────────────────────── */}
      <div className="rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          {/* R53-a — the intake prose folded behind a pop-up meaning (the
              DRY RUN FIRST safety note stays on the surface). */}
          <span className="sys-label flex items-center gap-1.5 text-violet-300/90">
            IMPORT CSV
            <InfoHint
              label="Import"
              body="Strong, Hevy or PRIME workout CSV — workouts land as cleared raids with XP from the same engine; weights read as kg."
            />
          </span>
          <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">DRY RUN FIRST</span>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          className="sr-only"
          aria-label="Workout CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          /* R55-a — label tightened ("CHOOSE CSV FILE" → "CHOOSE CSV"). */
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-violet-500/40 bg-violet-500/5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 uppercase transition-all hover:bg-violet-500/15 active:bg-violet-500/25 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <FileUp className="h-4 w-4" aria-hidden />
          CHOOSE CSV
        </button>

        {meta && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-2.5 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-[0.1em] text-zinc-300">
              <span className="text-zinc-500">HELD ·</span> {meta.label} <span className="text-zinc-500">· {meta.size}</span>
            </p>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              aria-label="Discard held CSV"
            >
              <span aria-hidden className="font-mono text-[10px] font-bold">
                ✕
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          disabled={busy}
          aria-expanded={pasteOpen}
          className="mt-2 w-full rounded-sm py-2 font-mono text-[9px] tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:text-zinc-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {pasteOpen ? "HIDE PASTE" : "PASTE CSV"}
        </button>
        {pasteOpen && (
          <textarea
            value={csv}
            onChange={(e) => onPaste(e.target.value)}
            spellCheck={false}
            placeholder={"PASTE CSV — HEADER ROW + ONE ROW PER SET OR LOG\nDATE,WORKOUT NAME,EXERCISE NAME,SETS,REPS,WEIGHT (KG),…"}
            aria-label="Paste workout CSV text"
            className="scroll-sys mt-1.5 min-h-[96px] w-full resize-y rounded-sm border border-zinc-800/60 bg-zinc-950/60 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
          />
        )}

        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={!csv.trim() || busy}
          /* R55-a — "PARSE — PREVIEW" tightened to PREVIEW; the dry-run
             contract rides the title (and the PREVIEW — DRY RUN header). */
          title="Parse the CSV — dry-run preview, nothing written"
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> PARSING…
            </>
          ) : (
            "PREVIEW"
          )}
        </button>
      </div>

      {/* ── honest error state (rose semantics) ──────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
          <div className="min-w-0 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-rose-300">
            <p className="font-bold tracking-[0.18em]">IMPORT REJECTED</p>
            <p className="mt-0.5 break-words">{error}</p>
            {error.includes("NO_SESSIONS") && (
              <p className="mt-1 text-zinc-400">
                NOTHING PARSEABLE — THE HEADER NEEDS DATE, WORKOUT NAME, EXERCISE NAME, AND REPS OR DURATION
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW · dry-run results, nothing written ───────────────────── */}
      {preview && !created && (
        <div className="rounded-sm border border-teal-500/25 bg-teal-500/5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="sys-label text-teal-300/90">PREVIEW — DRY RUN</span>
            <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">NOT WRITTEN</span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { label: "WORKOUTS", value: preview.totals.workouts.toLocaleString(), tone: "text-zinc-100" },
              { label: "LOGS", value: preview.totals.logs.toLocaleString(), tone: "text-zinc-100" },
              { label: "SETS", value: preview.totals.sets.toLocaleString(), tone: "text-zinc-100" },
              { label: "EST XP", value: preview.totals.estXp.toLocaleString(), tone: "text-violet-300" },
              { label: "SKIPPED", value: preview.totals.skippedRows.toLocaleString(), tone: preview.totals.skippedRows > 0 ? "text-amber-300" : "text-zinc-100" },
            ].map((chip) => (
              <div
                key={chip.label}
                className="rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-1.5 py-1.5 text-center"
              >
                <p className="font-mono text-[8px] tracking-[0.18em] text-zinc-400">{chip.label}</p>
                <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums", chip.tone)}>{chip.value}</p>
              </div>
            ))}
          </div>

          {dateLine && (
            <p className="mt-2 font-mono text-[9px] tabular-nums tracking-[0.12em] text-zinc-400">{dateLine}</p>
          )}
          {preview.totals.volumeKg > 0 && (
            <p className="mt-1 font-mono text-[9px] tabular-nums tracking-[0.12em] text-zinc-400">
              EST VOLUME {Math.round(preview.totals.volumeKg).toLocaleString()} KG
            </p>
          )}
          {preview.duplicates > 0 && (
            <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-amber-300/90">
              {preview.duplicates} {preview.duplicates === 1 ? "WORKOUT" : "WORKOUTS"} SKIPPED — ALREADY IN ARCHIVE
            </p>
          )}

          {preview.totals.workouts === 0 ? (
            <div className="mt-2.5 rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/40 px-3 py-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">NOTHING IMPORTABLE</p>
              <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                EVERY ROW WAS SKIPPED — REASONS BELOW, NOTHING WILL BE WRITTEN
              </p>
            </div>
          ) : (
            <div className="scroll-sys mt-2.5 max-h-96 space-y-1 overflow-y-auto">
              {preview.workouts.map((w, i) => (
                <motion.div
                  key={`${w.startedAt}-${i}`}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: Math.min(i * 0.03, 0.21) }}
                  className="rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-xs font-medium text-zinc-200">{w.gateName}</p>
                    <span className="shrink-0 font-mono text-[9px] tabular-nums tracking-[0.1em] text-zinc-400">
                      {dayOf(w.startedAt)}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[9px] tabular-nums tracking-[0.08em] text-zinc-400">
                    {w.logCount} {w.logCount === 1 ? "LOG" : "LOGS"} · {w.sets} SETS
                    {w.volumeKg > 0 ? ` · ${Math.round(w.volumeKg).toLocaleString()} KG` : ""} · {w.estXp} XP
                  </p>
                </motion.div>
              ))}
            </div>
          )}

          {preview.totals.skippedRows > 0 && (
            <div className="mt-2.5">
              <SkippedToggle open={showSkipped} count={preview.totals.skippedRows} onToggle={() => setShowSkipped((v) => !v)} />
              {showSkipped && <SkippedList skipped={preview.skipped} total={preview.totals.skippedRows} />}
            </div>
          )}

          <button
            type="button"
            onClick={() => void runConfirm()}
            disabled={preview.totals.workouts === 0 || busy}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-emerald-500/60 bg-emerald-500/20 font-mono text-xs font-bold tracking-[0.25em] text-emerald-100 uppercase transition-all hover:bg-emerald-500/40 hover:shadow-[0_0_22px_rgba(16,185,129,0.3)] active:bg-emerald-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> IMPORTING…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden /> CONFIRM IMPORT
              </>
            )}
          </button>
          <p className="mt-2 font-mono text-[8px] leading-relaxed tracking-[0.15em] text-zinc-400">
            ONE WRITE · SESSIONS + LOGS + XP IN A SINGLE TRANSACTION · RE-IMPORTING THE SAME FILE IS A NO-OP
          </p>
        </div>
      )}

      {/* ── success · the only post-commit state ─────────────────────────── */}
      {created && (
        <div
          role="status"
          className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-emerald-400/60 bg-emerald-500/20">
              <Check className="h-3 w-3 text-emerald-300" aria-hidden />
            </span>
            <div className="min-w-0 font-mono text-[10px] tabular-nums tracking-[0.1em] text-emerald-200">
              <p className="font-bold tracking-[0.2em]">IMPORT COMPLETE</p>
              <p className="mt-1 text-zinc-400">
                {created.sessions} {created.sessions === 1 ? "SESSION" : "SESSIONS"} · {created.logs} LOGS · +
                {created.xp} XP · LEVEL {created.level}
                {created.levelUps > 0 ? ` · LEVEL UP ×${created.levelUps}` : ""}
              </p>
              <p className="mt-0.5 text-zinc-400">WORKOUTS ARCHIVED AS CLEARED RAIDS — RECORDS TAB UPDATED</p>
            </div>
          </div>
          <button
            type="button"
            onClick={importAnother}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <FileUp className="h-4 w-4" aria-hidden />
            IMPORT ANOTHER CSV
          </button>
        </div>
      )}
    </>
  )
}

// ── HEALTH panel (R22-a — Cronometer/Whoop/Oura/Apple Health → BodyMetric) ───

function HealthImportPanel() {
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const reduce = useReducedMotion()
  const fileRef = useRef<HTMLInputElement>(null)

  const [csv, setCsv] = useState("")
  const [meta, setMeta] = useState<{ label: string; size: string } | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)

  const [parsing, setParsing] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [preview, setPreview] = useState<HealthPreviewDTO | null>(null)
  const [created, setCreated] = useState<HealthCreatedDTO["created"] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)

  const busy = parsing || committing

  const resetResults = () => {
    setPreview(null)
    setCreated(null)
    setError(null)
    setShowSkipped(false)
  }

  const onFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      setCsv(text)
      setMeta({ label: file.name.toUpperCase(), size: `${kb(text)} KB` })
      setPasteOpen(false)
      resetResults()
    }
    reader.readAsText(file)
  }

  const onPaste = (text: string) => {
    setCsv(text)
    setMeta(text.trim() ? { label: "PASTED CSV", size: `${kb(text)} KB` } : null)
    resetResults()
  }

  const discard = () => {
    setCsv("")
    setMeta(null)
    setPasteOpen(false)
    resetResults()
    if (fileRef.current) fileRef.current.value = ""
  }

  const runPreview = async () => {
    if (!csv.trim() || busy) return
    setParsing(true)
    setError(null)
    try {
      const res = await api<HealthPreviewDTO>("/api/import/health", {
        method: "POST",
        body: JSON.stringify({ csv, dryRun: true }),
      })
      setPreview(res)
    } catch (e) {
      setPreview(null)
      setError((e as Error).message)
    } finally {
      setParsing(false)
    }
  }

  const runConfirm = async () => {
    if (!csv.trim() || busy || !preview || preview.totals.entries === 0) return
    setCommitting(true)
    setError(null)
    try {
      const res = await api<HealthCreatedDTO>("/api/import/health", {
        method: "POST",
        body: JSON.stringify({ csv, confirm: true }),
      })
      setCreated(res.created)
      pushNotice({
        kind: "info",
        title: "Health CSV imported",
        body: `${res.created.entries} METRICS · ${res.created.days} DAYS · READINESS HISTORY ${res.created.unlocks.readinessDays} DAYS`,
      })
      bumpRefresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCommitting(false)
    }
  }

  const importAnother = () => {
    discard()
  }

  const typeCount = preview ? Object.keys(preview.totals.byType).length : 0
  const dateLine = preview
    ? preview.totals.firstDay && preview.totals.lastDay
      ? `RANGE ${preview.totals.firstDay} → ${preview.totals.lastDay}`
      : null
    : null
  const moreDays = preview ? Math.max(0, preview.totals.days - preview.days.length) : 0

  return (
    <>
      {/* ── IMPORT HEALTH CSV · the intake zone ──────────────────────────── */}
      <div className="rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="sys-label text-violet-300/90">IMPORT HEALTH CSV</span>
          <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">DRY RUN FIRST</span>
        </div>
        <p className="mt-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-zinc-400">
          CRONOMETER / WHOOP / OURA / APPLE HEALTH / GENERIC CSV — DAILY WEIGHT / SLEEP / RESTING HR LAND IN VITALS
          HISTORY · READINESS LIGHTS UP · KG + CM NATIVE, LB + INCHES CONVERTED · SKIPPED ROWS REPORT REASONS
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,.txt,text/csv"
          className="sr-only"
          aria-label="Health CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          /* R55-a — label tightened ("CHOOSE CSV FILE" → "CHOOSE CSV"). */
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-violet-500/40 bg-violet-500/5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 uppercase transition-all hover:bg-violet-500/15 active:bg-violet-500/25 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <FileUp className="h-4 w-4" aria-hidden />
          CHOOSE CSV
        </button>

        {meta && (
          <div className="mt-2 flex items-center justify-between gap-2 rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-2.5 py-2">
            <p className="min-w-0 flex-1 truncate font-mono text-[9px] tracking-[0.1em] text-zinc-300">
              <span className="text-zinc-500">HELD ·</span> {meta.label} <span className="text-zinc-500">· {meta.size}</span>
            </p>
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-rose-400/50 hover:text-rose-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              aria-label="Discard held health CSV"
            >
              <span aria-hidden className="font-mono text-[10px] font-bold">
                ✕
              </span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          disabled={busy}
          aria-expanded={pasteOpen}
          className="mt-2 w-full rounded-sm py-2 font-mono text-[9px] tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:text-zinc-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {pasteOpen ? "HIDE PASTE" : "PASTE CSV"}
        </button>
        {pasteOpen && (
          <textarea
            value={csv}
            onChange={(e) => onPaste(e.target.value)}
            spellCheck={false}
            placeholder={"PASTE CSV — HEADER ROW + ONE ROW PER DAY\nDATE,WEIGHT (KG),SLEEP (H),RESTING HR,…\nUNRECOGNIZED COLUMNS ARE IGNORED — SKIPPED ROWS SHOW REASONS"}
            aria-label="Paste health CSV text"
            className="scroll-sys mt-1.5 min-h-[96px] w-full resize-y rounded-sm border border-zinc-800/60 bg-zinc-950/60 p-2.5 font-mono text-[10px] leading-relaxed text-zinc-200 placeholder:text-zinc-600 focus:border-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
          />
        )}

        <button
          type="button"
          onClick={() => void runPreview()}
          disabled={!csv.trim() || busy}
          /* R55-a — "PARSE — PREVIEW" tightened to PREVIEW; the dry-run
             contract rides the title (and the PREVIEW — DRY RUN header). */
          title="Parse the CSV — dry-run preview, nothing written"
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          {parsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> PARSING…
            </>
          ) : (
            "PREVIEW"
          )}
        </button>
      </div>

      {/* ── honest error state (rose semantics) ──────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2.5"
        >
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden />
          <div className="min-w-0 font-mono text-[10px] leading-relaxed tracking-[0.08em] text-rose-300">
            <p className="font-bold tracking-[0.18em]">IMPORT REJECTED</p>
            <p className="mt-0.5 break-words">{error}</p>
            {error.includes("NO_METRICS") && (
              <p className="mt-1 text-zinc-400">
                NOTHING PARSEABLE — THE HEADER NEEDS A DATE COLUMN AND AT LEAST ONE METRIC (WEIGHT / SLEEP / RESTING HR
                / MOOD / ENERGY / MEASUREMENTS, OR TYPE + VALUE)
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── PREVIEW · dry-run results, nothing written ───────────────────── */}
      {preview && !created && (
        <div className="rounded-sm border border-teal-500/25 bg-teal-500/5 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="sys-label text-teal-300/90">PREVIEW — DRY RUN</span>
            <span className="font-mono text-[8px] tracking-[0.2em] text-zinc-400">NOT WRITTEN</span>
          </div>

          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { label: "DAYS", value: preview.totals.days.toLocaleString(), tone: "text-zinc-100" },
              { label: "ENTRIES", value: preview.totals.entries.toLocaleString(), tone: "text-zinc-100" },
              { label: "TYPES", value: typeCount.toLocaleString(), tone: "text-zinc-100" },
              {
                label: "DUPLICATES",
                value: (preview.duplicates + preview.totals.fileDuplicates).toLocaleString(),
                tone: preview.duplicates + preview.totals.fileDuplicates > 0 ? "text-amber-300" : "text-zinc-100",
              },
              {
                label: "SKIPPED",
                value: preview.totals.skippedRows.toLocaleString(),
                tone: preview.totals.skippedRows > 0 ? "text-amber-300" : "text-zinc-100",
              },
            ].map((chip) => (
              <div
                key={chip.label}
                className="rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-1.5 py-1.5 text-center"
              >
                <p className="font-mono text-[8px] tracking-[0.18em] text-zinc-400">{chip.label}</p>
                <p className={cn("mt-0.5 font-mono text-sm font-bold tabular-nums", chip.tone)}>{chip.value}</p>
              </div>
            ))}
          </div>

          {dateLine && (
            <p className="mt-2 font-mono text-[9px] tabular-nums tracking-[0.12em] text-zinc-400">{dateLine}</p>
          )}
          {preview.duplicates > 0 && (
            <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-amber-300/90">
              {preview.duplicates} {preview.duplicates === 1 ? "ENTRY" : "ENTRIES"} SKIPPED — ALREADY LOGGED
            </p>
          )}
          {preview.totals.fileDuplicates > 0 && (
            <p className="mt-1 font-mono text-[9px] tracking-[0.12em] text-amber-300/90">
              {preview.totals.fileDuplicates} {preview.totals.fileDuplicates === 1 ? "ROW" : "ROWS"} COLLAPSED — LAST
              VALUE WINS WITHIN THE FILE
            </p>
          )}

          {preview.totals.entries === 0 ? (
            <div className="mt-2.5 rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/40 px-3 py-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">NOTHING IMPORTABLE</p>
              <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                EVERY ROW WAS SKIPPED — REASONS BELOW, NOTHING WILL BE WRITTEN
              </p>
            </div>
          ) : (
            <div className="scroll-sys mt-2.5 max-h-96 space-y-1 overflow-y-auto">
              {preview.days.map((d, i) => (
                <motion.div
                  key={d.day}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: Math.min(i * 0.03, 0.21) }}
                  className="rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-mono text-[10px] tabular-nums tracking-[0.12em] text-zinc-200">{d.day}</p>
                    <span className="shrink-0 font-mono text-[8px] tabular-nums tracking-[0.1em] text-zinc-500">
                      {d.metrics.length} {d.metrics.length === 1 ? "METRIC" : "METRICS"}
                    </span>
                  </div>
                  <p className="mt-0.5 font-mono text-[9px] tabular-nums tracking-[0.06em] text-zinc-400">
                    {d.metrics.map((m) => `${metricLabel(m.type)} ${fmtMetric(m.value, m.unit)}`).join(" · ")}
                  </p>
                </motion.div>
              ))}
              {moreDays > 0 && (
                <p className="px-2.5 py-1.5 font-mono text-[9px] tracking-[0.12em] text-zinc-500">
                  + {moreDays} MORE {moreDays === 1 ? "DAY" : "DAYS"} — FIRST {preview.days.length} SHOWN
                </p>
              )}
            </div>
          )}

          {preview.totals.skippedRows > 0 && (
            <div className="mt-2.5">
              <SkippedToggle open={showSkipped} count={preview.totals.skippedRows} onToggle={() => setShowSkipped((v) => !v)} />
              {showSkipped && <SkippedList skipped={preview.skipped} total={preview.totals.skippedRows} />}
            </div>
          )}

          <button
            type="button"
            onClick={() => void runConfirm()}
            disabled={preview.totals.entries === 0 || busy}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-emerald-500/60 bg-emerald-500/20 font-mono text-xs font-bold tracking-[0.25em] text-emerald-100 uppercase transition-all hover:bg-emerald-500/40 hover:shadow-[0_0_22px_rgba(16,185,129,0.3)] active:bg-emerald-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            {committing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> IMPORTING…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden /> CONFIRM IMPORT
              </>
            )}
          </button>
          <p className="mt-2 font-mono text-[8px] leading-relaxed tracking-[0.15em] text-zinc-400">
            ONE WRITE · BODY METRICS IN A SINGLE TRANSACTION · RE-IMPORTING THE SAME FILE IS A NO-OP
          </p>
        </div>
      )}

      {/* ── success · the only post-commit state ─────────────────────────── */}
      {created && (
        <div
          role="status"
          className="rounded-sm border border-emerald-500/40 bg-emerald-500/10 p-3.5"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-emerald-400/60 bg-emerald-500/20">
              <Check className="h-3 w-3 text-emerald-300" aria-hidden />
            </span>
            <div className="min-w-0 font-mono text-[10px] tabular-nums tracking-[0.1em] text-emerald-200">
              <p className="font-bold tracking-[0.2em]">IMPORT COMPLETE</p>
              <p className="mt-1 text-zinc-400">
                {created.entries} {created.entries === 1 ? "ENTRY" : "ENTRIES"} ACROSS {created.days}{" "}
                {created.days === 1 ? "DAY" : "DAYS"} · VITALS HISTORY + READINESS UPDATED
              </p>
              <p className="mt-0.5 text-zinc-400">
                READINESS HISTORY FROM {created.unlocks.readinessDays} {created.unlocks.readinessDays === 1 ? "DAY" : "DAYS"}{" "}
                · RHR BASELINE EVIDENCE ON {created.unlocks.rhrDays} {created.unlocks.rhrDays === 1 ? "DAY" : "DAYS"}
              </p>
              {created.profileWeightSynced && (
                <p className="mt-0.5 text-zinc-400">LATEST WEIGHT SYNCED TO PROFILE — CALORIE TARGETS FOLLOW</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={importAnother}
            className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 active:bg-violet-500/50 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <FileUp className="h-4 w-4" aria-hidden />
            IMPORT ANOTHER CSV
          </button>
        </div>
      )}
    </>
  )
}

// ── component ─────────────────────────────────────────────────────────────────

type ImportMode = "workouts" | "health"

/** One 44px mode chip (uppercase violet aesthetic, selected state glows).
 *  R55-a — optional title: the brand tails (Strong/Hevy · Cronometer/Whoop)
 *  ride the chip's hover title instead of the face. */
function ModeChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: string
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-11 min-w-0 items-center justify-center rounded-sm border px-2 text-center font-mono text-[8px] font-bold leading-[1.5] tracking-[0.1em] uppercase transition-all focus-visible:outline focus-visible:outline-violet-400/70",
        active
          ? "border-violet-500/60 bg-violet-500/20 text-violet-200 shadow-[0_0_18px_rgba(167,139,250,0.25)]"
          : "border-zinc-800/60 bg-zinc-950/50 text-zinc-400 hover:border-violet-500/30 hover:text-zinc-300",
      )}
    >
      {children}
    </button>
  )
}

export function ImportCenter() {
  /** Default stays WORKOUTS — the R21-a flow is untouched below. */
  const [mode, setMode] = useState<ImportMode>("workouts")

  return (
    <SystemPanel
      label="Import Center"
      className="mt-4 sm:mt-5"
      /* R55-a — the "WORKOUTS + HEALTH CSV" accent stood down: the two mode
         chips directly below carry the same information (their brand tails
         ride each chip's title). */
    >
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* ── MODE SWITCH · workouts vs health metrics ─────────────────────── */}
        <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Import mode">
          <ModeChip active={mode === "workouts"} onClick={() => setMode("workouts")} title="Strong / Hevy / PRIME workout CSV">
            WORKOUTS
          </ModeChip>
          <ModeChip active={mode === "health"} onClick={() => setMode("health")} title="Cronometer / Whoop / Oura / Apple Health CSV">
            HEALTH
          </ModeChip>
        </div>

        {mode === "workouts" ? <WorkoutImportPanel /> : <HealthImportPanel />}
      </div>
    </SystemPanel>
  )
}
