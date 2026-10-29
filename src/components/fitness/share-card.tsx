"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Download, FileImage } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ARCHETYPES, STAT_KEYS } from "@/lib/game"
import { riftOfTheDay } from "@/lib/rift"
import { titleByCode } from "@/lib/titles"
import { useSystem } from "@/store/system-store"
import type { HunterDTO } from "@/lib/types"

// ─── Canvas geometry (logical px; rendered at 2× for crispness) ───────────────

const W = 720
const H = 1096
const M = 48 // content margin

// R43 studio palette — the public artifact reads black / ivory / gold (teal
// reserved for the credits line, rose for the challenge crest). Key NAMES are
// legacy (violet/fuchsia/emerald) so the drawing code below stays untouched;
// every VALUE is the Mirage register.
const C = {
  bg: "#060607",
  panel: "#0c0c0e",
  line: "rgba(228,228,231,0.16)",
  violet: "#e4e4e7",
  violetSoft: "#f4f4f5",
  violetFaint: "rgba(228,228,231,0.35)",
  fuchsia: "#fbbf24",
  amber: "#fbbf24",
  teal: "#2dd4bf",
  zinc: "#a1a1aa",
  zincMid: "#a1a1aa",
  zincLow: "#3f3f46",
  ink: "#fafafa",
  emerald: "#e4e4e7",
  rose: "#fb7185",
}

// Stat bar hues mirror the shared STAT_DEFS identity: str rose · vit ivory ·
// endur gold · agi teal · flex dim zinc.
const STAT_META: Record<string, { label: string; color: string }> = {
  str: { label: "STR", color: "#fb7185" },
  vit: { label: "VIT", color: "#e4e4e7" },
  endur: { label: "END", color: "#fbbf24" },
  agi: { label: "AGI", color: "#2dd4bf" },
  flex: { label: "FLEX", color: "#a1a1aa" },
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
  ctx.strokeStyle = "rgba(240,240,240,0.02)"
  ctx.lineWidth = 1
  for (let y = 0; y < H; y += 5) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(W, y + 0.5)
    ctx.stroke()
  }
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pct: number, fill: string | CanvasGradient) {
  ctx.fillStyle = "#131316"
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = "rgba(228,228,231,0.18)"
  ctx.lineWidth = 1
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  const fw = Math.max(pct > 0 ? 3 : 0, Math.min(1, pct) * (w - 4))
  if (fw > 0) {
    ctx.fillStyle = fill
    ctx.fillRect(x + 2, y + 2, fw, h - 4)
  }
}

function diamond(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, letter: string) {
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(Math.PI / 4)
  // studio rank seal — white glass over a gold breath
  const grad = ctx.createLinearGradient(-r, -r, r, r)
  grad.addColorStop(0, "rgba(240,240,240,0.28)")
  grad.addColorStop(1, "rgba(251,191,36,0.16)")
  ctx.shadowColor = "rgba(240,240,240,0.4)"
  ctx.shadowBlur = 22
  ctx.fillStyle = grad
  ctx.fillRect(-r, -r, r * 2, r * 2)
  ctx.shadowBlur = 0
  ctx.strokeStyle = C.violet
  ctx.lineWidth = 2
  ctx.strokeRect(-r, -r, r * 2, r * 2)
  ctx.restore()
  text(ctx, letter, cx, cy + 11, { size: 26, weight: 900, color: C.ink, align: "center" })
}

/** Last-7-days activity data for the pulse section (from /api/chronicle). */
export type SharePulse = {
  daily: { day: string; xp: number; sessions: number }[]
  activeDays: number
}

/** Weekly boss crest data (from /api/boss) — drawn only when slain. */
export type ShareBossCrest = {
  name: string
  defeated: boolean
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  hunter: HunterDTO,
  pulse?: SharePulse | null,
  boss?: ShareBossCrest | null
) {
  ctx.clearRect(0, 0, W, H)

  // base + ambience — gold aura high-right (the CTA glow), white edge-light
  // low-left: the studio air baked into the static artifact
  ctx.fillStyle = C.bg
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W * 0.82, 120, 20, W * 0.82, 120, 420)
  glow.addColorStop(0, "rgba(251,191,36,0.12)")
  glow.addColorStop(1, "rgba(251,191,36,0)")
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
  const glow2 = ctx.createRadialGradient(90, H - 140, 20, 90, H - 140, 380)
  glow2.addColorStop(0, "rgba(240,240,240,0.05)")
  glow2.addColorStop(1, "rgba(240,240,240,0)")
  ctx.fillStyle = glow2
  ctx.fillRect(0, 0, W, H)
  // radial vignette — pulls the eye toward the center column
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
  text(ctx, "PRIME", M, 82, { size: 30, weight: 900, tracking: 9, color: C.ink })
  text(ctx, "ADAPTIVE TRAINING", M, 104, { size: 10, weight: 700, tracking: 6, color: C.zinc })
  text(ctx, "STATUS REPORT", W - M, 82, { size: 10, weight: 700, tracking: 4, color: C.violet, align: "right" })
  text(
    ctx,
    new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }).toUpperCase(),
    W - M,
    104,
    { size: 10, weight: 700, tracking: 2, color: C.zinc, align: "right" }
  )

  ctx.strokeStyle = C.line
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(M, 128)
  ctx.lineTo(W - M, 128)
  ctx.stroke()

  // ── identity ──────────────────────────────────────────────────────────────
  diamond(ctx, 106, 196, 40, hunter.rank)

  text(ctx, hunter.name.toUpperCase(), 168, 178, { size: 27, weight: 900, tracking: 3, color: C.ink })
  if (title) {
    const tw = ctx.measureText(title.title.toUpperCase()).width
    ctx.strokeStyle = "rgba(251,191,36,0.45)"
    ctx.lineWidth = 1
    ctx.strokeRect(167.5, 190.5, Math.min(340, tw + 24), 21)
    ctx.fillStyle = "rgba(251,191,36,0.08)"
    ctx.fillRect(168, 191, Math.min(339, tw + 23), 20)
    text(ctx, title.title.toUpperCase(), 179, 205, { size: 10, weight: 700, tracking: 2, color: C.fuchsia })
  }
  text(ctx, arch ? `${arch.name.toUpperCase()} · ${arch.title.toUpperCase()}` : hunter.archetype.toUpperCase(), 168, 236, {
    size: 11,
    weight: 700,
    tracking: 3,
    color: C.zincMid,
  })
  text(ctx, `ID ${hunter.id.slice(-6).toUpperCase()}`, 168, 256, { size: 10, weight: 700, tracking: 2, color: C.zinc })

  // ── level + xp ────────────────────────────────────────────────────────────
  ctx.strokeStyle = C.line
  ctx.beginPath()
  ctx.moveTo(M, 286)
  ctx.lineTo(W - M, 286)
  ctx.stroke()

  text(ctx, "LEVEL", M, 330, { size: 10, weight: 700, tracking: 4, color: C.zinc })
  text(ctx, String(hunter.level), M + 86, 336, { size: 42, weight: 900, color: C.violetSoft })
  text(ctx, `${hunter.xp.toLocaleString()} / ${hunter.xpNeeded.toLocaleString()} XP`, W - M, 330, {
    size: 12,
    weight: 700,
    tracking: 1,
    color: C.zincMid,
    align: "right",
  })

  const xpGrad = ctx.createLinearGradient(M, 0, W - M, 0)
  // ivory → gold — the aurora XP language, exported
  xpGrad.addColorStop(0, "#d4d4d8")
  xpGrad.addColorStop(1, "#fbbf24")
  bar(ctx, M, 348, W - M * 2, 12, hunter.xp / hunter.xpNeeded, xpGrad)

  text(
    ctx,
    hunter.nextRank ? `NEXT: ${hunter.nextRank}-RANK AT LV.${hunter.nextRankAt}` : "APEX REACHED",
    W - M,
    388,
    { size: 10, weight: 700, tracking: 3, color: C.zinc, align: "right" }
  )

  // ascension sigil — prestige cycles live beside the rank ladder hint
  if (hunter.ascension > 0) {
    const mult = `×${hunter.xpMultiplier.toFixed(2).replace(/0$/, "")}`
    const ascLabel = `◈ CYCLE ${hunter.ascension} · ${mult} ALL XP`
    text(ctx, ascLabel, M, 388, { size: 10, weight: 900, tracking: 3, color: C.fuchsia })
    // soft underline — the rebirth thread
    const aw = ctx.measureText(ascLabel).width + 4
    ctx.strokeStyle = "rgba(251,191,36,0.35)"
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(M, 394)
    ctx.lineTo(M + aw, 394)
    ctx.stroke()
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  text(ctx, "ATTRIBUTES", M, 424, { size: 10, weight: 700, tracking: 5, color: C.zinc })

  let sy = 444
  for (const key of STAT_KEYS) {
    const meta = STAT_META[key]
    const value = hunter.stats[key]
    text(ctx, meta.label, M, sy + 11, { size: 11, weight: 700, tracking: 2, color: C.zincMid })
    bar(ctx, M + 64, sy, 400, 9, value / 40, meta.color)
    text(ctx, String(value), W - M, sy + 11, { size: 12, weight: 900, color: C.ink, align: "right" })
    sy += 30
  }

  // ── vitals ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle = C.line
  ctx.beginPath()
  ctx.moveTo(M, sy + 12)
  ctx.lineTo(W - M, sy + 12)
  ctx.stroke()

  const vy = sy + 34
  const boxW = (W - M * 2 - 24) / 3
  const vitals: [string, string, string][] = [
    ["POWER SCORE", hunter.power.toLocaleString(), C.violetSoft],
    ["STREAK", `${hunter.streak}D · BEST ${hunter.bestStreak}D`, C.amber],
    ["SESSIONS LOGGED", String(hunter.totalSessions), C.fuchsia],
  ]
  vitals.forEach(([label, value, color], i) => {
    const x = M + i * (boxW + 12)
    ctx.fillStyle = "rgba(255,255,255,0.015)"
    ctx.fillRect(x, vy, boxW, 74)
    ctx.strokeStyle = "rgba(228,228,231,0.2)"
    ctx.strokeRect(x + 0.5, vy + 0.5, boxW - 1, 73)
    text(ctx, value, x + boxW / 2, vy + 36, { size: 19, weight: 900, color, align: "center" })
    text(ctx, label, x + boxW / 2, vy + 56, { size: 9, weight: 700, tracking: 3, color: C.zinc, align: "center" })
    // tiny diamond separator between vitals
    if (i > 0) {
      ctx.save()
      ctx.translate(x - 6, vy + 35)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = "rgba(228,228,231,0.45)"
      ctx.fillRect(-2.25, -2.25, 4.5, 4.5)
      ctx.restore()
    }
  })

  // ── activity pulse — v2 sparkline + day strip ─────────────────────────────
  let ay = vy + 96
  if (pulse && pulse.daily.length === 7) {
    const py = ay
    text(ctx, "ACTIVITY PULSE — LAST 7 DAYS", M, py, { size: 10, weight: 700, tracking: 5, color: C.zinc })

    const chartX = M
    const chartW = W - M * 2 - 150
    const chartY = py + 14
    const chartH = 58
    const totalXp = pulse.daily.reduce((a, d) => a + d.xp, 0)
    const maxXp = Math.max(...pulse.daily.map((d) => d.xp), 1)
    const bestIdx = pulse.daily.reduce((b, d, i) => (d.xp > pulse.daily[b].xp ? i : b), 0)

    // faint horizontal grid
    ctx.strokeStyle = "rgba(228,228,231,0.08)"
    ctx.lineWidth = 1
    for (const f of [0.25, 0.5, 0.75]) {
      ctx.beginPath()
      ctx.moveTo(chartX, chartY + chartH * f + 0.5)
      ctx.lineTo(chartX + chartW, chartY + chartH * f + 0.5)
      ctx.stroke()
    }

    const pts = pulse.daily.map((d, i) => ({
      x: chartX + (chartW * i) / 6,
      y: chartY + chartH - (d.xp / maxXp) * (chartH - 8),
      d,
    }))

    // gradient fill under the curve
    const fillGrad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH)
    fillGrad.addColorStop(0, "rgba(228,228,231,0.2)")
    fillGrad.addColorStop(1, "rgba(228,228,231,0)")
    ctx.beginPath()
    ctx.moveTo(pts[0].x, chartY + chartH)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(pts[6].x, chartY + chartH)
    ctx.closePath()
    ctx.fillStyle = fillGrad
    ctx.fill()

    // smooth glowing stroke — ivory passing into gold
    const strokeGrad = ctx.createLinearGradient(chartX, 0, chartX + chartW, 0)
    strokeGrad.addColorStop(0, "#e4e4e7")
    strokeGrad.addColorStop(1, "#fbbf24")
    ctx.beginPath()
    ctx.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]
      const cur = pts[i]
      const mx = (prev.x + cur.x) / 2
      ctx.quadraticCurveTo(prev.x, prev.y, mx, (prev.y + cur.y) / 2)
    }
    ctx.lineTo(pts[6].x, pts[6].y)
    ctx.strokeStyle = strokeGrad
    ctx.lineWidth = 2
    ctx.lineJoin = "round"
    ctx.lineCap = "round"
    ctx.shadowColor = "rgba(251,191,36,0.4)"
    ctx.shadowBlur = 9
    ctx.stroke()
    ctx.shadowBlur = 0

    // day dots — amber glow on the best day
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const isBest = i === bestIdx && p.d.xp > 0
      ctx.beginPath()
      ctx.arc(p.x, p.y, isBest ? 3.5 : 2.5, 0, Math.PI * 2)
      ctx.fillStyle = p.d.xp > 0 ? (isBest ? C.amber : C.violetSoft) : "#3f3f46"
      if (isBest) {
        ctx.shadowColor = "rgba(251,191,36,0.85)"
        ctx.shadowBlur = 10
      }
      ctx.fill()
      ctx.shadowBlur = 0
    }

    // right column — cycle totals
    text(ctx, `${totalXp.toLocaleString()} XP`, W - M, py + 32, { size: 17, weight: 900, color: C.violetSoft, align: "right" })
    text(ctx, `${pulse.activeDays}/7 ACTIVE DAYS`, W - M, py + 50, { size: 8, weight: 700, tracking: 2, color: C.zinc, align: "right" })
    text(ctx, `BEST ${pulse.daily[bestIdx].xp.toLocaleString()} XP`, W - M, py + 66, { size: 8, weight: 700, tracking: 2, color: C.amber, align: "right" })

    // 7-day strip — weekday tiles with XP
    const stripY = chartY + chartH + 14
    // micro-label anchor — tiny diamond + caption balancing the tiles below
    ctx.save()
    ctx.translate(M + 3.5, stripY - 7)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = "rgba(228,228,231,0.45)"
    ctx.fillRect(-1.75, -1.75, 3.5, 3.5)
    ctx.restore()
    text(ctx, "DAILY XP", M + 12, stripY - 4, { size: 7, weight: 700, tracking: 2, color: "#52525b" })
    const boxW = (W - M * 2 - 6 * 6) / 7
    for (let i = 0; i < pts.length; i++) {
      const d = pulse.daily[i]
      const x = M + i * (boxW + 6)
      const active = d.xp > 0
      const isToday = i === 6
      const isBest = i === bestIdx && active
      ctx.fillStyle = active ? (isBest ? "rgba(251,191,36,0.13)" : "rgba(228,228,231,0.12)") : "rgba(255,255,255,0.015)"
      ctx.fillRect(x, stripY, boxW, 32)
      ctx.strokeStyle = isBest
        ? "rgba(251,191,36,0.6)"
        : active
          ? isToday
            ? "rgba(240,240,240,0.55)"
            : "rgba(228,228,231,0.35)"
          : "rgba(63,63,70,0.5)"
      ctx.lineWidth = 1
      ctx.strokeRect(x + 0.5, stripY + 0.5, boxW - 1, 31)
      const wd = new Date(`${d.day}T12:00:00`).toLocaleDateString("en-US", { weekday: "narrow" }).toUpperCase()
      text(ctx, wd, x + boxW / 2, stripY + 13, { size: 8, weight: 700, color: active ? C.zincMid : "#52525b", align: "center" })
      text(ctx, d.xp > 0 ? String(d.xp) : "—", x + boxW / 2, stripY + 26, { size: 8, weight: 900, color: active ? (isBest ? C.amber : C.violetSoft) : "#52525b", align: "center" })
    }
    ay = stripY + 60
  }

  // ── aether reserve ─────────────────────────────────────────────────────────
  if (hunter.essence > 0) {
    text(ctx, `CREDITS · ${hunter.essence.toLocaleString()}`, W / 2, ay, {
      size: 11,
      weight: 700,
      tracking: 4,
      color: C.teal,
      align: "center",
    })
    ay += 18
  }

  text(ctx, `TOTAL XP ${hunter.totalXp.toLocaleString()} · VOLUME ${(hunter.totalVolumeKg / 1000).toFixed(1)}T`, W / 2, ay + 10, {
    size: 10,
    weight: 700,
    tracking: 3,
    color: C.zinc,
    align: "center",
  })

  // ── boss-slain crest (this week's kill — above the rift line) ───────────
  if (boss?.defeated) {
    const crestY = H - 114
    const crestLabel = `CHALLENGE COMPLETED THIS CYCLE · ${boss.name.toUpperCase()}`
    setFont(ctx, 10, 900, 3)
    const crestW = ctx.measureText(crestLabel).width
    text(ctx, crestLabel, W / 2, crestY, { size: 10, weight: 900, tracking: 3, color: C.rose, align: "center" })
    // crossed-slash glyphs flanking the crest — the hunter's mark
    for (const side of [-1, 1]) {
      const gx = W / 2 + side * (crestW / 2 + 20)
      ctx.strokeStyle = "rgba(251,113,133,0.75)"
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(gx - 5, crestY - 8)
      ctx.lineTo(gx + 5, crestY + 2)
      ctx.moveTo(gx + 5, crestY - 8)
      ctx.lineTo(gx - 5, crestY + 2)
      ctx.stroke()
    }
  }

  // ── rift-touched accent (today's rift — deterministic, data-free) ────────
  const rift = riftOfTheDay()
  const riftLabel = `TODAY'S BONUS · ${rift.gateName.toUpperCase()} · ×${rift.bonusMult} XP`
  const riftY = H - 92
  setFont(ctx, 10, 700, 3)
  const riftW = ctx.measureText(riftLabel).width
  text(ctx, riftLabel, W / 2, riftY, { size: 10, weight: 700, tracking: 3, color: C.amber, align: "center" })
  for (const side of [-1, 1]) {
    ctx.save()
    ctx.translate(W / 2 + side * (riftW / 2 + 18), riftY - 3.5)
    ctx.rotate(Math.PI / 4)
    ctx.fillStyle = "rgba(251,191,36,0.55)"
    ctx.fillRect(-2.25, -2.25, 4.5, 4.5)
    ctx.restore()
  }

  // ── footer ─────────────────────────────────────────────────────────────────
  ctx.strokeStyle = C.line
  ctx.beginPath()
  ctx.moveTo(M, H - 64)
  ctx.lineTo(W - M, H - 64)
  ctx.stroke()
  text(ctx, "PRIME TRAINING SYSTEM · ALL DATA STORED LOCALLY", M, H - 40, { size: 9, weight: 700, tracking: 3, color: C.zinc })
  text(ctx, "SYSTEM STATUS: ONLINE", W - M, H - 40, { size: 9, weight: 700, tracking: 3, color: C.emerald, align: "right" })
}

/** Dialog with the canvas-rendered hunter status card + PNG export. */
export function ShareCardDialog({ hunter, open, onOpenChange }: { hunter: HunterDTO; open: boolean; onOpenChange: (v: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pushNotice = useSystem((s) => s.pushNotice)
  const [pulse, setPulse] = useState<SharePulse | null>(null)
  const [bossCrest, setBossCrest] = useState<ShareBossCrest | null>(null)

  // Fetch the 7-day activity pulse + weekly boss state whenever the dialog opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch("/api/chronicle")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { daily?: SharePulse["daily"]; activeDays?: number } | null) => {
        if (!cancelled && d?.daily?.length) {
          setPulse({ daily: d.daily, activeDays: d.activeDays ?? 0 })
        }
      })
      .catch(() => {
        /* card renders fine without the pulse section */
      })
    fetch("/api/boss")
      .then((r) => (r.ok ? r.json() : null))
      .then((b: { name?: string; defeated?: boolean } | null) => {
        if (!cancelled && b?.name) {
          setBossCrest({ name: b.name, defeated: !!b.defeated })
        }
      })
      .catch(() => {
        /* crest is optional decoration */
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // Callback ref: fires exactly when the canvas mounts inside the (portaled)
  // dialog content — immune to portal mount timing. Re-draws if hunter/pulse/boss changes.
  const setCanvas = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el
      if (!el) return
      const dpr = 2
      el.width = W * dpr
      el.height = H * dpr
      const ctx = el.getContext("2d")
      if (!ctx) return
      ctx.scale(dpr, dpr)
      drawCard(ctx, hunter, pulse, bossCrest)
    },
    [hunter, pulse, bossCrest]
  )

  const download = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `prime-${hunter.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
      pushNotice({ kind: "info", title: "Status card exported", body: `${a.download} saved.` })
    }, "image/png")
  }, [hunter.name, pushNotice])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="sys-panel max-w-md rounded-sm border-violet-500/25 bg-zinc-950/90 p-0 backdrop-blur-xl">
        <DialogHeader className="border-b border-violet-500/10 px-5 py-4">
          <DialogTitle className="sys-label text-violet-300/80">Export Status Card</DialogTitle>
        </DialogHeader>
        <div className="p-5">
          <div className="group relative overflow-hidden rounded-sm border border-violet-500/20">
            <canvas
              ref={setCanvas}
              className="block h-auto w-full transition-transform duration-500 group-hover:scale-[1.02]"
              role="img"
              aria-label="Athlete status card preview"
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
          </div>
          <motion.button
            onClick={download}
            whileTap={{ scale: 0.97, transition: { duration: 0.1 } }}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-sm border border-violet-400/50 bg-violet-500/15 font-mono text-[10px] font-bold tracking-[0.25em] text-violet-200 uppercase transition-all hover:bg-violet-500/30 hover:shadow-[0_0_22px_rgba(228,228,231,0.4)] active:bg-violet-500/45 disabled:opacity-40 focus-visible:outline focus-visible:outline-violet-400/70"
          >
            <Download className="h-4 w-4" aria-hidden /> Download PNG
          </motion.button>
          <p className="mt-3 text-center font-mono text-[9px] tracking-widest text-zinc-400">
            1440 × 2192 · READY FOR ANY FEED
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Slim action bar placed under the HunterCard on the STATUS tab. */
export function ShareCardButton({ hunter }: { hunter: HunterDTO }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      {/* R52 declutter — the utilities merge into one slim row of quiet pills:
          icon + micro-cap label only; the caption lives on the title/aria
          (the dialog behind it is unchanged). */}
      <motion.button
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        whileTap={{ scale: 0.985, transition: { duration: 0.1 } }}
        className="grove-press group inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-4 text-[10px] font-bold tracking-[0.12em] text-zinc-300 transition-colors hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-violet-400/70"
        aria-label="Share status — render your athlete profile as a shareable PNG"
        title="Render your athlete profile as a shareable PNG"
      >
        <FileImage className="h-3.5 w-3.5 text-violet-300/80" aria-hidden />
        SHARE STATUS
      </motion.button>
      <ShareCardDialog hunter={hunter} open={open} onOpenChange={setOpen} />
    </>
  )
}
