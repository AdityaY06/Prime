'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Droplets, Footprints, Moon, Flame, CheckCircle2, Circle, Zap, Lightbulb,
  Utensils, Dumbbell, ArrowRight, Trophy, BookOpen, Target,
  Lock, ClipboardList, CalendarCheck, CalendarDays, Award, Weight, Boxes, Mountain,
  CalendarRange, Beef, Drumstick, HeartPulse, PersonStanding, Compass, TrendingUp,
  Star, Crown, Ruler, Brain, ShieldCheck, Shield, Waves, MoonStar, PencilRuler,
  DraftingCompass, ChefHat, Timer, Hourglass,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useFitnessStore, useDay, useDays, usePlan, useProfile } from '@/lib/fitness/store';
import {
  dayTotals, levelInfo, questsFor, streakInfo, todayStr, totalXP, xpFromDay, lastNDays, dayScore, prettyDate,
} from '@/lib/fitness/calc';
import { ACHIEVEMENTS, TIER_XP, achievementTierStyles, achievementXp, unlockedAchievements } from '@/lib/fitness/achievements';
import type { AchievementCtx, AchievementDef } from '@/lib/fitness/achievements';
import { tipForDate } from '@/lib/fitness/data/research';
import { CalorieRing, MacroBar, MiniRing, DateNav, XpBadge, ProteinIcon, CarbIcon, FatIcon } from './shared';
import type { TabId } from '@/lib/fitness/types';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

/* ================= achievements ================= */

/** lucide icon names → components (only the icons the defs actually use). */
const ACHIEVEMENT_ICONS: Record<string, LucideIcon> = {
  'clipboard-list': ClipboardList,
  dumbbell: Dumbbell,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  award: Award,
  weight: Weight,
  boxes: Boxes,
  mountain: Mountain,
  flame: Flame,
  'calendar-range': CalendarRange,
  beef: Beef,
  drumstick: Drumstick,
  droplets: Droplets,
  waves: Waves,
  'moon-star': MoonStar,
  heartpulse: HeartPulse,
  timer: Timer,
  hourglass: Hourglass,
  'person-standing': PersonStanding,
  compass: Compass,
  'trending-up': TrendingUp,
  star: Star,
  crown: Crown,
  ruler: Ruler,
  'pencil-ruler': PencilRuler,
  brain: Brain,
  'shield-check': ShieldCheck,
  shield: Shield,
  'drafting-compass': DraftingCompass,
  'chef-hat': ChefHat,
};

const TIER_STYLES = achievementTierStyles();

const TIER_ORDER: AchievementDef['tier'][] = ['bronze', 'silver', 'gold', 'epic'];

/** subtle tier-coloured ring for UNLOCKED tiles (locked tiles keep the dimmed default). */
const TIER_TILE_RING: Record<AchievementDef['tier'], string> = {
  bronze: 'border-amber-700/40',
  silver: 'border-zinc-400/25',
  gold: 'border-amber-400/40',
  epic: 'border-fuchsia-500/40',
};

/**
 * Unlock-toast bookkeeping, module-scoped so it survives tab switches (this
 * component unmounts on every tab change) — each achievement toasts exactly
 * once per browser session. The first Dashboard mount of a session seeds the
 * set with everything already unlocked, so only live unlocks announce.
 */
const seenAchievementIds = new Set<string>();
let achievementToastsSeeded = false;

function AchievementTile({ def, unlocked }: { def: AchievementDef; unlocked: boolean }) {
  const tier = TIER_STYLES[def.tier];
  const Icon = ACHIEVEMENT_ICONS[def.icon] ?? Award;
  // subtle ring glow for gold (emerald) / epic (fuchsia) when unlocked — bronze & silver stay plain
  const glow = !unlocked
    ? ''
    : def.tier === 'gold'
      ? 'shadow-lg shadow-emerald-500/25'
      : def.tier === 'epic'
        ? 'shadow-lg shadow-fuchsia-500/30'
        : '';
  return (
    <div
      aria-label={`${def.name} — ${tier.label} tier — ${unlocked ? 'unlocked' : 'locked'}`}
      className={cn(
        'relative flex min-h-[116px] flex-col items-center gap-1.5 rounded-xl border p-3 text-center',
        unlocked ? cn(TIER_TILE_RING[def.tier], 'bg-zinc-950/40') : 'border-zinc-800/50 bg-zinc-950/20 opacity-60',
      )}
    >
      {unlocked && (
        <span
          title={`+${TIER_XP[def.tier]} bonus XP`}
          className="absolute right-1.5 top-1.5 rounded-md border border-amber-900/50 bg-amber-950/40 px-1 font-mono text-[9px] font-bold text-amber-400 tabular-nums"
        >
          +{TIER_XP[def.tier]}
        </span>
      )}
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border',
          unlocked ? tier.ring : 'border-zinc-700/70 bg-zinc-800/40',
          glow,
        )}
      >
        {unlocked ? (
          <Icon className={cn('h-4 w-4', tier.text)} aria-hidden />
        ) : (
          <Lock className="h-4 w-4 text-zinc-600" aria-hidden />
        )}
      </span>
      <span className="text-xs font-bold text-zinc-200">{def.name}</span>
      <p className={cn('text-[10px] leading-snug', unlocked ? 'text-zinc-500' : 'text-zinc-600')}>
        {unlocked ? def.desc : def.hint}
      </p>
    </div>
  );
}

function greeting(name: string): string {
  const h = new Date().getHours();
  const g = h < 5 ? 'Night owl' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 21 ? 'Good evening' : 'Good night';
  return name ? `${g}, ${name}` : g;
}

export function Dashboard({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const [date, setDate] = useState(todayStr());
  const day = useDay(date);
  const days = useDays();
  const plan = usePlan();
  const profile = useProfile();
  const addWater = useFitnessStore((s) => s.addWater);
  const setSteps = useFitnessStore((s) => s.setSteps);
  const setSleep = useFitnessStore((s) => s.setSleep);

  const t = dayTotals(day);
  const xpTotal = totalXP(days, plan);
  const lvl = levelInfo(xpTotal);
  const quests = questsFor(day, plan);
  const streak = streakInfo(days, plan);
  const xpToday = xpFromDay(day, plan);
  const tip = tipForDate(date);
  const waterPct = plan.waterMl > 0 ? day.waterMl / plan.waterMl : 0;
  const week = lastNDays(todayStr(), 7).map((d) => ({ d, active: days[d] ? dayScore(days[d], plan) >= 40 : false }));

  /* achievements — fully derived from the logged evidence */
  const measurements = useFitnessStore((s) => s.measurements);
  const program = useFitnessStore((s) => s.program);
  const customFoods = useFitnessStore((s) => s.customFoods);
  const achievementCtx = useMemo<AchievementCtx>(
    () => ({
      days,
      plan,
      profile,
      measurements,
      program,
      customFoodsCount: customFoods.length,
      // DayLog.frozen is optional (habits layer) — read defensively so this view never breaks
      frozenDays: Object.values(days).filter((d) => (d as { frozen?: boolean }).frozen === true).length,
    }),
    [days, plan, profile, measurements, program, customFoods],
  );
  const unlocked = useMemo(() => unlockedAchievements(achievementCtx), [achievementCtx]);
  const unlockedIds = useMemo(() => new Set(unlocked.map((a) => a.id)), [unlocked]);

  /* display-only bonus XP — never added to the global XP/level system */
  const bonusXp = useMemo(() => achievementXp(unlocked), [unlocked]);

  /* per-tier progress chips */
  const tierCounts = useMemo(
    () =>
      TIER_ORDER.map((t) => {
        const all = ACHIEVEMENTS.filter((a) => a.tier === t);
        return { tier: t, total: all.length, got: all.filter((a) => unlockedIds.has(a.id)).length };
      }),
    [unlockedIds],
  );

  /* deterministic "Next targets": the lowest-completion tier (ties resolve in tier order),
     then the first locked defs of that tier in catalogue order — no distance heuristics. */
  const nextTargets = useMemo(() => {
    let pick: AchievementDef['tier'] | null = null;
    let minRatio = 1;
    for (const t of TIER_ORDER) {
      const all = ACHIEVEMENTS.filter((a) => a.tier === t);
      const got = all.filter((a) => unlockedIds.has(a.id)).length;
      const ratio = all.length > 0 ? got / all.length : 1;
      if (ratio < minRatio) {
        minRatio = ratio;
        pick = t;
      }
    }
    if (!pick) return [];
    return ACHIEVEMENTS.filter((a) => a.tier === pick && !unlockedIds.has(a.id)).slice(0, 3);
  }, [unlockedIds]);

  // toast() is side-effect only (no setState) — safe inside an effect.
  useEffect(() => {
    if (!achievementToastsSeeded) {
      // first paint this session: silently mark everything already unlocked
      achievementToastsSeeded = true;
      unlocked.forEach((a) => seenAchievementIds.add(a.id));
      return;
    }
    for (const a of unlocked) {
      if (seenAchievementIds.has(a.id)) continue;
      seenAchievementIds.add(a.id);
      toast.success(`Achievement unlocked — ${a.name}`, { description: a.desc });
    }
  }, [unlocked]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">{greeting(profile.name)}</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {prettyDate(date)} · Level {lvl.level} {lvl.title} · {xpToday} XP earned today
          </p>
        </div>
        <DateNav date={date} onChange={setDate} />
      </div>

      {/* row 1 */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* calorie ring */}
        <div className={cn(card, 'p-6 lg:col-span-5 flex flex-col items-center')}>
          <CalorieRing consumed={Math.round(t.kcal)} target={plan.calories} burned={t.burned} />
          <button
            onClick={() => onNavigate('fuel')}
            className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-400 transition hover:text-emerald-300"
          >
            <Utensils className="h-3.5 w-3.5" /> Log food <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* macros */}
        <div className={cn(card, 'p-5 lg:col-span-4 flex flex-col justify-center gap-4')}>
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Macros</h3>
            <span className="font-mono text-[11px] text-zinc-500">
              P {Math.round(t.protein)} · C {Math.round(t.carbs)} · F {Math.round(t.fat)}
            </span>
          </div>
          <MacroBar label="Protein" value={t.protein} target={plan.proteinG} icon={<ProteinIcon />} color="emerald" />
          <MacroBar label="Carbs" value={t.carbs} target={plan.carbsG} icon={<CarbIcon />} color="amber" />
          <MacroBar label="Fat" value={t.fat} target={plan.fatG} icon={<FatIcon />} color="rose" />
          <div className="flex items-center justify-between border-t border-zinc-800/70 pt-3 text-[11px]">
            <span className="text-zinc-500">Fibre</span>
            <span className="font-mono text-zinc-300">
              {Math.round(t.fibre)} / {plan.fibreGoalG} g
              <span className="text-zinc-600"> · Reynolds 2019</span>
            </span>
          </div>
        </div>

        {/* water + steps/sleep */}
        <div className="lg:col-span-3 space-y-4">
          <div className={cn(card, 'p-5')}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
                <Droplets className="h-3.5 w-3.5 text-cyan-400" /> Water
              </h3>
              <span className="font-mono text-[11px] text-zinc-500">{(day.waterMl / 1000).toFixed(2)} L</span>
            </div>
            <div className="flex items-center gap-4">
              <MiniRing pct={waterPct} size={64} color="#22d3ee">
                <span className="font-mono text-xs font-bold text-zinc-200">{Math.round(waterPct * 100)}%</span>
              </MiniRing>
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex gap-1.5">
                  <button onClick={() => addWater(date, 250)} className="h-9 flex-1 rounded-lg border border-cyan-900/60 bg-cyan-950/40 text-[11px] font-bold text-cyan-300 transition hover:border-cyan-700 active:scale-95">+250 ml</button>
                  <button onClick={() => addWater(date, 500)} className="h-9 flex-1 rounded-lg border border-cyan-900/60 bg-cyan-950/40 text-[11px] font-bold text-cyan-300 transition hover:border-cyan-700 active:scale-95">+500 ml</button>
                  <button onClick={() => addWater(date, -250)} aria-label="Remove 250 ml" className="h-9 w-9 rounded-lg border border-zinc-800 text-[11px] font-bold text-zinc-400 transition hover:border-zinc-700 active:scale-95">−</button>
                </div>
                <p className="text-center text-[10px] text-zinc-600">goal {(plan.waterMl / 1000).toFixed(1)} L · ~35 ml/kg</p>
              </div>
            </div>
          </div>

          <div className={cn(card, 'p-5')}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Vitals</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <Footprints className="h-4 w-4 shrink-0 text-emerald-400" />
                <Input
                  type="number" inputMode="numeric" placeholder="steps"
                  value={day.steps || ''}
                  onChange={(e) => setSteps(date, parseInt(e.target.value || '0', 10))}
                  className="h-9 w-24 border-zinc-800 bg-zinc-950/60 font-mono text-xs"
                />
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (day.steps / plan.stepGoal) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-600">{plan.stepGoal.toLocaleString()} goal · Paluch 2022</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                <Moon className="h-4 w-4 shrink-0 text-amber-400" />
                <Input
                  type="number" inputMode="decimal" step="0.5" placeholder="h"
                  value={day.sleepH || ''}
                  onChange={(e) => setSleep(date, parseFloat(e.target.value || '0'))}
                  className="h-9 w-24 border-zinc-800 bg-zinc-950/60 font-mono text-xs"
                />
                <div className="flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(100, (day.sleepH / 7.5) * 100)}%` }} />
                  </div>
                  <p className="mt-1 text-[10px] text-zinc-600">7–9 h optimal · Hirshkowitz 2015</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* row 2 */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* quests */}
        <div className={cn(card, 'p-5 lg:col-span-5')}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Daily quests</h3>
            <span className="font-mono text-[11px] text-zinc-500">
              {quests.filter((q) => q.done).length}/{quests.length} · +{quests.filter((q) => q.done).reduce((s, q) => s + q.xp, 0)} XP
            </span>
          </div>
          <ul className="space-y-2.5">
            {quests.map((q) => (
              <li key={q.id} className={cn('flex items-center gap-3 rounded-xl border p-2.5 transition', q.done ? 'border-emerald-800/60 bg-emerald-950/30' : 'border-zinc-800/70 bg-zinc-950/30')}>
                {q.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" /> : <Circle className="h-5 w-5 shrink-0 text-zinc-600" />}
                <div className="min-w-0 flex-1">
                  <div className={cn('text-xs font-semibold', q.done ? 'text-emerald-300' : 'text-zinc-200')}>{q.label}</div>
                  <div className="truncate text-[10px] text-zinc-500">{q.detail}</div>
                  {q.target > 1 && !q.done && q.progress > 0 && (
                    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }} />
                    </div>
                  )}
                </div>
                <XpBadge xp={q.xp} />
              </li>
            ))}
          </ul>
        </div>

        {/* level + streak */}
        <div className={cn(card, 'p-5 lg:col-span-4 flex flex-col justify-between gap-4')}>
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Progression</h3>
              <span className="font-mono text-[11px] text-zinc-500">{xpTotal.toLocaleString()} total XP</span>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/20">
                <Zap className="h-6 w-6 text-zinc-950" />
              </div>
              <div className="flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-2xl font-black text-amber-400">LVL {lvl.level}</span>
                  <span className="text-sm font-bold text-zinc-200">{lvl.title}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-500" style={{ width: `${lvl.pct * 100}%` }} />
                </div>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">{lvl.into}/{lvl.need} XP to level {lvl.level + 1}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-zinc-800/70 pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className={cn('h-5 w-5', streak.current > 0 ? 'text-orange-400' : 'text-zinc-600')} />
                <span className="font-mono text-xl font-bold text-zinc-100">{streak.current}</span>
                <span className="text-xs text-zinc-500">day streak</span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> best {streak.best}
              </div>
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {week.map((w) => (
                <div
                  key={w.d}
                  title={w.d}
                  className={cn('h-2 flex-1 rounded-full', w.active ? 'bg-emerald-500' : 'bg-zinc-800')}
                />
              ))}
            </div>
          </div>
        </div>

        {/* research tip */}
        <div className={cn(card, 'relative overflow-hidden p-5 lg:col-span-3')}>
          <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Lightbulb className="h-3.5 w-3.5 text-emerald-400" /> Research tip
          </h3>
          <p className="text-sm leading-relaxed text-zinc-300">{tip.text}</p>
          <div className="mt-4 flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-900/60 bg-emerald-950/50 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
              <BookOpen className="h-3 w-3" /> {tip.cite}
            </span>
            <button onClick={() => onNavigate('science')} className="text-[11px] font-semibold text-emerald-400 transition hover:text-emerald-300">
              Library →
            </button>
          </div>
        </div>
      </div>

      {/* achievements — derived milestones */}
      <section className={cn(card, 'p-5')} aria-label="Achievements">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Trophy className="h-3.5 w-3.5 text-amber-400" /> Achievements
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {tierCounts.map(({ tier, total, got }) => {
              const st = TIER_STYLES[tier];
              return (
                <span
                  key={tier}
                  aria-label={`${st.label} tier: ${got} of ${total} unlocked`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums',
                    st.ring,
                    st.text,
                  )}
                >
                  {st.label} {got}/{total}
                </span>
              );
            })}
            <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
              {unlocked.length} / {ACHIEVEMENTS.length}
            </span>
            <span
              title="Display-only bonus XP — tracked separately from your daily XP"
              className="inline-flex items-center gap-1 rounded-full border border-amber-800/60 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-400 tabular-nums"
            >
              <Zap className="h-3 w-3" aria-hidden /> +{bonusXp} XP earned
            </span>
          </div>
        </div>

        {nextTargets.length > 0 && (
          <div className="mb-4 rounded-xl border border-zinc-800/70 bg-zinc-950/30 p-3">
            <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              <Target className="h-3 w-3 text-emerald-400" aria-hidden /> Next targets ·{' '}
              <span className={TIER_STYLES[nextTargets[0].tier].text}>{TIER_STYLES[nextTargets[0].tier].label}</span>
            </div>
            <ul className="grid gap-2 sm:grid-cols-3">
              {nextTargets.map((a) => (
                <li key={a.id} className="flex items-start gap-2 rounded-lg border border-zinc-800/60 bg-zinc-950/40 p-2">
                  <Lock className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" aria-hidden />
                  <div className="min-w-0">
                    <span className="block text-[11px] font-bold text-zinc-300">{a.name}</span>
                    <span className="block text-[10px] leading-snug text-zinc-600">{a.hint}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {ACHIEVEMENTS.map((a) => (
            <AchievementTile key={a.id} def={a} unlocked={unlockedIds.has(a.id)} />
          ))}
        </div>
      </section>

      {/* row 3: today previews */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className={cn(card, 'p-5')}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <Utensils className="h-3.5 w-3.5 text-emerald-400" /> Fuel log · {t.kcal > 0 ? `${Math.round(t.kcal)} kcal` : 'empty'}
            </h3>
            <button onClick={() => onNavigate('fuel')} className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300">Open →</button>
          </div>
          {day.foods.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">Nothing logged yet today</p>
          ) : (
            <ul className="nice-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {day.foods.map((f) => (
                <li key={f.id} className="flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 py-2 text-xs">
                  <span className="truncate text-zinc-300">{f.name} <span className="text-zinc-600">· {f.grams} g</span></span>
                  <span className="ml-2 shrink-0 font-mono text-zinc-400">{Math.round(f.kcal)} kcal</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn(card, 'p-5')}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <Dumbbell className="h-3.5 w-3.5 text-amber-400" /> Training log · {day.exercises.length > 0 ? `${t.strengthSets} sets` : 'rest day'}
            </h3>
            <button onClick={() => onNavigate('train')} className="text-[11px] font-semibold text-amber-400 hover:text-amber-300">Open →</button>
          </div>
          {day.exercises.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">No session logged — rest is training too</p>
          ) : (
            <ul className="nice-scroll max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {day.exercises.map((e) => (
                <li key={e.id} className="flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 py-2 text-xs">
                  <span className="truncate text-zinc-300">{e.name}</span>
                  <span className="ml-2 shrink-0 font-mono text-zinc-400">
                    {e.type === 'strength' ? `${e.sets.length}×` : `${e.minutes}m`}
                    {e.volumeKg > 0 && ` · ${(e.volumeKg / 1000).toFixed(1)}t`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
