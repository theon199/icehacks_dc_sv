import { stepTextSize } from './CoachStepView';

describe('stepTextSize', () => {
  it('keeps short steps at the across-the-room size', () => {
    expect(stepTextSize('Add the peas and simmer for 2 minutes.').fontSize).toBe(30);
  });

  it('steps down for longer catalog steps so they fit without scrolling', () => {
    expect(stepTextSize('a'.repeat(150)).fontSize).toBe(24);
    expect(stepTextSize('a'.repeat(330)).fontSize).toBe(20);
  });
});
