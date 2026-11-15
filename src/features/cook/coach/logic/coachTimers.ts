/**
 * Turns a timer intent into what to do with the cook-mode timer engine and what to say about it.
 * Pure: the hook passes in the timers and the clock, then applies the plan.
 */
import type { RecipeStep } from '@/lib/catalog';
import { formatClock } from '@/lib/format';

import { displayLabel, editDistance, type CoachIntent } from './coachCommands';
import { describeDuration, type CoachReply } from './coachStatus';
import { stepTimerLabel } from '../../logic/session';
import {
  MAX_TIMERS,
  remainingMs,
  startTimer,
  stepTimerId,
  type CookTimer,
  type NewTimer,
  type TimerMap,
} from '../../logic/timers';

export interface TimerContext {
  timers: TimerMap;
  /** Timers that finished and are still alerting. */
  ringing: ReadonlySet<string>;
  steps: readonly RecipeStep[];
  step: number;
  now: number;
}

export interface TimerPlan {
  start?: NewTimer;
  remove?: string[];
  reply: CoachReply;
}

type TimerIntent = Extract<
  CoachIntent,
  { type: 'set_timer' | 'timer_unclear' | 'stop_timer' | 'time_left' }
>;

const say = (message: string, kind: 'info' | 'timer_set' = 'info'): CoachReply => ({
  status: { kind, message },
  say: message,
});

const normal = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
const singular = (word: string) => word.replace(/(es|s)$/, '');

/** The timer a spoken name refers to: exact, then plural-insensitive, then a near spelling. */
export function findTimer(timers: readonly CookTimer[], label: string): CookTimer | undefined {
  const wanted = normal(label);
  const named = timers.map((timer) => ({ timer, name: normal(timer.label) }));
  return (
    named.find(({ name }) => name === wanted) ??
    named.find(({ name }) => singular(name) === singular(wanted)) ??
    named.find(({ name }) => name.includes(wanted) || wanted.includes(name)) ??
    named.find(({ name }) => wanted.length >= 3 && editDistance(name, wanted) <= 1)
  )?.timer;
}

/** Id for a timer started by voice: one per name, so "the peas" cannot be set twice at once. */
export function voiceTimerId(label: string | null, now: number): string {
  return label ? `coach:${normal(label).replace(/ /g, '-')}` : `coach-${now}`;
}

function unnamedLabel(timers: TimerMap): string {
  const taken = new Set(Object.values(timers).map((timer) => timer.label));
  let n = 1;
  while (taken.has(`Timer ${n}`)) n += 1;
  return `Timer ${n}`;
}

const active = (timer: CookTimer) => timer.status !== 'done';

function refusal(timers: TimerMap, input: NewTimer): CoachReply {
  const existing = timers[input.id];
  if (existing && active(existing)) return say(`The ${existing.label} timer is already going.`);
  return say(`You already have ${MAX_TIMERS} timers. Stop one to start another.`);
}

function planSet(
  intent: Extract<TimerIntent, { type: 'set_timer' }>,
  ctx: TimerContext,
): TimerPlan {
  const stepSeconds = ctx.steps[ctx.step]?.timerSeconds ?? null;
  const seconds = intent.seconds ?? stepSeconds;
  if (seconds === null) {
    const name = intent.label ? `the ${intent.label}` : 'it';
    return {
      reply: say(
        `How long for ${name}? Say "set a 5 minute timer for ${intent.label ?? 'the rice'}".`,
      ),
    };
  }
  const fromStep = intent.seconds === null && intent.label === null;
  const input: NewTimer = fromStep
    ? {
        id: stepTimerId(ctx.step),
        label: stepTimerLabel(ctx.step),
        stepIndex: ctx.step,
        durationMs: seconds * 1000,
      }
    : {
        id: voiceTimerId(intent.label, ctx.now),
        label: intent.label ? displayLabel(intent.label) : unnamedLabel(ctx.timers),
        stepIndex: null,
        durationMs: seconds * 1000,
      };
  if (startTimer(ctx.timers, input, ctx.now) === ctx.timers) {
    return { reply: refusal(ctx.timers, input) };
  }
  return {
    start: input,
    reply: say(`${input.label}, ${describeDuration(seconds)}. Timer set.`, 'timer_set'),
  };
}

function planStop(
  intent: Extract<TimerIntent, { type: 'stop_timer' }>,
  ctx: TimerContext,
): TimerPlan {
  const all = Object.values(ctx.timers);
  if (intent.all) {
    if (all.length === 0) return { reply: say('No timers are running.') };
    return { remove: all.map((timer) => timer.id), reply: say('All timers stopped.') };
  }
  if (intent.label) {
    const timer = findTimer(all, intent.label);
    if (!timer) return { reply: say(`There's no ${intent.label} timer.`) };
    const verb = timer.status === 'done' ? 'stopped' : 'cancelled';
    return { remove: [timer.id], reply: say(`${timer.label} timer ${verb}.`) };
  }
  const ringing = all.filter((timer) => ctx.ringing.has(timer.id) || timer.status === 'done');
  if (ringing.length > 0) {
    return {
      remove: ringing.map((timer) => timer.id),
      reply: say(ringing.length === 1 ? `${ringing[0]?.label} timer stopped.` : 'Alarms stopped.'),
    };
  }
  const running = all.filter(active);
  if (running.length === 1 && running[0]) {
    return { remove: [running[0].id], reply: say(`${running[0].label} timer cancelled.`) };
  }
  if (running.length === 0) return { reply: say('No timers are running.') };
  return { reply: say('Which one? Say "cancel the" and its name.') };
}

function leftPhrase(timer: CookTimer, now: number): string {
  if (timer.status === 'done') return `${timer.label} is done`;
  const seconds = Math.ceil(remainingMs(timer, now) / 1000);
  const paused = timer.status === 'paused' ? ', paused' : '';
  return `${timer.label}: ${describeDuration(seconds)} left${paused}`;
}

function planTimeLeft(
  intent: Extract<TimerIntent, { type: 'time_left' }>,
  ctx: TimerContext,
): TimerPlan {
  const all = Object.values(ctx.timers);
  if (all.length === 0) return { reply: say('No timers are running.') };
  if (intent.label) {
    const timer = findTimer(all, intent.label);
    if (!timer) return { reply: say(`There's no ${intent.label} timer.`) };
    return { reply: say(`${leftPhrase(timer, ctx.now)}.`) };
  }
  const sorted = [...all].sort((a, b) => remainingMs(a, ctx.now) - remainingMs(b, ctx.now));
  return { reply: say(`${sorted.map((timer) => leftPhrase(timer, ctx.now)).join('. ')}.`) };
}

export function planTimerIntent(intent: TimerIntent, ctx: TimerContext): TimerPlan {
  switch (intent.type) {
    case 'set_timer':
      return planSet(intent, ctx);
    case 'timer_unclear': {
      const name = intent.label ?? 'the rice';
      return { reply: say(`How long? Say "set a 5 minute timer for ${name}".`) };
    }
    case 'stop_timer':
      return planStop(intent, ctx);
    case 'time_left':
      return planTimeLeft(intent, ctx);
  }
}

/** The hint under a step that has its own timer and none running: "This step has a 2 minute timer." */
export function stepTimerHint(seconds: number): string {
  const whole = seconds % 60 === 0 && seconds < 3600;
  const length = whole ? `${seconds / 60} minute` : formatClock(seconds);
  return `This step has a ${length} timer. Say "set a timer".`;
}
