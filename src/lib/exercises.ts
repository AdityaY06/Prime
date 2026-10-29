// ─── PRIME · Exercise library (Program Forge source of truth) ──────────────────
// 194 real exercises across the 7 equipment classes — 81 need NO equipment,
// matching the library browser's "NO EQUIPMENT · 81" count. Derived from the
// muscle-atlas library so names/cues/difficulty stay consistent app-wide.
//
// Also exports the shared Program plan JSON contract (ProgramPlan) used by
// /api/program, the TRAINING tab protocol view and the session-raid day flow.

export type ExerciseType = "strength" | "bodyweight" | "cardio" | "mobility"
export type Equipment = "none" | "barbell" | "dumbbell" | "kettlebell" | "machine" | "cable" | "band"

/** Primary movement pattern — drives day-slot selection in the forge. */
export type Pattern =
  | "push-h" | "push-v" | "pull-h" | "pull-v" | "squat" | "hinge" | "lunge"
  | "carry" | "core" | "calves" | "cardio" | "mobility"

export interface Exercise {
  name: string
  type: ExerciseType
  equipment: Equipment
  /** Uppercase group tags: CHEST/BACK/SHOULDERS/TRICEPS/BICEPS/LEGS/GLUTES/CORE/HAMSTRINGS/QUADS/CALVES/FULL BODY */
  muscles: string[]
  /** 1 = beginner · 2 = intermediate · 3 = advanced */
  difficulty: 1 | 2 | 3
  /** Primary movement pattern — drives day-slot selection in the forge. */
  pattern: Pattern
  /** Isometric hold — prescribed in seconds (reps field carries seconds). */
  timed?: boolean
  cue?: string
}

export const EXERCISES: Exercise[] = [
  // ── Barbell (26) ────────────────────────────────────────────
  { name: "Bench press", type: "strength", equipment: "barbell", muscles: ["CHEST", "TRICEPS", "SHOULDERS"], difficulty: 3, pattern: "push-h", cue: "Pin the shoulder blades back and down into the bench." },
  { name: "Incline bench press", type: "strength", equipment: "barbell", muscles: ["CHEST", "SHOULDERS", "TRICEPS"], difficulty: 2, pattern: "push-h", cue: "Set the bench between 30 and 45 degrees." },
  { name: "Overhead press", type: "strength", equipment: "barbell", muscles: ["SHOULDERS", "TRICEPS", "BACK", "CORE"], difficulty: 2, pattern: "push-v", cue: "Squeeze the glutes and brace hard — no rib flare." },
  { name: "Shrug", type: "strength", equipment: "barbell", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Shrug straight up toward the ears — never in circles." },
  { name: "Upright row", type: "strength", equipment: "barbell", muscles: ["BACK", "SHOULDERS", "BICEPS"], difficulty: 2, pattern: "pull-v", cue: "Hands shoulder-width; the elbows lead the pull." },
  { name: "Skull crusher", type: "strength", equipment: "barbell", muscles: ["TRICEPS", "BICEPS"], difficulty: 2, pattern: "push-h", cue: "Upper arms vertical and still — only the forearms move." },
  { name: "Close-grip bench", type: "strength", equipment: "barbell", muscles: ["TRICEPS", "CHEST", "SHOULDERS"], difficulty: 2, pattern: "push-h", cue: "Hands just inside shoulder width." },
  { name: "Deadlift", type: "strength", equipment: "barbell", muscles: ["BACK", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 3, pattern: "hinge", cue: "Set the bar over midfoot with shins nearly touching." },
  { name: "Barbell row", type: "strength", equipment: "barbell", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 2, pattern: "pull-h", cue: "Hinge to 45° or lower with a neutral spine." },
  { name: "Good morning", type: "strength", equipment: "barbell", muscles: ["HAMSTRINGS", "BACK", "GLUTES", "CORE"], difficulty: 2, pattern: "hinge", cue: "Bar on the traps, knees softly bent." },
  { name: "Barbell squat", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "BACK"], difficulty: 3, pattern: "squat", cue: "Bar tight on the back; elbows down, chest proud." },
  { name: "Romanian deadlift", type: "strength", equipment: "barbell", muscles: ["HAMSTRINGS", "GLUTES", "BACK", "CORE"], difficulty: 2, pattern: "hinge", cue: "Knees softly bent and fixed there." },
  { name: "Hip thrust", type: "strength", equipment: "barbell", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Shoulder blades on the bench with the chin tucked." },
  { name: "Front squat", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "CORE", "BACK"], difficulty: 3, pattern: "squat", cue: "Elbows high — the bar rides the front delts." },
  { name: "Sumo deadlift", type: "strength", equipment: "barbell", muscles: ["GLUTES", "HAMSTRINGS", "BACK", "QUADS"], difficulty: 3, pattern: "hinge", cue: "Wide stance, toes out; bar tight to the shins." },
  { name: "Trap-bar deadlift", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "BACK"], difficulty: 2, pattern: "hinge", cue: "Stand centered in the frame; grip the mid-handles." },
  { name: "Pause squat", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 3, pattern: "squat", cue: "Hold the bottom for a full 2-3 count — zero bounce." },
  { name: "Decline bench press", type: "strength", equipment: "barbell", muscles: ["CHEST", "TRICEPS", "SHOULDERS"], difficulty: 2, pattern: "push-h", cue: "A slight decline — 15-30° is plenty." },
  { name: "Floor press", type: "strength", equipment: "barbell", muscles: ["CHEST", "TRICEPS", "SHOULDERS", "BICEPS"], difficulty: 2, pattern: "push-h", cue: "Lie on the floor; upper arms kiss the ground softly." },
  { name: "Barbell lunge", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 2, pattern: "lunge", cue: "Bar on the traps as if squatting." },
  { name: "Zercher squat", type: "strength", equipment: "barbell", muscles: ["QUADS", "GLUTES", "CORE", "BICEPS"], difficulty: 3, pattern: "squat", cue: "Bar cradled in the elbow creases; fists or laced hands." },
  { name: "Power clean", type: "strength", equipment: "barbell", muscles: ["GLUTES", "QUADS", "BACK", "HAMSTRINGS"], difficulty: 3, pattern: "hinge", cue: "Bar over midfoot; sweep it up the shins." },
  { name: "Rack pull", type: "strength", equipment: "barbell", muscles: ["BACK", "GLUTES", "HAMSTRINGS", "BICEPS"], difficulty: 2, pattern: "hinge", cue: "Set the pins just below the knee." },
  { name: "Push press", type: "strength", equipment: "barbell", muscles: ["SHOULDERS", "TRICEPS", "QUADS", "GLUTES"], difficulty: 3, pattern: "push-v", cue: "Dip a quarter squat — torso bolt upright." },
  { name: "Barbell calf raise", type: "strength", equipment: "barbell", muscles: ["CALVES", "GLUTES", "CORE", "BACK"], difficulty: 1, pattern: "calves", cue: "Bar on the traps; balls of the feet on a plate or edge." },
  { name: "Snatch", type: "strength", equipment: "barbell", muscles: ["GLUTES", "QUADS", "BACK", "SHOULDERS"], difficulty: 3, pattern: "hinge", cue: "One violent hinge-to-overhead punch; the bar stays close." },

  // ── Dumbbell (29) ────────────────────────────────────────────
  { name: "Dumbbell fly", type: "strength", equipment: "dumbbell", muscles: ["CHEST", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Slight elbow bend, held constant for the whole set." },
  { name: "Arnold press", type: "strength", equipment: "dumbbell", muscles: ["SHOULDERS", "TRICEPS", "BACK"], difficulty: 2, pattern: "push-v", cue: "Rotate the palms out as you press up." },
  { name: "Lateral raise", type: "strength", equipment: "dumbbell", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "push-v", cue: "Lead with the elbows, pinkies slightly up." },
  { name: "Rear delt fly", type: "strength", equipment: "dumbbell", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "pull-h", cue: "Hinge at the hips until the chest is nearly parallel to the floor." },
  { name: "Bicep curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Elbows pinned at your sides." },
  { name: "Hammer curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Neutral grip — thumbs up the entire rep." },
  { name: "Preacher curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Arms flat on the pad with the armpit locked to the top." },
  { name: "Wrist curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Forearms flat on the bench, wrists free over the edge." },
  { name: "Overhead triceps extension", type: "strength", equipment: "dumbbell", muscles: ["TRICEPS", "BICEPS"], difficulty: 1, pattern: "push-v", cue: "Elbows point up and stay narrow." },
  { name: "Single-arm dumbbell row", type: "strength", equipment: "dumbbell", muscles: ["BACK", "BICEPS", "CORE", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Flat back, hips square — or slightly open for extra range." },
  { name: "Farmer's carry", type: "strength", equipment: "dumbbell", muscles: ["BACK", "BICEPS", "CORE", "GLUTES"], difficulty: 2, pattern: "carry", cue: "Stand tall — no leaning; shoulders packed down." },
  { name: "Bulgarian split squat", type: "strength", equipment: "dumbbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 2, pattern: "lunge", cue: "Rear foot on the bench; front foot about two foot-lengths out." },
  { name: "Dumbbell bench press", type: "strength", equipment: "dumbbell", muscles: ["CHEST", "TRICEPS", "SHOULDERS", "BICEPS"], difficulty: 1, pattern: "push-h", cue: "Sink the dumbbells until the chest stretches fully." },
  { name: "Incline dumbbell press", type: "strength", equipment: "dumbbell", muscles: ["CHEST", "SHOULDERS", "TRICEPS"], difficulty: 2, pattern: "push-h", cue: "Bench at 30-45°; dumbbells over the upper chest." },
  { name: "Incline dumbbell fly", type: "strength", equipment: "dumbbell", muscles: ["CHEST", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Slight fixed elbow bend, held the whole set." },
  { name: "Seated dumbbell press", type: "strength", equipment: "dumbbell", muscles: ["SHOULDERS", "TRICEPS", "BACK"], difficulty: 1, pattern: "push-v", cue: "Back flat on the pad; feet planted wide." },
  { name: "Dumbbell pullover", type: "strength", equipment: "dumbbell", muscles: ["BACK", "CHEST", "TRICEPS", "CORE"], difficulty: 1, pattern: "pull-h", cue: "Lie across or along a bench; one bell in both hands." },
  { name: "Dumbbell squat", type: "strength", equipment: "dumbbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "squat", cue: "Bells at the sides or racked at the shoulders." },
  { name: "Dumbbell goblet squat", type: "strength", equipment: "dumbbell", muscles: ["QUADS", "GLUTES", "CORE", "HAMSTRINGS"], difficulty: 1, pattern: "squat", cue: "One bell held vertically at the chest." },
  { name: "Dumbbell RDL", type: "strength", equipment: "dumbbell", muscles: ["HAMSTRINGS", "GLUTES", "BACK", "CORE"], difficulty: 2, pattern: "hinge", cue: "Bells against the thighs; knees soft and fixed." },
  { name: "Dumbbell walking lunge", type: "strength", equipment: "dumbbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 2, pattern: "lunge", cue: "Bells heavy at the sides; shoulders packed." },
  { name: "Dumbbell step-up", type: "strength", equipment: "dumbbell", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CALVES"], difficulty: 2, pattern: "lunge", cue: "Box at knee height; whole foot planted." },
  { name: "Dumbbell calf raise", type: "strength", equipment: "dumbbell", muscles: ["CALVES", "BICEPS", "GLUTES"], difficulty: 1, pattern: "calves", cue: "One bell in hand on the working side; hold a rack for balance." },
  { name: "Front raise", type: "strength", equipment: "dumbbell", muscles: ["SHOULDERS", "BACK", "CORE"], difficulty: 1, pattern: "push-v", cue: "Thumbs up; arms long like pendulums." },
  { name: "Dumbbell shrug", type: "strength", equipment: "dumbbell", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Bells heavy at the sides; shoulders hang long first." },
  { name: "Dumbbell kickback", type: "strength", equipment: "dumbbell", muscles: ["TRICEPS", "SHOULDERS", "CORE"], difficulty: 1, pattern: "push-h", cue: "Hinge flat; upper arm parallel to the floor and still." },
  { name: "Renegade row", type: "strength", equipment: "dumbbell", muscles: ["BACK", "CORE", "BICEPS", "SHOULDERS"], difficulty: 3, pattern: "pull-h", cue: "Hex bells only; feet wider than the hands." },
  { name: "Concentration curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Seated; elbow braced against the inner thigh." },
  { name: "Zottman curl", type: "strength", equipment: "dumbbell", muscles: ["BICEPS"], difficulty: 2, pattern: "pull-h", cue: "Curl up supinated; rotate the palms at the top." },

  // ── Kettlebell (11) ────────────────────────────────────────────
  { name: "Goblet squat", type: "strength", equipment: "kettlebell", muscles: ["QUADS", "GLUTES", "CORE", "HAMSTRINGS"], difficulty: 1, pattern: "squat", cue: "Hold the bell at the chest; elbows inside the knees at depth." },
  { name: "Kettlebell swing", type: "strength", equipment: "kettlebell", muscles: ["GLUTES", "HAMSTRINGS", "BACK", "CORE"], difficulty: 2, pattern: "hinge", cue: "It is a hinge, not a squat — hips back, chest forward." },
  { name: "Kettlebell thruster", type: "strength", equipment: "kettlebell", muscles: ["QUADS", "GLUTES", "SHOULDERS", "TRICEPS"], difficulty: 3, pattern: "squat", cue: "Clean the bell into a solid front rack." },
  { name: "Kettlebell clean", type: "strength", equipment: "kettlebell", muscles: ["GLUTES", "HAMSTRINGS", "SHOULDERS", "BACK"], difficulty: 2, pattern: "hinge", cue: "Hinge and guide the bell up the midline." },
  { name: "Kettlebell press", type: "strength", equipment: "kettlebell", muscles: ["SHOULDERS", "TRICEPS", "CORE", "BACK"], difficulty: 2, pattern: "push-v", cue: "Clean the bell; wrist straight, elbow tight." },
  { name: "Kettlebell snatch", type: "strength", equipment: "kettlebell", muscles: ["GLUTES", "HAMSTRINGS", "SHOULDERS", "BACK"], difficulty: 3, pattern: "hinge", cue: "One hinge-to-overhead punch; the bell orbits the hand." },
  { name: "Kettlebell row", type: "strength", equipment: "kettlebell", muscles: ["BACK", "BICEPS", "CORE"], difficulty: 1, pattern: "pull-h", cue: "Hinge flat; bells hang under the shoulders." },
  { name: "Turkish get-up", type: "strength", equipment: "kettlebell", muscles: ["SHOULDERS", "CORE", "GLUTES", "HAMSTRINGS"], difficulty: 3, pattern: "push-v", cue: "Roll to the elbow, then the hand — one segment at a time." },
  { name: "Kettlebell farmer's carry", type: "strength", equipment: "kettlebell", muscles: ["BACK", "BICEPS", "CORE", "GLUTES"], difficulty: 2, pattern: "carry", cue: "Bells heavy at the sides; shoulders packed down." },
  { name: "Double kettlebell front squat", type: "strength", equipment: "kettlebell", muscles: ["QUADS", "GLUTES", "CORE", "BACK"], difficulty: 2, pattern: "squat", cue: "Two bells in the rack; elbows tight to the ribs." },
  { name: "Single-arm kettlebell swing", type: "strength", equipment: "kettlebell", muscles: ["GLUTES", "HAMSTRINGS", "BACK", "CORE"], difficulty: 2, pattern: "hinge", cue: "Same hinge; the free arm mirrors the swing." },

  // ── Machine (incl. cardio machines) (19) ────────────────────────────────────────────
  { name: "Run (outdoor/treadmill)", type: "cardio", equipment: "machine", muscles: ["QUADS", "HAMSTRINGS", "CALVES", "GLUTES"], difficulty: 1, pattern: "cardio", cue: "Land midfoot under your hips, not far out in front." },
  { name: "Cycling", type: "cardio", equipment: "machine", muscles: ["QUADS", "CALVES", "GLUTES", "HAMSTRINGS"], difficulty: 1, pattern: "cardio", cue: "Set saddle height so the knee stays softly bent at the bottom of the stroke." },
  { name: "Rowing machine", type: "cardio", equipment: "machine", muscles: ["BACK", "BICEPS", "CORE", "QUADS"], difficulty: 2, pattern: "cardio", cue: "Sequence every stroke: legs drive, hips hinge, arms pull." },
  { name: "Stair climbing", type: "cardio", equipment: "machine", muscles: ["QUADS", "GLUTES", "CALVES", "HAMSTRINGS"], difficulty: 1, pattern: "cardio", cue: "Plant the whole foot on each step." },
  { name: "Elliptical", type: "cardio", equipment: "machine", muscles: ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"], difficulty: 1, pattern: "cardio", cue: "Keep heels planted on the pedals." },
  { name: "Back extension", type: "strength", equipment: "machine", muscles: ["BACK", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Pad at the hip crease, ankles locked in." },
  { name: "Leg press", type: "strength", equipment: "machine", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CALVES"], difficulty: 1, pattern: "squat", cue: "Feet flat and mid-platform; knees track the toes." },
  { name: "Leg curl", type: "strength", equipment: "machine", muscles: ["HAMSTRINGS", "CALVES", "GLUTES"], difficulty: 1, pattern: "hinge", cue: "Hips pinned down — no lifting into the pad." },
  { name: "Leg extension", type: "strength", equipment: "machine", muscles: ["QUADS"], difficulty: 1, pattern: "squat", cue: "Sit deep with the back pad against the spine." },
  { name: "Hack squat", type: "strength", equipment: "machine", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CALVES"], difficulty: 2, pattern: "squat", cue: "Back welded to the pad; shoulders under the handles." },
  { name: "Seated calf raise", type: "strength", equipment: "machine", muscles: ["CALVES"], difficulty: 1, pattern: "calves", cue: "Knees bent under the pad — this biases the soleus." },
  { name: "Chest press machine", type: "strength", equipment: "machine", muscles: ["CHEST", "TRICEPS", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Seat set so the handles line up mid-chest." },
  { name: "Pec deck", type: "strength", equipment: "machine", muscles: ["CHEST", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Pads at mid-chest height; slight forward lean." },
  { name: "Machine row", type: "strength", equipment: "machine", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Chest on the pad; reach a full stretch each rep." },
  { name: "Assisted pull-up", type: "strength", equipment: "machine", muscles: ["BACK", "BICEPS", "SHOULDERS", "CORE"], difficulty: 1, pattern: "pull-v", cue: "Knee or foot on the platform; grip just outside shoulder-width." },
  { name: "Hip abduction", type: "strength", equipment: "machine", muscles: ["GLUTES", "CORE"], difficulty: 1, pattern: "hinge", cue: "Pads outside the knees; back against the seat." },
  { name: "Assault bike", type: "cardio", equipment: "machine", muscles: ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"], difficulty: 2, pattern: "cardio", cue: "Drive with the legs and pull with the arms together." },
  { name: "Incline treadmill walk", type: "cardio", equipment: "machine", muscles: ["GLUTES", "QUADS", "CALVES", "HAMSTRINGS"], difficulty: 1, pattern: "cardio", cue: "Set a grade you can hold without gripping the rails." },
  { name: "Rowing intervals", type: "cardio", equipment: "machine", muscles: ["BACK", "BICEPS", "CORE", "QUADS"], difficulty: 2, pattern: "cardio", cue: "Legs-hips-arms on the drive; arms-hips-legs on the recovery." },

  // ── Cable (13) ────────────────────────────────────────────
  { name: "Cable crossover", type: "strength", equipment: "cable", muscles: ["CHEST", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Step forward into a staggered stance for stability." },
  { name: "Face pull", type: "strength", equipment: "cable", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "pull-h", cue: "Pull the rope toward the eyes, thumbs trailing back." },
  { name: "Cable pushdown", type: "strength", equipment: "cable", muscles: ["TRICEPS", "BICEPS"], difficulty: 1, pattern: "push-v", cue: "Upper arms glued to your sides." },
  { name: "Lat pulldown", type: "strength", equipment: "cable", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-v", cue: "Chest up with a 10–15° lean back — no more." },
  { name: "Straight-arm pulldown", type: "strength", equipment: "cable", muscles: ["BACK", "CORE"], difficulty: 1, pattern: "pull-h", cue: "Arms locked straight; movement comes only from the shoulders." },
  { name: "Cable woodchopper", type: "strength", equipment: "cable", muscles: ["CORE", "SHOULDERS", "BACK"], difficulty: 1, pattern: "core", cue: "Stand side-on to the stack with feet shoulder-width." },
  { name: "Seated cable row", type: "strength", equipment: "cable", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Feet planted; torso tall with a slight forward reach." },
  { name: "Cable curl", type: "strength", equipment: "cable", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Elbows pinned; step back from the stack." },
  { name: "Cable lateral raise", type: "strength", equipment: "cable", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "push-v", cue: "Stand beside the stack; handle crosses the body." },
  { name: "Cable pull-through", type: "strength", equipment: "cable", muscles: ["GLUTES", "HAMSTRINGS", "CORE", "BACK"], difficulty: 1, pattern: "hinge", cue: "Rope low behind you; hinge and reach between the legs." },
  { name: "Cable crunch", type: "strength", equipment: "cable", muscles: ["CORE"], difficulty: 1, pattern: "core", cue: "Kneel below the stack; rope held at the temples." },
  { name: "Cable overhead triceps extension", type: "strength", equipment: "cable", muscles: ["TRICEPS", "BICEPS"], difficulty: 1, pattern: "push-v", cue: "Face away from the stack; rope behind the head." },
  { name: "Cable rear delt fly", type: "strength", equipment: "cable", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "pull-h", cue: "Cables cross in front; handles swap hands." },

  // ── Band (15) ────────────────────────────────────────────
  { name: "Band pull-apart", type: "strength", equipment: "band", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "pull-h", cue: "Band at sternum height; arms stay straight throughout." },
  { name: "Band face pull", type: "strength", equipment: "band", muscles: ["SHOULDERS", "BACK"], difficulty: 1, pattern: "pull-h", cue: "Anchor at face height; grip with thumbs back." },
  { name: "Band row", type: "strength", equipment: "band", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-h", cue: "Anchor low; step back until the band is already tense." },
  { name: "Band chest press", type: "strength", equipment: "band", muscles: ["CHEST", "TRICEPS", "SHOULDERS"], difficulty: 1, pattern: "push-h", cue: "Anchor behind you at chest height; stagger your stance." },
  { name: "Band overhead press", type: "strength", equipment: "band", muscles: ["SHOULDERS", "TRICEPS", "BACK", "CORE"], difficulty: 1, pattern: "push-v", cue: "Stand on the band mid-foot; grips at shoulder height." },
  { name: "Band curl", type: "strength", equipment: "band", muscles: ["BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Elbows pinned to the ribs; only the forearms move." },
  { name: "Band lateral walk", type: "strength", equipment: "band", muscles: ["GLUTES", "QUADS", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Band above the knees; sit into a quarter squat." },
  { name: "Band good morning", type: "strength", equipment: "band", muscles: ["HAMSTRINGS", "GLUTES", "BACK", "CORE"], difficulty: 1, pattern: "hinge", cue: "Band anchored under the feet, looped over the traps." },
  { name: "Band pull-through", type: "strength", equipment: "band", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Anchor low behind you; hinge and reach between the legs." },
  { name: "Band lat pulldown", type: "strength", equipment: "band", muscles: ["BACK", "BICEPS", "SHOULDERS"], difficulty: 1, pattern: "pull-v", cue: "Anchor high; kneel down with a tall chest." },
  { name: "Band external rotation", type: "strength", equipment: "band", muscles: ["SHOULDERS", "BICEPS"], difficulty: 1, pattern: "pull-h", cue: "Elbow bent 90° and pinned against the ribs." },
  { name: "Band squat", type: "strength", equipment: "band", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "squat", cue: "Band under the feet, held at the shoulders." },
  { name: "Band triceps pushdown", type: "strength", equipment: "band", muscles: ["TRICEPS", "BICEPS"], difficulty: 1, pattern: "push-v", cue: "Anchor high; elbows glued to your sides." },
  { name: "Pallof press", type: "strength", equipment: "band", muscles: ["CORE", "SHOULDERS", "GLUTES"], difficulty: 1, pattern: "core", cue: "Stand side-on to the anchor; the band pulls you sideways." },
  { name: "Shoulder circles & band work", type: "mobility", equipment: "band", muscles: ["SHOULDERS", "BACK", "CHEST"], difficulty: 1, pattern: "mobility", cue: "Start with small slow circles and grow them gradually." },

  // ── No equipment — bodyweight & calisthenics (56) ────────────────────────────────────────────
  { name: "Push-ups", type: "bodyweight", equipment: "none", muscles: ["CHEST", "TRICEPS", "SHOULDERS", "CORE"], difficulty: 1, pattern: "push-h", cue: "Hands under the shoulders, fingers spread wide." },
  { name: "Dips", type: "bodyweight", equipment: "none", muscles: ["CHEST", "TRICEPS", "SHOULDERS"], difficulty: 2, pattern: "push-v", cue: "Lean the torso slightly forward to bias the chest." },
  { name: "Pike push-ups", type: "bodyweight", equipment: "none", muscles: ["SHOULDERS", "TRICEPS", "CHEST"], difficulty: 2, pattern: "push-v", cue: "Hips high, heels over the toes — a tight inverted V." },
  { name: "Pull-ups", type: "bodyweight", equipment: "none", muscles: ["BACK", "BICEPS", "SHOULDERS", "CORE"], difficulty: 3, pattern: "pull-v", cue: "Start from a dead hang with the shoulders active." },
  { name: "Plank hold", type: "bodyweight", equipment: "none", muscles: ["CORE", "SHOULDERS", "GLUTES", "BACK"], difficulty: 1, pattern: "core", timed: true, cue: "Elbows under the shoulders, fists relaxed." },
  { name: "Crunch", type: "bodyweight", equipment: "none", muscles: ["CORE"], difficulty: 1, pattern: "core", cue: "Curl the ribs toward the hips; the lower back stays down." },
  { name: "Hanging leg raise", type: "bodyweight", equipment: "none", muscles: ["CORE", "BICEPS", "QUADS"], difficulty: 2, pattern: "core", cue: "Hang with active shoulders — zero swinging." },
  { name: "Russian twist", type: "bodyweight", equipment: "none", muscles: ["CORE"], difficulty: 1, pattern: "core", cue: "Sit tall on the pockets with the chest up." },
  { name: "Bodyweight squats", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "squat", cue: "Feet shoulder-width, weight mid-foot." },
  { name: "Lunges", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "lunge", cue: "Step long enough that the front shin stays vertical." },
  { name: "Calf raise", type: "strength", equipment: "none", muscles: ["CALVES"], difficulty: 1, pattern: "calves", cue: "Full stretch at the bottom — heels below the toes." },
  { name: "Incline push-up", type: "bodyweight", equipment: "none", muscles: ["CHEST", "TRICEPS", "SHOULDERS", "CORE"], difficulty: 1, pattern: "push-h", cue: "Hands on a bench, box, or wall — the higher, the lighter." },
  { name: "Decline push-up", type: "bodyweight", equipment: "none", muscles: ["CHEST", "SHOULDERS", "TRICEPS", "CORE"], difficulty: 2, pattern: "push-h", cue: "Feet on a bench; hands just ahead of the shoulders." },
  { name: "Diamond push-up", type: "bodyweight", equipment: "none", muscles: ["TRICEPS", "CHEST", "CORE", "SHOULDERS"], difficulty: 2, pattern: "push-h", cue: "Index fingers and thumbs form a diamond under the sternum." },
  { name: "Wide push-up", type: "bodyweight", equipment: "none", muscles: ["CHEST", "SHOULDERS", "CORE"], difficulty: 1, pattern: "push-h", cue: "Hands one and a half shoulder-widths apart." },
  { name: "Archer push-up", type: "bodyweight", equipment: "none", muscles: ["CHEST", "TRICEPS", "SHOULDERS", "CORE"], difficulty: 3, pattern: "push-h", cue: "Extra-wide hands; shift the chest over one side." },
  { name: "Bench dip", type: "bodyweight", equipment: "none", muscles: ["TRICEPS", "CHEST", "SHOULDERS", "CORE"], difficulty: 1, pattern: "push-v", cue: "Heels of the hands on the edge; fingers forward." },
  { name: "Jump squat", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "HAMSTRINGS"], difficulty: 2, pattern: "squat", cue: "Load a quarter squat, then explode through the floor." },
  { name: "Wall sit", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "CORE"], difficulty: 1, pattern: "squat", timed: true, cue: "Back flat on the wall; thighs parallel to the floor." },
  { name: "Pistol squat progression", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CORE", "HAMSTRINGS"], difficulty: 3, pattern: "squat", cue: "Sit back to a box first; lower the target over weeks." },
  { name: "Single-leg RDL", type: "bodyweight", equipment: "none", muscles: ["HAMSTRINGS", "GLUTES", "BACK", "CORE"], difficulty: 2, pattern: "hinge", cue: "Soft bend in the standing knee; hips square forward." },
  { name: "Single-leg bridge", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "One heel planted; the free leg stays tucked or extended." },
  { name: "Glute bridge (bodyweight)", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Heels close to the hips; ribs stay down." },
  { name: "Nordic curl progression", type: "bodyweight", equipment: "none", muscles: ["HAMSTRINGS", "GLUTES", "CALVES", "CORE"], difficulty: 3, pattern: "hinge", cue: "Anchored ankles; kneel tall with glutes and hamstrings braced." },
  { name: "Sissy squat", type: "bodyweight", equipment: "none", muscles: ["QUADS", "CORE", "CALVES", "GLUTES"], difficulty: 3, pattern: "squat", cue: "Hold a support; rise onto the balls of the feet." },
  { name: "Copenhagen plank", type: "bodyweight", equipment: "none", muscles: ["CORE", "GLUTES", "HAMSTRINGS", "CHEST"], difficulty: 2, pattern: "core", timed: true, cue: "Top leg on a bench; lift the hips into a side plank." },
  { name: "Side plank", type: "bodyweight", equipment: "none", muscles: ["CORE", "GLUTES", "SHOULDERS"], difficulty: 2, pattern: "core", timed: true, cue: "Stack the feet and hips; elbow under the shoulder." },
  { name: "Plank shoulder taps", type: "bodyweight", equipment: "none", muscles: ["CORE", "SHOULDERS", "CHEST"], difficulty: 1, pattern: "core", cue: "Wide feet for a quiet platform." },
  { name: "Hollow hold", type: "bodyweight", equipment: "none", muscles: ["CORE", "QUADS", "SHOULDERS"], difficulty: 2, pattern: "core", timed: true, cue: "Press the lower back flat before lifting the legs." },
  { name: "Dead bug", type: "bodyweight", equipment: "none", muscles: ["CORE", "BACK"], difficulty: 1, pattern: "core", cue: "Lower the opposite arm and leg only as far as the back stays flat." },
  { name: "Bird dog", type: "bodyweight", equipment: "none", muscles: ["CORE", "GLUTES", "BACK", "SHOULDERS"], difficulty: 1, pattern: "core", cue: "From all fours, brace and extend the opposite arm and leg." },
  { name: "Superman hold", type: "bodyweight", equipment: "none", muscles: ["BACK", "GLUTES", "HAMSTRINGS"], difficulty: 1, pattern: "core", timed: true, cue: "Sweep the arms long overhead like flight." },
  { name: "Bear crawl", type: "bodyweight", equipment: "none", muscles: ["CORE", "SHOULDERS", "QUADS", "TRICEPS"], difficulty: 1, pattern: "core", cue: "Knees hover an inch off the floor; back flat like a table." },
  { name: "L-sit progression", type: "bodyweight", equipment: "none", muscles: ["CORE", "QUADS", "TRICEPS", "SHOULDERS"], difficulty: 3, pattern: "core", cue: "Hands on parallettes, blocks, or a chair seat." },
  { name: "Inverted row", type: "bodyweight", equipment: "none", muscles: ["BACK", "BICEPS", "SHOULDERS", "CORE"], difficulty: 2, pattern: "pull-h", cue: "Set a bar or sturdy edge at hip height; hang beneath it." },
  { name: "Negative pull-up", type: "bodyweight", equipment: "none", muscles: ["BACK", "BICEPS", "CORE", "SHOULDERS"], difficulty: 2, pattern: "pull-v", cue: "Jump or step to the top — chin over the bar." },
  { name: "Step-up", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CALVES"], difficulty: 1, pattern: "lunge", cue: "Whole foot on the box; knee tracks the toes." },
  { name: "Tuck jump", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "CORE"], difficulty: 2, pattern: "squat", cue: "Jump straight up and snap the knees to the chest." },
  { name: "Cossack squat", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CALVES"], difficulty: 3, pattern: "squat", cue: "Wide stance; shift side to side with the free toes up." },
  { name: "Single-leg calf raise", type: "bodyweight", equipment: "none", muscles: ["CALVES"], difficulty: 2, pattern: "calves", cue: "Hold a wall for balance, never for assistance." },
  { name: "Broad jump", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "HAMSTRINGS"], difficulty: 2, pattern: "squat", cue: "Load the hips with a quarter squat." },
  { name: "Wall handstand hold", type: "bodyweight", equipment: "none", muscles: ["SHOULDERS", "CORE", "BACK", "BICEPS"], difficulty: 3, pattern: "push-v", timed: true, cue: "Walk the feet up the wall into a straight stack." },
  { name: "Wall handstand push-up", type: "bodyweight", equipment: "none", muscles: ["SHOULDERS", "TRICEPS", "BACK", "CORE"], difficulty: 3, pattern: "push-v", cue: "Descend until the head kisses the floor near the hands." },
  { name: "Clamshell", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "CORE"], difficulty: 1, pattern: "hinge", cue: "Side-lying with heels together and toes lifted." },
  { name: "Donkey kick", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "From all fours, drive one heel toward the ceiling." },
  { name: "Fire hydrant", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "CORE", "HAMSTRINGS"], difficulty: 1, pattern: "hinge", cue: "From all fours, lift one bent leg out to the side." },
  { name: "Side-lying leg raise", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "CORE", "QUADS"], difficulty: 1, pattern: "core", cue: "Stack the hips; bottom arm cradles the head." },
  { name: "Flutter kick", type: "bodyweight", equipment: "none", muscles: ["CORE", "QUADS", "HAMSTRINGS"], difficulty: 1, pattern: "core", cue: "Lower back pressed flat; legs long and low." },
  { name: "Lying leg raise", type: "bodyweight", equipment: "none", muscles: ["CORE", "QUADS", "HAMSTRINGS"], difficulty: 1, pattern: "core", cue: "Press the lower back flat before every rep." },
  { name: "V-up", type: "bodyweight", equipment: "none", muscles: ["CORE", "QUADS", "HAMSTRINGS", "SHOULDERS"], difficulty: 2, pattern: "core", cue: "Hinge at the hips into a shallow V — legs straight." },
  { name: "Inchworm", type: "bodyweight", equipment: "none", muscles: ["CORE", "SHOULDERS", "HAMSTRINGS", "CALVES"], difficulty: 1, pattern: "core", cue: "Hinge, plant the hands, and walk out to a long plank." },
  { name: "Curtsy lunge", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "QUADS", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "lunge", cue: "Step one foot back and behind the other." },
  { name: "Skater hops", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "HAMSTRINGS"], difficulty: 2, pattern: "lunge", cue: "Bound side to side, landing on one leg." },
  { name: "Bridge march", type: "bodyweight", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "CORE"], difficulty: 1, pattern: "hinge", cue: "Hold the bridge lockout through the whole set." },
  { name: "Reverse crunch", type: "bodyweight", equipment: "none", muscles: ["CORE", "HAMSTRINGS"], difficulty: 1, pattern: "core", cue: "Curl the knees to the chest by rolling the pelvis up." },
  { name: "Bulgarian split squat (bodyweight)", type: "bodyweight", equipment: "none", muscles: ["QUADS", "GLUTES", "HAMSTRINGS", "CORE"], difficulty: 2, pattern: "lunge", cue: "Rear foot on a bench or chair; front foot two foot-lengths out." },

  // ── No equipment — cardio (12) ────────────────────────────────────────────
  { name: "Jump rope", type: "cardio", equipment: "none", muscles: ["CALVES", "QUADS", "HAMSTRINGS", "GLUTES"], difficulty: 1, pattern: "cardio", cue: "Bounce off the balls of your feet with the knees soft." },
  { name: "HIIT circuit", type: "cardio", equipment: "none", muscles: ["QUADS", "HAMSTRINGS", "GLUTES", "CALVES"], difficulty: 2, pattern: "cardio", cue: "Scale the movements so quality holds across every round." },
  { name: "Burpees", type: "cardio", equipment: "none", muscles: ["CHEST", "SHOULDERS", "TRICEPS", "QUADS"], difficulty: 2, pattern: "cardio", cue: "Chest to floor, then jump the feet to the hands." },
  { name: "Mountain climbers", type: "cardio", equipment: "none", muscles: ["CORE", "SHOULDERS", "QUADS"], difficulty: 1, pattern: "cardio", cue: "Hold a solid plank — hips stay low and level." },
  { name: "High knees", type: "cardio", equipment: "none", muscles: ["QUADS", "CALVES", "CORE", "HAMSTRINGS"], difficulty: 1, pattern: "cardio", cue: "Drive knees to hip height with quick ground contact." },
  { name: "Swimming", type: "cardio", equipment: "none", muscles: ["BACK", "SHOULDERS", "CORE", "GLUTES"], difficulty: 2, pattern: "cardio", cue: "Rotate from the hips, not just the shoulders." },
  { name: "Boxing/kickboxing", type: "cardio", equipment: "none", muscles: ["SHOULDERS", "CORE", "CALVES", "QUADS"], difficulty: 2, pattern: "cardio", cue: "Hands up, chin down; snap every punch back to guard." },
  { name: "Walking", type: "cardio", equipment: "none", muscles: ["QUADS", "CALVES", "GLUTES", "HAMSTRINGS"], difficulty: 1, pattern: "cardio", cue: "Stand tall; swing the arms freely." },
  { name: "Hiking", type: "cardio", equipment: "none", muscles: ["QUADS", "GLUTES", "CALVES", "HAMSTRINGS"], difficulty: 2, pattern: "cardio", cue: "Short steps on steep grades; lean slightly into climbs." },
  { name: "Rucking", type: "cardio", equipment: "none", muscles: ["BACK", "QUADS", "GLUTES", "CALVES"], difficulty: 2, pattern: "cardio", cue: "Load high and tight between the shoulder blades." },
  { name: "Battle ropes", type: "cardio", equipment: "none", muscles: ["SHOULDERS", "CORE", "BACK", "BICEPS"], difficulty: 2, pattern: "cardio", cue: "Athletic stance; soft knees and braced ribs." },
  { name: "Jumping jacks", type: "cardio", equipment: "none", muscles: ["SHOULDERS", "CALVES", "QUADS", "CORE"], difficulty: 1, pattern: "cardio", cue: "Land toe-ball-heel with soft knees." },

  // ── No equipment — mobility (13) ────────────────────────────────────────────
  { name: "Yoga flow", type: "mobility", equipment: "none", muscles: ["CORE", "BACK", "HAMSTRINGS", "GLUTES"], difficulty: 1, pattern: "mobility", cue: "Move with the breath — one movement per inhale or exhale." },
  { name: "Full-body stretch", type: "mobility", equipment: "none", muscles: ["HAMSTRINGS", "BACK", "QUADS", "GLUTES"], difficulty: 1, pattern: "mobility", cue: "Ease into mild tension — never pain." },
  { name: "Hip mobility", type: "mobility", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "QUADS", "BACK"], difficulty: 1, pattern: "mobility", cue: "Move slowly through the inner ranges." },
  { name: "Cat-cow", type: "mobility", equipment: "none", muscles: ["CORE", "BACK", "SHOULDERS"], difficulty: 1, pattern: "mobility", cue: "Round up and arch down segment by segment." },
  { name: "Downward dog", type: "mobility", equipment: "none", muscles: ["HAMSTRINGS", "CALVES", "BACK", "SHOULDERS"], difficulty: 1, pattern: "mobility", cue: "Hips high; press the chest toward the thighs." },
  { name: "World's greatest stretch", type: "mobility", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "QUADS", "CORE"], difficulty: 1, pattern: "mobility", cue: "Deep lunge, then drop the same-side elbow inside the front foot." },
  { name: "90/90 hips", type: "mobility", equipment: "none", muscles: ["GLUTES", "HAMSTRINGS", "QUADS", "CORE"], difficulty: 1, pattern: "mobility", cue: "Both knees at 90° — front leg in, back leg out." },
  { name: "Couch stretch", type: "mobility", equipment: "none", muscles: ["QUADS", "GLUTES", "BACK", "HAMSTRINGS"], difficulty: 2, pattern: "mobility", cue: "Back foot up the wall or a bench; knee on a cushion." },
  { name: "Thoracic rotation", type: "mobility", equipment: "none", muscles: ["BACK", "CHEST", "SHOULDERS"], difficulty: 1, pattern: "mobility", cue: "Knees pinned; rotate the ribcage, not the hips." },
  { name: "Shoulder dislocates", type: "mobility", equipment: "none", muscles: ["SHOULDERS", "CHEST", "BACK"], difficulty: 1, pattern: "mobility", cue: "Wide grip on a band or stick." },
  { name: "Pigeon pose", type: "mobility", equipment: "none", muscles: ["GLUTES", "BACK", "HAMSTRINGS", "QUADS"], difficulty: 1, pattern: "mobility", cue: "Front shin angled under the chest; hips square." },
  { name: "Thread the needle", type: "mobility", equipment: "none", muscles: ["SHOULDERS", "CHEST", "BACK", "CORE"], difficulty: 1, pattern: "mobility", cue: "From all fours, slide one arm under the other." },
  { name: "Child's pose", type: "mobility", equipment: "none", muscles: ["BACK", "GLUTES", "SHOULDERS", "HAMSTRINGS"], difficulty: 1, pattern: "mobility", cue: "Hips back to the heels; arms long forward." },
]

// ── Lookups ────────────────────────────────────────────────────────────────────

/** All exercises usable with a given equipment class. */
export function byEquipment(eq: Equipment): Exercise[] {
  return EXERCISES.filter((e) => e.equipment === eq)
}

/** Name substring search, case-insensitive. Empty query → the full library. */
export function searchExercises(q: string): Exercise[] {
  const needle = q.trim().toLowerCase()
  if (!needle) return EXERCISES
  return EXERCISES.filter((e) => e.name.toLowerCase().includes(needle))
}

/** Short chip labels used by the equipment filter row (ALL is the no-filter chip). */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: "BW",
  barbell: "BARBELL",
  dumbbell: "DB",
  kettlebell: "KB",
  machine: "MACHINE",
  cable: "CABLE",
  band: "BAND",
}

export function equipmentLabel(eq: Equipment): string {
  return EQUIPMENT_LABELS[eq]
}

// ── Shared Program plan contract (mirrors Program.plan JSON) ──────────────────

export interface PlanBlock {
  name: string
  type: ExerciseType
  sets: number
  reps?: number
  weightKg?: number
  /** Cardio blocks prescribe minutes instead of reps. */
  durationMin?: number
  restSec: number
  rpe?: number
  cue?: string
  refs?: string[]
  /** Movement pattern of the chosen exercise (forge-marked blocks only). */
  pattern?: string
  /** "reps" (default/legacy) vs "sec" — timed holds carry seconds in `reps`. */
  unit?: "reps" | "sec"
  /** R17-B superset group (Strong/Hevy parity): adjacent blocks sharing a letter
   *  alternate back-to-back with no rest between members — the group's LAST
   *  member owns the recovery rest. Undefined = standalone block (legacy plans
   *  stay byte-identical). */
  superset?: string
}

export interface PlanDay {
  day: number
  focus: string
  blocks: PlanBlock[]
}

export interface ProgramPlan {
  days: PlanDay[]
}

/** A day's dominant block type — most blocks by type; ties break strength > bodyweight > cardio > mobility. */
export function dominantType(blocks: { type: ExerciseType }[]): ExerciseType {
  const counts: Record<ExerciseType, number> = { strength: 0, bodyweight: 0, cardio: 0, mobility: 0 }
  for (const b of blocks) counts[b.type]++
  const order: ExerciseType[] = ["strength", "bodyweight", "cardio", "mobility"]
  let best: ExerciseType = "mobility"
  let bestCount = -1
  for (const t of order) {
    if (counts[t] > bestCount) {
      best = t
      bestCount = counts[t]
    }
  }
  return best
}
