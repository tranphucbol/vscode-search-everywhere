import { assert } from "chai";
import * as sinon from "sinon";
import * as vscode from "vscode";
import { dataService } from "../../dataService";
import { getTestSetups } from "../testSetup/dataService.testSetup";
import { getItem, getItems } from "../util/itemMockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("DataService", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("reload", () => {
    it("should fetchConfig method be invoked", () => {
      const [fetchConfigStub] = setups.reload.setupForFetchingConfig();
      dataService.reload();

      assert.equal(fetchConfigStub.calledOnce, true);
    });
  });

  describe("cancel", () => {
    it("should setCancelled method be invoked with true parameter", () => {
      const [setCancelledStub] = setups.cancel.setupForSettingCancelledFlag();
      dataService.cancel();

      assert.equal(setCancelledStub.calledOnce, true);
      assert.equal(setCancelledStub.calledWith(true), true);
    });
  });

  describe("fetchData", () => {
    it("should return workspace data when exclude patterns array is empty", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithEmptyExcludePatterns();
      const items = await dataService.fetchData();

      assert.equal(items.count, 4);
    });

    it("should return array of vscode.Uri or vscode.DocumentSymbol items with workspace data when exclude patterns array contains one element", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithSingleExcludePattern();
      const items = await dataService.fetchData();

      assert.equal(items.count, 4);
    });

    it("should return array of vscode.Uri or vscode.DocumentSymbol items with workspace data when exclude patterns array contains more than one element", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithMultipleExcludePatterns();
      const items = await dataService.fetchData();

      assert.equal(items.count, 4);
    });

    it("should utils.printErrorMessage method be invoked if error is thrown", async () => {
      const [printErrorMessageStub] =
        setups.fetchData.setupForPrintingErrorMessageWhenErrorThrown();
      await dataService.fetchData();

      assert.equal(printErrorMessageStub.calledOnce, true);
    });

    it("should return array of vscode.Uri items (given uris param is an array with items)", async () => {
      setups.fetchData.setupForReturningUriItemsWhenUrisParamProvided();
      const items = await dataService.fetchData(getItems());
      assert.equal(items.count, 4);
    });

    it("should try to get symbols for file when returned undefined", async () => {
      const [getSymbolsForUriStub] =
        setups.fetchData.setupForRetryingSymbolsFetchWhenUndefinedReturned();
      await dataService.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 1);
    });

    it("should return empty array of items with workspace data if fetching is canceled", async () => {
      setups.fetchData.setupForReturningEmptyArrayWhenFetchingCancelled();
      const items = await dataService.fetchData();

      assert.equal(items.count, 0);
    });

    it("should return array of items filtered by itemsFilter with defined allowed kinds", async () => {
      setups.fetchData.setupForFilteringItemsByAllowedKinds();
      const items = await dataService.fetchData();

      assert.equal(items.count, 1);
    });

    it("should return array of items filtered by itemsFilter with defined ignored kinds", async () => {
      setups.fetchData.setupForFilteringItemsByIgnoredKinds();
      const items = await dataService.fetchData();

      assert.equal(items.count, 1);
    });

    it("should return array of items filtered by itemsFilter with defined ignored names", async () => {
      setups.fetchData.setupForFilteringItemsByIgnoredNames();
      const items = await dataService.fetchData();

      assert.equal(items.count, 0);
    });

    it("should not include uri if already exists in elements", async () => {
      setups.fetchData.setupForExcludingExistingUrisFromElements();
      const items = await dataService.fetchData();

      assert.equal(items.count, 3);
    });
  });

  describe("indexNamesOnly", () => {
    const NAMES_ONLY = "**/*.{json,yaml}";

    it("should not ask for symbols of a names-only file", async () => {
      const { getSymbolsForUriStub, uris } =
        setups.indexNamesOnly.setupForNamesOnlyFiles(NAMES_ONLY);
      await dataService.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 1);
      assert.equal(getSymbolsForUriStub.firstCall.args[0], uris[1]);
    });

    it("should still index a names-only file by name", async () => {
      const { uris } =
        setups.indexNamesOnly.setupForNamesOnlyFiles(NAMES_ONLY);
      const workspaceData = await dataService.fetchData();

      const elements = workspaceData.items.get(uris[0].path)?.elements;
      assert.deepEqual(elements, [uris[0]]);
      assert.equal(workspaceData.count, 3);
    });

    it("should ask for symbols when indexNamesOnly is empty", async () => {
      const { getSymbolsForUriStub } =
        setups.indexNamesOnly.setupForNamesOnlyFiles("");
      await dataService.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 2);
    });
  });

  describe("warmupLanguageServers", () => {
    const uri = (path: string) => vscode.Uri.file(`/./fake/${path}`);
    const callsFor = (stub: sinon.SinonStub, target: vscode.Uri) =>
      stub.getCalls().filter((call) => call.args[1] === target).length;

    it("should warm up one sample per language", async () => {
      const uris = [
        uri("a.go"),
        uri("b.go"),
        uri("c.go"),
        uri("User.java"),
        uri("app.ts"),
        uri("view.tsx"),
        uri("config.json"),
      ];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup(uris, [
        "go",
        "java",
        "ts",
        "tsx",
      ]);
      await dataService.fetchData();

      const opened = openTextDocumentStub
        .getCalls()
        .map((call) => call.args[0].path);
      assert.sameMembers(opened, [
        uris[1].path,
        uris[3].path,
        uris[5].path,
      ]);
    });

    it("should wait longer for Java than for other languages", async () => {
      const goSample = uri("b.go");
      const javaSample = uri("B.java");
      const uris = [uri("a.go"), goSample, uri("A.java"), javaSample];
      const { executeCommandStub } = setups.warmup.setupForWarmup(uris, []);
      await dataService.fetchData();

      // one call per poll during warm-up plus one while indexing
      assert.equal(callsFor(executeCommandStub, goSample), 30 + 1);
      assert.equal(callsFor(executeCommandStub, javaSample), 240 + 1);
    });

    it("should report languages whose warm-up timed out", async () => {
      const goUris = [uri("a.go"), uri("b.go")];
      const uris = [...goUris, uri("app.ts"), uri("util.ts")];
      setups.warmup.setupForWarmup(uris, ["ts"]);
      const workspaceData = await dataService.fetchData();

      assert.deepEqual(workspaceData.urisToRetry, goUris);
    });

    it("should not sample names-only files", async () => {
      const uris = [
        uri("config.json"),
        uri("other.json"),
        uri("app.ts"),
        uri("util.ts"),
      ];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup(uris, [
        "ts",
      ]);
      const workspaceData = await dataService.fetchData();

      const opened = openTextDocumentStub
        .getCalls()
        .map((call) => call.args[0].path);
      assert.deepEqual(opened, [uris[3].path]);
      assert.isUndefined(workspaceData.urisToRetry);
    });

    it("should not wait for a language no extension provides", async () => {
      const protoSample = uri("b.proto");
      const uris = [uri("a.proto"), protoSample, uri("app.ts"), uri("util.ts")];
      const { executeCommandStub } = setups.warmup.setupForWarmup(
        uris,
        ["ts"],
        "**/*.json",
        ["proto"]
      );
      const workspaceData = await dataService.fetchData();

      // only the call while indexing
      assert.equal(callsFor(executeCommandStub, protoSample), 1);
      assert.isUndefined(workspaceData.urisToRetry);
    });

    it("should not warm up a language again once it is ready", async () => {
      const uris = [uri("app.ts"), uri("util.ts")];
      const { openTextDocumentStub } = setups.warmup.setupForWarmup(uris, [
        "ts",
      ]);
      await dataService.fetchData();
      await dataService.fetchData();

      assert.equal(openTextDocumentStub.callCount, 1);
    });
  });

  describe("getSymbolsForUri", () => {
    it("should keep the full ancestor chain in nested symbol names", async () => {
      setups.getSymbolsForUri.setupForNestedSymbols();
      const symbols = await dataService.getSymbolsForUri(
        vscode.Uri.file("/./fake/outer.ts")
      );

      assert.deepEqual(
        symbols!.map((symbol) => symbol.name),
        ["Outer", "Outer§&§Inner", "Outer.Inner§&§run"]
      );
    });
  });

  describe("isUriExistingInWorkspace", () => {
    it("should return true if uri exists in workspace", async () => {
      setups.isUriExistingInWorkspace.setupForReturningTrueWhenUriExists();

      const item = getItem();
      assert.equal(await dataService.isUriExistingInWorkspace(item), true);
    });

    it("should return false if uri does not exist in workspace", async () => {
      setups.isUriExistingInWorkspace.setupForReturningFalseWhenUriDoesNotExist();

      const item = getItem("./test/path/to/workspace");
      assert.equal(await dataService.isUriExistingInWorkspace(item), false);
    });
  });

  describe("getIsCancelled", () => {
    it("should return state of isCancelled flag", () => {
      dataService.setIsCancelled(true);
      assert.equal(dataService.getIsCancelled(), true);
    });
  });

  describe("fetchConfig", () => {
    it("should fetch items filter", () => {
      const itemsFilter = setups.fetchConfig.setupForFetchingItemsFilter();
      dataService.fetchConfig();
      assert.equal(dataService.getItemsFilter(), itemsFilter);
    });

    it("should patternProvider.fetchConfig method be invoked", () => {
      const [patternProviderFetchConfigStub] =
        setups.fetchConfig.setupForInvokingPatternProviderFetchConfig();
      dataService.fetchConfig();
      assert.equal(patternProviderFetchConfigStub.calledOnce, true);
    });
  });
});
