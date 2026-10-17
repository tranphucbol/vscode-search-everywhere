# 006: Keep the Index in Sync with the Disk by mtime and Size

Status: Accepted

## Decision

The index records each indexed file's modification time and size in a `file_state` table (schema
5). A file counts as changed when either value differs from the stored one.

- On startup a cached index is reconciled with the disk in the background: files listed by the
  include and exclude patterns are stat'ed 32 at a time and compared with `file_state`. New and
  changed files are queued as updates, stored files no longer listed as removals.
- While VS Code runs, two file system watchers catch changes made outside it: one on the include
  glob for creates and changes, one on `**/*` for deletes, so that deleting a directory also
  reports the directory itself. Events are batched and processed 500 ms after the last one. An
  event is dropped when its path fails the include or exclude patterns, when the file is open in an
  editor (the text document events own it), or, for a change, when mtime and size equal the stored
  state. A batch of more than 1000 events after filtering runs one reconcile instead.
- When more than `max(2000, 25 %)` of the indexed files are new or changed, the workspace is
  indexed in full instead of file by file.
- A worktree seeded from the shared cache reindexes the union of `git diff <template commit> HEAD`,
  its own `git status` and the template's dirty paths, then records fresh file states without
  reindexing. A template without a commit is dropped and the worktree indexed in full.

## Rationale

The index used to follow only VS Code's own events, so `git checkout`, `git pull`, generators and
anything done while VS Code was closed left stale or missing results until a manual reload.

- **mtime and size instead of a content hash**: a stat is one system call and needs no file read;
  hashing a large workspace on every startup would cost as much I/O as a scan. A rewrite that keeps
  both size and mtime is rare enough to accept, and the next edit corrects it.
- **Filtering watcher events**: VS Code reports every save as a file change too. Without the
  open-document and unchanged-state filters each save would index the file twice, and the
  watcher would race the text document events that already handle it.
- **Full-index threshold**: per-file updates go through the action queue one at a time, while a
  full index batches inserts and runs language servers with a worker pool. Past a quarter of the
  workspace, or a branch switch touching thousands of files, a full index is faster and leaves the
  database compact. The 2000-file floor keeps small workspaces on the per-file path.
- **Git delta for seeded worktrees**: the template is written at some commit in another worktree.
  Only files differing between the two commits, or uncommitted in either worktree, can differ from
  the template, so a diff is exact and much cheaper than stat'ing against foreign mtimes.

## Consequences

- An index migrated from schema 4 is kept: the first reconcile stores a baseline without
  reindexing, so a change made before the upgrade is picked up only when that file changes again.
- Startup does a stat per included file in the background; the quick pick is usable meanwhile.
- `searchEverywhere.watchFileSystem` turns the watchers off for workspaces where watching is
  costly; the startup reconcile still runs.
- A worktree seeded from a template written by an older version is indexed in full once.
