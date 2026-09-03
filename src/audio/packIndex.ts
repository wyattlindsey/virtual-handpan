/** The list of sample packs shipped under public/packs, from packs/index.json. */

export interface PackEntry {
  id: string;
  name: string;
  /** Manifest path relative to the site root, e.g. "packs/my-pan/pack.json". */
  manifest: string;
}

export async function fetchPackIndex(baseUrl: string): Promise<PackEntry[]> {
  try {
    const res = await fetch(`${baseUrl}packs/index.json`, { cache: 'no-cache' });
    if (!res.ok) return [];
    const json = (await res.json()) as { packs?: unknown };
    if (!Array.isArray(json.packs)) return [];
    return json.packs.filter(
      (p): p is PackEntry =>
        typeof p === 'object' && p !== null &&
        typeof (p as PackEntry).id === 'string' && typeof (p as PackEntry).name === 'string' && typeof (p as PackEntry).manifest === 'string',
    );
  } catch {
    return [];
  }
}

export function manifestUrl(baseUrl: string, entry: PackEntry): string {
  return new URL(`${baseUrl}${entry.manifest}`, window.location.href).href;
}
