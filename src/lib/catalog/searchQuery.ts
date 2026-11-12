/**
 * Turns free text typed by a person into a safe FTS5 MATCH expression.
 *
 * - Input is reduced to plain word tokens (letters and digits only), each quoted, so no quote,
 *   operator, column filter or parenthesis typed by the user can reach the FTS5 parser.
 * - Every token is prefix-matched so results appear while typing.
 * - Regional and alternative ingredient names are expanded: "aubergine" also matches "eggplant".
 *   The original words are kept as an alternative, so titles that use them still match.
 */

/** Regional or alternative names (left) and the name the catalog mostly uses (right). */
const SYNONYMS: readonly (readonly [string, string])[] = [
  ['pak choi', 'bok choy'],
  ['pak choy', 'bok choy'],
  ['bok choi', 'bok choy'],
  ['celery root', 'celeriac'],
  ['garbanzo beans', 'chickpea'],
  ['garbanzo bean', 'chickpea'],
  ['garbanzos', 'chickpea'],
  ['garbanzo', 'chickpea'],
  ['aubergines', 'eggplant'],
  ['aubergine', 'eggplant'],
  ['courgettes', 'zucchini'],
  ['courgette', 'zucchini'],
  ['coriander leaves', 'cilantro'],
  ['coriander', 'cilantro'],
  ['rocket', 'arugula'],
  ['spring onions', 'green onion'],
  ['spring onion', 'green onion'],
  ['scallions', 'green onion'],
  ['scallion', 'green onion'],
  ['capsicum', 'bell pepper'],
  ['cornflour', 'cornstarch'],
  ['icing sugar', 'powdered sugar'],
  ['confectioners sugar', 'powdered sugar'],
  ['double cream', 'heavy cream'],
  ['minced beef', 'ground beef'],
  ['beef mince', 'ground beef'],
  ['mangetout', 'snow pea'],
  ['swede', 'rutabaga'],
  ['prawns', 'shrimp'],
  ['prawn', 'shrimp'],
  ['caster sugar', 'sugar'],
  ['maize', 'corn'],
];

/** Most tokens kept from one query; more words rarely help and only slow matching down. */
const MAX_TOKENS = 8;
const MAX_TOKEN_LENGTH = 40;

/** Lowercases, strips accents and splits into word tokens. */
export function tokenize(text: string): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();
  return (folded.match(/[\p{L}\p{N}]+/gu) ?? []).map((token) => token.slice(0, MAX_TOKEN_LENGTH));
}

const synonymTable: readonly { from: string[]; to: string[] }[] = SYNONYMS.map(([from, to]) => ({
  from: tokenize(from),
  to: tokenize(to),
}))
  // Longest phrases first, so "garbanzo beans" wins over "garbanzo".
  .sort((a, b) => b.from.length - a.from.length);

/** One position in the query: the words typed and, when known, the catalog's name for them. */
export type TermGroup = readonly (readonly string[])[];

function matchesAt(tokens: readonly string[], index: number, phrase: readonly string[]): boolean {
  return phrase.every((word, offset) => tokens[index + offset] === word);
}

/** Splits the query into groups of alternative word sequences, applying synonyms. */
export function expandQuery(text: string): TermGroup[] {
  const tokens = tokenize(text).slice(0, MAX_TOKENS);
  const groups: TermGroup[] = [];
  let index = 0;
  while (index < tokens.length) {
    const synonym = synonymTable.find((entry) => matchesAt(tokens, index, entry.from));
    if (synonym) {
      groups.push([synonym.from, synonym.to]);
      index += synonym.from.length;
    } else {
      groups.push([[tokens[index] as string]]);
      index += 1;
    }
  }
  return groups;
}

/** Expands a single phrase into its synonyms, original first (used for ingredient lookups). */
export function phraseAlternatives(text: string): string[] {
  const tokens = tokenize(text);
  const original = tokens.join(' ');
  if (!original) return [];
  const whole = synonymTable.find(
    (entry) => entry.from.length === tokens.length && matchesAt(tokens, 0, entry.from),
  );
  return whole ? [original, whole.to.join(' ')] : [original];
}

const quote = (token: string) => `"${token}"*`;

function sequence(words: readonly string[]): string {
  const parts = words.map(quote);
  return parts.length === 1 ? (parts[0] as string) : `(${parts.join(' AND ')})`;
}

/**
 * Builds the MATCH expression, or null when the text has no searchable words. Groups are joined
 * with an explicit AND: FTS5 does not allow implicit AND next to a parenthesised group.
 */
export function buildFtsQuery(text: string): string | null {
  const groups = expandQuery(text);
  if (groups.length === 0) return null;
  return groups
    .map((alternatives) => {
      const unique = [...new Map(alternatives.map((alt) => [alt.join(' '), alt])).values()];
      return unique.length === 1
        ? sequence(unique[0] as readonly string[])
        : `(${unique.map(sequence).join(' OR ')})`;
    })
    .join(' AND ');
}

/** Escapes LIKE wildcards; pair with `ESCAPE '\'`. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}
