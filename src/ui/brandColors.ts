/**
 * Raw Famara brand palette. Feature code never uses these directly; it reads semantic colors from
 * `useTheme()`. This file has no imports so build-time config (app.config.ts, brand scripts) can
 * share it.
 */
export const brandColors = {
  /** Deep herb green: the primary brand color. */
  basil: '#2F6A4F',
  basilDeep: '#1E4A36',
  basilLight: '#8FD3AE',
  /** Warm golden accent used in the logo leaf and highlights. */
  saffron: '#E3A33B',
  saffronLight: '#F4C978',
  /** Warm red-orange accent for calls to attention. */
  paprika: '#B4492A',
  paprikaLight: '#F2926B',
  /** Warm off-white canvas. */
  oat: '#FAF6EF',
  cream: '#FFFDF9',
  /** Near-black warm canvas for dark mode. */
  night: '#151310',
  ink: '#1F1A14',
} as const;

export type BrandColor = keyof typeof brandColors;
