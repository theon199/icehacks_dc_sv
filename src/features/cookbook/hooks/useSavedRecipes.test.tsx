import { renderHook } from '@testing-library/react-native';

import { useSettingsStore } from '@/stores';

import { useSafetyRules } from './useSavedRecipes';
import { resetCookbookStores } from '../__fixtures__/render';
import type * as Deps from '../deps';
import { toDomainPreferences } from '../deps';

jest.mock('../deps', () => {
  const actual = jest.requireActual<typeof Deps>('../deps');
  return { ...actual, toDomainPreferences: jest.fn(actual.toDomainPreferences) };
});

beforeEach(() => {
  resetCookbookStores();
  useSettingsStore.getState().reset();
});

describe('useSafetyRules', () => {
  it('reads preferences with the units the person chose in settings', async () => {
    useSettingsStore.getState().setUnits('metric');
    const { result } = await renderHook(() => useSafetyRules());
    expect(result.current.answered).toBe(true);
    expect(toDomainPreferences).toHaveBeenCalledWith(expect.anything(), 'metric');
  });
});
