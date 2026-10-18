# 009: Feature folders are split into role subfolders with one-way imports

Status: Accepted

## Decision

Inside a feature folder (decision 008), files are grouped in subfolders named after the role
they share, and imports between those subfolders go one way only:

- A subfolder is named after its files' role (`sources/`, `queue/`, `storage/`), not after the
  feature (`indexing/workspace/` would hold everything), and holds at least two files.
- Files left at the folder root are either its entry (a facade such as `database/index.ts`,
  `quickPick/quickPick.ts`, or `indexing/lifecycle.ts`) or small helpers every subfolder may use
  (`database/state.ts`, `quickPick/state.ts`).
- A file may import any file in its own subfolder. Across subfolders and root files, imports
  only go down the order below; two units on the same level do not import each other.
- A folder whose files have no one-way grouping stays flat: `shared/` (independent leaf
  helpers) and `commands/` (one file).
- Tests mirror the subfolders: `src/test/indexing/queue/changes.test.ts` tests
  `src/indexing/queue/changes.ts`.

Order per folder (`|` separates units on the same level):

```
indexing   lifecycle.ts -> sources -> queue -> apply
symbols    liveSymbols.ts | reference.ts -> scan -> items
quickPick  quickPick.ts -> actions -> view -> input -> editor -> state.ts
database   index.ts -> storage | search -> queryText.ts | secondary.ts | searchCache.ts -> state.ts
platform   settings -> cache.ts | gitService.ts -> logger.ts
```

- `indexing/`: `sources/` notices a change (editor and settings events, unsaved files, the file
  watcher, the reconciler, the seeded worktree sync), `queue/` decides when it runs (`changes`
  is the one way to queue an update, removal or full index; `actionQueue`; `retryQueue`), and
  `apply/` writes the database (`fullIndex`, `fileUpdate`, `progress`). Other folders import
  only `lifecycle.ts`, plus `sources/fileWatcher.ts`, which `extension.ts` stops on deactivate.
- `symbols/`: `scan/` reads every file at index time, `items/` turns symbols into rows and
  holds the items filter that both the scan and `liveSymbols` apply.
- `database/`: `storage/` writes and persists, `search/` reads; they share `searchCache.ts`
  (every write clears it) and never import each other.

`npm run check:layers` (`scripts/check-layers.js`) checks every relative import in `src/`
against these orders and decision 008's folder order. A new subfolder or root file in one of
these folders must be added to its table, which is where its level gets decided.

## Rationale

After decision 008 the feature folders kept the flat file names they had before. `indexing/`
was the worst case: `workspace.ts` mixed editor events, settings events, unsaved-file tracking
and pass-throughs; `workspaceIndexer.ts` held the full index, the queue entry point every caller
used and the progress notification; the retry queue sat in `workspaceUpdater.ts` and called back
up into the indexer; and the controller held startup and worktree-sync policy. Nothing said which
file a new change belonged in, or which imports were allowed.

Naming subfolders after roles answers both questions: a file that notices a change goes in
`sources/`, and it may queue work but not write the database itself. The checked order turns
"the indexer calls back into the updater" from something a reviewer must notice into a failing
command.

Alternatives considered: a subfolder per feature inside `indexing/` (`workspace/`, which would
hold everything); keeping the flat layout and only splitting the large files (smaller files, but
still no rule for where code goes); enforcing the order with an ESLint plugin (the repository has
no linter, and a 150-line script with a table is easier to read and change).

## Consequences

- Where queueing and applying used to be mixed, the enqueue side moved into `queue/changes`
  (`queueFullIndex`, `reindex`, `isRebuilding`, the full index after a failed update), so
  `apply/` imports nothing from `queue/`.
- `indexing/` never imports `quickPick/`: `lifecycle.startup` and `prepareQuickPickOpen` take a
  small `QuickPickHandle` (`isInitialized`, `init`) from the controller.
- `rowToQuickPickItem` lives in `database/search/tiers.ts` rather than `search.ts`, because the
  tier queries build rows and `search.ts` imports `tiers.ts`.
- Adding a level, or a file at a folder root, means editing the table in
  `scripts/check-layers.js` in the same change.
- No user-visible change and no schema change; existing indexes and caches are kept.
