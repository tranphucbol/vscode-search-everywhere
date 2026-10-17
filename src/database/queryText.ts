export function extractName(label: string): string {
  // Strip icon prefix like "$(symbol-class)  ClassName"
  const match = label.match(/^\$\([^)]+\)\s+(.+)$/);
  return match ? match[1] : label;
}

export function extractCleanName(name: string): string {
  if (!name) {
    return "";
  }
  return name.toLowerCase().replace(/[\s.\-_]/g, "");
}

export function extractCleanContainer(container?: string): string {
  if (!container) {
    return "";
  }
  return container
    .split(".")
    .map(extractCleanName)
    .filter((segment) => segment)
    .join(".");
}

export const LIKE_ESCAPE = "ESCAPE '\\'";
const LIKE_SPECIAL_CHARS = /[\\%_]/;

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

// The three-argument like() made every search about 9% slower in scripts/benchmark.js,
// so the ESCAPE clause is only added when escapeLike actually changed the text.
export function likeEscape(value: string): string {
  return LIKE_SPECIAL_CHARS.test(value) ? LIKE_ESCAPE : "";
}

const QUALIFIER_REGEX = /\.|#|::/g;

export interface QualifiedQuery {
  container: string;
  member: string;
}

export function parseQualifiedQuery(query: string): QualifiedQuery | undefined {
  if (!query) {
    return undefined;
  }
  const segments = query.split(QUALIFIER_REGEX);
  if (segments.length < 2) {
    return undefined;
  }
  const member = extractCleanName(segments.pop()!);
  const container = segments
    .map(extractCleanName)
    .filter((segment) => segment)
    .join(".");
  if (!container) {
    return undefined;
  }
  return { container, member };
}

export interface PatternQuery {
  /** Escaped LIKE fragments, one per word, with `*` gaps turned into `%`, e.g. "user%impl". */
  words: string[];
  /** The cleaned words concatenated without escaping, e.g. "userimpl". */
  joined: string;
}

/**
 * Returns undefined unless the query is a pattern query: no `/`, and either a `*` or at
 * least two whitespace-separated words. A query of only `*` yields no words.
 */
export function parsePatternQuery(query: string): PatternQuery | undefined {
  if (!query || query.includes("/")) {
    return undefined;
  }
  const rawWords = query.split(/\s+/).filter((word) => word);
  if (rawWords.length < 2 && !query.includes("*")) {
    return undefined;
  }
  const words: string[] = [];
  let joined = "";
  for (const rawWord of rawWords) {
    const pieces = rawWord
      .split("*")
      .map(extractCleanName)
      .filter((piece) => piece);
    if (pieces.length) {
      words.push(pieces.map(escapeLike).join("%"));
      joined += pieces.join("");
    }
  }
  return { words, joined };
}

export interface PathQuery {
  dir: string;
  leaf: string;
}

export function splitPathQuery(query: string): PathQuery {
  const lastSlash = query.lastIndexOf("/");
  return { dir: query.slice(0, lastSlash), leaf: query.slice(lastSlash + 1) };
}

export function extractCleanStem(name: string, symbolKind?: number): string {
  if (!name) {
    return "";
  }
  let stem = name;
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex > 0) {
    stem = name.substring(0, dotIndex);
  }
  return extractCleanName(stem);
}

const enum CharClass {
  Separator,
  Upper,
  Lower,
  Caseless,
  Digit,
}

const UPPER_REGEX = /\p{Lu}/u;
const LOWER_REGEX = /\p{Ll}/u;
const LETTER_REGEX = /\p{L}/u;
const DIGIT_REGEX = /\p{N}/u;

function classifyChar(ch: string): CharClass {
  const code = ch.charCodeAt(0);
  if (code < 128) {
    if (code >= 97 && code <= 122) {
      return CharClass.Lower;
    }
    if (code >= 65 && code <= 90) {
      return CharClass.Upper;
    }
    if (code >= 48 && code <= 57) {
      return CharClass.Digit;
    }
    return CharClass.Separator;
  }
  if (UPPER_REGEX.test(ch)) {
    return CharClass.Upper;
  }
  if (LOWER_REGEX.test(ch)) {
    return CharClass.Lower;
  }
  if (LETTER_REGEX.test(ch)) {
    return CharClass.Caseless;
  }
  return DIGIT_REGEX.test(ch) ? CharClass.Digit : CharClass.Separator;
}

// keepCapitalRuns follows IntelliJ's NameUtil: "HTTPServer" splits into "HTTP" and "Server".
// Without it every capital starts a new piece, which is how a query such as "USImpl" is read.
function splitIntoPieces(text: string, keepCapitalRuns: boolean): string[] {
  const chars = Array.from(text);
  const classes = chars.map(classifyChar);
  const pieces: string[] = [];
  let current = "";
  for (let i = 0; i < chars.length; i++) {
    const cls = classes[i];
    if (cls === CharClass.Separator) {
      if (current) {
        pieces.push(current);
        current = "";
      }
      continue;
    }
    const prev = current ? classes[i - 1] : CharClass.Separator;
    let startsPiece = false;
    if (current) {
      if (cls === CharClass.Digit || prev === CharClass.Digit) {
        startsPiece = cls !== prev;
      } else if (cls === CharClass.Upper) {
        startsPiece =
          prev !== CharClass.Upper ||
          !keepCapitalRuns ||
          (i + 1 < chars.length && classes[i + 1] === CharClass.Lower);
      }
    }
    if (startsPiece) {
      pieces.push(current);
      current = "";
    }
    current += chars[i];
  }
  if (current) {
    pieces.push(current);
  }
  return pieces;
}

export function splitWords(name: string): string[] {
  return name ? splitIntoPieces(name, true) : [];
}

function wordsSource(name: string, symbolKind?: number): string {
  if (symbolKind === 0) {
    const dotIndex = name.lastIndexOf(".");
    if (dotIndex > 0) {
      return name.substring(0, dotIndex);
    }
  }
  return name;
}

export function extractWordColumns(name: string, symbolKind?: number): [string, string] {
  const words = name ? splitWords(wordsSource(name, symbolKind)) : [];
  if (!words.length) {
    return ["", ""];
  }
  const cleanWords = " " + words.join(" ").toLowerCase();
  const cleanInitials = words
    .map((word) => Array.from(word)[0])
    .join("")
    .toLowerCase();
  return [cleanWords, cleanInitials];
}

export function extractCleanWords(name: string, symbolKind?: number): string {
  return extractWordColumns(name, symbolKind)[0];
}

export function extractCleanInitials(name: string, symbolKind?: number): string {
  return extractWordColumns(name, symbolKind)[1];
}

export type CamelHumpsQuery =
  | { kind: "initials"; initials: string }
  /** One LIKE pattern per reading, anchored at the first word, e.g. " u% ser% imp%". */
  | { kind: "words"; patterns: string[] };

const INITIALS_QUERY_REGEX = /^[\p{Ll}\p{N}]{2,}$/u;
const CAPITAL_AFTER_FIRST_REGEX = /^.\P{Lu}*\p{Lu}/su;
const JOINED_PIECES_REGEX = /[\p{L}\p{N}][_-][\p{L}\p{N}]/u;

function toWordsPattern(pieces: string[]): string {
  return " " + pieces.map((piece) => piece.toLowerCase()).join("% ") + "%";
}

/**
 * Returns undefined unless the query is a CamelHumps query. An initials query is two or more
 * lowercase letters or digits with at least one letter, matched one letter per word. A words
 * query has a capital after its first character or a `_` or `-` between pieces; each piece
 * matches the start of a word, in order. Qualified, pattern and path queries are neither.
 */
export function parseCamelHumpsQuery(query: string): CamelHumpsQuery | undefined {
  if (!query) {
    return undefined;
  }
  if (INITIALS_QUERY_REGEX.test(query) && LETTER_REGEX.test(query)) {
    return { kind: "initials", initials: query };
  }
  if (
    query.includes("/") ||
    !(CAPITAL_AFTER_FIRST_REGEX.test(query) || JOINED_PIECES_REGEX.test(query)) ||
    parsePatternQuery(query) ||
    parseQualifiedQuery(query)
  ) {
    return undefined;
  }
  // Reading B may be a single piece: "USI" read as "usi" finds parseUSIField.
  const readingA = splitIntoPieces(query, false);
  if (readingA.length < 2) {
    return undefined;
  }
  const patterns = [toWordsPattern(readingA)];
  const readingB = toWordsPattern(splitIntoPieces(query, true));
  if (readingB !== patterns[0]) {
    patterns.push(readingB);
  }
  return { kind: "words", patterns };
}

