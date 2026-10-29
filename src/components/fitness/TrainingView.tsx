'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dumbbell, Library, Wrench, Plus, Trash2, Search, X, Timer as TimerIcon,
  Calculator, ChevronDown, Save, Flame, Play, Pause, RotateCcw, Repeat2, Gauge, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useFitnessStore, useDay, useDays, usePlan, useProfile } from '@/lib/fitness/store';
import {
  estimate1RM, epley1RM, brzycki1RM, metKcal, muscleSets, todayStr, prettyDate,
  volumeOf, PERCENT_1RM,
} from '@/lib/fitness/calc';
import { EXERCISES, searchExercises } from '@/lib/fitness/data/exercises';
import { MUSCLES, MUSCLE_MAP } from '@/lib/fitness/data/muscles';
import {
  bestForActivity, bestForMuscle, rankBadge, rankExercises, tierFor, whyFor,
  type RankedExercise,
} from '@/lib/exercise-rank';
import { generateProgram } from '@/lib/fitness/program';
import { DateNav, SectionHeader, Tag, MiniRing } from './shared';
import { ProgramTab, type SessionPrefill } from './program-tab';
import type { Equipment, Exercise, ExerciseType, LoggedExercise, MuscleId, SetEntry } from '@/lib/fitness/types';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

function mmss(sec: number): string {
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

interface DraftEx {
  exercise: Exercise;
  sets: SetEntry[];
  minutes: number;
}

export function TrainingView() {
  const [tab, setTab] = useState('session');
  const [session, setSession] = useState<{ items: SessionPrefill[]; seq: number }>({ items: [], seq: 0 });
  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-xl font-bold text-zinc-50">Train</h1>
        <p className="mt-0.5 text-xs text-zinc-500">{EXERCISES.length} exercises · Compendium MET burn model · Epley/Brzycki strength math</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-11 w-full grid-cols-4 bg-zinc-900/60 p-1">
          {[
            { v: 'program', l: 'Program', i: <CalendarDays className="h-4 w-4" /> },
            { v: 'session', l: 'Session', i: <Dumbbell className="h-4 w-4" /> },
            { v: 'library', l: 'Library', i: <Library className="h-4 w-4" /> },
            { v: 'tools', l: 'Tools', i: <Wrench className="h-4 w-4" /> },
          ].map((t) => (
            <TabsTrigger key={t.v} value={t.v} className="gap-1.5 text-xs font-semibold data-[state=active]:bg-zinc-800 data-[state=active]:text-zinc-50">
              {t.i} {t.l}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="program" className="mt-4">
          <ProgramTab
            onPrefill={(items) => {
              setSession((s) => ({ items, seq: s.seq + 1 }));
              setTab('session');
            }}
          />
        </TabsContent>
        <TabsContent value="session" className="mt-4">
          <SessionTab key={`s-${session.seq}`} initial={session.items} />
        </TabsContent>
        <TabsContent value="library" className="mt-4"><LibraryTab /></TabsContent>
        <TabsContent value="tools" className="mt-4"><ToolsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ================= SESSION (logger) ================= */

function SessionTab({ initial }: { initial: SessionPrefill[] }) {
  const [date, setDate] = useState(todayStr());
  const day = useDay(date);
  const plan = usePlan();
  const profile = useProfile();
  const addExercise = useFitnessStore((s) => s.addExercise);
  const removeExercise = useFitnessStore((s) => s.removeExercise);
  const program = useFitnessStore((s) => s.program);

  const [drafts, setDrafts] = useState<DraftEx[]>(() =>
    initial.flatMap((p): DraftEx[] => {
      const ex = EXERCISES.find((x) => x.id === p.exerciseId);
      return ex ? [{ exercise: ex, sets: p.sets.map((s) => ({ ...s, rir: 2 })), minutes: p.minutes }] : [];
    }),
  );
  const [picker, setPicker] = useState(false);

  /* ---------- floating rest timer (local state only) ---------- */
  const [autoRest, setAutoRest] = useState(true);
  const [rest, setRest] = useState<{ label: string; total: number; left: number } | null>(null);

  // today's planned session (when a program exists) → prescribed rest per exercise
  const plannedToday = useMemo(() => {
    if (!program) return null;
    const gen = generateProgram(program, profile, profile.weightKg);
    const todayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date().getDay()];
    const idx = gen.layout.indexOf(todayLabel);
    return idx >= 0 ? gen.sessions[idx] : null;
  }, [program, profile]);

  const restFor = (ex: Exercise): number => {
    const slot = plannedToday?.exercises.find((pe) => pe.exerciseId === ex.id);
    if (slot) return slot.restSec;
    // simple fallback: heavy compounds (difficulty 3) get 3 min, everything else 90 s
    return ex.difficulty === 3 ? 180 : 90;
  };

  const startRest = (ex: Exercise) => {
    if (!autoRest) return;
    const sec = restFor(ex);
    setRest({ label: ex.name, total: sec, left: sec });
  };

  const nudgeRest = (delta: number) =>
    setRest((r) => {
      if (!r) return r;
      const left = Math.max(0, r.left + delta);
      const total = delta > 0 ? Math.max(r.total, left) : r.total;
      return { ...r, left, total };
    });

  // single interval while a rest is active; recreated per tick (negligible drift),
  // cleaned up on unmount — completion toast + hide happen inside the tick callback
  useEffect(() => {
    if (!rest) return;
    const id = setInterval(() => {
      const next = rest.left - 1;
      if (next <= 0) {
        toast.success('Rest complete', { description: 'Time for the next set.' });
        setRest(null);
      } else {
        setRest({ ...rest, left: next });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [rest]);

  const draftVolume = drafts.reduce((s, d) => s + (d.exercise.type === 'strength' ? volumeOf(d.sets) : 0), 0);
  const draftKcal = drafts.reduce((s, d) => s + kcalFor(d, profile.weightKg), 0);

  const addDraft = (ex: Exercise) => {
    setDrafts((ds) => [...ds, { exercise: ex, sets: ex.type === 'strength' ? [{ weight: 20, reps: 8, rir: 2 }] : [], minutes: ex.type === 'strength' ? 0 : 30 }]);
    setPicker(false);
    toast.success(`${ex.name} added to session`);
  };

  const updateDraft = (i: number, patch: Partial<DraftEx>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const updateSet = (di: number, si: number, patch: Partial<SetEntry>) =>
    setDrafts((ds) => ds.map((d, j) => (j === di ? { ...d, sets: d.sets.map((s, k) => (k === si ? { ...s, ...patch } : s)) } : d)));

  const saveSession = () => {
    if (drafts.length === 0) return;
    let totalKcal = 0;
    for (const d of drafts) {
      const kcal = kcalFor(d, profile.weightKg);
      totalKcal += kcal;
      const log: LoggedExercise = {
        id: crypto.randomUUID(),
        exerciseId: d.exercise.id,
        name: d.exercise.name,
        type: d.exercise.type,
        muscles: d.exercise.muscles,
        secondary: d.exercise.secondary,
        met: d.exercise.met,
        sets: d.sets,
        minutes: d.minutes,
        volumeKg: d.exercise.type === 'strength' ? volumeOf(d.sets) : 0,
        kcal,
        ts: new Date().toISOString(),
      };
      addExercise(date, log);
    }
    toast.success(`Session logged · ${drafts.length} exercises`, { description: `${Math.round(totalKcal)} kcal est. burn · +XP earned` });
    // log the session → last strength lift sets the rest clock (if auto-rest is on)
    const lastStrength = [...drafts].reverse().find((d) => d.exercise.type === 'strength');
    setDrafts([]);
    if (lastStrength) startRest(lastStrength.exercise);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-500">{prettyDate(date)}</p>
        <DateNav date={date} onChange={setDate} />
      </div>

      {/* draft builder */}
      <div className={cn(card, 'p-5')}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-400">Session builder</h3>
          <div className="flex flex-wrap items-center gap-2">
            {drafts.length > 0 && (
              <span className="font-mono text-[11px] text-zinc-500">
                {(draftVolume / 1000).toFixed(2)} t volume · {Math.round(draftKcal)} kcal
              </span>
            )}
            <button
              onClick={() => setAutoRest((v) => !v)}
              aria-pressed={autoRest}
              title="Auto-start the rest timer when you commit a set"
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-semibold transition',
                autoRest
                  ? 'border-emerald-800/70 bg-emerald-950/40 text-emerald-400'
                  : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
              )}
            >
              <TimerIcon className="h-3.5 w-3.5" /> auto rest timer
            </button>
          </div>
        </div>

        {drafts.length === 0 && (
          <button
            onClick={() => setPicker(true)}
            className="flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-zinc-700 text-zinc-500 transition hover:border-emerald-700 hover:text-emerald-400"
          >
            <Plus className="h-5 w-5" />
            <span className="text-xs font-semibold">Add an exercise</span>
          </button>
        )}

        <div className="space-y-3">
          {drafts.map((d, i) => (
            <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-zinc-100">{d.exercise.name}</div>
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {d.exercise.muscles.slice(0, 3).map((m) => (
                      <Tag key={m} tone="emerald">{MUSCLE_MAP[m].label}</Tag>
                    ))}
                    {d.exercise.type === 'cardio' && <Tag tone="amber">cardio</Tag>}
                    {d.exercise.type === 'mobility' && <Tag tone="amber">mobility</Tag>}
                  </div>
                </div>
                <button onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} aria-label="Remove exercise" className="text-zinc-600 transition hover:text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              {d.exercise.type === 'strength' ? (
                <>
                  <div className="nice-scroll overflow-x-auto">
                    <table className="w-full min-w-[320px] text-xs">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-600">
                          <th className="pb-1.5 font-semibold">Set</th>
                          <th className="pb-1.5 font-semibold">kg</th>
                          <th className="pb-1.5 font-semibold">reps</th>
                          <th className="pb-1.5 font-semibold">RIR</th>
                          <th className="pb-1.5 font-semibold">e1RM</th>
                          <th className="pb-1.5" />
                        </tr>
                      </thead>
                      <tbody className="font-mono">
                        {d.sets.map((s, si) => (
                          <tr key={si} className="border-t border-zinc-800/60">
                            <td className="py-1.5 text-zinc-500">{si + 1}</td>
                            <td className="py-1">
                              <Input type="number" inputMode="decimal" value={s.weight || ''} onChange={(e) => updateSet(i, si, { weight: parseFloat(e.target.value || '0') })} className="h-8 w-16 border-zinc-800 bg-zinc-950/70" aria-label="weight" />
                            </td>
                            <td className="py-1">
                              <Input type="number" inputMode="numeric" value={s.reps || ''} onChange={(e) => updateSet(i, si, { reps: parseInt(e.target.value || '0', 10) })} className="h-8 w-16 border-zinc-800 bg-zinc-950/70" aria-label="reps" />
                            </td>
                            <td className="py-1">
                              <Input type="number" inputMode="numeric" value={s.rir ?? ''} placeholder="—" onChange={(e) => updateSet(i, si, { rir: e.target.value === '' ? undefined : parseInt(e.target.value, 10) })} className="h-8 w-14 border-zinc-800 bg-zinc-950/70" aria-label="reps in reserve" />
                            </td>
                            <td className="py-1 text-zinc-400">{estimate1RM(s.weight, s.reps) || '—'}</td>
                            <td className="py-1 text-right">
                              <button onClick={() => updateDraft(i, { sets: d.sets.filter((_, k) => k !== si) })} aria-label="Remove set" className="text-zinc-700 hover:text-rose-400">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between">
                    <button
                      onClick={() => {
                        updateDraft(i, { sets: [...d.sets, { weight: d.sets[d.sets.length - 1]?.weight ?? 20, reps: d.sets[d.sets.length - 1]?.reps ?? 8, rir: 2 }] });
                        // committing another set = the previous set is done → rest clock
                        startRest(d.exercise);
                      }}
                      className="flex h-8 items-center gap-1 rounded-lg border border-zinc-800 px-3 text-[11px] font-semibold text-zinc-400 transition hover:border-emerald-800 hover:text-emerald-400"
                    >
                      <Plus className="h-3 w-3" /> set
                    </button>
                    <span className="font-mono text-[10px] text-zinc-600">
                      {volumeOf(d.sets).toLocaleString()} kg volume · Robinson 2024: log RIR
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <TimerIcon className="h-4 w-4 text-zinc-600" />
                  <Input
                    type="number" inputMode="numeric" value={d.minutes || ''}
                    onChange={(e) => updateDraft(i, { minutes: parseInt(e.target.value || '0', 10) })}
                    className="h-9 w-20 border-zinc-800 bg-zinc-950/70 font-mono"
                    aria-label="minutes"
                  />
                  <span className="text-xs text-zinc-500">min</span>
                  <span className="ml-auto font-mono text-xs text-amber-400">
                    ≈ {metKcal(d.exercise.met, d.minutes || 0, profile.weightKg)} kcal (MET {d.exercise.met})
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {drafts.length > 0 && (
          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setPicker(true)}
              className="flex h-10 items-center gap-1.5 rounded-lg border border-zinc-800 px-4 text-xs font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              <Plus className="h-3.5 w-3.5" /> Exercise
            </button>
            <button
              onClick={saveSession}
              className="flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
            >
              <Save className="h-4 w-4" /> Save session · {Math.round(draftKcal)} kcal
            </button>
          </div>
        )}
      </div>

      {/* logged sessions for the date */}
      <div className={cn(card, 'p-5')}>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Logged · {prettyDate(date)}</h3>
        {day.exercises.length === 0 ? (
          <p className="rounded-lg border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">Rest day — recovery is where adaptation happens</p>
        ) : (
          <ul className="space-y-2">
            {day.exercises.map((e) => (
              <li key={e.id} className="rounded-xl border border-zinc-800/70 bg-zinc-950/40 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-zinc-200">{e.name}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                      {e.type === 'strength'
                        ? e.sets.map((s) => `${s.weight}×${s.reps}`).join(' · ') + ` — ${(e.volumeKg / 1000).toFixed(2)} t`
                        : `${e.minutes} min`}
                      {' · '}{Math.round(e.kcal)} kcal
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => {
                        const ex = EXERCISES.find((x) => x.id === e.exerciseId);
                        if (ex) setDrafts((ds) => [...ds, { exercise: ex, sets: e.sets.map((s) => ({ ...s })), minutes: e.minutes }]);
                        toast('Loaded into builder — adjust and save');
                      }}
                      aria-label="Repeat exercise"
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-emerald-800 hover:text-emerald-400"
                    >
                      <Repeat2 className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeExercise(date, e.id)} aria-label="Delete exercise" className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-rose-900 hover:text-rose-400">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addDraft} />

      {/* floating rest timer pill */}
      {rest && (
        <div
          role="timer"
          aria-label={`Rest timer: ${mmss(rest.left)} remaining, ${rest.label}`}
          className={cn(
            'fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-2.5 rounded-2xl border bg-zinc-900/95 p-2 pl-2.5 shadow-xl shadow-black/50 backdrop-blur',
            rest.left <= 10 ? 'animate-pulse border-amber-600/70' : 'border-zinc-700/80',
          )}
        >
          <MiniRing
            pct={rest.total > 0 ? rest.left / rest.total : 0}
            size={44}
            stroke={4}
            color={rest.left <= 10 ? '#fbbf24' : '#34d399'}
          >
            <span className="font-mono text-[11px] font-bold tabular-nums text-zinc-100">{mmss(rest.left)}</span>
          </MiniRing>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">
              {rest.left <= 10 ? 'rest — go soon' : 'rest'}
            </div>
            <div className="max-w-[120px] truncate text-[11px] font-semibold text-zinc-300">{rest.label}</div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => nudgeRest(-15)}
              aria-label="Subtract 15 seconds"
              className="h-9 w-10 rounded-lg border border-zinc-800 font-mono text-[11px] font-bold text-zinc-400 transition hover:border-zinc-600 hover:text-zinc-200"
            >
              −15
            </button>
            <button
              onClick={() => nudgeRest(15)}
              aria-label="Add 15 seconds"
              className="h-9 w-10 rounded-lg border border-zinc-800 font-mono text-[11px] font-bold text-zinc-400 transition hover:border-emerald-800 hover:text-emerald-400"
            >
              +15
            </button>
            <button
              onClick={() => setRest(null)}
              aria-label="Skip rest"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-800 text-zinc-500 transition hover:border-rose-900 hover:text-rose-400"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function kcalFor(d: DraftEx, weightKg: number): number {
  if (d.exercise.type === 'strength') {
    const minutes = d.sets.length * 2.5 || 15;
    return metKcal(d.exercise.met, minutes, weightKg);
  }
  return metKcal(d.exercise.met, d.minutes, weightKg);
}

/* ================= exercise picker sheet ================= */

/* R71-b tier badges — T1 amber/gold, T2 neutral, T3 dim (the file's own zinc
 * ladder; rankBadge supplies the label + tone, this maps tone → classes). */
const TIER_BADGE_CLASS: Record<'gold' | 'neutral' | 'dim', string> = {
  gold: 'border border-amber-700/60 bg-amber-950/40 text-amber-300',
  neutral: 'border border-zinc-700 bg-zinc-800/60 text-zinc-300',
  dim: 'border border-zinc-800 bg-zinc-900/40 text-zinc-600',
};

function TierBadge({ tier }: { tier: 1 | 2 | 3 }) {
  const b = rankBadge(tier);
  return (
    <span className={cn('shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold leading-none', TIER_BADGE_CLASS[b.tone])}>
      {b.label}
    </span>
  );
}

/* One ranked status line — "BEST FOR CHEST — RANKED" when a muscle or activity
 * filter drives the order, the plain count while browsing. */
function RankedHeader({ ranked, muscle, type, matches }: { ranked: boolean; muscle: MuscleId | 'all'; type: ExerciseType | 'all'; matches: number }) {
  if (!ranked) return <p className="mt-2 text-[11px] text-zinc-500">{matches} exercises</p>;
  const label = muscle !== 'all' ? MUSCLE_MAP[muscle].label : type !== 'all' ? type : 'search';
  return (
    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-emerald-400/90">
      Best for {label} — ranked <span className="font-mono text-zinc-500">· {matches} picks</span>
    </p>
  );
}

function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const [q, setQ] = useState('');
  const [type, setType] = useState<ExerciseType | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleId | 'all'>('all');

  // R71-b — the picker is best-first whenever a muscle, activity or search
  // narrows the set: the rank order comes from the recommender's canonical
  // lists (bestForMuscle for a muscle chip — strength training picks first,
  // bestForActivity for a type chip — accessibility/foundational order), with
  // tier order covering anything the canonical list doesn't index (search
  // sets, cardio rows under a muscle chip). With no filter at all it keeps
  // the browse order, rows still carrying their tier pip. Search now threads
  // the active chips through searchExercises so filters combine instead of
  // overriding each other.
  const { rows, ranked, matches } = useMemo(() => {
    let l = EXERCISES;
    if (type !== 'all') l = l.filter((e) => e.type === type);
    if (muscle !== 'all') l = l.filter((e) => e.muscles.includes(muscle) || e.secondary.includes(muscle));
    if (q.trim()) l = searchExercises(q, { muscle: muscle === 'all' ? undefined : muscle, type: type === 'all' ? undefined : type });
    const isRanked = muscle !== 'all' || type !== 'all' || q.trim().length > 0;
    let rankedRows: RankedExercise[];
    if (!isRanked) {
      rankedRows = l.map((e) => ({ exercise: e, tier: tierFor(e.id), why: whyFor(e.id) }));
    } else {
      const index = new Map<string, number>();
      if (muscle !== 'all') bestForMuscle(muscle).forEach((r, i) => index.set(r.exercise.id, i));
      else if (type !== 'all') bestForActivity(type).forEach((r, i) => index.set(r.exercise.id, i));
      const covered = l.some((e) => index.has(e.id));
      rankedRows = covered
        ? [...l]
            .sort(
              (a, b) =>
                (index.get(a.id) ?? Infinity) - (index.get(b.id) ?? Infinity) ||
                tierFor(a.id) - tierFor(b.id) ||
                a.name.localeCompare(b.name)
            )
            .map((e) => ({ exercise: e, tier: tierFor(e.id), why: whyFor(e.id) }))
        : rankExercises(l);
    }
    return { rows: rankedRows.slice(0, 100), ranked: isRanked, matches: l.length };
  }, [q, type, muscle]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="mx-auto flex max-h-[85vh] max-w-lg flex-col rounded-t-2xl border-zinc-800 bg-zinc-900 px-5 pb-6 pt-4 sm:rounded-2xl">
        <SheetHeader className="px-0 text-left">
          <SheetTitle className="text-zinc-100">Exercise library</SheetTitle>
          <SheetDescription className="text-[11px] text-zinc-500">{EXERCISES.length} exercises · MET values from the 2011 Compendium</SheetDescription>
        </SheetHeader>
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="h-10 border-zinc-800 bg-zinc-950/60 pl-9" />
        </div>
        <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1">
          {(['all', 'strength', 'cardio', 'mobility'] as const).map((t) => (
            <button key={t} onClick={() => setType(t as ExerciseType | 'all')} className={cn('shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition', type === t ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500')}>
              {t}
            </button>
          ))}
        </div>
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1">
          <button onClick={() => setMuscle('all')} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', muscle === 'all' ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500')}>All muscles</button>
          {MUSCLES.map((m) => (
            <button key={m.id} onClick={() => setMuscle(m.id)} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', muscle === m.id ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500')}>
              {m.label}
            </button>
          ))}
        </div>
        <RankedHeader ranked={ranked} muscle={muscle} type={type} matches={matches} />
        <ul className="nice-scroll mt-1.5 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {rows.map(({ exercise: e, tier, why }) => (
            <li key={e.id}>
              <button onClick={() => onPick(e)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3 text-left transition hover:border-emerald-800">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <TierBadge tier={tier} />
                    <span className="truncate text-sm font-semibold text-zinc-200">{e.name}</span>
                  </div>
                  {ranked && <div className="mt-0.5 truncate text-[10px] text-zinc-500">{why}</div>}
                  <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <span className="flex gap-0.5">
                      {[1, 2, 3].map((i) => (
                        <span key={i} className={cn('h-1 w-3 rounded-full', i <= e.difficulty ? 'bg-amber-500' : 'bg-zinc-700')} />
                      ))}
                    </span>
                    {MUSCLE_MAP[e.muscles[0]].label} · MET {e.met}
                  </div>
                </div>
                <Plus className="h-4 w-4 shrink-0 text-emerald-500" />
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/* ================= LIBRARY ================= */

function LibraryTab() {
  const [q, setQ] = useState('');
  const [type, setType] = useState<ExerciseType | 'all'>('all');
  const [muscle, setMuscle] = useState<MuscleId | 'all'>('all');
  const [equip, setEquip] = useState<Equipment | 'all'>('all');
  const [open, setOpen] = useState<string | null>(null);

  const list = useMemo(() => {
    let l = EXERCISES;
    if (type !== 'all') l = l.filter((e) => e.type === type);
    if (muscle !== 'all') l = l.filter((e) => e.muscles.includes(muscle) || e.secondary.includes(muscle));
    if (equip !== 'all') l = l.filter((e) => e.equipment.includes(equip));
    if (q.trim()) l = searchExercises(q);
    return l;
  }, [q, type, muscle, equip]);

  return (
    <div className={cn(card, 'p-5')}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search exercises…" className="h-11 border-zinc-800 bg-zinc-950/60 pl-9" />
      </div>
      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
        {(['all', 'strength', 'cardio', 'mobility'] as const).map((t) => (
          <button key={t} onClick={() => setType(t as ExerciseType | 'all')} className={cn('shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition', type === t ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700')}>{t}</button>
        ))}
        {(['all', 'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'] as const).map((t) => (
          <button key={t} onClick={() => setEquip(t as Equipment | 'all')} className={cn('shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold capitalize transition', equip === t ? 'border-amber-600 bg-amber-950/50 text-amber-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700')}>{t}</button>
        ))}
      </div>
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        <button onClick={() => setMuscle('all')} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', muscle === 'all' ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500')}>All muscles</button>
        {MUSCLES.map((m) => (
          <button key={m.id} onClick={() => setMuscle(m.id)} className={cn('shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', muscle === m.id ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500')}>{m.label}</button>
        ))}
      </div>

      <p className="mb-3 text-[11px] text-zinc-600">{list.length} exercises</p>
      <ul className="nice-scroll max-h-[560px] space-y-2 overflow-y-auto pr-1">
        {list.map((e) => (
          <li key={e.id} className="rounded-xl border border-zinc-800/60 bg-zinc-950/40">
            <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-center justify-between gap-3 p-3.5 text-left">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-200">{e.name}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {e.muscles.slice(0, 3).map((m) => <Tag key={m}>{MUSCLE_MAP[m].label}</Tag>)}
                  {e.equipment.slice(0, 2).map((x) => <Tag key={x}>{x}</Tag>)}
                  <Tag tone="amber">MET {e.met}</Tag>
                </div>
              </div>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-600 transition-transform', open === e.id && 'rotate-180')} />
            </button>
            {open === e.id && (
              <div className="border-t border-zinc-800/60 px-3.5 py-3">
                <ul className="space-y-1.5">
                  {e.cues.map((c, i) => (
                    <li key={i} className="flex gap-2 text-xs leading-relaxed text-zinc-400">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="mt-2.5 text-[10px] text-zinc-600">
                  Secondary: {e.secondary.map((m) => MUSCLE_MAP[m].label).join(', ') || '—'} · Difficulty {'●'.repeat(e.difficulty)}{'○'.repeat(3 - e.difficulty)}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ================= TOOLS ================= */

function ToolsTab() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <OneRmTool />
      <RestTimer />
      <VolumeLandmarks />
      <PlateCalculator />
    </div>
  );
}

function OneRmTool() {
  const [w, setW] = useState(60);
  const [r, setR] = useState(5);
  // R69-a — calc's 1RM estimators now return `number | null` (honest domain:
  // integer reps 1-12 at a positive load); null renders as an honest '—',
  // never a fabricated 0.
  const epl = epley1RM(w, r);
  const brz = brzycki1RM(w, r);
  const avg = estimate1RM(w, r);
  return (
    <div className={cn(card, 'p-5')}>
      <SectionHeader title="1RM estimator" sub="Epley 1985 × Brzycki 1993 — averaged" />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Weight (kg)</label>
          <Input type="number" inputMode="decimal" value={w || ''} onChange={(e) => setW(parseFloat(e.target.value || '0'))} className="h-11 border-zinc-800 bg-zinc-950/60 font-mono" />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Reps (≤12 best)</label>
          <Input type="number" inputMode="numeric" value={r || ''} onChange={(e) => setR(parseInt(e.target.value || '1', 10))} className="h-11 border-zinc-800 bg-zinc-950/60 font-mono" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[
          { l: 'Epley', v: epl },
          { l: 'Brzycki', v: brz },
          { l: 'Average', v: avg, hi: true },
        ].map((x) => (
          <div key={x.l} className={cn('rounded-xl border p-3', x.hi ? 'border-emerald-800/70 bg-emerald-950/40' : 'border-zinc-800 bg-zinc-950/40')}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{x.l}</div>
            <div className={cn('mt-0.5 font-mono text-xl font-bold', x.hi ? 'text-emerald-300' : 'text-zinc-200')}>{x.v ?? '—'}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 space-y-1.5">
        {PERCENT_1RM.map((p) => (
          <div key={p.pct} className="flex items-center gap-3 text-xs">
            <span className="w-10 font-mono font-bold text-zinc-300">{p.pct}%</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.pct}%` }} />
            </div>
            <span className="w-16 text-right font-mono text-zinc-400">{avg == null ? '—' : `${Math.round((avg * p.pct) / 100)} kg`}</span>
            <span className="hidden w-24 text-right text-[10px] text-zinc-600 sm:block">{p.adapts}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RestTimer() {
  const [time, setTime] = useState(90);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => {
      setTime((t) => {
        if (t <= 1) {
          setRunning(false);
          beep();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(i);
  }, [running]);

  const mm = String(Math.floor(time / 60)).padStart(2, '0');
  const ss = String(time % 60).padStart(2, '0');
  const pct = 1 - time / 180;

  return (
    <div className={cn(card, 'relative overflow-hidden p-5')}>
      <SectionHeader title="Rest timer" sub="3–5 min compounds · 1.5–3 min isolation (ACSM)" />
      <div className="relative mx-auto my-2 flex h-40 w-40 items-center justify-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
          <circle cx="50" cy="50" r="46" fill="none" stroke="#27272a" strokeWidth="5" />
          <circle
            cx="50" cy="50" r="46" fill="none"
            stroke={time === 0 ? '#fbbf24' : '#34d399'}
            strokeWidth="5" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 46}
            strokeDashoffset={2 * Math.PI * 46 * Math.min(1, pct)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear"
          />
        </svg>
        <div className="text-center">
          <div className={cn('font-mono text-4xl font-black tabular-nums', time === 0 ? 'text-amber-400' : 'text-zinc-50')}>{mm}:{ss}</div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-600">{time === 0 ? 'GO' : running ? 'resting' : 'ready'}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5">
        {[60, 90, 120, 180, 300].map((s) => (
          <button key={s} onClick={() => { setTime(s); setRunning(false); }} className={cn('rounded-full border px-3 py-1.5 font-mono text-[11px] font-bold transition', time === s ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600')}>
            {s / 60 >= 1 ? `${s / 60}m` : `${s}s`}
          </button>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setRunning((r) => !r)} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-500 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.99]">
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {running ? 'Pause' : time === 0 ? 'Restart' : 'Start'}
        </button>
        <button onClick={() => { setRunning(false); setTime(90); }} aria-label="Reset timer" className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-800 text-zinc-400 transition hover:border-zinc-600">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* audio unavailable */
  }
}

function VolumeLandmarks() {
  const days = useDays();
  const sets = muscleSets(days, todayStr());
  return (
    <div className={cn(card, 'p-5 lg:col-span-2')}>
      <SectionHeader
        title="Weekly volume landmarks"
        sub="Direct sets per muscle · MEV → MAV → MRV (Israetel & Hoffmann 2019)"
        right={<span className="font-mono text-[11px] text-zinc-500">last 7 days</span>}
      />
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {MUSCLES.map((m) => {
          const v = sets[m.id] ?? 0;
          const p = Math.min(1, v / m.mrv);
          const zone = v < m.mev ? 'zinc' : v <= m.mav ? 'emerald' : 'rose';
          const bar = { zinc: 'bg-zinc-600', emerald: 'bg-emerald-500', rose: 'bg-rose-500' }[zone];
          return (
            <div key={m.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-300">{m.label}</span>
                <span className="font-mono tabular-nums text-zinc-500">
                  <span className={zone === 'emerald' ? 'text-emerald-400' : zone === 'rose' ? 'text-rose-400' : 'text-zinc-300'}>{Math.round(v)}</span>
                  {' '}/ MEV {m.mev} · MRV {m.mrv}
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800">
                <div className={cn('h-full rounded-full transition-all duration-500', bar)} style={{ width: `${p * 100}%` }} />
                <div className="absolute top-0 h-full w-px bg-amber-500/70" style={{ left: `${(m.mev / m.mrv) * 100}%` }} />
                <div className="absolute top-0 h-full w-px bg-emerald-300/50" style={{ left: `${(m.mav / m.mrv) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-zinc-600">
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-zinc-600" /> below MEV</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500" /> productive zone</span>
        <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-rose-500" /> past MRV — fatigue risk</span>
        <span className="flex items-center gap-1"><Gauge className="h-3 w-3" /> markers = MEV / MAV</span>
      </div>
    </div>
  );
}

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

function PlateCalculator() {
  const [target, setTarget] = useState(100);
  const bar = 20;
  const perSide: { plate: number; count: number }[] = [];
  let side = Math.max(0, (target - bar) / 2);
  for (const p of PLATES) {
    const c = Math.floor(side / p + 1e-9);
    if (c > 0) {
      perSide.push({ plate: p, count: c });
      side -= c * p;
    }
  }
  const remainder = Math.round(side * 2 * 100) / 100;
  const colors: Record<number, string> = {
    25: 'bg-red-600', 20: 'bg-blue-700', 15: 'bg-yellow-500', 10: 'bg-emerald-600',
    5: 'bg-zinc-200', 2.5: 'bg-zinc-500', 1.25: 'bg-zinc-700',
  };

  return (
    <div className={cn(card, 'p-5')}>
      <SectionHeader title="Plate calculator" sub={`per side · ${bar} kg bar`} />
      <div className="flex items-center gap-3">
        <Calculator className="h-4 w-4 text-emerald-400" />
        <Input type="number" inputMode="decimal" value={target || ''} onChange={(e) => setTarget(parseFloat(e.target.value || '0'))} className="h-11 w-28 border-zinc-800 bg-zinc-950/60 font-mono" aria-label="Target weight" />
        <span className="text-xs text-zinc-500">kg target</span>
      </div>
      <div className="mt-4 flex min-h-24 flex-wrap items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
        {perSide.length === 0 && <span className="text-xs text-zinc-600">{target <= bar ? `Bar only (${bar} kg)` : '—'}</span>}
        {perSide.map((p) =>
          Array.from({ length: p.count }).map((_, i) => (
            <div
              key={`${p.plate}-${i}`}
              title={`${p.plate} kg`}
              className={cn('rounded-sm shadow', colors[p.plate] ?? 'bg-zinc-600')}
              style={{ width: 9 + p.plate * 0.5, height: 26 + p.plate * 1.7 }}
            />
          )),
        )}
      </div>
      <p className="mt-3 text-center font-mono text-[11px] text-zinc-500">
        {perSide.length > 0
          ? `Each side: ${perSide.map((p) => `${p.count}×${p.plate}`).join(' + ')}${remainder > 0.01 ? ` · ${(target - remainder).toFixed(2)} kg achievable (−${remainder} kg)` : ''}`
          : ''}
      </p>
    </div>
  );
}
