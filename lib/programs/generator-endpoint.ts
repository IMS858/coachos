/** Require an explicit secure destination for private assessment data. */
export function generatorEndpoint(base: string | undefined, path: "generate" | "render", production: boolean): string | null {
  if (!base) return null;
  try {
    const url = new URL(base);
    const local = !production && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) return null;
    return new URL(`/api/${path}`, url).toString();
  } catch { return null; }
}
