'use client';

import { useMemo, useState } from 'react';
import {
  Moon, Sun, Timer, Footprints, HeartPulse, Dumbbell, Activity, Beef, Wheat, Leaf, TrendingUp,
  Flame, CheckCircle2, Circle, ChevronDown, BookOpen, Minus, Plus, Zap, Snowflake,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFitnessStore, useDay, usePlan } from '@/lib/fitness/store';
import { habitDone, habitProgress, habitValue, habitStreak, lastNDays, todayStr, prettyDate, xpFromDay, dayTotals } from '@/lib/fitness/calc';
import { HABITS, HABIT_CATEGORIES } from '@/lib/fitness/data/habits';
import { DateNav, MiniRing, Tag } from './shared';
import type { HabitDef } from '@/lib/fitness/types';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

/** max frozen dates per rolling 30-day window (feature ⑤) */
const FREEZE_LIMIT = 2;

const ICONS: Record<string, React.ReactNode> = {
  moon: <Moon className="h-5 w-5" />,
  sun: <Sun className="h-5 w-5" />,
  timer: <Timer className="h-5 w-5" />,
  footprints: <Footprints className="h-5 w-5" />,
  heartpulse: <HeartPulse className="h-5 w-5" />,
  dumbbell: <Dumbbell className="h-5 w-5" />,
  activity: <Activity className="h-5 w-5" />,
  beef: <Beef className="h-5 w-5" />,
  wheat: <Wheat className="h-5 w-5" />,
  leaf: <Leaf className="h-5 w-5" />,
  trendingup: <TrendingUp className="h-5 w-5" />,
};

export function HabitsView() {
  const [date, setDate] = useState(todayStr());
  const day = useDay(date);
  const plan = usePlan();
  const days = useFitnessStore((s) => s.days);
  const toggleHabit = useFitnessStore((s) => s.toggleHabit);
  const toggleFreeze = useFitnessStore((s) => s.toggleFreeze);
  const setSteps = useFitnessStore((s) => s.setSteps);
  const setSleep = useFitnessStore((s) => s.setSleep);

  const doneCount = HABITS.filter((h) => habitDone(h.id, day, plan)).length;
  const xpToday = xpFromDay(day, plan);

  /* ---- streak freeze bookkeeping (feature ⑤) ---- */
  const isFrozen = day.frozen === true;
  // rolling 30-day window ending today — freezes expire as they age out
  const frozenRecent = useMemo(
    () => lastNDays(todayStr(), 30).filter((d) => days[d]?.frozen === true),
    [days],
  );
  const freezesLeft = Math.max(0, FREEZE_LIMIT - frozenRecent.length);
  // freezing is capped at 2 per 30 days; unfreezing the viewed date stays available
  const canFreeze = freezesLeft > 0 || isFrozen;

  const onFreezeToggle = () => {
    toggleFreeze(date);
    if (isFrozen) {
      toast('Freeze removed', { description: `${prettyDate(date)} counts normally again.` });
    } else {
      toast.success(`Streak protected for ${prettyDate(date)}`, {
        description: 'Frozen days are skipped — they neither break nor extend streaks.',
      });
    }
  };

  const setMeasure = (h: HabitDef, delta: number) => {
    if (h.linked === 'steps') {
      setSteps(date, day.steps + delta);
    } else if (h.linked === 'sleep') {
      setSleep(date, day.sleepH + delta);
    } else if (h.linked === 'fibre') {
      toast('Fibre is computed from your food log', { description: 'Open the Fuel tab to add fibre-rich foods.' });
    } else if (h.linked === 'water') {
      useFitnessStore.getState().addWater(date, delta);
    } else {
      useFitnessStore.getState().toggleHabit(date, h.id);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Habits</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{prettyDate(date)} · every card cites its research</p>
        </div>
        <div className="flex items-center gap-2">
          {isFrozen && (
            <span
              title={`${prettyDate(date)} is frozen — streaks skip this day instead of breaking`}
              className="inline-flex items-center gap-1 rounded-full border border-teal-800/60 bg-teal-950/40 px-2.5 py-1 text-[10px] font-semibold text-teal-300"
            >
              <Snowflake className="h-3 w-3" aria-hidden /> frozen
            </span>
          )}
          <DateNav date={date} onChange={setDate} />
        </div>
      </div>

      {/* summary */}
      <div className={cn(card, 'p-5')}>
        <div className="flex items-center gap-5">
          <MiniRing pct={doneCount / HABITS.length} size={72} color="#34d399">
            <span className="font-mono text-sm font-bold text-zinc-100">{doneCount}/{HABITS.length}</span>
          </MiniRing>
          <div className="flex-1">
            <div className="text-sm font-bold text-zinc-100">Today&apos;s habit score</div>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              Median time to automaticity: <span className="font-semibold text-emerald-400">66 days</span> (Lally et al. 2010, n=96) — missing one day costs almost nothing.
            </p>
          </div>
          <div className="hidden items-center gap-1.5 rounded-xl border border-amber-800/60 bg-amber-950/40 px-3 py-2 sm:flex">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="font-mono text-sm font-bold text-amber-300">+{xpToday} XP</span>
          </div>
        </div>

        {/* streak freeze control (feature ⑤) */}
        <div className="mt-4 flex items-center gap-3 border-t border-zinc-800/70 pt-4">
          <button
            type="button"
            onClick={onFreezeToggle}
            disabled={!canFreeze}
            aria-pressed={isFrozen}
            aria-label={isFrozen ? `Remove streak freeze for ${prettyDate(date)}` : `Freeze ${prettyDate(date)} — protect streaks`}
            title={
              !canFreeze
                ? `Freeze limit reached (${FREEZE_LIMIT} per rolling 30 days) — the oldest rolls off as it ages out`
                : isFrozen
                  ? 'Remove freeze — this day counts normally again'
                  : `Freeze ${prettyDate(date)} — a frozen day is skipped, so streaks bridge over it instead of breaking`
            }
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition active:scale-95',
              isFrozen
                ? 'border-teal-600 bg-teal-950/60 text-teal-300'
                : 'border-zinc-800 text-zinc-400 hover:border-teal-700 hover:text-teal-300',
              !canFreeze && 'cursor-not-allowed opacity-40 hover:border-zinc-800 hover:text-zinc-400',
            )}
          >
            <Snowflake className="h-5 w-5" aria-hidden />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Streak freeze</span>
              {isFrozen && (
                <span className="rounded-full border border-teal-800/60 bg-teal-950/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-teal-300">
                  {prettyDate(date)} · protected
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              {freezesLeft > 0 ? (
                <>
                  <span className="font-mono tabular-nums font-semibold text-teal-300">{freezesLeft} freeze{freezesLeft === 1 ? '' : 's'}</span>
                  {' left this month · a frozen day is skipped, not counted — the chain bridges over it. '}
                  <span className="text-zinc-600">Missing one day costs almost nothing (Lally et al. 2010).</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-amber-400">No freezes left this month</span>
                  {' — the limit is 2 per rolling 30 days; the oldest rolls off as it ages out.'}
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {HABIT_CATEGORIES.map((cat) => (
        <div key={cat.id}>
          <h2 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-zinc-500">{cat.label}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {HABITS.filter((h) => h.category === cat.id).map((h) => (
              <HabitCard
                key={h.id}
                habit={h}
                date={date}
                done={habitDone(h.id, day, plan)}
                progress={habitProgress(h.id, day, plan)}
                value={habitValue(h.id, day, plan)}
                streak={habitStreak(days, h.id, plan)}
                streakProtected={isFrozen}
                onToggle={() => toggleHabit(date, h.id)}
                onMeasure={(d) => setMeasure(h, d)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function HabitCard({
  habit, done, progress, value, streak, streakProtected, onToggle, onMeasure,
}: {
  habit: HabitDef;
  date: string;
  done: boolean;
  progress: number;
  value: number | boolean;
  streak: number;
  /** viewed date is frozen — show the "streak protected" hint (feature ⑤) */
  streakProtected: boolean;
  onToggle: () => void;
  onMeasure: (delta: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const isMeasure = habit.kind === 'measure' && habit.target != null;
  const numeric = typeof value === 'number' ? value : 0;

  return (
    <div className={cn(card, 'p-4 transition', done && 'border-emerald-800/70 bg-emerald-950/20')}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', done ? 'bg-emerald-900/70 text-emerald-300' : 'bg-zinc-800/70 text-zinc-400')}>
            {ICONS[habit.icon] ?? <Activity className="h-5 w-5" />}
          </span>
          <div>
            <div className={cn('text-sm font-bold leading-tight', done ? 'text-emerald-200' : 'text-zinc-100')}>{habit.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
              {streak > 0 && (
                <span className="flex items-center gap-0.5 font-mono font-bold text-orange-400">
                  <Flame className="h-3 w-3" />{streak}d
                </span>
              )}
              {streakProtected && (
                <span
                  className="flex items-center gap-0.5 font-semibold text-teal-300"
                  title="Streak protected — this date is frozen and will be skipped instead of breaking the streak"
                >
                  <Snowflake className="h-3 w-3" aria-hidden />
                  <span className="sr-only">streak protected</span>
                  protected
                </span>
              )}
              {habit.linked && <Tag>auto-sync</Tag>}
            </div>
          </div>
        </div>
        {isMeasure ? (
          <div className="flex items-center gap-1">
            <button onClick={() => onMeasure(-stepFor(habit))} aria-label="Decrease" className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-zinc-600 active:scale-95">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onMeasure(stepFor(habit))} aria-label="Increase" className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400 transition hover:border-emerald-700 hover:text-emerald-400 active:scale-95">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={onToggle}
            role="checkbox"
            aria-checked={done}
            aria-label={habit.name}
            className={cn('flex h-9 w-9 items-center justify-center rounded-xl border transition active:scale-95', done ? 'border-emerald-600 bg-emerald-500 text-zinc-950' : 'border-zinc-700 text-zinc-500 hover:border-emerald-800 hover:text-emerald-400')}
          >
            {done ? <CheckCircle2 className="h-5 w-5" /> : <Circle className="h-5 w-5" />}
          </button>
        )}
      </div>

      {/* progress */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] font-mono text-zinc-500">
          <span>
            {isMeasure ? `${Math.round(numeric * 10) / 10} / ${habit.target} ${habit.unit}` : done ? 'complete' : 'incomplete'}
          </span>
          <span>{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className={cn('h-full rounded-full transition-all duration-500', done ? 'bg-emerald-400' : 'bg-emerald-700')} style={{ width: `${progress * 100}%` }} />
        </div>
        {/* 66-day automaticity */}
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800/60">
            <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${Math.min(100, (streak / 66) * 100)}%` }} />
          </div>
          <span className="font-mono text-[9px] text-zinc-600">{streak}/66d auto</span>
        </div>
      </div>

      {/* the science */}
      <button
        onClick={() => setOpen(!open)}
        className="mt-3 flex w-full items-center justify-between rounded-lg border border-zinc-800/70 bg-zinc-950/30 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500 transition hover:text-zinc-300"
      >
        <span className="flex items-center gap-1.5">
          <BookOpen className="h-3 w-3 text-emerald-600" /> The science
        </span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-zinc-800/70 bg-zinc-950/40 p-3">
          <p className="text-[11px] leading-relaxed text-zinc-400">{habit.why}</p>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-900/60 bg-emerald-950/50 px-2 py-0.5 text-[9px] font-semibold text-emerald-400">
            <BookOpen className="h-2.5 w-2.5" /> {habit.citation}
          </span>
        </div>
      )}
    </div>
  );
}

function stepFor(habit: HabitDef): number {
  if (habit.linked === 'sleep') return 0.5;
  if (habit.linked === 'steps') return 500;
  if (habit.linked === 'water') return 250;
  return 5;
}
