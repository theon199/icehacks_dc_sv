import { accountSheetHeight, shouldDismissSheet } from './sheetGeometry';

describe('accountSheetHeight', () => {
  const base = { areaHeight: 874, topInset: 62 };

  it('raises the email step to just under the status bar', () => {
    expect(accountSheetHeight({ ...base, expanded: true, compactHeight: null })).toBe(804);
  });

  it('waits for the compact step to be measured', () => {
    expect(accountSheetHeight({ ...base, expanded: false, compactHeight: null })).toBeNull();
    expect(accountSheetHeight({ ...base, expanded: false, compactHeight: 0 })).toBeNull();
  });

  it('hugs the compact step, never taller than the raised sheet', () => {
    expect(accountSheetHeight({ ...base, expanded: false, compactHeight: 380 })).toBe(405);
    expect(accountSheetHeight({ ...base, expanded: false, compactHeight: 2000 })).toBe(804);
  });
});

describe('shouldDismissSheet', () => {
  it('dismisses on a long drag or a flick', () => {
    expect(shouldDismissSheet(170, 0, 800)).toBe(true);
    expect(shouldDismissSheet(20, 1200, 800)).toBe(true);
  });

  it('springs back from a short, slow drag', () => {
    expect(shouldDismissSheet(60, 200, 800)).toBe(false);
  });

  it('scales the distance down for a short sheet', () => {
    expect(shouldDismissSheet(110, 0, 400)).toBe(true);
  });
});
