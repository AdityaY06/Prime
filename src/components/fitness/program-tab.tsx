'use client';

import { useMemo, useState } from 'react';
import {
  CalendarDays, Sparkles, RefreshCw, ChevronDown, ChevronRight, Play, Wand2,
  Dumbbell, Clock, Flame, BookOpen, Info, RotateCw, Trash2, Zap, CheckCircle2,
  X, Gauge, TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useFitnessStore, useDays, useProfile } from '@/lib/fitness/store';
import {
  SPLITS, WEEK_LAYOUT, generateProgram, progressionFor, parseRepsLabel, todayProgramHint,
  programAdherence, deloadAdvice, deloadPreview,
} from '@/lib/fitness/program';
import type { DeloadAdvice, DeloadSessionPreview, ProgramAdherence } from '@/lib/fitness/program';
import { MUSCLE_MAP } from '@/lib/fitness/data/muscles';
import { SectionHeader, Tag } from './shared';
import type { Equipment, ProgramConfig, ProgramFocus, ProgramGoal } from '@/lib/fitness/types';
import { prettyDate, todayStr } from '@/lib/fitness/calc';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

export interface SessionPrefill {
  exerciseId: string;
  sets: { weight: number; reps: number }[];
  minutes: number;
  sessionLabel: string;
}

const EQUIPMENT_OPTS: { id: Equipment; label: string }[] = [
  { id: 'barbell', label: 'Barbell' },
  { id: 'dumbbell', label: 'Dumbbell' },
  { id: 'machine', label: 'Machine' },
  { id: 'cable', label: 'Cable' },
  { id: 'kettlebell', label: 'Kettlebell' },
  { id: 'band', label: 'Band' },
];

const FOCUS_OPTS: { id: ProgramFocus; label: string; note: string }[] = [
  { id: 'balanced', label: 'Balanced', note: 'even set distribution' },
  { id: 'upper', label: 'Upper bias', note: '+1 set on upper work' },
  { id: 'lower', label: 'Lower bias', note: '+1 set on lower work' },
];

const GOAL_OPTS: { id: ProgramGoal; label: string; note: string }[] = [
  { id: 'mixed', label: 'Mixed', note: '6–10 reps · size + strength' },
  { id: 'strength', label: 'Strength', note: '4–6 reps on mains @ 80–85%' },
  { id: 'hypertrophy', label: 'Hypertrophy', note: '8–12 reps · volume bias' },
];

export function ProgramTab({ onPrefill }: { onPrefill: (items: SessionPrefill[]) => void }) {
  const cfg = useFitnessStore((s) => s.program);
  const profile = useProfile();
  const days = useDays();
  const setProgram = useFitnessStore((s) => s.setProgram);
  const [deloadDismissed, setDeloadDismissed] = useState(false);

  const generated = useMemo(
    () => (cfg ? generateProgram(cfg, profile, profile.weightKg) : null),
    [cfg, profile],
  );
  const adherence = useMemo(
    () => (cfg ? programAdherence(cfg, days, profile, profile.weightKg) : null),
    [cfg, days, profile],
  );
  const deload = useMemo(() => (cfg ? deloadAdvice(cfg, days) : null), [cfg, days]);
  const deloadSessions = useMemo(
    () => (generated && deload?.recommended ? deloadPreview(generated, days) : null),
    [generated, deload, days],
  );

  if (!cfg || !generated) {
    return <Builder onBuilt={(c) => { setProgram(c); toast.success('Program generated — your coach is live'); }} />;
  }

  const showDeload = deload?.recommended === true && !deloadDismissed;

  return (
    <div className="space-y-4">
      {/* header */}
      <div className={cn(card, 'relative overflow-hidden p-5')}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-zinc-50">{generated.splitName} · {generated.daysPerWeek}-day program</h3>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {generated.layout.join(' · ')} — every muscle ≥ 2×/week, ≥ 48 h apart
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setProgram({ ...cfg, variantSeed: cfg.variantSeed + 1 })}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-[11px] font-semibold text-zinc-300 transition hover:border-emerald-800 hover:text-emerald-400"
            >
              <RotateCw className="h-3.5 w-3.5" /> New variants
            </button>
            <button
              onClick={() => setProgram(null)}
              className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-[11px] font-semibold text-zinc-400 transition hover:border-rose-900 hover:text-rose-400"
            >
              <Trash2 className="h-3.5 w-3.5" /> Rebuild
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MiniStat icon={<Dumbbell className="h-3.5 w-3.5" />} label="sessions / wk" value={String(generated.sessions.length)} />
          <MiniStat icon={<Zap className="h-3.5 w-3.5" />} label="sets / wk" value={String(generated.sessions.reduce((s, x) => s + x.totalSets, 0))} />
          <MiniStat icon={<Clock className="h-3.5 w-3.5" />} label="≈ min / session" value={String(Math.max(...generated.sessions.map((s) => s.estMinutes)))} />
          <MiniStat icon={<Flame className="h-3.5 w-3.5" />} label="≈ kcal / wk" value={String(generated.sessions.reduce((s, x) => s + x.estKcal, 0))} />
        </div>
        <p className="mt-4 border-t border-zinc-800/60 pt-3 text-[11px] italic text-zinc-500">
          “{todayProgramHint()}”
        </p>
      </div>

      {/* deload advisory banner */}
      {showDeload && deload && (
        <DeloadBanner
          advice={deload}
          sessions={deloadSessions ?? []}
          onDismiss={() => setDeloadDismissed(true)}
        />
      )}

      {/* sessions */}
      <div className="grid gap-4 lg:grid-cols-2">
        {generated.sessions.map((s, i) => (
          <SessionCard key={i} session={s} days={days} onPrefill={onPrefill} defaultOpen={i === 0} />
        ))}
      </div>

      {/* adherence tracking */}
      {adherence && adherence.weeksChecked >= 1 && adherence.sessionsPlanned > 0 && (
        <AdherenceCard adherence={adherence} />
      )}

      {/* fatigue watch (compact, only when no deload is recommended) */}
      {deload && !deload.recommended && deload.acwr !== undefined && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800/70 bg-zinc-950/40 px-4 py-2.5 text-[11px] text-zinc-400"
          title="ACWR-lite = last-7-day strength tonnage ÷ mean weekly tonnage of the previous 4 weeks (Gabbett 2016, BJSM). 0.8–1.3 is the sweet spot; > 1.35 suggests a deload; < 0.6 under-training."
        >
          <Gauge className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="font-mono font-bold tabular-nums text-zinc-200">Fatigue watch · ACWR {deload.acwr.toFixed(2)}</span>
          <span className="text-zinc-600">— sweet spot 0.8–1.3 · &gt;1.35 deload · &lt;0.6 under-training</span>
        </div>
      )}

      {/* volume audit */}
      <LandmarkAudit landmarks={generated.landmarks} />

      {/* progression coaching */}
      <ProgressionPanel sessions={generated.sessions} days={days} />

      {/* science */}
      <div className={cn(card, 'p-5')}>
        <SectionHeader title="Why this program works" sub="Every design decision cites its source" />
        <ul className="mt-3 space-y-2.5">
          {generated.science.filter((x) => x.citation).map((s) => (
            <li key={s.label} className="flex gap-2.5 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3">
              <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-300">{s.label}</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">{s.citation}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ================= builder (no program yet) ================= */

function Builder({ onBuilt }: { onBuilt: (cfg: ProgramConfig) => void }) {
  const profile = useProfile();
  const [days, setDays] = useState<number>(profile.experience === 'beginner' ? 3 : 4);
  const [equipment, setEquipment] = useState<Equipment[]>(['barbell', 'dumbbell', 'machine', 'cable']);
  const [focus, setFocus] = useState<ProgramFocus>('balanced');
  const [goal, setGoal] = useState<ProgramGoal>('mixed');

  const split = SPLITS.find((s) => s.days.includes(days)) ?? SPLITS[0];
  const preview = useMemo(
    () =>
      generateProgram(
        { daysPerWeek: days as ProgramConfig['daysPerWeek'], splitId: split.id, equipment, emphasis: focus, goal, variantSeed: 0, createdAt: todayStr() },
        profile,
        profile.weightKg,
      ),
    [days, equipment, focus, goal, split, profile],
  );

  const toggleEquip = (id: Equipment) =>
    setEquipment((es) => (es.includes(id) ? es.filter((e) => e !== id) : [...es, id]));

  return (
    <div className="space-y-4">
      <div className={cn(card, 'relative overflow-hidden p-5')}>
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="flex items-center gap-2">
          <Wand2 className="h-4 w-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-zinc-50">Program generator</h3>
        </div>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-zinc-500">
          A full training week built from your equipment, experience and goal — respecting frequency
          (2×+/muscle), volume landmarks (MEV–MAV) and recovery spacing. Then it watches your logs and
          tells you exactly when to add weight.
        </p>
      </div>

      <div className={cn(card, 'space-y-5 p-5')}>
        <div>
          <Label>Days per week</Label>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={cn(
                  'flex h-11 items-center justify-center rounded-xl border font-mono text-sm font-bold transition',
                  days === d
                    ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300',
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            {split.name} — {split.tagline.toLowerCase()}
          </p>
        </div>

        <div>
          <Label>Equipment you have</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {EQUIPMENT_OPTS.map((e) => (
              <button
                key={e.id}
                onClick={() => toggleEquip(e.id)}
                aria-pressed={equipment.includes(e.id)}
                className={cn(
                  'flex h-9 items-center rounded-lg border px-3 text-[11px] font-semibold transition',
                  equipment.includes(e.id)
                    ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                    : 'border-zinc-800 text-zinc-500 hover:border-zinc-600',
                )}
              >
                {e.label}
              </button>
            ))}
            <span className="flex h-9 items-center rounded-lg border border-dashed border-zinc-800 px-3 text-[11px] text-zinc-600">
              + bodyweight (always)
            </span>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label>Emphasis</Label>
            <div className="mt-2 space-y-1.5">
              {FOCUS_OPTS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFocus(f.id)}
                  aria-pressed={focus === f.id}
                  className={cn(
                    'flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-xs font-semibold transition',
                    focus === f.id ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
                  )}
                >
                  {f.label}
                  <span className="font-mono text-[9px] font-normal opacity-60">{f.note}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label>Rep-range goal</Label>
            <div className="mt-2 space-y-1.5">
              {GOAL_OPTS.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGoal(g.id)}
                  aria-pressed={goal === g.id}
                  className={cn(
                    'flex h-10 w-full items-center justify-between rounded-lg border px-3 text-left text-xs font-semibold transition',
                    goal === g.id ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
                  )}
                >
                  {g.label}
                  <span className="font-mono text-[9px] font-normal opacity-60">{g.note}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* preview strip */}
        <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-4">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Live preview</div>
            <div className="font-mono text-[10px] text-zinc-500">
              {preview.sessions.length} sessions · {WEEK_LAYOUT[days]?.join(' / ')}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.sessions.map((s, i) => (
              <span key={i} className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-400">
                {s.weekday} · {s.label} · {s.totalSets} sets · ~{s.estMinutes}m
              </span>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600">
            {preview.landmarks
              .filter((l) => l.sets > 0)
              .slice(0, 8)
              .map((l) => (
                <span key={l.id}>
                  {l.label} <b className="font-mono text-zinc-400">{l.sets}</b>/{l.mev}–{l.mav}
                </span>
              ))}
          </div>
        </div>

        <button
          onClick={() =>
            onBuilt({
              daysPerWeek: days as ProgramConfig['daysPerWeek'],
              splitId: split.id,
              equipment,
              emphasis: focus,
              goal,
              variantSeed: 0,
              createdAt: todayStr(),
            })
          }
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
        >
          <Sparkles className="h-4 w-4" /> Generate my program
        </button>
      </div>
    </div>
  );
}

/* ================= session card ================= */

function SessionCard({
  session,
  days,
  onPrefill,
  defaultOpen,
}: {
  session: NonNullable<ReturnType<typeof generateProgram>>['sessions'][number];
  days: Record<string, import('@/lib/fitness/types').DayLog>;
  onPrefill: (items: SessionPrefill[]) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const profile = useProfile();

  const startSession = () => {
    const items: SessionPrefill[] = session.exercises.map((pe) => {
      const range = parseRepsLabel(pe.reps);
      const adv = progressionFor(pe.exerciseId, range, days, todayStr());
      const w = adv.suggestedWeight > 0 ? adv.suggestedWeight : profile.experience === 'beginner' ? 20 : 40;
      return {
        exerciseId: pe.exerciseId,
        sets: Array.from({ length: pe.sets }, () => ({ weight: w, reps: range[0] })),
        minutes: 0,
        sessionLabel: session.label,
      };
    });
    onPrefill(items);
    toast.success(`${session.label} loaded into the session builder`, {
      description: 'Working weights pre-filled from your logs — adjust and save.',
    });
  };

  return (
    <div className={cn(card, 'overflow-hidden')}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 p-4 text-left" aria-expanded={open}>
        <div className="flex h-10 w-12 shrink-0 flex-col items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950/60">
          <span className="font-mono text-[9px] uppercase text-zinc-500">{session.weekday}</span>
          <span className="font-mono text-xs font-bold text-emerald-400">{session.totalSets}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-zinc-100">{session.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
            {session.focus} · {session.exercises.length} exercises · ~{session.estMinutes} min · ≈{session.estKcal} kcal
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 shrink-0 text-zinc-500" /> : <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />}
      </button>

      {open && (
        <div className="border-t border-zinc-800/70 p-4">
          <ul className="space-y-2">
            {session.exercises.map((pe, i) => {
              const range = parseRepsLabel(pe.reps);
              const adv = progressionFor(pe.exerciseId, range, days, todayStr());
              return (
                <li key={pe.exerciseId + i} className="rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[10px] text-zinc-600">{String(i + 1).padStart(2, '0')}</span>
                        <span className="truncate text-[13px] font-semibold text-zinc-100">{pe.name}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Tag tone="emerald">{pe.sets} × {pe.reps}</Tag>
                        <Tag tone="amber">{pe.rir}</Tag>
                        <Tag>rest {pe.restSec >= 120 ? `${Math.round(pe.restSec / 60)} min` : `${pe.restSec}s`}</Tag>
                      </div>
                      {pe.muscles.slice(0, 2).map((m) => (
                        <span key={m} className="mr-2 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                          {MUSCLE_MAP[m]?.label}
                        </span>
                      ))}
                    </div>
                    {/* progression chip */}
                    <div className="shrink-0 text-right">
                      {adv.action === 'add-weight' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-700/60 bg-emerald-950/50 px-2 py-1 font-mono text-[10px] font-bold text-emerald-300">
                          <TrendingUp /> +{Math.round((adv.suggestedWeight - (adv.bestSet?.weight ?? 0)) * 10) / 10} kg
                        </span>
                      )}
                      {adv.action === 'add-reps' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-amber-800/60 bg-amber-950/40 px-2 py-1 font-mono text-[10px] font-bold text-amber-300">
                          <TrendingUp /> +1 rep
                        </span>
                      )}
                      {adv.action === 'consolidate' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400">
                          consolidate
                        </span>
                      )}
                      {adv.action === 'baseline' && (
                        <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 font-mono text-[10px] text-zinc-600">
                          baseline
                        </span>
                      )}
                      {adv.bestSet && (
                        <div className="mt-1 font-mono text-[9px] text-zinc-600">
                          last: {adv.bestSet.weight}×{adv.bestSet.reps}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <button
            onClick={startSession}
            className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
          >
            <Play className="h-3.5 w-3.5" /> Start {session.label}
          </button>
        </div>
      )}
    </div>
  );
}

function TrendingUp() {
  return <span aria-hidden>▲</span>;
}

/* ================= landmark audit ================= */

function LandmarkAudit({ landmarks }: { landmarks: NonNullable<ReturnType<typeof generateProgram>>['landmarks'] }) {
  const shown = landmarks.filter((l) => l.sets > 0);
  return (
    <div className={cn(card, 'p-5')}>
      <SectionHeader
        title="Weekly volume audit"
        sub="Programmed sets vs MEV–MAV–MRV landmarks (Israetel & Hoffmann 2019)"
        right={<Tag tone="emerald">{shown.filter((l) => l.status === 'zone').length} in zone</Tag>}
      />
      <div className="nice-scroll mt-3 max-h-96 space-y-2.5 overflow-y-auto pr-1">
        {shown.map((l) => {
          const pct = Math.min(100, (l.sets / l.mrv) * 100);
          const mevPct = (l.mev / l.mrv) * 100;
          const mavPct = (l.mav / l.mrv) * 100;
          const tone =
            l.status === 'zone' ? 'bg-emerald-500'
            : l.status === 'below' ? 'bg-amber-500'
            : l.status === 'high' ? 'bg-lime-500'
            : 'bg-rose-500';
          return (
            <div key={l.id}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-300">{l.label}</span>
                <span className="font-mono text-[10px] text-zinc-500">
                  <b className="text-zinc-200">{l.sets}</b> sets · MEV {l.mev} · MAV {l.mav} · MRV {l.mrv}
                </span>
              </div>
              <div className="relative h-2.5 overflow-hidden rounded-full bg-zinc-800/80">
                {/* MEV→MAV optimal zone shading */}
                <div className="absolute inset-y-0 bg-emerald-500/15" style={{ left: `${mevPct}%`, width: `${mavPct - mevPct}%` }} />
                <div className={cn('h-full rounded-full transition-all', tone)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[10px] leading-relaxed text-zinc-600">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        Fractional sets count compound overlap: primary movers full credit, secondaries half — the same
        convention the Body tab uses for your logged volume.
      </p>
    </div>
  );
}

/* ================= progression coaching panel ================= */

function ProgressionPanel({
  sessions,
  days,
}: {
  sessions: NonNullable<ReturnType<typeof generateProgram>>['sessions'];
  days: Record<string, import('@/lib/fitness/types').DayLog>;
}) {
  const advices = useMemo(() => {
    const seen = new Set<string>();
    const out: ReturnType<typeof progressionFor>[] = [];
    for (const s of sessions) {
      for (const pe of s.exercises) {
        if (seen.has(pe.exerciseId)) continue;
        seen.add(pe.exerciseId);
        out.push(progressionFor(pe.exerciseId, parseRepsLabel(pe.reps), days, todayStr()));
      }
    }
    return out.sort((a, b) => Number(b.lastDate !== null) - Number(a.lastDate !== null));
  }, [sessions, days]);

  const withHistory = advices.filter((a) => a.lastDate);
  const actionable = withHistory.filter((a) => a.action === 'add-weight' || a.action === 'add-reps');

  return (
    <div className={cn(card, 'p-5')}>
      <SectionHeader
        title="Progressive overload coach"
        sub="Compares this program against your logged history — 90-day lookback"
        right={
          actionable.length > 0 ? (
            <Tag tone="emerald">{actionable.length} lift{actionable.length > 1 ? 's' : ''} ready</Tag>
          ) : (
            <Tag>log your first session</Tag>
          )
        }
      />
      <div className="nice-scroll mt-3 max-h-96 space-y-2 overflow-y-auto pr-1">
        {advices.map((a) => (
          <div
            key={a.exerciseId}
            className={cn(
              'rounded-xl border p-3',
              a.action === 'add-weight'
                ? 'border-emerald-800/50 bg-emerald-950/20'
                : a.action === 'add-reps'
                  ? 'border-amber-900/40 bg-amber-950/10'
                  : 'border-zinc-800/60 bg-zinc-950/40',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-100">{a.name}</span>
              <span className="font-mono text-[9px] text-zinc-600">
                {a.lastDate ? `target ${a.targetReps[0]}–${a.targetReps[1]} reps` : 'no history'}
              </span>
            </div>
            {a.bestSet && (
              <div className="mt-1 font-mono text-[10px] text-zinc-500">
                last best set <b className="text-zinc-300">{a.bestSet.weight} kg × {a.bestSet.reps}</b>
                {' · '}
                {(a.lastVolumeKg / 1000).toFixed(2)} t volume
              </div>
            )}
            <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-zinc-400">
              {a.action === 'add-weight' ? (
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
              ) : (
                <RefreshCw className="mt-0.5 h-3 w-3 shrink-0 text-zinc-600" />
              )}
              {a.advice}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= adherence tracking card ================= */

function adherenceVerdict(a: ProgramAdherence): string {
  const { sessionsLogged: l, sessionsPlanned: p, pct } = a;
  if (p === 0) return 'No scheduled sessions yet — train your plan and the receipts appear here.';
  if (pct === 100) {
    return `${l} of ${p} planned sessions logged — flawless. Regular activity across the week is the foundation of every guideline (WHO 2020).`;
  }
  if (pct >= 75) {
    return `${l} of ${p} planned sessions logged — consistency beats intensity (WHO 2020 guidelines on regular activity).`;
  }
  if (pct >= 50) {
    return `${l} of ${p} planned sessions logged — showing up is the strongest predictor of long-term participation (Rhodes et al. 2017, Psychology & Health).`;
  }
  return `Only ${l} of ${p} planned sessions logged — shrink the plan to what you will actually do rather than abandoning it (WHO 2020: some activity always beats none).`;
}

function AdherenceCard({ adherence }: { adherence: ProgramAdherence }) {
  return (
    <div className={cn(card, 'relative overflow-hidden p-5')}>
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
      <SectionHeader
        title="Program adherence"
        sub={`Planned vs logged sessions · ${adherence.weeksChecked} week${adherence.weeksChecked > 1 ? 's' : ''} checked`}
        right={
          <Tag tone={adherence.pct >= 75 ? 'emerald' : adherence.pct >= 50 ? 'amber' : 'zinc'}>
            {adherence.pct}%
          </Tag>
        }
      />
      <div className="flex flex-wrap items-end gap-x-5 gap-y-2">
        <div className="font-mono text-5xl font-black tabular-nums leading-none text-zinc-50">
          {adherence.pct}
          <span className="text-lg text-zinc-500">%</span>
        </div>
        <div className="pb-0.5 font-mono text-[11px] text-zinc-500">
          <b className="text-emerald-400">{adherence.sessionsLogged}</b> of {adherence.sessionsPlanned} planned sessions logged
        </div>
      </div>

      {/* last-4-week compliance chips: emerald = done, amber = partial (≥ half), zinc = missed */}
      {adherence.perSession.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Last 4 weeks · per session</div>
          <div className="flex flex-wrap gap-1.5">
            {adherence.perSession.map((o, i) => {
              const half = Math.ceil(o.planned / 2);
              const tone =
                o.done ? 'emerald'
                : o.logged >= half && o.logged > 0 ? 'amber'
                : 'zinc';
              return (
                <span
                  key={`${o.date}-${o.label}-${i}`}
                  title={`${prettyDate(o.date)} · ${o.label}: ${o.logged}/${o.planned} prescribed exercises logged${o.done ? ' — done' : tone === 'amber' ? ' — partial' : ' — missed'}`}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-mono text-[10px] font-bold tabular-nums',
                    tone === 'emerald'
                      ? 'border-emerald-800/60 bg-emerald-950/50 text-emerald-300'
                      : tone === 'amber'
                        ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                        : 'border-zinc-800 bg-zinc-950/60 text-zinc-500',
                  )}
                >
                  {prettyDate(o.date)} · {o.label} · {o.logged}/{o.planned}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-4 border-t border-zinc-800/60 pt-3 text-[11px] leading-relaxed text-zinc-400">
        <CheckCircle2 className="mr-1.5 inline h-3 w-3 text-emerald-500" />
        {adherenceVerdict(adherence)}
      </p>
      <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">
        A session counts when ≥ half its prescribed exercises (by name) or 3+ strength entries were logged that day.
        Future sessions are never marked missed.
      </p>
    </div>
  );
}

/* ================= deload advisory banner ================= */

function DeloadBanner({
  advice,
  sessions,
  onDismiss,
}: {
  advice: DeloadAdvice;
  sessions: DeloadSessionPreview[];
  onDismiss: () => void;
}) {
  // ACWR < 0.6 + week ≥ 4 is the under-training branch: scaling further down
  // would be wrong, so the "what it looks like" preview is hidden there.
  const underTraining = advice.acwr !== undefined && advice.acwr < 0.6;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-700/70 bg-amber-950/20 p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/60 bg-amber-950/50">
            <TrendingDown className="h-4 w-4 text-amber-400" />
          </span>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-amber-300">Deload week recommended</h3>
            <p className="mt-0.5 font-mono text-[10px] text-amber-500/80">
              week {advice.weekNumber}
              {advice.acwr !== undefined && <> · ACWR {advice.acwr.toFixed(2)}</>}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Dismiss deload advisory"
          title="Dismiss for this visit"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-amber-900/60 text-amber-400/80 transition hover:border-amber-700 hover:text-amber-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-amber-100/80">{advice.reason}</p>

      {!underTraining && sessions.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500/80">What your deload week looks like</div>
          <div className="mt-2 space-y-2">
            {sessions.map((s) => {
              const deloadSets = s.exercises.reduce((a, e) => a + e.sets, 0);
              return (
                <div key={s.label} className="rounded-xl border border-amber-900/40 bg-zinc-950/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-zinc-100">
                      <span className="font-mono text-[10px] text-zinc-500">{s.weekday}</span> · {s.label}
                    </span>
                    <span className="font-mono text-[10px] font-bold tabular-nums text-amber-400">
                      {deloadSets} sets · ≈ −50% · reps held
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.exercises.map((e, i) => (
                      <span
                        key={`${e.name}-${i}`}
                        className="rounded-md border border-zinc-800 bg-zinc-900/70 px-2 py-1 font-mono text-[10px] text-zinc-400"
                      >
                        {e.name} · <b className="text-zinc-200">{e.sets}×{e.reps}</b>
                        {e.suggestedLoad !== null ? ` @ ${e.suggestedLoad} kg` : ' @ −10% of last load'}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">
            Sets ≈ halved (ceil of half), reps unchanged, suggested load −10% off your last logged best set —
            rounded to 2.5 kg on barbell lifts. Prescriptions re-derive from your logs each visit.
          </p>
        </div>
      )}
    </div>
  );
}

/* ================= bits ================= */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{children}</div>;
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800/70 bg-zinc-950/50 p-3">
      <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-zinc-500">
        <span className="text-emerald-600">{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-mono text-lg font-bold text-zinc-100">{value}</div>
    </div>
  );
}
