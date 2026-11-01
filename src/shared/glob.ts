const REGEXP_SPECIAL_CHARACTERS = /[.+^$()|[\]\\]/;
const globRegExpCache = new Map<string, RegExp>();

export function globToRegExp(glob: string): RegExp {
  const cached = globRegExpCache.get(glob);
  if (cached) {
    return cached;
  }

  let source = "";
  let braceDepth = 0;
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i];
    if (char === "*" && glob[i + 1] === "*") {
      const isDirectoryPrefix = glob[i + 2] === "/";
      source += isDirectoryPrefix ? "(?:.*/)?" : ".*";
      i += isDirectoryPrefix ? 2 : 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else if (char === "{") {
      braceDepth++;
      source += "(?:";
    } else if (char === "}" && braceDepth > 0) {
      braceDepth--;
      source += ")";
    } else if (char === "," && braceDepth > 0) {
      source += "|";
    } else {
      source += REGEXP_SPECIAL_CHARACTERS.test(char) ? `\\${char}` : char;
    }
  }

  const regExp = new RegExp(`^${source}$`);
  globRegExpCache.set(glob, regExp);
  return regExp;
}

/**
 * Expands every brace group of a glob: `src/*.{ts,{js,jsx}}` gives `src/*.ts`, `src/*.js` and
 * `src/*.jsx`.
 */
export function expandBraces(glob: string): string[] {
  const start = glob.indexOf("{");
  if (start === -1) {
    return [glob];
  }
  const alternatives: string[] = [];
  let depth = 0;
  let from = start + 1;
  for (let i = start; i < glob.length; i++) {
    const char = glob[i];
    if (char === "{") {
      depth++;
    } else if (char === "}" && --depth === 0) {
      alternatives.push(glob.slice(from, i));
      const prefix = glob.slice(0, start);
      const suffix = glob.slice(i + 1);
      return alternatives.flatMap((alternative) =>
        expandBraces(`${prefix}${alternative}${suffix}`)
      );
    } else if (char === "," && depth === 1) {
      alternatives.push(glob.slice(from, i));
      from = i + 1;
    }
  }
  return [glob];
}

/**
 * Merges globs into one, for APIs that take a single glob: VS Code's glob syntax does not nest
 * brace groups, so each glob is expanded and the results joined in one flat group.
 */
export function mergeGlobs(globs: string[]): string {
  const nonEmpty = globs.filter((glob) => !!glob);
  if (nonEmpty.length <= 1) {
    return nonEmpty[0] || "";
  }
  const expanded = Array.from(new Set(nonEmpty.flatMap(expandBraces)));
  return expanded.length > 1 ? `{${expanded.join(",")}}` : expanded[0];
}

export function matchesGlob(
  relativePath: string,
  glob: string | string[]
): boolean {
  const path = relativePath.replace(/^\/+/, "");
  const globs = Array.isArray(glob) ? glob : [glob];
  return globs.some((pattern) => !!pattern && globToRegExp(pattern).test(path));
}
