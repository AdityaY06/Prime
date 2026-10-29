/**
 * The research library behind every number in ASCEND.
 * Papers are paraphrased faithfully; read the originals when planning anything serious.
 */

export type ResearchTag = 'nutrition' | 'training' | 'habits' | 'sleep' | 'steps';

export interface Paper {
  id: string;
  title: string;
  authors: string;
  year: number;
  journal: string;
  tag: ResearchTag;
  finding: string;
  takeaway: string;
}

export const PAPERS: Paper[] = [
  {
    id: 'mifflin-1990',
    title: 'A new predictive equation for resting energy expenditure in healthy individuals',
    authors: 'Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO',
    year: 1990,
    journal: 'American Journal of Clinical Nutrition',
    tag: 'nutrition',
    finding: 'Measured resting energy expenditure in 498 healthy subjects and derived the now-standard equation: REE = 10×kg + 6.25×cm − 5×age + sex-offset. More accurate than Harris-Benedict for modern populations.',
    takeaway: 'Your BMR in this app is Mifflin-St Jeor — the equation a 2005 validation review found most reliable for the general population.',
  },
  {
    id: 'frankenfield-2005',
    title: 'Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults',
    authors: 'Frankenfield D, Roth-Yousey L, Compher C',
    year: 2005,
    journal: 'Journal of the American Dietetic Association',
    tag: 'nutrition',
    finding: 'Systematic review of RMR prediction equations. Mifflin-St Jeor predicted within ±10% for ~80% of individuals — the best of the common equations.',
    takeaway: 'Even the best formula carries ±10% error. Track weekly weight trend, not day-to-day, and adjust calories from real-world drift.',
  },
  {
    id: 'hall-2011',
    title: 'Quantification of the effect of energy imbalance on bodyweight',
    authors: 'Hall KD, Sacks G, Chandramohan D, Chow CC, Wang YC, Gortmaker SL, Swinburn BA',
    year: 2011,
    journal: 'The Lancet',
    tag: 'nutrition',
    finding: 'The popular "3,500 kcal = 1 lb" rule overestimates loss because energy expenditure falls as you diet (adaptive thermogenesis). Dynamic models predict real trajectories far better.',
    takeaway: 'This app uses ~7,700 kcal/kg as a planning average, then expects you to re-adjust from scale trend — not to hit a static prediction.',
  },
  {
    id: 'morton-2018',
    title: 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training gains',
    authors: 'Morton RW, Murphy KT, McKellar SR, et al.',
    year: 2018,
    journal: 'British Journal of Sports Medicine',
    tag: 'nutrition',
    finding: '49 studies, 1,863 participants. Total protein intake above ~1.6 g/kg/day produced no additional hypertrophy (breakpoint); the 95% CI runs to ~2.2 g/kg.',
    takeaway: 'Protein target sits between 1.8–2.2 g/kg depending on goal. More than that is not "wasted", but the returns are statistically flat.',
  },
  {
    id: 'helms-2014',
    title: 'Evidence-based recommendations for natural bodybuilding contest preparation',
    authors: 'Helms ER, Aragon AA, Fitschen PJ',
    year: 2014,
    journal: 'Journal of the International Society of Sports Nutrition',
    tag: 'nutrition',
    finding: 'For lean athletes in a deficit, 2.3–3.1 g/kg of fat-free mass per day best preserves lean mass during fat loss.',
    takeaway: 'Cutting calories? Protein goes UP, not down — that is why fat-loss plans here default to 2.2 g/kg.',
  },
  {
    id: 'reynolds-2019',
    title: 'Carbohydrate quality and human health: a series of systematic reviews and meta-analyses',
    authors: 'Reynolds A, Mann J, Cummings J, Winter N, Mete E, Te Morenga L',
    year: 2019,
    journal: 'The Lancet',
    tag: 'nutrition',
    finding: 'Highest vs lowest fibre intake: 15–30% lower all-cause mortality, cardiovascular mortality, stroke, type-2 diabetes and colorectal cancer. 25–29 g/day is the apparent optimum.',
    takeaway: 'Fibre goal scales at 14 g per 1,000 kcal. Whole grains, legumes, fruit and veg — the database tags fibre per food.',
  },
  {
    id: 'aune-2017',
    title: 'Fruit and vegetable intake and the risk of cardiovascular disease, total cancer and all-cause mortality',
    authors: 'Aune D, Giovannucci E, Boffetta P, et al.',
    year: 2017,
    journal: 'International Journal of Epidemiology',
    tag: 'nutrition',
    finding: 'Up to 800 g/day of fruit and vegetables, dose–response: each 200 g increment cuts heart disease ~8%, cancer ~3%, all-cause mortality ~4%. Risk falls up to ~5 servings and keeps declining modestly to 10.',
    takeaway: 'The "5-a-day" habit card is the highest-leverage nutrition behaviour after total calories and protein.',
  },
  {
    id: 'schoenfeld-2017',
    title: 'Strength and hypertrophy adaptations between low- vs. high-load resistance training',
    authors: 'Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW',
    year: 2017,
    journal: 'Journal of Strength and Conditioning Research',
    tag: 'training',
    finding: 'Meta-analysis: hypertrophy is similar across loading zones (5–30+ reps) when sets are taken close to failure; maximal strength favours heavy loads.',
    takeaway: 'Rep range is a tool, not a religion. Pick loads that let you train hard with clean technique — the logger accepts any rep count.',
  },
  {
    id: 'schoenfeld-2016',
    title: 'Effects of resistance training frequency on measures of muscle hypertrophy',
    authors: 'Schoenfeld BJ, Ogborn D, Krieger JW',
    year: 2016,
    journal: 'Sports Medicine',
    tag: 'training',
    finding: 'Meta-analysis of 10 studies: training a muscle 2×/week produced significantly more growth than 1×/week at equal study duration.',
    takeaway: 'The Body tab tracks per-muscle weekly sets — hit each muscle at least twice a week, 10–20 hard sets.',
  },
  {
    id: 'robinson-2024',
    title: 'Exploring the dose–response relationship between estimated resistance training proximity to failure and strength/hypertrophy',
    authors: 'Robinson ZP, Pelland JC, Remmert JF, et al.',
    year: 2024,
    journal: 'Medicine & Science in Sports & Exercise',
    tag: 'training',
    finding: 'Meta-regression: 0–3 reps in reserve grow essentially the same muscle as failure sets; failure costs extra fatigue and cuts subsequent volume.',
    takeaway: 'Log RIR per set in the workout logger. Leaving 1–2 reps in the tank buys recovery without costing growth.',
  },
  {
    id: 'maeo-2021',
    title: 'Greater hamstrings hypertrophy after seated vs. lying leg curl training',
    authors: 'Maeo S, Wu Y, Miki A, Kono R, Watanabe H, Kanehisa H, Yanai T',
    year: 2021,
    journal: 'Medicine & Science in Sports & Exercise',
    tag: 'training',
    finding: 'Training at long muscle lengths (seated leg curl vs lying) grew hamstrings ~1.6× more distally and substantially more overall.',
    takeaway: 'Full range with a loaded stretch — the deepest position of every exercise is the growth-critical one. Cues in the library hammer this.',
  },
  {
    id: 'ainsworth-2011',
    title: '2011 Compendium of Physical Activities: a second update of codes and MET values',
    authors: 'Ainsworth BE, Haskell WL, Herrmann SD, et al.',
    year: 2011,
    journal: 'Medicine & Science in Sports & Exercise',
    tag: 'training',
    finding: 'The standard catalogue of metabolic equivalents (1 MET = 3.5 ml O₂/kg/min) for 821 activities — the basis of exercise energy-expenditure estimates worldwide.',
    takeaway: 'Every exercise here carries its Compendium MET, burned kcal = MET × 3.5 × kg / 200 × minutes (ACSM equation).',
  },
  {
    id: 'who-2020',
    title: 'WHO guidelines on physical activity and sedentary behaviour',
    authors: 'World Health Organization',
    year: 2020,
    journal: 'WHO Guidelines',
    tag: 'training',
    finding: 'Adults: 150–300 min moderate (or 75–150 min vigorous) aerobic activity weekly, plus muscle-strengthening involving major muscle groups on ≥2 days.',
    takeaway: 'The Conditioning attribute axis and the Zone-2 habit are calibrated directly to the 150-minute floor.',
  },
  {
    id: 'lally-2010',
    title: 'How are habits formed: modelling habit formation in the real world',
    authors: 'Lally P, van Jaarsveld CHM, Potts HWW, Wardle J',
    year: 2010,
    journal: 'European Journal of Social Psychology',
    tag: 'habits',
    finding: '96 volunteers tracked a new daily behaviour: automaticity plateaued after a median of 66 days (range 18–254). Missing a single day had no measurable impact.',
    takeaway: 'Habit cards show an automaticity bar toward 66 days, and missing one day does not reset it. Keep showing up.',
  },
  {
    id: 'paluch-2022',
    title: 'Steps per day and all-cause mortality risk: a meta-analysis of 15 international cohorts',
    authors: 'Paluch SE, Bello NA, Pettee Gabriel KK, et al. (Steps for Health Collaborative)',
    year: 2022,
    journal: 'Lancet Public Health',
    tag: 'steps',
    finding: '47,471 adults: risk of death fell steeply with more steps up to ~7,000–10,000/day (age-dependent), then plateaued. Every extra 1,000 steps ≈ 12% lower risk in older adults.',
    takeaway: 'Step goal is 8,000 — most of the mortality benefit, achievable daily. Your logged steps auto-sync to the habit.',
  },
  {
    id: 'hirshkowitz-2015',
    title: "National Sleep Foundation's sleep time duration recommendations",
    authors: 'Hirshkowitz M, Whiton K, Albert SM, et al.',
    year: 2015,
    journal: 'Sleep Health',
    tag: 'sleep',
    finding: '18-panel expert review: adults 18–64 need 7–9 hours; 65+ need 7–8. Both short (<6 h) and long (>10 h) sleep associate with worse health outcomes.',
    takeaway: 'Sleep habit target is 7.5 h mid-range. The daily quest triggers at 7 h logged.',
  },
  {
    id: 'chang-2015',
    title: 'Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness',
    authors: 'Chang AM, Aeschbach D, Duffy JF, Czeisler CA',
    year: 2015,
    journal: 'PNAS',
    tag: 'sleep',
    finding: 'Compared to reading print, 4 h of bright-screen evening reading suppressed melatonin ~90 min, delayed circadian phase ~1.5 h, and reduced next-morning alertness.',
    takeaway: 'The screen-curfew habit exists because this is one of the cleanest causal sleep experiments ever run.',
  },
  {
    id: 'blume-2019',
    title: 'Daylight exposure vs. evening blue light: their impact on the human circadian clock',
    authors: 'Blume C, Garbazza C, Spitschan M',
    year: 2019,
    journal: 'Somnologie',
    tag: 'sleep',
    finding: 'Natural daylight is 10–100× brighter than indoor lighting and is the primary zeitgeber (time-giver) for the human circadian system; morning light advances, evening light delays the clock.',
    takeaway: '10 minutes of outdoor morning light sets tonight\'s sleep up before the day even starts.',
  },
  {
    id: 'dipietro-2013',
    title: 'Three 15-min bouts of moderate postmeal walking effectively improve 24-h glycemic control in older people',
    authors: 'DiPietro L, Gribok A, Stevens MS, Hamm LD, Rumpler J',
    year: 2013,
    journal: 'Diabetes Care',
    tag: 'habits',
    finding: '15-minute walks after each meal lowered 24-h glycaemic excursions ~30% versus one sustained 45-minute walk, especially after dinner.',
    takeaway: 'Post-meal walking is timed medicine. The habit card asks for just 10 minutes after your biggest meal.',
  },
  {
    id: 'levine-2004',
    title: 'Non-exercise activity thermogenesis (NEAT)',
    authors: 'Levine JA',
    year: 2004,
    journal: 'Diabetes Care',
    tag: 'steps',
    finding: 'NEAT — walking, standing, fidgeting — varies by up to 2,000 kcal/day between people of similar size and explains most of the inter-individual variance in fat gain during overfeeding.',
    takeaway: 'Steps and post-meal walks are the quiet majority of your daily burn. Workouts are the tip; NEAT is the iceberg.',
  },
];

/* ---------- field-tested training principles (research + evidence-based coaching consensus) ---------- */

export interface Principle {
  id: string;
  title: string;
  body: string;
  source: string;
}

export const PRINCIPLES: Principle[] = [
  {
    id: 'frequency',
    title: 'Train each muscle 2×+ per week',
    body: 'Splitting your weekly volume across at least two sessions per muscle beats cramming it into one (Schoenfeld 2016). With volume matched, frequency mainly matters as a volume-distribution tool — 4 quality sets per session beat 10 sets on Monday.',
    source: 'Schoenfeld et al. 2016 · Sports Medicine',
  },
  {
    id: 'volume',
    title: '10–20 hard sets per muscle per week',
    body: 'Most intermediate lifters grow best somewhere between the minimum effective volume (~10 direct sets) and the maximum recoverable volume (~20+). Start at the floor, add a set to lagging muscles every 2–3 weeks, and deload when performance stalls.',
    source: 'Israetel & Hoffmann 2019 · Volume Landmarks (RP)',
  },
  {
    id: 'effort',
    title: '0–3 reps in reserve on working sets',
    body: 'Sets stopped 1–3 reps shy of failure grow the same muscle as failure sets for most exercises — with less fatigue and better technique. Save true failure for the last set of stable machines.',
    source: 'Robinson et al. 2024 · MSSE',
  },
  {
    id: 'rep-range',
    title: '5–30 reps: a tool, not a rule',
    body: 'Hypertrophy is load-agnostic when effort is matched; strength is load-specific. Heavy work (5–8) builds the strength that makes moderate loads (8–15) more productive — periodise between them.',
    source: 'Schoenfeld et al. 2017 · JSCR',
  },
  {
    id: 'overload',
    title: 'Double progression beats guesswork',
    body: 'Pick a rep range (e.g. 8–12). Add reps until you own the top of the range on every set, then add 2.5 kg (upper) / 5 kg (lower) and drop back to the bottom. The logger stores your set history to make this mechanical.',
    source: 'ACSM Position Stand 2009 · field consensus',
  },
  {
    id: 'rom',
    title: 'Full range, loaded stretch',
    body: 'Growing evidence shows the stretched position of a rep carries disproportionate growth signal (seated vs lying leg curls: +~60%). Choose exercises that load the deep stretch — dips, deep squats, overhead extensions.',
    source: 'Maeo et al. 2021 · MSSE',
  },
  {
    id: 'protein-dist',
    title: 'Protein at 3–4 meals, 0.4 g/kg each',
    body: 'Even distribution of ~0.4 g/kg per meal maximises 24-hour muscle protein synthesis versus the same total in two feedings. Practically: 30–45 g per meal for most adults.',
    source: 'Areta et al. 2013 · J Physiol',
  },
  {
    id: 'neat',
    title: 'NEAT is the invisible lever',
    body: 'Non-exercise activity varies by up to 2,000 kcal/day between similar people — it dwarfs most workout burns. Steps, standing, and post-meal walks decide long-term energy balance more than your 45-minute session.',
    source: 'Levine 2004 · Diabetes Care',
  },
  {
    id: 'sleep-first',
    title: 'Sleep is the strongest legal enhancer',
    body: 'One week at 5–6 h sleep measurably cuts testosterone, raises cortisol, and impairs glucose control; athletes restricted to <6 h lose muscle faster while dieting. Fix sleep before buying anything.',
    source: 'Hirshkowitz 2015 · Leproult & Van Cauter 2011, JAMA',
  },
  {
    id: 'deload',
    title: 'Schedule fatigue, don\'t accumulate it',
    body: 'Performance stalling two weeks in a row with falling sleep and appetite is systemic fatigue, not laziness. Take every 4–8 weeks lighter (half sets, −30% load) — the trajectory after the deload is what compounds.',
    source: 'Volume-landmark model · Israetel 2019',
  },
];

/* ---------- daily research tips (rotate by date) ---------- */

export const TIPS: { text: string; cite: string }[] = [
  { text: 'Losing fat? Protein goes up, not down — 2.2 g/kg preserves lean mass in a deficit.', cite: 'Helms 2014' },
  { text: 'Reps 5–30 build the same muscle when you are within 3 reps of failure.', cite: 'Schoenfeld 2017' },
  { text: 'The 3,500-calorie rule lies — expenditure drops as you diet. Recalibrate from the weekly trend.', cite: 'Hall 2011' },
  { text: 'Missing one day does not break habit formation — the automaticity curve barely notices.', cite: 'Lally 2010' },
  { text: '7,000 steps a day is where the mortality curve bends. 10,000 is marketing; 7k is medicine.', cite: 'Paluch 2022' },
  { text: 'Evening screens delay your clock ~1.5 h. An hour of airplane mode buys it back.', cite: 'Chang 2015' },
  { text: 'Distribute protein: 4 feedings beat 2 for 24-h muscle synthesis at the same daily total.', cite: 'Areta 2013' },
  { text: 'Train each muscle twice a week — frequency distributes volume into quality sets.', cite: 'Schoenfeld 2016' },
  { text: 'The stretched position of every rep carries the strongest growth signal. Go deep.', cite: 'Maeo 2021' },
  { text: 'Fibre: every extra 8 g/day tracks ~7% lower all-cause mortality, cardiovascular events and diabetes.', cite: 'Reynolds 2019' },
  { text: 'Post-meal walks of 10–15 min blunt glucose spikes for up to 24 hours.', cite: 'DiPietro 2013' },
  { text: 'Morning daylight is 10–100× brighter than your office — it sets tonight\'s sleep now.', cite: 'Blume 2019' },
  { text: 'NEAT differences reach 2,000 kcal/day — workouts are the tip, movement is the iceberg.', cite: 'Levine 2004' },
  { text: 'Two strength sessions a week is the WHO minimum — bone, muscle and glucose all track it.', cite: 'WHO 2020' },
  { text: 'Stop sets 1–2 reps shy of failure: same growth, less fatigue, cleaner technique.', cite: 'Robinson 2024' },
  { text: 'BMR formulas carry ±10% error. Trust the 2-week weight trend, not the calculator.', cite: 'Frankenfield 2005' },
  { text: 'Cutting sleep below 6 h costs testosterone ~10–15% within a week.', cite: 'Leproult 2011' },
  { text: '400–800 g fruit & veg per day is the dose-response sweet spot for disease risk.', cite: 'Aune 2017' },
  { text: 'Progressive overload is the law: more reps, more load, or better execution — every week.', cite: 'ACSM 2009' },
  { text: 'Zone-2 cardio builds mitochondria that lift your recovery capacity between sets.', cite: 'WHO 2020' },
  { text: 'Habit automaticity takes a median 66 days — design for the plateau, not the sprint.', cite: 'Lally 2010' },
  { text: 'Strength is load-specific: keep at least some heavy (5–8 rep) work while chasing size.', cite: 'Schoenfeld 2017' },
  { text: 'Each 200 g more fruit & veg ≈ 8% less heart disease in dose-response meta-analyses.', cite: 'Aune 2017' },
  { text: 'Water at ~35 ml/kg supports performance; 2% dehydration already cuts endurance output.', cite: 'EFSA / Sawka 2007' },
];

export function tipForDate(dateISO: string): { text: string; cite: string } {
  const dayNum = Number(dateISO.replaceAll('-', '')) % TIPS.length;
  return TIPS[dayNum];
}
