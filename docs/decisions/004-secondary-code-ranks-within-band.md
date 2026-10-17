# 004: Tests, mocks and generated code rank last within their match band

Status: Accepted

## Decision

Files matching `searchEverywhere.secondaryCode` (globs such as `**/*_test.go`, `**/mock_*.go`,
`**/mocks/**`, `**/*.pb.go`, `**/src/test/**`, `**/*.{test,spec}.{ts,tsx,js,jsx}`) and their
symbols are secondary. A secondary row ranks after non-secondary rows of the same match band
(exact, strong, weak, fuzzy; see 002) and never moves to another band. Recency stays above it: the
recent-items boost reorders a band first, so a recently used test row keeps its place among the
recent rows.

Secondary rows are tagged in the description, `· test` when the matching glob mentions `test` or
`spec` (including `__tests__`), otherwise `· generated`. They are not hidden.

The flag is the column `is_secondary` (0 none, 1 test, 2 generated), schema version 4. Every
ranked `ORDER BY` sorts `is_secondary != 0` right after its band or tier term, and the merged
result list is regrouped per band in JavaScript because a band can span search stages. The column
derives from the uri only, so opening a version 3 index backfills it in place (one `UPDATE` per
distinct uri), and changing the setting recomputes it and clears the search cache without
reindexing. Detection is by path only; file headers such as `// Code generated … DO NOT EDIT.` are
not read.

## Rationale

In a Go service every type has a mock (`mock_repository.go`) and a test file, and protobuf
generates a second copy of every message; in a Maven project `src/test/java` mirrors `src/main`.
Typing a type name returned the mock, the generated struct and the source in index order, so the
source was often third. Hiding these files was rejected: people do search for a test or a mock,
and a hidden result is a bug report. Ranking them first by match quality and only then by
secondary keeps the rule from 002 — a better match always wins — so typing the exact name of a
test helper still finds it first.

A path-only flag is cheap to compute on insert and to backfill, and makes the setting take effect
immediately. Reading file headers would need file contents during indexing, which the index never
reads today, and would make the flag impossible to recompute without a reindex.

Test and generated rows rank equally; the stored value only picks the tag.

## Consequences

- A source file that happens to match a glob (a real package called `generated`) ranks lower and
  is tagged; users fix that with `searchEverywhere.secondaryCode`.
- Indexing classifies each uri once per batch; on the 50k-row benchmark this added about 18 % to
  the one-time insert, and nothing measurable to the average query time (~2.7 ms).
- Generated files without a matching name (header-only detection) are not demoted.
