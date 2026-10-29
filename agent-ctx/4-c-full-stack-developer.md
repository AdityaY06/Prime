# Task 4-c — NutritionView (Fuel) QoL upgrade

Agent: full-stack-developer
Scope: ONLY `src/components/fitness/NutritionView.tsx` (store API from lead consumed as-is; store.ts / types.ts NOT modified)

## What was built

1. **Favorites & Recents quick-add rail** — "QUICK ADD" card between the daily summary and the main grid.
   - Favorites row: `favoriteFoods` order, resolved via merged food index.
   - Recents row: `useDays()` + `lastNDays(todayStr(), 14)`, grouped by `LoggedFood.foodId`, count desc → last-ts desc, max 8, favorites excluded; unknown ids (quick entries, deleted customs) fall back to a per-100 g pseudo-food built from the last LoggedFood (name from `LoggedFood.name`).
   - h-10 chips (Star + name + mono kcal of `servings[0]`) on `nice-scroll` horizontal rails; empty state "No favorites yet — tap the star on any food to pin it here."
   - One-tap add uses a shared `logFood()` helper (per-100 g × grams, exact original rounding) and a time-of-day `defaultMeal()` (breakfast <11 / lunch <16 / dinner <21 / snack); toast names the slot.
   - Star toggles (h-11 w-11, aria-pressed + aria-label, amber filled when active) on every search row AND a full-width toggle inside the serving sheet.
2. **Custom food creator** — dashed "+ CUSTOM FOOD" button → Dialog (SettingsDialog pattern): name*, category select (FOOD_CATEGORIES), kcal*/protein/carbs/fat/fibre per 100 g, serving label + grams (defaults "1 portion" / 100), live per-serving kcal preview. Saves `Food {id: custom-<uuid>, source 'label'}` via `addCustomFood`. Search merged via `ALL_FOODS = [...FOODS, ...customFoods]` (useMemo) with amber CUSTOM Tag + trash button → `removeCustomFood` (no confirm). Customs beyond the 80-result cap are re-prepended so they stay visible.
3. **Quick kcal entry** — "+ QUICK KCAL" card at the top of the meal-log column (one per day → logs to the viewed date): kcal + optional name (default "Quick entry") + emerald Add. Builds the LoggedFood directly (foodId `quick-kcal`, grams 100, kcal as typed, macros 0) through the existing `addFood` — never persisted as a custom food.

## QA evidence (agent-browser --session t4c, fresh onboarding)

- Starred Chicken Breast → chip "265 kcal" (156 × 1.70 g = 265) ✓; chip click → dinner (19 h), 170 g, 265 kcal, P52.7/C0/F6.1 ✓
- Test Ladoo (400/P8/C60/F12/fib2, serving 60 g): preview "≈ 240 kcal per 1 ladoo (60 g)" ✓; search → CUSTOM tag + trash + "400 kcal · P8 C60 F12 / 100 g" ✓; sheet add → 240 kcal, P4.8/C36/F7.2/fib1.2 ✓
- Quick kcal 250 → dinner, 100 g, 250 kcal, macros 0; UI total 755 (265+240+250) ✓
- Recents chips: Quick entry 250 + Test Ladoo 240 (favorites excluded) ✓; Test Ladoo chip click → dinner 240, total 995 ✓
- Star off/on + trash: favoriteFoods [] ↔ ['chicken-breast'], customFoods 0, aria-pressed=true ✓
- 390×844: scrollWidth === clientWidth === 390 (zero horizontal overflow) ✓; console/page errors none ✓
- `bunx tsc --noEmit` (file-filtered) → 0 errors; `bunx eslint src/components/fitness/NutritionView.tsx` → exit 0

## Notes for the lead

- Dev server supervisor in this sandbox flaps; each revival triggers an HMR full reload of open tabs (client tab state resets, localStorage fine). E2E batches were run in single commands.
- Full record appended to `/home/z/my-project/worklog.md` under "Task ID: 4-c".
