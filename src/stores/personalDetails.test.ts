import { waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import Storage from 'expo-sqlite/kv-store';

import {
  emptyPersonalDetails,
  personalDetailsSync,
  selectHasPersonalDetails,
  updatePersonalDetails,
  usePersonalDetailsStore,
} from './personalDetails';

describe('personal details', () => {
  beforeEach(() => usePersonalDetailsStore.getState().reset());

  it('validates updates and keeps identity when unchanged', () => {
    expect(updatePersonalDetails(emptyPersonalDetails, { heightCm: null })).toBe(
      emptyPersonalDetails,
    );
    expect(updatePersonalDetails(emptyPersonalDetails, { heightCm: 20 })).toBe(
      emptyPersonalDetails,
    );
    expect(updatePersonalDetails(emptyPersonalDetails, { heightCm: 170 }).heightCm).toBe(170);
  });

  it('is stored in the Keychain, never in the plain key/value store', async () => {
    usePersonalDetailsStore.getState().update({ weightKg: 70, activity: 'moderate' });
    await waitFor(async () =>
      expect(await SecureStore.getItemAsync('famara.user.personal_details')).toContain(
        '"weightKg":70',
      ),
    );
    const plain = Storage.getItemSync('famara:user.personal_details');
    expect(plain).toBeNull();
    expect(selectHasPersonalDetails(usePersonalDetailsStore.getState())).toBe(true);
  });

  it('waits for the Keychain copy before syncing and applies remote values', async () => {
    await expect(personalDetailsSync.ready()).resolves.toBeUndefined();
    personalDetailsSync.applyRemote({
      upserts: [
        { docId: 'main', data: { heightCm: 180, weightKg: null, sex: 'female', activity: null } },
      ],
      deletes: [],
    });
    expect(usePersonalDetailsStore.getState().details).toMatchObject({
      heightCm: 180,
      sex: 'female',
    });
  });
});
