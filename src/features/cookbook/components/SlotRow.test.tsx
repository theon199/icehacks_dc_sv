import { servingsText } from './SlotRow';

describe('servingsText', () => {
  it('reads servings at a standard portion plainly', () => {
    expect(servingsText(1, 1)).toBe('1 serving');
    expect(servingsText(3, 1)).toBe('3 servings');
  });

  it('says when servings are half size', () => {
    expect(servingsText(2, 0.5)).toBe('2 half-size servings');
    expect(servingsText(1, 0.5)).toBe('1 half-size serving');
  });

  it('gives any other portion as a size', () => {
    expect(servingsText(2, 1.5)).toBe('2 servings at 1.5× size');
    expect(servingsText(1, 0.75)).toBe('1 serving at 0.75× size');
  });
});
