# Scenarios

Steps and expected results on the `acme-shop` sample with default settings (17 files, 77 items),
recorded with VS Code 1.142 and its built-in TypeScript server. `SE` is the driver function from
`SKILL.md`. Rows are written as `label  description`; the path line is left out unless it matters.

Treat the first rows and their order as the contract. Rows further down may shift when the
ranking changes on purpose; say so when they do.

## Contents

- [Sample layout](#sample-layout)
- [Query syntax](#query-syntax)
- [Filter phrases](#filter-phrases)
- [Ranking and recent items](#ranking-and-recent-items)
- [Opening items](#opening-items)
- [File scope](#file-scope)
- [Incremental indexing](#incremental-indexing)
- [Startup](#startup)
- [Indexing settings](#indexing-settings)
- [Notifications and debounce](#notifications-and-debounce)
- [Caching and the shared worktree cache](#caching-and-the-shared-worktree-cache)
- [Display settings](#display-settings)

## Sample layout

```
src/index.ts                     main()
src/admin/index.ts               bootstrapAdmin()
src/billing/index.ts             bootstrapBilling()
src/config/constants.ts          MAX_VALUE (line 1), DEFAULT_TIMEOUT, API_PREFIX, MAX_RETRIES
src/models/User.ts               class User (1-17): email (property, line 5), find (8-10), save (12), rename
src/models/Order.ts              enum OrderStatus (Cancelled at line 7), class Order: pay (15-17), cancel (19-21)
src/models/Product.ts            class Product
src/services/UserService.ts      interface UserService: findById, save (line 5), remove
src/services/UserServiceImpl.ts  class UserServiceImpl (5-22): findById, save (12-17, variable attempt), remove
src/services/OrderService.ts     class OrderService: place, findByOwner (10-12), callbacks, totalRevenue
src/controllers/UserController.ts, OrderController.ts
src/http/HTTPServer.ts           class HTTPServer (3-17)
src/http/middleware.ts           requestCount (variable), logRequest()
src/utils/strings.ts             capitalize(), EMPTY_STRING
src/utils/dates.ts               addDays()
src/generated/Schema.ts          interface GeneratedSchema; listed in .gitignore
```

`--big` adds `src/modules/<domain><n>/<Name>Service.ts` (400 by default: 417 files, 2,477 items),
e.g. `Payment1Service.ts`, `Payment2Service.ts`.

## Query syntax

| Query | First rows |
|---|---|
| `USI` (CamelHumps) | `UserServiceImpl.ts  [$$UserServiceImpl.ts] File`, `UserServiceImpl  [@@UserServiceImpl] Class at lines: 5 - 22`, then `UserService.ts`, `UserService` interface |
| `usi` (lowercase initials) | `UserServiceImpl.ts`, `UserServiceImpl` class |
| `HTTPSer` | `HTTPServer.ts`, `HTTPServer  Class at lines: 3 - 17` |
| `MV`, `max_v` | `MAX_VALUE  Variable at line: 1` (TypeScript reports `const` as a variable) |
| `UserService.` (trailing separator) | `UserService.ts`, `UserService` interface, then its members `save`, `remove`, `findById`, then the members of `UserServiceImpl` |
| `UserService.save` | `save  Method at line: 5 in UserService`, then `save  Method at lines: 12 - 17 in UserServiceImpl` |
| `Order#cancel` | `cancel  Method at lines: 19 - 21 in Order`, then `Cancelled  Variable at line: 7 in OrderStatus` |
| `models/User` (directory + name) | `User.ts`, `User  Class at lines: 1 - 17`, `find  Method at lines: 8 - 10 in User`, `save  Method at line: 12 in User` |
| `models/User.find` | `find  Method at lines: 8 - 10 in User` only |
| `impl user` (words in any order) | `UserServiceImpl.ts`, `UserServiceImpl` class |
| `user*ctrl` (wildcard) | `UserController.ts`, `UserController  Class at lines: 3 - 13` |
| `user ctrl` (subsequence fallback) | same as `user*ctrl` |

`ctrl*user` and `impl*user` must find nothing: `*` keeps the order.

## Filter phrases

| Query | Expected |
|---|---|
| `?` | Five help rows: `? Type $$ for limit results to File only`, then `@@` Class, `!!` Function, `##` String, `%%` Array |
| `@@` | Every class, and nothing else |
| `@@order` | Exactly `Order`, `OrderService`, `OrderController` classes. An empty list here is the 0.0.3 bug (items not `alwaysShow`) |
| `$$user` | Files only, exactly these four: `User.ts`, `UserService.ts`, `UserController.ts`, `UserServiceImpl.ts`. Their order follows the recent items, so check the set, not the order |
| `!!` | Functions only: `addDays`, `bootstrapAdmin`, `bootstrapBilling`, `capitalize`, … |
| `##`, `%%` | `(no rows)`: the sample has no string or array symbols |

The phrase tag (`[@@Order]`) in the description is how VS Code matches the label filter; every
row of a phrase query carries it.

## Categories

On VS Code 1.109 and later the category buttons are inline toggles; the pressed one is in
brackets.

```sh
SE search "order"                # title "Search Everywhere",
                                 # inline buttons: [All · Tab], Types (@@) · Tab, Members (!!) · Tab, Files ($$) · Tab
SE click "Types (@@) · Tab"      # query "@@order", title "Search Everywhere · Types", [Types (@@) · Tab]
SE click "Types (@@) · Tab"      # stays on Types: the active button keeps its pressed state
SE search "@@order"              # puts focus back in the input
SE key Tab                       # query "!!order", title "Search Everywhere · Members", [Members (!!) · Tab]
SE click "All · Tab"             # query "order", title "Search Everywhere", [All · Tab]
SE key Alt+ArrowRight            # on a file row: title "Search in …", buttons: Back (⌃-) only
SE key Alt+ArrowLeft             # title and inline buttons are back
```

After a click focus is on the results list, so `SE key Tab` there moves into the row's buttons
instead of cycling, and `SE type` does not reach the query; run `SE search` first. With
`SE set shouldUseItemsFilterPhrases=false` there is no title and no category button.

## Ranking and recent items

```sh
SE open src/billing/index.ts
SE open src/services/OrderService.ts
SE search ""       # -- Recent -- first, then open editors: the files just opened are listed
SE search "index"  # 1. index.ts /src/billing/index.ts, then /src/index.ts, /src/admin/index.ts
```

On a fresh start (nothing opened) `index` lists `/src/billing/index.ts` first, so to see the
boost open another one: after `SE open src/admin/index.ts`, `index` lists `/src/admin/index.ts`
first. With `SE set rankRecentItemsHigher=false` recency no longer counts; the three `index.ts`
rows then come in the index's own order, which can happen to match, so read `SE log` rather than
the order alone.
`showRecentItemsOnEmptyQuery=false` makes the empty query list nothing recent;
`recentItemsLimit` caps the `Recent` group.

`shouldItemsBeSorted=true` groups rows by kind (files, then classes, …) instead of pure
relevance.

## Opening items

When `SE key Enter` closes the quick pick it prints the workbench state itself, so a separate
`SE state` is only needed after other actions.

| Steps | Check with `SE state` |
|---|---|
| `SE search "HTTPServer.ts:13"`, `SE key Enter` | `HTTPServer.ts` active, `cursor: Ln 13, Col 1` |
| `SE search "UserServiceImpl.ts:13:12"`, `SE key Enter` | `cursor: Ln 13, Col 12` |
| `SE search "findByOwner"`, `SE key Enter` | `OrderService.ts` active, `cursor: Ln 10, Col 3`: the start of the symbol, no selection |
| `SE set shouldHighlightSymbol=true`, same search, `SE key Enter` | `cursor: Ln 12, Col 4 (113 selected)`: the symbol's range is selected |
| `SE open src/services/UserService.ts`, `SE search "UserServiceImpl"`, `SE key Meta+Enter` | `editor groups: 2`, group 2 `[UserServiceImpl.ts]` |

`Alt+Enter` also opens to the side. The focused file row lists the buttons
`Search symbols in this file, Open to the side`; symbol rows only `Open to the side`.

With `shouldSearchSelection=true` (default), text selected in the editor is put into the query
when Search Everywhere opens.

## File scope

```sh
SE search "OrderService"
SE key Alt+ArrowRight   # title "Search in OrderService.ts", only button "Back (⌃-)",
                        # rows OrderService, place, findByOwner, callbacks, totalRevenue
SE type "find"          # findByOwner only
SE key Alt+ArrowLeft    # back to the workspace search with the query "OrderService",
                        # title "Search Everywhere" and the category buttons
```

`Alt+ArrowRight` works on a file row only (`when: searchEverywhereOpen &&
!searchEverywhereInFileScope`); `Alt+ArrowLeft` only inside a file scope.

Search in Current File:

```sh
SE open src/models/Order.ts
SE search --file "pay"  # title "Search in Order.ts", pay  Method at lines: 15 - 17
SE key Enter            # cursor: Ln 15, Col 3; with shouldHighlightSymbol=true: Ln 17, Col 4 (53 selected)
```

With no editor open, Search in Current File opens nothing; the driver fails with
"Alt+Meta+O did not open a quick pick".

## Incremental indexing

The extension follows VS Code's events (`onDidCreateFiles`, `onDidRenameFiles`, `onDidDeleteFiles`,
`onDidChangeTextDocument`, `onDidSaveTextDocument`), not the disk. Make every change through VS
Code; `SE log` then shows `Execute action - type: Update ... trigger: DidCreateFiles` (or
`DidRenameFiles`, `DidDeleteFiles`, `DidChangeTextDocument`).

Create:

```sh
SE command "File: New Untitled Text File"
SE text 'export class RefundService { refund(): void {} }'
SE key Meta+S                    # the simple Save As dialog, a quick input
SE key Meta+A
SE text /tmp/se-lt/acme-shop/src/services/RefundService.ts
SE key Enter
SE search "RefundService"        # RefundService.ts and the RefundService class
```

Edit: open a file, put the cursor where you want (`SE key Meta+End`), `SE text` the new code,
`SE key Meta+S`; the new symbol is searchable.

Rename:

```sh
SE open src/services/RefundService.ts
SE command "File: Reveal Active File in Explorer View"
SE key Enter                     # rename in the Explorer is Enter on macOS, not F2
SE key Meta+A
SE text RefundPolicy.ts
SE key Enter
SE search "RefundPolicy"         # the new path; RefundService.ts is gone
```

Delete:

```sh
SE open src/admin/index.ts
SE command "File: Reveal Active File in Explorer View"
SE key Meta+Backspace            # dialog "Are you sure you want to delete 'index.ts'?"
SE state                         # dialog buttons; Enter confirms
SE key Enter
SE search "bootstrapAdmin"       # (no rows)
```

A file written from the shell (`echo > src/x.ts`) is not indexed until
`SE command "Search everywhere: Reload"`; that is expected.

## Startup

| Steps | `SE log` shows |
|---|---|
| `SE start --no-activate`, `sleep 8` | `has been activated`, then `type: Rebuild ... trigger: Startup` and the scan line, with no command run |
| `SE start --no-activate --setting shouldInitOnStartup=false`, `sleep 8` | `has been activated` only; the first `SE search` then logs `trigger: Search` |

Up to 0.0.3 the extension activated on its first command only, so the first row showed no
activation at all.

## Indexing settings

Changing any `searchEverywhere.*` setting except the display ones (`shouldDisplayNotificationInStatusBar`,
`shouldInitOnStartup`, `shouldHighlightSymbol`, `shouldUseDebounce`, `shouldItemsBeSorted`,
`shouldWorkspaceDataBeCached`, `shouldSearchSelection`, `useFileIconTheme`) rebuilds the index by
itself (`indexing/sources/settingsEvents.ts`). Wait about 3 s after `SE set`, then `SE state` prints the new
`last index:` counts; `SE command "Search everywhere: Reload"` does the same and waits for it.

```sh
SE set excludeMode=gitignore
SE command "Search everywhere: Reload"   # index ready: ... scanned files: 16 | indexed items: 75
SE search "Schema"                       # (no rows); with the default mode Schema.ts is found
```

| Setting | Reload result | Check |
|---|---|---|
| default | 17 files, 77 items | |
| `excludeMode=gitignore` | 16 files, 75 items | `Schema` finds nothing |
| `excludeProperties=false` | 94 items | `email` finds `email  Property at line: 5 in User` |
| `excludeVariables=true` | 65 items | `requestCount`, `MAX_VALUE`, `EMPTY_STRING` find nothing |
| `itemsFilter={"ignoredKinds":[5]}` (methods) | 57 items | `save` finds nothing |
| `itemsFilter={"ignoredNames":["Order"]}` | 70 items | `Order` finds nothing: every name containing `Order` is dropped, files included |
| `include="**/*.ts"`, `exclude=[...]` | counts change accordingly | |

Put `itemsFilter` in single quotes so the shell keeps the JSON. Restore with
`SE set 'itemsFilter={"allowedKinds":[],"ignoredKinds":[],"ignoredNames":[]}'`, or `SE stop` and
start again.

## Notifications and debounce

Use the big sample so indexing is slow enough to see:

```sh
SE start --big
SE command "Search everywhere: Reload"
# seen while indexing:
#   - toast: Indexing workspace... file: 58 / 417 ... 14%
#   - toast: Elapsed time: 1s Scanned files: 417 Indexed items: 2477
SE set shouldDisplayNotificationInStatusBar=true
SE command "Search everywhere: Reload"
# seen while indexing:
#   - status: Indexing...: 47 / 417 ... 11%
#   - toast: Elapsed time: ...
```

Debounce (`shouldUseDebounce`, 50 ms) is visible only as timing: `SE search "paymentservice"` lists
`Payment1Service.ts`, `Payment2Service.ts`, … either way; the driver can't tell the two apart.
Check debounce changes with unit tests.

## Caching and the shared worktree cache

Caching across restarts:

```sh
SE start --setting shouldWorkspaceDataBeCached=true
SE restart --no-compile          # index ready: loaded from cache (no rebuild ran)
```

Without the setting, `restart` ends with a new `Workspace scan completed` line.

Shared worktree cache:

```sh
SE start --git --setting shouldWorkspaceDataBeCached=true --setting shareCacheAcrossWorktrees=true
sleep 3                          # the repository template is written ~2 s after indexing
git -C /tmp/se-lt/acme-shop worktree add -q /tmp/se-lt/acme-shop-wt2
SE restart --no-compile --workspace /tmp/se-lt/acme-shop-wt2
SE log | grep -i seeded          # Seeded database from shared repository template (fingerprint: …)
                                 # and restart says: loaded from cache (no rebuild ran)
```

The template lives in
`/tmp/se-lt/user-data/User/globalStorage/tranphucbol.jetbrain-search-everywhere/repo-<fingerprint>.db`.
`SE command "Search everywhere: Clear Shared Worktree Cache"` deletes it. Quitting within 2 s of
indexing leaves no template, and the worktree then rebuilds; wait first.

## Display settings

| Setting | Check |
|---|---|
| `useFileIconTheme=true` | file rows show `[file-icon-theme:typescript]` instead of `[symbol-file]`; symbols keep their codicons. Applies without reload |
| `icons={"4":"star"}` | class rows show `[star]`; kinds left out of the map have no icon |
| `itemsFilterPhrases={"4":"cls:"}` | `cls:order` filters classes; the description tag becomes `[cls:Order]` |
| `helpPhrase=h?` | `h?` lists the help rows |

For layout or colour, `SE shot <label>` and look at the image.
