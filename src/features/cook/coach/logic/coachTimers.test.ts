import {
  findTimer,
  planTimerIntent,
  stepTimerHint,
  voiceTimerId,
  type TimerContext,
} from './coachTimers';
import {
  MAX_TIMERS,
  startTimer,
  stepTimerId,
  type CookTimer,
  type TimerMap,
} from '../../logic/timers';

const NOW = 1_000_000;
const steps = [
  { position: 0, text: 'Fry the onion.', timerSeconds: null },
  { position: 1, text: 'Add the peas and simmer for 2 minutes', timerSeconds: 120 },
];

function timer(
  id: string,
  label: string,
  ms: number,
  status: CookTimer['status'] = 'running',
): CookTimer {
  return {
    id,
    label,
    stepIndex: null,
    durationMs: ms,
    status,
    endsAt: status === 'running' ? NOW + ms : null,
    remainingMs: status === 'done' ? 0 : ms,
  };
}

const map = (...list: CookTimer[]): TimerMap => Object.fromEntries(list.map((t) => [t.id, t]));

const ctx = (over: Partial<TimerContext> = {}): TimerContext => ({
  timers: {},
  ringing: new Set(),
  steps,
  step: 1,
  now: NOW,
  ...over,
});

describe('planTimerIntent: setting timers', () => {
  it('starts a named timer and confirms it out loud', () => {
    const plan = planTimerIntent({ type: 'set_timer', seconds: 120, label: 'peas' }, ctx());
    expect(plan.start).toEqual({
      id: 'coach:peas',
      label: 'Peas',
      stepIndex: null,
      durationMs: 120_000,
    });
    expect(plan.reply).toEqual({
      status: { kind: 'timer_set', message: 'Peas, 2 minutes. Timer set.' },
      say: 'Peas, 2 minutes. Timer set.',
    });
  });

  it('uses the step’s own timer for "set a timer"', () => {
    const plan = planTimerIntent({ type: 'set_timer', seconds: null, label: null }, ctx());
    expect(plan.start).toEqual({
      id: stepTimerId(1),
      label: 'Step 2',
      stepIndex: 1,
      durationMs: 120_000,
    });
    expect(plan.reply.say).toBe('Step 2, 2 minutes. Timer set.');
  });

  it('gives a named timer the step’s length when no length is said', () => {
    const plan = planTimerIntent({ type: 'set_timer', seconds: null, label: 'peas' }, ctx());
    expect(plan.start?.durationMs).toBe(120_000);
    expect(plan.start?.label).toBe('Peas');
  });

  it('asks how long when neither the phrase nor the step gives a length', () => {
    const plan = planTimerIntent(
      { type: 'set_timer', seconds: null, label: 'naan' },
      ctx({ step: 0 }),
    );
    expect(plan.start).toBeUndefined();
    expect(plan.reply.say).toBe('How long for the naan? Say "set a 5 minute timer for naan".');
  });

  it('numbers unnamed timers', () => {
    const timers = map(timer('coach-1', 'Timer 1', 60_000));
    const plan = planTimerIntent({ type: 'set_timer', seconds: 300, label: null }, ctx({ timers }));
    expect(plan.start?.label).toBe('Timer 2');
    expect(plan.reply.say).toBe('Timer 2, 5 minutes. Timer set.');
  });

  it('will not start the same name twice, or more than the limit', () => {
    const peas = map(timer('coach:peas', 'Peas', 60_000));
    const again = planTimerIntent(
      { type: 'set_timer', seconds: 60, label: 'peas' },
      ctx({ timers: peas }),
    );
    expect(again.start).toBeUndefined();
    expect(again.reply.say).toBe('The Peas timer is already going.');

    let full: TimerMap = {};
    for (let i = 0; i < MAX_TIMERS; i += 1) {
      full = startTimer(
        full,
        { id: `t${i}`, label: `T${i}`, stepIndex: null, durationMs: 60_000 },
        NOW,
      );
    }
    const crowded = planTimerIntent(
      { type: 'set_timer', seconds: 60, label: 'rice' },
      ctx({ timers: full }),
    );
    expect(crowded.reply.say).toBe(
      `You already have ${MAX_TIMERS} timers. Stop one to start another.`,
    );
  });

  it('asks again when the length was not understood', () => {
    expect(planTimerIntent({ type: 'timer_unclear', label: 'peas' }, ctx()).reply.say).toBe(
      'How long? Say "set a 5 minute timer for peas".',
    );
  });
});

describe('planTimerIntent: stopping and asking', () => {
  const peas = timer('coach:peas', 'Peas', 72_000);
  const naan = timer('coach:naan', 'Naan', 300_000);

  it('cancels a timer by name, forgiving plurals and near spellings', () => {
    const timers = map(peas, naan);
    expect(
      planTimerIntent({ type: 'stop_timer', label: 'pea', all: false }, ctx({ timers })),
    ).toEqual({
      remove: ['coach:peas'],
      reply: {
        status: { kind: 'info', message: 'Peas timer cancelled.' },
        say: 'Peas timer cancelled.',
      },
    });
    expect(
      planTimerIntent({ type: 'stop_timer', label: 'nan', all: false }, ctx({ timers })).remove,
    ).toEqual(['coach:naan']);
    expect(
      planTimerIntent({ type: 'stop_timer', label: 'rice', all: false }, ctx({ timers })).reply.say,
    ).toBe("There's no rice timer.");
  });

  it('silences what is ringing before touching running timers', () => {
    const done = timer('coach:peas', 'Peas', 0, 'done');
    const timers = map(done, naan);
    const plan = planTimerIntent(
      { type: 'stop_timer', label: null, all: false },
      ctx({ timers, ringing: new Set(['coach:peas']) }),
    );
    expect(plan.remove).toEqual(['coach:peas']);
    expect(plan.reply.say).toBe('Peas timer stopped.');
  });

  it('cancels the only running timer, but asks which when there are several', () => {
    expect(
      planTimerIntent({ type: 'stop_timer', label: null, all: false }, ctx({ timers: map(naan) }))
        .remove,
    ).toEqual(['coach:naan']);
    const several = planTimerIntent(
      { type: 'stop_timer', label: null, all: false },
      ctx({ timers: map(peas, naan) }),
    );
    expect(several.remove).toBeUndefined();
    expect(several.reply.say).toBe('Which one? Say "cancel the" and its name.');
    expect(
      planTimerIntent(
        { type: 'stop_timer', label: null, all: true },
        ctx({ timers: map(peas, naan) }),
      ).remove,
    ).toEqual(['coach:peas', 'coach:naan']);
    expect(planTimerIntent({ type: 'stop_timer', label: null, all: false }, ctx()).reply.say).toBe(
      'No timers are running.',
    );
  });

  it('says how long is left on one timer or all of them', () => {
    const timers = map(peas, naan);
    expect(planTimerIntent({ type: 'time_left', label: 'naan' }, ctx({ timers })).reply.say).toBe(
      'Naan: 5 minutes left.',
    );
    expect(planTimerIntent({ type: 'time_left', label: null }, ctx({ timers })).reply.say).toBe(
      'Peas: 1 minute 12 seconds left. Naan: 5 minutes left.',
    );
    expect(planTimerIntent({ type: 'time_left', label: null }, ctx()).reply.say).toBe(
      'No timers are running.',
    );
  });
});

describe('helpers', () => {
  it('finds timers by name', () => {
    const list = [timer('a', 'Garlic bread', 1), timer('b', 'Peas', 1)];
    expect(findTimer(list, 'garlic bread')?.id).toBe('a');
    expect(findTimer(list, 'garlic')?.id).toBe('a');
    expect(findTimer(list, 'Pea')?.id).toBe('b');
    expect(findTimer(list, 'rice')).toBeUndefined();
  });

  it('gives each name one id', () => {
    expect(voiceTimerId('garlic bread', 5)).toBe('coach:garlic-bread');
    expect(voiceTimerId(null, 5)).toBe('coach-5');
  });

  it('writes the step timer hint', () => {
    expect(stepTimerHint(120)).toBe('This step has a 2 minute timer. Say "set a timer".');
    expect(stepTimerHint(90)).toBe('This step has a 1:30 timer. Say "set a timer".');
  });
});
