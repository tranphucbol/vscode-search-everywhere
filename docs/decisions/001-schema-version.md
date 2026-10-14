# 001: Version the index schema with PRAGMA user_version

Status: Accepted

## Decision

The SQLite index records its schema version in `PRAGMA user_version` (`SCHEMA_VERSION` in
`src/database.ts`). When a database opens with an older version, `migrateSchema` adds any missing columns,
deletes every row, marks the database as not seeded from the template, and sets the new version. The
workspace is then reindexed as on a first start.

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

- Every bump of `SCHEMA_VERSION` costs existing users one full reindex, including databases copied from the
  shared worktree cache, which arrive with the old version and are cleared on open.
- Columns that can be derived from stored data may still be backfilled in SQL; bump the version only when
  rows cannot be repaired in place.
- The cleared database is logged, so a slow first start after an upgrade is explainable from the output.
