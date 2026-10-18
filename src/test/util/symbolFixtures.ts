import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { dataConverter } from "../../symbols/dataConverter";

interface RawSymbol {
  name: string;
  detail: string;
  kind: number;
  range: RawRange;
  selectionRange: RawRange;
  children: RawSymbol[];
}

interface RawRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

const FIXTURES_DIR = path.resolve(
  __dirname,
  "../../../src/test/fixtures"
);

function toRange(range: RawRange): vscode.Range {
  return new vscode.Range(
    new vscode.Position(range.start.line, range.start.character),
    new vscode.Position(range.end.line, range.end.character)
  );
}

function toDocumentSymbol(raw: RawSymbol): vscode.DocumentSymbol {
  const symbol = new vscode.DocumentSymbol(
    raw.name,
    raw.detail,
    raw.kind,
    toRange(raw.range),
    toRange(raw.selectionRange)
  );
  symbol.children = raw.children.map(toDocumentSymbol);
  return symbol;
}

// Fixtures are the verbatim output of vscode.executeDocumentSymbolProvider, recorded from
// gopls (golang.go) and jdtls (redhat.java) in a real VS Code.
export function loadSymbolFixture(fileName: string): vscode.DocumentSymbol[] {
  const raw: RawSymbol[] = JSON.parse(
    fs.readFileSync(path.join(FIXTURES_DIR, fileName), "utf8")
  );
  return raw.map(toDocumentSymbol);
}

// Mirrors documentSymbols: children are flattened and named "<parent><splitter><name>".
export function flattenSymbols(
  symbols: vscode.DocumentSymbol[],
  parentName?: string
): vscode.DocumentSymbol[] {
  const flat: vscode.DocumentSymbol[] = [];
  for (const symbol of symbols) {
    const flatSymbol = new vscode.DocumentSymbol(
      parentName ? `${parentName}${dataConverter.getSplitter()}${symbol.name}` : symbol.name,
      symbol.detail,
      symbol.kind,
      symbol.range,
      symbol.selectionRange
    );
    flat.push(flatSymbol);
    flat.push(
      ...flattenSymbols(
        symbol.children,
        parentName ? `${parentName}.${symbol.name}` : symbol.name
      )
    );
  }
  return flat;
}
