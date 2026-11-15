import { ApiError } from '@/lib/api/errors';
import type { RecipeDetail } from '@/lib/catalog';

import {
  answerReply,
  buildCoachRequest,
  describeDuration,
  doneTitle,
  errorReply,
  primaryAction,
  ringOnTile,
  timerDoneReply,
  READY,
} from './coachStatus';

const recipe = {
  id: 'mealdb:52865',
  title: 'Matar Paneer',
  steps: [
    { position: 0, text: 'Fry the onion.', timerSeconds: null },
    { position: 1, text: 'Add the peas and simmer for 2 minutes', timerSeconds: 120 },
    { position: 2, text: 'Divide between two bowls', timerSeconds: null },
  ],
} as unknown as RecipeDetail;

describe('describeDuration', () => {
  it.each([
    [120, '2 minutes'],
    [60, '1 minute'],
    [30, '30 seconds'],
    [90, '1 minute 30 seconds'],
    [3600, '1 hour'],
    [5400, '1 hour 30 minutes'],
    [3661, '1 hour 1 minute'],
    [0, '0 seconds'],
  ])('%p seconds reads %p', (seconds, text) => {
    expect(describeDuration(seconds)).toBe(text);
  });
});

describe('timer done', () => {
  it('names the timer and what comes next', () => {
    expect(doneTitle('Peas')).toBe('Peas are done');
    expect(doneTitle('Naan')).toBe('Naan is done');
    expect(doneTitle('Step 2')).toBe('Step 2 is done');
    expect(doneTitle('Glass')).toBe('Glass is done');
    expect(timerDoneReply('Peas', recipe.steps, 1)).toEqual({
      status: {
        kind: 'timer_done',
        title: 'Peas are done',
        next: 'Next: Divide between two bowls',
        ringing: true,
      },
      say: 'Peas are done. Next: Divide between two bowls',
    });
    expect(timerDoneReply('Naan', recipe.steps, 2).status).toMatchObject({
      next: 'That was the last step.',
    });
  });
});

describe('primaryAction', () => {
  const notYet = answerReply(
    'Is this stirred enough?',
    {
      verdict: 'not_yet',
      answer: 'A few more stirs.',
      focus: null,
      quota: { remaining: 1, reset_at: 'x' },
    },
    null,
    null,
  ).status;
  it('silences an alarm first, then re-checks a "not yet", then moves on', () => {
    expect(primaryAction(READY, true, false)).toBe('stop_alarm');
    expect(primaryAction(notYet, false, false)).toBe('check_again');
    expect(primaryAction(notYet, false, true)).toBe('check_again');
    expect(primaryAction(READY, false, true)).toBe('finish');
    expect(primaryAction(READY, false, false)).toBe('next');
  });
});

describe('buildCoachRequest', () => {
  it('sends the step on screen, the next one, the person’s diet and allergens, and the photo', () => {
    expect(
      buildCoachRequest(
        recipe,
        1,
        '  Is this   stirred enough? ',
        { diets: ['vegetarian'], allergens: ['peanut'] },
        'BASE64',
      ),
    ).toEqual({
      recipe: {
        id: 'mealdb:52865',
        title: 'Matar Paneer',
        step_index: 1,
        step_count: 3,
        step: 'Add the peas and simmer for 2 minutes',
        next_step: 'Divide between two bowls',
      },
      question: 'Is this stirred enough?',
      image: 'BASE64',
      diet: ['vegetarian'],
      allergens: ['peanut'],
    });
  });

  it('leaves out the photo and the next step when there are none, and stays inside the limits', () => {
    const request = buildCoachRequest(
      recipe,
      2,
      'x'.repeat(400),
      { diets: [], allergens: [] },
      null,
    );
    expect(request.image).toBeUndefined();
    expect(request.recipe.next_step).toBeUndefined();
    expect(request.question).toHaveLength(300);
  });
});

describe('answerReply', () => {
  it('drops the focus when no photo went with the question', () => {
    const reply = answerReply(
      'Is it golden?',
      {
        verdict: 'unsure',
        answer: 'Hard to say.',
        focus: { x: 0.5, y: 0.5, r: 0.1 },
        quota: { remaining: 3, reset_at: 'x' },
      },
      null,
      'camera_off',
    );
    expect(reply.status).toMatchObject({ kind: 'answer', focus: null, withoutPhoto: 'camera_off' });
    expect(reply.say).toBe('Hard to say.');
  });
});

describe('errorReply', () => {
  const apiError = (init: Partial<ConstructorParameters<typeof ApiError>[0]>) =>
    new ApiError({ kind: 'server', functionName: 'coach', ...init });

  it('is honest about being offline, out of questions, too young, refused or failing', () => {
    expect(errorReply(apiError({ kind: 'network' })).status).toEqual({ kind: 'offline' });
    const quota = errorReply(
      apiError({ kind: 'rate_limited', code: 'quota_exceeded', retryAfterSeconds: 3 * 3600 }),
    );
    expect(quota.status).toEqual({
      kind: 'quota',
      message:
        "You've asked all of today's coach questions. They come back in about 3 hours. Timers and steps still work.",
    });
    expect(errorReply(apiError({ kind: 'forbidden', code: 'age_restricted' })).status).toEqual({
      kind: 'error',
      message: 'Coach answers are only for adults (18+). Timers and steps still work.',
    });
    expect(
      errorReply(
        apiError({ kind: 'validation', code: 'ai_refused', serverMessage: 'Not that one.' }),
      ).say,
    ).toBe('Not that one.');
    expect(errorReply(apiError({ kind: 'timeout' })).say).toBe(
      'That took too long. Ask again in a moment.',
    );
    expect(errorReply(new Error('boom')).status.kind).toBe('error');
  });
});

describe('ringOnTile', () => {
  const photo = { width: 1200, height: 1600 };
  const tile = { width: 112, height: 144 };

  it('maps a spot in the photo onto the mirrored, cropped preview', () => {
    const ring = ringOnTile({ x: 0.25, y: 0.5, r: 0.1 }, photo, tile, true);
    // Cover scale is 144 / 1600 = 0.09 → the photo shows 108 wide, so it is scaled by width instead.
    expect(ring).not.toBeNull();
    expect(ring!.left + ring!.size / 2).toBeCloseTo(84, 0);
    expect(ring!.top + ring!.size / 2).toBeCloseTo(72, 0);
    expect(
      ringOnTile({ x: 0.25, y: 0.5, r: 0.1 }, photo, tile, false)!.left + ring!.size / 2,
    ).toBeCloseTo(28, 0);
  });

  it('keeps the ring a visible size and hides spots cropped out of the tile', () => {
    expect(ringOnTile({ x: 0.5, y: 0.5, r: 0.02 }, photo, tile, false)!.size).toBe(24);
    expect(
      ringOnTile({ x: 0.01, y: 0.5, r: 0.1 }, { width: 1600, height: 1200 }, tile, false),
    ).toBeNull();
    expect(ringOnTile({ x: 0.5, y: 0.5, r: 0.1 }, { width: 0, height: 0 }, tile, false)).toBeNull();
  });
});
