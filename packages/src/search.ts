export type SearchSource = "official" | "aur";

export type SearchHit = {
  name: string;
  version: string;
  description: string;
  repo: string;
  source: SearchSource;
  url?: string;
  popularity?: number;
  votes?: number;
  installed: boolean;
};

type ArchApiPkg = {
  pkgname: string;
  pkgver: string;
  pkgdesc: string;
  repo: string;
  url?: string;
};

type AurApiPkg = {
  Name: string;
  Version: string;
  Description: string | null;
  URL?: string | null;
  Popularity?: number;
  NumVotes?: number;
};

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

export async function searchPackages(
  query: string,
  installed: Set<string>,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const encoded = encodeURIComponent(q);
  const [archSettled, aurSettled] = await Promise.allSettled([
    fetchJson<{ results: ArchApiPkg[] }>(
      `https://archlinux.org/packages/search/json/?limit=40&q=${encoded}`,
      signal,
    ),
    fetchJson<{ results: AurApiPkg[] }>(
      `https://aur.archlinux.org/rpc/v5/search/${encoded}?by=name-desc`,
      signal,
    ),
  ]);

  const hits: SearchHit[] = [];

  if (archSettled.status === "fulfilled") {
    for (const pkg of archSettled.value.results ?? []) {
      hits.push({
        name: pkg.pkgname,
        version: pkg.pkgver,
        description: pkg.pkgdesc || "",
        repo: pkg.repo,
        source: "official",
        url: pkg.url,
        installed: installed.has(pkg.pkgname),
      });
    }
  }

  if (aurSettled.status === "fulfilled") {
    const aur = [...(aurSettled.value.results ?? [])].sort(
      (a, b) => (b.Popularity ?? 0) - (a.Popularity ?? 0),
    );
    for (const pkg of aur.slice(0, 40)) {
      hits.push({
        name: pkg.Name,
        version: pkg.Version,
        description: pkg.Description || "",
        repo: "AUR",
        source: "aur",
        url: pkg.URL ?? undefined,
        popularity: pkg.Popularity,
        votes: pkg.NumVotes,
        installed: installed.has(pkg.Name),
      });
    }
  }

  if (
    archSettled.status === "rejected" &&
    aurSettled.status === "rejected"
  ) {
    throw new Error("Arch and AUR search both failed");
  }

  const seen = new Set<string>();
  const deduped: SearchHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.name)) continue;
    seen.add(hit.name);
    deduped.push(hit);
  }
  return deduped;
}
