<p align="center">
  <img src="img/logo.png" alt="Jetbrain Search Everywhere logo" width="128">
</p>

# Jetbrain Search Everywhere

One quick pick that finds files and symbols across the whole workspace, modelled on the
"Search Everywhere" feature of JetBrains IDEs. A fully customizable alternative to VS Code's
"Go to Symbol in Workspace...".

![How it works](img/how-it-works.gif)

## Install

- [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=tranphucbol.jetbrain-search-everywhere)
- [Open VSX](https://open-vsx.org/extension/tranphucbol/jetbrain-search-everywhere)

Or run `ext install tranphucbol.jetbrain-search-everywhere` from the command palette quick open
(`cmd + p` / `ctrl + p`).

> Coming from `kbysiec.vscode-search-everywhere`? This extension is a fork of it and keeps the
> same `searchEverywhere.*` settings and command IDs, so your settings carry over. Uninstall or
> disable the original, otherwise both register the same commands and keybindings.

## Quick start

1. Press `alt + cmd + p` (mac) or `ctrl + alt + p` (win/linux). The first call indexes the
   workspace; set `searchEverywhere.shouldInitOnStartup` to index on startup instead.
2. Type part of a file or symbol name and press `enter` to open it.
3. Press `cmd + enter` / `ctrl + enter` to open it to the side, or `alt + right` on a file to
   search the symbols inside it.

## How it works

The extension indexes the workspace into an embedded SQLite database (`sql.js`, WebAssembly):
every file matching the include and exclude patterns, and every symbol the language's document
symbol provider reports for it. Each query runs against B-tree indexes and returns at most 500
ranked results, so the quick pick stays responsive on large workspaces.

After the first scan the index is kept up to date as you work:

- functions, classes, variables or React components added, renamed or deleted in a file
- files added, renamed, deleted or moved between directories or folders of a multi-root workspace

The index is cached, so the next start of VS Code reads it instead of scanning again. Git
worktrees and local clones of the same repository share one cache.

## Features

### Query syntax

| Query | Finds |
| :--- | :--- |
| `USI`, `usi`, `SerImp` | `UserServiceImpl` (CamelHumps) |
| `UserService.save`, `UserService#save`, `Outer::Inner::run` | a member through its container |
| `UserService.` | every member of `UserService` |
| `src/models/User`, `models/User.find` | names inside a directory |
| `impl user` | `UserServiceImpl` (words in any order) |
| `user*impl` | `UserServiceImpl` (wildcard) |
| `HTTPServer.ts:13`, `src/user.ts:10:5` | opens the item at that line and column |
| `@@order` | classes only (filter phrase) |
| `?` | the list of filter phrases |

![Query syntax](img/query-syntax.gif)

- **CamelHumps**: a query with a capital after its first letter, or with `_` or `-` between its
  parts, matches each part against the start of a word, in order, skipping words in between
  (`USI`, `uSerImp` or `SerImp` find `UserServiceImpl`, `HTTPSer` finds `HTTPServer`, `MV` and
  `max_v` find `MAX_VALUE`). Matches that start at the first word rank above matches that start
  later. An all-lowercase query of two or more characters also matches one letter per word
  (`usi` finds `UserServiceImpl`). CamelHumps matches rank after prefix matches and before
  substring matches.
- **Qualified names**: search a member through its class or namespace with `.`, `#` or `::`. End
  the query with a separator (`UserService.`) to list every member of that container. Members
  under the exact parent rank above members found deeper in the container chain, and an exact
  file match such as `user.service.ts` still comes first.
- **Directory + name**: a query with `/` matches the part after the last `/` against names inside
  that directory, then falls back to matching the path.
- **Multi-word search**: space-separated words match in any order. Every word must match; exact
  and in-order matches rank first.
- **Wildcards**: `*` matches any run of characters within a word, in order (`user*impl` finds
  `UserServiceImpl`, `impl*user` does not). `?` is not a wildcard, and `%` and `_` match
  literally. Queries containing `/` use the directory search instead of multi-word and `*`
  matching.
- **Jump to line**: append `:line` or `:line:column` to the query to open the selected item at
  that position.

  ![Jump to line](img/jump-to-line.gif)

- **Filter phrases**: start the query with a phrase to search one item type only, e.g. `@@` for
  classes or `$$` for files. Type the help phrase (`?`) to list them. Both are configurable with
  `searchEverywhere.itemsFilterPhrases` and `searchEverywhere.helpPhrase`.

  ![Filter phrases](img/filter-phrases.gif)

### Ranking

- Results are ranked by how well they match: exact, then prefix, then CamelHumps, then substring.
- **Recently used results first**: while you type, files and symbols you opened recently, and
  open editor tabs, come first among results that match equally well. Typing `index` in a
  monorepo puts the `index.ts` you were just working in above the other `index.ts` files. Recency
  never beats a better match: an exact match you never opened stays above a recent prefix match.
  Turn it off with `searchEverywhere.rankRecentItemsHigher`.
- **Recent items on an empty query**: with nothing typed, the quick pick lists recently opened
  items and open editors.

  ![Recent items](img/recent-items.gif)

- Set `searchEverywhere.shouldItemsBeSorted` to group results by item type instead of ranking
  them strictly by relevance.

### Navigation

- **Search in a file**: drill into any file with `alt + right` or the right-arrow button on a
  file item to search the symbols inside it, and go back to the workspace search with
  `alt + left` or the Back button; your previous query is restored.
  `searchEverywhere.searchCurrentFile` (`alt + cmd + o` / `ctrl + alt + o`) opens the search
  scoped to the active editor.

  ![Search in a file](img/file-scope.gif)

- **Open to the side**: open the selected item in an editor beside the active one with
  `cmd + enter` / `ctrl + enter`, `alt + enter`, or the split-editor button on the item.

  ![Open to the side](img/open-to-the-side.gif)

- **Highlight of the selected symbol** (`searchEverywhere.shouldHighlightSymbol`)

  enabled

  ![Highlight enabled](img/highlight-on.gif)

  disabled

  ![Highlight disabled](img/highlight-off.gif)

- The selection in the active editor is put in the search
  (`searchEverywhere.shouldSearchSelection`).

### Indexing and cache

- Index on startup or on the first call (`searchEverywhere.shouldInitOnStartup`).
- Choose what is indexed: include and exclude globs, or VS Code's "Files: Exclude" and
  "Search: Exclude", or the `.gitignore` file (`searchEverywhere.excludeMode`).
- Drop item kinds or names from the index with `searchEverywhere.itemsFilter`,
  `searchEverywhere.excludeProperties` and `searchEverywhere.excludeVariables`.
- The index is cached between sessions (`searchEverywhere.shouldWorkspaceDataBeCached`) and shared
  across git worktrees and local clones of the same repository
  (`searchEverywhere.shareCacheAcrossWorktrees`).
- A dedicated output channel logs triggered actions, scanned directories and indexing times.

### Display

- **Indexing notification** in a toast or in the status bar
  (`searchEverywhere.shouldDisplayNotificationInStatusBar`)

  toast

  ![Notification in toast](img/notification-toast.gif)

  status bar

  ![Notification in status bar](img/notification-status-bar.gif)

- **Debounce** of search results while typing (`searchEverywhere.shouldUseDebounce`), useful on
  large workspaces

  enabled

  ![Debounce enabled](img/debounce-on.gif)

  disabled

  ![Debounce disabled](img/debounce-off.gif)

- A configurable icon for each item type (`searchEverywhere.icons`), or file icons from the
  active file icon theme (`searchEverywhere.useFileIconTheme`).

## Performance

`node scripts/benchmark.js` indexes 50,000 generated files and symbols and runs 170 queries
against them. Measured on an Apple M4:

| | In-memory array (v2.x design) | SQLite WASM index |
| :--- | :---: | :---: |
| JS heap used by the items | +46.6 MB | ~0 MB (rows live in the 37 MB database) |
| Cache | 18.2 MB of JSON in workspace state, 41 ms to write and read | the SQLite database |
| Average query time | 4.45 ms | 2.65 ms (repeated queries come from an LRU cache) |
| Uncached query time | | 10–43 ms, depending on the query |
| Items handed to the quick pick | all 50,000 | at most 500 |

## Commands

| Command | Title | mac | win/linux |
| :--- | :--- | :--- | :--- |
| `searchEverywhere.search` | Search everywhere: Search | `alt + cmd + p` | `ctrl + alt + p` |
| `searchEverywhere.searchCurrentFile` | Search everywhere: Search in Current File | `alt + cmd + o` | `ctrl + alt + o` |
| `searchEverywhere.navigateIntoFile` | Search everywhere: Navigate into File | `alt + right` | `alt + right` |
| `searchEverywhere.navigateBack` | Search everywhere: Navigate Back to Workspace | `alt + left` | `alt + left` |
| `searchEverywhere.openToTheSide` | Search everywhere: Open to the Side | `cmd + enter`, `alt + enter` | `ctrl + enter`, `alt + enter` |
| `searchEverywhere.reload` | Search everywhere: Reload | | |
| `searchEverywhere.clearSharedCache` | Search everywhere: Clear Shared Worktree Cache | | |

- **Search** searches every file and symbol in the workspace.
- **Search in Current File** searches the symbols of the active editor.
- **Navigate into File** searches the symbols of the selected file item; it applies while Search
  Everywhere is open and not already scoped to a file.
- **Navigate Back to Workspace** returns from a file search to the workspace search and restores
  the previous query; it applies while scoped to a file.
- **Open to the Side** opens the selected item beside the active editor; it applies while Search
  Everywhere is open.
- **Reload** re-indexes the whole workspace.
- **Clear Shared Worktree Cache** clears the repository cache shared across git worktrees and
  clones.

## Extension Settings

### Indexing

- `searchEverywhere.shouldInitOnStartup`, default `false`

  Should indexing be initialized on Visual Studio Code startup.

- `searchEverywhere.include`, default `"**/*.{js,jsx,ts,tsx}"`

  A glob. Any file matching it is indexed.

- `searchEverywhere.exclude`

  An array of globs. Any file matching these globs is excluded from indexing.

  Default value:

  ```json
  [
    "**/.git",
    "**/.svn",
    "**/.hg",
    "**/.CVS",
    "**/.DS_Store",
    "**/package-lock.json",
    "**/yarn.lock",
    "**/node_modules/**",
    "**/bower_components/**",
    "**/coverage/**",
    "**/.vscode/**",
    "**/.vscode-test/**",
    "**/.history/**",
    "**/.cache/**",
    "**/.cache-loader/**",
    "**/out/**",
    "**/dist/**"
  ]
  ```

- `searchEverywhere.excludeMode`, default `"search everywhere"`

  Which exclude patterns apply: `search everywhere` (`searchEverywhere.exclude`),
  `files and search` (VS Code's "Files: Exclude" and "Search: Exclude") or `gitignore`. If the
  gitignore file is not found or is empty, `searchEverywhere.exclude` is used as a fallback. Run
  `Search everywhere: Reload` after changing the gitignore file.

- `searchEverywhere.itemsFilter`

  A filter applied to items before they are indexed. Kinds are the numbers in the
  [icons table](#icons) below, see also the
  [SymbolKind reference](https://code.visualstudio.com/api/references/vscode-api#SymbolKind).

  Default value:

  ```json
  {
    "allowedKinds": [],
    "ignoredKinds": [],
    "ignoredNames": []
  }
  ```

  This example removes arrays (17), booleans (16) and every item whose name contains `foo`:

  ```json
  {
    "allowedKinds": [],
    "ignoredKinds": [16, 17],
    "ignoredNames": ["foo"]
  }
  ```

- `searchEverywhere.excludeProperties`, default `true`

  Exclude object properties (kind 6). Reduces the index size by more than 50% and removes property
  noise in large codebases. Listing 6 in `itemsFilter.allowedKinds` keeps them.

- `searchEverywhere.excludeVariables`, default `false`

  Exclude variables (kind 12). Disabled by default so newly written variables and React function
  components stay searchable. Constants (kind 13) are not affected; add 13 to
  `itemsFilter.ignoredKinds` to drop them too. Listing 12 in `itemsFilter.allowedKinds` keeps
  variables.

### Cache

- `searchEverywhere.shouldWorkspaceDataBeCached`, default `true`

  Index the workspace only once. Each next start of Visual Studio Code reads the index from the
  cache.

- `searchEverywhere.shareCacheAcrossWorktrees`, default `true`

  Share and seed the indexed database cache across git worktrees and local clones of the same
  repository, for a near-instant start. `Search everywhere: Clear Shared Worktree Cache` clears it.

### Search and results

- `searchEverywhere.shouldUseDebounce`, default `true`

  Debounce the results while typing; useful in a large workspace.

- `searchEverywhere.shouldSearchSelection`, default `true`

  Put the selection of the active editor in the search.

- `searchEverywhere.shouldItemsBeSorted`, default `false`

  Group and sort results by item type. When `false` (recommended), results are ranked strictly by
  relevance.

- `searchEverywhere.rankRecentItemsHigher`, default `true`

  Show recently opened files and symbols first among equally good matches while typing.

- `searchEverywhere.showRecentItemsOnEmptyQuery`, default `true`

  Show recent items and open editors when the search query is empty.

- `searchEverywhere.recentItemsLimit`, default `10`

  Maximum number of recent items shown when the search query is empty.

- `searchEverywhere.shouldUseItemsFilterPhrases`, default `true`

  Allow narrowing the results down with the filter phrases below.

- `searchEverywhere.itemsFilterPhrases`

  Phrases that narrow the results down to one item type, keyed by kind.

  Default value:

  ```json
  {
    "0": "$$",
    "4": "@@",
    "11": "!!",
    "14": "##",
    "17": "%%"
  }
  ```

- `searchEverywhere.helpPhrase`, default `"?"`

  A phrase that lists the filter phrases.

### Display

- `searchEverywhere.shouldDisplayNotificationInStatusBar`, default `false`

  Show the indexing notification in the status bar instead of a toast.

- `searchEverywhere.shouldHighlightSymbol`, default `false`

  Highlight the selected symbol after opening it.

- `searchEverywhere.useFileIconTheme`, default `false`

  Show file results with icons from the active VS Code file icon theme (e.g. Seti, Material Icon
  Theme) instead of the built-in icon. Symbols keep their built-in icons. Requires VS Code 1.108
  or newer; older versions keep the built-in icon.

- `searchEverywhere.icons`

  <a id="icons"></a>The icon displayed for each item type. Only
  [codicons](https://code.visualstudio.com/api/references/icons-in-labels#icon-listing) are
  allowed; an item type left out has no icon.

  Default value:

  ```json
  {
    "0": "symbol-file",
    "1": "file-submodule",
    "2": "symbol-namespace",
    "3": "package",
    "4": "symbol-class",
    "5": "symbol-method",
    "6": "symbol-property",
    "7": "symbol-field",
    "8": "symbol-constructor",
    "9": "symbol-enum",
    "10": "symbol-interface",
    "11": "symbol-function",
    "12": "symbol-variable",
    "13": "symbol-constant",
    "14": "symbol-string",
    "15": "symbol-numeric",
    "16": "symbol-boolean",
    "17": "symbol-array",
    "18": "symbol-keyword",
    "19": "symbol-key",
    "20": "remove",
    "21": "symbol-enum-member",
    "22": "symbol-structure",
    "23": "symbol-event",
    "24": "symbol-operator",
    "25": "type-hierarchy-sub"
  }
  ```

  Which kind refers to which item type:

  | kind | icon               | item type      |
  |------|:------------------:|:--------------:|
  |   0  | symbol-file        | file           |
  |   1  | file-submodule     | module         |
  |   2  | symbol-namespace   | namespace      |
  |   3  | package            | package        |
  |   4  | symbol-class       | class          |
  |   5  | symbol-method      | method         |
  |   6  | symbol-property    | property       |
  |   7  | symbol-field       | field          |
  |   8  | symbol-constructor | constructor    |
  |   9  | symbol-enum        | enum           |
  |  10  | symbol-interface   | interface      |
  |  11  | symbol-function    | function       |
  |  12  | symbol-variable    | variable       |
  |  13  | symbol-constant    | constant       |
  |  14  | symbol-string      | string         |
  |  15  | symbol-numeric     | number         |
  |  16  | symbol-boolean     | boolean        |
  |  17  | symbol-array       | array          |
  |  18  | symbol-keyword     | object         |
  |  19  | symbol-key         | key            |
  |  20  | remove             | null           |
  |  21  | symbol-enum-member | enum member    |
  |  22  | symbol-structure   | struct         |
  |  23  | symbol-event       | event          |
  |  24  | symbol-operator    | operator       |
  |  25  | type-hierarchy-sub | type parameter |

## Release Notes

See [CHANGELOG.md](CHANGELOG.md).

## Development

```sh
npm install
npm run compile          # clean dist/ and type check
npm test                 # mocha suite inside a downloaded VS Code
node scripts/benchmark.js # search benchmark; run npm run compile first
```

To try the extension, open the repository in VS Code, open the "Run and Debug" view and start
"Run Extension".

## Credits

Created by [Kamil Bysiec](https://github.com/kbysiec)
([kbysiec/vscode-search-everywhere](https://github.com/kbysiec/vscode-search-everywhere)).
This fork is maintained by [tranphucbol](https://github.com/tranphucbol).

If you find it useful, a rating on the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=tranphucbol.jetbrain-search-everywhere&ssr=false#review-details)
or a star on [GitHub](https://github.com/tranphucbol/vscode-search-everywhere) is appreciated.
