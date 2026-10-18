# 008: Source is grouped in feature folders with one-way imports

Status: Accepted

## Decision

`src/` is split into feature folders, and a folder imports only folders to its right:

```
extension.ts -> commands -> quickPick -> indexing -> symbols -> database -> platform -> shared
```

- `shared/` holds code that imports no feature: types, every `EventEmitter` (`events.ts`),
  and small helpers (async, glob, paths, collections, messages, vscodeVersion,
  workspaceFolders). There is no `utils.ts`; a helper with one caller lives in that caller.
- `platform/` wraps VS Code and the machine: config, presets, cache, logger, gitService,
  patternProvider.
- `database/` and `quickPick/` keep one facade object (`database`, `quickPick`) with the same
  members as before the split, so callers outside the folder did not change. The facade
  delegates to the files beside it.
- Mutable state that several files of one folder share lives in that folder's `state.ts`
  (`database/state.ts`, `quickPick/state.ts`). State used by one file stays module-local there.
- A module that would call back into a module that imports it fires an event from
  `shared/events.ts` instead (the indexer announces `onWillIndexWorkspace` and
  `onDidIndexWorkspace`; `workspace` restarts the retry queue). `npm run check:cycles` (madge)
  fails on any cycle.
- Tests mirror the tree: `src/test/<folder>/<module>.test.ts` with its `.testSetup.ts` beside
  it.

## Rationale

The flat `src/` had 27 files, two of them over 1,600 lines (`database.ts`, `quickPick.ts`), a
415-line `utils.ts` that everything imported, three event emitter files with duplicate emitters
relayed between them, and two import cycles (indexer and updater; workspace, file watcher and
reconciler). Tests sat in `test/test/` and their stubs in `test/testSetup/`, so every change
touched two distant folders.

Modules export one object and call their own functions through it so sinon can stub them.
Splitting a module therefore moves functions between objects, and the shared state those
functions read has to sit below all of them, which is why each split folder has a `state.ts`
rather than keeping state in the facade file.

Alternatives considered: keeping the flat layout and only splitting the two large files (the
cycles and the `utils.ts` hub would remain); switching to classes with constructor injection
(rewrites every test's stubbing for no user-visible gain).

## Consequences

- A new module goes in the folder that owns its feature; reach for `shared/` only when it has
  no feature imports.
- Stubbing a function that moved means stubbing it on its new object. A stub left on the old
  facade property fails loudly because that property no longer exists.
- Suites now run in a different order, which exposed tests that relied on state left by an
  earlier suite; they stub what they read now. New tests should do the same.
- No user-visible change and no schema change; existing indexes and caches are kept.
- Inside each folder, files are grouped in role subfolders with their own one-way order:
  [009](009-role-subfolders.md).
