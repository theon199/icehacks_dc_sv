import { ARCHIVED_WEEK_MESSAGE, addedToPlanToast } from './planToast';

describe('addedToPlanToast', () => {
  it('counts the meals that landed', () => {
    expect(addedToPlanToast({ offered: 3, placed: 3, archived: false })).toEqual({
      message: 'Added 3 meals to your plan',
      tone: 'success',
    });
    expect(addedToPlanToast({ offered: 1, placed: 1, archived: false }).message).toBe(
      'Added 1 meal to your plan',
    );
  });

  it('says why some meals did not land', () => {
    expect(addedToPlanToast({ offered: 4, placed: 2, archived: false }).message).toBe(
      'Added 2 meals to your plan. The rest had been planned in the meantime.',
    );
    expect(addedToPlanToast({ offered: 6, placed: 3, archived: true }).message).toBe(
      'Added 3 meals to your plan. An archived week was left as it is.',
    );
  });

  it('never reports adding nothing', () => {
    expect(addedToPlanToast({ offered: 3, placed: 0, archived: false })).toEqual({
      message: 'Those meals are already planned',
      tone: 'neutral',
    });
    expect(addedToPlanToast({ offered: 3, placed: 0, archived: true })).toEqual({
      message: ARCHIVED_WEEK_MESSAGE,
      tone: 'neutral',
    });
  });
});
