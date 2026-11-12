import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectTimerSeconds, splitSentences, splitSteps } from '../src/parse/steps.ts';

describe('detectTimerSeconds', () => {
  it('reads simple durations', () => {
    assert.equal(detectTimerSeconds('Simmer 20 minutes.'), 1200);
    assert.equal(detectTimerSeconds('Bake for 1 hour.'), 3600);
    assert.equal(detectTimerSeconds('Whisk for 30 seconds.'), 30);
    assert.equal(detectTimerSeconds('Cook for 5 mins, stirring.'), 300);
    assert.equal(detectTimerSeconds('Roast 1 1/2 hours.'), 5400);
  });

  it('uses the lower bound of a range', () => {
    assert.equal(detectTimerSeconds('Cook for 20-25 minutes until golden.'), 1200);
    assert.equal(detectTimerSeconds('Cook 20 to 30 minutes.'), 1200);
  });

  it('combines hours and minutes', () => {
    assert.equal(detectTimerSeconds('Braise for 1 hour 15 minutes.'), 4500);
    assert.equal(detectTimerSeconds('Leave for 2 hours and 30 minutes.'), 9000);
  });

  it('reads number words', () => {
    assert.equal(detectTimerSeconds('Cook for one minute.'), 60);
    assert.equal(detectTimerSeconds('Rest for a few minutes.'), 180);
    assert.equal(detectTimerSeconds('Soak for twenty-four hours.'), 86400);
    assert.equal(detectTimerSeconds('Chill for half an hour.'), 1800);
  });

  it('takes the longest duration in a step', () => {
    assert.equal(detectTimerSeconds('Fry for 2 minutes, then simmer for 15 minutes.'), 900);
  });

  it('ignores storage advice, intervals and temperatures', () => {
    assert.equal(detectTimerSeconds('Refrigerate leftovers within 2 hours.'), null);
    assert.equal(detectTimerSeconds('Stir every 5 minutes.'), null);
    assert.equal(detectTimerSeconds('Preheat oven to 350 F (180C).'), null);
    assert.equal(detectTimerSeconds('Serve with 4 slices of bread.'), null);
    assert.equal(detectTimerSeconds('Cut into 5cm pieces.'), null);
  });
});

describe('splitSteps', () => {
  it('splits on line breaks and drops step labels', () => {
    const steps = splitSteps(['STEP 1\r\nHeat the oil in a pan.\r\n\r\nSTEP 2\r\nAdd the onion and fry gently.']);
    assert.deepEqual(steps, ['Heat the oil in a pan.', 'Add the onion and fry gently.']);
  });

  it('strips numbering and bullets', () => {
    assert.deepEqual(splitSteps(['1. Boil the pasta.\n2) Drain well.\n- Toss with sauce']), ['Boil the pasta.', 'Drain well.', 'Toss with sauce.']);
  });

  it('merges sub-headings into the following step', () => {
    assert.deepEqual(splitSteps(['For the sauce:\nWhisk soy sauce and honey together.']), ['For the sauce: Whisk soy sauce and honey together.']);
  });

  it('breaks very long paragraphs into sentence groups', () => {
    const sentence = 'Stir the mixture slowly over a low heat until it thickens and coats the back of the spoon.';
    const steps = splitSteps([Array.from({ length: 10 }, () => sentence).join(' ')]);
    assert.ok(steps.length > 1);
    assert.ok(steps.every((s) => s.length <= 420));
  });

  it('keeps abbreviations inside sentences', () => {
    assert.deepEqual(splitSentences('Add 1 tsp. salt and stir. Serve.'), ['Add 1 tsp. salt and stir.', 'Serve.']);
  });
});

describe('single-paragraph recipes', () => {
  it('are split into short steps', () => {
    const steps = splitSteps(['Heat the oil in a pan. Add the onion and cook until soft. Stir in the beans and tomatoes. Simmer for 10 minutes and serve.']);
    assert.ok(steps.length >= 2);
    assert.ok(steps.every((s) => s.length <= 200));
  });
});
