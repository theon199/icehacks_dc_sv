/**
 * Hands-free commands for cook mode: "next", "back", "repeat" and "start (a 5 minute) timer".
 *
 * Kitchens are noisy and people talk while they cook, so a phrase only counts as a command when
 * every word in it belongs to the command vocabulary ("okay, next step please" is a command;
 * "I put it back" is not). Recognition sessions end at each pause, so a command said after a short
 * pause is always heard on its own.
 */

export type VoiceCommand =
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'repeat' }
  /** `seconds` is null when no duration was said: start the current step's timer. */
  | { type: 'start_timer'; seconds: number | null };

type Intent = 'next' | 'back' | 'repeat' | 'timer';

const INTENT_WORDS: Readonly<Record<string, Intent>> = {
  next: 'next',
  forward: 'next',
  forwards: 'next',
  continue: 'next',
  onward: 'next',
  onwards: 'next',
  skip: 'next',
  back: 'back',
  backward: 'back',
  backwards: 'back',
  previous: 'back',
  repeat: 'repeat',
  again: 'repeat',
  reread: 'repeat',
  timer: 'timer',
  timing: 'timer',
  countdown: 'timer',
};

/** Words that can surround a command without changing it. */
const FILLER = new Set([
  'a',
  'alright',
  'an',
  'and',
  'begin',
  'can',
  'could',
  'famara',
  'for',
  'go',
  'hey',
  'it',
  'just',
  'lets',
  'me',
  'more',
  'move',
  'now',
  'oh',
  'ok',
  'okay',
  'on',
  'one',
  'please',
  'read',
  'say',
  'set',
  'so',
  'start',
  'step',
  'thank',
  'thanks',
  'that',
  'the',
  'then',
  'time',
  'to',
  'uh',
  'um',
  'up',
  'us',
  'well',
  'you',
  'yes',
]);

/** Words that turn a timer phrase into something we must not act on ("stop the timer"). */
const NEGATORS = new Set(['stop', 'cancel', 'pause', 'end', 'reset', 'clear', 'dont', 'no', 'not']);

const UNIT_SECONDS: Readonly<Record<string, number>> = {
  second: 1,
  seconds: 1,
  sec: 1,
  secs: 1,
  minute: 60,
  minutes: 60,
  min: 60,
  mins: 60,
  hour: 3600,
  hours: 3600,
  hr: 3600,
  hrs: 3600,
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
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
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

const MAX_TIMER_SECONDS = 12 * 3600;

/** Lowercase words with punctuation removed; hyphenated words split ("five-minute"). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, '')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/^\.+|\.+$/g, ''))
    .filter((word) => word.length > 0);
}

function numberValue(word: string): number | null {
  if (/^\d+(\.\d+)?$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

const isNumberish = (word: string) =>
  numberValue(word) !== null || word === 'half' || word === 'quarter';

/**
 * Reads a spoken duration: "5 minutes", "twenty five seconds", "an hour and a half",
 * "half a minute", "1.5 hours". Returns null when no complete duration (number + unit) was said.
 */
export function parseDuration(words: readonly string[]): number | null {
  let total = 0;
  let found = false;
  let pending: number | null = null;
  let lastUnit: number | null = null;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    const unit = UNIT_SECONDS[word];
    if (unit !== undefined) {
      total += (pending ?? 1) * unit;
      found = found || pending !== null || isArticle(words[i - 1]);
      lastUnit = unit;
      pending = null;
      continue;
    }
    if (word === 'half' || word === 'quarter') {
      const fraction = word === 'half' ? 0.5 : 0.25;
      // "an hour and a half" adds to the unit just said; "half a minute" waits for its unit.
      if (lastUnit !== null && pending === null && words[i - 2] === 'and') {
        total += fraction * lastUnit;
        found = true;
      } else {
        pending = (pending ?? 0) + fraction;
      }
      continue;
    }
    const value = numberValue(word);
    if (value !== null) {
      // "twenty five" → 25; "one and a half" → 1.5 (handled by the half branch).
      pending = pending !== null && pending >= 20 && value < 10 ? pending + value : value;
    }
  }
  if (!found || total <= 0) return null;
  return Math.min(Math.round(total), MAX_TIMER_SECONDS);
}

function isArticle(word: string | undefined): boolean {
  return word === 'a' || word === 'an';
}

export type Classification =
  | { status: 'command'; command: VoiceCommand }
  /** A timer phrase that may still be getting its duration; wait for more words. */
  | { status: 'pending' }
  | { status: 'none' };

/**
 * Decides what a phrase means. `final` is false while the recogniser is still listening: a timer
 * phrase without a finished duration is then held back, in case "for five minutes" follows.
 */
export function classify(words: readonly string[], { final }: { final: boolean }): Classification {
  if (words.length === 0) return { status: 'none' };
  let intent: Intent | null = null;
  let negated = false;
  for (const word of words) {
    const wordIntent = INTENT_WORDS[word];
    if (wordIntent) {
      // A timer request wins over the step words it may contain ("timer for the next step").
      if (intent !== 'timer') intent = wordIntent;
      continue;
    }
    if (NEGATORS.has(word)) {
      negated = true;
      continue;
    }
    if (FILLER.has(word) || UNIT_SECONDS[word] !== undefined || isNumberish(word)) continue;
    return { status: 'none' };
  }
  // "go on" / "move on" use only filler words but clearly mean the next step.
  if (intent === null && words.includes('on') && (words.includes('go') || words.includes('move'))) {
    intent = 'next';
  }
  if (intent === null || negated) return { status: 'none' };
  if (intent !== 'timer') {
    // Numbers only make sense in a timer phrase ("go back two" is not something we can do).
    if (words.some((word) => numberValue(word) !== null && word !== 'one')) {
      return { status: 'none' };
    }
    return { status: 'command', command: { type: intent } };
  }
  const seconds = parseDuration(words);
  const last = words[words.length - 1] ?? '';
  // "for five minutes" or "a five minute timer": nothing more is coming that would change it.
  const complete =
    seconds !== null && (UNIT_SECONDS[last] !== undefined || INTENT_WORDS[last] === 'timer');
  if (!final && !complete) return { status: 'pending' };
  return { status: 'command', command: { type: 'start_timer', seconds } };
}

/** One-shot parse of a finished phrase. */
export function parseVoiceCommand(text: string): VoiceCommand | null {
  const result = classify(tokenize(text), { final: true });
  return result.status === 'command' ? result.command : null;
}

export interface VoiceCommandStream {
  /**
   * Feeds the recogniser's latest transcript for the current utterance. Returns the commands it
   * completes; each spoken command is returned once even though partial results repeat it.
   */
  push(transcript: string, isFinal: boolean): VoiceCommand[];
  /** Forget the current utterance (call when a new recognition session starts). */
  reset(): void;
}

/**
 * Turns the growing transcripts of one utterance into commands. Partial results let "next" act
 * as soon as it is heard; words already acted on are skipped so the final result does not repeat
 * the command.
 */
export function createVoiceCommandStream(): VoiceCommandStream {
  let consumed = 0;
  return {
    push(transcript, isFinal) {
      const words = tokenize(transcript);
      // The recogniser can revise a partial result into fewer words.
      if (words.length < consumed) consumed = words.length;
      const result = classify(words.slice(consumed), { final: isFinal });
      const commands: VoiceCommand[] = [];
      if (result.status === 'command') {
        commands.push(result.command);
        consumed = words.length;
      } else if (result.status === 'none' && hasCommandWord(words.slice(consumed))) {
        // Chatter mixed with a command word: skip it so a clean command after it still counts.
        consumed = words.length;
      }
      if (isFinal) consumed = 0;
      return commands;
    },
    reset() {
      consumed = 0;
    },
  };
}

function hasCommandWord(words: readonly string[]): boolean {
  return words.some((word) => INTENT_WORDS[word] !== undefined);
}

/** Phrases that help the recogniser expect our vocabulary (iOS contextual strings). */
export const VOICE_HINTS: readonly string[] = [
  'next',
  'next step',
  'back',
  'go back',
  'previous step',
  'repeat',
  'start timer',
  'start the timer',
  'set a timer for',
];
