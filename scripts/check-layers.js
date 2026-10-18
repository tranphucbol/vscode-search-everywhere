#!/usr/bin/env node
// Fails when a relative import in src/ goes against the folder order of decision 008 or the
// subfolder order of decision 009. Tests (src/test/) may import anything.
const fs = require("fs");
const path = require("path");

const srcDir = path.resolve(__dirname, "..", "src");

// Decision 008: a folder imports only folders to its right.
const folderOrder = [
  "extension.ts",
  "commands",
  "quickPick",
  "indexing",
  "symbols",
  "database",
  "platform",
  "shared",
];

// Decision 009: each entry is a layer of subfolders and root files. A unit imports units in
// later layers only; units in the same layer do not import each other. Folders not listed
// here are flat.
const layers = {
  indexing: [["lifecycle.ts"], ["sources"], ["queue"], ["apply"]],
  symbols: [["liveSymbols.ts", "reference.ts"], ["scan"], ["items"]],
  quickPick: [
    ["quickPick.ts"],
    ["actions"],
    ["view"],
    ["input"],
    ["editor"],
    ["state.ts"],
  ],
  database: [
    ["index.ts"],
    ["storage", "search"],
    ["queryText.ts", "secondary.ts", "searchCache.ts"],
    ["state.ts"],
  ],
  platform: [["settings"], ["cache.ts", "gitService.ts"], ["logger.ts"]],
};

// The only files of a folder that other folders may import.
const entries = {
  indexing: ["lifecycle.ts", "sources/fileWatcher.ts"],
};

const importPattern = /(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s+["'](\.[^"']*)["']/g;

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return fullPath === path.join(srcDir, "test")
        ? []
        : listSourceFiles(fullPath);
    }
    return entry.name.endsWith(".ts") ? [fullPath] : [];
  });
}

function resolveImport(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [`${base}.ts`, path.join(base, "index.ts"), base];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  return path.relative(srcDir, found || `${base}.ts`).split(path.sep).join("/");
}

function locate(relativePath) {
  const [folder, ...rest] = relativePath.split("/");
  return {
    folder,
    unit: rest.length ? rest[0] : folder,
    inFolder: rest.join("/"),
  };
}

function layerIndex(folder, unit) {
  return layers[folder].findIndex((layer) => layer.includes(unit));
}

function checkImport(from, to) {
  const source = locate(from);
  const target = locate(to);

  if (source.folder !== target.folder) {
    const sourceRank = folderOrder.indexOf(source.folder);
    const targetRank = folderOrder.indexOf(target.folder);
    if (sourceRank === -1 || targetRank === -1) {
      return `${source.folder} or ${target.folder} is missing from folderOrder`;
    }
    if (targetRank <= sourceRank) {
      return `${source.folder} may not import ${target.folder} (decision 008: ${folderOrder.join(" -> ")})`;
    }
    const allowed = entries[target.folder];
    if (allowed && !allowed.includes(target.inFolder)) {
      return `outside ${target.folder}/ only ${allowed.join(", ")} may be imported`;
    }
    return undefined;
  }

  if (!layers[source.folder] || source.unit === target.unit) {
    return undefined;
  }

  const sourceLayer = layerIndex(source.folder, source.unit);
  const targetLayer = layerIndex(source.folder, target.unit);
  const missing = [
    [source.unit, sourceLayer],
    [target.unit, targetLayer],
  ].find(([, index]) => index === -1);
  if (missing) {
    return `${source.folder}/${missing[0]} is missing from the ${source.folder} layers in scripts/check-layers.js`;
  }
  if (targetLayer <= sourceLayer) {
    const order = layers[source.folder]
      .map((layer) => layer.join(" | "))
      .join(" -> ");
    return `${source.unit} may not import ${target.unit} (decision 009: ${order})`;
  }
  return undefined;
}

const violations = [];
for (const file of listSourceFiles(srcDir)) {
  const from = path.relative(srcDir, file).split(path.sep).join("/");
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(importPattern)) {
    const to = resolveImport(file, match[1]);
    const problem = checkImport(from, to);
    if (problem) {
      violations.push(`src/${from} imports src/${to}: ${problem}`);
    }
  }
}

if (violations.length) {
  console.error(violations.join("\n"));
  console.error(`\n${violations.length} import(s) break the layer rules.`);
  process.exit(1);
}
console.log("✔ Every import follows the layer rules.");
