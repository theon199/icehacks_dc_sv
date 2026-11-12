import { contrastRatio, relativeLuminance, withAlpha } from './color';
import { palettes, space, type ColorScheme, type Palette } from './tokens';

/** Text/background pairs that must meet WCAG AA for normal text (4.5:1). */
const textPairs: [keyof Palette, keyof Palette][] = [
  ['text', 'background'],
  ['text', 'surface'],
  ['text', 'surfaceRaised'],
  ['text', 'surfaceSunken'],
  ['textMuted', 'background'],
  ['textMuted', 'surface'],
  ['textMuted', 'surfaceSunken'],
  ['textSubtle', 'background'],
  ['textSubtle', 'surface'],
  ['textSubtle', 'surfaceSunken'],
  ['primary', 'background'],
  ['primary', 'surface'],
  ['onPrimary', 'primary'],
  ['onPrimary', 'primaryPressed'],
  ['onPrimarySoft', 'primarySoft'],
  ['accent', 'surface'],
  ['onAccent', 'accent'],
  ['onAccentSoft', 'accentSoft'],
  ['success', 'surface'],
  ['onSuccessSoft', 'successSoft'],
  ['warning', 'surface'],
  ['onWarningSoft', 'warningSoft'],
  ['danger', 'surface'],
  ['danger', 'background'],
  ['onDanger', 'danger'],
  ['onDanger', 'dangerPressed'],
  ['onDangerSoft', 'dangerSoft'],
  ['textInverse', 'text'],
];

describe.each<ColorScheme>(['light', 'dark'])('%s palette', (scheme) => {
  const palette = palettes[scheme];

  it.each(textPairs)('%s on %s meets AA contrast', (fg, bg) => {
    expect(contrastRatio(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('gives control borders at least 3:1 against surfaces', () => {
    expect(contrastRatio(palette.borderStrong, palette.surface)).toBeGreaterThanOrEqual(3);
  });
});

describe('color helpers', () => {
  it('computes known contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777', '#777')).toBe(1);
    expect(relativeLuminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('appends alpha', () => {
    expect(withAlpha('#112233', 0.5)).toBe('#11223380');
    expect(withAlpha('#abc', 1)).toBe('#aabbccff');
  });

  it('rejects unsupported formats', () => {
    expect(() => relativeLuminance('#12345')).toThrow();
  });
});

describe('spacing', () => {
  it('sits on a 4-point grid (2 allowed for hairline gaps)', () => {
    for (const value of Object.values(space)) {
      expect(value === 2 || value % 4 === 0).toBe(true);
    }
  });
});
