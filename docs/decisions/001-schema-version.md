# 001: Version the index schema with PRAGMA user_version

Status: Accepted

## Decision

The SQLite index records its schema version in `PRAGMA user_version` (`SCHEMA_VERSION` in
`src/database.ts`). When a database opens with an older version, `migrateSchema` adds any missing columns,
deletes every row, marks the database as not seeded from the template, and sets the new version. The
workspace is then reindexed as on a first start.

Amended for version 2: the word columns `clean_words` and `clean_initials` derive from `name` and
`symbol_kind`, so a version 1 database keeps its rows and `migrateSchema` backfills the new columns in
place. Only the step from version 0 still clears the index.

Amended for version 3: Go receiver methods (`(*Server).Start`) and Java names with a parameter list
(`save(User)`) are stored as the bare name with the receiver or type as container, and every row's
description and detail change format. The raw names were never stored, so the rows cannot be rewritten
in place: a version 2 database is cleared and reindexed once.

Amended for version 4: `is_secondary` marks rows of test, mock and generated files
(`searchEverywhere.secondaryCode`, see 004). It derives from the uri alone, so a version 3 database keeps
its rows and `migrateSchema` backfills the column with one `UPDATE` per distinct uri. The same update
runs when the setting changes, without a reindex.

## Rationale

Columns added before (`clean_name`, `clean_stem`) were introduced with a `try/catch` around
`ALTER TABLE ... ADD COLUMN` and backfilled with SQL from columns already in the table. `clean_container`
cannot be backfilled that way: its source, the symbol's `containerName`, was never stored. Without a version,
an upgraded index would keep empty containers, and qualified-name search would silently miss every symbol
indexed before the upgrade.

A reindex rebuilds every derived column from the language servers, so it is correct for any future column
too. A version number makes the decision explicit and runs it once, instead of inferring the schema from
which `ALTER` statements failed.

## Consequences

- A bump that clears rows costs existing users one full reindex, including databases copied from the
  shared worktree cache, which arrive with the old version and are cleared on open.
- Bump the version to run a one-time migration; rows that can be derived from stored columns are
  backfilled, the rest are cleared and reindexed.
- The cleared database is logged, so a slow first start after an upgrade is explainable from the output.
