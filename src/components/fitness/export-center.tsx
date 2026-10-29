"use client"

// ─── PRIME · Export Center (R20-c — Records tab, section 06 · EXPORT) ─────────
// The interchange layer: PRIME data OUT to other fitness apps. Three zones —
// WORKOUT CSV (Strong/Hevy-convention archive + per-session export, the
// de-facto fitness-app import format), SESSION EXPORT (recent cleared raids
// as one-tap CSV/share chips), and the INTEGRATIONS MAP — an HONEST ledger
// of every connectivity surface the app actually has. Nothing fakes a
// "connected" state: the live surfaces (HR strap, workout CSV, vault backup)
// render teal LIVE rows; Strava / Google Fit / Apple Health render amber
// MANUAL SYNC rows pointing at the CSV bridge — no OAuth server exists in
// this build, and the panel never pretends otherwise.
//
// R21-a: the bridge is TWO-WAY — an ImportCenter sibling panel mounts right
// below this one (same 06 region) so Strong/Hevy/PRIME CSV flows back IN
// with a dry-run preview → confirmed commit. This file owns the mount.
//
// Sessions arrive as props from records-tab's own /api/sessions fetch
// (zero duplicate requests). The prop type is that tab's narrow local wire
// shape; the widening to the canonical DTO happens once, documented, below.
// Share capability follows the house hydrate-after-mount pattern (probe in
// useEffect) so SSR markup stays stable and hydration never mismatches on a
// share-capable browser.

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  Apple,
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileDown,
  FileSpreadsheet,
  HeartPulse,
  Route,
  Share2,
  Watch,
} from "lucide-react"
import { SystemPanel } from "@/components/system/system-panel"
import { SkeletonPanel } from "@/components/system/skeleton-panel"
import { InfoHint } from "@/components/system/info-hint"
import { useSystem, type Tab } from "@/store/system-store"
import { downloadCsv, sessionToCsv, sessionsToArchiveCsv } from "@/lib/export/csv"
import { canShareFiles, shareCsvFile } from "@/lib/export/share"
import { ImportCenter } from "./import-center"
import type { SessionDTO } from "@/lib/types"
import { FLOW_EASE } from "@/components/system/motion"
import { cn } from "@/lib/utils"

/**
 * records-tab's local SessionsRes row shape — narrower than the canonical
 * SessionDTO (status: string, logs without rir/rpe/notes) because that type
 * predates R8-a/R17-D/R32-a. The wire objects ARE full DTOs (engine.sessionDTO
 * always sends rir + rpe + notes), so the export layer widens once, right here.
 */
export type ExportSessionInput = {
  id: string
  gateId: string
  gateName: string
  status: string
  startedAt: string
  xpEarned: number
  durationMin: number
  volumeKg: number
  logs: {
    id: string
    name: string
    type: string
    sets: number
    reps: number
    weightKg: number
    durationMin: number
    xpValue: number
  }[]
}

// ── filename + display helpers (pure) ────────────────────────────────────────

/** "IRON SANCTUM" → "iron-sanctum"; anything stripped clean → "session". */
function gateSlug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "session"
  )
}

const archiveFilename = () => `prime-workouts-${new Date().toISOString().slice(0, 10)}.csv`
const sessionFilename = (s: { gateName: string; startedAt: string }) =>
  `prime-${gateSlug(s.gateName)}-${s.startedAt.slice(0, 10)}.csv`

/** KB size of an artifact as it will hit the wire (byte-honest, not char count). */
const kb = (contents: string) => (new Blob([contents]).size / 1024).toFixed(1)

/** R53-a — session-export rows that render flat before the SHOW ALL expander. */
// R55 orchestrator polish — preview capped at 2 (the archive already lists
// every session; the export tail stays one tap away behind SHOW ALL).
const SESSION_PREVIEW = 2

// ── INTEGRATIONS MAP — every connectivity surface, honestly ──────────────────

type IntegrationRow = {
  icon: React.ComponentType<{ className?: string }>
  name: string
  status: string
  tone: "live" | "manual"
  /** Live surface that lives on another tab — the row navigates to it. */
  tab?: Tab
  /** R53-a — the long-form status folded out of the surface; rides the note's title. */
  title?: string
}

/* R53-a — notes compressed to ≤3 words (merge & hide: the full phrases ride
   each note's title attribute, nothing lost). */
const INTEGRATION_ROWS: IntegrationRow[] = [
  {
    icon: HeartPulse,
    name: "HEART RATE STRAP",
    status: "LIVE · VITALS TAB",
    title: "Live — paired sensors on the Vitals tab → Sensor Link",
    tone: "live",
    tab: "vitals",
  },
  { icon: FileSpreadsheet, name: "WORKOUT CSV", status: "LIVE", tone: "live" },
  { icon: Database, name: "VAULT BACKUP JSON", status: "LIVE · STATUS TAB", tone: "live", tab: "status" },
  { icon: Route, name: "STRAVA", status: "via CSV", title: "Manual sync — export the workout CSV above", tone: "manual" },
  { icon: Watch, name: "GOOGLE FIT", status: "via CSV", title: "Manual sync — export the workout CSV above", tone: "manual" },
  { icon: Apple, name: "APPLE HEALTH", status: "via CSV", title: "Manual sync — export the workout CSV above", tone: "manual" },
]

// ── component ────────────────────────────────────────────────────────────────

export function ExportCenter({ sessions, loading = false }: { sessions: ExportSessionInput[]; loading?: boolean }) {
  const pushNotice = useSystem((s) => s.pushNotice)
  const setTab = useSystem((s) => s.setTab)
  const reduce = useReducedMotion()

  // capability truth after mount — SSR renders the honest no-share variant
  const [shareable, setShareable] = useState(false)
  useEffect(() => {
    setShareable(canShareFiles())
  }, [])

  /** Key of the in-flight share action ("archive" or a session id) — chips disable while a sheet is open. */
  const [shareKey, setShareKey] = useState<string | null>(null)

  /** R53-a — session-export expander: preview rows render flat, the rest live
   *  behind SHOW ALL (the archive-list recipe; full list stays reachable). */
  const [showAllSessions, setShowAllSessions] = useState(false)

  /** R55-a — integrations map expander: the 6-row honesty ledger (and its
   *  roadmap footnote) unmount while collapsed (export-list idiom); every
   *  row — including the tab-navigation buttons — stays one tap away. */
  const [showIntegrations, setShowIntegrations] = useState(false)

  // widen the narrow wire shape once, at the boundary (documented above)
  const wide = sessions as SessionDTO[]
  const cleared = useMemo(() => wide.filter((s) => s.status === "cleared"), [wide])
  const clearedLogRows = useMemo(() => cleared.reduce((n, s) => n + s.logs.length, 0), [cleared])
  const recentCleared = useMemo(
    () => [...cleared].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8),
    [cleared],
  )
  const empty = cleared.length === 0

  const exportArchive = () => {
    if (empty) return // button is disabled — belt only
    const csv = sessionsToArchiveCsv(wide)
    const filename = archiveFilename()
    downloadCsv(filename, csv)
    pushNotice({
      kind: "info",
      title: "Workout archive exported",
      body: `${filename} · ${kb(csv)} KB · ${clearedLogRows} ROWS`,
    })
  }

  const shareArchive = async () => {
    if (empty || shareKey) return
    setShareKey("archive")
    try {
      const csv = sessionsToArchiveCsv(wide)
      const filename = archiveFilename()
      const outcome = await shareCsvFile(
        filename,
        csv,
        "PRIME workout archive",
        "Workout CSV — Strong/Hevy-compatible, one row per exercise log.",
      )
      pushNotice({
        kind: "info",
        title: outcome === "shared" ? "Archive shared" : "Workout archive exported",
        body: `${filename} · ${kb(csv)} KB · ${clearedLogRows} ROWS`,
      })
    } finally {
      setShareKey(null)
    }
  }

  const exportSession = (s: SessionDTO) => {
    const csv = sessionToCsv(s)
    const filename = sessionFilename(s)
    downloadCsv(filename, csv)
    pushNotice({ kind: "info", title: "Session exported", body: `${filename} · ${kb(csv)} KB · ${s.logs.length} ROWS` })
  }

  const shareSession = async (s: SessionDTO) => {
    if (shareKey) return
    setShareKey(s.id)
    try {
      const csv = sessionToCsv(s)
      const filename = sessionFilename(s)
      const outcome = await shareCsvFile(filename, csv, `PRIME — ${s.gateName}`, "Workout CSV — Strong/Hevy-compatible.")
      pushNotice({
        kind: "info",
        title: outcome === "shared" ? "Session shared" : "Session exported",
        body: `${filename} · ${kb(csv)} KB · ${s.logs.length} ROWS`,
      })
    } finally {
      setShareKey(null)
    }
  }

  // R53-a — session-export row renderer, shared by the flat preview + the
  // SHOW ALL tail. R55-a — the per-row meta line (logs · volume · minutes)
  // rides the row's title; the face keeps name + date.
  const renderExportRow = (s: SessionDTO, i: number) => (
    <motion.div
      key={s.id}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.3, ease: FLOW_EASE, delay: Math.min(i * 0.03, 0.21) }}
      className="flex items-center gap-2.5 rounded-sm border border-zinc-800/60 bg-zinc-950/50 px-2.5 py-2"
      title={`${s.gateName} — ${s.logs.length} ${s.logs.length === 1 ? "LOG" : "LOGS"}${s.volumeKg > 0 ? ` · ${Math.round(s.volumeKg).toLocaleString()} KG` : ""}${s.durationMin > 0 ? ` · ${s.durationMin} MIN` : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-xs font-medium text-zinc-200">{s.gateName}</p>
          <span className="shrink-0 font-mono text-[9px] tabular-nums tracking-[0.1em] text-zinc-400">
            {new Date(s.startedAt)
              .toLocaleDateString("en-US", { month: "short", day: "numeric" })
              .toUpperCase()}
          </span>
        </div>
      </div>
      <button
        type="button"
        aria-label={`Export ${s.gateName} workout as CSV`}
        onClick={() => exportSession(s)}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-teal-400/50 hover:text-teal-300 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <FileDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      {shareable && (
        <button
          type="button"
          aria-label={`Share ${s.gateName} workout CSV`}
          onClick={() => void shareSession(s)}
          disabled={shareKey !== null}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-sm border border-zinc-700/60 bg-zinc-950/60 text-zinc-400 transition-colors hover:border-teal-400/50 hover:text-teal-300 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
        >
          <Share2 className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </motion.div>
  )

  if (loading && sessions.length === 0) {
    return (
      <>
        <SkeletonPanel label="SYNCING EXPORT CENTER" rows={3} />
        <ImportCenter />
      </>
    )
  }

  return (
    <>
      <SystemPanel
      label="Export Center"
      labelAccent={
        /* R55-a — the exportPack hint (glossary) beside the count: the full
           JSON export pack's meaning without surface prose. */
        <span className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums tracking-widest text-zinc-400">
          {cleared.length} CLEARED
          <InfoHint term="exportPack" />
        </span>
      }
    >
      <div className="space-y-3.5 p-4 sm:p-5">
        {/* ── WORKOUT CSV · the interchange artifact ─────────────────────── */}
        <div className="rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5">
          {/* R55-a — the "STRONG / HEVY-COMPATIBLE" tail rides this title. */}
          <span className="sys-label text-violet-300/90" title="Strong / Hevy-compatible">WORKOUT CSV</span>
          <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={exportArchive}
              disabled={empty}
              /* R53-a — the row-format + delivery captions folded out of the
                 surface into this title (and the share button's below).
                 R55-a — the button label tightened to EXPORT ALL. */
              title={`Export all workouts — one row per exercise log · cleared sessions only · ${cleared.length} raids · ${clearedLogRows} CSV rows${
                shareable ? "" : " · this browser downloads directly — share from your Files app"
              }`}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-500/60 bg-violet-500/20 font-mono text-xs font-bold tracking-[0.25em] text-violet-100 uppercase transition-all hover:bg-violet-500/40 hover:shadow-[0_0_22px_rgba(167,139,250,0.35)] active:bg-violet-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Download className="h-4 w-4" aria-hidden />
              EXPORT ALL
            </button>
            {shareable && (
              <button
                type="button"
                onClick={() => void shareArchive()}
                disabled={empty || shareKey !== null}
                title="OS share sheet — Gmail · Drive · Sheets"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-teal-400/60 bg-teal-500/20 font-mono text-xs font-bold tracking-[0.25em] text-teal-100 uppercase transition-all hover:bg-teal-500/40 hover:shadow-[0_0_22px_rgba(45,212,191,0.3)] active:bg-teal-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                SHARE TO APPS
              </button>
            )}
          </div>
        </div>

        {/* ── SESSION EXPORT · recent cleared raids, one tap each ────────── */}
        <div className="rounded-sm border border-teal-500/25 bg-teal-500/5 p-3.5">
          {/* R55-a — the "N RECENT" count folded into the label's title
              (the SHOW ALL button below already prints the count). */}
          <span className="sys-label text-teal-300/90" title={`${recentCleared.length} recent cleared raids`}>
            SESSION EXPORT
          </span>

          {empty ? (
            <div className="mt-2.5 rounded-sm border border-dashed border-zinc-700/60 bg-zinc-950/40 px-3 py-5 text-center">
              <p className="font-mono text-[10px] tracking-[0.2em] text-zinc-400">NO CLEARED SESSIONS YET</p>
              <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.15em] text-zinc-400">
                FINISH A RAID FIRST — EXPORTS BUILD FROM CLEARED RAIDS
              </p>
            </div>
          ) : (
            <div className="scroll-sys mt-2.5 max-h-96 space-y-1 overflow-y-auto">
              {/* R53-a — preview rows flat + the tail behind SHOW ALL
                  (AnimatePresence height fold, reduce-safe; every recent
                  cleared raid stays one tap away). */}
              {recentCleared.slice(0, SESSION_PREVIEW).map(renderExportRow)}
              <AnimatePresence initial={false}>
                {showAllSessions && recentCleared.length > SESSION_PREVIEW && (
                  <motion.div
                    key="export-rest"
                    initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1">
                      {recentCleared.slice(SESSION_PREVIEW).map((s, i) => renderExportRow(s, i + SESSION_PREVIEW))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {recentCleared.length > SESSION_PREVIEW && (
                <button
                  type="button"
                  onClick={() => setShowAllSessions((v) => !v)}
                  aria-expanded={showAllSessions}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-sm border border-zinc-800/60 bg-zinc-950/40 font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-400 uppercase transition-colors hover:border-teal-400/40 hover:text-teal-300 focus-visible:outline focus-visible:outline-violet-400/70"
                >
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", showAllSessions && "rotate-180")} aria-hidden />
                  {showAllSessions ? "SHOW LESS" : `SHOW ALL · ${recentCleared.length}`}
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── INTEGRATIONS MAP · every surface, honestly ─────────────────── */}
        <div className="rounded-sm border border-zinc-700/50 bg-zinc-950/40 p-3.5">
          {/* R55-a — the map collapsed to a 44px expander (R53-a kept the rows
              flat): the 6 rows + honesty footnote unmount while closed, each
              stays one tap away; the gist rides the toggle's title. */}
          <button
            type="button"
            onClick={() => setShowIntegrations((v) => !v)}
            aria-expanded={showIntegrations}
            aria-controls="export-integrations"
            title="Every connectivity surface, honestly · third-party sync is roadmap — CSV is the bridge today"
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-sm font-mono text-[9px] font-bold tracking-[0.22em] text-zinc-300 uppercase transition-colors hover:text-violet-300 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <span className="sys-label text-zinc-300/90" title="Every surface · honest">
              INTEGRATIONS
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform duration-200", showIntegrations && "rotate-180")}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
            {showIntegrations && (
              <motion.div
                id="export-integrations"
                key="export-integrations"
                initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={reduce ? { height: 0, opacity: 0, transition: { duration: 0 } } : { height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.32, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="mt-1 divide-y divide-zinc-800/50">
                  {INTEGRATION_ROWS.map((row) => {
                    const Icon = row.icon
                    const body = (
                      <>
                        <Icon
                          className={cn("h-4 w-4 shrink-0", row.tone === "live" ? "text-teal-400" : "text-amber-400")}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-mono text-[10px] font-bold tracking-[0.15em] text-zinc-200">{row.name}</p>
                          <p
                            className={cn(
                              "mt-0.5 font-mono text-[9px] tracking-[0.12em]",
                              row.tone === "live" ? "text-teal-300/90" : "text-amber-300/90",
                            )}
                            title={row.title}
                          >
                            {row.status}
                          </p>
                        </div>
                        {row.tab && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />}
                      </>
                    )
                    if (row.tab) {
                      return (
                        <button
                          key={row.name}
                          type="button"
                          onClick={() => setTab(row.tab as Tab)}
                          aria-label={`${row.name} — open the ${row.tab} tab`}
                          className="flex w-full items-center gap-2.5 py-2.5 text-left transition-colors hover:bg-violet-500/5 focus-visible:outline focus-visible:outline-violet-400/70"
                        >
                          {body}
                        </button>
                      )
                    }
                    return (
                      <div key={row.name} className="flex items-center gap-2.5 py-2.5">
                        {body}
                      </div>
                    )
                  })}
                </div>
                {/* R53-a — the honesty stanza compressed to one sentence-case line
                    (the roadmap + bridge detail rides the row titles above);
                    R55-a — it rides inside the fold. */}
                <p className="mt-2.5 font-mono text-[9px] leading-relaxed text-zinc-400">
                  Third-party sync is roadmap — CSV is the bridge today
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
      </SystemPanel>

      {/* R21-a — the bridge's other half: CSV IN, mounted as a sibling panel
          in the same 06 region (records-tab hosts ExportCenter only). */}
      <ImportCenter />
    </>
  )
}
