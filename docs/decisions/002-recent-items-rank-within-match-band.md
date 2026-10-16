# 002: Rank recently used results first within their match band

Status: Accepted

## Decision

While typing, recently used files and symbols move to the front of the results only among rows
that match the query equally well. Every result carries a match band (1 exact, 2 strong: prefix or
anchored, 3 weak: substring, later word or any order, 4 fuzzy subsequence), set by the search
stage and tier that produced it. Recency reorders rows inside a band and never moves a row into a
better band: an exact match you never opened stays above a recent prefix match.

The boost is computed outside the SQL that ranks matches. `database.search` runs the main search
unchanged and cached as before, then, when it is given recent keys, runs the same search pipeline
a second time restricted to those keys (`uri IN (…) AND (uri, symbol_kind, name) IN (VALUES …)`,
read through `idx_symbols_uri`). The two result lists are merged per band in JavaScript.

## Rationale

The alternative is IntelliJ's behaviour as people often describe it: recent results first,
regardless of how well they match. It makes the result list depend on history more than on the
query. Typing the exact name of a file you have not opened yet would show a recent file that only
shares a prefix with it above it, and the more you use the extension the harder it becomes to
reach anything new. Keeping recency inside a band means a better match always wins, and history
only settles ties, which is where it helps most: the twenty `index.ts` files in a monorepo all
match `index` exactly, and the one you were working in comes first.

A recency term in each stage's `ORDER BY` was rejected for two reasons. First, the search cache is
keyed by the query and options; with recency in the SQL, every open would change the order of
every cached entry, so either the cache key grows the whole history or opening an item flushes
the cache. With the second query, the main search keeps its cache entries; only the small
restricted search misses the cache once after each open. Second, the stages cut their results at
`limit` (and stage 2 only fills up to 50 rows), so a recent row ranked low by the main search may
never be returned; a term in `ORDER BY` would have to be added to every stage of every branch to
fix that, while the restricted search finds those rows by running the same matching rules.

## Consequences

- Typing `user` keeps `user.ts` above a recently opened `UserServiceImpl.ts`; users who expect
  "recent always first" may report that as a bug.
- Every keystroke with a non-empty history runs one extra, restricted query (about 1 to 3 ms on
  the 50k-row benchmark). Without `INDEXED BY idx_symbols_uri` SQLite read that query through
  `idx_symbols_kind` and made it several times slower than the main search.
- Recent fuzzy (band 4) rows are only reordered when the main search returned them; they are never
  pulled into the list.
- `searchEverywhere.rankRecentItemsHigher` turns the boost off; search then behaves as before.
- No schema change; existing indexes keep working.
