/**
 * What the cooking coach hears, turned into intents. Everything here runs on the device: timers,
 * step changes and "how long is left" never reach the server, only questions do.
 *
 * The phone sits across the room and people talk while they cook, so anything beyond a bare step
 * command needs the wake phrase first: "Hey Famara, set a 2 minute timer for the peas". The match
 * is tolerant of how recognisers spell the name ("Hey Tamara", "hey for Mara"). Said on its own,
 * the wake phrase opens a short window in which the next phrase counts as addressed too.
 *
 * Without the wake phrase only the strict cook-mode vocabulary counts ("next", "go back",
 * "repeat that", "start the timer"), plus "stop" to silence a ringing timer.
 */
import {
  classify,
  isNumberish,
  isTimeUnit,
  parseDuration,
  tokenize,
} from '../../logic/voiceCommands';

export type CoachIntent =
  /** Only the wake phrase: listen for what comes next. */
  | { type: 'wake' }
  | { type: 'next' }
  | { type: 'back' }
  | { type: 'repeat' }
  /** `seconds` null: use the step's own timer. `label` null: no name was said. */
  | { type: 'set_timer'; seconds: number | null; label: string | null }
  /** A timer was asked for with a number but no unit ("a timer for five"). */
  | { type: 'timer_unclear'; label: string | null }
  /** Stops (or silences) the named timer, every timer, or the one that is ringing. */
  | { type: 'stop_timer'; label: string | null; all: boolean }
  | { type: 'time_left'; label: string | null }
  /** Anything else said to the coach: sent to the AI with a photo. */
  | { type: 'question'; text: string };

export interface CoachUtterance {
  /** True when the wake phrase was said, or the coach was already listening for a follow-up. */
  addressed: boolean;
  intent: CoachIntent | null;
}

const WAKE_NAME = 'famara';
const GREETINGS = new Set([
  'hey',
  'hi',
  'hay',
  'hei',
  'ok',
  'okay',
  'oi',
  'yo',
  'hello',
  'a',
  'eh',
]);
const LEADING_FILLER = new Set(['um', 'uh', 'er', 'erm', 'so', 'oh', 'and', 'well']);

/** Edit distance between two short words. */
export function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0] ?? 0;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(above + 1, (previous[j - 1] ?? 0) + 1, diagonal + cost);
      diagonal = above;
    }
  }
  return previous[b.length] ?? 0;
}

/**
 * Index of the first word after the wake phrase, or -1 when it was not said. The name may be
 * split across up to three words by the recogniser. After a clear greeting ("hey") two letters
 * may differ and after "a" (a misheard "hey") one may; with no greeting the name must be exact,
 * so "camera" or "Tamara" in passing does not wake it.
 */
export function findWakePhrase(words: readonly string[]): number {
  let i = 0;
  while (i < 2 && LEADING_FILLER.has(words[i] ?? '')) i += 1;
  const greeting = words[i] ?? '';
  const greeted = GREETINGS.has(greeting);
  if (greeted) i += 1;
  const tolerance = !greeted ? 0 : greeting === 'a' ? 1 : 2;
  for (let span = 1; span <= 3 && i + span <= words.length; span += 1) {
    const candidate = words.slice(i, i + span).join('');
    if (candidate.length < 4 || candidate.length > 9) continue;
    if (editDistance(candidate, WAKE_NAME) <= tolerance) return i + span;
  }
  return -1;
}

/** True when `text` starts with the wake phrase. */
export function saysWakePhrase(text: string): boolean {
  return findWakePhrase(tokenize(text)) >= 0;
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

const TIMER_WORDS = new Set(['timer', 'timers', 'countdown', 'alarm', 'alarms']);
const STOP_VERBS = new Set([
  'stop',
  'cancel',
  'silence',
  'dismiss',
  'kill',
  'end',
  'clear',
  'quiet',
]);
const OFF_VERBS = new Set(['turn', 'switch', 'shut']);
const ALL_WORDS = new Set(['all', 'every', 'everything', 'both']);
const QUESTION_START = new Set([
  'how',
  'hows',
  'what',
  'whats',
  'why',
  'should',
  'shall',
  'is',
  'are',
  'do',
  'does',
  'did',
  'when',
  'which',
  'where',
  'who',
  'can',
  'could',
  'would',
  'will',
  'was',
  'if',
]);
const NEGATIONS = new Set(['dont', 'not', 'no', 'never']);
/** Openers that change nothing: "please", "okay", "can you", "could you". */
const POLITE = new Set(['please', 'ok', 'okay', 'now', 'so', 'um', 'uh', 'also', 'then', 'just']);
const ASKING = new Set(['can', 'could', 'would', 'will']);
/** A phrase made only of these is not worth answering ("thanks", "never mind"). */
const NOTHING = new Set([
  'thanks',
  'thank',
  'you',
  'cheers',
  'cool',
  'great',
  'nice',
  'never',
  'mind',
  'nevermind',
  'ok',
  'okay',
  'good',
  'hello',
  'hi',
  'please',
]);
/** Words around a timer that are never part of its name. */
const NOT_LABEL = new Set([
  ...TIMER_WORDS,
  ...STOP_VERBS,
  ...OFF_VERBS,
  ...ALL_WORDS,
  ...QUESTION_START,
  ...POLITE,
  'a',
  'an',
  'the',
  'my',
  'our',
  'this',
  'that',
  'it',
  'its',
  'for',
  'on',
  'off',
  'of',
  'in',
  'to',
  'at',
  'with',
  'and',
  'set',
  'start',
  'make',
  'add',
  'put',
  'give',
  'get',
  'me',
  'us',
  'i',
  'id',
  'need',
  'want',
  'like',
  'one',
  'another',
  'more',
  'new',
  'second',
  'again',
  'left',
  'remaining',
  'longer',
  'long',
  'much',
  'time',
  'go',
  'has',
  'have',
  'there',
  'still',
  'until',
  'till',
  'ringing',
  'beeping',
  'going',
  'called',
  'named',
  'remind',
  'up',
  'step',
  'next',
  'previous',
  'be',
  's',
]);

const isDurationWord = (word: string) => isNumberish(word) || isTimeUnit(word);
const isLabelWord = (word: string) => !NOT_LABEL.has(word) && !isDurationWord(word);

const MAX_LABEL_WORDS = 3;
const MAX_LABEL_CHARS = 24;

function asLabel(words: readonly string[]): string | null {
  const kept = words.slice(0, MAX_LABEL_WORDS).join(' ').slice(0, MAX_LABEL_CHARS).trim();
  return kept === '' ? null : kept;
}

/** Name words right after `index`, skipping articles: "for the peas" → peas. */
function labelAfter(words: readonly string[], index: number): string | null {
  let i = index + 1;
  while (['the', 'my', 'our', 'a', 'an'].includes(words[i] ?? '')) i += 1;
  const taken: string[] = [];
  while (i < words.length && isLabelWord(words[i] ?? '')) {
    taken.push(words[i] ?? '');
    i += 1;
  }
  return asLabel(taken);
}

/** Name words right before `index`: "the rice timer" → rice. */
function labelBefore(words: readonly string[], index: number): string | null {
  const taken: string[] = [];
  for (let i = index - 1; i >= 0 && isLabelWord(words[i] ?? ''); i -= 1) {
    taken.unshift(words[i] ?? '');
  }
  return asLabel(taken.slice(-MAX_LABEL_WORDS));
}

/** The name of a timer being set: "for the peas", "the peas timer", "set the rice for ...". */
function timerLabel(words: readonly string[]): string | null {
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? '';
    if (word === 'for' || word === 'on' || word === 'called' || word === 'named') {
      const label = labelAfter(words, i);
      if (label) return label;
    }
  }
  const timerAt = words.findIndex((word) => TIMER_WORDS.has(word));
  if (timerAt > 0) {
    const label = labelBefore(words, timerAt);
    if (label) return label;
  }
  if (words[0] === 'set' || words[0] === 'start') return labelAfter(words, 0);
  return null;
}

/** Every name word in a stop or "how long" phrase: "cancel the peas timer" → peas. */
function namedLabel(words: readonly string[]): string | null {
  return asLabel(words.filter(isLabelWord));
}

/**
 * The words a duration is read from. "One" standing for a timer ("and one for the naan") and
 * "second" as an ordinal ("a second timer", but not "a 30 second timer") are not part of a
 * duration.
 */
function durationWords(words: readonly string[]): string[] {
  return words.filter((word, i) => {
    const next = words[i + 1];
    if (word === 'one')
      return !(next === undefined || ['for', 'more', 'on', 'timer'].includes(next));
    if (word === 'second') {
      const ordinal = (next === 'timer' || next === 'one') && !isNumberish(words[i - 1] ?? '');
      return !ordinal;
    }
    return true;
  });
}

// ---------------------------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------------------------

function stripPolite(words: readonly string[]): string[] {
  let i = 0;
  for (;;) {
    const word = words[i] ?? '';
    if (POLITE.has(word)) i += 1;
    else if (ASKING.has(word) && words[i + 1] === 'you') i += 2;
    else break;
  }
  return words.slice(i);
}

function stopIntent(words: readonly string[]): CoachIntent | null {
  let rest: readonly string[];
  if (STOP_VERBS.has(words[0] ?? '')) rest = words.slice(1);
  else if (OFF_VERBS.has(words[0] ?? '') && words[1] === 'off') rest = words.slice(2);
  else return null;
  const all = rest.some((word) => ALL_WORDS.has(word));
  return { type: 'stop_timer', label: all ? null : namedLabel(rest), all };
}

function timeLeftIntent(words: readonly string[]): CoachIntent | null {
  const first = words[0] ?? '';
  if (!['how', 'hows', 'what', 'whats'].includes(first)) return null;
  const asksLeft =
    words.includes('left') ||
    words.includes('remaining') ||
    words.includes('longer') ||
    (words.includes('to') && words.includes('go'));
  const asksTimer =
    words.some((word) => TIMER_WORDS.has(word)) &&
    !words.some((word) => word === 'set' || word === 'start' || word === 'should');
  if (!asksLeft && !asksTimer) return null;
  return { type: 'time_left', label: namedLabel(words) };
}

function setTimerIntent(words: readonly string[]): CoachIntent | null {
  const first = words[0] ?? '';
  if (QUESTION_START.has(first) || words.some((word) => NEGATIONS.has(word))) return null;
  const forDuration = durationWords(words);
  const seconds = parseDuration(forDuration);
  const another =
    first === 'another' ||
    (first === 'and' && words[1] === 'one') ||
    (first === 'one' && words[1] === 'more');
  const label = timerLabel(words);
  const wanted =
    words.some((word) => TIMER_WORDS.has(word)) ||
    (another && (seconds !== null || label !== null)) ||
    ((first === 'set' || first === 'start' || first === 'remind') && seconds !== null);
  if (!wanted) return null;
  if (seconds === null && forDuration.some(isNumberish)) return { type: 'timer_unclear', label };
  return { type: 'set_timer', seconds, label };
}

function stepIntent(words: readonly string[]): CoachIntent | null {
  const result = classify(words, { final: true });
  if (result.status !== 'command') return null;
  const { command } = result;
  if (command.type === 'start_timer') {
    return { type: 'set_timer', seconds: command.seconds, label: null };
  }
  return { type: command.type };
}

/** What a phrase said to the coach (after the wake phrase) asks for. */
export function classifyAddressed(words: readonly string[], said: string): CoachIntent | null {
  const core = stripPolite(words);
  if (core.length === 0) return words.length === 0 ? { type: 'wake' } : null;
  if (core.every((word) => NOTHING.has(word))) return null;
  const intent =
    stopIntent(core) ?? timeLeftIntent(core) ?? setTimerIntent(core) ?? stepIntent(core);
  if (intent) return intent;
  return said === '' ? null : { type: 'question', text: said };
}

const QUIET_WORDS = new Set([
  ...STOP_VERBS,
  'the',
  'alarm',
  'timer',
  'timers',
  'it',
  'that',
  'please',
  'ok',
  'okay',
  'now',
]);

/** A phrase said without the wake phrase: only unmistakable commands count. */
function classifyUnaddressed(words: readonly string[]): CoachIntent | null {
  if (words.length === 0) return null;
  if (words.every((word) => QUIET_WORDS.has(word)) && words.some((word) => STOP_VERBS.has(word))) {
    return { type: 'stop_timer', label: null, all: false };
  }
  return stepIntent(words);
}

const QUESTION_MAX_CHARS = 300;

/** The question as said, from the first word after the wake phrase. */
function questionText(rawWords: readonly string[], fromRaw: number): string {
  const text = rawWords
    .slice(fromRaw)
    .join(' ')
    .replace(/^[\s,.;:!?-]+/, '')
    .trim()
    .slice(0, QUESTION_MAX_CHARS)
    .trim();
  return text === '' ? '' : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Reads one finished phrase. `awake` is true while the coach is still listening for a follow-up
 * after a bare wake phrase, so "is this stirred enough?" counts as addressed without the name.
 */
export function parseCoachUtterance(text: string, { awake }: { awake: boolean }): CoachUtterance {
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const words = rawWords.flatMap((raw, index) => tokenize(raw).map((norm) => ({ norm, index })));
  const norms = words.map((word) => word.norm);
  const wakeEnd = findWakePhrase(norms);
  if (wakeEnd < 0 && !awake) return { addressed: false, intent: classifyUnaddressed(norms) };
  const from = Math.max(0, wakeEnd);
  const rest = norms.slice(from);
  const firstRaw = words[from]?.index ?? rawWords.length;
  return { addressed: true, intent: classifyAddressed(rest, questionText(rawWords, firstRaw)) };
}

/** "peas" → "Peas", for cards and spoken confirmations. */
export function displayLabel(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Phrases that help the recogniser expect the coach's vocabulary (iOS contextual strings). */
export const COACH_HINTS: readonly string[] = [
  'Hey Famara',
  'Famara',
  'set a timer',
  'set a timer for',
  'how long is left',
  'cancel the timer',
  'stop',
  'next step',
  'go back',
  'repeat',
];
