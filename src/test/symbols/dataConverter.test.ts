import { assert } from "chai";
import * as vscode from "vscode";
import { dataConverter, normalizeSymbolName } from "../../symbols/dataConverter";
import { QuickPickItem } from "../../shared/types";
import { getTestSetups } from "./dataConverter.testSetup";
import {
  getDocumentSymbolItemWithDocComment,
  getDocumentSymbolItemWithSelectionOutsideRange,
  getSymbolInformation,
} from "../util/itemMockFactory";
import { flattenSymbols, loadSymbolFixture } from "../util/symbolFixtures";

type SetupsType = ReturnType<typeof getTestSetups>;

describe("DataConverter", () => {
  let setups: SetupsType;

  before(() => {
    setups = getTestSetups();
  });
  afterEach(() => setups.afterEach());

  describe("reload", () => {
    it("should fetchConfig method be invoked", () => {
      const [fetchConfigStub] = setups.reload.setupForFetchingConfig();
      dataConverter.reload();

      assert.equal(fetchConfigStub.calledOnce, true);
    });
  });

  describe("cancel", () => {
    it("should setCancelled method be invoked with true parameter", () => {
      const [setCancelledStub] = setups.cancel.setupForSettingCancelledFlag();
      dataConverter.cancel();

      assert.equal(setCancelledStub.calledOnce, true);
      assert.equal(setCancelledStub.calledWith(true), true);
    });
  });

  describe("convertToQpData", () => {
    it("should return quick pick data - without icons and filter phrases", () => {
      const { workspaceData, qpItems } =
        setups.convertToQpData.setupForConvertingWithoutIconsAndFilterPhrases();
      assert.deepEqual(dataConverter.convertToQpData(workspaceData), qpItems);
    });

    it("should return quick pick data - with icons and filter phrases", () => {
      const { workspaceData, qpItems } =
        setups.convertToQpData.setupForConvertingWithIconsAndFilterPhrases();
      assert.deepEqual(dataConverter.convertToQpData(workspaceData), qpItems);
    });

    it("should return empty array", () => {
      const { workspaceData, qpItems } =
        setups.convertToQpData.setupForReturningEmptyArray();
      assert.deepEqual(dataConverter.convertToQpData(workspaceData), qpItems);
    });

    it("should return empty array if isCancelled equal to true", () => {
      const { workspaceData, qpItems } =
        setups.convertToQpData.setupForReturningEmptyArrayWhenCancelled();
      assert.deepEqual(dataConverter.convertToQpData(workspaceData), qpItems);
    });
  });

  describe("convertUriAndSymbolsToQpItems", () => {
    it("should set containerName and description from the ancestor chain", () => {
      const { uri, nestedSymbol } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        nestedSymbol,
      ]);

      assert.equal(item.label, "run");
      assert.equal(item.containerName, "Outer.Inner");
      assert.equal(item.description, "Outer.Inner · method");
    });

    it("should fall back to SymbolInformation containerName", () => {
      const { uri, symbolInformation } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        symbolInformation,
      ]);

      assert.equal(item.label, "save");
      assert.equal(item.containerName, "UserService");
      assert.equal(item.description, "UserService · method");
    });

    it("should leave containerName unset for files", () => {
      const { uri } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [fileItem] = dataConverter.convertUriAndSymbolsToQpItems(uri);

      assert.equal(fileItem.symbolKind, 0);
      assert.isFalse("containerName" in fileItem);
    });

    it("should set namePosition from the symbol's selectionRange", () => {
      const { uri } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        getDocumentSymbolItemWithDocComment(),
      ]);

      assert.deepEqual(item.namePosition, new vscode.Position(12, 4));
      assert.deepEqual(item.range, {
        start: new vscode.Position(10, 2),
        end: new vscode.Position(16, 3),
      });
    });

    it("should print the name's line in the detail", () => {
      const { uri } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        getDocumentSymbolItemWithDocComment(),
      ]);

      assert.match(item.detail!, /:13$/);
    });

    it("should leave namePosition unset when selectionRange lies outside range", () => {
      const { uri } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        getDocumentSymbolItemWithSelectionOutsideRange(),
      ]);

      assert.isFalse("namePosition" in item);
      assert.match(item.detail!, /:11$/);
    });

    it("should leave namePosition unset for SymbolInformation", () => {
      const { uri, symbolInformation } =
        setups.convertUriAndSymbolsToQpItems.setupForConvertingSymbols();
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(uri, [
        symbolInformation,
      ]);

      assert.isFalse("namePosition" in item);
    });
  });

  describe("Go and Java symbol names", () => {
    const goUri = vscode.Uri.file("/./fake/server.go");
    const javaUri = vscode.Uri.file("/./fake/UserService.java");
    const goItems = () =>
      dataConverter.convertUriAndSymbolsToQpItems(
        goUri,
        flattenSymbols(loadSymbolFixture("gopls-server.json"))
      );
    const javaItems = () =>
      dataConverter.convertUriAndSymbolsToQpItems(
        javaUri,
        flattenSymbols(loadSymbolFixture("jdtls-user-service.json"))
      );
    const nameOf = (item: QuickPickItem) =>
      item.label.replace(/^\$\([^)]+\)\s+/, "");
    const find = (items: QuickPickItem[], name: string, kind: number) => {
      const item = items.find(
        (it) => nameOf(it) === name && it.symbolKind === kind
      );
      assert.isDefined(item, `${name} (kind ${kind}) not found`);
      return item!;
    };
    const assertRow = (
      item: QuickPickItem,
      container: string | undefined,
      description: string
    ) => {
      assert.equal(item.containerName, container);
      assert.equal(item.description, description);
    };

    it("should split a Go pointer receiver into container and name", () => {
      const item = find(goItems(), "Start", vscode.SymbolKind.Method);
      assertRow(item, "Server", "(*Server) · method");
    });

    it("should split a Go value receiver into container and name", () => {
      const item = find(goItems(), "Validate", vscode.SymbolKind.Method);
      assertRow(item, "Config", "(Config) · method");
    });

    it("should split a Go generic receiver into container and name", () => {
      const item = find(goItems(), "Push", vscode.SymbolKind.Method);
      assertRow(item, "List", "(*List[T]) · method");
    });

    it("should drop a parameter list from a method name", () => {
      const items = javaItems();
      assertRow(
        find(items, "save", vscode.SymbolKind.Method),
        "UserService",
        "UserService · method (User)"
      );
      assertRow(
        find(items, "findAll", vscode.SymbolKind.Method),
        "UserService",
        "UserService · method ()"
      );
      assertRow(
        find(items, "convert", vscode.SymbolKind.Method),
        "UserService",
        "UserService · method (User, Class<T>) <T>"
      );
    });

    it("should drop a parameter list from a constructor name", () => {
      const item = find(javaItems(), "UserService", vscode.SymbolKind.Constructor);
      assertRow(item, "UserService", "UserService · constructor (Repo)");
    });

    it("should keep a container from the parent over one from the name", () => {
      const symbol = new vscode.DocumentSymbol(
        `Outer${dataConverter.getSplitter()}(*Server).Start`,
        "",
        vscode.SymbolKind.Method,
        new vscode.Range(0, 0, 1, 0),
        new vscode.Range(0, 0, 0, 5)
      );
      const [, item] = dataConverter.convertUriAndSymbolsToQpItems(goUri, [
        symbol,
      ]);
      assert.equal(nameOf(item), "Start");
      assert.equal(item.containerName, "Outer");
    });

    it("should leave other names unchanged", () => {
      const goRows = goItems();
      assertRow(find(goRows, "NewServer", vscode.SymbolKind.Function), undefined, "function");
      assertRow(find(goRows, "Admin", vscode.SymbolKind.Field), "Config", "Config · field");
      assertRow(find(goRows, "MaxConns", vscode.SymbolKind.Constant), undefined, "constant");
      assertRow(find(javaItems(), "ACTIVE", vscode.SymbolKind.EnumMember), "UserService.Status", "UserService.Status · enum member");
    });

    it("should put the path and 1-based line in the detail", () => {
      const item = find(goItems(), "Start", vscode.SymbolKind.Method);
      assert.match(item.detail!, /fake\/server\.go:20$/);
    });

    it("should describe a file row as file", () => {
      const [fileItem] = goItems();
      assert.equal(nameOf(fileItem), "server.go");
      assert.equal(fileItem.description, "file");
      assert.match(fileItem.detail!, /fake\/server\.go$/);
    });

    it("should leave a parenthesised name of another kind unchanged", () => {
      assert.deepEqual(
        normalizeSymbolName("(*Server).Start", vscode.SymbolKind.Field),
        { name: "(*Server).Start" }
      );
      assert.deepEqual(
        normalizeSymbolName("save(User)", vscode.SymbolKind.Variable),
        { name: "save(User)" }
      );
    });
  });

  describe("mapSymbolInformationToQpItem", () => {
    const nameOf = (item: QuickPickItem) =>
      item.label.replace(/^\$\([^)]+\)\s+/, "");

    it("should map a SymbolInformation like an indexed symbol", () => {
      const symbol = getSymbolInformation(
        "save(User)",
        vscode.Uri.file("/./fake/UserService.java"),
        vscode.SymbolKind.Method,
        "UserService",
        11
      );

      const item = dataConverter.mapSymbolInformationToQpItem(symbol);

      assert.equal(nameOf(item), "save");
      assert.equal(item.symbolKind, vscode.SymbolKind.Method);
      assert.equal(item.containerName, "UserService");
      assert.equal(item.description, "UserService · method (User)");
      assert.equal(item.uri.toString(), symbol.location.uri.toString());
      assert.equal(item.range!.start.line, 11);
      assert.match(item.detail!, /fake\/UserService\.java:12$/);
    });

    it("should normalize a Go receiver method from SymbolInformation", () => {
      const symbol = getSymbolInformation(
        "(*Server).Start",
        vscode.Uri.file("/./fake/server.go"),
        vscode.SymbolKind.Method,
        "server"
      );

      const item = dataConverter.mapSymbolInformationToQpItem(symbol);

      assert.equal(nameOf(item), "Start");
      assert.equal(item.description, "(*Server) · method");
    });
  });

  describe("getSplitter", () => {
    it("should return splitter string", () => {
      assert.equal(dataConverter.getSplitter(), "§&§");
    });
  });

  describe("fetchConfig", () => {
    it("should fetch icons", () => {
      const icons = setups.fetchConfig.setupForFetchingIcons();
      dataConverter.fetchConfig();
      assert.equal(dataConverter.getIcons(), icons);
    });

    it("should fetch shouldUseItemsFilterPhrases flag", () => {
      const shouldUseItemsFilterPhrases =
        setups.fetchConfig.setupForFetchingShouldUseItemsFilterPhrasesFlag();
      dataConverter.fetchConfig();
      assert.equal(
        dataConverter.getShouldUseItemsFilterPhrases(),
        shouldUseItemsFilterPhrases
      );
    });

    it("should fetch items filter phrases", () => {
      const itemsFilterPhrases =
        setups.fetchConfig.setupForFetchingItemsFilterPhrases();
      dataConverter.fetchConfig();
      assert.equal(dataConverter.getItemsFilterPhrases(), itemsFilterPhrases);
    });
  });
});
