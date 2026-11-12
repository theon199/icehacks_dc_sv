import { plannedPortionNote, plannedPortionParam, servesHalfPortions } from './plannedPortion';

describe('plannedPortionParam', () => {
  it('accepts a half or a standard portion', () => {
    expect(plannedPortionParam('0.5')).toBe(0.5);
    expect(plannedPortionParam('1')).toBe(1);
    expect(plannedPortionParam(['0.5', '1'])).toBe(0.5);
    expect(plannedPortionParam(' 1 ')).toBe(1);
  });

  it('ignores missing, malformed and unsupported sizes', () => {
    expect(plannedPortionParam(undefined)).toBeUndefined();
    expect(plannedPortionParam('')).toBeUndefined();
    expect(plannedPortionParam('half')).toBeUndefined();
    expect(plannedPortionParam('0.33')).toBeUndefined();
    expect(plannedPortionParam('2')).toBeUndefined();
    expect(plannedPortionParam('NaN')).toBeUndefined();
    expect(plannedPortionParam('-1')).toBeUndefined();
  });
});

describe('servesHalfPortions', () => {
  it('follows the planned portion over the small-appetite setting', () => {
    expect(servesHalfPortions(0.5, false)).toBe(true);
    expect(servesHalfPortions(1, true)).toBe(false);
  });

  it('follows the setting when nothing was planned', () => {
    expect(servesHalfPortions(undefined, true)).toBe(true);
    expect(servesHalfPortions(undefined, false)).toBe(false);
  });
});

describe('plannedPortionNote', () => {
  it('says when the plan sized the recipe', () => {
    expect(plannedPortionNote(0.5, false)).toBe('Half portion, as planned');
    expect(plannedPortionNote(0.5, true)).toBe('Half portion, as planned');
    expect(plannedPortionNote(1, true)).toBe('Full portion, as planned');
  });

  it('stays quiet when there is nothing unusual to point out', () => {
    expect(plannedPortionNote(1, false)).toBeNull();
    expect(plannedPortionNote(undefined, true)).toBeNull();
    expect(plannedPortionNote(undefined, false)).toBeNull();
  });
});
