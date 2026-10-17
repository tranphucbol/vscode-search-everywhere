/** The connection and the change tracking every part of the database reads and writes. */
export const state = {
  db: undefined as any,
  seededFromTemplate: false,
  dirty: false,
  // The shared template is written far less often than the index, so it tracks its own changes.
  templateStale: false,
  // Bumped by markDirty; the git state recorded for the template is valid only for the rows it saw.
  changeEpoch: 0,
};

export function markDirty(): void {
  state.dirty = true;
  state.templateStale = true;
  state.changeEpoch++;
}
