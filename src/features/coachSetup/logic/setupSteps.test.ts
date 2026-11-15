import {
  nextPosition,
  previousPosition,
  SETUP_STEPS,
  startDestination,
  VIEW_CHECK,
} from './setupSteps';

describe('setup steps', () => {
  it('has the four mounting steps in order, then the view check', () => {
    expect(SETUP_STEPS.map((step) => step.art)).toEqual(['door', 'phone', 'plate', 'view']);
    expect(VIEW_CHECK).toBe(4);
  });

  it('moves forward and stops at the view check', () => {
    expect(nextPosition(0)).toBe(1);
    expect(nextPosition(3)).toBe(VIEW_CHECK);
    expect(nextPosition(VIEW_CHECK)).toBe(VIEW_CHECK);
  });

  it('moves back and leaves setup from the first step', () => {
    expect(previousPosition(VIEW_CHECK)).toBe(3);
    expect(previousPosition(1)).toBe(0);
    expect(previousPosition(0)).toBeNull();
  });

  it('only sends people who may use AI to the coach', () => {
    expect(startDestination(true)).toBe('coach');
    expect(startDestination(false)).toBe('cook');
  });
});
