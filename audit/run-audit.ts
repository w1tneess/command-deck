import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

interface AuditFinding {
  id: number;
  severity: "must_fix" | "should_fix" | "nice_to_have";
  category: "security" | "correctness" | "concurrency" | "performance" | "testability";
  file: string;
  lines?: string;
  title: string;
  problem: string;
  fix: string;
  ifSkipped: string;
}

const ROOT = resolve(import.meta.dirname, "..");
const findings: AuditFinding[] = [];
let findingCounter = 1;

function addFinding(finding: Omit<AuditFinding, "id">) {
  findings.push({ id: findingCounter++, ...finding });
}

console.log("🔍 Starting exam-tracker automated code audit...\n");

// 1. Audit Security & Secrets
console.log("Checking security & secrets...");
const gitignorePath = join(ROOT, ".gitignore");
if (existsSync(gitignorePath)) {
  const gitignore = readFileSync(gitignorePath, "utf-8");
  if (!gitignore.includes(".dev.vars")) {
    addFinding({
      severity: "must_fix",
      category: "security",
      file: ".gitignore",
      title: ".dev.vars is missing from .gitignore",
      problem: "Local development secrets could be accidentally committed to source control.",
      fix: "Add .dev.vars to .gitignore.",
      ifSkipped: "Risk of secret exposure on public Git repositories."
    });
  }
}

// Check for hardcoded secrets or sql injection in server code
const serverDir = join(ROOT, "server");
if (existsSync(serverDir)) {
  const serverFiles = readdirSync(serverDir).filter(f => f.endsWith(".ts"));
  for (const f of serverFiles) {
    const code = readFileSync(join(serverDir, f), "utf-8");
    // Check raw string concatenation inside SQL prepares (excluding static table identifier loops)
    const matches = [...code.matchAll(/prepare\s*\(\s*`([^`]*)`/g)];
    for (const m of matches) {
      const sql = m[1];
      if (sql.includes("${")) {
        // Whitelisted static schema export/import table references (${t}) are validated against TABLES constant
        const isTableWhitelist = (sql.includes("${t}") || sql.includes("${cols")) && f === "app.ts";
        if (!isTableWhitelist && !f.includes(".test.")) {
          addFinding({
            severity: "must_fix",
            category: "security",
            file: `server/${f}`,
            title: "Potential dynamic string interpolation in SQL query",
            problem: "Interpolating variables into SQL strings can lead to SQL injection vulnerabilities.",
            fix: "Use parameterized queries with db.prepare(...).bind(...).",
            ifSkipped: "Attackers could inject malicious SQL commands."
          });
          break;
        }
      }
    }
  }
}

// 2. Audit Concurrency & Race Conditions
console.log("Checking frontend concurrency & form element IDs...");
const srcDir = join(ROOT, "src");
if (existsSync(srcDir)) {
  const habitsCode = existsSync(join(srcDir, "Habits.tsx")) ? readFileSync(join(srcDir, "Habits.tsx"), "utf-8") : "";
  const projectsCode = existsSync(join(srcDir, "Projects.tsx")) ? readFileSync(join(srcDir, "Projects.tsx"), "utf-8") : "";
  const routineCode = existsSync(join(srcDir, "Routine.tsx")) ? readFileSync(join(srcDir, "Routine.tsx"), "utf-8") : "";
  const captureCode = existsSync(join(srcDir, "Capture.tsx")) ? readFileSync(join(srcDir, "Capture.tsx"), "utf-8") : "";

  // Check hardcoded IDs in Habits & Projects
  if (habitsCode.includes('id="habit-name"') || habitsCode.includes('id="habit-goal"')) {
    addFinding({
      severity: "should_fix",
      category: "correctness",
      file: "src/Habits.tsx",
      lines: "L96-102",
      title: "Hard-coded form IDs collide when multiple forms are displayed",
      problem: "Static IDs 'habit-name' and 'habit-goal' are rendered both in the creation form and row edit forms, causing duplicate DOM IDs and breaking accessibility label associations.",
      fix: "Generate scoped IDs using React's useId() hook (e.g. const uid = useId(); id={`${uid}-name`}).",
      ifSkipped: "Screen readers announce incorrect input fields and clicking labels activates the wrong input."
    });
  }

  // Check rapid tap race condition in Habits counter
  if (habitsCode.includes("log(h.today + 1)") || !habitsCode.includes("latestRef")) {
    addFinding({
      severity: "should_fix",
      category: "concurrency",
      file: "src/Habits.tsx",
      lines: "L53-55",
      title: "Counter tap rapid-fire drops increments",
      problem: "Counter increments send h.today + 1 which relies on server state reload. Rapid consecutive taps fire with the same base value instead of accumulating.",
      fix: "Use a local optimistic ref (useRef) to accumulate rapid taps before sending or queue updates.",
      ifSkipped: "Fast taps (e.g. drinking glasses of water) get lost and don't record correctly."
    });
  }

  // Check in-flight submission guard in Quick Capture
  if (captureCode.includes("const save = async () =>") && !captureCode.includes("busy.current")) {
    addFinding({
      severity: "should_fix",
      category: "concurrency",
      file: "src/Capture.tsx",
      lines: "L20-23",
      title: "Quick Capture lacks in-flight double submission guard",
      problem: "Pressing Enter rapidly or tapping Add repeatedly can trigger concurrent POST requests creating duplicate capture items.",
      fix: "Add an in-flight guard using a ref (e.g. if (busy.current) return; busy.current = true; ...).",
      ifSkipped: "Users end up with duplicate notes or tasks in their quick capture list."
    });
  }

  // Check stale text across midnight or cross-device in Evening Routine
  if (routineCode.includes("function Evening({ state, act }") && !routineCode.includes("hasUserEdited")) {
    addFinding({
      severity: "should_fix",
      category: "concurrency",
      file: "src/Routine.tsx",
      lines: "L53-65",
      title: "Evening routine text areas retain stale text across midnight",
      problem: "When crossing midnight IST or on multi-device updates, local textarea state does not re-sync with updated state.routine, potentially saving yesterday's text into today's record on blur.",
      fix: "Key Evening component by state.routine.day and only trigger save on blur if the user actively edited the field.",
      ifSkipped: "Yesterday's routine notes overwrite today's blank day after midnight."
    });
  }
}

// 3. Audit Test Suite & Vitest Configuration
console.log("Checking test configuration & execution health...");
const vitestConfigFiles = ["vitest.config.ts", "vite.config.ts"];
let hasCustomTimeout = false;
for (const conf of vitestConfigFiles) {
  const p = join(ROOT, conf);
  if (existsSync(p)) {
    const txt = readFileSync(p, "utf-8");
    if (txt.includes("hookTimeout") || txt.includes("fileParallelism")) {
      hasCustomTimeout = true;
    }
  }
}

if (!hasCustomTimeout) {
  addFinding({
    severity: "should_fix",
    category: "testability",
    file: "vite.config.ts",
    lines: "L5-9",
    title: "Vitest lacks hookTimeout and fileParallelism configuration for Miniflare",
    problem: "Vitest runs 8 test files in parallel by default. Each test file spawns getPlatformProxy (Miniflare in-memory D1). On Windows, simultaneous proxy startup causes beforeEach hooks to exceed the default 10000ms timeout.",
    fix: "Add test configuration to vite.config.ts: test: { hookTimeout: 30000, fileParallelism: false }.",
    ifSkipped: "'npm test' fails intermittently with 'Hook timed out in 10000ms' despite 100% test logic correctness."
  });
}

// 4. Audit Database & Migrations
console.log("Checking database schema & migrations...");
const migrationsDir = join(ROOT, "migrations");
if (existsSync(migrationsDir)) {
  const migrationFiles = readdirSync(migrationsDir).filter(f => f.endsWith(".sql"));
  const allSql = migrationFiles.map(f => readFileSync(join(migrationsDir, f), "utf-8")).join("\n");
  
  if (allSql.includes("CREATE TABLE milestones") && !allSql.includes("idx_milestones_project_id")) {
    addFinding({
      severity: "nice_to_have",
      category: "performance",
      file: "migrations/0008_life_os.sql",
      lines: "L25-28",
      title: "Missing index on milestones(project_id)",
      problem: "Filtering milestones by project_id in lifeState requires a table scan of milestones as the table grows.",
      fix: "Add CREATE INDEX IF NOT EXISTS idx_milestones_project_id ON milestones(project_id); in a migration.",
      ifSkipped: "Minor query latency degradation as milestone count grows."
    });
  }
}

// 5. Audit AI Context & Memory Log
console.log("Checking AI memory log & context directives...");
const decisionsPath = join(ROOT, "context", "DECISIONS.md");
if (!existsSync(decisionsPath)) {
  addFinding({
    severity: "must_fix",
    category: "correctness",
    file: "context/DECISIONS.md",
    title: "AI Decision & Memory Log is missing",
    problem: "context/DECISIONS.md does not exist. AI agents must record their decisions on every task.",
    fix: "Create context/DECISIONS.md with standard ADR decision template.",
    ifSkipped: "Cross-agent architectural rationale is lost."
  });
} else {
  const content = readFileSync(decisionsPath, "utf-8");
  if (content.length < 200 || !content.includes("### [") || !content.includes("- **AI Agent**:")) {
    addFinding({
      severity: "must_fix",
      category: "correctness",
      file: "context/DECISIONS.md",
      title: "AI Decision & Memory Log contains insufficient or missing task entries",
      problem: "context/DECISIONS.md exists but has no valid logged task decisions. Every AI agent MUST log their decisions on every task.",
      fix: "Append task entries following the ADR template with AI Agent, Rationale, and Invariants.",
      ifSkipped: "Context continuity across AI sessions is broken."
    });
  }

  const memoryPointer = join(ROOT, "MEMORY.md");
  if (!existsSync(memoryPointer)) {
    addFinding({
      severity: "must_fix",
      category: "correctness",
      file: "MEMORY.md",
      title: "Root MEMORY.md pointer is missing",
      problem: "Root MEMORY.md should exist as a top-level pointer to context/DECISIONS.md.",
      fix: "Create MEMORY.md pointing to context/DECISIONS.md.",
      ifSkipped: "Tools expecting a root MEMORY.md file will fail to discover the decision chronicle."
    });
  }
}

// 6. Run Type Check Verification
console.log("Running TypeScript compilation check...");
let typeCheckPassed = true;
try {
  execSync("npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p server/tsconfig.json", { cwd: ROOT, stdio: "ignore" });
} catch {
  typeCheckPassed = false;
  addFinding({
    severity: "must_fix",
    category: "correctness",
    file: "tsconfig.json",
    title: "TypeScript type check failure",
    problem: "One or more files have TypeScript compilation errors.",
    fix: "Run 'npm run build' and resolve type errors.",
    ifSkipped: "Build errors during deployment."
  });
}

// Output summary
const report = {
  timestamp: new Date().toISOString(),
  totalFindings: findings.length,
  mustFixCount: findings.filter(f => f.severity === "must_fix").length,
  shouldFixCount: findings.filter(f => f.severity === "should_fix").length,
  niceToHaveCount: findings.filter(f => f.severity === "nice_to_have").length,
  typeCheckPassed,
  findings
};

const outputJsonPath = join(ROOT, "audit", "audit-results.json");
writeFileSync(outputJsonPath, JSON.stringify(report, null, 2), "utf-8");

console.log("\n================ AUDIT SUMMARY ================");
console.log(`Total Findings: ${report.totalFindings}`);
console.log(`- Must Fix:     ${report.mustFixCount}`);
console.log(`- Should Fix:   ${report.shouldFixCount}`);
console.log(`- Nice to Have: ${report.niceToHaveCount}`);
console.log(`Type Check:     ${typeCheckPassed ? "PASSED" : "FAILED"}`);
console.log(`Results saved to: audit/audit-results.json`);
console.log("===============================================\n");
