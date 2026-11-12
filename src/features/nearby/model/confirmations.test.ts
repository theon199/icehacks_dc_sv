import {
  MAX_CONFIRMATION_RECORDS,
  answerToday,
  applyAnswer,
  canConfirm,
  confirmationKey,
  confirmationPrompt,
  localDay,
  withConfirmation,
  withoutConfirmation,
  type ConfirmationLog,
} from './confirmations';

const key = confirmationKey('user-1', 'pad_thai', 'place-a');
const morning = new Date(2026, 10, 11, 8, 30);
const evening = new Date(2026, 10, 11, 23, 59);
const nextDay = new Date(2026, 10, 12, 0, 1);

describe('localDay', () => {
  it('uses the local calendar date with zero padding', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 0))).toBe('2026-01-05');
  });
});

describe('once-per-day confirmations', () => {
  it('allows the first answer of the day', () => {
    expect(canConfirm({}, key, morning)).toBe(true);
    const log = withConfirmation({}, key, true, morning);
    expect(answerToday(log, key, morning)).toBe(true);
  });

  it('ignores a second answer on the same day, even a different one', () => {
    const log = withConfirmation({}, key, true, morning);
    expect(canConfirm(log, key, evening)).toBe(false);
    const again = withConfirmation(log, key, false, evening);
    expect(again).toBe(log);
    expect(answerToday(again, key, evening)).toBe(true);
  });

  it('allows a new answer on the next local day', () => {
    const log = withConfirmation({}, key, true, evening);
    expect(canConfirm(log, key, nextDay)).toBe(true);
    const updated = withConfirmation(log, key, false, nextDay);
    expect(answerToday(updated, key, nextDay)).toBe(false);
  });

  it('keeps answers separate per place, dish and person', () => {
    const log = withConfirmation({}, key, true, morning);
    expect(canConfirm(log, confirmationKey('user-1', 'pad_thai', 'place-b'), morning)).toBe(true);
    expect(canConfirm(log, confirmationKey('user-1', 'pho', 'place-a'), morning)).toBe(true);
    expect(canConfirm(log, confirmationKey('user-2', 'pad_thai', 'place-a'), morning)).toBe(true);
  });

  it('lets the person answer again after a failed save is forgotten', () => {
    const log = withConfirmation({}, key, true, morning);
    const cleared = withoutConfirmation(log, key);
    expect(canConfirm(cleared, key, morning)).toBe(true);
    expect(withoutConfirmation(cleared, key)).toBe(cleared);
  });

  it('prunes the oldest days once the log is full', () => {
    let log: ConfirmationLog = {};
    const oldDay = new Date(2026, 0, 1);
    log = withConfirmation(log, 'old', true, oldDay);
    for (let i = 0; i < MAX_CONFIRMATION_RECORDS; i += 1) {
      log = withConfirmation(log, `k${i}`, true, morning);
    }
    expect(Object.keys(log)).toHaveLength(MAX_CONFIRMATION_RECORDS);
    expect(log.old).toBeUndefined();
    expect(log[`k${MAX_CONFIRMATION_RECORDS - 1}`]).toBeDefined();
  });
});

describe('confirmationPrompt', () => {
  it('asks, with the earlier server answer as context', () => {
    expect(confirmationPrompt({}, key, false, morning)).toEqual({ kind: 'ask', previous: false });
  });

  it('thanks the person after answering today', () => {
    const log = withConfirmation({}, key, false, morning);
    expect(confirmationPrompt(log, key, true, evening)).toEqual({ kind: 'thanks', hadIt: false });
  });

  it('asks again the next day', () => {
    const log = withConfirmation({}, key, false, morning);
    expect(confirmationPrompt(log, key, false, nextDay)).toEqual({
      kind: 'ask',
      previous: false,
    });
  });
});

describe('applyAnswer', () => {
  it('adds a first answer', () => {
    expect(applyAnswer({ yesCount: 2, noCount: 1, myAnswer: null }, true)).toEqual({
      yesCount: 3,
      noCount: 1,
      myAnswer: true,
    });
  });

  it('moves a changed answer from one side to the other', () => {
    expect(applyAnswer({ yesCount: 2, noCount: 1, myAnswer: true }, false)).toEqual({
      yesCount: 1,
      noCount: 2,
      myAnswer: false,
    });
  });

  it('never goes below zero on inconsistent input', () => {
    expect(applyAnswer({ yesCount: 0, noCount: 0, myAnswer: true }, false)).toEqual({
      yesCount: 0,
      noCount: 1,
      myAnswer: false,
    });
  });
});
