import { checkInAllowance, distanceMeters, pointInPolygon, type Position } from './geo';

describe('distanceMeters', () => {
  it('is 0 for the same point', () => {
    expect(distanceMeters({ lat: 34.01, lng: -118.49 }, { lat: 34.01, lng: -118.49 })).toBe(0);
  });

  it('measures one degree of latitude as about 111.2 km', () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111_195, -1);
  });

  it('shrinks longitude with latitude', () => {
    const atEquator = distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const at60 = distanceMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    expect(at60 / atEquator).toBeCloseTo(0.5, 2);
  });

  it('matches a known city distance and is symmetric', () => {
    const santaMonica = { lat: 34.0195, lng: -118.4912 };
    const downtownLa = { lat: 34.0522, lng: -118.2437 };
    const d = distanceMeters(santaMonica, downtownLa);
    expect(d).toBeGreaterThan(22_700);
    expect(d).toBeLessThan(23_100);
    expect(distanceMeters(downtownLa, santaMonica)).toBeCloseTo(d, 6);
  });

  it('handles the antimeridian and antipodes', () => {
    expect(distanceMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 })).toBeCloseTo(222, 0);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
      Math.PI * 6_371_008.8,
      0,
    );
  });
});

describe('pointInPolygon', () => {
  const outer: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole: Position[] = [
    [4, 4],
    [6, 4],
    [6, 6],
    [4, 6],
    [4, 4],
  ];

  it('finds points inside and outside a closed ring', () => {
    expect(pointInPolygon([5, 5], [outer])).toBe(true);
    expect(pointInPolygon([11, 5], [outer])).toBe(false);
    expect(pointInPolygon([-0.01, 5], [outer])).toBe(false);
  });

  it('respects holes', () => {
    expect(pointInPolygon([5, 5], [outer, hole])).toBe(false);
    expect(pointInPolygon([2, 2], [outer, hole])).toBe(true);
    expect(pointInPolygon([5, 7], [outer, hole])).toBe(true);
  });

  it('accepts open rings', () => {
    expect(pointInPolygon([5, 5], [outer.slice(0, 4)])).toBe(true);
  });

  it('handles a concave ring', () => {
    // A "U": the notch between x 3..7 above y 3 is outside.
    const u: Position[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [7, 10],
      [7, 3],
      [3, 3],
      [3, 10],
      [0, 10],
    ];
    expect(pointInPolygon([5, 5], [u])).toBe(false);
    expect(pointInPolygon([1, 8], [u])).toBe(true);
    expect(pointInPolygon([8, 8], [u])).toBe(true);
    expect(pointInPolygon([5, 1], [u])).toBe(true);
  });

  it('works with real [lng, lat] coordinates', () => {
    const oceanPark: Position[] = [
      [-118.4823, 34.0003],
      [-118.4557, 34.0003],
      [-118.4557, 34.0151],
      [-118.4823, 34.0151],
      [-118.4823, 34.0003],
    ];
    expect(pointInPolygon([-118.47, 34.008], [oceanPark])).toBe(true);
    expect(pointInPolygon([-118.49, 34.008], [oceanPark])).toBe(false);
  });

  it('is false for no rings or degenerate rings', () => {
    expect(pointInPolygon([0, 0], [])).toBe(false);
    expect(
      pointInPolygon(
        [0, 0],
        [
          [
            [0, 0],
            [1, 1],
          ],
        ],
      ),
    ).toBe(false);
  });
});

describe('checkInAllowance', () => {
  it('allows 200 m plus the accuracy', () => {
    expect(checkInAllowance(250, 60)).toEqual({ allowed: true, allowedM: 260 });
    expect(checkInAllowance(260, 60)).toEqual({ allowed: true, allowedM: 260 });
    expect(checkInAllowance(260.5, 60)).toEqual({ allowed: false, allowedM: 260 });
  });

  it('caps the accuracy bonus at 100 m', () => {
    expect(checkInAllowance(340, 500)).toEqual({ allowed: false, allowedM: 300 });
    expect(checkInAllowance(300, 1000)).toEqual({ allowed: true, allowedM: 300 });
  });

  it('adds nothing for an unknown or negative accuracy', () => {
    expect(checkInAllowance(150, null)).toEqual({ allowed: true, allowedM: 200 });
    expect(checkInAllowance(201, null)).toEqual({ allowed: false, allowedM: 200 });
    expect(checkInAllowance(201, -20)).toEqual({ allowed: false, allowedM: 200 });
    expect(checkInAllowance(201, Number.NaN)).toEqual({ allowed: false, allowedM: 200 });
  });

  it('refuses an accuracy the server would reject, or an unknown distance', () => {
    expect(checkInAllowance(10, 1001)).toEqual({ allowed: false, allowedM: 300 });
    expect(checkInAllowance(Number.NaN, 10)).toEqual({ allowed: false, allowedM: 210 });
  });
});
