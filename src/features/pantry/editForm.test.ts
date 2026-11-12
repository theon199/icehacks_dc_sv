import { addPantryItem, updatePantryItem, type PantryItem } from '@/stores/pantry';

import { formFromItem, parsePantryForm, type PantryForm } from './editForm';
import { daysUntil, dueInDays, expiryHint, quantityLabel } from './shelves';

const at = '2026-11-11T10:00:00.000Z';
const rice: PantryItem = {
  id: 'r',
  ingredientId: 'rice',
  name: 'Rice',
  qty: 1.5,
  unit: 'kg',
  category: 'grain',
  addedAt: at,
  expiresAt: null,
};
const form = (patch: Partial<PantryForm> = {}): PantryForm => ({ ...formFromItem(rice), ...patch });

describe('pantry editing', () => {
  it('round-trips an item through the form', () => {
    expect(formFromItem(rice)).toEqual({
      name: 'Rice',
      qty: '1.5',
      unit: 'kg',
      category: 'grain',
      expiresAt: null,
    });
    const result = parsePantryForm(form());
    expect(result).toEqual({
      ok: true,
      patch: { name: 'Rice', qty: 1.5, unit: 'kg', category: 'grain', expiresAt: null },
    });
  });

  it('accepts fractions and mixed numbers, and keeps the lower end of a range', () => {
    const qty = (text: string) => {
      const result = parsePantryForm(form({ qty: text, unit: text ? 'kg' : '' }));
      return result.ok ? result.patch.qty : result.message;
    };
    expect([qty('1/2'), qty('1 1/2'), qty('½'), qty('2-3'), qty('')]).toEqual([
      0.5,
      1.5,
      0.5,
      2,
      null,
    ]);
  });

  it('rejects amounts that are not positive numbers', () => {
    for (const text of ['lots', '0', '-2', '1e9']) {
      expect(parsePantryForm(form({ qty: text }))).toMatchObject({ ok: false, field: 'qty' });
    }
  });

  it('rejects an amount too small to store', () => {
    expect(parsePantryForm(form({ qty: '0.0004' }))).toMatchObject({ ok: false, field: 'qty' });
    expect(parsePantryForm(form({ qty: '0.001' }))).toMatchObject({
      ok: true,
      patch: { qty: 0.001 },
    });
  });

  it('drops the catalog match when the item is renamed to something else', () => {
    const milk = { ...rice, ingredientId: 'milk', name: 'Milk' };
    const renamed = parsePantryForm({ ...formFromItem(milk), name: 'Oat milk' }, milk);
    expect(renamed).toMatchObject({ ok: true, patch: { ingredientId: null, name: 'Oat milk' } });
    // Only a real rename unlinks it; case and spacing changes keep the match.
    const tidied = parsePantryForm({ ...formFromItem(milk), name: ' milk ' }, milk);
    expect(tidied.ok && 'ingredientId' in tidied.patch).toBe(false);
  });

  it('needs a name, and an amount whenever a unit is given', () => {
    expect(parsePantryForm(form({ name: '   ' }))).toMatchObject({ ok: false, field: 'name' });
    expect(parsePantryForm(form({ qty: '', unit: 'cups' }))).toMatchObject({
      ok: false,
      field: 'qty',
    });
    expect(parsePantryForm(form({ qty: '', unit: '' }))).toMatchObject({
      ok: true,
      patch: { qty: null, unit: null },
    });
  });

  it('tidies whitespace in the name and unit', () => {
    expect(parsePantryForm(form({ name: '  brown   rice ', unit: ' fl  oz ' }))).toMatchObject({
      ok: true,
      patch: { name: 'brown rice', unit: 'fl oz' },
    });
  });

  it('applies a parsed patch to the stored item, moving it to another shelf', () => {
    const items = addPantryItem({}, rice, { id: 'r', at });
    const result = parsePantryForm(form({ qty: '500', unit: 'g', category: 'other' }));
    if (!result.ok) throw new Error(result.message);
    const next = updatePantryItem(items, 'r', result.patch);
    expect(next.r).toMatchObject({ qty: 500, unit: 'g', category: 'other', addedAt: at });
  });
});

describe('how pantry items read', () => {
  it('shows amounts in the person’s units', () => {
    expect(quantityLabel({ qty: 500, unit: 'g' }, 'metric')).toBe('500 g');
    expect(quantityLabel({ qty: 3, unit: null }, 'us')).toBe('3');
    expect(quantityLabel({ qty: 2, unit: 'tins' }, 'us')).toBe('2 cans');
    expect(quantityLabel({ qty: 2, unit: 'jars' }, 'us')).toBe('2 jars');
    expect(quantityLabel({ qty: null, unit: null }, 'us')).toBeNull();
  });

  it('flags items that are due soon or past their date', () => {
    const now = new Date(2026, 10, 11, 9, 0);
    const inDays = (days: number) => dueInDays(days, now);
    expect(daysUntil(inDays(2), now)).toBe(2);
    expect(expiryHint(inDays(-1), now)).toEqual({ tone: 'past', label: 'Past its use-by date' });
    expect(expiryHint(inDays(0), now)).toEqual({ tone: 'soon', label: 'Use today' });
    expect(expiryHint(inDays(1), now)).toEqual({ tone: 'soon', label: 'Use by tomorrow' });
    expect(expiryHint(inDays(3), now)).toEqual({ tone: 'soon', label: 'Use within 3 days' });
    expect(expiryHint(inDays(10), now)).toEqual({ tone: 'later', label: 'Good for 10 days' });
    expect(expiryHint(null, now)).toBeNull();
    expect(expiryHint('not a date', now)).toBeNull();
  });
});
