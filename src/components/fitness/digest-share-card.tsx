"use client"

import { useCallback, useRef, useState } from "react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"
import { Download, LoaderCircle, Share2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FLOW_EASE } from "@/components/system/motion"
import { ARCHETYPES, formatDayLabel } from "@/lib/game"
import { titleByCode } from "@/lib/titles"
import { useSystem } from "@/store/system-store"
import type { HunterDTO } from "@/lib/types"
import type { MonthlySummaryRes } from "./status-tab"

// ─── Canvas geometry (logical px; rendered at 2× for crispness — share-card convention)

const W = 720
const H = 1096
const M = 48 // content margin

const C = {
  bg: "#060607",
  line: "rgba(255,255,255,0.10)",
  violet: "#e4e4e7",
  violetSoft: "#fafafa",
  fuchsia: "#fbbf24",
  amber: "#fbbf24",
  teal: "#2dd4bf",
  zinc: "#a1a1aa",
  zincMid: "#a1a1aa",
  zincLow: "#3f3f46",
  ink: "#f4f4f5",
  emerald: "#fbbf24",
  rose: "#fb7185",
}

// ─── R5-c: staged build timeline (ms) ─────────────────────────────────────────
// The digest card "comes alive" while it renders: base → header → identity
// (rank diamond scales in) → window line → the six stat tiles stagger in with
// count-up numerals → delta strip → best-day callout → readiness → footer.
// t = Infinity (the default) draws the settled final card — byte-identical to
// the classic static render, which is what the PNG export always captures.
const TL = {
  header: 90,
  identity: 220,
  identityDur: 340,
  window: 480,
  tileStart: 560,
  tileStep: 80,
  tileDur: 620,
  delta: 1160,
  bestDay: 1280,
  readiness: 1360,
  footer: 1420,
  fadeDur: 260,
  total: 1760,
} as const

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const easeOutCubic = (p: number) => 1 - Math.pow(1 - p, 3)

/** Alpha for a section fading in at `start` (1 once settled / at Infinity). */
function fadeAt(t: number, start: number, dur: number): number {
  return t === Infinity ? 1 : clamp01((t - start) / dur)
}

function setFont(ctx: CanvasRenderingContext2D, size: number, weight = 700, tracking = 0) {
  ctx.font = `${weight} ${size}px ui-monospace, SFMono-Regular, Menlo, monospace`
  try {
    ;(ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${tracking}px`
  } catch {
    // unsupported — plain text is fine
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  str: string,
  x: number,
  y: number,
  opts: { color?: string; size?: number; weight?: number; tracking?: number; align?: CanvasTextAlign } = {}
) {
  setFont(ctx, opts.size ?? 12, opts.weight ?? 700, opts.tracking ?? 0)
  ctx.fillStyle = opts.color ?? C.ink
  ctx.textAlign = opts.align ?? "left"
  ctx.textBaseline = "alphabetic"
  ctx.fillText(str, x, y)
}

function bracket(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number) {
  ctx.strokeStyle = C.violet
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(x + dx, y)
  ctx.lineTo(x, y)
  ctx.lineTo(x, y + dy)
  ctx.stroke()
}

function cornerBrackets(ctx: CanvasRenderingContext2D) {
  const inset = 26
  const arm = 26
  bracket(ctx, inset, inset, arm, 0)
  bracket(ctx, W - inset, inset, -arm, 0)
  bracket(ctx, inset, H - inset, 0, -arm)
  bracket(ctx, W - inset, H - inset, 0, -arm)
}

function scanlines(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = "rgba(167,139,250,0.022)"
  ctx.lineWidth = 1
  for (let y = 0; y < H; y += 5) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(W, y + 0.5)
    ctx.stroke()
  }
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, letter: string, scale = 1) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(scale, scale)
  ctx.rotate(Math.PI / 4)
  const grad = ctx.createLinearGradient(-r, -r, r, r)
  grad.addColorStop(0, "rgba(139,92,246,0.35)")
  grad.addColorStop(1, "rgba(232,121,249,0.18)")
  ctx.shadowColor = "rgba(139,92,246,0.55)"
  ctx.shadowBlur = 22
  ctx.fillStyle = grad
  ctx.fillRect(-r, -r, r * 2, r * 2)
  ctx.shadowBlur = 0
  ctx.strokeStyle = C.violet
  ctx.lineWidth = 2
  ctx.strokeRect(-r, -r, r * 2, r * 2)
  ctx.restore()
  // the rank letter stays upright — scaled with the frame when materializing
  if (scale === 1) {
    text(ctx, letter, cx, cy + 11, { size: 26, weight: 900, color: C.ink, align: "center" })
  } else {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.scale(scale, scale)
    text(ctx, letter, 0, 11, { size: 26, weight: 900, color: C.ink, align: "center" })
    ctx.restore()
  }
}

/** Hunter name at the largest size that fits the identity column (never clipped). */
function fitName(ctx: CanvasRenderingContext2D, name: string, maxWidth: number): number {
  let size = 27
  while (size > 15) {
    setFont(ctx, size, 900, 3)
    if (ctx.measureText(name).width <= maxWidth) break
    size -= 1
  }
  return size
}

/** One colored ▲/▼/±0 segment of the delta strip. */
type DeltaSeg = { text: string; color: string }

function deltaSegment(value: number, unit: string): DeltaSeg {
  if (value > 0) return { text: `▲ +${value.toLocaleString()} ${unit}`, color: C.emerald }
  if (value < 0) return { text: `▼ ${value.toLocaleString()} ${unit}`, color: C.rose }
  return { text: `±0 ${unit}`, color: C.zinc }
}

function volumeSegment(kg: number): DeltaSeg {
  const v = Math.abs(kg) >= 1000 ? `${(Math.abs(kg) / 1000).toFixed(1)}T` : `${Math.abs(kg)}KG`
  if (kg > 0) return { text: `▲ +${v} VOLUME`, color: C.emerald }
  if (kg < 0) return { text: `▼ ${v} VOLUME`, color: C.rose }
  return { text: `±0 VOLUME`, color: C.zinc }
}

// stat-tile formatters — feed a (possibly mid-count-up) raw number, get the
// same final formatting as the classic static render
const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtMinutes = (n: number) => {
  const m = Math.round(n)
  return `${Math.floor(m / 60)}H ${m % 60}M`
}

function drawDigest(ctx: CanvasRenderingContext2D, hunter: HunterDTO, summary: MonthlySummaryRes, t: number = Infinity) {
  ctx.clearRect(0, 0, W, H)

  // base + ambience — drawn from the first frame
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.82, 120, 20, W * 0.82, 120, 420)
  glow.addColorStop(0, "rgba(139,92,246,0.14)")
  glow.addColorStop(1, "rgba(139,92,246,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const glow2 = ctx.createRadialGradient(90, H - 160, 20, 90, H - 160, 380)
  glow2.addColorStop(0, "rgba(232,121,249,0.08)")
  glow2.addColorStop(1, "rgba(232,121,249,0)")
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.74)
  vig.addColorStop(0, "rgba(0,0,0,0)")
  vig.addColorStop(1, "rgba(0,0,0,0.45)")
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)
  scanlines(ctx)
  cornerBrackets(ctx)

  const arch = ARCHETYPES.find((a) => a.id === hunter.archetype)
  const title = hunter.equippedTitle ? titleByCode(hunter.equippedTitle) : null

  // ── header ────────────────────────────────────────────────────────────────
  const headerA = fadeAt(t, TL.header, TL.fadeDur)
  if (headerA > 0) {
    ctx.globalAlpha = headerA
    text(ctx, "PRIME", M, 82, { size: 30, weight: 900, tracking: 9, color: C.ink })
    text(ctx, "TRAINING DIGEST", M, 104, { size: 10, weight: 700, tracking: 6, color: C.zinc })
    text(ctx, "30-DAY WINDOW", W - M, 82, { size: 10, weight: 700, tracking: 4, color: C.violet, align: "right" })
    text(ctx, "SYSTEM SNAPSHOT", W - M, 104, { size: 10, weight: 700, tracking: 3, color: C.zinc, align: "right" })

    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(M, 128)
    ctx.lineTo(W - M, 128)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── identity — rank diamond materializes, name + LV settle with it ────────
  const idA = fadeAt(t, TL.identity, TL.fadeDur)
  if (idA > 0) {
    ctx.globalAlpha = idA
    const diamondScale =
      t === Infinity ? 1 : 0.85 + 0.15 * easeOutCubic(clamp01((t - TL.identity) / TL.identityDur))
    diamond(ctx, 106, 196, 40, hunter.rank, diamondScale)

    const nameStr = hunter.name.toUpperCase()
    const nameSize = fitName(ctx, nameStr, 400)
    text(ctx, nameStr, 168, 178, { size: nameSize, weight: 900, tracking: 3, color: C.ink })
    if (title) {
      setFont(ctx, 10, 700, 2)
      const tw = ctx.measureText(title.title.toUpperCase()).width
      ctx.strokeStyle = "rgba(232,121,249,0.45)"
      ctx.lineWidth = 1
      ctx.strokeRect(167.5, 190.5, Math.min(340, tw + 24), 21)
      ctx.fillStyle = "rgba(232,121,249,0.08)"
      ctx.fillRect(168, 191, Math.min(339, tw + 23), 20)
      text(ctx, title.title.toUpperCase(), 179, 205, { size: 10, weight: 700, tracking: 2, color: C.fuchsia })
    }
    text(ctx, arch ? `${arch.name.toUpperCase()} · ${arch.title.toUpperCase()}` : hunter.archetype.toUpperCase(), 168, 236, {
      size: 11,
      weight: 700,
      tracking: 3,
      color: C.zincMid,
    })

    text(ctx, "LEVEL", W - M, 168, { size: 10, weight: 700, tracking: 4, color: C.zinc, align: "right" })
    text(ctx, String(hunter.level), W - M, 208, { size: 36, weight: 900, color: C.violetSoft, align: "right" })

    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(M, 268)
    ctx.lineTo(W - M, 268)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ── window line ───────────────────────────────────────────────────────────
  const windowA = fadeAt(t, TL.window, TL.fadeDur)
  if (windowA > 0) {
    ctx.globalAlpha = windowA
    const windowLabel = `LAST 30 DAYS · ${formatDayLabel(summary.window.from).toUpperCase()} → ${formatDayLabel(summary.window.to).toUpperCase()}`
    text(ctx, windowLabel, M, 302, { size: 10, weight: 700, tracking: 5, color: C.violet })
    ctx.globalAlpha = 1
  }

  // ── stat grid — 2×3, big tabular numerals counting up as tiles appear ──────
  const tiles: { label: string; num: number; fmt: (n: number) => string; color: string }[] = [
    { label: "XP EARNED", num: summary.xp, fmt: fmtInt, color: C.violetSoft },
    { label: "SESSIONS", num: summary.sessions, fmt: (n) => String(Math.round(n)), color: C.fuchsia },
    { label: "VOLUME LIFTED", num: summary.volumeKg, fmt: (n) => `${(n / 1000).toFixed(1)}T`, color: C.amber },
    { label: "TIME TRAINED", num: summary.minutes, fmt: fmtMinutes, color: C.emerald },
    { label: "PRS SET", num: summary.prsSet, fmt: (n) => String(Math.round(n)), color: C.rose },
    { label: "ACTIVE DAYS", num: summary.activeDays, fmt: (n) => `${Math.round(n)}/30`, color: C.teal },
  ]

  const tileH = 110
  const tileGap = 20
  const boxW = (W - M * 2 - tileGap) / 2
  tiles.forEach((tile, i) => {
    const start = TL.tileStart + i * TL.tileStep
    const a = fadeAt(t, start, 220)
    if (a <= 0) return
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = M + col * (boxW + tileGap)
    const y = 318 + row * (tileH + tileGap)
    ctx.globalAlpha = a
    ctx.fillStyle = "rgba(255,255,255,0.015)"
    ctx.fillRect(x, y, boxW, tileH)
    ctx.strokeStyle = "rgba(139,92,246,0.2)"
    ctx.lineWidth = 1
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, tileH - 1)
    const f = t === Infinity ? 1 : easeOutCubic(clamp01((t - start) / TL.tileDur))
    text(ctx, tile.fmt(tile.num * f), x + boxW / 2, y + 76, { size: 30, weight: 900, color: tile.color, align: "center" })
    text(ctx, tile.label, x + boxW / 2, y + 96, { size: 9, weight: 700, tracking: 3, color: C.zinc, align: "center" })
    ctx.globalAlpha = 1
  })

  // ── delta strip — cycle vs prior cycle (layout measured up front) ─────────
  const d = summary.deltas
  const segs: DeltaSeg[] = [
    deltaSegment(d.xp, "XP"),
    deltaSegment(d.sessions, d.sessions === 1 ? "SESSION" : "SESSIONS"),
    volumeSegment(d.volumeKg),
    deltaSegment(d.minutes, "MIN"),
    deltaSegment(d.prsSet, d.prsSet === 1 ? "PR" : "PRS"),
  ]
  const SEP = " · "
  setFont(ctx, 10, 700, 2)
  const sepW = ctx.measureText(SEP).width
  const segW = segs.map((s) => {
    setFont(ctx, 10, 700, 2)
    return ctx.measureText(s.text).width
  })
  const maxW = W - M * 2
  const lines: { segs: DeltaSeg[]; width: number }[] = [{ segs: [], width: 0 }]
  segs.forEach((s, i) => {
    const cur = lines[lines.length - 1]
    const add = (cur.segs.length > 0 ? sepW : 0) + segW[i]
    if (cur.width + add > maxW && cur.segs.length > 0) {
      lines.push({ segs: [s], width: segW[i] })
    } else {
      cur.segs.push(s)
      cur.width += add
    }
  })

  const deltaA = fadeAt(t, TL.delta, TL.fadeDur)
  if (deltaA > 0) {
    ctx.globalAlpha = deltaA
    text(ctx, "VS PRIOR 30 DAYS", W / 2, 722, { size: 9, weight: 700, tracking: 4, color: C.zinc, align: "center" })
    let stripY = 748
    for (const line of lines) {
      let cx = W / 2 - line.width / 2
      for (let i = 0; i < line.segs.length; i++) {
        const s = line.segs[i]
        text(ctx, s.text, cx, stripY, { size: 10, weight: 700, tracking: 2, color: s.color })
        cx += segW[i]
        if (i < line.segs.length - 1) {
          text(ctx, SEP, cx, stripY, { size: 10, weight: 700, tracking: 2, color: C.zincLow })
          cx += sepW
        }
      }
      stripY += 24
    }
    ctx.globalAlpha = 1
  }

  // ── best day callout (honest — omitted when no XP this window) ────────────
  let calloutY = 748 + lines.length * 24 + 26
  if (summary.bestDay) {
    const bdA = fadeAt(t, TL.bestDay, TL.fadeDur)
    if (bdA > 0) {
      ctx.globalAlpha = bdA
      const label = `◆ BEST DAY · ${formatDayLabel(summary.bestDay.day).toUpperCase()} · +${summary.bestDay.xp.toLocaleString()} XP`
      setFont(ctx, 11, 900, 3)
      const tw = ctx.measureText(label).width
      const bw = Math.min(maxW, tw + 56)
      const bx = (W - bw) / 2
      ctx.fillStyle = "rgba(251,191,36,0.07)"
      ctx.fillRect(bx, calloutY, bw, 46)
      ctx.strokeStyle = "rgba(251,191,36,0.45)"
      ctx.lineWidth = 1
      ctx.strokeRect(bx + 0.5, calloutY + 0.5, bw - 1, 45)
      text(ctx, label, W / 2, calloutY + 29, { size: 11, weight: 900, tracking: 3, color: C.amber, align: "center" })
      ctx.globalAlpha = 1
    }
    calloutY += 46 + 34
  }

  // ── readiness line (honest — omitted when no vitals average) ─────────────
  if (summary.avgReadiness !== null && Number.isFinite(summary.avgReadiness)) {
    const rA = fadeAt(t, TL.readiness, TL.fadeDur)
    if (rA > 0) {
      ctx.globalAlpha = rA
      text(ctx, `READINESS ${summary.avgReadiness.toFixed(1)} / 100 AVG`, W / 2, calloutY + 10, {
        size: 11,
        weight: 700,
        tracking: 4,
        color: C.teal,
        align: "center",
      })
      ctx.globalAlpha = 1
    }
  }

  // ── footer ────────────────────────────────────────────────────────────────
  const footerA = fadeAt(t, TL.footer, TL.fadeDur)
  if (footerA > 0) {
    ctx.globalAlpha = footerA
    ctx.strokeStyle = C.line
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(M, H - 84)
    ctx.lineTo(W - M, H - 84)
    ctx.stroke()
    text(ctx, "ASCENDANT PROTOCOL · PRIME SYSTEM", W / 2, H - 58, {
      size: 10,
      weight: 900,
      tracking: 4,
      color: C.violetSoft,
      align: "center",
    })
    text(ctx, `GENERATED ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toUpperCase()}`, W / 2, H - 34, {
      size: 8,
      weight: 700,
      tracking: 2,
      color: C.zinc,
      align: "center",
    })
    ctx.globalAlpha = 1
  }
}

// ─── R5-c dialog-open cascade helpers (same beat as the app-wide kit) ─────────

function cascadeStep(reduce: boolean, i: number): HTMLMotionProps<"div"> {
  if (reduce) return { initial: false }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + i * 0.06 },
  }
}

function buttonCascade(reduce: boolean, i: number): HTMLMotionProps<"button"> {
  if (reduce) return { initial: false }
  return {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: FLOW_EASE, delay: 0.05 + i * 0.06 },
  }
}

/** Dialog with the canvas-rendered 30-day digest card + PNG export. */
function DigestShareDialog({
  hunter,
  summary,
  open,
  onOpenChange,
}: {
  hunter: HunterDTO
  summary: MonthlySummaryRes
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rafRef = useRef(0)
  const reduce = useReducedMotion() ?? false
  const [exporting, setExporting] = useState(false)
  const pushNotice = useSystem((s) => s.pushNotice)

  // Callback ref: fires exactly when the canvas mounts inside the (portaled)
  // dialog content — immune to portal mount timing. Re-draws on data change.
  // R5-c: the build is staged — the card comes alive section by section, then
  // settles to the exact final frame. Reduced motion → instant full render.
  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      cancelAnimationFrame(rafRef.current)
      canvasRef.current = el
      if (!el) return
      const dpr = 2
      el.width = W * dpr
      el.height = H * dpr
      const ctx = el.getContext("2d")
      if (!ctx) return
      ctx.scale(dpr, dpr)
      if (reduce) {
        drawDigest(ctx, hunter, summary)
        return
      }
      const t0 = performance.now()
      const frame = (now: number) => {
        const t = now - t0
        drawDigest(ctx, hunter, summary, t)
        if (t < TL.total) rafRef.current = requestAnimationFrame(frame)
        else drawDigest(ctx, hunter, summary) // settle to the exact final frame
      }
      rafRef.current = requestAnimationFrame(frame)
    },
    [hunter, summary, reduce]
  )

  // Export: first settle the canvas to its exact final frame (never export a
  // mid-animation frame), then blob → download, with a RENDERING state on the
  // button while the PNG encodes. Reduced motion → render + export instantly.
  const download = useCallback(() => {
    const canvas = canvasRef.current
    console.log("[DBG-R5C] download invoked", { hasCanvas: !!canvas, exporting })
    if (!canvas || exporting) return
    setExporting(true)
    cancelAnimationFrame(rafRef.current)
    const ctx = canvas.getContext("2d")
    if (ctx) drawDigest(ctx, hunter, summary)
    canvas.toBlob((blob) => {
      setExporting(false)
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `prime-digest-${hunter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${summary.window.from}-${summary.window.to}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      pushNotice({ kind: "info", title: "Digest card exported", body: `${a.download} saved.` })
    }, "image/png")
  }, [hunter, summary, pushNotice, exporting])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        aria-label={`30-day digest share card — ${hunter.name}`}
        className="sys-panel max-w-md rounded-sm border-amber-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl"
      >
        {/* R5-c — open cascade: header → card (which builds itself) → actions */}
        <motion.div {...cascadeStep(reduce, 0)}>
          <DialogHeader className="border-b border-amber-500/10 px-5 py-4">
            <DialogTitle className="sys-label text-amber-300/80">30-Day Digest · {hunter.name.toUpperCase()}</DialogTitle>
            <p className="font-mono text-[9px] tabular-nums tracking-widest text-zinc-400">
              {formatDayLabel(summary.window.from).toUpperCase()} → {formatDayLabel(summary.window.to).toUpperCase()}
            </p>
          </DialogHeader>
        </motion.div>
        <div className="p-5">
          <motion.div
            {...cascadeStep(reduce, 1)}
            className="group relative overflow-hidden rounded-sm border border-amber-500/20"
          >
            <canvas
              ref={setCanvas}
              className="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.02]"
              role="img"
              aria-label="30-day training digest card preview"
            />
            {/* blueprint grid — fades in on hover */}
            <div
              className="card-grid pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
              aria-hidden
            />
            {/* subtle inner shadow frame */}
            <div
              className="pointer-events-none absolute inset-0 shadow-[inset_0_0_28px_rgba(0,0,0,0.65)]"
              aria-hidden
            />
          </motion.div>
          <motion.button
            {...buttonCascade(reduce, 2)}
            onClick={download}
            disabled={exporting}
            whileTap={reduce ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
            className="relative mt-4 flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-sm border border-amber-400/50 bg-amber-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-amber-200 uppercase transition-all hover:bg-amber-500/30 hover:shadow-[0_0_22px_rgba(245,158,11,0.4)] active:bg-amber-500/45 focus-visible:outline focus-visible:outline-violet-400/70 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> Rendering digest…
                {/* progress sweep across the button while the PNG encodes */}
                <motion.span
                  initial={reduce ? false : { x: "-160%" }}
                  animate={{ x: "320%" }}
                  transition={reduce ? { duration: 0 } : { duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-amber-200/25 to-transparent"
                  aria-hidden
                />
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden /> Export PNG
              </>
            )}
          </motion.button>
          <motion.button
            {...buttonCascade(reduce, 3)}
            onClick={() => onOpenChange(false)}
            whileTap={reduce ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
            className="mt-2 flex h-11 w-full items-center justify-center rounded-sm border border-zinc-700/60 bg-zinc-900/40 font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-400 uppercase transition-all hover:border-zinc-500 hover:text-zinc-200 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            Close
          </motion.button>
          <p className="mt-3 text-center font-mono text-[9px] tracking-widest text-zinc-400">
            1440 × 2192 · READY FOR ANY FEED
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Compact amber SHARE DIGEST action rendered inside the STATUS tab's MonthlyDigest panel. */
export function DigestShareButton({ hunter, summary }: { hunter: HunterDTO; summary: MonthlySummaryRes }) {
  const [open, setOpen] = useState(false)
  const reduce = useReducedMotion() ?? false
  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Share the 30-day training digest"
        whileTap={reduce ? undefined : { scale: 0.98, transition: { duration: 0.1 } }}
        className="flex h-11 items-center justify-center gap-2 rounded-sm border border-amber-400/50 bg-amber-500/10 px-4 font-mono text-[10px] font-bold tracking-[0.25em] text-amber-200 uppercase transition-all hover:border-amber-400/70 hover:bg-amber-500/20 hover:shadow-[0_0_18px_rgba(245,158,11,0.3)] active:bg-amber-500/30 focus-visible:outline focus-visible:outline-violet-400/70"
      >
        <Share2 className="h-4 w-4" aria-hidden /> Share Digest
      </motion.button>
      <DigestShareDialog hunter={hunter} summary={summary} open={open} onOpenChange={setOpen} />
    </>
  )
}
