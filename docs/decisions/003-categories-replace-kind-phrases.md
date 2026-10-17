# 003: Categories of kinds replace one-kind filter phrases by default

Status: Accepted

## Decision

`searchEverywhere.categories` is an array of `{ name, phrase, kinds }`. A query that starts with a
category's phrase is limited to those kinds; `database.search` takes `symbolKinds?: number[]` and
adds the sorted list to the search cache key. The defaults are Types `@@` (class, enum, interface,
struct: 4, 9, 10, 22), Members `!!` (method, property, field, constructor, function, variable,
constant, enum member, event, operator: 5, 6, 7, 8, 11, 12, 13, 21, 23, 24) and Files `$$` (0).

`searchEverywhere.itemsFilterPhrases`, which maps a phrase to one kind, stays for users who want it
but defaults to `{}`. When a phrase is used by both, the category wins.

`tab` and `shift + tab` (commands `searchEverywhere.nextCategory` / `previousCategory`, active
while Search Everywhere is open and not scoped to a file) cycle All → each category → All by
replacing the leading phrase and keeping the rest of the query. The quick pick title lists the
categories with the active one in brackets: `[All] · Types · Members · Files   (Tab)`. The old
`[@@ class]` tag in each row's description is dropped.

## Rationale

One phrase per kind does not fit Go and Java. A Go type is a struct (22) or an interface (10),
never a class, so `@@` (class) found nothing in a Go workspace; and a Go or Java "function" a user
looks for is usually a method (5), which `!!` (function, 11) missed. Users think in groups — "a
type", "a member", "a file" — the way JetBrains' Search Everywhere tabs do. Adding more one-kind
phrases would make the user learn a phrase per language server's choice of kind.

Tab switching mirrors the JetBrains tabs without a custom UI: the quick pick has no tabs, so the
title shows where you are and the phrase in the query is the state. Keeping the phrase as the state
means typing `@@` and pressing `tab` give the same result, and the existing filter-phrase code path
(alwaysShow, help items) is reused.

Keeping `itemsFilterPhrases` (empty) instead of removing it lets existing configurations keep
working. Letting the category win on a shared phrase makes the new default predictable for a user
who copied the old default phrases into settings.

## Consequences

- `!!` changes meaning from functions to members, and `##` (strings) and `%%` (arrays) disappear
  unless set; the CHANGELOG calls this out.
- VS Code's quick input does not keep `tab`, so no `ctrl + tab` fallback was needed. If a future
  VS Code version claims `tab` in the quick input, the commands can be rebound.
- Category changes do not reindex; the filter is applied at query time.
