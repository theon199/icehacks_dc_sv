/**
 * Turns published instructions into clean cook-mode steps and detects timers.
 */
import { parseNumber, replaceUnicodeFractions } from './measure.ts';

const MAX_STEP_CHARS = 420;
const MIN_STEP_CHARS = 12;
/** One-paragraph recipes are regrouped into steps of at most two sentences and 200 characters. */
const SINGLE_PARAGRAPH_STEP_CHARS = 200;
const SINGLE_PARAGRAPH_STEP_SENTENCES = 2;

const HEADING_ONLY = /^(?:step\s*\d+|method|instructions?|directions?|preparation|to serve|\d+)[\s.:)-]*$/i;
const LEADING_LABEL = /^(?:step\s*\d+\s*[:.)-]?\s*|\d{1,2}\s*[.)]\s+|\d{1,2}\s*-\s+|[-•*▪●]\s*)/i;

/** Abbreviations that end with a period but do not end a sentence. */
const ABBREVIATIONS = /(?:\b(?:approx|tsp|tbsp|tbs|oz|lb|lbs|min|mins|hr|hrs|e\.g|i\.e|no|vs|pt|qt|fl|deg|st|dr|mr|mrs|approx)\.)$/i;

function tidy(text: string): string {
  let t = text
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  t = t.replace(LEADING_LABEL, '').trim();
  if (!t) return t;
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (!/[.!?)"']$/.test(t)) t += '.';
  return t;
}

/** Splits text into sentences, keeping abbreviations and decimals intact. */
export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  const tokens = text.split(/(?<=[.!?])\s+/);
  for (const token of tokens) {
    current = current ? `${current} ${token}` : token;
    if (ABBREVIATIONS.test(current.trim()) || /\d\.$/.test(current.trim())) continue;
    parts.push(current.trim());
    current = '';
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

/** Groups sentences into steps no longer than MAX_STEP_CHARS. */
function chunk(sentences: string[], maxChars = MAX_STEP_CHARS, maxSentences = Infinity): string[] {
  const out: string[] = [];
  let current = '';
  let count = 0;
  for (const sentence of sentences) {
    if (current && (current.length + sentence.length + 1 > maxChars || count >= maxSentences)) {
      out.push(current);
      current = sentence;
      count = 1;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
      count++;
    }
  }
  if (current) out.push(current);
  return out;
}

export function splitSteps(blocks: readonly string[]): string[] {
  const lines: string[] = [];
  for (const block of blocks) {
    for (const raw of block.replace(/\r\n?/g, '\n').split(/\n+/)) {
      const line = raw.trim();
      if (!line || HEADING_ONLY.test(line)) continue;
      lines.push(line);
    }
  }

  // Merge sub-headings ("For the sauce:") and tiny fragments into the following line.
  const merged: string[] = [];
  let carry = '';
  for (const line of lines) {
    const text = carry ? `${carry} ${line}` : line;
    carry = '';
    const bare = text.replace(LEADING_LABEL, '');
    if (/:$/.test(text) || (bare.length < MIN_STEP_CHARS && !/[.!?]$/.test(bare))) {
      carry = text;
      continue;
    }
    merged.push(text);
  }
  if (carry) {
    if (merged.length > 0) merged[merged.length - 1] = `${merged[merged.length - 1]} ${carry}`;
    else merged.push(carry);
  }

  const steps: string[] = [];
  for (const paragraph of merged) {
    const cleaned = tidy(paragraph);
    if (!cleaned) continue;
    if (cleaned.length <= MAX_STEP_CHARS) steps.push(cleaned);
    else steps.push(...chunk(splitSentences(cleaned)).map(tidy));
  }
  const kept = steps.filter((s) => s.replace(/[^a-z]/gi, '').length >= 3);
  // A recipe written as one paragraph is easier to cook from in short steps.
  const only = kept.length === 1 ? kept[0] : undefined;
  if (only !== undefined) {
    const sentences = splitSentences(only);
    if (sentences.length >= 3) return chunk(sentences, SINGLE_PARAGRAPH_STEP_CHARS, SINGLE_PARAGRAPH_STEP_SENTENCES).map(tidy);
  }
  return kept;
}

const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  'forty-five': 45,
  sixty: 60,
  'a couple of': 2,
  'a few': 3,
  'half an': 0.5,
  'half a': 0.5,
};

const NUM = String.raw`(?:\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d\/\d|a couple of|a few|half an|half a|forty-five|an|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|sixty)`;
const UNIT = String.raw`(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b`;
const DURATION = new RegExp(
  String.raw`(?:(\b(?:within|every|than|up to|for up to|last|first|over)\s+(?:the\s+)?(?:about\s+|another\s+)?)?)\b(${NUM})(?:\s*(?:-|–|to|or)\s*(${NUM}))?\s*-?\s*${UNIT}(?:\s*(?:and\s*)?(\d+)\s*(minutes?|mins?)\b)?`,
  'gi',
);

function toNumber(token: string): number | null {
  const t = token.toLowerCase().trim();
  if (t in WORD_NUMBERS) return WORD_NUMBERS[t] ?? null;
  return parseNumber(t);
}

function unitSeconds(unit: string): number | null {
  const u = unit.toLowerCase();
  if (u.startsWith('h')) return 3600;
  if (u.startsWith('m')) return 60;
  if (u.startsWith('s')) return 1;
  return null;
}

const MAX_TIMER_SECONDS = 24 * 3600;

const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
/** "twenty-four", "thirty five" -> 24, 35 (so they are not read as ranges). */
const COMPOUND_NUMBER = /\b(twenty|thirty|forty|fifty)[- ](one|two|three|four|five|six|seven|eight|nine)\b/gi;

/**
 * Detects how long a step asks you to wait ("simmer for 20 minutes", "bake 1 hour 15 minutes").
 * Ranges use the lower bound so the cook checks early; when a step names several durations the
 * longest is used. Phrases like "within 2 hours" or "every 5 minutes" are not timers.
 */
export function detectTimerSeconds(step: string): number | null {
  let best: number | null = null;
  // Unicode fractions become decimals first, so "1½ hours" and "1 ½ hours" both read as 1.5.
  const text = replaceUnicodeFractions(step).replace(COMPOUND_NUMBER, (_, tens: string, ones: string) => String((TENS[tens.toLowerCase()] ?? 0) + (WORD_NUMBERS[ones.toLowerCase()] ?? 0)));
  for (const match of text.matchAll(DURATION)) {
    const [, excluded, lowText, , unitText, extraMinutes] = match;
    if (excluded) continue;
    if (!lowText || !unitText) continue;
    // Single-letter units ("20m", "1h") only count after a numeral, never after "a"/"an".
    if (unitText.length === 1 && !/\d$/.test(lowText)) continue;
    const low = toNumber(lowText);
    const seconds = unitSeconds(unitText);
    if (low === null || seconds === null || low <= 0) continue;
    let total = low * seconds;
    if (extraMinutes && seconds === 3600) total += Number(extraMinutes) * 60;
    if (total < 5 || total > MAX_TIMER_SECONDS) continue;
    best = best === null ? total : Math.max(best, total);
  }
  return best === null ? null : Math.round(best);
}
