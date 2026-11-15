import {
  SHEET_DISMISS_MIN_DISTANCE,
  SHEET_DISMISS_VELOCITY,
  sheetDismissDistance,
  sheetHeightFor,
  shouldDismissSheet,
} from './sheetMotion';

describe('sheetDismissDistance', () => {
  it('is a share of a tall sheet', () => {
    expect(sheetDismissDistance(600)).toBeCloseTo(168);
  });

  it('never asks a short or unmeasured sheet for less than the floor', () => {
    expect(sheetDismissDistance(100)).toBe(SHEET_DISMISS_MIN_DISTANCE);
    expect(sheetDismissDistance(0)).toBe(SHEET_DISMISS_MIN_DISTANCE);
    expect(sheetDismissDistance(Number.NaN)).toBe(SHEET_DISMISS_MIN_DISTANCE);
  });
});

describe('shouldDismissSheet', () => {
  const sheetHeight = 600;

  it('dismisses a slow drag only once it has travelled far enough', () => {
    expect(shouldDismissSheet({ translationY: 160, velocityY: 100, sheetHeight })).toBe(false);
    expect(shouldDismissSheet({ translationY: 170, velocityY: 100, sheetHeight })).toBe(true);
  });

  it('dismisses a quick downward flick without the distance', () => {
    expect(
      shouldDismissSheet({ translationY: 20, velocityY: SHEET_DISMISS_VELOCITY, sheetHeight }),
    ).toBe(true);
  });

  it('never dismisses an upward drag or a touch, however fast', () => {
    expect(shouldDismissSheet({ translationY: -200, velocityY: 2000, sheetHeight })).toBe(false);
    expect(shouldDismissSheet({ translationY: 4, velocityY: 2000, sheetHeight })).toBe(false);
    expect(shouldDismissSheet({ translationY: Number.NaN, velocityY: 2000, sheetHeight })).toBe(
      false,
    );
  });
});

describe('sheetHeightFor', () => {
  it('takes a share of the window, held between a tenth and all of it', () => {
    expect(sheetHeightFor(800, 0.85)).toBeCloseTo(680);
    expect(sheetHeightFor(800, 0)).toBeCloseTo(80);
    expect(sheetHeightFor(800, 2)).toBe(800);
    expect(sheetHeightFor(800, Number.NaN)).toBe(800);
  });
});
