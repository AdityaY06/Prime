'use client';

import { useMemo, useState } from 'react';
import { Info, MousePointerClick, RotateCcw, Save, TrendingUp, Dumbbell, Ruler, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useFitnessStore, useDay, useDays, usePlan, useProfile } from '@/lib/fitness/store';
import { bmi, bmiCategory, muscleSets, todayStr } from '@/lib/fitness/calc';
import { MUSCLES, MUSCLE_MAP } from '@/lib/fitness/data/muscles';
import { EXERCISES } from '@/lib/fitness/data/exercises';
import { MuscleFigure } from './HumanModel';
import { SectionHeader, Tag } from './shared';
import type { Measurement, MuscleId, TabId } from '@/lib/fitness/types';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

/* ---------- circumference sites: waist/hip down = leaner, the rest up = grown ---------- */
const MEAS_SITES = [
  { key: 'waist', field: 'waistCm', downIsGood: true },
  { key: 'chest', field: 'chestCm', downIsGood: false },
  { key: 'arm', field: 'armCm', downIsGood: false },
  { key: 'thigh', field: 'thighCm', downIsGood: false },
  { key: 'hip', field: 'hipCm', downIsGood: true },
] as const;

type MeasField = (typeof MEAS_SITES)[number]['field'];

const fmtDelta = (d: number) => `${d > 0 ? '+' : d < 0 ? '-' : '±'}${Math.abs(d).toFixed(1)}`;

/* ---------- hand-rolled mini sparkline (~100×28, emerald, dot on last point) ---------- */
function Sparkline({ values, w = 100, h = 28 }: { values: number[]; w?: number; h?: number }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  const pad = 3;
  const x = (i: number) => (values.length <= 1 ? w / 2 : pad + (i / (values.length - 1)) * (w - pad * 2));
  const y = (v: number) => (range === 0 ? h / 2 : pad + (1 - (v - min) / range) * (h - pad * 2));
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lx = x(values.length - 1);
  const ly = y(values[values.length - 1]);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path d={d} fill="none" stroke="#e4e4e7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r="2.5" fill="#fbbf24" />
    </svg>
  );
}

export function BodyView({ onNavigate }: { onNavigate: (t: TabId) => void }) {
  const days = useDays();
  const profile = useProfile();
  const plan = usePlan();
  const day = useDay(todayStr());
  const measurements = useFitnessStore((s) => s.measurements);
  const addMeasurement = useFitnessStore((s) => s.addMeasurement);
  const setWeight = useFitnessStore((s) => s.setWeight);

  const [selected, setSelected] = useState<MuscleId | null>('chest');
  const [weightInput, setWeightInput] = useState<string>('');
  const [meas, setMeas] = useState<{ waist?: string; chest?: string; arm?: string; thigh?: string; hip?: string }>({});

  const sets = useMemo(() => muscleSets(days, todayStr()), [days]);
  const bmiV = bmi(profile.weightKg, profile.heightCm);
  const bmiCat = bmiCategory(bmiV);
  const lastMeas = measurements[measurements.length - 1];

  /* circumference history per site (store keeps entries sorted by date) */
  const trends = useMemo(
    () =>
      MEAS_SITES.map((s) => ({
        ...s,
        values: measurements.map((m) => m[s.field]).filter((v): v is number => v != null),
      })),
    [measurements],
  );
  const lastBy = (field: MeasField) => {
    for (let i = measurements.length - 1; i >= 0; i--) {
      const v = measurements[i][field];
      if (v != null) return v;
    }
    return undefined;
  };
  const lastWaist = lastBy('waistCm');
  const lastHip = lastBy('hipCm');
  const whr = lastWaist != null && lastHip != null && lastHip > 0 ? lastWaist / lastHip : null;
  const whtr = lastWaist != null && profile.heightCm > 0 ? lastWaist / profile.heightCm : null;
  /* WHO 1998/2004: WHR risk ≥ 0.90 (male) / ≥ 0.85 (female) */
  const whrCut = profile.sex === 'female' ? 0.85 : 0.9;

  const targeting = selected
    ? EXERCISES.filter((e) => e.type === 'strength' && (e.muscles.includes(selected!) || e.secondary.includes(selected!))).slice(0, 6)
    : [];

  const meta = selected ? MUSCLE_MAP[selected] : null;
  const curSets = selected ? Math.round(sets[selected] ?? 0) : 0;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Body atlas</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Click a muscle · colour = weekly set volume · drag to rotate</p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <MousePointerClick className="h-3.5 w-3.5 text-amber-500" /> 14 interactive muscle groups
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* 3D figure */}
        <div className={cn(card, 'relative overflow-hidden lg:col-span-5')}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(16,185,129,0.08),transparent_60%)]" />
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Interactive form
              <span className="font-mono text-zinc-400/90">{profile.sex === 'female' ? '♀ female' : '♂ male'}</span>
            </span>
            <button onClick={() => setSelected(null)} className="flex items-center gap-1 text-[10px] font-semibold text-zinc-500 transition hover:text-zinc-300">
              <RotateCcw className="h-3 w-3" /> clear
            </button>
          </div>
          <MuscleFigure
            className="h-[460px] w-full touch-none"
            sets={sets}
            selected={selected}
            onSelect={setSelected}
            sex={profile.sex}
          />
          <div className="flex items-center justify-center gap-2 border-t border-zinc-800/60 px-4 py-2.5 text-[10px] text-zinc-600">
            <span className="h-2 w-2 rounded-sm bg-zinc-600" /> 0 sets
            <span className="h-2 w-2 rounded-sm bg-zinc-700" /> below MEV
            <span className="h-2 w-2 rounded-sm bg-amber-500" /> productive
            <span className="h-2 w-2 rounded-sm bg-amber-300" /> at MAV
            <span className="h-2 w-2 rounded-sm bg-amber-400" /> selected
          </div>
        </div>

        {/* muscle panel */}
        <div className="space-y-4 lg:col-span-4">
          {meta ? (
            <div className={cn(card, 'p-5')}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-zinc-50">{meta.label}</h3>
                <Tag tone={curSets >= meta.mev ? 'emerald' : 'zinc'}>
                  {curSets >= meta.mev ? (curSets <= meta.mav ? 'productive zone' : 'high volume') : 'below MEV'}
                </Tag>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{meta.blurb}</p>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Weekly direct sets</span>
                  <span className="font-mono font-bold text-amber-400">{curSets}</span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className={cn('h-full rounded-full', curSets < meta.mev ? 'bg-zinc-600' : curSets <= meta.mav ? 'bg-amber-500' : 'bg-rose-500')}
                    style={{ width: `${Math.min(100, (curSets / meta.mrv) * 100)}%` }}
                  />
                  <div className="absolute top-0 h-full w-0.5 bg-amber-500/80" style={{ left: `${(meta.mev / meta.mrv) * 100}%` }} />
                  <div className="absolute top-0 h-full w-0.5 bg-amber-300/60" style={{ left: `${(meta.mav / meta.mrv) * 100}%` }} />
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
                  <span>0</span><span className="text-amber-600">MEV {meta.mev}</span><span className="text-amber-500">MAV {meta.mav}</span><span>MRV {meta.mrv}</span>
                </div>
              </div>
              <p className="mt-3 border-t border-zinc-800/60 pt-3 text-[10px] leading-relaxed text-zinc-600">
                <Info className="mr-1 inline h-3 w-3" />
                Landmarks are approximate starting points (Israetel &amp; Hoffmann 2019) — adjust to your own recovery and progression.
              </p>
            </div>
          ) : (
            <div className={cn(card, 'flex h-full min-h-40 items-center justify-center p-5 text-center text-xs text-zinc-600')}>
              Select a muscle on the figure or below
            </div>
          )}

          {/* targeting exercises */}
          {selected && (
            <div className={cn(card, 'p-5')}>
              <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Targets {meta?.label}</h3>
              <ul className="space-y-1.5">
                {targeting.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => onNavigate('train')}
                      className="flex w-full items-center justify-between rounded-lg border border-zinc-800/60 bg-zinc-950/40 px-3 py-2 text-left text-xs transition hover:border-amber-800"
                    >
                      <span className="truncate text-zinc-300">{e.name}</span>
                      <Dumbbell className="h-3 w-3 shrink-0 text-zinc-600" />
                    </button>
                  </li>
                ))}
              </ul>
              <button onClick={() => onNavigate('train')} className="mt-3 w-full rounded-lg border border-dashed border-zinc-700 py-2 text-[11px] font-semibold text-zinc-500 transition hover:border-amber-800 hover:text-amber-400">
                Open training session →
              </button>
            </div>
          )}
        </div>

        {/* BMI + quick weight log */}
        <div className="space-y-4 lg:col-span-3">
          <div className={cn(card, 'p-5')}>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">BMI · WHO bands</h3>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-black text-zinc-50">{bmiV}</span>
              <span className={cn('text-xs font-bold', bmiCat.tone === 'ok' ? 'text-teal-400' : bmiCat.tone === 'low' ? 'text-amber-400' : 'text-rose-400')}>{bmiCat.label}</span>
            </div>
            <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-gradient-to-r from-amber-500 via-teal-400 to-rose-500">
              <div className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-zinc-100 shadow" style={{ left: `${Math.min(98, Math.max(2, ((bmiV - 14) / 26) * 100))}%` }} />
            </div>
            <div className="mt-1 flex justify-between font-mono text-[9px] text-zinc-600">
              <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">BMI ignores muscle mass — pair it with the waist measurement below for a better picture.</p>
          </div>

          <div className={cn(card, 'p-5')}>
            <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
              <TrendingUp className="h-3.5 w-3.5 text-amber-400" /> Quick weight log
            </h3>
            <div className="flex gap-2">
              <Input
                type="number" inputMode="decimal" placeholder={`${profile.weightKg} kg`}
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-10 border-zinc-800 bg-zinc-950/60 font-mono"
              />
              <button
                onClick={() => {
                  const v = parseFloat(weightInput);
                  if (!v || v < 25 || v > 300) return toast.error('Enter a valid weight');
                  setWeight(todayStr(), v);
                  useFitnessStore.getState().updateProfile({ weightKg: v });
                  setWeightInput('');
                  toast.success(`Weight logged: ${v} kg`, { description: 'Daily quests +6 XP · plan auto-recalculates' });
                }}
                className="h-10 shrink-0 rounded-lg bg-amber-500 px-4 text-xs font-bold text-zinc-950 transition hover:bg-amber-400 active:scale-95"
              >
                Log
              </button>
            </div>
            {day.weightKg && <p className="mt-2 font-mono text-[10px] text-zinc-500">today: {day.weightKg} kg</p>}
          </div>
        </div>
      </div>

      {/* tape measurements: form + trends + shape ratios */}
      <div className="grid gap-4 lg:grid-cols-12">
        {/* input form */}
        <div className={cn(card, 'p-5 lg:col-span-4')}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-zinc-400">Measurements · cm</h3>
          <div className="grid grid-cols-2 gap-2">
            {MEAS_SITES.map((s) => (
              <div key={s.key}>
                <label className="mb-1 block text-[10px] font-semibold capitalize text-zinc-500">
                  {s.key}
                  {lastMeas?.[s.field] != null && <span className="ml-1 font-mono text-zinc-600">{lastMeas[s.field]}</span>}
                </label>
                <Input
                  type="number" inputMode="decimal" placeholder="—"
                  value={meas[s.key] ?? ''}
                  onChange={(e) => setMeas({ ...meas, [s.key]: e.target.value })}
                  className="h-9 border-zinc-800 bg-zinc-950/60 font-mono text-xs"
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => {
              const m: Partial<Measurement> = {};
              for (const [k, v] of Object.entries(meas)) {
                const n = parseFloat(v ?? '');
                if (Number.isFinite(n) && n > 0) m[`${k}Cm` as MeasField] = n;
              }
              if (Object.keys(m).length === 0) return toast.error('Enter at least one measurement');
              addMeasurement({ ts: todayStr(), ...m });
              setMeas({});
              toast.success('Measurements saved', { description: 'Tape trends & shape ratios updated' });
            }}
            className="mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-zinc-700 text-xs font-bold text-zinc-300 transition hover:border-amber-700 hover:text-amber-400 active:scale-[0.98]"
          >
            <Save className="h-3.5 w-3.5" /> Save
          </button>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">One entry per day (re-saving overwrites) — log weekly and the trends &amp; ratios beside this card light up.</p>
        </div>

        {/* tape trends */}
        <div className={cn(card, 'p-5 lg:col-span-5')}>
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Ruler className="h-3.5 w-3.5 text-amber-400" /> Tape trends
          </h3>
          <ul className="space-y-2">
            {trends.map((t) => {
              if (t.values.length < 2) {
                return (
                  <li
                    key={t.key}
                    data-site={t.key}
                    className="flex items-center justify-between rounded-xl border border-dashed border-zinc-800/60 px-3 py-2.5 text-[11px] text-zinc-600"
                  >
                    <span className="font-semibold capitalize">{t.key}</span>
                    <span>log twice to see a trend</span>
                  </li>
                );
              }
              const first = t.values[0];
              const last = t.values[t.values.length - 1];
              const d = last - first;
              const good = t.downIsGood ? d < 0 : d > 0;
              return (
                <li key={t.key} data-site={t.key} className="flex items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3">
                  <div className="w-14 shrink-0">
                    <div className="text-xs font-bold capitalize text-zinc-200">{t.key}</div>
                    <div className="font-mono text-[9px] text-zinc-600">{t.values.length} entries</div>
                  </div>
                  <Sparkline values={t.values} />
                  <div className="ml-auto min-w-0 text-right">
                    <div className="font-mono text-xs tabular-nums text-zinc-300">{first} → {last} cm</div>
                    <div className={cn('font-mono text-[11px] font-bold tabular-nums', good ? 'text-amber-400' : 'text-zinc-500')}>
                      Δ {fmtDelta(d)} cm
                    </div>
                    <div className="font-mono text-[9px] text-zinc-600">last: {last} cm</div>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-[10px] leading-relaxed text-zinc-600">Δ compares your first vs latest entry per site — waist &amp; hip trending down, chest / arms / thighs up.</p>
        </div>

        {/* shape ratios */}
        <div className={cn(card, 'p-5 lg:col-span-3')}>
          <h3 className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Scale className="h-3.5 w-3.5 text-amber-400" /> Shape ratios
          </h3>
          <div className="space-y-4">
            {/* waist-to-hip */}
            <div data-ratio="whr">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-300">Waist ÷ hip</span>
                {whr != null ? (
                  <Tag tone={whr >= whrCut ? 'rose' : 'emerald'}>{whr >= whrCut ? 'elevated risk' : 'low risk'}</Tag>
                ) : (
                  <Tag tone="zinc">no data</Tag>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-2xl font-black tabular-nums text-zinc-50">{whr != null ? whr.toFixed(2) : '—'}</span>
                <span className="font-mono text-[10px] text-zinc-600">
                  {whr != null ? `${lastWaist} / ${lastHip} cm` : 'log waist + hip'} · cutoff ≥ {whrCut.toFixed(2)} ({profile.sex})
                </span>
              </div>
            </div>
            {/* waist-to-height */}
            <div data-ratio="whtr">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-300">Waist ÷ height</span>
                {whtr != null ? (
                  <Tag tone={whtr < 0.5 ? 'emerald' : 'amber'}>{whtr < 0.5 ? 'healthy' : 'elevated'}</Tag>
                ) : (
                  <Tag tone="zinc">no data</Tag>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-2xl font-black tabular-nums text-zinc-50">{whtr != null ? whtr.toFixed(2) : '—'}</span>
                <span className="font-mono text-[10px] text-zinc-600">
                  {whtr != null ? `${lastWaist} / ${profile.heightCm} cm` : 'log waist'} · healthy &lt; 0.50
                </span>
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-zinc-800/60 pt-3 text-[10px] leading-relaxed text-zinc-600">
            WHR risk bands: WHO 1998/2004 (≥ 0.90 ♂ / ≥ 0.85 ♀) · WHtR &ldquo;keep your waist under half your height&rdquo;: Ashwell et al. 2012 (WHO briefing).
          </p>
        </div>
      </div>

      {/* muscle chips */}
      <div className={cn(card, 'p-5')}>
        <SectionHeader title="All groups · weekly sets" sub="click to inspect on the figure" />
        <div className="flex flex-wrap gap-2">
          {MUSCLES.map((m) => {
            const v = Math.round(sets[m.id] ?? 0);
            const active = selected === m.id;
            const tone = v === 0 ? 'zinc' : v < m.mev ? 'low' : v <= m.mav ? 'ok' : 'high';
            return (
              <button
                key={m.id}
                onClick={() => setSelected(active ? null : m.id)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition',
                  active
                    ? 'border-amber-500 bg-amber-950/40 text-amber-300'
                    : tone === 'ok'
                      ? 'border-amber-800/70 bg-amber-950/30 text-amber-300 hover:border-amber-700'
                      : tone === 'high'
                        ? 'border-rose-900/70 bg-rose-950/30 text-rose-300 hover:border-rose-700'
                        : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700',
                )}
              >
                {m.label}
                <span className="font-mono text-[10px] opacity-80">{v}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
