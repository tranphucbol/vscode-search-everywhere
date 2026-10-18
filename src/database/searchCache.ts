import { QuickPickItem } from "../shared/types";

const SEARCH_CACHE_MAX_SIZE = 50;
const searchCache = new Map<string, QuickPickItem[]>();

export function getCachedSearch(key: string): QuickPickItem[] | undefined {
  return searchCache.get(key);
}

export function cacheSearch(key: string, items: QuickPickItem[]): void {
  if (searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }
  searchCache.set(key, items);
}

export function clearSearchCache(): void {
  searchCache.clear();
}
