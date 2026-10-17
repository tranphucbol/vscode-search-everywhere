import * as sinon from "sinon";
import * as vscode from "vscode";
import { dataConverter } from "../../dataConverter";
import { dataService } from "../../dataService";
import { QuickPickItem } from "../../types";
import { utils } from "../../utils";

const JAVA_TEXT = [
  "/* Copyright Acme */",
  "package com.acme.user;",
  "",
  "public class UserService {",
  "  public void save(User user) {}",
  "}",
].join("\n");

const JAVA_TEXT_WITHOUT_PACKAGE = [
  "public class UserService {",
  "  public void save(User user) {}",
  "}",
].join("\n");

const GO_TEXT = [
  "// Package api serves the public API.",
  "package api",
  "",
  "func NewServer() *Server { return &Server{} }",
  "",
  "func (s *Server) Start() error { return nil }",
].join("\n");

const TYPESCRIPT_TEXT = [
  "export class UserService {",
  "  save(user: User) {}",
  "}",
].join("\n");

function getSymbol(
  name: string,
  kind: vscode.SymbolKind,
  line: number
): vscode.DocumentSymbol {
  const range = new vscode.Range(line, 0, line + 1, 0);
  return new vscode.DocumentSymbol(name, "", kind, range, range);
}

function nested(parent: string, name: string): string {
  return `${parent}${utils.getSplitter()}${name}`;
}

function getDocument(languageId: string, text: string): vscode.TextDocument {
  const lines = text.split("\n");
  return {
    languageId,
    lineCount: lines.length,
    getText: (range?: vscode.Range) =>
      range ? lines.slice(range.start.line, range.end.line).join("\n") : text,
  } as unknown as vscode.TextDocument;
}

export function getSymbolItem(
  kind: vscode.SymbolKind,
  line: number,
  name: string,
  path: string = "/workspace/app/src/file"
): QuickPickItem {
  return {
    label: `$(symbol-method)  ${name}`,
    uri: vscode.Uri.file(path),
    symbolKind: kind,
    range: {
      start: new vscode.Position(line, 0),
      end: new vscode.Position(line + 1, 0),
    },
  };
}

export const getTestSetups = () => {
  const sandbox = sinon.createSandbox();

  function stubFile(
    languageId: string,
    text: string,
    symbols: vscode.DocumentSymbol[]
  ) {
    sandbox.stub(dataService, "getSymbolsForUri").resolves(symbols);
    sandbox.stub(dataConverter, "getIcons").returns({
      [vscode.SymbolKind.Class]: "symbol-class",
      [vscode.SymbolKind.Method]: "symbol-method",
    });
    sandbox.stub(utils, "normalizeUriPath").callsFake((path: string) => path);
    sandbox
      .stub(vscode.workspace, "openTextDocument")
      .resolves(getDocument(languageId, text) as any);
  }

  function stubWorkspace(folderName: string, isMultiRoot: boolean) {
    const root = vscode.Uri.file(`/workspace/${folderName}`);
    sandbox
      .stub(vscode.workspace, "getWorkspaceFolder")
      .callsFake((uri: vscode.Uri) =>
        uri.path.startsWith(`${root.path}/`)
          ? { uri: root, name: folderName, index: 0 }
          : undefined
      );
    sandbox
      .stub(vscode.workspace, "asRelativePath")
      .callsFake((pathOrUri: string | vscode.Uri, includeFolder?: boolean) => {
        const uri = pathOrUri as vscode.Uri;
        const relative = uri.path.slice(root.path.length + 1);
        return isMultiRoot && includeFolder
          ? `${folderName}/${relative}`
          : relative;
      });
  }

  return {
    afterEach: () => {
      sandbox.restore();
    },

    setupForJavaFile: () => {
      stubFile("java", JAVA_TEXT, [
        getSymbol("UserService", vscode.SymbolKind.Class, 3),
        getSymbol(
          nested("UserService", "save(User)"),
          vscode.SymbolKind.Method,
          4
        ),
        getSymbol("User", vscode.SymbolKind.Class, 10),
        getSymbol(nested("User", "Builder"), vscode.SymbolKind.Class, 12),
      ]);
    },

    setupForJavaFileWithoutPackage: () => {
      stubFile("java", JAVA_TEXT_WITHOUT_PACKAGE, [
        getSymbol("UserService", vscode.SymbolKind.Class, 0),
        getSymbol(
          nested("UserService", "save(User)"),
          vscode.SymbolKind.Method,
          1
        ),
      ]);
    },

    setupForGoFile: () => {
      stubFile("go", GO_TEXT, [
        getSymbol("NewServer", vscode.SymbolKind.Function, 3),
        getSymbol("(*Server).Start", vscode.SymbolKind.Method, 5),
      ]);
    },

    setupForTypeScriptFile: () => {
      stubFile("typescript", TYPESCRIPT_TEXT, [
        getSymbol("UserService", vscode.SymbolKind.Class, 0),
        getSymbol(nested("UserService", "save"), vscode.SymbolKind.Method, 1),
      ]);
    },

    setupForChangedFile: () => {
      stubFile("typescript", TYPESCRIPT_TEXT, [
        getSymbol("UserService", vscode.SymbolKind.Class, 0),
      ]);
    },

    setupForSingleRootWorkspace: () => {
      stubWorkspace("app", false);
    },

    setupForMultiRootWorkspace: () => {
      stubWorkspace("app", true);
    },
  };
};
