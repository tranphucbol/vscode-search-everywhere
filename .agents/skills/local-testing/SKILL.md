---
name: local-testing
description: Test a change to this extension in a real VS Code. Launches VS Code with the extension under development on a generated TypeScript sample (acme-shop), drives Search Everywhere from the shell, and prints the quick pick rows, editor state, notifications and the extension log as text. Use after changing src/ and before calling the change done, when asked to "test it locally", "try it in VS Code", "run the extension", "check it in a real VS Code", "smoke test", or to reproduce a bug a user reported in the quick pick. macOS only.
---

# Local testing

`npm test` runs the modules against stubs. It can't see what a user sees: VS Code's own filtering
of the quick pick, keybindings and their `when` contexts, the TypeScript language server's
symbols, notifications, file-scope navigation, file events. The 0.0.3 filter-phrase bug passed
every unit test while the real quick pick hid all results. This skill closes that gap.

Everything goes through one driver, `scripts/se.js`. Each call connects to a running VS Code over
the Chrome debugging port, does one thing, prints what is on screen as text, and exits. You act,
read, decide, act again.

## Workflow

Run from the repository root. `SE` below stands for
`node .agents/skills/local-testing/scripts/se.js`. The shell is zsh, which doesn't split a
variable into words, so define a function in each shell call instead of `SE="node …"`:

```sh
SE() { node .agents/skills/local-testing/scripts/se.js "$@"; }
```

For the same reason, write each call out with its arguments quoted (`SE search "impl user"`);
a loop over strings like `'search USI'` hands `SE` one argument and prints the usage.

1. **Start.** `SE start` compiles (`npm run compile`), writes the sample to `/tmp/se-lt/acme-shop`,
   launches VS Code on it with a fresh profile, opens Search Everywhere once to activate the
   extension, and waits until the index is built. It ends with a line like
   `index ready: Workspace scan completed - ... scanned files: 17 | indexed items: 77`.
   Settings for the run go on the command line: `SE start --setting shouldHighlightSymbol=true`.
2. **Act and read.** `SE search "USI"` prints the rows; `SE key Enter` opens the selected one;
   `SE state` shows the editor, cursor and notifications. See the commands below.
3. **Check against the expected result.** `reference/scenarios.md` lists, per feature, the
   steps and the rows that must appear on the sample. Run the scenarios your change touches plus
   the smoke set.
4. **Change code, then restart.** VS Code runs `dist/`, not `src/`. After editing, `SE restart`
   recompiles and relaunches the same instance (same profile, settings and workspace).
5. **Stop.** `SE stop` quits VS Code and deletes `/tmp/se-lt`. Always stop before you finish.

Run `npm run compile` and `npm test` as usual; this skill comes on top, not instead.

### Smoke set

Run these after any change to `src/`, whatever it touched. One `start` and one `stop` cover the
whole session: run the scenarios for your change between the smoke steps and `SE stop`.

```sh
SE start
SE search "USI"            # UserServiceImpl.ts, then the UserServiceImpl class
SE search "@@order"        # only the classes Order, OrderService, OrderController
SE search "OrderService"
SE key Alt+ArrowRight      # title "Search in OrderService.ts", its symbols
SE key Alt+ArrowLeft       # back to the "OrderService" query
SE stop
```

## Commands

| Command | Does |
|---|---|
| `start [--big [N]] [--git] [--setting key=value]... [--workspace <dir>] [--no-compile] [--no-activate]` | Compile, write the sample, launch, activate, wait for the index. `--big` adds 400 generated modules (417 files, 2,477 items) for progress, debounce and notifications. `--git` makes the sample a git repository with a worktree at `acme-shop-wt`. `--workspace` opens your own folder instead of the sample |
| `restart [--no-compile] [--no-activate] [--workspace <dir>]` | Quit gracefully and relaunch the same instance. `--workspace` reopens the same profile on another folder |
| `search "<query>" [--file]` | Open Search Everywhere (`--file`: Search in Current File), type the query, print the rows |
| `type "<text>"` | Replace the text in the open quick pick, print the rows |
| `key <key>...` | Press keys, then print the quick pick or the workbench state. Playwright names: `Enter`, `Escape`, `ArrowDown`, `Alt+ArrowRight`, `Meta+Enter`, `Meta+S` |
| `click "<tooltip>"` | Click the quick input button (title bar, inline or in the input) whose tooltip is exactly this, then print the rows: `click "Types (@@) · Tab"`, `click "Back (⌃-)"` |
| `text "<text>"` | Type into whatever has focus: an editor, a rename box, a save dialog |
| `open <relative path>` | Open a sample file through Quick Open, e.g. `open src/models/Order.ts` |
| `command "<palette title>"` | Run a Command Palette entry by its exact title. For `Search everywhere: Reload` it also prints the progress seen while indexing and waits for the scan to finish |
| `set key=value...` | Change user settings in the running instance. A key without a dot gets the `searchEverywhere.` prefix; values are parsed as JSON, else taken as strings: `set excludeMode=gitignore 'itemsFilter={"ignoredKinds":[5]}'` |
| `state` | Editor groups and tabs, cursor (`Ln 17, Col 4 (53 selected)`), dialogs, notifications, status bar, quick pick |
| `log [--exthost] [--all]` | Last 80 lines of the `Search everywhere` output channel (or the extension host log) |
| `shot [label]` | Save a screenshot and print its path; for layout and icon checks only |
| `stop [--keep]` | Quit VS Code and delete the profile and sample (`--keep` leaves them) |

`--id <name>` (or `SE_ID`) runs several instances side by side, each under `/tmp/se-<name>`.
Every command takes 2–3 seconds; `start` takes about 6 (`--big` about 10).

### Reading the output

```
quick pick: "USI"
>  1. UserServiceImpl.ts  [$$UserServiceImpl.ts] File  [symbol-file]
        /src/services/UserServiceImpl.ts
        buttons: Search symbols in this file, Open to the side
   2. UserServiceImpl  [@@UserServiceImpl] Class at lines: 5 - 22  [symbol-class]
  (only rendered rows are listed; scroll with key PageDown for more)
```

- The header line lists the quick input's own buttons by tooltip: `buttons:` in the title bar,
  `inline buttons:` to the right of the input, `input buttons:` inside it. A pressed toggle is in
  brackets: `inline buttons: [All · Tab], Types (@@) · Tab, Members (!!) · Tab, Files ($$) · Tab`.
- `>` marks the focused row, the one `Enter` opens. Buttons are listed for the focused row only.
- After the label: the description (filter-phrase tag and kind with lines), then the icon.
  The indented line is the detail (path).
- A group label such as `Recent` appears on the first row of its group only.
- The rows are printed once the list has stopped changing and the progress bar is gone, so
  `(no rows)` means the quick pick really shows nothing.
- Only rendered rows are printed; the list is virtual. Narrow the query rather than scroll.

## The sample

`scripts/make-sample.js` writes `acme-shop`, a small TypeScript project whose names exercise every
query form: `UserServiceImpl`, `UserService.save`, `Order#cancel`, `OrderStatus`, `HTTPServer`,
`MAX_VALUE`, `models/User.find`, `admin/index.ts` next to `billing/index.ts`, and line 13 of
`UserServiceImpl.ts` and `HTTPServer.ts`. `src/generated/Schema.ts` is listed in `.gitignore` for the
`gitignore` exclude mode. `start` writes 20 files; the default include pattern indexes the 17
`.ts` files (not `package.json`, `tsconfig.json`, `.gitignore`), with 77 items. The full list of names
and expected results is in `reference/scenarios.md`; read the sample files under
`/tmp/se-lt/acme-shop/src` when you need exact lines.

To test against something else, `SE start --workspace <dir>`. The sample is never written into
the repository.

## Gotchas

- **`dist/` is what runs.** Restart after every source change. `start` and `restart` compile
  unless `--no-compile`; a compile error stops them.
- **Fresh profile, no cache.** Each `start` uses a new profile with
  `shouldWorkspaceDataBeCached` and `shareCacheAcrossWorktrees` off, so the index is always rebuilt
  from the sample. Turn them on with `--setting` to test caching (see the scenarios).
- **`start` opens Search Everywhere once.** The extension activates when VS Code finishes
  starting (`onStartupFinished`) and indexes then only with `shouldInitOnStartup` (on in the
  driver's settings); opening the quick pick makes every start end with a ready index. To test
  startup behaviour itself, `SE start --no-activate [--setting shouldInitOnStartup=false]`,
  wait a few seconds, then `SE log`: `trigger: Startup` means it indexed without a command.
- **Changes made from the shell arrive after a delay.** A file system watcher batches them and
  indexes about 0.5 s after the last one; wait 1.5 s before searching. Files under excluded
  paths (`node_modules`) are ignored, and `set watchFileSystem=false` turns the watcher off. To
  test changes made while VS Code is closed, `set shouldWorkspaceDataBeCached=true`, `stop --keep`,
  change files, then `restart --no-compile`; `log` shows `Reconciled with disk: +A ~C -R`.
- **VS Code filters the quick pick by label itself.** When rows the database returned don't show,
  check whether the items need `alwaysShow`; that was the filter-phrase bug. `log` shows what the
  extension did.
- **Most settings rebuild the index.** Changing a `searchEverywhere.*` setting other than the
  display ones (highlight, debounce, sorting, notifications, selection, file icon theme, caching,
  init on startup) reindexes the workspace by itself. Wait ~3 s after `set` before searching, or
  run `command "Search everywhere: Reload"`, which waits for the scan.
- **Caching needs a graceful quit.** `restart` and `stop` press `Meta+Q` so the database is
  written. If VS Code doesn't quit (unsaved file, open dialog) the driver kills it and says so;
  the cache from that run is then lost. The shared worktree template is written about 2 s after
  indexing; wait before quitting when testing it.
- **Toasts.** Notifications stay visible; `state` prints them. `command "Search everywhere:
  Reload"` samples them while indexing because the progress toast disappears when it ends.
- **TypeScript reports `const` as a variable** (kind 12), not a constant, so `MAX_VALUE` shows as
  `Variable` and `excludeVariables` removes it.
- **Keys are macOS keys.** `Meta` is Cmd. The driver is macOS only.
- **Clicking a toggle button moves focus out of the input.** VS Code focuses an inline or
  in-input toggle when it is clicked; the extension then moves focus to the result list after
  a category button click. Either way `SE type` and `SE text` do not change the query; run
  `SE search` again to put focus back in the input. From the list, arrows, Enter and
  Alt+Arrow keys work, but Tab moves into the row's buttons instead of switching category.
  A title-bar button leaves focus in the input. This is what a user gets too.
- **Screenshots get a new path each time** because image viewers cache by path.

## When something fails

- `start` fails with "indexing did not finish within 180s": `SE log` and `SE log --exthost` show
  activation errors; `/tmp/se-lt/code.log` has VS Code's own output.
- "no running instance": the instance was stopped or crashed; `SE start` again.
- "instance is already running": a previous run wasn't stopped; `SE stop`, then start.
- Quick Open or the palette picked the wrong entry: the driver prints the rows it saw and fails;
  use the exact title shown there.
- VS Code binary: `$VSCODE_EXECUTABLE`, else `/Applications/Visual Studio Code.app`, else the newest
  build `npm test` downloaded into `.vscode-test/`.
