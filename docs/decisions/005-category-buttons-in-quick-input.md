# 005: Category buttons are native quick input buttons

Status: Accepted

## Decision

The quick pick shows an All button and one button per `searchEverywhere.categories` entry, in
setting order, whenever filter phrases are on and at least one category exists. Clicking a button
does what `tab` does: it replaces the leading category phrase in the query and keeps the rest.
Clicking the active button keeps it active. The category stays in the query text, as ADR 003
decided; ADR 003 still holds, except that the title no longer lists the categories in brackets.
It is now `Search Everywhere` or `Search Everywhere · <category>`.

The buttons are `QuickInputButton`s:

- On VS Code 1.109 and later (`utils.supportsQuickInputButtonToggle()`) they use
  `location: Inline` (2) and `toggle: { checked }`, and exactly one is checked. `location` and
  `toggle` are declared on `CategoryButton` in `src/types.ts` because `@types/vscode` is pinned to
  1.64.
- Before 1.109 they are plain title-bar buttons, and the active one shows the `check` icon in place
  of its own.

Each category can set a codicon `icon`; a missing or invalid one shows `filter`. In file scope the
title is `Search in <file>` and the only button is Back; leaving file scope restores the category
buttons.

After a category click on 1.109 and later the extension runs `workbench.action.focusQuickOpen`,
which moves keyboard focus to the results list.

## Rationale

JetBrains shows categories as tabs above the input. VS Code's quick pick has no tabs, so the
options were:

- A webview: it can draw real tabs but means rebuilding the quick pick, its fuzzy highlighting,
  keyboard handling and theming, and losing the native look.
- Pseudo-tab rows or separators at the top of the list: they scroll with the results, take the
  first rows that should hold the best match, and are reached with the arrow keys like any item.
- Quick input buttons: native, themed, keyboard-independent, and on 1.109 and later able to show a
  pressed state next to the input, which is the closest thing to a tab strip.

A verification spike on VS Code 1.142.0 confirmed that inline toggles render next to the input,
that `onDidTriggerButton` fires for them (with `toggle.checked` already flipped by VS Code), that
reassigning `control.buttons` in the handler redraws the checked state so the buttons act as a
radio group, and that `tab` still reaches `searchEverywhere.nextCategory`. `Inline` was chosen over
`Input` because inline buttons sit beside the input instead of inside it, where they would compete
with the typed query.

Keeping the category in the query text means a click, `tab` and typing `@@` all produce the same
state, and no second source of truth can disagree with the query.

## Consequences

- Clicking an inline toggle moves keyboard focus to the toggle, and the extension API cannot focus
  the input. Left there, typed characters were lost, `enter` and arrows acted on the toggles, and
  `alt + arrow right` closed the quick pick. The extension therefore moves focus to the results
  list, where arrows, `enter` and `alt + arrow` keys work; `tab` from the list goes into the row's
  buttons, and typing needs a click on the input. Title-bar buttons before 1.109 keep focus in the
  input. If VS Code adds a way to focus the input, the focus command can be replaced.
- The title format changed; anything matching on the old bracketed title must be updated.
- `updateTitle` runs on every keystroke and only rebuilds the buttons when the title changes, or
  when a click on the active button has to put back the toggle VS Code unchecked.
