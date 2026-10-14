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
  `vscode-test` (`src/test/runTest.ts`); the first run needs network access
- `npm run watch` - `tsc --watch`
- `npm run package` - build the `.vsix` with `vsce`
- `npm run publish:extension` - publish to the VS Code Marketplace and Open VSX
  (`scripts/publish.js`); reads tokens from the gitignored `local.properties`, whose shape is
  `local.properties.example`. Only on an explicit request
- `node scripts/benchmark.js` - the search benchmark against a mocked `vscode`; it loads
  `dist/database.js`, so compile first

## Verify

Run these before considering a change done:

- `npm run compile`
- `npm test`

## Layout

```
src/extension.ts            activation; registers the commands and wires the modules
src/controller.ts           the command handlers: search, reload, open to the side, file scope
src/quickPick.ts            the QuickPick UI: query parsing (filter phrases, `:line`), item
                            loading, buttons, file-scope navigation, opening an item
src/database.ts             the SQLite index: schema, B-tree indexes, the tiered search query,
                            the LRU result cache
src/dataService.ts          finds files and asks VS Code for each file's document symbols
src/dataConverter.ts        turns files and symbols into QuickPickItems (label, detail, icon)
src/workspace*.ts           indexing, incremental updates and removals on file events
src/actionProcessor*.ts     the serial queue of rebuild/update/remove actions; coalesces
                            queued duplicates before running the next one
src/cache.ts                workspaceState persistence; config snapshot, unsaved URIs
src/gitService.ts           repository fingerprint and modified files for the shared
                            worktree cache
src/recentItems.ts          recent items and open editors shown on an empty query
src/config.ts               every `searchEverywhere.*` setting is read here
src/patternProvider.ts      include/exclude globs, including the gitignore mode
src/types.ts                shared types; declares fields newer than the pinned @types/vscode
src/test/test/              one `<module>.test.ts` per module
src/test/testSetup/         the stubs and fixtures each suite wires up
src/test/util/              mock and stub factories shared by the suites
scripts/                    publish.js, benchmark.js
docs/decisions/             one numbered file per durable architecture decision
docs/plans/                 working implementation plans; only the template is tracked
```

## Conventions

- `engines.vscode` is `^1.64.0` and `@types/vscode` is pinned to `1.64.0`. A newer API is
  feature-detected at runtime and declared in `src/types.ts` (see `iconPath` and
  `resourceUri`); it must degrade on older hosts rather than raise the floor silently.
- A new setting goes in `package.json` `contributes.configuration`, gets a `fetch*` reader in
  `src/config.ts`, and is documented in the README settings list in the same change.
- A database schema change invalidates every cached index, including the shared worktree cache;
  say how existing users get a reindex.
- Keep the search path cheap: it runs on every keystroke against indexes of millions of rows.
  Measure with `scripts/benchmark.js` when touching `src/database.ts`.
- Add focused coverage for changed behaviour in the module's `src/test/test/*.test.ts`, with
  setup in the matching `src/test/testSetup/*.testSetup.ts`. Test names follow the existing
  `it("should …")` form.
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
