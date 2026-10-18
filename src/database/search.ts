import { QuickPickItem } from "../shared/types";
import { extractName } from "./queryText";
import { RecentKey, recentKeyString, SearchOptions, searchItems } from "./tiers";

export { RecentKey, SearchOptions } from "./tiers";

const SEARCH_LIMIT = 500;
// Room for overloads and a symbol plus its file per recent key, while keeping the result small.
const RECENT_ROWS_PER_KEY = 4;

// Without recent keys the cached array itself is returned; callers must not reorder it in place.
export function search(
  query: string,
  limit: number = SEARCH_LIMIT,
  options?: SearchOptions
): QuickPickItem[] {
  const main = searchItems(query, limit, options);
  const recent = options?.recent;
  if (!recent || !recent.length) {
    return main;
  }
  // A recent row the main search cut off is only found by searching the recent items alone.
  const recentRows = searchItems(query, recent.length * RECENT_ROWS_PER_KEY, options, recent);
  return boostRecent(main, recentRows, recent, limit);
}

export function itemIdentity(item: QuickPickItem): string {
  return `${item.uri.toString()}#${item.symbolKind}#${item.label}#${item.range?.start.line ?? 0}#${item.range?.start.character ?? 0}`;
}

interface RecentEntry {
  item: QuickPickItem;
  rank: number;
}

// Recency only reorders within a match band (docs/decisions/002). Relies on main being in
// non-decreasing band order when it is not sorted by kind.
function boostRecent(
  main: QuickPickItem[],
  recentRows: QuickPickItem[],
  recent: RecentKey[],
  limit: number
): QuickPickItem[] {
  const ranks = new Map<string, number>();
  recent.forEach((key, index) => {
    const id = recentKeyString(key.uri, key.symbolKind, key.name);
    if (!ranks.has(id)) {
      ranks.set(id, index);
    }
  });
  const rankOf = (item: QuickPickItem) =>
    ranks.get(recentKeyString(item.uri.toString(), item.symbolKind, extractName(item.label)));
  const bandIndex = (item: QuickPickItem) => (item.matchBand ?? 3) - 1;

  const recentByBand: RecentEntry[][] = [[], [], [], []];
  const restByBand: QuickPickItem[][] = [[], [], [], []];
  const seen = new Set<string>();
  let recentCount = 0;

  for (const item of main) {
    seen.add(itemIdentity(item));
    const rank = rankOf(item);
    if (rank === undefined) {
      restByBand[bandIndex(item)].push(item);
    } else {
      recentByBand[bandIndex(item)].push({ item, rank });
      recentCount++;
    }
  }
  for (const item of recentRows) {
    // A fuzzy hit is too loose to promote into a list the main search filled.
    if (item.matchBand === 4) {
      continue;
    }
    const id = itemIdentity(item);
    const rank = rankOf(item);
    if (seen.has(id) || rank === undefined) {
      continue;
    }
    seen.add(id);
    recentByBand[bandIndex(item)].push({ item, rank });
    recentCount++;
  }
  if (!recentCount) {
    return main;
  }

  const result: QuickPickItem[] = [];
  for (let band = 0; band < 4; band++) {
    recentByBand[band].sort((a, b) => a.rank - b.rank);
    for (const entry of recentByBand[band]) {
      result.push(entry.item);
    }
    result.push(...restByBand[band]);
  }
  return result.slice(0, limit);
}
