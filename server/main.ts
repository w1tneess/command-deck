import { buildApp } from "./app.ts";
import { openDb } from "./db.ts";
import { seed } from "./seed.ts";

const db = openDb(process.env.DB_PATH ?? "data/tracker.db");
seed(db);
const port = Number(process.env.PORT ?? 3000);
// Binds to localhost unless HOST is set; set APP_TOKEN before exposing it beyond this machine.
await buildApp(db, { token: process.env.APP_TOKEN }).listen({ port, host: process.env.HOST ?? "127.0.0.1" });
console.log(`Exam Tracker on http://localhost:${port}`);
