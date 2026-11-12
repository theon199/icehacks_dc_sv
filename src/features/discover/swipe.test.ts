import {
  MAX_ROTATION,
  stackLift,
  SWIPE_VELOCITY,
  swipeDirection,
  swipeDistance,
  tiltFor,
} from './swipe';

describe('swipe physics', () => {
  const distance = swipeDistance(350);

  it('needs nearly a third of the card width, but never less than 60 points', () => {
    expect(distance).toBeCloseTo(105);
    expect(swipeDistance(100)).toBe(60);
  });

  it('decides on distance in either direction', () => {
    expect(swipeDirection(distance, 0, distance)).toBe(1);
    expect(swipeDirection(-distance - 1, 0, distance)).toBe(-1);
    expect(swipeDirection(distance - 1, 0, distance)).toBe(0);
  });

  it('accepts a fast fling over a short drag, but not a flick in place', () => {
    expect(swipeDirection(distance * 0.3, SWIPE_VELOCITY, distance)).toBe(1);
    expect(swipeDirection(-distance * 0.3, -SWIPE_VELOCITY, distance)).toBe(-1);
    expect(swipeDirection(2, SWIPE_VELOCITY * 2, distance)).toBe(0);
    // A fling against the drag direction does not count.
    expect(swipeDirection(distance * 0.3, -SWIPE_VELOCITY, distance)).toBe(0);
  });

  it('tilts proportionally and caps the angle', () => {
    expect(tiltFor(0, 300)).toBe(0);
    expect(tiltFor(150, 300)).toBeCloseTo(MAX_ROTATION / 2);
    expect(tiltFor(-900, 300)).toBe(-MAX_ROTATION);
    expect(tiltFor(10, 0)).toBe(0);
  });

  it('raises lower cards as the top one is dragged away', () => {
    expect(stackLift(1, 0)).toBe(1);
    expect(stackLift(1, 0.5)).toBe(0.5);
    expect(stackLift(1, 1)).toBe(0);
    expect(stackLift(0, 0.7)).toBe(0);
  });
});
