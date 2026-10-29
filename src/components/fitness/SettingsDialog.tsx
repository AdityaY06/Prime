'use client';

import { useState } from 'react';
import { Download, Upload, Trash2, Save, Settings2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useFitnessStore, useProfile } from '@/lib/fitness/store';
import { ACTIVITY_LEVELS, computePlan } from '@/lib/fitness/calc';
import type { ActivityLevel, Goal, Profile } from '@/lib/fitness/types';

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const profile = useProfile();
  const updateProfile = useFitnessStore((s) => s.updateProfile);
  const resetAll = useFitnessStore((s) => s.resetAll);
  const importState = useFitnessStore((s) => s.importState);
  const [f, setF] = useState<Profile>(profile);
  const [confirmReset, setConfirmReset] = useState(false);

  const preview = computePlan(f);

  const save = () => {
    updateProfile(f);
    toast.success('Profile updated — plan recalculated');
    onOpenChange(false);
  };

  const exportJson = () => {
    const blob = new Blob([useFitnessStore.getState().exportState()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ascend-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Backup downloaded');
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importState(String(reader.result));
      if (ok) {
        toast.success('Data imported');
        onOpenChange(false);
      } else toast.error('Invalid backup file');
    };
    reader.readAsText(file);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="nice-scroll max-h-[88vh] max-w-lg overflow-y-auto border-zinc-800 bg-zinc-900 p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-50">
            <Settings2 className="h-4 w-4 text-emerald-400" /> Settings
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Changing the profile recalculates BMR, TDEE and macros instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Name</label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-10 border-zinc-800 bg-zinc-950/60" />
            </div>
            {[
              { k: 'age' as const, l: 'Age', u: 'yr', min: 14, max: 90 },
              { k: 'heightCm' as const, l: 'Height', u: 'cm', min: 130, max: 220 },
              { k: 'weightKg' as const, l: 'Weight', u: 'kg', min: 35, max: 200 },
            ].map((x) => (
              <div key={x.k}>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">{x.l} ({x.u})</label>
                <Input
                  type="number" value={f[x.k]}
                  onChange={(e) => setF({ ...f, [x.k]: Math.min(x.max, Math.max(x.min, parseFloat(e.target.value) || f[x.k])) })}
                  className="h-10 border-zinc-800 bg-zinc-950/60 font-mono"
                />
              </div>
            ))}
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Sex</label>
              <div className="flex gap-1.5">
                {(['male', 'female'] as const).map((s) => (
                  <button key={s} onClick={() => setF({ ...f, sex: s })} className={cn('h-10 flex-1 rounded-lg border text-xs font-semibold capitalize transition', f.sex === s ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-400')}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Activity level</label>
            <div className="space-y-1.5">
              {ACTIVITY_LEVELS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setF({ ...f, activity: a.id as ActivityLevel })}
                  className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs transition', f.activity === a.id ? 'border-emerald-500 bg-emerald-950/50 text-emerald-300' : 'border-zinc-800 text-zinc-400 hover:border-zinc-700')}
                >
                  <span>{a.label} <span className="text-zinc-600">· {a.note}</span></span>
                  <span className="font-mono text-zinc-500">×{a.factor}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Goal</label>
            <div className="grid grid-cols-4 gap-1.5">
              {(['lose', 'recomp', 'maintain', 'gain'] as Goal[]).map((g) => (
                <button key={g} onClick={() => setF({ ...f, goal: g })} className={cn('h-9 rounded-lg border text-[11px] font-semibold capitalize transition', f.goal === g ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-400')}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-center">
            {[
              { l: 'BMR', v: preview.bmr },
              { l: 'TDEE', v: preview.tdee },
              { l: 'kcal', v: preview.calories },
              { l: 'protein', v: `${preview.proteinG}g` },
            ].map((x) => (
              <div key={x.l}>
                <div className="text-[9px] uppercase tracking-wider text-zinc-500">{x.l}</div>
                <div className="font-mono text-sm font-bold text-emerald-300">{x.v}</div>
              </div>
            ))}
          </div>

          <button onClick={save} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]">
            <Save className="h-4 w-4" /> Save profile
          </button>

          <div className="border-t border-zinc-800 pt-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Your data · local only</p>
            <div className="flex gap-2">
              <button onClick={exportJson} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 transition hover:border-emerald-700 hover:text-emerald-400">
                <Download className="h-3.5 w-3.5" /> Export
              </button>
              <label className="flex h-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-300 transition hover:border-emerald-700 hover:text-emerald-400">
                <Upload className="h-3.5 w-3.5" /> Import
                <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
              </label>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4">
            {confirmReset ? (
              <div className="rounded-xl border border-rose-900/60 bg-rose-950/30 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Erase everything? This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmReset(false)} className="h-9 flex-1 rounded-lg border border-zinc-700 text-xs font-semibold text-zinc-400">Cancel</button>
                  <button
                    onClick={() => {
                      resetAll();
                      setConfirmReset(false);
                      onOpenChange(false);
                      toast('All data wiped');
                    }}
                    className="h-9 flex-1 rounded-lg bg-rose-600 text-xs font-bold text-white"
                  >
                    Erase
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setConfirmReset(true)} className="flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-rose-900/50 text-xs font-semibold text-rose-400 transition hover:bg-rose-950/30">
                <Trash2 className="h-3.5 w-3.5" /> Reset all data
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
