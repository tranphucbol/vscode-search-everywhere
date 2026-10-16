import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import * as cache from "../../cache";
import { recentItems } from "../../recentItems";
import { QuickPickItem } from "../../types";

describe("RecentItems", () => {
  let fakeState: Map<string, any>;
  let mockContext: vscode.ExtensionContext;

  beforeEach(() => {
    fakeState = new Map();
    mockContext = {
      workspaceState: {
        get: (key: string) => fakeState.get(key),
        update: (key: string, value: any) => {
          fakeState.set(key, value);
          return Promise.resolve();
        },
      },
    } as any;
    cache.initCache(mockContext);
  });

  afterEach(() => {
    sinon.restore();
  });

  const stubOpenEditors = (uris: vscode.Uri[]) => {
    sinon
      .stub(vscode.window, "tabGroups" as any)
      .get(() => ({ all: [{ tabs: uris.map((uri) => ({ input: { uri } })) }] }));
  };

  it("should add item and retrieve it via getRecentItems", () => {
    const item: QuickPickItem = {
      label: "MapService",
      description: "Class at line: 1",
      detail: "src/mapService.ts",
      uri: vscode.Uri.file("/test/src/mapService.ts"),
      symbolKind: 5,
      range: {
        start: new vscode.Position(1, 0),
        end: new vscode.Position(10, 0),
      },
    };

    recentItems.addRecentItem(item);
    const retrieved = recentItems.getRecentItems(10);
    assert.equal(retrieved.length, 1);
    assert.equal(retrieved[0].label, "MapService");
    assert.equal(retrieved[0].symbolKind, 5);
  });

  it("should move existing item to the top of MRU on re-addition", () => {
    const item1: QuickPickItem = {
      label: "Item1",
      uri: vscode.Uri.file("/test/item1.ts"),
      symbolKind: 0,
    };
    const item2: QuickPickItem = {
      label: "Item2",
      uri: vscode.Uri.file("/test/item2.ts"),
      symbolKind: 0,
    };

    recentItems.addRecentItem(item1);
    recentItems.addRecentItem(item2);
    // Now item2 is index 0, item1 is index 1
    recentItems.addRecentItem(item1);
    // Now item1 should be moved back to index 0

    const retrieved = recentItems.getRecentItems(10);
    assert.equal(retrieved.length, 2);
    assert.equal(retrieved[0].label, "Item1");
    assert.equal(retrieved[1].label, "Item2");
  });

  it("should treat labels with and without icon prefix as the same item", () => {
    const uri = vscode.Uri.file("/test/item1.ts");
    recentItems.addRecentItem({
      label: "$(symbol-file)  item1.ts",
      uri,
      symbolKind: 0,
    });
    recentItems.addRecentItem({ label: "item1.ts", uri, symbolKind: 0 });

    const stored = cache.getRecentItems<any>();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].label, "item1.ts");
  });

  it("should ignore separator and help items", () => {
    const separatorItem: QuickPickItem = {
      label: "Recent",
      kind: vscode.QuickPickItemKind.Separator,
      uri: vscode.Uri.parse("#"),
      symbolKind: -1,
    };
    const helpItem: QuickPickItem = {
      label: "Help",
      isHelp: true,
      uri: vscode.Uri.parse("#"),
      symbolKind: 0,
    };

    recentItems.addRecentItem(separatorItem);
    recentItems.addRecentItem(helpItem);

    const retrieved = recentItems.getRecentItems(10);
    assert.equal(retrieved.length, 0);
  });

  it("should respect limit when retrieving recent items", () => {
    for (let i = 0; i < 10; i++) {
      recentItems.addRecentItem({
        label: `File${i}.ts`,
        uri: vscode.Uri.file(`/test/file${i}.ts`),
        symbolKind: 0,
      });
    }

    const retrieved = recentItems.getRecentItems(3);
    assert.equal(retrieved.length, 3);
  });

  it("should clear recent items on clearRecentItems", () => {
    recentItems.addRecentItem({
      label: "File.ts",
      uri: vscode.Uri.file("/test/file.ts"),
      symbolKind: 0,
    });

    assert.equal(recentItems.getRecentItems(10).length, 1);
    recentItems.clearRecentItems();
    assert.equal(recentItems.getRecentItems(10).length, 0);
  });

  it("should return recent keys from history before open editors", () => {
    const symbolUri = vscode.Uri.file("/test/src/mapService.ts");
    const openUri = vscode.Uri.file("/test/src/open.ts");
    recentItems.addRecentItem({ label: "MapService", uri: symbolUri, symbolKind: 5 });
    stubOpenEditors([openUri]);

    assert.deepEqual(recentItems.getRecentKeys(), [
      { uri: symbolUri.toString(), symbolKind: 5, name: "MapService" },
      { uri: openUri.toString(), symbolKind: 0, name: "open.ts" },
    ]);
  });

  it("should return recent keys with the icon prefix removed from the name", () => {
    recentItems.addRecentItem({
      label: "$(symbol-class)  MapService",
      uri: vscode.Uri.file("/test/src/mapService.ts"),
      symbolKind: 5,
    });
    stubOpenEditors([]);

    assert.equal(recentItems.getRecentKeys()[0].name, "MapService");
  });

  it("should not repeat an open editor already in the history", () => {
    const uri = vscode.Uri.file("/test/src/open.ts");
    recentItems.addRecentItem({ label: "$(file)  open.ts", uri, symbolKind: 0 });
    stubOpenEditors([uri, uri]);

    assert.deepEqual(recentItems.getRecentKeys(), [
      { uri: uri.toString(), symbolKind: 0, name: "open.ts" },
    ]);
  });

  it("should stop recent keys at the limit", () => {
    for (let i = 0; i < 5; i++) {
      recentItems.addRecentItem({
        label: `File${i}.ts`,
        uri: vscode.Uri.file(`/test/file${i}.ts`),
        symbolKind: 0,
      });
    }
    stubOpenEditors([vscode.Uri.file("/test/open.ts")]);

    const keys = recentItems.getRecentKeys(3);
    assert.deepEqual(
      keys.map((key) => key.name),
      ["File4.ts", "File3.ts", "File2.ts"]
    );
    assert.equal(recentItems.getRecentKeys(6).length, 6);
  });
});
