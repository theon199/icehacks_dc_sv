import * as Crypto from 'expo-crypto';

import { isUuid, newId } from './id';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '3b241101-e2bb-4255-8caf-4136c566a962'),
}));
describe('id', () => {
  it('creates ids with the platform UUID generator', () => {
    expect(newId()).toBe('3b241101-e2bb-4255-8caf-4136c566a962');
    expect(Crypto.randomUUID).toHaveBeenCalled();
  });

  it('validates UUIDs', () => {
    expect(isUuid('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
