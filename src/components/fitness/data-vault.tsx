"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import {
  Database,
  Download,
  FileUp,
  Share2,
  ShieldAlert,
  TriangleAlert,
  Upload,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSystem } from "@/store/system-store"
import { canShareFiles, shareJsonFile } from "@/lib/export/share"
import { cn } from "@/lib/utils"

type VaultSummary = {
  name: string
  level: number
  sessions: number
  logs: number
  quests: number
  records: number
  meals?: number
  waterEntries?: number
  bodyMetrics?: number
}

type ParsedVault = {
  file: { version: number; app: string; exportedAt: string }
  summary: {
    name: string
    level: number
    rank?: string
    totalXp: number
    sessions: number
    logs: number
    quests: number
    records: number
    essence: number
    meals: number
    waterEntries: number
    bodyMetrics: number
    bodyProfile: boolean
  }
  raw: unknown
}

/**
 * DATA VAULT — full backup export / import.
 * Export downloads the entire hunter ledger as JSON; import parses a vault
 * file client-side (preview only), then requires an explicit armed confirm
 * before POSTing the replace operation.
 */
export function DataVaultButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* R52 declutter — the utilities merge into one slim row of quiet pills:
          icon + micro-cap label only; the caption lives on the title/aria
          (the dialog behind it is unchanged). */}
      <motion.button
        onClick={() => setOpen(true)}
        whileTap={{ scale: 0.985, transition: { duration: 0.1 } }}
        className="grove-press group inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[10px] font-bold tracking-[0.12em] text-zinc-300 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
        aria-label="Open the data vault — back up or restore your full training ledger"
        aria-haspopup="dialog"
        title="Back up or restore your full training ledger"
      >
        <Database className="h-3.5 w-3.5 text-violet-300/80" aria-hidden />
        DATA VAULT
      </motion.button>
      <DataVaultDialog open={open} onOpenChange={setOpen} />
    </>
  )
}

function DataVaultDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const pushNotice = useSystem((s) => s.pushNotice)
  const bumpRefresh = useSystem((s) => s.bumpRefresh)
  const speak = useSystem((s) => s.speak)
  const [exporting, setExporting] = useState(false)
  /** R20-c — OS share-sheet capability for the vault backup. Probed after
   *  mount (house hydrate pattern) so SSR markup stays stable; the share
   *  button only ever renders on browsers that can actually dispatch files. */
  const [shareable, setShareable] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedVault | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<VaultSummary | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reset = () => {
    setParsed(null)
    setParseError(null)
    setArmed(false)
    setImported(null)
    setImporting(false)
    if (fileRef.current) fileRef.current.value = ""
  }

  useEffect(() => {
    setShareable(canShareFiles())
  }, [])

  const doExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const res = await fetch("/api/vault", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `prime-vault-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      pushNotice({ kind: "info", title: "Vault exported", body: `${a.download} · ${(blob.size / 1024).toFixed(1)} KB` })
    } catch {
      pushNotice({ kind: "warn", title: "Export failed", body: "The backup could not be opened." })
    } finally {
      setExporting(false)
    }
  }

  /** R20-c — SHARE VIA APPS: the same vault JSON, dispatched through the OS
   *  share sheet (Gmail / Drive / any file-accepting app) instead of a bare
   *  download. shareJsonFile never throws; a dismissed sheet is a decision,
   *  not a failure. */
  const doShare = async () => {
    if (sharing || exporting) return
    setSharing(true)
    try {
      const res = await fetch("/api/vault", { cache: "no-store" })
      if (!res.ok) throw new Error(String(res.status))
      const json = await res.text()
      const filename = `prime-vault-${new Date().toISOString().slice(0, 10)}.json`
      const outcome = await shareJsonFile(
        filename,
        json,
        "PRIME Data Vault",
        "Full PRIME training-ledger backup (JSON)."
      )
      pushNotice({
        kind: "info",
        title: outcome === "shared" ? "Vault shared" : "Vault exported",
        body: `${filename} · ${(new Blob([json]).size / 1024).toFixed(1)} KB`,
      })
    } catch {
      pushNotice({ kind: "warn", title: "Share failed", body: "The backup could not be opened." })
    } finally {
      setSharing(false)
    }
  }

  const onFile = useCallback(async (file: File) => {
    setParsing(true)
    setParseError(null)
    setParsed(null)
    setArmed(false)
    setImported(null)
    try {
      const text = await file.text()
      const data = JSON.parse(text) as Record<string, unknown>
      const version = Number(data.version)
      if ((version !== 1 && version !== 2) || data.app !== "ascendant" || !data.hunter) {
        throw new Error("not a vault file")
      }
      const h = data.hunter as Record<string, unknown>
      const sessions = Array.isArray(data.sessions) ? (data.sessions as Record<string, unknown>[]) : []
      const logs = sessions.reduce((acc, s) => acc + (Array.isArray(s.logs) ? (s.logs as unknown[]).length : 0), 0)
      const meals = Array.isArray(data.nutritionLogs) ? (data.nutritionLogs as unknown[]).length : 0
      const waterEntries = Array.isArray(data.waterLogs) ? (data.waterLogs as unknown[]).length : 0
      const bodyMetrics = Array.isArray(data.bodyMetrics) ? (data.bodyMetrics as unknown[]).length : 0
      const bodyProfile = ["heightCm", "weightKg", "birthYear", "sex", "activityLevel", "goal"].some(
        (k) => h[k] !== null && h[k] !== undefined && h[k] !== ""
      )
      setParsed({
        file: { version, app: data.app as string, exportedAt: String(data.exportedAt ?? "") },
        summary: {
          name: String(h.name ?? "UNKNOWN"),
          level: Number(h.level ?? 1),
          totalXp: Number(h.totalXp ?? 0),
          sessions: sessions.length,
          logs,
          quests: Array.isArray(data.quests) ? (data.quests as unknown[]).length : 0,
          records: Array.isArray(data.records) ? (data.records as unknown[]).length : 0,
          essence: Number(h.essence ?? 0),
          meals,
          waterEntries,
          bodyMetrics,
          bodyProfile,
        },
        raw: data,
      })
    } catch {
      setParseError("UNREADABLE VAULT — not a valid PRIME backup file.")
    } finally {
      setParsing(false)
    }
  }, [])

  const doImport = async () => {
    if (!parsed || !armed || importing) return
    setImporting(true)
    try {
      const res = await fetch("/api/vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: parsed.raw, confirm: true }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json()) as { ok: boolean; summary: VaultSummary }
      setImported(data.summary)
      pushNotice({ kind: "title", title: "Vault restored", body: `${data.summary.name} · LV.${data.summary.level} · ${data.summary.sessions} sessions` })
      speak("Vault restored. The ledger is whole again.")
      bumpRefresh()
    } catch {
      pushNotice({ kind: "warn", title: "Import failed", body: "The backup could not be restored." })
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent aria-describedby={undefined} className="sys-panel max-h-[85vh] max-w-md overflow-y-auto rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl scroll-sys">
        <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
          <DialogTitle className="flex items-center gap-2.5 sys-label text-violet-300/80">
            <Database className="h-3.5 w-3.5 text-violet-400" aria-hidden />
            DATA VAULT
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-5">
          {/* EXPORT chamber — cool violet, the safe wing */}
          <section
            aria-label="Export backup"
            className="rounded-sm border border-violet-500/25 bg-violet-500/[0.06] p-4"
          >
            <div className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5 text-violet-300" aria-hidden />
              <p className="sys-label text-zinc-400">EXPORT BACKUP</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Downloads your entire ledger — profile, sessions, exercises, goals, records, perks, credits, meals, water and body metrics — as one JSON file.
            </p>
            <motion.button
              onClick={doExport}
              disabled={exporting}
              aria-busy={exporting}
              whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 uppercase transition-all hover:border-violet-300/70 hover:bg-violet-500/30 hover:shadow-[0_0_22px_rgba(139,92,246,0.4)] active:bg-violet-500/45 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? "PACKING BACKUP…" : "DOWNLOAD VAULT JSON"}
            </motion.button>
            {/* R20-c — OS share-sheet dispatch for the same backup; hidden on
                browsers that cannot share files (honest absence, never a dead
                button) — stacked under the download on phone widths so both
                44px targets keep their full labels */}
            {shareable && (
              <motion.button
                onClick={doShare}
                disabled={sharing}
                aria-busy={sharing}
                whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 uppercase transition-all hover:border-violet-300/70 hover:bg-violet-500/30 hover:shadow-[0_0_22px_rgba(139,92,246,0.4)] active:bg-violet-500/45 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                {sharing ? "OPENING SHARE SHEET…" : "SHARE VIA APPS"}
              </motion.button>
            )}
          </section>

          {/* OR — a current of dashes flows between the two chambers */}
          <div className="flex items-center gap-3" aria-hidden>
            <svg className="h-px min-w-0 flex-1" preserveAspectRatio="none" viewBox="0 0 100 1">
              <line
                x1="0"
                y1="0.5"
                x2="100"
                y2="0.5"
                stroke="rgba(167,139,250,0.4)"
                strokeWidth="1"
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
                className="net-flow"
              />
            </svg>
            <span className="font-mono text-[8px] tracking-[0.3em] text-zinc-400">OR</span>
            <svg className="h-px min-w-0 flex-1" preserveAspectRatio="none" viewBox="0 0 100 1">
              <line
                x1="0"
                y1="0.5"
                x2="100"
                y2="0.5"
                stroke="rgba(167,139,250,0.4)"
                strokeWidth="1"
                strokeDasharray="4 6"
                vectorEffect="non-scaling-stroke"
                className="net-flow"
              />
            </svg>
          </div>

          {/* RESTORE chamber — rose-tinged walls, the dangerous wing */}
          <section
            aria-label="Restore backup"
            className="rounded-sm border border-rose-500/25 bg-rose-500/[0.04] p-4"
          >
            <div className="flex items-center gap-2">
              <FileUp className="h-3.5 w-3.5 text-rose-300/80" aria-hidden />
              <p className="sys-label text-zinc-400">RESTORE FROM VAULT</p>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-zinc-400">
              Load a vault file to <span className="text-rose-300">replace your current profile entirely</span>. This cannot be undone — export first.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              aria-label="Vault backup JSON file"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
              }}
            />
            <motion.button
              onClick={() => fileRef.current?.click()}
              disabled={parsing}
              whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-violet-500/40 bg-violet-500/5 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-300 uppercase transition-all hover:bg-violet-500/15 active:bg-violet-500/25 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
            >
              <Upload className="h-4 w-4" aria-hidden />
              {parsing ? "READING…" : "CHOOSE VAULT FILE"}
            </motion.button>

            {parsing && (
              <div className="vault-scan relative mt-3 overflow-hidden rounded-sm border border-dashed border-violet-500/30 bg-violet-500/5 p-3.5" aria-hidden>
                <p className="sys-label text-violet-300/70">READING VAULT…</p>
                <div className="mt-2.5 space-y-2">
                  <div className="skel-bar h-2 w-2/5" />
                  <div className="skel-bar h-2 w-3/5" style={{ animationDelay: "0.12s" }} />
                  <div className="skel-bar h-2 w-1/2" style={{ animationDelay: "0.24s" }} />
                </div>
              </div>
            )}

            {parseError && (
              <p role="alert" className="mt-3 flex items-center gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden /> {parseError}
              </p>
            )}

            {parsed && !imported && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-3 rounded-sm border border-violet-500/25 bg-violet-500/5 p-3.5"
              >
                <p className="sys-label text-violet-300/80">VAULT CONTENTS</p>
                <div className="mt-2 space-y-1.5 font-mono text-[11px] tabular-nums text-zinc-300">
                  <p className="flex items-center justify-between gap-2">
                    <span className="text-zinc-400">FORMAT</span>
                    <span className="font-bold text-violet-200">VAULT V{parsed.file.version}</span>
                  </p>
                  <p>
                    PROFILE <span className="font-bold text-violet-200">{parsed.summary.name}</span> · LV.{parsed.summary.level}
                  </p>
                  <p>
                    {parsed.summary.sessions} SESSIONS · {parsed.summary.logs} EXERCISE LOGS
                  </p>
                  <p>
                    {parsed.summary.quests} GOALS · {parsed.summary.records} RECORDS · ◈ {parsed.summary.essence.toLocaleString()} CREDITS
                  </p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-zinc-400">
                    <span>
                      <span className="font-bold text-teal-300">{parsed.summary.meals}</span> MEALS
                    </span>
                    <span>
                      <span className="font-bold text-sky-300">{parsed.summary.waterEntries}</span> WATER LOGS
                    </span>
                    <span>
                      <span className="font-bold text-amber-300">{parsed.summary.bodyMetrics}</span> BODY METRICS
                    </span>
                  </p>
                  {parsed.summary.bodyProfile ? (
                    <p className="text-[10px] tracking-wider text-amber-300/80">✓ BODY PROFILE INCLUDED — CALORIE TARGETS RESTORE WITH THE VAULT</p>
                  ) : (
                    <p className="text-[10px] tracking-wider text-zinc-400">NO BODY PROFILE IN FILE — TARGETS RECALIBRATE AFTER RESTORE</p>
                  )}
                  {parsed.file.exportedAt && (
                    <p className="flex items-center gap-1.5 pt-1 text-zinc-400">
                      <span
                        className="inline-block h-1.5 w-1.5 rotate-45 border border-amber-400/70 bg-amber-500/25 shadow-[0_0_5px_rgba(245,158,11,0.5)]"
                        aria-hidden
                      />
                      <span className="text-amber-300/70">
                        SEALED {new Date(parsed.file.exportedAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toUpperCase()}
                      </span>
                    </p>
                  )}
                </div>

                {!armed ? (
                  <motion.button
                    onClick={() => setArmed(true)}
                    whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-rose-500/50 bg-rose-500/10 font-mono text-[10px] font-bold tracking-[0.25em] text-rose-300 uppercase transition-all hover:border-rose-400/70 hover:bg-rose-500/25 focus-visible:outline focus-visible:outline-violet-400/70"
                  >
                    <ShieldAlert className="h-4 w-4" aria-hidden /> ARM RESTORE
                  </motion.button>
                ) : (
                  <div className="mt-3 space-y-2">
                    <p role="alert" className="flex items-center gap-2 rounded-sm border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[11px] leading-snug text-rose-300">
                      <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      This will DELETE your current profile and restore the vault. Final confirmation required.
                    </p>
                    <motion.button
                      onClick={doImport}
                      disabled={importing}
                      aria-busy={importing}
                      // gentler press on the destructive commit — the tap must read deliberate
                      whileTap={{ scale: 0.985, transition: { duration: 0.1 } }}
                      className={cn(
                        "flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-rose-400/60 bg-rose-500/25 font-mono text-[10px] font-bold tracking-[0.25em] text-rose-100 uppercase",
                        "transition-all hover:bg-rose-500/40 active:bg-rose-500/50 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70",
                        !importing && "vault-arm"
                      )}
                    >
                      <Upload className="h-4 w-4" aria-hidden />
                      {importing ? "RESTORING…" : "OVERWRITE & RESTORE"}
                    </motion.button>
                    <motion.button
                      onClick={() => setArmed(false)}
                      whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
                      className="w-full rounded-sm py-2 font-mono text-[9px] tracking-[0.25em] text-zinc-400 uppercase transition-colors hover:text-zinc-300 focus-visible:outline focus-visible:outline-violet-400/70"
                    >
                      Stand down
                    </motion.button>
                  </div>
                )}
              </motion.div>
            )}

            {imported && (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="mt-3 flex items-start gap-2.5 rounded-sm border border-amber-500/40 bg-amber-500/10 p-3.5"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" pathLength="100" className="vault-check-circle" />
                  <path d="m8.5 12.5 2.5 2.5 5-6" pathLength="100" className="vault-check-mark" />
                </svg>
                <div className="font-mono text-[11px] tabular-nums text-amber-200">
                  <p className="font-bold tracking-widest">VAULT RESTORED</p>
                  <p className="mt-1 text-zinc-400">
                    {imported.name} · LV.{imported.level} · {imported.sessions} sessions · {imported.logs} logs
                  </p>
                  {(imported.meals || imported.waterEntries || imported.bodyMetrics) && (
                    <p className="mt-0.5 text-zinc-400">
                      Fuel history: {imported.meals ?? 0} meals · {imported.waterEntries ?? 0} water logs · {imported.bodyMetrics ?? 0} body metrics
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
