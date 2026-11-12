/**
 * Picks the words in a question worth looking up in the catalog ("anything with chickpeas and
 * spinach?" → chickpeas, spinach). Catalog search ANDs its words, so a whole sentence would match
 * nothing; each kept word is searched on its own instead.
 */
import { tokenize } from '@/lib/catalog';

export const MAX_SEARCH_TERMS = 4;
const MIN_LENGTH = 3;

/** Words that say nothing about which dish someone wants. */
const FILLER = new Set(
  (
    'about above after again also any anything are around back be been before being best better ' +
    'but can cook cooked cooking could dinner dish dishes does doing done easy eat eating else ' +
    'even every for from get give good got great have healthier healthy help her here him his ' +
    'how idea ideas into its just keep know last lately less like little looking lunch make ' +
    'making many meal meals more most much need new night not now off one only other our out ' +
    'over please quick really recipe recipes right should show some something suggest suggestion ' +
    'take than thank thanks that the their them then there these they thing things think this ' +
    'those today tomorrow tonight too try under use using very want week what when where which ' +
    'while who why will with without would yes yet you your all and ask did had has was were'
  ).split(' '),
);

export function searchTermsFrom(text: string): string[] {
  const terms: string[] = [];
  for (const token of tokenize(text)) {
    const filler = FILLER.has(token) || FILLER.has(token.replace(/s$/, ''));
    if (token.length < MIN_LENGTH || /^\d+$/.test(token) || filler) continue;
    if (!terms.includes(token)) terms.push(token);
    if (terms.length === MAX_SEARCH_TERMS) break;
  }
  return terms;
}
