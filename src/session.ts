import { call } from "./api.ts";

/** Ends the session on the server, then wipes the offline copy so a shared device keeps no study data. */
export async function signOut(url: "/api/logout" | "/api/logout-all") {
  await call("POST", url).catch(() => undefined);
  if ("caches" in window) await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
  location.reload();
}
