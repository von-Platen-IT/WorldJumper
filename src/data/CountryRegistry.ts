import type { CountryIndexEntry, CountryIndexFile } from './types';

const normalize = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export interface SearchHit {
  entry: CountryIndexEntry;
  score: number;
}

/**
 * Local, offline country lookup. Supports German name, English name and both
 * ISO codes, tolerant towards case, accents and extra whitespace.
 */
export class CountryRegistry {
  readonly entries: CountryIndexEntry[];
  private readonly byKey = new Map<string, CountryIndexEntry>();
  private readonly haystack = new Map<string, string>();

  constructor(file: CountryIndexFile) {
    this.entries = file.countries;
    for (const entry of this.entries) {
      const keys = [entry.id, entry.iso2, entry.iso3].filter(Boolean) as string[];
      for (const key of keys) this.byKey.set(key.toUpperCase(), entry);
      this.haystack.set(
        entry.id,
        `${normalize(entry.nameDe)} | ${normalize(entry.name)} | ${(entry.iso2 ?? '').toLowerCase()} | ${(
          entry.iso3 ?? ''
        ).toLowerCase()}`,
      );
    }
  }

  get(idOrIso: string | null | undefined): CountryIndexEntry | undefined {
    if (!idOrIso) return undefined;
    return this.byKey.get(idOrIso.toUpperCase());
  }

  /** Ranked fuzzy search, best match first. */
  search(query: string, limit = 8): CountryIndexEntry[] {
    const q = normalize(query);
    if (!q) return [];
    const qCompact = q.replace(/\s+/g, '');
    const hits: SearchHit[] = [];

    for (const entry of this.entries) {
      const hay = this.haystack.get(entry.id) ?? '';
      const nameDe = normalize(entry.nameDe);
      const nameEn = normalize(entry.name);
      const iso2 = (entry.iso2 ?? '').toLowerCase();
      const iso3 = (entry.iso3 ?? '').toLowerCase();

      let score = 0;
      if (iso2 && qCompact === iso2) score = 1000;
      else if (iso3 && qCompact === iso3) score = 990;
      else if (nameDe === q) score = 980;
      else if (nameEn === q) score = 970;
      else if (nameDe.startsWith(q)) score = 900 - nameDe.length;
      else if (nameEn.startsWith(q)) score = 880 - nameEn.length;
      else if (nameDe.includes(q)) score = 700 - nameDe.indexOf(q);
      else if (nameEn.includes(q)) score = 680 - nameEn.indexOf(q);
      else if (hay.includes(qCompact)) score = 400;
      if (score > 0) hits.push({ entry, score });
    }

    hits.sort((a, b) => b.score - a.score || a.entry.nameDe.localeCompare(b.entry.nameDe, 'de'));
    return hits.slice(0, limit).map((hit) => hit.entry);
  }

  /** Resolves a single typed value, used by the list mode. */
  resolve(value: string): CountryIndexEntry | undefined {
    const direct = this.get(value.trim());
    if (direct) return direct;
    const [best] = this.search(value.trim(), 1);
    if (!best) return undefined;
    // Only accept a clear match, never a random fuzzy guess.
    const q = normalize(value);
    const nameDe = normalize(best.nameDe);
    const nameEn = normalize(best.name);
    if (nameDe === q || nameEn === q || nameDe.startsWith(q) || nameEn.startsWith(q)) return best;
    if (q.length >= 3 && (nameDe.includes(q) || nameEn.includes(q))) return best;
    return undefined;
  }
}