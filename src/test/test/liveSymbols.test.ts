import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import {
  LIVE_SYMBOLS_LIMIT,
  LIVE_SYMBOLS_TIMEOUT_MS,
  liveSymbols,
} from "../../liveSymbols";
import { logger } from "../../logger";
import { QuickPickItem } from "../../types";
import { getTestSetups } from "../testSetup/liveSymbols.testSetup";
import {
  getExcludedSymbolInformation,
  getOutsideSymbolInformation,
  getSymbolInformation,
  getWorkspaceSymbolInformation,
} from "../util/itemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

const nameOf = (item: QuickPickItem) => liveSymbols.getName(item);

describe("LiveSymbols", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  beforeEach(() => setups.beforeEach());
  afterEach(() => setups.afterEach());

  const query = (overrides: Partial<Parameters<typeof liveSymbols.fetchLiveSymbols>[0]> = {}) =>
    liveSymbols.fetchLiveSymbols({
      query: "us",
      includeWorkspace: true,
      includeLibraries: true,
      ...overrides,
    });

  describe("fetchLiveSymbols", () => {
    it("should classify a symbol in an included workspace file as live", async () => {
      setups.stubProviders([getWorkspaceSymbolInformation()]);

      const [item] = await query();

      assert.equal(item.source, "live");
      assert.equal(nameOf(item), "UserService");
      assert.notInclude(item.description, "library");
    });

    it("should classify a symbol under an excluded folder as library", async () => {
      setups.stubProviders([getExcludedSymbolInformation()]);

      const [item] = await query();

      assert.equal(item.source, "library");
      assert.match(item.description!, / · library$/);
    });

    it("should classify a symbol with a non-file uri as library", async () => {
      setups.stubProviders([getOutsideSymbolInformation()]);

      const [item] = await query();

      assert.equal(item.source, "library");
      assert.equal(item.description, "java.util · class · library");
    });

    it("should drop library symbols when includeLibraries is off", async () => {
      setups.stubProviders([
        getOutsideSymbolInformation(),
        getWorkspaceSymbolInformation(),
        getExcludedSymbolInformation(),
      ]);

      const items = await query({ includeLibraries: false });

      assert.deepEqual(items.map(nameOf), ["UserService"]);
    });

    it("should drop workspace symbols when includeWorkspace is off", async () => {
      setups.stubProviders([
        getWorkspaceSymbolInformation(),
        getOutsideSymbolInformation(),
      ]);

      const items = await query({ includeWorkspace: false });

      assert.deepEqual(items.map(nameOf), ["ArrayList"]);
    });

    it("should drop symbols whose kind is outside the requested kinds", async () => {
      setups.stubProviders([
        getWorkspaceSymbolInformation("UserService", vscode.SymbolKind.Class),
        getWorkspaceSymbolInformation("useState", vscode.SymbolKind.Function),
      ]);

      const items = await query({ symbolKinds: [vscode.SymbolKind.Class] });

      assert.deepEqual(items.map(nameOf), ["UserService"]);
    });

    it("should apply the items filter like index rows", async () => {
      setups.stubProviders(
        [
          getWorkspaceSymbolInformation("UserService", vscode.SymbolKind.Class),
          getWorkspaceSymbolInformation("userDemo", vscode.SymbolKind.Class),
          getWorkspaceSymbolInformation("user", vscode.SymbolKind.Variable),
        ],
        { ignoredKinds: [vscode.SymbolKind.Variable], ignoredNames: ["demo"] }
      );

      const items = await query();

      assert.deepEqual(items.map(nameOf), ["UserService"]);
    });

    it("should rank an exact name before a prefix before the rest", async () => {
      setups.stubProviders([
        getWorkspaceSymbolInformation("AbstractUser"),
        getWorkspaceSymbolInformation("UserService"),
        getWorkspaceSymbolInformation("BaseUser"),
        getWorkspaceSymbolInformation("user"),
        getWorkspaceSymbolInformation("UserRepository"),
      ]);

      const items = await query({ query: "User" });

      assert.deepEqual(items.map(nameOf), [
        "user",
        "UserService",
        "UserRepository",
        "AbstractUser",
        "BaseUser",
      ]);
    });

    it("should cap the results at the live symbols limit", async () => {
      const uri = vscode.Uri.file("/workspace/src/many.ts");
      setups.stubProviders(
        Array.from({ length: LIVE_SYMBOLS_LIMIT + 50 }, (_, index) =>
          getSymbolInformation(`User${index}`, uri, vscode.SymbolKind.Class, "", index)
        )
      );

      const items = await query();

      assert.equal(items.length, LIVE_SYMBOLS_LIMIT);
    });

    it("should return no results when the providers time out", async () => {
      setups.stubProviders(new Promise<never>(() => {}));
      const clock = setups.useFakeTimers();

      const pending = query();
      await clock.tickAsync(LIVE_SYMBOLS_TIMEOUT_MS);
      const items = await pending;
      const secondPending = query();
      await clock.tickAsync(LIVE_SYMBOLS_TIMEOUT_MS);
      await secondPending;

      assert.deepEqual(items, []);
      assert.equal((logger.log as sinon.SinonStub).callCount, 1);
    });
  });
});
