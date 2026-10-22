import { createApp } from "./app.ts";

// Worker entry. Static files are served by the assets binding; only /api/* reaches this code.
export default createApp();
