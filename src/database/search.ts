import * as vscode from "vscode";
import { MatchBand, QuickPickItem } from "../shared/types";
import {
  CamelHumpsQuery,
  escapeLike,
  extractCleanName,
  extractName,
  likeEscape,
  parseCamelHumpsQuery,
  parsePatternQuery,
  parseQualifiedQuery,
  PatternQuery,
  QualifiedQuery,
  splitPathQuery,
} from "./queryText";
import { Secondary } from "./secondary";
import { state } from "./state";

const SEARCH_LIMIT = 500;

export interface SearchOptions {
  symbolKinds?: number[];
  allowedKinds?: number[];
  ignoredKinds?: number[];
  ignoredNames?: string[];
  sortByKind?: boolean;
  fileUri?: string;
  recent?: RecentKey[];
}

// Identifies a recently used item across edits: the line is left out on purpose, so a symbol
// that moves keeps its history.
export interface RecentKey {
  uri: string;
  symbolKind: number;
  name: string;
}

const QUERY_COLUMNS =
  "uri, symbol_kind, label, description, detail, range_start_line, range_start_char, range_end_line, range_end_char, is_secondary, name_start_line, name_start_char";
const SECONDARY_COLUMN = 9;
const NAME_LINE_COLUMN = 10;
const NAME_CHAR_COLUMN = 11;
// The tier or relevance a query selects after QUERY_COLUMNS.
const TIER_COLUMN = 12;
const SECONDARY_LAST = "is_secondary != 0 ASC,";

// Tier 1: exact member under its immediate parent, 2: prefix member under its
// immediate parent, 3: member match anywhere below a container chain containing the query.
function queryQualifiedRows(
  qualified: QualifiedQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!state.db || limit <= 0) {
    return [];
  }
  const { container, member } = qualified;
  const matchClause = `symbol_kind != 0 AND clean_container != '' AND clean_name LIKE ? ${esc} AND clean_container LIKE ? ${esc}`;
  const where = baseWhere ? `${baseWhere} AND ${matchClause}` : `WHERE ${matchClause}`;
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE
        WHEN (clean_container = ? OR clean_container LIKE ? ${esc}) AND clean_name = ? THEN 1
        WHEN clean_container = ? OR clean_container LIKE ? ${esc} THEN 2
        ELSE 3
      END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const immediateParent = `%.${escapeLike(container)}`;
  const results = state.db.exec(sql, [
    container,
    immediateParent,
    member,
    container,
    immediateParent,
    ...params,
    `${escapeLike(member)}%`,
    `%${escapeLike(container)}%`,
  ]);
  return results && results.length ? results[0].values : [];
}

// Every word must occur in clean_stem or clean_name. Tier 1: the joined words are the whole
// name, 2: the words appear in order from the start, 3: in order anywhere, 4: any order.
function queryPatternRows(
  pattern: PatternQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!state.db || limit <= 0 || !pattern.words.length) {
    return [];
  }
  const { words, joined } = pattern;
  const wordClause = words
    .map(() => `(clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc})`)
    .join(" AND ");
  const where = baseWhere ? `${baseWhere} AND ${wordClause}` : `WHERE ${wordClause}`;
  const ordered = words.join("%");
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE
        WHEN clean_stem = ? OR clean_name = ? THEN 1
        WHEN clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} THEN 2
        WHEN clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} THEN 3
        ELSE 4
      END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const wordParams = words.flatMap((word) => [`%${word}%`, `%${word}%`]);
  const results = state.db.exec(sql, [
    joined,
    joined,
    `${ordered}%`,
    `${ordered}%`,
    `%${ordered}%`,
    `%${ordered}%`,
    ...params,
    ...wordParams,
  ]);
  return results && results.length ? results[0].values : [];
}

// Initials: tier 1 when they are exactly the query, 2 when they start with it. Words: tier 1
// when the first piece matches the first word, 2 when it matches a later one. notPrefixed
// drops the rows stage 1 already returned.
function queryCamelHumpsRows(
  camel: CamelHumpsQuery,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  notPrefixed: string,
  notPrefixedParams: any[]
): any[][] {
  if (!state.db || limit <= 0) {
    return [];
  }
  let tierClause: string;
  let tierParams: string[];
  let matchClause: string;
  let matchParams: string[];
  if (camel.kind === "initials") {
    tierClause = "clean_initials = ?";
    tierParams = [camel.initials];
    matchClause = "clean_initials LIKE ?";
    matchParams = [`${camel.initials}%`];
  } else {
    const likeAny = `(${camel.patterns.map(() => "clean_words LIKE ?").join(" OR ")})`;
    tierClause = likeAny;
    tierParams = camel.patterns;
    matchClause = likeAny;
    matchParams = camel.patterns.map((pattern) => `%${pattern}`);
  }
  const where = baseWhere
    ? `${baseWhere} AND ${matchClause} AND ${notPrefixed}`
    : `WHERE ${matchClause} AND ${notPrefixed}`;
  const sql = `
    SELECT ${QUERY_COLUMNS},
      CASE WHEN ${tierClause} THEN 1 ELSE 2 END AS tier
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      tier ASC,
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const results = state.db.exec(sql, [...tierParams, ...params, ...matchParams, ...notPrefixedParams]);
  return results && results.length ? results[0].values : [];
}

// Subsequence matches that are not already substring matches of the query. rawQuery also
// excludes substring matches on the raw name; pattern queries have no single raw form.
function queryFuzzyRows(
  cleanQuery: string,
  rawQuery: string | undefined,
  baseWhere: string,
  params: any[],
  kindSort: string,
  limit: number,
  esc: string
): any[][] {
  if (!state.db || limit <= 0) {
    return [];
  }
  const fuzzyPattern = "%" + cleanQuery.split("").map(escapeLike).join("%") + "%";
  const cleanSubstring = `%${escapeLike(cleanQuery)}%`;
  const exclusions = [`clean_stem NOT LIKE ? ${esc}`, `clean_name NOT LIKE ? ${esc}`];
  const exclusionParams = [cleanSubstring, cleanSubstring];
  if (rawQuery !== undefined) {
    exclusions.push(`name NOT LIKE ? ${esc}`);
    exclusionParams.push(`%${escapeLike(rawQuery)}%`);
  }
  const fuzzyClause = `(clean_stem LIKE ? ${esc} OR name LIKE ? ${esc}) AND ${exclusions.join(" AND ")}`;
  const where = baseWhere ? `${baseWhere} AND ${fuzzyClause}` : `WHERE ${fuzzyClause}`;
  const sql = `
    SELECT ${QUERY_COLUMNS}
    FROM ${symbolsSource}
    ${where}
    ORDER BY
      ${kindSort}
      ${SECONDARY_LAST}
      CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
      LENGTH(name) ASC,
      name COLLATE NOCASE ASC
    LIMIT ${limit}
  `;
  const results = state.db.exec(sql, [...params, fuzzyPattern, fuzzyPattern, ...exclusionParams]);
  return results && results.length ? results[0].values : [];
}

const SEARCH_CACHE_MAX_SIZE = 50;
const SUBSTRING_MIN_THRESHOLD = 50;
const FUZZY_MIN_THRESHOLD = 10;
// Room for overloads and a symbol plus its file per recent key, while keeping the result small.
const RECENT_ROWS_PER_KEY = 4;
// Without INDEXED BY, SQLite drives the recent-key search through idx_symbols_kind and reads every
// row of those kinds, which is slower than the unrestricted search (scripts/benchmark.js).
const SYMBOLS_BY_URI = "symbols INDEXED BY idx_symbols_uri";
// The FROM source of every search query; search() swaps it only while the synchronous recent-key
// search runs.
let symbolsSource = "symbols";
const searchCache = new Map<string, QuickPickItem[]>();

const bandByTier =
  (...bands: MatchBand[]) =>
  (row: any[]): MatchBand =>
    bands[(row[TIER_COLUMN] as number) - 1] ?? bands[bands.length - 1];

export function clearSearchCache(): void {
  searchCache.clear();
}

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
  symbolsSource = SYMBOLS_BY_URI;
  try {
    const recentRows = searchItems(query, recent.length * RECENT_ROWS_PER_KEY, options, recent);
    return boostRecent(main, recentRows, recent, limit);
  } finally {
    symbolsSource = "symbols";
  }
}

function recentKeyString(uri: string, symbolKind: number, name: string): string {
  return `${uri}\u0000${symbolKind}\u0000${name}`;
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

// Each stage's SQL already sorts secondary rows last, but a band can span stages (a prefix row
// from stage 1 and a CamelHumps row share band 2), so the bands are regrouped here.
function secondaryLastWithinBand(items: QuickPickItem[]): QuickPickItem[] {
  if (!items.some((item) => item.isSecondary)) {
    return items;
  }
  const result: QuickPickItem[] = [];
  let secondary: QuickPickItem[] = [];
  let band: MatchBand | undefined;
  for (const item of items) {
    if (item.matchBand !== band) {
      result.push(...secondary);
      secondary = [];
      band = item.matchBand;
    }
    (item.isSecondary ? secondary : result).push(item);
  }
  result.push(...secondary);
  return result;
}

function searchItems(
  query: string,
  limit: number,
  options?: SearchOptions,
  onlyKeys?: RecentKey[]
): QuickPickItem[] {
  if (!state.db) {
    return [];
  }

  // Fast-path: Check LRU search cache
  let cacheKey = `${query}|${limit}|${options?.symbolKinds ? [...options.symbolKinds].sort((a, b) => a - b).join(",") : ""}|${options?.sortByKind ? "1" : "0"}|${options?.fileUri ?? ""}|${options?.allowedKinds?.join(",") ?? ""}|${options?.ignoredKinds?.join(",") ?? ""}|${options?.ignoredNames?.join(",") ?? ""}`;
  if (onlyKeys) {
    cacheKey += `|recent:${onlyKeys.map((key) => recentKeyString(key.uri, key.symbolKind, key.name)).join("\u0001")}`;
  }
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  const conditions: string[] = [];
  const params: any[] = [];

  if (onlyKeys && onlyKeys.length) {
    // The plain uri list lets SQLite read only these files' rows through idx_symbols_uri.
    const uris = [...new Set(onlyKeys.map((key) => key.uri))];
    conditions.push(`uri IN (${uris.map(() => "?").join(", ")})`);
    params.push(...uris);
    conditions.push(
      `(uri, symbol_kind, name) IN (VALUES ${onlyKeys.map(() => "(?, ?, ?)").join(", ")})`
    );
    for (const key of onlyKeys) {
      params.push(key.uri, key.symbolKind, key.name);
    }
  }

  if (options) {
    if (options.fileUri) {
      let fileUriStr = options.fileUri;
      if (!fileUriStr.includes("://")) {
        try {
          fileUriStr = vscode.Uri.file(fileUriStr).toString();
        } catch {}
      }
      conditions.push("uri COLLATE NOCASE = ?");
      params.push(fileUriStr);
      conditions.push("symbol_kind != 0");
    }

    if (options.symbolKinds && options.symbolKinds.length > 0) {
      const placeholders = options.symbolKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind IN (${placeholders})`);
      params.push(...options.symbolKinds);
    } else if (options.allowedKinds && options.allowedKinds.length > 0) {
      const placeholders = options.allowedKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind IN (${placeholders})`);
      params.push(...options.allowedKinds);
    }

    if (options.ignoredKinds && options.ignoredKinds.length > 0) {
      const placeholders = options.ignoredKinds.map(() => "?").join(", ");
      conditions.push(`symbol_kind NOT IN (${placeholders})`);
      params.push(...options.ignoredKinds);
    }

    if (options.ignoredNames && options.ignoredNames.length > 0) {
      for (const ign of options.ignoredNames) {
        if (ign) {
          conditions.push(`name NOT LIKE ? ${likeEscape(ign)}`);
          params.push(`%${escapeLike(ign)}%`);
        }
      }
    }
  }

  const baseWhere = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const esc = likeEscape(query);

  let matchedItems: QuickPickItem[] = [];
  const seenKeys = new Set<string>();

  const addItemsFromRows = (rows: any[][], band: MatchBand | ((row: any[]) => MatchBand)) => {
    for (const row of rows) {
      const key = `${row[0]}#${row[1]}#${row[2]}#${row[5]}#${row[6]}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        const item = rowToQuickPickItem(row);
        item.matchBand = typeof band === "function" ? band(row) : band;
        matchedItems.push(item);
      }
    }
  };

  const pattern = parsePatternQuery(query);

  if (!query || (pattern && !pattern.words.length)) {
    const sortOrder = options?.fileUri
      ? "range_start_line ASC, range_start_char ASC"
      : options?.sortByKind
      ? "symbol_kind ASC, name COLLATE NOCASE ASC"
      : "name COLLATE NOCASE ASC";
    const results = state.db.exec(
      `SELECT ${QUERY_COLUMNS} FROM ${symbolsSource} ${baseWhere} ORDER BY ${sortOrder} LIMIT ${limit}`,
      params
    );
    if (results && results.length) {
      addItemsFromRows(results[0].values, 3);
    }
  } else if (pattern) {
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";
    const patternRows = queryPatternRows(pattern, baseWhere, params, kindSort, limit, esc);
    addItemsFromRows(patternRows, bandByTier(1, 2, 3, 3));

    if (
      !patternRows.some((row) => row[TIER_COLUMN] === 1) &&
      matchedItems.length < FUZZY_MIN_THRESHOLD &&
      matchedItems.length < limit &&
      pattern.joined.length >= 2
    ) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      const cap = matchedItems.length + remaining;
      // Over-fetch: unlike the plain search, ordered matches are not excluded in SQL and
      // only drop out in addItemsFromRows.
      addItemsFromRows(
        queryFuzzyRows(pattern.joined, undefined, baseWhere, params, kindSort, cap, esc),
        4
      );
      matchedItems = matchedItems.slice(0, cap);
    }
  } else if (query.includes("/")) {
    const { dir, leaf } = splitPathQuery(query);
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";

    if (leaf) {
      const dirClause = `uri LIKE ? ${esc}`;
      const dirWhere = baseWhere ? `${baseWhere} AND ${dirClause}` : `WHERE ${dirClause}`;
      const dirParams = [...params, `%${escapeLike(dir)}/%`];
      const cleanLeaf = extractCleanName(leaf);

      if (cleanLeaf) {
        const leafPrefix = `${escapeLike(cleanLeaf)}%`;
        const leafResults = state.db.exec(
          `SELECT ${QUERY_COLUMNS},
            CASE WHEN clean_stem = ? OR clean_name = ? THEN 1 ELSE 2 END AS tier
          FROM ${symbolsSource} ${dirWhere} AND (clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc})
          ORDER BY
            ${kindSort}
            tier ASC,
            ${SECONDARY_LAST}
            CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
            LENGTH(name) ASC,
            name COLLATE NOCASE ASC
          LIMIT ${limit}`,
          [cleanLeaf, cleanLeaf, ...dirParams, leafPrefix, leafPrefix]
        );
        if (leafResults && leafResults.length) {
          addItemsFromRows(leafResults[0].values, bandByTier(1, 2));
        }
      }

      const qualifiedLeaf = parseQualifiedQuery(leaf);
      if (qualifiedLeaf) {
        addItemsFromRows(
          queryQualifiedRows(qualifiedLeaf, dirWhere, dirParams, kindSort, limit - matchedItems.length, esc),
          2
        );
      }
    }

    if (matchedItems.length < limit) {
      const matchClause = `uri LIKE ? ${esc}`;
      const fullWhere = baseWhere ? `${baseWhere} AND ${matchClause}` : `WHERE ${matchClause}`;
      const results = state.db.exec(
        `SELECT ${QUERY_COLUMNS} FROM ${symbolsSource} ${fullWhere} ORDER BY ${SECONDARY_LAST} CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC, LENGTH(name) ASC, name COLLATE NOCASE ASC LIMIT ${limit}`,
        [...params, `%${escapeLike(query)}%`]
      );
      if (results && results.length) {
        addItemsFromRows(results[0].values, 3);
      }
      matchedItems = matchedItems.slice(0, limit);
    }
  } else {
    const cleanQuery = extractCleanName(query);
    const cleanLike = escapeLike(cleanQuery);
    const rawLike = escapeLike(query);
    const kindSort = options?.sortByKind ? "symbol_kind ASC, " : "";
    const nameLikeAny = `(clean_stem LIKE ? ${esc} OR clean_name LIKE ? ${esc} OR name LIKE ? ${esc})`;
    const notPrefixed = `clean_stem NOT LIKE ? ${esc} AND clean_name NOT LIKE ? ${esc} AND name NOT LIKE ? ${esc}`;

    // Stage 1: Exact and Prefix matches on clean_stem, clean_name, or name
    // Ranked by relevance:
    // 1: Exact match on stem / clean_name / raw name
    // 2: Prefix match on stem / clean_name / raw name
    const stage1Where = baseWhere
      ? `${baseWhere} AND ${nameLikeAny}`
      : `WHERE ${nameLikeAny}`;

    const stage1Sql = `
      SELECT ${QUERY_COLUMNS},
        CASE
          WHEN clean_stem = ? OR clean_name = ? OR name = ? COLLATE NOCASE THEN 1
          WHEN ${nameLikeAny} THEN 2
          ELSE 3
        END AS relevance
      FROM ${symbolsSource}
      ${stage1Where}
      ORDER BY
        ${kindSort}
        relevance ASC,
        ${SECONDARY_LAST}
        CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
        LENGTH(name) ASC,
        name COLLATE NOCASE ASC
      LIMIT ${limit}
    `;

    const stage1Params = [
      cleanQuery,
      cleanQuery,
      query,
      `${cleanLike}%`,
      `${cleanLike}%`,
      `${rawLike}%`,
      ...params,
      `${cleanLike}%`,
      `${cleanLike}%`,
      `${rawLike}%`,
    ];

    const stage1Results = state.db.exec(stage1Sql, stage1Params);
    const stage1Rows: any[][] = stage1Results && stage1Results.length ? stage1Results[0].values : [];
    let hasExactMatch = stage1Rows.some((row) => row[TIER_COLUMN] === 1);

    const qualified = parseQualifiedQuery(query);
    if (qualified) {
      // An exact name match (e.g. the file "user.service.ts") still outranks qualified members.
      addItemsFromRows(stage1Rows.filter((row) => row[TIER_COLUMN] === 1), 1);
      const qualifiedRows = queryQualifiedRows(
        qualified,
        baseWhere,
        params,
        kindSort,
        limit - matchedItems.length,
        esc
      );
      addItemsFromRows(qualifiedRows, bandByTier(1, 2, 2));
      hasExactMatch = hasExactMatch || qualifiedRows.some((row) => row[TIER_COLUMN] === 1);
      addItemsFromRows(stage1Rows.filter((row) => row[TIER_COLUMN] !== 1), 2);
      matchedItems = matchedItems.slice(0, limit);
    }
    const notPrefixedParams = [`${cleanLike}%`, `${cleanLike}%`, `${rawLike}%`];
    let camelRowCount = 0;
    if (!qualified) {
      addItemsFromRows(stage1Rows, bandByTier(1, 2));
      const camel = parseCamelHumpsQuery(query);
      if (camel) {
        const camelRows = queryCamelHumpsRows(
          camel,
          baseWhere,
          params,
          kindSort,
          limit - matchedItems.length,
          notPrefixed,
          notPrefixedParams
        );
        camelRowCount = camelRows.length;
        addItemsFromRows(camelRows, bandByTier(2, 3));
      }
    }

    // Stage 2: Substring matches if we have space left
    if (matchedItems.length < SUBSTRING_MIN_THRESHOLD && matchedItems.length < limit) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      const cap = matchedItems.length + remaining;

      const stage2Where = baseWhere
        ? `${baseWhere} AND ${nameLikeAny} AND ${notPrefixed}`
        : `WHERE ${nameLikeAny} AND ${notPrefixed}`;

      const stage2Sql = `
        SELECT ${QUERY_COLUMNS}
        FROM ${symbolsSource}
        ${stage2Where}
        ORDER BY
          ${kindSort}
          ${SECONDARY_LAST}
          CASE WHEN symbol_kind = 0 THEN 0 ELSE 1 END ASC,
          LENGTH(name) ASC,
          name COLLATE NOCASE ASC
        LIMIT ${remaining + camelRowCount}
      `;

      const stage2Params = [
        ...params,
        `%${cleanLike}%`,
        `%${cleanLike}%`,
        `%${rawLike}%`,
        ...notPrefixedParams,
      ];

      // Over-fetch by the CamelHumps rows: a row matched there can also be a substring match,
      // and it only drops out in addItemsFromRows.
      const stage2Results = state.db.exec(stage2Sql, stage2Params);
      if (stage2Results && stage2Results.length) {
        addItemsFromRows(stage2Results[0].values, 3);
      }
      matchedItems = matchedItems.slice(0, cap);
    }

    // Stage 3: Subsequence / fuzzy matches if:
    // - No exact matches were found in Stage 1 (!hasExactMatch)
    // - Direct matches are few (< FUZZY_MIN_THRESHOLD)
    // - Query length >= 2
    if (
      !hasExactMatch &&
      matchedItems.length < FUZZY_MIN_THRESHOLD &&
      matchedItems.length < limit &&
      cleanQuery.length >= 2
    ) {
      const remaining = Math.min(
        limit - matchedItems.length,
        SUBSTRING_MIN_THRESHOLD - matchedItems.length
      );
      addItemsFromRows(
        queryFuzzyRows(cleanQuery, query, baseWhere, params, kindSort, remaining, esc),
        4
      );
    }
  }

  if (query && !options?.sortByKind) {
    matchedItems = secondaryLastWithinBand(matchedItems);
  }

  // Save to LRU cache
  if (searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey) {
      searchCache.delete(oldestKey);
    }
  }
  searchCache.set(cacheKey, matchedItems);

  return matchedItems;
}

function rowToQuickPickItem(row: any[]): QuickPickItem {
  const uriStr = row[0] as string;
  let uri: vscode.Uri;
  try {
    uri = vscode.Uri.parse(uriStr);
  } catch {
    uri = vscode.Uri.file(uriStr);
  }

  const secondary = row[SECONDARY_COLUMN] as Secondary;
  let description = (row[3] as string) || "";
  if (secondary === Secondary.Test) {
    description += " · test";
  } else if (secondary === Secondary.Generated) {
    description += " · generated";
  }

  const nameLine = row[NAME_LINE_COLUMN];
  const nameChar = row[NAME_CHAR_COLUMN];
  const hasNamePosition =
    nameLine !== null && nameLine !== undefined && nameChar !== null && nameChar !== undefined;

  return {
    uri,
    symbolKind: row[1] as number,
    label: row[2] as string,
    description,
    detail: (row[4] as string) || "",
    range: {
      start: new vscode.Position(row[5] as number, row[6] as number),
      end: new vscode.Position(row[7] as number, row[8] as number),
    },
    ...(hasNamePosition
      ? { namePosition: new vscode.Position(nameLine as number, nameChar as number) }
      : {}),
    ...(secondary ? { isSecondary: true } : {}),
  } as QuickPickItem;
}
