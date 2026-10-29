'use client';

import { useMemo, useState } from 'react';
import {
  Search, Plus, Trash2, Sunrise, Sun, Moon, Cookie, Calculator, BookOpen, X, Star, Flame,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useFitnessStore, useDay, useDays, usePlan } from '@/lib/fitness/store';
import { dayTotals, todayStr, prettyDate, lastNDays } from '@/lib/fitness/calc';
import { FOODS, FOOD_CATEGORIES } from '@/lib/fitness/data/foods';
import { MacroBar, DateNav, ProteinIcon, CarbIcon, FatIcon, Tag, SectionHeader } from './shared';
import type { Food, FoodCategory, LoggedFood, MealSlot } from '@/lib/fitness/types';

const card = 'rounded-2xl border border-zinc-800/80 bg-zinc-900/40';

const MEALS: { id: MealSlot; label: string; icon: React.ReactNode }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: <Sunrise className="h-3.5 w-3.5" /> },
  { id: 'lunch', label: 'Lunch', icon: <Sun className="h-3.5 w-3.5" /> },
  { id: 'dinner', label: 'Dinner', icon: <Moon className="h-3.5 w-3.5" /> },
  { id: 'snack', label: 'Snacks', icon: <Cookie className="h-3.5 w-3.5" /> },
];

const CAT_EMOJI: Record<FoodCategory, string> = {
  protein: '🍗', grain: '🌾', fruit: '🍎', vegetable: '🥦', dairy: '🥛',
  nuts: '🥜', legume: '🫘', dish: '🍛', snack: '🍫', beverage: '🥤', condiment: '🧂',
};

/** One-tap default: the meal slot the clock is currently in. */
function defaultMeal(): MealSlot {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snack';
}

/** kcal for a food's default (first) serving — per-100 g × grams, same math as the add flow. */
function servingKcal(f: Food): number {
  return Math.round(f.kcal * ((f.servings[0]?.grams ?? 100) / 100));
}

const isCustom = (id: string) => id.startsWith('custom-');

/* ---------------- quick-add chip ---------------- */

function QuickChip({ food, fav, onClick }: { food: Food; fav: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Quick add ${food.name} — ${servingKcal(food)} kcal`}
      className="flex h-10 shrink-0 items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3.5 py-2 transition hover:border-emerald-700 hover:bg-emerald-950/30 active:scale-[0.98]"
    >
      <Star className={cn('h-3.5 w-3.5', fav ? 'fill-amber-400 text-amber-400' : 'text-zinc-600')} aria-hidden />
      <span className="max-w-[9.5rem] truncate text-xs font-semibold text-zinc-200">{food.name}</span>
      <span className="font-mono text-[10px] font-bold tabular-nums text-emerald-400">{servingKcal(food)} kcal</span>
    </button>
  );
}

/* ---------------- custom food creator ---------------- */

const CUSTOM_FIELDS: { k: 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre'; l: string; req: boolean; ph: string }[] = [
  { k: 'kcal', l: 'kcal / 100 g', req: true, ph: '240' },
  { k: 'protein', l: 'protein g', req: false, ph: '0' },
  { k: 'carbs', l: 'carbs g', req: false, ph: '0' },
  { k: 'fat', l: 'fat g', req: false, ph: '0' },
  { k: 'fibre', l: 'fibre g', req: false, ph: '0' },
];

function CustomFoodDialog({ onSave, onClose }: { onSave: (food: Food) => void; onClose: () => void }) {
  const [v, setV] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '', fibre: '' });
  const [cat, setCat] = useState<FoodCategory>('dish');
  const [sLabel, setSLabel] = useState('1 portion');
  const [sGrams, setSGrams] = useState('100');

  const upd = (k: keyof typeof v, val: string) => setV((p) => ({ ...p, [k]: val }));
  const opt = (x: string) => {
    const n = parseFloat(x);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : 0;
  };

  const kcalNum = parseFloat(v.kcal);
  const gramsNum = parseFloat(sGrams);
  const previewOk = Number.isFinite(kcalNum) && kcalNum > 0 && Number.isFinite(gramsNum) && gramsNum > 0;

  const save = () => {
    if (!v.name.trim()) {
      toast.error('Give the food a name');
      return;
    }
    if (!Number.isFinite(kcalNum) || kcalNum <= 0) {
      toast.error('Calories per 100 g are required');
      return;
    }
    const grams = Math.max(1, Math.round(gramsNum) || 100);
    onSave({
      id: `custom-${crypto.randomUUID()}`,
      name: v.name.trim(),
      category: cat,
      kcal: Math.round(kcalNum),
      protein: opt(v.protein),
      carbs: opt(v.carbs),
      fat: opt(v.fat),
      fibre: opt(v.fibre),
      servings: [{ label: sLabel.trim() || '1 portion', grams }],
      source: 'label',
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="nice-scroll max-h-[88vh] max-w-lg overflow-y-auto border-zinc-800 bg-zinc-900 p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-zinc-50">
            <Flame className="h-4 w-4 text-amber-400" /> Custom food
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Nutrition per 100 g — saved locally, searchable with a CUSTOM tag.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
              Name <span className="text-amber-400">*</span>
            </label>
            <Input
              value={v.name}
              onChange={(e) => upd('name', e.target.value)}
              placeholder="e.g. Mom's dal makhani"
              aria-label="Food name"
              className="h-11 border-zinc-800 bg-zinc-950/60"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Category</label>
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value as FoodCategory)}
              aria-label="Category"
              className="h-11 w-full rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-600"
            >
              {FOOD_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {CUSTOM_FIELDS.map((f) => (
              <div key={f.k}>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                  {f.l}{f.req && <span className="text-amber-400"> *</span>}
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder={f.ph}
                  value={v[f.k]}
                  onChange={(e) => upd(f.k, e.target.value)}
                  aria-label={f.l}
                  className="h-11 border-zinc-800 bg-zinc-950/60 font-mono tabular-nums"
                />
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Default serving</label>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <Input
                value={sLabel}
                onChange={(e) => setSLabel(e.target.value)}
                aria-label="Serving label"
                className="h-11 border-zinc-800 bg-zinc-950/60"
              />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={sGrams}
                onChange={(e) => setSGrams(e.target.value)}
                aria-label="Serving grams"
                className="h-11 border-zinc-800 bg-zinc-950/60 font-mono tabular-nums"
              />
            </div>
          </div>

          {previewOk && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-center font-mono text-xs tabular-nums text-zinc-400">
              ≈ <span className="font-bold text-amber-300">{Math.round((kcalNum * gramsNum) / 100)} kcal</span> per {sLabel.trim() || '1 portion'} ({Math.round(gramsNum)} g)
            </div>
          )}

          <button
            onClick={save}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
          >
            <Plus className="h-4 w-4" /> Save custom food
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- main view ---------------- */

export function NutritionView() {
  const [date, setDate] = useState(todayStr());
  const day = useDay(date);
  const days = useDays();
  const plan = usePlan();
  const addFood = useFitnessStore((s) => s.addFood);
  const removeFood = useFitnessStore((s) => s.removeFood);
  const favoriteFoods = useFitnessStore((s) => s.favoriteFoods);
  const toggleFavoriteFood = useFitnessStore((s) => s.toggleFavoriteFood);
  const customFoods = useFitnessStore((s) => s.customFoods);
  const addCustomFood = useFitnessStore((s) => s.addCustomFood);
  const removeCustomFood = useFitnessStore((s) => s.removeCustomFood);

  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<FoodCategory | 'all'>('all');
  const [sel, setSel] = useState<{ food: Food; grams: number; meal: MealSlot } | null>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [quick, setQuick] = useState({ kcal: '', name: '' });

  /* library + user foods, merged */
  const ALL_FOODS = useMemo(() => [...FOODS, ...customFoods], [customFoods]);
  const foodIndex = useMemo(() => new Map(ALL_FOODS.map((f) => [f.id, f])), [ALL_FOODS]);
  const favSet = useMemo(() => new Set(favoriteFoods), [favoriteFoods]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (f: Food) => (cat === 'all' || f.category === cat) && (!q || f.name.toLowerCase().includes(q));
    const capped = ALL_FOODS.filter(matches).slice(0, 80);
    /* user foods stay visible even when the 80-item cap trims the library tail */
    const hidden = customFoods.filter((f) => matches(f) && !capped.some((x) => x.id === f.id));
    return [...hidden, ...capped];
  }, [query, cat, ALL_FOODS, customFoods]);

  /* quick-add rail · favorites (pinned order) */
  const favorites = useMemo(
    () => favoriteFoods.map((id) => foodIndex.get(id)).filter((f): f is Food => !!f),
    [favoriteFoods, foodIndex],
  );

  /* quick-add rail · most frequently logged foods in the last 14 days, favorites excluded, max 8 */
  const recents = useMemo(() => {
    type Per100 = { kcal: number; protein: number; carbs: number; fat: number; fibre: number };
    type Agg = { count: number; lastTs: string; name: string; grams: number; per100: Per100 };
    const per100Of = (lf: LoggedFood): Per100 => ({
      kcal: lf.grams > 0 ? Math.round((lf.kcal / lf.grams) * 100) : 0,
      protein: lf.grams > 0 ? Math.round((lf.protein / lf.grams) * 1000) / 10 : 0,
      carbs: lf.grams > 0 ? Math.round((lf.carbs / lf.grams) * 1000) / 10 : 0,
      fat: lf.grams > 0 ? Math.round((lf.fat / lf.grams) * 1000) / 10 : 0,
      fibre: lf.grams > 0 ? Math.round((lf.fibre / lf.grams) * 1000) / 10 : 0,
    });
    const agg = new Map<string, Agg>();
    for (const d of lastNDays(todayStr(), 14)) {
      const day = days[d];
      if (!day) continue;
      for (const lf of day.foods) {
        const p = per100Of(lf);
        const cur = agg.get(lf.foodId);
        if (cur) {
          cur.count += 1;
          if (lf.ts >= cur.lastTs) {
            cur.lastTs = lf.ts;
            cur.name = lf.name;
            cur.grams = lf.grams;
            cur.per100 = p;
          }
        } else {
          agg.set(lf.foodId, { count: 1, lastTs: lf.ts, name: lf.name, grams: lf.grams, per100: p });
        }
      }
    }
    return [...agg.entries()]
      .filter(([id]) => !favSet.has(id))
      .sort((a, b) => b[1].count - a[1].count || b[1].lastTs.localeCompare(a[1].lastTs))
      .slice(0, 8)
      .map(([id, a]): Food => {
        const known = foodIndex.get(id);
        if (known) return known;
        /* fallback pseudo-food for ids no longer in the library (e.g. quick entries) */
        return {
          id,
          name: a.name,
          category: 'dish',
          kcal: a.per100.kcal,
          protein: a.per100.protein,
          carbs: a.per100.carbs,
          fat: a.per100.fat,
          fibre: a.per100.fibre,
          servings: [{ label: `last logged · ${a.grams} g`, grams: a.grams > 0 ? a.grams : 100 }],
          source: 'label',
        };
      });
  }, [days, favSet, foodIndex]);

  const t = dayTotals(day);
  const remaining = plan.calories - Math.round(t.kcal);
  const per100 = (v: number) => v * (sel ? sel.grams / 100 : 0);

  const openFood = (food: Food, meal: MealSlot) =>
    setSel({ food, grams: food.servings[0]?.grams ?? 100, meal });

  /** single add path — per-100 g × grams, identical math to the original confirmAdd */
  const logFood = (f: Food, grams: number, meal: MealSlot) => {
    const k = grams / 100;
    addFood(date, {
      id: crypto.randomUUID(),
      foodId: f.id,
      name: f.name,
      grams,
      meal,
      kcal: Math.round(f.kcal * k),
      protein: Math.round(f.protein * k * 10) / 10,
      carbs: Math.round(f.carbs * k * 10) / 10,
      fat: Math.round(f.fat * k * 10) / 10,
      fibre: Math.round(f.fibre * k * 10) / 10,
      ts: new Date().toISOString(),
    });
    return Math.round(f.kcal * k);
  };

  const confirmAdd = () => {
    if (!sel) return;
    const kcal = logFood(sel.food, sel.grams, sel.meal);
    toast.success(`${sel.food.name} → ${sel.meal}`, { description: `${kcal} kcal · ${sel.grams} g` });
    setSel(null);
  };

  /** chip one-tap: default serving → current time-of-day meal */
  const quickAdd = (f: Food) => {
    const grams = f.servings[0]?.grams ?? 100;
    const meal = defaultMeal();
    const kcal = logFood(f, grams, meal);
    toast.success(`${f.name} → ${meal}`, { description: `${kcal} kcal · ${grams} g · default serving` });
  };

  const toggleFav = (f: Food) => {
    const on = !favSet.has(f.id);
    toggleFavoriteFood(f.id);
    if (on) toast.success(`${f.name} — pinned to quick add`);
    else toast(`${f.name} — removed from favorites`);
  };

  /** quick kcal — LoggedFood built directly, macros 0, never persisted as a custom food */
  const submitQuick = () => {
    const k = parseFloat(quick.kcal);
    if (!Number.isFinite(k) || k <= 0) {
      toast.error('Type the calories first');
      return;
    }
    const meal = defaultMeal();
    const name = quick.name.trim() || 'Quick entry';
    addFood(date, {
      id: crypto.randomUUID(),
      foodId: 'quick-kcal',
      name,
      grams: 100,
      meal,
      kcal: Math.round(k),
      protein: 0,
      carbs: 0,
      fat: 0,
      fibre: 0,
      ts: new Date().toISOString(),
    });
    toast.success(`${name} → ${meal}`, { description: `${Math.round(k)} kcal · macros not tracked` });
    setQuick({ kcal: '', name: '' });
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-zinc-50">Fuel</h1>
          <p className="mt-0.5 text-xs text-zinc-500">{prettyDate(date)} · USDA / IFCT referenced database</p>
        </div>
        <DateNav date={date} onChange={setDate} />
      </div>

      {/* totals */}
      <div className={cn(card, 'p-5')}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-2xl font-bold text-zinc-50">
            {Math.round(t.kcal).toLocaleString()}
            <span className="text-sm text-zinc-500"> / {plan.calories.toLocaleString()} kcal</span>
          </span>
          <span className={cn('font-mono text-sm font-bold', remaining >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {remaining >= 0 ? `${remaining} remaining` : `${Math.abs(remaining)} over`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <MacroBar label="Protein" value={t.protein} target={plan.proteinG} icon={<ProteinIcon />} color="emerald" />
          <MacroBar label="Carbs" value={t.carbs} target={plan.carbsG} icon={<CarbIcon />} color="amber" />
          <MacroBar label="Fat" value={t.fat} target={plan.fatG} icon={<FatIcon />} color="rose" />
        </div>
      </div>

      {/* quick add · favorites & recents */}
      <div className={cn(card, 'p-4 sm:p-5')}>
        <SectionHeader
          title="Quick add"
          sub="Favorites & recents — one tap logs the default serving"
          right={<Tag tone="emerald">→ {defaultMeal()}</Tag>}
        />
        {favorites.length === 0 && recents.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">
            No favorites yet — tap the star on any food to pin it here.
          </p>
        ) : (
          <div className="space-y-3">
            {favorites.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Favorites</div>
                <div className="nice-scroll flex gap-2 overflow-x-auto pb-1">
                  {favorites.map((f) => (
                    <QuickChip key={f.id} food={f} fav onClick={() => quickAdd(f)} />
                  ))}
                </div>
              </div>
            )}
            {recents.length > 0 && (
              <div>
                <div className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Recents · last 14 days</div>
                <div className="nice-scroll flex gap-2 overflow-x-auto pb-1">
                  {recents.map((f) => (
                    <QuickChip key={f.id} food={f} fav={false} onClick={() => quickAdd(f)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* search */}
        <div className={cn(card, 'p-5 lg:col-span-5')}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${ALL_FOODS.length} foods — chicken, roti, oats…`}
              className="h-11 border-zinc-800 bg-zinc-950/60 pl-9"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setCat('all')}
              aria-pressed={cat === 'all'}
              className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', cat === 'all' ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300')}
            >
              All
            </button>
            {FOOD_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                aria-pressed={cat === c.id}
                className={cn('rounded-full border px-2.5 py-1 text-[11px] font-semibold transition', cat === c.id ? 'border-emerald-600 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300')}
              >
                {c.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setCustomOpen(true)}
            className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-700 text-xs font-bold text-zinc-400 transition hover:border-amber-700/70 hover:text-amber-300"
          >
            <Plus className="h-4 w-4" /> Custom food
          </button>

          <ul className="nice-scroll mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {results.map((f) => {
              const fav = favSet.has(f.id);
              const custom = isCustom(f.id);
              return (
                <li key={f.id} className="flex items-center gap-1.5">
                  <button
                    onClick={() => openFood(f, 'lunch')}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-zinc-800/60 bg-zinc-950/40 p-3 text-left transition hover:border-emerald-800 hover:bg-zinc-900/60"
                  >
                    <span className="text-xl" aria-hidden>{CAT_EMOJI[f.category]}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-semibold text-zinc-200">{f.name}</span>
                        {custom && <Tag tone="amber">CUSTOM</Tag>}
                      </div>
                      <div className="font-mono text-[10px] tabular-nums text-zinc-500">
                        {f.kcal} kcal · P{f.protein} C{f.carbs} F{f.fat} / 100 g
                      </div>
                    </div>
                    <Plus className="h-4 w-4 shrink-0 text-emerald-500" />
                  </button>
                  <button
                    onClick={() => toggleFav(f)}
                    aria-pressed={fav}
                    aria-label={fav ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`}
                    className={cn(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition',
                      fav ? 'border-amber-700/60 bg-amber-950/40' : 'border-zinc-800/60 bg-zinc-950/40 hover:border-amber-800/60',
                    )}
                  >
                    <Star className={cn('h-4 w-4', fav ? 'fill-amber-400 text-amber-400' : 'text-zinc-600')} />
                  </button>
                  {custom && (
                    <button
                      onClick={() => removeCustomFood(f.id)}
                      aria-label={`Delete custom food ${f.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-950/40 text-zinc-600 transition hover:border-rose-900/60 hover:text-rose-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
            {results.length === 0 && (
              <li className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-xs text-zinc-600">No matches — try another term</li>
            )}
          </ul>
        </div>

        {/* meal log */}
        <div className="space-y-4 lg:col-span-4">
          {/* quick kcal — one per day */}
          <div className={cn(card, 'p-4')}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
                <Flame className="h-3.5 w-3.5 text-amber-400" /> + Quick kcal
              </h3>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">→ {defaultMeal()}</span>
            </div>
            <div className="grid grid-cols-[5.25rem_minmax(0,1fr)_auto] gap-2">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="250"
                value={quick.kcal}
                onChange={(e) => setQuick({ ...quick, kcal: e.target.value })}
                aria-label="Quick calories"
                className="h-11 border-zinc-800 bg-zinc-950/60 font-mono tabular-nums"
              />
              <Input
                placeholder="Name (optional)"
                value={quick.name}
                onChange={(e) => setQuick({ ...quick, name: e.target.value })}
                aria-label="Quick entry name"
                className="h-11 border-zinc-800 bg-zinc-950/60"
              />
              <button
                onClick={submitQuick}
                className="flex h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> Add
              </button>
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-zinc-600">Macros stay at 0 · logs 100 g at the calories you type · meal follows the clock.</p>
          </div>

          {MEALS.map((m) => {
            const items = day.foods.filter((f) => f.meal === m.id);
            const mk = items.reduce((s, f) => s + f.kcal, 0);
            return (
              <div key={m.id} className={cn(card, 'p-4')}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
                    {m.icon} {m.label}
                  </h3>
                  <span className="font-mono text-[11px] tabular-nums text-zinc-500">{mk > 0 ? `${Math.round(mk)} kcal` : '—'}</span>
                </div>
                {items.length === 0 ? (
                  <button
                    onClick={() => {
                      const first = results[0] ?? FOODS[0];
                      openFood(first, m.id);
                    }}
                    className="flex h-11 w-full items-center justify-center rounded-lg border border-dashed border-zinc-800 text-[11px] font-semibold text-zinc-500 transition hover:border-emerald-800 hover:text-emerald-400"
                  >
                    + Add {m.label.toLowerCase()}
                  </button>
                ) : (
                  <ul className="space-y-1">
                    {items.map((f) => (
                      <li key={f.id} className="group flex items-center justify-between rounded-lg bg-zinc-950/40 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <div className="truncate text-zinc-200">{f.name}</div>
                          <div className="font-mono text-[10px] tabular-nums text-zinc-500">{f.grams} g · P{Math.round(f.protein)} C{Math.round(f.carbs)} F{Math.round(f.fat)}</div>
                        </div>
                        <div className="ml-2 flex shrink-0 items-center gap-2">
                          <span className="font-mono text-zinc-400 tabular-nums">{Math.round(f.kcal)}</span>
                          <button onClick={() => removeFood(date, f.id)} aria-label={`Remove ${f.name}`} className="text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:text-rose-400">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* plan card */}
        <div className={cn(card, 'p-5 lg:col-span-3')}>
          <h3 className="mb-4 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-zinc-400">
            <Calculator className="h-3.5 w-3.5 text-emerald-400" /> Your plan
          </h3>
          <div className="space-y-3 text-xs">
            {[
              { l: 'BMR', v: `${plan.bmr.toLocaleString()} kcal` },
              { l: 'TDEE', v: `${plan.tdee.toLocaleString()} kcal` },
              { l: 'Target', v: `${plan.calories.toLocaleString()} kcal`, hi: true },
              { l: 'Protein', v: `${plan.proteinG} g`, hi: true },
              { l: 'Fibre', v: `${plan.fibreGoalG} g` },
            ].map((r) => (
              <div key={r.l} className="flex items-center justify-between border-b border-zinc-800/60 pb-2">
                <span className="text-zinc-500">{r.l}</span>
                <span className={cn('font-mono font-bold', r.hi ? 'text-emerald-300' : 'text-zinc-200')}>{r.v}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-[10px] leading-relaxed text-zinc-500">
            <div className="flex gap-1.5"><BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />{plan.formulas.bmr}</div>
            <div className="flex gap-1.5"><BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />{plan.formulas.calories}</div>
            <div className="flex gap-1.5"><BookOpen className="mt-0.5 h-3 w-3 shrink-0 text-emerald-700" />{plan.formulas.protein}</div>
          </div>
        </div>
      </div>

      {/* food detail sheet */}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent side="bottom" className="mx-auto max-w-lg rounded-t-2xl border-zinc-800 bg-zinc-900 px-5 pb-8 pt-4 sm:rounded-2xl">
          {sel && (
            <>
              <SheetHeader className="px-0 text-left">
                <SheetTitle className="flex items-center gap-2 text-zinc-100">
                  <span aria-hidden>{CAT_EMOJI[sel.food.category]}</span> {sel.food.name}
                </SheetTitle>
                <SheetDescription className="text-[11px] text-zinc-500">
                  per 100 g: {sel.food.kcal} kcal · P {sel.food.protein} · C {sel.food.carbs} · F {sel.food.fat} · fibre {sel.food.fibre} g
                  {isCustom(sel.food.id) && <Tag tone="amber">custom</Tag>}
                  <Tag>source: {sel.food.source}</Tag>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-5 space-y-5">
                <button
                  onClick={() => toggleFav(sel.food)}
                  aria-pressed={favSet.has(sel.food.id)}
                  aria-label={favSet.has(sel.food.id) ? `Remove ${sel.food.name} from favorites` : `Add ${sel.food.name} to favorites`}
                  className={cn(
                    'flex h-11 w-full items-center justify-center gap-2 rounded-xl border text-[11px] font-bold uppercase tracking-widest transition',
                    favSet.has(sel.food.id)
                      ? 'border-amber-700/60 bg-amber-950/40 text-amber-300'
                      : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-amber-800/60 hover:text-amber-300',
                  )}
                >
                  <Star className={cn('h-4 w-4', favSet.has(sel.food.id) && 'fill-amber-400 text-amber-400')} />
                  {favSet.has(sel.food.id) ? 'Favorited · pinned to quick add' : 'Add to favorites'}
                </button>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Meal</label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {MEALS.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setSel({ ...sel, meal: m.id })}
                        className={cn('flex h-10 items-center justify-center gap-1.5 rounded-lg border text-[11px] font-semibold capitalize transition', sel.meal === m.id ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 bg-zinc-950/50 text-zinc-400')}
                      >
                        {m.icon} <span className="hidden sm:inline">{m.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-zinc-500">Serving</label>
                  <div className="flex flex-wrap gap-1.5">
                    {sel.food.servings.map((s) => (
                      <button
                        key={s.label}
                        onClick={() => setSel({ ...sel, grams: s.grams })}
                        className={cn('rounded-full border px-3 py-1.5 text-[11px] font-semibold transition', sel.grams === s.grams ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300' : 'border-zinc-800 bg-zinc-950/50 text-zinc-400 hover:border-zinc-700')}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>Amount</span>
                    <span className="font-mono text-sm text-emerald-400">{sel.grams} g</span>
                  </div>
                  <input
                    type="range" min={10} max={600} step={10}
                    value={sel.grams}
                    onChange={(e) => setSel({ ...sel, grams: parseInt(e.target.value, 10) })}
                    className="w-full accent-emerald-500"
                    aria-label="Grams"
                  />
                </div>

                <div className="grid grid-cols-4 gap-2 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3 text-center">
                  {[
                    { l: 'kcal', v: Math.round(per100(sel.food.kcal)) },
                    { l: 'protein', v: Math.round(per100(sel.food.protein)) },
                    { l: 'carbs', v: Math.round(per100(sel.food.carbs)) },
                    { l: 'fat', v: Math.round(per100(sel.food.fat)) },
                  ].map((x) => (
                    <div key={x.l}>
                      <div className="font-mono text-lg font-bold tabular-nums text-zinc-100">{x.v}</div>
                      <div className="text-[10px] uppercase tracking-wider text-zinc-500">{x.l}</div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={confirmAdd}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-500 text-sm font-bold text-zinc-950 transition hover:brightness-110 active:scale-[0.99]"
                >
                  <Plus className="h-4 w-4" /> Add to {sel.meal}
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* custom food creator */}
      {customOpen && (
        <CustomFoodDialog
          onClose={() => setCustomOpen(false)}
          onSave={(f) => {
            addCustomFood(f);
            setCustomOpen(false);
            toast.success(`${f.name} saved`, { description: 'Custom food — find it in search with a CUSTOM tag' });
          }}
        />
      )}
    </div>
  );
}
