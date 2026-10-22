import type { DatabaseSync } from "node:sqlite";

// Priority follows the student's own order: Maths > Science > Bengali > History > Civics.
const SUBJECTS: [id: string, name: string, grp: string, priority: number][] = [
  ["maths", "Maths", "Maths", 1],
  ["physics", "Physics", "Science", 2],
  ["chemistry", "Chemistry", "Science", 2],
  ["biology", "Biology", "Science", 2],
  ["bengali", "Bengali", "Languages", 3],
  ["history", "History", "SST", 4],
  ["civics", "Civics", "SST", 5],
  ["geography", "Geography", "SST", 6],
  ["economics", "Economics", "SST", 6],
  ["english", "English", "Languages", 6],
  ["hindi", "Hindi", "Languages", 6],
  ["it", "IT", "Other", 6],
];

// Rationalised NCERT Class 10 Maths. Marked unconfirmed until checked against the school PDF.
const MATHS = [
  "Real Numbers", "Polynomials", "Pair of Linear Equations in Two Variables", "Quadratic Equations",
  "Arithmetic Progressions", "Triangles", "Coordinate Geometry", "Introduction to Trigonometry",
  "Some Applications of Trigonometry", "Circles", "Areas Related to Circles",
  "Surface Areas and Volumes", "Statistics", "Probability",
];

/** Idempotent: only fills an empty database, so re-running never touches user progress. */
export function seed(db: DatabaseSync): void {
  if (db.prepare("SELECT 1 FROM subjects LIMIT 1").get()) return;
  const addSubject = db.prepare("INSERT INTO subjects (id, name, grp, priority) VALUES (?,?,?,?)");
  const addChapter = db.prepare(
    "INSERT INTO chapters (id, subject_id, name, pos, introduced_in, source) VALUES (?,?,?,?,?,?)",
  );
  const addProgress = db.prepare("INSERT INTO progress (chapter_id) VALUES (?)");
  for (const s of SUBJECTS) addSubject.run(...s);
  MATHS.forEach((name, i) => {
    const id = `maths-${i + 1}`;
    addChapter.run(id, "maths", name, i + 1, i >= 12 ? "pb1" : "earlier", "Maths syllabus PDF (unverified)");
    addProgress.run(id);
  });
}
