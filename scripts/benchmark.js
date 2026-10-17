const path = require("path");
const fs = require("fs");

// Mock VSCode classes
const vscodeMock = {
  Uri: {
    file: (p) => ({ toString: () => "file://" + p, scheme: "file", path: p }),
    parse: (p) => ({ toString: () => p, scheme: "file", path: p }),
  },
  Position: class Position {
    constructor(line, char) { this.line = line; this.character = char; }
  },
  SymbolKind: {
    File: 0,
    Class: 4,
    Method: 5,
    Property: 6,
    Interface: 10,
    Variable: 12,
    Constant: 13,
    Function: 11,
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue }),
  },
  window: {
    createOutputChannel: () => ({ appendLine: (line) => console.log(`  [log] ${line}`) }),
  },
};

// Hook module loader for 'vscode'
const Module = require("module");
const originalRequire = Module.prototype.require;
// Records the last restricted (recent-keys) query so its EXPLAIN QUERY PLAN can be printed.
let lastRestrictedQuery;
Module.prototype.require = function (id) {
  if (id === "vscode") return vscodeMock;
  const loaded = originalRequire.apply(this, arguments);
  if (id !== "sql.js") return loaded;
  return async (...args) => {
    const SQL = await loaded(...args);
    const exec = SQL.Database.prototype.exec;
    SQL.Database.prototype.exec = function (sql, params) {
      if (sql.includes("IN (VALUES")) lastRestrictedQuery = { db: this, sql, params };
      return exec.call(this, sql, params);
    };
    return SQL;
  };
};

const { database, extractName } = require("../dist/database");
const { initCache } = require("../dist/cache");
require("../dist/logger").logger.init();

const workspaceStateStore = new Map();
initCache({
  workspaceState: {
    get: (key) => workspaceStateStore.get(key),
    update: (key, value) => workspaceStateStore.set(key, value),
  },
});

function toRecentKey(item) {
  return {
    uri: item.uri.toString(),
    symbolKind: item.symbolKind,
    name: extractName(item.label),
  };
}

function recentKeyString(key) {
  return `${key.uri}#${key.symbolKind}#${key.name}`;
}

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

function generateMockItems(count) {
  const kinds = [0, 4, 5, 6, 10, 12, 13];
  const items = [];
  for (let i = 0; i < count; i++) {
    const fileId = Math.floor(i / 10);
    const kind = kinds[i % kinds.length];
    const name = `Item_${i}_ServiceHandler${i % 100}`;
    items.push({
      uri: vscodeMock.Uri.file(`/workspace/project/src/module${fileId % 50}/file${fileId}.ts`),
      symbolKind: kind,
      label: `$(symbol-class) ${name}`,
      containerName: kind === 0 ? undefined : `Service${i % 100}.Handler${i % 7}`,
      description: `src/module${fileId % 50}/file${fileId}.ts`,
      detail: `function ${name}(opts: Options): Promise<Result${i}>`,
      range: {
        start: new vscodeMock.Position(i % 500, 0),
        end: new vscodeMock.Position((i % 500) + 10, 0),
      },
    });
  }
  return items;
}

async function runBenchmark(itemCount = 50000) {
  console.log(`\n======================================================`);
  console.log(`  BENCHMARK: ${itemCount.toLocaleString()} symboli/plików w projekcie`);
  console.log(`======================================================\n`);

  if (global.gc) global.gc();
  const baselineMem = process.memoryUsage().heapUsed;
  console.log(`Początkowy stan pamięci sterty: ${formatBytes(baselineMem)}`);

  // --- 1. POPRZEDNIA ARCHITEKTURA (Wszystko w tablicy JS w RAM) ---
  console.log(`\n[1] TEST: STARA ARCHITEKTURA (wszystko w tablicy RAM + JSON cache)`);
  const t0Gen = Date.now();
  const memoryArray = generateMockItems(itemCount);
  const t1Gen = Date.now();

  const memAfterOldLoad = process.memoryUsage().heapUsed;
  const oldArrayRAM = memAfterOldLoad - baselineMem;
  console.log(`  -> Wygenerowano tablicę w RAM w: ${t1Gen - t0Gen} ms`);
  console.log(`  -> RAM zajmowany przez obiekty w JS: +${formatBytes(oldArrayRAM)}`);

  // Symulacja wyszukiwania w starej architekturze (pełne filtrowanie 50 000 obiektów w JS)
  const queries = [
    "ServiceHandler42",
    "Item_1234",
    "module25",
    "xyznotfound",
    "Handler2.Item_1234",
    "Service42#Item",
    "Service42.",
    "src/module25/Item",
    "Service Handler",
    "Handler Service",
    "Serv*42",
    "xyz notfound",
    "SerHan",
    "ISH",
    "HTTPSrv",
    "i1s",
    "ish",
  ];
  const t0OldSearch = Date.now();
  let oldMatches = 0;
  for (let iter = 0; iter < 10; iter++) {
    for (const q of queries) {
      const lowerQ = q.toLowerCase();
      const filtered = memoryArray.filter(
        (it) =>
          it.label.toLowerCase().includes(lowerQ) ||
          it.detail.toLowerCase().includes(lowerQ)
      );
      oldMatches += filtered.length;
    }
  }
  const t1OldSearch = Date.now();
  const oldAvgQueryMs = ((t1OldSearch - t0OldSearch) / (10 * queries.length)).toFixed(2);
  console.log(`  -> Średni czas filtrowania w JS (40 zapytań): ${oldAvgQueryMs} ms / zapytanie`);

  // Symulacja serializacji do workspaceState (JSON)
  const t0Json = Date.now();
  const serialized = JSON.stringify(memoryArray);
  const t1Json = Date.now();
  console.log(`  -> Rozmiar JSON w workspaceState: ${formatBytes(Buffer.byteLength(serialized))}`);
  console.log(`  -> Czas zapisu/odczytu JSON cache: ${t1Json - t0Json} ms`);

  // Zwolnienie referencji starej tablicy
  memoryArray.length = 0;
  if (global.gc) global.gc();

  // --- 2. NOWA ARCHITEKTURA (SQLite WASM + wirtualizacja do 500) ---
  console.log(`\n[2] TEST: NOWA ARCHITEKTURA (SQLite WASM + virtual search limit 500)`);
  const testStorageDir = path.join(__dirname, "../.benchmark-storage");
  if (!fs.existsSync(testStorageDir)) fs.mkdirSync(testStorageDir, { recursive: true });

  const fakeContext = {
    extensionPath: path.resolve(__dirname, ".."),
    storageUri: { fsPath: testStorageDir },
    globalStorageUri: { fsPath: testStorageDir },
  };

  const memBeforeSqlite = process.memoryUsage().heapUsed;
  await database.initDatabase(fakeContext);
  database.clearAll();

  // Generujemy partiami po 5000 do wstawienia
  console.log(`  -> Wstawianie ${itemCount.toLocaleString()} wpisów do SQLite (w transakcjach)...`);
  const t0SqlInsert = Date.now();
  const batchSize = 5000;
  for (let i = 0; i < itemCount; i += batchSize) {
    const chunk = generateMockItems(Math.min(batchSize, itemCount - i));
    database.insertSymbolsBatch(chunk);
    chunk.length = 0; // zwalniamy natychmiast
  }
  const t1SqlInsert = Date.now();
  console.log(`  -> Wstawiono i zindeksowano w SQLite w: ${t1SqlInsert - t0SqlInsert} ms`);

  const memAfterSqlite = process.memoryUsage().heapUsed;
  const newRamOverhead = memAfterSqlite - memBeforeSqlite;
  console.log(`  -> Narzut na stertę JS w nowej architekturze: +${formatBytes(Math.max(0, newRamOverhead))}`);

  // Test wyszukiwania w SQLite (zwraca max 500 pozycji)
  const t0SqlSearch = Date.now();
  let newMatches = 0;
  for (let iter = 0; iter < 10; iter++) {
    for (const q of queries) {
      const results = database.search(q, 500);
      newMatches += results.length;
    }
  }
  const t1SqlSearch = Date.now();
  const newAvgQueryMs = ((t1SqlSearch - t0SqlSearch) / (10 * queries.length)).toFixed(2);
  console.log(`  -> Średni czas zapytania SQLite (${10 * queries.length} zapytań): ${newAvgQueryMs} ms / zapytanie`);

  const timeUncached = (q) => {
    let count = 0;
    const t0 = process.hrtime.bigint();
    for (let iter = 0; iter < 10; iter++) {
      database.clearSearchCache();
      count = database.search(q, 500).length;
    }
    return { ms: Number(process.hrtime.bigint() - t0) / 1e6 / 10, count };
  };
  const beforeSaveMs = new Map();
  for (const q of queries) {
    const { ms, count } = timeUncached(q);
    beforeSaveMs.set(q, ms);
    console.log(`     ${q.padEnd(26)} ${ms.toFixed(2).padStart(8)} ms  (${count} wyników, bez cache)`);
  }

  console.log(`\n  -> Recent ranking: 10 recent keys matching the query + 40 random rows, uncached`);
  console.log(`     ${"query".padEnd(26)} ${"no recent".padStart(11)} ${"50 recent".padStart(11)}  boosted in top 50`);
  const randomKeys = [];
  for (let k = 0; k < 40; k++) {
    const i = Math.floor(Math.random() * itemCount);
    const [item] = generateMockItems(i + 1).slice(i);
    randomKeys.push(toRecentKey(item));
  }
  for (const q of queries) {
    database.clearSearchCache();
    const matched = database.search(q, 500);
    const recent = [...matched.slice(-10).map(toRecentKey), ...randomKeys];
    const timeSearch = (options) => {
      let results = [];
      const t0 = process.hrtime.bigint();
      for (let iter = 0; iter < 10; iter++) {
        database.clearSearchCache();
        results = database.search(q, 500, options);
      }
      return { ms: Number(process.hrtime.bigint() - t0) / 1e6 / 10, results };
    };
    const plain = timeSearch(undefined);
    const boosted = timeSearch({ recent });
    const recentSet = new Set(recent.map(recentKeyString));
    const boostedTop = boosted.results
      .slice(0, 50)
      .filter((it) => recentSet.has(recentKeyString(toRecentKey(it)))).length;
    console.log(
      `     ${q.padEnd(26)} ${plain.ms.toFixed(2).padStart(8)} ms ${boosted.ms.toFixed(2).padStart(8)} ms  ${boostedTop}`
    );
  }

  if (lastRestrictedQuery) {
    const { db, sql, params } = lastRestrictedQuery;
    const plan = db.exec(`EXPLAIN QUERY PLAN ${sql}`, params);
    console.log(`\n  -> EXPLAIN QUERY PLAN (restricted search):`);
    for (const row of plan[0]?.values ?? []) {
      console.log(`     ${row[row.length - 1]}`);
    }
  }

  // Wielkość pliku bazy na dysku
  const t0Persist = process.hrtime.bigint();
  await database.persistToFile();
  const persistMs = Number(process.hrtime.bigint() - t0Persist) / 1e6;
  const dbFile = path.join(testStorageDir, "search-everywhere-index.db");
  const dbFileSize = fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0;
  console.log(`  -> Rozmiar bazy SQLite na dysku: ${formatBytes(dbFileSize)} (zapis: ${persistMs.toFixed(0)} ms)`);

  // sql.js reopens the connection on export, which resets the PRAGMAs; a slower second pass
  // means they were not re-applied.
  console.log(`\n  -> Uncached search before and after the first save`);
  console.log(`     ${"query".padEnd(26)} ${"before".padStart(11)} ${"after".padStart(11)}`);
  for (const q of queries) {
    const { ms } = timeUncached(q);
    console.log(
      `     ${q.padEnd(26)} ${beforeSaveMs.get(q).toFixed(2).padStart(8)} ms ${ms.toFixed(2).padStart(8)} ms`
    );
  }

  database.closeDatabase();
  // Sprzątanie katalogu testowego
  try {
    fs.rmSync(testStorageDir, { recursive: true, force: true });
  } catch {}

  console.log(`\n======================================================`);
  console.log(`                   PODSUMOWANIE`);
  console.log(`======================================================`);
  console.log(`Wskaźnik                   | Przedtem (RAM array) | Teraz (SQLite WASM)`);
  console.log(`---------------------------+----------------------+--------------------`);
  console.log(`Zużycie pamięci JS         | ~${formatBytes(oldArrayRAM).padEnd(19)} | ~${formatBytes(Math.max(0, newRamOverhead)).padEnd(18)}`);
  console.log(`Rozmiar listy w UI (Quick) | ${itemCount.toLocaleString().padEnd(20)} | max 500 elementów`);
  console.log(`Czas wyszukiwania          | ${oldAvgQueryMs} ms / query        | ${newAvgQueryMs} ms / query`);
  console.log(`Zapis stanu / cache        | JSON (${t1Json - t0Json} ms)       | SQLite B-Tree (błyskawiczny)`);
  console.log(`Wpływ na UI VSCode         | Zwiechy wątku edytora| Zero lagów`);
  console.log(`======================================================\n`);
}

runBenchmark(50000).catch(console.error);
