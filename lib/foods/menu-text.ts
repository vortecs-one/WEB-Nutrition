import type { FoodPhotoItem, FoodPhotoResult } from "./photo-types";
import { referenceToItem } from "./photo-postprocess";
import { REFERENCE_BY_ID, REFERENCE_TABLE } from "./reference-table";

const MAX_ITEMS = 8;
const MAX_ALTERNATIVES = 4;
// Shorter words ("pan", "te") collide with too many unrelated menu words.
const MIN_TERM_LENGTH = 4;

type Term = { entryId: string; tokens: string[]; isName: boolean };
type Match = { entryId: string; start: number; end: number; isName: boolean; alternatives: string[] };

export function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

let termIndex: Term[] | null = null;

function getTerms() {
  if (termIndex) return termIndex;
  const seen = new Set<string>();
  const terms: Term[] = [];
  const add = (entryId: string, raw: string, isName: boolean) => {
    for (const part of raw.replace(/\([^)]*\)/g, " ").split(/[\/,]/)) {
      const normalized = normalizeText(part);
      const key = `${entryId}|${normalized}`;
      if (normalized.length < MIN_TERM_LENGTH || seen.has(key)) continue;
      seen.add(key);
      terms.push({ entryId, tokens: normalized.split(" "), isName });
    }
  };
  for (const entry of REFERENCE_TABLE) {
    add(entry.id, entry.nameEs, true);
    add(entry.id, entry.nameEn, true);
    for (const alias of entry.aliases) add(entry.id, alias, false);
  }
  // Longest phrases first so "arroz con leche" wins over "arroz" and "leche".
  termIndex = terms.sort((a, b) => b.tokens.join(" ").length - a.tokens.join(" ").length || Number(b.isName) - Number(a.isName));
  return termIndex;
}

const tokenMatches = (word: string, token: string) =>
  word === token || word === `${token}s` || word === `${token}es`;

function findOccurrences(words: string[], tokens: string[]) {
  const starts: number[] = [];
  for (let i = 0; i + tokens.length <= words.length; i++) {
    if (tokens.every((token, j) => tokenMatches(words[i + j], token))) starts.push(i);
  }
  return starts;
}

export function matchMenuText(text: string, locale: "es" | "en"): FoodPhotoResult {
  const words = normalizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return { ok: false, reason: "not-food" };

  const claimed = new Map<number, Match>();
  const matches: Match[] = [];
  for (const term of getTerms()) {
    for (const start of findOccurrences(words, term.tokens)) {
      const end = start + term.tokens.length;
      const owner = claimed.get(start);
      if (owner && owner.start === start && owner.end === end) {
        // Same phrase listed under two table entries: offer the other as an alternative.
        if (owner.entryId !== term.entryId && !owner.alternatives.includes(term.entryId)) {
          owner.alternatives.push(term.entryId);
        }
        continue;
      }
      let overlaps = false;
      for (let i = start; i < end; i++) if (claimed.has(i)) overlaps = true;
      if (overlaps) continue;
      const match: Match = { entryId: term.entryId, start, end, isName: term.isName, alternatives: [] };
      for (let i = start; i < end; i++) claimed.set(i, match);
      matches.push(match);
    }
  }

  const byEntry = new Map<string, Match>();
  for (const match of matches.sort((a, b) => a.start - b.start)) {
    if (!byEntry.has(match.entryId)) byEntry.set(match.entryId, match);
  }

  const items: FoodPhotoItem[] = [...byEntry.values()].slice(0, MAX_ITEMS).flatMap((match, index) => {
    const entry = REFERENCE_BY_ID.get(match.entryId);
    if (!entry) return [];
    const multiWord = match.end - match.start > 1;
    const sameGroup = REFERENCE_TABLE.filter((e) => e.group === entry.group && e.id !== entry.id).map((e) => e.id);
    const alternatives = [...new Set([...match.alternatives, ...sameGroup])].slice(0, MAX_ALTERNATIVES);
    return [
      referenceToItem(entry, locale, {
        id: `menu-${index}-${entry.id}`,
        confidence: match.isName ? (multiWord ? 0.9 : 0.8) : 0.65,
        alternatives,
      }),
    ];
  });

  return items.length ? { ok: true, items } : { ok: false, reason: "not-food" };
}
