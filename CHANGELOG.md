# Change Log

All notable changes to the "vscode-search-everywhere" extension will be documented in this file.

## [Unreleased]
### ✨ Features
- **Commands and text search from Search Everywhere**: type `>` as the first character to open VS Code's command palette with the rest of the query (`>sort`), or `%` to open VS Code's quick text search with it (`%TODO`; the Search view on VS Code versions without quick text search). Reopening Search Everywhere shows the query without the prefix. Both are listed in the `?` help, where `enter` on the row opens them. A category or filter phrase starting with the same character still wins, and a selection or restored query starting with one is searched as before. Turn it off with `searchEverywhere.handOffPrefixes` (default `true`).
- **Copy reference**: every result has a copy button that copies a reference to it without opening it: `com.acme.user.UserService#save` for Java and Kotlin, `api.Server.Start` for Go, `UserService.save` for other languages and the workspace-relative path for a file. Also `searchEverywhere.copyReference` (`alt + shift + cmd + c` / `ctrl + alt + shift + c`) while Search Everywhere is open.
- **Copy path and line**: `searchEverywhere.copyLocation` (`alt + cmd + c` / `ctrl + alt + c`) copies the selected result's `path:line`. Both keep the quick pick open and confirm in the status bar.
- **Search opens before the first index finishes**: the quick pick opens at once instead of waiting for the workspace to be indexed. While indexing, each query of two or more characters also asks the language servers' workspace symbol search, and symbols the index does not have yet are listed after the indexed results under `Not indexed yet`. Turn it off with `searchEverywhere.searchLanguageServersWhileIndexing` (default `true`).
- **Include libraries**: press `alt + cmd + p` / `ctrl + alt + p` again while the search is open, or click the new library button in its title, to also list symbols outside the indexed files, such as the JDK, dependencies or `node_modules`, under `Libraries`. The title ends with `including libraries` while it is on, and it is off each time the search opens. New command `Search everywhere: Include libraries`.
- The title `Search Everywhere` is now shown even when filter phrases are off, to hold the library button.

### 🔧 Changes
- Command titles: Copy Reference, Copy Path and Line and Include Libraries now use the same Title Case as the other commands.

## [0.3.0] - 2026-10-18
### ✨ Features
- **Index follows changes made outside VS Code**: files created, changed or deleted by `git checkout`, `git pull`, a code generator or a terminal command are reindexed about half a second after the last change, and a deleted directory takes everything under it out of the index. Files open in an editor still follow the editor. Turn it off with `searchEverywhere.watchFileSystem` (default `true`).
- **Changes made while VS Code was closed are picked up**: on startup a cached index is compared with the disk in the background, by each file's modification time and size, and only files added, changed or deleted since are reindexed. More than a quarter of the files changed (at least 2000) indexes the workspace again. This also runs when `searchEverywhere.shouldInitOnStartup` is off.
- **Seeded worktrees index the whole git delta**: a worktree seeded from the shared cache reindexes `git diff` between the commit the cache was written at and its own `HEAD`, plus both worktrees' uncommitted files, instead of only its own modified files.

### 🔧 Upgrading
- The index schema moves to version 6 and gains a `file_state` table and a name position for each symbol; the existing index is kept. The first startup records each file's state without reindexing, so a change made before this version is picked up the next time that file changes.
- A worktree seeded from a shared cache written by an older version is indexed in full once, because that cache does not record its commit.

### 🐛 Fixes
- **Symbols open on their name**: opening or previewing a method, class or field puts the cursor on its name instead of on the first line of its doc comment, decorator or annotation, and the line number in the result follows. With `searchEverywhere.shouldHighlightSymbol` the whole declaration is still selected. Results indexed before this update keep opening at the start of the declaration until their file changes or you run Reload; the index is not rebuilt.
- **No more pauses while editing on large indexes**: the index is saved in the background about 10 s after the last change (it was 2 s, with a synchronous write of the whole file), and only when something changed. The shared worktree cache is written after a full index and on exit, no longer on every save, and still records the commit and uncommitted files it was written at.
- **Search stays fast after the first save**: saving the index reset the SQLite page cache and temp store settings, which made later searches slower; they are now restored after every save.
- **Safer index file**: the index is written to a temporary file and renamed into place, so a crash or a full disk never leaves a half-written index. An index file that cannot be read is moved aside (`.corrupt`) and the workspace is reindexed.

## [0.2.1] - 2026-10-17
### 📖 Documentation
- Re-recorded every README GIF on the current UI (result rows, the `Search Everywhere` title and the category buttons) and added one for categories.

## [0.2.0] - 2026-10-17
### ✨ Features
- **Clickable category buttons**: All and one button per category (`list-flat`, `symbol-class`, `symbol-method`, `files`; set your own with `icon` in `searchEverywhere.categories`) switch the category like `tab`, keeping the query text. On VS Code 1.109 and later they are toggles next to the input with the active one pressed, and keyboard focus moves to the results list after a click; on older versions they sit in the title bar with a check on the active one. The title changes from `[All] · Types · Members · Files   (Tab)` to `Search Everywhere` or `Search Everywhere · Types`.

## [0.1.0] - 2026-10-17
### 🐹☕ Comfortable on Go and Java Workspaces
- **Categories with `tab`**: `@@` Types (classes, enums, interfaces, structs), `!!` Members (methods, fields, properties, constructors, functions, variables, constants, enum members, events, operators) and `$$` Files. `tab` / `shift + tab` cycle All → Types → Members → Files, keeping the query text; the title shows `[All] · Types · Members · Files   (Tab)`. Configurable with `searchEverywhere.categories`.
- **Changed `!!`**: it used to mean functions only; it now means Members. `searchEverywhere.itemsFilterPhrases` defaults to `{}`, so `##` (strings) and `%%` (arrays) are gone unless you set them; a category wins when both use the same phrase. Filter-phrase tags such as `[@@ class]` are no longer added to descriptions.
- **Preview while browsing**: the highlighted result opens in a preview editor without taking focus; `escape` restores the editor and cursor you started from (`searchEverywhere.previewOnSelect`, default `true`).
- **Last query restored**: reopening puts the last workspace query back, selected (`searchEverywhere.restoreLastQuery`, default `true`). A non-empty editor selection still wins.
- **Go and Java names**: Go methods such as `(*Server).Start` are stored as `Start` with container `Server`, so `Server.Start` finds them; Java methods and constructors such as `save(User)` are stored as `save`, with the parameter list in the description.
- **Cleaner rows**: label is the name, description is `Container · kind` (plus the receiver or parameter list), and the second line is `path:line`.
- **Config and data files by name only**: `json`, `yaml`, `xml`, `properties`, `md`, `go.mod`, `.gradle`, `.sql` and similar files are indexed as files and never sent to a language server (`searchEverywhere.indexNamesOnly`).
- **Tests, mocks and generated code last**: files matching `searchEverywhere.secondaryCode` (`*_test.go`, `mock_*.go`, `*.pb.go`, `src/test/**`, `*.spec.ts`, …) rank after source code of the same match quality and are tagged `· test` or `· generated`. They are never hidden, and changing the setting does not reindex.
- **Language presets**: a `go.mod`/`go.work` or `pom.xml`/`build.gradle*`/`settings.gradle*` at a workspace folder root fills `include`, `exclude` and `itemsFilter.ignoredKinds` where you have not set them (`searchEverywhere.languagePresets`, default `auto`). The output channel logs the presets and effective patterns at index start, and adding or removing a marker file reindexes.
- **Waiting for each language server**: indexing opens one file per language and waits for its symbols (15 s, 120 s for Java and Kotlin). Files indexed without symbols while their server was still starting are retried every 30 s for 10 minutes. A language no installed extension provides (`.proto` without a protobuf extension) is not waited for. The fixed TypeScript/JSON/Markdown warm-up is gone.
- **One-time reindex**: the index schema moved to version 4. The first start after upgrading empties the cached index (including the shared worktree cache) and reindexes the workspace once. Recent items saved with the old labels no longer get the recency boost until opened again.

### 🐛 Fixes
- Fixed `searchEverywhere.shouldInitOnStartup` doing nothing: the extension only activated on its first command, so the workspace was never indexed at startup. It now activates once VS Code has finished starting (`onStartupFinished`) and indexes then when the setting is on. With the setting off it still waits for the first search, but it now tracks file changes from startup, so a cached index no longer misses edits made before that search.
- The README described `searchEverywhere.excludeVariables` as keeping constants; the TypeScript and JavaScript language server reports `const` as a variable, so those are excluded too.

## [0.0.3] - 2026-10-17
### 🐛 Fixes
- Fixed filter phrases (`$$`, `@@`, `!!`, `##`, `%%`) showing an empty list: VS Code hid every result because its label does not contain the phrase.

### 📖 Documentation
- Rewrote the README for this fork: install links, a quick start, a query syntax cheat sheet, current benchmark numbers and new GIFs for every feature.
- Corrected the documented settings: `searchEverywhere.showRecentItemsOnEmptyQuery` (was listed as `showRecentItemsOnEmpty`), the `searchEverywhere.shouldItemsBeSorted` default (`false`), and `searchEverywhere.excludeVariables`, which drops variables (kind 12) but not constants (kind 13).
- The `.vsix` no longer ships the README GIFs; the Marketplace page loads them from GitHub.

## [0.0.2] - 2026-10-17
### 🎨 New Logo
- A new icon: a search bar picking the fuzzy-matched letters out of noise. The Marketplace page header now uses the icon's dark colour.

## [0.0.1] - 2026-10-17
### 🕘 Recently Used Results First
- While typing, recently opened files and symbols, and open editor tabs, come first among results that match the query equally well (exact, prefix, substring, fuzzy). Typing `index` puts the `index.ts` you were just working in above the other `index.ts` files.
- Recency never beats a better match: an exact match you never opened stays above a recent prefix match.
- Added `searchEverywhere.rankRecentItemsHigher` (default `true`) to turn it off.
- No reindex is needed.

### 🎨 File Icon Theme Support
- Added `searchEverywhere.useFileIconTheme` (default `false`) to show file results with icons from the active VS Code file icon theme (e.g. Seti, Material Icon Theme). Symbols keep their built-in icons.
- Requires VS Code 1.108 or newer; older versions automatically fall back to the built-in icon.
- Toggling the setting applies immediately without re-indexing.
- Changed the default icons for functions (`variable-group` → `symbol-function`) and constructors (`symbol-ruler` → `symbol-constructor`) in `searchEverywhere.icons`.

### 🧭 Qualified-Name Search
- Search members by their container with `.`, `#` or `::`: `UserService.save`, `UserService#save`, `Outer::Inner::run`. A trailing separator (`UserService.`) lists every member.
- Path queries match the name after the last `/` inside the directory first (`src/models/User`, `models/User.find`), then fall back to the path match.
- Symbol descriptions show the full container chain (`Outer.Inner`) instead of only the immediate parent.
- The index gained a container column, so the first start after upgrading empties the cached index (including the shared worktree cache) and reindexes the workspace once.

### ✳️ Wildcard & Multi-Word Search
- Space-separated words match in any order: `impl user` and `service impl` both find `UserServiceImpl`. Every word must match; names with the words in order rank first.
- `*` matches any run of characters between two parts of a word, in order: `user*impl` finds `UserServiceImpl` but `impl*user` does not. A query of only `*` lists everything.
- When few names contain the words, the words are also matched as a subsequence (`user ctrl` finds `UserController`).
- Fixed `%` and `_` in a query, in `ignoredNames` and in file paths acting as SQL wildcards; they now match literally (`Item_1234` no longer matches `Item11234`).

### 🐫 CamelHumps Search
- A query with a capital after its first letter, or with `_` or `-` between its parts, matches each part against the start of a word, in order, skipping words in between: `USI`, `uSerImp` and `SerImp` find `UserServiceImpl`, `HTTPSer` finds `HTTPServer`, `MV` and `max_v` find `MAX_VALUE`. Matches that start at the first word rank first.
- An all-lowercase query of two or more characters also matches one letter per word: `usi` finds `UserServiceImpl`. This changes the ranking of lowercase queries: names whose initials match now come after prefix matches and before substring matches.
- CamelHumps matches rank after prefix matches and before substring matches. Results of a mixed-case or `_`/`-` query stay in the list even when VS Code's own filter would hide them.
- The index gained word and initials columns. The first start after upgrading fills them in from the stored names without reindexing; run `Search everywhere: Reload` if results written by an older version still look incomplete.

## [3.2.0] - 2026-10-05
### 🔍 In-File Scope Search, Split Editor & Remote Development Fixes
- **In-File Scope Search & Outline Navigation** (issue #45):
  - Added `searchEverywhere.searchCurrentFile` (`cmd+alt+o` on macOS / `ctrl+alt+o` on Windows/Linux) to immediately search symbols within the currently active editor file.
  - Drill-down navigation: seamlessly navigate from workspace search results into any file's symbol list via right-arrow icon button or `alt+right` (`searchEverywhere.navigateIntoFile`).
  - Navigate back anytime using the title bar Back button or `alt+left` (`searchEverywhere.navigateBack`), automatically restoring your previous workspace search query and position.
- **Open to the Side Command & Shortcut**:
  - Added `searchEverywhere.openToTheSide` to open highlighted symbols and files directly in a side-by-side split editor (`vscode.ViewColumn.Beside`).
  - Configurable default shortcuts: `cmd+enter` / `alt+enter` (macOS) and `ctrl+enter` / `alt+enter` (Windows/Linux), as well as a dedicated split preview icon button on each result item.
- **Remote Host Duplicate Tab Fix** (issue #46):
  - Fixed an issue where opening cached items in remote hosts (SSH, WSL, Dev Containers, Codespaces) resulted in new duplicate editor tabs being opened every time.
  - Replaced path string conversions with robust URI parsing (`ensureUri`), preserving remote schemes (`vscode-remote://`, `vscode-vfs://`, etc.) and authority across serialization and cache lookups.
  - Expanded `patternProvider` to properly support include/exclude pattern matching on remote and virtual filesystems.
- **Performance & Instant UI Rendering**:
  - Eliminated UI lag when drilling down into file scope by rendering cached SQLite symbols immediately (< 5 ms) and fetching updated Language Server symbols non-blockingly in the background.
  - Added dedicated SQLite B-tree indexes (`idx_symbols_uri_nocase`, `idx_symbols_uri_line_nocase`) ensuring instant O(log N) file-scoped symbol lookups without full table scans.

## [3.1.0] - 2026-10-05
### ⚡ Shared Worktree Cache, Recent Items & Enhanced Matching
- **Shared Repository Cache for Git Worktrees & Clones** (issue #54):
  - Automatically shares the SQLite database cache across git worktrees and local clones of the same repository (keyed by git remote URL or repository root).
  - Opening a new git worktree instantly uses the existing indexed database — zero cold-start indexing overhead.
  - Added setting `searchEverywhere.shareCacheAcrossWorktrees` (default `true`).
  - Added command `searchEverywhere.clearSharedCache` to explicitly clear shared worktree caches when needed.
- **Recent Items & Open Editors on Empty Search**:
  - Opening search with an empty query now displays recently opened symbols/files and currently active editor tabs first.
  - Deduped navigation with custom separators (`Recent Items`, `Open Editors`) for instant context switching, matching JetBrains / native Quick Open behavior.
  - Added settings `searchEverywhere.showRecentItemsOnEmpty` (default `true`) and `searchEverywhere.recentItemsLimit` (default `10`).
- **Clean Name Indexing & Fuzzy Symbol Matching** (issue #49):
  - Stripped prefixes/icons from database query comparisons (`cleanName`) and created dedicated case-insensitive SQLite B-Tree indexes.
  - Enhanced search accuracy and speed for fuzzy prefix matching and camelCase/snake_case symbols.
- **Zero-Dependency Debounce** (issue #53):
  - Replaced external `debounce` npm package with a custom, typed, zero-dependency debouncer implementation with full unit test coverage.
  - Unified search input and item loading debouncing into a single reactive event listener.
- **Dependency & Security Upgrades**:
  - Pulled in security updates for `minimist` (1.2.8) and `minimatch` (3.1.5), closing Dependabot PRs #38 and #39.
  - Safely updated `typescript` to 4.9.5, `@types/node` to 16.x, `@types/mocha` to 10.x, and `@types/chai` to 4.3.20.

## [3.0.0] - 2026-10-05
### 🚀 The Next-Gen Engine: SQLite WASM & Ultra-Fast Big-Repo Search
- **SQLite WASM Architecture**: Replaced in-memory JavaScript heap cache with an embedded SQLite WebAssembly engine (`sql.js`) backed by specialized B-Tree indexes.
- **Blazing Fast Performance**:
  - Sub-millisecond queries: Search response time reduced to **~0.20 ms** via index-covering queries (`idx_symbols_name_nocase`).
  - Instant LRU Query Cache: Repeat queries, backspaces, and prefix refinements execute in **0.00 ms**.
  - Search input debounce optimized from 200 ms to 50 ms for an ultra-responsive UI experience.
- **Massive Scalability & 95% RAM Reduction**:
  - Easily indexes and searches large enterprise workspaces with **over 2,000,000 symbols**.
  - Peak RAM consumption dropped from **> 1.5 GB down to < 80 MB** thanks to streaming batch indexing directly to SQLite in 2,500-symbol chunks.
  - Eliminated memory spikes and UI freezes caused by large JSON serializations in multi-project workspaces.
- **Real-Time Live Symbol Synchronization**:
  - Live change detection debounced to 300 ms with instantaneous workspace folder lookups (`0.00 ms`). Newly typed functions, classes, and variables appear in search results immediately without editor lag.
- **Fine-Grained AST Filtering**:
  - Added `searchEverywhere.excludeProperties` (default `true`) to strip millions of noisy object properties.
  - Added `searchEverywhere.excludeVariables` (default `false`) ensuring variables, constants, and React functional components remain fully searchable.
- **Multi-Root Workspace Support**:
  - Seamless indexing across multiple workspace folders with dynamic common path resolution on folder addition or removal.
- **Bug Fixes**:
  - Fixed `searchEverywhere.shouldItemsBeSorted` honoring alphabetical vs. categorized symbol order for empty queries.
  - Fixed dynamic reload of QuickPick results when toggling separator grouping.
  - Standardized all UI toasts, status bar notifications, and progress messages to English.
  - Optimized packaging: excluded benchmarks and test scripts, bundling only essential runtime files and `sql-wasm.wasm`.

## [2.1.0] - 2023-02-03
- Feat: ability to decide whether selection in the active editor is put in the search (#PR33)

## [2.0.2] - 2022-09-07
- Fix issue with invisible quick pick icons

## [2.0.0] - 2022-09-07
- Fully rewritten from class based to function based approach
- Test improvements
- Minimum version of vscode set to 1.64.0
- Feat: item icon to open it to the side
- Feat: dedicated output with logs related to triggered actions, scanned directories structure, etc.
- Feat: ability to decide whether the items should be sorted by type
- Feat: ability to cache the scanned workspaceData to as a result scan the workspace only once

## [1.2.2] - 2022-02-18
- Fixed issue related to not refreshing include patterns on configuration change

## [1.2.1] - 2021-12-09
- Renamed QuickPick kind property to symbolKind due to new vscode QuickPick API (version 1.63.0)
## [1.2.0] - 2021-08-16
- Added stats message (elapsed time, number of scanned files, number of indexed items) displayed after indexing the workspace
- Replaced fileWatcher events with workspace event listeners for files / folders manipulation which results in better performance and stability
## [1.1.0] - 2021-07-19
- Setting `searchEverywhere.shouldUseFilesAndSearchExclude` replaced with `searchEverywhere.excludeMode` allowing to choose source of exclude patterns: extension, files and search, gitignore
- Added debouncing for handleDidChangeTextDocument event callback
- Added caching for handleDidChangeTextDocument event callback to general increase performance
## [1.0.9] - 2021-05-24
- Fixed bug concerning loading items to not existing quick pick on handleDidProcessing callback. QuickPick initialization moved to handleWillProcessing callback,
- Fixed bug concerning updating list after removing whole folder with multiple files,
- Added distinguishing different path of projects in workspace if there is more than one.

## [1.0.8] - 2021-02-26
- Some internals have been rewritten to improve the stability.

## [1.0.5] - 2020-09-03
- Fixed bug with nested alternate groups in include glob pattern which are not allowed. Changed include type from string[] to string.

## [1.0.0] - 2020-07-09
- Initial release
