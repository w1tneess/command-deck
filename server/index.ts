import { createApp } from "./app.ts";
export type { Env } from "./auth.ts";

// Worker entry. Static files are served by the assets binding; only /api/* reaches this code.
export default createApp();

