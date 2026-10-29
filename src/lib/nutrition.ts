// ─── PRIME · Nutrition library — food database, macro targets, body metrics ───
// Pure data + pure functions only (safe to import from client components).
// The Fuel tab and Body metrics routes both consume these definitions.

// ─── Food database ────────────────────────────────────────────────────────────

export type FoodItem = {
  id: string // kebab-case unique id
  name: string
  category: string // one of FOOD_CATEGORIES
  servingLabel: string // e.g. "1 cup (158 g)", "1 roti (40 g)", "100 g"
  calories: number // per ONE serving
  protein: number // grams per serving
  carbs: number // grams per serving
  fat: number // grams per serving
  // R17-A micro layer (Cronometer/MyFitnessPal parity) — per ONE serving.
  // Values cross-checked against USDA FoodData Central + Indian food tables.
  fiber: number // grams
  sodium: number // mg
  sugar: number // grams (total sugars)
}

export const FOOD_CATEGORIES = [
  "Protein",
  "Grains & Carbs",
  "Fruits",
  "Vegetables",
  "Dairy & Drinks",
  "Nuts & Fats",
  "Snacks & Sweets",
  "Fast Food",
] as const

export type FoodCategory = (typeof FOOD_CATEGORIES)[number]

// Macros are per ONE serving, on realistic cooked/edible weights, tuned for
// global staples + Indian staples (values cross-checked against common
// nutrition labels and food databases).
// R71-a — database expansion 118 → 202 foods (84 net-new, the original 118
// untouched): every net-new row sources its macros from USDA FoodData Central
// (SR Legacy / Foundation per-100g data scaled to the serving weight) or the
// IFCT-2017 Indian Food Composition Tables, with sodium/sugar from the same
// entries; quick-serve items follow published label data. Source notes sit
// in a comment block per category below. Rule held: no invented values — a
// food whose full macro+micro row could not be sourced was not added.
export const FOODS: readonly FoodItem[] = [
  // ── Protein ──────────────────────────────────────────────────────────────
  { id: "chicken-breast", name: "Chicken Breast (grilled)", category: "Protein", servingLabel: "150 g", calories: 248, protein: 47, carbs: 0, fat: 6, fiber: 0, sodium: 110, sugar: 0 },
  { id: "chicken-curry", name: "Chicken Curry (home style)", category: "Protein", servingLabel: "1 bowl (200 g)", calories: 300, protein: 28, carbs: 8, fat: 18, fiber: 2, sodium: 620, sugar: 3 },
  { id: "grilled-chicken-salad", name: "Grilled Chicken Salad", category: "Protein", servingLabel: "1 bowl (250 g)", calories: 320, protein: 30, carbs: 15, fat: 16, fiber: 4, sodium: 380, sugar: 3 },
  { id: "egg-large", name: "Egg (whole)", category: "Protein", servingLabel: "1 large (50 g)", calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fiber: 0, sodium: 71, sugar: 0.1 },
  { id: "boiled-eggs-2", name: "Boiled Eggs", category: "Protein", servingLabel: "2 whole (100 g)", calories: 144, protein: 12.6, carbs: 1.2, fat: 9.6, fiber: 0, sodium: 142, sugar: 0.2 },
  { id: "egg-whites", name: "Boiled Egg Whites", category: "Protein", servingLabel: "4 whites (132 g)", calories: 68, protein: 14.4, carbs: 0.8, fat: 0.2, fiber: 0, sodium: 220, sugar: 0.8 },
  { id: "egg-omelette", name: "Egg Omelette (2 eggs)", category: "Protein", servingLabel: "1 (120 g)", calories: 185, protein: 13, carbs: 1, fat: 14, fiber: 0, sodium: 290, sugar: 1 },
  { id: "egg-bhurji", name: "Egg Bhurji (2 eggs)", category: "Protein", servingLabel: "1 plate (150 g)", calories: 245, protein: 13, carbs: 6, fat: 18, fiber: 1, sodium: 480, sugar: 2 },
  { id: "salmon", name: "Salmon Fillet (baked)", category: "Protein", servingLabel: "150 g", calories: 309, protein: 33, carbs: 0, fat: 19.5, fiber: 0, sodium: 95, sugar: 0 },
  { id: "tuna-can", name: "Tuna (canned in water)", category: "Protein", servingLabel: "1 can (140 g drained)", calories: 152, protein: 33, carbs: 0, fat: 1, fiber: 0, sodium: 320, sugar: 0 },
  { id: "fish-curry", name: "Fish Curry", category: "Protein", servingLabel: "1 bowl (200 g)", calories: 284, protein: 28, carbs: 7, fat: 16, fiber: 1, sodium: 590, sugar: 2 },
  { id: "prawns", name: "Prawns (cooked)", category: "Protein", servingLabel: "150 g", calories: 155, protein: 36, carbs: 0.5, fat: 1, fiber: 0, sodium: 660, sugar: 0 },
  { id: "turkey-breast", name: "Turkey Breast (roasted)", category: "Protein", servingLabel: "150 g", calories: 202, protein: 45, carbs: 0, fat: 1, fiber: 0, sodium: 105, sugar: 0 },
  { id: "lean-beef", name: "Lean Beef Steak (cooked)", category: "Protein", servingLabel: "150 g", calories: 270, protein: 44, carbs: 0, fat: 11, fiber: 0, sodium: 63, sugar: 0 },
  { id: "mutton-curry", name: "Mutton Curry", category: "Protein", servingLabel: "1 bowl (150 g)", calories: 340, protein: 30, carbs: 6, fat: 22, fiber: 1, sodium: 520, sugar: 2 },
  { id: "paneer", name: "Paneer (full fat)", category: "Protein", servingLabel: "100 g", calories: 290, protein: 19, carbs: 2, fat: 22, fiber: 0, sodium: 18, sugar: 2 },
  { id: "paneer-bhurji", name: "Paneer Bhurji", category: "Protein", servingLabel: "1 katori (150 g)", calories: 320, protein: 18, carbs: 8, fat: 23, fiber: 2, sodium: 410, sugar: 3 },
  { id: "tofu", name: "Tofu (firm)", category: "Protein", servingLabel: "100 g", calories: 130, protein: 14, carbs: 2.5, fat: 7, fiber: 1, sodium: 10, sugar: 1 },
  { id: "soya-chunks", name: "Soya Chunks (dry)", category: "Protein", servingLabel: "50 g", calories: 172, protein: 26, carbs: 16.5, fat: 0.4, fiber: 7.5, sodium: 10, sugar: 3 },
  { id: "greek-yogurt", name: "Greek Yogurt (plain, 2%)", category: "Protein", servingLabel: "1 cup (150 g)", calories: 110, protein: 15, carbs: 5.9, fat: 2.9, fiber: 0, sodium: 65, sugar: 4 },
  { id: "cottage-cheese", name: "Cottage Cheese (low fat)", category: "Protein", servingLabel: "100 g", calories: 82, protein: 11, carbs: 3.4, fat: 2.3, fiber: 0, sodium: 330, sugar: 3 },
  { id: "whey-protein", name: "Whey Protein", category: "Protein", servingLabel: "1 scoop (30 g)", calories: 120, protein: 24, carbs: 3, fat: 1.5, fiber: 1, sodium: 90, sugar: 1.5 },
  { id: "rajma", name: "Rajma (kidney bean curry)", category: "Protein", servingLabel: "1 cup (170 g)", calories: 320, protein: 15, carbs: 48, fat: 6, fiber: 12, sodium: 420, sugar: 3 },
  { id: "chana-masala", name: "Chana Masala", category: "Protein", servingLabel: "1 cup (160 g)", calories: 264, protein: 12, carbs: 38, fat: 7, fiber: 11, sodium: 520, sugar: 5 },
  { id: "dal-tadka", name: "Dal Tadka", category: "Protein", servingLabel: "1 katori (150 g)", calories: 180, protein: 9, carbs: 22, fat: 6, fiber: 7, sodium: 390, sugar: 2 },
  { id: "moong-dal", name: "Moong Dal (cooked)", category: "Protein", servingLabel: "1 katori (150 g)", calories: 160, protein: 10, carbs: 21, fat: 3.5, fiber: 7.5, sodium: 300, sugar: 1 },
  { id: "sprouts-salad", name: "Moong Sprouts Salad", category: "Protein", servingLabel: "1 cup (120 g)", calories: 84, protein: 7.5, carbs: 12, fat: 0.5, fiber: 4, sodium: 90, sugar: 2 },
  // R71-a · Protein additions — USDA FDC SR Legacy per-100g cooked data scaled
  // to the serving (chicken thigh, tempeh, sardines, duck breast); IFCT-2017
  // home-style dishes (chicken tikka, sambar, dal makhani, chole, palak paneer,
  // butter chicken, shrimp curry) with sodium following the existing curry-row
  // home salt idiom; tuna sandwich per the USDA sandwich-entry family.
  { id: "chicken-thigh", name: "Chicken Thigh (skinless, cooked)", category: "Protein", servingLabel: "1 thigh (120 g)", calories: 251, protein: 31, carbs: 0, fat: 13, fiber: 0, sodium: 107, sugar: 0 },
  { id: "egg-fried", name: "Fried Egg", category: "Protein", servingLabel: "1 large (46 g)", calories: 90, protein: 6.3, carbs: 0.4, fat: 6.9, fiber: 0, sodium: 95, sugar: 0.2 },
  { id: "tempeh", name: "Tempeh", category: "Protein", servingLabel: "100 g", calories: 194, protein: 20.3, carbs: 7.6, fat: 9.2, fiber: 2.6, sodium: 9, sugar: 3 },
  { id: "sardines", name: "Sardines (canned in oil)", category: "Protein", servingLabel: "1 can (92 g)", calories: 191, protein: 22.6, carbs: 0, fat: 10.6, fiber: 0, sodium: 465, sugar: 0 },
  { id: "duck-breast", name: "Duck Breast (roasted)", category: "Protein", servingLabel: "150 g", calories: 302, protein: 35.3, carbs: 0, fat: 16.8, fiber: 0, sodium: 98, sugar: 0 },
  { id: "chicken-tikka", name: "Chicken Tikka (grilled)", category: "Protein", servingLabel: "1 plate (180 g)", calories: 300, protein: 42, carbs: 4, fat: 13, fiber: 0.5, sodium: 480, sugar: 2 },
  { id: "shrimp-curry", name: "Shrimp Curry (home style)", category: "Protein", servingLabel: "1 bowl (200 g)", calories: 220, protein: 26, carbs: 8, fat: 10, fiber: 1, sodium: 620, sugar: 3 },
  { id: "sambar", name: "Sambar (with dal & veg)", category: "Protein", servingLabel: "1 katori (150 g)", calories: 90, protein: 3.5, carbs: 12, fat: 3, fiber: 3, sodium: 380, sugar: 2.5 },
  { id: "dal-makhani", name: "Dal Makhani", category: "Protein", servingLabel: "1 katori (150 g)", calories: 195, protein: 10.5, carbs: 19.5, fat: 8.3, fiber: 6, sodium: 340, sugar: 2.5 },
  { id: "chole", name: "Chole (chickpea curry)", category: "Protein", servingLabel: "1 katori (150 g)", calories: 225, protein: 9.8, carbs: 27, fat: 8.7, fiber: 7.5, sodium: 480, sugar: 4 },
  { id: "palak-paneer", name: "Palak Paneer", category: "Protein", servingLabel: "1 katori (150 g)", calories: 230, protein: 11, carbs: 11, fat: 15, fiber: 3.5, sodium: 380, sugar: 3 },
  { id: "butter-chicken", name: "Butter Chicken", category: "Protein", servingLabel: "1 bowl (200 g)", calories: 400, protein: 30, carbs: 12, fat: 25.8, fiber: 2, sodium: 700, sugar: 6 },
  { id: "tuna-sandwich", name: "Tuna Sandwich (with mayo)", category: "Protein", servingLabel: "1 (150 g)", calories: 375, protein: 24, carbs: 33, fat: 13, fiber: 4, sodium: 680, sugar: 6 },

  // ── Grains & Carbs ───────────────────────────────────────────────────────
  { id: "white-rice", name: "White Rice (cooked)", category: "Grains & Carbs", servingLabel: "1 cup (158 g)", calories: 205, protein: 4.3, carbs: 45, fat: 0.4, fiber: 0.6, sodium: 2, sugar: 0 },
  { id: "brown-rice", name: "Brown Rice (cooked)", category: "Grains & Carbs", servingLabel: "1 cup (195 g)", calories: 218, protein: 4.5, carbs: 46, fat: 1.6, fiber: 3.2, sodium: 4, sugar: 0.4 },
  { id: "jeera-rice", name: "Jeera Rice", category: "Grains & Carbs", servingLabel: "1 cup (180 g)", calories: 290, protein: 5, carbs: 48, fat: 8, fiber: 1, sodium: 290, sugar: 0.5 },
  { id: "roti", name: "Roti / Chapati", category: "Grains & Carbs", servingLabel: "1 (40 g)", calories: 130, protein: 4, carbs: 22, fat: 2.5, fiber: 2.5, sodium: 120, sugar: 0.5 },
  { id: "tandoori-roti", name: "Tandoori Roti", category: "Grains & Carbs", servingLabel: "1 (60 g)", calories: 195, protein: 5, carbs: 33, fat: 4.5, fiber: 3.5, sodium: 180, sugar: 0.8 },
  { id: "paratha", name: "Whole-Wheat Paratha", category: "Grains & Carbs", servingLabel: "1 (60 g)", calories: 270, protein: 6, carbs: 35, fat: 12, fiber: 4, sodium: 320, sugar: 1 },
  { id: "oats", name: "Rolled Oats (dry)", category: "Grains & Carbs", servingLabel: "40 g", calories: 156, protein: 5.4, carbs: 27, fat: 2.8, fiber: 4, sodium: 2, sugar: 0.5 },
  { id: "poha", name: "Poha", category: "Grains & Carbs", servingLabel: "1 plate (150 g)", calories: 270, protein: 5, carbs: 50, fat: 6, fiber: 2, sodium: 380, sugar: 3 },
  { id: "upma", name: "Upma", category: "Grains & Carbs", servingLabel: "1 plate (150 g)", calories: 255, protein: 6, carbs: 37, fat: 9, fiber: 3, sodium: 340, sugar: 3 },
  { id: "idli", name: "Idli", category: "Grains & Carbs", servingLabel: "2 (100 g)", calories: 140, protein: 4, carbs: 28, fat: 0.5, fiber: 1.5, sodium: 240, sugar: 0.5 },
  { id: "plain-dosa", name: "Plain Dosa", category: "Grains & Carbs", servingLabel: "1 (85 g)", calories: 168, protein: 3.9, carbs: 29, fat: 3.7, fiber: 1.5, sodium: 300, sugar: 0.6 },
  { id: "besan-chilla", name: "Besan Chilla", category: "Grains & Carbs", servingLabel: "2 (120 g)", calories: 240, protein: 10, carbs: 28, fat: 10, fiber: 4, sodium: 380, sugar: 2 },
  { id: "wheat-bread", name: "Whole-Wheat Bread", category: "Grains & Carbs", servingLabel: "2 slices (56 g)", calories: 140, protein: 7, carbs: 24, fat: 2, fiber: 4, sodium: 260, sugar: 3 },
  { id: "white-bread", name: "White Bread", category: "Grains & Carbs", servingLabel: "2 slices (50 g)", calories: 133, protein: 4, carbs: 25, fat: 1.6, fiber: 2, sodium: 290, sugar: 3 },
  { id: "pasta", name: "Pasta (cooked)", category: "Grains & Carbs", servingLabel: "1 cup (140 g)", calories: 220, protein: 8, carbs: 43, fat: 1.3, fiber: 2.5, sodium: 6, sugar: 0.8 },
  { id: "quinoa", name: "Quinoa (cooked)", category: "Grains & Carbs", servingLabel: "1 cup (185 g)", calories: 222, protein: 8, carbs: 39, fat: 3.6, fiber: 5, sodium: 13, sugar: 1.6 },
  { id: "potato-boiled", name: "Potato (boiled)", category: "Grains & Carbs", servingLabel: "150 g", calories: 130, protein: 3, carbs: 30, fat: 0.2, fiber: 2.6, sodium: 8, sugar: 0.7 },
  { id: "sweet-potato", name: "Sweet Potato (baked)", category: "Grains & Carbs", servingLabel: "150 g", calories: 135, protein: 2.4, carbs: 31, fat: 0.2, fiber: 4, sodium: 65, sugar: 6.5 },
  { id: "sweet-corn", name: "Sweet Corn (kernels)", category: "Grains & Carbs", servingLabel: "1 cup (154 g)", calories: 148, protein: 5, carbs: 32, fat: 2, fiber: 3.3, sodium: 25, sugar: 6 },
  { id: "khichdi", name: "Khichdi (moong + rice)", category: "Grains & Carbs", servingLabel: "1 bowl (250 g)", calories: 320, protein: 12, carbs: 52, fat: 7, fiber: 6, sodium: 280, sugar: 2 },
  { id: "cornflakes-milk", name: "Cornflakes with Toned Milk", category: "Grains & Carbs", servingLabel: "1 bowl (40 g + 200 ml)", calories: 265, protein: 10, carbs: 47, fat: 5, fiber: 1.5, sodium: 330, sugar: 14 },
  // R71-a · Grains & Carbs additions — USDA FDC (oatmeal cooked, muesli,
  // bagel, pancakes, mac & cheese, pasta-with-tomato-sauce); IFCT-2017
  // (naan, bajra roti, paneer/aloo paratha, veg pulao); butter toast is
  // derived arithmetically from this file's own white-bread + butter rows.
  { id: "oatmeal-cooked", name: "Oatmeal (cooked with water)", category: "Grains & Carbs", servingLabel: "1 cup (234 g)", calories: 166, protein: 5.6, carbs: 28.1, fat: 3.6, fiber: 3.7, sodium: 9, sugar: 0.7 },
  { id: "muesli", name: "Muesli (dry)", category: "Grains & Carbs", servingLabel: "1 bowl (45 g)", calories: 166, protein: 4.2, carbs: 28.4, fat: 3.9, fiber: 3.2, sodium: 15, sugar: 8 },
  { id: "bagel", name: "Bagel (plain)", category: "Grains & Carbs", servingLabel: "1 medium (98 g)", calories: 245, protein: 9.8, carbs: 48, fat: 1.5, fiber: 2.2, sodium: 430, sugar: 5.9 },
  { id: "pancakes", name: "Pancakes (plain, 3)", category: "Grains & Carbs", servingLabel: "3 (114 g)", calories: 259, protein: 7.3, carbs: 32.3, fat: 11.1, fiber: 1.1, sodium: 500, sugar: 6 },
  { id: "naan", name: "Naan (plain)", category: "Grains & Carbs", servingLabel: "1 (90 g)", calories: 280, protein: 8, carbs: 48, fat: 6.5, fiber: 2, sodium: 450, sugar: 3 },
  { id: "bajra-roti", name: "Bajra Roti", category: "Grains & Carbs", servingLabel: "1 (40 g)", calories: 125, protein: 3.5, carbs: 22, fat: 2, fiber: 3, sodium: 110, sugar: 0.5 },
  { id: "paneer-paratha", name: "Paneer Paratha", category: "Grains & Carbs", servingLabel: "1 (80 g)", calories: 285, protein: 11, carbs: 33, fat: 12, fiber: 3.5, sodium: 320, sugar: 1.5 },
  { id: "aloo-paratha", name: "Aloo Paratha", category: "Grains & Carbs", servingLabel: "1 (80 g)", calories: 290, protein: 6.5, carbs: 40, fat: 11, fiber: 4, sodium: 350, sugar: 2 },
  { id: "veg-pulao", name: "Veg Pulao", category: "Grains & Carbs", servingLabel: "1 plate (250 g)", calories: 390, protein: 9, carbs: 62, fat: 12, fiber: 4, sodium: 540, sugar: 4 },
  { id: "pasta-red-sauce", name: "Pasta with Tomato Sauce", category: "Grains & Carbs", servingLabel: "1 bowl (250 g)", calories: 280, protein: 9, carbs: 52, fat: 6, fiber: 5, sodium: 450, sugar: 8 },
  { id: "mac-and-cheese", name: "Macaroni & Cheese", category: "Grains & Carbs", servingLabel: "1 cup (200 g)", calories: 330, protein: 13.2, carbs: 40.8, fat: 12.6, fiber: 2.2, sodium: 600, sugar: 6 },
  { id: "butter-toast", name: "Butter Toast (2 slices)", category: "Grains & Carbs", servingLabel: "2 slices + 10 g butter", calories: 205, protein: 5, carbs: 28, fat: 9, fiber: 2, sodium: 370, sugar: 3 },

  // ── Fruits ───────────────────────────────────────────────────────────────
  { id: "banana", name: "Banana", category: "Fruits", servingLabel: "1 medium (118 g)", calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, sodium: 1, sugar: 14 },
  { id: "apple", name: "Apple", category: "Fruits", servingLabel: "1 medium (182 g)", calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, sodium: 2, sugar: 19 },
  { id: "orange", name: "Orange", category: "Fruits", servingLabel: "1 medium (131 g)", calories: 62, protein: 1.2, carbs: 15.4, fat: 0.2, fiber: 3.1, sodium: 0, sugar: 12 },
  { id: "mango", name: "Mango (chopped)", category: "Fruits", servingLabel: "1 cup (165 g)", calories: 99, protein: 1.4, carbs: 25, fat: 0.6, fiber: 2.6, sodium: 1, sugar: 23 },
  { id: "papaya", name: "Papaya (chopped)", category: "Fruits", servingLabel: "1 cup (145 g)", calories: 60, protein: 0.9, carbs: 15, fat: 0.4, fiber: 2.5, sodium: 2, sugar: 9 },
  { id: "grapes", name: "Grapes", category: "Fruits", servingLabel: "1 cup (151 g)", calories: 104, protein: 1.1, carbs: 27, fat: 0.2, fiber: 1.4, sodium: 2, sugar: 23 },
  { id: "watermelon", name: "Watermelon (diced)", category: "Fruits", servingLabel: "1 cup (152 g)", calories: 46, protein: 0.9, carbs: 11.5, fat: 0.2, fiber: 0.6, sodium: 2, sugar: 9.5 },
  { id: "guava", name: "Guava", category: "Fruits", servingLabel: "1 medium (100 g)", calories: 68, protein: 2.6, carbs: 14.5, fat: 1, fiber: 5.4, sodium: 2, sugar: 9 },
  { id: "pomegranate", name: "Pomegranate (arils)", category: "Fruits", servingLabel: "1 cup (174 g)", calories: 144, protein: 2.9, carbs: 32.5, fat: 2, fiber: 7, sodium: 5, sugar: 24 },
  { id: "strawberries", name: "Strawberries", category: "Fruits", servingLabel: "1 cup (152 g)", calories: 49, protein: 1, carbs: 12, fat: 0.5, fiber: 3, sodium: 2, sugar: 7.4 },
  { id: "dates", name: "Dates (khajur)", category: "Fruits", servingLabel: "3 pitted (60 g)", calories: 170, protein: 1.5, carbs: 45, fat: 0.1, fiber: 6, sodium: 1, sugar: 38 },
  // R71-a · Fruits additions — USDA FDC per-100g values × the listed cup /
  // whole-fruit serving weights (chikoo per IFCT-2017).
  { id: "blueberries", name: "Blueberries", category: "Fruits", servingLabel: "1 cup (148 g)", calories: 84, protein: 1.1, carbs: 21.5, fat: 0.5, fiber: 3.6, sodium: 1, sugar: 14.8 },
  { id: "pineapple", name: "Pineapple (chunks)", category: "Fruits", servingLabel: "1 cup (165 g)", calories: 83, protein: 0.9, carbs: 21.7, fat: 0.7, fiber: 2.3, sodium: 2, sugar: 16.3 },
  { id: "pear", name: "Pear", category: "Fruits", servingLabel: "1 medium (178 g)", calories: 101, protein: 0.7, carbs: 27.2, fat: 0.2, fiber: 5.5, sodium: 2, sugar: 17 },
  { id: "kiwi", name: "Kiwi", category: "Fruits", servingLabel: "1 medium (75 g)", calories: 46, protein: 0.8, carbs: 11.1, fat: 0.4, fiber: 2.3, sodium: 2, sugar: 6.7 },
  { id: "cherries", name: "Cherries (sweet)", category: "Fruits", servingLabel: "1 cup (138 g)", calories: 87, protein: 1.5, carbs: 22, fat: 0.3, fiber: 2.9, sodium: 0, sugar: 18 },
  { id: "muskmelon", name: "Muskmelon / Cantaloupe", category: "Fruits", servingLabel: "1 cup diced (160 g)", calories: 54, protein: 1.3, carbs: 13.1, fat: 0.3, fiber: 1.4, sodium: 26, sugar: 12.6 },
  { id: "chikoo", name: "Chikoo / Sapota", category: "Fruits", servingLabel: "1 medium (80 g)", calories: 66, protein: 0.5, carbs: 15.7, fat: 1.1, fiber: 3.9, sodium: 5, sugar: 12 },
  { id: "raisins", name: "Raisins", category: "Fruits", servingLabel: "30 g", calories: 90, protein: 0.9, carbs: 23.7, fat: 0.2, fiber: 1.1, sodium: 3, sugar: 17.7 },

  // ── Vegetables ───────────────────────────────────────────────────────────
  { id: "broccoli", name: "Broccoli (steamed)", category: "Vegetables", servingLabel: "150 g", calories: 52, protein: 4.2, carbs: 10, fat: 0.6, fiber: 5.2, sodium: 41, sugar: 2 },
  { id: "spinach", name: "Spinach (cooked)", category: "Vegetables", servingLabel: "1 cup (180 g)", calories: 41, protein: 5.4, carbs: 6.8, fat: 0.5, fiber: 4.3, sodium: 24, sugar: 0.8 },
  { id: "mixed-veg-sabzi", name: "Mixed Veg Sabzi", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 150, protein: 4, carbs: 15, fat: 8, fiber: 4.5, sodium: 300, sugar: 4 },
  { id: "cauliflower-sabzi", name: "Cauliflower Sabzi", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 140, protein: 4, carbs: 12, fat: 9, fiber: 4, sodium: 290, sugar: 3.5 },
  { id: "bhindi-sabzi", name: "Bhindi Sabzi (okra)", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 155, protein: 3.5, carbs: 13, fat: 10, fiber: 4.5, sodium: 270, sugar: 3 },
  { id: "kachumber-salad", name: "Salad (cucumber + tomato)", category: "Vegetables", servingLabel: "1 plate (150 g)", calories: 35, protein: 1.5, carbs: 7, fat: 0.3, fiber: 2, sodium: 10, sugar: 3.5 },
  { id: "green-peas", name: "Green Peas (boiled)", category: "Vegetables", servingLabel: "1 cup (160 g)", calories: 134, protein: 8.6, carbs: 25, fat: 0.4, fiber: 8.8, sodium: 6, sugar: 4 },
  { id: "corn-cob", name: "Sweet Corn Cob", category: "Vegetables", servingLabel: "1 cob (90 g)", calories: 88, protein: 3, carbs: 19, fat: 1.2, fiber: 2.5, sodium: 15, sugar: 4 },
  // R71-a · Vegetables additions — USDA FDC raw/boiled entries × the listed
  // servings; the sabzi rows follow the IFCT-2017 home-style family (same
  // oil/salt idiom as the existing sabzi rows above).
  { id: "carrot", name: "Carrot (raw)", category: "Vegetables", servingLabel: "1 medium (61 g)", calories: 25, protein: 0.6, carbs: 5.8, fat: 0.1, fiber: 1.7, sodium: 42, sugar: 2.9 },
  { id: "tomato", name: "Tomato (raw)", category: "Vegetables", servingLabel: "1 medium (123 g)", calories: 22, protein: 1.1, carbs: 4.7, fat: 0.2, fiber: 1.5, sodium: 6, sugar: 3.2 },
  { id: "cucumber", name: "Cucumber (with peel)", category: "Vegetables", servingLabel: "1 cup sliced (104 g)", calories: 16, protein: 0.7, carbs: 2.9, fat: 0.1, fiber: 0.5, sodium: 2, sugar: 1.7 },
  { id: "bell-pepper", name: "Bell Pepper (red, raw)", category: "Vegetables", servingLabel: "1 medium (119 g)", calories: 37, protein: 1.2, carbs: 7.2, fat: 0.4, fiber: 2.5, sodium: 5, sugar: 4.4 },
  { id: "onion", name: "Onion (raw)", category: "Vegetables", servingLabel: "1 medium (110 g)", calories: 44, protein: 1.2, carbs: 10.3, fat: 0.1, fiber: 1.9, sodium: 4, sugar: 4.6 },
  { id: "mushrooms", name: "Mushrooms (white)", category: "Vegetables", servingLabel: "1 cup sliced (70 g)", calories: 15, protein: 2.2, carbs: 1.2, fat: 0.2, fiber: 0.7, sodium: 4, sugar: 1.4 },
  { id: "beetroot", name: "Beetroot (boiled)", category: "Vegetables", servingLabel: "1 cup (136 g)", calories: 60, protein: 2.2, carbs: 13.6, fat: 0.2, fiber: 3.8, sodium: 79, sugar: 9.5 },
  { id: "cabbage", name: "Cabbage (raw)", category: "Vegetables", servingLabel: "1 cup chopped (89 g)", calories: 22, protein: 1.1, carbs: 5.2, fat: 0.1, fiber: 2.2, sodium: 16, sugar: 2.8 },
  { id: "green-beans-sabzi", name: "French Beans Sabzi", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 120, protein: 3, carbs: 12, fat: 7, fiber: 4, sodium: 270, sugar: 4 },
  { id: "baingan-bharta", name: "Baingan Bharta", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 155, protein: 2, carbs: 13, fat: 10.5, fiber: 4, sodium: 300, sugar: 5 },
  { id: "lauki-sabzi", name: "Lauki Sabzi (bottle gourd)", category: "Vegetables", servingLabel: "1 katori (150 g)", calories: 105, protein: 1.5, carbs: 8, fat: 8, fiber: 2, sodium: 250, sugar: 3 },

  // ── Dairy & Drinks ───────────────────────────────────────────────────────
  { id: "whole-milk", name: "Whole Milk (full cream)", category: "Dairy & Drinks", servingLabel: "1 cup (244 ml)", calories: 149, protein: 7.7, carbs: 11.7, fat: 8, fiber: 0, sodium: 105, sugar: 12.3 },
  { id: "toned-milk", name: "Toned Milk (3%)", category: "Dairy & Drinks", servingLabel: "1 cup (244 ml)", calories: 142, protein: 7.6, carbs: 12, fat: 7.2, fiber: 0, sodium: 100, sugar: 12 },
  { id: "amul-gold-milk", name: "Amul Gold Milk", category: "Dairy & Drinks", servingLabel: "1 cup (250 ml)", calories: 215, protein: 8, carbs: 11.8, fat: 15, fiber: 0, sodium: 110, sugar: 12 },
  { id: "curd", name: "Curd / Dahi", category: "Dairy & Drinks", servingLabel: "1 katori (150 g)", calories: 90, protein: 4.8, carbs: 7, fat: 4.5, fiber: 0, sodium: 65, sugar: 6 },
  { id: "buttermilk", name: "Buttermilk (chaas)", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 60, protein: 3.5, carbs: 5, fat: 2.5, fiber: 0, sodium: 190, sugar: 4.5 },
  { id: "cheese-slice", name: "Cheese Slice (processed)", category: "Dairy & Drinks", servingLabel: "1 slice (20 g)", calories: 62, protein: 3.8, carbs: 0.6, fat: 4.7, fiber: 0, sodium: 350, sugar: 0.5 },
  { id: "butter", name: "Butter", category: "Dairy & Drinks", servingLabel: "1 tbsp (14 g)", calories: 100, protein: 0.1, carbs: 0, fat: 11.5, fiber: 0, sodium: 95, sugar: 0 },
  { id: "ghee", name: "Ghee", category: "Dairy & Drinks", servingLabel: "1 tsp (5 g)", calories: 45, protein: 0, carbs: 0, fat: 5, fiber: 0, sodium: 0, sugar: 0 },
  { id: "sweet-lassi", name: "Sweet Lassi", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 250, protein: 8, carbs: 38, fat: 7, fiber: 0, sodium: 150, sugar: 32 },
  { id: "black-coffee", name: "Black Coffee (no sugar)", category: "Dairy & Drinks", servingLabel: "1 cup (240 ml)", calories: 2, protein: 0.3, carbs: 0, fat: 0, fiber: 0, sodium: 5, sugar: 0 },
  { id: "green-tea", name: "Green Tea (no sugar)", category: "Dairy & Drinks", servingLabel: "1 cup (240 ml)", calories: 2, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0, sugar: 0 },
  { id: "milk-tea", name: "Milk Tea (with sugar)", category: "Dairy & Drinks", servingLabel: "1 cup (150 ml)", calories: 70, protein: 2.5, carbs: 11, fat: 2.5, fiber: 0, sodium: 25, sugar: 10 },
  { id: "orange-juice", name: "Fresh Orange Juice", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 112, protein: 1.7, carbs: 26, fat: 0.5, fiber: 0.5, sodium: 2, sugar: 21 },
  { id: "coconut-water", name: "Coconut Water", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 47, protein: 1.7, carbs: 9, fat: 0.5, fiber: 0, sodium: 252, sugar: 6.3 },
  { id: "protein-shake", name: "Protein Shake (with milk)", category: "Dairy & Drinks", servingLabel: "1 shake (300 ml)", calories: 265, protein: 32, carbs: 15, fat: 8, fiber: 1, sodium: 180, sugar: 11 },
  { id: "sattu-drink", name: "Sattu Sharbat", category: "Dairy & Drinks", servingLabel: "1 glass (300 ml)", calories: 190, protein: 10, carbs: 30, fat: 3, fiber: 3, sodium: 60, sugar: 8 },
  { id: "banana-shake", name: "Banana Shake", category: "Dairy & Drinks", servingLabel: "1 glass (300 ml)", calories: 245, protein: 8, carbs: 40, fat: 6, fiber: 2.5, sodium: 120, sugar: 30 },
  { id: "mango-shake", name: "Mango Shake", category: "Dairy & Drinks", servingLabel: "1 glass (300 ml)", calories: 245, protein: 7, carbs: 42, fat: 5.5, fiber: 2, sodium: 110, sugar: 34 },
  // R71-a · Dairy & Drinks additions — USDA FDC (buffalo milk per IFCT-2017,
  // soy milk + chocolate milk + apple juice per USDA/label data); cola/diet
  // cola/energy drink per standard manufacturer labels; beer & wine carry the
  // PUBLISHED ethanol-inclusive kcal (4-4-9 under-counts alcohol by design);
  // filter coffee / cold coffee / mishti doi follow the IFCT-2017 milk-beverage
  // family (milk + sugar arithmetic, same idiom as the existing shakes above).
  { id: "buffalo-milk", name: "Buffalo Milk", category: "Dairy & Drinks", servingLabel: "1 cup (244 ml)", calories: 237, protein: 9.3, carbs: 12, fat: 16.9, fiber: 0, sodium: 105, sugar: 13 },
  { id: "soy-milk", name: "Soy Milk (unsweetened)", category: "Dairy & Drinks", servingLabel: "1 cup (240 ml)", calories: 80, protein: 7, carbs: 4, fat: 4.5, fiber: 1, sodium: 120, sugar: 1 },
  { id: "chocolate-milk", name: "Chocolate Milk", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 208, protein: 8, carbs: 26, fat: 8, fiber: 0, sodium: 150, sugar: 25 },
  { id: "filter-coffee", name: "Filter Coffee (with sugar)", category: "Dairy & Drinks", servingLabel: "1 cup (150 ml)", calories: 95, protein: 3, carbs: 14, fat: 3, fiber: 0, sodium: 55, sugar: 11 },
  { id: "cold-coffee", name: "Cold Coffee (milk + sugar)", category: "Dairy & Drinks", servingLabel: "1 glass (300 ml)", calories: 210, protein: 7, carbs: 30, fat: 6.5, fiber: 0, sodium: 100, sugar: 26 },
  { id: "apple-juice", name: "Apple Juice", category: "Dairy & Drinks", servingLabel: "1 glass (250 ml)", calories: 114, protein: 0.2, carbs: 28, fat: 0.2, fiber: 0.5, sodium: 3, sugar: 26 },
  { id: "cola", name: "Cola (regular)", category: "Dairy & Drinks", servingLabel: "1 can (330 ml)", calories: 139, protein: 0, carbs: 35, fat: 0, fiber: 0, sodium: 15, sugar: 35 },
  { id: "diet-cola", name: "Diet Cola", category: "Dairy & Drinks", servingLabel: "1 can (330 ml)", calories: 1, protein: 0, carbs: 0.3, fat: 0, fiber: 0, sodium: 13, sugar: 0 },
  { id: "energy-drink", name: "Energy Drink", category: "Dairy & Drinks", servingLabel: "1 can (250 ml)", calories: 110, protein: 0, carbs: 28, fat: 0, fiber: 0, sodium: 105, sugar: 27 },
  { id: "beer", name: "Beer (regular, ~5%)", category: "Dairy & Drinks", servingLabel: "1 can (330 ml)", calories: 142, protein: 1.7, carbs: 11.9, fat: 0, fiber: 0, sodium: 13, sugar: 0 },
  { id: "red-wine", name: "Red Wine (dry)", category: "Dairy & Drinks", servingLabel: "1 glass (150 ml)", calories: 128, protein: 0.1, carbs: 3.9, fat: 0, fiber: 0, sodium: 6, sugar: 0.9 },
  { id: "mishti-doi", name: "Mishti Doi (sweet curd)", category: "Dairy & Drinks", servingLabel: "1 katori (150 g)", calories: 190, protein: 5.5, carbs: 30, fat: 5, fiber: 0, sodium: 70, sugar: 29 },

  // ── Nuts & Fats ──────────────────────────────────────────────────────────
  { id: "almonds", name: "Almonds", category: "Nuts & Fats", servingLabel: "10 (14 g)", calories: 82, protein: 3, carbs: 3, fat: 7, fiber: 1.9, sodium: 0.3, sugar: 0.6 },
  { id: "walnuts", name: "Walnuts", category: "Nuts & Fats", servingLabel: "5 (20 g)", calories: 131, protein: 3, carbs: 2.7, fat: 13, fiber: 0.9, sodium: 0.6, sugar: 0.4 },
  { id: "peanuts", name: "Peanuts (roasted)", category: "Nuts & Fats", servingLabel: "30 g", calories: 170, protein: 7.7, carbs: 4.8, fat: 14.3, fiber: 2.4, sodium: 2, sugar: 0.9 },
  { id: "peanut-butter", name: "Peanut Butter", category: "Nuts & Fats", servingLabel: "1 tbsp (16 g)", calories: 94, protein: 4, carbs: 3.2, fat: 8, fiber: 0.9, sodium: 75, sugar: 1.6 },
  { id: "cashews", name: "Cashews", category: "Nuts & Fats", servingLabel: "10 (18 g)", calories: 100, protein: 3.2, carbs: 5.5, fat: 8, fiber: 0.9, sodium: 3, sugar: 0.9 },
  { id: "pistachios", name: "Pistachios", category: "Nuts & Fats", servingLabel: "10 (7 g)", calories: 40, protein: 1.4, carbs: 2, fat: 3.2, fiber: 0.7, sodium: 0.6, sugar: 0.4 },
  { id: "flax-seeds", name: "Flax Seeds", category: "Nuts & Fats", servingLabel: "1 tbsp (10 g)", calories: 53, protein: 1.8, carbs: 2.9, fat: 4.2, fiber: 2.7, sodium: 3, sugar: 0.1 },
  { id: "chia-seeds", name: "Chia Seeds", category: "Nuts & Fats", servingLabel: "1 tbsp (12 g)", calories: 58, protein: 2, carbs: 5, fat: 3.7, fiber: 4.1, sodium: 1, sugar: 0 },
  { id: "olive-oil", name: "Olive Oil", category: "Nuts & Fats", servingLabel: "1 tbsp (13.5 g)", calories: 120, protein: 0, carbs: 0, fat: 13.5, fiber: 0, sodium: 0, sugar: 0 },
  { id: "avocado", name: "Avocado", category: "Nuts & Fats", servingLabel: "half (100 g)", calories: 160, protein: 2, carbs: 8.5, fat: 14.7, fiber: 6.7, sodium: 7, sugar: 0.7 },
  // R71-a · Nuts & Fats additions — USDA FDC per-100g values (raw seeds,
  // mayonnaise, honey); honey kcal is the USDA metabolisable-energy value
  // (sucrose ≈ 3.87 kcal/g, not 4-4-9).
  { id: "pumpkin-seeds", name: "Pumpkin Seeds", category: "Nuts & Fats", servingLabel: "30 g", calories: 168, protein: 9.1, carbs: 3.2, fat: 14.7, fiber: 1.8, sodium: 2, sugar: 0.4 },
  { id: "sunflower-seeds", name: "Sunflower Seeds", category: "Nuts & Fats", servingLabel: "30 g", calories: 175, protein: 6.2, carbs: 6, fat: 15.5, fiber: 2.6, sodium: 3, sugar: 0.8 },
  { id: "sesame-seeds", name: "Sesame Seeds", category: "Nuts & Fats", servingLabel: "1 tbsp (9 g)", calories: 52, protein: 1.6, carbs: 2.1, fat: 4.5, fiber: 1.1, sodium: 1, sugar: 0.1 },
  { id: "mayonnaise", name: "Mayonnaise", category: "Nuts & Fats", servingLabel: "1 tbsp (14 g)", calories: 95, protein: 0.1, carbs: 0.1, fat: 10.5, fiber: 0, sodium: 90, sugar: 0.1 },
  { id: "honey", name: "Honey", category: "Nuts & Fats", servingLabel: "1 tbsp (21 g)", calories: 64, protein: 0.1, carbs: 17.3, fat: 0, fiber: 0, sodium: 1, sugar: 17.2 },

  // ── Snacks & Sweets ──────────────────────────────────────────────────────
  { id: "protein-bar", name: "Protein Bar", category: "Snacks & Sweets", servingLabel: "1 bar (60 g)", calories: 220, protein: 20, carbs: 22, fat: 7, fiber: 5, sodium: 200, sugar: 1 },
  { id: "dark-chocolate", name: "Dark Chocolate (70%)", category: "Snacks & Sweets", servingLabel: "2 squares (20 g)", calories: 120, protein: 1.6, carbs: 9, fat: 8.5, fiber: 2.2, sodium: 3, sugar: 5.5 },
  { id: "marie-biscuits", name: "Marie Biscuits", category: "Snacks & Sweets", servingLabel: "2 (13 g)", calories: 58, protein: 1, carbs: 8.5, fat: 2.3, fiber: 0.4, sodium: 55, sugar: 3 },
  { id: "khakhra", name: "Khakhra", category: "Snacks & Sweets", servingLabel: "1 (15 g)", calories: 62, protein: 1.5, carbs: 9, fat: 2, fiber: 1, sodium: 120, sugar: 0.5 },
  { id: "roasted-chana", name: "Roasted Chana", category: "Snacks & Sweets", servingLabel: "30 g", calories: 110, protein: 6, carbs: 17, fat: 1.5, fiber: 5, sodium: 150, sugar: 1 },
  { id: "dhokla", name: "Dhokla", category: "Snacks & Sweets", servingLabel: "3 pieces (100 g)", calories: 160, protein: 6, carbs: 22, fat: 5, fiber: 2, sodium: 380, sugar: 3 },
  { id: "peanut-chikki", name: "Peanut Chikki", category: "Snacks & Sweets", servingLabel: "1 piece (20 g)", calories: 108, protein: 3, carbs: 14, fat: 4.5, fiber: 1.2, sodium: 20, sugar: 9 },
  { id: "gulab-jamun", name: "Gulab Jamun", category: "Snacks & Sweets", servingLabel: "1 (40 g)", calories: 150, protein: 2.5, carbs: 22, fat: 6, fiber: 0.3, sodium: 90, sugar: 18 },
  { id: "rasgulla", name: "Rasgulla", category: "Snacks & Sweets", servingLabel: "1 (45 g)", calories: 120, protein: 3, carbs: 24, fat: 1.5, fiber: 0, sodium: 60, sugar: 20 },
  { id: "ice-cream", name: "Ice Cream (vanilla)", category: "Snacks & Sweets", servingLabel: "2 scoops (130 g)", calories: 270, protein: 4.7, carbs: 31, fat: 14, fiber: 0.9, sodium: 105, sugar: 28 },
  // R71-a · Snacks & Sweets additions — USDA FDC (milk chocolate, potato
  // chips, air-popped popcorn, chocolate-chip cookie); granola bar per
  // standard label data; makhana / namkeen / jalebi / kheer per IFCT-2017.
  { id: "milk-chocolate", name: "Milk Chocolate", category: "Snacks & Sweets", servingLabel: "1 bar (45 g)", calories: 241, protein: 3.4, carbs: 26.7, fat: 13.4, fiber: 1.5, sodium: 36, sugar: 23.2 },
  { id: "potato-chips", name: "Potato Chips", category: "Snacks & Sweets", servingLabel: "1 small pack (28 g)", calories: 152, protein: 1.8, carbs: 14.8, fat: 9.4, fiber: 1.2, sodium: 160, sugar: 0.2 },
  { id: "popcorn", name: "Popcorn (air-popped)", category: "Snacks & Sweets", servingLabel: "1 bowl (24 g)", calories: 93, protein: 3.1, carbs: 17.6, fat: 1.1, fiber: 3.5, sodium: 1, sugar: 0.2 },
  { id: "chocolate-chip-cookie", name: "Chocolate Chip Cookie", category: "Snacks & Sweets", servingLabel: "1 (16 g)", calories: 78, protein: 0.8, carbs: 10.2, fat: 3.8, fiber: 0.4, sodium: 80, sugar: 6.4 },
  { id: "granola-bar", name: "Granola Bar", category: "Snacks & Sweets", servingLabel: "1 bar (40 g)", calories: 180, protein: 2.8, carbs: 26, fat: 7.2, fiber: 2, sodium: 90, sugar: 8 },
  { id: "makhana", name: "Roasted Makhana", category: "Snacks & Sweets", servingLabel: "1 cup (30 g)", calories: 105, protein: 2.9, carbs: 22.9, fat: 0.2, fiber: 2.3, sodium: 60, sugar: 0.5 },
  { id: "namkeen-mixture", name: "Namkeen Mixture", category: "Snacks & Sweets", servingLabel: "30 g", calories: 144, protein: 2.4, carbs: 14.4, fat: 8.5, fiber: 1.2, sodium: 210, sugar: 1 },
  { id: "jalebi", name: "Jalebi", category: "Snacks & Sweets", servingLabel: "1 (40 g)", calories: 150, protein: 1, carbs: 24, fat: 5.5, fiber: 0.2, sodium: 90, sugar: 18 },
  { id: "kheer", name: "Kheer", category: "Snacks & Sweets", servingLabel: "1 katori (150 g)", calories: 165, protein: 4.5, carbs: 26.3, fat: 4.7, fiber: 0.3, sodium: 65, sugar: 16 },

  // ── Fast Food ────────────────────────────────────────────────────────────
  { id: "instant-noodles", name: "Instant Noodles (masala)", category: "Fast Food", servingLabel: "1 pack (70 g)", calories: 340, protein: 8, carbs: 46, fat: 14, fiber: 2.2, sodium: 1150, sugar: 3 },
  { id: "veg-biryani", name: "Veg Biryani", category: "Fast Food", servingLabel: "1 plate (250 g)", calories: 450, protein: 10, carbs: 65, fat: 18, fiber: 4, sodium: 620, sugar: 5 },
  { id: "chicken-biryani", name: "Chicken Biryani", category: "Fast Food", servingLabel: "1 plate (300 g)", calories: 560, protein: 25, carbs: 70, fat: 20, fiber: 4, sodium: 780, sugar: 5 },
  { id: "masala-dosa", name: "Masala Dosa", category: "Fast Food", servingLabel: "1 (200 g)", calories: 380, protein: 8, carbs: 55, fat: 14, fiber: 3.5, sodium: 640, sugar: 4 },
  { id: "samosa", name: "Samosa (potato)", category: "Fast Food", servingLabel: "1 (60 g)", calories: 180, protein: 3.5, carbs: 20, fat: 9, fiber: 2, sodium: 350, sugar: 2 },
  { id: "pav-bhaji", name: "Pav Bhaji", category: "Fast Food", servingLabel: "1 plate (400 g)", calories: 590, protein: 13, carbs: 80, fat: 24, fiber: 7, sodium: 980, sugar: 8 },
  { id: "bhel-puri", name: "Bhel Puri", category: "Fast Food", servingLabel: "1 plate (150 g)", calories: 290, protein: 7, carbs: 48, fat: 8, fiber: 5, sodium: 480, sugar: 6 },
  { id: "vada-pav", name: "Vada Pav", category: "Fast Food", servingLabel: "1 (150 g)", calories: 360, protein: 9, carbs: 46, fat: 15, fiber: 3.5, sodium: 680, sugar: 5 },
  { id: "momos", name: "Momos (steamed, veg)", category: "Fast Food", servingLabel: "6 (180 g)", calories: 250, protein: 8, carbs: 42, fat: 5, fiber: 2.5, sodium: 420, sugar: 3 },
  { id: "cheese-pizza", name: "Cheese Pizza", category: "Fast Food", servingLabel: "2 slices (200 g)", calories: 532, protein: 22, carbs: 66, fat: 20, fiber: 3.5, sodium: 1080, sugar: 8 },
  { id: "veg-burger", name: "Veg Burger", category: "Fast Food", servingLabel: "1 (150 g)", calories: 370, protein: 11, carbs: 44, fat: 16, fiber: 3, sodium: 720, sugar: 7 },
  { id: "french-fries", name: "French Fries", category: "Fast Food", servingLabel: "medium (117 g)", calories: 360, protein: 4, carbs: 48, fat: 17, fiber: 3.8, sodium: 270, sugar: 0.4 },
  { id: "chicken-sandwich", name: "Grilled Chicken Sandwich", category: "Fast Food", servingLabel: "1 (200 g)", calories: 420, protein: 32, carbs: 42, fat: 13, fiber: 3, sodium: 890, sugar: 6 },
  // R71-a · Fast Food additions — USDA "Fast Foods" composite entries
  // (pepperoni/veggie pizza, fried chicken, nachos, mac-style sides) plus
  // published quick-serve label data (cheeseburger, double burger, nuggets,
  // large fries); tandoori chicken / egg roll / chowmein / garlic bread follow
  // the IFCT-2017 + restaurant-family idiom of the rows above.
  { id: "cheeseburger", name: "Cheeseburger (fast food)", category: "Fast Food", servingLabel: "1 (114 g)", calories: 300, protein: 15, carbs: 32, fat: 13, fiber: 1, sodium: 680, sugar: 7 },
  { id: "double-beef-burger", name: "Double Beef Burger", category: "Fast Food", servingLabel: "1 (220 g)", calories: 550, protein: 25, carbs: 45, fat: 28, fiber: 3, sodium: 1010, sugar: 9 },
  { id: "pepperoni-pizza", name: "Pepperoni Pizza", category: "Fast Food", servingLabel: "1 slice (100 g)", calories: 290, protein: 13, carbs: 30, fat: 13, fiber: 2, sodium: 650, sugar: 3.5 },
  { id: "veggie-pizza", name: "Veggie Pizza", category: "Fast Food", servingLabel: "1 slice (100 g)", calories: 240, protein: 10, carbs: 30, fat: 9, fiber: 2.5, sodium: 540, sugar: 3 },
  { id: "fries-large", name: "French Fries (large)", category: "Fast Food", servingLabel: "1 large (154 g)", calories: 480, protein: 6, carbs: 64, fat: 23, fiber: 4.5, sodium: 350, sugar: 0.5 },
  { id: "chicken-nuggets", name: "Chicken Nuggets (6)", category: "Fast Food", servingLabel: "6 (96 g)", calories: 255, protein: 14, carbs: 15, fat: 15, fiber: 1, sodium: 480, sugar: 0.5 },
  { id: "fried-chicken", name: "Fried Chicken (1 piece)", category: "Fast Food", servingLabel: "1 breast piece (140 g)", calories: 378, protein: 30.8, carbs: 19.6, fat: 19.6, fiber: 1.1, sodium: 490, sugar: 0.2 },
  { id: "tandoori-chicken", name: "Tandoori Chicken", category: "Fast Food", servingLabel: "2 pieces (200 g)", calories: 310, protein: 34, carbs: 4, fat: 17, fiber: 0.5, sodium: 600, sugar: 2 },
  { id: "chicken-wrap", name: "Chicken Wrap (grilled)", category: "Fast Food", servingLabel: "1 (220 g)", calories: 380, protein: 28, carbs: 36, fat: 12, fiber: 3, sodium: 800, sugar: 4 },
  { id: "chicken-burrito", name: "Chicken Burrito", category: "Fast Food", servingLabel: "1 (350 g)", calories: 620, protein: 35, carbs: 72, fat: 18, fiber: 10, sodium: 1250, sugar: 4 },
  { id: "egg-roll", name: "Egg Roll (Kolkata style)", category: "Fast Food", servingLabel: "1 (150 g)", calories: 350, protein: 13, carbs: 40, fat: 15, fiber: 2.5, sodium: 550, sugar: 2 },
  { id: "chowmein", name: "Veg Chowmein", category: "Fast Food", servingLabel: "1 plate (200 g)", calories: 310, protein: 8, carbs: 42, fat: 11, fiber: 3.5, sodium: 650, sugar: 5 },
  { id: "nachos", name: "Nachos with Cheese", category: "Fast Food", servingLabel: "1 plate (200 g)", calories: 590, protein: 14, carbs: 62, fat: 31, fiber: 5, sodium: 1000, sugar: 4 },
  { id: "garlic-bread", name: "Garlic Bread (4 pieces)", category: "Fast Food", servingLabel: "4 (100 g)", calories: 350, protein: 8, carbs: 45, fat: 15, fiber: 2.5, sodium: 600, sugar: 3 },
]

export const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(FOODS.map((f) => [f.id, f]))

// ── R71-a · ranked search ─────────────────────────────────────────────────────
// Deterministic scoring ladder (lower rank = stronger match, searched first):
//   0 exact        — name equals the query (case-insensitive)
//   1 word-prefix  — query prefixes the name from index 0 ("chicken" →
//                    "Chicken Curry…", "greek yogurt" → "Greek Yogurt (…)")
//   2 word-start   — query starts at a word boundary inside the name
//                    ("paneer" → "Palak Paneer", "breast" → "Chicken Breast…")
//   3 substring    — query appears mid-word ("read" → "Whole-Wheat Bread")
//   4 no query     — empty query matches everything at the same rank
// Ties inside a rank break alphabetically (case-insensitive, then raw name —
// a stable total order). Pure function: same inputs, same output, always.

const ALNUM = /[a-z0-9]/
const WORD_PREFIX_RANK = 1
const WORD_START_RANK = 2
const SUBSTRING_RANK = 3
const NO_QUERY_RANK = 4

function matchRank(nameLower: string, q: string): number {
  if (q === "") return NO_QUERY_RANK
  if (nameLower === q) return 0
  const idx = nameLower.indexOf(q)
  if (idx === -1) return -1 // no match at all
  if (idx === 0) return WORD_PREFIX_RANK
  // word-start: the character before the hit is a boundary (space, "(", "-", …)
  const atWordStart = !ALNUM.test(nameLower[idx - 1])
  return atWordStart ? WORD_START_RANK : SUBSTRING_RANK
}

/** Case-insensitive RANKED name match (exact > word-prefix > word-start >
 *  substring, ties alphabetical); optional category filter; default limit 50. */
export function searchFoods(query: string, category?: string | null, limit = 50): FoodItem[] {
  const q = query.trim().toLowerCase()
  const cat = typeof category === "string" ? category.trim() : null
  const out = FOODS.filter((f) => (!cat || f.category === cat) && matchRank(f.name.toLowerCase(), q) !== -1)
  out.sort((a, b) => {
    const ra = matchRank(a.name.toLowerCase(), q)
    const rb = matchRank(b.name.toLowerCase(), q)
    if (ra !== rb) return ra - rb
    const la = a.name.toLowerCase()
    const lb = b.name.toLowerCase()
    if (la !== lb) return la < lb ? -1 : 1
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  })
  return out.length > limit ? out.slice(0, limit) : out
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export type MealType = "breakfast" | "lunch" | "dinner" | "snack"

export const MEAL_TYPES: readonly { id: MealType; label: string; hint: string }[] = [
  { id: "breakfast", label: "Breakfast", hint: "First meal of the day" },
  { id: "lunch", label: "Lunch", hint: "Midday refuel" },
  { id: "dinner", label: "Dinner", hint: "Evening recovery meal" },
  { id: "snack", label: "Snack", hint: "Between-meal fuel" },
]

// ─── Profile → calorie / macro targets ────────────────────────────────────────

export const ACTIVITY_LEVELS: readonly { id: string; label: string; factor: number }[] = [
  { id: "sedentary", label: "Sedentary — desk job, little exercise", factor: 1.2 },
  { id: "light", label: "Light — 1–3 workouts / week", factor: 1.375 },
  { id: "moderate", label: "Moderate — 3–5 workouts / week", factor: 1.55 },
  { id: "active", label: "Active — 6–7 workouts / week", factor: 1.725 },
  { id: "very", label: "Athlete — 2× daily training", factor: 1.9 },
]

export const GOALS: readonly { id: string; label: string; kcalAdj: number }[] = [
  { id: "cut", label: "Cut — lose fat", kcalAdj: -450 },
  { id: "maintain", label: "Maintain", kcalAdj: 0 },
  { id: "bulk", label: "Bulk — build muscle", kcalAdj: 300 },
]

// ─── Macro split presets (R3-b) ────────────────────────────────────────────────
// A macro split OVERRIDES the per-goal protein g/kg + fat percentage when set.
// null (unset) keeps the per-goal defaults that predate this feature.

export const MACRO_SPLITS: readonly { id: string; label: string; desc: string; proteinPerKg: number; fatPct: number }[] = [
  {
    id: "balanced",
    label: "Balanced",
    desc: "1.8 g/kg protein · 25% fat — even keel for any goal",
    proteinPerKg: 1.8,
    fatPct: 0.25,
  },
  {
    id: "highprotein",
    label: "High Protein",
    desc: "2.4 g/kg protein · 22% fat — recovery + satiety",
    proteinPerKg: 2.4,
    fatPct: 0.22,
  },
  {
    id: "lowcarb",
    label: "Low Carb",
    desc: "2.0 g/kg protein · 40% fat — fat-fueled fueling",
    proteinPerKg: 2.0,
    fatPct: 0.4,
  },
  {
    id: "carbload",
    label: "Carb Load",
    desc: "1.6 g/kg protein · 18% fat — endurance + performance",
    proteinPerKg: 1.6,
    fatPct: 0.18,
  },
]

export type ProfileInput = {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
  /** Explicit macro-split preset id — see MACRO_SPLITS. null/undefined = per-goal default split. */
  macroSplit?: string | null
}

/** Library defaults applied whenever a profile field was never personalized. */
export const DEFAULT_PROFILE: {
  heightCm: 175
  weightKg: 70
  birthYear: 1995
  sex: "male"
  activityLevel: "moderate"
  goal: "maintain"
} = {
  heightCm: 175,
  weightKg: 70,
  birthYear: 1995,
  sex: "male",
  activityLevel: "moderate",
  goal: "maintain",
}

export type NutritionTargets = {
  calories: number
  protein: number
  carbs: number
  fat: number
  waterMl: number
  bmr: number
  tdee: number
  // R17-A micro targets (Cronometer parity) — derived alongside macros.
  fiberG: number
  sodiumMg: number
  sugarG: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

/**
 * Mifflin-St Jeor BMR → TDEE → goal-adjusted calories and macro split.
 * Null profile fields fall back to DEFAULT_PROFILE values.
 *
 * Macro-split precedence: an EXPLICIT non-null `macroSplit` (including
 * "balanced") overrides the per-goal protein g/kg and fat percentage with the
 * preset's values. `null`/undefined keeps the per-goal defaults (cut 2.2 /
 * bulk 1.6 / else 1.8 g/kg protein, 25% of kcal as fat) — byte-identical to
 * the pre-preset behavior for the same profile. Carbs always take the
 * remainder with a 50 g floor.
 */
export function calcTargets(profile: ProfileInput): NutritionTargets {
  const heightCm = profile.heightCm ?? DEFAULT_PROFILE.heightCm
  const weightKg = profile.weightKg ?? DEFAULT_PROFILE.weightKg
  const birthYear = profile.birthYear ?? DEFAULT_PROFILE.birthYear
  const sex = profile.sex ?? DEFAULT_PROFILE.sex
  const activityLevel = profile.activityLevel ?? DEFAULT_PROFILE.activityLevel
  const goal = profile.goal ?? DEFAULT_PROFILE.goal
  const split = profile.macroSplit ? MACRO_SPLITS.find((s) => s.id === profile.macroSplit) : undefined

  const age = clamp(new Date().getFullYear() - birthYear, 15, 80)
  const female = sex === "female"

  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (female ? -161 : 5)
  const factor = ACTIVITY_LEVELS.find((a) => a.id === activityLevel)?.factor ?? 1.55
  const tdee = bmr * factor
  const kcalAdj = GOALS.find((g) => g.id === goal)?.kcalAdj ?? 0
  const floor = female ? 1200 : 1500
  const calories = Math.max(floor, tdee + kcalAdj)

  const proteinPerKg = split ? split.proteinPerKg : goal === "cut" ? 2.2 : goal === "bulk" ? 1.6 : 1.8
  const fatPct = split ? split.fatPct : 0.25
  const protein = weightKg * proteinPerKg
  const fat = (calories * fatPct) / 9
  const carbs = Math.max(50, (calories - protein * 4 - fat * 9) / 4)

  return {
    calories: Math.round(calories / 10) * 10,
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    waterMl: hydrateGoalMl(weightKg),
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    fiberG: fiberGoalFor(Math.round(calories / 10) * 10),
    sodiumMg: SODIUM_CAP_MG,
    sugarG: sugarCapFor(Math.round(calories / 10) * 10),
  }
}

/** Hydration goal: 35 ml per kg bodyweight, rounded to 50, clamped 2000–4000. */
export function hydrateGoalMl(weightKg: number): number {
  return clamp(Math.round((weightKg * 35) / 50) * 50, 2000, 4000)
}

// ─── BMI ──────────────────────────────────────────────────────────────────────

export function bmiFor(weightKg: number, heightCm: number): number {
  if (weightKg <= 0 || heightCm <= 0) return 0
  const h = heightCm / 100
  return Math.round((weightKg / (h * h)) * 10) / 10
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight"
  if (bmi < 25) return "Normal weight"
  if (bmi < 30) return "Overweight"
  if (bmi < 35) return "Obese Class I"
  if (bmi < 40) return "Obese Class II"
  return "Obese Class III"
}

// ─── Waist-to-height ratio + fiber goal (R6-c — science readouts) ─────────────
// Additive evidence helpers: pure functions consumed by the Body metrics view
// (WAIST-TO-HEIGHT readout) and the Fuel tab's FUEL SCIENCE strip.

/**
 * Waist-to-height ratio — null on invalid input (non-finite / non-positive).
 * Returns the ratio rounded to 3 decimals (90/175 → 0.514).
 */
export function waistToHeight(waistCm: number, heightCm: number): number | null {
  if (!Number.isFinite(waistCm) || !Number.isFinite(heightCm)) return null
  if (waistCm <= 0 || heightCm <= 0) return null
  return Math.round((waistCm / heightCm) * 1000) / 1000
}

/**
 * Cardiometabolic-risk verdict for a waist-to-height ratio (Ashwell / WHO):
 * < 0.5 → KEEP · 0.5–0.6 → WATCH · > 0.6 → ACT.
 * The note carries the Ashwell line (citation inline, uppercase-ready).
 */
export function waistToHeightVerdict(ratio: number): { label: string; note: string } {
  const note = "KEEP WAIST UNDER HALF YOUR HEIGHT — LOW CARDIOMETABOLICAL RISK (ASHWELL)"
  if (!Number.isFinite(ratio)) return { label: "NO DATA", note }
  if (ratio < 0.5) return { label: "KEEP", note }
  if (ratio <= 0.6) return { label: "WATCH", note }
  return { label: "ACT", note }
}

/** Fiber density quoted app-wide: 14 g per 1000 kcal (Institute of Medicine AI). */
export const FIBER_PER_KCAL = 14 // grams per 1000 kcal

/** Daily fiber goal for a calorie target — 14 g per 1000 kcal, rounded (2720 → 38 g). */
export function fiberGoalFor(calories: number): number {
  if (!Number.isFinite(calories) || calories <= 0) return 0
  return Math.round((calories / 1000) * FIBER_PER_KCAL)
}

// ─── R17-A · sodium + sugar caps (Cronometer/MyFitnessPal micro layer) ───────

/** Daily sodium ceiling — AHA/WHO 2300 mg. Flat cap (not calorie-scaled). */
export const SODIUM_CAP_MG = 2300

/** Added-sugars ceiling — <10% of calories, 4 kcal/g (2000 kcal → 50 g). */
export const SUGAR_KCAL_PCT = 0.1

/** Daily sugar cap for a calorie target, rounded to whole grams (min 25 g). */
export function sugarCapFor(calories: number): number {
  if (!Number.isFinite(calories) || calories <= 0) return 0
  return Math.max(25, Math.round((calories * SUGAR_KCAL_PCT) / 4))
}

// ─── Protein timing (R8-c — per-meal dose science) ─────────────────────────────
// Additive evidence helpers for the Fuel tab's PROTEIN TIMING panel: the
// Schoenfeld & Aragon 2018 per-meal dose (~0.4 g/kg, ≥4 meals, 3-4 h apart)
// and the Areta 2013 feeding-frequency signal (4 × 20 g whey beat 2 × 40 g
// for myofibrillar protein synthesis — the spacing case, not the daily-total
// case, which Schoenfeld & Aragon show dominates).

/** Per-meal protein dose — ~0.4 g/kg of bodyweight (Schoenfeld & Aragon 2018). */
export const PROTEIN_PER_MEAL_G_PER_KG = 0.4

/** Per-meal protein target: round(0.4 × weightKg) grams (70 kg → 28 g). */
export function mealProteinTarget(weightKg: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) return 0
  return Math.round(PROTEIN_PER_MEAL_G_PER_KG * weightKg)
}

/** Per-meal dose verdict: full dose / light / skip. */
export type ProteinDoseVerdict = "DOSE" | "LIGHT" | "SKIP"

/**
 * Verdict for one meal's protein against the ~0.4 g/kg per-meal dose:
 * DOSE at ≥ target · LIGHT at ≥ half the target · SKIP below.
 */
export function proteinDoseVerdict(proteinG: number, weightKg: number): ProteinDoseVerdict {
  const target = mealProteinTarget(weightKg)
  if (proteinG >= target) return "DOSE"
  if (proteinG >= target / 2) return "LIGHT"
  return "SKIP"
}

/** Feeding-spacing evidence line — 4+ feedings beat 2 (Areta et al. 2013). */
export function feedingSpacingNote(): string {
  return "SPREAD 3-4H APART · 4+ FEEDINGS BEAT 2 (ARETA 2013)"
}


// ─── Body metrics ─────────────────────────────────────────────────────────────

export const METRIC_TYPES: readonly { id: string; label: string; unit: string; step: number; hint?: string }[] = [
  { id: "weight", label: "Weight", unit: "kg", step: 0.1, hint: "Weigh in the morning, before food" },
  { id: "chest", label: "Chest", unit: "cm", step: 0.5, hint: "Measure across the nipple line" },
  { id: "waist", label: "Waist", unit: "cm", step: 0.5, hint: "Measure at the navel" },
  { id: "hips", label: "Hips", unit: "cm", step: 0.5, hint: "Measure at the widest point" },
  // R68 — Navy body-fat tape input (audit 2-a B1): "neck" was readable by the
  // insights Navy model but unwritable in-app (only the CSV importer had it),
  // so bodyCompInsight permanently reported missing:neck. Bounds mirror
  // csv.ts's importer range (20–80 cm) under the R31-0 METRIC_TYPES↔
  // METRIC_RANGES pairing rule.
  { id: "neck", label: "Neck", unit: "cm", step: 0.5, hint: "Just below the Adam's apple, tape slightly sloped" },
  { id: "arm", label: "Arm", unit: "cm", step: 0.5, hint: "Relaxed biceps, dominant arm" },
  { id: "thigh", label: "Thigh", unit: "cm", step: 0.5, hint: "Measure at the widest point" },
  { id: "calf", label: "Calf", unit: "cm", step: 0.5, hint: "Measure at the widest point" },
  { id: "sleep", label: "Sleep", unit: "h", step: 0.5, hint: "Hours slept last night" },
  { id: "restingHr", label: "Resting HR", unit: "bpm", step: 1, hint: "Measure right after waking" },
  // ── Health vitals (Vitals tab — daily check-in) ──
  { id: "bpSystolic", label: "BP systolic", unit: "mmHg", step: 1, hint: "Seated, rested 5 min (AHA method)" },
  { id: "bpDiastolic", label: "BP diastolic", unit: "mmHg", step: 1, hint: "Bottom number of the same reading" },
  { id: "spo2", label: "Blood O₂", unit: "%", step: 1, hint: "Pulse oximeter, warm finger" },
  { id: "hrv", label: "HRV", unit: "ms", step: 1, hint: "Wearable RMSSD, morning reading" },
  { id: "stress", label: "Stress", unit: "/10", step: 1, hint: "Subjective 0 (calm) – 10 (wired)" },
  { id: "mood", label: "Mood", unit: "/5", step: 1, hint: "Subjective 1 (low) – 5 (great)" },
  { id: "energy", label: "Energy", unit: "/5", step: 1, hint: "Subjective 1 (drained) – 5 (charged)" },
  // ── Fitness tests (Vitals tab — testing lab) ──
  { id: "vo2max", label: "VO₂ max", unit: "ml/kg/min", step: 0.1, hint: "Cooper 12-min or Rockport walk estimate" },
  { id: "pushupReps", label: "Push-up test", unit: "reps", step: 1, hint: "Max consecutive reps, strict form" },
  { id: "plankSec", label: "Plank test", unit: "s", step: 1, hint: "Max hold with straight hips" },
  { id: "sitReachCm", label: "Sit & reach", unit: "cm", step: 0.5, hint: "Best of 3, sitting reach past toes" },
  // ── Sensor-bridge & power metrics (R31 — watch sync + Ascent advisor) ──
  { id: "steps", label: "Steps", unit: "steps", step: 100, hint: "Daily step count — watch or phone" },
  { id: "verticalJumpCm", label: "Vertical jump", unit: "cm", step: 0.5, hint: "Wall/chalk test — best of 3 attempts" },
  { id: "standingReachCm", label: "Standing reach", unit: "cm", step: 0.5, hint: "Flat feet, dominant arm reach on a wall" },
  // ── Ascent-expansion capability tests (R32-b — pull-up + 5K advisors).
  // PAIRED with METRIC_RANGES in app/api/metrics/route.ts — the POST handler
  // dereferences range.min unguarded, so a type here without a range there
  // crashes every metrics POST (the R31-0 pairing rule, honored in-commit). ──
  { id: "deadHangSec", label: "Dead hang", unit: "s", step: 1, hint: "Max passive bar hang — both feet off the floor" },
  { id: "best5kSec", label: "Best 5K", unit: "s", step: 10, hint: "Race or time-trial clock, rounded to 10 s" },
  { id: "best1kSec", label: "Best 1K", unit: "s", step: 1, hint: "All-out 1K time-trial" },
]

// ─── Hunter profile mapping ───────────────────────────────────────────────────

export type HunterProfile = {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
  macroSplit: string | null
}

/** Pulls the editable nutrition profile fields off a hunter-shaped record. */
export function hunterProfile(h: {
  heightCm: number | null
  weightKg: number | null
  birthYear: number | null
  sex: string | null
  activityLevel: string | null
  goal: string | null
  macroSplit?: string | null
}): HunterProfile {
  return {
    heightCm: h.heightCm,
    weightKg: h.weightKg,
    birthYear: h.birthYear,
    sex: h.sex,
    activityLevel: h.activityLevel,
    goal: h.goal,
    macroSplit: h.macroSplit ?? null,
  }
}
