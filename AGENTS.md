# vscode-search-everywhere - Agent Guidelines

`vscode-search-everywhere` is a VS Code extension, written in TypeScript, modelled on JetBrains'
"Search Everywhere": one quick pick that finds files and symbols across the whole workspace. The
index lives in an embedded SQLite database (`sql.js`, WebAssembly); symbols come from each
language's document symbol provider. Read `README.md` for features and settings and `CHANGELOG.md`
for what each release changed.

## CodeGraph

In repositories indexed by CodeGraph (a `.codegraph/` directory exists at the repo root), reach
for it BEFORE grep/find or reading files when you need to understand or locate code:

- **MCP tools** (when available): `codegraph_explore` answers most code questions in one call —
  the relevant symbols' verbatim source plus the call paths between them. `codegraph_node` returns
  one symbol's source + callers, or reads a whole file with line numbers. If the tools are listed
  but deferred, load them by name via tool search.
- **Shell** (always works): `codegraph explore "<symbol names or question>"` and
  `codegraph node <symbol-or-file>` print the same output.

If there is no `.codegraph/` directory, skip CodeGraph entirely — indexing is the user's decision.

## Commands

Run these from the repository root.

- `npm install`
- `npm run compile` - clean `dist/` and run `tsc`; this is also the type check
- `npm test` - compiles, then runs the mocha suite inside a downloaded VS Code through
  `@vscode/test-electron` (`src/test/runTest.ts`); the first run needs network access
- `npm run watch` - `tsc --watch`
- `npm run package` - build the `.vsix` with `vsce`
- `npm run publish:extension` - publish to the VS Code Marketplace and Open VSX
  (`scripts/publish.js`); reads tokens from the gitignored `local.properties`, whose shape is
  `local.properties.example`. Only on an explicit request
- `.github/workflows/release.yml` - CI: every push to `master` and every pull request checks
  imports (`check:cycles`, `check:layers`), compiles, tests and packages the `.vsix`. Pushing a
  tag `v<version>` matching `package.json` also publishes it to the Marketplace as publisher
  `tranphucbol` (`vsce publish --azure-credential`, logged in through an Azure managed identity
  federated with the `marketplace` environment: secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`),
  to Open VSX when `OVSX_PAT` is set, and
  attaches it to a GitHub release. Running it by hand with `check-publishing` prints the
  identity's Marketplace ID (it must be a Contributor member of the publisher), verifies publish
  rights on both registries and creates the Open VSX namespace if it is missing
- `npm run check:cycles` - `madge` fails on any import cycle in `src/`
- `npm run check:layers` - `scripts/check-layers.js` fails on any import in `src/` that goes
  against the folder order (decision 008) or a folder's subfolder order (decision 009); a new
  subfolder or root file in a layered folder must be added to its table
- `node scripts/benchmark.js` - the search benchmark against a mocked `vscode`; it loads
  `dist/database/`, so compile first

## Verify

Run these before considering a change done:

- `npm run compile`
- `npm run check:cycles`
- `npm run check:layers`
- `npm test`
- for a change to `src/` that a user can see (the quick pick, keys, indexing, settings), the
  `local-testing` skill in `.agents/skills/local-testing/`: it runs the extension in a real VS
  Code on a sample project and prints what the quick pick shows. Run its smoke set at least.
  macOS only

## Layout

```
src/extension.ts            activation; registers the commands and wires the modules
src/commands/controller.ts  the command handlers: search, reload, open to the side, file scope
src/quickPick/              the QuickPick UI; imports go quickPick.ts -> actions -> view ->
                            input -> editor -> state.ts
  quickPick.ts              lifecycle, event handlers, the `quickPick` facade the controller calls
  state.ts                  the shared session state
  actions/                  what a key or button does: open, fileScope, categories, copy
  view/                     rows and title: itemLoader, liveResults (not indexed yet,
                            libraries), recentItems, itemDecoration (icons, buttons), title
  input/                    what the user typed: query (filter phrases, `:line`), handOff
                            (`>` and `%`), help (`?`)
  editor/                   the editor behind the quick pick: preview, positions
src/indexing/               keeping the index in step with the workspace; imports go
                            lifecycle.ts -> sources -> queue -> apply
  lifecycle.ts              init, startup (cache, template or full index; reconcile), index on
                            search open, reload. The only indexing module other folders import
                            (and sources/fileWatcher, stopped on deactivate)
  sources/                  what changed: editorEvents, settingsEvents (and which settings
                            reindex), unsavedFiles, fileWatcher, reconciler (sync with disk),
                            worktreeSync (git delta of a worktree seeded from the template)
  queue/                    when it runs: changes (the one way to queue an update, removal or
                            full index), actionQueue (the serial queue; coalesces queued
                            duplicates), retryQueue (files whose language server timed out)
  apply/                    writing the database: fullIndex, fileUpdate (one file or folder),
                            progress (the notification and its counters)
src/symbols/                asking VS Code for symbols; imports go root -> scan -> items
  liveSymbols.ts            the workspace symbol provider, at query time
  reference.ts              copy references
  scan/                     index time: scan (fetchData), files (find, filter, stat),
                            warmup (language servers), documentSymbols
  items/                    dataConverter (symbols to QuickPickItems), itemsFilter (allowed
                            and ignored kinds and names, shared by scan and liveSymbols)
src/database/               the SQLite index; imports go index.ts -> storage | search ->
                            queryText, secondary, searchCache -> state.ts
  index.ts                  the `database` facade
  state.ts                  connection, dirty flags, change epoch
  queryText.ts, secondary.ts  query parsing; test/generated code classification
  searchCache.ts            the LRU result cache: every write clears it, search reads it
  storage/                  schema (version, migrations), store (writes, file state),
                            persistence (file, shared worktree template)
  search/                   search (cache lookup, recent boost), tiers (the tiered SQL)
src/platform/               VS Code and the machine; imports go settings -> root
  settings/                 config (every `searchEverywhere.*` setting is read here), presets,
                            patternProvider (include/exclude globs, gitignore mode)
  cache.ts                  workspaceState: config snapshot, unsaved URIs
  logger.ts, gitService.ts  output channel; fingerprint and diffs for the shared worktree cache
src/shared/                 no feature imports: types (declares fields newer than the pinned
                            @types/vscode), events (every EventEmitter), async, glob, paths,
                            collections, messages, vscodeVersion, workspaceFolders
src/test/<folder>/          `<module>.test.ts` and `<module>.testSetup.ts` side by side,
                            mirroring `src/<folder>/` and its subfolders
src/test/fixtures/          recorded language server symbols
src/test/util/              mock and stub factories shared by the suites
scripts/                    publish.js, benchmark.js, check-layers.js
.agents/skills/             project skills; local-testing drives a real VS Code
docs/decisions/             one numbered file per durable architecture decision
docs/plans/                 working implementation plans; only the template is tracked
```

## Conventions

- `engines.vscode` is `^1.64.0` and `@types/vscode` is pinned to `1.64.0`. A newer API is
  feature-detected at runtime and declared in `src/shared/types.ts` (see `iconPath` and
  `resourceUri`); it must degrade on older hosts rather than raise the floor silently.
- A new setting goes in `package.json` `contributes.configuration`, gets a `fetch*` reader in
  `src/platform/settings/config.ts`, and is documented in the README settings list in the same change.
- A database schema change invalidates every cached index, including the shared worktree cache;
  say how existing users get a reindex.
- Keep the search path cheap: it runs on every keystroke against indexes of millions of rows.
  Measure with `scripts/benchmark.js` when touching `src/database/`.
- A new module goes in the feature folder that owns it, and in the subfolder whose role it
  shares (decision 009); `shared/` is for code with no feature imports. Modules export one
  object (`export const quickPick = { … }`) and call their own functions through it, so tests
  can stub them with sinon. When a feature folder needs shared mutable state across its files,
  it lives in that folder's `state.ts`, which keeps imports acyclic.
- Add focused coverage for changed behaviour in `src/test/<folder>/<module>.test.ts`, with
  setup in the matching `<module>.testSetup.ts` next to it. Stub what a test reads rather than
  relying on state another suite left behind. Test names follow the existing `it("should …")` form.
- Match surrounding TypeScript style and keep changes scoped. Avoid speculative abstractions and
  unrelated refactors.

## Git workflow

- `origin` (`tranphucbol/vscode-search-everywhere`) is where work lands; `fork-repo`
  (`kbysiec/vscode-search-everywhere`) is upstream and is not pushed to.
- Every change gets its own branch (`feature/…`, `fix/…`, `chore/…`) and is merged into `master`
  on `origin`, with `Merge branch '<branch>'` or through a pull request.

## Code comments

Default to none. Write one only if a reader would otherwise make a worse decision.

Never:

- Restate the code, the signature, or the types
- Narrate steps (`// 1. validate`, `// 2. save`)
- Describe the change (`// now uses X`, `// added retry`) — that's the commit message
- Section banners, commented-out code, TODOs without a link

Do:

- Explain why, not what — especially why the simpler approach fails
- State invariants types can't: lock held, units, not concurrency-safe
- Cite sources for magic values and workarounds (link the bug/doc)
- Doc-comment exported API only: errors, nil, side effects, concurrency

Prefer renaming, extracting a function, or a named constant over commenting.
Update or delete the comment in the same edit as the code.

## Documentation

- `docs/decisions/` records durable architecture decisions. Start a new record from
  `docs/decisions/TEMPLATE.md` when a meaningful alternative exists or a future reader would
  otherwise reopen the choice.
- `docs/plans/` holds working implementation plans. Start from `docs/plans/TEMPLATE.md`; plans
  are ignored except for the template.
- User-visible changes get a `CHANGELOG.md` entry and, when they add a feature or setting, a
  `README.md` update.
