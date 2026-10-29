'use client';

import { useMemo, useState } from 'react';
import {
  Scale, Trophy, Dumbbell, Flame, Beef, Target, TrendingUp, BarChart3,
  ChevronDown, CalendarRange, Droplets, Moon, Zap, HeartPulse, CheckCircle2, AlertTriangle, Share2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useFitnessStore, useDays, usePlan, useProfile } from '@/lib/fitness/store';
import {
  attributeRadar, dayScore, dayTotals, emptyDay, estimate1RM, lastNDays, levelInfo,
  prettyDate, streakInfo, todayStr, totalXP, xpFromDay,
} from '@/lib/fitness/calc';
import { LineChart, Heatmap, Radar, BarRow, SectionHeader, StatTile, Tag, MiniRing } from './shared';
import { WeekShareDialog } from './week-share';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

/* ================= local helpers: signed rates + OLS weight regression ================= */

/** +0.42 / −0.42 / ±0.00 — display sign with a true minus glyph. */
function fmtSigned(v: number, dp = 2): string {
  const s = Math.abs(v).toFixed(dp);
  return `${v < 0 ? '−' : v > 0 ? '+' : '±'}${s}`;
}

export interface WeightTrend {
  n: number;
  /** x = whole days since the first weigh-in, y = kg, label = MM-DD */
  pts: { x: number; y: number; label: string }[];
  slopePerDay: number;
  perWk: number;
  intercept: number;
  last: number;
  /** last value + slope × 28 days */
  proj4w: number;
}

/** Ordinary least-squares fit over dated weigh-ins (kg). Needs ≥2 points. */
function regressWeights(log: { date: string; kg: number }[]): WeightTrend | null {
  if (log.length < 2) return null;
  const t0 = Date.parse(log[0].date);
  const pts = log.map((w) => ({
    x: Math.round((Date.parse(w.date) - t0) / 86_400_000),
    y: w.kg,
    label: w.date.slice(5),
  }));
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) * (p.x - mx);
  }
  const slopePerDay = den > 0 ? num / den : 0;
  const intercept = my - slopePerDay * mx;
  const last = pts[n - 1].y;
  return { n, pts, slopePerDay, perWk: slopePerDay * 7, intercept, last, proj4w: last + slopePerDay * 28 };
}

/** Scatter of actual weigh-ins + dashed emerald least-squares line (~140 px tall). */
function WeightTrendChart({ pts, slope, intercept, height = 140 }: {
  pts: { x: number; y: number; label: string }[];
  slope: number;
  intercept: number;
  height?: number;
}) {
  const W = 600;
  const H = 150;
  const padL = 38;
  const padR = 14;
  const padT = 12;
  const padB = 20;
  const xMax = Math.max(...pts.map((p) => p.x), 1);
  const fitYs = [intercept, intercept + slope * xMax];
  const lo = Math.min(...pts.map((p) => p.y), ...fitYs);
  const hi = Math.max(...pts.map((p) => p.y), ...fitYs);
  const range = hi - lo || Math.max(1, hi * 0.05);
  const min = lo - range * 0.2;
  const max = hi + range * 0.2;
  const X = (x: number) => padL + (x / xMax) * (W - padL - padR);
  const Y = (y: number) => padT + (1 - (y - min) / (max - min)) * (H - padT - padB);
  const gridVals = [max, (max + min) / 2, min];
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Weigh-ins with least-squares regression trend line"
    >
      {gridVals.map((v, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke="#27272a" strokeWidth="1" />
          <text x={padL - 5} y={Y(v) + 3} textAnchor="end" fontSize="9" fill="#71717a" fontFamily="monospace">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={X(0)}
        y1={Y(intercept)}
        x2={X(xMax)}
        y2={Y(intercept + slope * xMax)}
        stroke="#34d399"
        strokeWidth="2"
        strokeDasharray="7 5"
        strokeLinecap="round"
      />
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r="3.5" fill="#0c0a09" stroke="#a3e635" strokeWidth="2">
          <title>{`${p.label} · ${p.y.toFixed(1)} kg`}</title>
        </circle>
      ))}
      <text x={padL} y={H - 6} fontSize="9" fill="#71717a" fontFamily="monospace">{pts[0]?.label}</text>
      <text x={W - padR} y={H - 6} textAnchor="end" fontSize="9" fill="#71717a" fontFamily="monospace">
        {pts[pts.length - 1]?.label}
      </text>
    </svg>
  );
}

/* ================= view ================= */

export function ProgressView() {
  const days = useDays();
  const plan = usePlan();
  const profile = useProfile();
  const setWeight = useFitnessStore((s) => s.setWeight);
  const [wIn, setWIn] = useState('');
  const [reportOpen, setReportOpen] = useState(true);
  const [shareOpen, setShareOpen] = useState(false);

  const weightDays = useMemo(() =>
    Object.keys(days)
      .filter((d) => days[d].weightKg)
      .sort()
      .map((d) => ({ date: d, kg: days[d].weightKg as number })),
  [days]);
  const weightPts = useMemo(() => weightDays.map((w) => ({ label: w.date.slice(5), value: w.kg })), [weightDays]);
  const weightReg = useMemo(() => regressWeights(weightDays), [weightDays]);

  /* ---- weekly report digest ---- */
  const digest = useMemo(() => {
    const week = lastNDays(todayStr(), 7);
    const scorePts: { label: string; value: number }[] = [];
    let workoutDays = 0;
    let strengthDays = 0;
    let sets = 0;
    let tonnage = 0;
    let cardioMin = 0;
    let proteinSum = 0;
    let kcalDays = 0;
    let kcalSum = 0;
    let adherent = 0;
    let waterDays = 0;
    let sleepSum = 0;
    let sleepDays = 0;
    let scoreSum = 0;
    let xp = 0;
    for (const d of week) {
      const day = days[d] ?? emptyDay();
      const t = dayTotals(day);
      if (day.exercises.length > 0) workoutDays++;
      if (day.exercises.some((e) => e.type === 'strength')) strengthDays++;
      sets += t.strengthSets;
      tonnage += t.volumeKg;
      cardioMin += t.cardioMin;
      if (t.kcal > 0) {
        kcalDays++;
        proteinSum += t.protein;
        kcalSum += t.kcal;
        if (Math.abs(t.kcal - plan.calories) <= 150) adherent++;
      }
      if (day.waterMl >= plan.waterMl * 0.95) waterDays++;
      if (day.sleepH > 0) {
        sleepDays++;
        sleepSum += day.sleepH;
      }
      const score = dayScore(day, plan);
      scoreSum += score;
      xp += xpFromDay(day, plan);
      scorePts.push({ label: d.slice(5), value: score });
    }
    return {
      week,
      workoutDays,
      strengthDays,
      sets,
      tonnage,
      cardioMin,
      kcalDays,
      avgProtein: kcalDays ? proteinSum / kcalDays : 0,
      avgKcal: kcalDays ? kcalSum / kcalDays : 0,
      adherent,
      waterDays,
      sleepDays,
      avgSleep: sleepDays ? sleepSum / sleepDays : 0,
      avgScore: scoreSum / week.length,
      xp,
      scorePts,
      logged: week.some((d) => days[d]),
    };
  }, [days, plan]);

  /* ---- one honest verdict sentence: largest normalized shortfall wins ---- */
  const verdict = useMemo(() => {
    if (!digest.logged) {
      return { onTrack: false, text: 'Nothing logged this week — a meal, a session or a weigh-in starts the report.' };
    }
    const gaps: { pct: number; text: string }[] = [];
    if (digest.strengthDays < 2) {
      gaps.push({ pct: (2 - digest.strengthDays) / 2, text: `Biggest gap: only ${digest.strengthDays} of 2 strength sessions (WHO 2020).` });
    }
    if (digest.cardioMin < 150) {
      gaps.push({ pct: (150 - digest.cardioMin) / 150, text: `Biggest gap: cardio at ${Math.round(digest.cardioMin)} min of 150 (WHO 2020).` });
    }
    const proteinFloor = plan.proteinG * 0.9;
    if (digest.avgProtein < proteinFloor) {
      gaps.push({ pct: (proteinFloor - digest.avgProtein) / proteinFloor, text: `Biggest gap: protein averaging ${Math.round(digest.avgProtein)}g vs ${Math.round(proteinFloor)}g target.` });
    }
    if (digest.waterDays < 4) {
      gaps.push({ pct: (4 - digest.waterDays) / 4, text: `Biggest gap: water goal hit on ${digest.waterDays} of 4 days.` });
    }
    if (gaps.length > 0) {
      gaps.sort((a, b) => b.pct - a.pct);
      return { onTrack: false, text: gaps[0].text };
    }
    const trendBit = weightReg ? `, trend ${fmtSigned(weightReg.perWk)} kg/wk` : '';
    return {
      onTrack: true,
      text: `On track — ${digest.workoutDays} workout${digest.workoutDays === 1 ? '' : 's'}, protein at ${Math.round((digest.avgProtein / plan.proteinG) * 100)}% of target${trendBit}.`,
    };
  }, [digest, plan, weightReg]);

  /* ---- weight trend direction vs goal ---- */
  const trendGood = weightReg
    ? profile.goal === 'lose'
      ? weightReg.perWk < 0
      : profile.goal === 'gain'
        ? weightReg.perWk > 0
        : Math.abs(weightReg.perWk) <= 0.15
    : false;
  const goalRateStr =
    profile.goal === 'lose'
      ? `vs goal rate −${profile.goalRateKg} kg/wk`
      : profile.goal === 'gain'
        ? `vs goal rate +${profile.goalRateKg} kg/wk`
        : 'target: hold weight steady';

  const kcal14 = useMemo(() =>
    lastNDays(todayStr(), 14).map((d) => ({ d, kcal: Math.round(dayTotals(days[d] ?? { foods: [], exercises: [], waterMl: 0, steps: 0, sleepH: 0, habits: {} }).kcal) })),
  [days]);
  const kcalMax = Math.max(plan.calories * 1.25, ...kcal14.map((k) => k.kcal), 1);

  const heat = useMemo(() =>
    lastNDays(todayStr(), 84).map((d) => ({ date: d, score: days[d] ? dayScore(days[d], plan) : -1 })),
  [days, plan]);

  const radar = useMemo(() => attributeRadar(days, plan), [days, plan]);
  const streak = streakInfo(days, plan);
  const xp = totalXP(days, plan);
  const lvl = levelInfo(xp);

  const prs = useMemo(() => {
    const best = new Map<string, { e1rm: number; date: string; reps: number; weight: number }>();
    for (const d of Object.keys(days).sort()) {
      for (const e of days[d].exercises) {
        if (e.type !== 'strength') continue;
        for (const s of e.sets) {
          if (!s.weight || !s.reps) continue;
          const v = estimate1RM(s.weight, s.reps);
          // R69-a — no honest e1RM outside the 1-12 integer-rep domain: the set
          // is skipped (never a fabricated number, never a 0 that could
          // masquerade as a max — an exercise whose every set is 13+ reps
          // honestly drops out of the PR list)
          if (v == null) continue;
          const cur = best.get(e.name);
          if (!cur || v > cur.e1rm) best.set(e.name, { e1rm: v, date: d, reps: s.reps, weight: s.weight });
        }
      }
    }
    return [...best.entries()].sort((a, b) => b[1].e1rm - a[1].e1rm).slice(0, 8);
  }, [days]);

  const totals = useMemo(() => {
    let workouts = 0;
    let tonnage = 0;
    let cardioMin = 0;
    const week = lastNDays(todayStr(), 7);
    let proteinSum = 0;
    let proteinDays = 0;
    for (const d of Object.values(days)) {
      const t = dayTotals(d);
      if (d.exercises.length > 0) workouts++;
      tonnage += t.volumeKg;
      cardioMin += t.cardioMin;
    }
    for (const d of week) {
      const t = dayTotals(days[d] ?? { foods: [], exercises: [], waterMl: 0, steps: 0, sleepH: 0, habits: {} });
      if (t.kcal > 0) {
        proteinSum += t.protein;
        proteinDays++;
      }
    }
    return { workouts, tonnage, cardioMin, avgProtein: proteinDays ? proteinSum / proteinDays : 0 };
  }, [days]);

  const volByMuscle = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of lastNDays(todayStr(), 7)) {
      for (const e of (days[d]?.exercises ?? [])) {
        if (e.type !== 'strength') continue;
        for (const mu of e.muscles) m[mu] = (m[mu] ?? 0) + e.sets.length;
      }
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [days]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-50">Progress</h1>
        <p className="mt-0.5 text-xs text-zinc-500">Trends, records &amp; consistency — derived entirely from your logs</p>
      </div>

      {/* ============ WEEKLY REPORT digest ============ */}
      <section className={card} aria-label="Weekly report digest">
        <div className="flex items-stretch gap-1.5 p-1.5">
          <button
            type="button"
            onClick={() => setReportOpen((v) => !v)}
            aria-expanded={reportOpen}
            aria-controls="weekly-report-body"
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left transition-colors hover:bg-zinc-800/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500/60 sm:px-4"
          >
            <CalendarRange className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.25em] text-zinc-100 sm:text-xs">Weekly report</span>
            <span className="min-w-0 truncate font-mono text-[10px] text-zinc-500">
              {prettyDate(digest.week[0])} – {prettyDate(digest.week[6])}
            </span>
            <ChevronDown
              className={cn('ml-auto h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-300', reportOpen && 'rotate-180 text-emerald-300')}
              aria-hidden
            />
          </button>
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            aria-label="Export weekly report share card"
            aria-haspopup="dialog"
            title="Export this report as a share card"
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl border border-zinc-800/80 px-3 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-300 transition hover:border-emerald-800 hover:bg-zinc-800/40 hover:text-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500/60 sm:px-4 sm:text-xs"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
            <span className="hidden xs:inline sm:inline">Share</span>
          </button>
        </div>

        {reportOpen && (
          <div id="weekly-report-body" className="space-y-4 border-t border-zinc-800/70 p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile
                icon={<Dumbbell className="h-3.5 w-3.5" />}
                label="Sessions"
                value={digest.workoutDays}
                sub={`${digest.strengthDays} of 2 strength (WHO)`}
                tone={digest.strengthDays >= 2 ? 'emerald' : 'zinc'}
              />
              <StatTile
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                label="Volume"
                value={digest.sets}
                sub={`sets · ${(digest.tonnage / 1000).toFixed(1)} t lifted`}
              />
              <StatTile
                icon={<Beef className="h-3.5 w-3.5" />}
                label="Protein"
                value={`${Math.round(digest.avgProtein)}g`}
                sub={`of ${plan.proteinG}g daily`}
                tone={digest.avgProtein >= plan.proteinG * 0.9 ? 'emerald' : 'zinc'}
              />
              <StatTile
                icon={<Target className="h-3.5 w-3.5" />}
                label="Adherence"
                value={`${digest.adherent} of 7`}
                sub={`days ±150 kcal of ${plan.calories.toLocaleString()}`}
              />
              <StatTile
                icon={<Flame className="h-3.5 w-3.5" />}
                label="Avg kcal"
                value={Math.round(digest.avgKcal).toLocaleString()}
                sub={`of ${plan.calories.toLocaleString()} target`}
              />
              <StatTile
                icon={<Droplets className="h-3.5 w-3.5" />}
                label="Water"
                value={`${digest.waterDays} of 7`}
                sub={`days ≥ ${((plan.waterMl * 0.95) / 1000).toFixed(1)} L`}
                tone={digest.waterDays >= 4 ? 'emerald' : 'zinc'}
              />
              <StatTile
                icon={<Moon className="h-3.5 w-3.5" />}
                label="Sleep"
                value={`${digest.avgSleep.toFixed(1)}h`}
                sub={`of ${plan.sleepGoalH}h goal`}
                tone={digest.avgSleep >= plan.sleepGoalH ? 'emerald' : 'zinc'}
              />
              <StatTile
                icon={<Zap className="h-3.5 w-3.5" />}
                label="XP earned"
                value={`+${digest.xp}`}
                sub="this week"
                tone="amber"
              />
            </div>

            {/* cardio vs WHO 150 min/wk */}
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-zinc-300">
                  <HeartPulse className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden />
                  Cardio minutes
                  <span className="font-mono tabular-nums text-zinc-400">
                    {Math.round(digest.cardioMin)} <span className="text-zinc-600">/ 150</span>
                  </span>
                </span>
                <Tag tone="zinc">WHO 2020 guidelines</Tag>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-zinc-800"
                role="progressbar"
                aria-label="Cardio minutes this week out of 150"
                aria-valuenow={Math.round(digest.cardioMin)}
                aria-valuemin={0}
                aria-valuemax={150}
              >
                <div
                  className={cn('h-full rounded-full transition-all duration-500', digest.cardioMin >= 150 ? 'bg-emerald-500' : 'bg-amber-400')}
                  style={{ width: `${Math.min(100, (digest.cardioMin / 150) * 100)}%` }}
                />
              </div>
            </div>

            {/* daily quality score */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Daily quality score</h3>
                  <p className="mt-0.5 text-[10px] text-zinc-600">dayScore 0–100 · habits, food, training, recovery</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-right font-mono text-[9px] leading-tight text-zinc-600">
                    avg<br />/100
                  </span>
                  <MiniRing pct={digest.avgScore / 100} size={44} stroke={5} color={digest.avgScore >= 70 ? '#34d399' : '#fbbf24'}>
                    <span className="font-mono text-[11px] font-bold tabular-nums text-zinc-200">{Math.round(digest.avgScore)}</span>
                  </MiniRing>
                </div>
              </div>
              <LineChart points={digest.scorePts} height={110} />
            </div>

            {/* verdict */}
            <div className="flex items-start gap-2.5 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-3.5 py-3">
              {verdict.onTrack ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
              )}
              <p className="text-xs leading-relaxed text-zinc-300">
                <span className="font-bold uppercase tracking-wider text-zinc-500">Verdict</span>
                {' — '}
                {verdict.text}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ============ weekly report share-card export (feature ④) ============ */}
      <WeekShareDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        stats={{
          rangeStart: prettyDate(digest.week[0]),
          rangeEnd: prettyDate(digest.week[6]),
          sessions: digest.workoutDays,
          strengthSessions: digest.strengthDays,
          sets: digest.sets,
          tonnageKg: digest.tonnage,
          avgProtein: digest.avgProtein,
          proteinTarget: plan.proteinG,
          adherentDays: digest.adherent,
          waterDays: digest.waterDays,
          waterGoalL: (plan.waterMl * 0.95) / 1000,
          xp: digest.xp,
          verdict: verdict.text,
          onTrack: verdict.onTrack,
        }}
      />

      {/* stat tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={<Dumbbell className="h-3.5 w-3.5" />} label="Workouts" value={totals.workouts} sub="all time" />
        <StatTile icon={<Scale className="h-3.5 w-3.5" />} label="Tonnage" value={`${(totals.tonnage / 1000).toFixed(1)} t`} sub="volume lifted" tone="emerald" />
        <StatTile icon={<Flame className="h-3.5 w-3.5" />} label="Streak" value={streak.current} sub={`best ${streak.best}`} tone="amber" />
        <StatTile icon={<Trophy className="h-3.5 w-3.5" />} label="Level" value={lvl.level} sub={lvl.title} tone="amber" />
        <StatTile icon={<Beef className="h-3.5 w-3.5" />} label="Avg protein" value={`${Math.round(totals.avgProtein)}g`} sub="7-day mean" />
        <StatTile icon={<Target className="h-3.5 w-3.5" />} label="Cardio" value={`${totals.cardioMin}m`} sub="all time" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* weight */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader
            title="Bodyweight trend"
            sub="daily noise ±1–2 kg — judge the 2-week trend (Hall 2011)"
            right={
              <div className="flex gap-1.5">
                <Input type="number" inputMode="decimal" placeholder={`${profile.weightKg} kg`} value={wIn} onChange={(e) => setWIn(e.target.value)} className="h-8 w-24 border-zinc-800 bg-zinc-950/60 font-mono text-xs" />
                <button
                  onClick={() => {
                    const v = parseFloat(wIn);
                    if (!v || v < 25 || v > 300) return toast.error('Enter a valid weight');
                    setWeight(todayStr(), v);
                    useFitnessStore.getState().updateProfile({ weightKg: v });
                    setWIn('');
                    toast.success(`Weight logged: ${v} kg`);
                  }}
                  className="h-8 rounded-lg bg-emerald-500 px-3 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-95"
                >
                  Log
                </button>
              </div>
            }
          />

          {weightReg ? (
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <span title={`Least-squares fit over ${weightReg.n} weigh-ins`}>
                <Tag tone={trendGood ? 'emerald' : 'amber'}>
                  TREND <span className="font-mono tabular-nums">{fmtSigned(weightReg.perWk)} kg/wk</span>
                </Tag>
              </span>
              <span className="font-mono text-xs tabular-nums text-zinc-400">
                PROJECTED <span className="font-bold text-zinc-100">{weightReg.proj4w.toFixed(1)} kg</span>{' '}
                <span className="text-zinc-600">in 4 wk</span>
              </span>
              <span className="font-mono text-[10px] tabular-nums text-zinc-600">{goalRateStr}</span>
            </div>
          ) : (
            <p className="mb-3 rounded-lg border border-dashed border-zinc-800 px-3 py-2 text-[11px] text-zinc-600">
              Log weigh-ins on 2+ days to unlock the least-squares trend &amp; 4-week projection.
            </p>
          )}

          <LineChart points={weightPts} unit=" kg" />

          {weightReg && (
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Weigh-ins &amp; regression fit</h3>
                <span className="font-mono text-[9px] text-zinc-600">dots = actual · dashed = fit</span>
              </div>
              <WeightTrendChart pts={weightReg.pts} slope={weightReg.slopePerDay} intercept={weightReg.intercept} />
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-600">
                Daily weight fluctuates ±1–2 kg from water &amp; glycogen — trust the trend, not the day.
              </p>
            </div>
          )}
        </div>

        {/* calories 14d */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader title="Calories · 14 days" sub={`target ${plan.calories.toLocaleString()} kcal (amber line)`} />
          <div className="flex h-40 items-end gap-1">
            {kcal14.map((k) => {
              const h = Math.max(2, (k.kcal / kcalMax) * 100);
              const over = k.kcal > plan.calories * 1.1;
              const empty = k.kcal === 0;
              return (
                <div key={k.d} className="group relative flex-1" title={`${k.d} · ${k.kcal} kcal`}>
                  <div
                    className={cn(
                      'w-full rounded-t-sm transition-all',
                      empty ? 'bg-zinc-800/50' : over ? 'bg-rose-500/80' : 'bg-emerald-500/80',
                    )}
                    style={{ height: `${h}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="relative mt-1">
            <div className="absolute -top-[168px] w-full border-t border-dashed border-amber-500/60" style={{ top: `${(1 - plan.calories / kcalMax) * 160 + 8}px` }} />
          </div>
          <div className="mt-2 flex justify-between font-mono text-[9px] text-zinc-600">
            <span>{kcal14[0]?.d.slice(5)}</span>
            <span>{kcal14[kcal14.length - 1]?.d.slice(5)}</span>
          </div>
        </div>

        {/* volume by muscle */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader title="Weekly volume by muscle" sub="primary sets, last 7 days" right={<BarChart3 className="h-4 w-4 text-zinc-600" />} />
          {volByMuscle.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">Log a session to see volume distribution</p>
          ) : (
            <div className="space-y-3">
              {volByMuscle.map(([m, v]) => (
                <BarRow key={m} label={m} value={v} max={20} unit=" sets" tone="emerald" />
              ))}
            </div>
          )}
        </div>

        {/* PRs */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader title="Estimated 1RM records" sub="best Epley/Brzycki estimate per lift" right={<TrendingUp className="h-4 w-4 text-zinc-600" />} />
          {prs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">Log weighted sets to build your record table</p>
          ) : (
            <ul className="space-y-1.5">
              {prs.map(([name, pr]) => (
                <li key={name} className="flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 py-2 text-xs">
                  <span className="truncate text-zinc-300">{name}</span>
                  <span className="ml-2 shrink-0 font-mono">
                    <span className="font-bold text-amber-400">{pr.e1rm} kg</span>
                    <span className="text-zinc-600"> · {pr.weight}×{pr.reps} · {pr.date.slice(5)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* radar */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader title="Attribute radar" sub="all five axes derived from logged behaviour" />
          <Radar axes={radar} />
        </div>

        {/* heatmap */}
        <div className={cn(card, 'p-5')}>
          <SectionHeader title="Consistency · 12 weeks" sub="darker = higher day score (40+ counts toward streak)" />
          <Heatmap data={heat} />
        </div>
      </div>
    </div>
  );
}
