'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ChevronLeft, ArrowRight, Flame, Activity, Dumbbell, MinusCircle, RefreshCcw, PlusCircle, Calculator, BookOpen } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ACTIVITY_LEVELS, computePlan, bmi, bmiCategory } from '@/lib/fitness/calc';
import { useFitnessStore } from '@/lib/fitness/store';
import type { ActivityLevel, Goal, Profile } from '@/lib/fitness/types';

const GOALS: { id: Goal; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'lose', label: 'Lose fat', desc: 'Controlled deficit, protein high', icon: <Flame className="h-5 w-5" /> },
  { id: 'recomp', label: 'Recomp', desc: 'Maintenance calories, train hard', icon: <RefreshCcw className="h-5 w-5" /> },
  { id: 'maintain', label: 'Maintain', desc: 'Hold steady, build habits', icon: <MinusCircle className="h-5 w-5" /> },
  { id: 'gain', label: 'Build muscle', desc: 'Lean, controlled surplus', icon: <PlusCircle className="h-5 w-5" /> },
];

export function Onboarding() {
  const completeOnboarding = useFitnessStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    name: '',
    sex: 'male' as Profile['sex'],
    age: 25,
    heightCm: 175,
    weightKg: 75,
    activity: 'light' as ActivityLevel,
    goal: 'lose' as Goal,
    goalRateKg: 0.5,
    experience: 'beginner' as Profile['experience'],
  });

  const draft: Profile = { ...f, goalRateKg: f.goalRateKg, units: 'metric', createdAt: '' };
  const plan = useMemo(() => computePlan(draft), [draft]);
  const bmiV = bmi(f.weightKg, f.heightCm);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const num = (v: string, fallback: number) => {
    const n = parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-zinc-950 px-4 py-10">
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-amber-500/5 blur-3xl" />

      <div className="relative w-full max-w-xl">
        {/* brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-lime-500 shadow-lg shadow-emerald-500/25">
            <Zap className="h-7 w-7 text-zinc-950" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-zinc-50">ASCEND</h1>
          <p className="mt-1 text-sm text-zinc-500">Evidence-based fitness OS — every number cites its research</p>
        </div>

        {/* step dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1.5 rounded-full transition-all duration-300',
                i === step ? 'w-8 bg-emerald-400' : i < step ? 'w-4 bg-emerald-700' : 'w-4 bg-zinc-800',
              )}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-6 shadow-2xl backdrop-blur sm:p-8">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="s0" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-1 text-lg font-bold text-zinc-100">Your baseline</h2>
                <p className="mb-6 text-xs text-zinc-500">Needed for Mifflin-St Jeor BMR — the validated 1990 equation (Am J Clin Nutr).</p>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Name</label>
                    <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Your name" className="h-11 border-zinc-700 bg-zinc-950/60" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Biological sex (formula variable)</label>
                    <div className="grid grid-cols-2 gap-3">
                      {(['male', 'female'] as const).map((s) => (
                        <button
                          key={s}
                          onClick={() => setF({ ...f, sex: s })}
                          className={cn(
                            'h-11 rounded-xl border text-sm font-semibold capitalize transition',
                            f.sex === s ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-700 bg-zinc-950/60 text-zinc-400 hover:border-zinc-600',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { k: 'age' as const, label: 'Age', unit: 'yr', v: f.age, min: 14, max: 90 },
                      { k: 'heightCm' as const, label: 'Height', unit: 'cm', v: f.heightCm, min: 130, max: 220 },
                      { k: 'weightKg' as const, label: 'Weight', unit: 'kg', v: f.weightKg, min: 35, max: 200 },
                    ].map((fld) => (
                      <div key={fld.k}>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                          {fld.label} <span className="text-zinc-600">({fld.unit})</span>
                        </label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={fld.v}
                          min={fld.min}
                          max={fld.max}
                          onChange={(e) => setF({ ...f, [fld.k]: Math.min(fld.max, Math.max(fld.min, num(e.target.value, fld.v))) } as typeof f)}
                          className="h-11 border-zinc-700 bg-zinc-950/60 font-mono"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-center font-mono text-[11px] text-zinc-500">
                    BMI {bmiV} · <span className={bmiCategory(bmiV).tone === 'ok' ? 'text-emerald-400' : 'text-amber-400'}>{bmiCategory(bmiV).label}</span>
                  </p>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="s1" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-1 text-lg font-bold text-zinc-100">How active are you?</h2>
                <p className="mb-6 text-xs text-zinc-500">TDEE = BMR × activity factor. Be honest — most people overestimate by one level.</p>
                <div className="space-y-2.5">
                  {ACTIVITY_LEVELS.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => setF({ ...f, activity: a.id })}
                      className={cn(
                        'flex w-full items-center justify-between rounded-xl border p-3.5 text-left transition',
                        f.activity === a.id ? 'border-emerald-500 bg-emerald-950/50' : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Activity className={cn('h-4 w-4', f.activity === a.id ? 'text-emerald-400' : 'text-zinc-600')} />
                        <div>
                          <div className={cn('text-sm font-semibold', f.activity === a.id ? 'text-emerald-300' : 'text-zinc-200')}>{a.label}</div>
                          <div className="text-[11px] text-zinc-500">{a.note}</div>
                        </div>
                      </div>
                      <span className="font-mono text-xs text-zinc-500">×{a.factor}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="s2" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-1 text-lg font-bold text-zinc-100">Your mission</h2>
                <p className="mb-6 text-xs text-zinc-500">Rates follow the dynamic energy-balance model (Hall et al. 2011, Lancet).</p>
                <div className="grid grid-cols-2 gap-3">
                  {GOALS.map((g) => (
                    <button
                      key={g.id}
                      onClick={() => setF({ ...f, goal: g.id })}
                      className={cn(
                        'rounded-xl border p-4 text-left transition',
                        f.goal === g.id ? 'border-emerald-500 bg-emerald-950/50' : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700',
                      )}
                    >
                      <span className={cn('mb-2 inline-flex rounded-lg p-2', f.goal === g.id ? 'bg-emerald-900/70 text-emerald-300' : 'bg-zinc-800/70 text-zinc-500')}>{g.icon}</span>
                      <div className={cn('text-sm font-bold', f.goal === g.id ? 'text-emerald-300' : 'text-zinc-200')}>{g.label}</div>
                      <div className="text-[11px] leading-tight text-zinc-500">{g.desc}</div>
                    </button>
                  ))}
                </div>
                {(f.goal === 'lose' || f.goal === 'gain') && (
                  <div className="mt-5 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      <span>{f.goal === 'lose' ? 'Fat-loss rate' : 'Gain rate'}</span>
                      <span className="font-mono text-emerald-400">{f.goalRateKg.toFixed(2)} kg / week</span>
                    </div>
                    <Slider value={[f.goalRateKg]} min={0.25} max={1} step={0.25} onValueChange={(v) => setF({ ...f, goalRateKg: v[0] })} />
                    <p className="mt-2 text-[11px] text-zinc-500">
                      {f.goalRateKg <= 0.25 ? 'Conservative — best for keeping muscle.' : f.goalRateKg <= 0.5 ? 'Recommended pace for most trainees.' : 'Aggressive — higher protein and sleep become critical.'}
                    </p>
                  </div>
                )}
                <div className="mt-5">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Lifting experience</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['beginner', 'intermediate', 'advanced'] as const).map((x) => (
                      <button
                        key={x}
                        onClick={() => setF({ ...f, experience: x })}
                        className={cn(
                          'h-10 rounded-lg border text-xs font-semibold capitalize transition',
                          f.experience === x ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:border-zinc-700',
                        )}
                      >
                        {x}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="s3" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.2 }}>
                <h2 className="mb-1 flex items-center gap-2 text-lg font-bold text-zinc-100"><Calculator className="h-4 w-4 text-emerald-400" /> Your plan, computed</h2>
                <p className="mb-5 text-xs text-zinc-500">Nothing is guessed — each number links to its research on the Science tab.</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {[
                    { l: 'BMR', v: plan.bmr.toLocaleString() },
                    { l: 'TDEE', v: plan.tdee.toLocaleString() },
                    { l: 'Calories', v: plan.calories.toLocaleString(), hi: true },
                    { l: 'Protein', v: `${plan.proteinG} g`, hi: true },
                    { l: 'Carbs', v: `${plan.carbsG} g` },
                    { l: 'Fat', v: `${plan.fatG} g` },
                    { l: 'Water', v: `${(plan.waterMl / 1000).toFixed(1)} L` },
                    { l: 'Fibre', v: `${plan.fibreGoalG} g` },
                  ].map((c) => (
                    <div key={c.l} className={cn('rounded-xl border p-3', c.hi ? 'border-emerald-800/70 bg-emerald-950/40' : 'border-zinc-800 bg-zinc-950/40')}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{c.l}</div>
                      <div className={cn('mt-0.5 font-mono text-lg font-bold', c.hi ? 'text-emerald-300' : 'text-zinc-200')}>{c.v}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 text-[11px] leading-relaxed text-zinc-500">
                  <div className="flex gap-2"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>BMR — {plan.formulas.bmr}</span></div>
                  <div className="flex gap-2"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>Calories — {plan.formulas.calories}</span></div>
                  <div className="flex gap-2"><BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>Protein — {plan.formulas.protein}</span></div>
                </div>
                <button
                  onClick={() => completeOnboarding(draft)}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-zinc-950 shadow-lg shadow-emerald-500/25 transition hover:brightness-110 active:scale-[0.99]"
                >
                  <Dumbbell className="h-4 w-4" /> Begin Day 1
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {step < 3 && (
            <div className="mt-7 flex items-center justify-between">
              <button
                onClick={back}
                disabled={step === 0}
                className={cn('flex h-10 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-zinc-400 transition hover:text-zinc-200 disabled:invisible')}
              >
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <button
                onClick={next}
                className="flex h-10 items-center gap-1.5 rounded-lg bg-zinc-100 px-5 text-xs font-bold text-zinc-950 transition hover:bg-white active:scale-[0.98]"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
          {step === 3 && (
            <button onClick={back} className="mt-3 flex h-9 items-center gap-1 rounded-lg px-3 text-xs font-semibold text-zinc-500 transition hover:text-zinc-300">
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>

        <p className="mt-6 text-center text-[11px] text-zinc-600">
          Data stays in your browser (localStorage). No account, no cloud, no tracking.
        </p>
      </div>
    </div>
  );
}
