# 007: Language server results are shown live and never indexed

Status: Accepted

## Decision

The quick pick asks `vscode.executeWorkspaceSymbolProvider` for the cleaned query in two cases:

- the index is incomplete (not ready, rebuilding, or empty) and
  `searchEverywhere.searchLanguageServersWhileIndexing` is on: symbols in included workspace files
  that the index does not have yet are listed under `Not indexed yet`;
- the Include libraries toggle is on: symbols outside the included files (JDK, dependencies,
  `node_modules`, non-`file` URIs) are listed under `Libraries`.

The fetch runs 200 ms after the last keystroke, only for queries of two or more characters and
never in file scope. It times out after 3 s. Live items come after all index results, are deduped
against index items by URI, name, kind and line, and are never written to the index.

Include libraries is off every time the search opens. It is toggled with the search shortcut
while the search is open (`searchEverywhere.toggleIncludeLibraries`) or the library button in
the title.

## Rationale

The first index of a large workspace can take minutes, and blocking the quick pick until it
finishes left the extension unusable at the moment users first try it. The workspace symbol
providers already answer from the language servers' own indexes, so they can fill the gap.

Writing their answers into the index was rejected: workspace symbol results carry a location but
no full range or children, they are capped and ranked by each server, and library symbols would
grow the index by orders of magnitude and go stale with every dependency update. Keeping them live
means the index stays the single, exact record of the workspace files.

The toggle resets on open, like IntelliJ's "Include non-project items", because library results
are noisy and slower; a sticky setting would silently degrade every later search.

## Consequences

- Library coverage depends on each language server (jdtls covers the JDK and dependencies, gopls
  with `symbolScope: all`, the TypeScript server only what the project loads, and only with
  `typescript.workspaceSymbols.excludeLibrarySymbols: false`).
- Each keystroke with live results on adds one provider request, bounded by the delay, the
  sequence check that drops older answers, and the 3 s timeout.
- Live items are not grouped by kind and offer only "Open to the side" when they are libraries.
