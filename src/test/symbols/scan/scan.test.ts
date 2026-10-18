import { assert } from "chai";
import * as vscode from "vscode";
import { itemsFilter } from "../../../symbols/items/itemsFilter";
import { scan } from "../../../symbols/scan/scan";
import { getTestSetups } from "./scan.testSetup";
import { getItems } from "../../util/itemMockFactory";
import { getWorkspaceData } from "../../util/mockFactory";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("Scan", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  beforeEach(() => setups.beforeEach());
  afterEach(() => setups.afterEach());

  describe("createWorkspaceData", () => {
    it("should create workspaceData object", () => {
      assert.deepEqual(scan.createWorkspaceData(), getWorkspaceData());
    });
  });

  describe("clearWorkspaceData", () => {
    it("should clear workspaceData object", () => {
      const workspaceData =
        setups.clearWorkspaceData.setupForClearingWorkspaceDataObject();

      scan.clearWorkspaceData(workspaceData);
      assert.equal(workspaceData.count, 0);
      assert.equal(workspaceData.items.size, 0);
    });
  });

  describe("reload", () => {
    it("should fetchConfig method be invoked", () => {
      const [fetchConfigStub] = setups.reload.setupForFetchingConfig();
      scan.reload();

      assert.equal(fetchConfigStub.calledOnce, true);
    });
  });

  describe("cancel", () => {
    it("should setCancelled method be invoked with true parameter", () => {
      const [setCancelledStub] = setups.cancel.setupForSettingCancelledFlag();
      scan.cancel();

      assert.equal(setCancelledStub.calledOnce, true);
      assert.equal(setCancelledStub.calledWith(true), true);
    });
  });

  describe("fetchData", () => {
    it("should return workspace data when exclude patterns array is empty", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithEmptyExcludePatterns();
      const items = await scan.fetchData();

      assert.equal(items.count, 4);
    });

    it("should return array of vscode.Uri or vscode.DocumentSymbol items with workspace data when exclude patterns array contains one element", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithSingleExcludePattern();
      const items = await scan.fetchData();

      assert.equal(items.count, 4);
    });

    it("should return array of vscode.Uri or vscode.DocumentSymbol items with workspace data when exclude patterns array contains more than one element", async () => {
      setups.fetchData.setupForReturningWorkspaceDataWithMultipleExcludePatterns();
      const items = await scan.fetchData();

      assert.equal(items.count, 4);
    });

    it("should messages.printErrorMessage method be invoked if error is thrown", async () => {
      const [printErrorMessageStub] =
        setups.fetchData.setupForPrintingErrorMessageWhenErrorThrown();
      await scan.fetchData();

      assert.equal(printErrorMessageStub.calledOnce, true);
    });

    it("should return array of vscode.Uri items (given uris param is an array with items)", async () => {
      setups.fetchData.setupForReturningUriItemsWhenUrisParamProvided();
      const items = await scan.fetchData(getItems());
      assert.equal(items.count, 4);
    });

    it("should try to get symbols for file when returned undefined", async () => {
      const [getSymbolsForUriStub] =
        setups.fetchData.setupForRetryingSymbolsFetchWhenUndefinedReturned();
      await scan.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 1);
    });

    it("should return empty array of items with workspace data if fetching is canceled", async () => {
      setups.fetchData.setupForReturningEmptyArrayWhenFetchingCancelled();
      const items = await scan.fetchData();

      assert.equal(items.count, 0);
    });

    it("should return array of items filtered by itemsFilter with defined allowed kinds", async () => {
      setups.fetchData.setupForFilteringItemsByAllowedKinds();
      const items = await scan.fetchData();

      assert.equal(items.count, 1);
    });

    it("should return array of items filtered by itemsFilter with defined ignored kinds", async () => {
      setups.fetchData.setupForFilteringItemsByIgnoredKinds();
      const items = await scan.fetchData();

      assert.equal(items.count, 1);
    });

    it("should return array of items filtered by itemsFilter with defined ignored names", async () => {
      setups.fetchData.setupForFilteringItemsByIgnoredNames();
      const items = await scan.fetchData();

      assert.equal(items.count, 0);
    });

    it("should not include uri if already exists in elements", async () => {
      setups.fetchData.setupForExcludingExistingUrisFromElements();
      const items = await scan.fetchData();

      assert.equal(items.count, 3);
    });
  });

  describe("indexNamesOnly", () => {
    const NAMES_ONLY = "**/*.{json,yaml}";

    it("should not ask for symbols of a names-only file", async () => {
      const { getSymbolsForUriStub, uris } =
        setups.indexNamesOnly.setupForNamesOnlyFiles(NAMES_ONLY);
      await scan.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 1);
      assert.equal(getSymbolsForUriStub.firstCall.args[0], uris[1]);
    });

    it("should still index a names-only file by name", async () => {
      const { uris } =
        setups.indexNamesOnly.setupForNamesOnlyFiles(NAMES_ONLY);
      const workspaceData = await scan.fetchData();

      const elements = workspaceData.items.get(uris[0].path)?.elements;
      assert.deepEqual(elements, [uris[0]]);
      assert.equal(workspaceData.count, 3);
    });

    it("should ask for symbols when indexNamesOnly is empty", async () => {
      const { getSymbolsForUriStub } =
        setups.indexNamesOnly.setupForNamesOnlyFiles("");
      await scan.fetchData();

      assert.equal(getSymbolsForUriStub.callCount, 2);
    });
  });

  describe("urisToRetry", () => {
    it("should list files of languages whose warm-up timed out", async () => {
      const goFile = vscode.Uri.file("/./fake/a.go");
      const tsFile = vscode.Uri.file("/./fake/app.ts");
      setups.urisToRetry.setupForTimedOutLanguages(["go"]);
      const workspaceData = await scan.fetchData([goFile, tsFile]);

      assert.deepEqual(workspaceData.urisToRetry, [goFile]);
    });
  });

  describe("getIsCancelled", () => {
    it("should return state of isCancelled flag", () => {
      scan.setIsCancelled(true);
      assert.equal(scan.getIsCancelled(), true);
    });
  });

  describe("fetchConfig", () => {
    it("should fetch items filter", () => {
      const filter = setups.fetchConfig.setupForFetchingItemsFilter();
      scan.fetchConfig();
      assert.equal(itemsFilter.getItemsFilter(), filter);
    });

    it("should patternProvider.fetchConfig method be invoked", () => {
      const [patternProviderFetchConfigStub] =
        setups.fetchConfig.setupForInvokingPatternProviderFetchConfig();
      scan.fetchConfig();
      assert.equal(patternProviderFetchConfigStub.calledOnce, true);
    });
  });
});
