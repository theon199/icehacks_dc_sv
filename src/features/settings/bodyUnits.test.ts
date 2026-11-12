import { heightToInput, parseHeight, parseWeight, weightToInput } from './bodyUnits';

describe('height', () => {
  it('round-trips centimetres through the metric field', () => {
    expect(heightToInput(172.4, 'metric')).toEqual({ primary: '172', secondary: '' });
    expect(parseHeight({ primary: '172', secondary: '' }, 'metric')).toEqual({
      ok: true,
      value: 172,
    });
  });

  it('shows US heights as feet and inches and converts back to centimetres', () => {
    expect(heightToInput(177.8, 'us')).toEqual({ primary: '5', secondary: '10' });
    expect(parseHeight({ primary: '5', secondary: '10' }, 'us')).toEqual({
      ok: true,
      value: 177.8,
    });
  });

  it('treats empty fields as not given', () => {
    expect(parseHeight({ primary: ' ', secondary: '' }, 'us')).toEqual({ ok: true, value: null });
    expect(heightToInput(null, 'metric')).toEqual({ primary: '', secondary: '' });
  });

  it('accepts feet without inches', () => {
    expect(parseHeight({ primary: '6', secondary: '' }, 'us')).toEqual({ ok: true, value: 182.9 });
  });

  it.each([
    [{ primary: 'tall', secondary: '' }, 'metric'],
    [{ primary: '5', secondary: '12' }, 'us'],
    [{ primary: '20', secondary: '' }, 'metric'],
    [{ primary: '9', secondary: '0' }, 'us'],
  ] as const)('rejects %p in %s units', (input, units) => {
    expect(parseHeight(input, units).ok).toBe(false);
  });
});

describe('weight', () => {
  it('converts pounds to kilograms and back', () => {
    const parsed = parseWeight('150', 'us');
    expect(parsed).toEqual({ ok: true, value: 68 });
    expect(weightToInput(68, 'us')).toBe('150');
  });

  it('keeps one decimal in metric and accepts a decimal comma', () => {
    expect(parseWeight('70,25', 'metric')).toEqual({ ok: true, value: 70.3 });
    expect(weightToInput(70.25, 'metric')).toBe('70.3');
  });

  it('treats an empty field as not given and rejects nonsense', () => {
    expect(parseWeight('', 'us')).toEqual({ ok: true, value: null });
    expect(parseWeight('-4', 'metric').ok).toBe(false);
    expect(parseWeight('5', 'metric').ok).toBe(false);
  });
});
