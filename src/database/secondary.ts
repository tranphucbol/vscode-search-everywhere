import * as vscode from "vscode";
import { matchesGlob } from "../shared/glob";
import { workspaceFolders } from "../shared/workspaceFolders";
import { state } from "./state";

export const enum Secondary {
  None = 0,
  Test = 1,
  Generated = 2,
}

const TEST_GLOB = /test|spec/i;

export function classifySecondary(uriPath: string, globs: string[]): Secondary {
  const relativePath = workspaceFolders.normalizeUriPath(uriPath);
  let secondary = Secondary.None;
  for (const glob of globs) {
    if (matchesGlob(relativePath, glob)) {
      if (TEST_GLOB.test(glob)) {
        return Secondary.Test;
      }
      secondary = Secondary.Generated;
    }
  }
  return secondary;
}

export function updateSecondaryColumn(globs: string[]): void {
  const result = state.db.exec("SELECT DISTINCT uri FROM symbols");
  const uris: string[] = result && result.length ? result[0].values.map((row: any[]) => row[0]) : [];
  if (!uris.length) {
    return;
  }
  state.db.run("BEGIN TRANSACTION");
  const stmt = state.db.prepare(
    "UPDATE symbols SET is_secondary = ? WHERE uri = ? AND is_secondary IS NOT ?"
  );
  try {
    for (const uri of uris) {
      let uriPath: string;
      try {
        uriPath = vscode.Uri.parse(uri).path;
      } catch {
        uriPath = uri;
      }
      const secondary = classifySecondary(uriPath, globs);
      stmt.run([secondary, uri, secondary]);
    }
    stmt.free();
    state.db.run("COMMIT");
  } catch (e) {
    stmt.free();
    state.db.run("ROLLBACK");
    throw e;
  }
}
