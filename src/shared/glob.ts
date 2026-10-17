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

export function matchesGlob(
  relativePath: string,
  glob: string | string[]
): boolean {
  const path = relativePath.replace(/^\/+/, "");
  const globs = Array.isArray(glob) ? glob : [glob];
  return globs.some((pattern) => !!pattern && globToRegExp(pattern).test(path));
}
